const GAMES={
  shisen:{name:"사천성",icon:"🀄",desc:"같은 타일을 두 번 이하로 꺾어 연결해 모두 제거하세요."},
  holdem:{name:"텍사스 홀덤",icon:"♠️",desc:"공용 카드 5장과 내 카드 2장으로 최고의 족보를 만들어 보세요."}
};

let S={
  user:null,
  tab:"home",
  modal:null,
  rooms:{},
  game:null
};

const $=s=>document.querySelector(s);

const esc=s=>String(s??"").replace(
  /[&<>"']/g,
  m=>({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  }[m])
);

async function api(url,opt={}){
  const token=localStorage.getItem("haniToken");

  opt.headers={
    ...(opt.headers||{}),
    ...(token?{Authorization:`Bearer ${token}`}:{})
  };

  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),5000);
  opt.signal=controller.signal;

  let r;
  try{
    r=await fetch(url,opt);
  }catch(e){
    if(e?.name==="AbortError") throw new Error("서버 응답이 늦어요. 잠시 후 다시 시도해주세요.");
    throw e;
  }finally{
    clearTimeout(timeout);
  }

  const t=await r.text();

  let d={};

  try{
    d=JSON.parse(t);
  }catch{
    d={error:t};
  }

  if(!r.ok){
    throw new Error(
      d.error||"요청에 실패했습니다."
    );
  }

  return d;
}

function save(u,t){
  S.user=u;

  localStorage.setItem(
    "haniUser",
    JSON.stringify(u)
  );

  if(t){
    localStorage.setItem(
      "haniToken",
      t
    );
  }
}

function logout(){
  localStorage.removeItem("haniUser");
  localStorage.removeItem("haniToken");

  S.user=null;

  render();
}

function levelNeed(l){
  return 100+(l-1)*80;
}

function bunny(evo){
  return [
    "🐰",
    "🐇",
    "✨🐰",
    "👑🐰",
    "💎🐰",
    "🌟🐰"
  ][Math.min(evo,5)];
}


/* =========================================================
   관리자 공지
========================================================= */

function notice(){

  const n=window.HANI_NOTICE||{
    message:"하니게임즈에 오신 것을 환영해요 🐰💙",
    button_text:"확인",
    button_link:""
  };

  return `
    <div class="notice">
      <span>
        📢 ${esc(
          n.message||
          "하니게임즈에 오신 것을 환영해요 🐰💙"
        )}
      </span>

      <button onclick="noticeAction()">
        ${esc(
          n.button_text||
          "확인"
        )}
      </button>
    </div>
  `;
}

function noticeAction(){

  const url=
    String(
      window.HANI_NOTICE?.button_link||""
    ).trim();

  if(
    /^https?:\/\//i.test(url)
  ){

    window.open(
      url,
      "_blank",
      "noopener,noreferrer"
    );

  }else{

    toast(
      "공지사항을 확인해주세요 💙"
    );
  }
}


/* =========================================================
   SHELL
========================================================= */

function shell(body){

  return `
    <div class="shell">

      <header class="topbar">

        <div class="brand">
          <span class="logo">🐰</span>
          하니게임즈
        </div>

        <div class="top-actions">

          <span class="pill" id="online-count">🟢 접속자 0명</span>

          <button
            class="pill"
            onclick="openModal('profile')"
          >
            🔔
          </button>

        </div>

      </header>

      ${notice()}

      <main class="content">
        ${body}
      </main>

      ${nav()}

    </div>
  `;
}

function nav(){

  const ns=[
    ["home","🏠","내 하니"],
    ["games","🎮","게임"],
    ["ranks","🌍","랭킹"],
    ["news","👥","소식"],
    ["profile","📖","기록"]
  ];

  return `
    <nav class="bottom-nav">

      ${ns.map(n=>`

        <button
          class="navbtn ${
            S.tab===n[0]?"active":""
          }"
          onclick="go('${n[0]}')"
        >

          <b>${n[1]}</b>
          ${n[2]}

        </button>

      `).join("")}

    </nav>
  `;
}


/* =========================================================
   LOGIN
========================================================= */

function render(){

  if(!S.user){

    $("#app").innerHTML=
      loginPage();

    return;
  }

  go(
    S.tab,
    false
  );
}

function loginPage(){

  return `
    <div class="login">

      <div class="card login-card">

        <div class="login-bunny">
          🐰
        </div>

        <h1>하니게임즈</h1>

        <p class="center muted">
          하니를 키우고 게임하며 함께 놀아요 💚
        </p>

        <div class="field">
          <label>닉네임</label>
          <input
            id="loginName"
            placeholder="닉네임"
          >
        </div>

        <div class="field">
          <label>비밀번호</label>
          <input
            id="loginPw"
            type="password"
            placeholder="4자 이상"
          >
        </div>

        <button
          class="primary full"
          onclick="login()"
        >
          로그인
        </button>

        <button
          class="secondary full"
          style="margin-top:9px"
          onclick="register()"
        >
          새 계정 만들기
        </button>

        <p class="login-note">
          테스트 계정이 없다면
          새 계정을 먼저 만들어 주세요.
        </p>

      </div>

    </div>
  `;
}

async function login(){

  try{

    const d=
      await api(
        "/api/login",
        {
          method:"POST",
          headers:{
            "Content-Type":
              "application/json"
          },
          body:JSON.stringify({
            username:
              $("#loginName").value,
            password:
              $("#loginPw").value
          })
        }
      );

    save(
      d.user,
      d.token
    );

    S.tab="home";

    render();

  }catch(e){

    toast(
      e.message
    );
  }
}

async function register(){

  try{

    const u=
      $("#loginName")
        .value
        .trim();

    const p=
      $("#loginPw")
        .value;

    if(
      !u||
      p.length<4
    ){

      throw Error(
        "닉네임과 4자 이상 비밀번호를 입력해 주세요."
      );
    }

    const d=
      await api(
        "/api/register",
        {
          method:"POST",
          headers:{
            "Content-Type":
              "application/json"
          },
          body:JSON.stringify({
            username:u,
            password:p
          })
        }
      );

    save(
      d.user,
      d.token
    );

    S.tab="home";

    render();

  }catch(e){

    toast(
      e.message
    );
  }
}


/* =========================================================
   NAVIGATION
========================================================= */

async function go(
  tab,
  push=true
){

  S.tab=tab;

  if(tab==="home")
    home();

  else if(tab==="games")
    await games();

  else if(tab==="ranks")
    ranks();

  else if(tab==="news")
    await news();

  else if(tab==="profile")
    profile();

  if(push)
    scrollTo(0,0);
}


window.go=go;

async function checkAttendance(){
  if(window.__attendanceBusy)return;
  window.__attendanceBusy=true;
  try{
    const d=await api("/api/attendance",{method:"POST"});
    if(d.user) S.user=d.user;
    toast(d.message || "출석 완료!");
    await home();
  }catch(e){
    toast(e.message || "출석체크에 실패했어요.");
  }finally{
    window.__attendanceBusy=false;
  }
}

/* =========================================================
   HOME
========================================================= */

