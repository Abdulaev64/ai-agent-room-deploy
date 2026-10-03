import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.162.0/build/three.module.js";

const el=id=>document.getElementById(id);
const statusLabel={idle:"IDLE",working:"ACTIVE",waiting:"WAITING",verifying:"VERIFYING",error:"ERROR",offline:"OFFLINE"};
const palette=["#46d7ff","#57e59d","#ffbf3f","#58a9ff","#73e6ff","#9ccf45","#ffa24d"];
const paletteHex=[0x46d7ff,0x57e59d,0xffbf3f,0x58a9ff,0x73e6ff,0x9ccf45,0xffa24d];

const room={
  renderer:null,scene:null,camera:null,raycaster:new THREE.Raycaster(),pointer:new THREE.Vector2(),
  agents:[],stationGroups:new Map(),agentAnim:new Map(),labels:new Map(),clickable:[],decor:[],
  selectedAgentId:"orchestrator",
  target:new THREE.Vector3(0,1.4,0),desiredTarget:new THREE.Vector3(0,1.4,0),
  desiredCamera:new THREE.Vector3(12.2,12.8,21.5),
  dragging:false,dragMoved:false,downX:0,downY:0,lastX:0,lastY:0,
  clock:new THREE.Clock(),tourActive:false,tourIndex:0,tourNextAt:0
};

const stationLayout=[
  // Orchestrator — отдельное место руководителя по центру.
  {p:[0,0,-5.15],r:0},
  // Первый рабочий ряд.
  {p:[-5.3,0,-1.9],r:0},
  {p:[0,0,-1.9],r:0},
  {p:[5.3,0,-1.9],r:0},
  // Второй рабочий ряд.
  {p:[-5.3,0,2.15],r:0},
  {p:[0,0,2.15],r:0},
  {p:[5.3,0,2.15],r:0},
];

const skin=[0xc8916c,0xb97655,0xd6a280,0x9b674e,0xc98e68,0xab7458,0xd0a081];
const shirt=[0x1d3f55,0x24495d,0x21394f,0x3b315f,0x443a26,0x1f3d60,0x4b3026];

async function getJson(path,options={}){
  const response=await fetch(new URL(path,window.location.origin),options);
  if(!response.ok)throw new Error("HTTP "+response.status);
  return response.json();
}
function initials(name){return name.split(/\s+/).map(w=>w[0]).join("").slice(0,2).toUpperCase()}
function mat(color,rough=.6,metal=.1,emissive=0,ei=0){return new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal,emissive,emissiveIntensity:ei})}
function box(parent,size,pos,m,rot){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),m);mesh.position.set(...pos);
  if(rot)mesh.rotation.set(...rot);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh
}
function cyl(parent,r1,r2,h,pos,m,segments=18){
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,segments),m);mesh.position.set(...pos);
  mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh
}
function statusColor(status,index){
  if(status==="offline"||status==="error")return 0xff5965;
  return paletteHex[index%paletteHex.length];
}

function makeTextTexture(title,subtitle,color){
  const c=document.createElement("canvas");c.width=512;c.height=256;
  const x=c.getContext("2d");x.fillStyle="#06080d";x.fillRect(0,0,512,256);
  const grad=x.createLinearGradient(0,0,512,0);grad.addColorStop(0,color+"33");grad.addColorStop(1,"#00000000");
  x.fillStyle=grad;x.fillRect(0,0,512,256);
  x.strokeStyle=color+"66";x.lineWidth=2;
  for(let y=46;y<256;y+=42){x.beginPath();x.moveTo(0,y);x.lineTo(512,y);x.stroke()}
  x.fillStyle=color;x.font="800 30px Segoe UI";x.fillText(title,26,56);
  x.fillStyle="#eaf6ff";x.font="800 48px Segoe UI";x.fillText(subtitle,26,120);
  x.fillStyle=color;x.fillRect(26,186,250,6);x.fillStyle="#ffffff22";x.fillRect(288,186,145,6);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t
}

