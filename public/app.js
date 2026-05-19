// Static seed data keeps the local prototype useful without a database.
const data = {
  totals: {
    estimated: "₩8,420,000",
    confirmed: "₩5,860,000",
    pending: "₩2,560,000",
    month: "₩1,240,000",
    developers: "1,284명",
    waitTime: "8,940시간",
    conversion: "72%",
  },
  user: {
    name: "김현우",
    estimated: "₩42,800",
    confirmed: "₩31,400",
    pending: "₩11,400",
    month: "₩12,600",
    waitTime: "38시간 20분",
    rank: "42위",
    target: "vitejs/vite",
    streak: "7일",
  },
  contributors: [
    ["min.dev", "₩184,200", "142시간"],
    ["hyunwoo", "₩167,500", "128시간"],
    ["soyoung.js", "₩151,300", "119시간"],
    ["backend-kim", "₩138,900", "104시간"],
    ["openlee", "₩122,400", "97시간"],
  ],
  rooms: [
    {
      id: "vite-sprint",
      title: "Vite 생태계 후원방",
      target: "vitejs/vite",
      raised: "₩312,400",
      goal: "₩500,000",
      members: "18명",
      my: "₩24,800",
      rank: "3위",
      progress: 62,
    },
    {
      id: "ai-safety-lab",
      title: "AI 안전 연구 후원방",
      target: "공익 AI 연구",
      raised: "₩184,900",
      goal: "₩300,000",
      members: "11명",
      my: "₩8,700",
      rank: "6위",
      progress: 61,
    },
    {
      id: "junior-dev",
      title: "주니어 개발자 교육방",
      target: "개발자 교육",
      raised: "₩96,200",
      goal: "₩200,000",
      members: "9명",
      my: "₩6,200",
      rank: "5위",
      progress: 48,
    },
  ],
  targets: [
    ["vitejs/vite", "오픈소스", "₩220,000"],
    ["React Korea", "커뮤니티", "₩192,000"],
    ["AI Safety Research", "연구", "₩180,000"],
    ["Junior Dev School", "교육", "₩153,000"],
    ["Public Tech Lab", "공익 기술", "₩129,000"],
  ],
  activities: [
    ["Codex 대기 14분", "+₩240", "방금"],
    ["Vite 후원방 참여", "3위", "오늘"],
    ["7일 연속 사용", "배지 획득", "어제"],
    ["정산 확정", "₩31,400", "2일 전"],
  ],
};

// Client-side route table. The local server sends every product route to this shell.
const routes = {
  "/home/": renderHome,
  "/dashboard/": renderDashboard,
  "/leaderboard/": renderLeaderboard,
  "/rooms/": renderRooms,
  "/rooms/new/": renderNewRoom,
  "/rooms/vite-sprint/": renderRoomDetail,
  "/targets/": renderTargets,
  "/settings/": renderSettings,
  "/admin/": renderAdmin,
  "/login/": renderLogin,
};

const protectedRoutes = new Set(["/dashboard/", "/rooms/new/", "/settings/"]);
const adminRoutes = new Set(["/admin/"]);
const supabaseSettings = window.WAITLY_SUPABASE || {};
let supabaseClientPromise;

// Supabase is optional; without config, auth falls back to the local pilot API.
function hasSupabaseConfig() {
  return Boolean(String(supabaseSettings.url || "").trim() && String(supabaseSettings.anonKey || "").trim());
}

// The Supabase browser bundle is loaded lazily so the offline local prototype still starts.
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      if (window.supabase) resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function getSupabaseClient() {
  if (!hasSupabaseConfig()) return null;
  if (!supabaseClientPromise) {
    supabaseClientPromise = loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2").then(() =>
      window.supabase.createClient(supabaseSettings.url, supabaseSettings.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }),
    );
  }
  return supabaseClientPromise;
}

// Normalizes API calls into a single result shape instead of throwing into render code.
async function callPilotApi(path, { method = "GET", body } = {}) {
  const options = {
    method,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
  };

  if (body) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(path, options);
    const payload = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      status: response.status,
      body: payload,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: { error: "network_error", message: error.message },
    };
  }
}

async function signInWithGoogle() {
  const message = document.querySelector("[data-auth-message]");
  const button = document.querySelector("[data-google-login]");
  if (!hasSupabaseConfig()) {
    if (message) message.textContent = "Supabase URL과 anon key를 먼저 넣어야 합니다.";
    return;
  }

  if (button) button.disabled = true;
  if (message) message.textContent = "Google 로그인으로 이동합니다.";

  const client = await getSupabaseClient();
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: new URL(loginRedirectPath(), window.location.origin).href,
      scopes: "openid email",
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    if (message) message.textContent = error.message;
    if (button) button.disabled = false;
    return;
  }

  if (data?.url) {
    window.location.assign(data.url);
    return;
  }

  if (message) message.textContent = "Google 로그인 URL을 만들지 못했습니다.";
  if (button) button.disabled = false;
}

async function signInWithPilot(event) {
  event?.preventDefault();

  const form = document.querySelector("[data-pilot-login-form]");
  const message = document.querySelector("[data-auth-message]");
  const button = document.querySelector("[data-pilot-login]");
  const email = String(form?.querySelector("[name='email']")?.value || "").trim().toLowerCase();
  const displayName = String(form?.querySelector("[name='displayName']")?.value || "").trim();

  if (!email) {
    if (message) message.textContent = "이메일을 입력하세요.";
    return;
  }

  if (button) button.disabled = true;
  if (message) message.textContent = "파일럿 계정 세션을 만드는 중입니다.";

  const signup = await callPilotApi("/v1/auth/signup", {
    method: "POST",
    body: {
      email,
      displayName: displayName || email.split("@")[0],
    },
  });

  if (!signup.ok) {
    // Existing pilot users can log in through the fallback path.
    const fallback = await callPilotApi("/v1/auth/login", {
      method: "POST",
      body: { email },
    });

    if (!fallback.ok) {
      if (message) message.textContent = "로그인에 실패했습니다. 로컬 웹 서버 상태를 확인하세요.";
      if (button) button.disabled = false;
      return;
    }
  }

  if (message) message.textContent = "로그인되었습니다.";
  window.location.href = loginRedirectPath();
}

