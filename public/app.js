const A = document.querySelector("#app");

const G = {
  shisen: "사천성 대전",
  omok: "오목 대전",
  tetris: "테트리스 대전"
};

let me = localStorage.getItem("haniUser") || "";
let token = localStorage.getItem("haniToken") || "";
let currentGame = "shisen";
let currentRoom = null;
let socket = null;
let selected = null;

function headers() {
  const h = { "content-type": "application/json" };

  if (token) h.authorization = `Bearer ${token}`;

  // 한글 닉네임을 HTTP 헤더에 직접 넣으면 오류가 나므로 URL 인코딩
  if (me) h["x-user-name"] = encodeURIComponent(me);

  return h;
}

async function api(path, options = {}) {
  options.headers = {
    ...headers(),
    ...(options.headers || {})
  };

  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || "요청에 실패했어요.");
  }

  return data;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function saveSession(user, authToken) {
  me = user;
  token = authToken || "";

  localStorage.setItem("haniUser", me);

  if (token) {
    localStorage.setItem("haniToken", token);
  }
}

function clearSession() {
  me = "";
  token = "";

  localStorage.removeItem("haniUser");
  localStorage.removeItem("haniToken");

  if (socket) {
    try {
      socket.close();
    } catch {}

    socket = null;
  }
}

function shell(content) {
  A.innerHTML = `<div class="wrap">${content}</div>`;
}

function header(back = true) {
  return `
    <div class="top">

      <div class="brand">
        🐰 하니게임즈
        <small>1:1 미니게임</small>
      </div>

      <div class="row">

        ${
          back
            ? `<button class="btn secondary" onclick="home()">홈</button>`
            : ""
        }

        ${
          me
            ? `<button class="btn secondary" onclick="logout()">로그아웃</button>`
            : ""
        }

      </div>

    </div>
  `;
}

function loginPage(message = "") {
  shell(`
    <div
      class="card form"
      style="max-width:520px;margin:50px auto"
    >

      <div class="hero">

        <div class="hani">🐰</div>

        <h1>하니게임즈</h1>

        <p>
          로그인하고 하니게임즈를 시작해보세요!
        </p>

      </div>

      ${
        message
          ? `<div class="notice">${esc(message)}</div>`
          : ""
      }

      <label>닉네임</label>

      <input
        id="loginUser"
        maxlength="30"
        placeholder="닉네임"
      >

      <label
        style="display:block;margin-top:12px"
      >
        비밀번호
      </label>

      <input
        id="loginPass"
        type="password"
        maxlength="100"
        placeholder="비밀번호"
      >

      <div
        class="actions"
        style="margin-top:16px"
      >

        <button
          class="btn"
          onclick="login()"
        >
          로그인
        </button>

        <button
          class="btn secondary"
          onclick="register()"
        >
          회원가입
        </button>

      </div>

    </div>
  `);
}

async function login() {
  const username =
    document.querySelector("#loginUser").value.trim();

  const password =
    document.querySelector("#loginPass").value;

  if (!username || !password) {
    alert("닉네임과 비밀번호를 입력해주세요.");
    return;
  }

  try {
    const d = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username,
        password
      })
    });

    saveSession(
      d.user.username,
      d.token
    );

    home();

  } catch (e) {
    alert(e.message);
  }
}

async function register() {
  const username =
    document.querySelector("#loginUser").value.trim();

  const password =
    document.querySelector("#loginPass").value;

  if (!username || !password) {
    alert("닉네임과 비밀번호를 입력해주세요.");
    return;
  }

  if (password.length < 4) {
    alert("비밀번호는 4자 이상이어야 합니다.");
    return;
  }

  try {
    const d = await api("/api/register", {
      method: "POST",
      body: JSON.stringify({
        username,
        password
      })
    });

    saveSession(
      d.user.username,
      d.token
    );

    home();

  } catch (e) {
    alert(e.message);
  }
}

function logout() {
  clearSession();
  loginPage();
}

