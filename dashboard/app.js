import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.162.0/build/three.module.js";

const el = (id) => document.getElementById(id);
const statusLabel = {
  idle: "IDLE",
  working: "ACTIVE",
  waiting: "WAITING",
  verifying: "VERIFYING",
  error: "ERROR",
  offline: "OFFLINE",
};

const room = {
  renderer: null,
  scene: null,
  camera: null,
  raycaster: new THREE.Raycaster(),
  pointer: new THREE.Vector2(),
  agents: [],
  stationGroups: new Map(),
  labels: new Map(),
  clickable: [],
  selectedAgentId: "orchestrator",
  target: new THREE.Vector3(0, 1.2, 0),
  desiredTarget: new THREE.Vector3(0, 1.2, 0),
  desiredCamera: new THREE.Vector3(12.5, 11.5, 16.5),
  orbitYaw: 0,
  orbitPitch: 0.55,
  orbitRadius: 22,
  dragging: false,
  dragMoved: false,
  downX: 0,
  downY: 0,
  lastX: 0,
  lastY: 0,
  animationClock: new THREE.Clock(),
};

const stationPositions = [
  [0, 0, -5.8],
  [-6.8, 0, -2.5],
  [-2.5, 0, -1.4],
  [6.8, 0, -2.5],
  [-6.4, 0, 3.2],
  [0, 0, 4.2],
  [6.4, 0, 3.2],
];

const skinColors = [0xc98e68,0xb97855,0xd3a17f,0x9a644a,0xc68c69,0xaa7053,0xd0a080];
const shirtColors = [0x173c55,0x244d63,0x1c4257,0x294b5f,0x183d52,0x23475a,0x1b4054];

async function getJson(path, options = {}) {
  const target = new URL(path, window.location.origin);
  const response = await fetch(target.toString(), options);
  if (!response.ok) throw new Error("HTTP " + response.status);
  return response.json();
}

function initials(name) {
  return name.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase();
}

function statusColor(status) {
  if (status === "offline" || status === "error") return 0xff4d5d;
  if (["working","waiting","verifying"].includes(status)) return 0x4bd4ff;
  return 0x55e49b;
}

function material(color, roughness=.55, metalness=.15, emissive=0x000000, emissiveIntensity=0) {
  return new THREE.MeshStandardMaterial({color, roughness, metalness, emissive, emissiveIntensity});
}

function addBox(parent, size, position, mat, rotation=null) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function buildRoom(scene) {
  const floorMat = material(0x07131d, .92, .05);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 18), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(24, 24, 0x214763, 0x102534);
  grid.position.y = 0.012;
  grid.material.transparent = true;
  grid.material.opacity = .48;
  scene.add(grid);

  const wallMat = material(0x0a1620, .78, .08);
  addBox(scene,[24,.25,7.2],[0,3.6,-9],wallMat);
  addBox(scene,[.25,7.2,18],[-12,3.6,0],wallMat);
  addBox(scene,[.25,7.2,18],[12,3.6,0],wallMat);

  const accentMat = material(0x103042,.35,.35,0x2aaee8,.8);
  addBox(scene,[15.5,.08,.08],[0,5.55,-8.83],accentMat);
  addBox(scene,[.08,4.6,.08],[-9.4,3.2,-8.82],accentMat);
  addBox(scene,[.08,4.6,.08],[9.4,3.2,-8.82],accentMat);

  const logoPanel = addBox(scene,[7.4,.18,1.55],[0,3.8,-8.78],material(0x06121a,.35,.35,0x164c68,.55));
  logoPanel.userData.decor = true;

  for (let x=-9; x<=9; x+=3) {
    addBox(scene,[.03,2.2,.03],[x,1.3,-8.78],material(0x17384b,.45,.4,0x1d6688,.15));
  }

  const tableMat = material(0x132b3b,.38,.55,0x09202c,.2);
  const table = new THREE.Mesh(new THREE.CylinderGeometry(2.2,2.45,.55,48),tableMat);
  table.position.set(0,.33,1.05);
  table.castShadow = true;
  table.receiveShadow = true;
  scene.add(table);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.65,.055,12,48),
    material(0x4acbff,.28,.45,0x4acbff,1.7)
  );
  ring.rotation.x = Math.PI/2;
  ring.position.set(0,.64,1.05);
  scene.add(ring);

  const holo = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15,1.15,.03,32),
    new THREE.MeshBasicMaterial({color:0x64d7ff,transparent:true,opacity:.18,side:THREE.DoubleSide})
  );
  holo.position.set(0,1.3,1.05);
  scene.add(holo);

  const pillars = [
    [-10.6,-7.7],[10.6,-7.7],[-10.6,7.5],[10.6,7.5]
  ];
  for (const [x,z] of pillars) {
    const p=addBox(scene,[.45,4.2,.45],[x,2.1,z],material(0x101f2b,.48,.55));
    const light=addBox(scene,[.5,.04,.5],[x,4.15,z],material(0x4ed0ff,.2,.4,0x4ed0ff,1.8));
    p.userData.decor=true; light.userData.decor=true;
  }
}

