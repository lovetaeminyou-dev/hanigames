import { DurableObject } from 'cloudflare:workers';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8'
    }
  });
}

async function hashPassword(password) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const salt =
    crypto.getRandomValues(
      new Uint8Array(16)
    );

  const bits =
    await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      key,
      256
    );

  return (
    [...salt]
      .map(x =>
        x.toString(16).padStart(2, '0')
      )
      .join('') +
    ':' +
    [...new Uint8Array(bits)]
      .map(x =>
        x.toString(16).padStart(2, '0')
      )
      .join('')
  );
}

async function verify(password, stored) {
  try {
    const [saltHex, hashHex] =
      stored.split(':');

    if (!saltHex || !hashHex) {
      return false;
    }

    const salt =
      Uint8Array.from(
        saltHex.match(/../g)
          .map(x => parseInt(x, 16))
      );

    const key =
      await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveBits']
      );

    const bits =
      await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt,
          iterations: 100000,
          hash: 'SHA-256'
        },
        key,
        256
      );

    const result =
      [...new Uint8Array(bits)]
        .map(x =>
          x.toString(16).padStart(2, '0')
        )
        .join('');

    return result === hashHex;

  } catch {
    return false;
  }
}

function token(id) {
  return btoa(
    JSON.stringify({
      id,
      exp: Date.now() + 7 * 86400000
    })
  ).replaceAll('=', '');
}

function getTokenUserId(req) {
  try {
    const value =
      req.headers
        .get('authorization')
        ?.replace(/^Bearer\s+/i, '');

    if (!value) return null;

    const data =
      JSON.parse(atob(value));

    if (!data.exp || data.exp < Date.now()) {
      return null;
    }

    return data.id;

  } catch {
    return null;
  }
}

