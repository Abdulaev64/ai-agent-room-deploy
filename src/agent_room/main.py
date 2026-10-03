from __future__ import annotations

import base64
import binascii
import os
import secrets
from pathlib import Path

from fastapi import FastAPI, Query, Request
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from . import __version__
from .models import ActivityEvent, AgentView, TaskPlan, TaskRequest
from .orchestrator import plan_task
from .registry import get_agents
from .state import room_state


BASE_DIR = Path(__file__).resolve().parents[2]
DASHBOARD_DIR = BASE_DIR / "dashboard"

app = FastAPI(title="AI Agent Room", version=__version__, description="Isolated control plane for the AI Agent Room project.")
app.mount("/assets", StaticFiles(directory=DASHBOARD_DIR), name="assets")


def _basic_auth_ok(request: Request) -> bool:
    expected_user = os.environ.get("AGENT_ROOM_USERNAME")
    expected_password = os.environ.get("AGENT_ROOM_PASSWORD")
    if not expected_user or not expected_password:
        return True

    header = request.headers.get("authorization", "")
    if not header.startswith("Basic "):
        return False

    try:
        decoded = base64.b64decode(header[6:], validate=True).decode("utf-8")
        supplied_user, supplied_password = decoded.split(":", 1)
    except (binascii.Error, UnicodeDecodeError, ValueError):
        return False

    return secrets.compare_digest(supplied_user, expected_user) and secrets.compare_digest(
        supplied_password, expected_password
    )


@app.middleware("http")
async def dashboard_security_and_cache(request: Request, call_next):
    if request.url.path != "/api/health" and not _basic_auth_ok(request):
        return Response(
            status_code=401,
            headers={"WWW-Authenticate": 'Basic realm="AI Agent Room"'},
        )

    response = await call_next(request)

    if request.url.path == "/" or request.url.path.startswith("/assets/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"

    return response


@app.get("/", include_in_schema=False)
def dashboard() -> FileResponse:
    return FileResponse(DASHBOARD_DIR / "index.html")


@app.get("/api/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "version": __version__,
        "mode": "planning-only",
        "agent_count": len(get_agents()),
        "external_mutations_enabled": False,
        "auth_configured": bool(
            os.environ.get("AGENT_ROOM_USERNAME") and os.environ.get("AGENT_ROOM_PASSWORD")
        ),
    }


@app.get("/api/agents", response_model=list[AgentView])
def agents() -> list[AgentView]:
    return [AgentView(**agent.model_dump(), today=0, goal=0) for agent in get_agents()]


@app.get("/api/activity", response_model=list[ActivityEvent])
def activity(limit: int = Query(default=30, ge=1, le=100)) -> list[ActivityEvent]:
    return room_state.events(limit=limit)


@app.get("/api/tasks", response_model=list[TaskPlan])
def tasks() -> list[TaskPlan]:
    return room_state.tasks()


@app.post("/api/tasks", response_model=TaskPlan, status_code=201)
def create_task(request: TaskRequest) -> TaskPlan:
    plan = plan_task(request.message)
    return room_state.add_task(plan)
