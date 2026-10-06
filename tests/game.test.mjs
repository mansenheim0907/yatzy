import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {database,command} from '../scripts/database.mjs';
import {categories,score,totals} from '../src/rules.js';
let db;before(async()=>{db=await database();});after(async()=>{await db.close();});
const token=()=>randomBytes(32).toString('hex');
const call=(action,t,r=null,p={})=>command(db,{p_action:action,p_token:t,p_room:r?.id,p_payload:{version:r?.version,...p}});
async function pair(mode='create'){const a=token(),b=token();const wait=await call(mode,a,null,{name:'Ada'});const room=await call(mode==='find'?'find':'join',b,null,{name:'Bo',code:wait.code});return {a,b,room,wait};}
test('klassiska poäng, inklusive distinkta par och kåk',()=>{
 const cases=[['ones',[1,1,3,4,5],2],['pair',[6,6,2,2,2],12],['two_pairs',[6,6,6,6,1],0],['two_pairs',[6,6,2,2,2],16],['three',[5,5,5,5,2],15],['four',[4,4,4,4,1],16],['small',[5,3,1,2,4],15],['large',[6,5,4,3,2],20],['house',[2,2,6,6,6],22],['house',[6,6,6,6,6],0],['chance',[1,2,3,4,5],15],['yatzy',[6,6,6,6,6],50]];
 for(const [key,dice,expected] of cases)assert.equal(score(key,dice),expected);
 assert.equal(totals({ones:3,twos:6,threes:9,fours:12,fives:15,sixes:18}).total,113);
 assert.equal(totals({sixes:30,fives:25,fours:7}).bonus,0);
});
test('SQL och klient räknar lika för alla 252 tärningskombinationer',async()=>{
 const rows=(await db.query(`select array[a,b,c,d,e] dice from generate_series(1,6) a,generate_series(a,6) b,generate_series(b,6) c,generate_series(c,6) d,generate_series(d,6) e`)).rows;
 for(const {dice} of rows)for(const [key] of categories){const actual=(await db.query('select yatzy_private.points($1,$2) p',[key,dice])).rows[0].p;assert.equal(actual,score(key,dice),`${key}: ${dice}`);}
});
test('privat rum, tokenkontroll, max två spelare, återanslutning',async()=>{
 const {a,b,room,wait}=await pair();assert.match(wait.code,/^[A-Z0-9]{5}$/);assert.equal(room.seat,1);assert.equal(room.status,'playing');assert.equal(room.hashes,undefined);
 assert.equal((await call('get',a,room)).seat,0);assert.equal((await call('join',b,null,{code:room.code})).id,room.id);
 await assert.rejects(call('get',token(),room),/spelarnyckel/);await assert.rejects(call('join',token(),null,{code:room.code,name:'Tre'}),/fullt/);
});
test('turkontroll, lås, tre kast och skydd mot gamla/dubbla kommandon',async()=>{
 const {a,b,room}=await pair();await assert.rejects(call('roll',b,room),/din tur/);await assert.rejects(call('score',a,room,{category:'chance'}),/Kasta först/);
 let r=await call('roll',a,room);const first=r.dice[0];await assert.rejects(call('roll',a,room),/uppdaterats/);
 r=await call('hold',a,r,{index:0});r=await call('roll',a,r);assert.equal(r.dice[0],first);r=await call('roll',a,r);assert.equal(r.rolls,3);
 await assert.rejects(call('roll',a,r),/tre gånger/);await assert.rejects(call('hold',a,r,{index:0}),/kan inte låsas/);
 const points=score('chance',r.dice);r=await call('score',a,r,{category:'chance'});assert.equal(r.cards[0].chance,points);assert.equal(r.turn,1);assert.equal(r.rolls,0);assert.deepEqual(r.held,Array(5).fill(false));
});
test('en spelare kan ha flera parallella privata dueller',async()=>{
 const a=token(),b=token(),c=token();
 const first=await call('create',a,null,{name:'Ada'});
 const second=await call('create',a,null,{name:'Ada'});
 assert.notEqual(first.id,second.id);
 const one=await call('join',b,null,{name:'Bo',code:first.code});
 const two=await call('join',c,null,{name:'Cleo',code:second.code});
 assert.equal(one.status,'playing');
 assert.equal(two.status,'playing');
 const list=await call('list',a);
 assert.equal(list.length,2);
 assert.deepEqual(new Set(list.map(r=>r.id)),new Set([first.id,second.id]));
 assert.ok(list.every(r=>r.seat===0));
 assert.ok(list.every(r=>r.deadline_at));
});

test('matchmaking parar två, lämna kön och undvik gamla rum',async()=>{
 const {a,b,room}=await pair('find');assert.equal(room.names.length,2);await call('leave',a,room);
 const t=token();let r=await call('find',t,null,{name:'Väntar'});assert.equal(r.status,'waiting');assert.equal((await call('find',t,null,{name:'Väntar'})).id,r.id);
 await db.query("update yatzy_private.rooms set touched=clock_timestamp()-interval '31 seconds' where id=$1",[r.id]);
 const next=await call('find',token(),null,{name:'Ny'});assert.notEqual(next.id,r.id);await call('leave',t,r);
});

