import './style.css';
import {categories,score,totals} from './rules.js';
import {configured,local,identity,command,subscribe,subscribeOnlinePresence} from './api.js';
const root=document.querySelector('#app');

/* Lock browser pull-to-refresh on every screen while keeping normal vertical scrolling. */
let touchStartY=0;
const rootScrollTop=()=>document.scrollingElement?.scrollTop??window.scrollY??0;
document.addEventListener('touchstart',e=>{
 if(e.touches.length===1)touchStartY=e.touches[0].clientY;
},{passive:true,capture:true});
document.addEventListener('touchmove',e=>{
 if(e.touches.length!==1)return;
 const y=e.touches[0].clientY;
 if(y>touchStartY&&rootScrollTop()<=0)e.preventDefault();
},{passive:false,capture:true});
const inviteParam=new URLSearchParams(location.search).get('room');
const inviteCode=/^[A-Za-z0-9]{5}$/.test(inviteParam||'')?inviteParam.toUpperCase():'';
const playerName=()=>sessionStorage.getItem('yatzy.name')||'';
let room=null,matches=[],matchesLoading=false,busy=false,message='',friends=false,inviteSent=false,codeRoom=false,started=false,subview=null,connection=local?'Lokal duell':'Ansluter …',unsubscribe=()=>{},presenceUnsubscribe=()=>{},onlineCount=local?1:0,timer,matchesTimer,refreshBusy=false,rollingIndices=[],rollAnimationTimer,rollAnimationPending=false,rollSequence=0,rollView=null;
let diceLanding=[{x:-4,y:5,rz:-7,rx:-11,ry:7},{x:2,y:-4,rz:5,rx:-8,ry:-8},{x:-2,y:7,rz:-3,rx:-12,ry:4},{x:4,y:-6,rz:7,rx:-9,ry:-6},{x:-1,y:3,rz:-5,rx:-11,ry:8}];
let selectedAvatar=Math.max(0,Math.min(19,Number(localStorage.getItem('yatzy.avatar')??0)));
let token;try{token=identity();}catch{message='Tillåt lokal lagring i webbläsaren för att kunna spela och återansluta.';}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dots={1:[5],2:[1,9],3:[1,5,9],4:[1,3,7,9],5:[1,3,5,7,9],6:[1,3,4,6,7,9]};
function avatarArt(id){
 const i=Math.max(0,Math.min(19,Number(id)||0));
 return `<img class="avatar-portrait" src="${import.meta.env.BASE_URL}avatars/bar-brawl-${String(i+1).padStart(2,'0')}.webp" width="512" height="512" alt="" decoding="async">`;
}
function avatarPicker(){
 return `<div class="avatar-picker"><h3>Välj din profil</h3><div class="avatar-grid mixed">${Array.from({length:20},(_,i)=>`<button type="button" class="avatar-choice ${selectedAvatar===i?'selected':''}" data-avatar="${i}" aria-label="Profil ${i+1}" aria-pressed="${selectedAvatar===i}">${avatarArt(i)}</button>`).join('')}</div></div>`;
}
function roomAvatar(i){return room?.avatars?.[i]??(i?10:0);}

// Only reload resumes the current view. A fresh app launch keeps its start screen.
let nameDraft='',codeDraft='',recoveringRoom=false;
const isReload=performance.getEntriesByType('navigation')[0]?.type==='reload';
let savedView=null;
try{if(isReload)savedView=JSON.parse(sessionStorage.getItem('yatzy.view')||'null');}catch{}
if(savedView){
 started=Boolean(savedView.started);friends=Boolean(savedView.friends);
 subview=['howto','history'].includes(savedView.subview)?savedView.subview:null;
 codeRoom=Boolean(savedView.codeRoom);inviteSent=Boolean(savedView.inviteSent);
 nameDraft=String(savedView.nameDraft||'');codeDraft=String(savedView.codeDraft||'');
 if(savedView.room?.id&&playerName()){
  room=savedView.room;recoveringRoom=true;busy=true;
  connection='Återansluter …';
 }
}
function rememberView(){
 try{sessionStorage.setItem('yatzy.view',JSON.stringify({started,friends,subview,codeRoom,inviteSent,nameDraft,codeDraft,room}));}catch{}
}
function rememberInputs(){
 const nameInput=root.querySelector('#name'),codeInput=root.querySelector('#code');
 if(nameInput)nameDraft=nameInput.value;
 if(codeInput)codeDraft=codeInput.value;
}

