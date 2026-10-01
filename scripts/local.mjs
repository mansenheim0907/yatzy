import {createServer} from 'node:http';
import {createServer as createVite} from 'vite';
import {database,command} from './database.mjs';
const db=await database('.local-data');
const vite=await createVite({server:{middlewareMode:true},define:{'import.meta.env.VITE_LOCAL_DUEL':'true'}});
createServer(async(req,res)=>{
 if(req.url==='/api/command' && req.method==='POST'){
  try{
   if(req.headers.origin && !['http://127.0.0.1:5173','http://localhost:5173'].includes(req.headers.origin)) throw Error('Ogiltigt ursprung');
   let body=''; for await(const chunk of req){body+=chunk;if(body.length>8192) throw Error('För stor begäran');}
   const data=await command(db,JSON.parse(body));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data}));
  }catch(error){res.statusCode=400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:{message:error.message}}));}
 } else vite.middlewares(req,res);
}).listen(5173,'127.0.0.1',()=>console.log('Lokal duell: http://127.0.0.1:5173'));
