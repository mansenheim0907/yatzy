import {PGlite} from '@electric-sql/pglite';
import {readdir,readFile} from 'node:fs/promises';
export async function database(path){
 const db=new PGlite(path);
 if(!(await db.query("select 1 from pg_namespace where nspname='yatzy_private'")).rows.length){
  // Local-only stand-in for the managed Realtime service; game SQL is unchanged.
  await db.exec(`create role anon; create role authenticated; create schema realtime;
   create table realtime.messages(extension text); alter table realtime.messages enable row level security;
   create function realtime.topic() returns text language sql as $$select current_setting('test.topic',true)$$;
   create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$select$$;`);
  for(const file of (await readdir(new URL('../supabase/migrations/',import.meta.url))).sort()) await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 }
 return db;
}
export async function command(db,{p_action,p_token,p_room=null,p_payload={}}){
 return db.transaction(async tx=>{
  await tx.exec('set local role anon');
  return (await tx.query('select public.yatzy_command($1,$2,$3,$4) as state',[p_action,p_token,p_room,p_payload])).rows[0].state;
 });
}
