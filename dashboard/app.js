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
  agentAnim: new Map(),
  labels: new Map(),
  clickable: [],
  animatedDecor: [],
  selectedAgentId: "orchestrator",
  target: new THREE.Vector3(0, 1.4, 0),
  desiredTarget: new THREE.Vector3(0, 1.4, 0),
  desiredCamera: new THREE.Vector3(13.6, 10.8, 17.8),
  dragging: false,
  dragMoved: false,
  downX: 0,
  downY: 0,
  lastX: 0,
  lastY: 0,
  animationClock: new THREE.Clock(),
  tourActive: false,
  tourIndex: 0,
  tourNextAt: 0,
};

const stationPositions = [
  [0, 0, -5.8],
  [-6.9, 0, -2.7],
  [-2.55, 0, -1.35],
  [6.9, 0, -2.7],
  [-6.25, 0, 3.35],
  [0, 0, 4.35],
  [6.25, 0, 3.35],
];

const skinColors = [0xc98e68,0xb97855,0xd3a17f,0x9a644a,0xc68c69,0xaa7053,0xd0a080];
const shirtColors = [0x173c55,0x244d63,0x1c4257,0x294b5f,0x183d52,0x23475a,0x1b4054];
const trouserColors = [0x111923,0x151b24,0x101820,0x161d27,0x111a24,0x131c26,0x101720];

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

function addCylinder(parent, radii, height, position, mat, rotation=null, segments=18) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radii[0],radii[1],height,segments), mat);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function canvasTexture(lines, opts={}) {
  const canvas=document.createElement("canvas");
  canvas.width=512; canvas.height=256;
  const ctx=canvas.getContext("2d");
  const bg=opts.bg||"#061019";
  ctx.fillStyle=bg; ctx.fillRect(0,0,canvas.width,canvas.height);
  const grad=ctx.createLinearGradient(0,0,512,256);
  grad.addColorStop(0,"rgba(42,185,235,.14)");
  grad.addColorStop(1,"rgba(64,255,196,.04)");
  ctx.fillStyle=grad; ctx.fillRect(0,0,512,256);
  ctx.strokeStyle="rgba(95,205,255,.28)";
  ctx.lineWidth=2;
  for(let y=36;y<256;y+=36){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(512,y);ctx.stroke();}
  for(let x=48;x<512;x+=64){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,256);ctx.stroke();}
  ctx.textAlign="left";
  ctx.fillStyle=opts.accent||"#8ee3ff";
  ctx.font="700 28px Segoe UI, sans-serif";
  ctx.fillText(lines[0]||"",28,54);
  ctx.fillStyle="#d8f4ff";
  ctx.font="800 46px Segoe UI, sans-serif";
  ctx.fillText(lines[1]||"",28,116);
  ctx.fillStyle="#6f9db8";
  ctx.font="600 19px Segoe UI, sans-serif";
  ctx.fillText(lines[2]||"",28,162);
  ctx.fillStyle=opts.accent||"#6edaff";
  ctx.fillRect(28,196,210,6);
  ctx.fillStyle="rgba(255,255,255,.16)";
  ctx.fillRect(248,196,170,6);
  const tex=new THREE.CanvasTexture(canvas);
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.anisotropy=4;
  return tex;
}