function buildStage(){
  const steel=mat(0x26323b,.6,.28);
  const steelDark=mat(0x111a21,.72,.2);
  const safety=mat(0xffb62e,.34,.32,0x6b4300,.16);
  const cyanMat=mat(0x35cfff,.24,.38,0x35cfff,1.6);

  const stage=new THREE.Mesh(new THREE.CylinderGeometry(11.7,12.0,.38,72),mat(0x3b4a54,.56,.24));
  stage.position.y=-.18;stage.receiveShadow=true;room.scene.add(stage);
  const inner=new THREE.Mesh(new THREE.CylinderGeometry(10.8,11.0,.10,72),mat(0x24343e,.64,.18));
  inner.position.y=.05;inner.receiveShadow=true;room.scene.add(inner);

  // Прямые линии и центральный проход вместо случайного кругового построения.
  box(room.scene,[15.8,.025,.10],[0,.115,-3.55],cyanMat);
  box(room.scene,[15.8,.025,.10],[0,.115,.05],cyanMat);
  box(room.scene,[15.8,.025,.10],[0,.115,4.05],cyanMat);
  box(room.scene,[.10,.025,9.4],[0,.118,.25],safety);
  for(const x of [-7.7,7.7]){
    box(room.scene,[.18,.03,9.4],[x,.12,.25],safety);
  }
  // Маркеры безопасного прохода.
  for(let z=-3.1;z<=3.6;z+=1.15){
    box(room.scene,[.42,.03,.12],[-.42,.125,z],safety);
    box(room.scene,[.42,.03,.12],[.42,.125,z],safety);
  }

  const back=box(room.scene,[23.8,.28,7.4],[0,3.72,-8.95],mat(0x243641,.62,.20));
  const upper=box(room.scene,[23.8,.18,1.0],[0,6.85,-8.8],steelDark);
  const beamMat=mat(0x31434f,.46,.48);
  for(const x of [-11,-7,-3,3,7,11]) box(room.scene,[.20,7.0,.25],[x,3.5,-8.72],beamMat);

  const mainTex=makeTextTexture("ОХРАНА ТРУДА","98% КОНТРОЛЬ","#49d8ff");
  const mainPanel=new THREE.Mesh(new THREE.PlaneGeometry(7.2,2.65),new THREE.MeshStandardMaterial({map:mainTex,emissive:0x2b7288,emissiveMap:mainTex,emissiveIntensity:.8,side:THREE.DoubleSide}));
  mainPanel.position.set(0,4.15,-8.73);room.scene.add(mainPanel);

  const riskTex=makeTextTexture("КОНТРОЛЬ РИСКОВ","3 ОТКРЫТО","#ffb62e");
  const riskPanel=new THREE.Mesh(new THREE.PlaneGeometry(4.0,2.25),new THREE.MeshStandardMaterial({map:riskTex,emissive:0x7a4e0c,emissiveMap:riskTex,emissiveIntensity:.72,side:THREE.DoubleSide}));
  riskPanel.position.set(-8.15,4.0,-8.72);room.scene.add(riskPanel);

  const ppeTex=makeTextTexture("СИЗ И ИНСТРУКТАЖИ","100%","#57e59d");
  const ppePanel=new THREE.Mesh(new THREE.PlaneGeometry(4.0,2.25),new THREE.MeshStandardMaterial({map:ppeTex,emissive:0x1c6644,emissiveMap:ppeTex,emissiveIntensity:.72,side:THREE.DoubleSide}));
  ppePanel.position.set(8.15,4.0,-8.72);room.scene.add(ppePanel);

  // PPE racks with helmets and safety vests.
  for(const side of [-1,1]){
    const x=side*9.65;
    box(room.scene,[2.0,2.9,.58],[x,1.5,-5.85],steelDark);
    for(let r=0;r<3;r++) box(room.scene,[1.7,.08,.50],[x,.52+r*.88,-5.57],steel);
    for(let h=0;h<3;h++){
      const helmet=new THREE.Mesh(new THREE.SphereGeometry(.30,18,10,0,Math.PI*2,0,Math.PI*.55),safety);
      helmet.position.set(x-.52+h*.52,1.28,-5.27);helmet.castShadow=true;room.scene.add(helmet);
    }
    const vest=box(room.scene,[.72,1.12,.08],[x,2.45,-5.53],mat(0xf5c52f,.65,.05));
    box(room.scene,[.58,.10,.09],[x,2.65,-5.47],mat(0xd7f1f5,.5,.05));
  }

  // Industrial silhouettes: tanks/towers behind the safety wall sections.
  for(const x of [-5.5,5.3]){
    const tower=cyl(room.scene,.65,.72,2.1,[x,1.25,-7.25],mat(0x425761,.45,.55),24);
    const dome=new THREE.Mesh(new THREE.SphereGeometry(.67,20,10,0,Math.PI*2,0,Math.PI*.5),mat(0x4c626d,.42,.52));
    dome.position.set(x,2.3,-7.25);dome.castShadow=true;room.scene.add(dome);
    box(room.scene,[.12,2.8,.12],[x+.95,1.65,-7.2],beamMat);
    box(room.scene,[1.9,.08,.08],[x+.95,2.85,-7.2],cyanMat);
  }

  // Warm/cyan ceiling rails inspired by industrial safety lighting.
  const rails=[
    {w:18.0,d:5.3,y:6.45,c:0x36d2ff},
    {w:15.0,d:4.5,y:6.12,c:0xffad32},
    {w:11.5,d:3.4,y:5.8,c:0x55e0ff},
  ];
  for(const f of rails){
    const g=new THREE.Group(),m=mat(f.c,.2,.4,f.c,1.7);
    box(g,[f.w,.08,.08],[0,0,-f.d/2],m);box(g,[f.w,.08,.08],[0,0,f.d/2],m);
    box(g,[.08,.08,f.d],[-f.w/2,0,0],m);box(g,[.08,.08,f.d],[f.w/2,0,0],m);
    g.position.set(0,f.y,-.7);room.scene.add(g);room.decor.push(g);
  }

  // Safety slogans / zone plaques.
  const leftTex=makeTextTexture("БЕЗОПАСНАЯ РАБОТА","ОБЩАЯ ЦЕЛЬ","#ffbd3b");
  const left=new THREE.Mesh(new THREE.PlaneGeometry(3.4,1.6),new THREE.MeshStandardMaterial({map:leftTex,emissive:0x6b490c,emissiveMap:leftTex,emissiveIntensity:.65,side:THREE.DoubleSide}));
  left.position.set(-9.0,2.25,-8.65);room.scene.add(left);
  const rightTex=makeTextTexture("ПРЕДУПРЕЖДАЕМ РИСКИ","СОХРАНЯЕМ ЖИЗНИ","#45d7ff");
  const right=new THREE.Mesh(new THREE.PlaneGeometry(3.4,1.6),new THREE.MeshStandardMaterial({map:rightTex,emissive:0x245f72,emissiveMap:rightTex,emissiveIntensity:.65,side:THREE.DoubleSide}));
  right.position.set(9.0,2.25,-8.65);room.scene.add(right);
}
function buildPerson(agent,index,color){
  const p=new THREE.Group();p.position.set(0,0,1.02);
  const skinMat=mat(skin[index%skin.length],.75,.01),shirtMat=mat(shirt[index%shirt.length],.55,.1),dark=mat(0x101318,.65,.1);
  const torso=cyl(p,.34,.43,.8,[0,1.42,0],shirtMat,16);torso.scale.z=.75;
  const head=new THREE.Mesh(new THREE.SphereGeometry(.28,20,14),skinMat);head.position.set(0,2.05,-.02);head.castShadow=true;p.add(head);
  const hair=new THREE.Mesh(new THREE.SphereGeometry(.292,18,12,0,Math.PI*2,0,Math.PI*.56),mat(0x111318,.8,.02));
  hair.position.set(0,2.11,-.01);p.add(hair);

  const leftArm=new THREE.Group(),rightArm=new THREE.Group();leftArm.position.set(-.42,1.55,0);rightArm.position.set(.42,1.55,0);p.add(leftArm,rightArm);
  for(const [arm,side] of [[leftArm,-1],[rightArm,1]]){
    const upper=cyl(arm,.12,.11,.48,[0,-.24,0],shirtMat,12);upper.rotation.x=-.72;upper.rotation.z=side*.4;
    const fore=cyl(arm,.095,.08,.42,[side*.12,-.55,-.23],skinMat,12);fore.rotation.x=-1.08;fore.rotation.z=-side*.12;
  }

  for(const side of [-1,1]){
    const leg=cyl(p,.14,.12,.58,[.22*side,.68,.14],dark,12);leg.rotation.x=1.05;
    const shin=cyl(p,.12,.10,.52,[.22*side,.35,-.28],dark,12);
    const foot=box(p,[.28,.13,.46],[.22*side,.08,-.42],mat(0x08090c,.5,.3));
  }
  p.userData.anim={head,torso,leftArm,rightArm,phase:index*.82,offline:agent.status==="offline"};
  return p
}

