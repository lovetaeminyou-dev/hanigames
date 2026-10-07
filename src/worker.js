const encoder = new TextEncoder();
const decoder = new TextDecoder();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

/* =========================
   PASSWORD
========================= */

function bytesToBase64Url(bytes) {
  return btoa(
    String.fromCharCode(...new Uint8Array(bytes))
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlToBytes(value) {
  let s = value
    .replaceAll("-", "+")
    .replaceAll("_", "/");

  while (s.length % 4) s += "=";

  return Uint8Array.from(
    atob(s),
    c => c.charCodeAt(0)
  );
}

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: 120000,
      hash: "SHA-256"
    },
    key,
    256
  );

  return bytesToBase64Url(bits);
}

/* =========================
   TOKEN
========================= */

function makeToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    created: Date.now()
  };

  return bytesToBase64Url(
    encoder.encode(JSON.stringify(payload))
  );
}

function readToken(token) {
  try {
    return JSON.parse(
      decoder.decode(
        base64UrlToBytes(token)
      )
    );
  } catch {
    return null;
  }
}

/* =========================
   PUBLIC USER
========================= */

function publicUser(user) {
  if (!user) return null;

  const evolution = Number(user.evolution || 0);

  const titles = [
    "아기토끼",
    "성장토끼",
    "반짝토끼",
    "왕관토끼",
    "보석토끼",
    "별빛토끼"
  ];

  return {
    id: user.id,
    username: user.username,

    points: Number(user.points || 0),
    level: Number(user.level || 1),
    xp: Number(user.xp || 0),

    body_size: Number(user.body_size || 0),
    evolution,

    wins: Number(user.wins || 0),
    losses: Number(user.losses || 0),

    energy: 100,
    fullness: 100,

    title: titles[Math.min(evolution, titles.length - 1)]
  };
}

/* =========================
   AUTH
========================= */

async function getCurrentUser(request, env) {
  const authorization =
    request.headers.get("authorization") || "";

  if (authorization.startsWith("Bearer ")) {
    const token = authorization.slice(7);
    const data = readToken(token);

    if (data?.id) {
      const user = await env.DB
        .prepare(
          "SELECT * FROM users WHERE id = ?"
        )
        .bind(data.id)
        .first();

      if (user) return user;
    }
  }

  const headerName =
    request.headers.get("x-user-name");

  if (headerName) {
    try {
      const username =
        decodeURIComponent(headerName);

      return await env.DB
        .prepare(
          "SELECT * FROM users WHERE username = ?"
        )
        .bind(username)
        .first();
    } catch {}
  }

  return null;
}

/* =========================
   REGISTER
========================= */