function screenPlane(parent,size,position,texture,emissive=0x43c8ff) {
  const mat=new THREE.MeshStandardMaterial({
    map:texture,
    emissive,
    emissiveMap:texture,
    emissiveIntensity:.85,
    roughness:.3,
    metalness:.05,
  });
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(size[0],size[1]),mat);
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function buildArchitecture(scene) {
  const floorMat=material(0x06121b,.9,.08);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(25,19),floorMat);
  floor.rotation.x=-Math.PI/2;
  floor.receiveShadow=true;
  scene.add(floor);

  const grid=new THREE.GridHelper(25,25,0x28516b,0x0e2634);
  grid.position.y=.012;
  grid.material.transparent=true;
  grid.material.opacity=.5;
  scene.add(grid);

  const wallMat=material(0x091620,.72,.18);
  addBox(scene,[25,.3,7.4],[0,3.7,-9.3],wallMat);
  addBox(scene,[.3,7.4,19],[-12.5,3.7,0],wallMat);
  addBox(scene,[.3,7.4,19],[12.5,3.7,0],wallMat);

  const beamMat=material(0x102a3a,.32,.62,0x0b3043,.25);
  for(const x of [-10.6,-5.3,0,5.3,10.6]){
    addBox(scene,[.18,7.0,.22],[x,3.5,-9.05],beamMat);
  }
  for(const z of [-6.5,-2.1,2.3,6.7]){
    addBox(scene,[24,.10,.18],[0,6.95,z],beamMat);
  }

  const stripMat=material(0x4fcfff,.18,.35,0x4fcfff,2.2);
  addBox(scene,[18,.07,.08],[0,5.75,-9.02],stripMat);
  addBox(scene,[.07,4.9,.08],[-10.1,3.3,-9.01],stripMat);
  addBox(scene,[.07,4.9,.08],[10.1,3.3,-9.01],stripMat);

  const logoTex=canvasTexture(["AI AGENT ROOM","UST-LUGA HQ","VIRTUAL OPERATIONS"],{accent:"#7be0ff"});
  const logoFrame=addBox(scene,[8.3,.18,2.35],[0,3.75,-8.88],material(0x061019,.35,.48,0x0b3548,.55));
  logoFrame.userData.decor=true;
  const logo=screenPlane(scene,[7.75,1.75],[0,3.78,-8.77],logoTex);
  logo.rotation.y=Math.PI;
  logo.material.side=THREE.DoubleSide;

  const sideTexA=canvasTexture(["LIVE STATUS","07 AGENTS","OPERATIONS ONLINE"],{accent:"#5cffad"});
  const sideTexB=canvasTexture(["SYNC CORE","PLANNING","EXTERNAL WRITE LOCKED"],{accent:"#64d4ff"});
  const leftPanel=screenPlane(scene,[3.15,1.65],[-9.8,3.55,-8.82],sideTexA);
  const rightPanel=screenPlane(scene,[3.15,1.65],[9.8,3.55,-8.82],sideTexB);
  leftPanel.rotation.y=Math.PI; rightPanel.rotation.y=Math.PI;
  leftPanel.material.side=rightPanel.material.side=THREE.DoubleSide;

  for(const x of [-8,-4,0,4,8]){
    const lamp=addBox(scene,[1.3,.08,.45],[x,6.75,-1.0],material(0xb8eaff,.2,.3,0xb8eaff,1.4));
    lamp.userData.decor=true;
    const light=new THREE.PointLight(0x9edfff,.65,7,2);
    light.position.set(x,6.4,-1);
    scene.add(light);
  }

  const tableMat=material(0x112b3c,.34,.58,0x081f2b,.28);
  const table=new THREE.Mesh(new THREE.CylinderGeometry(2.25,2.55,.6,56),tableMat);
  table.position.set(0,.34,1.0);
  table.castShadow=true; table.receiveShadow=true; scene.add(table);

  const innerRing=new THREE.Mesh(new THREE.TorusGeometry(1.72,.065,16,56),material(0x55d4ff,.2,.45,0x55d4ff,2.0));
  innerRing.rotation.x=Math.PI/2; innerRing.position.set(0,.67,1); scene.add(innerRing);

  const holoBase=new THREE.Mesh(
    new THREE.CylinderGeometry(1.2,1.2,.035,40),
    new THREE.MeshBasicMaterial({color:0x63d9ff,transparent:true,opacity:.16,side:THREE.DoubleSide})
  );
  holoBase.position.set(0,1.18,1); scene.add(holoBase);

  for(let i=0;i<3;i++){
    const ring=new THREE.Mesh(
      new THREE.TorusGeometry(.58+i*.22,.015,8,48),
      new THREE.MeshBasicMaterial({color:i===1?0x5cffad:0x5fcfff,transparent:true,opacity:.48})
    );
    ring.rotation.x=Math.PI/2;
    ring.position.set(0,1.35+i*.26,1);
    ring.userData.holoRing=true;
    ring.userData.phase=i*.9;
    scene.add(ring);
    room.animatedDecor.push(ring);
  }

  const holoGroup=new THREE.Group();
  holoGroup.position.set(0,2.1,1);
  scene.add(holoGroup);
  const holoTex=canvasTexture(["COMMAND","TEAM 07","QUEUE 00"],{bg:"#061019",accent:"#61e4ff"});
  for(let i=0;i<3;i++){
    const panel=screenPlane(holoGroup,[1.6,.78],[0,0,0],holoTex,0x49d5ff);
    panel.material.transparent=true;
    panel.material.opacity=.68;
    panel.rotation.y=i*(Math.PI*2/3);
    panel.position.set(Math.sin(panel.rotation.y)*1.05,0,Math.cos(panel.rotation.y)*1.05);
    panel.lookAt(0,0,0);
    panel.userData.holoPanel=true;
    panel.userData.phase=i*2;
    room.animatedDecor.push(panel);
  }

  const plantMat=material(0x143b31,.8,.02);
  for(const [x,z] of [[-10.7,6.8],[10.7,6.8]]){
    addCylinder(scene,[.48,.62],.8,[x,.4,z],material(0x1b2730,.7,.2),null,20);
    for(let i=0;i<8;i++){
      const leaf=new THREE.Mesh(new THREE.ConeGeometry(.24,1.35,10),plantMat);
      leaf.position.set(x+Math.sin(i*.78)*.34,1.15,z+Math.cos(i*.78)*.34);
      leaf.rotation.z=(i%2?1:-1)*.35;
      leaf.rotation.y=i*.78;
      leaf.castShadow=true;
      scene.add(leaf);
    }
  }
}