async function signOut() {
  const client = await getSupabaseClient().catch(() => null);
  if (client) {
    await client.auth.signOut();
  } else {
    await callPilotApi("/v1/auth/logout", { method: "POST" });
  }
  window.location.href = "/home/";
}

async function signOutPilot() {
  await callPilotApi("/v1/auth/logout", { method: "POST" });
  window.location.href = "/admin/";
}

async function signInWithAdmin(event) {
  event?.preventDefault();
  const form = document.querySelector("[data-admin-login-form]");
  const message = document.querySelector("[data-admin-message]");
  const button = document.querySelector("[data-admin-login]");
  const email = String(form?.querySelector("[name='email']")?.value || "admin@waitly.local").trim().toLowerCase();

  if (button) button.disabled = true;
  if (message) message.textContent = "관리자 세션을 여는 중입니다.";

  const signup = await callPilotApi("/v1/auth/signup", {
    method: "POST",
    body: {
      email,
      displayName: "Waitly Admin",
    },
  });

  if (!signup.ok) {
    const fallback = await callPilotApi("/v1/auth/login", {
      method: "POST",
      body: { email },
    });
    if (!fallback.ok) {
      if (message) message.textContent = "관리자 로그인에 실패했습니다.";
      if (button) button.disabled = false;
      return;
    }
  }

  window.location.href = "/admin/";
}

async function getCurrentUser() {
  // Prefer Supabase when configured; otherwise use the local file-backed session.
  const client = await getSupabaseClient().catch(() => null);
  if (client) {
    const { data, error } = await client.auth.getSession();
    if (error) return null;
    return data.session?.user || null;
  }

  const session = await callPilotApi("/v1/session");
  if (!session.ok || !session.body.signedIn) return null;
  return session.body.user || null;
}

async function getPilotUser() {
  const session = await callPilotApi("/v1/session");
  if (!session.ok || !session.body.signedIn) return null;
  return session.body.user || null;
}

async function updateAuthUi(currentUser = null) {
  const action = document.querySelector(".top-actions");
  if (!action) return;

  const user = currentUser || (await getCurrentUser());
  if (!user) {
    action.innerHTML = `<a class="button" href="/login/">로그인</a>`;
    return;
  }

  const name = displayName(user);
  action.innerHTML = `<button class="user-button" type="button" data-sign-out><span>${name}</span><small>로그아웃</small></button>`;
  action.querySelector("[data-sign-out]")?.addEventListener("click", currentPath() === "/admin/" ? signOutPilot : signOut);
}

function displayName(user) {
  return user?.displayName || user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email || "사용자";
}

function loginRedirectPath() {
  const next = new URLSearchParams(location.search).get("next");
  // Only accept same-origin relative redirects to avoid open redirect behavior.
  if (
    next &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    next !== "/home/" &&
    next !== "/login/"
  ) {
    return next;
  }
  return "/dashboard/";
}

function currentPath() {
  if (location.pathname === "/") return "/home/";
  return location.pathname.endsWith("/") ? location.pathname : `${location.pathname}/`;
}

// Small template helpers keep the page renderers focused on product content.
function stat(label, value, note = "") {
  return `<article class="stat">
    <span>${label}</span>
    <strong>${value}</strong>
    ${note ? `<small>${note}</small>` : ""}
  </article>`;
}

function progressBar(value) {
  return `<div class="progress"><span style="width:${value}%"></span></div>`;
}

function tableRows(items) {
  return items
    .map(
      (item, index) => `<div class="table-row">
        <span class="rank">${index + 1}</span>
        <div>
          <strong>${item[0]}</strong>
          <small>${item[2]}</small>
        </div>
        <b>${item[1]}</b>
      </div>`,
    )
    .join("");
}

function roomCard(room) {
  return `<article class="room-card">
    <div class="room-head">
      <div>
        <h3>${room.title}</h3>
        <p>${room.target}</p>
      </div>
      <span>${room.progress}%</span>
    </div>
    ${progressBar(room.progress)}
    <div class="room-meta">
      <b>${room.raised}</b>
      <span>${room.goal}</span>
      <span>${room.members}</span>
    </div>
    <a class="text-link" href="/rooms/${room.id}/">방 보기</a>
  </article>`;
}

function layout(title, subtitle, content, aside = "") {
  // Every product page uses the same hero + right rail structure.
  return `<section class="page-grid">
    <div class="main-flow">
      <section class="hero">
        <img class="hero-symbol" src="/assets/waitly-symbol-clean.png" alt="" aria-hidden="true">
        <p class="eyebrow">WAITLY IMPACT</p>
        <h1>${title}</h1>
        <p>${subtitle}</p>
      </section>
      ${content}
    </div>
    <aside class="side-rail">
      ${aside || renderImpactRail()}
    </aside>
  </section>`;
}

function renderImpactRail() {
  return `<section class="rail-card dark">
    <span>전체 예상 후원금</span>
    <strong>${data.totals.estimated}</strong>
    <p>AI가 일하는 대기 시간에서 만든 금액입니다.</p>
  </section>
  <section class="rail-card">
    <span>정산 상태</span>
    <div class="split">
      <b>확정</b><strong>${data.totals.confirmed}</strong>
    </div>
    <div class="split">
      <b>대기</b><strong>${data.totals.pending}</strong>
    </div>
  </section>
  <section class="rail-card">
    <span>인기 후원방</span>
    ${data.rooms.slice(0, 2).map((room) => `<a class="mini-room" href="/rooms/${room.id}/"><b>${room.title}</b><small>${room.raised}</small></a>`).join("")}
  </section>`;
}

function renderHome() {
  return layout(
    "대기 시간이 후원이 됩니다",
    "전체 후원금, 참여자, 인기 후원방을 한 화면에서 봅니다.",
    `<section class="stat-grid">
      ${stat("확정 후원금", data.totals.confirmed, "정산 완료")}
      ${stat("이번 달", data.totals.month, "진행 중")}
      ${stat("참여 개발자", data.totals.developers, "+214")}
      ${stat("AI 대기 시간", data.totals.waitTime, "누적")}
    </section>
    <section class="panel wide">
      <div class="section-head">
        <div><h2>이번 달 흐름</h2><p>대기 시간과 후원금이 같이 쌓입니다.</p></div>
        <span class="chip">Live</span>
      </div>
      <div class="impact-chart" aria-label="이번 달 후원 추이">
        <i style="height:34%"></i><i style="height:48%"></i><i style="height:42%"></i><i style="height:68%"></i><i style="height:74%"></i><i style="height:92%"></i>
      </div>
    </section>
    <section class="two-col">
      <div class="panel">
        <div class="section-head"><div><h2>기여 랭킹</h2><p>개발 대기 시간 기준입니다.</p></div></div>
        ${tableRows(data.contributors.slice(0, 4))}
      </div>
      <div class="panel">
        <div class="section-head"><div><h2>공개 후원방</h2><p>목표가 있는 팀 단위 후원입니다.</p></div></div>
        <div class="room-stack">${data.rooms.slice(0, 2).map(roomCard).join("")}</div>
      </div>
    </section>`,
  );
}

