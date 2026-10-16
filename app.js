"use strict";
/* 기도의 방 — 프론트엔드 (바닐라 JS SPA)
 *
 * 해시 라우팅:
 *   #/                  홈 (기도 주제 카드 목록)
 *   #/p/:id             기도문 보기 (글자 크기 조절, 이전/다음)
 *   #/admin             관리자 로그인
 *   #/admin/panel       관리자 패널 (추가/수정/삭제)
 *   #/admin/new         새 기도문 추가
 *   #/admin/edit/:id    기도문 수정
 *
 * 백엔드(/api)에 연결되지 않으면 데모 모드(localStorage)로 동작해
 * UI 미리보기가 가능합니다.
 */

const FONT_STEPS = [17, 20, 24, 29];
const FONT_LABELS = ["보통", "크게", "더 크게", "가장 크게"];
const LS_FONT_STEP = "prayer-room:font-step";
const LS_DEMO_TOPICS = "prayer-room:demo-topics:v1";
const SS_DEMO_ADMIN = "prayer-room:demo-admin";

const DEMO_SEED = [
  { id: 1, title: "아침 기도", body: "", sort_order: 10 },
  { id: 2, title: "저녁 기도", body: "", sort_order: 20 },
  { id: 3, title: "감사의 기도", body: "", sort_order: 30 },
  { id: 4, title: "회개와 용서의 기도", body: "", sort_order: 40 },
  { id: 5, title: "가족을 위한 기도", body: "", sort_order: 50 },
];

const state = { demo: false, topics: [], fontStep: 1 };