async function home() {
  if (!me || !token) {
    loginPage();
    return;
  }

  try {
    const d = await api("/api/me");

    if (!d.user) {
      throw new Error("로그인이 만료됐어요.");
    }

    me = d.user.username;

  } catch {
    clearSession();

    loginPage(
      "로그인 정보가 만료되어 다시 로그인해주세요."
    );

    return;
  }

  shell(`
    ${header(false)}

    <div class="card hero">

      <div class="hani">🐰</div>

      <div>

        <h1>
          안녕하세요, ${esc(me)}님!
        </h1>

        <p>
          오늘도 하니게임즈에서 한 판 해볼까요?
        </p>

        <div class="notice">

          💰
          <b id="points">
            불러오는 중...
          </b>
          P

          · ⭐ Lv.
          <b id="level">-</b>

          · 🏆
          <b id="wins">0</b>승

        </div>

      </div>

    </div>

    <div class="card">

      <div class="title">

        <h2>🎮 1:1 대전</h2>

        <span class="muted">
          실시간
        </span>

      </div>

      <div class="games">

        <button
          class="game"
          onclick="lobby('shisen')"
        >
          <div class="ico">🧩</div>
          <strong>사천성 대전</strong>
          <span>1 : 1</span>
        </button>

        <button
          class="game"
          onclick="lobby('omok')"
        >
          <div class="ico">⚫</div>
          <strong>오목 대전</strong>
          <span>1 : 1</span>
        </button>

        <button
          class="game"
          onclick="lobby('tetris')"
        >
          <div class="ico">🧱</div>
          <strong>테트리스 대전</strong>
          <span>1 : 1</span>
        </button>

      </div>

    </div>

    <div class="card">

      <div class="title">
        <h2>🏆 TOP 5</h2>
      </div>

      <div id="ranking">
        불러오는 중...
      </div>

    </div>
  `);

  loadMe();
  loadRanking();
}

async function loadMe() {
  try {
    const d = await api("/api/me");

    document.querySelector("#points").textContent =
      Number(d.user.points || 0).toLocaleString();

    document.querySelector("#level").textContent =
      d.user.level || 1;

    document.querySelector("#wins").textContent =
      d.user.wins || 0;

  } catch {}
}

async function loadRanking() {
  try {
    const d = await api("/api/ranking");

    const list = d.ranking || [];
    const el = document.querySelector("#ranking");

    if (!el) return;

    el.innerHTML = list.length
      ? list.slice(0, 5).map((x, i) => `
          <div class="room">

            <div>
              <b>
                ${i + 1}.
                ${esc(x.username)}
              </b>

              <small>
                ${Number(x.points || 0).toLocaleString()}P
              </small>
            </div>

            <strong>
              ${x.wins || 0}승
            </strong>

          </div>
        `).join("")
      : `
        <div class="empty">
          아직 랭킹이 없어요.
        </div>
      `;

  } catch {
    const el =
      document.querySelector("#ranking");

    if (el) {
      el.innerHTML = `
        <div class="empty">
          랭킹을 불러오지 못했어요.
        </div>
      `;
    }
  }
}

async function lobby(game) {
  currentGame = game;

  shell(`
    ${header()}

    <div class="card form">

      <div class="title">
        <h2>🎮 ${G[game]}</h2>
      </div>

      <p>
        방을 만들거나 다른 플레이어의 방에 입장하세요.
      </p>

      <label>
        참가 포인트
      </label>

      <input
        id="stake"
        type="number"
        min="0"
        step="100"
        value="100"
      >

      <div
        class="actions"
        style="margin-top:12px"
      >

        <button
          class="btn"
          onclick="createRoom()"
        >
          ＋ 방 만들기
        </button>

        <button
          class="btn secondary"
          onclick="loadRooms()"
        >
          새로고침
        </button>

      </div>

    </div>

    <div class="card">

      <div class="title">
        <h2>🏠 대기 중인 방</h2>
      </div>

      <div id="rooms">
        <div class="empty">
          불러오는 중...
        </div>
      </div>

    </div>
  `);

  loadRooms();
}

async function loadRooms() {
  try {
    const d =
      await api(
        `/api/rooms?game=${encodeURIComponent(currentGame)}`
      );

    const el =
      document.querySelector("#rooms");

    if (!el) return;

    if (!d.rooms?.length) {
      el.innerHTML = `
        <div class="empty">
          대기 중인 방이 없어요.
          첫 방을 만들어보세요!
        </div>
      `;

      return;
    }

    el.innerHTML =
      d.rooms.map(r => `
        <div class="room">

          <div>

            <b>
              🐰
              ${esc(r.host_name || "방장")}의 방
            </b>

            <small>
              ${Number(r.stake || 0).toLocaleString()}P
              ·
              ${esc(r.room_code)}
            </small>

          </div>

          <button
            class="btn"
            onclick="joinRoom('${esc(r.room_code)}')"
          >
            입장
          </button>

        </div>
      `).join("");

  } catch (e) {

    const el =
      document.querySelector("#rooms");

    if (el) {
      el.innerHTML =
        `<div class="empty">${esc(e.message)}</div>`;
    }
  }
}

async function createRoom() {
  const stake =
    Number(
      document.querySelector("#stake")?.value || 0
    );

  try {

    const d = await api("/api/rooms", {
      method: "POST",
      body: JSON.stringify({
        game: currentGame,
        stake
      })
    });

    openRoom(d.roomCode);

  } catch (e) {
    alert(e.message);
  }
}