function renderDashboard(user) {
  const userName = displayName(user) || data.user.name;
  const aside = `<section class="rail-card dark"><span>내 이번 달 기여</span><strong>${data.user.month}</strong><p>${data.user.rank} · ${data.user.streak} 연속</p></section>
  <section class="rail-card"><span>선택한 후원 대상</span><h3>${data.user.target}</h3><p>대기 시간 광고 수익이 이 대상으로 쌓입니다.</p></section>`;

  return layout(
    `${userName}님의 대시보드`,
    "내가 만든 금액과 대기 시간을 먼저 보여줍니다. 설명은 최소화했습니다.",
    `<section class="stat-grid">
      ${stat("내 예상 후원금", data.user.estimated, "광고 이벤트 기준")}
      ${stat("확정 후원금", data.user.confirmed, "정산 완료")}
      ${stat("AI 대기 시간", data.user.waitTime, "이번 달")}
      ${stat("내 순위", data.user.rank, "개인 기여")}
    </section>
    <section class="two-col">
      <div class="panel">
        <div class="section-head"><div><h2>후원금 상태</h2><p>예상, 확정, 대기 금액을 나눠 봅니다.</p></div></div>
        <div class="settlement">
          <div><span>예상</span><b>${data.user.estimated}</b></div>
          <div><span>확정</span><b>${data.user.confirmed}</b></div>
          <div><span>대기</span><b>${data.user.pending}</b></div>
        </div>
      </div>
      <div class="panel">
        <div class="section-head"><div><h2>최근 활동</h2><p>중요한 기록만 남깁니다.</p></div></div>
        ${tableRows(data.activities.slice(0, 4))}
      </div>
    </section>
    <section class="panel wide">
      <div class="section-head"><div><h2>참여 중인 후원방</h2><p>내 기여 ${data.rooms[0].my} · 방 순위 ${data.rooms[0].rank}</p></div></div>
      ${roomCard(data.rooms[0])}
    </section>`,
    aside,
  );
}

function renderLeaderboard() {
  return layout(
    "많이 개발한 사람이 더 많이 기여합니다",
    "이 랭킹은 광고 클릭 경쟁이 아닙니다. AI 대기 시간과 후원금 기준입니다.",
    `<div class="tabs"><button class="active">개인</button><button>후원방</button><button>프로젝트</button></div>
    <section class="two-col">
      <div class="panel"><div class="section-head"><div><h2>후원금 TOP 5</h2><p>이번 달 기준</p></div></div>${tableRows(data.contributors)}</div>
      <div class="panel"><div class="section-head"><div><h2>대기 시간 TOP 5</h2><p>AI 작업 시간 기준</p></div></div>${tableRows(data.contributors.map((c) => [c[0], c[2], c[1]]))}</div>
    </section>`,
  );
}

function renderRooms() {
  return layout(
    "후원방",
    "팀, 커뮤니티, 프로젝트 단위로 목표를 만들고 함께 채웁니다.",
    `<section class="panel wide">
      <div class="section-head"><div><h2>공개 후원방</h2><p>진행 중인 목표입니다.</p></div><a class="button" href="/rooms/new/">방 만들기</a></div>
      <div class="room-grid">${data.rooms.map(roomCard).join("")}</div>
    </section>`,
  );
}

function renderRoomDetail() {
  const room = data.rooms[0];
  return layout(
    room.title,
    `${room.target}에 함께 기여하는 공개 후원방입니다.`,
    `<section class="stat-grid">
      ${stat("누적 후원금", room.raised, `${room.goal} 목표`)}
      ${stat("달성률", `${room.progress}%`, "이번 달")}
      ${stat("참여자", room.members, "초대 링크")}
      ${stat("내 기여", room.my, room.rank)}
    </section>
    <section class="two-col">
      <div class="panel"><div class="section-head"><div><h2>멤버 순위</h2><p>대기 시간 기준입니다.</p></div></div>${tableRows(data.contributors)}</div>
      <div class="panel"><div class="section-head"><div><h2>공유 링크</h2><p>팀에 공유할 주소입니다.</p></div></div><div class="copy-box">https://waitly.dev/rooms/${room.id}</div></div>
    </section>`,
  );
}

function renderNewRoom() {
  return layout(
    "후원방 만들기",
    "이 화면은 MVP용 UI입니다. 백엔드는 나중에 붙입니다.",
    `<section class="two-col">
      <form class="panel form">
        <label>방 이름<input value="우리 팀 오픈소스 후원방"></label>
        <label>후원 대상<select><option>vitejs/vite</option><option>AI Safety Research</option><option>Junior Dev School</option></select></label>
        <label>목표 금액<input value="500000"></label>
        <label>종료일<input value="2026-05-31"></label>
        <button class="button" type="button">방 만들기</button>
      </form>
      <div class="panel">${roomCard(data.rooms[0])}</div>
    </section>`,
  );
}

function renderTargets() {
  return layout(
    "후원 대상 선택",
    "오픈소스, 연구, 교육, 공익 기술 중에서 고릅니다.",
    `<section class="target-grid">${data.targets
      .map((target) => `<article class="target-card"><span>${target[1]}</span><h3>${target[0]}</h3><b>${target[2]}</b><button class="button secondary">선택</button></article>`)
      .join("")}</section>`,
  );
}

function renderSettings() {
  return layout(
    "설정",
    "광고 표시 방식과 개인정보 원칙을 관리합니다.",
    `<section class="two-col">
      <div class="panel"><div class="section-head"><div><h2>광고 표시</h2><p>AI 대기 시간에만 표시합니다.</p></div></div><div class="copy-box">오른쪽 사이드 패널 · 대기 중만 표시</div></div>
      <div class="panel"><div class="section-head"><div><h2>개인정보</h2><p>코드와 프롬프트 원문은 수집하지 않습니다.</p></div></div><div class="copy-box">수집: 대기 시간, 광고 이벤트, 후원 대상</div></div>
    </section>`,
  );
}