function buildChair(group) {
  const chair=new THREE.Group();
  const mat=material(0x0c1c28,.42,.48);
  addBox(chair,[.92,.16,.86],[0,.63,1.08],mat);
  addBox(chair,[.88,1.0,.16],[0,1.16,1.48],mat);
  addCylinder(chair,[.06,.06],.7,[0,.28,1.08],material(0x172732,.32,.6));
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.48,.48,.05,20),material(0x111b22,.42,.62));
  base.position.set(0,.04,1.08); base.castShadow=true; chair.add(base);
  group.add(chair);
}

function jointedLimb(parent, upperLen, lowerLen, thickness, colorMat, skinMat, side, working) {
  const shoulder=new THREE.Group();
  shoulder.position.set(.43*side,1.54,.04);
  parent.add(shoulder);

  const upper=new THREE.Mesh(new THREE.CylinderGeometry(thickness*.9,thickness,upperLen,14),colorMat);
  upper.position.y=-upperLen/2;
  upper.castShadow=true;
  shoulder.add(upper);
  shoulder.rotation.z=side*.46;
  shoulder.rotation.x=working?-.88:-.62;

  const elbow=new THREE.Group();
  elbow.position.set(0,-upperLen,0);
  shoulder.add(elbow);
  const fore=new THREE.Mesh(new THREE.CylinderGeometry(thickness*.7,thickness*.8,lowerLen,14),skinMat);
  fore.position.y=-lowerLen/2;
  fore.castShadow=true;
  elbow.add(fore);
  elbow.rotation.x=working?-1.04:-.82;
  elbow.rotation.z=-side*.18;

  const hand=new THREE.Mesh(new THREE.SphereGeometry(thickness*.82,14,10),skinMat);
  hand.scale.set(1,.72,.8);
  hand.position.set(0,-lowerLen-.05,0);
  hand.castShadow=true;
  elbow.add(hand);

  return {shoulder,elbow,hand};
}