function buildStation(agent,index){
  const cfg=stationLayout[index],g=new THREE.Group();g.position.set(...cfg.p);g.rotation.y=cfg.r;
  const color=statusColor(agent.status,index),cssColor=agent.status==="offline"?"#ff5965":palette[index%palette.length];
  const isOrchestrator=agent.id==="orchestrator";
  const deskMat=mat(isOrchestrator?0x506271:0x43505a,.42,.38),metal=mat(0x1d2931,.36,.58);
  box(g,[isOrchestrator?3.25:2.55,.18,isOrchestrator?1.25:1.1],[0,1.0,0],deskMat);
  box(g,[.12,.9,.12],[-.95,.48,-.34],metal);box(g,[.12,.9,.12],[.95,.48,-.34],metal);
  box(g,[.12,.9,.12],[-.95,.48,.34],metal);box(g,[.12,.9,.12],[.95,.48,.34],metal);

  const monitor=box(g,[1.38,.8,.10],[0,1.75,-.15],metal);
  const tex=makeTextTexture(agent.name.toUpperCase(),agent.status==="offline"?"OFFLINE":"READY",cssColor);
  const screenMat=new THREE.MeshStandardMaterial({map:tex,emissive:color,emissiveMap:tex,emissiveIntensity:agent.status==="offline"?.25:.75,side:THREE.DoubleSide});
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(1.18,.6),screenMat);screen.position.set(0,1.75,-.205);g.add(screen);
  box(g,[.08,.45,.08],[0,1.32,-.12],metal);
  box(g,[.64,.05,.27],[0,1.08,.08],mat(0x080b0f,.6,.2));

  const chairSeat=box(g,[.82,.15,.78],[0,.62,.98],mat(0x26333d,.46,.38));
  const chairBack=box(g,[.82,.88,.15],[0,1.13,1.32],mat(0x26333d,.46,.38));

  const person=buildPerson(agent,index,color);g.add(person);room.agentAnim.set(agent.id,person.userData.anim);

  const ringRadius=isOrchestrator?1.85:1.45;
  const ring=new THREE.Mesh(new THREE.RingGeometry(ringRadius,ringRadius+.12,64),new THREE.MeshBasicMaterial({color,transparent:true,opacity:agent.status==="offline"?.22:.48,side:THREE.DoubleSide}));
  ring.rotation.x=-Math.PI/2;ring.position.y=.075;ring.userData.stationRing=true;g.add(ring);
  if(isOrchestrator){
    const commandPad=new THREE.Mesh(new THREE.CylinderGeometry(2.15,2.15,.12,48),mat(0x263b48,.5,.28));
    commandPad.position.y=.06;commandPad.receiveShadow=true;g.add(commandPad);
  }

  const strip=box(g,[2.2,.025,.035],[0,.94,-.52],mat(color,.2,.4,color,1.8));strip.userData.pulse=true;
  const glow=new THREE.PointLight(color,agent.status==="offline"?.25:.65,3.5,2);glow.position.set(0,1.65,-.35);g.add(glow);

  const hit=new THREE.Mesh(new THREE.BoxGeometry(isOrchestrator?3.8:3.1,3.1,2.7),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));
  hit.position.set(0,1.45,.15);hit.userData.agentId=agent.id;g.add(hit);room.clickable.push(hit);

  room.scene.add(g);room.stationGroups.set(agent.id,g);

  const tag=document.createElement("div");tag.className="agent-tag "+agent.status;tag.dataset.agentId=agent.id;tag.style.setProperty("--agent-color",cssColor);
  tag.innerHTML="<strong></strong><small></small><em></em>";
  tag.querySelector("strong").textContent=agent.name;tag.querySelector("small").textContent=agent.role;tag.querySelector("em").textContent=statusLabel[agent.status]||agent.status.toUpperCase();
  el("labelLayer").appendChild(tag);room.labels.set(agent.id,tag);
}

