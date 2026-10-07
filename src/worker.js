import { DurableObject } from "cloudflare:workers";

const enc = new TextEncoder();
const dec = new TextDecoder();

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=utf-8",
        "cache-control": "no-store"
      }
    }
  );
}

function decodeUserHeader(value) {
  try {
    return decodeURIComponent(value || "")
      .trim()
      .slice(0, 30);
  } catch {
    return "";
  }
}

function base64url(bytes) {
  let s = "";

  for (const b of bytes) {
    s += String.fromCharCode(b);
  }

  return btoa(s)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64url(s) {
  s = s
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  while (s.length % 4) {
    s += "=";
  }

  return Uint8Array.from(
    atob(s),
    c => c.charCodeAt(0)
  );
}

async function hashPassword(password) {
  const salt =
    crypto.getRandomValues(
      new Uint8Array(16)
    );

  const key =
    await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      {
        name: "PBKDF2"
      },
      false,
      ["deriveBits"]
    );

  const bits =
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations: 100000,
        hash: "SHA-256"
      },
      key,
      256
    );

  return (
    `${base64url(salt)}.` +
    `${base64url(new Uint8Array(bits))}`
  );
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  let x = 0;

  for (let i = 0; i < a.length; i++) {
    x |= a[i] ^ b[i];
  }

  return x === 0;
}

async function verifyPassword(
  password,
  stored
) {
  try {

    const [
      saltText,
      hashText
    ] = stored.split(".");

    const salt =
      fromBase64url(saltText);

    const expected =
      fromBase64url(hashText);

    const key =
      await crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        {
          name: "PBKDF2"
        },
        false,
        ["deriveBits"]
      );

    const bits =
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt,
          iterations: 100000,
          hash: "SHA-256"
        },
        key,
        256
      );

    return constantTimeEqual(
      expected,
      new Uint8Array(bits)
    );

  } catch {
    return false;
  }
}

function makeToken(user) {
  const payload =
    JSON.stringify({
      id: user.id,
      username: user.username,
      t: Date.now()
    });

  return base64url(
    enc.encode(payload)
  );
}

function readToken(req) {
  const auth =
    req.headers.get("authorization") || "";

  if (!auth.startsWith("Bearer ")) {
    return null;
  }

  try {

    const bytes =
      fromBase64url(
        auth.slice(7)
      );

    return JSON.parse(
      dec.decode(bytes)
    );

  } catch {
    return null;
  }
}

async function getUser(req, env) {
  const token =
    readToken(req);

  if (token?.id) {

    const user =
      await env.DB.prepare(
        "SELECT * FROM users WHERE id=?"
      )
      .bind(token.id)
      .first();

    if (user) {
      return user;
    }
  }

  const name =
    decodeUserHeader(
      req.headers.get("x-user-name")
    );

  if (!name) {
    return null;
  }

  return await env.DB.prepare(
    "SELECT * FROM users WHERE username=?"
  )
  .bind(name)
  .first();
}