function buildDeskStation(agent, index) {
  const group = new THREE.Group();
  const [x,y,z] = stationPositions[index] || [0,0,index*2];
  group.position.set(x,y,z);
  group.userData.agentId = agent.id;

  const deskTopMat = material(0x183243,.38,.48);
  const deskLegMat = material(0x0a141c,.5,.5);
  addBox(group,[3.05,.22,1.35],[0,1.03,0],deskTopMat);
  addBox(group,[.18,1.0,.18],[-1.15,.5,-.4],deskLegMat);
  addBox(group,[.18,1.0,.18],[1.15,.5,-.4],deskLegMat);
  addBox(group,[.18,1.0,.18],[-1.15,.5,.4],deskLegMat);
  addBox(group,[.18,1.0,.18],[1.15,.5,.4],deskLegMat);

  const monitorMat = material(0x101922,.32,.62);
  const monitor = addBox(group,[1.45,.84,.11],[0,1.78,-.14],monitorMat);
  const c = statusColor(agent.status);
  const screenMat = material(c,.25,.2,c,agent.status==="offline"?.28:1.45);
  const screen = addBox(group,[1.22,.62,.035],[0,1.78,-.205],screenMat);
  screen.userData.pulse = agent.status !== "offline";
  addBox(group,[.10,.52,.10],[0,1.32,-.12],monitorMat);
  addBox(group,[.75,.06,.34],[0,1.08,.16],material(0x071019,.7,.2));

  const chair = new THREE.Group();
  addBox(chair,[.9,.18,.9],[0,.66,1.1],material(0x0e1d28,.45,.45));
  addBox(chair,[.9,1.0,.18],[0,1.15,1.48],material(0x102432,.45,.45));
  chair.rotation.y = Math.PI;
  group.add(chair);

  const person = new THREE.Group();
  person.position.set(0,0,1.0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.28,20,16),material(skinColors[index%skinColors.length],.7,.02));
  head.position.set(0,2.0,0);
  head.castShadow = true;
  person.add(head);

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(.292,18,12,0,Math.PI*2,0,Math.PI*.55),
    material(index%2?0x17191c:0x101821,.8,.05)
  );
  hair.position.set(0,2.07,-.01);
  hair.castShadow=true;
  person.add(hair);

  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(.34,.44,.9,18),
    material(shirtColors[index%shirtColors.length],.55,.15)
  );
  torso.position.set(0,1.35,0);
  torso.castShadow=true;
  person.add(torso);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.11,.12,.18,12),material(skinColors[index%skinColors.length],.7,.02));
  neck.position.set(0,1.68,0); person.add(neck);

  const armMat = material(shirtColors[index%shirtColors.length],.55,.15);
  for (const side of [-1,1]) {
    const upper=new THREE.Mesh(new THREE.CylinderGeometry(.11,.13,.58,12),armMat);
    upper.position.set(.42*side,1.42,-.12);
    upper.rotation.z = side*.42;
    upper.rotation.x = -.55;
    upper.castShadow=true;
    person.add(upper);
    const fore=new THREE.Mesh(new THREE.CylinderGeometry(.09,.10,.5,12),material(skinColors[index%skinColors.length],.7,.02));
    fore.position.set(.56*side,1.15,-.36);
    fore.rotation.z = side*.15;
    fore.rotation.x = -1.15;
    fore.castShadow=true;
    person.add(fore);
  }
  group.add(person);

  const ringMat = new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.28,side:THREE.DoubleSide});
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.8,2.02,48),ringMat);
  ring.rotation.x=-Math.PI/2;
  ring.position.y=.025;
  ring.userData.statusRing=true;
  group.add(ring);

  const glow = new THREE.PointLight(c, agent.status==="offline"?.45:1.05, 4.4, 2);
  glow.position.set(0,2.15,-.35);
  group.add(glow);

  const hitbox = new THREE.Mesh(
    new THREE.BoxGeometry(3.9,3.2,3.1),
    new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false})
  );
  hitbox.position.set(0,1.55,.25);
  hitbox.userData.agentId=agent.id;
  group.add(hitbox);
  room.clickable.push(hitbox);

  group.traverse(obj => { if (obj.isMesh && !obj.userData.agentId) obj.userData.agentId = agent.id; });
  room.scene.add(group);
  room.stationGroups.set(agent.id, group);

  const tag=document.createElement("div");
  tag.className="agent-tag "+agent.status;
  tag.dataset.agentId=agent.id;
  tag.innerHTML="<strong></strong><small></small><em></em>";
  tag.querySelector("strong").textContent=agent.name;
  tag.querySelector("small").textContent=agent.role;
  tag.querySelector("em").textContent=statusLabel[agent.status]||agent.status.toUpperCase();
  el("labelLayer").appendChild(tag);
  room.labels.set(agent.id,tag);
}