async function home(){

  // 화면은 현재 로그인 정보를 사용해 즉시 그립니다.
  // /api/me가 느려도 버튼과 하단 메뉴가 멈추지 않도록 합니다.
  const u=S.user;
  if(!u){
    return logout();
  }

  // 최신 포인트/레벨 정보는 백그라운드에서 갱신합니다.
  if(!window.__homeRefreshPending){
    window.__homeRefreshPending=true;
    api("/api/me").then(d=>{
      if(d.user) S.user=d.user;
    }).catch(()=>{}).finally(()=>{
      window.__homeRefreshPending=false;
    });
  }

  const need=
    levelNeed(
      u.level
    );

  const pct=
    Math.min(
      100,
      Math.round(
        u.xp/need*100
      )
    );

  $("#app").innerHTML=
    shell(`


      <section class="card" style="padding:16px;margin-top:14px;display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div>
          <div style="font-weight:950;font-size:18px">📅 오늘 출석체크</div>
          <div class="muted" style="margin-top:4px">매일 출석하고 포인트를 받아요!</div>
        </div>
        <button class="primary" style="white-space:nowrap;font-size:15px;padding:11px 14px" onclick="checkAttendance()">출석하기</button>
      </section>

      <section class="card hero">

        <div class="hero-main">

          <div class="bunny-box">
            <div class="bunny">
              ${bunny(u.evolution)}
            </div>
          </div>

          <div>

            <div class="eyebrow">
              토끼콩 ·
              ${u.evolution+1}세대
            </div>

            <div class="name">
              💎 ${esc(u.username)}
            </div>

            <div class="tagrow">

              <span class="tag">
                Lv.${u.level}
              </span>

              <span class="tag">
                ✨ ${esc(u.title)}
              </span>

              <span class="tag">
                전적
                ${u.wins}승
                ${u.losses}패
              </span>

            </div>

            <p class="muted">
              생활 상태가 안정적입니다.
            </p>

          </div>

        </div>

        <div class="stats">

          <div class="stat">
            <small>포인트</small>
            <strong>
              ${u.points.toLocaleString()}P
            </strong>
          </div>

          <div class="stat">
            <small>레벨</small>
            <strong>
              Lv.${u.level}
            </strong>
          </div>

          <div class="stat">
            <small>체력</small>
            <strong>
              ${u.energy}%
            </strong>
          </div>

          <div class="stat">
            <small>포만감</small>
            <strong>
              ${u.fullness}%
            </strong>
          </div>

        </div>

        <div
          style="
            margin-top:16px;
            font-weight:850
          "
        >

          Lv.${u.level+1}까지
          ${Math.max(
            0,
            need-u.xp
          )} XP 남음

          <span style="float:right">
            ${u.xp} / ${need}
          </span>

        </div>

        <div class="progress">
          <i
            style="width:${pct}%"
          ></i>
        </div>

      </section>


      <div class="section-title">
        오늘의 생활 행동
      </div>


      <div class="action-grid">

        ${actionCard(
          "💼",
          "일하기",
          "+500P · 체력 -5 · 포만감 -4",
          "work"
        )}

        ${actionCard(
          "🍳",
          "요리하기",
          "포만감 +20 · 체력 -3",
          "cook"
        )}

        ${actionCard(
          "🛋️",
          "쉬기",
          "체력 +30 · 포만감 -2",
          "rest"
        )}

      </div>


      <div class="section-title">
        오늘의 하니력
      </div>

      <div class="section-sub">
        생활과 게임을 하면서
        기록을 채워보세요.
      </div>


      <div
        class="card"
        style="padding:14px"
      >

        <div class="stats">

          ${
            [
              "생활 행동",
              "개인게임",
              "오목게임",
              "사천성",
              "테트리스",
              "지뢰찾기"
            ]
            .map(
              (x,i)=>`

                <div class="stat">

                  <small>
                    ${x}
                  </small>

                  <strong>
                    ${
                      i<2
                      ?"0/3"
                      :"미완료"
                    }
                  </strong>

                </div>

              `
            )
            .join("")
          }

        </div>

      </div>


      <div class="section-title">
        최근 소식
      </div>

      <div class="card news">

        ${
          newsItems()
            .slice(0,4)
            .map(newsRow)
            .join("")
        }

      </div>

    `);
}

function actionCard(
  icon,
  title,
  desc,
  action
){

  return `
    <button
      class="card action"
      onclick="doAction('${action}')"
    >

      <span class="emoji">
        ${icon}
      </span>

      <span>

        <strong>
          ${title}
        </strong>

        <small>
          ${desc}
        </small>

      </span>

    </button>
  `;
}

async function doAction(a){
  if(window.__actionBusy)return;
  window.__actionBusy=true;
  try{

    const d=
      await api(
        "/api/action",
        {
          method:"POST",
          headers:{
            "Content-Type":
              "application/json"
          },
          body:JSON.stringify({
            action:a
          })
        }
      );

    S.user=d.user;

    toast(
      d.message
    );

    home();

  }catch(e){

    toast(
      e.message
    );
  }
}


/* =========================================================
   GAMES
========================================================= */

async function games(){
  let rooms=[];
  try{const d=await api("/api/rooms?game=holdem");rooms=d.rooms||[]}catch{}
  const stakeOptions=[100,500,1000,5000];
  $("#app").innerHTML=shell(`
    <div class="section-title">게임</div>
    <div class="section-sub">사천성 · 텍사스 홀덤</div>
    <div class="game-grid">${gameCard("shisen",GAMES.shisen)}${gameCard("holdem",GAMES.holdem)}</div>
    <section class="card" style="margin-top:18px;padding:16px">
      <h2 style="margin-top:0">♠️ 홀덤 테이블</h2>
      <p class="section-sub">방마다 참가 포인트가 달라요. 사람이 없으면 봇과 연습할 수 있어요.</p>
      <label for="holdem-stake">참가 포인트</label>
      <select id="holdem-stake" class="input" style="width:100%;margin:8px 0 12px">
        ${stakeOptions.map(n=>'<option value="'+n+'">'+n.toLocaleString()+' P 테이블</option>').join("")}
      </select>
      <button class="primary" style="width:100%" onclick="window.createHoldemRoom()">테이블 만들기</button>
    </section>
    <div class="section-title" style="margin-top:22px">열린 홀덤 방</div>
    <div class="section-sub">참가 포인트를 확인하고 방에 들어가세요.</div>
    <div id="holdem-room-list">${rooms.filter(r=>r.status==="waiting"||r.status==="ready").map(r=>'<div class="card room" style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin:8px 0;padding:14px"><div><b>♠️ '+esc(r.room_code)+'</b><p style="margin:5px 0 0">'+Number(r.stake).toLocaleString()+' P · '+(r.status==="waiting"?"대기 중":"상대 입장")+'</p></div><button class="secondary" onclick="window.joinHoldemRoom(\''+esc(r.room_code)+'\')">참가</button></div>').join("")||'<div class="card" style="padding:16px">대기 중인 방이 없어요. 먼저 방을 만들어 보세요!</div>'}</div>
    <button class="secondary" style="width:100%;margin-top:8px" onclick="window.startGame('holdem')">사람이 없으면 봇과 바로 연습하기</button>
  `);
}