async function getUser(req, env) {

  const tokenUserId =
    getTokenUserId(req);

  if (tokenUserId) {
    return env.DB
      .prepare(
        'SELECT * FROM users WHERE id=?'
      )
      .bind(tokenUserId)
      .first();
  }

  const username =
    req.headers.get('x-user-name') ||
    '하니';

  let user =
    await env.DB
      .prepare(
        'SELECT * FROM users WHERE username=?'
      )
      .bind(username)
      .first();

  if (!user) {

    await env.DB
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
        VALUES (?, '', 10000, 1, 0, 0, 0, 0, 0)
      `)
      .bind(username)
      .run();

    user =
      await env.DB
        .prepare(
          'SELECT * FROM users WHERE username=?'
        )
        .bind(username)
        .first();
  }

  return user;
}

function getRoomStub(env, code) {
  const id =
    env.GameRoom.idFromName(code);

  return env.GameRoom.get(id);
}

export default {

  async fetch(req, env) {

    const url =
      new URL(req.url);

    /*
     * API가 아니면
     * public 파일을 그대로 제공
     */
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(req);
    }

    try {

      /*
       * 회원가입
       */
      if (
        req.method === 'POST' &&
        url.pathname === '/api/register'
      ) {

        const {
          username,
          password
        } = await req.json();

        if (!username || !password) {
          return json({
            error:
              '아이디와 비밀번호를 입력하세요.'
          }, 400);
        }

        const exists =
          await env.DB
            .prepare(
              'SELECT id FROM users WHERE username=?'
            )
            .bind(username)
            .first();

        if (exists) {
          return json({
            error:
              '이미 사용 중인 닉네임입니다.'
          }, 409);
        }

        const passwordHash =
          await hashPassword(password);

        const result =
          await env.DB
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
              VALUES (?, ?, 10000, 1, 0, 0, 0, 0, 0)
            `)
            .bind(
              username,
              passwordHash
            )
            .run();

        return json({
          ok: true,
          token:
            token(result.meta.last_row_id)
        });
      }

      /*
       * 로그인
       */
      if (
        req.method === 'POST' &&
        url.pathname === '/api/login'
      ) {

        const {
          username,
          password
        } = await req.json();

        const user =
          await env.DB
            .prepare(
              'SELECT * FROM users WHERE username=?'
            )
            .bind(username)
            .first();

        if (
          !user ||
          !(await verify(
            password,
            user.password_hash
          ))
        ) {
          return json({
            error:
              '로그인 정보가 맞지 않습니다.'
          }, 401);
        }

        return json({
          ok: true,
          token: token(user.id)
        });
      }

      /*
       * 현재 사용자
       */
      if (
        req.method === 'GET' &&
        url.pathname === '/api/me'
      ) {

        const user =
          await getUser(req, env);

        if (!user) {
          return json({
            error:
              '사용자를 찾을 수 없습니다.'
          }, 404);
        }

        return json({
          user: {
            id: user.id,
            username: user.username,
            points: user.points,
            level: user.level,
            xp: user.xp,
            body_size: user.body_size,
            evolution: user.evolution,
            wins: user.wins,
            losses: user.losses
          }
        });
      }

      /*
       * 랭킹
       */
      if (
        req.method === 'GET' &&
        url.pathname === '/api/ranking'
      ) {

        const rows =
          await env.DB
            .prepare(`
              SELECT
                username,
                wins,
                losses,
                level
              FROM users
              ORDER BY wins DESC, level DESC
              LIMIT 5
            `)
            .all();

        return json(
          rows.results || []
        );
      }

      const user =
        await getUser(req, env);

      if (!user) {
        return json({
          error:
            '로그인이 필요합니다.'
        }, 401);
      }

      /*
       * 하니 키우기
       */
      if (
        req.method === 'POST' &&
        url.pathname === '/api/action'
      ) {

        const {
          type
        } = await req.json();

        const gain =
          type === 'workout'
            ? 80
            : type === 'feed'
              ? 40
              : 20;

        let xp =
          Number(user.xp || 0) + gain;

        let level =
          Number(user.level || 1);

        let body =
          Number(user.body_size || 0);

        let evolution =
          Number(user.evolution || 0);

        while (
          xp >= level * 200
        ) {

          xp -= level * 200;
          level++;
          body++;

          if (level >= 5)
            evolution = 1;

          if (level >= 10)
            evolution = 2;

          if (level >= 20)
            evolution = 3;
        }

        await env.DB
          .prepare(`
            UPDATE users
            SET
              xp=?,
              level=?,
              body_size=?,
              evolution=?,
              points=points+?
            WHERE id=?
          `)
          .bind(
            xp,
            level,
            body,
            evolution,
            gain,
            user.id
          )
          .run();

        return json({
          ok: true
        });
      }

      /*
       * 방 생성
       */
      if (
        req.method === 'POST' &&
        url.pathname === '/api/rooms'
      ) {

        const data =
          await req.json();

        const game =
          data.game || 'shisen';

        const stake =
          Math.max(
            0,
            Number(data.stake) || 0
          );

        if (
          !['shisen', 'omok', 'tetris']
            .includes(game)
        ) {
          return json({
            error:
              '지원하지 않는 게임입니다.'
          }, 400);
        }

        const roomCode =
          crypto.randomUUID()
            .replaceAll('-', '')
            .slice(0, 5)
            .toUpperCase();

        const stub =
          getRoomStub(
            env,
            roomCode
          );

        return stub.fetch(
          new Request(
            'https://room/create',
            {
              method: 'POST',
              body: JSON.stringify({
                roomCode,
                game,
                stake,
                userId: user.id,
                userName: user.username
              })
            }
          )
        );
      }

      /*
       * 방 목록
       */
      if (
        req.method === 'GET' &&
        url.pathname === '/api/rooms'
      ) {

        const game =
          url.searchParams.get('game') ||
          'shisen';

        const rows =
          await env.DB
            .prepare(`
              SELECT
                r.room_code,
                r.game,
                r.host_id,
                r.guest_id,
                r.stake,
                r.status,
                r.created_at,
                u.username AS host_name
              FROM rooms r
              LEFT JOIN users u
                ON u.id = r.host_id
              WHERE r.game=?
                AND r.status IN ('waiting','ready')
              ORDER BY r.created_at DESC
            `)
            .bind(game)
            .all();

        return json({
          game,
          rooms:
            rows.results || []
        });
      }

      /*
       * 방 참가
       */
      const joinMatch =
        url.pathname.match(
          /^\/api\/rooms\/([^/]+)\/join$/
        );

      if (
        req.method === 'POST' &&
        joinMatch
      ) {

        const code =
          joinMatch[1];

        const stub =
          getRoomStub(env, code);

        return stub.fetch(
          new Request(
            'https://room/join',
            {
              method: 'POST',
              body: JSON.stringify({
                userId: user.id,
                userName: user.username
              })
            }
          )
        );
      }

      /*
       * 방 상태
       */
      const stateMatch =
        url.pathname.match(
          /^\/api\/rooms\/([^/]+)$/
        );

      if (
        req.method === 'GET' &&
        stateMatch
      ) {

        const code =
          stateMatch[1];

        const stub =
          getRoomStub(env, code);

        return stub.fetch(
          new Request(
            'https://room/state'
          )
        );
      }

      /*
       * WebSocket
       */
      const wsMatch =
        url.pathname.match(
          /^\/api\/rooms\/([^/]+)\/ws$/
        );

      if (
        req.method === 'GET' &&
        wsMatch
      ) {

        if (
          req.headers.get('Upgrade')
            ?.toLowerCase() !== 'websocket'
        ) {
          return json({
            error:
              'WebSocket 연결이 필요합니다.'
          }, 426);
        }

        const code =
          wsMatch[1];

        const stub =
          getRoomStub(env, code);

        const wsUrl =
          new URL(req.url);

        wsUrl.pathname = '/ws';

        wsUrl.searchParams.set(
          'userId',
          String(user.id)
        );

        wsUrl.searchParams.set(
          'userName',
          user.username
        );

        return stub.fetch(
          new Request(
            wsUrl,
            req
          )
        );
      }

      return json({
        error:
          'Not found'
      }, 404);

    } catch (error) {

      console.error(error);

      return json({
        error:
          error?.message ||
          '서버 오류'
      }, 500);
    }
  }
};