function buildPerson(agent,index) {
  const root=new THREE.Group();
  root.position.set(0,0,1.02);
  const skin=material(skinColors[index%skinColors.length],.72,.02);
  const shirt=material(shirtColors[index%shirtColors.length],.48,.15);
  const trousers=material(trouserColors[index%trouserColors.length],.62,.08);
  const shoe=material(0x090d11,.45,.5);
  const working=["working","waiting","verifying"].includes(agent.status);

  const pelvis=addBox(root,[.68,.34,.42],[0,.94,.08],trousers);
  pelvis.rotation.x=-.08;

  const torso=new THREE.Mesh(new THREE.CylinderGeometry(.34,.44,.88,18),shirt);
  torso.position.set(0,1.42,.02);
  torso.scale.z=.78;
  torso.castShadow=true;
  root.add(torso);

  addCylinder(root,[.10,.12],.16,[0,1.88,-.01],skin);

  const headGroup=new THREE.Group();
  headGroup.position.set(0,2.10,-.02);
  root.add(headGroup);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.29,22,16),skin);
  head.scale.set(.92,1.05,.94);
  head.castShadow=true;
  headGroup.add(head);

  const hairMat=material(index%3===0?0x15171a:index%3===1?0x241c18:0x101820,.82,.02);
  const hair=new THREE.Mesh(new THREE.SphereGeometry(.297,20,14,0,Math.PI*2,0,Math.PI*.57),hairMat);
  hair.position.y=.055; hair.scale.set(.96,.92,.98); hair.castShadow=true; headGroup.add(hair);

  for(const side of [-1,1]){
    const eye=new THREE.Mesh(new THREE.SphereGeometry(.025,10,8),material(0x101820,.45,.05));
    eye.position.set(.095*side,.035,-.262); headGroup.add(eye);
  }

  const nose=new THREE.Mesh(new THREE.ConeGeometry(.025,.07,8),skin);
  nose.rotation.x=-Math.PI/2; nose.position.set(0,-.015,-.292); headGroup.add(nose);

  const leftArm=jointedLimb(root,.48,.44,.125,shirt,skin,-1,working);
  const rightArm=jointedLimb(root,.48,.44,.125,shirt,skin,1,working);

  const legData=[];
  for(const side of [-1,1]){
    const hip=new THREE.Group();
    hip.position.set(.22*side,.87,.08); root.add(hip);
    const thigh=new THREE.Mesh(new THREE.CylinderGeometry(.15,.17,.56,14),trousers);
    thigh.position.y=-.27; thigh.rotation.x=Math.PI/2.6; thigh.castShadow=true; hip.add(thigh);
    const knee=new THREE.Group(); knee.position.set(0,-.38,-.32); hip.add(knee);
    const shin=new THREE.Mesh(new THREE.CylinderGeometry(.12,.14,.52,14),trousers);
    shin.position.y=-.25; shin.rotation.x=-.05; shin.castShadow=true; knee.add(shin);
    const foot=new THREE.Mesh(new THREE.BoxGeometry(.26,.14,.52),shoe);
    foot.position.set(0,-.52,-.15); foot.castShadow=true; knee.add(foot);
    legData.push({hip,knee});
  }

  const badge=new THREE.Mesh(
    new THREE.PlaneGeometry(.18,.23),
    new THREE.MeshBasicMaterial({color:statusColor(agent.status),transparent:true,opacity:.8})
  );
  badge.position.set(.18,1.55,-.34);
  badge.rotation.y=Math.PI;
  root.add(badge);

  root.userData.anim={
    headGroup,torso,leftArm,rightArm,legData,badge,
    phase:index*.83,
    working,
    offline:agent.status==="offline",
  };
  return root;
}

function buildDeskStation(agent,index) {
  const group=new THREE.Group();
  const [x,y,z]=stationPositions[index]||[0,0,index*2];
  group.position.set(x,y,z);
  group.userData.agentId=agent.id;

  const deskMat=material(0x163142,.34,.55);
  const metal=material(0x0c151c,.38,.72);
  addBox(group,[3.15,.18,1.42],[0,1.03,0],deskMat);
  addBox(group,[.15,.96,.15],[-1.23,.5,-.42],metal);
  addBox(group,[.15,.96,.15],[1.23,.5,-.42],metal);
  addBox(group,[.15,.96,.15],[-1.23,.5,.42],metal);
  addBox(group,[.15,.96,.15],[1.23,.5,.42],metal);

  const c=statusColor(agent.status);
  const monitorMat=material(0x0c151c,.3,.68);
  const statusText=agent.status==="offline"?"LINK DOWN":(["working","waiting","verifying"].includes(agent.status)?"TASK ACTIVE":"READY");
  const monitorTex=canvasTexture([agent.name.toUpperCase(),statusText,agent.role.toUpperCase()],{accent:agent.status==="offline"?"#ff6c75":"#72dcff"});
  addBox(group,[1.62,.94,.12],[0,1.83,-.18],monitorMat);
  const screen=screenPlane(group,[1.40,.72],[0,1.83,-.247],monitorTex,c);
  screen.rotation.y=Math.PI;
  screen.material.side=THREE.DoubleSide;
  screen.userData.pulse=agent.status!=="offline";
  addBox(group,[.10,.52,.10],[0,1.34,-.16],monitorMat);
  addBox(group,[.72,.06,.32],[0,1.08,.10],material(0x081018,.58,.38));
  addBox(group,[.18,.05,.26],[.58,1.08,.12],material(0x0e1820,.55,.42));

  const deskStrip=addBox(group,[2.7,.025,.035],[0,.96,-.68],material(c,.2,.45,c,agent.status==="offline"?.4:1.6));
  deskStrip.userData.pulse=agent.status!=="offline";

  buildChair(group);
  const person=buildPerson(agent,index);
  group.add(person);
  room.agentAnim.set(agent.id,person.userData.anim);

  const ring=new THREE.Mesh(
    new THREE.RingGeometry(1.82,2.04,56),
    new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.24,side:THREE.DoubleSide})
  );
  ring.rotation.x=-Math.PI/2; ring.position.y=.025; ring.userData.statusRing=true; group.add(ring);

  const glow=new THREE.PointLight(c,agent.status==="offline"?.3:.85,4.6,2);
  glow.position.set(0,2.25,-.45); group.add(glow);

  const hitbox=new THREE.Mesh(
    new THREE.BoxGeometry(4.0,3.4,3.25),
    new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false})
  );
  hitbox.position.set(0,1.6,.2); hitbox.userData.agentId=agent.id; group.add(hitbox); room.clickable.push(hitbox);

  room.scene.add(group);
  room.stationGroups.set(agent.id,group);

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
  scene.add(new THREE.HemisphereLight(0x9ad9ff,0x061019,.95));

  const key=new THREE.DirectionalLight(0xc8edff,1.75);
  key.position.set(7,12,8);
  key.castShadow=true;
  key.shadow.mapSize.set(2048,2048);
  key.shadow.camera.near=.5; key.shadow.camera.far=38;
  key.shadow.camera.left=-15; key.shadow.camera.right=15;
  key.shadow.camera.top=15; key.shadow.camera.bottom=-15;
  scene.add(key);

  const fill=new THREE.PointLight(0x2f9dd6,1.25,22,2); fill.position.set(-8,5,-3); scene.add(fill);
  const rim=new THREE.PointLight(0x42d6ff,1.15,18,2); rim.position.set(8,3,5); scene.add(rim);
  const green=new THREE.PointLight(0x4ce5a1,.55,12,2); green.position.set(0,2.4,5); scene.add(green);
}

