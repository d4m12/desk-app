/**
 * Idle thought banks + live status lines for the 5 desk agents.
 * French, ≤90 chars, no financial advice, no invented numbers.
 * Exposed as window.DeskThoughts for app.js and Node-less lint tests.
 */
(function (root) {
  const AGENTS = ["scanner", "auditor", "analyst", "executor", "risk"];
  const MAX_LEN = 90;

  const IDLE = {
    scanner: [
      "Pump.fun, c’est le radar des graduations Solana 🔭",
      "Un bloc Solana ~400 ms — mon café est plus lent.",
      "Les migrations AMM, c’est mon feuilleton du soir.",
      "527k+ slots/jour : y a toujours quelque chose qui bouge.",
      "DEX Screener, mon deuxième écran (virtuel).",
      "J’écoute le WS comme un sonar sous-marin.",
      "Quote mint USDC ? Je passe mon chemin, trop de bruit.",
      "Pool trop jeune = encore en couche-culottes 👶",
      "Backfill = file d’attente, pas une fête.",
      "Copycats : même costume, autre mint. Je vois clair.",
      "Liq trop basse ? Je patientouille un peu.",
      "Helius me murmure les comptes sans crier.",
      "Un silent WS, et je retente poliment.",
      "Top 10 holders : mon test de popularité.",
      "Age ≥ 5 min : le minimum pour croquer.",
      "Raydium ≠ pump-amm : je filtre le cosplay.",
      "Waiting room : où les coins font la queue.",
      "Signature on-chain > rumeur Discord.",
      "Je ne chase pas le +800 % en 1h. Trop flashy.",
      "Radar allumé. Aucun ovni… pour l’instant 🛸",
    ],
    auditor: [
      "Mint authority non révoquée = carton rouge immédiat.",
      "Freeze authority = pause bouton. Je déteste ça.",
      "RugCheck, mon collègue parano (dans le bon sens).",
      "LP lock 100 % : musique douce à mes oreilles.",
      "Dev wallet qui vend pile à la migration ? Suspect.",
      "Top 10 > 25 % : trop de monde au balcon.",
      "Bundled wallets = la chorale trop synchronisée.",
      "Délégations bizarres : couche 8, mon thriller.",
      "Honeypot : joli piège, mauvais plan.",
      "Token-2022 : je regarde deux fois, pas de stress.",
      "8 couches, zéro café. Concentration pure.",
      "« Audité » ≠ « sûr à 100 % ». Juste mieux filtré.",
      "Liquidity pulled mid-audit : rideau.",
      "Pool trop jeune : je laisse murir.",
      "Je ne fais pas de FOMO — je fais des checklists.",
      "Revoked + locked = mon duo préféré.",
      "Graph d’insiders : qui connaît qui ?",
      "Fail closed : pas de data = pas de pass.",
      "Security first, jokes second. (ok, 50/50)",
      "Si ça brille trop, je compte les lucioles 🔦",
    ],
    analyst: [
      "Score rules-mode : des maths, pas de boule de cristal.",
      "Probabilité ≠ promesse. Surtout ici.",
      "Volume organique > bots qui s’auto-applaudissent.",
      "Chase trop fort = FOMO déguisé en signal.",
      "Alive 6h : tiens-tu la distance, petit coin ?",
      "Bias de confirmation : mon ennemi n°1.",
      "Un score limite, c’est un « peut-être » poli.",
      "Stats sans contexte = horoscope sophistiqué.",
      "Je pèse buys/sells comme un juge de danse.",
      "Flush m5 : parfois le marché éternue.",
      "Pas de conseil financier — juste des filtres.",
      "Variance élevée : la fête est bruyante.",
      "Median > moyenne quand les outliers crient.",
      "Organic score bas ? Je bâille poliment.",
      "Rules > vibes. Désolé, TikTok.",
      "Un coin peut scorer haut et quand même rug.",
      "Je note, je ne célèbre pas.",
      "Psychologie de marché : peur + cupidité = bruits.",
      "Min score = la barre de la porte d’entrée.",
      "Si ça passe de justesse, je le dis sans fanfare.",
    ],
    executor: [
      "PAPER d’abord : simuler sans brûler la stack.",
      "Ticket min : mieux vaut un vrai size qu’un poussière.",
      "Fees existent. Même en rêve. Surtout en rêve.",
      "Latence 20 s PAPER = mon petit thé.",
      "Bump sous min_ticket : on grossit, on ne saute pas.",
      "Max pool % : ne pas avaler la mare entière.",
      "Referral Araos : le lien propre, toujours.",
      "LIVE gate : d’abord prouver en PAPER.",
      "Un fill n’est pas une amitié. C’est un reçu.",
      "Slippage mental : ce que j’imagine ≠ le prix.",
      "Stack % : portions, pas buffet à volonté.",
      "Push Telegram = le facteur qui sonne.",
      "Skip ≠ fail. Parfois c’est de la sagesse.",
      "Confirm window : hésiter 5 min, c’est OK.",
      "Je n’invente pas de fills. Honnêteté PAPER.",
      "Order intent ≠ order done. Nuance.",
      "Fees ref discount : un clin d’œil, pas un jackpot.",
      "Speed sans check = sprint dans un mur.",
      "Cap hit : la liquidité a dit non merci.",
      "Prêt. Calme. Pas de YOLO bouton ⚡",
    ],
    risk: [
      "Stop -6 % : mon ceinture de sécurité.",
      "Trailing stop : laisser courir, mais avec laisse.",
      "Risk management > ego. Toujours.",
      "Timeout 3h : on ne campe pas pour rien.",
      "Circuit breaker : 3 stops, pause café forcée.",
      "Peak price : je mémorise le sommet sans fanfaronner.",
      "Pulled liquidity = sortie de secours.",
      "LTCM 1998 : rappel historique, pas un flex.",
      "Kelly criterion : joli en théorie, rare en meme-land.",
      "Size trop gros = le stop devient un trampoline.",
      "PnL après fees : la vérité moins maquillée.",
      "Force OFF : tout le monde au dodo, moi inclus.",
      "Missed polls : sans prix, je ne joue pas.",
      "Trail start : d’abord un gain, ensuite la laisse.",
      "Pas de revenge trade. Mauvaise série Netflix.",
      "Variance : même un bon process perd parfois.",
      "Risk ≠ peur. Risk = plan écrit.",
      "Closed trade > open cope.",
      "Surveiller ≠ micro-trader chaque tick.",
      "Zzz si FORCE OFF. Sinon, yeux ouverts 🛡️",
    ],
  };

  const SLEEPY = [
    "Zzz… alarme dans 5 rêves.",
    "Zzz… ne pas déranger le garde.",
    "Zzz… pile recharge en cours.",
    "Zzz… sieste stratégique validée.",
    "Zzz… chut, les stops dorment aussi.",
  ];

  function clamp(s) {
    s = String(s || "").trim().replace(/\s+/g, " ");
    if (s.length <= MAX_LEN) return s;
    return s.slice(0, MAX_LEN - 1).trimEnd() + "…";
  }

  function shortName(title, mint) {
    if (title) {
      const t = String(title).replace(/^(Bought|Sold|Rejected|Stopped)\s+/i, "").trim();
      if (t) return t.length > 12 ? t.slice(0, 11) + "…" : t;
    }
    if (mint) return String(mint).slice(0, 6);
    return null;
  }

  function agentFromActivity(row) {
    const kind = (row && row.kind) || "";
    const sub = ((row && row.subtitle) || "").toLowerCase();
    if (kind === "rejected" || sub.includes("auditor")) return "auditor";
    if (kind === "bought" || sub.includes("executor")) return "executor";
    if (kind === "sold" || kind === "stopped" || sub.includes("risk")) return "risk";
    if (sub.includes("analyst")) return "analyst";
    if (sub.includes("scanner")) return "scanner";
    return null;
  }

  function recentFor(agent, activity) {
    const rows = activity || [];
    for (let i = 0; i < rows.length; i++) {
      if (agentFromActivity(rows[i]) === agent) return rows[i];
    }
    return null;
  }

  function liveLine(agent, ctx) {
    ctx = ctx || {};
    const agents = ctx.agents || [];
    const activity = ctx.activity || [];
    const settings = ctx.settings || {};
    const forceOff = !!ctx.forceOff;
    const a = agents.find((x) => x.name === agent) || { name: agent, running: true, count: null, unit: "" };

    if (forceOff || a.running === false) {
      return clamp(SLEEPY[Math.abs(hash(agent + "sleep")) % SLEEPY.length]);
    }

    const row = recentFor(agent, activity);
    const label = shortName(row && row.title, row && row.mint);

    if (agent === "scanner") {
      if (a.count != null && a.count !== "" && !Number.isNaN(Number(a.count))) {
        return clamp("J’observe " + a.count + " pools dans la salle d’attente");
      }
      return clamp("Je scrute les migrations pump-amm…");
    }
    if (agent === "auditor") {
      if (row && row.kind === "rejected") {
        const why = ((row.subtitle || "").split("·").pop() || "").trim();
        if (label && why) return clamp("Je démonte $" + label + " : " + why);
        if (label) return clamp("Je démonte $" + label + "…");
      }
      if (a.count != null && Number(a.count) > 0) {
        return clamp("Je vérifie " + a.count + " " + (a.unit || "dossiers"));
      }
      return clamp("Checklist 8 couches prête. J’attends un mint.");
    }
    if (agent === "analyst") {
      if (row && /score\s*(\d+)/i.test(row.value || row.subtitle || row.title || "")) {
        const m = /score\s*(\d+)/i.exec(row.value || row.subtitle || row.title || "");
        if (m && label) return clamp("Score " + m[1] + " sur $" + label + "… je note");
        if (m) return clamp("Score " + m[1] + " — je pèse le signal");
      }
      if (a.count != null && Number(a.count) > 0) {
        return clamp("J’ai scoré " + a.count + " " + (a.unit || "coins"));
      }
      return clamp("Je peaufine les règles. Pas de vibes, que des filtres.");
    }
    if (agent === "executor") {
      const ticket = settings["executor.min_ticket_usd"];
      if (row && row.kind === "bought" && row.value) {
        const m = /\$([0-9]+(?:[.,][0-9]+)?)/.exec(row.value);
        if (m) return clamp("Ticket PAPER : " + m[1].replace(".", ",") + " $ rempli");
      }
      if (ticket != null && ticket !== "" && !Number.isNaN(Number(ticket))) {
        const t = Number(ticket).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        return clamp("Ticket PAPER prêt : " + t + " $");
      }
      return clamp("File d’attente PAPER. Rien à envoyer pour l’instant.");
    }
    if (agent === "risk") {
      const stop = settings["risk.stop_pct"];
      if (row && (row.kind === "sold" || row.kind === "stopped") && label) {
        return clamp("Sortie sur $" + label + " — je range le dossier");
      }
      if (stop != null && stop !== "" && !Number.isNaN(Number(stop))) {
        if (label) return clamp("Stop à -" + Number(stop) + " % sur $" + label + ", je surveille");
        return clamp("Stop à -" + Number(stop) + " %. Garde du temple activée");
      }
      return clamp("Je surveille les stops. Calme plat… pour l’instant.");
    }
    return clamp("En ligne. Prêt.");
  }

  function idleLine(agent, idx) {
    const list = IDLE[agent] || IDLE.scanner;
    const i = ((idx % list.length) + list.length) % list.length;
    return clamp(list[i]);
  }

  function hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return h;
  }

  function validate() {
    const problems = [];
    AGENTS.forEach((a) => {
      const list = IDLE[a];
      if (!list || list.length < 15) problems.push(a + ": need ≥15 idle lines");
      (list || []).forEach((line, i) => {
        if (typeof line !== "string") problems.push(a + "[" + i + "]: not string");
        else if (line.length > MAX_LEN) problems.push(a + "[" + i + "]: len " + line.length + ">" + MAX_LEN);
        else if (!line.trim()) problems.push(a + "[" + i + "]: empty");
        const low = line.toLowerCase();
        if (low.includes("garanti") || low.includes("100% gain") || low.includes("moon guaranteed")) {
          problems.push(a + "[" + i + "]: advice-ish");
        }
      });
    });
    return problems;
  }

  root.DeskThoughts = {
    AGENTS,
    MAX_LEN,
    IDLE,
    SLEEPY,
    liveLine,
    idleLine,
    validate,
    clamp,
    agentFromActivity,
  };
})(typeof window !== "undefined" ? window : globalThis);
