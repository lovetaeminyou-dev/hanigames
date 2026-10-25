/* HANI online boardgame rooms */
(function(){
  const escHTML=s=>String(s==null?"":s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  const labels={wordchain:"🔤 끝말잇기",bang:"🤠 뱅!",tichu:"🃏 티츄",rummikub:"🔢 루미큐브",liar:"🤥 라이어 게임",lasvegas:"🎲 라스베가스"};
  window.createBoardRoom=async function(game){
    try{
      const d=await api("/api/boardrooms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({game:game})});
      if(!d.room)throw new Error(d.error||"방을 만들지 못했어요.");
      window.openBoardRoom(d.room.room_code,game);
    }catch(e){toast(e.message||"방을 만들지 못했어요.");}
  };
  window.joinBoardRoom=async function(code){
    code=String(code||document.querySelector("#boardroom-code")?.value||"").trim().toUpperCase();
    if(!/^[A-Z0-9]{4,8}$/.test(code)){toast("방 코드를 4~8자리로 입력해 주세요.");return;}
    try{
      const d=await api("/api/boardrooms/"+encodeURIComponent(code)+"/join",{method:"POST"});
      if(!d.room)throw new Error(d.error||"방에 참가하지 못했어요.");
      window.openBoardRoom(code,d.room.game);
    }catch(e){toast(e.message||"방에 참가하지 못했어요.");}
  };
  window.copyBoardRoomCode=()=>{const code=window.HANI_BOARD_ROOM?.code||"";if(navigator.clipboard?.writeText){navigator.clipboard.writeText(code).then(()=>toast("방 코드를 복사했어요.")).catch(()=>toast("방 코드: "+code));}else toast("방 코드: "+code);};
  window.openBoardRoom=function(code,game){
    if(window.HANI_BOARD_WS){try{window.HANI_BOARD_WS.close();}catch(e){}}
    window.HANI_BOARD_ROOM={code:code,game:game,state:null,notice:"서버에 연결하는 중이에요…"};
    renderRoom();
    const token=localStorage.getItem("haniToken")||"";
    const proto=location.protocol==="https:"?"wss:":"ws:";
    const ws=new WebSocket(proto+"//"+location.host+"/api/boardrooms/"+encodeURIComponent(code)+"/ws?token="+encodeURIComponent(token));
    window.HANI_BOARD_WS=ws;
    ws.onmessage=e=>{
      let d;try{d=JSON.parse(e.data);}catch(e){return;}
      const r=window.HANI_BOARD_ROOM;if(!r||r.code!==code)return;
      if(d.type==="room_state"){r.state=d;r.notice="";}
      else if(d.type==="notice")r.notice=d.text||"";
      else if(d.type==="game_action")r.lastAction=d;
      renderRoom();
    };
    ws.onopen=()=>{const r=window.HANI_BOARD_ROOM;if(r&&r.code===code){r.notice="실시간 연결 완료";renderRoom();}};
    ws.onerror=()=>{const r=window.HANI_BOARD_ROOM;if(r&&r.code===code){r.notice="연결 오류예요. 로그인과 Cloudflare 배포 상태를 확인해 주세요.";renderRoom();}};
    ws.onclose=()=>{const r=window.HANI_BOARD_ROOM;if(r&&r.code===code){r.notice=r.notice||"연결이 종료됐어요.";renderRoom();}};
  };
  function send(d){const ws=window.HANI_BOARD_WS;if(!ws||ws.readyState!==WebSocket.OPEN){toast("방 서버에 연결되지 않았어요.");return;}ws.send(JSON.stringify(d));}
  window.haniOnlineGameAction=(action,payload)=>send({type:"action",action:action,payload:payload||{}});
  window.haniOnlineToggle=i=>{const r=window.HANI_BOARD_ROOM;if(!r)return;r.selected=r.selected||[];r.selected.includes(i)?r.selected=r.selected.filter(x=>x!==i):r.selected.push(i);renderRoom();};
  window.haniOnlinePlaySelected=()=>{const r=window.HANI_BOARD_ROOM;if(!r)return;const action=r.game==="tichu"?"tichu_play":"rummikub_play";window.haniOnlineGameAction(action,{indices:r.selected||[]});r.selected=[];};
  window.haniOnlineDraw=()=>{const r=window.HANI_BOARD_ROOM;if(!r)return;window.haniOnlineGameAction("rummikub_draw",{});};
  window.haniOnlinePass=()=>window.haniOnlineGameAction("tichu_pass",{});
  window.haniOnlineBangPlay=i=>{const r=window.HANI_BOARD_ROOM;if(!r)return;const target=document.querySelector("#bg-target")?.value||"";window.haniOnlineGameAction("bang_play",{cardIndex:i,targetId:target});};
  window.haniOnlineBangDiscard=i=>window.haniOnlineGameAction("bang_discard",{cardIndex:i});
  window.haniOnlineLasPlace=n=>window.haniOnlineGameAction("lasvegas_place",{num:n});
  window.haniBoardRoomStart=()=>send({type:"start"});
  window.haniWordchainSubmit=()=>{const el=document.querySelector("#online-wordchain-input");const word=String(el?.value||"").trim().replace(/\s/g,"");if(word.length<2){toast("두 글자 이상의 단어를 입력해 주세요.");return;}send({type:"action",action:"wordchain_submit",payload:{word:word}});};
  window.haniBoardRoomVoteStart=()=>send({type:"vote_start"});
  window.haniBoardRoomVote=id=>send({type:"vote",target:String(id)});
  window.haniBoardRoomChat=()=>{const el=document.querySelector("#boardroom-chat-input"),text=(el?.value||"").trim();if(!text)return;send({type:"chat",text:text});if(el)el.value="";};
  window.haniBoardRoomBack=()=>{if(window.HANI_BOARD_WS){try{window.HANI_BOARD_WS.close();}catch(e){}}window.HANI_BOARD_WS=null;window.HANI_BOARD_ROOM=null;window.go("games");};
  function renderRoom(){
    const r=window.HANI_BOARD_ROOM;if(!r)return;
    const st=r.state||{players:[],chat:[],phase:"lobby",hostId:""};
    const gs=st.gameState,priv=st.privateData;
    const me=String(S.user?.id||S.user?.user_id||"");
    const isHost=String(st.hostId)===me;
    const myTurn=!!gs&&String(gs.turnId)===me;
    const players=(st.players||[]).map(p=>'<div class="card" style="padding:10px;display:flex;justify-content:space-between;align-items:center;gap:8px"><b>'+escHTML(p.name)+'</b><span class="tag">'+(p.ready?"준비 완료":"접속 중")+'</span></div>').join("")||'<p class="muted">참가자를 기다리고 있어요.</p>';
    const chat=(st.chat||[]).map(m=>'<div style="padding:7px 0;border-bottom:1px solid var(--border,#e8edf5)"><b>'+escHTML(m.name)+'</b>　'+escHTML(m.text)+'</div>').join("")||'<p class="muted">아직 채팅이 없어요.</p>';
    let gameBody="";
    if(r.game==="wordchain"&&gs){
      const last=gs.currentWord||"시작";
      gameBody='<section class="card" style="padding:14px;margin-top:12px"><div class="section-sub">이어갈 글자</div><div style="font-size:36px;font-weight:900;text-align:center;margin:8px 0">'+escHTML(last.slice(-1))+'</div><p>'+(myTurn?"내 차례예요! 단어를 입력해 주세요.":"상대가 단어를 입력하고 있어요.")+'</p><div style="display:flex;gap:8px"><input id="online-wordchain-input" class="input" maxlength="20" placeholder="두 글자 이상 단어" style="min-width:0;flex:1" '+(!myTurn||gs.over?"disabled":"")+' onkeydown="if(event.key===&quot;Enter&quot;)window.haniWordchainSubmit()"><button class="primary" '+(!myTurn||gs.over?"disabled":"")+' onclick="window.haniWordchainSubmit()">입력</button></div><p class="muted">중복 단어는 사용할 수 없어요.</p></section><section class="card" style="padding:12px;margin-top:12px"><b>단어 기록</b>'+(gs.history||[]).slice().reverse().map(x=>'<p style="margin:7px 0"><b>'+escHTML(x.name)+'</b>　'+escHTML(x.word)+'</p>').join("")+'</section>';
      if(gs.over)gameBody+='<section class="card" style="padding:14px;margin-top:12px"><h2>'+escHTML(gs.winner||"게임 종료")+'</h2><button class="primary" onclick="window.haniBoardRoomStart()">다시 시작</button></section>';
    }else if(r.game==="liar"&&priv){
      gameBody='<section class="card" style="padding:14px;margin-top:12px"><div class="section-sub">카테고리 · '+escHTML(priv.category)+'</div><h2 style="margin:6px 0">'+(st.phase==="chat"?escHTML(priv.clue):"🔒 제시어 비공개")+'</h2><b>'+(priv.isLiar?"🤥 당신은 라이어예요!":"🙂 당신은 시민이에요.")+'</b><p class="muted">제시어를 직접 말하지 말고 힌트로 대화해 보세요.</p></section>';
      if(st.phase==="chat")gameBody+='<button class="primary" style="width:100%;margin-top:10px" onclick="window.haniBoardRoomVoteStart()">토론 종료 · 투표 시작</button>';
      if(st.phase==="vote")gameBody+='<section class="card" style="padding:14px;margin-top:12px"><h3>누가 라이어일까요?</h3><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">'+(st.players||[]).map(p=>'<button class="secondary" onclick="window.haniBoardRoomVote(&quot;'+escHTML(p.id)+'&quot;)">'+escHTML(p.name)+'</button>').join("")+'</div></section>';
      if(st.phase==="result"&&st.result)gameBody+='<section class="card" style="padding:14px;margin-top:12px"><h2>'+(st.result.winner==="citizens"?"🎉 시민 팀 승리":"🤥 라이어 승리")+'</h2><p>투표 대상: '+escHTML(st.result.pickedName)+'</p><p>라이어: '+escHTML(st.result.liarName)+'</p><p>정답: '+escHTML(st.result.word)+' · 라이어 제시어: '+escHTML(st.result.liarWord)+'</p><button class="primary" onclick="window.haniBoardRoomStart()">다음 라운드</button></section>';
    }else if(gs&&priv){
      if(r.game==="bang"){
        const targetOptions=gs.players.filter(p=>p.id!==me&&p.alive).map(p=>'<option value="'+escHTML(p.id)+'">'+escHTML(p.name)+'</option>').join("");
        const cards=(priv.hand||[]).map((c,i)=>'<div class="card" style="padding:9px;display:flex;justify-content:space-between;align-items:center;gap:8px"><b>'+({bang:"🔫 뱅!",miss:"💨 빗나감",beer:"🍺 맥주",panic:"🫴 강탈"}[c]||c)+'</b><div style="display:flex;gap:5px">'+(myTurn&&["bang","beer","panic"].includes(c)?'<button class="primary" onclick="window.haniOnlineBangPlay('+i+')">사용</button>':'')+(myTurn?'<button class="secondary" onclick="window.haniOnlineBangDiscard('+i+')">버리기</button>':'')+'</div></div>').join("");
        gameBody='<section class="card" style="padding:14px;margin-top:12px"><b>내 역할: '+escHTML(priv.role)+'</b><p>내 체력 '+priv.hp+' · '+(myTurn?"내 차례":"상대 차례")+'</p><label for="bg-target">대상</label><select id="bg-target" class="input">'+targetOptions+'</select><h3>내 손패</h3><div style="display:grid;gap:7px">'+cards+'</div></section>';
      }else if(r.game==="tichu"){
        const hand=(priv.hand||[]).map((c,i)=>'<button class="'+((r.selected||[]).includes(i)?"primary":"secondary")+'" style="padding:9px 7px" onclick="window.haniOnlineToggle('+i+')">'+escHTML(c.suit+({11:"J",12:"Q",13:"K",14:"A"}[c.n]||c.n))+'</button>').join("");
        gameBody='<section class="card" style="padding:14px;margin-top:12px"><p>내 팀: '+(priv.team===0?"A":"B")+' · '+(myTurn?"내 차례":"상대 차례")+'</p><p>현재 패: '+(gs.last?escHTML(gs.last.label):"리드 없음")+' · 패스 '+gs.passes+'</p><div style="display:flex;gap:5px;flex-wrap:wrap">'+hand+'</div><div style="display:flex;gap:8px;margin-top:12px"><button class="primary" '+(!myTurn||!(r.selected||[]).length?"disabled":"")+' onclick="window.haniOnlinePlaySelected()">선택한 카드 내기</button><button class="secondary" '+(!myTurn?"disabled":"")+' onclick="window.haniOnlinePass()">패스</button></div></section>';
      }else if(r.game==="rummikub"){
        const hand=(priv.hand||[]).map((t,i)=>'<button class="'+((r.selected||[]).includes(i)?"primary":"secondary")+'" style="padding:8px 5px" onclick="window.haniOnlineToggle('+i+')">'+escHTML(t.color==="🃏"?"🃏":t.color+t.n)+'</button>').join("");
        const table=(gs.table||[]).map(ts=>'<span class="tag" style="display:inline-block;margin:3px">'+ts.map(t=>escHTML(t.color==="🃏"?"🃏":t.color+t.n)).join(" ")+'</span>').join("")||'<p class="muted">아직 등록된 조합이 없어요.</p>';
        gameBody='<section class="card" style="padding:14px;margin-top:12px"><p>내 손패 '+priv.hand.length+'개 · 타일 풀 '+gs.poolCount+'개 · '+(myTurn?"내 차례":"상대 차례")+'</p><h3>테이블</h3><div>'+table+'</div><h3>내 타일</h3><div style="display:flex;gap:5px;flex-wrap:wrap">'+hand+'</div><div style="display:flex;gap:8px;margin-top:12px"><button class="primary" '+(!myTurn||!(r.selected||[]).length?"disabled":"")+' onclick="window.haniOnlinePlaySelected()">조합 등록</button><button class="secondary" '+(!myTurn?"disabled":"")+' onclick="window.haniOnlineDraw()">타일 가져오기</button></div></section>';
      }else if(r.game==="lasvegas"){
        const dice=(priv.dice||[]).map(v=>'<span class="tag" style="display:inline-block;margin:3px;font-size:16px">🎲 '+v+'</span>').join("");
        const casinos=(gs.casinos||[]).map(c=>'<div class="card" style="padding:10px"><b>🎰 카지노 '+c.num+'</b><p>지폐 '+c.bills.map(v=>(v/1000)+'k').join(" · ")+'</p><p class="muted">'+c.placed.map((n,i)=>n?escHTML(gs.players[i].name)+" "+n+"개":"").filter(Boolean).join(" / ")+'</p><button class="primary" '+(!myTurn||!(priv.dice||[]).includes(c.num)?"disabled":"")+' onclick="window.haniOnlineLasPlace('+c.num+')">눈 '+c.num+' 배치</button></div>').join("");
        gameBody='<section class="card" style="padding:14px;margin-top:12px"><p>내 주사위 · '+(myTurn?"내 차례":"상대 차례")+'</p><div>'+dice+'</div><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px">'+casinos+'</div></section>';
      }
      if(gs.over)gameBody+='<section class="card" style="padding:14px;margin-top:12px"><h2>🏆 게임 종료</h2><p>승자: '+escHTML(gs.winner||"")+'</p><button class="primary" onclick="window.haniBoardRoomStart()">다시 시작</button></section>';
      gameBody+='<section class="card" style="padding:12px;margin-top:12px"><b>진행 기록</b>'+(gs.log||[]).slice(0,8).map(x=>'<p class="muted" style="margin:6px 0">'+escHTML(x)+'</p>').join("")+'</section>';
    }else{
      gameBody='<section class="card" style="padding:14px;margin-top:12px"><b>온라인 방 연결 완료</b><p class="muted">'+(r.game==="liar"?"라이어 게임은 비밀 제시어·채팅·투표를 서버에서 동기화합니다.":"친구가 입장하면 호스트가 게임을 시작할 수 있어요.")+'</p></section>';
    }
    let html='<div class="game-shell"><div class="game-head"><button class="secondary" onclick="window.haniBoardRoomBack()">← 게임목록</button><div class="tag">'+(labels[r.game]||r.game)+' · 온라인</div></div>';
    html+='<section class="card" style="padding:16px;margin-top:12px"><div class="section-sub">친구에게 이 코드를 보내세요</div><div style="font-size:32px;font-weight:900;letter-spacing:5px;text-align:center;margin:10px 0">'+escHTML(r.code)+'</div><button class="secondary" style="width:100%" onclick="window.copyBoardRoomCode()">방 코드 복사</button><p class="muted" style="text-align:center;margin-bottom:0">'+escHTML(r.notice||"실시간 동기화 연결 중…")+'</p></section>';
    html+='<div class="section-title">👥 참가자 ('+(st.players||[]).length+')</div><div style="display:grid;gap:8px">'+players+'</div>';
    if(isHost&&st.phase==="lobby")html+='<button class="primary" style="width:100%;margin-top:10px" onclick="window.haniBoardRoomStart()">게임 시작</button>';
    html+=gameBody;
    html+='<section class="card" style="padding:14px;margin-top:14px"><h3 style="margin-top:0">💬 방 채팅</h3><div style="max-height:240px;overflow:auto">'+chat+'</div><div style="display:flex;gap:8px;margin-top:10px"><input id="boardroom-chat-input" class="input" maxlength="200" placeholder="메시지 입력" onkeydown="if(event.key===&quot;Enter&quot;)window.haniBoardRoomChat()" style="min-width:0;flex:1"><button class="primary" onclick="window.haniBoardRoomChat()">전송</button></div></section></div>';
    $("#app").innerHTML=shell(html);
  }
})();