function renderAdmin(user) {
  const aside = `<section class="rail-card dark">
    <span>운영자</span>
    <strong>${displayName(user)}</strong>
    <p>승인된 스폰서, 승인된 소재, active 캠페인만 광고 로더에 반영됩니다.</p>
  </section>
  <section class="rail-card">
    <span>테스트 계정</span>
    <p>로컬 관리자 기본 이메일은 admin@waitly.local 입니다.</p>
  </section>`;

  return layout(
    "광고 운영 콘솔",
    "로컬에서 스폰서, 소재, 캠페인을 만들고 승인한 뒤 Waitly 광고 팝업에 반영합니다.",
    `<section class="admin-grid">
      <form class="panel form admin-form" data-admin-sponsor-form>
        <div class="section-head"><div><h2>스폰서 등록</h2><p>광고주 이름과 개발자 맥락 카테고리를 저장합니다.</p></div></div>
        <label>스폰서 이름<input name="name" placeholder="Acme Cloud" required></label>
        <label>카테고리<select name="category">${adminCategoryOptions()}</select></label>
        <button class="button" type="submit">스폰서 만들기</button>
      </form>
      <form class="panel form admin-form" data-admin-creative-form>
        <div class="section-head"><div><h2>소재 등록</h2><p>승인 전까지 광고 팝업에는 노출되지 않습니다.</p></div></div>
        <label>스폰서<select name="sponsorId" data-admin-sponsor-select required></select></label>
        <label>제목<input name="headline" placeholder="AI infra credits" maxlength="120" required></label>
        <label>본문<input name="body" placeholder="Developer-focused offer" maxlength="280" required></label>
        <label>CTA<input name="cta" placeholder="보기" maxlength="60"></label>
        <label>도착 URL<input name="destinationUrl" type="url" placeholder="https://example.com" required></label>
        <label>카테고리<select name="category">${adminCategoryOptions()}</select></label>
        <button class="button" type="submit">소재 만들기</button>
      </form>
      <form class="panel form admin-form" data-admin-campaign-form>
        <div class="section-head"><div><h2>캠페인 생성</h2><p>active 상태는 승인된 스폰서와 소재만 허용됩니다.</p></div></div>
        <label>스폰서<select name="sponsorId" data-admin-campaign-sponsor-select required></select></label>
        <label>소재<select name="creativeId" data-admin-creative-select></select></label>
        <label>예산 minor 단위<input name="budgetMinor" type="number" min="0" value="50000"></label>
        <label>노출 단가 minor 단위<input name="rateMinor" type="number" min="0" value="12"></label>
        <label>상태<select name="status"><option value="draft">draft</option><option value="active">active</option></select></label>
        <button class="button" type="submit">캠페인 만들기</button>
      </form>
    </section>
    <section class="panel wide admin-ops-panel">
      <div class="section-head">
        <div><h2>운영 현황</h2><p>승인, 활성화, ledger 확정을 이 화면에서 처리합니다.</p></div>
        <button class="button secondary" type="button" data-admin-refresh>새로고침</button>
      </div>
      <p class="auth-message" data-admin-message></p>
      <div data-admin-content class="admin-content"><div class="copy-box">운영 데이터를 불러오는 중입니다.</div></div>
    </section>`,
    aside,
  );
}

function renderAdminLogin() {
  return `<section class="login-stage">
    <div class="login-visual is-locked" aria-hidden="true">
      <img class="login-symbol" src="/assets/waitly-symbol-clean.png" alt="">
      <div class="login-signal">
        <span>ADMIN</span>
        <strong>운영 콘솔</strong>
        <small>local pilot operations</small>
      </div>
      <div class="login-metric-row">
        <span>광고 등록</span>
        <b>잠김</b>
      </div>
      <div class="login-metric-row accent">
        <span>캠페인 활성화</span>
        <b>관리자만</b>
      </div>
    </div>
    <section class="login-panel" aria-labelledby="admin-login-title">
      <p class="login-kicker">WAITLY OPS</p>
      <h1 id="admin-login-title">관리자 로그인</h1>
      <p class="login-subtitle">로컬 파일럿 API 관리자 세션으로 광고 운영 화면을 엽니다.</p>
      <form class="pilot-login-form" data-admin-login-form>
        <label><span>관리자 이메일</span><input name="email" type="email" value="admin@waitly.local" required></label>
        <button class="button login-submit" type="submit" data-admin-login>관리자로 계속하기</button>
      </form>
      <p class="auth-message login-message" data-admin-message>admin@waitly.local 계정은 로컬에서 admin role로 생성됩니다.</p>
    </section>
  </section>`;
}

function adminCategoryOptions() {
  return [
    "cloud",
    "database",
    "api",
    "security",
    "monitoring",
    "deployment",
    "ai-devtool",
    "developer-saas",
    "education",
    "hiring",
    "open-source",
  ].map((category) => `<option value="${category}">${category}</option>`).join("");
}

async function loadAdminDashboard() {
  const container = document.querySelector("[data-admin-content]");
  const message = document.querySelector("[data-admin-message]");
  if (!container) return;

  const result = await callPilotApi("/v1/admin/overview");
  if (!result.ok) {
    container.innerHTML = `<div class="copy-box">운영 데이터를 불러오지 못했습니다: ${html(result.body.error || result.status)}</div>`;
    return;
  }

  const overview = result.body;
  fillAdminSelects(overview);
  container.innerHTML = renderAdminOverview(overview);
  if (message && !message.textContent) {
    message.textContent = `${overview.summary.eligibleAdCount}개 광고가 현재 팝업 로더에 반영됩니다.`;
  }
}

function fillAdminSelects(overview) {
  const sponsorOptions = overview.sponsors
    .map((sponsor) => `<option value="${html(sponsor.id)}">${html(sponsor.name)} · ${html(sponsor.status)}</option>`)
    .join("");
  document.querySelectorAll("[data-admin-sponsor-select], [data-admin-campaign-sponsor-select]").forEach((select) => {
    select.innerHTML = sponsorOptions || `<option value="">스폰서 없음</option>`;
  });

  const creativeOptions = overview.creatives
    .map((creative) => `<option value="${html(creative.id)}">${html(creative.headline)} · ${html(creative.status)}</option>`)
    .join("");
  document.querySelectorAll("[data-admin-creative-select]").forEach((select) => {
    select.innerHTML = creativeOptions || `<option value="">소재 없음</option>`;
  });
}