function randomLanding(index){
 const rand=(min,max)=>min+Math.random()*(max-min);
 const dir=Math.random()<.5?-1:1;
 return {
  x:rand(-7,7),y:rand(-10,10),rz:rand(-13,13),rx:rand(-10,-4),ry:rand(-8,8),
  entryX:(index-2)*16+rand(-34,34),
  entryY:rand(-58,-38),
  sideKick:rand(-18,18),
  spinX:dir*rand(540,940),
  spinY:-dir*rand(430,860),
  spinZ:rand(-320,320),
  bounce1:rand(20,34),
  bounce2:rand(7,15),
  duration:rand(1320,1850),
  delay:rand(0,130)
 };
}
function die(n,held=false,index=null,disabled=false,rollOrder=-1){
 const rolling=rollOrder>=0,p=index===null?null:diceLanding[index];
 const style=p?`style="--tx:${p.x}px;--ty:${p.y}px;--rz:${p.rz}deg;--rx:${p.rx}deg;--ry:${p.ry}deg"`:'';
 return `<button class="die ${held?'held':''} ${rolling?'rolling':''}" ${style} ${index===null?'tabindex="-1" aria-hidden="true"':`data-die="${index}" data-roll-order="${Math.max(0,rollOrder)}" aria-label="Tärning ${index+1}: ${n}${held?', låst':''}" aria-pressed="${held}"`} ${disabled?'disabled':''}>${Array.from({length:9},(_,i)=>`<i class="${dots[n].includes(i+1)?'pip':''}"></i>`).join('')}${index!==null?`<span>${held?'LÅST':' '}</span>`:''}</button>`;
}
function cubePips(value){
 return Array.from({length:9},(_,i)=>`<i class="${dots[value].includes(i+1)?'pip':''}"></i>`).join('');
}
function singleDieCube(value){
 const side=n=>((value+n-2)%6)+1;
 return `<div class="single-die-roller" aria-hidden="true"><div class="single-die-shadow"></div><div class="single-die-cube"><div class="single-die-face front">${cubePips(value)}</div><div class="single-die-face back">${cubePips(side(2))}</div><div class="single-die-face right">${cubePips(side(3))}</div><div class="single-die-face left">${cubePips(side(4))}</div><div class="single-die-face top">${cubePips(side(5))}</div><div class="single-die-face bottom">${cubePips(side(6))}</div></div></div>`;
}
function rollViewMarkup(){
 const value=room?.dice?.[rollView?.index??0]??1;
 return `<main class="throw-view"><section class="throw-view-table" aria-label="Tärningskast"><div class="throw-view-light"></div><div class="throw-view-grain"></div><div class="throw-view-hint">KAST ${room?.rolls||1} AV 3</div><div class="throw-view-result"> ${value} </div></section></main>`;
}
function animateDiceRoll(){
 if(!rollAnimationPending||busy||!rollView)return;
 rollAnimationPending=false;
 const seq=rollSequence;
 const table=root.querySelector('.throw-view-table');
 if(!table)return;

 const index=rollView.index;
 const value=room?.dice?.[index]??1;
 table.insertAdjacentHTML('beforeend',singleDieCube(value));
 const roller=table.querySelector('.single-die-roller');
 const cube=roller?.querySelector('.single-die-cube');
 const shadow=roller?.querySelector('.single-die-shadow');
 if(!roller||!cube||!shadow){rollView=null;rollingIndices=[];render();return;}

 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const width=Math.max(320,table.clientWidth);
 const height=Math.max(480,table.clientHeight);

 // A small rigid-body style simulation: gravity, table impact, friction,
 // wall impacts and angular damping. No pre-baked motion path.
 const state={
  x:(Math.random()<.5?-1:1)*width*.38,
  y:-height*.12,
  z:reduced?0:110+Math.random()*30,
  vx:(Math.random()<.5?1:-1)*(190+Math.random()*90),
  vy:90+Math.random()*90,
  vz:reduced?0:70+Math.random()*45,
  rx:Math.random()*Math.PI*2,
  ry:Math.random()*Math.PI*2,
  rz:Math.random()*Math.PI*2,
  wx:(Math.random()-.5)*10,
  wy:(Math.random()-.5)*10,
  wz:(Math.random()-.5)*8
 };
 const gravity=-920;
 const restitution=.34;
 const tableFriction=.79;
 const airDrag=.992;
 const angularAir=.989;
 const angularFloor=.72;
 const floorZ=0;
 const wallX=width*.39;
 const wallY=height*.26;
 const startAt=performance.now();
 let last=startAt;
 let settledSince=0;
 let raf=0;

 function draw(){
  roller.style.transform=`translate3d(calc(-50% + ${state.x}px),calc(-50% + ${state.y}px),${state.z}px)`;
  cube.style.transform=`rotateX(${state.rx}rad) rotateY(${state.ry}rad) rotateZ(${state.rz}rad)`;
  const lift=Math.min(1,state.z/120);
  shadow.style.opacity=String(.42-.31*lift);
  shadow.style.transform=`translate(-50%,-50%) scale(${1-.38*lift})`;
 }

 function finish(){
  cancelAnimationFrame(raf);
  // Make the server result unambiguous and leave it on screen long enough to read.
  state.z=0;
  roller.style.transition='transform 220ms ease-out';
  cube.style.transition='transform 260ms ease-out';
  cube.style.transform='rotateX(0deg) rotateY(0deg) rotateZ(0deg)';
  draw();
  const result=table.querySelector('.throw-view-result');
  if(result){
   result.textContent=String(value);
   result.classList.add('visible');
  }
  clearTimeout(rollAnimationTimer);
  rollAnimationTimer=setTimeout(()=>{
   if(seq!==rollSequence)return;
   rollView=null;
   rollingIndices=[];
   render();
  },1350);
 }

 function step(now){
  if(seq!==rollSequence)return;
  let dt=Math.min(.025,(now-last)/1000||.016);
  last=now;

  state.vz+=gravity*dt;
  state.x+=state.vx*dt;
  state.y+=state.vy*dt;
  state.z+=state.vz*dt;
  state.rx+=state.wx*dt;
  state.ry+=state.wy*dt;
  state.rz+=state.wz*dt;

  state.vx*=airDrag;
  state.vy*=airDrag;
  state.wx*=angularAir;
  state.wy*=angularAir;
  state.wz*=angularAir;

  if(state.z<=floorZ){
   state.z=floorZ;
   if(Math.abs(state.vz)>26){
    state.vz=-state.vz*restitution;
    state.vx*=tableFriction;
    state.vy*=tableFriction;
    state.wx*=angularFloor;
    state.wy*=angularFloor;
    state.wz*=angularFloor;
    // Uneven corners make each bounce change the roll naturally.
    state.wx+=(Math.random()-.5)*1.7;
    state.wy+=(Math.random()-.5)*1.7;
   }else{
    state.vz=0;
    const rollingDrag=Math.pow(.90,dt*60);
    state.vx*=rollingDrag;
    state.vy*=rollingDrag;
    state.wx*=Math.pow(.86,dt*60);
    state.wy*=Math.pow(.86,dt*60);
    state.wz*=Math.pow(.84,dt*60);
   }
  }

  if(state.x<-wallX||state.x>wallX){
   state.x=Math.max(-wallX,Math.min(wallX,state.x));
   state.vx*=-.42;
   state.wy*=-.72;
  }
  if(state.y<-wallY||state.y>wallY){
   state.y=Math.max(-wallY,Math.min(wallY,state.y));
   state.vy*=-.40;
   state.wx*=-.72;
  }

  draw();

  const speed=Math.hypot(state.vx,state.vy);
  const spin=Math.hypot(state.wx,state.wy,state.wz);
  const elapsed=now-startAt;
  const quiet=state.z===0&&Math.abs(state.vz)<1&&speed<13&&spin<1.1;

  if(quiet){
   if(!settledSince)settledSince=now;
  }else{
   settledSince=0;
  }

  // Keep the throw visible for at least 2.4s, but never hang indefinitely.
  if((elapsed>2400&&settledSince&&now-settledSince>380)||elapsed>4300){
   finish();
   return;
  }
  raf=requestAnimationFrame(step);
 }

 draw();
 raf=requestAnimationFrame(step);
}


