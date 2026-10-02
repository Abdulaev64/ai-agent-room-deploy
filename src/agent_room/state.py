from __future__ import annotations

from collections import deque
from threading import Lock

from .models import ActivityEvent, TaskPlan


class RoomState:
    def __init__(self, max_events: int = 100) -> None:
        self._tasks: dict[str, TaskPlan] = {}
        self._events: deque[ActivityEvent] = deque(maxlen=max_events)
        self._lock = Lock()
        self.add_event(ActivityEvent(type="system.ready", source="agent-room", message="Agent Room запущен в безопасном planning-only режиме."))

    def add_event(self, event: ActivityEvent) -> None:
        with self._lock:
            self._events.appendleft(event)

    def add_task(self, task: TaskPlan) -> TaskPlan:
        with self._lock:
            self._tasks[task.id] = task
            self._events.appendleft(ActivityEvent(type="task.created", source="orchestrator", task_id=task.id, agent_id=task.primary_agent_id, message="Создан план задачи для " + task.primary_agent_id + "."))
        return task

    def events(self, limit: int = 30) -> list[ActivityEvent]:
        with self._lock:
            return list(self._events)[:limit]

    def tasks(self) -> list[TaskPlan]:
        with self._lock:
            return list(self._tasks.values())


room_state = RoomState()
