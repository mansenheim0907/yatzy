import './style.css';
import {categories,score,totals} from './rules.js';
import {configured,local,identity,command,subscribe} from './api.js';
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
let room=null,matches=[],matchesLoading=false,busy=false,message='',friends=false,inviteSent=false,codeRoom=false,started=false,subview=null,connection=local?'Lokal duell':'Ansluter …',unsubscribe=()=>{},timer,matchesTimer,refreshBusy=false,rollingIndices=[],rollAnimationTimer;
let diceLanding=[{x:-4,y:5,rz:-7,rx:-11,ry:7},{x:2,y:-4,rz:5,rx:-8,ry:-8},{x:-2,y:7,rz:-3,rx:-12,ry:4},{x:4,y:-6,rz:7,rx:-9,ry:-6},{x:-1,y:3,rz:-5,rx:-11,ry:8}];
let selectedAvatar=Math.max(0,Math.min(19,Number(localStorage.getItem('yatzy.avatar')??0)));
let token;try{token=identity();}catch{message='Tillåt lokal lagring i webbläsaren för att kunna spela och återansluta.';}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dots={1:[5],2:[1,9],3:[1,5,9],4:[1,3,7,9],5:[1,3,5,7,9],6:[1,3,4,6,7,9]};
const avatarProfiles=[
 ['#d8a27d','#141414','#17211f','buzz','shades','beard'],
 ['#d39a78','#2b1716','#161b1a','bun','hoop','none'],
 ['#c98d67','#6f5a4b','#1e2623','messy','none','stubble'],
 ['#e2b08a','#c98f52','#25201b','waves','none','none'],
 ['#c98f69','#181716','#161c1a','cap','none','stubble'],
 ['#b97756','#2b1718','#161817','long','tattoo','none'],
 ['#c58d69','#b7b2aa','#18201d','crop','shades','beard'],
 ['#d08f73','#d01f66','#17191a','mohawk','piercing','none'],
 ['#cc916c','#3b271d','#21201c','messy','none','stubble'],
 ['#e0aa82','#d3a86a','#161918','beanie','none','none'],
 ['#c89270','#5a3b25','#253321','curly','none','none'],
 ['#dd9b76','#b73522','#1e2b22','waves','none','none'],
 ['#b87354','#191817','#171a18','fade','tattoo','beard'],
 ['#d49a75','#211817','#171918','bun','hoop','none'],
 ['#c58c67','#b78b55','#171817','capback','shades','stubble'],
 ['#d59a76','#3a2520','#171918','bob','piercing','none'],
 ['#c38a68','#77706b','#291a17','side','none','stubble'],
 ['#dda77f','#c89255','#17211e','bun','none','none'],
 ['#c99573','#39291f','#20201f','messy','glasses','stubble'],
 ['#d8a17f','#3a1f1c','#211b1a','long','none','none']
];
function avatarArt(id){
 const i=Math.max(0,Math.min(19,Number(id)||0));
 const [skin,hair,jacket,hairType,accessory,beard]=avatarProfiles[i];
 const flip=[1,4,5,8,9,13,17].includes(i);
 const faceRx=[27,25,28,25,26][i%5], faceRy=[31,30,32,29,31][i%5];
 const eyeY=48+(i%3-1)*1.5;
 const hairSvg={
  buzz:`<path d="M37 39c5-15 36-18 48-2-13-6-34-5-48 2Z" fill="${hair}"/>`,
  bun:`<circle cx="70" cy="24" r="14" fill="${hair}"/><path d="M32 43c7-21 49-22 57 1-10-8-44-9-57-1Z" fill="${hair}"/>`,
  messy:`<path d="M28 45c3-9 10-18 18-20l4 7 7-12 7 11 9-9 4 10 11-4-2 17c-14-9-43-10-58 0Z" fill="${hair}"/>`,
  waves:`<path d="M27 43c7-23 50-25 62-3-9-4-11-13-17-13-2 7-7 9-13 3-4 8-10 8-15 2-4 5-9 8-17 11Z" fill="${hair}"/>`,
  cap:`<path d="M31 37c7-16 39-19 53-5l-3 10c-15-8-35-8-50-1Z" fill="#161b22"/><path d="M78 39c11-1 17 2 20 7-10 1-19 0-26-2Z" fill="#11151a"/>`,
  long:`<path d="M25 43c5-26 54-28 64-1l3 42-15-2 1-35c-13-10-29-9-41 0l1 35-15 2Z" fill="${hair}"/>`,
  crop:`<path d="M30 41c8-17 43-20 55-3-14-4-37-3-55 3Z" fill="${hair}"/>`,
  mohawk:`<path d="M51 38 58 10l8 19 10-14 3 25c-11-5-19-6-28-2Z" fill="${hair}"/>`,
  beanie:`<path d="M30 38c5-18 45-22 56-3l-1 13H31Z" fill="#17191c"/><path d="M31 44h54v8H31Z" fill="#111316"/>`,
  curly:`<g fill="${hair}"><circle cx="38" cy="33" r="10"/><circle cx="51" cy="27" r="11"/><circle cx="65" cy="28" r="11"/><circle cx="78" cy="35" r="10"/></g>`,
  fade:`<path d="M34 40c10-18 39-19 49-2-14-5-33-4-49 2Z" fill="${hair}"/><path d="M35 41c0 10-2 18-5 25" stroke="#34231d" stroke-width="5"/>`,
  capback:`<path d="M29 38c8-17 40-20 55-5l-2 10c-15-7-35-8-53-2Z" fill="#191b20"/><path d="M35 34 22 39l12 5Z" fill="#121419"/>`,
  bob:`<path d="M28 42c7-23 48-24 60-4l-4 39-12-4 3-29c-10-9-27-9-37 0l3 29-13 4Z" fill="${hair}"/>`,
  side:`<path d="M27 43c8-23 52-23 61-4-18-9-34-8-47-2-5 2-9 4-14 6Z" fill="${hair}"/>`
 }[hairType]||'';
 const beardSvg=beard==='beard'? `<path d="M42 65c7 18 28 20 36 0-3 24-31 27-36 0Z" fill="${hair}" opacity=".95"/>` :
 beard==='stubble'? `<path d="M42 66c8 13 26 15 35 0-6 16-28 18-35 0Z" fill="${hair}" opacity=".48"/>`:'';
 const accSvg=accessory==='shades'? `<g fill="#111"><rect x="35" y="47" width="18" height="9" rx="3"/><rect x="65" y="47" width="18" height="9" rx="3"/><rect x="52" y="50" width="14" height="2"/></g>` :
 accessory==='glasses'? `<g fill="none" stroke="#151515" stroke-width="2"><rect x="35" y="47" width="18" height="10" rx="4"/><rect x="65" y="47" width="18" height="10" rx="4"/><path d="M53 51h12"/></g>` :
 accessory==='hoop'? `<circle cx="83" cy="65" r="5" fill="none" stroke="#c59a45" stroke-width="2"/>` :
 accessory==='piercing'? `<circle cx="80" cy="58" r="2.5" fill="#b6b9bd"/>` :
 accessory==='tattoo'? `<path d="M28 72c8 2 11 8 15 14M30 77c5-3 10-3 14 0" fill="none" stroke="#263430" stroke-width="2"/>`:'';
 const scar=[0,6,12].includes(i)?'<path d="M72 39l-5 10" stroke="#8f4e46" stroke-width="2"/>':'';
 const svg=`<svg class="avatar-svg" viewBox="0 0 112 112" aria-hidden="true">
 <defs><linearGradient id="bg${i}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#efe0bd"/><stop offset="1" stop-color="#c9a56b"/></linearGradient></defs>
 <rect width="112" height="112" rx="16" fill="url(#bg${i})"/>
 <g ${flip?'transform="translate(112 0) scale(-1 1)"':''}>
 <path d="M18 112c6-24 20-35 38-35s34 11 40 35Z" fill="${jacket}"/>
 <ellipse cx="56" cy="54" rx="${faceRx}" ry="${faceRy}" fill="${skin}"/>
 ${hairSvg}
 ${scar}
 <g stroke="#2a211d" stroke-width="2.3" stroke-linecap="round">
   <path d="M39 ${eyeY}l10-1"/><path d="M64 ${eyeY-1}l10 1"/>
 </g>
 <circle cx="45" cy="${eyeY}" r="1.6" fill="#111"/><circle cx="69" cy="${eyeY}" r="1.6" fill="#111"/>
 <path d="M56 51c-2 7-3 11 2 13" fill="none" stroke="#a66b50" stroke-width="2" stroke-linecap="round"/>
 <path d="M47 69c6 ${i%4===0?'-2':'2'} 14 ${i%4===0?'-2':'2'} 20 0" fill="none" stroke="#7d423b" stroke-width="2.3" stroke-linecap="round"/>
 ${beardSvg}${accSvg}
 </g></svg>`;
 return svg;
}
function avatarPicker(){
 return `<div class="avatar-picker"><h3>Välj din profil</h3><div class="avatar-grid mixed">${Array.from({length:20},(_,i)=>`<button type="button" class="avatar-choice ${selectedAvatar===i?'selected':''}" data-avatar="${i}" aria-label="Profil ${i+1}">${avatarArt(i)}</button>`).join('')}</div></div>`;
}
function roomAvatar(i){return room?.avatars?.[i]??(i?10:0);}