export class GameRoom extends DurableObject {

  constructor(ctx, env) {
    super(ctx, env);

    this.ctx = ctx;
    this.env = env;

    this.state = {
      roomCode: null,
      game: 'shisen',
      stake: 0,

      host: null,
      guest: null,

      ready: {},

      status: 'waiting',

      turn: null,

      board: []
    };

    this.loaded = false;
  }

  async load() {

    if (this.loaded) {
      return;
    }

    const saved =
      await this.ctx.storage.get(
        'state'
      );

    if (saved) {
      this.state = saved;
    }

    this.loaded = true;
  }

  async save() {

    await this.ctx.storage.put(
      'state',
      this.state
    );
  }

  async broadcast() {

    const message =
      JSON.stringify({
        type: 'room',
        state: this.state
      });

    for (
      const ws of this.ctx.getWebSockets()
    ) {
      try {
        ws.send(message);
      } catch {}
    }
  }

  async updateDB() {

    if (!this.state.roomCode) {
      return;
    }

    await this.env.DB
      .prepare(`
        UPDATE rooms
        SET
          status=?,
          guest_id=?
        WHERE room_code=?
      `)
      .bind(
        this.state.status,
        this.state.guest?.id || null,
        this.state.roomCode
      )
      .run();
  }

  async fetch(req) {

    await this.load();

    const url =
      new URL(req.url);

    /*
     * 방 생성
     */
    if (
      req.method === 'POST' &&
      url.pathname === '/create'
    ) {

      const data =
        await req.json();

      this.state = {
        roomCode:
          data.roomCode,

        game:
          data.game,

        stake:
          Number(data.stake) || 0,

        host: {
          id:
            data.userId,

          name:
            data.userName
        },

        guest:
          null,

        ready:
          {},

        status:
          'waiting',

        turn:
          null,

        board:
          data.game === 'shisen'
            ? createShisenBoard()
            : []
      };

      await this.save();

      await this.env.DB
        .prepare(`
          INSERT OR REPLACE INTO rooms
          (
            room_code,
            game,
            host_id,
            guest_id,
            stake,
            status
          )
          VALUES (?, ?, ?, NULL, ?, 'waiting')
        `)
        .bind(
          this.state.roomCode,
          this.state.game,
          data.userId,
          this.state.stake
        )
        .run();

      return json({
        ok: true,
        roomCode:
          this.state.roomCode,

        state:
          this.state
      });
    }

    /*
     * 방 참가
     */
    if (
      req.method === 'POST' &&
      url.pathname === '/join'
    ) {

      const data =
        await req.json();

      if (!this.state.host) {
        return json({
          error:
            '존재하지 않는 방입니다.'
        }, 404);
      }

      if (this.state.guest) {
        return json({
          error:
            '방이 가득 찼습니다.'
        }, 409);
      }

      if (
        String(this.state.host.id) ===
        String(data.userId)
      ) {
        return json({
          error:
            '자신의 방에는 참가할 수 없습니다.'
        }, 400);
      }

      this.state.guest = {
        id:
          data.userId,

        name:
          data.userName
      };

      this.state.ready = {
        [this.state.host.id]:
          false,

        [this.state.guest.id]:
          false
      };

      this.state.status =
        'ready';

      await this.save();

      await this.updateDB();

      await this.broadcast();

      return json({
        ok: true,
        state:
          this.state
      });
    }

    /*
     * 방 상태
     */
    if (
      req.method === 'GET' &&
      url.pathname === '/state'
    ) {

      return json({
        state:
          this.state
      });
    }

    /*
     * WebSocket
     */
    if (
      req.method === 'GET' &&
      url.pathname === '/ws'
    ) {

      if (
        req.headers.get('Upgrade')
          ?.toLowerCase() !== 'websocket'
      ) {
        return json({
          error:
            'WebSocket 연결이 필요합니다.'
        }, 426);
      }

      const pair =
        new WebSocketPair();

      const [client, server] =
        Object.values(pair);

      const userId =
        url.searchParams.get(
          'userId'
        );

      const userName =
        url.searchParams.get(
          'userName'
        );

      this.ctx.acceptWebSocket(
        server
      );

      server.serializeAttachment({
        userId,
        userName
      });

      server.send(
        JSON.stringify({
          type: 'room',
          state:
            this.state
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

    return json({
      state:
        this.state
    });
  }

  async webSocketMessage(
    ws,
    message
  ) {

    await this.load();

    let data;

    try {
      data =
        JSON.parse(message);
    } catch {
      return;
    }

    const session =
      ws.deserializeAttachment();

    if (!session) {
      return;
    }

    /*
     * 준비 버튼
     */
    if (
      data.type === 'ready'
    ) {

      const uid =
        String(session.userId);

      if (
        !this.state.ready ||
        !(uid in this.state.ready)
      ) {
        return;
      }

      this.state.ready[uid] =
        true;

      const hostReady =
        this.state.host &&
        this.state.ready[
          this.state.host.id
        ];

      const guestReady =
        this.state.guest &&
        this.state.ready[
          this.state.guest.id
        ];

      if (
        hostReady &&
        guestReady
      ) {

        this.state.status =
          'playing';

        this.state.turn =
          this.state.host.id;
      }

      await this.save();

      await this.updateDB();

      await this.broadcast();

      return;
    }

    /*
     * 사천성 이동
     */
    if (
      data.type === 'move'
    ) {

      if (
        this.state.game !== 'shisen'
      ) {
        return;
      }

      if (
        this.state.status !== 'playing'
      ) {
        return;
      }

      const uid =
        String(session.userId);

      if (
        String(this.state.turn) !== uid
      ) {
        return;
      }

      const a =
        Number(data.a);

      const b =
        Number(data.b);

      if (
        !Number.isInteger(a) ||
        !Number.isInteger(b)
      ) {
        return;
      }

      if (
        !this.state.board[a] ||
        !this.state.board[b]
      ) {
        return;
      }

      /*
       * 임시 규칙:
       * 같은 그림이면 제거
       */
      if (
        this.state.board[a] ===
        this.state.board[b]
      ) {

        this.state.board[a] =
          null;

        this.state.board[b] =
          null;

        const finished =
          this.state.board.every(
            x => !x
          );

        if (finished) {

          this.state.status =
            'finished';

          const winner =
            String(
              this.state.host.id
            ) === uid
              ? this.state.host
              : this.state.guest;

          if (winner) {

            const reward =
              Number(this.state.stake) * 2;

            await this.env.DB
              .prepare(`
                UPDATE users
                SET
                  wins=wins+1,
                  points=points+?
                WHERE id=?
              `)
              .bind(
                reward,
                winner.id
              )
              .run();
          }

        } else {

          this.state.turn =
            String(
              this.state.host.id
            ) === uid
              ? this.state.guest?.id
              : this.state.host?.id;
        }

        await this.save();

        await this.updateDB();

        await this.broadcast();
      }

      return;
    }
  }

  async webSocketClose() {
  }
}


function createShisenBoard() {

  const tiles = [
    '🍎','🍎',
    '🍋','🍋',
    '🍇','🍇',
    '🍒','🍒',
    '🍑','🍑',
    '🍉','🍉',
    '🥝','🥝',
    '🍓','🍓',
    '🍊','🍊'
  ];

  for (
    let i = tiles.length - 1;
    i > 0;
    i--
  ) {

    const j =
      Math.floor(
        Math.random() * (i + 1)
      );

    [
      tiles[i],
      tiles[j]
    ] = [
      tiles[j],
      tiles[i]
    ];
  }

  return tiles;
}