function setupLighting(scene) {
  scene.add(new THREE.HemisphereLight(0x8bc9ed,0x071019,1.15));
  const key=new THREE.DirectionalLight(0xbfe8ff,2.15);
  key.position.set(7,12,8);
  key.castShadow=true;
  key.shadow.mapSize.set(2048,2048);
  key.shadow.camera.near=.5;
  key.shadow.camera.far=35;
  key.shadow.camera.left=-15; key.shadow.camera.right=15;
  key.shadow.camera.top=15; key.shadow.camera.bottom=-15;
  scene.add(key);

  const fill=new THREE.PointLight(0x2f9dd6,1.8,22,2);
  fill.position.set(-8,5,-3); scene.add(fill);
  const rim=new THREE.PointLight(0x42d6ff,1.5,18,2);
  rim.position.set(8,3,5); scene.add(rim);
}

function clearStations() {
  for (const group of room.stationGroups.values()) {
    room.scene.remove(group);
  }
  room.stationGroups.clear();
  room.clickable=[];
  room.labels.clear();
  el("labelLayer").replaceChildren();
}

function buildStations(agents) {
  clearStations();
  agents.forEach((agent,index)=>buildDeskStation(agent,index));
  selectAgent(room.selectedAgentId,false);
}

function updateLabels() {
  if (!room.renderer || !room.camera) return;
  const rect=room.renderer.domElement.getBoundingClientRect();
  for (const agent of room.agents) {
    const group=room.stationGroups.get(agent.id);
    const tag=room.labels.get(agent.id);
    if (!group || !tag) continue;
    const p=new THREE.Vector3(0,3.05,.15);
    group.localToWorld(p);
    p.project(room.camera);
    const visible=p.z>-1 && p.z<1;
    const x=(p.x*.5+.5)*rect.width;
    const y=(-p.y*.5+.5)*rect.height;
    tag.style.left=x+"px";
    tag.style.top=y+"px";
    tag.style.opacity=visible?"1":"0";
    tag.classList.toggle("selected",agent.id===room.selectedAgentId);
  }
}

function updateInspector(agent) {
  if (!agent) return;
  el("selectedName").textContent=agent.name;
  el("selectedRole").textContent=agent.role;
  el("selectedAvatar").textContent=initials(agent.name);
  el("selectedTask").textContent=agent.current_task||"Нет активной задачи";
  el("selectedToday").textContent=agent.today;
  el("selectedGoal").textContent=agent.goal;
  el("selectedState").textContent=agent.status==="offline"?"LINK DOWN":"READY";
  const status=el("selectedStatus");
  status.className="status-pill "+agent.status;
  status.textContent=statusLabel[agent.status]||agent.status.toUpperCase();
}

function focusAgent(agentId) {
  const group=room.stationGroups.get(agentId);
  if (!group) return;
  const pos=new THREE.Vector3();
  group.getWorldPosition(pos);
  room.desiredTarget.copy(pos).add(new THREE.Vector3(0,1.3,0));
  room.desiredCamera.copy(pos).add(new THREE.Vector3(5.7,5.1,6.7));
}