/* ---------- 안전한 저장소 접근 (프라이빗 모드 등 대응) ---------- */
const store = {
  get(k) {
    try {
      return window.localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  },
  set(k, v) {
    try {
      window.localStorage.setItem(k, v);
    } catch (e) {}
  },
};
const sessionStore = {
  get(k) {
    try {
      return window.sessionStorage.getItem(k);
    } catch (e) {
      return null;
    }
  },
  set(k, v) {
    try {
      window.sessionStorage.setItem(k, v);
    } catch (e) {}
  },
  del(k) {
    try {
      window.sessionStorage.removeItem(k);
    } catch (e) {}
  },
};

function sortTopics(a, b) {
  return a.sort_order - b.sort_order || a.id - b.id;
}

function stripBody(t) {
  return { id: t.id, title: t.title, sort_order: t.sort_order };
}

function loadFontStep() {
  const v = parseInt(store.get(LS_FONT_STEP) || "1", 10);
  state.fontStep = Number.isInteger(v)
    ? Math.min(Math.max(v, 0), FONT_STEPS.length - 1)
    : 1;
}

function saveFontStep() {
  store.set(LS_FONT_STEP, String(state.fontStep));
}

/* ---------- 데모 저장소 (백엔드 없이 미리보기) ---------- */

function loadDemoTopics() {
  const raw = store.get(LS_DEMO_TOPICS);
  try {
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  const seed = DEMO_SEED.map((t) => ({ ...t }));
  store.set(LS_DEMO_TOPICS, JSON.stringify(seed));
  return seed;
}

function saveDemoTopics(topics) {
  store.set(LS_DEMO_TOPICS, JSON.stringify(topics));
}

function isDemoAdmin() {
  return sessionStore.get(SS_DEMO_ADMIN) === "1";
}

/* ---------- API ---------- */

function apiError(message, status) {
  const e = new Error(message);
  e.status = status;
  return e;
}

async function api(path, options = {}) {
  if (state.demo) return demoApi(path, options);
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw apiError(data.message || "요청에 실패했습니다.", res.status);
  return data;
}

function demoApi(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const topics = loadDemoTopics();
  const m = path.match(/^\/api\/topics\/(\d+)$/);
  const id = m ? Number(m[1]) : null;
  const parseJsonBody = () => {
    try {
      return JSON.parse(options.body || "{}");
    } catch (e) {
      return {};
    }
  };

  if (path === "/api/topics" && method === "GET") {
    return Promise.resolve({ topics: topics.map(stripBody).sort(sortTopics) });
  }
  if (id !== null && method === "GET") {
    const t = topics.find((x) => x.id === id);
    return t
      ? Promise.resolve({ topic: { ...t } })
      : Promise.reject(apiError("기도문을 찾을 수 없습니다.", 404));
  }
  if (path === "/api/admin/me") {
    return Promise.resolve({ admin: isDemoAdmin() });
  }
  if (path === "/api/admin/login" && method === "POST") {
    const password = parseJsonBody().password || "";
    if (!password) return Promise.reject(apiError("비밀번호를 입력해 주세요.", 401));
    sessionStore.set(SS_DEMO_ADMIN, "1");
    return Promise.resolve({ ok: true });
  }
  if (path === "/api/admin/logout" && method === "POST") {
    sessionStore.del(SS_DEMO_ADMIN);
    return Promise.resolve({ ok: true });
  }
  if (!isDemoAdmin()) {
    return Promise.reject(apiError("관리자 로그인이 필요합니다.", 401));
  }
  if (path === "/api/topics" && method === "POST") {
    const p = parseJsonBody();
    if (!String(p.title || "").trim()) return Promise.reject(apiError("제목을 입력해 주세요.", 400));
    const topic = {
      id: Math.max(0, ...topics.map((t) => t.id)) + 1,
      title: String(p.title).trim().slice(0, 100),
      body: String(p.body || "").slice(0, 20000),
      sort_order: Number(p.sort_order) || 9999,
    };
    topics.push(topic);
    saveDemoTopics(topics);
    return Promise.resolve({ topic });
  }
  if (id !== null && method === "PUT") {
    const t = topics.find((x) => x.id === id);
    if (!t) return Promise.reject(apiError("기도문을 찾을 수 없습니다.", 404));
    const p = parseJsonBody();
    if (!String(p.title || "").trim()) return Promise.reject(apiError("제목을 입력해 주세요.", 400));
    t.title = String(p.title).trim().slice(0, 100);
    t.body = String(p.body || "").slice(0, 20000);
    t.sort_order = Number(p.sort_order) || t.sort_order;
    saveDemoTopics(topics);
    return Promise.resolve({ topic: { ...t } });
  }
  if (id !== null && method === "DELETE") {
    saveDemoTopics(topics.filter((x) => x.id !== id));
    return Promise.resolve({ ok: true });
  }
  return Promise.reject(apiError("요청을 처리할 수 없습니다.", 404));
}

/* ---------- HTML 헬퍼 ---------- */

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function renderBodyHtml(body) {
  const paras = String(body || "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paras.map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
}

function demoBanner() {
  if (!state.demo) return "";
  return `<div class="demo-banner">미리보기(데모) 모드입니다. 변경 내용은 이 브라우저에만 저장됩니다.<br>데모 관리자 로그인: 아무 비밀번호나 입력하세요.</div>`;
}

/* ---------- 라우터 ---------- */

function parseHash() {
  const h = location.hash || "#/";
  let m = h.match(/^#\/p\/(\d+)$/);
  if (m) return { view: "prayer", id: Number(m[1]) };
  m = h.match(/^#\/admin\/edit\/(\d+)$/);
  if (m) return { view: "admin-edit", id: Number(m[1]) };
  if (h === "#/admin/new") return { view: "admin-new" };
  if (h === "#/admin/panel") return { view: "admin-panel" };
  if (h === "#/admin") return { view: "admin-login" };
  return { view: "home" };
}

async function refreshTopics() {
  const data = await api("/api/topics");
  state.topics = (data.topics || []).sort(sortTopics);
}

async function render() {
  const route = parseHash();
  const view = document.getElementById("view");
  window.scrollTo(0, 0);
  try {
    if (route.view === "home") await renderHome(view);
    else if (route.view === "prayer") await renderPrayer(view, route.id);
    else if (route.view === "admin-login") renderAdminLogin(view);
    else if (route.view === "admin-panel") await renderAdminPanel(view);
    else if (route.view === "admin-new") await renderEditor(view, null);
    else if (route.view === "admin-edit") await renderEditor(view, route.id);
  } catch (e) {
    view.innerHTML = `<p class="error">오류가 발생했습니다.<br>${escapeHtml(e.message || e)}</p>`;
  }
}

/* ---------- 홈 ---------- */

async function renderHome(view) {
  await refreshTopics();
  const cards = state.topics
    .map(
      (t, i) => `
    <li>
      <a class="topic-card" href="#/p/${t.id}">
        <span class="topic-num">${String(i + 1).padStart(2, "0")}</span>
        <span class="topic-title">${escapeHtml(t.title)}</span>
      </a>
    </li>`
    )
    .join("");
  view.innerHTML = `
    ${demoBanner()}
    <h2 class="home-title">기도 주제</h2>
    ${
      state.topics.length
        ? `<ul class="topic-grid">${cards}</ul>`
        : `<p class="empty-list">등록된 기도 주제가 없습니다.</p>`
    }
  `;
}

/* ---------- 기도문 보기 ---------- */

async function renderPrayer(view, id) {
  await refreshTopics();
  const data = await api(`/api/topics/${id}`);
  const topic = data.topic;
  const idx = state.topics.findIndex((t) => t.id === id);
  const prev = idx > 0 ? state.topics[idx - 1] : null;
  const next = idx >= 0 && idx < state.topics.length - 1 ? state.topics[idx + 1] : null;
  const hasBody = String(topic.body || "").trim().length > 0;

  view.innerHTML = `
    ${demoBanner()}
    <a class="back-link" href="#/">← 목록으로</a>
    <article class="prayer-article">
      <h1 class="prayer-title">${escapeHtml(topic.title)}</h1>
      <hr class="divider" />
      ${
        hasBody
          ? `<div class="prayer-body" id="prayer-body" style="font-size:${FONT_STEPS[state.fontStep]}px">${renderBodyHtml(topic.body)}</div>`
          : `<div class="empty-notice">
               <p>아직 등록된 기도문이 없습니다.</p>
               <p>관리자 모드에서 이 주제의 기도문을 입력해 주세요.</p>
               <p style="margin-top:14px"><a class="btn btn-ghost btn-small" href="#/admin">관리자 모드로 이동</a></p>
             </div>`
      }
    </article>
    ${
      hasBody
        ? `<div class="font-controls" role="group" aria-label="글자 크기 조절">
             <button class="font-btn" id="font-down" ${state.fontStep === 0 ? "disabled" : ""}>가 −</button>
             <span class="font-label" id="font-label">${FONT_LABELS[state.fontStep]}</span>
             <button class="font-btn" id="font-up" ${state.fontStep === FONT_STEPS.length - 1 ? "disabled" : ""}>가 ＋</button>
           </div>`
        : ""
    }
    <nav class="prayer-nav" aria-label="이전·다음 기도문">
      ${prev ? `<a href="#/p/${prev.id}">← ${escapeHtml(prev.title)}</a>` : `<a class="disabled">← 이전</a>`}
      ${next ? `<a href="#/p/${next.id}">${escapeHtml(next.title)} →</a>` : `<a class="disabled">다음 →</a>`}
    </nav>
  `;

  if (!hasBody) return;
  const applyFont = () => {
    const bodyEl = document.getElementById("prayer-body");
    const label = document.getElementById("font-label");
    const down = document.getElementById("font-down");
    const up = document.getElementById("font-up");
    if (bodyEl) bodyEl.style.fontSize = FONT_STEPS[state.fontStep] + "px";
    if (label) label.textContent = FONT_LABELS[state.fontStep];
    if (down) down.disabled = state.fontStep === 0;
    if (up) up.disabled = state.fontStep === FONT_STEPS.length - 1;
    saveFontStep();
  };
  document.getElementById("font-down").addEventListener("click", () => {
    if (state.fontStep > 0) {
      state.fontStep--;
      applyFont();
    }
  });
  document.getElementById("font-up").addEventListener("click", () => {
    if (state.fontStep < FONT_STEPS.length - 1) {
      state.fontStep++;
      applyFont();
    }
  });
}

/* ---------- 관리자 로그인 ---------- */

function renderAdminLogin(view) {
  view.innerHTML = `
    ${demoBanner()}
    <div class="form-card">
      <h2 class="form-title">관리자 로그인</h2>
      <p class="form-error" id="login-error" hidden></p>
      <form id="login-form">
        <div class="field">
          <label for="pw">비밀번호</label>
          <input type="password" id="pw" name="password" autocomplete="current-password" placeholder="관리자 비밀번호를 입력하세요" />
        </div>
        <div class="form-actions">
          <button type="submit" class="btn" id="login-btn">로그인</button>
        </div>
      </form>
    </div>
  `;
  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("login-error");
    const btn = document.getElementById("login-btn");
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = "확인 중…";
    try {
      await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password: document.getElementById("pw").value }),
      });
      location.hash = "#/admin/panel";
    } catch (ex) {
      err.textContent =
        ex.status === 503
          ? "서버에 관리자 비밀번호가 설정되지 않았습니다. 먼저 wrangler secret put ADMIN_PASSWORD 를 실행하세요."
          : ex.message || "로그인에 실패했습니다.";
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = "로그인";
    }
  });
}

