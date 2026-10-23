const encoder = new TextEncoder();
const decoder = new TextDecoder();

/* =========================
   BASIC RESPONSE
========================= */

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
   BASE64
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
  let s = String(value || "")
    .replaceAll("-", "+")
    .replaceAll("_", "/");

  while (s.length % 4) {
    s += "=";
  }

  return Uint8Array.from(
    atob(s),
    c => c.charCodeAt(0)
  );
}

/* =========================
   PASSWORD
========================= */

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
      iterations: 100000,
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
  return bytesToBase64Url(
    encoder.encode(
      JSON.stringify({
        id: user.id,
        username: user.username,
        created: Date.now()
      })
    )
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

function publicUser(user, isChampion = false) {
  if (!user) return null;

  const evolution =
    Number(user.evolution || 0);

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
    energy: Number(user.energy ?? 100),
    fullness: Number(user.fullness ?? 100),
    role: user.role || "user",
    title:
      isChampion
        ? "👑 하니게임즈 챔피언"
        : titles[
            Math.min(
              evolution,
              titles.length - 1
            )
          ]
  };
}

/* =========================
   CURRENT USER
========================= */

let userNeedsReady = false;

async function ensureUserNeeds(env){
  if(userNeedsReady) return;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS user_needs (
      user_id INTEGER PRIMARY KEY,
      energy INTEGER NOT NULL DEFAULT 100,
      fullness INTEGER NOT NULL DEFAULT 100,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `).run();
  userNeedsReady = true;
}

async function getCurrentUser(request, env) {
  await ensureUserNeeds(env);
  const authorization =
    request.headers.get("authorization") || "";

  if (
    authorization.startsWith("Bearer ")
  ) {
    const token =
      authorization.slice(7);

    const data =
      readToken(token);

    if (data?.id) {
      const user =
        await env.DB
          .prepare(
            "SELECT users.*, COALESCE(n.energy,100) AS energy, COALESCE(n.fullness,100) AS fullness FROM users LEFT JOIN user_needs n ON n.user_id = users.id WHERE users.id = ?"
          )
          .bind(data.id)
          .first();

      if (user) {
        return user;
      }
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
          "SELECT users.*, COALESCE(n.energy,100) AS energy, COALESCE(n.fullness,100) AS fullness FROM users LEFT JOIN user_needs n ON n.user_id = users.id WHERE users.username = ?"
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
  try {
    await ensureUserNeeds(env);
    const body =
      await readJson(request);

    const username =
      String(body.username || "").trim();

    const password =
      String(body.password || "");

    if (username.length < 2) {
      return json(
        {
          error:
            "닉네임은 2자 이상 입력해주세요."
        },
        400
      );
    }

    if (username.length > 20) {
      return json(
        {
          error:
            "닉네임은 20자 이하로 입력해주세요."
        },
        400
      );
    }

    if (password.length < 4) {
      return json(
        {
          error:
            "비밀번호는 4자 이상 입력해주세요."
        },
        400
      );
    }

    const existing =
      await env.DB
        .prepare(
          "SELECT id FROM users WHERE username = ?"
        )
        .bind(username)
        .first();

    if (existing) {
      return json(
        {
          error:
            "이미 사용 중인 닉네임입니다."
        },
        409
      );
    }

    const salt =
      crypto.randomUUID();

    const passwordHash =
      await hashPassword(
        password,
        salt
      );

    const storedPassword =
      `${salt}:${passwordHash}`;

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

    const user =
      await env.DB
        .prepare(
          "SELECT users.*, COALESCE(n.energy,100) AS energy, COALESCE(n.fullness,100) AS fullness FROM users LEFT JOIN user_needs n ON n.user_id=users.id WHERE users.id = ?"
        )
        .bind(result.meta.last_row_id)
        .first();

    return json({
      user: publicUser(user),
      token: makeToken(user)
    });

  } catch (error) {

    console.error(
      "REGISTER ERROR:",
      error
    );

    return json(
      {
        error:
          "회원가입 중 오류가 발생했습니다.",
        detail:
          String(
            error?.message || error
          )
      },
      500
    );
  }
}

/* =========================
   LOGIN
========================= */

async function login(request, env) {

  try {

    await ensureUserNeeds(env);
    const body =
      await readJson(request);

    const username =
      String(
        body.username || ""
      ).trim();

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

    /*
      사용자 조회
    */

    const user =
      await env.DB
        .prepare(
          "SELECT users.*, COALESCE(n.energy,100) AS energy, COALESCE(n.fullness,100) AS fullness FROM users LEFT JOIN user_needs n ON n.user_id=users.id WHERE users.username = ?"
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

    /*
      비밀번호 확인
    */

    const stored =
      String(
        user.password_hash || ""
      );

    if (!stored) {
      return json(
        {
          error:
            "이 계정에는 비밀번호 정보가 없습니다."
        },
        500
      );
    }

    let verified = false;

    /*
      신규 계정
      salt:hash
    */

    if (
      stored.includes(":")
    ) {

      const index =
        stored.indexOf(":");

      const salt =
        stored.slice(
          0,
          index
        );

      const savedHash =
        stored.slice(
          index + 1
        );

      if (
        !salt ||
        !savedHash
      ) {
        return json(
          {
            error:
              "비밀번호 정보 형식이 잘못되었습니다."
          },
          500
        );
      }

      const currentHash =
        await hashPassword(
          password,
          salt
        );

      verified =
        currentHash ===
        savedHash;

    } else {

      /*
        기존 계정 호환
      */

      const currentHash =
        await hashPassword(
          password,
          username
        );

      verified =
        currentHash ===
        stored;
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

    /*
      로그인 성공
    */

    return json({
      user:
        publicUser(user),

      token:
        makeToken(user)
    });

  } catch (error) {

    /*
      ⭐ 핵심
      Cloudflare 에러 페이지 대신
      실제 오류를 JSON으로 보여줌
    */

    console.error(
      "LOGIN ERROR:",
      error
    );

    const detail =
      String(
        error?.message ||
        error
      );

    return json(
      {
        error:
          "로그인 오류: " +
          detail,

        detail
      },
      500
    );
  }
}

/* =========================
   ME
========================= */

async function me(request, env) {

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

  return json({
    user:
      publicUser(user)
  });
}


/* =========================
   ATTENDANCE
========================= */


const DAILY_MISSIONS = [
 {key:"first_game",title:"첫 게임",description:"오늘 게임 결과 1회 등록",target:1,reward:100},
 {key:"game_three",title:"게임 매니아",description:"오늘 게임 결과 3회 등록",target:3,reward:250},
 {key:"holdem_win",title:"홀덤 도전자",description:"홀덤 봇전 1승",target:1,reward:150}
];
async function ensureMissionTables(env){
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS daily_mission_progress (
 user_id INTEGER NOT NULL, mission_date TEXT NOT NULL, mission_key TEXT NOT NULL,
 progress INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id,mission_date,mission_key))`).run();
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS daily_mission_claims (
 user_id INTEGER NOT NULL, mission_date TEXT NOT NULL, mission_key TEXT NOT NULL,
 reward INTEGER NOT NULL, claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,mission_date,mission_key))`).run();
}
async function missionDate(env){
 const row=await env.DB.prepare("SELECT date('now','+9 hours') AS today").first();
 return row?.today;
}
async function addMissionProgress(env,userId,missionKey,amount=1){
 await ensureMissionTables(env);
 const date=await missionDate(env);
 if(!date)throw new Error("오늘 날짜를 확인하지 못했습니다.");
 await env.DB.prepare(`INSERT INTO daily_mission_progress
 (user_id,mission_date,mission_key,progress) VALUES(?,?,?,?)
 ON CONFLICT(user_id,mission_date,mission_key)
 DO UPDATE SET progress=MIN(daily_mission_progress.progress+excluded.progress,100000)`)
 .bind(userId,date,missionKey,amount).run();
}
async function recordGameMissionProgress(env,userId,game,won=false){
 await addMissionProgress(env,userId,"first_game",1);
 await addMissionProgress(env,userId,"game_three",1);
 if(game==="holdem"&&won)await addMissionProgress(env,userId,"holdem_win",1);
}
async function dailyMissions(request,env){
 const user=await getCurrentUser(request,env);
 if(!user)return json({error:"로그인이 필요합니다."},401);
 await ensureMissionTables(env);
 const date=await missionDate(env);
 const [p,c]=await Promise.all([
  env.DB.prepare("SELECT mission_key,progress FROM daily_mission_progress WHERE user_id=? AND mission_date=?").bind(user.id,date).all(),
  env.DB.prepare("SELECT mission_key FROM daily_mission_claims WHERE user_id=? AND mission_date=?").bind(user.id,date).all()
 ]);
 const progress=Object.fromEntries((p.results||[]).map(r=>[r.mission_key,Number(r.progress||0)]));
 const claimed=new Set((c.results||[]).map(r=>r.mission_key));
 return json({date,missions:DAILY_MISSIONS.map(m=>({...m,progress:Math.min(m.target,progress[m.key]||0),claimed:claimed.has(m.key)}))});
}
async function claimDailyMission(request,env){
 const user=await getCurrentUser(request,env);
 if(!user)return json({error:"로그인이 필요합니다."},401);
 await ensureMissionTables(env);
 const body=await readJson(request);
 const mission=DAILY_MISSIONS.find(m=>m.key===String(body.key||""));
 if(!mission)return json({error:"존재하지 않는 미션입니다."},400);
 const date=await missionDate(env);
 const p=await env.DB.prepare("SELECT progress FROM daily_mission_progress WHERE user_id=? AND mission_date=? AND mission_key=?").bind(user.id,date,mission.key).first();
 if(Number(p?.progress||0)<mission.target)return json({error:"아직 미션을 완료하지 않았어요."},400);
 const results=await env.DB.batch([
  env.DB.prepare("INSERT OR IGNORE INTO daily_mission_claims(user_id,mission_date,mission_key,reward) VALUES(?,?,?,?)").bind(user.id,date,mission.key,mission.reward),
  env.DB.prepare("UPDATE users SET points=points+? WHERE id=? AND changes()=1").bind(mission.reward,user.id)
 ]);
 if(!results?.[0]?.meta?.changes)return json({error:"이미 보상을 받았어요."},409);
 const updated=await env.DB.prepare("SELECT users.*, COALESCE(n.energy,100) AS energy, COALESCE(n.fullness,100) AS fullness FROM users LEFT JOIN user_needs n ON n.user_id=users.id WHERE users.id=?").bind(user.id).first();
 return json({message:`🎁 ${mission.title} 보상 +${mission.reward}P`,reward:mission.reward,user:publicUser(updated)});
}

async function attendance(request, env) {
  const user = await getCurrentUser(request, env);

  // schema.sql을 수동 적용하지 않았어도 출석 기능이 동작하도록 보장합니다.
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS attendance (
      user_id INTEGER NOT NULL,
      attendance_date TEXT NOT NULL,
      streak INTEGER NOT NULL DEFAULT 1,
      reward INTEGER NOT NULL DEFAULT 300,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, attendance_date)
    )
  `).run();

  if (!user) {
    return json({ error: "로그인이 필요합니다." }, 401);
  }

  if (request.method !== "POST") {
    return json({ error: "지원하지 않는 요청입니다." }, 405);
  }

  try {
    const today = await env.DB.prepare(
      "SELECT date('now','+9 hours') AS today"
    ).first();

    const date = today?.today;

    const existing = await env.DB.prepare(
      "SELECT * FROM attendance WHERE user_id = ? AND attendance_date = ?"
    ).bind(user.id, date).first();

    if (existing) {
      return json({
        message: "☑️ 오늘은 이미 출석했어요!",
        user: publicUser(user),
        already: true
      });
    }

    const yesterdayRow = await env.DB.prepare(
      "SELECT date('now','+9 hours','-1 day') AS yesterday"
    ).first();

    const yesterday = yesterdayRow?.yesterday;

    const previous = await env.DB.prepare(
      "SELECT streak FROM attendance WHERE user_id = ? AND attendance_date = ?"
    ).bind(user.id, yesterday).first();

    const streak = Number(previous?.streak || 0) + 1;
    const reward = Math.min(1000, 300 + Math.max(0, streak - 1) * 50);

    const inserted = await env.DB.prepare(
      "INSERT OR IGNORE INTO attendance(user_id,attendance_date,streak,reward) VALUES(?,?,?,?)"
    ).bind(user.id, date, streak, reward).run();

    // 동시 요청이 들어와도 실제 출석 행을 만든 한 요청만 보상을 지급합니다.
    if (!inserted.meta?.changes) {
      const latest = await env.DB.prepare("SELECT users.*, COALESCE(n.energy,100) AS energy, COALESCE(n.fullness,100) AS fullness FROM users LEFT JOIN user_needs n ON n.user_id=users.id WHERE users.id = ?").bind(user.id).first();
      return json({ message: "☑️ 오늘은 이미 출석했어요!", user: publicUser(latest), already: true });
    }

    await env.DB.prepare(
      "UPDATE users SET points = points + ?, xp = xp + 10 WHERE id = ?"
    ).bind(reward, user.id).run();

    const updated = await env.DB.prepare(
      "SELECT users.*, COALESCE(n.energy,100) AS energy, COALESCE(n.fullness,100) AS fullness FROM users LEFT JOIN user_needs n ON n.user_id=users.id WHERE users.id = ?"
    ).bind(user.id).first();

    return json({
      message: `📅 출석 완료! +${reward.toLocaleString()}P · ${streak}일 연속 출석 🔥`,
      reward,
      streak,
      user: publicUser(updated)
    });
  } catch (error) {
    return json({
      error: "출석체크 중 오류가 발생했어요.",
      detail: String(error?.message || error)
    }, 500);
  }
}


