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
  function render(){

    const cells=[];

    for(let r=0;r<R;r++){

      for(let c=0;c<C;c++){

        const p=id(r,c);

        cells.push(`
          <button
            class="
              shisen-cell
              ${alive[p]?"":"removed"}
              ${selected&&selected.r===r&&selected.c===c?"selected":""}
            "
            data-r="${r}"
            data-c="${c}"
            ${alive[p]?"":"disabled"}
          >
            ${alive[p]?vals[p]:""}
          </button>
        `);
      }
    }

    $("#app").innerHTML=
      gamePage(
        "🀄 사천성",

        `
          <div
            class="card"
            style="
              width:min(760px,96vw);
              max-width:760px;
              margin:0 auto;
              padding:clamp(8px,2vw,14px);
              box-sizing:border-box;
              overflow:hidden;
            "
          >

            <div
              style="
                position:relative;
                width:100%;
              "
            >

              <div
                class="shisen-board"
                id="shisenBoard"
                style="
                  width:100%;
                  display:grid;
                  grid-template-columns:repeat(${C},minmax(0,1fr));
                  gap:clamp(3px,.7vw,7px);
                  position:relative;
                "
              >
                ${cells.join("")}

                ${
                  drawPath
                  ?`
                    <svg
                      class="shisen-line"
                      viewBox="0 0 ${C} ${R}"
                      preserveAspectRatio="none"
                      style="
                        position:absolute;
                        inset:0;
                        width:100%;
                        height:100%;
                        pointer-events:none;
                        z-index:5;
                        overflow:visible;
                      "
                    >
                      <polyline
                        points="${pathToPoints(drawPath)}"
                        fill="none"
                        stroke="#5b9fd8"
                        stroke-width=".10"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  `
                  :""
                }

              </div>

            </div>

          </div>


          <div
            style="
              display:flex;
              gap:8px;
              justify-content:center;
              margin:10px auto 0;
              width:min(760px,96vw);
            "
          >

            <button
              class="secondary"
              id="shisenHint"
            >
              💡 힌트
            </button>

            <button
              class="primary"
              id="shisenShuffle"
            >
              🔀 셔플
            </button>

          </div>


          <p
            class="center muted"
            style="margin-top:9px"
          >
            같은 타일을 선택하고
            <b>최대 두 번 꺾이는 길</b>로 연결하면 제거됩니다.
          </p>
        `
      );


    document
      .querySelectorAll(
        ".shisen-cell:not([disabled])"
      )
      .forEach(
        el=>{
          el.addEventListener(
            "click",
            ()=>{
              click(
                Number(el.dataset.r),
                Number(el.dataset.c)
              );
            }
          );
        }
      );


    document
      .querySelector(
        "#shisenHint"
      )
      ?.addEventListener(
        "click",
        hint
      );


    document
      .querySelector(
        "#shisenShuffle"
      )
      ?.addEventListener(
        "click",
        shuffleBoard
      );
  }


  newBoard();
  render();
}


/* =========================================================
   OMOK
========================================================= */

