const A = document.querySelector('#app');

const G = {
  shisen: '사천성 대전',
  omok: '오목 대전',
  tetris: '테트리스 대전'
};

let me = localStorage.getItem('haniUser') || '하니';
let ws = null;
let room = null;
let sel = null;
let last = null;

async function api(path, options = {}) {
  options.headers = {
    ...(options.headers || {}),
    'content-type': 'application/json',
    'x-user-name': me
  };

  const r = await fetch(path, options);

  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(d.error || '요청 실패');
  }

  return d;
}

const esc = x =>
  String(x ?? '').replace(
    /[&<>"']/g,
    c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c])
  );

function headerBar(back = '') {
  return `
    <div class="top">
      <div class="brand">
        🐰 하니게임즈
        <small>1:1 미니게임</small>
      </div>
      ${
        back
          ? '<button class="back" onclick="home()">뒤로</button>'
          : '<div class="points">💰 <span id="p">...</span>P</div>'
      }
    </div>
  `;
}

async function points() {
  try {
    const d = await api('/api/me');

    const p = document.querySelector('#p');

    if (p) {
      p.textContent =
        (d.user?.points || 0).toLocaleString();
    }
  } catch {}
}

function page(content, back = '') {
  A.innerHTML = `
    <div class="wrap">
      ${headerBar(back)}
      ${content}
    </div>
  `;

  points();
}

function home() {
  if (ws) {
    try {
      ws.close();
    } catch {}

    ws = null;
  }

  room = null;
  sel = null;

  location.hash = '';

  page(`
    <div class="card hero">

      <div class="hani">🐰</div>

      <div>
        <h1>하니</h1>

        <div>Lv.1</div>

        <div class="bar">
          <i></i>
        </div>

        <div class="muted">
          진화 0/3 · 경험치 0
        </div>

        <div class="actions" style="margin-top:10px">

          <button
            class="btn"
            onclick="action('workout')"
          >
            ✨ 키우기
          </button>

          <button
            class="btn secondary"
            onclick="action('feed')"
          >
            🥕 먹이기
          </button>

        </div>
      </div>

    </div>

    <div class="card">
      <div class="title">
        <h2>🎮 1:1 대전</h2>
        <span class="muted">실시간</span>
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

  loadRanking();
}

async function loadRanking() {
  try {
    const d = await api('/api/ranking');

    const el = document.querySelector('#ranking');

    if (!el) return;

    el.innerHTML =
      d.length
        ? d.map((x, i) => `
            <div class="room">
              <b>${i + 1}. ${esc(x.username)}</b>
              <strong>${x.wins || 0}승</strong>
            </div>
          `).join('')
        : '<div class="empty">아직 랭킹이 없어요.</div>';

  } catch {
    const el = document.querySelector('#ranking');

    if (el) {
      el.innerHTML =
        '<div class="empty">랭킹을 불러오지 못했어요.</div>';
    }
  }
}

async function action(type) {
  try {
    await api('/api/action', {
      method: 'POST',
      body: JSON.stringify({ type })
    });

    await points();

  } catch (e) {
    alert(e.message);
  }
}

async function lobby(g) {
  page(`
    <div class="card form">

      <div class="title">
        <h2>🎮 ${G[g]}</h2>
      </div>

      <p>1:1 상대와 실시간으로 대결해요.</p>

      <label>참가 포인트</label>

      <input
        id="stake"
        type="number"
        min="0"
        step="100"
        value="500"
      >

      <div class="actions" style="margin-top:12px">

        <button
          class="btn"
          onclick="create('${g}')"
        >
          ＋ 방 만들기
        </button>

      </div>

    </div>

    <div class="card">

      <div class="title">

        <h2>방 목록</h2>

        <button
          class="btn secondary"
          onclick="rooms('${g}')"
        >
          새로고침
        </button>

      </div>

      <div id="rooms">

        <div class="empty">
          불러오는 중...
        </div>

      </div>

    </div>
  `, 1);

  rooms(g);
}

async function rooms(g) {
  try {
    const d =
      await api('/api/rooms?game=' + encodeURIComponent(g));

    const e = document.querySelector('#rooms');

    if (!e) return;

    if (!d.rooms?.length) {
      e.innerHTML = `
        <div class="empty">
          현재 준비된 방이 없어요.<br>
          첫 번째 방을 만들어보세요!
        </div>
      `;

      return;
    }

    e.innerHTML =
      d.rooms.map(r => `
        <div class="room">

          <div>
            <b>🐰 ${esc(r.host_name)}의 방</b>

            <small>
              참가 ${(r.stake || 0).toLocaleString()}P
              · ${esc(r.room_code)}
            </small>
          </div>

          <button
            class="btn"
            onclick="join('${esc(r.room_code)}')"
          >
            입장
          </button>

        </div>
      `).join('');

  } catch (e) {
    const el = document.querySelector('#rooms');

    if (el) {
      el.innerHTML =
        `<div class="empty">${esc(e.message)}</div>`;
    }
  }
}

async function create(g) {
  try {
    const stake =
      Number(document.querySelector('#stake')?.value || 0);

    const d =
      await api('/api/rooms', {
        method: 'POST',
        body: JSON.stringify({
          game: g,
          stake
        })
      });

    openRoom(d.roomCode);

  } catch (e) {
    alert(e.message);
  }
}

async function join(code) {
  try {
    await api(
      '/api/rooms/' +
      encodeURIComponent(code) +
      '/join',
      {
        method: 'POST'
      }
    );

    openRoom(code);

  } catch (e) {
    alert(e.message);
  }
}

async function openRoom(code) {
  room = code;
  sel = null;

  const d =
    await api(
      '/api/rooms/' +
      encodeURIComponent(code)
    );

  render(d.state);

  if (ws) {
    try {
      ws.close();
    } catch {}
  }

  const protocol =
    location.protocol === 'https:'
      ? 'wss'
      : 'ws';

  ws = new WebSocket(
    `${protocol}://${location.host}/api/rooms/${encodeURIComponent(code)}/ws`
  );

  ws.onmessage = e => {
    try {
      const m = JSON.parse(e.data);

      if (m.type === 'room') {
        render(m.state);
      }

    } catch {}
  };

  ws.onclose = () => {
    console.log('WebSocket closed');
  };

  ws.onerror = () => {
    console.log('WebSocket error');
  };
}