test('en timmes inaktivitet avslutar duellen och ger motståndaren vinsten',async()=>{
 const {a,b,room}=await pair();
 await db.query("update yatzy_private.rooms set action_at=clock_timestamp()-interval '61 minutes' where id=$1",[room.id]);
 const timed=await call('get',a,room);
 assert.equal(timed.status,'timeout');
 assert.equal(timed.winner,1);
 const again=await call('get',b,timed);
 assert.equal(again.status,'timeout');
 assert.equal(again.winner,1);
});
test('hel duell med 30 turer, bonus, vinnare och avslutad match',async()=>{
 const {a,b,room}=await pair();let r=room;
 for(const [key] of categories)for(const t of [a,b]){r=await call('roll',t,r);r=await call('score',t,r,{category:key});}
 assert.equal(r.status,'finished');assert.equal(Object.keys(r.cards[0]).length,15);assert.equal(Object.keys(r.cards[1]).length,15);
 const x=totals(r.cards[0]).total,y=totals(r.cards[1]).total;assert.equal(r.winner,x>y?0:y>x?1:null);
 await assert.rejects(call('roll',a,r),/din tur/);
});
test('otillåtna kategorier, index, återanvänd kategori och RLS',async()=>{
 const {a,b,room}=await pair();let r=await call('roll',a,room);
 await assert.rejects(call('hold',a,r,{index:5}),/kan inte låsas/);await assert.rejects(call('score',a,r,{category:'hacked'}),/Ogiltig kategori/);
 r=await call('score',a,r,{category:'ones'});r=await call('roll',b,r);r=await call('score',b,r,{category:'ones'});r=await call('roll',a,r);await assert.rejects(call('score',a,r,{category:'ones'}),/redan använd/);
 await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role anon');await tx.query('select * from yatzy_private.rooms');}),/permission denied/);
 const hash=(await db.query("select encode(sha256(convert_to($1,'UTF8')),'hex') h",[a])).rows[0].h;
 assert.equal((await db.query('select yatzy_private.channel_allowed($1) ok',[`yatzy:${r.id}:${hash}`])).rows[0].ok,true);
 assert.equal((await db.query('select yatzy_private.channel_allowed($1) ok',[`yatzy:${r.id}:${'0'.repeat(64)}`])).rows[0].ok,false);
});
test('oavgjort, uppgiven match och utgånget rum',async()=>{
 const {a,b,room}=await pair();
 const complete=Object.fromEntries(categories.map(([k])=>[k,0]));const partial={...complete};delete partial.yatzy;
 await db.query("update yatzy_private.rooms set cards=$1, turn=1, rolls=1, dice='{1,2,3,4,5}' where id=$2",[[complete,partial],room.id]);
 const tied=await call('score',b,room,{category:'yatzy'});assert.equal(tied.status,'finished');assert.equal(tied.winner,null);
 const p=await pair();const left=await call('leave',p.a,p.room);assert.equal(left.winner,1);assert.equal(left.status,'abandoned');
 const old=await call('create',token(),null,{name:'Old'});
 await db.query("update yatzy_private.rooms set touched=clock_timestamp()-interval '25 hours' where id=$1",[old.id]);
 await assert.rejects(call('join',token(),null,{code:old.code,name:'Late'}),/hittades inte/);
});


test('energi tar poängskillnaden efter en komplett omgång',async()=>{
 const {a,b,room}=await pair();let r=room;
 await db.query("update yatzy_private.rooms set dice='{6,6,6,6,6}',rolls=1 where id=$1",[r.id]);
 r=await call('score',a,r,{category:'chance'});
 assert.deepEqual(r.energy,[50,50]);
 await db.query("update yatzy_private.rooms set dice='{1,1,1,1,1}',rolls=1 where id=$1",[r.id]);
 r=await call('score',b,r,{category:'chance'});
 assert.deepEqual(r.energy,[50,25]);
 assert.equal(r.last_damage,25);
 assert.equal(r.last_damaged,1);
});

test('knock återställer 45 och spelaren står över ett slag',async()=>{
 const {a,b,room}=await pair();let r=room;
 await db.query("update yatzy_private.rooms set energy='{50,5}',energy_max='{50,50}',dice='{6,6,6,6,6}',rolls=1 where id=$1",[r.id]);
 r=await call('score',a,r,{category:'chance'});
 await db.query("update yatzy_private.rooms set dice='{1,1,1,1,1}',rolls=1 where id=$1",[r.id]);
 r=await call('score',b,r,{category:'chance'});
 assert.equal(r.energy[1],0);
 assert.equal(r.energy_max[1],45);
 assert.equal(r.knocked[1],true);
 assert.equal(r.turn,0);
 await db.query("update yatzy_private.rooms set dice='{2,2,3,4,5}',rolls=1 where id=$1",[r.id]);
 r=await call('score',a,r,{category:'ones'});
 assert.equal(r.last_skip,1);
 assert.equal(r.energy[1],45);
 assert.equal(r.energy_max[1],45);
 assert.equal(r.knocked[1],false);
 assert.equal(r.turn,0);
});

test('knock på fem energi förlorar matchen direkt',async()=>{
 const {a,b,room}=await pair();let r=room;
 await db.query("update yatzy_private.rooms set energy='{50,5}',energy_max='{50,5}',dice='{6,6,6,6,6}',rolls=1 where id=$1",[r.id]);
 r=await call('score',a,r,{category:'chance'});
 await db.query("update yatzy_private.rooms set dice='{1,1,1,1,1}',rolls=1 where id=$1",[r.id]);
 r=await call('score',b,r,{category:'chance'});
 assert.equal(r.status,'knockout');
 assert.equal(r.winner,0);
 assert.equal(r.energy[1],0);
});
