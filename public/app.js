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

  const r=await fetch(url,opt);
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

          <span class="pill">
            🟢 3명
          </span>

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
    await home();

  else if(tab==="games")
    await games();

  else if(tab==="ranks")
    await ranks();

  else if(tab==="news")
    await news();

  else if(tab==="profile")
    await profile();

  if(push)
    scrollTo(0,0);
}


/* =========================================================
   HOME
========================================================= */

async function home(){

  try{

    S.user=
      (
        await api(
          "/api/me"
        )
      ).user;

  }catch(e){

    return logout();
  }

  const u=S.user;

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

function gameCard(
  k,
  g
){

  return `
    <article class="card game-card">

      <div class="game-icon">
        ${g.icon}
      </div>

      <h3>
        ${g.name}
      </h3>

      <p>
        ${g.desc}
      </p>

      <button
        class="primary"
        style="margin-top:12px"
        onclick="startGame('${k}')"
      >
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
  }
}

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

function startGame(
  type
){

  S.modal=null;

  S.game={
    type
  };

  if(type==="minesweeper")
    minesweeper();

  if(type==="shisen")
    shisen();

  if(type==="omok")
    omok();

  if(type==="tetris")
    tetris();
}

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

  const N=10;
  const M=12;

  let board=
    Array.from(
      {length:N},
      ()=>Array(M).fill(0)
    );

  let open=
    Array.from(
      {length:N},
      ()=>Array(M).fill(false)
    );

  let flag=
    Array.from(
      {length:N},
      ()=>Array(M).fill(false)
    );

  let done=false;

  let mines=[];

  while(
    mines.length<15
  ){

    let p=
      Math.floor(
        Math.random()*N*M
      );

    if(
      !mines.includes(p)
    )
      mines.push(p);
  }

  mines.forEach(
    p=>
      board[
        Math.floor(p/M)
      ][
        p%M
      ]=-1
  );

  for(
    let r=0;
    r<N;
    r++
  )

    for(
      let c=0;
      c<M;
      c++
    )

      if(
        board[r][c]!==-1
      )

        board[r][c]=
          near(r,c)
            .filter(
              ([a,b])=>
                board[a][b]===-1
            )
            .length;


  function near(
    r,
    c
  ){

    let a=[];

    for(
      let dr=-1;
      dr<=1;
      dr++
    )

      for(
        let dc=-1;
        dc<=1;
        dc++
      ){

        let rr=r+dr;
        let cc=c+dc;

        if(
          rr>=0&&
          rr<N&&
          cc>=0&&
          cc<M
        )
          a.push([
            rr,
            cc
          ]);
      }

    return a;
  }


  function reveal(
    r,
    c
  ){

    if(
      done||
      flag[r][c]||
      open[r][c]
    )
      return;

    open[r][c]=true;

    if(
      board[r][c]===-1
    ){

      done=true;

      alert(
        "💥 지뢰를 밟았어요!"
      );

      return renderBoard();
    }

    if(
      board[r][c]===0
    )

      near(r,c)
        .forEach(
          ([rr,cc])=>
            reveal(rr,cc)
        );

    if(
      open
        .flat()
        .filter(Boolean)
        .length
      ===
      N*M-mines.length
    ){

      done=true;

      alert(
        "🎉 지뢰찾기 클리어!"
      );
    }

    renderBoard();
  }


  function toggleFlag(
    r,
    c
  ){

    if(
      done||
      open[r][c]
    )
      return;

    flag[r][c]=
      !flag[r][c];

    renderBoard();
  }


  function renderBoard(){

    const cells=[];

    for(
      let r=0;
      r<N;
      r++
    )

      for(
        let c=0;
        c<M;
        c++
      ){

        let v=
          board[r][c];

        cells.push(`
          <button
            class="
              ms-cell
              ${open[r][c]?"open":""}
              ${flag[r][c]?"flag":""}
            "
            onclick="
              MS.reveal(${r},${c})
            "
            oncontextmenu="
              event.preventDefault();
              MS.flag(${r},${c})
            "
          >
            ${
              flag[r][c]
              ?"🚩"
              :open[r][c]
                ?(
                  v===-1
                  ?"💣"
                  :v||""
                )
                :""
            }
          </button>
        `);
      }

    $("#app").innerHTML=
      gamePage(
        "💣 지뢰찾기",

        `
          <div
            class="card"
            style="padding:12px"
          >

            <div
              class="ms-board"
              style="
                grid-template-columns:
                repeat(${M},1fr)
              "
            >
              ${cells.join("")}
            </div>

          </div>

          <p class="muted center">
            좌클릭: 열기 ·
            우클릭: 깃발
          </p>
        `
      );
  }

  window.MS={
    reveal,
    toggle:toggleFlag,
    flag:toggleFlag
  };

  renderBoard();
}


/* =========================================================
   SHISEN
========================================================= */

function shisen(){

  const R=8;
  const C=8;

  const tiles=[
    "🍎","🍋","🍇","🍒",
    "🥝","🍉","🍑","🍓",
    "🍊","🍍","🥕","🌽",
    "🍀","⭐","🐰","🦊",
    "🐼","🐸","🐯","🐨",
    "🐹","🐵","🐶","🐱",
    "🦄","🐥","🦋","🌸",
    "🍀","💎","🎈","🎀"
  ];

  let vals=[
    ...tiles,
    ...tiles
  ].sort(
    ()=>Math.random()-.5
  );

  let sel=null;

  let alive=
    Array(
      R*C
    ).fill(true);


  function id(
    r,
    c
  ){
    return r*C+c;
  }


  function path(
    a,
    b
  ){

    if(
      a.r===b.r
    ){

      let lo=
        Math.min(
          a.c,
          b.c
        );

      let hi=
        Math.max(
          a.c,
          b.c
        );

      for(
        let c=lo+1;
        c<hi;
        c++
      )

        if(
          alive[
            id(a.r,c)
          ]
        )
          return false;

      return true;
    }


    if(
      a.c===b.c
    ){

      let lo=
        Math.min(
          a.r,
          b.r
        );

      let hi=
        Math.max(
          a.r,
          b.r
        );

      for(
        let r=lo+1;
        r<hi;
        r++
      )

        if(
          alive[
            id(r,a.c)
          ]
        )
          return false;

      return true;
    }


    const corners=[
      {
        r:a.r,
        c:b.c
      },
      {
        r:b.r,
        c:a.c
      }
    ];


    for(
      const x of corners
    ){

      if(
        !alive[
          id(
            x.r,
            x.c
          )
        ]
        ||
        (
          x.r===a.r&&
          x.c===a.c
        )
        ||
        (
          x.r===b.r&&
          x.c===b.c
        )
      ){

        let ok1=true;
        let ok2=true;

        let lo=
          Math.min(
            a.c,
            x.c
          );

        let hi=
          Math.max(
            a.c,
            x.c
          );

        for(
          let c=lo+1;
          c<hi;
          c++
        )

          if(
            alive[
              id(a.r,c)
            ]
          )
            ok1=false;


        lo=
          Math.min(
            a.r,
            x.r
          );

        hi=
          Math.max(
            a.r,
            x.r
          );

        for(
          let r=lo+1;
          r<hi;
          r++
        )

          if(
            alive[
              id(r,a.c)
            ]
          )
            ok1=false;


        lo=
          Math.min(
            x.c,
            b.c
          );

        hi=
          Math.max(
            x.c,
            b.c
          );

        for(
          let c=lo+1;
          c<hi;
          c++
        )

          if(
            alive[
              id(b.r,c)
            ]
          )
            ok2=false;


        lo=
          Math.min(
            x.r,
            b.r
          );

        hi=
          Math.max(
            x.r,
            b.r
          );

        for(
          let r=lo+1;
          r<hi;
          r++
        )

          if(
            alive[
              id(r,b.c)
            ]
          )
            ok2=false;


        if(
          ok1&&
          ok2
        )
          return true;
      }
    }

    return false;
  }


  function click(
    r,
    c
  ){

    if(
      !alive[
        id(r,c)
      ]
    )
      return;

    if(!sel){

      sel={
        r,
        c
      };

      return render();
    }

    if(
      sel.r===r&&
      sel.c===c
    ){

      sel=null;

      return render();
    }


    if(
      vals[
        id(
          sel.r,
          sel.c
        )
      ]
      ===
      vals[
        id(r,c)
      ]
      &&
      path(
        sel,
        {
          r,
          c
        }
      )
    ){

      alive[
        id(
          sel.r,
          sel.c
        )
      ]=false;

      alive[
        id(r,c)
      ]=false;

      sel=null;

      if(
        alive.every(
          x=>!x
        )
      ){

        alert(
          "🎉 사천성 클리어!"
        );
      }

    }else{

      sel={
        r,
        c
      };
    }

    render();
  }


  function render(){

    const cells=[];

    for(
      let r=0;
      r<R;
      r++
    )

      for(
        let c=0;
        c<C;
        c++
      )

        cells.push(`
          <button
            class="
              shisen-cell
              ${
                sel&&
                sel.r===r&&
                sel.c===c
                ?"selected":""
              }
            "
            onclick="
              SH.click(${r},${c})
            "
          >
            ${
              alive[
                id(r,c)
              ]
              ?vals[
                id(r,c)
              ]
              :""
            }
          </button>
        `);


    $("#app").innerHTML=
      gamePage(
        "🀄 사천성",

        `
          <div
            class="card"
            style="padding:10px"
          >

            <div
              class="shisen-board"
              style="
                grid-template-columns:
                repeat(${C},1fr)
              "
            >
              ${cells.join("")}
            </div>

          </div>

          <p class="muted center">
            같은 타일을 최대 2번
            꺾어 연결하세요.
          </p>
        `
      );
  }

  window.SH={
    click
  };

  render();
}


/* =========================================================
   OMOK
========================================================= */

function omok(){

  const N=15;

  const b=
    Array.from(
      {length:N},
      ()=>Array(N).fill(0)
    );

  let turn=1;
  let over=false;


  function win(
    r,
    c
  ){

    for(
      const [
        dr,
        dc
      ]
      of [
        [1,0],
        [0,1],
        [1,1],
        [1,-1]
      ]
    ){

      let n=1;

      for(
        const s
        of [1,-1]
      ){

        let rr=
          r+dr*s;

        let cc=
          c+dc*s;

        while(
          rr>=0&&
          rr<N&&
          cc>=0&&
          cc<N&&
          b[rr][cc]===turn
        ){

          n++;

          rr+=dr*s;
          cc+=dc*s;
        }
      }

      if(n>=5)
        return true;
    }

    return false;
  }


  function put(
    r,
    c
  ){

    if(
      over||
      b[r][c]
    )
      return;

    b[r][c]=turn;

    if(
      win(r,c)
    ){

      over=true;

      alert(
        (
          turn===1
          ?"⚫"
          :"⚪"
        )+
        " 승리!"
      );
    }

    turn=
      turn===1
      ?2
      :1;

    render();
  }


  function render(){

    const cells=[];

    for(
      let r=0;
      r<N;
      r++
    )

      for(
        let c=0;
        c<N;
        c++
      )

        cells.push(`
          <button
            class="omok-cell"
            onclick="
              OM.put(${r},${c})
            "
          >
            ${
              b[r][c]
              ?`
                <i
                  class="
                    stone
                    ${
                      b[r][c]===1
                      ?"black"
                      :"white"
                    }
                  "
                ></i>
              `
              :""
            }
          </button>
        `);


    $("#app").innerHTML=
      gamePage(
        "⚫ 오목",

        `
          <div
            class="card"
            style="padding:8px"
          >

            <div class="omok-board">
              ${cells.join("")}
            </div>

          </div>

          <p class="center">
            현재 차례:
            ${
              turn===1
              ?"⚫ 흑"
              :"⚪ 백"
            }
          </p>
        `
      );
  }

  window.OM={
    put
  };

  render();
}


/* =========================================================
   TETRIS
========================================================= */

function tetris(){

  const W=10;
  const H=20;

  let b=
    Array.from(
      {length:H},
      ()=>Array(W).fill(0)
    );

  let score=0;
  let over=false;

  const shapes=[
    [[1,1,1,1]],
    [[1,1],[1,1]],
    [[0,1,0],[1,1,1]],
    [[1,0,0],[1,1,1]],
    [[0,0,1],[1,1,1]],
    [[1,1,0],[0,1,1]],
    [[0,1,1],[1,1,0]]
  ];

  let p={
    x:3,
    y:0,
    s:
      shapes[
        Math.floor(
          Math.random()*shapes.length
        )
      ]
  };


  function hit(
    nx,
    ny,
    ns=p.s
  ){

    for(
      let y=0;
      y<ns.length;
      y++
    )

      for(
        let x=0;
        x<ns[y].length;
        x++
      )

        if(
          ns[y][x]&&
          (
            ny+y>=H||
            nx+x<0||
            nx+x>=W||
            b[ny+y][nx+x]
          )
        )
          return true;

    return false;
  }


  function lock(){

    p.s.forEach(
      (row,y)=>
        row.forEach(
          (v,x)=>{

            if(v)
              b[
                p.y+y
              ][
                p.x+x
              ]=1;

          }
        )
    );


    for(
      let y=H-1;
      y>=0;
      y--
    )

      if(
        b[y].every(Boolean)
      ){

        b.splice(
          y,
          1
        );

        b.unshift(
          Array(W).fill(0)
        );

        score+=100;

        y++;
      }


    p={
      x:3,
      y:0,
      s:
        shapes[
          Math.floor(
            Math.random()*
            shapes.length
          )
        ]
    };


    if(
      hit(
        p.x,
        p.y
      )
    )
      over=true;
  }


  function move(
    dx
  ){

    if(
      !hit(
        p.x+dx,
        p.y
      )
    )
      p.x+=dx;

    render();
  }


  function down(){

    if(
      !hit(
        p.x,
        p.y+1
      )
    ){

      p.y++;

    }else{

      lock();
    }

    render();
  }


  function rotate(){

    const ns=
      p.s[0]
        .map(
          (_,i)=>
            p.s
              .map(
                r=>r[i]
              )
              .reverse()
        );

    if(
      !hit(
        p.x,
        p.y,
        ns
      )
    )
      p.s=ns;

    render();
  }


  function drop(){

    while(
      !hit(
        p.x,
        p.y+1
      )
    )
      p.y++;

    lock();

    render();
  }


  function render(){

    let a=
      b.map(
        r=>r.slice()
      );


    p.s.forEach(
      (row,y)=>
        row.forEach(
          (v,x)=>{

            if(
              v&&
              p.y+y<H&&
              p.x+x<W
            )
              a[
                p.y+y
              ][
                p.x+x
              ]=1;

          }
        )
    );


    $("#app").innerHTML=
      gamePage(
        "🧱 테트리스",

        `
          <div class="tetris-wrap">

            <div class="tetris-board">

              ${
                a.flat()
                  .map(
                    v=>`
                      <div
                        class="
                          tcell
                          ${v?"filled":""}
                        "
                      ></div>
                    `
                  )
                  .join("")
              }

            </div>


            <div class="tetris-side">

              <div
                class="card"
                style="padding:12px"
              >

                <b>점수</b>

                <strong
                  style="
                    font-size:24px;
                    display:block
                  "
                >
                  ${score}
                </strong>

              </div>


              <button
                class="primary"
                onclick="
                  TR.move(-1)
                "
              >
                ←
              </button>

              <button
                class="primary"
                onclick="
                  TR.rotate()
                "
              >
                ↻
              </button>

              <button
                class="primary"
                onclick="
                  TR.move(1)
                "
              >
                →
              </button>

              <button
                class="primary"
                onclick="
                  TR.drop()
                "
              >
                ↓
              </button>

            </div>

          </div>


          <p class="center muted">
            ${
              over
              ?"게임오버!"
              :"버튼으로 블록을 움직여 보세요."
            }
          </p>
        `
      );
  }


  window.TR={
    move,
    rotate,
    drop
  };

  render();

  clearInterval(
    window.ti
  );

  window.ti=
    setInterval(
      ()=>{
        if(!over)
          down();
      },
      700
    );
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
   START
   관리자 공지를 D1에서 가져옴
========================================================= */

(async()=>{

  try{

    const n=
      await fetch(
        "/api/notices"
      ).then(
        r=>
          r.ok
          ?r.json()
          :{
            notices:[]
          }
      );

    window.HANI_NOTICE=
      (
        n.notices&&
        n.notices[0]
      )||{
        message:
          "하니게임즈에 오신 것을 환영해요 🐰💙",
        button_text:
          "확인",
        button_link:
          ""
      };

  }catch{

    window.HANI_NOTICE={
      message:
        "하니게임즈에 오신 것을 환영해요 🐰💙",
      button_text:
        "확인",
      button_link:
        ""
    };
  }


  try{

    const d=
      await api(
        "/api/me"
      );

    S.user=d.user;

    render();

  }catch{

    render();
  }

})();