function omok(){

  const N=15;

  let board=
    Array.from(
      {length:N},
      ()=>Array(N).fill(0)
    );

  let turn=1;
  let over=false;


  function check(
    r,
    c
  ){

    const v=
      board[r][c];

    const ds=[
      [1,0],
      [0,1],
      [1,1],
      [1,-1]
    ];

    for(
      const [
        dr,
        dc
      ]
      of ds
    ){

      let count=1;

      for(
        let k=1;
        k<5;
        k++
      ){

        const rr=r+dr*k;
        const cc=c+dc*k;

        if(
          rr>=0&&
          rr<N&&
          cc>=0&&
          cc<N&&
          board[rr][cc]===v
        )
          count++;
        else
          break;
      }


      for(
        let k=1;
        k<5;
        k++
      ){

        const rr=r-dr*k;
        const cc=c-dc*k;

        if(
          rr>=0&&
          rr<N&&
          cc>=0&&
          cc<N&&
          board[rr][cc]===v
        )
          count++;
        else
          break;
      }


      if(count>=5)
        return true;
    }

    return false;
  }


  function play(
    r,
    c
  ){

    if(
      over||
      board[r][c]
    )
      return;

    board[r][c]=turn;

    if(
      check(r,c)
    ){

      over=true;

      alert(
        turn===1
        ?"⚫ 흑돌 승리!"
        :"⚪ 백돌 승리!"
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
      ){

        cells.push(`
          <button
            class="
              omok-cell
              ${
                board[r][c]===1
                ?"black"
                :""
              }
              ${
                board[r][c]===2
                ?"white"
                :""
              }
            "
            onclick="
              OMOK.play(
                ${r},
                ${c}
              )
            "
          >
            ${
              board[r][c]
              ?(
                board[r][c]===1
                ?"●"
                :"○"
              )
              :""
            }
          </button>
        `);
      }


    $("#app").innerHTML=
      gamePage(
        "⚫ 오목",

        `
          <div class="card">

            <div
              class="omok-info"
            >

              <b>
                ${
                  over
                  ?"게임 종료"
                  :(
                    turn===1
                    ?"⚫ 흑돌 차례"
                    :"⚪ 백돌 차례"
                  )
                }
              </b>

            </div>

            <div
              class="omok-board"
            >
              ${cells.join("")}
            </div>

          </div>

          <p class="center muted">
            15×15 바둑판에서
            먼저 5개를 연결하세요.
          </p>
        `
      );
  }


  window.OMOK={
    play
  };

  render();
}


/* =========================================================
   TETRIS
========================================================= */

function tetris(){

  const W=10;
  const H=20;

  const shapes=[
    [[1,1,1,1]],
    [[1,1],[1,1]],
    [[0,1,0],[1,1,1]],
    [[1,0,0],[1,1,1]],
    [[0,0,1],[1,1,1]],
    [[1,1,0],[0,1,1]],
    [[0,1,1],[1,1,0]]
  ];

  let board=
    Array.from(
      {length:H},
      ()=>Array(W).fill(0)
    );

  let piece=null;
  let px=3;
  let py=0;
  let score=0;
  let lines=0;
  let over=false;


  function randomPiece(){

    return shapes[
      Math.floor(
        Math.random()*shapes.length
      )
    ]
    .map(
      row=>row.slice()
    );
  }


  function collision(
    shape,
    x,
    y
  ){

    for(
      let r=0;
      r<shape.length;
      r++
    )

      for(
        let c=0;
        c<shape[r].length;
        c++
      )

        if(
          shape[r][c]
        ){

          const xx=x+c;
          const yy=y+r;

          if(
            xx<0||
            xx>=W||
            yy>=H||
            (
              yy>=0&&
              board[yy][xx]
            )
          )
            return true;
        }

    return false;
  }


  function spawn(){

    piece=randomPiece();
    px=
      Math.floor(
        (W-piece[0].length)/2
      );
    py=0;

    if(
      collision(
        piece,
        px,
        py
      )
    )
      over=true;
  }


  function merge(){

    for(
      let r=0;
      r<piece.length;
      r++
    )

      for(
        let c=0;
        c<piece[r].length;
        c++
      )

        if(
          piece[r][c]
        ){

          const yy=py+r;
          const xx=px+c;

          if(
            yy>=0
          )
            board[yy][xx]=1;
        }
  }


  function clearLines(){

    let removed=0;

    board=
      board.filter(
        row=>{

          if(
            row.every(Boolean)
          ){

            removed++;

            return false;
          }

          return true;
        }
      );

    while(
      board.length<H
    )
      board.unshift(
        Array(W).fill(0)
      );

    if(removed){

      lines+=removed;

      score+=
        [0,100,300,500,800][
          removed
        ]||0;
    }
  }


  function down(){

    if(over)
      return;

    if(
      !collision(
        piece,
        px,
        py+1
      )
    ){

      py++;

    }else{

      merge();
      clearLines();
      spawn();
    }

    render();
  }


  function move(
    dx
  ){

    if(over)
      return;

    if(
      !collision(
        piece,
        px+dx,
        py
      )
    )
      px+=dx;

    render();
  }


  function rotate(){

    if(over)
      return;

    const h=piece.length;
    const w=piece[0].length;

    const next=
      Array.from(
        {length:w},
        ()=>Array(h).fill(0)
      );

    for(
      let r=0;
      r<h;
      r++
    )

      for(
        let c=0;
        c<w;
        c++
      )

        next[c][h-1-r]=
          piece[r][c];

    if(
      !collision(
        next,
        px,
        py
      )
    )
      piece=next;

    render();
  }


  function drop(){

    if(over)
      return;

    while(
      !collision(
        piece,
        px,
        py+1
      )
    )
      py++;

    down();
  }


  function render(){

    const cells=[];

    for(
      let r=0;
      r<H;
      r++
    )

      for(
        let c=0;
        c<W;
        c++
      ){

        let active=false;

        if(piece){

          const rr=r-py;
          const cc=c-px;

          active=
            rr>=0&&
            rr<piece.length&&
            cc>=0&&
            cc<piece[rr].length&&
            piece[rr][cc];
        }

        cells.push(`
          <div
            class="
              tetris-cell
              ${
                board[r][c]||
                active
                ?"filled"
                :""
              }
            "
          ></div>
        `);
      }


    $("#app").innerHTML=
      gamePage(
        "🧱 싱글 테트리스",

        `
          <div
            class="card"
            style="
              padding:12px;
              max-width:520px;
              margin:0 auto;
            "
          >

            <div
              class="tetris-head"
            >

              <span>
                점수
                <b>
                  ${score}
                </b>
              </span>

              <span>
                줄
                <b>
                  ${lines}
                </b>
              </span>

            </div>


            <div
              class="tetris-board"
            >
              ${cells.join("")}
            </div>


            <div
              class="tetris-controls"
            >

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

  spawn();
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
async function createRoom(
  game
){
