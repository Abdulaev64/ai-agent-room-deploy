from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field


class AgentStatus(str, Enum):
    IDLE = "idle"
    WORKING = "working"
    WAITING = "waiting"
    VERIFYING = "verifying"
    ERROR = "error"
    OFFLINE = "offline"


class TaskStatus(str, Enum):
    NEW = "new"
    PLANNED = "planned"
    RUNNING = "running"
    WAITING = "waiting"
    VERIFYING = "verifying"
    DONE = "done"
    FAILED = "failed"


class Agent(BaseModel):
    id: str
    name: str
    role: str
    status: AgentStatus = AgentStatus.IDLE
    capabilities: list[str] = Field(default_factory=list)
    current_task: str | None = None


class AgentView(Agent):
    today: int = 0
    goal: int = 0


class TaskRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


class TaskPlan(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    message: str
    status: TaskStatus = TaskStatus.PLANNED
    primary_agent_id: str
    assigned_agent_ids: list[str]
    reason: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ActivityEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    type: Literal[
        "system.ready",
        "task.created",
        "task.planned",
        "agent.status",
        "integration.status",
    ]
    source: str
    message: str
    agent_id: str | None = None
    task_id: str | None = None