window.createHoldemRoom=async function(){
  const stake=Number(document.querySelector("#holdem-stake")?.value||100);
  try{
    const d=await api("/api/rooms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({game:"holdem",stake})});
    if(d.error)throw new Error(d.error);
    toast("홀덤 방을 만들었어요!");
    S.holdemStake=stake;S.holdemRoom=d.room.room_code;holdemLobbyRoom(d.room.room_code,stake);
  }catch(e){toast(e.message||"방을 만들지 못했어요.")}
};
window.joinHoldemRoom=async function(code){
  try{
    const d=await api("/api/rooms/"+encodeURIComponent(code)+"/join",{method:"POST"});
    if(d.error)throw new Error(d.error);
    const room=d.room||d;
    S.holdemStake=Number(room.stake||100);S.holdemRoom=code;
    holdemLobbyRoom(code,S.holdemStake);
  }catch(e){toast(e.message||"방에 참가하지 못했어요.")}
};
function holdemLobbyRoom(code,stake){
  $("#app").innerHTML=shell(gamePage("♠️ 홀덤 방",`
    <div class="card" style="padding:22px;text-align:center">
      <div style="font-size:46px">♠️</div><h2>방 코드 ${esc(code)}</h2>
      <p>참가 포인트 <b>${Number(stake).toLocaleString()} P</b></p>
      <p class="section-sub">상대가 들어오지 않으면 봇과 연습할 수 있어요.</p>
      <button class="primary" style="width:100%" onclick="window.startHoldemAtStake(${Number(stake)})">게임 시작 · 봇 대기 포함</button>
      <button class="secondary" style="width:100%" onclick="window.go('games')">방 목록으로</button>
    </div>
  `));
}
window.startHoldemAtStake=stake=>{S.holdemStake=Number(stake)||100;startGame("holdem")};

function gameCard(k,g){
  return `
    <article class="card game-card" style="cursor:pointer" onclick="window.startGame('${k}')">
      <div class="game-icon">${g.icon}</div>
      <h3>${g.name}</h3>
      <p>${g.desc}</p>
      <button class="primary game-start-btn" style="margin-top:12px" type="button" onclick="event.stopPropagation();window.startGame('${k}')">
        시작
      </button>
    </article>
  `;
}

function roomSection(
  game,
  title
){

  return `
    <section>

      <div
        style="
          display:flex;
          justify-content:space-between;
          align-items:end;
          margin:20px 0 8px
        "
      >

        <div>

          <h2 style="margin:0">
            ${title}
          </h2>

          <div class="muted">
            대전 0/30회
          </div>

        </div>

        <button
          class="primary"
          style="font-size:16px"
          onclick="createRoom('${game}')"
        >
          방 만들기
        </button>

      </div>


      <div
        class="rooms"
        id="rooms-${game}"
      >

        <div class="card room">

          <div>
            <h4>1번방</h4>
            <p>비어있음</p>
          </div>

          <button
            class="secondary"
            onclick="createRoom('${game}')"
          >
            입장
          </button>

        </div>


        <div class="card room">

          <div>
            <h4>2번방</h4>
            <p>비어있음</p>
          </div>

          <button
            class="secondary"
            onclick="createRoom('${game}')"
          >
            입장
          </button>

        </div>


        <div class="card room">

          <div>
            <h4>3번방</h4>
            <p>비어있음</p>
          </div>

          <button
            class="secondary"
            onclick="createRoom('${game}')"
          >
            입장
          </button>

        </div>

      </div>

    </section>
  `;
}

async function createRoom(
  game
){
  if(window.__roomBusy)return;
  window.__roomBusy=true;
  toast("방을 만들고 있어요…");

  try{

    const d=
      await api(
        "/api/rooms",
        {
          method:"POST",
          headers:{
            "Content-Type":
              "application/json"
          },
          body:JSON.stringify({
            game,
            stake:100
          })
        }
      );

    openRoom(
      d.room.room_code,
      game
    );

  }catch(e){

    toast(
      e.message
    );
  }finally{
    window.__roomBusy=false;
  }}

async function openRoom(
  code,
  game
){

  S.modal={
    type:"room",
    code,
    game
  };

  renderModal();
}

async function renderRooms(
  game
){

  try{

    return await api(
      "/api/rooms?game="+
      encodeURIComponent(game)
    );

  }catch{

    return {
      rooms:[]
    };
  }
}


/* =========================================================
   RANKING
========================================================= */

async function ranks(){

  let d={
    rankings:{
      points:[],
      level:[],
      games:[]
    }
  };

  try{

    d=
      await api(
        "/api/ranking"
      );

  }catch{}

  const make=(
    title,
    arr,
    key
  )=>`

    <div class="card rank-card">

      <h4>
        ${title}
      </h4>

      ${
        arr
          .slice(0,5)
          .map(
            (u,i)=>`

              <div class="rank-item">

                <span class="rank-no">
                  ${i+1}
                </span>

                <span class="rank-name">
                  ${esc(u.username)}
                </span>

                <span class="rank-value">
                  ${esc(
                    String(u[key])
                  )}
                </span>

              </div>

            `
          )
          .join("")
      }

    </div>
  `;

  $("#app").innerHTML=
    shell(`

      <div class="section-title">
        하니방 순위
      </div>

      <div class="section-sub">
        포인트 · 레벨 · 게임 기록 TOP 5
      </div>

      <div class="rank-grid">

        ${
          make(
            "💰 포인트 TOP 5",
            d.rankings.points,
            "points"
          )
        }

        ${
          make(
            "🏆 레벨 TOP 5",
            d.rankings.level,
            "level"
          )
        }

        ${
          make(
            "🎮 게임 TOP 5",
            d.rankings.games,
            "wins"
          )
        }

      </div>


      <div class="section-title">
        게임별 순위
      </div>


      <div class="rank-grid">

        ${
          Object.values(GAMES)
            .map(
              g=>`

                <div class="card rank-card">

                  <h4>
                    ${g.icon}
                    ${g.name}
                    TOP 5
                  </h4>

                  <div
                    class="center muted"
                    style="padding:25px 0"
                  >
                    아직 순위가 없습니다.
                    <br>
                    첫 기록을 만들어 보세요!
                  </div>

                </div>

              `
            )
            .join("")
        }

      </div>

    `);
}


/* =========================================================
   NEWS
========================================================= */

function newsItems(){

  return [
    "새로운 하니게임즈 시즌이 시작되었습니다.",
    "지뢰찾기와 사천성 게임 시스템이 업데이트되었습니다.",
    "하니의 진화 단계가 확장되었습니다.",
    "오늘의 첫 게임 기록을 남겨보세요.",
    "새로운 게임방이 열렸습니다."
  ];
}

function newsRow(
  t,
  i
){

  return `
    <div class="news-item">

      <b>
        ${i%2?"🟡":"🟢"}
        ${esc(t)}
      </b>

      <div class="news-time">
        10. 7. 오후 04:44
      </div>

    </div>
  `;
}

async function news(){

  $("#app").innerHTML=
    shell(`

      <div class="section-title">
        하니게임즈 소식
      </div>

      <div class="section-sub">
        새 소식이 생기면
        오래된 소식부터 정리됩니다.
      </div>

      <div class="card news">

        ${
          newsItems()
            .concat(newsItems())
            .slice(0,10)
            .map(newsRow)
            .join("")
        }

      </div>

    `);
}


/* =========================================================
   PROFILE
========================================================= */

async function profile(){

  const u=S.user;

  $("#app").innerHTML=
    shell(`

      <div class="section-title">
        내 기록
      </div>

      <div
        class="card"
        style="padding:20px"
      >

        <div
          class="center"
          style="font-size:70px"
        >
          ${bunny(u.evolution)}
        </div>

        <h2 class="center">
          ${esc(u.username)}
        </h2>

        <p class="center muted">
          ${esc(u.title)}
          ·
          ${u.evolution+1}세대
        </p>


        <div class="stats">

          <div class="stat">
            <small>승리</small>
            <strong>${u.wins}</strong>
          </div>

          <div class="stat">
            <small>패배</small>
            <strong>${u.losses}</strong>
          </div>

          <div class="stat">
            <small>포인트</small>
            <strong>
              ${u.points.toLocaleString()}
            </strong>
          </div>

          <div class="stat">
            <small>진화</small>
            <strong>
              ${u.evolution}단계
            </strong>
          </div>

        </div>

      </div>


      <div class="section-title">
        계정
      </div>

      <button
        class="secondary full"
        onclick="logout()"
      >
        로그아웃
      </button>

    `);
}


/* =========================================================
   MODAL
========================================================= */

function openModal(
  type
){

  S.modal={
    type
  };

  renderModal();
}

function closeModal(){

  S.modal=null;

  $(".modal")?.remove();
}

function renderModal(){

  if(!S.modal)
    return;

  if(
    S.modal.type==="profile"
  ){

    S.modal=null;

    return;
  }

  const g=
    GAMES[
      S.modal.game
    ];

  $("#app")
    .insertAdjacentHTML(
      "beforeend",
      `

      <div
        class="modal"
        onclick="
          if(event.target===this)
            closeModal()
        "
      >

        <div class="sheet">

          <div class="sheet-head">

            <h2>
              ${
                g
                ?g.icon+" "+g.name
                :"게임방"
              }
            </h2>

            <button
              class="close"
              onclick="closeModal()"
            >
              ×
            </button>

          </div>

          <p class="muted">
            방 코드:
            ${S.modal.code}
          </p>

          <button
            class="primary full"
            onclick="
              closeModal();
              startGame('${S.modal.game}')
            "
          >
            혼자 연습하기
          </button>

        </div>

      </div>

      `
    );
}

function startGame(type){
  S.modal=null;
  S.game={type};
  if(type==="shisen") return shisen();
  if(type==="holdem") return holdem();
  toast("게임을 불러오지 못했어요.");
}
window.startGame=startGame;
window.SHB=window.SHB||null;

function gamePage(
  title,
  content,
  extra=""
){

  return `
    <div class="game-shell">

      <div class="game-head">

        <button
          class="secondary"
          onclick="window.go('games')"
        >
          ← 게임목록
        </button>

        <div class="tag">
          ${title}
        </div>

      </div>

      ${extra}

      ${content}

    </div>
  `;
}



/* TEXAS HOLD'EM — single-table practice against three computer players */
function holdem(){
  const buyIn=Math.max(100,Number(S.holdemStake||1000));
  const suits=["♠","♥","♦","♣"], ranks=["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
  const value=r=>r==="A"?14:r==="K"?13:r==="Q"?12:r==="J"?11:Number(r);
  const deck=[];for(const s of suits)for(const r of ranks)deck.push({s,r,v:value(r)});
  for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]]}
  const players=[{name:S.user?.username||"나",human:true,chips:buyIn,hand:[deck.pop(),deck.pop()],fold:false},{name:"토끼봇",chips:buyIn,hand:[deck.pop(),deck.pop()],fold:false},{name:"구름봇",chips:buyIn,hand:[deck.pop(),deck.pop()],fold:false},{name:"별봇",chips:buyIn,hand:[deck.pop(),deck.pop()],fold:false}];
  let community=[],pot=Math.min(200,buyIn*4),street=0,over=false,notice="프리플랍 · 내 카드 2장으로 시작해요.";
  const streets=["프리플랍","플랍","턴","리버","쇼다운"];
  const card=c=>c?'<span class="poker-card '+("♥♦".includes(c.s)?"red":"")+'"><b>'+c.r+'</b><i>'+c.s+'</i></span>':'<span class="poker-card back">🂠</span>';
  const scoreFive=cs=>{
    const vals=cs.map(c=>c.v).sort((a,b)=>b-a), counts={};vals.forEach(v=>counts[v]=(counts[v]||0)+1);
    const groups=Object.entries(counts).map(([v,n])=>({v:Number(v),n})).sort((a,b)=>b.n-a.n||b.v-a.v);
    const flush=cs.every(c=>c.s===cs[0].s);
    const uniq=[...new Set(vals)];let straight=0;
    for(let i=0;i<uniq.length-4;i++)if(uniq[i]-uniq[i+4]===4)straight=uniq[i];
    if(uniq.includes(14)&&[5,4,3,2].every(v=>uniq.includes(v)))straight=5;
    if(flush&&straight)return [8,straight];
    if(groups[0].n===4)return [7,groups[0].v,groups[1].v];
    if(groups[0].n===3&&groups[1].n===2)return [6,groups[0].v,groups[1].v];
    if(flush)return [5,...vals];
    if(straight)return [4,straight];
    if(groups[0].n===3)return [3,groups[0].v,...groups.slice(1).map(g=>g.v).sort((a,b)=>b-a)];
    const pairs=groups.filter(g=>g.n===2).map(g=>g.v).sort((a,b)=>b-a);
    if(pairs.length>=2)return [2,pairs[0],pairs[1],...vals.filter(v=>v!==pairs[0]&&v!==pairs[1]).slice(0,1)];
    if(pairs.length===1)return [1,pairs[0],...vals.filter(v=>v!==pairs[0])];
    return [0,...vals];
  };
  const best=cs=>{let out=null;for(let a=0;a<cs.length-4;a++)for(let b=a+1;b<cs.length-3;b++)for(let c=b+1;c<cs.length-2;c++)for(let d=c+1;d<cs.length-1;d++)for(let e=d+1;e<cs.length;e++){const x=scoreFive([cs[a],cs[b],cs[c],cs[d],cs[e]]);if(!out||cmp(x,out)>0)out=x}return out||[0]};
  const cmp=(a,b)=>{for(let i=0;i<Math.max(a.length,b.length);i++){const d=(a[i]||0)-(b[i]||0);if(d)return d}return 0};
  const handName=s=>["하이 카드","원 페어","투 페어","쓰리 오브 어 카인드","스트레이트","플러시","풀 하우스","포 카드","스트레이트 플러시"][s[0]]||"하이 카드";
  const render=()=>{
    $("#app").innerHTML=shell(gamePage("♠️ 텍사스 홀덤",`
      <style>
      .poker-table{background:radial-gradient(ellipse,#208a68,#07563f);border:8px solid #8b5a36;border-radius:46%/34%;padding:22px 12px;color:#fff;text-align:center;box-shadow:inset 0 0 0 3px #d4b083;min-height:190px}
      .poker-cards{display:flex;justify-content:center;gap:7px;flex-wrap:wrap;margin:10px 0}
      .poker-card{background:#fff;color:#18202a;border-radius:7px;width:43px;height:62px;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 2px 5px #0003;font-size:20px;font-weight:800}
      .poker-card i{font-style:normal;font-size:18px}.poker-card.red{color:#df334b}.poker-card.back{background:#d9e8ff;color:#5680bd}
      .poker-players{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:12px 0}.poker-seat{background:#fff;color:#24344a;border-radius:12px;padding:10px 4px;font-size:12px}.poker-seat strong{display:block;font-size:13px}.poker-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      </style>
      <div class="poker-table"><div>🪙 POT <b>${pot}</b></div><div class="poker-cards">${community.length?community.map(card).join(""):'<span>공용 카드 공개를 기다리는 중</span>'}</div><small>${streets[Math.min(street,4)]}</small></div>
      <div class="poker-players">${players.slice(1).map(p=>'<div class="poker-seat"><strong>'+(p.fold?'🪑 폴드': '🐰 '+p.name)+'</strong><span>칩 '+p.chips+'</span>'+(over&&!p.fold?'<div class="poker-cards">'+p.hand.map(card).join("")+'</div>':'')+'</div>').join("")}</div>
      <section class="card" style="padding:14px;margin-top:12px"><b>내 카드</b><div class="poker-cards">${players[0].hand.map(card).join("")}</div><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><span>보유 칩 <b>${players[0].chips}</b></span><span>현재 팟 <b>${pot}</b></span></div></section>
      <p class="section-sub" style="text-align:center">${notice}</p>
      ${!over?'<div class="poker-actions"><button class="secondary" onclick="window.holdemAction(\'fold\')">폴드</button><button class="primary" onclick="window.holdemAction(\'call\')">체크 / 콜</button><button class="primary" onclick="window.holdemAction(\'raise\')">레이즈 +100</button></div>':'<button class="primary" style="width:100%" onclick="window.startGame(\'holdem\')">다시 하기</button>'}
      <p class="muted" style="font-size:12px;text-align:center;margin-top:12px">연습용 홀덤 · 게임 내 가상 칩만 사용합니다.</p>
    `));
  };
  const next=()=>{
    players.slice(1).forEach(p=>{if(!p.fold&&Math.random()<0.12){p.fold=true;notice+= " "+p.name+" 폴드."}});
    if(street===0)community.push(deck.pop(),deck.pop(),deck.pop());
    else if(street===1||street===2)community.push(deck.pop());
    street++;
    if(street>=4||community.length===5||players.slice(1).every(p=>p.fold)){showdown();return}
    notice=streets[street]+" · 상대의 액션이 끝났어요. 다음 선택을 해주세요.";render();
  };
  const showdown=()=>{
    over=true;street=4;
    const active=players.filter(p=>!p.fold);active.forEach(p=>p.rank=best([...p.hand,...community]));
    active.sort((a,b)=>cmp(b.rank,a.rank));const winner=active[0];
    if(winner.human){winner.chips+=pot;notice="🏆 승리! "+handName(winner.rank)+"으로 팟 "+pot+"칩을 가져왔어요.";api("/api/game-result",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({game:"holdem",score:Math.max(400,Math.floor(pot))})}).then(d=>{if(d.user)S.user=d.user;toast(d.message||"홀덤 승리!")}).catch(()=>{})}
    else notice="이번 판은 "+winner.name+" 승리 · "+handName(winner.rank)+". 다시 도전해봐요!";
    render();
  };
  window.holdemAction=act=>{
    if(over)return;
    const me=players[0];
    if(act==="fold"){me.fold=true;over=true;notice="폴드했어요. 다음 판에서 다시 도전하세요.";render();return}
    if(act==="raise"){const bet=Math.min(100,me.chips);me.chips-=bet;pot+=bet;players.slice(1).forEach(p=>{if(!p.fold&&Math.random()<0.45)p.fold=true;else if(!p.fold){const call=Math.min(100,p.chips);p.chips-=call;pot+=call}})}
    else players.slice(1).forEach(p=>{if(!p.fold&&Math.random()<0.08)p.fold=true});
    next();
  };
  render();
}