function renderAdminOverview(overview) {
  return `<section class="stat-grid admin-stat-grid">
    ${stat("스폰서", overview.summary.sponsors, `${overview.summary.approvedSponsors} approved`)}
    ${stat("소재", overview.summary.creatives, `${overview.summary.approvedCreatives} approved`)}
    ${stat("캠페인", overview.summary.campaigns, `${overview.summary.activeCampaigns} active`)}
    ${stat("서빙 가능", overview.summary.eligibleAdCount, "popup loader")}
  </section>
  <section class="admin-table-grid">
    ${adminTable("스폰서", ["이름", "카테고리", "상태", ""], overview.sponsors.map(renderSponsorRow))}
    ${adminTable("소재", ["제목", "도착 URL", "상태", ""], overview.creatives.map(renderCreativeRow))}
    ${adminTable("캠페인", ["소재", "예산", "상태", ""], overview.campaigns.map(renderCampaignRow))}
  </section>
  <section class="two-col">
    <div class="admin-nested-panel">
      <div class="section-head"><div><h2>광고 로더 후보</h2><p>active 캠페인 중 실제 노출 가능한 목록입니다.</p></div></div>
      ${overview.eligibleAds.length ? overview.eligibleAds.map((ad) => `<div class="admin-ad-preview"><strong>${html(ad.headline)}</strong><span>${html(ad.sponsorName)} · ${formatMinor(ad.rateMinor, ad.currency)}</span><a href="${html(ad.destinationUrl)}" target="_blank" rel="noreferrer">도착 URL</a></div>`).join("") : `<div class="copy-box">현재 서빙 가능한 광고가 없습니다.</div>`}
    </div>
    <div class="admin-nested-panel">
      <div class="section-head"><div><h2>Ledger</h2><p>대기 중인 후원 크레딧을 확정 처리합니다.</p></div><button class="button secondary" type="button" data-admin-action="confirm-ledger">대기분 확정</button></div>
      <div class="settlement">
        <div><span>pending</span><b>${formatMinor(overview.ledgerSummary.lifetimeEstimatedMinor, overview.ledgerSummary.currency)}</b></div>
        <div><span>confirmed</span><b>${formatMinor(overview.ledgerSummary.confirmedMinor, overview.ledgerSummary.currency)}</b></div>
        <div><span>settled</span><b>${formatMinor(overview.ledgerSummary.settledMinor, overview.ledgerSummary.currency)}</b></div>
      </div>
    </div>
  </section>
  <section class="admin-nested-panel">
    <div class="section-head"><div><h2>감사 로그</h2><p>운영자가 바꾼 sponsor, creative, campaign 변경 기록입니다.</p></div></div>
    <div class="ops-table compact">
      ${overview.auditEvents.length ? overview.auditEvents.slice(0, 10).map((event) => `<div class="ops-row"><span>${html(event.action)}</span><strong>${html(event.entityType)}</strong><small>${html(event.createdAt)}</small></div>`).join("") : `<div class="copy-box">감사 로그가 없습니다.</div>`}
    </div>
  </section>`;
}

function adminTable(title, headers, rows) {
  return `<section class="admin-table-panel">
    <div class="section-head"><div><h2>${title}</h2></div></div>
    <div class="ops-table">
      <div class="ops-row ops-head">${headers.map((header) => `<span>${header}</span>`).join("")}</div>
      ${rows.length ? rows.join("") : `<div class="copy-box">데이터 없음</div>`}
    </div>
  </section>`;
}

function renderSponsorRow(sponsor) {
  return `<div class="ops-row">
    <strong>${html(sponsor.name)}</strong>
    <span>${html(sponsor.category)}</span>
    ${statusPill(sponsor.status)}
    <span class="ops-actions">
      ${sponsor.status !== "approved" ? `<button class="button secondary" type="button" data-admin-action="patch-sponsor" data-id="${html(sponsor.id)}" data-status="approved">승인</button>` : ""}
      ${sponsor.status !== "rejected" ? `<button class="button secondary" type="button" data-admin-action="patch-sponsor" data-id="${html(sponsor.id)}" data-status="rejected">반려</button>` : ""}
    </span>
  </div>`;
}

function renderCreativeRow(creative) {
  return `<div class="ops-row">
    <strong>${html(creative.headline)}</strong>
    <a href="${html(creative.destinationUrl)}" target="_blank" rel="noreferrer">${html(urlHost(creative.destinationUrl))}</a>
    ${statusPill(creative.status)}
    <span class="ops-actions">
      ${creative.status !== "approved" ? `<button class="button secondary" type="button" data-admin-action="patch-creative" data-id="${html(creative.id)}" data-status="approved">승인</button>` : ""}
      ${creative.status !== "rejected" ? `<button class="button secondary" type="button" data-admin-action="patch-creative" data-id="${html(creative.id)}" data-status="rejected">반려</button>` : ""}
    </span>
  </div>`;
}

function renderCampaignRow(campaign) {
  return `<div class="ops-row">
    <strong>${html(campaign.creativeId || "미지정")}</strong>
    <span>${formatMinor(campaign.budgetMinor, campaign.currency)}</span>
    ${statusPill(campaign.status)}
    <span class="ops-actions">
      ${campaign.status !== "active" ? `<button class="button secondary" type="button" data-admin-action="patch-campaign" data-id="${html(campaign.id)}" data-status="active">활성</button>` : `<button class="button secondary" type="button" data-admin-action="patch-campaign" data-id="${html(campaign.id)}" data-status="paused">일시정지</button>`}
      ${campaign.status !== "archived" ? `<button class="button secondary" type="button" data-admin-action="patch-campaign" data-id="${html(campaign.id)}" data-status="archived">보관</button>` : ""}
    </span>
  </div>`;
}

function statusPill(status) {
  return `<span class="status-pill status-${html(status)}">${html(status)}</span>`;
}

function formatMinor(amountMinor = 0, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format((amountMinor || 0) / 100);
  } catch (_) {
    return `${currency} ${(amountMinor || 0) / 100}`;
  }
}

