from __future__ import annotations

from dataclasses import dataclass

from .models import TaskPlan


@dataclass(frozen=True)
class RouteRule:
    agent_id: str
    keywords: tuple[str, ...]
    description: str


RULES: tuple[RouteRule, ...] = (
    RouteRule("excel", ("excel", "эксель", "реестр", "xlsm", "ячейк", "лист", "рабочие", "итр", "синхронизац", "windows agent", "com"), "Задача относится к Excel/реестру или Windows-агенту."),
    RouteRule("training", ("обучен", "заявк", "отобщ", "отопр", "отбм", "сиз", "пп", "высот", "программ"), "Задача относится к обучениям, программам или заявкам."),
    RouteRule("protocol", ("протокол", "pdf", "раздел", "переимен", "фамили", "распозна"), "Задача относится к обработке или проверке протоколов."),
    RouteRule("portal", ("портал", "сотрудник", "карточк", "интерфейс", "страниц", "кнопк", "мобильн", "фото", "статус", "frontend", "backend"), "Задача относится к порталу или его интерфейсу."),
    RouteRule("qa", ("тест", "ci", "провер", "регресс", "quality", "pytest"), "Задача напрямую относится к проверкам и качеству."),
    RouteRule("operations", ("github", "render", "deploy", "деплой", "лог", "сервер", "health", "репозитор", "ветк", "pull request", "pr"), "Задача относится к эксплуатации, GitHub или развёртыванию."),
)

CHANGE_KEYWORDS = ("исправ", "сдел", "добав", "удал", "измен", "обнов", "внедр", "почин", "fix", "add", "delete", "change", "update", "deploy")


def _score(message: str, rule: RouteRule) -> int:
    normalized = message.casefold()
    return sum(1 for keyword in rule.keywords if keyword in normalized)


def plan_task(message: str) -> TaskPlan:
    normalized = message.strip()
    if not normalized:
        raise ValueError("Task message must not be empty")

    scored = [(rule, _score(normalized, rule)) for rule in RULES]
    best_rule, best_score = max(scored, key=lambda item: item[1])

    if best_score == 0:
        return TaskPlan(
            message=normalized,
            primary_agent_id="orchestrator",
            assigned_agent_ids=["orchestrator"],
            reason="Специализация не определена: задачу оставляем у Orchestrator для декомпозиции.",
        )

    assigned = [best_rule.agent_id]
    if best_rule.agent_id != "qa" and any(word in normalized.casefold() for word in CHANGE_KEYWORDS):
        assigned.append("qa")

    return TaskPlan(
        message=normalized,
        primary_agent_id=best_rule.agent_id,
        assigned_agent_ids=assigned,
        reason=best_rule.description,
    )