/* =========================================================
   MINESWEEPER
========================================================= */

function minesweeper(){
  const N=10,M=12,MINES=15;
  let board=Array.from({length:N},()=>Array(M).fill(0));
  let open=Array.from({length:N},()=>Array(M).fill(false));
  let flag=Array.from({length:N},()=>Array(M).fill(false));
  let done=false,msMode="open",pressTimer=null,longPressed=false;
  let score=0,opened=0,timeLeft=180,timer=null,submitted=false;

  const mines=[];
  while(mines.length<MINES){
    const p=Math.floor(Math.random()*N*M);
    if(!mines.includes(p))mines.push(p);
  }
  mines.forEach(p=>board[Math.floor(p/M)][p%M]=-1);

  function near(r,c){
    const a=[];
    for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
      const rr=r+dr,cc=c+dc;
      if(rr>=0&&rr<N&&cc>=0&&cc<M)a.push([rr,cc]);
    }
    return a;
  }
  for(let r=0;r<N;r++)for(let c=0;c<M;c++)if(board[r][c]!==-1)
    board[r][c]=near(r,c).filter(([rr,cc])=>board[rr][cc]===-1).length;

  function stop(){clearInterval(timer);timer=null;}
  function finish(win){
    if(done)return;
    done=true;stop();
    if(win)score+=Math.max(0,timeLeft)*5;
    renderBoard();
    if(win&&!submitted){
      submitted=true;
      api("/api/game-result",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({game:"minesweeper",score:score,combo:opened,timeLeft:timeLeft})})
        .then(d=>{if(d.message)toast(d.message);}).catch(()=>{});
      setTimeout(()=>alert("🎉 지뢰찾기 클리어!\n"+score.toLocaleString()+"점"),80);
    }else if(!win)setTimeout(()=>alert("💥 지뢰를 밟았어요!\n점수 "+score.toLocaleString()+"점"),80);
  }
  function tick(){if(done)return;timeLeft=Math.max(0,timeLeft-1);if(timeLeft<=0)finish(false);else renderBoard();}

  function reveal(r,c){
    if(done||flag[r][c]||open[r][c])return;
    open[r][c]=true;opened++;
    if(board[r][c]===-1){finish(false);return;}
    score+=10;
    if(board[r][c]===0)near(r,c).forEach(([rr,cc])=>{if(!open[rr][cc])reveal(rr,cc);});
    if(opened===N*M-MINES)finish(true);
    else renderBoard();
  }
  function toggleFlag(r,c){if(done||open[r][c])return;flag[r][c]=!flag[r][c];renderBoard();}
  function tap(r,c){msMode==="flag"?toggleFlag(r,c):reveal(r,c);}
  function startPress(event,r,c){
    if(done)return;
    longPressed=false;clearTimeout(pressTimer);
    pressTimer=setTimeout(()=>{longPressed=true;toggleFlag(r,c);event?.preventDefault();},450);
  }
  function endPress(event,r,c){
    clearTimeout(pressTimer);pressTimer=null;
    if(longPressed){longPressed=false;event?.preventDefault();return;}
    if(event?.type==="pointerup"&&event.pointerType==="mouse"&&event.button===2){event.preventDefault();toggleFlag(r,c);}
  }
  function renderBoard(){
    const cells=[];
    for(let r=0;r<N;r++)for(let c=0;c<M;c++){
      const v=board[r][c];
      cells.push('<button class="ms-cell '+(open[r][c]?"open ":"")+(flag[r][c]?"flag":"")+'" style="min-width:0;width:100%;aspect-ratio:1;padding:0;touch-action:none;font-size:clamp(11px,4.2vw,20px)" onclick="MS.tap('+r+','+c+')" onpointerdown="MS.startPress(event,'+r+','+c+')" onpointerup="MS.endPress(event,'+r+','+c+')" onpointercancel="MS.endPress(event,'+r+','+c+')" oncontextmenu="event.preventDefault();MS.flag('+r+','+c+')">'+(flag[r][c]?"🚩":open[r][c]?(v===-1?"💣":v||""):"")+'</button>');
    }
    $("#app").innerHTML=gamePage("💣 지뢰찾기",'<div class="card" style="padding:10px;width:100%;max-width:520px;margin:0 auto;overflow:hidden"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:9px"><div class="stat" style="padding:9px;text-align:center"><small>⏱️ 시간</small><strong>'+timeLeft+'s</strong></div><div class="stat" style="padding:9px;text-align:center"><small>🏆 점수</small><strong>'+score.toLocaleString()+'</strong></div><div class="stat" style="padding:9px;text-align:center"><small>🚩 깃발</small><strong>'+flag.flat().filter(Boolean).length+'</strong></div></div><div class="ms-board" style="width:100%;display:grid;grid-template-columns:repeat('+M+',minmax(0,1fr));gap:2px">'+cells.join("")+'</div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px auto 0;max-width:520px"><button class="'+(msMode==="open"?"primary":"secondary")+'" onclick="MS.mode(\'open\')">👆 열기</button><button class="'+(msMode==="flag"?"primary":"secondary")+'" onclick="MS.mode(\'flag\')">🚩 깃발</button></div><p class="muted center" style="margin-top:9px">3분 제한 · 안전하게 연 칸마다 +10점 · 남은 시간 보너스</p>');
  }
  window.MS={reveal,tap,toggle:toggleFlag,flag:toggleFlag,mode(m){msMode=m==="flag"?"flag":"open";renderBoard();},startPress,endPress};
  renderBoard();
  timer=setInterval(tick,1000);
}