function render(s) {
  last = s;

  const host =
    s.host?.name === me
      ? s.host
      : s.guest?.name === me
        ? s.guest
        : null;

  page(`
    <div class="card">

      <div class="title">

        <h2>🎮 ${G[s.game] || s.game}</h2>

        <span class="muted">
          방 ${esc(s.roomCode)}
        </span>

      </div>

      <div class="players">

        <div class="player">

          <div class="face">🐰</div>

          <b>
            ${esc(s.host?.name || '대기')}
          </b>

          <small>
            ${
              s.host
                ? (
                    s.ready?.[s.host.id]
                      ? ' ✅ 준비'
                      : ' ⏳ 준비중'
                  )
                : ''
            }
          </small>

        </div>

        <div class="vs">VS</div>

        <div class="player">

          <div class="face">🐰</div>

          <b>
            ${esc(
              s.guest?.name ||
              '상대 기다리는 중'
            )}
          </b>

          <small>
            ${
              s.guest
                ? (
                    s.ready?.[s.guest.id]
                      ? ' ✅ 준비'
                      : ' ⏳ 준비'
                  )
                : ''
            }
          </small>

        </div>

      </div>

      ${
        s.status === 'waiting'

          ? `
            <div class="status">
              상대를 기다리고 있어요.
            </div>
          `

          : s.status === 'ready'

            ? `
              <div class="status">
                둘 다 준비하면 게임이 시작돼요.
              </div>

              <div class="center">

                <button
                  class="btn"
                  onclick="ready()"
                >
                  🎮 ${
                    host && s.ready?.[host.id]
                      ? '준비완료'
                      : '준비하기'
                  }
                </button>

              </div>
            `

            : s.status === 'playing'

              ? `
                <div class="status">
                  ${
                    String(s.turn) === String(host?.id)
                      ? '🔥 내 차례예요!'
                      : '상대 차례예요.'
                  }
                </div>

                ${
                  s.game === 'shisen'
                    ? `
                      <div class="board">

                        ${(s.board || []).map((x, i) =>
                          x
                            ? `
                              <button
                                class="tile ${
                                  sel === i
                                    ? 'selected'
                                    : ''
                                }"
                                onclick="pick(${i})"
                              >
                                ${esc(x)}
                              </button>
                            `
                            : `
                              <div class="tile off"></div>
                            `
                        ).join('')}

                      </div>
                    `
                    : `
                      <div class="status">
                        ${G[s.game]} 게임은
                        다음 단계에서 추가할 예정이에요.
                      </div>
                    `
                }
              `

              : `
                <div class="status">
                  🎉 대전 종료!
                </div>

                <div class="center">

                  <button
                    class="btn"
                    onclick="home()"
                  >
                    홈으로
                  </button>

                </div>
              `
      }

    </div>
  `, 1);
}

function ready() {
  if (!ws) {
    alert('게임 서버 연결 중이에요.');
    return;
  }

  ws.send(JSON.stringify({
    type: 'ready'
  }));
}

function pick(i) {
  if (!last) return;

  if (
    String(last.turn) !==
    String(last.host?.name === me
      ? last.host?.id
      : last.guest?.id)
  ) {
    return;
  }

  if (sel === null) {
    sel = i;
    render(last);
    return;
  }

  if (sel === i) {
    sel = null;
    render(last);
    return;
  }

  ws?.send(JSON.stringify({
    type: 'move',
    a: sel,
    b: i
  }));

  sel = null;
}

window.addEventListener(
  'hashchange',
  () => home()
);

home();