/* ---------- 관리자 패널 ---------- */

async function renderAdminPanel(view) {
  const me = await api("/api/admin/me");
  if (!me.admin) {
    location.hash = "#/admin";
    return;
  }
  await refreshTopics();
  const rows = state.topics
    .map(
      (t) => `
    <li class="admin-row">
      <span class="row-title">${escapeHtml(t.title)}</span>
      <span class="row-actions">
        <button class="btn btn-ghost btn-small" data-edit="${t.id}">수정</button>
        <button class="btn-danger" data-del="${t.id}">삭제</button>
      </span>
    </li>`
    )
    .join("");
  view.innerHTML = `
    ${demoBanner()}
    <div class="admin-bar">
      <h2>기도문 관리</h2>
      <a class="btn btn-small" href="#/admin/new">＋ 새 기도문</a>
    </div>
    ${
      state.topics.length
        ? `<ul class="admin-list">${rows}</ul>`
        : `<p class="empty-list">등록된 기도문이 없습니다.</p>`
    }
    <div class="logout-row">
      <button class="btn btn-ghost btn-small" id="logout-btn">로그아웃</button>
    </div>
  `;
  view.querySelectorAll("[data-edit]").forEach((b) =>
    b.addEventListener("click", () => {
      location.hash = `#/admin/edit/${b.dataset.edit}`;
    })
  );
  view.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", async () => {
      const target = state.topics.find((t) => t.id === Number(b.dataset.del));
      if (!confirm(`「${target ? target.title : ""}」 기도문을 삭제할까요?`)) return;
      try {
        await api(`/api/topics/${b.dataset.del}`, { method: "DELETE" });
        render();
      } catch (ex) {
        alert(ex.message || "삭제에 실패했습니다.");
      }
    })
  );
  document.getElementById("logout-btn").addEventListener("click", async () => {
    await api("/api/admin/logout", { method: "POST" }).catch(() => {});
    location.hash = "#/";
  });
}

