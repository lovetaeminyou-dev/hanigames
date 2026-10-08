const GAMES={
  minesweeper:{name:"지뢰찾기",icon:"💣",desc:"숫자를 보고 지뢰를 피하세요. 깃발과 연쇄 오픈까지 지원합니다."},
  shisen:{name:"사천성",icon:"🀄",desc:"같은 타일을 최대 두 번 꺾어 연결하면 제거됩니다."},
  omok:{name:"오목",icon:"⚫",desc:"15×15 바둑판에서 먼저 5목을 완성하세요."},
  tetris:{name:"싱글 테트리스",icon:"🧱",desc:"블록을 회전·이동해 줄을 지우고 최고점에 도전하세요."}
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
  const timeout=setTimeout(()=>controller.abort(),8000);
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


async function checkAttendance(){
  try{
    const d=await api("/api/attendance",{method:"POST"});
    if(d.user) S.user=d.user;
    toast(d.message || "출석 완료!");
    await home();
  }catch(e){
    toast(e.message || "출석체크에 실패했어요.");
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
  api("/api/me").then(d=>{
    if(d.user){
      S.user=d.user;
      const current=document.querySelector(".shell");
      if(current && S.tab==="home") render();
    }
  }).catch(()=>{});

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

  $("#app").innerHTML=
    shell(`

      <div class="section-title">
        게임
      </div>

      <div class="section-sub">
        혼자 즐기거나 다른 하니들과
        대전해 보세요.
      </div>


      <div
        class="section-title"
        style="font-size:21px"
      >
        포인트 개인게임
      </div>


      <div class="game-grid">

        ${
          Object.entries(GAMES)
            .map(
              ([k,g])=>
                gameCard(k,g)
            )
            .join("")
        }

      </div>


      <div
        class="section-title"
        style="font-size:21px"
      >
        단체게임
      </div>

      <div class="section-sub">
        방을 만들고 친구와 함께 플레이하세요.
      </div>


      ${
        [
          "오목",
          "테트리스 대전",
          "사천성 대전"
        ]
        .map(
          (x,i)=>
            roomSection(
              [
                "omok",
                "tetris",
                "shisen"
              ][i],
              x
            )
        )
        .join("")
      }

    `);
}

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
  if(type==="minesweeper") return minesweeper();
  if(type==="shisen") return shisen();
  if(type==="omok") return omok();
  if(type==="tetris") return tetris();
  toast("게임을 불러오지 못했어요.");
}
window.startGame=startGame;

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
          onclick="go('games')"
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
    const inside=(r,c)=>r>=0&&r<R&&c>=0&&c<C;
    const empty=(r,c)=>!inside(r,c)||!board[r][c];
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
