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
  let currentPositionId = Number(params.get("position")) || 1;

  const state = {
    balance: 0,
    todayPct: 0,
    multiplier: 1,
    mode: "PAPER", profile: "medium", profileLabel: "Medium — équilibré",
    agents: [],
    activity: [],
    positions: [],
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
  const WORK_MS = 60000;

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
    if (mode === "working") return "Réfléchit";
    if (mode === "paused") return "En pause";
    return "Veille";
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
    if (raw === "/api/positions") return planBFile("positions.json");
    let pm = raw.match(/^\/api\/position\/(\d+)$/);
    if (pm) return planBFile("position/" + encodeURIComponent(pm[1]) + ".json");
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

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
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
      profile: "medium", profileLabel: "Medium — équilibré",
      buysPaused: false, fomo_handle: "Araos",
      goal:{multiplier:2,start:200,current:247.32,target:400,progressPct:61.83,reachedAt:null},
      positions: [],
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
    position: {
      mint: currentMint, name:"Majestic White Lion", symbol:"MWL$", price:0.00001234,
      coin_url: `https://fomo.family/coin?address=${currentMint}&chainId=1399811149&r=Araos&source=share_link`,
      position:{id:1,opened_at:new Date(Date.now()-3600000).toISOString(),entry_price:0.00001,size_usd:47.5,peak_price:0.000014,stop_price:0.000011,stop_pct:6,status:"open",trail_active:1,mode:"PAPER",profile:"medium",source:"veil"},
      prices:Array.from({length:20},(_,i)=>({ts:new Date(Date.now()-(20-i)*60000).toISOString(),price:0.00001+i*0.0000002})),
      stops:[{ts:new Date(Date.now()-3600000).toISOString(),stop:0.0000094,peak:0.00001},{ts:new Date(Date.now()-600000).toISOString(),stop:0.000011,peak:0.000014,trail_active:1}],
      pipeline:[{label:"Scanner trouvé",done:true},{label:"Auditor OK",done:true,value:"8/8"},{label:"Analyst",done:true,value:"Score 75"},{label:"Executor acheté",done:true,value:"PAPER"},{label:"Risk stop suiveur",done:true,value:"Actif"}],
      why:{analystScore:75,liquidity:52000,source:"veil",layers:[{name:"Mint authority",value:"Revoked",pass:true,source:"chain"},{name:"Top 10 holders",value:"16.8%",pass:true,source:"chain"}]},
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
    $("#tabbar").classList.toggle("hidden",name==="coin");
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

  let unsafePending = false;
  function modeBarHtml(s) {
    const cur = (s && s.profile) || "medium";
    const labels = {
      safe: "🛡 Safe",
      medium: "⚖️ Medium",
      unsafe: "🔥 Unsafe",
    };
    const hint = cur === "unsafe"
      ? '<p class="mode-hint">⚠️ Unsafe : beaucoup plus de trades et de pertes possibles. Tu es seul responsable.</p>'
      : (unsafePending
        ? '<p class="mode-hint">Retape Unsafe pour confirmer — tu es seul responsable des gains et pertes.</p>'
        : `<p class="mode-hint">Mode : ${s && s.profileLabel ? s.profileLabel : cur}</p>`);
    if (PLAN_B) {
      return `<div class="mode-bar">
        ${["safe","medium","unsafe"].map((k) =>
          `<button class="mode-btn ${k} ${k===cur?"on":""}" disabled>${labels[k]}</button>`
        ).join("")}
      </div>${hint}`;
    }
    return `<div class="mode-bar">
      ${["safe","medium","unsafe"].map((k) =>
        `<button class="mode-btn ${k} ${k===cur?"on":""} ${unsafePending && k==="unsafe"?"pending":""}" data-profile="${k}">${labels[k]}${unsafePending && k==="unsafe"?" ✓":""}</button>`
      ).join("")}
    </div>${hint}`;
  }

  function paperBadge() { return '<span class="pill paper">PAPER · SIM</span>'; }

  function animateNumbers() {
    $$('[data-count-to]').forEach((el) => {
      const to = Number(el.dataset.countTo);
      if (!Number.isFinite(to) || REDUCE_MOTION) return;
      const dp = Number(el.dataset.decimals || 0);
      const money = el.dataset.money === "1";
      const signed = el.dataset.signed === "1";
      const start = performance.now();
      function frame(now) {
        if (!el.isConnected) return;
        const p = Math.min(1, (now - start) / 700);
        const eased = 1 - Math.pow(1 - p, 3);
        const n = to * eased;
        const formatted = n.toLocaleString("fr-FR", {minimumFractionDigits: dp, maximumFractionDigits: dp});
        el.textContent = money ? (signed && n >= 0 ? "+" : "") + formatted.replace("-", "−") + " $" : formatted;
        if (p < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }

  function moneyOdo(n, decimals = 2, signed = false) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    const d = Number(n);
    return `<span data-count-to="${d}" data-decimals="${decimals}" data-money="1" ${signed ? 'data-signed="1"' : ""}>${d >= 0 && signed ? "+" : ""}${Number(d).toFixed(decimals).replace(".", ",")} $</span>`;
  }

  function goalHtml(s, compact = false) {
    const g = s.goal;
    if (!g) return '<div class="op-card goal-card"><h3>Objectif de la nuit</h3><p class="empty">En attente du solde PAPER.</p></div>';
    const targetOptions = [1.5, 2, 3, 5];
    const reached = g.reachedAt;
    const at = reached ? new Date(reached).toLocaleTimeString("fr-FR", {hour:"2-digit",minute:"2-digit",timeZone:"Europe/Paris"}) : null;
    return `<section class="op-card goal-card ${reached ? "goal-reached" : ""}">
      <div class="op-heading"><div><span class="eyebrow">OBJECTIF DE LA NUIT</span><h3>${reached ? "Objectif atteint" : "Cap sur la nuit"} ${paperBadge()}</h3></div>
      ${PLAN_B ? `<span class="goal-x">×${Number(g.multiplier).toLocaleString("fr-FR")}</span>` : `<select class="goal-multiplier" aria-label="Objectif de la nuit">${targetOptions.map((x) => `<option value="${x}" ${Number(g.multiplier) === x ? "selected" : ""}>×${String(x).replace(".", ",")}</option>`).join("")}</select>`}</div>
      <div class="goal-values"><strong>${moneyOdo(g.current)}</strong><span>sur ${Number(g.target).toLocaleString("fr-FR",{minimumFractionDigits:2})} $</span></div>
      <div class="progress-track" role="progressbar" aria-label="Progression de l'objectif" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(g.progressPct)}"><div style="width:${Math.max(0,Math.min(100,g.progressPct))}%"></div></div>
      <div class="goal-foot"><span>${Number(g.progressPct).toFixed(1).replace(".",",")} % · départ ${Number(g.start).toFixed(2)} $</span>
      <span>${reached ? `✓ atteint à ${at}` : paperBadge()}</span></div>
      ${PLAN_B ? '<p class="tiny-hint">Lecture seule · « set goal 2 » dans Telegram pour modifier.</p>' : compact ? "" : '<p class="tiny-hint">Progression calculée sur le solde PAPER enregistré · pas de gains inventés.</p>'}
    </section>`;
  }

  function timeFR(ts) {
    if (!ts) return "—";
    return new Date(ts).toLocaleTimeString("fr-FR", {hour:"2-digit",minute:"2-digit",timeZone:"Europe/Paris"});
  }
  const EXIT_LABELS = {stop:"stop",trail:"stop suiveur",timeout:"temps limite",pulled:"liquidité retirée",force_off:"FORCE OFF",take_profit:"prise de profit"};
  function positionCard(p) {
    const open = !p.closed_at && ["open","exiting"].includes(p.status);
    const pnl = p.pnl_usd;
    return `<button class="op-card position-card" data-position="${Number(p.id)}">
      <div class="position-top"><div><span class="status-dot ${open ? "live" : ""}"></span><strong>${open ? "Position ouverte" : "Trade clôturé"}</strong><span class="profile-tag">${esc(p.profile || "paper")}</span></div><span>${timeFR(p.opened_at)} ›</span></div>
      <div class="position-symbol">${esc(p.symbol || (p.coin && p.coin.symbol) || "Position")}</div>
      <div class="position-numbers"><span>${Number(p.original_size_usd || p.size_usd).toFixed(2).replace(".",",")} $ engagés</span><strong class="${pnl > 0 ? "up" : pnl < 0 ? "down" : ""}">${open ? (p.peak_price != null ? "pic " + fmtSmall(p.peak_price) + " $" : "Suivi Risk") : (pnl == null ? "PnL —" : (pnl >= 0 ? "+" : "−") + Math.abs(pnl).toFixed(2).replace(".",",") + " $")}</strong></div>
      <div class="position-foot">${open ? (p.partial_done ? "◈ Partial encaissé · stop breakeven minimum" : p.trail_active ? "◈ Stop suiveur actif" : "◈ Stop fixe surveillé") : `${esc(EXIT_LABELS[p.exit_reason] || p.exit_reason || "Vente enregistrée")}`}<span>${paperBadge()}</span></div>
    </button>`;
  }
  function fmtSmall(n) {
    if (n == null || !Number.isFinite(Number(n)) || Number(n) === 0) return "—";
    return Number(n).toPrecision(3);
  }
  function unitFR(name) { return {scanner:"coins scannés",auditor:"coins audités",analyst:"scores",executor:"trades",risk:"sorties"}[name] || ""; }
  function renderHome() {
    const el = $("#view-home");
    if (EMPTY) {
      el.innerHTML = navbar("Grok Bot ›") + `<div class="home-pad"><div class="balance">0,00 $ ${paperBadge()}</div><p class="empty">En attente des données PAPER.</p>${goalHtml({})}${forceBarHtml({forceOff:false})}${modeBarHtml({profile:"medium"})}<canvas id="home-chart" class="chart-wrap"></canvas><div class="section-h"><h2>Agents</h2></div>${orbRow(defaultAgents())}<div class="section-h"><h2>Positions</h2></div><p class="empty">Aucun trade pour le moment.</p></div>`;
      requestAnimationFrame(() => DeskCharts.lineChart($("#home-chart"), { points: [] })); mountHomeThoughts(); ensureThoughtLoops(); return;
    }
    const s = FIXTURE ? fixtures.state : state;
    const positions = FIXTURE ? [] : (s.positions || []);
    el.innerHTML = navbar("Grok Bot ›", '<span class="live-label"><i></i> TEMPS RÉEL</span>') +
      `<div class="home-pad">
        <div class="eyebrow">SOLDE DE LA NUIT</div>
        <div class="balance num">${moneyOdo(s.balance)} <span class="balance-badge">${paperBadge()}</span></div>
        <div class="subrow"><span class="pct ${s.todayPct >= 0 ? "up" : "down"}"><span data-count-to="${Number(s.todayPct||0)}" data-decimals="2" data-signed="1">${Number(s.todayPct||0).toFixed(2).replace(".",",")}</span> %</span>
        <span class="pill neutral">${Number(s.multiplier||1).toFixed(2).replace(".",",")}× du départ</span>${paperBadge()}</div>
        ${goalHtml(s)}
        ${forceBarHtml(s)}
        ${modeBarHtml(s)}
        <div class="op-card balance-chart"><div class="op-heading"><h3>Solde PAPER</h3>${FIXTURE?'<span class="eyebrow">DÉMO DE MISE EN PAGE</span>':'<span class="eyebrow">DONNÉES RÉELLES</span>'}</div><canvas id="home-chart" class="chart-wrap"></canvas>
        <div class="ranges">${["LIVE","1H","4H","1D","1W","ALL"].map((r) => `<button data-range="${r}" class="${r==="LIVE"?"on":""}">${r === "LIVE" ? "NUIT" : r}</button>`).join("")}</div></div>
        <div class="section-h"><h2>Les agents</h2><span data-go="agents">Voir tout</span></div>
        ${orbRow(s.agents)}
        <div class="op-card scan-card"><span class="scan-icon">✦</span><div><strong>${Number((s.agents.find((a)=>a.name==="scanner")||{}).count || 0)}</strong> <span>coins scannés cette nuit</span></div><span class="pulse-line"></span></div>
        <div class="carousel" id="carousel"></div>
        <div class="section-h"><h2>Positions <small>${paperBadge()}</small></h2><span data-go="activity">Historique</span></div>
        <div class="positions-list">${positions.length ? positions.slice(0,5).map(positionCard).join("") : '<div class="op-card empty-card">Aucun trade PAPER ouvert ou clôturé pour le moment.</div>'}</div>
        <div class="section-h"><h2>Activité</h2><span data-go="activity">Tout voir</span></div>
        <div id="home-activity"></div>
      </div>`;
    const carousel = $("#carousel");
    (s.agents || defaultAgents()).forEach((a) => {
      carousel.insertAdjacentHTML("beforeend", `<div class="agent-card"><div class="agent-card-head">${orbHtml(a.name,a.running)}<div><h3>${esc(a.label)}</h3><div class="orb-status ${agentMode(a.name,a.running)}">${modeLabel(agentMode(a.name,a.running))}</div></div></div><div class="agent-count"><strong data-count-to="${a.count}">${a.count}</strong><span>${unitFR(a.name)}</span></div><div class="status-line"><i></i>${a.running ? "Opérationnel" : "En pause"}</div></div>`);
    });
    drawActivity($("#home-activity"), (FIXTURE ? fixtures.activity : state.activity).slice(0,5));
    loadChart("LIVE"); mountHomeThoughts(); ensureThoughtLoops(); animateNumbers();
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
    if (!rows || !rows.length) { node.innerHTML = '<div class="op-card empty-card">Le journal de la nuit est encore vide.</div>'; return; }
    node.innerHTML = rows.map((r) => {
      const veil = /veil/i.test(r.title||"") || /veil/i.test(r.subtitle||"") || r.source === "veil";
      const pos = (state.positions||[]).find((p) => p.mint === r.mint && Math.abs(Date.parse(p.opened_at)-Date.parse(r.ts)) < 180000);
      const icon = r.kind === "bought" ? "↗" : (r.kind === "stopped" || r.kind === "sold") ? "◎" : "·";
      return `<button class="activity-row" ${pos ? `data-position="${Number(pos.id)}"` : `data-mint="${esc(r.mint||"")}" data-kind="${esc(r.kind||"")}"`}>
      <span class="activity-icon">${icon}</span><div class="grow"><div class="title">${esc(r.title||"")}${veil?'<span class="veil-badge">Veil</span>':""}</div><div class="sub">${esc(r.subtitle||"")} · ${timeFR(r.ts)}</div></div>
      <div class="right">${esc(r.value||"")} <span class="mini-paper">${r.agent === "risk" || r.agent === "executor" ? "SIM" : ""}</span></div></button>`;
    }).join("");
  }

  function renderAgents() {
    const el=$("#view-agents");
    const s=FIXTURE?fixtures.state:state;
    el.innerHTML=navbar("Agents")+`<div class="screen"><div class="agents-intro"><div><span class="eyebrow">CHAÎNE DE TRADING</span><h2>Cinq agents, une nuit.</h2><p>Une icône s'illumine quand l'agent a travaillé dans les 60 dernières secondes.</p></div></div>${orbRow(s.agents)}<div id="agents-list"></div></div>`;
    $("#agents-list").innerHTML=(s.agents||defaultAgents()).map((a)=>`<div class="full-card agent-full"><div class="setting-row"><div class="head">${orbHtml(a.name,a.running)}<div><strong>${esc(a.label)}</strong><div class="orb-status ${agentMode(a.name,a.running)}">${modeLabel(agentMode(a.name,a.running))}</div><div class="ask"></div></div></div>${PLAN_B?'<span class="sub">via Telegram</span>':`<button class="btn ghost" data-toggle="${a.name}" style="width:auto;padding:0 16px;margin:0;min-height:44px">${a.running?"Pause":"Reprendre"}</button>`}</div><div class="agent-count"><strong>${a.count}</strong><span>${unitFR(a.name)}</span></div><div class="feed" data-decisions="${a.name}"><div class="skel" style="height:44px"></div></div></div>`).join("")+'<div class="op-card empty-card">Décisions issues de la base locale du desk · aucun raisonnement inventé.</div>';
    (s.agents||defaultAgents()).forEach(a=>loadDecisions(a.name,$(`[data-decisions="${a.name}"]`)));
    mountAgentsThoughts(); ensureThoughtLoops();
  }

  async function loadDecisions(name, node) {
    let rows = [];
    if (FIXTURE) rows = fixtures.decisions[name] || [];
    else {
      try { const data = await api("/api/agents/" + name + "/decisions"); rows = data.rows || []; }
      catch (e) { rows = []; }
    }
    if (!rows.length) { node.innerHTML = `<p class="empty">Aucune décision enregistrée</p>`; return; }
    node.innerHTML = rows.map((r) => `<div class="row"><span>${(r.ts || "").slice(11, 16)} ${(r.mint || "").slice(0, 6)} ${r.verdict}</span><span>${r.reason || ""}</span></div>`).join("");
  }

  function renderActivity() {
    const el=$("#view-activity");
    const positions=FIXTURE?[]:(state.positions||[]);
    el.innerHTML=navbar("Activité")+`<div class="screen"><div class="section-h"><h2>Pipeline trades ${paperBadge()}</h2><span>${positions.length} enregistrés</span></div>
      ${positions.length?positions.map(positionCard).join(""):'<div class="op-card empty-card">Le scanner travaille. La première position PAPER apparaîtra ici avec toutes ses étapes.</div>'}
      <div class="section-h"><h2>Journal</h2><span>Base locale</span></div><div id="act-list"></div></div>`;
    drawActivity($("#act-list"),EMPTY?[]:(FIXTURE?fixtures.activity:state.activity)); animateNumbers();
  }

  function renderAccount() {
    const el=$("#view-account");
    const acc=FIXTURE?fixtures.account:state.account, sets=FIXTURE?fixtures.settings:(state.settings||{});
    const paper=!!(state.goal ? "PAPER" : ((acc.mode||"PAPER")==="PAPER"));
    const hidden=new Set(["desk.mode","desk.rpc_url","desk.force_off"]);
    const keys=Object.keys(sets).filter(k=>!hidden.has(k)).slice(0,14);
    el.innerHTML=navbar("Compte")+`<div class="screen"><div class="account-mode">${paperBadge()}<h2>Desk de simulation</h2><p>Aucun argent réel engagé. Les chiffres proviennent des trades PAPER enregistrés.</p></div>
      ${goalHtml(FIXTURE?{}:state)}
      <div class="setting-row"><span>Solde PAPER</span><span class="num">${fmtMoney(acc.stack??acc.balance)} ${paperBadge()}</span></div>
      <a class="setting-row" href="${esc(acc.profile_url||"#")}" target="_blank" rel="noopener"><span>Ton profil FOMO</span><span>@${esc(acc.fomo_handle||"Araos")}</span></a>
      <button class="setting-row" id="invite" style="width:100%"><span>Inviter un ami</span><span>Partager</span></button>
      <div class="setting-row"><span>Notifications</span><span>${PLAN_B?"Telegram only":"Telegram connecté"}</span></div>
      <h2>Réglages</h2>${keys.map(k=>PLAN_B?`<div class="setting-row"><span>${esc(k)}</span><span class="num">${esc(sets[k])}</span></div>`:`<div class="setting-row"><span>${esc(k)}</span><input data-key="${esc(k)}" value="${esc(sets[k])}"></div>`).join("")}
      ${PLAN_B?'<p class="empty">Modifie les réglages via Telegram.</p>':""}
      <p class="empty">${esc((acc.liveGate&&acc.liveGate.message)||"")}</p>
    </div>`;
    const invite=$("#invite"); if(invite) invite.onclick=async()=>{const url=acc.signup_url;if(navigator.share)await navigator.share({title:"FOMO",url});else{await navigator.clipboard.writeText(url);invite.querySelector("span:last-child").textContent="Lien copié";}};
    $$('input[data-key]').forEach(inp=>{inp.onchange=async()=>{try{await api("/api/settings",{method:"POST",body:JSON.stringify({key:inp.dataset.key,value:inp.value})});}catch(e){showError("Réglage refusé : "+e.message);}};});
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
    const el=$("#view-coin");
    if (EMPTY || !data && !FIXTURE) { el.innerHTML=navbar("Position")+'<div class="screen"><p class="empty">Aucune position sélectionnée.</p></div>'; return; }
    const c=data||fixtures.coin, p=c.position||{};
    el.innerHTML=navbar("Position")+`<div class="screen"><p class="empty">Chargement du dossier réel…</p></div>`;
  }

  function pipelineHtml(stages) {
    return `<div class="pipeline">${(stages||[]).map((st,i)=>`<div class="pipeline-step ${st.done?"done":""}"><div class="step-dot">${st.done?"✓":i+1}</div><div><strong>${esc(st.label)}${st.value?" · "+esc(st.value):""}</strong><span>${st.done?timeFR(st.ts):"En attente"}</span></div></div>`).join("")}</div>`;
  }
  function moneyPrice(p) { return p==null ? "—" : Number(p).toPrecision(6)+" $"; }
  function displayPrice(p) {
    if (p==null || !Number.isFinite(Number(p))) return "—";
    const n=Number(p);
    return (Math.abs(n)<0.001?n.toExponential(3):n.toFixed(6))+" $";
  }
  function whyHtml(c) {
    const w=c.why||{};
    const layers=(w.layers||[]).map(l=>`<div class="audit-layer"><span class="audit-check ${l.pass===false?"bad":l.pass?"":"pending"}">${l.pass===false?"!":l.pass?"✓":"·"}</span><div><strong>${esc(l.name)}</strong><span>${esc(l.value==null?"Non enregistré":l.value)}</span></div><small>${esc(l.source||"")}</small></div>`).join("");
    return `<section class="op-card"><div class="op-heading"><h3>Pourquoi acheté</h3>${paperBadge()}</div><p class="tiny-hint">Contrôles réellement enregistrés par Auditor et Analyst.</p>${layers||'<p class="empty">Audit indisponible pour ce trade.</p>'}<div class="why-summary"><div><span>Score Analyst</span><strong>${w.analystScore==null?"—":w.analystScore}</strong></div><div><span>Liquidité</span><strong>${w.liquidity==null?"—":Number(w.liquidity).toLocaleString("fr-FR")+" $"}</strong></div><div><span>Origine</span><strong>${w.source==="veil"?"Veil":esc(w.source||"—")}</strong>${w.source==="veil"?'<span class="veil-badge">Veil</span>':""}</div></div></section>`;
  }
  function renderPosition(c) {
    const el=$("#view-coin"),p=c.position;
    if(!p){el.innerHTML=navbar("Position")+'<div class="screen"><p class="empty">Cette position est introuvable.</p></div>';return;}
    const open=!p.closed_at,last=c.prices&&c.prices.length?c.prices[c.prices.length-1]:null;
    const pnl=p.pnl_usd;
    el.innerHTML=navbar("Trade "+(c.symbol||"#"+p.id),'<button class="back-button" data-go="activity" aria-label="Retour">‹</button>')+`<div class="screen position-detail">
      <div class="detail-hero"><div><span class="eyebrow">${open?"POSITION OUVERTE":"TRADE CLÔTURÉ"}</span><h1>${esc(c.name||c.symbol||"Position")} <small>${esc(c.symbol||"")}</small></h1></div>${paperBadge()}</div>
      <div class="detail-price"><span>${last?"Dernier prix enregistré":"Prix d'entrée"}</span><strong>${displayPrice(last?last.price:p.entry_price)}</strong></div>
      <div class="op-card chart-card"><canvas id="position-chart" class="chart-wrap"></canvas><div class="chart-legend"><span class="price-key">─ Prix réel</span><span class="entry-key">┄ Entrée</span><span class="stop-key">┄ Stop Risk</span></div>${!(c.prices||[]).length?'<p class="empty">Historique de prix indisponible pour cette position. Seuls les chiffres enregistrés sont affichés.</p>':""}${c.historyLimited?'<p class="tiny-hint">Ce trade est antérieur à l’enregistrement détaillé du stop : seul son niveau initial est retracé.</p>':""}</div>
      <div class="metrics-grid"><div><span>Entrée</span><strong>${displayPrice(p.entry_price)}</strong><small>${timeFR(p.opened_at)}</small></div><div><span>Pic enregistré</span><strong>${displayPrice(p.peak_price)}</strong><small>${p.trail_active ? "Stop suiveur activé" : "Stop suiveur non activé"}</small></div><div><span>Stop actuel / final</span><strong>${displayPrice(p.stop_price)}</strong><small>niveau initial −${Number(p.stop_pct||0).toFixed(1).replace(".",",")} %${c.historyLimited ? " · historique partiel" : ""}</small></div><div><span>${open?(p.partial_done?"Restant PAPER":"Montant PAPER"):"Sortie"}</span><strong class="${pnl>0?"up":pnl<0?"down":""}">${open?Number(p.size_usd).toFixed(2).replace(".",",")+" $":displayPrice(p.exit_price)}</strong><small>${open?paperBadge():esc(EXIT_LABELS[p.exit_reason]||p.exit_reason||"—")+" · "+timeFR(p.closed_at)}</small></div></div>
      ${p.partial_done?`<div class="op-card partial-note">🎯 Vente partielle PAPER de ${Number(p.partial_size_usd||0).toFixed(2).replace(".",",")} $ : ${(p.partial_pnl_usd>=0?"+":"−")+Math.abs(p.partial_pnl_usd||0).toFixed(2).replace(".",",")} $ nets. Le stop du restant protège au moins le breakeven après frais.</div>`:""}${!open?`<div class="op-card pnl-banner ${pnl>=0?"positive":"negative"}"><div><span>PNL RÉEL PAPER</span><strong>${pnl==null?"—":(pnl>=0?"+":"−")+Math.abs(pnl).toFixed(2).replace(".",",")+" $"}</strong></div><div><span>Frais simulés</span><strong>${Number(p.fees_usd||0).toFixed(2).replace(".",",")+" $"}</strong></div></div>`:paperBadge()}
      <section class="op-card"><div class="op-heading"><h3>Pipeline du trade</h3><span class="eyebrow">JOURNAL RÉEL</span></div>${pipelineHtml(c.pipeline)}</section>
      ${whyHtml(c)}
      <a class="btn ghost" href="${esc(c.coin_url)}" target="_blank" rel="noopener">Ouvrir ce coin sur FOMO ↗</a>
    </div>`;
    requestAnimationFrame(()=>DeskCharts.positionChart($("#position-chart"),{points:c.prices||[],stops:c.stops||[],entry:p.entry_price,position:p}));
  }

  async function openPosition(id) {
    currentPositionId=Number(id); setView("coin");
    const node=$("#view-coin"); node.innerHTML=navbar("Trade")+'<div class="screen"><div class="skel" style="height:140px"></div></div>';
    try { const c=FIXTURE?fixtures.position:await api("/api/position/"+currentPositionId); renderPosition(c); }
    catch(e) { node.innerHTML=navbar("Trade")+'<div class="screen"><p class="empty">Dossier indisponible. Les anciennes positions sans prix ne sont pas reconstituées.</p></div>'; }
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
    try { const p=(state.positions||[]).find(x=>x.mint===mint); if(p){await openPosition(p.id);return;} renderCoin(await api("/api/coin/" + mint)); }
    catch (e) { showError("No snapshot for this coin · retry later"); }
  }

  document.body.addEventListener("change", async (e) => {
    const select=e.target.closest(".goal-multiplier");
    if(!select||PLAN_B) return;
    try { await api("/api/settings",{method:"POST",body:JSON.stringify({key:"desk.night_goal",value:select.value})}); await boot(); }
    catch(err){showError("Objectif non modifié : "+err.message);}
  });

  document.body.addEventListener("click", (e) => {
    const position=e.target.closest("[data-position]");
    if(position){openPosition(position.dataset.position);return;}
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
    const profileBtn = e.target.closest("[data-profile]");
    if (profileBtn) {
      if (PLAN_B) { showError("Plan B lecture seule — utilise Telegram · /mode"); return; }
      const target = profileBtn.dataset.profile;
      const body = { profile: target };
      if (target === "unsafe") {
        if (!unsafePending) {
          unsafePending = true;
          paint();
          return;
        }
        body.confirm = "unsafe";
      }
      unsafePending = false;
      api("/api/profile", { method: "POST", body: JSON.stringify(body) })
        .then((res) => {
          if (res && res.needsConfirm) {
            unsafePending = true;
            paint();
            return;
          }
          boot();
        })
        .catch((err) => showError(String(err.message || err)));
      return;
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
    const t = state.lastUpdate ? state.lastUpdate.toLocaleTimeString("fr-FR") : "jamais";
    showError(`Desk hors ligne · nouvel essai dans ${retry} s · dernière mise à jour ${t}`);
    setTimeout(() => { retry = Math.min(30, retry + 2); boot(); }, retry * 1000);
  }

  async function boot() {
    if (FORCE_ERROR) showError("Desk hors ligne · nouvel essai dans 5 s");
    if (FIXTURE || EMPTY) {
      Object.assign(state, fixtures.state); state.activity=fixtures.activity; state.account=fixtures.account; state.settings=fixtures.settings;
      if(view==="coin")openPosition(currentPositionId);else paint(); return;
    }
    try {
      const s=await api("/api/state");
      if(!FORCE_ERROR){
        const results=await Promise.all(["/api/activity","/api/account","/api/settings","/api/positions"].map(path=>api(path)));
        Object.assign(state,s);
        state.activity=results[0].rows||[];state.account=results[1]||{};state.settings=results[2].settings||{};state.positions=results[3].rows||[];
      } else Object.assign(state,s);
      state.lastUpdate=s.publishedAt?new Date(s.publishedAt):new Date();state.online=true;
      if(!FORCE_ERROR)showError(PLAN_B?"Snapshot · "+state.lastUpdate.toLocaleTimeString("fr-FR",{timeZone:"Europe/Paris"})+" Europe/Paris · actualisation chiffrée":"");
      retry=3;
      (state.agents||[]).forEach(a=>{
        const ts=a.last&&a.last.ts;if(!ts)return;
        const parsed=Date.parse(ts);
        if(Number.isNaN(parsed))return;
        // The snapshot can be six minutes old: an old decision must not look live.
        const age=Date.now()-parsed;
        if(age<WORK_MS && age>=0) markWorking(a.name);
      });
      if(view==="coin")openPosition(currentPositionId);else paint();
    } catch(e){if(view!=="coin")paint();retryError();}
  }

  function paint() {
    if (view === "home") renderHome();
    else if (view === "agents") renderAgents();
    else if (view === "activity") renderActivity();
    else if (view === "account") renderAccount();
    else if (view === "auditor") { if (FIXTURE || EMPTY) renderAuditor(); else openAuditor(currentMint); }
    else if (view === "coin") { openPosition(currentPositionId); }
    else { view = "home"; renderHome(); }
  }

  setView(["home","agents","activity","account","auditor","coin"].includes(view) ? view : "home");
  boot();
  connectStream();
  setInterval(syncOrbs, 800);
  if (PLAN_B && !FIXTURE && !EMPTY) setInterval(boot, 30000);
})();