async function register(request, env) {
  const body = await readJson(request);

  const username =
    String(body.username || "").trim();

  const password =
    String(body.password || "");

  if (username.length < 2) {
    return json(
      { error: "닉네임은 2자 이상 입력해주세요." },
      400
    );
  }

  if (username.length > 20) {
    return json(
      { error: "닉네임은 20자 이하로 입력해주세요." },
      400
    );
  }

  if (password.length < 4) {
    return json(
      { error: "비밀번호는 4자 이상 입력해주세요." },
      400
    );
  }

  const existing = await env.DB
    .prepare(
      "SELECT id FROM users WHERE username = ?"
    )
    .bind(username)
    .first();

  if (existing) {
    return json(
      { error: "이미 사용 중인 닉네임입니다." },
      409
    );
  }

  /*
    기존 DB 구조를 그대로 사용하기 위해
    password_hash 하나에 salt + hash를 저장합니다.
  */

  const salt = crypto.randomUUID();

  const hash =
    await hashPassword(password, salt);

  const storedPassword =
    `${salt}:${hash}`;

  const result = await env.DB
    .prepare(`
      INSERT INTO users
      (
        username,
        password_hash,
        points,
        level,
        xp,
        body_size,
        evolution,
        wins,
        losses
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      username,
      storedPassword,
      10000,
      1,
      0,
      0,
      0,
      0,
      0
    )
    .run();

  const user = await env.DB
    .prepare(
      "SELECT * FROM users WHERE id = ?"
    )
    .bind(result.meta.last_row_id)
    .first();

  return json({
    user: publicUser(user),
    token: makeToken(user)
  });
}

/* =========================
   LOGIN
========================= */

async function login(request, env) {
  const body = await readJson(request);

  const username =
    String(body.username || "").trim();

  const password =
    String(body.password || "");

  const user = await env.DB
    .prepare(
      "SELECT * FROM users WHERE username = ?"
    )
    .bind(username)
    .first();

  if (!user) {
    return json(
      {
        error:
          "닉네임 또는 비밀번호가 틀렸습니다."
      },
      401
    );
  }

  const stored =
    String(user.password_hash || "");

  let verified = false;

  /*
    새 계정:
    salt:hash
  */

  if (stored.includes(":")) {
    const index = stored.indexOf(":");

    const salt =
      stored.slice(0, index);

    const savedHash =
      stored.slice(index + 1);

    const currentHash =
      await hashPassword(password, salt);

    verified =
      currentHash === savedHash;
  } else {
    /*
      기존 계정과의 호환을 위해
      username을 salt로 사용하는 방식도 시도.
    */

    const currentHash =
      await hashPassword(password, username);

    verified =
      currentHash === stored;
  }

  if (!verified) {
    return json(
      {
        error:
          "닉네임 또는 비밀번호가 틀렸습니다."
      },
      401
    );
  }

  return json({
    user: publicUser(user),
    token: makeToken(user)
  });
}

/* =========================
   ME
========================= */

async function me(request, env) {
  const user =
    await getCurrentUser(request, env);

  if (!user) {
    return json(
      { error: "로그인이 필요합니다." },
      401
    );
  }

  return json({
    user: publicUser(user)
  });
}

/* =========================
   ACTION
========================= */

async function action(request, env) {
  const user =
    await getCurrentUser(request, env);

  if (!user) {
    return json(
      { error: "로그인이 필요합니다." },
      401
    );
  }

  const body = await readJson(request);

  const actionType =
    String(body.action || "");

  let points =
    Number(user.points || 0);

  let xp =
    Number(user.xp || 0);

  let level =
    Number(user.level || 1);

  let evolution =
    Number(user.evolution || 0);

  let message = "";

  if (actionType === "work") {
    points += 500;
    xp += 25;

    message =
      "💼 일해서 500P와 XP를 얻었어요!";
  }

  else if (actionType === "cook") {
    xp += 15;

    message =
      "🍳 요리를 완료했어요!";
  }

  else if (actionType === "rest") {
    xp += 10;

    message =
      "🛋️ 푹 쉬었어요!";
  }

  else {
    return json(
      { error: "알 수 없는 행동입니다." },
      400
    );
  }

  /*
    레벨업
  */

  while (
    xp >= 100 + (level - 1) * 80
  ) {
    xp -= 100 + (level - 1) * 80;
    level++;

    /*
      5레벨마다 진화
    */

    if (level % 5 === 0) {
      evolution++;

      message +=
        `\n🎉 하니가 ${evolution}단계로 진화했어요!`;
    }
  }

  await env.DB
    .prepare(`
      UPDATE users
      SET
        points = ?,
        xp = ?,
        level = ?,
        evolution = ?
      WHERE id = ?
    `)
    .bind(
      points,
      xp,
      level,
      evolution,
      user.id
    )
    .run();

  const updated =
    await env.DB
      .prepare(
        "SELECT * FROM users WHERE id = ?"
      )
      .bind(user.id)
      .first();

  return json({
    message,
    user: publicUser(updated)
  });
}

/* =========================
   RANKING
========================= */

async function ranking(env) {
  const points =
    await env.DB
      .prepare(`
        SELECT
          username,
          points
        FROM users
        ORDER BY points DESC
        LIMIT 5
      `)
      .all();

  const level =
    await env.DB
      .prepare(`
        SELECT
          username,
          level,
          xp
        FROM users
        ORDER BY level DESC, xp DESC
        LIMIT 5
      `)
      .all();

  const games =
    await env.DB
      .prepare(`
        SELECT
          username,
          wins
        FROM users
        ORDER BY wins DESC
        LIMIT 5
      `)
      .all();

  return json({
    rankings: {
      points: points.results || [],
      level: level.results || [],
      games: games.results || []
    }
  });
}

/* =========================
   ROOMS
========================= */

async function rooms(request, env, user) {

  if (request.method === "GET") {

    const url =
      new URL(request.url);

    const game =
      url.searchParams.get("game");

    let result;

    if (game) {
      result =
        await env.DB
          .prepare(`
            SELECT
              room_code,
              game,
              host_id,
              guest_id,
              stake,
              status,
              created_at
            FROM rooms
            WHERE game = ?
            ORDER BY created_at DESC
            LIMIT 30
          `)
          .bind(game)
          .all();
    }

    else {
      result =
        await env.DB
          .prepare(`
            SELECT
              room_code,
              game,
              host_id,
              guest_id,
              stake,
              status,
              created_at
            FROM rooms
            ORDER BY created_at DESC
            LIMIT 30
          `)
          .all();
    }

    return json({
      rooms: result.results || []
    });
  }

  if (request.method === "POST") {

    const body =
      await readJson(request);

    const game =
      String(body.game || "omok");

    const stake =
      Math.max(
        0,
        Number(body.stake || 0)
      );

    const allowed = [
      "omok",
      "tetris",
      "shisen"
    ];

    if (!allowed.includes(game)) {
      return json(
        { error: "지원하지 않는 게임입니다." },
        400
      );
    }

    if (stake > Number(user.points || 0)) {
      return json(
        { error: "포인트가 부족합니다." },
        400
      );
    }

    let code = "";

    for (let i = 0; i < 10; i++) {

      code =
        Math.random()
          .toString(36)
          .slice(2, 7)
          .toUpperCase();

      const exists =
        await env.DB
          .prepare(
            "SELECT room_code FROM rooms WHERE room_code = ?"
          )
          .bind(code)
          .first();

      if (!exists) break;
    }

    await env.DB
      .prepare(`
        INSERT INTO rooms
        (
          room_code,
          game,
          host_id,
          stake,
          status
        )
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(
        code,
        game,
        user.id,
        stake,
        "waiting"
      )
      .run();

    return json({
      room: {
        room_code: code,
        game,
        host_id: user.id,
        guest_id: null,
        stake,
        status: "waiting"
      }
    });
  }

  return json(
    { error: "지원하지 않는 요청입니다." },
    405
  );
}