function lighting(){
  room.scene.add(new THREE.HemisphereLight(0xd7efff,0x26343d,2.15));
  const key=new THREE.DirectionalLight(0xffffff,2.65);key.position.set(6,13,11);key.castShadow=true;key.shadow.mapSize.set(2048,2048);
  key.shadow.camera.left=-14;key.shadow.camera.right=14;key.shadow.camera.top=14;key.shadow.camera.bottom=-14;room.scene.add(key);
  const amber=new THREE.PointLight(0xffb13b,1.85,26,2);amber.position.set(-8,5.5,-1);room.scene.add(amber);
  const cyan=new THREE.PointLight(0x4fdcff,1.95,26,2);cyan.position.set(8,6,2);room.scene.add(cyan);
  const front=new THREE.DirectionalLight(0xc8efff,1.35);front.position.set(0,6,14);room.scene.add(front);
}

function clearStations(){
  for(const g of room.stationGroups.values())room.scene.remove(g);
  room.stationGroups.clear();room.agentAnim.clear();room.clickable=[];room.labels.clear();el("labelLayer").replaceChildren()
}
function buildStations(agents){clearStations();agents.forEach(buildStation);selectAgent(room.selectedAgentId,false)}
function updateLabels(){
  const rect=room.renderer.domElement.getBoundingClientRect();
  for(const agent of room.agents){
    const g=room.stationGroups.get(agent.id),tag=room.labels.get(agent.id);if(!g||!tag)continue;
    const p=new THREE.Vector3(0,2.9,.1);g.localToWorld(p);p.project(room.camera);
    const vis=p.z>-1&&p.z<1&&p.x>-1.1&&p.x<1.1&&p.y>-1.1&&p.y<1.1;
    tag.style.left=((p.x*.5+.5)*rect.width)+"px";tag.style.top=((-p.y*.5+.5)*rect.height)+"px";tag.style.opacity=vis?"1":"0";
    tag.classList.toggle("selected",agent.id===room.selectedAgentId)
  }
}
function updateInspector(agent){
  if(!agent)return;el("selectedName").textContent=agent.name;el("selectedRole").textContent=agent.role;el("selectedAvatar").textContent=initials(agent.name);
  el("selectedTask").textContent=agent.current_task||"Нет активной задачи";el("selectedToday").textContent=agent.today;el("selectedGoal").textContent=agent.goal;
  el("selectedState").textContent=agent.status==="offline"?"LINK DOWN":"READY";
  const s=el("selectedStatus");s.className="status-pill "+agent.status;s.textContent=statusLabel[agent.status]||agent.status.toUpperCase()
}
function focusAgent(id){
  const g=room.stationGroups.get(id);if(!g)return;const p=new THREE.Vector3();g.getWorldPosition(p);
  room.desiredTarget.copy(p).add(new THREE.Vector3(0,1.25,0));
  room.desiredCamera.copy(p).add(new THREE.Vector3(4.7,4.2,6.5))
}
function selectAgent(id,focus=true){room.selectedAgentId=id;const a=room.agents.find(x=>x.id===id)||room.agents[0];updateInspector(a);for(const [k,t] of room.labels)t.classList.toggle("selected",k===id);if(focus)focusAgent(id)}
function resetCamera(){room.tourActive=false;el("tourView")?.classList.remove("active");room.desiredTarget.set(0,1.30,-.85);room.desiredCamera.set(12.2,12.8,21.5)}
function toggleTour(){room.tourActive=!room.tourActive;el("tourView").classList.toggle("active",room.tourActive);if(room.tourActive){room.tourIndex=0;room.tourNextAt=0}else resetCamera()}
function updateTour(t){if(!room.tourActive||!room.agents.length||t<room.tourNextAt)return;const a=room.agents[room.tourIndex%room.agents.length];selectAgent(a.id,true);room.tourIndex=(room.tourIndex+1)%room.agents.length;room.tourNextAt=t+4.3}