function render(){
 rememberInputs();rememberView();
 if(rollView){
  if(root.querySelector('.throw-view'))return;
  root.innerHTML=rollViewMarkup();
  if(rollAnimationPending&&!busy)queueMicrotask(animateDiceRoll);
  return;
 }
 const playing=room&&room.status!=='waiting', myTurn=room?.turn===room?.seat&&room?.status==='playing';
 root.innerHTML=`<header><a href="${import.meta.env.BASE_URL}" aria-label="Yatzy startsida" id="brand"><span class="brand-icon">⚄</span> yatzy<span class="brand-dot">.</span></a><span class="edition">BARA DUELLER. ALLTID TVÅ.</span><span class="connection"><i></i>${room?esc(connection):'EN DUELL TILL'}</span></header><main>${!room?(subview?infoView(subview):home()):playing?game(myTurn):codeRoom?codeWaiting():waiting()}</main><div class="message" role="status" aria-live="polite">${esc(message)}</div><footer><span>FEM TÄRNINGAR. TVÅ SPELARE.</span><span>Lite tur. Mycket magkänsla.</span></footer>`;
 root.querySelector('#brand').onclick=e=>{if(room){e.preventDefault();message='Din match är kvar. Använd Lämna match för att avsluta.';render();}};
 bind('#start',()=>enterApp());
 bind('#back-start',()=>{started=false;subview=null;message='';render();});
 bind('#back-lobby',()=>{friends=false;subview=null;message='';render();});
 bind('#back-info',()=>{subview=null;message='';render();});
 bind('#back-matches',()=>closeRoom());
 root.querySelector('#name-form')?.addEventListener('submit',e=>{e.preventDefault();saveNameAndContinue();});
 bind('#friends',()=>{friends=!friends;render();});
 bind('#howto',()=>{subview='howto';message='';render();});
 bind('#history',()=>{subview='history';message='';render();});
 bind('#create',()=>createCodeRoom());bind('#find',()=>enter('find'));
 bind('#share',()=>createAndShare());bind('#share-room',()=>shareRoom());
 bind('#copy-code',async()=>{try{await navigator.clipboard.writeText(room.code);message='Koden är kopierad.';}catch{message=`Koden är ${room.code}.`;}render();});
 root.querySelector('#join-form')?.addEventListener('submit',e=>{e.preventDefault();enter('join');});
 const nameInput=root.querySelector('#name'),codeInput=root.querySelector('#code');
 if(nameInput){nameInput.value=nameDraft;nameInput.addEventListener('input',()=>{nameDraft=nameInput.value;rememberView();});}
 if(codeInput){codeInput.value=codeDraft;codeInput.addEventListener('input',()=>{codeDraft=codeInput.value;rememberView();});}
 bind('#roll',()=>act('roll'));bind('#leave',()=>{if(room.status==='waiting'||confirm('Lämna duellen? Om matchen har börjat vinner motståndaren.'))act('leave');});
 bind('#home',()=>closeRoom());
 bind('#restart-match',()=>endMatchAndLobby());
 root.querySelectorAll('[data-match]').forEach(el=>el.onclick=()=>openMatch(el.dataset.match));
 root.querySelectorAll('[data-avatar]').forEach(el=>el.onclick=()=>{selectedAvatar=Number(el.dataset.avatar);localStorage.setItem('yatzy.avatar',String(selectedAvatar));render();});
 root.querySelectorAll('[data-die]').forEach(el=>el.onclick=()=>act('hold',{index:Number(el.dataset.die)}));
 root.querySelectorAll('[data-score]').forEach(el=>el.onclick=()=>{const category=el.dataset.score,points=score(category,room.dice);if(points!==0||confirm('Stryk kategorin och få 0 poäng?'))act('score',{category});});
}
function bind(selector,fn){const el=root.querySelector(selector);if(el)el.onclick=fn;}
function home(){return started?(playerName()?lobby():nameStep()):splash();}
function splash(){return `<section class="splash splash-art"><button id="start" class="start-hotspot" aria-label="Starta"></button></section>`;}
function nameStep(){return `<section class="lobby-screen"><section class="lobby tavern-menu name-step"><button id="back-start" class="view-back" type="button" aria-label="Tillbaka till startsidan">‹ Tillbaka</button><div class="menu-crest" aria-hidden="true"><span>⚄</span><i></i><span>⚂</span></div><h2>Vad heter du?</h2><div class="menu-rule" aria-hidden="true"><span>◆</span></div>${inviteCode?'<p class="invite-note">Du har fått en matchlänk. Ange ditt namn så ansluter du direkt till rummet.</p>':'<p class="name-note">Namnet används under den här sessionen.</p>'}<form id="name-form"><input id="name" aria-label="Ditt spelarnamn" maxlength="20" autocomplete="nickname" placeholder="Ditt spelarnamn" autofocus required>${avatarPicker()}<button class="primary menu-primary">Fortsätt <span>›</span></button></form></section></section>`;}
function lobby(){const pending=matches.filter(m=>m.status==='playing'&&m.turn===m.seat).length;return `<section class="lobby-screen"><section class="lobby tavern-menu"><div class="lobby-profile" aria-label="Vald profil">${avatarArt(selectedAvatar)}</div><h2>Din nästa duell<br>börjar här.</h2><div class="menu-rule" aria-hidden="true"><span>◆</span></div><div class="lobby-meta"><p class="session-name">Spelar som <strong>${esc(playerName())}</strong></p><p class="online-now" aria-live="polite"><i></i><strong>${onlineCount}</strong> online</p></div>${matchList(pending)}<button id="find" class="primary menu-primary" ${!configured||busy||!token?'disabled':''}><span>Hitta motståndare</span><span>›</span></button><div class="divider"><span>ELLER</span></div><button id="friends" class="secondary menu-secondary" ${!configured||busy||!token?'disabled':''}><span class="friends-icon" aria-hidden="true">●●</span><span>Spela mot en vän</span><span>›</span></button>${friends?`<div class="friend-panel"><button id="back-lobby" class="view-back inline-back" type="button">‹ Tillbaka</button><button id="create" class="primary" ${busy?'disabled':''}>Skapa rum</button><form id="join-form"><label for="code">Har du en rumskod?</label><div class="join"><input id="code" aria-label="Rumskod" placeholder="ABCDE" pattern="[A-Za-z0-9]{5}" maxlength="5" minlength="5" required autocomplete="off"><button ${busy?'disabled':''}>Anslut</button></div></form></div>`:''}<button id="share" class="secondary share-link" ${!configured||busy||!token?'disabled':''}><span class="share-icon" aria-hidden="true">↗</span><span><strong>Dela länk</strong><small>Bjud in en vän via länk till en duell</small></span><span>›</span></button><div class="menu-bottom"><button type="button" id="howto" class="menu-link"><span aria-hidden="true">▤</span>Så spelar du<b>›</b></button><button type="button" id="history" class="menu-link"><span aria-hidden="true">◷</span>Historik<b>›</b></button></div>${!configured?'<p class="setup">Online behöver kopplas till Supabase. Starta med <code>npm run dev:local</code> för att testa en lokal duell med två spelare.</p>':''}${local?'<p class="local-note">Lokal testmiljö · öppna även ett privat webbläsarfönster för spelare två.</p>':''}</section></section>`;}
function matchList(pending){
 if(matchesLoading&&!matches.length)return '<div class="match-list loading-matches">Hämtar dina matcher …</div>';
 if(!matches.length)return '';
 return `<section class="match-list"><div class="match-list-title"><h3>Dina matcher</h3>${pending?`<span class="turn-badge">${pending} din tur</span>`:''}</div><div class="match-items">${matches.map(m=>{
  const other=m.names.length>1?m.names[1-m.seat]:'Väntar på motståndare';
  const mine=totals(m.cards[m.seat]||{}).total;
  const theirs=m.names.length>1?totals(m.cards[1-m.seat]||{}).total:null;
  const waiting=m.status==='waiting';
  const myTurn=m.status==='playing'&&m.turn===m.seat;
  const left=timeLeft(m);
  const status=waiting?'Inbjudan väntar':myTurn?`Din tur${left?' · '+left:''}`:`Väntar på ${esc(other)}`;
  return `<button class="match-item ${myTurn?'your-turn':''}" data-match="${m.id}"><span class="match-opponent">${esc(other)}</span><span class="match-status">${status}</span><strong>${waiting?'—':mine+'–'+theirs}</strong><span class="match-arrow">›</span></button>`;
 }).join('')}</div></section>`;
}
function timeLeft(m){
 if(!m.deadline_at||m.status!=='playing'||m.turn!==m.seat)return '';
 const ms=new Date(m.deadline_at).getTime()-Date.now();
 if(ms<=0)return 'tiden ute';
 const min=Math.max(1,Math.ceil(ms/60000));
 return min>=60?'60 min kvar':min+' min kvar';
}
function infoView(kind){
 if(kind==='howto')return `<section class="lobby-screen"><section class="lobby tavern-menu info-page"><button id="back-info" class="view-back" type="button">‹ Tillbaka</button><div class="menu-crest" aria-hidden="true"><span>⚄</span><i></i><span>⚂</span></div><h2>Så spelar du</h2><div class="menu-rule" aria-hidden="true"><span>◆</span></div><p>Varje spelare har upp till tre kast per tur. Efter första och andra kastet kan du låsa de tärningar du vill behålla och kasta om resten.</p><p>När du är nöjd väljer du en ledig kategori i protokollet. Varje kategori kan användas en gång. Bonusen är 50 poäng när Ettor–Sexor tillsammans når minst 63 poäng.</p><p>Efter att båda spelarna gjort ett slag jämförs poängen i omgången. Den som fick minst förlorar poängskillnaden från sin energibar. Båda börjar på 50 energi.</p><p>När energin når 0 blir spelaren knockad och står över nästa slag. Därefter återställs energin till 45, sedan 40, 35 och så vidare. Blir du knockad på nivån 5 förlorar du matchen direkt.</p><p>Om ingen slås ut är duellen klar när båda spelarna fyllt alla 15 kategorier. Högst totalpoäng vinner.</p></section></section>`;
 return `<section class="lobby-screen"><section class="lobby tavern-menu info-page"><button id="back-info" class="view-back" type="button">‹ Tillbaka</button><div class="menu-crest" aria-hidden="true"><span>⚄</span><i></i><span>⚂</span></div><h2>Historik</h2><div class="menu-rule" aria-hidden="true"><span>◆</span></div><p>Matchhistorik kommer i nästa steg.</p></section></section>`;
}
function codeWaiting(){return `<section class="lobby-screen"><section class="lobby tavern-menu code-room"><button id="back-matches" class="view-back" type="button">‹ Dina matcher</button><div class="menu-crest" aria-hidden="true"><span>⚄</span><i></i><span>⚂</span></div><p class="eyebrow">PRIVAT DUELL</p><h2>Din rumskod</h2><div class="menu-rule" aria-hidden="true"><span>◆</span></div><p class="code-help">Ge koden till din vän. När den skrivs in startar matchen automatiskt.</p><button id="copy-code" class="room-code-simple" aria-label="Kopiera rumskod">${room.code}<small>TRYCK FÖR ATT KOPIERA</small></button><button id="leave" class="text-button" ${busy?'disabled':''}>Avbryt</button></section></section>`;}
function waiting(){return `<section class="waiting-screen"><section class="waiting tavern-menu ${room.mode==='private'?'private-waiting':'online-waiting'}"><button id="back-matches" class="view-back" type="button">‹ Dina matcher</button><div class="menu-crest" aria-hidden="true"><span>⚄</span><i></i><span>⚂</span></div><p class="eyebrow">${room.mode==='online'?'MATCHMAKING':'DIN PRIVATA DUELL'}</p><h1>${room.mode==='online'?'Letar efter<br>din motståndare.':'En plats kvar.<br>Bjud in en vän.'}</h1><div class="menu-rule" aria-hidden="true"><span>◆</span></div><p>${room.mode==='online'?'Matchen börjar så snart ni är två.':'Dela matchlänken med din vän. När länken öppnas och namnet är angivet ansluts vännen direkt till rummet.'}</p>${room.mode==='private'?`<button id="share-room" class="primary waiting-share ${inviteSent?'sent':''}">${inviteSent?'Inbjudan skickad <span>✓</span>':'Dela matchlänk <span>↗</span>'}</button>`:'<div class="pulse">● ● ●</div>'}<button id="leave" class="text-button" ${busy?'disabled':''}>Avbryt</button></section></section>`;}
function scoreRows(list,mine,other,myTurn){
 return list.map(([key,label])=>`<tr><th>${label}</th><td>${mine[key]!==undefined?`<b>${mine[key]}</b>`:myTurn&&room.rolls>0?`<button data-score="${key}" aria-label="Välj ${label}, ${score(key,room.dice)} poäng" ${busy?'disabled':''}>${score(key,room.dice)} <span>＋</span></button>`:'<span class="empty">—</span>'}</td><td>${room.cards[other][key]??'<span class="empty">—</span>'}</td></tr>`).join('');
}
function scoreTableHead(other){
 return `<thead><tr><th>Kategori</th><th>${esc(room.names[room.seat])}<small>DU</small></th><th>${esc(room.names[other])}</th></tr></thead>`;
}
function energyBar(i){
 const energy=room.energy?.[i]??50,max=room.energy_max?.[i]??50;
 const width=max>0?Math.max(0,Math.min(100,(energy/max)*100)):0;
 const state=energy===0?'knocked':energy<=Math.max(10,max*.25)?'danger':'';
 return `<div class="energy-player ${state}"><div class="energy-label"><span>${esc(room.names[i])}${i===room.seat?' (du)':''}</span><strong>${energy} / ${max}</strong></div><div class="energy-track" role="meter" aria-label="Energi för ${esc(room.names[i])}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${energy}"><i style="width:${width}%"></i></div></div>`;
}
function combatNotice(){
 if(room.status==='knockout')return `<div class="combat-notice knockout">💥 ${esc(room.names[1-room.winner])} är utslagen. ${esc(room.names[room.winner])} vinner på knockout!</div>`;
 if(room.last_skip!==null&&room.last_skip!==undefined)return `<div class="combat-notice">🥴 ${esc(room.names[room.last_skip])} blev knockad och stod över ett slag. Energin återställdes till ${room.energy?.[room.last_skip]??0}.</div>`;
 if((room.last_damage??0)>0&&room.last_damaged!==null&&room.last_damaged!==undefined)return `<div class="combat-notice">⚡ ${esc(room.names[room.last_damaged])} förlorade ${room.last_damage} energi.</div>`;
 return '';
}
function game(myTurn){
 const mine=room.cards[room.seat],other=1-room.seat,done=['finished','abandoned','timeout','knockout'].includes(room.status);
 const heading=done?(room.winner===null?'Oavgjort!':room.winner===room.seat?'Du vann duellen!':`${esc(room.names[room.winner])} vann!`):myTurn?'Din tur att chansa.':`${esc(room.names[room.turn])} kastar.`;
 const upper=categories.slice(0,6),lower=categories.slice(6);
 const doneText=room.status==='knockout'?'Matchen avgjordes på knockout.':room.status==='abandoned'?'Duellen avslutades när en spelare lämnade.':room.status==='timeout'?'Matchen avslutades efter en timme utan nytt drag. Motståndaren vann på tidsgräns.':'Alla kast är gjorda. Tack för en god match!';
 return `<section class="game-view"><div class="game-utility-bar"><button id="restart-match" class="restart-match" ${busy?'disabled':''}>${done?'Till lobbyn':'Avsluta match'}</button></div><div class="duel-logo"><strong>YATZY</strong><span>DUELL</span><i>⚄ ⚂</i></div><section class="game-heading"><div><p class="eyebrow">DUELL / ${room.code}</p><h1>${heading}</h1><p>${done?doneText:myTurn?'Kasta tärningarna och välj var poängen gör mest nytta.':'Följ kasten live. Snart är det din tur.'}</p></div>${done?'<button id="home" class="secondary">Till dina matcher ↗</button>':`<div class="game-actions"><button id="back-matches" class="text-button">Dina matcher</button><button id="leave" class="text-button" ${busy?'disabled':''}>Lämna match</button></div>`}</section><div class="game-grid"><section class="table card"><div class="table-top"><span>${done?'SLUTRESULTAT':myTurn?'DITT KAST':'MOTSTÅNDARENS KAST'}</span><span>${room.rolls} / 3 KAST</span></div><div class="player-duel-cards">${room.names.map((name,i)=>`<div class="duel-player-card ${i===room.turn&&!done?'active':''} ${i===room.seat?'me':''}"><div class="fighter-portrait" aria-hidden="true">${avatarArt(roomAvatar(i))}</div><div class="duel-player-content"><div class="duel-player-top"><span>${i===room.seat?'♛ ':''}${esc(name)}${i===room.seat?' (du)':''}</span><strong>${totals(room.cards[i]).total}<small> poäng</small></strong></div>${energyBar(i)}</div></div>`).join('')}</div>${combatNotice()}<div class="dice-tray"><div class="dice-row">${room.dice.map((n,i)=>die(n,room.held[i],i,!myTurn||busy||room.rolls===0||room.rolls===3,rollingIndices.indexOf(i))).join('')}</div></div><p class="dice-help">${done?'Sugen på revansch? Starta en ny duell.':room.rolls===0?'Dags att låta tärningarna tala.':'Tryck på en tärning för att låsa eller låsa upp den.'}</p><button id="roll" class="primary roll" ${!myTurn||busy||room.rolls>=3||room.held.every(Boolean)?'disabled':''}>${room.rolls===0?'Kasta tärningarna':room.rolls===3?'Välj en kategori →':'Kasta igen'} <span>⚄</span></button><div class="score-summary compact-summary">${room.names.map((name,i)=>`<div class="${i===room.turn&&!done?'active':''}"><span>${esc(name)}${i===room.seat?' (du)':''}</span><strong>${totals(room.cards[i]).total}<small> poäng</small></strong><small>${Object.keys(room.cards[i]).length} av 15 kategorier</small></div>`).join('')}</div></section><section class="scorecard card"><div class="score-title"><h2>Protokollet</h2><span>15 KATEGORIER</span></div><div class="score-columns"><table>${scoreTableHead(other)}<tbody>${scoreRows(upper,mine,other,myTurn)}<tr class="bonus"><th>Summa övre</th><td>${totals(mine).upper}</td><td>${totals(room.cards[other]).upper}</td></tr><tr class="bonus"><th>Bonus <small>63 → +50</small></th><td>${totals(mine).bonus}</td><td>${totals(room.cards[other]).bonus}</td></tr></tbody></table><table>${scoreTableHead(other)}<tbody>${scoreRows(lower,mine,other,myTurn)}</tbody><tfoot><tr><th>Totalt</th><td>${totals(mine).total}</td><td>${totals(room.cards[other]).total}</td></tr></tfoot></table></div></section></div></section>`;
}
function apply(next){
 if(room&&next.id===room.id&&next.version<room.version)return;
 room=next;
 localStorage.setItem('yatzy.room',room.id);
 const i=matches.findIndex(m=>m.id===next.id);
 if(['waiting','playing'].includes(next.status)){if(i>=0)matches[i]=next;else matches.unshift(next);}
 else if(i>=0)matches.splice(i,1);
 render();
}
async function saveNameAndContinue(){
 const value=root.querySelector('#name')?.value.trim();
 if(!value)return;
 sessionStorage.setItem('yatzy.name',value);localStorage.setItem('yatzy.avatar',String(selectedAvatar));
 if(inviteCode){
  busy=true;message='Ansluter till rummet …';render();
  try{
   apply(await command('join',token,null,{name:value,code:inviteCode,avatar:selectedAvatar}));
   history.replaceState({},'',import.meta.env.BASE_URL);
   await watch();
  }catch(e){message=e.message;busy=false;render();return;}
  busy=false;render();
  return;
 }
 await refreshMatches();
 render();
}
function inviteUrl(code){const url=new URL(import.meta.env.BASE_URL,location.origin);url.searchParams.set('room',code);return url.toString();}
async function shareRoom(){
 if(!room||room.mode!=='private')return;
 const url=inviteUrl(room.code);
 const data={title:'Yatzyduell',text:'Häng med på en duell!',url};
 try{
  if(navigator.share){await navigator.share(data);inviteSent=true;message='Inbjudan skickad.';}
  else{await navigator.clipboard.writeText(url);inviteSent=true;message='Inbjudan kopierad.';}
 }catch(e){
  if(e?.name!=='AbortError'){
   try{await navigator.clipboard.writeText(url);inviteSent=true;message='Inbjudan kopierad.';}
   catch{message=url;}
  }
 }
 render();
}
async function createCodeRoom(){
 codeRoom=true;inviteSent=false;
 const name=playerName()||'Spelare';
 busy=true;message='Skapar kod …';render();
 try{
  apply(await command('create',token,null,{name,avatar:selectedAvatar}));
  await watch();
  message='';
 }catch(e){codeRoom=false;message=e.message;}
 finally{busy=false;render();}
}
async function createAndShare(){
 codeRoom=false;inviteSent=false;
 const name=playerName()||'Spelare';
 busy=true;message='Skapar en privat duell …';render();
 try{
  apply(await command('create',token,null,{name,avatar:selectedAvatar}));
  await watch();
  busy=false;render();
  await shareRoom();
 }catch(e){message=e.message;busy=false;render();}
}
async function enter(action){
 const name=playerName()||'Spelare',code=root.querySelector('#code')?.value.toUpperCase();
 busy=true;message='';render();
 try{codeRoom=false;apply(await command(action,token,null,{name,code,avatar:selectedAvatar}));if(action==='join'&&inviteCode){history.replaceState({},'',import.meta.env.BASE_URL);}await watch();}catch(e){message=e.message;}finally{busy=false;render();}
}
async function act(action,payload={}){
 if(busy)return;
 const rerolled=action==='roll'&&room?room.held.map((held,i)=>held?null:i).filter(i=>i!==null):[];
 busy=true;message='';render();
 try{
  const next=await command(action,token,room.id,{...payload,version:room.version});
  if(action==='roll'){
   rerolled.forEach(i=>{diceLanding[i]=randomLanding(i);});
   rollingIndices=rerolled.length?[rerolled[0]]:[];
   rollSequence+=1;
   rollView=rollingIndices.length?{index:rollingIndices[0]}:null;
   rollAnimationPending=Boolean(rollView);
   clearTimeout(rollAnimationTimer);
   apply(next);
   rollAnimationTimer=setTimeout(()=>{
    if(rollView){rollView=null;rollingIndices=[];render();}
   },6500);
  }else{
   apply(next);
  }
  if(action==='leave'){cleanup();room=null;codeRoom=false;localStorage.removeItem('yatzy.room');await refreshMatches();}
 }
 catch(e){rollingIndices=[];rollAnimationPending=false;rollView=null;message=e.message;await refresh();}finally{busy=false;render();}
}
async function refresh(){
 if(!room||refreshBusy)return;const id=room.id;refreshBusy=true;
 try{const state=await command('get',token,id);if(room?.id===id){connection=local?'Lokal duell':'Ansluten';if(recoveringRoom){recoveringRoom=false;busy=false;}apply(state);}}
 catch(e){connection='Anslutningen bröts – försöker igen';if(/finns inte|gått ut|spelarnyckel/.test(e.message)){cleanup();room=null;recoveringRoom=false;busy=false;localStorage.removeItem('yatzy.room');message=e.message;}render();}
 finally{refreshBusy=false;}
}
function cleanup(){unsubscribe();clearInterval(timer);}
async function refreshMatches(){
 if(!configured||!token||!playerName()||matchesLoading)return;
 matchesLoading=true;
 try{matches=await command('list',token,null);message=message==='Kunde inte hämta dina matcher.'?'':message;}
 catch{if(!room)message='Kunde inte hämta dina matcher.';}
 finally{matchesLoading=false;if(!room)render();}
}
async function openMatch(id){
 if(busy)return;
 busy=true;message='';
 try{
  cleanup();
  const state=await command('get',token,id);
  room=state;codeRoom=state.status==='waiting'&&state.mode==='private';localStorage.setItem('yatzy.room',id);
  await watch();
 }catch(e){message=e.message;room=null;await refreshMatches();}
 finally{busy=false;render();}
}
async function endMatchAndLobby(){
 if(busy)return;
 if(room?.status==='playing'&&!confirm('Avsluta matchen? Motståndaren vinner den pågående matchen.'))return;
 busy=true;message='';render();
 try{
  if(room&&['waiting','playing'].includes(room.status)){
   await command('leave',token,room.id,{version:room.version});
  }
 }catch(e){
  console.warn('Kunde inte lämna matchen på servern:',e);
 }
 cleanup();
 room=null;codeRoom=false;inviteSent=false;friends=false;subview=null;rollingIndices=[];
 localStorage.removeItem('yatzy.room');
 history.replaceState({},'',import.meta.env.BASE_URL);
 busy=false;
 await refreshMatches();
 render();
}
async function enterApp(){
 if(busy)return;
 started=true;
 message='';
 render();

 // Within the same browser/app session, keep the chosen name/profile and resume
 // an active duel only after the player has pressed Start.
 const saved=localStorage.getItem('yatzy.room');
 if(!configured||!token)return;

 if(inviteCode&&playerName()){
  busy=true;message='Ansluter till rummet …';render();
  try{
   apply(await command('join',token,null,{name:playerName(),code:inviteCode,avatar:selectedAvatar}));
   history.replaceState({},'',import.meta.env.BASE_URL);
   await watch();
   message='';
  }catch(e){
   message=e.message;
   await refreshMatches();
  }finally{
   busy=false;
   render();
  }
  return;
 }

 if(saved&&playerName()){
  busy=true;message='Återansluter till din duell …';render();
  try{
   room=await command('get',token,saved);
   message='';
   await watch();
  }catch{
   room=null;
   localStorage.removeItem('yatzy.room');
   message='';
   await refreshMatches();
  }finally{
   busy=false;
   render();
  }
  return;
 }

 if(playerName())await refreshMatches();
}
async function closeRoom(){
 cleanup();room=null;codeRoom=false;inviteSent=false;rollingIndices=[];localStorage.removeItem('yatzy.room');message='';
 await refreshMatches();render();
}
async function watch(){cleanup();unsubscribe=await subscribe(room.id,token,refresh,status=>{connection=status;render();});timer=setInterval(refresh,local?700:5000);await refresh();}
async function startOnlinePresence(){
 presenceUnsubscribe();
 presenceUnsubscribe=()=>{};
 if(!configured||!token)return;
 try{
  presenceUnsubscribe=await subscribeOnlinePresence(token,count=>{
   if(count!==onlineCount){onlineCount=count;render();}
  });
 }catch{
  onlineCount=local?1:0;
 }
}
window.addEventListener('online',()=>{if(room)refresh();else refreshMatches();});document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(room)refresh();else refreshMatches();}});matchesTimer=setInterval(()=>{if(!room&&started&&playerName())refreshMatches();},30000);
render();
void startOnlinePresence();
if(room&&recoveringRoom&&configured&&token){
 void watch();
}else if(savedView&&started&&playerName()){
 void refreshMatches();
}
