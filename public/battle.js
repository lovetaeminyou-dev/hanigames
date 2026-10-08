/* =========================================================
   REALTIME SHISEN BATTLE PATCH
   Loaded after app.js so the existing UI can use true 1:1 rooms.
========================================================= */
(function(){
  const originalGo=window.go;
  const originalStartGame=window.startGame;
  const originalCreateRoom=window.createRoom;
  let lobbyTimer=null;
  let battleSocket=null;

  function boardPath(board,a,b){
    if(a[0]===b[0]&&a[1]===b[1])return false;
    const R=8,C=8;
    const inside=(r,c)=>r>=0&&r<R&&c>=0&&c<C;
    const can=(r,c)=>r>=-1&&r<=R&&c>=-1&&c<=C;
    const empty=(r,c)=>can(r,c)&&(!inside(r,c)||!board[r][c]);
    const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
    const q=[[a[0],a[1],-1,0]],seen=new Map();
    while(q.length){
      const [r,c,dir,t]=q.shift(),key=r+","+c+","+dir;
      if(t>2)continue;
      if(r===b[0]&&c===b[1])return true;
      if(seen.has(key)&&seen.get(key)<=t)continue;
      seen.set(key,t);
      for(let d=0;d<4;d++){
        const nr=r+dirs[d][0],nc=c+dirs[d][1],nt=dir===-1||dir===d?t:t+1;
        if(nt<=2&&((nr===b[0]&&nc===b[1])||empty(nr,nc)))q.push([nr,nc,d,nt]);
      }
    }
    return false;
  }

  function makeBoard(){
    const tiles=["🍎","🍋","🍇","🍒","🥝","🍉","🍑","🍓","🍊","🍍","🥕","🌽","🍀","⭐","🐰","🦊","🐼","🐸","🐯","🐨","🐹","🐵","🐶","🐱","🦄","🐥","🦋","🌸","💎","🎈","🎀","🥭"];
    const a=[...tiles,...tiles];
    for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
    return Array.from({length:8},(_,r)=>Array.from({length:8},(_,c)=>a[r*8+c]));
  }

  function shuffleBoard(board){
    const a=board.flat().filter(Boolean);
    for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
    let k=0;
    for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(board[r][c])board[r][c]=a[k++];
  }

  async function refreshRooms(){
    const box=document.querySelector("#rooms-shisen");
    if(!box)return;
    try{
      const d=await api("/api/rooms?game=shisen");
      const rooms=(d.rooms||[]).filter(r=>r.status!=="finished");
      if(!rooms.length){
        box.innerHTML='<div class="card room"><div><h4>현재 대기방이 없어요</h4><p>첫 번째 방을 만들어 보세요!</p></div><button class="secondary" onclick="createRoom(\'shisen\')">방 만들기</button></div>';
        return;
      }
      box.innerHTML=rooms.map((r,i)=>{
        const mine=Number(r.host_id)===Number(S.user?.id);
        const playing=r.status==="playing";
        const full=!!r.guest_id||playing;
        const status=playing?"게임 진행 중":full?"상대 입장 완료":"상대방 기다리는 중";
        let btn="";
        if(!mine&&!full)btn='<button class="secondary" onclick="joinBattleRoom(\''+esc(r.room_code)+'\')">참가</button>';
        else if(mine)btn='<button class="secondary" onclick="startBattleRoom(\''+esc(r.room_code)+'\')">입장</button>';
        else btn='<button class="secondary" disabled>진행 중</button>';
        return '<div class="card room"><div><h4>방 '+(i+1)+' · '+esc(r.room_code)+'</h4><p>'+status+(mine?" · 내가 만든 방":"")+'</p></div>'+btn+'</div>';
      }).join("");
    }catch{}
  }

  function startLobbyPolling(){
    clearInterval(lobbyTimer);
    refreshRooms();
    lobbyTimer=setInterval(()=>{if(!S.game&&S.tab==="games")refreshRooms();},3000);
  }

  async function joinBattleRoom(code){
    try{
      await api("/api/rooms/"+encodeURIComponent(code)+"/join",{method:"POST"});
      startBattleRoom(code);
    }catch(e){toast(e.message);}
  }
  window.joinBattleRoom=joinBattleRoom;

  window.createRoom=async function(game){
    if(game!=="shisen"){
      if(typeof originalCreateRoom==="function")return originalCreateRoom(game);
      return;
    }
    if(window.__battleCreateBusy)return;
    window.__battleCreateBusy=true;
    try{
      const d=await api("/api/rooms",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({game:"shisen",stake:100})
      });
      startBattleRoom(d.room.room_code);
    }catch(e){toast(e.message);}
    finally{window.__battleCreateBusy=false;}
  };

  function leaveBattleSocket(){
    if(battleSocket){
      try{battleSocket.send(JSON.stringify({type:"leave"}));}catch{}
      try{battleSocket.close();}catch{}
      battleSocket=null;
    }
  }

  function startBattleRoom(code){
    if(S.game&&S.game.type==="shisenBattle")return;
    if(!code){
      createRoom("shisen");
      return;
    }
    clearInterval(lobbyTimer);
    history.pushState({game:"shisenBattle",tab:S.tab},"",location.href);
    S.game={type:"shisenBattle",room:code};

    const state={
      code,
      socket:null,
      id:null,
      me:null,
      enemy:null,
      myLeft:64,
      enemyLeft:64,
      selected:null,
      timeLeft:120,
      done:false,
      timer:null
    };

    function stop(){
      clearInterval(state.timer);
      state.timer=null;
    }

    function render(){
      const waiting=!state.me||!state.enemy;
      const myPct=Math.max(0,Math.min(100,state.myLeft/64*100));
      const enemyPct=Math.max(0,Math.min(100,state.enemyLeft/64*100));
      const cell=(board,clickable)=>{
        if(!board)return '<div class="battle-waiting-board"><div>상대방 연결을 기다리는 중…</div></div>';
        let html="";
        for(let r=0;r<8;r++)for(let c=0;c<8;c++){
          const v=board[r][c]||"";
          const sel=clickable&&state.selected&&state.selected[0]===r&&state.selected[1]===c?" selected":"";
          html+='<button class="shisen-battle-cell'+sel+'" '+(clickable?'onclick="SHB.choose('+r+','+c+')"':'disabled')+'>'+v+'</button>';
        }
        return html;
      };
      $("#app").innerHTML=shell(
        '<div class="shisen-battle">'+
        '<div class="battle-topbar"><button class="secondary" onclick="SHB.exit()">← 게임</button><strong>⚔️ 사천성 1:1 대전</strong><span class="battle-time">'+(waiting?"대기중":"⏱️ "+state.timeLeft+"s")+'</span></div>'+
        (waiting?
          '<section class="card battle-wait-card" style="padding:28px;text-align:center"><div style="font-size:56px">⚔️</div><h2>상대방을 기다리는 중이에요</h2><p class="muted">방 코드 <b>'+esc(code)+'</b></p><p class="muted">친구가 이 방에 참가하면 양쪽에서 동시에 게임이 시작돼요!</p></section>':
          '<section class="battle-player-card"><div class="battle-player-head"><div><b>🐰 '+esc(S.user?.username||"나")+'</b><small>내 판</small></div><strong>'+state.myLeft+'개 남음</strong></div><div class="battle-progress"><i style="width:'+myPct+'%"></i></div><div class="shisen-battle-board">'+cell(state.me,true)+'</div></section>'+
          '<div class="battle-vs">VS</div>'+
          '<section class="battle-player-card enemy-card"><div class="battle-player-head"><div><b>⚔️ '+esc(state.enemy.username||"상대 하니")+'</b><small>상대 판 · 실시간</small></div><strong>'+state.enemyLeft+'개 남음</strong></div><div class="battle-progress"><i style="width:'+enemyPct+'%"></i></div><div class="shisen-battle-board">'+cell(state.enemy.board,false)+'</div></section>'+
          '<p class="muted center" style="margin:10px 0 18px">같은 타일을 최대 2번 꺾어 연결하세요 · 상대보다 먼저 0개를 만들면 승리!</p>')+
        '</div>'
      );
    }

    function choose(r,c){
      if(state.done||!state.me||!state.me[r][c])return;
      if(!state.selected){state.selected=[r,c];render();return;}
      const [sr,sc]=state.selected;
      if(sr===r&&sc===c){state.selected=null;render();return;}
      if(state.me[sr][sc]!==state.me[r][c]||!boardPath(state.me,[sr,sc],[r,c])){
        state.selected=[r,c];render();return;
      }
      state.me[sr][sc]=null;
      state.me[r][c]=null;
      state.selected=null;
      state.myLeft=Math.max(0,state.myLeft-2);
      if(state.socket?.readyState===WebSocket.OPEN){
        state.socket.send(JSON.stringify({type:"move",a:[sr,sc],b:[r,c]}));
      }
      if(state.myLeft>0){
        const any=state.me.some((row,r)=>row.some((v,c)=>v&&state.me.some((rr,cc)=>v===state.me[rr][cc]&&!(rr===r&&cc===c)&&boardPath(state.me,[r,c],[rr,cc])));
        if(!any)shuffleBoard(state.me);
      }
      render();
    }

    function exit(){
      if(state.done){close();return;}
      if(confirm("배틀을 나가면 상대방이 승리 처리돼요. 나갈까요?")){
        state.done=true;
        leaveBattleSocket();
        close();
      }
    }

    function close(){
      stop();
      leaveBattleSocket();
      S.game=null;
      if(history.state?.game)history.back();
      else originalGo("games",false);
    }

    window.SHB={
      choose,
      exit,
      exitSocket:()=>{state.done=true;stop();leaveBattleSocket();}
    };

    render();

    const protocol=location.protocol==="https:"?"wss":"ws";
    const url=protocol+"://"+location.host+"/api/rooms/"+encodeURIComponent(code)+"/ws";
    state.socket=new WebSocket(url);
    battleSocket=state.socket;

    state.socket.addEventListener("message",event=>{
      let d;try{d=JSON.parse(event.data)}catch{return}
      if(d.type==="battle_connected"){
        state.id=d.playerId;
        state.me=makeBoard();
        state.socket.send(JSON.stringify({type:"init",board:state.me,username:S.user?.username||"나"}));
        render();
      }else if(d.type==="battle_start"){
        const list=d.players||[];
        const mine=list.find(p=>String(p.id)===String(state.id))||list[0];
        const foe=list.find(p=>String(p.id)!==String(state.id))||list[1];
        if(mine)state.me={...mine,board:mine.board};
        if(foe)state.enemy={...foe,board:foe.board};
        state.myLeft=64;state.enemyLeft=64;state.timeLeft=Number(d.timeLeft||120);state.done=false;state.selected=null;
        render();
        stop();
        state.timer=setInterval(()=>{
          if(state.done)return;
          state.timeLeft=Math.max(0,state.timeLeft-1);
          if(state.timeLeft<=0){state.done=true;stop();toast("⏰ 시간이 끝났어요.");}
          else render();
        },1000);
      }else if(d.type==="opponent_move"){
        if(String(d.playerId)===String(state.id)||!state.enemy)return;
        const a=d.a,b=d.b;
        if(Array.isArray(a)&&Array.isArray(b)){
          state.enemy.board[a[0]][a[1]]=null;
          state.enemy.board[b[0]][b[1]]=null;
        }
        state.enemyLeft=Math.max(0,Number(d.left??state.enemyLeft-2));
        render();
      }else if(d.type==="battle_result"){
        state.done=true;stop();
        api("/api/me").then(x=>{if(x.user)S.user=x.user}).catch(()=>{});
        const mine=String(d.winnerId)===String(state.id);
        render();
        if(d.reason==="win")alert(mine?"🏆 승리! +1,000P":"💥 패배 · 상대가 먼저 클리어했어요.");
        else if(d.reason==="leave")alert(mine?"🏆 상대방이 나가서 승리했어요!":"게임이 종료됐어요.");
        else alert("⏰ 게임이 종료됐어요.");
      }
    });
    state.socket.addEventListener("close",()=>{if(!state.done)toast("배틀 연결이 종료됐어요.");});
    state.socket.addEventListener("error",()=>toast("배틀 서버 연결에 실패했어요."));
  }

  window.startBattleRoom=startBattleRoom;

  window.startGame=function(type){
    if(type==="shisenBattle"){
      createRoom("shisen");
      return;
    }
    return originalStartGame(type);
  };

  window.go=async function(tab,push=true){
    if(S.game&&tab==="games"){
      if(window.SHB?.exitSocket)window.SHB.exitSocket();
      S.game=null;
      const result=await originalGo("games",false);
      startLobbyPolling();
      return result;
    }
    const result=await originalGo(tab,push);
    if(tab==="games"&&!S.game)startLobbyPolling();
    return result;
  };

  window.addEventListener("popstate",async()=>{
    if(S.game){
      if(window.SHB?.exitSocket)window.SHB.exitSocket();
      S.game=null;
      await originalGo("games",false);
      startLobbyPolling();
      return;
    }
    await originalGo(history.state?.tab||"home",false);
  });

  setTimeout(()=>{
    if(typeof S!=="undefined"&&S.tab==="games")startLobbyPolling();
  },500);
})();