/* =========================
   JOIN ROOM
========================= */

async function joinRoom(
  request,
  env,
  user,
  code
) {

  const room =
    await env.DB
      .prepare(
        "SELECT * FROM rooms WHERE room_code = ?"
      )
      .bind(code)
      .first();

  if (!room) {
    return json(
      { error: "방을 찾을 수 없습니다." },
      404
    );
  }

  if (room.guest_id) {
    return json(
      { error: "이미 사람이 들어와 있는 방입니다." },
      409
    );
  }

  if (room.host_id === user.id) {
    return json({
      ok: true,
      room
    });
  }

  await env.DB
    .prepare(`
      UPDATE rooms
      SET
        guest_id = ?,
        status = 'ready'
      WHERE room_code = ?
    `)
    .bind(
      user.id,
      code
    )
    .run();

  const updated =
    await env.DB
      .prepare(
        "SELECT * FROM rooms WHERE room_code = ?"
      )
      .bind(code)
      .first();

  return json({
    ok: true,
    room: updated
  });
}

/* =========================
   ROOM STATE
========================= */

async function roomState(
  env,
  code
) {

  const room =
    await env.DB
      .prepare(
        "SELECT * FROM rooms WHERE room_code = ?"
      )
      .bind(code)
      .first();

  if (!room) {
    return json(
      { error: "방을 찾을 수 없습니다." },
      404
    );
  }

  return json({
    room
  });
}