/* ---------- 기도문 추가/수정 ---------- */

async function renderEditor(view, id) {
  const me = await api("/api/admin/me");
  if (!me.admin) {
    location.hash = "#/admin";
    return;
  }
  let topic = { title: "", body: "", sort_order: 9999 };
  if (id !== null) {
    const data = await api(`/api/topics/${id}`);
    topic = data.topic;
  }
  view.innerHTML = `
    ${demoBanner()}
    <div class="form-card wide">
      <h2 class="form-title">${id === null ? "새 기도문 추가" : "기도문 수정"}</h2>
      <p class="form-error" id="edit-error" hidden></p>
      <form id="edit-form">
        <div class="field">
          <label for="f-title">제목</label>
          <input id="f-title" maxlength="100" value="${escapeHtml(topic.title)}" placeholder="예) 아침 기도" />
        </div>
        <div class="field">
          <label for="f-body">기도문 본문</label>
          <textarea id="f-body" placeholder="기도문 본문을 입력하세요. 빈 줄로 문단을 나눌 수 있습니다.">${escapeHtml(topic.body)}</textarea>
          <p class="field-hint">다른 사람의 글을 그대로 복사하지 마세요. 직접 작성한 기도문을 입력해 주세요.</p>
        </div>
        <div class="field">
          <label for="f-order">정렬 순서</label>
          <input id="f-order" type="number" value="${escapeHtml(topic.sort_order)}" />
          <p class="field-hint">숫자가 작을수록 목록 앞에 표시됩니다.</p>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn" id="save-btn">저장</button>
          <a class="btn btn-ghost" href="#/admin/panel">취소</a>
        </div>
      </form>
    </div>
  `;
  document.getElementById("edit-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("edit-error");
    const btn = document.getElementById("save-btn");
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = "저장 중…";
    const payload = {
      title: document.getElementById("f-title").value,
      body: document.getElementById("f-body").value,
      sort_order: Number(document.getElementById("f-order").value) || 0,
    };
    try {
      if (id === null) {
        await api("/api/topics", { method: "POST", body: JSON.stringify(payload) });
      } else {
        await api(`/api/topics/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      }
      location.hash = "#/admin/panel";
    } catch (ex) {
      err.textContent = ex.message || "저장에 실패했습니다.";
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = "저장";
    }
  });
}

/* ---------- 시작 ---------- */

async function init() {
  loadFontStep();
  try {
    const res = await fetch("/api/topics");
    if (!res.ok) throw new Error("no-api");
    const data = await res.json();
    state.topics = (data.topics || []).sort(sortTopics);
    state.demo = false;
  } catch (e) {
    // 백엔드 연결 실패 → 데모 모드 (UI 미리보기용)
    state.demo = true;
    state.topics = loadDemoTopics().sort(sortTopics);
  }
  window.addEventListener("hashchange", render);
  render();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
