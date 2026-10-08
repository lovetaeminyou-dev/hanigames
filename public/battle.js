(function(){
  const oldGo=window.go, oldStart=window.startGame, oldCreate=window.createRoom;
  let sock=null, poll=null;

  const tiles=["🍎","🍋","🍇","🍒","🥝","🍉","🍑","🍓","🍊","🍍","🥕","🌽","🍀","⭐","🐰","🦊","🐼","🐸","🐯","🐨","🐹","🐵","🐶","🐱","🦄","🐥","🦋","🌸","💎","🎈","🎀","🥭"];
  const makeBoard=()=>{const a=[...tiles,...tiles];for(let i=a.length-1;i;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return Array.from({length:8},(_,r)=>Array.from({length:8},(_,c)=>a[r*8+c]))};
  const path=(b,a,z)=>{if(a[0]===z[0]&&a[1]===z[1])return false;const inside=(r,c)=>r>=0&&r<8&&c>=0&&c<8,ok=(r,c)=>r>=-1&&r<=8&&c>=-1&&c<=8&&(!inside(r,c)||!b[r][c]),ds=[[1,0],[-1,0],[0,1],[0,-1]],q=[[a[0],a[1],-1,0]],seen=new Map();while(q.length){const [r,c,d,t]=q.shift(),k=r+","+c+","+d;if(t>2)continue;if(r===z[0]&&c===z[1])return true;if(seen.has(k)&&seen.get(k)<=t)continue;seen.set(k,t);for(let n=0;n<4;n++){const rr=r+ds[n][0],cc=c+ds[n][1],tt=d===-1||d===n?t:t+1;if(tt<=2&&((rr===z[0]&&cc===z[1])||ok(rr,cc)))q.push([rr,cc,n,tt])}}return false};

  async function rooms(){
    const box=document.querySelector("#rooms-shisen");if(!box)return;
    try{const d=await api("/api/rooms?game=shisen");const a=(d.rooms||[]).filter(x=>x.status!=="finished");
      box.innerHTML=a.length?a.map((r,i)=>{const mine=Number(r.host_id)===Number(S.user?.id),full=!!r.guest_id||r.status==="playing";const btn=mine?'<button class="secondary" onclick="battleRoom(\''+r.room_code+'\')">입장</button>':!full?'<button class="secondary" onclick="battleJoin(\''+r.room_code+'\')">참가</button>':'<button class="secondary" disabled>진행 중</button>';return '<div class="card room"><div><h4>방 '+(i+1)+' · '+esc(r.room_code)+'</h4><p>'+(r.status==="playing"?"게임 진행 중":full?"상대 입장 완료":"상대방 기다리는 중")+(mine?" · 내가 만든 방":"")+'</p></div>'+btn+'</div>'}).join(""):'<div class="card room"><div><h4>현재 대기방이 없어요</h4><p>첫 번째 방을 만들어 보세요!</p></div><button class="secondary" onclick="createRoom(\'shisen\')">방 만들기</button></div>';
    }catch{}
  }

  async function create(game){
    if(game!=="shisen")return oldCreate(game);
    try{const d=await api("/api/rooms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({game:"shisen",stake:100})});battleRoom(d.room.room_code)}catch(e){toast(e.message)}
  }
  window.createRoom=create;

  async function join(code){try{await api("/api/rooms/"+encodeURIComponent(code)+"/join",{method:"POST"});battleRoom(code)}catch(e){toast(e.message)}}
  window.battleJoin=join;

  function battleRoom(code){
    if(S.game)return;
    history.pushState({game:"shisenBattle",tab:"games"},"",location.href);S.game={type:"shisenBattle",room:code};
    let ws=null,myId=null,me=makeBoard(),foe=null,sel=null,myLeft=64,foeLeft=64,t=120,done=false,timer=null;
    const stop=()=>{clearInterval(timer);timer=null};
    const draw=()=>{$("#app").innerHTML=shell('<div class="shisen-battle"><div class="battle-topbar"><button class="secondary" type="button" style="position:relative;z-index:9999;pointer-events:auto" id="battle-back-btn">← 게임</button><strong>⚔️ 사천성 1:1 대전</strong><span class="battle-time">'+(foe?"⏱️ "+t+"s":"대기중")+'</span></div>'+(foe?'<section class="battle-player-card"><div class="battle-player-head"><div><b>🐰 '+esc(S.user?.username||"나")+'</b><small>내 판</small></div><strong>'+myLeft+'개 남음</strong></div><div class="battle-progress"><i style="width:'+(myLeft/64*100)+'%"></i></div><div class="shisen-battle-board">'+board(me,true)+'</div></section><div class="battle-vs">VS</div><section class="battle-player-card enemy-card"><div class="battle-player-head"><div><b>⚔️ '+esc(foe.username||"상대 하니")+'</b><small>상대 판 · 실시간</small></div><strong>'+foeLeft+'개 남음</strong></div><div class="battle-progress"><i style="width:'+(foeLeft/64*100)+'%"></i></div><div class="shisen-battle-board">'+board(foe.board,false)+'</div></section><p class="muted center">상대보다 먼저 0개를 만들면 승리!</p>':'<section class="card" style="padding:30px;text-align:center"><div style="font-size:56px">⚔️</div><h2>상대방을 기다리는 중</h2><p class="muted">방 코드 <b>'+esc(code)+'</b></p><p class="muted">상대가 참가하면 바로 시작됩니다.</p></section>')+'</div>')};
    const board=(b,click)=>{let h="";for(let r=0;r<8;r++)for(let c=0;c<8;c++){const v=b[r][c]||"",s=click&&sel&&sel[0]===r&&sel[1]===c?" selected":"";h+='<button class="shisen-battle-cell'+s+'" '+(click?'onclick="battlePick('+r+','+c+')':'disabled')+'>'+v+'</button>'}return h};
    window.battlePick=(r,c)=>{if(done||!me[r][c])return;if(!sel){sel=[r,c];draw();return}const a=sel;if(a[0]===r&&a[1]===c){sel=null;draw();return}if(me[a[0]][a[1]]!==me[r][c]||!path(me,a,[r,c])){sel=[r,c];draw();return}me[a[0]][a[1]]=null;me[r][c]=null;sel=null;myLeft-=2;ws?.send(JSON.stringify({type:"move",a,b:[r,c]}));draw()};
    window.battleExit=()=>{done=true;stop();try{ws?.send(JSON.stringify({type:"leave"}));ws?.close()}catch{}close()};
    function close(){stop();try{ws?.close()}catch{}sock=null;S.game=null;window.battleExitSocket=null;oldGo("games",false).then(()=>rooms()).catch(()=>{});}
    window.battleExitSocket=()=>{done=true;stop();try{ws?.close()}catch{}};
    draw();
    document.querySelector("#battle-back-btn")?.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();window.battleExit();});
    const p=location.protocol==="https:"?"wss":"ws";ws=new WebSocket(p+"://"+location.host+"/api/rooms/"+encodeURIComponent(code)+"/ws");sock=ws;
    ws.onmessage=e=>{let d;try{d=JSON.parse(e.data)}catch{return}if(d.type==="battle_connected"){myId=d.playerId;ws.send(JSON.stringify({type:"init",board:me,username:S.user?.username||"나"}))}else if(d.type==="battle_start"){const a=d.players||[],mine=a.find(x=>String(x.id)===String(myId))||a[0],other=a.find(x=>String(x.id)!==String(myId))||a[1];me=mine.board;foe={username:other.username,board:other.board};myLeft=foeLeft=64;t=d.timeLeft||120;draw();stop();timer=setInterval(()=>{if(done)return;t=Math.max(0,t-1);if(!t){done=true;stop();toast("⏰ 시간이 끝났어요.")}draw()},1000)}else if(d.type==="opponent_move"&&foe){if(Array.isArray(d.a)&&Array.isArray(d.b)){foe.board[d.a[0]][d.a[1]]=null;foe.board[d.b[0]][d.b[1]]=null}foeLeft=Number(d.left||Math.max(0,foeLeft-2));draw()}else if(d.type==="battle_result"){done=true;stop();api("/api/me").then(x=>{if(x.user)S.user=x.user}).catch(()=>{});alert(String(d.winnerId)===String(myId)?"🏆 승리! +1,000P":"💥 패배!");draw()}};
    ws.onerror=()=>toast("배틀 서버 연결에 실패했어요.");
  }
  window.battleRoom=battleRoom;
  window.startGame=function(type){if(type==="shisenBattle")return create("shisen");return oldStart(type)};
  window.go=async function(tab,push=true){if(S.game&&tab==="games"){window.battleExitSocket?.();S.game=null;const x=await oldGo("games",false);rooms();clearInterval(poll);poll=setInterval(()=>{if(!S.game&&S.tab==="games")rooms()},3000);return x}const x=await oldGo(tab,push);if(tab==="games"&&!S.game){rooms();clearInterval(poll);poll=setInterval(()=>{if(!S.game&&S.tab==="games")rooms()},3000)}return x};
  window.addEventListener("popstate",async()=>{if(S.game){window.battleExitSocket?.();S.game=null;await oldGo("games",false);rooms();return}await oldGo(history.state?.tab||"home",false)});
})();