/* =========================================================
   SHISEN
========================================================= */

function shisen(){
  const R=8,C=8;
  const tiles=["🍎","🍋","🍇","🍒","🥝","🍉","🍑","🍓","🍊","🍍","🥕","🌽","🍀","⭐","🐰","🦊","🐼","🐸","🐯","🐨","🐹","🐵","🐶","🐱","🦄","🐥","🦋","🌸","💎","🎈","🎀","🥭"];
  let board=[],selected=null,timeLeft=120,score=0,combo=0,bestCombo=0,done=false,timer=null,submitted=false;

  function newBoard(){
    const vals=[...tiles,...tiles];
    for(let attempt=0;attempt<100;attempt++){
      vals.sort(()=>Math.random()-.5);
      board=Array.from({length:R},(_,r)=>Array.from({length:C},(_,c)=>vals[r*C+c]));
      if(hasMove()) return;
    }
    board=Array.from({length:R},()=>Array(C).fill(null));
    for(let i=0;i<tiles.length;i++){
      const a=i*2, b=a+1;
      board[Math.floor(a/C)][a%C]=tiles[i];
      board[Math.floor(b/C)][b%C]=tiles[i];
    }
  }
  function pathClear(a,b){
    if(a[0]===b[0]&&a[1]===b[1])return false;
    // 바깥 테두리 한 칸까지만 이동 허용합니다.
    // 무제한으로 바깥 좌표를 탐색하면 BFS가 끝나지 않아
    // 모바일에서 게임 시작 순간 화면이 멈출 수 있습니다.
    const inside=(r,c)=>r>=0&&r<R&&c>=0&&c<C;
    const canVisit=(r,c)=>r>=-1&&r<=R&&c>=-1&&c<=C;
    const empty=(r,c)=>canVisit(r,c)&&(!inside(r,c)||!board[r][c]);
    const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
    const q=[[a[0],a[1],-1,0]];
    const seen=new Map();
    while(q.length){
      const [r,c,dir,turns]=q.shift(),key=r+","+c+","+dir;
      if(turns>2)continue;
      if(r===b[0]&&c===b[1])return true;
      if(seen.has(key)&&seen.get(key)<=turns)continue;
      seen.set(key,turns);
      for(let d=0;d<4;d++){
        const nr=r+dirs[d][0],nc=c+dirs[d][1],nt=dir===-1||dir===d?turns:turns+1;
        if(nt<=2&&((nr===b[0]&&nc===b[1])||empty(nr,nc)))q.push([nr,nc,d,nt]);
      }
    }
    return false;
  }
  function hasMove(){
    for(let r=0;r<R;r++)for(let c=0;c<C;c++)if(board[r][c])
      for(let rr=r;rr<R;rr++)for(let cc=0;cc<C;cc++)if(board[rr][cc]&&board[r][c]===board[rr][cc]&&pathClear([r,c],[rr,cc]))return true;
    return false;
  }
  function stop(){clearInterval(timer);timer=null;}
  function finish(){
    if(done)return;
    done=true;stop();
    score+=timeLeft*10;
    if(!submitted){
      submitted=true;
      api("/api/game-result",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({game:"shisen",score,combo:bestCombo,timeLeft})}).then(d=>{if(d.user)S.user=d.user;if(d.message)toast(d.message);}).catch(()=>{});
    }
    render();
    setTimeout(()=>alert("🎉 사천성 클리어!\n점수 "+score.toLocaleString()+"점\n최고 콤보 "+bestCombo+""),80);
  }
  function tick(){if(done)return;timeLeft--;if(timeLeft<=0){timeLeft=0;done=true;stop();render();alert("⏰ 시간 종료!\n점수 "+score.toLocaleString()+"점");}else render();}
  function shuffle(paid=true){
    const alive=board.flat().filter(Boolean);
    for(let i=alive.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[alive[i],alive[j]]=[alive[j],alive[i]];}
    let k=0;for(let r=0;r<R;r++)for(let c=0;c<C;c++)if(board[r][c])board[r][c]=alive[k++];
    selected=null;if(paid)score=Math.max(0,score-50);render();
  }
  function hint(){
    if(done)return;
    for(let r=0;r<R;r++)for(let c=0;c<C;c++)if(board[r][c])for(let rr=r;rr<R;rr++)for(let cc=0;cc<C;cc++)
      if(board[rr][cc]&&board[r][c]===board[rr][cc]&&pathClear([r,c],[rr,cc])){
        selected=[r,c];score=Math.max(0,score-100);render();return;
      }
    shuffle(true);
  }
  function choose(r,c){
    if(done||!board[r][c])return;
    if(!selected){selected=[r,c];render();return;}
    const [sr,sc]=selected;
    if(sr===r&&sc===c){selected=null;render();return;}
    if(board[sr][sc]!==board[r][c]){combo=0;selected=[r,c];render();return;}
    if(!pathClear([sr,sc],[r,c])){combo=0;selected=[r,c];render();return;}
    board[sr][sc]=null;board[r][c]=null;combo++;bestCombo=Math.max(bestCombo,combo);score+=100+(combo-1)*25;selected=null;
    if(board.flat().every(v=>!v))finish();
    else if(!hasMove())shuffle(false);
    else render();
  }
  function render(){
    const cells=[];
    for(let r=0;r<R;r++)for(let c=0;c<C;c++)cells.push('<button class="shisen-cell '+(selected&&selected[0]===r&&selected[1]===c?"selected":"")+'" onclick="SH.choose('+r+','+c+')">'+(board[r][c]||"")+'</button>');
    $("#app").innerHTML=gamePage("🀄 사천성",'<div class="card" style="padding:10px"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:9px"><div class="stat" style="padding:9px;text-align:center"><small>⏱️ 시간</small><strong>'+timeLeft+'s</strong></div><div class="stat" style="padding:9px;text-align:center"><small>🏆 점수</small><strong>'+score.toLocaleString()+'</strong></div><div class="stat" style="padding:9px;text-align:center"><small>🔥 콤보</small><strong>'+combo+'</strong></div></div><div class="shisen-board" style="grid-template-columns:repeat('+C+',1fr)">'+cells.join("")+'</div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px"><button class="secondary" onclick="SH.hint()">💡 힌트 -100P</button><button class="secondary" onclick="SH.shuffle()">🔀 셔플 -50P</button></div><p class="muted center" style="margin-top:9px">같은 타일을 최대 2번 꺾어 연결하세요 · 120초 제한</p>');
  }
  window.SH={choose,hint,shuffle:()=>shuffle(true)};
  newBoard();render();timer=setInterval(tick,1000);
}