function urlHost(value) {
  try {
    return new URL(value).hostname;
  } catch (_) {
    return value || "";
  }
}

async function submitAdminForm(event, endpoint, successMessage) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.querySelector("[data-admin-message]");
  const body = Object.fromEntries(new FormData(form).entries());
  for (const key of ["budgetMinor", "rateMinor"]) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      body[key] = Number.parseInt(body[key], 10);
    }
  }
  const result = await callPilotApi(endpoint, { method: "POST", body });
  if (message) message.textContent = result.ok ? successMessage : `실패: ${result.body.error || result.status}`;
  if (result.ok) {
    form.reset();
    await loadAdminDashboard();
  }
}

async function handleAdminAction(event) {
  const button = event.target.closest("[data-admin-action]");
  if (!button) return;
  const action = button.dataset.adminAction;
  const id = button.dataset.id;
  const status = button.dataset.status;
  const message = document.querySelector("[data-admin-message]");
  let result;

  if (action === "patch-sponsor") {
    result = await callPilotApi(`/v1/admin/sponsors/${id}`, { method: "PATCH", body: { status } });
  } else if (action === "patch-creative") {
    result = await callPilotApi(`/v1/admin/creatives/${id}`, { method: "PATCH", body: { status } });
  } else if (action === "patch-campaign") {
    result = await callPilotApi(`/v1/admin/campaigns/${id}`, { method: "PATCH", body: { status } });
  } else if (action === "confirm-ledger") {
    result = await callPilotApi("/v1/admin/ledger/confirm", { method: "POST", body: {} });
  }

  if (!result) return;
  if (message) message.textContent = result.ok ? "운영 변경이 저장되었습니다." : `실패: ${result.body.error || result.status}`;
  await loadAdminDashboard();
}

