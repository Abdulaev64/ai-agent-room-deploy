from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Query
from fastapi.responses import FileResponse
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


@app.get("/", include_in_schema=False)
def dashboard() -> FileResponse:
    return FileResponse(DASHBOARD_DIR / "index.html")


@app.get("/api/health")
def health() -> dict[str, object]:
    return {"status": "ok", "version": __version__, "mode": "planning-only", "agent_count": len(get_agents()), "external_mutations_enabled": False}


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