/* =========================================================
   SHISEN BATTLE
========================================================= */

function shisenBattle(){
  const R=8,C=8;
  const TILES=["🍎","🍋","🍇","🍒","🥝","🍉","🍑","🍓","🍊","🍍","🥕","🌽","🍀","⭐","🐰","🦊","🐼","🐸","🐯","🐨","🐹","🐵","🐶","🐱","🦄","🐥","🦋","🌸","💎","🎈","🎀","🥭"];
  let me=[],enemy=[],selected=null,timeLeft=120,done=false,timer=null,botTimer=null,submitted=false;
  let myRemoved=0,enemyRemoved=0;

  function makeBoard(){
    const vals=[...TILES,...TILES];
    vals.sort(()=>Math.random()-.5);
    return Array.from({length:R},(_,r)=>Array.from({length:C},(_,c)=>vals[r*C+c]));
  }

  function pathClear(board,a,b){
    if(a[0]===b[0]&&a[1]===b[1])return false;
    // 바깥 테두리 한 칸까지만 이동 허용합니다.
    // 무제한으로 바깥 좌표를 탐색하면 BFS가 끝나지 않아
    // 모바일에서 게임 시작 순간 화면이 멈출 수 있습니다.
    const inside=(r,c)=>r>=0&&r<R&&c>=0&&c<C;
    const canVisit=(r,c)=>r>=-1&&r<=R&&c>=-1&&c<=C;
    const empty=(r,c)=>canVisit(r,c)&&(!inside(r,c)||!board[r][c]);
    const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
    const q=[[a[0],a[1],-1,0]],seen=new Map();
    while(q.length){
      const [r,c,dir,turns]=q.shift(),key=r+","+c+","+dir;
      if(turns>2)continue;
      if(r===b[0]&&c===b[1])return true;
      if(seen.has(key)&&seen.get(key)<=turns)continue;
      seen.set(key,turns);
      for(let d=0;d<4;d++){
        const nr=r+dirs[d][0],nc=c+dirs[d][1],nt=dir===-1||dir===d?turns:turns+1;
        if(nt<=2&&((nr===b[0]&&nc===b[1])||empty(nr,nc)))q.push([nr,nc,d,nt]);
      }
    }
    return false;
  }

  function findMove(board){
    for(let r=0;r<R;r++)for(let c=0;c<C;c++)if(board[r][c]){
      for(let rr=r;rr<R;rr++)for(let cc=0;cc<C;cc++){
        if(rr===r&&cc===c)continue;
        if(board[rr][cc]===board[r][c]&&pathClear(board,[r,c],[rr,cc]))return [[r,c],[rr,cc]];
      }
    }
    return null;
  }

  function shuffle(board){
    const alive=board.flat().filter(Boolean);
    for(let i=alive.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [alive[i],alive[j]]=[alive[j],alive[i]];
    }
    let k=0;
    for(let r=0;r<R;r++)for(let c=0;c<C;c++)if(board[r][c])board[r][c]=alive[k++];
  }

  function stop(){
    clearInterval(timer);
    clearInterval(botTimer);
    timer=null;botTimer=null;
  }

  function finish(winner){
    if(done)return;
    done=true;stop();
    const score=winner==="me"?Math.min(5000,1000+Math.max(0,timeLeft)*12+myRemoved*25):0;
    render();
    if(winner==="me"&&!submitted){
      submitted=true;
      api("/api/game-result",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({game:"shisen",score:score,combo:myRemoved,timeLeft:timeLeft})
      }).then(d=>{
        if(d.user)S.user=d.user;
        if(d.message)toast(d.message);
      }).catch(()=>{});
    }
    setTimeout(()=>{
      alert(winner==="me"?"🏆 사천성 배틀 승리!\n"+score.toLocaleString()+"점":winner==="enemy"?"💥 상대방이 먼저 클리어했어요!":"⏰ 시간이 끝났어요!");
    },80);
  }

  function tick(){
    if(done)return;
    timeLeft=Math.max(0,timeLeft-1);
    if(timeLeft<=0)finish("draw");
    else render();
  }

  function botMove(){
    if(done)return;
    const move=findMove(enemy);
    if(move){
      const [[r,c],[rr,cc]]=move;
      enemy[r][c]=null;
      enemy[rr][cc]=null;
      enemyRemoved+=2;
      if(enemy.flat().every(v=>!v)){finish("enemy");return;}
    }else{
      shuffle(enemy);
    }
    render();
  }

  function choose(r,c){
    if(done||!me[r][c])return;
    if(!selected){selected=[r,c];render();return;}
    const [sr,sc]=selected;
    if(sr===r&&sc===c){selected=null;render();return;}
    if(me[sr][sc]!==me[r][c]||!pathClear(me,[sr,sc],[r,c])){
      selected=[r,c];render();return;
    }
    me[sr][sc]=null;
    me[r][c]=null;
    selected=null;
    myRemoved+=2;
    if(me.flat().every(v=>!v)){finish("me");return;}
    if(!findMove(me))shuffle(me);
    render();
  }

  function renderBoard(board,clickable){
    const cells=[];
    for(let r=0;r<R;r++)for(let c=0;c<C;c++){
      const v=board[r][c]||"";
      const sel=clickable&&selected&&selected[0]===r&&selected[1]===c?" selected":"";
      const fn=clickable?"SHB.choose("+r+","+c+")":"void(0)";
      cells.push("<button class=\"shisen-battle-cell"+sel+"\" onclick=\""+fn+"\">"+v+"</button>");
    }
    return cells.join("");
  }

  function render(){
    const myLeft=64-myRemoved;
    const enemyLeft=64-enemyRemoved;
    const myPct=Math.max(0,Math.min(100,myLeft/64*100));
    const enemyPct=Math.max(0,Math.min(100,enemyLeft/64*100));
    $("#app").innerHTML=shell(
      "<div class=\"shisen-battle\">"+
      "<div class=\"battle-topbar\"><button class=\"secondary\" onclick=\"SHB.exit()\">← 게임</button><strong>⚔️ 사천성 배틀</strong><span class=\"battle-time\">⏱️ "+timeLeft+"s</span></div>"+
      "<section class=\"battle-player-card\"><div class=\"battle-player-head\"><div><b>🐰 "+esc(S.user?.username||"나")+"</b><small>내 판</small></div><strong>"+myLeft+"개 남음</strong></div><div class=\"battle-progress\"><i style=\"width:"+myPct+"%\"></i></div><div class=\"shisen-battle-board\">"+renderBoard(me,true)+"</div></section>"+
      "<div class=\"battle-vs\">VS</div>"+
      "<section class=\"battle-player-card enemy-card\"><div class=\"battle-player-head\"><div><b>🤖 상대 하니</b><small>배틀 상대</small></div><strong>"+enemyLeft+"개 남음</strong></div><div class=\"battle-progress\"><i style=\"width:"+enemyPct+"%\"></i></div><div class=\"shisen-battle-board\">"+renderBoard(enemy,false)+"</div></section>"+
      "<p class=\"muted center\" style=\"margin:10px 0 18px\">같은 타일을 최대 2번 꺾어 연결하세요 · 먼저 0개가 되면 승리!</p>"+
      "</div>"
    );
  }

  window.SHB={
    choose,
    exit(){
      if(done){go("games");return;}
      if(confirm("배틀을 나가면 진행 중인 게임이 종료돼요. 나갈까요?")){
        done=true;
        stop();
        go("games");
      }
    }
  };

  me=makeBoard();
  enemy=makeBoard();
  render();
  timer=setInterval(tick,1000);
  botTimer=setInterval(botMove,1100);
}
/* =========================================================
   OMOK
========================================================= */