async function joinRoom(code) {
  try {

    await api(
      `/api/rooms/${encodeURIComponent(code)}/join`,
      {
        method: "POST"
      }
    );

    openRoom(code);

  } catch (e) {
    alert(e.message);
  }
}

async function openRoom(code) {
  currentRoom = code;
  selected = null;

  try {

    const d =
      await api(
        `/api/rooms/${encodeURIComponent(code)}`
      );

    renderRoom(d.state || d);

    if (socket) {
      try {
        socket.close();
      } catch {}
    }

    const protocol =
      location.protocol === "https:"
        ? "wss:"
        : "ws:";

    socket = new WebSocket(
      `${protocol}//${location.host}/api/rooms/${encodeURIComponent(code)}/ws`
    );

    socket.onmessage = event => {

      try {

        const msg =
          JSON.parse(event.data);

        if (msg.type === "room") {
          renderRoom(msg.state);
        }

      } catch {}
    };

  } catch (e) {

    alert(e.message);
    lobby(currentGame);
  }
}

function renderRoom(s) {
  window.lastRoomState = s;

  const host = s.host || {};
  const guest = s.guest || {};
  const ready = s.ready || [];

  const hostReady =
    ready.includes(host.name);

  const guestReady =
    ready.includes(guest.name);

  shell(`
    ${header()}

    <div class="card">

      <div class="title">

        <h2>
          🎮
          ${G[s.game] || s.game || "게임"}
        </h2>

        <span class="muted">
          방 ${esc(s.roomCode)}
        </span>

      </div>

      <div class="players">

        <div class="player">

          <div class="face">
            🐰
          </div>

          <b>
            ${esc(host.name || "방장")}
          </b>

          <small>
            ${
              hostReady
                ? "✅ 준비완료"
                : "⏳ 준비중"
            }
          </small>

        </div>

        <div class="vs">
          VS
        </div>

        <div class="player">

          <div class="face">
            🐰
          </div>

          <b>
            ${esc(guest.name || "상대 기다리는 중")}
          </b>

          <small>
            ${
              guest.name
                ? (
                    guestReady
                      ? "✅ 준비완료"
                      : "⏳ 준비중"
                  )
                : ""
            }
          </small>

        </div>

      </div>

      ${
        s.status === "waiting"

        ? `
          <div class="status">
            상대를 기다리는 중이에요.
          </div>
        `

        : s.status === "ready"

        ? `
          <div class="status">
            두 명이 모두 READY를 누르면 시작돼요.
          </div>

          <div class="center">

            <button
              class="btn"
              onclick="readyRoom()"
            >
              🎮 READY
            </button>

          </div>
        `

        : `
          <div class="status">

            ${
              s.game === "shisen"
                ? "같은 그림 두 개를 골라주세요!"
                : `${G[s.game]} 대전 준비 중`
            }

          </div>

          <div class="board">

            ${
              (
                s.board ||
                Array(25).fill("🐰")
              ).map((x, i) =>
                x

                  ? `
                    <button
                      class="tile ${
                        selected === i
                          ? "selected"
                          : ""
                      }"
                      onclick="pickTile(${i})"
                    >
                      ${esc(x)}
                    </button>
                  `

                  : `
                    <div class="tile off"></div>
                  `
              ).join("")
            }

          </div>
        `
      }

    </div>
  `);
}

async function readyRoom() {
  if (!currentRoom) return;

  try {

    const d =
      await api(
        `/api/rooms/${encodeURIComponent(currentRoom)}/ready`,
        {
          method: "POST"
        }
      );

    renderRoom(d.state || d);

  } catch (e) {
    alert(e.message);
  }
}

async function pickTile(index) {
  if (!currentRoom) return;

  if (selected === null) {
    selected = index;
    renderRoom(
      window.lastRoomState || {}
    );
    return;
  }

  if (selected === index) {
    selected = null;

    renderRoom(
      window.lastRoomState || {}
    );

    return;
  }

  try {

    const d =
      await api(
        `/api/rooms/${encodeURIComponent(currentRoom)}/move`,
        {
          method: "POST",
          body: JSON.stringify({
            a: selected,
            b: index
          })
        }
      );

    selected = null;

    renderRoom(d.state || d);

  } catch (e) {

    selected = null;
    alert(e.message);
  }
}

window.home = home;
window.login = login;
window.register = register;
window.logout = logout;
window.lobby = lobby;
window.loadRooms = loadRooms;
window.createRoom = createRoom;
window.joinRoom = joinRoom;
window.openRoom = openRoom;
window.readyRoom = readyRoom;
window.pickTile = pickTile;

if (me && token) {
  home();
} else {
  loginPage();
}