function selectAgent(agentId,focus=true) {
  room.selectedAgentId=agentId;
  const agent=room.agents.find(a=>a.id===agentId)||room.agents[0];
  updateInspector(agent);
  for(const [id,tag] of room.labels) tag.classList.toggle("selected",id===agentId);
  if(focus) focusAgent(agentId);
}

function resetCamera() {
  room.desiredTarget.set(0,1.2,0);
  room.desiredCamera.set(12.5,11.5,16.5);
}

function pointerToNdc(event) {
  const rect=room.renderer.domElement.getBoundingClientRect();
  room.pointer.x=((event.clientX-rect.left)/rect.width)*2-1;
  room.pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;
}

function pickAgent(event) {
  pointerToNdc(event);
  room.raycaster.setFromCamera(room.pointer,room.camera);
  const hits=room.raycaster.intersectObjects(room.clickable,false);
  if(hits.length) {
    const id=hits[0].object.userData.agentId;
    if(id) selectAgent(id,true);
  }
}

function setupInteractions() {
  const canvas=room.renderer.domElement;
  canvas.addEventListener("pointerdown",e=>{
    room.dragging=true; room.dragMoved=false;
    room.downX=room.lastX=e.clientX; room.downY=room.lastY=e.clientY;
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener("pointermove",e=>{
    if(!room.dragging) return;
    const dx=e.clientX-room.lastX, dy=e.clientY-room.lastY;
    if(Math.abs(e.clientX-room.downX)+Math.abs(e.clientY-room.downY)>5) room.dragMoved=true;
    room.lastX=e.clientX; room.lastY=e.clientY;
    if(room.dragMoved){
      const offset=room.camera.position.clone().sub(room.target);
      const radius=Math.max(7,offset.length());
      const spherical=new THREE.Spherical().setFromVector3(offset);
      spherical.theta-=dx*.0045;
      spherical.phi=Math.min(Math.PI*.47,Math.max(.32,spherical.phi+dy*.0035));
      room.desiredCamera.copy(room.target).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(radius,spherical.phi,spherical.theta)));
    }
  });
  canvas.addEventListener("pointerup",e=>{
    const moved=room.dragMoved;
    room.dragging=false;
    if(!moved) pickAgent(e);
  });
  canvas.addEventListener("wheel",e=>{
    e.preventDefault();
    const dir=room.desiredCamera.clone().sub(room.desiredTarget);
    const next=Math.min(30,Math.max(7,dir.length()*(1+Math.sign(e.deltaY)*.08)));
    dir.setLength(next);
    room.desiredCamera.copy(room.desiredTarget).add(dir);
  },{passive:false});
}

function resizeRenderer() {
  const wrap=el("threeWrap");
  if(!wrap||!room.renderer||!room.camera) return;
  const w=Math.max(1,wrap.clientWidth),h=Math.max(1,wrap.clientHeight);
  const pr=Math.min(window.devicePixelRatio||1,1.75);
  room.renderer.setPixelRatio(pr);
  room.renderer.setSize(w,h,false);
  room.camera.aspect=w/h;
  room.camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  const t=room.animationClock.getElapsedTime();

  room.camera.position.lerp(room.desiredCamera,.055);
  room.target.lerp(room.desiredTarget,.07);
  room.camera.lookAt(room.target);

  for(const agent of room.agents){
    const group=room.stationGroups.get(agent.id);
    if(!group) continue;
    group.traverse(obj=>{
      if(obj.userData?.pulse && obj.material?.emissiveIntensity!==undefined){
        obj.material.emissiveIntensity=1.05+Math.sin(t*2.5+(agent.id.length))*0.45;
      }
      if(obj.userData?.statusRing && agent.id===room.selectedAgentId){
        obj.material.opacity=.34+Math.sin(t*3)*.12;
      }
    });
  }

  updateLabels();
  room.renderer.render(room.scene,room.camera);
  if (document.documentElement.dataset.webglReady !== "true") {
    document.documentElement.dataset.webglReady="true";
    el("webglFallback").hidden=true;
    el("renderStatus").textContent=(room.renderer.capabilities.isWebGL2?"WEBGL2":"WEBGL1")+" · 3D ACTIVE";
  }
}