function clearStations() {
  for(const group of room.stationGroups.values()) room.scene.remove(group);
  room.stationGroups.clear();
  room.agentAnim.clear();
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
  if(!room.renderer||!room.camera)return;
  const rect=room.renderer.domElement.getBoundingClientRect();
  for(const agent of room.agents){
    const group=room.stationGroups.get(agent.id);
    const tag=room.labels.get(agent.id);
    if(!group||!tag)continue;
    const p=new THREE.Vector3(0,3.15,.15);
    group.localToWorld(p);
    p.project(room.camera);
    const visible=p.z>-1&&p.z<1&&p.x>-1.15&&p.x<1.15&&p.y>-1.15&&p.y<1.15;
    tag.style.left=((p.x*.5+.5)*rect.width)+"px";
    tag.style.top=((-p.y*.5+.5)*rect.height)+"px";
    tag.style.opacity=visible?"1":"0";
    tag.classList.toggle("selected",agent.id===room.selectedAgentId);
  }
}

function updateInspector(agent) {
  if(!agent)return;
  el("selectedName").textContent=agent.name;
  el("selectedRole").textContent=agent.role;
  el("selectedAvatar").textContent=initials(agent.name);
  el("selectedTask").textContent=agent.current_task||"Нет активной задачи";
  el("selectedToday").textContent=agent.today;
  el("selectedGoal").textContent=agent.goal;
  el("selectedState").textContent=agent.status==="offline"?"LINK DOWN":(["working","waiting","verifying"].includes(agent.status)?"RUNNING":"READY");
  const status=el("selectedStatus");
  status.className="status-pill "+agent.status;
  status.textContent=statusLabel[agent.status]||agent.status.toUpperCase();
}

function focusAgent(agentId) {
  const group=room.stationGroups.get(agentId);
  if(!group)return;
  const pos=new THREE.Vector3();
  group.getWorldPosition(pos);
  room.desiredTarget.copy(pos).add(new THREE.Vector3(0,1.45,0));
  room.desiredCamera.copy(pos).add(new THREE.Vector3(5.2,4.35,5.9));
}

function selectAgent(agentId,focus=true) {
  room.selectedAgentId=agentId;
  const agent=room.agents.find(a=>a.id===agentId)||room.agents[0];
  updateInspector(agent);
  for(const [id,tag] of room.labels)tag.classList.toggle("selected",id===agentId);
  if(focus)focusAgent(agentId);
}