/* =========================
   DURABLE OBJECT
========================= */

export class GameRoom {

  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sockets = new Set();
  }

  async fetch(request) {

    const url =
      new URL(request.url);

    /*
      WebSocket 연결
    */

    if (
      request.headers.get("Upgrade")
        ?.toLowerCase() === "websocket"
    ) {

      const pair =
        new WebSocketPair();

      const client =
        pair[0];

      const server =
        pair[1];

      server.accept();

      this.sockets.add(server);

      server.addEventListener(
        "close",
        () => {
          this.sockets.delete(server);
        }
      );

      server.addEventListener(
        "error",
        () => {
          this.sockets.delete(server);
        }
      );

      server.addEventListener(
        "message",
        event => {

          let data;

          try {
            data =
              JSON.parse(event.data);
          } catch {
            return;
          }

          this.broadcast({
            type: "message",
            data
          });
        }
      );

      server.send(
        JSON.stringify({
          type: "connected",
          message: "GameRoom 연결 성공"
        })
      );

      return new Response(null, {
        status: 101,
        webSocket: client
      });
    }

    /*
      일반 HTTP 요청
    */

    if (request.method === "GET") {

      return json({
        ok: true,
        type: "GameRoom",
        message: "게임방 연결 성공"
      });
    }

    return json({
      ok: true
    });
  }

  broadcast(data) {

    const message =
      JSON.stringify(data);

    for (const socket of this.sockets) {

      try {
        socket.send(message);
      } catch {
        this.sockets.delete(socket);
      }
    }
  }
}

/* =========================
   MAIN WORKER
========================= */

export default {

  async fetch(request, env) {

    const url =
      new URL(request.url);

    /*
      API
    */

    if (
      url.pathname.startsWith("/api/")
    ) {

      if (
        request.method === "POST" &&
        url.pathname === "/api/register"
      ) {
        return register(
          request,
          env
        );
      }

      if (
        request.method === "POST" &&
        url.pathname === "/api/login"
      ) {
        return login(
          request,
          env
        );
      }

      const user =
        await getCurrentUser(
          request,
          env
        );

      if (!user) {
        return json(
          {
            error:
              "로그인이 필요합니다."
          },
          401
        );
      }

      if (
        url.pathname === "/api/me"
      ) {
        return me(
          request,
          env
        );
      }

      if (
        url.pathname === "/api/action"
      ) {
        return action(
          request,
          env
        );
      }

      if (
        url.pathname === "/api/ranking"
      ) {
        return ranking(env);
      }

      if (
        url.pathname === "/api/rooms"
      ) {
        return rooms(
          request,
          env,
          user
        );
      }

      const joinMatch =
        url.pathname.match(
          /^\/api\/rooms\/([^/]+)\/join$/
        );

      if (joinMatch) {
        return joinRoom(
          request,
          env,
          user,
          joinMatch[1]
        );
      }

      const stateMatch =
        url.pathname.match(
          /^\/api\/rooms\/([^/]+)$/
        );

      if (
        stateMatch &&
        request.method === "GET"
      ) {
        return roomState(
          env,
          stateMatch[1]
        );
      }

      /*
        Durable Object WebSocket
      */

      const wsMatch =
        url.pathname.match(
          /^\/api\/rooms\/([^/]+)\/ws$/
        );

      if (wsMatch) {

        const id =
          env.GameRoom.idFromName(
            wsMatch[1]
          );

        const room =
          env.GameRoom.get(id);

        return room.fetch(request);
      }

      return json(
        {
          error:
            "API를 찾을 수 없습니다."
        },
        404
      );
    }

    /*
      정적 파일
    */

    return env.ASSETS.fetch(request);
  }
};
