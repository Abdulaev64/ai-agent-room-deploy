from __future__ import annotations

from .models import Agent, AgentStatus


AGENTS: tuple[Agent, ...] = (
    Agent(id="orchestrator", name="Orchestrator", role="Главный диспетчер", capabilities=["routing", "planning", "delegation", "summary"]),
    Agent(id="portal", name="Portal Agent", role="Портал", capabilities=["portal_backend", "portal_ui", "employee_cards", "performance"]),
    Agent(id="excel", name="Excel Agent", role="Excel и реестр", status=AgentStatus.OFFLINE, capabilities=["excel_registry", "bidirectional_sync", "windows_agent"]),
    Agent(id="training", name="Training Agent", role="Обучения и заявки", capabilities=["trainings", "applications", "training_statuses"]),
    Agent(id="protocol", name="Protocol Agent", role="Протоколы", capabilities=["protocol_split", "protocol_classification", "file_naming", "validation"]),
    Agent(id="qa", name="QA Agent", role="Контроль качества", capabilities=["tests", "ci", "regression", "verification"]),
    Agent(id="operations", name="Operations Agent", role="Эксплуатация", capabilities=["github", "render", "deploy", "logs", "health"]),
)


def get_agents() -> list[Agent]:
    return [agent.model_copy(deep=True) for agent in AGENTS]


def get_agent(agent_id: str) -> Agent:
    for agent in AGENTS:
        if agent.id == agent_id:
            return agent.model_copy(deep=True)
    raise KeyError(agent_id)