function resetCamera() {
  room.tourActive=false;
  el("tourView")?.classList.remove("active");
  room.desiredTarget.set(0,1.4,0);
  room.desiredCamera.set(13.6,10.8,17.8);
}

function toggleTour() {
  room.tourActive=!room.tourActive;
  el("tourView").classList.toggle("active",room.tourActive);
  if(room.tourActive){
    room.tourIndex=0;
    room.tourNextAt=0;
  } else {
    resetCamera();
  }
}

function updateTour(t) {
  if(!room.tourActive||room.agents.length===0)return;
  if(t<room.tourNextAt)return;
  const agent=room.agents[room.tourIndex%room.agents.length];
  if(agent){
    room.selectedAgentId=agent.id;
    selectAgent(agent.id,true);
  }
  room.tourIndex=(room.tourIndex+1)%room.agents.length;
  room.tourNextAt=t+4.8;
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
  if(hits.length){
    const id=hits[0].object.userData.agentId;
    if(id){
      room.tourActive=false;
      el("tourView")?.classList.remove("active");
      selectAgent(id,true);
    }
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
    if(!room.dragging)return;
    const dx=e.clientX-room.lastX,dy=e.clientY-room.lastY;
    if(Math.abs(e.clientX-room.downX)+Math.abs(e.clientY-room.downY)>5)room.dragMoved=true;
    room.lastX=e.clientX; room.lastY=e.clientY;
    if(room.dragMoved){
      room.tourActive=false; el("tourView")?.classList.remove("active");
      const offset=room.camera.position.clone().sub(room.target);
      const radius=Math.max(6.5,offset.length());
      const spherical=new THREE.Spherical().setFromVector3(offset);
      spherical.theta-=dx*.0044;
      spherical.phi=Math.min(Math.PI*.48,Math.max(.28,spherical.phi+dy*.0033));
      room.desiredCamera.copy(room.target).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(radius,spherical.phi,spherical.theta)));
    }
  });
  canvas.addEventListener("pointerup",e=>{
    const moved=room.dragMoved; room.dragging=false;
    if(!moved)pickAgent(e);
  });
  canvas.addEventListener("wheel",e=>{
    e.preventDefault();
    room.tourActive=false; el("tourView")?.classList.remove("active");
    const dir=room.desiredCamera.clone().sub(room.desiredTarget);
    const next=Math.min(31,Math.max(6.5,dir.length()*(1+Math.sign(e.deltaY)*.075)));
    dir.setLength(next); room.desiredCamera.copy(room.desiredTarget).add(dir);
  },{passive:false});
}

function resizeRenderer() {
  const wrap=el("threeWrap");
  if(!wrap||!room.renderer||!room.camera)return;
  const w=Math.max(1,wrap.clientWidth),h=Math.max(1,wrap.clientHeight);
  const pr=Math.min(window.devicePixelRatio||1,1.65);
  room.renderer.setPixelRatio(pr);
  room.renderer.setSize(w,h,false);
  room.camera.aspect=w/h;
  room.camera.updateProjectionMatrix();
}

function animateAgent(agent,t) {
  const anim=room.agentAnim.get(agent.id);
  if(!anim)return;
  const phase=t+anim.phase;
  const selected=agent.id===room.selectedAgentId;
  const work=anim.working||selected;
  const breath=Math.sin(phase*1.35)*.015;

  anim.torso.scale.y=1+breath;
  anim.headGroup.rotation.y=Math.sin(phase*.72)*.055+(selected?Math.sin(phase*.35)*.035:0);
  anim.headGroup.rotation.x=anim.offline?.13:Math.sin(phase*.83)*.018;

  if(anim.offline){
    anim.leftArm.shoulder.rotation.x=-.38;
    anim.rightArm.shoulder.rotation.x=-.38;
    anim.leftArm.elbow.rotation.x=-.55;
    anim.rightArm.elbow.rotation.x=-.55;
    anim.badge.material.opacity=.38;
    return;
  }

  const speed=work?7.2:2.1;
  const amp=work?.12:.025;
  anim.leftArm.elbow.rotation.x=-.9+Math.sin(phase*speed)*amp;
  anim.rightArm.elbow.rotation.x=-.9+Math.sin(phase*speed+Math.PI)*amp;
  anim.leftArm.shoulder.rotation.x=-.78+Math.sin(phase*speed*.5)*amp*.32;
  anim.rightArm.shoulder.rotation.x=-.78+Math.sin(phase*speed*.5+1.2)*amp*.32;
  anim.badge.material.opacity=.64+Math.sin(phase*2.4)*.18;
}