function ndc(e){const r=room.renderer.domElement.getBoundingClientRect();room.pointer.x=((e.clientX-r.left)/r.width)*2-1;room.pointer.y=-((e.clientY-r.top)/r.height)*2+1}
function pick(e){ndc(e);room.raycaster.setFromCamera(room.pointer,room.camera);const h=room.raycaster.intersectObjects(room.clickable,false);if(h.length){room.tourActive=false;el("tourView")?.classList.remove("active");selectAgent(h[0].object.userData.agentId,true)}}
function interactions(){
  const c=room.renderer.domElement;
  c.addEventListener("pointerdown",e=>{room.dragging=true;room.dragMoved=false;room.downX=room.lastX=e.clientX;room.downY=room.lastY=e.clientY;c.setPointerCapture?.(e.pointerId)});
  c.addEventListener("pointermove",e=>{
    if(!room.dragging)return;const dx=e.clientX-room.lastX,dy=e.clientY-room.lastY;if(Math.abs(e.clientX-room.downX)+Math.abs(e.clientY-room.downY)>5)room.dragMoved=true;
    room.lastX=e.clientX;room.lastY=e.clientY;if(room.dragMoved){room.tourActive=false;el("tourView")?.classList.remove("active");const off=room.camera.position.clone().sub(room.target);
      const sph=new THREE.Spherical().setFromVector3(off);sph.theta-=dx*.004;sph.phi=Math.min(Math.PI*.47,Math.max(.34,sph.phi+dy*.0032));
      room.desiredCamera.copy(room.target).add(new THREE.Vector3().setFromSpherical(sph))}
  });
  c.addEventListener("pointerup",e=>{const m=room.dragMoved;room.dragging=false;if(!m)pick(e)});
  c.addEventListener("wheel",e=>{e.preventDefault();room.tourActive=false;el("tourView")?.classList.remove("active");const d=room.desiredCamera.clone().sub(room.desiredTarget);d.setLength(Math.min(30,Math.max(7,d.length()*(1+Math.sign(e.deltaY)*.075))));room.desiredCamera.copy(room.desiredTarget).add(d)},{passive:false})
}
function resize(){const w=el("threeWrap");const W=Math.max(1,w.clientWidth),H=Math.max(1,w.clientHeight);room.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.65));room.renderer.setSize(W,H,false);room.camera.aspect=W/H;room.camera.updateProjectionMatrix()}
function animateAgent(agent,t){
  const a=room.agentAnim.get(agent.id);if(!a)return;const ph=t+a.phase;a.torso.scale.y=1+Math.sin(ph*1.2)*.015;a.head.rotation.y=Math.sin(ph*.75)*.08;
  if(a.offline){a.leftArm.rotation.x=-.45;a.rightArm.rotation.x=-.45;return}
  const active=agent.id===room.selectedAgentId||["working","waiting","verifying"].includes(agent.status);const s=active?6.8:2.2;
  a.leftArm.rotation.x=-.1+Math.sin(ph*s)*.06;a.rightArm.rotation.x=-.1+Math.sin(ph*s+Math.PI)*.06
}
function animate(){
  requestAnimationFrame(animate);const t=room.clock.getElapsedTime();updateTour(t);room.camera.position.lerp(room.desiredCamera,.05);room.target.lerp(room.desiredTarget,.065);room.camera.lookAt(room.target);
  for(const a of room.agents){animateAgent(a,t);const g=room.stationGroups.get(a.id);if(!g)continue;g.traverse(o=>{if(o.userData?.pulse&&o.material?.emissiveIntensity!==undefined)o.material.emissiveIntensity=1.25+Math.sin(t*2.5)*.35;if(o.userData?.stationRing)o.material.opacity=(a.id===room.selectedAgentId?.68:.38)+Math.sin(t*2.4)*.05})}
  for(const d of room.decor){if(d.userData.orb){d.rotation.x=t*.18;d.rotation.y=t*.25}if(d.userData.neonFrame)d.position.y+=Math.sin(t*.8+d.userData.phase)*.0007}
  updateLabels();room.renderer.render(room.scene,room.camera);
  if(document.documentElement.dataset.webglReady!=="true"){document.documentElement.dataset.webglReady="true";el("webglFallback").hidden=true;el("renderStatus").textContent=(room.renderer.capabilities.isWebGL2?"WEBGL2":"WEBGL1")+" · 3D ACTIVE"}
}
function init3D(){
  const canvas=el("roomCanvas"),fallback=el("webglFallback");
  try{
    const ctx=canvas.getContext("webgl2",{antialias:true,alpha:false,powerPreference:"high-performance"})||canvas.getContext("webgl",{antialias:true,alpha:false,powerPreference:"high-performance"});
    if(!ctx)throw new Error("Браузер не выдал WebGL-контекст");
    room.renderer=new THREE.WebGLRenderer({canvas,context:ctx,antialias:true,powerPreference:"high-performance"});room.renderer.shadowMap.enabled=true;room.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    room.renderer.outputColorSpace=THREE.SRGBColorSpace;room.renderer.toneMapping=THREE.ACESFilmicToneMapping;room.renderer.toneMappingExposure=1.48;
    room.scene=new THREE.Scene();room.scene.background=new THREE.Color(0x0b1a24);room.scene.fog=new THREE.FogExp2(0x0b1a24,.0055);
    room.camera=new THREE.PerspectiveCamera(38,1,.1,80);room.camera.position.copy(room.desiredCamera);room.camera.lookAt(room.target);
    buildStage();lighting();resize();interactions();window.addEventListener("resize",resize);el("resetView").addEventListener("click",resetCamera);el("tourView").addEventListener("click",toggleTour);
    document.documentElement.dataset.webglReady="starting";animate()
  }catch(e){fallback.hidden=false;el("fallbackText").textContent="WebGL недоступен: "+e.message;el("renderStatus").textContent="ERROR";throw e}
}
function renderActivity(events){const f=el("activityFeed");f.replaceChildren();events.forEach(e=>{const d=document.createElement("div");d.className="feed-item";const s=document.createElement("strong");s.textContent=e.source;const p=document.createElement("p");p.textContent=e.message;const t=document.createElement("time");t.textContent=new Date(e.timestamp).toLocaleString("ru-RU");d.append(s,p,t);f.appendChild(d)})}
async function refresh(){
  const [health,agents,activity,tasks]=await Promise.all([getJson("/api/health"),getJson("/api/agents"),getJson("/api/activity"),getJson("/api/tasks")]);room.agents=agents;
  const b=el("healthBadge");b.textContent=health.status==="ok"?"SYSTEM OK":"SYSTEM ERROR";b.classList.toggle("ok",health.status==="ok");
  el("agentCount").textContent=agents.length;el("activeCount").textContent=agents.filter(a=>["working","waiting","verifying"].includes(a.status)).length;el("taskCount").textContent=tasks.length;
  el("modeText").textContent=health.mode==="planning-only"?"Planning-only · внешние изменения заблокированы":"Режим: "+health.mode;buildStations(agents);renderActivity(activity)
}
async function submitTask(){
  const input=el("taskInput"),button=el("sendTask"),result=el("planResult"),message=input.value.trim();if(!message)return;button.disabled=true;result.hidden=true;
  try{const plan=await getJson("/api/tasks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message})});result.textContent="Главный исполнитель: "+plan.primary_agent_id+". Участники: "+plan.assigned_agent_ids.join(", ")+". "+plan.reason;result.hidden=false;input.value="";room.selectedAgentId=plan.primary_agent_id;await refresh();selectAgent(plan.primary_agent_id,true)}
  catch(e){result.textContent="Ошибка: "+e.message;result.hidden=false}finally{button.disabled=false}
}
el("sendTask").addEventListener("click",submitTask);el("taskInput").addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key==="Enter")submitTask()});
try{init3D();refresh().catch(e=>{el("healthBadge").textContent="SYSTEM ERROR";el("modeText").textContent="Не удалось загрузить данные: "+e.message})}
catch(e){el("healthBadge").textContent="SYSTEM ERROR";el("modeText").textContent="3D-движок не запустился: "+e.message}
