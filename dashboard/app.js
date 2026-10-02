const el = (id) => document.getElementById(id);

const statusLabel = {
  idle: "IDLE",
  working: "ACTIVE",
  waiting: "WAITING",
  verifying: "VERIFYING",
  error: "ERROR",
  offline: "OFFLINE",
};

async function getJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error("HTTP " + response.status);
  return response.json();
}

function initials(name) {
  return name.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase();
}

function renderAgents(agents) {
  const grid = el("agentGrid");
  const template = el("agentCardTemplate");
  grid.replaceChildren();

  agents.forEach((agent) => {
    const node = template.content.cloneNode(true);
    node.querySelector(".avatar").textContent = initials(agent.name);
    node.querySelector(".agent-name").textContent = agent.name;
    node.querySelector(".agent-role").textContent = agent.role;
    node.querySelector(".current-task").textContent = agent.current_task || "Нет активной задачи";
    node.querySelector(".today").textContent = agent.today;
    node.querySelector(".goal").textContent = agent.goal;

    const status = node.querySelector(".status-pill");
    status.textContent = statusLabel[agent.status] || agent.status.toUpperCase();
    status.classList.add(agent.status);
    grid.appendChild(node);
  });

  el("agentCount").textContent = agents.length + " agents";
}

function renderActivity(events) {
  const feed = el("activityFeed");
  feed.replaceChildren();

  events.forEach((event) => {
    const item = document.createElement("div");
    item.className = "feed-item";
    const title = document.createElement("strong");
    title.textContent = event.source;
    const body = document.createElement("p");
    body.textContent = event.message;
    const time = document.createElement("time");
    time.textContent = new Date(event.timestamp).toLocaleString("ru-RU");
    item.append(title, body, time);
    feed.appendChild(item);
  });
}

async function refresh() {
  const [health, agents, activity] = await Promise.all([
    getJson("/api/health"),
    getJson("/api/agents"),
    getJson("/api/activity"),
  ]);

  const badge = el("healthBadge");
  badge.textContent = health.status === "ok" ? "SYSTEM OK" : "SYSTEM ERROR";
  badge.classList.toggle("ok", health.status === "ok");
  el("modeText").textContent = health.mode === "planning-only"
    ? "Безопасный режим: планирование включено, внешние изменения выключены."
    : "Режим: " + health.mode;

  renderAgents(agents);
  renderActivity(activity);
}

async function submitTask() {
  const input = el("taskInput");
  const button = el("sendTask");
  const result = el("planResult");
  const message = input.value.trim();
  if (!message) return;

  button.disabled = true;
  result.hidden = true;

  try {
    const plan = await getJson("/api/tasks", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({message}),
    });

    result.textContent = "Главный исполнитель: " + plan.primary_agent_id + ". Участники: " + plan.assigned_agent_ids.join(", ") + ". " + plan.reason;
    result.hidden = false;
    input.value = "";
    await refresh();
  } catch (error) {
    result.textContent = "Ошибка: " + error.message;
    result.hidden = false;
  } finally {
    button.disabled = false;
  }
}

el("sendTask").addEventListener("click", submitTask);
el("taskInput").addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") submitTask();
});

refresh().catch((error) => {
  el("healthBadge").textContent = "SYSTEM ERROR";
  el("modeText").textContent = "Не удалось загрузить данные: " + error.message;
});