function html(value) {
  // Admin tables render API/file-backed values, so all text is escaped before injection.
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderLogin(user = null) {
  if (user) {
    return `<section class="login-stage">
      <div class="login-visual" aria-hidden="true">
        <img class="login-symbol" src="/assets/waitly-symbol-clean.png" alt="">
        <div class="login-signal">
          <span>SESSION ACTIVE</span>
          <strong>${data.user.confirmed}</strong>
          <small>confirmed donation</small>
        </div>
        <div class="login-metric-row">
          <span>대기 시간</span>
          <b>${data.user.waitTime}</b>
        </div>
        <div class="login-metric-row accent">
          <span>참여 후원방</span>
          <b>${data.rooms.length}개</b>
        </div>
      </div>
      <section class="login-panel" aria-labelledby="login-title">
        <p class="login-kicker">WAITLY ACCOUNT</p>
        <h1 id="login-title">이미 로그인됨</h1>
        <p class="login-subtitle">${displayName(user)} 계정으로 대시보드와 설정을 사용할 수 있습니다.</p>
        <div class="login-actions">
          <a class="button" href="/dashboard/">대시보드로 이동</a>
          <button class="button secondary" type="button" data-sign-out-panel>로그아웃</button>
        </div>
        <p class="auth-message login-message">로그아웃하면 개인 대시보드와 설정 화면 접근이 제한됩니다.</p>
      </section>
    </section>`;
  }

  const loginControl = hasSupabaseConfig()
    ? `<button class="google-button" type="button" data-google-login>
        <span class="google-mark">G</span>
        Google로 계속하기
      </button>`
    : `<form class="pilot-login-form" data-pilot-login-form>
        <label><span>이메일</span><input name="email" type="email" autocomplete="email" autocapitalize="none" placeholder="pilot@example.com" required></label>
        <label><span>이름</span><input name="displayName" autocomplete="name" placeholder="Pilot User"></label>
        <button class="button login-submit" type="submit" data-pilot-login>파일럿 계정으로 계속하기</button>
      </form>`;
  const authMessage = hasSupabaseConfig()
    ? "Google 인증 후 대시보드로 이동합니다."
    : "로컬 파일럿 API 세션으로 대시보드를 엽니다.";

  return `<section class="login-stage">
    <div class="login-visual" aria-hidden="true">
      <img class="login-symbol" src="/assets/waitly-symbol-clean.png" alt="">
      <div class="login-signal">
        <span>THIS MONTH</span>
        <strong>${data.totals.month}</strong>
        <small>from waiting time</small>
      </div>
      <div class="login-metric-row">
        <span>참여 개발자</span>
        <b>${data.totals.developers}</b>
      </div>
      <div class="login-metric-row accent">
        <span>확정 후원금</span>
        <b>${data.totals.confirmed}</b>
      </div>
    </div>
    <section class="login-panel" aria-labelledby="login-title">
      <p class="login-kicker">WAITLY ACCOUNT</p>
      <h1 id="login-title">${hasSupabaseConfig() ? "Google로 로그인" : "파일럿 계정 로그인"}</h1>
      <p class="login-subtitle">내 대기 시간, 후원금, 후원방을 한 번에 이어서 봅니다.</p>
      <div class="login-control">
        ${loginControl}
      </div>
      <p class="auth-message login-message" data-auth-message>${authMessage}</p>
      <div class="login-divider"><span>로그인 후</span></div>
      <div class="login-benefits" aria-label="로그인 후 제공 기능">
        <span>개인 대시보드</span>
        <span>후원방 참여 현황</span>
        <span>정산 상태</span>
      </div>
    </section>
  </section>`;
}

function renderAuthRequired() {
  const next = encodeURIComponent(currentPath());
  return `<section class="login-stage">
    <div class="login-visual is-locked" aria-hidden="true">
      <img class="login-symbol" src="/assets/waitly-symbol-clean.png" alt="">
      <div class="login-signal">
        <span>PROTECTED</span>
        <strong>계정 확인</strong>
        <small>private workspace</small>
      </div>
      <div class="login-metric-row">
        <span>개인 대시보드</span>
        <b>잠김</b>
      </div>
      <div class="login-metric-row accent">
        <span>설정 화면</span>
        <b>잠김</b>
      </div>
    </div>
    <section class="login-panel" aria-labelledby="login-required-title">
      <p class="login-kicker">ACCESS CHECK</p>
      <h1 id="login-required-title">로그인이 필요합니다</h1>
      <p class="login-subtitle">개인 기여 금액과 설정은 계정 세션이 있을 때만 열립니다.</p>
      <div class="login-actions">
        <a class="button" href="/login/?next=${next}">로그인하고 계속하기</a>
        <a class="button secondary" href="/home/">홈으로 돌아가기</a>
      </div>
      <p class="auth-message login-message">${hasSupabaseConfig() ? "로그인 후 요청한 화면으로 돌아옵니다." : "로컬 파일럿 API 세션으로 접근을 확인합니다."}</p>
    </section>
  </section>`;
}

function setActiveNav() {
  const path = currentPath();
  document.querySelectorAll(".nav a").forEach((link) => {
    const href = link.getAttribute("href");
    if (href !== "/" && path.startsWith(href)) {
      link.classList.add("active");
    }
  });
}

function rebuildHeader() {
  const header = document.querySelector(".topbar-inner");
  if (!header) return;

  header.innerHTML = `<a class="brand" href="/home/"><img class="brand-symbol" src="/assets/waitly-symbol-crop.png" alt="" aria-hidden="true"><img class="brand-logo" src="/assets/waitly-wordmark-clean.png" alt="Waitly"></a>
    <nav class="nav" aria-label="제품 메뉴">
      <a href="/">랜딩</a>
      <a href="/home/">홈</a>
      <a href="/dashboard/">대시보드</a>
      <a href="/leaderboard/">랭킹</a>
      <a href="/rooms/">후원방</a>
      <a href="/targets/">후원 대상</a>
      <a href="/admin/">광고 운영</a>
      <a href="/settings/">설정</a>
    </nav>
    <div class="top-actions"><a class="button" href="/login/">로그인</a></div>`;
  document.title = "Waitly 제품 홈";
}

const app = document.querySelector("#app");
initializeApp();

async function initializeApp() {
  rebuildHeader();
  const path = currentPath();

  if (adminRoutes.has(path)) {
    // Admin uses the local pilot session because it controls local ad state.
    const adminUser = await getPilotUser();
    app.innerHTML = adminUser?.role === "admin" ? renderAdmin(adminUser) : renderAdminLogin();
    setActiveNav();
    bindPageActions();
    updateAuthUi(adminUser);
    return;
  }

  const client = await getSupabaseClient().catch(() => null);
  if (client) {
    client.auth.onAuthStateChange((_event, session) => {
      updateAuthUi(session?.user || null);
    });
  }

  const user = await getCurrentUser();
  const render = routes[path] || renderHome;

  if (protectedRoutes.has(path) && !user) {
    app.innerHTML = renderAuthRequired();
  } else {
    app.innerHTML = render(user);
  }

  setActiveNav();
  bindPageActions();
  updateAuthUi(user);
}

function bindPageActions() {
  document.querySelector("[data-google-login]")?.addEventListener("click", signInWithGoogle);
  document.querySelector("[data-pilot-login-form]")?.addEventListener("submit", signInWithPilot);
  document.querySelector("[data-admin-login-form]")?.addEventListener("submit", signInWithAdmin);
  document.querySelector("[data-sign-out-panel]")?.addEventListener("click", signOut);
  document.querySelector("[data-admin-sponsor-form]")?.addEventListener("submit", (event) => {
    submitAdminForm(event, "/v1/admin/sponsors", "스폰서가 생성되었습니다.");
  });
  document.querySelector("[data-admin-creative-form]")?.addEventListener("submit", (event) => {
    submitAdminForm(event, "/v1/admin/creatives", "소재가 생성되었습니다.");
  });
  document.querySelector("[data-admin-campaign-form]")?.addEventListener("submit", (event) => {
    submitAdminForm(event, "/v1/admin/campaigns", "캠페인이 생성되었습니다.");
  });
  document.querySelector("[data-admin-refresh]")?.addEventListener("click", loadAdminDashboard);
  document.querySelector("[data-admin-content]")?.addEventListener("click", handleAdminAction);
  if (document.querySelector("[data-admin-content]")) {
    loadAdminDashboard();
  }
}

// The image-publisher admin UI below overrides the generic ops console for this prototype.
function renderAdmin(user) {
  const aside = `<section class="rail-card dark">
    <span>LIVE AD</span>
    <strong>${displayName(user)}</strong>
    <p>Upload one image and it becomes the active Waitly ad for the next popup.</p>
  </section>
  <section class="rail-card">
    <span>Local admin</span>
    <p>The local admin account is admin@waitly.local.</p>
  </section>`;

  return layout(
    "Image ad publisher",
    "Drop in the finished ad image. Waitly pauses older live campaigns and serves this image immediately.",
    `<section class="admin-upload-grid">
      <form class="panel form admin-form instant-ad-form" data-admin-instant-ad-form>
        <div class="section-head"><div><h2>Publish image</h2><p>PNG, JPG, WebP, or SVG. Keep it under 1.5 MB for the local prototype.</p></div></div>
        <label>Ad image<input name="imageFile" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" data-admin-image-input required></label>
        <img class="admin-image-preview" data-admin-image-preview alt="Selected ad preview" hidden>
        <label>Landing URL<input name="destinationUrl" type="url" value="https://waitly.dev/" required></label>
        <label>Title<input name="headline" maxlength="120" value="Uploaded image ad"></label>
        <label>Description<input name="body" maxlength="280" value="Published from the Waitly admin image uploader."></label>
        <label>Button text<input name="cta" maxlength="60" value="Open"></label>
        <label>Sponsor label<input name="sponsorName" maxlength="120" value="Waitly uploaded ad"></label>
        <label>Image alt text<input name="imageAlt" maxlength="120" value="Waitly uploaded sponsored image"></label>
        <button class="button" type="submit" data-admin-instant-ad>Show this image ad</button>
      </form>
      <section class="panel wide admin-ops-panel">
        <div class="section-head">
          <div><h2>Currently served</h2><p>The first live ad here is what the popup loader will use next.</p></div>
          <button class="button secondary" type="button" data-admin-refresh>Refresh</button>
        </div>
        <p class="auth-message" data-admin-message></p>
        <div data-admin-content class="admin-content"><div class="copy-box">Loading live ad data.</div></div>
      </section>
    </section>`,
    aside,
  );
}

function bindPageActions() {
  document.querySelector("[data-google-login]")?.addEventListener("click", signInWithGoogle);
  document.querySelector("[data-pilot-login-form]")?.addEventListener("submit", signInWithPilot);
  document.querySelector("[data-admin-login-form]")?.addEventListener("submit", signInWithAdmin);
  document.querySelector("[data-sign-out-panel]")?.addEventListener("click", signOut);
  document.querySelector("[data-admin-image-input]")?.addEventListener("change", previewInstantAdImage);
  document.querySelector("[data-admin-instant-ad-form]")?.addEventListener("submit", submitInstantAd);
  document.querySelector("[data-admin-refresh]")?.addEventListener("click", loadAdminDashboard);
  document.querySelector("[data-admin-content]")?.addEventListener("click", handleAdminAction);
  if (document.querySelector("[data-admin-content]")) {
    loadAdminDashboard();
  }
}

async function previewInstantAdImage(event) {
  const file = event.currentTarget.files?.[0];
  const preview = document.querySelector("[data-admin-image-preview]");
  const message = document.querySelector("[data-admin-message]");
  if (!preview || !file) return;

  if (!isSupportedAdminImage(file)) {
    preview.hidden = true;
    preview.removeAttribute("src");
    if (message) message.textContent = "Use a PNG, JPG, WebP, or SVG image under 1.5 MB.";
    return;
  }

  const imageDataUrl = await readAdminImageFile(file);
  preview.src = imageDataUrl;
  preview.hidden = false;
  if (message) message.textContent = "Image ready. Submit to make it live.";
}

async function submitInstantAd(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.querySelector("[data-admin-message]");
  const button = form.querySelector("[data-admin-instant-ad]");
  const file = form.querySelector("[data-admin-image-input]")?.files?.[0];

  if (!file || !isSupportedAdminImage(file)) {
    if (message) message.textContent = "Choose a PNG, JPG, WebP, or SVG image under 1.5 MB.";
    return;
  }

  if (button) button.disabled = true;
  if (message) message.textContent = "Publishing image ad.";

  try {
    // Send a data URL to the local pilot API so the next popup can serve it without storage.
    const imageDataUrl = await readAdminImageFile(file);
    const result = await callPilotApi("/v1/admin/instant-ad", {
      method: "POST",
      body: {
        imageDataUrl,
        imageAlt: form.elements.imageAlt.value || file.name,
        headline: form.elements.headline.value || "Uploaded image ad",
        body: form.elements.body.value || "Published from the Waitly admin image uploader.",
        cta: form.elements.cta.value || "Open",
        destinationUrl: form.elements.destinationUrl.value || "https://waitly.dev/",
        sponsorName: form.elements.sponsorName.value || "Waitly uploaded ad",
        category: "developer-saas",
      },
    });

    if (!result.ok) {
      if (message) message.textContent = `Publish failed: ${result.body.error || result.status}`;
      return;
    }

    if (message) message.textContent = "Image ad is live. The next Waitly popup will use it.";
    await loadAdminDashboard();
  } finally {
    if (button) button.disabled = false;
  }
}

function isSupportedAdminImage(file) {
  // Keep the local JSON state small enough for quick reads and browser rendering.
  return Boolean(
    file &&
    file.size <= 1572864 &&
    ["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.type),
  );
}

function readAdminImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("image_read_failed"));
    reader.readAsDataURL(file);
  });
}