export default {

  async fetch(req, env) {

    const url =
      new URL(req.url);

    if (url.pathname.startsWith("/api/")) {

      try {

        /*
          회원가입
        */

        if (
          url.pathname === "/api/register" &&
          req.method === "POST"
        ) {

          const body =
            await req.json()
              .catch(() => ({}));

          const username =
            String(
              body.username || ""
            )
            .trim()
            .slice(0, 30);

          const password =
            String(
              body.password || ""
            );

          if (!username || !password) {
            return json(
              {
                error:
                  "닉네임과 비밀번호를 입력해주세요."
              },
              400
            );
          }

          if (password.length < 4) {
            return json(
              {
                error:
                  "비밀번호는 4자 이상이어야 합니다."
              },
              400
            );
          }

          const exists =
            await env.DB.prepare(
              "SELECT id FROM users WHERE username=?"
            )
            .bind(username)
            .first();

          if (exists) {
            return json(
              {
                error:
                  "이미 사용 중인 닉네임이에요."
              },
              409
            );
          }

          const passwordHash =
            await hashPassword(
              password
            );

          await env.DB.prepare(
            `INSERT INTO users(
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
            VALUES(?,?,?,?,?,?,?,?,?)`
          )
          .bind(
            username,
            passwordHash,
            10000,
            1,
            0,
            0,
            0,
            0,
            0
          )
          .run();

          const user =
            await env.DB.prepare(
              "SELECT * FROM users WHERE username=?"
            )
            .bind(username)
            .first();

          return json({
            user,
            token: makeToken(user)
          });
        }

        /*
          로그인
        */

        if (
          url.pathname === "/api/login" &&
          req.method === "POST"
        ) {

          const body =
            await req.json()
              .catch(() => ({}));

          const username =
            String(
              body.username || ""
            )
            .trim()
            .slice(0, 30);

          const password =
            String(
              body.password || ""
            );

          const user =
            await env.DB.prepare(
              "SELECT * FROM users WHERE username=?"
            )
            .bind(username)
            .first();

          if (
            !user ||
            !(await verifyPassword(
              password,
              user.password_hash
            ))
          ) {
            return json(
              {
                error:
                  "닉네임 또는 비밀번호가 맞지 않아요."
              },
              401
            );
          }

          return json({
            user,
            token: makeToken(user)
          });
        }

        /*
          로그인 필요한 API
        */

        const user =
          await getUser(req, env);

        if (!user) {
          return json(
            {
              error:
                "로그인이 필요합니다."
            },
            401
          );
        }

        /*
          내 정보
        */

        if (
          url.pathname === "/api/me" &&
          req.method === "GET"
        ) {

          return json({
            user
          });
        }

        /*
          랭킹
        */

        if (
          url.pathname === "/api/ranking" &&
          req.method === "GET"
        ) {

          const r =
            await env.DB.prepare(
              `SELECT
                username,
                points,
                level,
                wins,
                losses
               FROM users
               ORDER BY points DESC
               LIMIT 20`
            )
            .all();

          return json({
            ranking:
              r.results || []
          });
        }

        /*
          하니 키우기
        */

        if (
          url.pathname === "/api/action" &&
          req.method === "POST"
        ) {

          const body =
            await req.json()
              .catch(() => ({}));

          const type =
            String(
              body.type || ""
            );

          if (type === "workout") {

            await env.DB.prepare(
              `UPDATE users
               SET xp=xp+10,
                   body_size=body_size+1
               WHERE id=?`
            )
            .bind(user.id)
            .run();

          } else if (
            type === "feed"
          ) {

            await env.DB.prepare(
              `UPDATE users
               SET xp=xp+5
               WHERE id=?`
            )
            .bind(user.id)
            .run();
          }

          return json({
            ok: true
          });
        }

        /*
          방 목록
        */

        if (
          url.pathname === "/api/rooms" &&
          req.method === "GET"
        ) {

          const game =
            url.searchParams.get("game") ||
            "shisen";

          const r =
            await env.DB.prepare(
              `SELECT
                rooms.room_code,
                rooms.game,
                rooms.stake,
                rooms.status,
                users.username AS host_name
               FROM rooms
               JOIN users
                 ON users.id = rooms.host_id
               WHERE rooms.game=?
                 AND rooms.status='waiting'
               ORDER BY rooms.created_at DESC
               LIMIT 30`
            )
            .bind(game)
            .all();

          return json({
            rooms:
              r.results || []
          });
        }

        /*
          방 만들기
        */

        if (
          url.pathname === "/api/rooms" &&
          req.method === "POST"
        ) {

          const body =
            await req.json()
              .catch(() => ({}));

          const game =
            String(
              body.game || "shisen"
            );

          const stake =
            Math.max(
              0,
              Number(
                body.stake || 0
              )
            );

          if (stake > user.points) {
            return json(
              {
                error:
                  "포인트가 부족합니다."
              },
              400
            );
          }

          const roomCode =
            crypto.randomUUID()
              .replace(/-/g, "")
              .slice(0, 6)
              .toUpperCase();

          await env.DB.prepare(
            `INSERT INTO rooms(
              room_code,
              game,
              host_id,
              stake,
              status
            )
            VALUES(?,?,?,?,?)`
          )
          .bind(
            roomCode,
            game,
            user.id,
            stake,
            "waiting"
          )
          .run();

          const id =
            env.GameRoom.idFromName(
              roomCode
            );

          const stub =
            env.GameRoom.get(id);

          await stub.fetch(
            "https://room/create",
            {
              method: "POST",

              body: JSON.stringify({
                code: roomCode,
                game,
                stake,
                host: user.username,
                hostId: user.id
              })
            }
          );

          return json({
            roomCode
          });
        }

        /*
          방 API
        */

        const match =
          url.pathname.match(
            /^\/api\/rooms\/([^/]+)(?:\/(join|ready|move|ws))?$/
          );

        if (match) {

          const code =
            match[1];

          const action =
            match[2] || "state";

          const id =
            env.GameRoom.idFromName(
              code
            );

          const stub =
            env.GameRoom.get(id);

          /*
            입장
          */

          if (action === "join") {

            return stub.fetch(
              "https://room/join",
              {
                method: "POST",

                body: JSON.stringify({
                  username:
                    user.username,

                  userId:
                    user.id
                })
              }
            );
          }

          /*
            READY
          */

          if (action === "ready") {

            return stub.fetch(
              "https://room/ready",
              {
                method: "POST",

                body: JSON.stringify({
                  username:
                    user.username
                })
              }
            );
          }

          /*
            MOVE
          */

          if (action === "move") {

            return stub.fetch(
              "https://room/move",
              {
                method: "POST",

                body:
                  await req.text()
              }
            );
          }

          /*
            WebSocket
          */

          if (action === "ws") {

            return stub.fetch(
              "https://room/ws",
              {
                headers:
                  req.headers
              }
            );
          }

          /*
            상태
          */

          return stub.fetch(
            "https://room/state"
          );
        }

        return json(
          {
            error:
              "Not found"
          },
          404
        );

      } catch (e) {

        return json(
          {
            error:
              e?.message ||
              String(e)
          },
          500
        );
      }
    }

    /*
      일반 파일은
      Cloudflare Static Assets에서 제공
    */

    return env.ASSETS.fetch(req);
  }
};