function omok(){
  const N=15;
  const b=Array.from({length:N},()=>Array(N).fill(0));
  let turn=1,over=false,timeLeft=300,timer=null,score=0,submitted=false,moves=0;

  function stop(){clearInterval(timer);timer=null;}
  function win(r,c){
    for(const [dr,dc] of [[1,0],[0,1],[1,1],[1,-1]]){
      let n=1;
      for(const s of [1,-1]){
        let rr=r+dr*s,cc=c+dc*s;
        while(rr>=0&&rr<N&&cc>=0&&cc<N&&b[rr][cc]===turn){n++;rr+=dr*s;cc+=dc*s;}
      }
      if(n>=5)return true;
    }
    return false;
  }
  function finish(winner){
    if(over)return;
    over=true;stop();
    if(winner===1){score=1000+Math.max(0,timeLeft)*2;}
    else score=0;
    render();
    if(winner===1&&!submitted){
      submitted=true;
      api("/api/game-result",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({game:"omok",score:score,combo:moves,timeLeft:timeLeft})}).then(d=>{if(d.message)toast(d.message);}).catch(()=>{});
    }
    setTimeout(()=>alert(winner===1?"⚫ 승리!\n점수 "+score.toLocaleString()+"점":"무승부!"),80);
  }
  function tick(){if(over)return;timeLeft=Math.max(0,timeLeft-1);if(timeLeft<=0)finish(0);else render();}
  function put(r,c){
    if(over||b[r][c])return;
    b[r][c]=turn;moves++;
    if(win(r,c)){finish(turn);return;}
    if(moves===N*N){finish(0);return;}
    turn=turn===1?2:1;render();
  }
  function render(){
    const cells=[];
    for(let r=0;r<N;r++)for(let c=0;c<N;c++)cells.push('<button class="omok-cell" onclick="OM.put('+r+','+c+')">'+(b[r][c]?'<i class="stone '+(b[r][c]===1?"black":"white")+'"></i>':"")+'</button>');
    $("#app").innerHTML=gamePage("⚫ 오목",'<div class="card" style="padding:8px"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:9px"><div class="stat" style="padding:9px;text-align:center"><small>⏱️ 시간</small><strong>'+timeLeft+'s</strong></div><div class="stat" style="padding:9px;text-align:center"><small>⚫ 흑 점수</small><strong>'+score.toLocaleString()+'</strong></div><div class="stat" style="padding:9px;text-align:center"><small>수</small><strong>'+moves+'</strong></div></div><div class="omok-board">'+cells.join("")+'</div></div><p class="center">'+(over?"게임 종료":"현재 차례: "+(turn===1?"⚫ 흑":"⚪ 백"))+'</p><p class="muted center">5분 제한 · 흑이 이기면 점수/XP 보상</p>');
  }
  window.OM={put};render();timer=setInterval(tick,1000);
}


