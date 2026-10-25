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

async function makeToken(user, env) {
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify({
    id: user.id,
    username: user.username,
    created: Date.now()
  })));
  if (!env?.HANI_TOKEN_SECRET) return payload;
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(String(env.HANI_TOKEN_SECRET)),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return payload + "." + bytesToBase64Url(signature);
}

async function readToken(token, env) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length === 2) {
      if (!env?.HANI_TOKEN_SECRET) return null;
      const key = await crypto.subtle.importKey(
        "raw", encoder.encode(String(env.HANI_TOKEN_SECRET)),
        { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
      );
      const valid = await crypto.subtle.verify(
        "HMAC", key, base64UrlToBytes(parts[1]), encoder.encode(parts[0])
      );
      if (!valid) return null;
      const data = JSON.parse(decoder.decode(base64UrlToBytes(parts[0])));
      return { ...data, _signed: true };
    }
    const legacy = JSON.parse(decoder.decode(base64UrlToBytes(token)));
    return { ...legacy, _signed: false };
  } catch {
    return null;
  }
}

async function getMatchingUser(request, env) {
  // 기존 하니게임즈 로그인 세션을 재사용합니다. 별도 HANI_TOKEN_SECRET 설정은 요구하지 않습니다.
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const data = await readToken(authorization.slice(7), env);
  if (!data?.id || !data.username || !Number.isFinite(Number(data.created)) || Date.now()-Number(data.created)>30*24*60*60*1000) return null;
  return await env.DB.prepare("SELECT id,username FROM users WHERE id=? AND username=?")
    .bind(data.id, data.username).first();
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
  let tokenFromHeader = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!tokenFromHeader) {
    try { tokenFromHeader = new URL(request.url).searchParams.get("token") || ""; } catch {}
  }

  if (tokenFromHeader) {
    const token = tokenFromHeader;

    const data =
      await readToken(token, env);

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
      token: await makeToken(user, env)
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
        await makeToken(user, env)
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
  const allowed=["tetris","bang","tichu","rummikub","liar","lasvegas"];
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

async function ensureBoardgameTables(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS boardgame_rooms (room_code TEXT PRIMARY KEY, game TEXT NOT NULL, host_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'waiting', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS boardgame_room_players (room_code TEXT NOT NULL, user_id INTEGER NOT NULL, username TEXT NOT NULL, joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(room_code,user_id))").run();
}
async function boardgameRooms(request, env, user) {
  await ensureBoardgameTables(env);
  const url = new URL(request.url);
  if (request.method === "GET") {
    const game = url.searchParams.get("game");
    const result = game
      ? await env.DB.prepare("SELECT r.room_code,r.game,r.host_id,r.status,r.created_at,(SELECT COUNT(*) FROM boardgame_room_players p WHERE p.room_code=r.room_code) AS player_count FROM boardgame_rooms r WHERE r.game=? AND r.status IN ('waiting','playing') ORDER BY r.created_at DESC LIMIT 40").bind(game).all()
      : await env.DB.prepare("SELECT r.room_code,r.game,r.host_id,r.status,r.created_at,(SELECT COUNT(*) FROM boardgame_room_players p WHERE p.room_code=r.room_code) AS player_count FROM boardgame_rooms r WHERE r.status IN ('waiting','playing') ORDER BY r.created_at DESC LIMIT 40").all();
    return json({rooms:result.results||[]});
  }
  if (request.method === "POST") {
    const body = await readJson(request);
    const game = String(body.game||"");
    const allowed = ["wordchain","bang","tichu","rummikub","liar","lasvegas"];
    if (!allowed.includes(game)) return json({error:"지원하지 않는 보드게임입니다."},400);
    let code = "";
    for(let i=0;i<12;i++){
      code=Math.random().toString(36).slice(2,7).toUpperCase();
      const found=await env.DB.prepare("SELECT room_code FROM boardgame_rooms WHERE room_code=?").bind(code).first();
      if(!found)break;
    }
    await env.DB.prepare("INSERT INTO boardgame_rooms(room_code,game,host_id,status) VALUES(?,?,?,'waiting')").bind(code,game,user.id).run();
    await env.DB.prepare("INSERT INTO boardgame_room_players(room_code,user_id,username) VALUES(?,?,?)").bind(code,user.id,String(user.username||"하니")).run();
    return json({room:{room_code:code,game,host_id:user.id,status:"waiting",player_count:1}});
  }
  return json({error:"지원하지 않는 요청입니다."},405);
}
async function joinBoardgameRoom(request, env, user, code) {
  await ensureBoardgameTables(env);
  const room=await env.DB.prepare("SELECT * FROM boardgame_rooms WHERE room_code=?").bind(code).first();
  if(!room)return json({error:"방 코드를 확인해 주세요."},404);
  const current=await env.DB.prepare("SELECT user_id FROM boardgame_room_players WHERE room_code=? AND user_id=?").bind(code,user.id).first();
  if(current)return json({ok:true,room});
  if(room.status!=="waiting")return json({error:"이미 시작한 방이에요."},409);
  const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM boardgame_room_players WHERE room_code=?").bind(code).first();
  const max=room.game==="liar"?8:room.game==="lasvegas"||room.game==="rummikub"?4:4;
  if(Number(count?.n||0)>=max)return json({error:"방이 가득 찼어요."},409);
  await env.DB.prepare("INSERT INTO boardgame_room_players(room_code,user_id,username) VALUES(?,?,?)").bind(code,user.id,String(user.username||"하니")).run();
  return json({ok:true,room,player_count:Number(count?.n||0)+1});
}
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
   HANI MATCHING ADMIN
========================= */
async function adminMatchingReports(request, env) {
  const check = await requireAdmin(request, env);
  if (check.error) return check.error;
  await ensureMatchingTables(env);
  const rows = await env.DB.prepare(
    "SELECT r.id,r.reporter_id,r.target_id,r.match_id,r.reason,r.details,r.status,r.created_at, reporter.group_nickname AS reporter_nickname, target.group_nickname AS target_nickname FROM matching_reports r LEFT JOIN matching_profiles reporter ON reporter.user_id=r.reporter_id LEFT JOIN matching_profiles target ON target.user_id=r.target_id ORDER BY CASE WHEN r.status='pending' THEN 0 ELSE 1 END, r.id DESC LIMIT 300"
  ).all();
  return json({reports: rows.results || []});
}
async function adminMatchingReportUpdate(request, env, id) {
  const check = await requireAdmin(request, env);
  if (check.error) return check.error;
  await ensureMatchingTables(env);
  const body = await readJson(request);
  const status = String(body.status || "");
  if (!["pending","reviewed","actioned","dismissed"].includes(status)) return json({error:"처리 상태를 확인해 주세요."},400);
  const report = await env.DB.prepare("SELECT id,target_id FROM matching_reports WHERE id=?").bind(id).first();
  if (!report) return json({error:"신고를 찾을 수 없어요."},404);
  await env.DB.prepare("UPDATE matching_reports SET status=? WHERE id=?").bind(status,id).run();
  if (body.disableMatching === true) await env.DB.prepare("UPDATE matching_profiles SET active=0 WHERE user_id=?").bind(report.target_id).run();
  return json({ok:true,message:body.disableMatching===true?"신고 상태를 저장하고 해당 회원의 매칭 참여를 중지했어요.":"신고 처리 상태를 저장했어요."});
}
async function adminMatchingMembers(request, env) {
  const check = await requireAdmin(request, env);
  if (check.error) return check.error;
  await ensureMatchingTables(env);
  const rows = await env.DB.prepare(
    "SELECT p.user_id,p.group_nickname,p.gender,p.active,p.verified_at,p.created_at,(SELECT COUNT(*) FROM matching_reports r WHERE r.target_id=p.user_id AND r.status='pending') AS pending_reports FROM matching_profiles p ORDER BY p.created_at DESC LIMIT 500"
  ).all();
  return json({members:rows.results||[]});
}
async function adminMatchingMemberUpdate(request, env, id) {
  const check = await requireAdmin(request, env);
  if (check.error) return check.error;
  await ensureMatchingTables(env);
  const body = await readJson(request);
  if (typeof body.active !== "boolean") return json({error:"참여 상태를 확인해 주세요."},400);
  const result = await env.DB.prepare("UPDATE matching_profiles SET active=? WHERE user_id=?").bind(body.active?1:0,id).run();
  if (!result.meta?.changes) return json({error:"매칭 회원을 찾을 수 없어요."},404);
  return json({ok:true,message:body.active?"매칭 참여를 다시 허용했어요.":"매칭 참여를 중지했어요."});
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
  constructor(state,env){this.state=state;this.env=env;this.sockets=new Set();this.players=new Map();this.boards=new Map();this.left=new Map();this.names=new Map();this.started=false;this.finished=false;this.roomCode="";this.bgSockets=new Map();this.bgReady=new Set();this.bgChat=[];this.bgGame="";this.bgHostId="";this.bgPhase="lobby";this.bgSecret=null;this.bgVotes=new Map();this.bgStartedAt=null;this.bgGameState=null;}
  send(ws,d){try{ws.send(JSON.stringify(d))}catch{this.sockets.delete(ws);this.players.delete(ws)}}
  broadcast(d){const m=JSON.stringify(d);for(const ws of this.sockets){try{ws.send(m)}catch{this.sockets.delete(ws);this.players.delete(ws)}}}
  async fetch(request){
    if(new URL(request.url).searchParams.get("mode")==="boardgame") return this.fetchBoardGame(request);
    if(request.headers.get("Upgrade")?.toLowerCase()!=="websocket")return json({ok:true,type:"GameRoom"});
    const u=new URL(request.url),uid=String(u.searchParams.get("userId")||""),name=String(u.searchParams.get("username")||"하니"),code=String(u.searchParams.get("room")||"");
    if(!uid||!code)return new Response("Missing battle identity",{status:400});
    if(this.players.size>=2&&!Array.from(this.players.values()).includes(uid))return new Response("Battle room is full",{status:409});
    const pair=new WebSocketPair(),client=pair[0],server=pair[1];server.accept();this.roomCode=code;this.sockets.add(server);this.players.set(server,uid);this.names.set(uid,name);if(!this.left.has(uid))this.left.set(uid,64);
    server.addEventListener("message",e=>this.onMessage(server,e.data));server.addEventListener("close",()=>this.onClose(server));server.addEventListener("error",()=>this.onClose(server));
    this.send(server,{type:"battle_connected",playerId:uid,waiting:this.players.size<2});if(this.players.size===2)await this.startBattle();return new Response(null,{status:101,webSocket:client});
  }
  bgSend(ws,d){try{ws.send(JSON.stringify(d))}catch{this.bgSockets.delete(ws)}}
  bgPublic(){
    return {type:"room_state",room:this.roomCode,game:this.bgGame,phase:this.bgPhase,hostId:this.bgHostId,players:Array.from(this.bgSockets.values()).map(p=>({id:p.id,name:p.name,ready:this.bgReady.has(p.id),online:true})),chat:this.bgChat.slice(-60),started:!!this.bgSecret};
  }
  bgBroadcast(){
    const base=this.bgPublic();
    for(const [ws,p] of this.bgSockets){
      let privateData=null,gameState=null;
      if(this.bgSecret&&this.bgGame==="liar")privateData={isLiar:p.id===this.bgSecret.liarId,clue:p.id===this.bgSecret.liarId?this.bgSecret.liarWord:this.bgSecret.word,category:this.bgSecret.category};
      const g=this.bgGameState;
      if(g){
        if(this.bgGame==="wordchain"){
          gameState={currentWord:g.currentWord,used:g.used,history:g.history,turnId:g.players[g.turn]?.id,over:g.over,winner:g.winner};
        }else if(this.bgGame==="bang"){
          gameState={players:g.players.map(x=>({id:x.id,name:x.name,hp:x.hp,handCount:x.hand.length,alive:x.alive})),turnId:g.players[g.turn]?.id,log:g.log.slice(-12),over:g.over,winner:g.winner};
          const own=g.players.find(x=>x.id===p.id);if(own)privateData={role:own.role,hand:own.hand.slice(),hp:own.hp};
        }else if(this.bgGame==="tichu"){
          gameState={players:g.players.map(x=>({id:x.id,name:x.name,team:x.team,handCount:x.hand.length})),turnId:g.players[g.turn]?.id,last:g.last,passes:g.passes,log:g.log.slice(-12),over:g.over,winner:g.winner};
          const own=g.players.find(x=>x.id===p.id);if(own)privateData={hand:own.hand.slice(),team:own.team};
        }else if(this.bgGame==="rummikub"){
          gameState={players:g.players.map(x=>({id:x.id,name:x.name,handCount:x.hand.length,opened:x.opened})),poolCount:g.pool.length,table:g.table,turnId:g.players[g.turn]?.id,log:g.log.slice(-12),over:g.over,winner:g.winner};
          const own=g.players.find(x=>x.id===p.id);if(own)privateData={hand:own.hand.slice()};
        }else if(this.bgGame==="lasvegas"){
          gameState={players:g.players.map(x=>({id:x.id,name:x.name,diceCount:x.dice.length,money:x.money})),casinos:g.casinos.map(c=>({num:c.num,bills:c.bills,placed:c.placed.map(a=>a.length)})),turnId:g.players[g.turn]?.id,log:g.log.slice(-12),over:g.over,winner:g.winner};
          const own=g.players.find(x=>x.id===p.id);if(own)privateData={dice:own.dice.slice()};
        }
      }
      this.bgSend(ws,{...base,privateData,gameState,result:this.bgSecret?.result||null});
    }
  }
  bgShuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  bgCreateGameState(people){
    const players=people.map(p=>({id:p.id,name:p.name}));
    if(this.bgGame==="wordchain")return {players:players,turn:0,currentWord:"시작",used:[],history:[{name:"시스템",word:"시작"}],over:false,winner:""};
    if(this.bgGame==="bang"){
      const roles=this.bgShuffle(["보안관","무법자","무법자","배신자"]);
      const deck=this.bgShuffle([...Array(18).fill("bang"),...Array(8).fill("miss"),...Array(6).fill("beer"),...Array(5).fill("panic")]);
      return {players:players.map((p,i)=>({...p,role:roles[i],hp:roles[i]==="보안관"?5:4,alive:true,hand:deck.splice(0,4)})),deck,turn:0,log:["뱅! 온라인 대전 시작!"],over:false,winner:""};
    }
    if(this.bgGame==="tichu"){
      const deck=[];for(const suit of ["♣","♦","♥","♠"])for(let n=2;n<=14;n++)deck.push({suit:suit,n:n});
      deck.push({suit:"🀄",n:1},{suit:"🐕",n:0},{suit:"🐦",n:15},{suit:"🐉",n:16});this.bgShuffle(deck);
      return {players:players.map((p,i)=>({...p,team:i%2,hand:deck.splice(0,14)})),turn:0,last:null,passes:0,lastPlayer:0,log:["티츄 온라인 대전 시작! 팀은 번갈아 배정돼요."],over:false,winner:""};
    }
    if(this.bgGame==="rummikub"){
      const deck=[];for(let cp=0;cp<2;cp++)for(const color of ["🔴","🔵","🟠","⚫"])for(let n=1;n<=13;n++)deck.push({id:cp+"-"+color+"-"+n,color:color,n:n});
      deck.push({id:"j1",color:"🃏",n:0},{id:"j2",color:"🃏",n:0});this.bgShuffle(deck);
      return {players:players.map(p=>({...p,hand:deck.splice(0,14),opened:false})),pool:deck,table:[],turn:0,log:["루미큐브 온라인 시작! 첫 등록은 30점 이상이에요."],over:false,winner:""};
    }
    if(this.bgGame==="lasvegas"){
      const money=this.bgShuffle([90000,80000,70000,60000,50000,40000,30000,20000,10000]);
      const casinos=Array.from({length:6},(_,i)=>({num:i+1,bills:[money[(i*2)%money.length],money[(i*2+1)%money.length]],placed:players.map(()=>[])}));
      return {players:players.map(p=>({...p,dice:Array.from({length:8},()=>1+Math.floor(Math.random()*6)),money:0})),casinos,turn:0,log:["라스베가스 온라인 시작! 주사위 눈에 맞는 카지노를 선택하세요."],over:false,winner:""};
    }
    return null;
  }
  bgNextTurn(g){
    for(let k=1;k<=g.players.length;k++){const n=(g.turn+k)%g.players.length;if(g.players[n].alive!==false&&g.players[n].hand?.length!==0&&g.players[n].dice?.length!==0){g.turn=n;return;}}
    g.turn=(g.turn+1)%g.players.length;
  }
  bgValidRummi(ts){
    if(ts.length<3)return false;const normal=ts.filter(t=>t.color!=="🃏");if(!normal.length)return false;
    const nums=new Set(normal.map(t=>t.n)),colors=new Set(normal.map(t=>t.color));
    if(nums.size===1&&colors.size===normal.length&&ts.length<=4)return true;
    if(colors.size===1){const ns=normal.map(t=>t.n).sort((a,b)=>a-b);if(new Set(ns).size===ns.length&&ns[ns.length-1]-ns[0]+1===ts.length)return true;}
    return false;
  }
  async bgHandleGameAction(player,d){
    const g=this.bgGameState;if(!g||g.over||this.bgPhase!=="playing")return;
    const action=String(d.action||""),payload=d.payload&&typeof d.payload==="object"?d.payload:{};
    if(this.bgGame==="wordchain"){
      const pi=g.players.findIndex(x=>x.id===player.id);if(pi<0||pi!==g.turn)return;
      if(action!=="wordchain_submit")return;
      const word=String(payload.word||"").trim().replace(/\s/g,"");
      if(word.length<2||word.length>20){this.bgSend(Array.from(this.bgSockets.keys()).find(ws=>this.bgSockets.get(ws)?.id===player.id),{type:"notice",text:"단어는 2~20자로 입력해 주세요."});return;}
      if(g.used.includes(word)){this.bgSend(Array.from(this.bgSockets.keys()).find(ws=>this.bgSockets.get(ws)?.id===player.id),{type:"notice",text:"이미 나온 단어예요."});return;}
      if(g.currentWord!=="시작"&&!word.startsWith(g.currentWord.slice(-1))){this.bgSend(Array.from(this.bgSockets.keys()).find(ws=>this.bgSockets.get(ws)?.id===player.id),{type:"notice",text:"‘"+g.currentWord.slice(-1)+"’(으)로 시작하는 단어를 입력해 주세요."});return;}
      g.used.push(word);g.history.push({name:player.name,word:word});g.currentWord=word;g.turn=(g.turn+1)%g.players.length;g.log.unshift(player.name+" · "+word);
    }else if(this.bgGame==="bang"){
      const pi=g.players.findIndex(x=>x.id===player.id);if(pi<0||pi!==g.turn)return;
      const p=g.players[pi],ci=Number(payload.cardIndex);if(!Number.isInteger(ci)||ci<0||ci>=p.hand.length)return;
      const card=p.hand[ci];
      if(action==="bang_play"){
        if(card==="bang"){const ti=g.players.findIndex(x=>x.id===String(payload.targetId));if(ti<0||ti===pi||!g.players[ti].alive)return;g.players[ti].hp--;g.log.unshift(p.name+"이(가) "+g.players[ti].name+"에게 뱅!");if(g.players[ti].hp<=0){g.players[ti].alive=false;g.log.unshift(g.players[ti].name+" 탈락!");}}
        else if(card==="beer")p.hp=Math.min(p.role==="보안관"?5:4,p.hp+1);
        else if(card==="panic"){const ti=g.players.findIndex(x=>x.id===String(payload.targetId));if(ti>=0&&ti!==pi&&g.players[ti].hand.length)g.players[ti].hand.pop();}
        else return;
      }else if(action!=="bang_discard")return;
      p.hand.splice(ci,1);if(g.deck.length<2)g.deck=this.bgShuffle(["bang","bang","miss","beer","panic","bang","miss","beer"]);p.hand.push(g.deck.pop());p.hand.push(g.deck.pop());
      const sheriff=g.players.find(x=>x.role==="보안관"),outlaws=g.players.filter(x=>x.role==="무법자"&&x.alive);
      if(!sheriff?.alive){g.over=true;g.winner="무법자 팀";}else if(!outlaws.length){g.over=true;g.winner="보안관 팀";}
      if(!g.over)this.bgNextTurn(g);else g.log.unshift("🏆 "+g.winner+" 승리!");
    }else if(this.bgGame==="tichu"){
      if(g.players[g.turn]?.id!==player.id)return;const p=g.players[g.turn];
      if(action==="tichu_pass"){if(!g.last)return;g.passes++;g.log.unshift(p.name+" 패스");if(g.passes>=g.players.length-1){g.turn=g.lastPlayer;g.last=null;g.passes=0;}else this.bgNextTurn(g);}
      else if(action==="tichu_play"){
        const indices=Array.isArray(payload.indices)?[...new Set(payload.indices.map(Number))].sort((a,b)=>a-b):[];
        if(!indices.length||indices.some(i=>!Number.isInteger(i)||i<0||i>=p.hand.length))return;
        const cards=indices.map(i=>p.hand[i]);if(cards.length>1&&!cards.every(c=>c.n===cards[0].n))return;
        const power=Math.max(...cards.map(c=>c.n));if(g.last&&power<=g.last.power)return;
        p.hand=p.hand.filter((c,i)=>!indices.includes(i));g.last={power:power,label:cards.map(c=>c.suit+({11:"J",12:"Q",13:"K",14:"A"}[c.n]||c.n)).join(" "),count:cards.length};g.lastPlayer=g.turn;g.passes=0;g.log.unshift(p.name+"이(가) "+g.last.label+" 을(를) 냈어요.");
        if(!p.hand.length){g.over=true;g.winner="팀 "+(p.team===0?"A":"B");}else this.bgNextTurn(g);
      }else return;
    }else if(this.bgGame==="rummikub"){
      if(g.players[g.turn]?.id!==player.id)return;const p=g.players[g.turn];
      if(action==="rummikub_draw"){if(g.pool.length)p.hand.push(g.pool.pop());this.bgNextTurn(g);}
      else if(action==="rummikub_play"){
        const indices=Array.isArray(payload.indices)?[...new Set(payload.indices.map(Number))].sort((a,b)=>a-b):[];
        if(indices.length<3||indices.some(i=>!Number.isInteger(i)||i<0||i>=p.hand.length))return;
        const ts=indices.map(i=>p.hand[i]);if(!this.bgValidRummi(ts))return;
        if(!p.opened&&ts.reduce((n,t)=>n+(t.n||0),0)<30)return;
        p.opened=true;g.table.push(ts);p.hand=p.hand.filter((t,i)=>!indices.includes(i));g.log.unshift(p.name+"이(가) 타일 조합을 등록했어요.");
        if(!p.hand.length){g.over=true;g.winner=p.name;}else this.bgNextTurn(g);
      }else return;
    }else if(this.bgGame==="lasvegas"){
      if(g.players[g.turn]?.id!==player.id)return;const p=g.players[g.turn],num=Number(payload.num);
      if(action!=="lasvegas_place"||!Number.isInteger(num)||num<1||num>6||!p.dice.includes(num))return;
      const count=p.dice.filter(v=>v===num).length;p.dice=p.dice.filter(v=>v!==num);g.casinos[num-1].placed[g.turn].push(...Array(count).fill(num));g.log.unshift(p.name+"이(가) 카지노 "+num+"에 주사위 "+count+"개 배치");
      let next=-1;for(let step=1;step<=g.players.length;step++){const idx=(g.turn+step)%g.players.length;if(g.players[idx].dice.length>0){next=idx;break;}}
      if(g.players.every(x=>x.dice.length===0)){
        g.casinos.forEach(c=>{const counts=c.placed.map(a=>a.length),sorted=[...counts].sort((a,b)=>b-a);if(!sorted[0]||sorted[0]===sorted[1])return;const winner=counts.indexOf(sorted[0]),bill=c.bills.shift();if(bill){g.players[winner].money+=bill;g.log.unshift("카지노 "+c.num+" 지폐 "+bill.toLocaleString()+"원: "+g.players[winner].name+" 획득!");}});
        g.over=true;g.winner=g.players.slice().sort((a,b)=>b.money-a.money)[0].name;g.log.unshift("🏆 최종 승자: "+g.winner);
      }else if(next>=0)g.turn=next;else g.turn=(g.turn+1)%g.players.length;
    }else return;
    this.bgBroadcast();
  }
  async fetchBoardGame(request){
    if(request.headers.get("Upgrade")?.toLowerCase()!=="websocket")return json({ok:true,type:"BoardGameRoom"});
    const u=new URL(request.url),uid=String(u.searchParams.get("userId")||""),name=String(u.searchParams.get("username")||"하니"),code=String(u.searchParams.get("room")||"").toUpperCase();
    if(!uid||!code)return new Response("Missing boardgame identity",{status:400});
    await ensureBoardgameTables(this.env);
    const room=await this.env.DB.prepare("SELECT * FROM boardgame_rooms WHERE room_code=?").bind(code).first();
    if(!room)return new Response("Room not found",{status:404});
    const member=await this.env.DB.prepare("SELECT user_id,username FROM boardgame_room_players WHERE room_code=? AND user_id=?").bind(code,Number(uid)).first();
    if(!member)return new Response("Join the room first",{status:403});
    const max=room.game==="liar"?8:4;
    if(this.bgSockets.size>=max&&!Array.from(this.bgSockets.values()).some(p=>p.id===uid))return new Response("Room is full",{status:409});
    this.roomCode=code;this.bgGame=room.game;this.bgHostId=String(room.host_id);
    const pair=new WebSocketPair(),client=pair[0],server=pair[1];server.accept();
    this.bgSockets.set(server,{id:uid,name:String(member.username||name).slice(0,20)});
    server.addEventListener("message",e=>this.onBoardMessage(server,e.data));
    server.addEventListener("close",()=>this.onBoardClose(server));
    server.addEventListener("error",()=>this.onBoardClose(server));
    this.bgBroadcast();
    return new Response(null,{status:101,webSocket:client});
  }
  async onBoardMessage(ws,raw){
    const player=this.bgSockets.get(ws);if(!player)return;
    let d;try{d=JSON.parse(raw)}catch{return}
    if(d.type==="ready"){
      if(d.ready)this.bgReady.add(player.id);else this.bgReady.delete(player.id);
      this.bgBroadcast();return;
    }
    if(d.type==="chat"){
      const text=String(d.text||"").trim().slice(0,200);if(!text)return;
      this.bgChat.push({id:player.id,name:player.name,text,at:Date.now()});this.bgChat=this.bgChat.slice(-60);
      this.bgBroadcast();return;
    }
    if(d.type==="start"){
      if(player.id!==this.bgHostId)return;
      const people=Array.from(new Map(Array.from(this.bgSockets.values()).map(p=>[p.id,p])).values());
      if(this.bgGame==="liar"){
        if(people.length<3){this.bgSend(ws,{type:"notice",text:"라이어 게임은 최소 3명이 필요해요."});return;}
        const words=[["음식","김치찌개","된장찌개"],["동물","기린","코끼리"],["장소","놀이공원","워터파크"],["게임","오버워치","리그 오브 레전드"],["간식","붕어빵","호떡"],["교통","지하철","버스"],["가전","에어컨","선풍기"],["과일","수박","멜론"]];
        const w=words[Math.floor(Math.random()*words.length)],liar=people[Math.floor(Math.random()*people.length)];
        this.bgSecret={category:w[0],word:w[1],liarWord:w[2],liarId:liar.id,result:null};
        this.bgPhase="chat";this.bgVotes.clear();this.bgChat.push({id:"system",name:"시스템",text:"게임 시작! 제시어를 직접 말하지 말고 힌트를 나눠보세요.",at:Date.now()});
        await this.env.DB.prepare("UPDATE boardgame_rooms SET status='playing' WHERE room_code=?").bind(this.roomCode).run();
        this.bgBroadcast();return;
      }
      const minimum={wordchain:2,bang:4,tichu:4,rummikub:2,lasvegas:2}[this.bgGame]||2;
      if(people.length<minimum){this.bgSend(ws,{type:"notice",text:this.bgGame+" 게임은 최소 "+minimum+"명이 필요해요."});return;}
      this.bgGameState=this.bgCreateGameState(people);if(!this.bgGameState){this.bgSend(ws,{type:"notice",text:"이 게임은 온라인 플레이를 지원하지 않아요."});return;}
      this.bgPhase="playing";this.bgChat.push({id:"system",name:"시스템",text:"게임 시작! 차례와 패는 서버에서 동기화돼요.",at:Date.now()});
      await this.env.DB.prepare("UPDATE boardgame_rooms SET status='playing' WHERE room_code=?").bind(this.roomCode).run();this.bgBroadcast();return;
    }
    if(d.type==="vote_start"&&this.bgGame==="liar"&&this.bgSecret&&this.bgPhase==="chat"){
      this.bgPhase="vote";this.bgVotes.clear();this.bgChat.push({id:"system",name:"시스템",text:"토론 종료! 라이어를 투표해 주세요.",at:Date.now()});this.bgBroadcast();return;
    }
    if(d.type==="vote"&&this.bgGame==="liar"&&this.bgSecret&&this.bgPhase==="vote"){
      const target=String(d.target||"");if(!Array.from(this.bgSockets.values()).some(p=>p.id===target)||this.bgVotes.has(player.id))return;
      this.bgVotes.set(player.id,target);
      const online=Array.from(new Set(Array.from(this.bgSockets.values()).map(p=>p.id)));
      if(online.every(id=>this.bgVotes.has(id))){
        const counts={};for(const targetId of this.bgVotes.values())counts[targetId]=(counts[targetId]||0)+1;
        const max=Math.max(0,...Object.values(counts));const top=Object.keys(counts).filter(id=>counts[id]===max);
        const picked=top.length===1?top[0]:null;
        const pickedName=Array.from(this.bgSockets.values()).find(p=>p.id===picked)?.name||"동점";
        const liarName=Array.from(this.bgSockets.values()).find(p=>p.id===this.bgSecret.liarId)?.name||"나간 플레이어";
        this.bgSecret.result={winner:picked===this.bgSecret.liarId?"citizens":"liar",pickedId:picked,pickedName,liarId:this.bgSecret.liarId,liarName,word:this.bgSecret.word,liarWord:this.bgSecret.liarWord,votes:Array.from(this.bgVotes.entries()).map(([from,to])=>({from,to}))};
        this.bgPhase="result";this.bgChat.push({id:"system",name:"시스템",text:picked===this.bgSecret.liarId?"시민 팀 승리! 라이어를 찾았어요.":"라이어 승리! 정답을 피했어요.",at:Date.now()});
        await this.env.DB.prepare("UPDATE boardgame_rooms SET status='waiting' WHERE room_code=?").bind(this.roomCode).run();
      }
      this.bgBroadcast();return;
    }
    if(d.type==="action"){await this.bgHandleGameAction(player,d);return;}
  }
  bgBroadcastAction(d){for(const ws of this.bgSockets.keys())this.bgSend(ws,d)}
  async onBoardClose(ws){
    const p=this.bgSockets.get(ws);if(!p)return;this.bgSockets.delete(ws);this.bgReady.delete(p.id);
    if(this.bgSockets.size===0){this.bgPhase="lobby";this.bgSecret=null;this.bgVotes.clear();return;}
    this.bgBroadcast();
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
    "CREATE TABLE IF NOT EXISTS matching_profiles (user_id INTEGER PRIMARY KEY, gender TEXT NOT NULL CHECK(gender IN ('male','female')), group_nickname TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 0, verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE IF NOT EXISTS matching_code_attempts (user_id INTEGER PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, window_start TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE IF NOT EXISTS matching_hearts (from_user INTEGER NOT NULL, to_user INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(from_user,to_user))",
    "CREATE TABLE IF NOT EXISTS matching_matches (id INTEGER PRIMARY KEY AUTOINCREMENT, user_a INTEGER NOT NULL, user_b INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','ended')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, ended_at TEXT, UNIQUE(user_a,user_b))",
    "CREATE TABLE IF NOT EXISTS matching_blocks (blocker_id INTEGER NOT NULL, blocked_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(blocker_id,blocked_id))",
    "CREATE TABLE IF NOT EXISTS matching_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, match_id INTEGER NOT NULL, sender_id INTEGER NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE IF NOT EXISTS matching_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, reporter_id INTEGER NOT NULL, target_id INTEGER NOT NULL, match_id INTEGER, reason TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ];
  for (const sql of statements) await env.DB.prepare(sql).run();
  try { await env.DB.prepare("ALTER TABLE matching_profiles ADD COLUMN group_nickname TEXT NOT NULL DEFAULT ''").run(); } catch {}
  await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS matching_nickname_unique ON matching_profiles(group_nickname COLLATE NOCASE) WHERE group_nickname<>''").run();
}
async function matchingBlocked(env, a, b) {
  return !!(await env.DB.prepare("SELECT 1 FROM matching_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?) LIMIT 1").bind(a,b,b,a).first());
}
async function matchingState(env, user) {
  const profile = await env.DB.prepare("SELECT user_id,gender,group_nickname,active,verified_at,created_at FROM matching_profiles WHERE user_id=?").bind(user.id).first();
  if (!profile) return json({profile:null,people:[],matches:[]});
  const opposite = profile.gender === "male" ? "female" : "male";
  const peopleResult = profile.active ? await env.DB.prepare(
    "SELECT p.user_id AS id,p.gender,p.group_nickname AS username,p.active FROM matching_profiles p JOIN users u ON u.id=p.user_id WHERE p.active=1 AND p.gender=? AND p.user_id<>? AND NOT EXISTS (SELECT 1 FROM matching_blocks b WHERE (b.blocker_id=? AND b.blocked_id=p.user_id) OR (b.blocker_id=p.user_id AND b.blocked_id=?)) AND NOT EXISTS (SELECT 1 FROM matching_matches m WHERE m.user_a=MIN(?,p.user_id) AND m.user_b=MAX(?,p.user_id)) ORDER BY p.created_at DESC LIMIT 100"
  ).bind(opposite,user.id,user.id,user.id,user.id,user.id).all() : {results:[]};
  const likedResult = await env.DB.prepare("SELECT to_user FROM matching_hearts WHERE from_user=?").bind(user.id).all();
  const liked = new Set((likedResult.results||[]).map(r=>Number(r.to_user)));
  const people = (peopleResult.results||[]).map(p=>({id:Number(p.id),nickname:p.username,gender:p.gender,liked:liked.has(Number(p.id))}));
  const matchesResult = await env.DB.prepare(
    "SELECT m.id,m.status,m.created_at,m.ended_at,CASE WHEN m.user_a=? THEN m.user_b ELSE m.user_a END AS partner_id,COALESCE(p.group_nickname,u.username) AS nickname,p.gender FROM matching_matches m JOIN users u ON u.id=CASE WHEN m.user_a=? THEN m.user_b ELSE m.user_a END LEFT JOIN matching_profiles p ON p.user_id=u.id WHERE (m.user_a=? OR m.user_b=?) ORDER BY CASE WHEN m.status='active' THEN 0 ELSE 1 END,m.id DESC LIMIT 100"
  ).bind(user.id,user.id,user.id,user.id).all();
  const matches = [];
  for (const m of (matchesResult.results||[])) {
    if (await matchingBlocked(env,user.id,Number(m.partner_id))) continue;
    matches.push({id:Number(m.id),status:m.status,created_at:m.created_at,ended_at:m.ended_at,partnerId:Number(m.partner_id),nickname:m.nickname,gender:m.gender,canChat:m.status==="active"});
  }
  return json({profile:{gender:profile.gender,nickname:profile.group_nickname,active:Number(profile.active)===1,verifiedAt:profile.verified_at},people,matches});
}
async function matchingApi(request, env, user, url) {
  await ensureMatchingTables(env);
  const path = url.pathname;
  if (path === "/api/matching/state" && request.method === "GET") return matchingState(env,user);
  if (path === "/api/matching/setup" && request.method === "POST") {
    const body = await readJson(request);
    const gender = String(body.gender||"");
    const nickname = String(body.nickname||"").trim();
    if (gender!=="male" && gender!=="female") return json({error:"성별을 선택해 주세요."},400);
    if (nickname.length<2 || nickname.length>20) return json({error:"시무방에서 사용하는 닉네임을 2~20자로 입력해 주세요."},400);
    const duplicate = await env.DB.prepare("SELECT user_id FROM matching_profiles WHERE group_nickname=? COLLATE NOCASE AND user_id<>?").bind(nickname,user.id).first();
    if (duplicate) return json({error:"이미 매칭에 등록된 닉네임이에요. 시무방 닉네임을 확인해 주세요."},409);
    await env.DB.prepare("INSERT INTO matching_profiles(user_id,gender,group_nickname,active) VALUES(?,?,?,0) ON CONFLICT(user_id) DO NOTHING").bind(user.id,gender,nickname).run();
    const profile = await env.DB.prepare("SELECT gender,group_nickname FROM matching_profiles WHERE user_id=?").bind(user.id).first();
    if (profile.gender !== gender) return json({error:"등록된 성별은 변경할 수 없어요. 운영자에게 문의해 주세요."},409);
    if (profile.group_nickname !== nickname) return json({error:"등록된 닉네임은 변경할 수 없어요. 운영자에게 문의해 주세요."},409);
    return matchingState(env,user);
  }
  if (path === "/api/matching/profile" && request.method === "POST") {
    const body = await readJson(request);
    const profile = await env.DB.prepare("SELECT user_id FROM matching_profiles WHERE user_id=?").bind(user.id).first();
    if (!profile) return json({error:"먼저 매칭 프로필을 등록해 주세요."},400);
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
      return new Response("<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\"><meta name=\"theme-color\" content=\"#eef8ff\"><title>하니게임즈</title><link rel=\"stylesheet\" href=\"/style.css?v=20261023-7\"><style>html,body{margin:0;min-height:100%;background:#eef8ff;font-family:system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif}#boot{min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box}.card{width:min(420px,100%);box-sizing:border-box;background:#fff;border-radius:24px;padding:28px;box-shadow:0 12px 35px rgba(70,130,170,.15);text-align:center}.bunny{font-size:64px}.title{font-size:28px;font-weight:900;color:#4d7fae;margin:8px}.sub{color:#7890a3}button{width:100%;padding:14px;border:0;border-radius:12px;background:#69a9dc;color:#fff;font-weight:800;font-size:16px;margin-top:8px}</style></head><body><div id=\"boot\"><div class=\"card\"><div class=\"bunny\">🐰</div><div class=\"title\">하니게임즈</div><div class=\"sub\">하니게임즈를 불러오는 중이에요 💙</div></div></div><script>setTimeout(function(){var e=document.querySelector(\".sub\");if(e)e.textContent=\"하니게임즈 불러오는 중…\";},300);</script><script src=\"/app.js?v=20261026-7\"></script><script src=\"/boardgames.js?v=20261026-3\"></script><script src=\"/online-boardgames.js?v=20261026-4\"></script><script src=\"/matching.js?v=20261023-1\"></script><script src=\"/matching-admin.js?v=20261023-1\"></script><script src=\"/battle.js?v=20261022-2\"></script></body></html>", {
        headers: {
          "content-type": "text/html; charset=UTF-8",
          "cache-control": "no-store, no-cache, must-revalidate"
        }
      });
    }

    /* =========================
       HANI MATCHING ADMIN API
    ========================= */
    if (url.pathname === "/api/admin/matching/reports" && request.method === "GET") return adminMatchingReports(request, env);
    const adminReportMatch = url.pathname.match(/^\/api\/admin\/matching\/reports\/(\d+)$/);
    if (adminReportMatch && request.method === "POST") return adminMatchingReportUpdate(request, env, adminReportMatch[1]);
    if (url.pathname === "/api/admin/matching/members" && request.method === "GET") return adminMatchingMembers(request, env);
    const adminMemberMatch = url.pathname.match(/^\/api\/admin\/matching\/members\/(\d+)$/);
    if (adminMemberMatch && request.method === "POST") return adminMatchingMemberUpdate(request, env, adminMemberMatch[1]);

    /* =========================
       HANI MATCHING API
    ========================= */
    if (url.pathname.startsWith("/api/matching/")) {
      const user = await getMatchingUser(request, env);
      if (user?.error) return json({ error: user.error }, 503);
      if (!user) return json({ error: "보안 로그인이 필요해요. 로그아웃 후 다시 로그인해 주세요." }, 401);
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

      /* MULTIPLAYER BOARDGAME ROOMS */
      if (url.pathname === "/api/boardrooms") {
        return boardgameRooms(request, env, user);
      }
      const boardJoinMatch = url.pathname.match(/^\/api\/boardrooms\/([^/]+)\/join$/);
      if (boardJoinMatch && request.method === "POST") {
        return joinBoardgameRoom(request, env, user, boardJoinMatch[1].toUpperCase());
      }
      const boardWsMatch = url.pathname.match(/^\/api\/boardrooms\/([^/]+)\/ws$/);
      if (boardWsMatch && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
        const id = env.GameRoom.idFromName("boardgame:" + boardWsMatch[1].toUpperCase());
        const room = env.GameRoom.get(id);
        const wsUrl = new URL(request.url);
        wsUrl.searchParams.set("room", boardWsMatch[1].toUpperCase());
        wsUrl.searchParams.set("userId", String(user.id));
        wsUrl.searchParams.set("username", String(user.username || "하니"));
        wsUrl.searchParams.set("mode", "boardgame");
        return room.fetch(new Request(wsUrl.toString(), request));
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
