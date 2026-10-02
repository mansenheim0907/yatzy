import './style.css';
import {categories,score,totals} from './rules.js';
import {configured,local,identity,command,subscribe} from './api.js';
const root=document.querySelector('#app');
const inviteParam=new URLSearchParams(location.search).get('room');
const inviteCode=/^[A-Za-z0-9]{5}$/.test(inviteParam||'')?inviteParam.toUpperCase():'';
let room=null,busy=false,message='',friends=Boolean(inviteCode),started=Boolean(inviteCode),connection=local?'Lokal duell':'Ansluter …',unsubscribe=()=>{},timer,refreshBusy=false;
let token;try{token=identity();}catch{message='Tillåt lokal lagring i webbläsaren för att kunna spela och återansluta.';}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dots={1:[5],2:[1,9],3:[1,5,9],4:[1,3,7,9],5:[1,3,5,7,9],6:[1,3,4,6,7,9]};
function die(n,held=false,index=null,disabled=false){return `<button class="die ${held?'held':''}" ${index===null?'tabindex="-1" aria-hidden="true"':`data-die="${index}" aria-label="Tärning ${index+1}: ${n}${held?', låst':''}" aria-pressed="${held}"`} ${disabled?'disabled':''}>${Array.from({length:9},(_,i)=>`<i class="${dots[n].includes(i+1)?'pip':''}"></i>`).join('')}${index!==null?`<span>${held?'LÅST':' '}</span>`:''}</button>`;}
function render(){
 const playing=room&&room.status!=='waiting', myTurn=room?.turn===room?.seat&&room?.status==='playing';
 root.innerHTML=`<header><a href="${import.meta.env.BASE_URL}" aria-label="Yatzy startsida" id="brand"><span class="brand-icon">⚄</span> yatzy<span class="brand-dot">.</span></a><span class="edition">BARA DUELLER. ALLTID TVÅ.</span><span class="connection"><i></i>${room?esc(connection):'EN DUELL TILL'}</span></header><main>${!room?home():playing?game(myTurn):waiting()}</main><div class="message" role="status" aria-live="polite">${esc(message)}</div><footer><span>FEM TÄRNINGAR. TVÅ SPELARE.</span><span>Lite tur. Mycket magkänsla.</span></footer>`;
 root.querySelector('#brand').onclick=e=>{if(room){e.preventDefault();message='Din match är kvar. Använd Lämna match för att avsluta.';render();}};
 bind('#start',()=>{started=true;render();});
 bind('#friends',()=>{friends=!friends;render();});
 bind('#howto',()=>{message='Tre kast per tur. Lås tärningar mellan kasten och välj sedan en ledig kategori.';render();});
 bind('#history',()=>{message='Historik kommer i nästa steg.';render();});
 bind('#create',()=>enter('create'));bind('#find',()=>enter('find'));
 bind('#share',()=>createAndShare());bind('#share-room',()=>shareRoom());
 root.querySelector('#join-form')?.addEventListener('submit',e=>{e.preventDefault();enter('join');});
 bind('#roll',()=>act('roll'));bind('#leave',()=>{if(room.status==='waiting'||confirm('Lämna duellen? Om matchen har börjat vinner motståndaren.'))act('leave');});
 bind('#home',()=>{cleanup();room=null;localStorage.removeItem('yatzy.room');message='';render();});
 root.querySelectorAll('[data-die]').forEach(el=>el.onclick=()=>act('hold',{index:Number(el.dataset.die)}));
 root.querySelectorAll('[data-score]').forEach(el=>el.onclick=()=>{const category=el.dataset.score,points=score(category,room.dice);if(points!==0||confirm('Stryk kategorin och få 0 poäng?'))act('score',{category});});
 bind('#copy',async()=>{try{await navigator.clipboard.writeText(room.code);message='Rumskoden är kopierad.';}catch{message=`Din rumskod är ${room.code}.`;}render();});
 root.querySelector('#name')?.addEventListener('input',e=>localStorage.setItem('yatzy.name',e.target.value));
}
function bind(selector,fn){const el=root.querySelector(selector);if(el)el.onclick=fn;}
function home(){return started?lobby():splash();}
function splash(){return `<section class="splash splash-art"><button id="start" class="start-hotspot" aria-label="Starta"></button></section>`;}
function lobby(){return `<section class="lobby-screen"><section class="lobby tavern-menu"><div class="menu-crest" aria-hidden="true"><span>⚄</span><i></i><span>⚂</span></div><h2>Din nästa duell<br>börjar här.</h2><div class="menu-rule" aria-hidden="true"><span>◆</span></div>${inviteCode?'<p class="invite-note">Du har fått en matchlänk. Skriv ditt namn och anslut.</p>':''}<label for="name">Vad heter du?</label><input id="name" maxlength="20" autocomplete="nickname" placeholder="Ditt spelarnamn" value="${esc(localStorage.getItem('yatzy.name')||'')}"><button id="find" class="primary menu-primary" ${!configured||busy||!token?'disabled':''}><span>Hitta motståndare</span><span>›</span></button><div class="divider"><span>ELLER</span></div><button id="friends" class="secondary menu-secondary" ${!configured||busy||!token?'disabled':''}><span class="friends-icon" aria-hidden="true">●●</span><span>Spela mot en vän</span><span>›</span></button>${friends?`<div class="friend-panel"><button id="create" class="primary" ${busy?'disabled':''}>Skapa rum</button><form id="join-form"><label for="code">Har du en rumskod?</label><div class="join"><input id="code" aria-label="Rumskod" placeholder="ABCDE" pattern="[A-Za-z0-9]{5}" maxlength="5" minlength="5" required autocomplete="off" value="${esc(inviteCode)}"><button ${busy?'disabled':''}>Anslut</button></div></form></div>`:''}<button id="share" class="secondary share-link" ${!configured||busy||!token?'disabled':''}><span class="share-icon" aria-hidden="true">↗</span><span><strong>Dela länk</strong><small>Bjud in en vän via länk till en duell</small></span><span>›</span></button><div class="menu-bottom"><button type="button" id="howto" class="menu-link"><span aria-hidden="true">▤</span>Så spelar du<b>›</b></button><button type="button" id="history" class="menu-link"><span aria-hidden="true">◷</span>Historik<b>›</b></button></div>${!configured?'<p class="setup">Online behöver kopplas till Supabase. Starta med <code>npm run dev:local</code> för att testa en lokal duell med två spelare.</p>':''}${local?'<p class="local-note">Lokal testmiljö · öppna även ett privat webbläsarfönster för spelare två.</p>':''}</section></section>`;}
function waiting(){return `<section class="waiting card"><p class="eyebrow">${room.mode==='online'?'MATCHMAKING':'DIN PRIVATA DUELL'}</p><div class="waiting-die">${die(5)}</div><h1>${room.mode==='online'?'Letar efter<br>din motståndare.':'En plats kvar.<br>Bjud in en vän.'}</h1><p>${room.mode==='online'?'Matchen börjar så snart ni är två.':'Dela länken eller be din vän ange rumskoden.'}</p>${room.mode==='private'?`<button id="copy" class="room-code" aria-label="Kopiera rumskod ${room.code}">${room.code}<small>KOPIERA RUMSKOD</small></button><button id="share-room" class="primary waiting-share">Dela matchlänk <span>↗</span></button>`:'<div class="pulse">● ● ●</div>'}<button id="leave" class="text-button" ${busy?'disabled':''}>Avbryt</button></section>`;}
function game(myTurn){
 const mine=room.cards[room.seat],other=1-room.seat,done=['finished','abandoned'].includes(room.status);
 const heading=done?(room.winner===null?'Oavgjort!':room.winner===room.seat?'Du vann duellen!':`${esc(room.names[room.winner])} vann!`):myTurn?'Din tur att chansa.':`${esc(room.names[room.turn])} kastar.`;
 return `<section class="game-heading"><div><p class="eyebrow">DUELL / ${room.code}</p><h1>${heading}</h1><p>${done?(room.status==='abandoned'?'Duellen avslutades när en spelare lämnade.':'Alla kast är gjorda. Tack för en god match!'):myTurn?'Kasta tärningarna och välj var poängen gör mest nytta.':'Följ kasten live. Snart är det din tur.'}</p></div>${done?'<button id="home" class="secondary">Spela en ny duell ↗</button>':`<button id="leave" class="text-button" ${busy?'disabled':''}>Lämna match</button>`}</section><div class="game-grid"><section class="table card"><div class="table-top"><span>${done?'SLUTRESULTAT':myTurn?'DITT KAST':'MOTSTÅNDARENS KAST'}</span><span>${room.rolls} / 3 KAST</span></div><div class="dice-row">${room.dice.map((n,i)=>die(n,room.held[i],i,!myTurn||busy||room.rolls===0||room.rolls===3)).join('')}</div><p class="dice-help">${done?'Sugen på revansch? Starta en ny duell.':room.rolls===0?'Dags att låta tärningarna tala.':'Tryck på en tärning för att låsa eller låsa upp den.'}</p><button id="roll" class="primary roll" ${!myTurn||busy||room.rolls>=3||room.held.every(Boolean)?'disabled':''}>${room.rolls===0?'Kasta tärningarna':room.rolls===3?'Välj en kategori →':'Kasta igen'} <span>⚄</span></button><div class="score-summary">${room.names.map((name,i)=>`<div class="${i===room.turn&&!done?'active':''}"><span>${esc(name)}${i===room.seat?' (du)':''}</span><strong>${totals(room.cards[i]).total}<small> poäng</small></strong><small>${Object.keys(room.cards[i]).length} av 15 kategorier</small></div>`).join('')}</div><details><summary>Så räknas poängen</summary><p>Bonus: 50 poäng vid minst 63 på Ettor–Sexor. Yatzy: 50. Liten stege: 15. Stor stege: 20. Par, tretal och fyrtal ger summan av gruppen. Två par måste ha olika värden. Kåk kräver ett tretal och ett annat par. Du kan stryka en kategori för 0 poäng.</p></details></section><section class="scorecard card"><div class="score-title"><h2>Protokollet</h2><span>15 KATEGORIER</span></div><table><thead><tr><th>Kategori</th><th>${esc(room.names[room.seat])}<small>DU</small></th><th>${esc(room.names[other])}</th></tr></thead><tbody>${categories.map(([key,label],i)=>`${i===6?`<tr class="bonus"><th>Summa övre</th><td>${totals(mine).upper}</td><td>${totals(room.cards[other]).upper}</td></tr><tr class="bonus"><th>Bonus <small>63 → +50</small></th><td>${totals(mine).bonus}</td><td>${totals(room.cards[other]).bonus}</td></tr>`:''}<tr><th>${label}</th><td>${mine[key]!==undefined?`<b>${mine[key]}</b>`:myTurn&&room.rolls>0?`<button data-score="${key}" aria-label="Välj ${label}, ${score(key,room.dice)} poäng" ${busy?'disabled':''}>${score(key,room.dice)} <span>＋</span></button>`:'<span class="empty">—</span>'}</td><td>${room.cards[other][key]??'<span class="empty">—</span>'}</td></tr>`).join('')}</tbody><tfoot><tr><th>Totalt</th><td>${totals(mine).total}</td><td>${totals(room.cards[other]).total}</td></tr></tfoot></table></section></div>`;
}
function apply(next){if(room&&next.id===room.id&&next.version<room.version)return;room=next;localStorage.setItem('yatzy.room',room.id);render();}
function inviteUrl(code){const url=new URL(import.meta.env.BASE_URL,location.origin);url.searchParams.set('room',code);return url.toString();}
async function shareRoom(){
 if(!room||room.mode!=='private')return;
 const url=inviteUrl(room.code);
 const data={title:'Yatzyduell',text:'Häng med på en duell!',url};
 try{
  if(navigator.share){await navigator.share(data);message='Inbjudan klar att dela.';}
  else{await navigator.clipboard.writeText(url);message='Matchlänken är kopierad.';}
 }catch(e){
  if(e?.name!=='AbortError'){
   try{await navigator.clipboard.writeText(url);message='Matchlänken är kopierad.';}
   catch{message=url;}
  }
 }
 render();
}
async function createAndShare(){
 const name=root.querySelector('#name')?.value.trim()||'Spelare';
 busy=true;message='Skapar en privat duell …';render();
 try{
  apply(await command('create',token,null,{name}));
  await watch();
  busy=false;render();
  await shareRoom();
 }catch(e){message=e.message;busy=false;render();}
}
async function enter(action){
 const name=root.querySelector('#name').value.trim()||'Spelare',code=root.querySelector('#code')?.value.toUpperCase();
 busy=true;message='';render();
 try{apply(await command(action,token,null,{name,code}));if(action==='join'&&inviteCode){history.replaceState({},'',import.meta.env.BASE_URL);}await watch();}catch(e){message=e.message;}finally{busy=false;render();}
}
async function act(action,payload={}){
 if(busy)return;busy=true;message='';render();
 try{apply(await command(action,token,room.id,{...payload,version:room.version}));if(action==='leave'){cleanup();room=null;localStorage.removeItem('yatzy.room');}}
 catch(e){message=e.message;await refresh();}finally{busy=false;render();}
}
async function refresh(){
 if(!room||refreshBusy)return;const id=room.id;refreshBusy=true;
 try{const state=await command('get',token,id);if(room?.id===id){connection=local?'Lokal duell':'Ansluten';apply(state);}}
 catch(e){connection='Anslutningen bröts – försöker igen';if(/finns inte|gått ut|spelarnyckel/.test(e.message)){cleanup();room=null;localStorage.removeItem('yatzy.room');message=e.message;}render();}
 finally{refreshBusy=false;}
}
function cleanup(){unsubscribe();clearInterval(timer);}
async function watch(){cleanup();unsubscribe=await subscribe(room.id,token,refresh,status=>{connection=status;render();});timer=setInterval(refresh,local?700:5000);await refresh();}
window.addEventListener('online',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
render();
const saved=localStorage.getItem('yatzy.room');
if(saved&&configured&&token){busy=true;message='Återansluter till din duell …';render();try{room=await command('get',token,saved);message='';await watch();}catch(e){message=`Kunde inte återansluta: ${e.message}. Ladda om för att försöka igen.`;}finally{busy=false;render();}}