async function loadAdminDashboard() {
  const container = document.querySelector("[data-admin-content]");
  const message = document.querySelector("[data-admin-message]");
  if (!container) return;

  const result = await callPilotApi("/v1/admin/overview");
  if (!result.ok) {
    container.innerHTML = `<div class="copy-box">Could not load live ad data: ${html(result.body.error || result.status)}</div>`;
    return;
  }

  const overview = result.body;
  container.innerHTML = renderAdminOverview(overview);
  if (message && !message.textContent) {
    message.textContent = overview.summary.eligibleAdCount
      ? `${overview.summary.eligibleAdCount} live ad is available.`
      : "No image ad is live yet.";
  }
}

function renderAdminOverview(overview) {
  const liveAd = overview.eligibleAds[0] || null;
  const imageCreatives = overview.creatives.filter((creative) => creative.imageDataUrl).slice(0, 6);
  return `<section class="stat-grid admin-stat-grid">
    ${stat("Live ads", overview.summary.eligibleAdCount, "popup loader")}
    ${stat("Image uploads", imageCreatives.length, "admin")}
    ${stat("Paused older campaigns", overview.campaigns.filter((campaign) => campaign.status === "paused").length, "auto")}
    ${stat("Pending ledger", overview.summary.pendingLedger, "events")}
  </section>
  <section class="admin-live-layout">
    ${liveAd ? renderAdminLiveAd(liveAd) : `<div class="copy-box">No active image ad. Upload one on the left.</div>`}
    <section class="admin-nested-panel">
      <div class="section-head"><div><h2>Recent image uploads</h2><p>Newest uploads appear first.</p></div></div>
      <div class="admin-upload-list">
        ${imageCreatives.length ? imageCreatives.map(renderAdminUploadItem).join("") : `<div class="copy-box">No image uploads yet.</div>`}
      </div>
    </section>
  </section>`;
}

function renderAdminLiveAd(ad) {
  const imageSource = adminSafeImageSource(ad.imageDataUrl);
  return `<article class="admin-live-ad">
    ${imageSource ? `<img src="${imageSource}" alt="${html(ad.imageAlt || "Live ad image")}">` : `<div class="copy-box">Live ad has no image data.</div>`}
    <div>
      <span>LIVE NOW</span>
      <h2>${html(ad.headline)}</h2>
      <p>${html(ad.body)}</p>
      <a href="${html(ad.destinationUrl)}" target="_blank" rel="noreferrer">${html(ad.cta || "Open")}</a>
    </div>
  </article>`;
}

function renderAdminUploadItem(creative) {
  const imageSource = adminSafeImageSource(creative.imageDataUrl);
  return `<article class="admin-upload-item">
    ${imageSource ? `<img src="${imageSource}" alt="${html(creative.imageAlt || "Uploaded ad image")}">` : ""}
    <div><strong>${html(creative.headline)}</strong><span>${html(creative.status)}</span></div>
  </article>`;
}

function adminSafeImageSource(value) {
  const imageDataUrl = String(value || "");
  // Only allow image data URLs that match the uploader's accepted MIME types.
  if (!/^data:image\/(?:png|jpeg|webp|svg\+xml);base64,[a-zA-Z0-9+/=]+$/.test(imageDataUrl)) {
    return "";
  }
  return imageDataUrl;
}