function animateDecor(t) {
  for(const obj of room.animatedDecor){
    if(obj.userData.holoRing){
      obj.rotation.z=t*.34+obj.userData.phase;
      obj.material.opacity=.34+Math.sin(t*1.8+obj.userData.phase)*.14;
    }
    if(obj.userData.holoPanel){
      const parent=obj.parent;
      parent.rotation.y=t*.16;
      obj.position.y=Math.sin(t*1.2+obj.userData.phase)*.08;
    }
  }
}

function animate() {
  requestAnimationFrame(animate);
  const t=room.animationClock.getElapsedTime();
  updateTour(t);

  room.camera.position.lerp(room.desiredCamera,.045);
  room.target.lerp(room.desiredTarget,.06);
  room.camera.lookAt(room.target);

  for(const agent of room.agents){
    const group=room.stationGroups.get(agent.id);
    if(!group)continue;
    animateAgent(agent,t);
    group.traverse(obj=>{
      if(obj.userData?.pulse&&obj.material?.emissiveIntensity!==undefined){
        obj.material.emissiveIntensity=.85+Math.sin(t*2.4+agent.id.length)*.35;
      }
      if(obj.userData?.statusRing){
        const selected=agent.id===room.selectedAgentId;
        obj.material.opacity=(selected?.36:.18)+(selected?Math.sin(t*3)*.10:0);
      }
    });
  }

  animateDecor(t);
  updateLabels();
  room.renderer.render(room.scene,room.camera);
  if(document.documentElement.dataset.webglReady!=="true"){
    document.documentElement.dataset.webglReady="true";
    el("webglFallback").hidden=true;
    el("renderStatus").textContent=(room.renderer.capabilities.isWebGL2?"WEBGL2":"WEBGL1")+" · 3D ACTIVE";
  }
}

function init3D() {
  const canvas=el("roomCanvas");
  const fallback=el("webglFallback");
  try{
    const context=
      canvas.getContext("webgl2",{antialias:true,alpha:false,powerPreference:"high-performance"})||
      canvas.getContext("webgl",{antialias:true,alpha:false,powerPreference:"high-performance"})||
      canvas.getContext("experimental-webgl",{antialias:true,alpha:false});
    if(!context)throw new Error("Браузер не выдал WebGL-контекст");

    room.renderer=new THREE.WebGLRenderer({canvas,context,antialias:true,powerPreference:"high-performance"});
    room.renderer.shadowMap.enabled=true;
    room.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    room.renderer.outputColorSpace=THREE.SRGBColorSpace;
    room.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    room.renderer.toneMappingExposure=1.0;

    room.scene=new THREE.Scene();
    room.scene.background=new THREE.Color(0x02070b);
    room.scene.fog=new THREE.FogExp2(0x02070b,.015);

    room.camera=new THREE.PerspectiveCamera(41,1,.1,85);
    room.camera.position.copy(room.desiredCamera);
    room.camera.lookAt(room.target);

    buildArchitecture(room.scene);
    setupLighting(room.scene);
    resizeRenderer();
    setupInteractions();
    window.addEventListener("resize",resizeRenderer);
    el("resetView").addEventListener("click",resetCamera);
    el("tourView").addEventListener("click",toggleTour);
    el("renderStatus").textContent=room.renderer.capabilities.isWebGL2?"WEBGL2":"WEBGL1";
    document.documentElement.dataset.webglReady="starting";
    animate();
  }catch(error){
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
  if(!message)return;
  button.disabled=true; result.hidden=true;
  try{
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
  }catch(error){
    result.textContent="Ошибка: "+error.message;
    result.hidden=false;
  }finally{
    button.disabled=false;
  }
}

el("sendTask").addEventListener("click",submitTask);
el("taskInput").addEventListener("keydown",event=>{
  if((event.ctrlKey||event.metaKey)&&event.key==="Enter")submitTask();
});

try{
  init3D();
  refresh().catch(error=>{
    el("healthBadge").textContent="SYSTEM ERROR";
    el("modeText").textContent="Не удалось загрузить данные: "+error.message;
  });
}catch(error){
  el("healthBadge").textContent="SYSTEM ERROR";
  el("modeText").textContent="3D-движок не запустился: "+error.message;
}
