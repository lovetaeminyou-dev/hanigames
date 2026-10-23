
/* HANI MATCHING UI */
window.openMatching = async function () {
  try {
    const data = await api("/api/matching/state");
    window.__matchingState = data;
    matchingRender(data);
  } catch (e) {
    $("#app").innerHTML = shell('<section class="card match-panel"><h2>💗 하니 매칭</h2><p class="muted">' + esc(e.message || "매칭을 불러오지 못했어요.") + '</p><button class="secondary" onclick="window.openMatching()">다시 시도</button></section>');
  }
};
function matchingRender(data) {
  const profile = data.profile;
  let body = '<div class="section-title">💗 하니 매칭</div><div class="section-sub">서로 하트를 보내면 둘만의 채팅이 열려요. 하트는 서로 마음이 통하기 전까지 비공개예요.</div>';
  if (!profile) {
    body += '<section class="card match-panel"><div class="match-hero">💌</div><h2>BBW 시무방 회원 전용</h2><p class="muted">성별과 단톡방에서 실제 사용하는 기존 닉네임만 등록하면 돼요. 사진이나 자기소개는 필요 없어요.</p><div class="field"><label for="match-nickname">시무방에서 사용하는 닉네임</label><input id="match-nickname" maxlength="20" autocomplete="off" placeholder="새 닉네임이 아닌 기존 단톡 닉네임"></div><div class="field"><label for="match-gender">내 성별</label><select id="match-gender"><option value="">선택해 주세요</option><option value="female">여자</option><option value="male">남자</option></select></div><button class="primary full" onclick="window.matchingSetup()">등록하고 시작하기 💗</button><p class="match-note">매칭 프로필은 매칭 기능 안에서만 사용돼요. 시무방 닉네임을 정확히 입력해 주세요.</p></section>';
    $("#app").innerHTML = shell(body);
    return;
  }
  body += '<section class="card match-toggle"><div><b>내 매칭 프로필</b><p class="muted">닉네임: ' + esc(profile.nickname || S.user?.username || "") + ' · 성별: ' + (profile.gender === "female" ? "여자" : "남자") + '</p><small>' + (profile.active ? "현재 다른 회원에게 프로필이 보여요." : "참여를 켜야 다른 회원에게 보여요.") + '</small></div><button class="' + (profile.active ? "secondary" : "primary") + '" onclick="window.matchingToggle(' + (!profile.active) + ')">' + (profile.active ? "참여 끄기" : "매칭 참여하기") + '</button></section>';
  body += '<div class="section-title">💕 새로운 인연</div><div class="section-sub">이성 회원만 표시돼요. 상대의 하트 여부나 하트 개수는 공개되지 않아요.</div>';
  if (!profile.active) {
    body += '<section class="card match-empty"><div>🌙</div><b>매칭 참여가 꺼져 있어요</b><p class="muted">참여를 켜면 다른 회원을 둘러볼 수 있어요.</p></section>';
  } else if (!data.people?.length) {
    body += '<section class="card match-empty"><div>🌷</div><b>아직 새로운 회원이 없어요</b><p class="muted">매칭 참여 중인 회원이 생기면 여기에 보여요.</p></section>';
  } else {
    body += '<div class="match-people">' + data.people.map(p => '<article class="card match-person"><div class="match-avatar">' + (p.gender === "female" ? "🌷" : "🌿") + '</div><div class="match-person-name">' + esc(p.nickname) + '</div><div class="match-person-gender">' + (p.gender === "female" ? "여자" : "남자") + '</div><button class="' + (p.liked ? "secondary" : "primary") + ' full" ' + (p.liked ? "disabled" : "") + ' onclick="window.matchingHeart(' + p.id + ')">' + (p.liked ? "❤️ 하트 보냄" : "❤️ 호감 보내기") + '</button><button class="match-report-link" onclick="window.matchingReport(' + p.id + ',0)">신고</button></article>').join("") + '</div>';
  }
  body += '<div class="section-title">💞 내 매칭</div>';
  if (!data.matches?.length) body += '<section class="card match-empty"><div>💌</div><b>아직 매칭이 없어요</b><p class="muted">서로 하트를 보내면 이곳에 채팅방이 생겨요.</p></section>';
  else body += '<div class="match-list">' + data.matches.map(m => '<article class="card match-row"><div class="match-avatar small">' + (m.gender === "female" ? "🌷" : "🌿") + '</div><div class="match-row-info"><b>' + esc(m.nickname) + '</b><small>' + (m.status === "active" ? "서로 호감이 통했어요 💗" : "매칭 해제 · 기존 대화 읽기 전용") + '</small></div><button class="secondary" onclick="window.matchingChat(' + m.id + ')">채팅</button>' + (m.status === "active" ? '<button class="match-more" onclick="window.matchingEnd(' + m.id + ')">해제</button>' : '') + '<button class="match-report-link" onclick="window.matchingReport(' + m.partnerId + ',' + m.id + ')">신고</button></article>').join("") + '</div>';
  $("#app").innerHTML = shell(body);
}
window.matchingSetup = async function () {
  try {
    const gender = document.querySelector("#match-gender")?.value || "";
    const nickname = document.querySelector("#match-nickname")?.value?.trim() || "";
    const data = await api("/api/matching/setup", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({gender,nickname})});
    window.__matchingState = data;
    toast("매칭 프로필 등록이 완료됐어요 💗");
    matchingRender(data);
  } catch (e) { toast(e.message || "인증에 실패했어요."); }
};
window.matchingToggle = async function (active) {
  try {
    const data = await api("/api/matching/profile", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({active})});
    window.__matchingState = data;
    matchingRender(data);
    toast(active ? "매칭 참여를 시작했어요 💗" : "새로운 프로필 노출을 멈췄어요.");
  } catch (e) { toast(e.message || "설정을 바꾸지 못했어요."); }
};
window.matchingHeart = async function (targetId) {
  try {
    const data = await api("/api/matching/heart", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({targetId})});
    toast(data.message || "하트를 보냈어요 💗");
    await window.openMatching();
  } catch (e) { toast(e.message || "하트를 보내지 못했어요."); }
};
window.matchingChat = async function (matchId) {
  try {
    const data = await api("/api/matching/matches/" + matchId + "/messages");
    const current = window.__matchingState?.matches?.find(m => Number(m.id) === Number(matchId));
    const title = current?.nickname || "매칭 채팅";
    const messages = data.messages || [];
    let body = '<div class="match-chat-head"><button class="secondary" onclick="window.openMatching()">← 매칭 목록</button><div><b>💗 ' + esc(title) + '</b><small>' + (data.readOnly ? "매칭 해제 · 읽기 전용" : "둘만의 비공개 대화") + '</small></div><button class="secondary" onclick="window.matchingChat(' + matchId + ')">새로고침</button></div><section class="card match-chat">';
    body += messages.length ? messages.map(m => '<div class="match-message ' + (m.mine ? "mine" : "theirs") + '"><div>' + esc(m.body) + '</div><small>' + esc(m.created_at || "") + '</small></div>').join("") : '<p class="muted center">첫 메시지를 보내 보세요 💌</p>';
    body += '</section>';
    if (!data.readOnly) body += '<form class="match-compose" onsubmit="window.matchingSend(event,' + matchId + ')"><input id="match-message" maxlength="1000" placeholder="메시지를 입력해 주세요" autocomplete="off"><button class="primary" type="submit">전송</button></form>';
    else body += '<p class="match-note">매칭이 해제되어 새 메시지는 보낼 수 없어요. 이전 대화는 계속 읽을 수 있어요.</p>';
    body += '<div class="match-chat-actions"><button class="secondary" onclick="window.matchingReport(' + (current?.partnerId || 0) + ',' + matchId + ')">신고하기</button><button class="secondary" onclick="window.matchingBlock(' + (current?.partnerId || 0) + ')">차단하기</button></div>';
    $("#app").innerHTML = shell('<div class="section-title">채팅</div>' + body);
    const chat = document.querySelector(".match-chat");
    if (chat) chat.scrollTop = chat.scrollHeight;
  } catch (e) { toast(e.message || "채팅을 불러오지 못했어요."); }
};
window.matchingSend = async function (event, matchId) {
  event.preventDefault();
  const input = document.querySelector("#match-message");
  const message = input?.value?.trim() || "";
  if (!message) return;
  try {
    await api("/api/matching/matches/" + matchId + "/messages", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message})});
    await window.matchingChat(matchId);
  } catch (e) { toast(e.message || "메시지를 보내지 못했어요."); }
};
window.matchingEnd = async function (matchId) {
  if (!confirm("매칭을 해제할까요? 기존 대화는 읽을 수 있지만 새 메시지는 보낼 수 없고, 다시 매칭할 수 없어요.")) return;
  try {
    const data = await api("/api/matching/matches/" + matchId + "/end", {method:"POST"});
    toast(data.message || "매칭을 해제했어요.");
    await window.openMatching();
  } catch (e) { toast(e.message || "매칭을 해제하지 못했어요."); }
};
window.matchingBlock = async function (targetId) {
  if (!targetId || !confirm("이 회원을 차단할까요? 서로의 매칭 목록과 연락이 제한돼요.")) return;
  try {
    const data = await api("/api/matching/block", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({targetId})});
    toast(data.message || "차단했어요.");
    await window.openMatching();
  } catch (e) { toast(e.message || "차단하지 못했어요."); }
};
window.matchingReport = async function (targetId, matchId) {
  if (!targetId) { toast("신고할 회원을 찾을 수 없어요."); return; }
  const reason = prompt("신고 사유를 입력해 주세요. (예: 괴롭힘, 사칭, 부적절한 메시지)");
  if (!reason || !reason.trim()) return;
  const details = prompt("추가 설명이 있다면 입력해 주세요. (선택)") || "";
  try {
    const data = await api("/api/matching/report", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({targetId,matchId,reason:reason.trim(),details})});
    toast(data.message || "신고가 접수됐어요.");
  } catch (e) { toast(e.message || "신고를 접수하지 못했어요."); }
};
