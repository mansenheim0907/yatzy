import {createClient} from '@supabase/supabase-js';
export const local=import.meta.env.VITE_LOCAL_DUEL===true;
const url=import.meta.env.VITE_SUPABASE_URL, key=import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured=local||Boolean(url&&key);
const sb=!local&&configured?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}):null;
export function identity(){
 let token=localStorage.getItem('yatzy.token');
 if(!/^[a-f0-9]{64}$/.test(token||'')){
  token=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
  localStorage.setItem('yatzy.token',token);
 }
 return token;
}
export async function command(action,token,room,payload={}){
 const args={p_action:action,p_token:token,p_room:room??null,p_payload:payload};
 const result=local?await fetch('/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(10000)}).then(r=>r.json()):await sb.rpc('yatzy_command',args).abortSignal(AbortSignal.timeout(10000));
 if(result.error) throw Error(result.error.message);
 return result.data;
}
export async function subscribe(room,token,onChange,onStatus){
 if(local){onStatus('Lokal duell');return ()=>{};}
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),n=>n.toString(16).padStart(2,'0')).join('');
 await sb.realtime.setAuth();
 const channel=sb.channel(`yatzy:${room}:${digest}`,{config:{private:true}}).on('broadcast',{event:'room_changed'},onChange);
 await new Promise(resolve=>{
  let settled=false;
  const ready=()=>{if(!settled){settled=true;clearTimeout(timeout);resolve();}};
  const timeout=setTimeout(ready,4000);
  channel.subscribe((status,error)=>{
   onStatus(status==='SUBSCRIBED'?'Live':error?.message||'Återansluter …');
   if(status==='SUBSCRIBED'){onChange();ready();}
   else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status))ready();
  });
 });
 return ()=>{void sb.removeChannel(channel);};
}


export async function subscribeOnlinePresence(token,onCount){
 if(local){onCount(1);return ()=>{};}
 if(!sb){onCount(0);return ()=>{};}
 const presenceKey=token.slice(0,24);
 const channel=sb.channel('yatzy:online',{config:{presence:{key:presenceKey}}});
 const update=()=>{
  const state=channel.presenceState();
  const count=Object.values(state).reduce((sum,entries)=>sum+(Array.isArray(entries)?entries.length:0),0);
  onCount(count);
 };
 channel.on('presence',{event:'sync'},update);
 channel.on('presence',{event:'join'},update);
 channel.on('presence',{event:'leave'},update);
 channel.subscribe(async status=>{
  if(status==='SUBSCRIBED'){
   await channel.track({online_at:new Date().toISOString()});
   update();
  }
 });
 return ()=>{
  void channel.untrack().finally(()=>sb.removeChannel(channel));
 };
}