function init3D() {
  const canvas=el("roomCanvas");
  const fallback=el("webglFallback");
  try {
    const context =
      canvas.getContext("webgl2", {antialias:true, alpha:false, powerPreference:"high-performance"}) ||
      canvas.getContext("webgl", {antialias:true, alpha:false, powerPreference:"high-performance"}) ||
      canvas.getContext("experimental-webgl", {antialias:true, alpha:false});
    if (!context) throw new Error("Браузер не выдал WebGL-контекст");
    room.renderer=new THREE.WebGLRenderer({canvas,context,antialias:true,powerPreference:"high-performance"});
    room.renderer.shadowMap.enabled=true;
    room.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    room.renderer.outputColorSpace=THREE.SRGBColorSpace;
    room.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    room.renderer.toneMappingExposure=1.05;

    room.scene=new THREE.Scene();
    room.scene.background=new THREE.Color(0x02070b);
    room.scene.fog=new THREE.FogExp2(0x02070b,.018);

    room.camera=new THREE.PerspectiveCamera(43,1,.1,80);
    room.camera.position.copy(room.desiredCamera);
    room.camera.lookAt(room.target);

    buildRoom(room.scene);
    setupLighting(room.scene);
    resizeRenderer();
    setupInteractions();
    window.addEventListener("resize",resizeRenderer);
    el("resetView").addEventListener("click",resetCamera);
    el("renderStatus").textContent=room.renderer.capabilities.isWebGL2?"WEBGL2":"WEBGL1";
    document.documentElement.dataset.webglReady="starting";
    animate();
  } catch(error) {
    fallback.hidden=false;
    el("fallbackText").textContent="WebGL недоступен: "+error.message;
    el("renderStatus").textContent="ERROR";
    throw error;
  }
}

function renderActivity(events) {
  const feed=el("activityFeed");
  feed.replaceChildren();
  events.forEach(event=>{
    const item=document.createElement("div");
    item.className="feed-item";
    const title=document.createElement("strong");
    title.textContent=event.source;
    const body=document.createElement("p");
    body.textContent=event.message;
    const time=document.createElement("time");
    time.textContent=new Date(event.timestamp).toLocaleString("ru-RU");
    item.append(title,body,time);
    feed.appendChild(item);
  });
}

async function refresh() {
  const [health,agents,activity,tasks]=await Promise.all([
    getJson("/api/health"),
    getJson("/api/agents"),
    getJson("/api/activity"),
    getJson("/api/tasks"),
  ]);
  room.agents=agents;

  const badge=el("healthBadge");
  const systemOk=health.status==="ok";
  badge.textContent=systemOk?"SYSTEM OK":"SYSTEM ERROR";
  badge.classList.toggle("ok",systemOk);
  el("taskCount").textContent=tasks.length;
  el("agentCount").textContent=agents.length;
  el("activeCount").textContent=agents.filter(a=>["working","waiting","verifying"].includes(a.status)).length;
  el("modeText").textContent=health.mode==="planning-only"
    ?"Planning-only · внешние изменения заблокированы"
    :"Режим: "+health.mode;

  buildStations(agents);
  renderActivity(activity);
}

async function submitTask() {
  const input=el("taskInput"),button=el("sendTask"),result=el("planResult");
  const message=input.value.trim();
  if(!message) return;
  button.disabled=true; result.hidden=true;
  try {
    const plan=await getJson("/api/tasks",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({message}),
    });
    result.textContent="Главный исполнитель: "+plan.primary_agent_id+". Участники: "+plan.assigned_agent_ids.join(", ")+". "+plan.reason;
    result.hidden=false;
    input.value="";
    room.selectedAgentId=plan.primary_agent_id;
    await refresh();
    selectAgent(plan.primary_agent_id,true);
  } catch(error) {
    result.textContent="Ошибка: "+error.message;
    result.hidden=false;
  } finally {
    button.disabled=false;
  }
}

el("sendTask").addEventListener("click",submitTask);
el("taskInput").addEventListener("keydown",event=>{
  if((event.ctrlKey||event.metaKey)&&event.key==="Enter") submitTask();
});

try {
  init3D();
  refresh().catch(error=>{
    el("healthBadge").textContent="SYSTEM ERROR";
    el("modeText").textContent="Не удалось загрузить данные: "+error.message;
  });
} catch(error) {
  el("healthBadge").textContent="SYSTEM ERROR";
  el("modeText").textContent="3D-движок не запустился: "+error.message;
}
