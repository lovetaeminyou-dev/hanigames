/* HANI BOARD GAMES: local practice prototypes */
(function(){
  const names={
    wordchain:{name:"끝말잇기 대전",icon:"가",desc:"친구와 실시간으로 단어를 이어가요"},
    bang:{name:'뱅!',icon:'🤠',desc:'역할을 숨기고 살아남는 서부 카드 대전'},
    tichu:{name:'티츄',icon:'🃏',desc:'4인 팀으로 패를 먼저 털어내는 카드게임'},
    rummikub:{name:'루미큐브',icon:'🔢',desc:'숫자 타일을 조합해 손패를 비우세요'},
    liar:{name:'라이어 게임',icon:'🤥',desc:'채팅과 투표로 라이어를 찾아내세요'},
    lasvegas:{name:'라스베가스',icon:'🎲',desc:'주사위를 카지노에 배치해 가상 지폐를 모으세요'}
  };
  try{delete GAMES.shisen;Object.assign(GAMES,names);}catch(e){}
  const oldGo=window.go;
  window.go=async function(tab,push=true){
    if(tab==='games'){S.tab='games';if(push)window.scrollTo?.(0,0);return window.haniBoardGamesLobby();}
    return oldGo(tab,push);
  };
  const oldStart=window.startGame;
  window.startGame=function(type){
    if(type==='shisen'||type==='minesweeper'){toast('이 게임은 목록에서 제외됐어요.');return;}
    if(type==='wordchain'){S.modal=null;return window.createBoardRoom('wordchain');}if(names[type]){S.modal=null;S.game={type:type};return window.haniStartBoardGame(type);}
    return oldStart(type);
  };
  window.haniBoardGamesLobby=async function(){
    const tiles=[
      arcadeCard('rps','✊','가위바위보','봇과 3판 승부','linear-gradient(145deg,#dff7ff,#9cbaff)'),
      arcadeCard('wordchain','가','끝말잇기 대전','친구와 실시간 끝말잇기','linear-gradient(145deg,#ffe8f4,#c7b5ff)'),
      ...Object.keys(names).filter(id=>id!=='wordchain').map((id,i)=>arcadeCard(id,names[id].icon,names[id].name,names[id].desc,['linear-gradient(145deg,#ffe5d9,#ffc5bc)','linear-gradient(145deg,#e3fff2,#a9e7d4)','linear-gradient(145deg,#fff1bd,#ffd88a)','linear-gradient(145deg,#eee5ff,#c6b6ff)','linear-gradient(145deg,#d9f6ff,#8edbe8)'][i]))
    ];
    $('#app').innerHTML=shell(
      '<section class="arcade-hero"><div class="arcade-orbit">✦ HANI BOARD GAME CLUB ✦</div><h1>하니 보드게임</h1><p>친구들과 모여 한 판! 방 코드를 공유해 실시간으로 대결해요.</p><div class="arcade-hero-badges"><span>🃏 카드게임</span><span>🎲 주사위</span><span>👥 온라인 대전</span></div></section>'+
      '<div class="section-title">🎮 지금 플레이</div><div class="section-sub">봇 연습 또는 친구와 실시간 대전</div><div class="arcade-game-grid">'+tiles.join('')+'</div>'+
      '<section class="card" style="padding:14px;margin-top:16px"><h3 style="margin-top:0">🔑 친구 방 코드로 참가</h3><p class="muted">친구에게 받은 방 코드를 입력해 주세요.</p><div style="display:flex;gap:8px"><input id="boardroom-code" class="input" maxlength="8" placeholder="예: A1B2C" style="text-transform:uppercase;min-width:0;flex:1"><button class="primary" onclick="window.joinBoardRoom()">참가</button></div></section>'
    );
  };
  window.haniStartBoardGame=function(type){
    if(type==='bang')return startBang();
    if(type==='tichu')return startTichu();
    if(type==='rummikub')return startRummikub();
    if(type==='liar')return startLiar();
    if(type==='lasvegas')return startLasVegas();
  };
  const escText=s=>String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const meName=()=>S.user?.nickname||S.user?.username||S.user?.name||'나';
  const gameShell=(title,body)=>{$('#app').innerHTML=gamePage(title,body);};
  const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
  const panel=body=>'<section class="card" style="padding:14px;margin-top:12px">'+body+'</section>';
  const button=(label,fn,cls='primary',disabled=false)=>'<button class="'+cls+'" '+(disabled?'disabled ':'')+'onclick="'+fn+'">'+label+'</button>';

  /* BANG! — single-browser bot practice */
  const bangLabels={bang:'뱅!',miss:'빗나감',beer:'맥주',panic:'강탈',duel:'결투'};
  const bangIcons={bang:'🔫',miss:'💨',beer:'🍺',panic:'🫴',duel:'⚔️'};
  function startBang(){
    const deck=shuffle([...Array(18).fill('bang'),...Array(10).fill('miss'),...Array(7).fill('beer'),...Array(4).fill('panic'),...Array(4).fill('duel')]);
    window.HANI_BANG={players:[{name:meName(),role:'보안관',hp:5,hand:deck.splice(0,5),bot:false,alive:true},{name:'봇 · 제시',role:'무법자',hp:4,hand:deck.splice(0,4),bot:true,alive:true},{name:'봇 · 모건',role:'배신자',hp:4,hand:deck.splice(0,4),bot:true,alive:true},{name:'봇 · 알렉스',role:'무법자',hp:4,hand:deck.splice(0,4),bot:true,alive:true}],deck:deck,selected:-1,turn:0,log:['보안관과 무법자들의 대결이 시작됐어요.'],over:false};
    renderBang();
  }
  function renderBang(msg){
    const g=HANI_BANG;if(!g)return;
    const seats=g.players.map((p,i)=>'<div class="card" style="padding:10px;text-align:center;opacity:'+(p.alive?1:.45)+'"><div style="font-size:26px">'+(p.alive?'🤠':'💀')+'</div><b>'+escText(p.name)+'</b><div>❤️ '+p.hp+'</div><small>'+(i===0?'내 역할: 보안관':p.alive?'손패 '+p.hand.length+'장':'탈락')+'</small></div>').join('');
    const hand=g.players[0].hand.map((c,i)=>'<button class="'+(g.selected===i?'primary':'secondary')+'" style="min-width:72px;padding:12px 8px" onclick="window.HANI_BANG.selected='+i+';window.haniBangRender()">'+bangIcons[c]+'<br>'+bangLabels[c]+'</button>').join('');
    gameShell('🤠 뱅!',panel('<div class="section-sub">봇 연습 · 내 체력 '+g.players[0].hp+'</div><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">'+seats+'</div>')+
      panel('<h3 style="margin-top:0">'+(g.over?'🏁 게임 종료':g.turn===0?'내 차례':'봇 차례')+'</h3><p>'+(msg||'카드를 선택하고 사용할 행동을 골라주세요.')+'</p><div style="display:flex;gap:7px;flex-wrap:wrap">'+hand+'</div><div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:12px">'+button('선택 카드 사용','window.haniBangPlay()','primary',g.over||g.turn!==0||g.selected<0)+button('카드 1장 버리기','window.haniBangDiscard()','secondary',g.over||g.turn!==0||g.selected<0)+'</div>')+
      panel('<b>최근 진행</b>'+g.log.slice(0,6).map(x=>'<p class="muted" style="margin:6px 0">• '+escText(x)+'</p>').join(''))+
      (g.over?button('다시 하기','window.startGame(\'bang\')','primary'):''));
  }
  window.haniBangRender=()=>renderBang();
  window.haniBangDiscard=function(){const g=HANI_BANG;if(!g||g.over||g.turn!==0||g.selected<0)return;g.players[0].hand.splice(g.selected,1);g.selected=-1;bangDraw(g.players[0],1);bangNext();};
  window.haniBangPlay=function(){
    const g=HANI_BANG;if(!g||g.over||g.turn!==0||g.selected<0)return;
    const p=g.players[0],c=p.hand.splice(g.selected,1)[0];g.selected=-1;
    if(c==='beer'){p.hp=Math.min(5,p.hp+1);g.log.unshift('맥주를 마셔 체력을 회복했어요.');}
    else if(c==='miss'){g.log.unshift('빗나감 카드를 사용했어요.');}
    else if(c==='panic'){const target=g.players.find((x,i)=>i>0&&x.alive&&x.hand.length);if(target&&target.hand.length){target.hand.pop();g.log.unshift(target.name+'에게서 카드를 빼앗았어요.');}}
    else if(c==='duel'||c==='bang'){const target=g.players.find((x,i)=>i>0&&x.alive);if(target){target.hp--;g.log.unshift(p.name+'이(가) '+target.name+'에게 '+bangLabels[c]+' 공격!');if(target.hp<=0){target.alive=false;g.log.unshift(target.name+' 탈락!');}}}
    if(g.players.filter(x=>x.alive).length<=1||g.players[0].hp<=0){g.over=true;g.log.unshift(g.players[0].alive?'🎉 승리!':'패배했어요.');renderBang();return;}
    bangDraw(p,1);bangNext();
  };
  function bangDraw(p,n){for(let i=0;i<n;i++){if(!HANI_BANG.deck.length)HANI_BANG.deck=shuffle(['bang','bang','miss','beer','panic','duel']);p.hand.push(HANI_BANG.deck.pop());}}
  function bangNext(){const g=HANI_BANG;if(g.over)return;g.turn=1;renderBang();setTimeout(()=>{if(!HANI_BANG||HANI_BANG.over)return;const alive=HANI_BANG.players.filter((p,i)=>i>0&&p.alive);if(!alive.length){HANI_BANG.over=true;renderBang('모든 상대가 탈락했어요!');return;}const bot=alive[Math.floor(Math.random()*alive.length)];const me=HANI_BANG.players[0];if(bot.hand.includes('beer')&&bot.hp<3){bot.hand.splice(bot.hand.indexOf('beer'),1);bot.hp++;}else if(me.alive){me.hp--;HANI_BANG.log.unshift(bot.name+'이(가) 뱅!을 사용했어요.');if(me.hp<=0){me.alive=false;HANI_BANG.over=true;}}bot.hand.shift();bangDraw(bot,1);if(HANI_BANG.players.filter(p=>p.alive).length<=1)HANI_BANG.over=true;HANI_BANG.turn=0;renderBang();},650);}

  /* TICHU — simplified four-seat shedding game */
  function tichuDeck(){const d=[];for(const suit of ['♣','♦','♥','♠'])for(let n=2;n<=14;n++)d.push({suit:suit,n:n});d.push({suit:'🀄',n:1},{suit:'🐕',n:0},{suit:'🐦',n:15},{suit:'🐉',n:16});return shuffle(d);}
  function tichuLabel(c){return c.suit==='🀄'?'麻雀':c.suit==='🐕'?'개':c.suit==='🐦'?'봉황':c.suit==='🐉'?'용':c.suit+({11:'J',12:'Q',13:'K',14:'A'}[c.n]||c.n);}
  function startTichu(){const d=tichuDeck();window.HANI_TICHU={players:[{name:meName(),hand:d.splice(0,14),team:0,bot:false},{name:'봇 · 청룡',hand:d.splice(0,14),team:1,bot:true},{name:'봇 · 토끼',hand:d.splice(0,14),team:0,bot:true},{name:'봇 · 불새',hand:d.splice(0,14),team:1,bot:true}],turn:0,selected:[],last:null,passes:0,log:['4인 티츄 시작! 내 파트너는 맞은편 자리예요.'],over:false,winner:''};renderTichu();}
  function renderTichu(msg){const g=HANI_TICHU;if(!g)return;const seats=g.players.map((p,i)=>'<div class="card" style="padding:9px;text-align:center"><b>'+escText(p.name)+'</b><div>팀 '+(p.team?'B':'A')+'</div><div>🃏 '+p.hand.length+'장</div></div>').join('');const hand=g.players[0].hand.map((c,i)=>'<button class="'+(g.selected.includes(i)?'primary':'secondary')+'" style="min-width:42px;padding:10px 5px" onclick="window.haniTichuToggle('+i+')">'+escText(tichuLabel(c))+'</button>').join('');gameShell('🃏 티츄',panel('<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px">'+seats+'</div><p>현재 낸 패: '+(g.last?g.last.label:'리드 없음')+' · 패스 '+g.passes+'/3</p>')+panel('<h3 style="margin-top:0">'+(g.over?'라운드 종료':g.turn===0?'내 차례':'상대 차례')+'</h3><p>'+(msg||'같은 숫자 카드 또는 더 높은 한 장을 선택하세요.')+'</p><div style="display:flex;gap:5px;flex-wrap:wrap">'+hand+'</div><div style="display:flex;gap:8px;margin-top:12px">'+button('내기','window.haniTichuPlay()','primary',g.turn!==0||g.over||!g.selected.length)+button('패스','window.haniTichuPass()','secondary',g.turn!==0||g.over)+'</div>')+panel('<b>최근 진행</b>'+g.log.slice(0,5).map(x=>'<p class="muted">• '+escText(x)+'</p>').join(''))+(g.over?button('다시 하기','window.startGame(\'tichu\')'):''));
  }
  window.haniTichuToggle=i=>{const g=HANI_TICHU;if(!g||g.turn!==0||g.over)return;g.selected.includes(i)?g.selected=g.selected.filter(x=>x!==i):g.selected.push(i);renderTichu();};
  window.haniTichuPlay=function(){const g=HANI_TICHU;if(!g||g.turn!==0||g.over||!g.selected.length)return;const cards=g.selected.map(i=>g.players[0].hand[i]);if(cards.length>1&&!cards.every(c=>c.n===cards[0].n)){toast('연습 버전은 같은 숫자 조합만 지원해요.');return;}const power=Math.max(...cards.map(c=>c.n));if(g.last&&power<=g.last.power){toast('현재 패보다 높은 카드를 내야 해요.');return;}g.players[0].hand=g.players[0].hand.filter((c,i)=>!g.selected.includes(i));g.last={power:power,label:cards.map(tichuLabel).join(' ')};g.selected=[];g.passes=0;g.log.unshift('내가 '+g.last.label+' 을(를) 냈어요.');if(!g.players[0].hand.length){g.over=true;g.winner='내 팀';renderTichu('🏆 내가 먼저 패를 비웠어요!');return;}g.turn=1;renderTichu();setTimeout(tichuBot,600);};
  window.haniTichuPass=function(){const g=HANI_TICHU;if(!g||g.turn!==0||g.over)return;g.passes++;g.selected=[];g.log.unshift('내가 패스했어요.');if(g.passes>=3){g.last=null;g.passes=0;g.turn=0;renderTichu('모두 패스! 새 조합을 시작하세요.');return;}g.turn=1;renderTichu();setTimeout(tichuBot,500);};
  function tichuBot(){const g=HANI_TICHU;if(!g||g.over)return;for(let i=1;i<4;i++){const p=g.players[i];if(!p.hand.length)continue;const choices=p.hand.filter(c=>!g.last||c.n>g.last.power).sort((a,b)=>a.n-b.n);if(choices.length&&Math.random()>.25){const c=choices[0];p.hand.splice(p.hand.indexOf(c),1);g.last={power:c.n,label:tichuLabel(c)};g.passes=0;g.log.unshift(p.name+'이(가) '+g.last.label+' 을(를) 냈어요.');if(!p.hand.length){g.over=true;g.winner=p.team===0?'내 팀':'상대 팀';break;}}else{g.passes++;g.log.unshift(p.name+' 패스');}if(g.passes>=3){g.last=null;g.passes=0;break;}}g.turn=0;renderTichu(g.over?'🏁 '+g.winner+' 승리!':'내 차례예요.');}

  /* RUMMIKUB — sets/runs and bot practice */
  function rummiDeck(){const d=[];for(let cp=0;cp<2;cp++)for(const color of ['🔴','🔵','🟠','⚫'])for(let n=1;n<=13;n++)d.push({id:cp+'-'+color+'-'+n,color:color,n:n});d.push({id:'j1',color:'🃏',n:0},{id:'j2',color:'🃏',n:0});return shuffle(d);}
  function startRummikub(){const d=rummiDeck();window.HANI_RUMMI={players:[{name:meName(),hand:d.splice(0,14),bot:false,opened:false},{name:'봇 · 구름',hand:d.splice(0,14),bot:true,opened:false},{name:'봇 · 별',hand:d.splice(0,14),bot:true,opened:false},{name:'봇 · 달',hand:d.splice(0,14),bot:true,opened:false}],pool:d,table:[],selected:[],turn:0,log:['같은 숫자 다른 색 3개 이상 또는 같은 색 연속 숫자 3개 이상을 조합하세요.'],over:false};renderRummi();}
  function rummiValid(ts){if(ts.length<3)return false;const normal=ts.filter(t=>t.color!=='🃏');if(!normal.length)return false;const nums=new Set(normal.map(t=>t.n)),colors=new Set(normal.map(t=>t.color));if(nums.size===1&&colors.size===normal.length&&ts.length<=4)return true;if(colors.size===1){const ns=normal.map(t=>t.n).sort((a,b)=>a-b);if(new Set(ns).size===ns.length&&ns[ns.length-1]-ns[0]+1===ts.length)return true;}return false;}
  function findRummi(hand){for(let a=0;a<hand.length;a++)for(let b=a+1;b<hand.length;b++)for(let c=b+1;c<hand.length;c++){const ts=[hand[a],hand[b],hand[c]];if(rummiValid(ts))return [a,b,c];}return null;}
  function renderRummi(msg){const g=HANI_RUMMI;if(!g)return;const hand=g.players[0].hand.map((t,i)=>'<button class="'+(g.selected.includes(i)?'primary':'secondary')+'" style="min-width:38px;padding:9px 5px" onclick="window.haniRummiToggle('+i+')">'+(t.color==='🃏'?'🃏':t.color+t.n)+'</button>').join('');const table=g.table.map(ts=>'<span class="tag" style="margin:3px;display:inline-block">'+ts.map(t=>t.color==='🃏'?'🃏':t.color+t.n).join(' ')+'</span>').join('')||'<span class="muted">아직 등록된 조합이 없어요</span>';gameShell('🔢 루미큐브',panel('<div class="section-sub">내 손패 '+g.players[0].hand.length+'개 · 타일 풀 '+g.pool.length+'개</div><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px">'+g.players.map(p=>'<div class="card" style="padding:8px;text-align:center"><b>'+escText(p.name)+'</b><div>'+p.hand.length+'개</div></div>').join('')+'</div><h3>테이블</h3><div style="display:flex;gap:5px;flex-wrap:wrap">'+table+'</div>')+panel('<h3 style="margin-top:0">'+(g.turn===0?'내 차례':'봇 차례')+'</h3><p>'+(msg||'유효한 조합을 선택해 등록하세요. 첫 등록은 숫자 합계 30 이상이에요.')+'</p><div style="display:flex;gap:5px;flex-wrap:wrap">'+hand+'</div><div style="display:flex;gap:8px;margin-top:12px">'+button('조합 등록','window.haniRummiPlay()','primary',g.turn!==0||!g.selected.length||g.over)+button('타일 가져오기','window.haniRummiDraw()','secondary',g.turn!==0||g.over)+'</div>')+panel('<b>진행 기록</b>'+g.log.slice(0,5).map(x=>'<p class="muted">• '+escText(x)+'</p>').join(''))+(g.over?button('다시 하기','window.startGame(\'rummikub\')'):''));
  }
  window.haniRummiToggle=i=>{const g=HANI_RUMMI;if(!g||g.turn!==0||g.over)return;g.selected.includes(i)?g.selected=g.selected.filter(x=>x!==i):g.selected.push(i);renderRummi();};
  window.haniRummiPlay=function(){const g=HANI_RUMMI;if(!g||g.turn!==0||g.over)return;const p=g.players[0],ts=g.selected.map(i=>p.hand[i]);if(!rummiValid(ts)){toast('유효한 세트 또는 연속 숫자 3개 이상을 선택해줘!');return;}if(!p.opened&&ts.reduce((a,t)=>a+(t.n||0),0)<30){toast('첫 등록은 숫자 합계 30 이상이어야 해요.');return;}p.opened=true;g.table.push(ts);p.hand=p.hand.filter((t,i)=>!g.selected.includes(i));g.selected=[];g.log.unshift('내가 '+ts.map(t=>t.color==='🃏'?'🃏':t.color+t.n).join(' ')+' 조합을 등록했어요.');if(!p.hand.length){g.over=true;renderRummi('🏆 루미큐브 승리!');return;}g.turn=1;renderRummi();setTimeout(rummiBot,600);};
  window.haniRummiDraw=function(){const g=HANI_RUMMI;if(!g||g.turn!==0||g.over)return;if(g.pool.length)g.players[0].hand.push(g.pool.pop());g.selected=[];g.turn=1;renderRummi();setTimeout(rummiBot,600);};
  function rummiBot(){const g=HANI_RUMMI;if(!g||g.over)return;for(let i=1;i<4;i++){const p=g.players[i],combo=findRummi(p.hand);if(combo&&(!p.opened||combo.reduce((a,k)=>a+(p.hand[k].n||0),0)>=30)){const ts=combo.map(k=>p.hand[k]);p.hand=p.hand.filter((t,k)=>!combo.includes(k));p.opened=true;g.table.push(ts);g.log.unshift(p.name+'이(가) 조합을 등록했어요.');if(!p.hand.length){g.over=true;g.log.unshift(p.name+' 승리!');break;}}else if(g.pool.length)p.hand.push(g.pool.pop());}g.turn=0;renderRummi(g.over?'게임이 끝났어요.':'내 차례예요.');}

  /* LIAR — chat, vote, hidden clue (local bots) */
  const liarWords=[['음식','김치찌개','된장찌개'],['동물','기린','코끼리'],['장소','놀이공원','워터파크'],['게임','오버워치','리그 오브 레전드'],['간식','붕어빵','호떡'],['교통','지하철','버스'],['가전','에어컨','선풍기'],['과일','수박','멜론']];
  function startLiar(){const w=liarWords[Math.floor(Math.random()*liarWords.length)],liar=Math.floor(Math.random()*5);window.HANI_LIAR={category:w[0],word:w[1],liarWord:w[2],liar:liar,players:[meName(),'봇 · 모찌','봇 · 구름','봇 · 별','봇 · 달'].map((name,i)=>({name:name,bot:i>0,vote:-1})),phase:'chat',chat:[{name:'시스템',text:'제시어를 보고 자유롭게 대화해 보세요. 라이어는 비슷하지만 다른 단어를 받았어요.'}],result:''};renderLiar();}
  function renderLiar(msg){const g=HANI_LIAR;if(!g)return;const clue=g.liar===0?g.liarWord:g.word;const chat=g.chat.map(x=>'<div style="padding:7px 0;border-bottom:1px solid #e8edf5"><b>'+escText(x.name)+'</b>　'+escText(x.text)+'</div>').join('');let body='<div class="card" style="padding:12px;background:#f3f8ff"><small>카테고리 · '+escText(g.category)+'</small><h2 style="margin:6px 0">'+(g.phase==='chat'?escText(clue):'🔒 제시어 공개')+'</h2><p class="muted">내 역할: '+(g.liar===0?'🤥 라이어':'🙂 시민')+'</p></div><p>'+(msg||'제시어를 직접 말하지 말고 힌트를 주고받으세요.')+'</p><div style="max-height:250px;overflow:auto">'+chat+'</div>';if(g.phase==='chat')body+='<div style="display:flex;gap:7px;margin-top:10px"><input id="hani-liar-input" class="input" placeholder="채팅 입력" maxlength="100" onkeydown="if(event.key===\'Enter\')window.haniLiarSend()"><button class="primary" onclick="window.haniLiarSend()">전송</button></div>'+button('대화 종료 · 투표하기','window.haniLiarVoteStart()','primary');else if(g.phase==='vote')body+='<h3>누가 라이어일까요?</h3><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">'+g.players.map((p,i)=>button(escText(p.name),'window.haniLiarVote('+i+')','secondary')).join('')+'</div>';else body+='<h2>🗳️ 투표 결과</h2><p>'+escText(g.result)+'</p><p>정답 제시어: '+escText(g.word)+' · 라이어 제시어: '+escText(g.liarWord)+'</p>'+button('다음 라운드','window.startGame(\'liar\')');gameShell('🤥 라이어 게임',panel(body));}
  window.haniLiarSend=function(){const g=HANI_LIAR;if(!g||g.phase!=='chat')return;const el=$('#hani-liar-input'),msg=(el?.value||'').trim();if(!msg)return;g.chat.push({name:meName(),text:msg});const replies=['그거랑 비슷한 것 같아ㅋㅋ','너무 직접적인 힌트 아니야?','나는 다른 게 떠올랐어.','이거 아는 사람은 바로 알 듯!','음… 설명하기 어렵네.'];for(let i=1;i<5;i++)g.chat.push({name:g.players[i].name,text:replies[Math.floor(Math.random()*replies.length)]});g.chat=g.chat.slice(-14);renderLiar();};
  window.haniLiarVoteStart=function(){const g=HANI_LIAR;if(!g||g.phase!=='chat')return;g.phase='vote';g.players.forEach((p,i)=>{if(i>0)p.vote=Math.floor(Math.random()*5);});renderLiar();};
  window.haniLiarVote=function(i){const g=HANI_LIAR;if(!g||g.phase!=='vote')return;g.players[0].vote=i;const counts=[0,0,0,0,0];g.players.forEach(p=>{if(p.vote>=0)counts[p.vote]++;});const max=Math.max(...counts),top=counts.map((n,k)=>n===max?k:-1).filter(k=>k>=0),out=top.includes(g.liar)?g.liar:top[0];g.result=out===g.liar?'🎉 라이어를 찾았어요!':'😈 라이어를 찾지 못했어요.';g.result+=' 가장 많은 표를 받은 사람: '+g.players[out].name;g.phase='result';renderLiar();};

  /* LAS VEGAS — dice and virtual banknotes */
  function startLasVegas(){const money=[90000,80000,70000,60000,50000,40000,30000,20000,10000];const casinos=Array.from({length:6},(_,i)=>({num:i+1,bills:shuffle(money.slice()).slice(0,2),placed:[[],[],[],[]]}));window.HANI_LAS={players:[meName(),'봇 · 구름','봇 · 별','봇 · 달'].map((name,i)=>({name:name,bot:i>0,dice:Array.from({length:8},()=>1+Math.floor(Math.random()*6)),money:0})),casinos:casinos,turn:0,log:['라스베가스 시작! 주사위를 선택한 뒤 같은 눈의 카지노에 배치하세요.'],over:false};renderLas();}
  function renderLas(msg){const g=HANI_LAS;if(!g)return;const p=g.players[0];const dice=p.dice.map((v,i)=>'<button class="secondary" style="font-size:22px;padding:8px;min-width:42px" onclick="window.haniLasPick('+v+')">🎲 '+v+'</button>').join('');const casinos=g.casinos.map(c=>'<div class="card" style="padding:10px;text-align:center"><b>🎰 카지노 '+c.num+'</b><div style="font-size:12px;margin:5px 0">지폐 '+c.bills.map(n=>(n/1000)+'k').join(' · ')+'</div><div class="muted" style="font-size:12px">배치: '+c.placed.map((a,i)=>a.length?g.players[i].name+' '+a.length+'개':'').filter(Boolean).join(' / ')+'</div>'+button('눈 '+c.num+' 배치','window.haniLasPlace('+c.num+')','primary',g.turn!==0||g.over||!p.dice.includes(c.num))+'</div>').join('');gameShell('🎲 라스베가스',panel('<div class="section-sub">라운드 1 · 내 남은 주사위 '+p.dice.length+'</div><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px">'+g.players.map(x=>'<div class="card" style="padding:8px;text-align:center"><b>'+escText(x.name)+'</b><div>💵 '+x.money.toLocaleString()+'원</div><small>🎲 '+x.dice.length+'개</small></div>').join('')+'</div><p>'+(msg||'카지노 숫자와 같은 눈이 나온 주사위를 모두 배치하세요.')+'</p><div style="display:flex;gap:5px;flex-wrap:wrap">'+dice+'</div>')+panel('<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">'+casinos+'</div>')+panel('<b>진행 기록</b>'+g.log.slice(0,5).map(x=>'<p class="muted">• '+escText(x)+'</p>').join(''))+(g.over?button('다시 하기','window.startGame(\'lasvegas\')'):''));}
  window.haniLasPick=function(v){const g=HANI_LAS;if(!g||g.turn!==0||g.over)return;g.pick=v;renderLas('선택한 주사위 눈: '+v+'. 카지노 '+v+'에 배치하세요.');};
  window.haniLasPlace=function(num){const g=HANI_LAS;if(!g||g.turn!==0||g.over)return;const p=g.players[0],v=g.pick||num;if(v!==num||!p.dice.includes(num)){toast('카지노 번호와 같은 눈의 주사위를 선택해줘!');return;}const n=p.dice.filter(x=>x===num).length;p.dice=p.dice.filter(x=>x!==num);g.casinos[num-1].placed[0].push(...Array(n).fill(num));g.log.unshift(p.name+'이(가) 카지노 '+num+'에 '+n+'개 배치했어요.');g.pick=null;lasAdvance();}
  function lasAdvance(){const g=HANI_LAS;if(g.players.every(p=>!p.dice.length)){lasScore();return;}g.turn=1;renderLas();setTimeout(lasBot,500);}
  function lasBot(){const g=HANI_LAS;if(!g||g.over)return;for(let i=1;i<4;i++){const p=g.players[i];if(!p.dice.length)continue;const counts={};p.dice.forEach(v=>counts[v]=(counts[v]||0)+1);const num=Number(Object.keys(counts).sort((a,b)=>counts[b]-counts[a]||b-a)[0]);p.dice=p.dice.filter(v=>v!==num);g.casinos[num-1].placed[i].push(...Array(counts[num]).fill(num));g.log.unshift(p.name+'이(가) 카지노 '+num+'에 주사위 '+counts[num]+'개 배치');}if(g.players.every(p=>!p.dice.length))lasScore();else{g.turn=0;renderLas('내 차례예요.');}}
  function lasScore(){const g=HANI_LAS;g.casinos.forEach(c=>{const ranks=g.players.map((p,i)=>({i,n:c.placed[i].length})).sort((a,b)=>b.n-a.n);if(!ranks[0].n||ranks[0].n===ranks[1].n)return;const bill=c.bills.pop()||10000;g.players[ranks[0].i].money+=bill;g.log.unshift('카지노 '+c.num+' 지폐 '+bill.toLocaleString()+'원: '+g.players[ranks[0].i].name+' 획득!');});g.over=true;const win=g.players.slice().sort((a,b)=>b.money-a.money)[0];g.log.unshift('🏆 최종 승자: '+win.name+' ('+win.money.toLocaleString()+'원)');renderLas('게임 종료! 가상 지폐 점수를 확인하세요.');}

})();