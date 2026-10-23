
/* HANI MATCHING ADMIN UI */
window.openMatchingAdmin = async function () {
  if (S.user?.role !== "admin") {
    $("#app").innerHTML = shell('<section class="card match-panel"><h2>🛡️ 매칭 관리</h2><p>관리자 계정으로 로그인해 주세요.</p></section>');
    return;
  }
  window.__matchingAdminTab = window.__matchingAdminTab || "reports";
  await matchingAdminRender();
};
async function matchingAdminRender() {
  const tab = window.__matchingAdminTab || "reports";
  $("#app").innerHTML = shell('<div class="section-title">🛡️ 하니 매칭 관리</div><div class="section-sub">신고 내용을 검토하고 매칭 회원의 참여 상태를 관리해요.</div><div class="match-admin-tabs"><button class="'+(tab==="reports"?"primary":"secondary")+'" onclick="window.matchingAdminTab(\'reports\')">신고 관리</button><button class="'+(tab==="members"?"primary":"secondary")+'" onclick="window.matchingAdminTab(\'members\')">회원 관리</button></div><section class="card match-admin-loading">불러오는 중…</section>');
  try {
    if (tab === "reports") {
      const data = await api("/api/admin/matching/reports");
      const reports = data.reports || [];
      const pending = reports.filter(r=>r.status==="pending").length;
      let html = '<div class="match-admin-summary"><div><b>'+pending+'</b><small>미처리 신고</small></div><div><b>'+reports.length+'</b><small>최근 신고 기록</small></div></div>';
      if (!reports.length) html += '<section class="card match-empty"><div>🌷</div><b>접수된 신고가 없어요</b></section>';
      else html += '<div class="match-admin-list">'+reports.map(r=>{
        const statusNames={pending:"미처리",reviewed:"검토 완료",actioned:"조치 완료",dismissed:"기각"};
        return '<article class="card match-admin-report"><div class="match-admin-report-top"><b>#'+r.id+' · '+esc(r.reason)+'</b><span class="match-status '+esc(r.status)+'">'+(statusNames[r.status]||esc(r.status))+'</span></div><div class="match-admin-meta">신고자: '+esc(r.reporter_nickname||("회원 "+r.reporter_id))+' · 대상: '+esc(r.target_nickname||("회원 "+r.target_id))+' · '+esc(r.created_at||"")+'</div>'+(r.details?'<p class="match-admin-details">'+esc(r.details)+'</p>':'<p class="match-admin-details muted">추가 설명 없음</p>')+'<div class="match-admin-actions"><button class="secondary" onclick="window.matchingAdminStatus('+r.id+',\'reviewed\')">검토 완료</button><button class="secondary" onclick="window.matchingAdminStatus('+r.id+',\'dismissed\')">기각</button><button class="primary" onclick="window.matchingAdminStatus('+r.id+',\'actioned\',true)">조치 완료 + 매칭 중지</button></div></article>';
      }).join("")+'</div>';
      $("#app").innerHTML = shell('<div class="section-title">🛡️ 하니 매칭 관리</div><div class="section-sub">신고 내용을 검토하고 매칭 회원의 참여 상태를 관리해요.</div><div class="match-admin-tabs"><button class="primary" onclick="window.matchingAdminTab(\'reports\')">신고 관리</button><button class="secondary" onclick="window.matchingAdminTab(\'members\')">회원 관리</button></div>'+html);
    } else {
      const data = await api("/api/admin/matching/members");
      const members = data.members || [];
      let html = '<div class="match-admin-summary"><div><b>'+members.length+'</b><small>등록 회원</small></div><div><b>'+members.filter(m=>Number(m.active)===1).length+'</b><small>매칭 참여 중</small></div></div>';
      if (!members.length) html += '<section class="card match-empty"><div>🌷</div><b>등록된 회원이 없어요</b></section>';
      else html += '<div class="match-admin-list">'+members.map(m=>'<article class="card match-admin-member"><div class="match-admin-member-main"><div class="match-avatar small">'+(m.gender==="female"?"🌷":"🌿")+'</div><div><b>'+esc(m.group_nickname||("회원 "+m.user_id))+'</b><small>회원 ID '+m.user_id+' · '+(m.gender==="female"?"여자":"남자")+'</small><small>미처리 신고 '+Number(m.pending_reports||0)+'건 · 등록 '+esc(m.created_at||"")+'</small></div></div><div class="match-admin-actions"><span class="match-status '+(Number(m.active)===1?"active":"inactive")+'">'+(Number(m.active)===1?"참여 중":"참여 중지")+'</span><button class="'+(Number(m.active)===1?"secondary":"primary")+'" onclick="window.matchingAdminMember('+m.user_id+','+(Number(m.active)!==1)+')">'+(Number(m.active)===1?"참여 중지":"참여 허용")+'</button></div></article>').join("")+'</div>';
      $("#app").innerHTML = shell('<div class="section-title">🛡️ 하니 매칭 관리</div><div class="section-sub">신고 내용을 검토하고 매칭 회원의 참여 상태를 관리해요.</div><div class="match-admin-tabs"><button class="secondary" onclick="window.matchingAdminTab(\'reports\')">신고 관리</button><button class="primary" onclick="window.matchingAdminTab(\'members\')">회원 관리</button></div>'+html);
    }
  } catch (e) {
    $("#app").innerHTML = shell('<div class="section-title">🛡️ 하니 매칭 관리</div><section class="card match-panel"><p>'+esc(e.message||"관리 정보를 불러오지 못했어요.")+'</p><button class="secondary" onclick="window.openMatchingAdmin()">다시 시도</button></section>');
  }
}
window.matchingAdminTab = async function(tab) { window.__matchingAdminTab=tab; await matchingAdminRender(); };
window.matchingAdminStatus = async function(id,status,disableMatching=false) {
  const label = {reviewed:"검토 완료",dismissed:"기각",actioned:"조치 완료"}[status]||status;
  if (!confirm(disableMatching ? "신고를 조치 완료로 바꾸고 해당 회원의 매칭 참여를 중지할까요?" : "이 신고를 '"+label+"' 상태로 변경할까요?")) return;
  try {
    const data = await api("/api/admin/matching/reports/"+id,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status,disableMatching})});
    toast(data.message||"처리 상태를 저장했어요.");
    await matchingAdminRender();
  } catch(e) { toast(e.message||"저장하지 못했어요."); }
};
window.matchingAdminMember = async function(id,active) {
  if (!confirm(active?"이 회원의 매칭 참여를 허용할까요?":"이 회원의 매칭 참여를 중지할까요?")) return;
  try {
    const data = await api("/api/admin/matching/members/"+id,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({active})});
    toast(data.message||"회원 상태를 저장했어요.");
    await matchingAdminRender();
  } catch(e) { toast(e.message||"회원 상태를 저장하지 못했어요."); }
};