export class GameRoom
  extends DurableObject {

  constructor(ctx, env) {
    super(ctx, env);

    this.ctx = ctx;
    this.env = env;
  }

  async load() {

    return (
      await this.ctx.storage.get(
        "state"
      )
    ) || {

      room: null,

      players: [],

      ready: [],

      status: "waiting",

      turn: null,

      board:
        Array(25).fill("🐰")
    };
  }

  async save(state) {

    await this.ctx.storage.put(
      "state",
      state
    );

    return state;
  }

  async broadcast(message) {

    const sockets =
      this.ctx.getWebSockets();

    const text =
      JSON.stringify(message);

    for (const ws of sockets) {

      try {
        ws.send(text);
      } catch {}
    }
  }

  async fetch(req) {

    const url =
      new URL(req.url);

    let state =
      await this.load();

    /*
      방 생성
    */

    if (
      url.pathname === "/create"
    ) {

      const body =
        await req.json();

      state.room = {

        roomCode:
          body.code,

        game:
          body.game,

        stake:
          body.stake,

        host: {
          id:
            body.hostId,

          name:
            body.host
        }
      };

      state.players = [
        body.host
      ];

      state.ready = [];

      state.status =
        "waiting";

      state.turn = null;

      state.board =
        Array(25).fill("🐰");

      await this.save(
        state
      );

      return json({
        ok: true,
        state:
          this.publicState(state)
      });
    }

    /*
      방 입장
    */

    if (
      url.pathname === "/join"
    ) {

      const body =
        await req.json();

      if (!state.room) {

        return json(
          {
            error:
              "방을 찾을 수 없습니다."
          },
          404
        );
      }

      if (state.guest) {

        return json(
          {
            error:
              "방이 가득 찼습니다."
          },
          400
        );
      }

      if (
        state.host?.name ===
        body.username
      ) {

        return json({
          ok: true,
          state:
            this.publicState(
              state
            )
        });
      }

      state.guest = {

        id:
          body.userId,

        name:
          body.username
      };

      state.players = [
        state.host.name,
        body.username
      ];

      state.status =
        "ready";

      await this.save(
        state
      );

      await this.syncRoom();

      return json({
        ok: true,
        state:
          this.publicState(state)
      });
    }

    /*
      READY
    */

    if (
      url.pathname === "/ready"
    ) {

      const body =
        await req.json();

      if (
        !state.ready.includes(
          body.username
        )
      ) {

        state.ready.push(
          body.username
        );
      }

      if (
        state.host &&
        state.guest &&
        state.ready.includes(
          state.host.name
        ) &&
        state.ready.includes(
          state.guest.name
        )
      ) {

        state.status =
          "playing";

        state.turn =
          state.host.id;
      }

      await this.save(
        state
      );

      await this.syncRoom();

      await this.broadcast({
        type: "room",

        state:
          this.publicState(
            state
          )
      });

      return json({
        ok: true,
        state:
          this.publicState(state)
      });
    }

    /*
      게임 이동
    */

    if (
      url.pathname === "/move"
    ) {

      const body =
        await req.json()
          .catch(() => ({}));

      if (
        state.status !==
        "playing"
      ) {

        return json(
          {
            error:
              "게임이 아직 시작되지 않았습니다."
          },
          400
        );
      }

      const a =
        Number(body.a);

      const b =
        Number(body.b);

      if (
        Number.isInteger(a) &&
        Number.isInteger(b) &&
        a >= 0 &&
        a < 25 &&
        b >= 0 &&
        b < 25 &&
        a !== b &&
        state.board[a] &&
        state.board[b] &&
        state.board[a] ===
          state.board[b]
      ) {

        state.board[a] =
          null;

        state.board[b] =
          null;
      }

      state.turn =
        state.turn ===
          state.host.id

          ? state.guest?.id

          : state.host.id;

      await this.save(
        state
      );

      await this.broadcast({
        type: "room",

        state:
          this.publicState(
            state
          )
      });

      return json({
        ok: true,
        state:
          this.publicState(
            state
          )
      });
    }

    /*
      WebSocket
    */

    if (
      url.pathname === "/ws"
    ) {

      const pair =
        new WebSocketPair();

      const [
        client,
        server
      ] =
        Object.values(pair);

      this.ctx.acceptWebSocket(
        server
      );

      server.send(
        JSON.stringify({
          type: "room",

          state:
            this.publicState(
              state
            )
        })
      );

      return new Response(
        null,
        {
          status: 101,
          webSocket:
            client
        }
      );
    }

    /*
      방 상태
    */

    if (
      url.pathname === "/state"
    ) {

      return json({
        state:
          this.publicState(
            state
          )
      });
    }

    return new Response(
      "Not found",
      {
        status: 404
      }
    );
  }

  async webSocketMessage(
    ws,
    message
  ) {

    try {

      const body =
        JSON.parse(message);

      let state =
        await this.load();

      /*
        READY는 HTTP API로 처리
      */

      if (
        body?.type ===
        "ready"
      ) {
        return;
      }

      /*
        MOVE
      */

      if (
        body?.type ===
        "move"
      ) {

        if (
          state.status !==
          "playing"
        ) {
          return;
        }

        const a =
          Number(body.a);

        const b =
          Number(body.b);

        if (
          Number.isInteger(a) &&
          Number.isInteger(b) &&
          a >= 0 &&
          a < 25 &&
          b >= 0 &&
          b < 25 &&
          a !== b &&
          state.board[a] &&
          state.board[b] &&
          state.board[a] ===
            state.board[b]
        ) {

          state.board[a] =
            null;

          state.board[b] =
            null;
        }

        state.turn =
          state.turn ===
            state.host.id

            ? state.guest?.id

            : state.host.id;

        await this.save(
          state
        );

        await this.broadcast({
          type: "room",

          state:
            this.publicState(
              state
            )
        });
      }

    } catch {}
  }

  publicState(state) {

    return {

      roomCode:
        state.room?.roomCode,

      game:
        state.room?.game,

      stake:
        state.room?.stake || 0,

      host:
        state.host || null,

      guest:
        state.guest || null,

      players:
        state.players || [],

      ready:
        state.ready || [],

      status:
        state.status ||
        "waiting",

      turn:
        state.turn || null,

      board:
        state.board || []
    };
  }

  async syncRoom() {

    const state =
      await this.load();

    if (!state.room) {
      return;
    }

    try {

      await this.env.DB.prepare(
        `UPDATE rooms
         SET guest_id=(
           SELECT id
           FROM users
           WHERE username=?
         ),
         status=?
         WHERE room_code=?`
      )
      .bind(
        state.guest?.name ||
          null,

        state.status,

        state.room.roomCode
      )
      .run();

    } catch {}
  }
}