/* =========================================================
   TETRIS
========================================================= */

function tetris(){
  const W=10,H=20;
  let b=Array.from({length:H},()=>Array(W).fill(0)),score=0,lines=0,over=false,timer=null,submitted=false;
  const shapes=[[[1,1,1,1]],[[1,1],[1,1]],[[0,1,0],[1,1,1]],[[1,0,0],[1,1,1]],[[0,0,1],[1,1,1]],[[1,1,0],[0,1,1]],[[0,1,1],[1,1,0]]];
  let p={x:3,y:0,s:shapes[Math.floor(Math.random()*shapes.length)]};

  function stop(){clearInterval(timer);timer=null;}
  function hit(nx,ny,ns=p.s){
    for(let y=0;y<ns.length;y++)for(let x=0;x<ns[y].length;x++)if(ns[y][x]&&(ny+y>=H||nx+x<0||nx+x>=W||b[ny+y][nx+x]))return true;
    return false;
  }
  function finish(){
    if(over)return;
    over=true;stop();
    if(!submitted&&score>0){
      submitted=true;
      api("/api/game-result",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({game:"tetris",score:score,combo:lines,timeLeft:0})}).then(d=>{if(d.message)toast(d.message);}).catch(()=>{});
    }
    render();
  }
  function lock(){
    p.s.forEach((row,y)=>row.forEach((v,x)=>{if(v)b[p.y+y][p.x+x]=1;}));
    let cleared=0;
    for(let y=H-1;y>=0;y--)if(b[y].every(Boolean)){b.splice(y,1);b.unshift(Array(W).fill(0));cleared++;y++;}
    if(cleared){lines+=cleared;score+=[0,100,300,600,1000][cleared]||1200;}
    p={x:3,y:0,s:shapes[Math.floor(Math.random()*shapes.length)]};
    if(hit(p.x,p.y))finish();
  }
  function move(dx){if(over)return;if(!hit(p.x+dx,p.y))p.x+=dx;render();}
  function down(){if(over)return;if(!hit(p.x,p.y+1))p.y++;else lock();render();}
  function rotate(){if(over)return;const ns=p.s[0].map((_,i)=>p.s.map(r=>r[i]).reverse());if(!hit(p.x,p.y,ns))p.s=ns;render();}
  function drop(){if(over)return;let d=0;while(!hit(p.x,p.y+1)){p.y++;d++;}score+=d*2;lock();render();}
  function render(){
    let a=b.map(r=>r.slice());
    p.s.forEach((row,y)=>row.forEach((v,x)=>{if(v&&p.y+y<H&&p.x+x<W)a[p.y+y][p.x+x]=1;}));
    $("#app").innerHTML=gamePage("🧱 테트리스",'<div class="tetris-wrap"><div class="tetris-board">'+a.flat().map(v=>'<div class="tcell '+(v?"filled":"")+'></div>').join("")+'</div><div class="tetris-side"><div class="card" style="padding:12px"><small>🏆 점수</small><strong style="font-size:24px;display:block">'+score.toLocaleString()+'</strong><small>줄 '+lines+'</small></div><button class="primary" onclick="TR.move(-1)">←</button><button class="primary" onclick="TR.rotate()">↻</button><button class="primary" onclick="TR.move(1)">→</button><button class="primary" onclick="TR.drop()">↓</button></div></div><p class="center muted">'+(over?"게임오버!":"줄을 지울수록 높은 점수!")+'</p>');
  }
  window.TR={move,rotate,drop};render();stop();timer=setInterval(()=>{if(!over)down();},700);
}


/* =========================================================
   TOAST
========================================================= */

function toast(
  msg
){

  let e=
    document.createElement(
      "div"
    );

  e.textContent=msg;

  e.style.cssText=
    `
      position:fixed;
      left:50%;
      bottom:95px;
      transform:translateX(-50%);
      background:#1f2a39;
      color:#fff;
      padding:13px 18px;
      border-radius:999px;
      z-index:100;
      font-weight:800
    `;

  document.body.appendChild(e);

  setTimeout(
    ()=>e.remove(),
    1800
  );
}



/* =========================================================
   ONLINE PRESENCE
========================================================= */

let presenceTimer=null;

async function updateOnlineCount(){
  try{
    const r=await fetch("/api/presence",{cache:"no-store"});
    const d=await r.json();
    const el=document.querySelector("#online-count");
    if(el) el.textContent="🟢 접속자 "+Number(d.count||0)+"명";
  }catch{}
}

async function sendPresence(){
  try{
    await fetch("/api/presence",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:"{}",
      cache:"no-store"
    });
  }catch{}
  updateOnlineCount();
}

/* =========================================================
   START
   초기 진입은 서버 응답을 기다리지 않고 즉시 화면 표시
========================================================= */

window.HANI_NOTICE={
  message:"하니게임즈에 오신 것을 환영해요 🐰💙",
  button_text:"확인",
  button_link:""
};

render();

(async()=>{
  try{
    const n=await api("/api/notices");
    window.HANI_NOTICE=(n.notices&&n.notices[0])||window.HANI_NOTICE;
  }catch{}

  try{
    const d=await api("/api/me");
    S.user=d.user;
    render();
    sendPresence();
    clearInterval(presenceTimer);
    presenceTimer=setInterval(sendPresence,20000);
  }catch{
    // 로그인 전 상태라면 이미 표시된 로그인 화면을 유지
  }
})();