/* =========================
   GAME RESULT
========================= */

async function gameResult(request, env) {
  const user=await getCurrentUser(request,env);
  if(!user)return json({error:"로그인이 필요합니다."},401);
  const body=await readJson(request);
  const game=String(body.game||"");

  // 홀덤 봇전은 승리 1회당 50P, 한국 날짜 기준 하루 최대 10회.
  // 보상 기록은 서버에서 관리해 하루 보상 상한을 넘지 않도록 합니다.
  if(game==="holdem" && body.mode==="bot" && body.won===true){
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS holdem_bot_rewards (
        user_id INTEGER NOT NULL,
        reward_date TEXT NOT NULL,
        wins INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(user_id, reward_date)
      )
    `).run();
    const dateRow=await env.DB.prepare("SELECT date('now','+9 hours') AS today").first();
    const today=dateRow?.today;
    await env.DB.prepare("INSERT OR IGNORE INTO holdem_bot_rewards(user_id,reward_date,wins) VALUES(?,?,0)").bind(user.id,today).run();
    const claim=await env.DB.prepare("UPDATE holdem_bot_rewards SET wins=wins+1 WHERE user_id=? AND reward_date=? AND wins<10").bind(user.id,today).run();
    if(!claim.meta?.changes){
      const updated=await env.DB.prepare("SELECT users.*, COALESCE(n.energy,100) AS energy, COALESCE(n.fullness,100) AS fullness FROM users LEFT JOIN user_needs n ON n.user_id=users.id WHERE users.id=?").bind(user.id).first();
      return json({message:"오늘 봇전 포인트 보상 10회를 모두 받았어요. 내일 다시 도전해요!",reward:0,limitReached:true,user:publicUser(updated)});
    }
    await env.DB.prepare("UPDATE users SET points=points+50 WHERE id=?").bind(user.id).run();
    await recordGameMissionProgress(env, user.id, "holdem", true);
    const updated=await env.DB.prepare("SELECT users.*, COALESCE(n.energy,100) AS energy, COALESCE(n.fullness,100) AS fullness FROM users LEFT JOIN user_needs n ON n.user_id=users.id WHERE users.id=?").bind(user.id).first();
    const count=await env.DB.prepare("SELECT wins FROM holdem_bot_rewards WHERE user_id=? AND reward_date=?").bind(user.id,today).first();
    return json({message:"🤖 봇전 승리! +50P ("+Number(count?.wins||0)+"/10회)",reward:50,dailyWins:Number(count?.wins||0),user:publicUser(updated)});
  }

  // 일반 게임의 점수 보상. 홀덤은 봇 승리 보상 경로만 허용합니다.
  const score=Math.max(0,Math.min(5000,Math.floor(Number(body.score||0))));
  const combo=Math.max(0,Math.min(100,Math.floor(Number(body.combo||0))));
  const allowed=["shisen","minesweeper","tetris","omok"];
  if(!allowed.includes(game)||score<=0)return json({error:"유효하지 않은 게임 결과입니다."},400);
  const reward=Math.min(1500,Math.max(100,Math.floor(score*0.25)));
  const xp=Math.min(100,Math.floor(score/50));
  await env.DB.prepare("UPDATE users SET points=points+?, xp=xp+?, wins=wins+1 WHERE id=?").bind(reward,xp,user.id).run();
  await recordGameMissionProgress(env, user.id, game, false);
  const updated=await env.DB.prepare("SELECT users.*, COALESCE(n.energy,100) AS energy, COALESCE(n.fullness,100) AS fullness FROM users LEFT JOIN user_needs n ON n.user_id=users.id WHERE users.id=?").bind(user.id).first();
  return json({message:"🎮 "+game+" "+score.toLocaleString()+"점! +"+reward.toLocaleString()+"P",score,reward,combo,user:publicUser(updated)});
}


/* =========================
   POKE / NUDGE
========================= */
async function pokes(request, env, user) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS pokes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id INTEGER NOT NULL,
      to_user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS online_sessions (
      user_id INTEGER PRIMARY KEY,
      last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  if (request.method === "GET") {
    const [users, inbox] = await Promise.all([
      env.DB.prepare(`
        SELECT u.id, u.username,
          CASE WHEN s.last_seen >= datetime('now','-90 seconds') THEN 1 ELSE 0 END AS online
        FROM users u LEFT JOIN online_sessions s ON s.user_id=u.id
        WHERE u.id != ?
        ORDER BY online DESC, u.username COLLATE NOCASE ASC LIMIT 12
      `).bind(user.id).all(),
      env.DB.prepare(`
        SELECT p.id, p.created_at, u.username AS from_username
        FROM pokes p JOIN users u ON u.id=p.from_user_id
        WHERE p.to_user_id=? ORDER BY p.id DESC LIMIT 10
      `).bind(user.id).all()
    ]);
    return json({ users: users.results || [], received: inbox.results || [] });
  }
  if (request.method !== "POST") return json({ error: "지원하지 않는 요청입니다." }, 405);
  const body = await readJson(request);
  const targetId = Number(body.targetId);
  if (!Number.isSafeInteger(targetId) || targetId <= 0 || targetId === Number(user.id)) return json({ error: "콕 찌를 상대를 선택해 주세요." }, 400);
  const target = await env.DB.prepare("SELECT id FROM users WHERE id=?").bind(targetId).first();
  if (!target) return json({ error: "상대 계정을 찾을 수 없어요." }, 404);
  const recent = await env.DB.prepare(`
    SELECT id FROM pokes WHERE from_user_id=? AND to_user_id=? AND created_at >= datetime('now','-30 seconds') ORDER BY id DESC LIMIT 1
  `).bind(user.id, targetId).first();
  if (recent) return json({ error: "같은 사람은 30초 뒤에 다시 콕 찌를 수 있어요." }, 429);
  await env.DB.prepare("INSERT INTO pokes(from_user_id,to_user_id) VALUES(?,?)").bind(user.id,targetId).run();
  return json({ message: "👉 콕 찌르기를 보냈어요!" });
}

/* =========================
   ACTION
========================= */

async function action(request, env) {

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

  const body =
    await readJson(request);

  const actionType =
    String(
      body.action || ""
    );

  let points =
    Number(
      user.points || 0
    );

  let xp =
    Number(
      user.xp || 0
    );

  let level =
    Number(
      user.level || 1
    );

  let evolution =
    Number(
      user.evolution || 0
    );

  let message = "";
  let energy = Math.max(0, Math.min(100, Number(user.energy ?? 100)));
  let fullness = Math.max(0, Math.min(100, Number(user.fullness ?? 100)));

  if (actionType === "work") {
    if (energy < 5) {
      return json({ error: "체력이 부족해요. 먼저 쉬어주세요." }, 400);
    }
    energy -= 5;
    fullness = Math.max(0, fullness - 4);

    points += 500;
    xp += 25;

    message =
      "💼 일해서 500P와 XP를 얻었어요!";

  } else if (
    actionType === "cook" || actionType === "feed"
  ) {

    if (energy < 3) {
      return json({ error: "체력이 부족해요. 먼저 쉬어주세요." }, 400);
    }
    energy -= 3;
    if (fullness >= 100) {
      return json({ error: "이미 배가 꽉 찼어요! 더 이상 먹을 수 없어요." }, 400);
    }
    fullness = Math.min(100, fullness + 20);
    xp += 15;

    message =
      actionType === "feed" ? "🐰 하니에게 밥을 줬어요! 포만감이 +20 올랐어요." : "🍳 요리를 완료했어요!";

  } else if (
    actionType === "rest"
  ) {

    energy = Math.min(100, energy + 30);
    fullness = Math.max(0, fullness - 2);
    xp += 10;

    message =
      "🛋️ 푹 쉬었어요!";

  } else {

    return json(
      {
        error:
          "알 수 없는 행동입니다."
      },
      400
    );
  }

  while (
    xp >=
    100 + (level - 1) * 80
  ) {

    xp -=
      100 + (level - 1) * 80;

    level++;

    if (
      level % 5 === 0
    ) {

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

  await env.DB.prepare(
    `INSERT INTO user_needs(user_id,energy,fullness)
     VALUES(?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET energy=excluded.energy, fullness=excluded.fullness`
  ).bind(user.id, energy, fullness).run();

  const updated =
    await env.DB
      .prepare(
        "SELECT users.*, COALESCE(n.energy,100) AS energy, COALESCE(n.fullness,100) AS fullness FROM users LEFT JOIN user_needs n ON n.user_id=users.id WHERE users.id = ?"
      )
      .bind(user.id)
      .first();

  const champion =
    await env.DB
      .prepare(
        "SELECT id FROM users ORDER BY points DESC, id ASC LIMIT 1"
      )
      .first();

  return json({
    message,
    user:
      publicUser(
        updated,
        Number(champion?.id) === Number(updated?.id)
      )
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
        ORDER BY level DESC,
                 xp DESC
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
      points:
        points.results || [],

      level:
        level.results || [],

      games:
        games.results || []
    }
  });
}

/* =========================
   ROOMS
========================= */

async function rooms(
  request,
  env,
  user
) {

  if (
    request.method === "GET"
  ) {

    const url =
      new URL(request.url);

    const game =
      url.searchParams.get(
        "game"
      );

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

    } else {

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
      rooms:
        result.results || []
    });
  }

  if (
    request.method === "POST"
  ) {

    const body =
      await readJson(request);

    const game =
      String(
        body.game || "omok"
      );

    const stake =
      Math.max(
        0,
        Number(
          body.stake || 0
        )
      );

    const allowed = [
      "omok",
      "tetris",
      "shisen",
      "holdem"
    ];

    if (
      !allowed.includes(game)
    ) {
      return json(
        {
          error:
            "지원하지 않는 게임입니다."
        },
        400
      );
    }

    if (
      stake >
      Number(
        user.points || 0
      )
    ) {
      return json(
        {
          error:
            "포인트가 부족합니다."
        },
        400
      );
    }

    let code = "";

    for (
      let i = 0;
      i < 10;
      i++
    ) {

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

      if (!exists) {
        break;
      }
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
    {
      error:
        "지원하지 않는 요청입니다."
    },
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
      {
        error:
          "방을 찾을 수 없습니다."
      },
      404
    );
  }

  if (room.guest_id) {
    return json(
      {
        error:
          "이미 사람이 들어와 있는 방입니다."
      },
      409
    );
  }

  if (
    room.host_id ===
    user.id
  ) {
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
      {
        error:
          "방을 찾을 수 없습니다."
      },
      404
    );
  }

  return json({
    room
  });
}

/* =========================================================
   ADMIN
========================================================= */

async function requireAdmin(
  request,
  env
) {

  const user =
    await getCurrentUser(
      request,
      env
    );

  if (!user) {
    return {
      error:
        json(
          {
            error:
              "로그인이 필요합니다."
          },
          401
        )
    };
  }

  if (
    user.role !==
    "admin"
  ) {
    return {
      error:
        json(
          {
            error:
              "관리자 권한이 없습니다."
          },
          403
        )
    };
  }

  return {
    user
  };
}

/* =========================
   ADMIN NOTICE LIST
========================= */

async function adminNoticeList(
  request,
  env
) {

  const check =
    await requireAdmin(
      request,
      env
    );

  if (check.error) {
    return check.error;
  }

  try {

    const result =
      await env.DB
        .prepare(`
          SELECT
            id,
            message,
            button_text,
            button_link,
            active,
            sort_order,
            created_at,
            updated_at
          FROM notices
          ORDER BY
            sort_order ASC,
            id DESC
        `)
        .all();

    return json({
      notices:
        result.results || []
    });

  } catch (error) {

    return json(
      {
        error:
          "공지 테이블이 아직 준비되지 않았습니다.",
        detail:
          String(error)
      },
      500
    );
  }
}

/* =========================
   ADMIN NOTICE CREATE
========================= */

async function adminNoticeCreate(
  request,
  env
) {

  const check =
    await requireAdmin(
      request,
      env
    );

  if (check.error) {
    return check.error;
  }

  const body =
    await readJson(request);

  const message =
    String(
      body.message || ""
    ).trim();

  const buttonText =
    String(
      body.button_text || ""
    ).trim();

  const buttonLink =
    String(
      body.button_link || ""
    ).trim();

  const active =
    Number(
      body.active ?? 1
    ) === 1
      ? 1
      : 0;

  if (!message) {
    return json(
      {
        error:
          "공지 내용을 입력해주세요."
      },
      400
    );
  }

  try {

    const max =
      await env.DB
        .prepare(`
          SELECT
            COALESCE(
              MAX(sort_order),
              0
            ) AS max_order
          FROM notices
        `)
        .first();

    const sortOrder =
      Number(
        max?.max_order || 0
      ) + 1;

    const result =
      await env.DB
        .prepare(`
          INSERT INTO notices
          (
            message,
            button_text,
            button_link,
            active,
            sort_order
          )
          VALUES (?, ?, ?, ?, ?)
        `)
        .bind(
          message,
          buttonText,
          buttonLink,
          active,
          sortOrder
        )
        .run();

    const notice =
      await env.DB
        .prepare(
          "SELECT * FROM notices WHERE id = ?"
        )
        .bind(
          result.meta.last_row_id
        )
        .first();

    return json({
      notice
    });

  } catch (error) {

    return json(
      {
        error:
          "공지 등록에 실패했습니다.",
        detail:
          String(error)
      },
      500
    );
  }
}

/* =========================
   ADMIN NOTICE UPDATE
========================= */

async function adminNoticeUpdate(
  request,
  env,
  id
) {

  const check =
    await requireAdmin(
      request,
      env
    );

  if (check.error) {
    return check.error;
  }

  const body =
    await readJson(request);

  const message =
    String(
      body.message || ""
    ).trim();

  const buttonText =
    String(
      body.button_text || ""
    ).trim();

  const buttonLink =
    String(
      body.button_link || ""
    ).trim();

  const active =
    Number(
      body.active ?? 1
    ) === 1
      ? 1
      : 0;

  if (!message) {
    return json(
      {
        error:
          "공지 내용을 입력해주세요."
      },
      400
    );
  }

  try {

    await env.DB
      .prepare(`
        UPDATE notices
        SET
          message = ?,
          button_text = ?,
          button_link = ?,
          active = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(
        message,
        buttonText,
        buttonLink,
        active,
        id
      )
      .run();

    const notice =
      await env.DB
        .prepare(
          "SELECT * FROM notices WHERE id = ?"
        )
        .bind(id)
        .first();

    return json({
      notice
    });

  } catch (error) {

    return json(
      {
        error:
          "공지 수정에 실패했습니다.",
        detail:
          String(error)
      },
      500
    );
  }
}

/* =========================
   ADMIN NOTICE TOGGLE
========================= */

async function adminNoticeToggle(
  request,
  env,
  id
) {

  const check =
    await requireAdmin(
      request,
      env
    );

  if (check.error) {
    return check.error;
  }

  try {

    const notice =
      await env.DB
        .prepare(
          "SELECT active FROM notices WHERE id = ?"
        )
        .bind(id)
        .first();

    if (!notice) {
      return json(
        {
          error:
            "공지를 찾을 수 없습니다."
        },
        404
      );
    }

    const next =
      Number(
        notice.active
      ) === 1
        ? 0
        : 1;

    await env.DB
      .prepare(`
        UPDATE notices
        SET
          active = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(
        next,
        id
      )
      .run();

    return json({
      active: next
    });

  } catch (error) {

    return json(
      {
        error:
          "공지 상태 변경에 실패했습니다.",
        detail:
          String(error)
      },
      500
    );
  }
}

/* =========================
   ADMIN NOTICE DELETE
========================= */

async function adminNoticeDelete(
  request,
  env,
  id
) {

  const check =
    await requireAdmin(
      request,
      env
    );

  if (check.error) {
    return check.error;
  }

  try {

    await env.DB
      .prepare(
        "DELETE FROM notices WHERE id = ?"
      )
      .bind(id)
      .run();

    return json({
      ok: true
    });

  } catch (error) {

    return json(
      {
        error:
          "공지 삭제에 실패했습니다.",
        detail:
          String(error)
      },
      500
    );
  }
}

/* =========================
   PUBLIC NOTICE
========================= */


/* =========================
   ONLINE PRESENCE
========================= */

async function presence(request, env) {
  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS online_sessions (
        user_id INTEGER PRIMARY KEY,
        last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    if (request.method === "GET") {
      await env.DB.prepare("DELETE FROM online_sessions WHERE last_seen < datetime('now','-90 seconds')").run();
      const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM online_sessions WHERE last_seen >= datetime('now','-90 seconds')").first();
      return json({ count: Number(row?.count || 0) });
    }

    if (request.method === "POST") {
      const user = await getCurrentUser(request, env);
      if (!user) return json({ error: "로그인이 필요합니다." }, 401);

      await env.DB.prepare("INSERT INTO online_sessions(user_id,last_seen) VALUES(?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET last_seen=CURRENT_TIMESTAMP").bind(user.id).run();
      await env.DB.prepare("DELETE FROM online_sessions WHERE last_seen < datetime('now','-90 seconds')").run();
      const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM online_sessions WHERE last_seen >= datetime('now','-90 seconds')").first();
      return json({ count: Number(row?.count || 0) });
    }

    return json({ error: "지원하지 않는 요청입니다." }, 405);
  } catch (error) {
    return json({ count: 0, error: String(error?.message || error) }, 500);
  }
}

async function publicNotice(env) {

  try {

    const result =
      await env.DB
        .prepare(`
          SELECT
            id,
            message,
            button_text,
            button_link
          FROM notices
          WHERE active = 1
          ORDER BY
            sort_order ASC,
            id DESC
          LIMIT 5
        `)
        .all();

    return json({
      notices:
        result.results || []
    });

  } catch {

    return json({
      notices: []
    });
  }
}

/* =========================================================
   DURABLE OBJECT
========================================================= */

export class GameRoom {
  constructor(state,env){this.state=state;this.env=env;this.sockets=new Set();this.players=new Map();this.boards=new Map();this.left=new Map();this.names=new Map();this.started=false;this.finished=false;this.roomCode="";}
  send(ws,d){try{ws.send(JSON.stringify(d))}catch{this.sockets.delete(ws);this.players.delete(ws)}}
  broadcast(d){const m=JSON.stringify(d);for(const ws of this.sockets){try{ws.send(m)}catch{this.sockets.delete(ws);this.players.delete(ws)}}}
  async fetch(request){
    if(request.headers.get("Upgrade")?.toLowerCase()!=="websocket")return json({ok:true,type:"GameRoom"});
    const u=new URL(request.url),uid=String(u.searchParams.get("userId")||""),name=String(u.searchParams.get("username")||"하니"),code=String(u.searchParams.get("room")||"");
    if(!uid||!code)return new Response("Missing battle identity",{status:400});
    if(this.players.size>=2&&!Array.from(this.players.values()).includes(uid))return new Response("Battle room is full",{status:409});
    const pair=new WebSocketPair(),client=pair[0],server=pair[1];server.accept();this.roomCode=code;this.sockets.add(server);this.players.set(server,uid);this.names.set(uid,name);if(!this.left.has(uid))this.left.set(uid,64);
    server.addEventListener("message",e=>this.onMessage(server,e.data));server.addEventListener("close",()=>this.onClose(server));server.addEventListener("error",()=>this.onClose(server));
    this.send(server,{type:"battle_connected",playerId:uid,waiting:this.players.size<2});if(this.players.size===2)await this.startBattle();return new Response(null,{status:101,webSocket:client});
  }
  async onMessage(ws,raw){
    let d;try{d=JSON.parse(raw)}catch{return}const uid=this.players.get(ws);if(!uid||this.finished)return;
    if(d.type==="init"){const raw=Array.isArray(d.board)?d.board:[];const board=raw.length===8&&raw.every(row=>Array.isArray(row)&&row.length===8)?raw.map(row=>row.slice(0,8)):raw.length===64?Array.from({length:8},(_,r)=>raw.slice(r*8,r*8+8)):[];if(board.length!==8||board.some(row=>row.length!==8))return;this.boards.set(uid,board);this.names.set(uid,String(d.username||this.names.get(uid)||"하니"));this.left.set(uid,64);if(this.players.size===2&&this.boards.size===2)await this.startBattle();else this.send(ws,{type:"battle_waiting",players:this.players.size});return}
    if(d.type==="move"&&this.started){const validPos=p=>Array.isArray(p)&&p.length===2&&Number.isInteger(Number(p[0]))&&Number.isInteger(Number(p[1]))&&Number(p[0])>=0&&Number(p[0])<8&&Number(p[1])>=0&&Number(p[1])<8;if(!validPos(d.a)||!validPos(d.b)||(Number(d.a[0])===Number(d.b[0])&&Number(d.a[1])===Number(d.b[1])))return;const cur=Number(this.left.get(uid)||0);if(cur<=0)return;const next=Math.max(0,cur-2);this.left.set(uid,next);this.broadcast({type:"opponent_move",playerId:uid,a:d.a.map(Number),b:d.b.map(Number),left:next});if(next===0)await this.finishBattle(uid,"win");return}
    if(d.type==="leave")await this.finishBattle(uid,"leave");
  }
  async startBattle(){if(this.started||this.finished||this.players.size!==2||this.boards.size!==2)return;this.started=true;const ids=Array.from(this.names.keys()).slice(0,2);this.broadcast({type:"battle_start",timeLeft:120,players:ids.map(id=>({id,username:this.names.get(id)||"하니",board:this.boards.get(id)||[]}))});try{await this.env.DB.prepare("UPDATE rooms SET status='playing' WHERE room_code=?").bind(this.roomCode).run()}catch{}}
  async finishBattle(winnerId,reason){if(this.finished)return;this.finished=true;const ids=Array.from(this.names.keys()).slice(0,2),loserId=ids.find(id=>id!==winnerId)||null;let winnerReward=0,loserReward=0;if(reason==="win"&&loserId){winnerReward=1000;loserReward=300;try{await this.env.DB.batch([this.env.DB.prepare("UPDATE users SET points=points+?, xp=xp+?, wins=wins+1 WHERE id=?").bind(winnerReward,50,Number(winnerId)),this.env.DB.prepare("UPDATE users SET points=points+?, xp=xp+?, losses=losses+1 WHERE id=?").bind(loserReward,20,Number(loserId)),this.env.DB.prepare("UPDATE rooms SET status='finished' WHERE room_code=?").bind(this.roomCode)])}catch(e){console.error("BATTLE REWARD ERROR",e)}}else{try{await this.env.DB.prepare("UPDATE rooms SET status='finished' WHERE room_code=?").bind(this.roomCode).run()}catch{}}this.broadcast({type:"battle_result",winnerId,loserId,reason,winnerReward,loserReward})}
  async onClose(ws){if(!this.sockets.has(ws))return;const uid=this.players.get(ws);this.sockets.delete(ws);this.players.delete(ws);if(!uid||this.finished)return;if(this.started){const opp=Array.from(this.names.keys()).find(id=>id!==uid);if(opp)await this.finishBattle(opp,"leave")}else{try{await this.env.DB.prepare("UPDATE rooms SET status='finished' WHERE room_code=?").bind(this.roomCode).run()}catch{}}}
}

/* =========================
   HANI MATCHING
========================= */
async function ensureMatchingTables(env) {
  const statements = [
    "CREATE TABLE IF NOT EXISTS matching_profiles (user_id INTEGER PRIMARY KEY, gender TEXT NOT NULL CHECK(gender IN ('male','female')), active INTEGER NOT NULL DEFAULT 0, verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE IF NOT EXISTS matching_code_attempts (user_id INTEGER PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, window_start TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE IF NOT EXISTS matching_hearts (from_user INTEGER NOT NULL, to_user INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(from_user,to_user))",
    "CREATE TABLE IF NOT EXISTS matching_matches (id INTEGER PRIMARY KEY AUTOINCREMENT, user_a INTEGER NOT NULL, user_b INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','ended')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, ended_at TEXT, UNIQUE(user_a,user_b))",
    "CREATE TABLE IF NOT EXISTS matching_blocks (blocker_id INTEGER NOT NULL, blocked_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(blocker_id,blocked_id))",
    "CREATE TABLE IF NOT EXISTS matching_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, match_id INTEGER NOT NULL, sender_id INTEGER NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE IF NOT EXISTS matching_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, reporter_id INTEGER NOT NULL, target_id INTEGER NOT NULL, match_id INTEGER, reason TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ];
  for (const sql of statements) await env.DB.prepare(sql).run();
}
async function matchingBlocked(env, a, b) {
  return !!(await env.DB.prepare("SELECT 1 FROM matching_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?) LIMIT 1").bind(a,b,b,a).first());
}
async function matchingState(env, user) {
  const profile = await env.DB.prepare("SELECT user_id,gender,active,verified_at,created_at FROM matching_profiles WHERE user_id=?").bind(user.id).first();
  if (!profile) return json({profile:null,people:[],matches:[]});
  const opposite = profile.gender === "male" ? "female" : "male";
  const peopleResult = profile.active ? await env.DB.prepare(
    "SELECT p.user_id AS id,p.gender,u.username,p.active FROM matching_profiles p JOIN users u ON u.id=p.user_id WHERE p.active=1 AND p.gender=? AND p.user_id<>? AND NOT EXISTS (SELECT 1 FROM matching_blocks b WHERE (b.blocker_id=? AND b.blocked_id=p.user_id) OR (b.blocker_id=p.user_id AND b.blocked_id=?)) AND NOT EXISTS (SELECT 1 FROM matching_matches m WHERE m.user_a=MIN(?,p.user_id) AND m.user_b=MAX(?,p.user_id)) ORDER BY p.created_at DESC LIMIT 100"
  ).bind(opposite,user.id,user.id,user.id,user.id,user.id).all() : {results:[]};
  const likedResult = await env.DB.prepare("SELECT to_user FROM matching_hearts WHERE from_user=?").bind(user.id).all();
  const liked = new Set((likedResult.results||[]).map(r=>Number(r.to_user)));
  const people = (peopleResult.results||[]).map(p=>({id:Number(p.id),nickname:p.username,gender:p.gender,liked:liked.has(Number(p.id))}));
  const matchesResult = await env.DB.prepare(
    "SELECT m.id,m.status,m.created_at,m.ended_at,CASE WHEN m.user_a=? THEN m.user_b ELSE m.user_a END AS partner_id,u.username AS nickname,p.gender FROM matching_matches m JOIN users u ON u.id=CASE WHEN m.user_a=? THEN m.user_b ELSE m.user_a END LEFT JOIN matching_profiles p ON p.user_id=u.id WHERE (m.user_a=? OR m.user_b=?) ORDER BY CASE WHEN m.status='active' THEN 0 ELSE 1 END,m.id DESC LIMIT 100"
  ).bind(user.id,user.id,user.id,user.id).all();
  const matches = [];
  for (const m of (matchesResult.results||[])) {
    if (await matchingBlocked(env,user.id,Number(m.partner_id))) continue;
    matches.push({id:Number(m.id),status:m.status,created_at:m.created_at,ended_at:m.ended_at,partnerId:Number(m.partner_id),nickname:m.nickname,gender:m.gender,canChat:m.status==="active"});
  }
  return json({profile:{gender:profile.gender,active:Number(profile.active)===1,verifiedAt:profile.verified_at},people,matches});
}
async function matchingApi(request, env, user, url) {
  await ensureMatchingTables(env);
  const path = url.pathname;
  if (path === "/api/matching/state" && request.method === "GET") return matchingState(env,user);
  if (path === "/api/matching/setup" && request.method === "POST") {
    const body = await readJson(request);
    const code = String(body.code||"").trim();
    const gender = String(body.gender||"");
    if (!env.BBW_MATCH_CODE) return json({error:"운영자가 BBW_MATCH_CODE 입장코드를 설정해야 해요."},503);
    if (gender!=="male" && gender!=="female") return json({error:"성별을 선택해 주세요."},400);
    const attempt = await env.DB.prepare("SELECT attempts,window_start FROM matching_code_attempts WHERE user_id=?").bind(user.id).first();
    const windowStart = attempt?.window_start ? Date.parse(String(attempt.window_start).replace(" ","T")+"Z") : 0;
    const now = Date.now();
    const withinWindow = windowStart && now-windowStart < 60*60*1000;
    if (withinWindow && Number(attempt.attempts)>=5) return json({error:"입장코드 입력 횟수를 초과했어요. 1시간 뒤 다시 시도해 주세요."},429);
    if (code !== String(env.BBW_MATCH_CODE)) {
      if (withinWindow) await env.DB.prepare("UPDATE matching_code_attempts SET attempts=attempts+1 WHERE user_id=?").bind(user.id).run();
      else await env.DB.prepare("INSERT INTO matching_code_attempts(user_id,attempts,window_start) VALUES(?,1,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET attempts=1,window_start=CURRENT_TIMESTAMP").bind(user.id).run();
      return json({error:"입장코드가 맞지 않아요. 시무방 입장코드를 확인해 주세요."},403);
    }
    await env.DB.prepare("INSERT INTO matching_profiles(user_id,gender,active) VALUES(?,?,0) ON CONFLICT(user_id) DO NOTHING").bind(user.id,gender).run();
    const profile = await env.DB.prepare("SELECT gender FROM matching_profiles WHERE user_id=?").bind(user.id).first();
    if (profile.gender !== gender) return json({error:"등록된 성별은 변경할 수 없어요. 운영자에게 문의해 주세요."},409);
    await env.DB.prepare("DELETE FROM matching_code_attempts WHERE user_id=?").bind(user.id).run();
    return matchingState(env,user);
  }
  if (path === "/api/matching/profile" && request.method === "POST") {
    const body = await readJson(request);
    const profile = await env.DB.prepare("SELECT user_id FROM matching_profiles WHERE user_id=?").bind(user.id).first();
    if (!profile) return json({error:"먼저 입장코드 인증을 완료해 주세요."},400);
    await env.DB.prepare("UPDATE matching_profiles SET active=? WHERE user_id=?").bind(body.active?1:0,user.id).run();
    return matchingState(env,user);
  }
  if (path === "/api/matching/heart" && request.method === "POST") {
    const body = await readJson(request);
    const target = Number(body.targetId);
    if (!Number.isSafeInteger(target)||target<1||target===Number(user.id)) return json({error:"상대 회원을 찾을 수 없어요."},400);
    const me = await env.DB.prepare("SELECT gender,active FROM matching_profiles WHERE user_id=?").bind(user.id).first();
    const other = await env.DB.prepare("SELECT gender,active FROM matching_profiles WHERE user_id=?").bind(target).first();
    if (!me||!other||Number(me.active)!==1||Number(other.active)!==1) return json({error:"현재 매칭할 수 없는 회원이에요."},400);
    if (me.gender===other.gender) return json({error:"이성 매칭만 이용할 수 있어요."},400);
    if (await matchingBlocked(env,user.id,target)) return json({error:"차단 관계에서는 매칭할 수 없어요."},403);
    const a=Math.min(Number(user.id),target), b=Math.max(Number(user.id),target);
    const previous=await env.DB.prepare("SELECT id,status FROM matching_matches WHERE user_a=? AND user_b=?").bind(a,b).first();
    if (previous) return json({error:previous.status==="ended"?"매칭 해제한 상대와는 다시 매칭할 수 없어요.":"이미 매칭된 상대예요."},409);
    await env.DB.prepare("INSERT OR IGNORE INTO matching_hearts(from_user,to_user) VALUES(?,?)").bind(user.id,target).run();
    const reciprocal=await env.DB.prepare("SELECT 1 FROM matching_hearts WHERE from_user=? AND to_user=?").bind(target,user.id).first();
    if (!reciprocal) return json({mutual:false,message:"하트를 보냈어요 💗"});
    await env.DB.prepare("INSERT OR IGNORE INTO matching_matches(user_a,user_b,status) VALUES(?,?,'active')").bind(a,b).run();
    const match=await env.DB.prepare("SELECT id,status FROM matching_matches WHERE user_a=? AND user_b=?").bind(a,b).first();
    if (!match||match.status!=="active") return json({error:"이 상대와는 다시 매칭할 수 없어요."},409);
    return json({mutual:true,matchId:Number(match.id),message:"서로 호감이 통했어요! 💞 채팅이 열렸어요."});
  }
  const chatPath = path.match(/^\/api\/matching\/matches\/(\d+)\/messages$/);
  if (chatPath && (request.method==="GET"||request.method==="POST")) {
    const matchId=Number(chatPath[1]);
    const match=await env.DB.prepare("SELECT * FROM matching_matches WHERE id=? AND (user_a=? OR user_b=?)").bind(matchId,user.id,user.id).first();
    if (!match) return json({error:"채팅방을 찾을 수 없어요."},404);
    const partner=Number(match.user_a)===Number(user.id)?Number(match.user_b):Number(match.user_a);
    if (await matchingBlocked(env,user.id,partner)) return json({error:"차단된 채팅방이에요."},403);
    if (request.method==="GET") {
      const rows=await env.DB.prepare("SELECT id,sender_id,body,created_at FROM matching_messages WHERE match_id=? ORDER BY id DESC LIMIT 100").bind(matchId).all();
      return json({messages:(rows.results||[]).reverse().map(m=>({id:Number(m.id),mine:Number(m.sender_id)===Number(user.id),body:m.body,created_at:m.created_at})),readOnly:match.status!=="active"});
    }
    if (match.status!=="active") return json({error:"매칭이 해제되어 새 메시지를 보낼 수 없어요."},403);
    const body=await readJson(request);
    const message=String(body.message||"").trim();
    if (!message||message.length>1000) return json({error:"메시지는 1~1000자로 입력해 주세요."},400);
    await env.DB.prepare("INSERT INTO matching_messages(match_id,sender_id,body) VALUES(?,?,?)").bind(matchId,user.id,message).run();
    return json({ok:true});
  }
  const endPath=path.match(/^\/api\/matching\/matches\/(\d+)\/end$/);
  if (endPath && request.method==="POST") {
    const id=Number(endPath[1]);
    const result=await env.DB.prepare("UPDATE matching_matches SET status='ended',ended_at=CURRENT_TIMESTAMP WHERE id=? AND status='active' AND (user_a=? OR user_b=?)").bind(id,user.id,user.id).run();
    if (!result.meta?.changes) return json({error:"이미 해제되었거나 권한이 없는 매칭이에요."},400);
    return json({ok:true,message:"매칭을 해제했어요. 기존 대화는 읽기만 가능해요."});
  }
  if (path === "/api/matching/block" && request.method==="POST") {
    const body=await readJson(request), target=Number(body.targetId);
    if (!Number.isSafeInteger(target)||target<1||target===Number(user.id)) return json({error:"차단할 회원을 확인해 주세요."},400);
    await env.DB.prepare("INSERT OR IGNORE INTO matching_blocks(blocker_id,blocked_id) VALUES(?,?)").bind(user.id,target).run();
    const a=Math.min(Number(user.id),target), b=Math.max(Number(user.id),target);
    await env.DB.prepare("UPDATE matching_matches SET status='ended',ended_at=CURRENT_TIMESTAMP WHERE user_a=? AND user_b=? AND status='active'").bind(a,b).run();
    return json({ok:true,message:"차단했어요. 서로의 매칭 목록과 연락이 제한돼요."});
  }
  if (path === "/api/matching/report" && request.method==="POST") {
    const body=await readJson(request), target=Number(body.targetId), matchId=Number(body.matchId)||null;
    const reason=String(body.reason||"").trim(), details=String(body.details||"").trim().slice(0,1000);
    if (!Number.isSafeInteger(target)||target<1||target===Number(user.id)||!reason) return json({error:"신고 사유를 입력해 주세요."},400);
    if (matchId) {
      const match=await env.DB.prepare("SELECT id FROM matching_matches WHERE id=? AND (user_a=? OR user_b=?)").bind(matchId,user.id,user.id).first();
      if (!match) return json({error:"신고할 매칭을 확인할 수 없어요."},403);
    }
    await env.DB.prepare("INSERT INTO matching_reports(reporter_id,target_id,match_id,reason,details) VALUES(?,?,?,?,?)").bind(user.id,target,matchId,reason,details).run();
    return json({ok:true,message:"신고가 접수됐어요. 운영자가 내용을 검토할게요."});
  }
  return json({error:"지원하지 않는 매칭 요청이에요."},404);
}


/* =========================================================
   MAIN WORKER
========================================================= */

export default {

  async fetch(
    request,
    env
  ) {

    const url =
      new URL(
        request.url
      );

    /* =========================
       ROOT / MOBILE BOOT
       첫 HTML을 Worker에서 직접 반환
    ========================= */

    if (url.pathname === "/" || url.pathname === "") {
      return new Response("<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\"><meta name=\"theme-color\" content=\"#eef8ff\"><title>하니게임즈</title><link rel=\"stylesheet\" href=\"/style.css?v=20261023-6\"><style>html,body{margin:0;min-height:100%;background:#eef8ff;font-family:system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif}#boot{min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box}.card{width:min(420px,100%);box-sizing:border-box;background:#fff;border-radius:24px;padding:28px;box-shadow:0 12px 35px rgba(70,130,170,.15);text-align:center}.bunny{font-size:64px}.title{font-size:28px;font-weight:900;color:#4d7fae;margin:8px}.sub{color:#7890a3}button{width:100%;padding:14px;border:0;border-radius:12px;background:#69a9dc;color:#fff;font-weight:800;font-size:16px;margin-top:8px}</style></head><body><div id=\"boot\"><div class=\"card\"><div class=\"bunny\">🐰</div><div class=\"title\">하니게임즈</div><div class=\"sub\">하니게임즈를 불러오는 중이에요 💙</div></div></div><script>setTimeout(function(){var e=document.querySelector(\".sub\");if(e)e.textContent=\"하니게임즈 불러오는 중…\";},300);</script><script src=\"/app.js?v=20261023-13\"></script><script src=\"/battle.js?v=20261022-2\"></script></body></html>", {
        headers: {
          "content-type": "text/html; charset=UTF-8",
          "cache-control": "no-store, no-cache, must-revalidate"
        }
      });
    }

    /* =========================
       HANI MATCHING API
    ========================= */
    if (url.pathname.startsWith("/api/matching/")) {
      const user = await getCurrentUser(request, env);
      if (!user) return json({ error: "로그인이 필요합니다." }, 401);
      return matchingApi(request, env, user, url);
    }

    /* =========================
       PUBLIC NOTICE
    ========================= */

    if (
      url.pathname ===
        "/api/notices" &&
      request.method ===
        "GET"
    ) {
      return publicNotice(
        env
      );
    }

    /* =========================
       ONLINE PRESENCE
    ========================= */

    if (url.pathname === "/api/presence" && request.method === "GET") {
      return presence(request, env);
    }

    if (url.pathname === "/api/attendance" && request.method === "POST") {
      return attendance(request, env);
    }
    if (url.pathname === "/api/missions" && request.method === "GET") {
      return dailyMissions(request, env);
    }
    if (url.pathname === "/api/missions/claim" && request.method === "POST") {
      return claimDailyMission(request, env);
    }
    if (url.pathname === "/api/game-result" && request.method === "POST") {
      return gameResult(request, env);
    }

    /* =========================
       REGISTER
    ========================= */

    if (
      url.pathname ===
        "/api/register" &&
      request.method ===
        "POST"
    ) {
      return register(
        request,
        env
      );
    }

    /* =========================
       LOGIN
    ========================= */

    if (
      url.pathname ===
        "/api/login" &&
      request.method ===
        "POST"
    ) {
      return login(
        request,
        env
      );
    }

    /* =========================
       ADMIN NOTICE
    ========================= */

    if (
      url.pathname ===
      "/api/admin/notices"
    ) {

      if (
        request.method ===
        "GET"
      ) {
        return adminNoticeList(
          request,
          env
        );
      }

      if (
        request.method ===
        "POST"
      ) {
        return adminNoticeCreate(
          request,
          env
        );
      }
    }

    const updateMatch =
      url.pathname.match(
        /^\/api\/admin\/notices\/(\d+)$/
      );

    if (updateMatch) {

      const id =
        updateMatch[1];

      if (
        request.method ===
        "PUT"
      ) {
        return adminNoticeUpdate(
          request,
          env,
          id
        );
      }

      if (
        request.method ===
        "DELETE"
      ) {
        return adminNoticeDelete(
          request,
          env,
          id
        );
      }
    }

    const toggleMatch =
      url.pathname.match(
        /^\/api\/admin\/notices\/(\d+)\/toggle$/
      );

    if (
      toggleMatch &&
      request.method ===
      "POST"
    ) {
      return adminNoticeToggle(
        request,
        env,
        toggleMatch[1]
      );
    }

    if (url.pathname === "/api/presence" && request.method === "POST") {
      return presence(request, env);
    }

    /* =========================
       LOGIN REQUIRED
    ========================= */

    if (
      url.pathname.startsWith(
        "/api/"
      )
    ) {

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

      /* ME */

      if (
        url.pathname ===
        "/api/me"
      ) {
        const champion =
          await env.DB
            .prepare(
              "SELECT id FROM users ORDER BY points DESC, id ASC LIMIT 1"
            )
            .first();

        return json({
          user:
            publicUser(
              user,
              Number(champion?.id) === Number(user.id)
            )
        });
      }

      /* POKE / NUDGE */
      if (url.pathname === "/api/pokes") {
        return pokes(request, env, user);
      }

      /* ACTION */

      if (
        url.pathname ===
          "/api/action" &&
        request.method ===
          "POST"
      ) {
        return action(
          request,
          env
        );
      }

      /* RANKING */

      if (
        url.pathname ===
        "/api/ranking"
      ) {
        return ranking(
          env
        );
      }

      /* ROOMS */

      if (
        url.pathname ===
        "/api/rooms"
      ) {
        return rooms(
          request,
          env,
          user
        );
      }

      /* JOIN ROOM */

      const joinMatch =
        url.pathname.match(
          /^\/api\/rooms\/([^/]+)\/join$/
        );

      if (
        joinMatch &&
        request.method ===
        "POST"
      ) {
        return joinRoom(
          request,
          env,
          user,
          joinMatch[1]
        );
      }

      /* ROOM STATE */

      const roomMatch =
        url.pathname.match(
          /^\/api\/rooms\/([^/]+)$/
        );

      if (
        roomMatch &&
        request.method ===
        "GET"
      ) {
        return roomState(
          env,
          roomMatch[1]
        );
      }

      /* WEBSOCKET */

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

        const wsUrl = new URL(request.url);
        wsUrl.searchParams.set("room", wsMatch[1]);
        wsUrl.searchParams.set("userId", String(user.id));
        wsUrl.searchParams.set("username", String(user.username || "하니"));

        return room.fetch(
          new Request(wsUrl.toString(), request)
        );
      }
    }

    /* =========================
       STATIC ASSETS
    ========================= */

    // 루트 진입은 항상 실제 index.html을 명시적으로 반환합니다.
    // 다른 정적 파일은 ASSETS에 그대로 전달합니다.
    if (url.pathname === "/" || url.pathname === "") {
      const indexRequest = new Request(
        new URL("/index.html", request.url),
        request
      );
      return env.ASSETS.fetch(indexRequest);
    }

    return env.ASSETS.fetch(request);
  }
};