function randomLanding(index){
 const jitter=(min,max)=>Math.round(min+Math.random()*(max-min));
 return {x:jitter(-5,5),y:jitter(-9,9),rz:jitter(-10,10),rx:jitter(-14,-6),ry:jitter(-10,10),throwX:(index-2)*18+jitter(-12,12)};
}
function die(n,held=false,index=null,disabled=false,rollOrder=-1){
 const rolling=rollOrder>=0,p=index===null?null:diceLanding[index];
 const style=p?`style="--tx:${p.x}px;--ty:${p.y}px;--rz:${p.rz}deg;--rx:${p.rx}deg;--ry:${p.ry}deg;--throw-x:${p.throwX??0}px;--roll-order:${Math.max(0,rollOrder)}"`:'';
 return `<button class="die ${held?'held':''} ${rolling?'rolling':''}" ${style} ${index===null?'tabindex="-1" aria-hidden="true"':`data-die="${index}" aria-label="Tärning ${index+1}: ${n}${held?', låst':''}" aria-pressed="${held}"`} ${disabled?'disabled':''}>${Array.from({length:9},(_,i)=>`<i class="${dots[n].includes(i+1)?'pip':''}"></i>`).join('')}${index!==null?`<span>${held?'LÅST':' '}</span>`:''}</button>`;
}
function render(){
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
function nameStep(){return `<section class="lobby-screen"><section class="lobby tavern-menu name-step"><button id="back-start" class="view-back" type="button" aria-label="Tillbaka till startsidan">‹ Tillbaka</button><div class="menu-crest" aria-hidden="true"><span>⚄</span><i></i><span>⚂</span></div><h2>Vad heter du?</h2><div class="menu-rule" aria-hidden="true"><span>◆</span></div>${inviteCode?'<p class="invite-note">Du har fått en matchlänk. Ange ditt namn så ansluter du direkt till rummet.</p>':'<p class="name-note">Namnet används under den här sessionen.</p>'}<form id="name-form"><input id="name" maxlength="20" autocomplete="nickname" placeholder="Ditt spelarnamn" autofocus required>${avatarPicker()}<button class="primary menu-primary">Fortsätt <span>›</span></button></form></section></section>`;}
function lobby(){const pending=matches.filter(m=>m.status==='playing'&&m.turn===m.seat).length;return `<section class="lobby-screen"><section class="lobby tavern-menu"><div class="lobby-profile" aria-label="Vald profil">${avatarArt(selectedAvatar)}</div><h2>Din nästa duell<br>börjar här.</h2><div class="menu-rule" aria-hidden="true"><span>◆</span></div><p class="session-name">Spelar som <strong>${esc(playerName())}</strong></p>${matchList(pending)}<button id="find" class="primary menu-primary" ${!configured||busy||!token?'disabled':''}><span>Hitta motståndare</span><span>›</span></button><div class="divider"><span>ELLER</span></div><button id="friends" class="secondary menu-secondary" ${!configured||busy||!token?'disabled':''}><span class="friends-icon" aria-hidden="true">●●</span><span>Spela mot en vän</span><span>›</span></button>${friends?`<div class="friend-panel"><button id="back-lobby" class="view-back inline-back" type="button">‹ Tillbaka</button><button id="create" class="primary" ${busy?'disabled':''}>Skapa rum</button><form id="join-form"><label for="code">Har du en rumskod?</label><div class="join"><input id="code" aria-label="Rumskod" placeholder="ABCDE" pattern="[A-Za-z0-9]{5}" maxlength="5" minlength="5" required autocomplete="off"><button ${busy?'disabled':''}>Anslut</button></div></form></div>`:''}<button id="share" class="secondary share-link" ${!configured||busy||!token?'disabled':''}><span class="share-icon" aria-hidden="true">↗</span><span><strong>Dela länk</strong><small>Bjud in en vän via länk till en duell</small></span><span>›</span></button><div class="menu-bottom"><button type="button" id="howto" class="menu-link"><span aria-hidden="true">▤</span>Så spelar du<b>›</b></button><button type="button" id="history" class="menu-link"><span aria-hidden="true">◷</span>Historik<b>›</b></button></div>${!configured?'<p class="setup">Online behöver kopplas till Supabase. Starta med <code>npm run dev:local</code> för att testa en lokal duell med två spelare.</p>':''}${local?'<p class="local-note">Lokal testmiljö · öppna även ett privat webbläsarfönster för spelare två.</p>':''}</section></section>`;}
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
   rollingIndices=rerolled;
   clearTimeout(rollAnimationTimer);
   rollAnimationTimer=setTimeout(()=>{rollingIndices=[];render();},1650);
  }
  apply(next);
  if(action==='leave'){cleanup();room=null;codeRoom=false;localStorage.removeItem('yatzy.room');await refreshMatches();}
 }
 catch(e){rollingIndices=[];message=e.message;await refresh();}finally{busy=false;render();}
}
async function refresh(){
 if(!room||refreshBusy)return;const id=room.id;refreshBusy=true;
 try{const state=await command('get',token,id);if(room?.id===id){connection=local?'Lokal duell':'Ansluten';apply(state);}}
 catch(e){connection='Anslutningen bröts – försöker igen';if(/finns inte|gått ut|spelarnyckel/.test(e.message)){cleanup();room=null;localStorage.removeItem('yatzy.room');message=e.message;}render();}
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
window.addEventListener('online',()=>{if(room)refresh();else refreshMatches();});document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(room)refresh();else refreshMatches();}});matchesTimer=setInterval(()=>{if(!room&&started&&playerName())refreshMatches();},30000);
render();
