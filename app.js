(function () {
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const params = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/, "").replace(/^t=/, "t="));
  // parse #t=TOKEN[&v=...]
  function readHash() {
    const raw = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
    const out = {};
    raw.split("&").forEach((part) => {
      const i = part.indexOf("=");
      if (i === -1) return;
      out[decodeURIComponent(part.slice(0, i))] = decodeURIComponent(part.slice(i + 1));
    });
    return out;
  }

  const h = readHash();
  if (h.t) {
    try { localStorage.setItem("APP_TOKEN", h.t); } catch (e) {}
  }
  if (h.d) {
    try { localStorage.setItem("DATA_PATH", h.d); } catch (e) {}
  }
  let path = location.pathname;
  const lastSeg = path.split("/").pop() || "";
  if (!path.endsWith("/") && !lastSeg.includes(".")) path += "/";
  if (h.t || h.d || path !== location.pathname) {
    const rest = Object.keys(h).filter((k) => k !== "t" && k !== "d").map((k) => k + "=" + encodeURIComponent(h[k])).join("&");
    history.replaceState(null, "", path + location.search + (rest ? "#" + rest : ""));
  }
  const TOKEN = localStorage.getItem("APP_TOKEN") || "";
  const DATA = localStorage.getItem("DATA_PATH") || "";
  const PLAN_B = !!DATA;
  const FIXTURE = params.get("fixture") === "1";
  const EMPTY = params.get("empty") === "1";
  const FORCE_ERROR = params.get("error") === "1";
  let view = params.get("v") || h.v || "home";
  let currentMint = params.get("mint") || "SoDemoMint111111111111111111111111111111111";

  const state = {
    balance: 0,
    todayPct: 0,
    multiplier: 1,
    mode: "PAPER",
    agents: [],
    activity: [],
    account: {},
    settings: {},
    online: true,
    lastUpdate: null,
  };

  const TONES = {
    scanner: { letter: "S", label: "Scanner", badge: "🔭" },
    auditor: { letter: "A", label: "Auditor", badge: "🔍" },
    analyst: { letter: "N", label: "Analyst", badge: "🧠" },
    executor: { letter: "E", label: "Executor", badge: "⚡" },
    risk: { letter: "R", label: "Risk", badge: "🛡️" },
  };
  const EVENT_AGENT = {
    scan: "scanner",
    audit_layer: "auditor",
    audit_done: "auditor",
    verdict: "analyst",
    signal: "executor",
    fill: "executor",
    exit: "risk",
  };
  const liveUntil = { scanner: 0, auditor: 0, analyst: 0, executor: 0, risk: 0 };
  const WORK_MS = 6000;

  const REDUCE_MOTION = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const thoughtIdleIdx = { scanner: 0, auditor: 0, analyst: 0, executor: 0, risk: 0 };
  const thoughtTimers = { type: {}, homeRot: null, idleRot: [] };
  let homeThoughtAgent = "scanner";
  let thoughtBooted = false;

  function thoughtCtx() {
    const s = FIXTURE ? fixtures.state : state;
    return {
      agents: (s && s.agents) || defaultAgents(),
      activity: FIXTURE ? fixtures.activity : (state.activity || []),
      settings: FIXTURE ? fixtures.settings : (state.settings || {}),
      forceOff: !!(s && s.forceOff),
    };
  }

  function pickThought(name) {
    const DT = window.DeskThoughts;
    if (!DT) return "…";
    const ctx = thoughtCtx();
    const a = (ctx.agents || []).find((x) => x.name === name);
    const running = a ? a.running !== false : true;
    if (ctx.forceOff || !running) return DT.liveLine(name, ctx);
    const working = agentMode(name, running) === "working";
    const act = DT.agentFromActivity && (ctx.activity || []).some((r) => DT.agentFromActivity(r) === name);
    if (working || act) return DT.liveLine(name, ctx);
    return DT.idleLine(name, thoughtIdleIdx[name] || 0);
  }

  function typewrite(el, full, done) {
    if (!el) { if (done) done(); return; }
    const textEl = el.querySelector(".tb-text");
    if (!textEl) { if (done) done(); return; }
    const key = el.dataset.thought || "x";
    if (thoughtTimers.type[key]) {
      cancelAnimationFrame(thoughtTimers.type[key]);
      delete thoughtTimers.type[key];
    }
    el.setAttribute("title", full);
    const curOld = el.querySelector(".tb-cursor");
    if (curOld) curOld.remove();
    // Instant text for reduced-motion, fixtures/screenshots, and reliability
    if (REDUCE_MOTION || FIXTURE || EMPTY) {
      textEl.textContent = full;
      if (done) done();
      return;
    }
    let i = 0;
    textEl.textContent = "";
    const cur = document.createElement("span");
    cur.className = "tb-cursor";
    cur.textContent = "▍";
    textEl.after(cur);
    let last = 0;
    function step(ts) {
      if (!last) last = ts;
      // ~60cps
      const target = Math.min(full.length, Math.floor((ts - last) / 16));
      if (target > i) {
        i = target;
        textEl.textContent = full.slice(0, i);
      }
      if (i >= full.length) {
        textEl.textContent = full;
        delete thoughtTimers.type[key];
        setTimeout(() => { if (cur && cur.parentNode) cur.remove(); }, 300);
        if (done) done();
        return;
      }
      thoughtTimers.type[key] = requestAnimationFrame(step);
    }
    thoughtTimers.type[key] = requestAnimationFrame(step);
    // safety: never leave bubble empty
    setTimeout(() => {
      if (textEl.textContent.length < full.length) {
        textEl.textContent = full;
        if (cur && cur.parentNode) cur.remove();
      }
    }, 2500);
  }

  function bubbleHtml(name, text) {
    return `<div class="thought-bubble" data-thought="${name}" role="status" aria-live="polite"><span class="tb-text"></span></div>`;
  }

  function showBubble(el, name, immediate) {
    if (!el) return;
    const text = pickThought(name);
    el.dataset.thought = name;
    el.classList.remove("is-on");
    const apply = () => {
      typewrite(el, text, () => el.classList.add("is-on"));
      // fade on first: add is-on early for reduced motion / visibility
      if (REDUCE_MOTION || immediate) el.classList.add("is-on");
      else requestAnimationFrame(() => el.classList.add("is-on"));
    };
    if (immediate) apply();
    else setTimeout(apply, 40);
  }

  function mountHomeThoughts() {
    const row = document.querySelector("#view-home .orb-row");
    if (!row) return;
    let stage = document.querySelector("#home-thought-stage");
    if (!stage) {
      stage = document.createElement("div");
      stage.id = "home-thought-stage";
      stage.className = "thought-home-stage";
      stage.innerHTML = bubbleHtml(homeThoughtAgent, "");
      row.parentNode.insertBefore(stage, row);
    }
    const bub = stage.querySelector(".thought-bubble");
    showBubble(bub, homeThoughtAgent, true);
    // tap orb → focus that agent
    row.querySelectorAll(".orb-mini").forEach((mini) => {
      const orb = mini.querySelector("[data-orb]");
      if (!orb) return;
      mini.onclick = (ev) => {
        ev.stopPropagation();
        homeThoughtAgent = orb.dataset.orb;
        showBubble(bub, homeThoughtAgent, true);
      };
    });
  }

  function mountAgentsThoughts() {
    const list = document.querySelectorAll("#view-agents .agent-full, #view-agents .orb-mini");
    // cards
    document.querySelectorAll("#view-agents .agent-full").forEach((card, idx) => {
      const orb = card.querySelector("[data-orb]");
      if (!orb) return;
      const name = orb.dataset.orb;
      let bub = card.querySelector(".thought-bubble");
      if (!bub) {
        bub = document.createElement("div");
        bub.className = "thought-bubble";
        bub.dataset.thought = name;
        bub.setAttribute("role", "status");
        bub.innerHTML = '<span class="tb-text"></span>';
        const head = card.querySelector(".setting-row, .head");
        if (head) card.insertBefore(bub, head);
        else card.prepend(bub);
      }
      // stagger initial reveal (per-bubble typewriter keys)
      setTimeout(() => showBubble(bub, name, true), 120 + idx * 220);
      card.addEventListener("click", (ev) => {
        if (ev.target.closest("[data-toggle]")) return;
        showBubble(bub, name, true);
      });
    });
    if (FIXTURE && params.get("scroll") === "end") {
      requestAnimationFrame(() => {
        const cards = document.querySelectorAll("#view-agents .agent-full");
        if (cards.length) cards[cards.length - 1].scrollIntoView({ block: "end", behavior: "instant" });
      });
    }
  }

  function advanceIdleThoughts() {
    const DT = window.DeskThoughts;
    if (!DT) return;
    const now = Date.now();
    DT.AGENTS.forEach((name, i) => {
      // each agent advances on its own ~10s cadence, staggered by 2s
      const period = 10000;
      const offset = i * 2000;
      const slot = Math.floor((now - offset) / period);
      const prev = thoughtIdleIdx["_" + name + "slot"];
      if (prev === slot) return;
      thoughtIdleIdx["_" + name + "slot"] = slot;
      thoughtIdleIdx[name] = (thoughtIdleIdx[name] || 0) + 1;
      if (view === "home" && name === homeThoughtAgent) {
        const bub = document.querySelector("#home-thought-stage .thought-bubble");
        if (bub) showBubble(bub, name, true);
      }
      if (view === "agents") {
        const bub = document.querySelector('#view-agents .thought-bubble[data-thought="' + name + '"]');
        if (bub) showBubble(bub, name, true);
      }
    });
  }

  function rotateHomeThoughtAgent() {
    const DT = window.DeskThoughts;
    if (!DT || view !== "home") return;
    const names = DT.AGENTS;
    const ix = names.indexOf(homeThoughtAgent);
    homeThoughtAgent = names[(ix + 1) % names.length];
    const bub = document.querySelector("#home-thought-stage .thought-bubble");
    if (bub) showBubble(bub, homeThoughtAgent, true);
  }

  function ensureThoughtLoops() {
    if (thoughtBooted) return;
    thoughtBooted = true;
    setInterval(rotateHomeThoughtAgent, 10000);
    setInterval(advanceIdleThoughts, 9000);
  }


  function markWorking(name) {
    if (!name || !(name in liveUntil)) return;
    liveUntil[name] = Date.now() + WORK_MS;
    syncOrbs();
    if (view === "home" && name === homeThoughtAgent) {
      const bub = document.querySelector("#home-thought-stage .thought-bubble");
      if (bub) showBubble(bub, name, true);
    }
    if (view === "agents") {
      const bub = document.querySelector('#view-agents .thought-bubble[data-thought="' + name + '"]');
      if (bub) showBubble(bub, name, true);
    }
  }

  function agentMode(name, running) {
    if (running === false) return "paused";
    if ((liveUntil[name] || 0) > Date.now()) return "working";
    return "idle";
  }

  function modeLabel(mode) {
    if (mode === "working") return "Working";
    if (mode === "paused") return "Paused";
    return "Idle";
  }

  function defaultAgents() {
    return Object.keys(TONES).map((name) => ({
      name, label: TONES[name].label, running: true, count: 0, unit: "",
    }));
  }

  function orbHtml(name, running) {
    const tone = TONES[name] || { letter: "?", badge: "✨", label: name };
    const mode = agentMode(name, running);
    const label = tone.label || name;
    return `<div class="agent-orb is-${mode}" data-orb="${name}" data-tone="${name}" data-running="${running === false ? "0" : "1"}" role="img" aria-label="${label} ${mode}">
      <span class="orb-ring" aria-hidden="true"></span>
      <span class="orb-face" aria-hidden="true">🤖</span>
      <span class="orb-badge" aria-hidden="true">${tone.badge || "✨"}</span>
      <span class="orb-sleep" aria-hidden="true">😴</span>
    </div>`;
  }

  function orbRow(agents) {
    const list = agents && agents.length ? agents : defaultAgents();
    return `<div class="orb-row" aria-label="AI agents">` + list.map((a) => {
      const mode = agentMode(a.name, a.running);
      return `<div class="orb-mini">
        ${orbHtml(a.name, a.running)}
        <div class="orb-name">${a.label || a.name}</div>
        <div class="orb-status ${mode}">${modeLabel(mode)}</div>
      </div>`;
    }).join("") + `</div>`;
  }

  function syncOrbs() {
    document.querySelectorAll("[data-orb]").forEach((el) => {
      const name = el.dataset.orb;
      const running = el.dataset.running !== "0";
      const mode = agentMode(name, running);
      el.classList.remove("is-idle", "is-working", "is-paused");
      el.classList.add("is-" + mode);
      const wrap = el.closest(".orb-mini, .agent-card-head, .head, .agent-full");
      const lab = wrap && wrap.querySelector(".orb-status");
      if (lab) {
        lab.textContent = modeLabel(mode);
        lab.className = "orb-status " + mode;
      }
    });
  }

  function authHeaders() {
    return { "X-App-Token": TOKEN, Authorization: "Bearer " + TOKEN, Accept: "application/json" };
  }

  function assetBase() {
    let p = location.pathname;
    const last = p.split("/").pop() || "";
    if (p.endsWith("/")) return p;
    if (last.includes(".")) return p.slice(0, p.lastIndexOf("/") + 1);
    return p + "/";
  }

  let planBRoute = "";
  let planBKey = null;
  async function initPlanBCrypto() {
    if (planBKey) return;
    const encoder = new TextEncoder();
    const route = await crypto.subtle.digest("SHA-256", encoder.encode("route:" + DATA));
    planBRoute = Array.from(new Uint8Array(route), (x) => x.toString(16).padStart(2, "0")).join("");
    const key = await crypto.subtle.digest("SHA-256", encoder.encode("encrypt:" + DATA));
    planBKey = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["decrypt"]);
  }
  function planBFile(rel) {
    return assetBase() + "d/" + planBRoute + "/" + rel + "?t=" + Date.now();
  }

  function mapPlanB(path) {
    const raw = path.split("?")[0];
    if (raw === "/api/state") return planBFile("state.json");
    if (raw === "/api/chart") return planBFile("chart.json");
    if (raw === "/api/activity") return planBFile("activity.json");
    if (raw === "/api/account") return planBFile("account.json");
    if (raw === "/api/settings") return planBFile("settings.json");
    let m = raw.match(/^\/api\/coin\/(.+)$/);
    if (m) return planBFile("coin/" + encodeURIComponent(m[1]) + ".json");
    m = raw.match(/^\/api\/audit\/(.+)$/);
    if (m) return planBFile("audit/" + encodeURIComponent(m[1]) + ".json");
    m = raw.match(/^\/api\/agents\/([^/]+)\/decisions$/);
    if (m) return planBFile("agents/" + encodeURIComponent(m[1]) + ".json");
    return null;
  }

  async function api(path, opts = {}) {
    if (FIXTURE || EMPTY) return null;
    if (PLAN_B) {
      const method = (opts.method || "GET").toUpperCase();
      if (method !== "GET") throw new Error("Use Telegram to change the desk");
      await initPlanBCrypto();
      const url = mapPlanB(path);
      if (!url) throw new Error("http 404");
      const res = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("http " + res.status);
      const envelope = await res.json();
      if (envelope.v !== 1 || !envelope.iv || !envelope.data) throw new Error("Invalid encrypted snapshot");
      const bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
      const plaintext = await crypto.subtle.decrypt({name: "AES-GCM", iv: bytes(envelope.iv)}, planBKey, bytes(envelope.data));
      return JSON.parse(new TextDecoder().decode(plaintext));
    }
    const res = await fetch(path, {
      ...opts,
      headers: { ...authHeaders(), ...(opts.headers || {}), "Content-Type": "application/json" },
    });
    if (res.status === 401) throw new Error("unauthorized");
    if (!res.ok) throw new Error("http " + res.status);
    return res.json();
  }

  const fixtures = {
    state: {
      balance: 247.32, todayPct: 23.66, multiplier: 1.2366, mode: "PAPER", paper: true,
      buysPaused: false, fomo_handle: "Araos",
      agents: [
        { name: "scanner", label: "Scanner", running: true, count: 12, unit: "pools" },
        { name: "auditor", label: "Auditor", running: true, count: 4, unit: "taken apart" },
        { name: "analyst", label: "Analyst", running: true, count: 3, unit: "scored" },
        { name: "executor", label: "Executor", running: true, count: 2, unit: "trades" },
        { name: "risk", label: "Risk", running: true, count: 1, unit: "exits" },
      ],
    },
    chart: {
      startValue: 200,
      points: Array.from({ length: 30 }, (_, i) => ({ t: i, v: 200 + Math.sin(i / 4) * 8 + i * 1.4 })),
      marks: [{ kind: "bought", title: "Bought MWL$", value: "$47.50" }, { kind: "sold", title: "+$12.10", value: "+$12.10" }],
    },
    activity: [
      { id: 3, kind: "bought", mint: currentMint, title: "Bought MWL$", subtitle: "Executor · 21:02", value: "$47.50 · 23.75% of stack", link: "#" },
      { id: 2, kind: "rejected", mint: currentMint, title: "Rejected PEPE2", subtitle: "Auditor · freeze not revoked", value: "Skipped", link: "#" },
      { id: 1, kind: "sold", mint: currentMint, title: "Sold DOGE3", subtitle: "Risk · trailing stop", value: "+$12.10 · +18.2%", link: "#" },
    ],
    coin: {
      mint: currentMint, name: "Majestic White Lion", symbol: "MWL$", holders: 29,
      price: 0.00001234, migrated_at: new Date(Date.now() - 11 * 3600 * 1000).toISOString(),
      shield: "8/8",
      candles: Array.from({ length: 40 }, (_, i) => {
        const o = 10 + Math.sin(i / 3); const c = o + (i % 3 ? 0.4 : -0.3);
        return { t: i, o, h: Math.max(o, c) + 0.3, l: Math.min(o, c) - 0.2, c, v: 20 + i };
      }),
      stats: { marketCap: 125000, liquidity: 52000, volume24: 1131 },
      position: { entry_price: 0.00001, size_usd: 47.5, stop_price: 0.0000094, stop_pct: 6, trail_active: 0, status: "open" },
      coin_url: `https://fomo.family/coin?address=${currentMint}&chainId=1399811149&r=Araos&source=share_link`,
      stopPct: 6, trailPct: 12, trailStartPct: 20,
    },
    audit: {
      mint: currentMint, name: "Majestic White Lion", rejected: false,
      coin_url: `https://fomo.family/coin?address=${currentMint}&chainId=1399811149&r=Araos&source=share_link`,
      layers: [
        { n: 1, name: "Mint authority", pass: true, value: "Revoked" },
        { n: 2, name: "Freeze authority", pass: true, value: "Revoked" },
        { n: 3, name: "Dev wallet", pass: true, value: "0.9% · sold 0" },
        { n: 4, name: "Top 10 holders", pass: true, value: "16.8%" },
        { n: 5, name: "Liquidity", pass: true, value: "100% locked" },
        { n: 6, name: "Pool age", pass: true, value: "43m" },
        { n: 7, name: "Bundled wallets", pass: true, value: "None" },
        { n: 8, name: "Delegations", pass: true, value: "None" },
      ],
    },
    account: {
      mode: "PAPER", stack: 247.32, balance: 247.32, fomo_handle: "Araos",
      profile_url: "https://fomo.family/profile/Araos?source=share_link&r=Araos",
      signup_url: "https://fomo.family/r/Araos", telegram: true,
      liveGate: { ok: false, count: 0, need: 30, message: "LIVE needs 30+ closed PAPER trades (have 0)." },
    },
    settings: {
      "scanner.min_liquidity_usd": 40000, "risk.stop_pct": 6, "risk.trail_pct": 12,
      "executor.stack_pct": 8, "desk.mode": "PAPER", "analyst.min_score": 70,
    },
    decisions: {
      scanner: [{ ts: "21:01", mint: currentMint, verdict: "pass", reason: null, coin_url: "#" }],
      auditor: [{ ts: "21:01", mint: currentMint, verdict: "pass", reason: null, coin_url: "#" }],
      analyst: [{ ts: "21:02", mint: currentMint, verdict: "pass", reason: null, coin_url: "#" }],
      executor: [{ ts: "21:02", mint: currentMint, verdict: "sent", reason: null, coin_url: "#" }],
      risk: [{ ts: "21:18", mint: currentMint, verdict: "trail", reason: "trail", coin_url: "#" }],
    },
  };

  function showError(msg) {
    const el = $("#error-banner");
    el.textContent = msg;
    el.classList.toggle("hidden", !msg);
  }

  function setView(name) {
    view = name;
    $$(".view").forEach((v) => v.classList.add("hidden"));
    const node = $("#view-" + name);
    if (node) node.classList.remove("hidden");
    $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  }

  function fmtMoney(n) {
    if (n == null || Number.isNaN(n)) return "—";
    return "$" + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtPct(n) {
    if (n == null || Number.isNaN(n)) return "—";
    const s = (n >= 0 ? "+" : "") + Number(n).toFixed(2) + "%";
    return s;
  }

  function navbar(title, extra = "") {
    return `<div class="navbar">
      <button class="avatar" data-go="account">A</button>
      <div class="title">${title}</div>
      ${extra}
      <button class="icon-btn" id="bell">🔔<span class="dot"></span></button>
    </div>`;
  }


  let forceOffPending = false;
  function forceBarHtml(s) {
    const off = !!(s && s.forceOff);
    if (PLAN_B) {
      return `<div class="force-status ${off ? "" : "on"}">${off ? "🛑 FORCE OFF" : "🟢 Agents ON"}</div>
        <p class="force-hint">Plan B (Pages) est en lecture seule — utilise Telegram · /forceon · /forceoff</p>
        <div class="force-bar">
          <button class="force-btn on" disabled>🟢 FORCE ON</button>
          <button class="force-btn off" disabled>🛑 FORCE OFF</button>
        </div>`;
    }
    return `<div class="force-status ${off ? "" : "on"}">${off ? "🛑 FORCE OFF — desk arrêté" : "🟢 Desk actif"}</div>
      <div class="force-bar">
        <button class="force-btn on" data-force="on" ${off ? "" : "disabled"}>🟢 FORCE ON</button>
        <button class="force-btn off ${forceOffPending ? "pending" : ""}" data-force="off">${forceOffPending ? "✅ Confirmer OFF" : "🛑 FORCE OFF"}</button>
      </div>
      ${forceOffPending ? '<p class="force-hint">Retape FORCE OFF pour confirmer (clôture PAPER / liens Sell en LIVE)</p>' : ""}`;
  }

  function renderHome() {
    const el = $("#view-home");
    if (EMPTY) {
      el.innerHTML = navbar("Grok Bot ›") + `<div class="home-pad">
        <div class="balance">$0.00 <span class="pill paper">PAPER</span></div>
        <div class="subrow"><span>+0.00%</span></div>
        ${forceBarHtml({ forceOff: false })}
        <canvas id="home-chart" class="chart-wrap"></canvas>
        <p class="empty">Waiting for the first trade</p>
        <div class="section-h"><h2>Agents · 5 running</h2></div>
        ${orbRow(defaultAgents())}
        <div class="agent-card"><div class="agent-card-head">${orbHtml("scanner", true)}<div><h3>Scanner</h3><div class="orb-status idle">Idle</div></div></div><div class="meta">Listening for graduations</div></div>
        <div class="section-h"><h2>Activity</h2></div>
        <p class="empty">Nothing yet tonight</p>
      </div>`;
      requestAnimationFrame(() => DeskCharts.lineChart($("#home-chart"), { points: [] }));
      mountHomeThoughts();
      ensureThoughtLoops();
      return;
    }
    const s = FIXTURE ? fixtures.state : state;
    const paper = (s.mode || "PAPER") === "PAPER";
    el.innerHTML = navbar("Grok Bot ›", `<input class="search" placeholder="Search name, symbol or mint" id="search">`) +
      `<div class="home-pad">
        <div class="balance num">${fmtMoney(s.balance)} ${paper ? '<span class="pill paper">PAPER</span>' : ""}</div>
        <div class="subrow">
          <span class="pct ${s.todayPct >= 0 ? "up" : "down"}">${fmtPct(s.todayPct)}</span>
          <span class="pill green">${Number(s.multiplier || 1).toFixed(2)}×</span>
        </div>
        ${forceBarHtml(s)}
        <canvas id="home-chart" class="chart-wrap"></canvas>
        <div class="ranges">${["LIVE","1H","4H","1D","1W","ALL"].map((r) => `<button data-range="${r}" class="${r==="LIVE"?"on":""}">${r}</button>`).join("")}</div>
        <div class="section-h"><h2>Agents · 5 running</h2></div>
        ${orbRow(s.agents)}
        <div class="carousel" id="carousel"></div>
        <div class="section-h"><h2>Activity</h2><span data-go="activity">See all</span></div>
        <div id="home-activity"></div>
      </div>`;
    const carousel = $("#carousel");
    (s.agents || defaultAgents()).forEach((a) => {
      const mode = agentMode(a.name, a.running);
      const card = document.createElement("div");
      card.className = "agent-card";
      card.innerHTML = `<div class="agent-card-head">${orbHtml(a.name, a.running)}<div>
        <h3>${a.label}</h3>
        <div class="orb-status ${mode}">${modeLabel(mode)}</div>
      </div></div>
        <div class="meta">${a.count} ${a.unit}</div>
        <div class="feed"><div class="row"><span>${a.label} is ${a.running ? "running" : "paused"}</span></div></div>`;
      carousel.appendChild(card);
    });
    drawActivity($("#home-activity"), (FIXTURE ? fixtures.activity : state.activity).slice(0, 5));
    loadChart("LIVE");
    mountHomeThoughts();
    ensureThoughtLoops();
  }

  async function loadChart(range) {
    const canvas = $("#home-chart");
    if (!canvas) return;
    let data;
    if (FIXTURE) data = fixtures.chart;
    else {
      try {
        data = await api("/api/chart?range=" + encodeURIComponent(range));
        if (data && data[range] && data[range].points) data = data[range];
      } catch (e) { data = { points: [] }; }
    }
    DeskCharts.lineChart(canvas, { points: data.points || [], startValue: data.startValue, marks: data.marks });
  }

  function drawActivity(node, rows) {
    if (!node) return;
    if (!rows || !rows.length) { node.innerHTML = `<p class="empty">Nothing yet tonight</p>`; return; }
    node.innerHTML = rows.map((r) => `<div class="activity-row" data-mint="${r.mint || ""}" data-kind="${r.kind || ""}">
      <div class="grow"><div class="title">${r.title || ""}</div><div class="sub">${r.subtitle || ""}</div></div>
      <div class="right">${r.value || ""}</div>
    </div>`).join("");
  }

  function renderAgents() {
    const el = $("#view-agents");
    if (EMPTY) {
      el.innerHTML = navbar("Agents") + `<div class="screen">${orbRow(defaultAgents())}<p class="empty">Listening for graduations</p></div>`;
      mountAgentsThoughts();
      ensureThoughtLoops();
      return;
    }
    const s = FIXTURE ? fixtures.state : state;
    el.innerHTML = navbar("Agents") + `<div class="screen">${orbRow(s.agents)}<div id="agents-list"></div></div>`;
    const list = $("#agents-list");
    (s.agents || defaultAgents()).forEach((a) => {
      const mode = agentMode(a.name, a.running);
      const card = document.createElement("div");
      card.className = "full-card agent-full";
      card.innerHTML = `<div class="setting-row">
        <div class="head">${orbHtml(a.name, a.running)}<div>
          <strong>${a.label}</strong>
          <div class="orb-status ${mode}">${modeLabel(mode)}</div>
          <div class="sub">${a.count} ${a.unit}</div>
        </div></div>
        ${PLAN_B ? `<span class="sub">via Telegram</span>` : `<button class="btn ghost" data-toggle="${a.name}" style="width:auto;padding:0 16px;margin:0;min-height:44px">${a.running ? "Pause" : "Resume"}</button>`}
      </div>
      <div class="feed" data-decisions="${a.name}"><div class="skel" style="height:60px"></div></div>`;
      list.appendChild(card);
      loadDecisions(a.name, card.querySelector("[data-decisions]"));
    });
    mountAgentsThoughts();
    ensureThoughtLoops();
  }

  async function loadDecisions(name, node) {
    let rows = [];
    if (FIXTURE) rows = fixtures.decisions[name] || [];
    else {
      try { const data = await api("/api/agents/" + name + "/decisions"); rows = data.rows || []; }
      catch (e) { rows = []; }
    }
    if (!rows.length) { node.innerHTML = `<p class="empty">No decisions yet</p>`; return; }
    node.innerHTML = rows.map((r) => `<div class="row"><span>${(r.ts || "").slice(11, 16)} ${(r.mint || "").slice(0, 6)} ${r.verdict}</span><span>${r.reason || ""}</span></div>`).join("");
  }

  function renderActivity() {
    const el = $("#view-activity");
    el.innerHTML = navbar("Activity") + `<div class="screen" id="act-list"></div>`;
    if (EMPTY) { $("#act-list").innerHTML = `<p class="empty">Nothing yet tonight</p>`; return; }
    drawActivity($("#act-list"), FIXTURE ? fixtures.activity : state.activity);
  }

  function renderAccount() {
    const el = $("#view-account");
    if (EMPTY) {
      el.innerHTML = navbar("Account") + `<div class="screen"><p class="empty">Sign in token saved. Waiting for desk data.</p></div>`;
      return;
    }
    const acc = FIXTURE ? fixtures.account : state.account;
    const sets = FIXTURE ? fixtures.settings : (state.settings || {});
    const paper = (acc.mode || "PAPER") === "PAPER";
    const settingKeys = Object.keys(sets).slice(0, 18);
    const readOnly = PLAN_B;
    el.innerHTML = navbar("Account") + `<div class="screen">
      ${paper ? '<span class="pill paper">PAPER</span>' : ""}
      ${readOnly ? `<div class="setting-row"><span>Mode</span><span>${acc.mode || "PAPER"}</span></div>
        <p class="empty">Mode, pause and settings are changed in Telegram</p>` : `<div class="setting-row"><span>Mode</span>
        <div>
          <button class="btn ghost" id="btn-paper" style="width:auto;display:inline-flex;padding:0 14px;margin:0">PAPER</button>
          <button class="btn ghost" id="btn-live" style="width:auto;display:inline-flex;padding:0 14px;margin:0">LIVE</button>
        </div>
      </div>`}
      <div class="setting-row"><span>Stack</span><span class="num">${fmtMoney(acc.stack || acc.balance)}</span></div>
      <a class="setting-row" href="${acc.profile_url || "#"}" target="_blank" rel="noopener"><span>Your FOMO profile</span><span>@${acc.fomo_handle || "Araos"}</span></a>
      <button class="setting-row" id="invite" style="width:100%"><span>Invite a friend</span><span>Share</span></button>
      ${readOnly ? `<div class="setting-row"><span>Notifications</span><span>Telegram only</span></div>` : `<div class="setting-row"><span>Telegram</span><span>connected</span></div>
      <button class="btn ghost" id="test-push">Send test push</button>`}
      <h2>Settings</h2>
      ${settingKeys.map((k) => readOnly
        ? `<div class="setting-row"><span>${k}</span><span class="num">${sets[k]}</span></div>`
        : `<div class="setting-row"><span>${k}</span><input data-key="${k}" value="${sets[k]}"></div>`).join("")}
      <p class="empty">${(acc.liveGate && acc.liveGate.message) || ""}</p>
    </div>`;
    const invite = $("#invite");
    if (invite) invite.onclick = () => {
      const url = acc.signup_url;
      if (navigator.share) navigator.share({ title: "FOMO", url });
      else { navigator.clipboard.writeText(url); invite.querySelector("span:last-child").textContent = "Link copied"; }
    };
    const live = $("#btn-live");
    if (live) live.onclick = async () => {
      const typed = prompt("Type LIVE to confirm");
      if (typed !== "LIVE") return;
      try { await api("/api/mode", { method: "POST", body: JSON.stringify({ mode: "LIVE", confirm: "LIVE" }) }); await boot(); }
      catch (e) { alert((e && e.message) || "LIVE refused"); }
    };
    $$("input[data-key]").forEach((inp) => {
      inp.onchange = async () => {
        try { await api("/api/settings", { method: "POST", body: JSON.stringify({ key: inp.dataset.key, value: inp.value }) }); }
        catch (e) { alert(e.message); }
      };
    });
  }

  function renderAuditor(data) {
    const el = $("#view-auditor");
    if (EMPTY) {
      el.innerHTML = navbar("Auditor") + `<div class="screen"><p class="empty">No coin taken apart yet</p></div>`;
      return;
    }
    const a = data || fixtures.audit;
    el.innerHTML = navbar(a.name || "Auditor") + `<div class="screen">
      ${a.rejected ? `<h2 class="bad">Rejected · ${a.reason}</h2><p>Grok Bot won't buy ${a.name || ""}</p>` : `<h2 class="ok">Cleared · 8/8 parts</h2><p>Sent to Executor</p>`}
      <div class="discs">${(a.layers || []).map((L) => `<div class="disc ${L.pass===false?"fail":L.pass?"pass":""}">${L.n}. ${L.name}</div>`).join("")}</div>
      <div class="layers">${(a.layers || []).map((L) => `<div class="layer"><span>${L.name}</span><span class="${L.pass===false?"bad":L.pass?"ok":"grey"}">${L.value}</span></div>`).join("")}</div>
      <a class="btn" href="${a.coin_url}" target="_blank" rel="noopener">Open on FOMO</a>
    </div>`;
  }

  function renderCoin(data) {
    const el = $("#view-coin");
    if (EMPTY) {
      el.innerHTML = navbar("Coin") + `<div class="screen"><p class="empty">No position</p></div>`;
      return;
    }
    const c = data || fixtures.coin;
    const paper = true;
    const pos = c.position;
    el.innerHTML = navbar(`${c.name || c.symbol || "Coin"} ${paper ? '<span class="pill paper">PAPER</span>' : ""}`) +
      `<div class="screen">
        <div class="sub">${c.symbol || ""} · Solana ${c.shield ? "· " + c.shield : ""}</div>
        <div class="price num">${c.price != null ? c.price : "—"}</div>
        <canvas id="coin-chart" class="chart-wrap" style="height:220px"></canvas>
        <div class="setting-row"><span>Market cap</span><span>${c.stats && c.stats.marketCap != null ? fmtMoney(c.stats.marketCap) : "—"}</span></div>
        <div class="setting-row"><span>Liquidity</span><span>${c.stats && c.stats.liquidity != null ? fmtMoney(c.stats.liquidity) : "—"}</span></div>
        <div class="setting-row"><span>Holders</span><span>${c.holders != null ? c.holders : "n/a"}</span></div>
        ${pos ? `<div class="card"><div>Your position · ${fmtMoney(pos.size_usd)} in · Executor</div>
          <div class="sub">stop -${pos.stop_pct}%</div></div>` : ""}
        <a class="btn" href="${c.coin_url}" target="_blank" rel="noopener">${pos ? "Sell on FOMO" : "Buy on FOMO"}</a>
      </div>`;
    const canvas = $("#coin-chart");
    if (canvas) DeskCharts.candles(canvas, c.candles || []);
  }

  async function openAuditor(mint) {
    currentMint = mint;
    setView("auditor");
    if (FIXTURE || EMPTY) { renderAuditor(); return; }
    try { renderAuditor(await api("/api/audit/" + mint)); }
    catch (e) { showError("No snapshot for this coin · retry later"); }
  }
  async function openCoin(mint) {
    currentMint = mint;
    setView("coin");
    if (FIXTURE || EMPTY) { renderCoin(); return; }
    try { renderCoin(await api("/api/coin/" + mint)); }
    catch (e) { showError("No snapshot for this coin · retry later"); }
  }

  document.body.addEventListener("click", (e) => {
    const tab = e.target.closest("[data-tab]");
    if (tab) { setView(tab.dataset.tab); paint(); return; }
    const go = e.target.closest("[data-go]");
    if (go) { setView(go.dataset.go); paint(); return; }
    const range = e.target.closest("[data-range]");
    if (range) {
      $$(".ranges button").forEach((b) => b.classList.toggle("on", b === range));
      loadChart(range.dataset.range);
      return;
    }
    const row = e.target.closest(".activity-row");
    if (row && row.dataset.mint) {
      if (row.dataset.kind === "rejected") openAuditor(row.dataset.mint);
      else openCoin(row.dataset.mint);
    }
    const tog = e.target.closest("[data-toggle]");
    if (tog) {
      if (PLAN_B) return;
      const name = tog.dataset.toggle;
      api("/api/agents/" + name + "/" + (tog.textContent.trim() === "Pause" ? "pause" : "resume"), { method: "POST" });
    }
    const force = e.target.closest("[data-force]");
    if (force) {
      if (PLAN_B) { showError("Plan B lecture seule — utilise Telegram"); return; }
      const kind = force.dataset.force;
      if (kind === "off") {
        if (!forceOffPending) {
          forceOffPending = true;
          paint();
          return;
        }
        forceOffPending = false;
        api("/api/force/off", { method: "POST" }).then(() => boot()).catch((err) => showError(String(err.message || err)));
        return;
      }
      if (kind === "on") {
        forceOffPending = false;
        api("/api/force/on", { method: "POST" }).then(() => boot()).catch((err) => showError(String(err.message || err)));
      }
    }
  });

  function onDeskEvent(kind, raw) {
    const agent = EVENT_AGENT[kind];
    if (!agent) return;
    markWorking(agent);
    state.lastUpdate = new Date();
  }

  function consumeSse(buf) {
    const parts = buf.split("\n\n");
    const rest = parts.pop();
    parts.forEach((block) => {
      let ev = "message", data = "";
      block.split("\n").forEach((line) => {
        if (line.startsWith("event:")) ev = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      });
      if (ev !== "hello" && ev !== "message") onDeskEvent(ev, data);
    });
    return rest || "";
  }

  async function connectStream() {
    if (FIXTURE || EMPTY || PLAN_B || !TOKEN) return;
    try {
      const res = await fetch("/api/stream", { headers: authHeaders() });
      if (!res.ok) throw new Error("sse " + res.status);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf = consumeSse(buf + dec.decode(value, { stream: true }));
      }
    } catch (e) {
      retryError();
    }
  }

  let retry = 3;
  function retryError() {
    state.online = false;
    const t = state.lastUpdate ? state.lastUpdate.toLocaleTimeString() : "never";
    showError(`Desk offline · retrying in ${retry}s · last update ${t}`);
    setTimeout(() => { retry = Math.min(30, retry + 2); boot(); }, retry * 1000);
  }

  async function boot() {
    if (FORCE_ERROR) {
      showError("Desk offline · retrying in 5s · last update never");
    }
    if (FIXTURE || EMPTY) {
      Object.assign(state, fixtures.state);
      state.activity = fixtures.activity;
      state.account = fixtures.account;
      state.settings = fixtures.settings;
      paint();
      return;
    }
    try {
      const s = await api("/api/state");
      Object.assign(state, s);
      const act = await api("/api/activity");
      state.activity = (act && act.rows) || [];
      const acc = await api("/api/account");
      state.account = acc || {};
      const st = await api("/api/settings");
      state.settings = (st && st.settings) || {};
      state.lastUpdate = s.publishedAt ? new Date(s.publishedAt) : new Date();
      state.online = true;
      if (!FORCE_ERROR) showError(PLAN_B ? "Snapshot · " + state.lastUpdate.toLocaleTimeString("fr-FR", {timeZone: "Europe/Paris"}) + " Europe/Paris · refresh ~6 min" : "");
      retry = 3;
      (state.agents || []).forEach((a) => {
        const ts = a.last && a.last.ts;
        if (!ts) return;
        const parsed = Date.parse(ts);
        if (!Number.isNaN(parsed) && Date.now() - parsed < WORK_MS) markWorking(a.name);
      });
      paint();
    } catch (e) {
      paint();
      retryError();
    }
  }

  function paint() {
    if (view === "home") renderHome();
    else if (view === "agents") renderAgents();
    else if (view === "activity") renderActivity();
    else if (view === "account") renderAccount();
    else if (view === "auditor") { if (FIXTURE || EMPTY) renderAuditor(); else openAuditor(currentMint); }
    else if (view === "coin") { if (FIXTURE || EMPTY) renderCoin(); else openCoin(currentMint); }
    else { view = "home"; renderHome(); }
  }

  setView(["home","agents","activity","account","auditor","coin"].includes(view) ? view : "home");
  boot();
  connectStream();
  setInterval(syncOrbs, 800);
  if (PLAN_B && !FIXTURE && !EMPTY) setInterval(boot, 30000);
})();
