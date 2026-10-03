import { DurableObject } from 'cloudflare:workers';

function json(data, status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8'}})}
async function hashPassword(password){const b=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);const salt=crypto.getRandomValues(new Uint8Array(16));const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'},b,256);return `${[...salt].map(x=>x.toString(16).padStart(2,'0')).join('')}:${[...new Uint8Array(bits)].map(x=>x.toString(16).padStart(2,'0')).join('')}`}
async function verify(password,stored){const [s,h]=stored.split(':');const salt=Uint8Array.from(s.match(/../g).map(x=>parseInt(x,16)));const b=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'},b,256);return h===[...new Uint8Array(bits)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function token(id){return btoa(JSON.stringify({id,exp:Date.now()+7*86400000})).replaceAll('=','')}
function auth(req){try{const t=req.headers.get('authorization')?.replace('Bearer ','');if(!t)return null;const x=JSON.parse(atob(t));return x.exp>Date.now()?x.id:null}catch{return null}}

export default {async fetch(req,env){const url=new URL(req.url);if(url.pathname.startsWith('/api/')){
 try{
  if(req.method==='POST'&&url.pathname==='/api/register'){const {username,password}=await req.json();if(!username||!password)return json({error:'아이디와 비밀번호를 입력하세요.'},400);const exists=await env.DB.prepare('SELECT id FROM users WHERE username=?').bind(username).first();if(exists)return json({error:'이미 사용 중인 닉네임입니다.'},409);const ph=await hashPassword(password);const r=await env.DB.prepare('INSERT INTO users(username,password_hash) VALUES(?,?)').bind(username,ph).run();return json({ok:true,token:token(r.meta.last_row_id)})}
  if(req.method==='POST'&&url.pathname==='/api/login'){const {username,password}=await req.json();const u=await env.DB.prepare('SELECT * FROM users WHERE username=?').bind(username).first();if(!u||!(await verify(password,u.password_hash)))return json({error:'로그인 정보가 맞지 않습니다.'},401);return json({ok:true,token:token(u.id)})}
  const uid=auth(req); if(!uid)return json({error:'로그인이 필요합니다.'},401);
  if(req.method==='GET'&&url.pathname==='/api/me'){const u=await env.DB.prepare('SELECT id,username,points,level,xp,body_size,evolution,wins,losses FROM users WHERE id=?').bind(uid).first();return json(u)}
  if(req.method==='GET'&&url.pathname==='/api/ranking'){const rows=await env.DB.prepare('SELECT username,wins,losses,level FROM users ORDER BY wins DESC,level DESC LIMIT 5').all();return json(rows.results)}
  if(req.method==='POST'&&url.pathname==='/api/action'){const {type}=await req.json();const gain=type==='workout'?80:type==='feed'?40:20;const u=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(uid).first();let xp=u.xp+gain,level=u.level,body=u.body_size,evo=u.evolution;while(xp>=level*200){xp-=level*200;level++;body++;if(level>=5)evo=1;if(level>=10)evo=2;if(level>=20)evo=3;}await env.DB.prepare('UPDATE users SET xp=?,level=?,body_size=?,evolution=?,points=points+? WHERE id=?').bind(xp,level,body,gain,uid).run();return json({ok:true})}
  if(req.method==='POST'&&url.pathname==='/api/rooms'){const {game='shisen',stake=0}=await req.json();const room=Math.random().toString(36).slice(2,7).toUpperCase();const id=env.GameRoom.idFromName(room);const stub=env.GameRoom.get(id);return stub.fetch(new Request('https://room/create',{method:'POST',body:JSON.stringify({room,game,stake,userId:uid})}))}
  if(req.method==='GET'&&url.pathname==='/api/rooms'){const game=url.searchParams.get('game')||'shisen';return json({game,rooms:[]})}
  return json({error:'Not found'},404)
 }catch(e){return json({error:e.message},500)}}
 return env.ASSETS.fetch(req)},};

export class GameRoom extends DurableObject {
 constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.env=env;this.state={room:null,game:'shisen',stake:0,players:[],status:'waiting'};}
 async fetch(req){const u=new URL(req.url);if(req.method==='POST'&&u.pathname==='/create'){const x=await req.json();this.state={...this.state,...x,players:[x.userId],status:'waiting'};return json({ok:true,room:x.room})}if(req.method==='POST'&&u.pathname==='/join'){const x=await req.json();if(this.state.players.length>=2)return json({error:'방이 가득 찼습니다.'},409);if(!this.state.players.includes(x.userId))this.state.players.push(x.userId);this.state.status=this.state.players.length===2?'playing':'waiting';return json({ok:true,state:this.state})}if(u.pathname==='/ws'){const pair=new WebSocketPair();const [client,server]=Object.values(pair);this.ctx.acceptWebSocket(server);server.serializeAttachment({userId:u.searchParams.get('userId')});server.send(JSON.stringify({type:'room',state:this.state}));return new Response(null,{status:101,webSocket:client})}return json({state:this.state})}
 webSocketMessage(ws,msg){for(const s of this.ctx.getWebSockets())if(s!==ws)s.send(msg)}
 webSocketClose(ws){ }
}
