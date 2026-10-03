const el = (id) => document.getElementById(id);

const statusLabel = {
  idle: "IDLE",
  working: "ACTIVE",
  waiting: "WAITING",
  verifying: "VERIFYING",
  error: "ERROR",
  offline: "OFFLINE",
};

let currentAgents = [];
let selectedAgentId = "orchestrator";

async function getJson(path, options = {}) {
  const target = new URL(path, window.location.origin);
  const response = await fetch(target.toString(), options);
  if (!response.ok) throw new Error("HTTP " + response.status);
  return response.json();
}

function initials(name) {
  return name.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase();
}

function selectAgent(agentId) {
  selectedAgentId = agentId;
  document.querySelectorAll(".station").forEach((node) => {
    node.classList.toggle("selected", node.dataset.agentId === agentId);
  });

  const agent = currentAgents.find((item) => item.id === agentId) || currentAgents[0];
  if (!agent) return;

  el("selectedName").textContent = agent.name;
  el("selectedRole").textContent = agent.role;
  el("selectedAvatar").textContent = initials(agent.name);
  el("selectedTask").textContent = agent.current_task || "Нет активной задачи";
  el("selectedToday").textContent = agent.today;
  el("selectedGoal").textContent = agent.goal;
  el("selectedState").textContent = agent.status === "offline" ? "LINK DOWN" : "READY";

  const status = el("selectedStatus");
  status.className = "status-pill " + agent.status;
  status.textContent = statusLabel[agent.status] || agent.status.toUpperCase();
}

function renderAgents(agents) {
  currentAgents = agents;
  const layer = el("stationsLayer");
  const template = el("stationTemplate");
  layer.replaceChildren();

  agents.forEach((agent, index) => {
    const fragment = template.content.cloneNode(true);
    const station = fragment.querySelector(".station");
    station.classList.add("pos-" + index, agent.status);
    station.dataset.agentId = agent.id;
    station.setAttribute("aria-label", agent.name + " — " + agent.role);
    station.querySelector(".station-title").textContent = agent.name;
    station.querySelector(".station-role").textContent = agent.role;
    station.querySelector(".station-status").textContent = statusLabel[agent.status] || agent.status.toUpperCase();
    station.addEventListener("click", () => selectAgent(agent.id));
    layer.appendChild(fragment);
  });

  const active = agents.filter((agent) => ["working", "verifying", "waiting"].includes(agent.status)).length;
  el("agentCount").textContent = agents.length;
  el("activeCount").textContent = active;

  if (!agents.some((agent) => agent.id === selectedAgentId)) {
    selectedAgentId = agents[0]?.id;
  }
  selectAgent(selectedAgentId);
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
  const [health, agents, activity, tasks] = await Promise.all([
    getJson("/api/health"),
    getJson("/api/agents"),
    getJson("/api/activity"),
    getJson("/api/tasks"),
  ]);

  const badge = el("healthBadge");
  const systemOk = health.status === "ok";
  badge.textContent = systemOk ? "SYSTEM OK" : "SYSTEM ERROR";
  badge.classList.toggle("ok", systemOk);
  el("wallSystem").textContent = systemOk ? "ONLINE" : "ERROR";
  el("taskCount").textContent = tasks.length;

  el("modeText").textContent = health.mode === "planning-only"
    ? "Planning-only · внешние изменения заблокированы"
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

    result.textContent =
      "Главный исполнитель: " + plan.primary_agent_id +
      ". Участники: " + plan.assigned_agent_ids.join(", ") +
      ". " + plan.reason;
    result.hidden = false;
    input.value = "";
    selectedAgentId = plan.primary_agent_id;
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
  el("wallSystem").textContent = "ERROR";
  el("modeText").textContent = "Не удалось загрузить данные: " + error.message;
});
