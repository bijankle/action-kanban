/* isolsuggest.js: suggests isolation points for maintenance on one piece of plant equipment, from the
   Project Library lists (search-data.json: {types: {key: {n, f}}, data: {key: [rows]}}).

     const idx = IsolSuggest.build(searchData [, extra]);   // heavy work once (~0.3 s)
     IsolSuggest.suggest(idx, "F13-MB-401")  ->  [{ tag, name, kind, reason [, tags] }]

   It thinks the way a maintenance engineer does: isolate the subject's own energy, then whatever puts
   material into it (walking back through passive chutes, boxes, launders and cyclones to the first pump,
   feeder or conveyor), the valves on its lines, its own sub-equipment, and the services piped to it.

   kind (the groups come back in this order, best first inside each group):
     electrical  the subject's own drives: motors (tag + A/B), VSD / soft starter, isolator, decontactor, local
                 control station, and the board that feeds them (from the electrical and cable lists)
     upstream    feed gates, spouts and chute transporters, and the pumps, feeders, conveyors and mills that put
                 material into the subject (line From / To chains, "X FEED ..." names, pump suction hoppers,
                 feeders on a conveyor's P&ID, and PFD streams when extra data is given)
     valve       actuated and manual valves on process lines into the subject (inlet) and out of it (backflow,
                 drains), plus the actuated valves the instrument list gives to the subject
     associated  the subject's own sub-equipment by name or tag: lube and hydraulic units, compressors, ball
                 chargers, hoists, liner handlers, agitators, underflow pumps (with their auxiliaries folded in)
     utility     services piped to it: lube oil, hydraulic oil, gland / process / cooling water, air, reagents
   A suggestion that stands for a set of like items (15 cyclone isolation valves, 12 lube lines) carries them
   all in `tags`; `tag` is the first.

   extra (optional, from derive_extra.js): { sld: {tag: [sheet, board]}, pfd: [[fromTag, toTag, stream name]] }
   adds the board for drives the electrical list doesn't cover, and the PFD process routing. */
var IsolSuggest = (function () {
  "use strict";

  // ---------- text helpers ----------
  const sq = t => String(t || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const MEL_RE = /\bF\d{2,3}-[A-Z]{1,4}-\d{1,4}[A-Z]{0,2}\b/g;
  const LINE_RE = /\b(\d{2,3})-(\d{4})-[A-Z]{1,4}-[A-Z0-9.]+-\d+/;
  const lineKey = s => { const m = String(s || "").match(LINE_RE); return m ? m[1] + "-" + m[2] : ""; };
  // Names for matching: upper case words, spelling variants folded, plural S dropped (FLOTATIONS = FLOTATION).
  function norm(s) {
    return String(s || "").toUpperCase().replace(/ROCK BREAKER/g, "ROCKBREAKER").replace(/[^A-Z0-9]+/g, " ").trim()
      .split(" ").map(w => w === "LUBE" ? "LUBRICATION" : w === "MIL" ? "MILL" : w.length > 4 && /[^S]S$/.test(w) ? w.slice(0, -1) : w).join(" ");
  }
  const startsName = (n, s) => n.length > s.length && n.startsWith(s + " ");
  const hasWords = (n, s) => (" " + n + " ").includes(" " + s + " ");
  const num = v => { const x = parseFloat(String(v || "").replace(/,/g, "")); return isFinite(x) ? x : 0; };
  const area = t => { const m = String(t || "").match(/^F(\d{2,3})/); return m ? m[1] : ""; };
  const typeCode = t => { const m = String(t || "").match(/^F\d+-([A-Z]+)-/); return m ? m[1] : ""; };
  const cap = s => String(s || "").replace(/\s+/g, " ").trim();

  // Service codes in the line list. Process lines carry the material, the rest are services.
  const PROCESS = new Set("MS FS CON FT SC LS CS WM TL".split(" "));
  const REAGENT = new Set("CN XA FR CO LN HP FL NS HCL HPE AS LPG OXY CW".split(" "));
  // Equipment that only holds or passes material: walked through when looking upstream.
  const PASSIVE = new Set("BX CH VL HP CY FD TK BN DB SD SP SKP PN SI SA TH GA DG LGV XM".split(" "));
  const BUFFER = new Set("TK BN HP SP SKP PN SI TH".split(" "));      // holds a lot: feeds beyond it matter less
  const GATE = new Set("GA DG LGV".split(" "));
  const FEEDER = new Set("FA FB FV FE FS VR".split(" "));
  // Sub-equipment worth isolating, and how much (powered items get more below).
  const SUB_SCORE = { HU: 72, HY: 72, LU: 70, CM: 62, CU: 50, PK: 55, AG: 85, PP: 60, PS: 45, PW: 45, PO: 40, BLC: 52, LH: 48,
    CR: 42, WC: 40, MG: 45, CV: 55, FA: 55, FV: 55, SC: 42, XM: 30, FN: 22, HT: 20, BW: 40, RK: 50, HM: 45, GB: 60, PR: 34, AV: 34, RA: 25 };
  const SKIP_SUB = new Set("SE HYD FHR HC HD CH PSF SIF FI HE BX VL ST WS DC TK".split(" "));
  const VALVE_INS = /valve/i, NOT_VALVE_INS = /limit switch|solenoid|position|relief/i;
  const ELEC_KEEP = /variable speed|vsd|soft starter|isolator|local control|decontactor|control panel|bypass switch|key exchange|rtu|remote switching/i;

  function build(sd, extra) {
    const T = sd.types || {}, D = sd.data || {};
    const rows = k => D[k] || [];
    const C = (k, name) => (T[k] ? T[k].f.indexOf(name) : -1);
    const ix = {
      eq: new Map(),        // sq(tag) -> mel item
      byArea: new Map(),    // area -> [mel items]
      byPid: new Map(),     // P&ID -> [mel items]
      elec: new Map(),      // sq(tag) -> elec item
      elecOf: new Map(),    // sq(owner) -> [elec items]
      cabTo: new Map(),     // sq(to) -> [cable]
      cabEq: new Map(),     // sq(equipment) -> [cable]
      lines: new Map(),     // line key -> [line segments]
      into: new Map(),      // sq(eq) -> [line] lines whose To is the equipment
      outof: new Map(),     // sq(eq) -> [line]
      joins: new Map(),     // line key -> [line] lines that run into that line
      feeds: new Map(),     // sq(dst) -> [{src, how, via}] material edges
      valvesOnLine: new Map(), // line key -> [valve]
      cvList: [], insValves: new Map(), sld: new Map(), extra: !!extra
    };
    const push = (m, k, v) => { if (!k) return; const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); };

    // Equipment list
    const mi = { name: C("mel", "Equipment name"), kw: C("mel", "Installed power (kW)"), st: C("mel", "Starter type"), pid: C("mel", "P&ID") };
    for (const r of rows("mel")) {
      const tag = cap(r[0]); if (!tag || ix.eq.has(sq(tag))) continue;
      const it = { tag, s: sq(tag), name: cap(r[mi.name]), n: norm(r[mi.name]), area: area(tag), code: typeCode(tag),
        kw: num(r[mi.kw]), starter: cap(r[mi.st]), pids: String(r[mi.pid] || "").match(/\d{4}-[A-Z0-9.]+-[A-Z0-9]+-[A-Z]+-\d+/g) || [] };
      ix.eq.set(it.s, it); push(ix.byArea, it.area, it);
      for (const p of it.pids) push(ix.byPid, p, it);
    }

    // Electrical list (the small electrical data list has the same columns)
    for (const k of ["elec", "elx"]) {
      const ei = { name: C(k, "Equipment name"), type: C(k, "Type"), desc: C(k, "Description"), bel: C(k, "Belongs to"),
        fed: C(k, "Fed from"), mcc: C(k, "MCC module"), load: C(k, "Load type") };
      for (const r of rows(k)) {
        const tag = cap(r[0]); if (!tag) continue;
        const s = sq(tag), old = ix.elec.get(s);
        const it = old || { tag, s, name: "", type: "", fed: "", mcc: "", owner: "" };
        it.name = it.name || cap(r[ei.name] || r[ei.desc] || r[ei.load]); it.type = it.type || cap(r[ei.type]);
        it.fed = it.fed || cap(r[ei.fed]); it.mcc = it.mcc || cap(r[ei.mcc]);
        // Owner: Belongs to, or the tag it is built from (F16AG421-VS belongs to F16-AG-421)
        const own = cap(r[ei.bel]) || (tag.match(/^(F\d+[A-Z]+\d+[A-Z]?)-[A-Z]+\d*$/) || [])[1] || "";
        if (own && !it.owner) { it.owner = sq(own); push(ix.elecOf, it.owner, it); }
        if (!old) ix.elec.set(s, it);
      }
    }

    // Cables: who feeds whom, and which equipment each cable serves
    const ci = { from: C("cable", "From"), to: C("cable", "To"), eq: C("cable", "Equipment") };
    for (const r of rows("cable")) {
      const c = { no: cap(r[0]), from: cap(r[ci.from]), to: cap(r[ci.to]), eq: sq(r[ci.eq]) };
      c.power = /-P\d*(-[A-Z])?$/.test(c.no);
      push(ix.cabTo, sq(c.to), c); push(ix.cabEq, c.eq, c);
    }

    // Line list: endpoints are a tag, a line number, or text naming either
    const li = { svc: C("line", "Service"), desc: C("line", "Service description"), from: C("line", "From"), to: C("line", "To"), pid: C("line", "P&ID") };
    const endpoint = v => {
      v = cap(v); if (!v) return null;
      if (ix.eq.has(sq(v))) return { eq: sq(v), text: v };
      const lk = lineKey(v); const tags = v.match(MEL_RE) || [];
      if (lk && !tags.length) return { line: lk, text: v };
      for (const t of tags) if (ix.eq.has(sq(t))) return { eq: sq(t), text: v };
      return lk ? { line: lk, text: v } : { text: v };
    };
    const allLines = [];
    for (const r of rows("line")) {
      const L = { no: cap(r[0]), key: lineKey(r[0]), svc: cap(r[li.svc]), desc: cap(r[li.desc]), pid: cap(r[li.pid]),
        from: endpoint(r[li.from]), to: endpoint(r[li.to]) };
      if (!L.key) continue;
      L.process = PROCESS.has(L.svc); L.reagent = REAGENT.has(L.svc);
      allLines.push(L); push(ix.lines, L.key, L);
      if (L.to && L.to.eq) push(ix.into, L.to.eq, L);
      if (L.from && L.from.eq) push(ix.outof, L.from.eq, L);
      if (L.to && L.to.line && L.to.line !== L.key) push(ix.joins, L.to.line, L);
    }

    // Valves by line. The manual valve list's line column is often a note, so only line numbers count.
    const vi = { loc: C("cv", "Location"), type: C("cv", "Valve type"), line: C("cv", "Line number"), fail: C("cv", "Fail position"),
      hpu: C("cv", "Pneumatic panel / HPU"), pid: C("cv", "P&ID"), act: C("cv", "Actuator type") };
    for (const r of rows("cv")) {
      const v = { tag: cap(r[0]), name: cap(r[vi.loc]), n: norm(r[vi.loc]), vtype: cap(r[vi.type]), key: lineKey(r[vi.line]),
        line: cap(r[vi.line]), fail: cap(r[vi.fail]), hpu: cap(r[vi.hpu]), act: cap(r[vi.act]), area: (String(r[0]).match(/(\d{2,3})\d{3}/) || [])[1] || "", list: "cv" };
      if (!v.tag) continue;
      ix.cvList.push(v); push(ix.valvesOnLine, v.key, v);
    }
    const mvi = { type: C("mv", "Valve type"), line: C("mv", "Line number"), size: C("mv", "Size (DN)") };
    for (const r of rows("mv")) {
      const k = lineKey(r[mvi.line]); if (!k) continue;
      push(ix.valvesOnLine, k, { tag: cap(r[0]), name: cap(r[mvi.type]) + " valve DN" + cap(r[mvi.size]), vtype: "manual", key: k, line: cap(r[mvi.line]), list: "mv" });
    }
    // Actuated valves the instrument list gives to a piece of equipment (XV13082 on F13-PP-401)
    const ii = { desc: C("ins", "Description"), type: C("ins", "Instrument type"), eq: C("ins", "Equipment number") };
    for (const r of rows("ins")) {
      const t = cap(r[ii.type]); if (!VALVE_INS.test(t) || NOT_VALVE_INS.test(t) || !r[ii.eq]) continue;
      push(ix.insValves, sq(r[ii.eq]), { tag: cap(r[0]), name: cap(r[ii.desc]), vtype: t });
    }

    // ---------- material edges: src feeds dst ----------
    const edge = (dst, src, how, via) => {
      if (!dst || !src || dst === src) return;
      const a = ix.feeds.get(dst) || [];
      if (!a.some(e => e.src === src)) { a.push({ src, how, via }); ix.feeds.set(dst, a); }
    };
    // 1. Process lines: the source is found by walking back through the lines that run into this one
    ix.lineSources = (L, depth, seen) => {
      seen = seen || new Set(); depth = depth || 0;
      if (seen.has(L.key) || depth > 6) return [];
      seen.add(L.key);
      let out = [];
      if (L.from && L.from.eq) out.push(L.from.eq);
      else if (L.from && L.from.line) for (const M of ix.lines.get(L.from.line) || []) out = out.concat(ix.lineSources(M, depth + 1, seen));
      for (const M of ix.joins.get(L.key) || []) out = out.concat(ix.lineSources(M, depth + 1, seen));
      return out;
    };
    for (const L of allLines) if (L.process && L.to && L.to.eq)
      for (const s of ix.lineSources(L)) edge(L.to.eq, s, "line", L.no);
    // 2. Names: "<X> FEED <thing>" feeds X (BALL MILL FEED BOX 1 -> BALL MILL; CYCLONE FEED PUMP -> PRIMARY CYCLONE CLUSTER)
    const nameTarget = (it, stem) => {
      const same = (ix.byArea.get(it.area) || []).filter(o => o !== it && !/ FEED /.test(" " + o.n + " "));
      let best = same.filter(o => o.n === stem);
      if (!best.length) {
        const cand = same.filter(o => hasWords(o.n, stem) && !SKIP_SUB.has(o.code));
        const extraWords = o => o.n.split(" ").length - stem.split(" ").length;
        const min = Math.min.apply(null, cand.map(extraWords));
        best = cand.filter(o => extraWords(o) === min);
      }
      return best.length && best.length <= 2 ? best : [];
    };
    for (const list of ix.byArea.values()) for (const it of list) {
      const m = (" " + it.n + " ").match(/^ (.+?) FEED (.*)$/);
      if (!m || !m[2].trim()) continue;
      for (const t of nameTarget(it, m[1])) edge(t.s, it.s, "name");
    }
    // 3. A pump draws from the hopper / tank / sump that shares its service words (CYCLONE FEED PUMP <- PRIMARY CYCLONE FEED HOPPER)
    for (const list of ix.byArea.values()) for (const p of list) {
      if (!/^(PP|PS|PW)$/.test(p.code)) continue;
      const w = p.n.replace(/ PUMP( \d+| [A-Z])?$/, "").split(" ");
      for (let k = w.length; k >= 2; k--) {
        const stem = w.slice(0, k).join(" ");
        const v = list.filter(o => /^(HP|TK|BN|BX|SA)$/.test(o.code) && hasWords(o.n, stem) && /HOPPER|TANK|SUMP|BIN|BOX/.test(o.n));
        if (v.length) { for (const o of v.slice(0, 2)) edge(p.s, o.s, "suction"); break; }
      }
    }
    // 4. Feeders on a conveyor's P&ID discharge onto it (reclaim feeders onto the SAG mill feed conveyor)
    for (const list of ix.byPid.values()) {
      const conv = list.filter(o => o.code === "CV"), feeders = list.filter(o => FEEDER.has(o.code) && o.kw > 0);
      if (conv.length === 1) for (const f of feeders) edge(conv[0].s, f.s, "pid");
    }
    // 5. PFD streams (optional extra data)
    if (extra && extra.pfd) for (const [f, t, nm] of extra.pfd) edge(sq(t), sq(f), "pfd", nm);
    if (extra && extra.sld) for (const t in extra.sld) ix.sld.set(sq(t), extra.sld[t]);
    return ix;
  }

  // ---------- suggestions ----------
  function suggest(ix, tag) {
    const S = sq(tag);
    let subj = ix.eq.get(S);
    const out = new Map();   // tag -> suggestion (best score kept)
    const add = (t, name, kind, reason, score, tags) => {
      if (!t || sq(t) === S) return;
      const k = sq(t), old = out.get(k);
      if (!old || old.score < score) out.set(k, { tag: t, name: cap(name), kind, reason, score, tags: tags || (old && old.tags) });
    };
    if (!subj) {
      // A valve or an electrical item: suggest around the equipment it belongs to
      const e = ix.elec.get(S);
      if (e && e.owner && ix.eq.has(e.owner)) subj = ix.eq.get(e.owner);
      const v = ix.cvList.find(x => sq(x.tag) === S);
      if (v) return valveSubject(ix, v);
      if (!subj) return e ? elecChain(ix, e).map(x => ({ tag: x.tag, name: x.name, kind: "electrical", reason: x.reason })) : [];
      add(subj.tag, subj.name, "associated", "the equipment " + tag + " belongs to", 90);
    }
    const it = subj;
    const label = t => { const o = ix.eq.get(sq(t)); return o ? o.tag + " " + o.name.toLowerCase() : t; };

    // ----- electrical: the subject's motors, then every drive / isolator / LCS tied to them -----
    const motors = (ix.byArea.get(it.area) || []).filter(o => o.s !== it.s && o.s.startsWith(it.s) && /^[A-Z]{1,2}$/.test(o.s.slice(it.s.length)) && (o.kw > 0 || / MOTOR/.test(o.n)));
    const own = [it].concat(motors);
    motors.forEach((m, i) => add(m.tag, m.name, "electrical", "drive motor" + (m.kw ? ", " + m.kw + " kW" : "") + (m.starter ? " " + m.starter : "") +
      elecNote(ix, m) + ": isolate and lock at its starter / VSD", 100 - i));
    for (const o of own) {
      for (const e of elecItems(ix, o.s)) add(e.tag, e.name, "electrical", e.reason, e.score);
      if (o === it && !motors.length && !elecItems(ix, o.s).length && it.kw > 0) {
        // No drive in the electrical list: name the board from the SLD if known
        const b = boardOf(ix, o.s);
        if (b) add(b.board, b.name, "electrical", "board feeding " + o.tag + " (" + it.kw + " kW " + (it.starter || "") + ", SLD " + b.sheet + "): isolate and lock its feeder", 95);
      }
    }

    // ----- upstream: walk back through passive items to the first active one -----
    const seen = new Set([it.s]);
    const walk = (dst, depth, path) => {
      for (const e of ix.feeds.get(dst) || []) {
        if (seen.has(e.src)) continue;
        seen.add(e.src);
        const o = ix.eq.get(e.src); if (!o) continue;
        const via = path.concat([o]);
        const how = e.how === "line" ? "via line " + e.via : e.how === "pfd" ? "PFD stream" + (e.via ? " '" + e.via + "'" : "") :
          e.how === "suction" ? "suction vessel" : e.how === "pid" ? "feeder on the same P&ID" : "by name";
        const chain = via.slice(0, -1).reverse().map(p => p.tag).concat([it.tag]).join(" → ");
        const passive = PASSIVE.has(o.code) && !(o.kw > 1);
        if (GATE.has(o.code)) add(o.tag, o.name, "upstream", "feed gate into " + (path.length ? chain : "the subject") + ": close, lock and isolate it", 96 - depth * 8);
        else if (!passive) {
          const buf = via.slice(0, -1).some(p => BUFFER.has(p.code));
          add(o.tag, o.name, "upstream", (o.kw ? o.kw + " kW " : "") + typeWord(o) + " feeding " + (via.length > 1 ? chain : "the subject") + " (" + how + "): stop and isolate" + elecNote(ix, o),
            (FEEDER.has(o.code) || o.code === "CV" || o.code === "PP" ? 88 : 80) - depth * 9 - (buf ? 22 : 0) - (e.how === "pid" || e.how === "pfd" ? 6 : 0));
        } else if (/SPOUT|CHUTE TRANSPORTER/.test(o.n) && depth === 0) add(o.tag, o.name, "upstream", "feed spout / chute into the subject: pull clear before entry", 84);
        if (passive && depth < 4 && !(BUFFER.has(o.code) && depth >= 2)) walk(o.s, depth + 1, via);
      }
    };
    walk(it.s, 0, []);
    // A conveyor's other feeders: the chute named "<conveyor> FEED CHUTE" is fed by the conveyor whose head chute it is (rare, skipped)

    // ----- sub-equipment by name prefix or tag (same area), feed items count as upstream -----
    const subs = (ix.byArea.get(it.area) || []).filter(o => o.s !== it.s && !motors.includes(o) && it.n && startsName(o.n, it.n) && !/ SPARE\b/.test(o.n));
    // Items on the subject's P&ID that name the same machine type (MILL FEED CHUTE TRANSPORTER, PORTABLE MILLS INCHING DRIVE)
    const head = it.n.split(" ").slice(-1)[0];
    for (const p of it.pids) for (const o of ix.byPid.get(p) || [])
      if (o !== it && !subs.includes(o) && o.kw > 0 && head.length > 3 && hasWords(o.n, head) && o.area === it.area) subs.push(o);
    const units = [], small = [];
    for (const o of subs) {
      if (SKIP_SUB.has(o.code) && !/FEED/.test(o.n)) continue;
      const rest = it.n && startsName(o.n, it.n) ? o.n.slice(it.n.length + 1) : o.n;
      if (GATE.has(o.code) || /ISOLATION GATE$/.test(o.n)) { add(o.tag, o.name, "upstream", "feed gate: close, lock and isolate before entry", 97); continue; }
      if (/\bFEED(ER)?\b/.test(rest) && !/BALL CHARGER|DISCHARGE|CLEANOUT/.test(rest)) {
        if (o.kw > 0) add(o.tag, o.name, "upstream", (o.kw ? o.kw + " kW " : "") + typeWord(o) + " feeding the subject: stop and isolate" + elecNote(ix, o), 90);
        else if (/SPOUT|TRANSPORTER|TROLLEY/.test(rest)) add(o.tag, o.name, "upstream", "feed " + (/SPOUT/.test(rest) ? "spout" : "chute trolley") + ": pull clear of the feed end", 82);
        continue;
      }
      if (!(o.code in SUB_SCORE) && !(o.kw > 0)) continue;
      (/^(LU|HU|HY|CM|CU|PK|AG|BLC|LH|CR|PP|CV|FA|FV|MG|SC|RK|GB|WC|BW)$/.test(o.code) || o.kw >= 30 ? units : small).push(o);
    }
    // Small auxiliaries (lube pumps, fans, heaters, accumulators) fold into the unit they serve
    const words = o => new Set(o.n.split(" ").filter(w => w.length > 3 && !hasWords(it.n, w) && !/^\d+$/.test(w)));
    const folded = new Map();
    for (const o of small) {
      const w = words(o); let best = null, bs = 0;
      for (const u of units) { let c = 0; for (const x of words(u)) if (w.has(x)) c++; if (c > bs) { bs = c; best = u; } }
      if (best && bs >= 1) push2(folded, best.s, o); else units.push(o);
    }
    for (const o of units) {
      const f = folded.get(o.s) || [];
      const lines = (ix.outof.get(o.s) || []).filter(L => L.to && L.to.eq && own.some(x => x.s === L.to.eq));
      const sup = lines.length ? "; supplies " + (lines[0].desc || lines[0].svc).toLowerCase() + " to the subject (" + lines.length + " line" + (lines.length > 1 ? "s" : "") + ")" : "";
      const stored = /^(PR|AV|RA)$/.test(o.code) ? ": stored energy, bleed down" : "";
      const score = (SUB_SCORE[o.code] || 30) + (o.kw > 0 ? Math.min(12, Math.log10(o.kw + 1) * 5) : 0) + (lines.length ? 12 : 0) + (startsName(o.n, it.n) ? 0 : -15);
      add(o.tag, o.name, "associated", (o.kw ? o.kw + " kW " + (o.starter || "") + " " : "") + typeWord(o) + sup + stored +
        (f.length ? "; with " + f.map(x => x.tag).join(", ") : "") + elecNote(ix, o) + (stored ? "" : ": isolate"), score, f.length ? [o.tag].concat(f.map(x => x.tag)) : null);
    }

    // ----- lines into and out of the subject (and its motors) -----
    const linesIn = [], linesOut = [];
    for (const o of own) { (ix.into.get(o.s) || []).forEach(L => linesIn.push(L)); (ix.outof.get(o.s) || []).forEach(L => linesOut.push(L)); }
    // Lines that only tap into the subject via text ("SP@ F17-TH-401 AT GRADE") are service points
    const svcGroups = new Map();
    for (const L of linesIn) {
      const srcs = ix.lineSources(L);
      const srcEq = L.from && L.from.eq ? ix.eq.get(L.from.eq) : null;
      const valves = ix.valvesOnLine.get(L.key) || [];
      if (L.process) {
        for (const v of valves) add(v.tag, v.name || v.vtype, "valve", "on inlet line " + L.no + (srcs.length ? " from " + label(srcs[0]) : "") + ": close and lock" + actNote(v), 86);
        continue;
      }
      if (srcEq && (out.has(srcEq.s) || subs.includes(srcEq))) continue;   // a lube unit already listed covers its lines
      for (const v of valves) add(v.tag, v.name || v.vtype, "utility", (L.desc || L.svc) + " valve on " + L.no + ": close and lock" + actNote(v), L.reagent ? 64 : 52);
      if (!valves.length) push2(svcGroups, L.svc + "|" + (srcEq ? srcEq.s : ""), L);
    }
    for (const [k, Ls] of svcGroups) {
      const L = Ls[0], srcEq = L.from && L.from.eq ? ix.eq.get(L.from.eq) : null;
      const sp = Ls.every(x => /\bSP ?@/.test(x.to.text || ""));
      const what = (L.desc || L.svc) + (sp ? " service point" + (Ls.length > 1 ? "s" : "") : " supply");
      if (srcEq) add(srcEq.tag, srcEq.name, "utility", "supplies " + (L.desc || L.svc).toLowerCase() + " (" + Ls.map(x => x.no).join(", ") + "): isolate", L.reagent ? 66 : 58);
      else add(L.no, what + (L.from && L.from.text ? " from " + L.from.text : ""), "utility",
        (Ls.length > 1 ? Ls.length + " lines " : "") + "close the isolation valve" + (Ls.length > 1 ? "s" : "") + " at the header" + (sp ? " (hose / service points)" : ""),
        (L.reagent ? 62 : /GW|LO|HO|COW/.test(L.svc) ? 54 : 40) - (sp ? 12 : 0), Ls.length > 1 ? Ls.map(x => x.no) : null);
    }
    for (const L of linesOut) {
      const valves = ix.valvesOnLine.get(L.key) || [];
      for (const v of valves) {
        const drain = /DRAIN|VENT|DUMP/i.test(v.name) || /GRADE|SUMP|SKIP/i.test((L.to && L.to.text) || "");
        add(v.tag, v.name || v.vtype, L.process || drain ? "valve" : "utility",
          (drain ? "drain on " + L.no + ": open to drain, then lock" : "on outlet line " + L.no + (L.to && L.to.text ? " to " + label(L.to.text) : "") + ": close against backflow") + actNote(v), drain ? 62 : 72);
      }
    }

    // ----- valves named for the subject (instrument list, control valve locations) -----
    const named = [];
    for (const o of own) for (const v of ix.insValves.get(o.s) || []) named.push(v);
    if (it.n.split(" ").length >= 2) for (const v of ix.cvList)
      if (v.area === it.area && startsName(v.n, it.n) && !named.some(x => sq(x.tag) === sq(v.tag))) named.push(v);
    const groups = new Map();
    for (const v of named) push2(groups, norm(v.name).replace(/ \d+$/, "") || v.tag, v);
    for (const [g, vs] of groups) {
      const v = vs[0], cv = ix.cvList.find(x => sq(x.tag) === sq(v.tag)) || v;
      const n = norm(v.name);
      const util = /WATER|GLAND|AIR|LUBRICATION|OIL|COOLING|STEAM|FLUSH/.test(n) && !/SUCTION VALVE$|DISCHARGE VALVE$/.test(n);
      const drain = /DRAIN|DUMP|VENT/.test(n);
      const score = /SUCTION|INLET|FEED|ISOLATION/.test(n) ? 90 : /DISCHARGE|OUTLET/.test(n) ? 76 : drain ? 64 : 60;
      const nm = vs.length > 2 ? v.name.replace(/\s*\d+$/, "") + "S (" + vs.length + ")" : v.name;
      const why = (drain ? "drain: open to drain down, then lock" : util ? "service valve: close and lock" : /SUCTION|INLET|FEED|ISOLATION/.test(n) ? "inlet isolation: close and lock" : "close and lock") +
        (vs.length > 2 ? " (" + vs[0].tag + " to " + vs[vs.length - 1].tag + ")" : "") + actNote(cv);
      if (vs.length > 2) add(v.tag, nm, util ? "utility" : "valve", why, score, vs.map(x => x.tag));
      else for (const x of vs) add(x.tag, x.name, util ? "utility" : "valve", why.replace(/ \(.*? to .*?\)/, ""), score);
    }
    // The power units that work the subject's valves (F13-HU-407 for XV13082) are energy sources too
    for (const s of out.values()) if (s.kind === "valve") {
      const cv = ix.cvList.find(x => sq(x.tag) === sq(s.tag));
      const hp = cv && ix.eq.get(sq(cv.hpu));
      if (hp) add(hp.tag, hp.name, "associated", "powers valve " + cv.tag + ": isolate and bleed down" + elecNote(ix, hp), 74);
    }

    return finish(out);
  }

  // A valve as the subject: its line, the line's source and the actuator supply
  function valveSubject(ix, v) {
    const r = [];
    const L = (ix.lines.get(v.key) || [])[0];
    if (v.hpu) r.push({ tag: v.hpu, name: (ix.eq.get(sq(v.hpu)) || {}).name || "actuator supply panel / HPU", kind: "utility", reason: "actuator air / hydraulic supply to " + v.tag + ": isolate and vent" });
    if (L) {
      for (const s of ix.lineSources(L).slice(0, 3)) { const o = ix.eq.get(s); if (o) r.push({ tag: o.tag, name: o.name, kind: "upstream", reason: "feeds line " + L.no + ": stop and isolate" }); }
      for (const o of (ix.valvesOnLine.get(v.key) || []).filter(x => x.tag !== v.tag).slice(0, 4)) r.push({ tag: o.tag, name: o.name, kind: "valve", reason: "also on line " + L.no + ": close to isolate the valve" });
    }
    return r;
  }

  // Electrical items for one piece of equipment: drive, isolator, decontactor, LCS, with the board feeding them
  function elecItems(ix, s) {
    const items = new Map();
    for (const e of ix.elecOf.get(s) || []) items.set(e.s, e);
    for (const c of ix.cabEq.get(s) || []) for (const t of [c.from, c.to]) { const e = ix.elec.get(sq(t)); if (e && e.owner === s) items.set(e.s, e); }
    const r = [];
    for (const e of items.values()) {
      const ty = e.type || e.name;
      if (!ELEC_KEEP.test(ty) && !/-(VS|ISL|LCS|DPS|SS)$/.test(e.tag)) continue;
      const b = feedOf(ix, e);
      const drive = /speed|vsd|soft|decontactor/i.test(ty) || /-(VS|SS|DPS)$/.test(e.tag);
      const lcs = /local control/i.test(ty) || /-LCS$/.test(e.tag);
      r.push({ tag: e.tag, name: e.name || ty, score: drive ? 98 : /isolator/i.test(ty) ? 96 : lcs ? 70 : 60,
        reason: (drive ? ty.toLowerCase() + (b ? " fed from " + b : "") + (e.mcc ? " (module " + e.mcc + ")" : "") + ": isolate and lock, prove dead" :
          /isolator/i.test(ty) ? "local isolator" + (b ? " fed from " + b : "") + ": open and lock" :
          lcs ? "local control station: stop and tag (not an isolation point on its own)" : ty.toLowerCase() + ": isolate") });
    }
    // A direct power cable from a board (DOL starters the electrical list has no row for)
    if (!r.some(x => x.score >= 96)) for (const c of ix.cabTo.get(s) || []) if (c.power) {
      const e = ix.elec.get(sq(c.from));
      if (e && /switchboard|mcc|board|db/i.test(e.type + " " + e.tag)) { r.push({ tag: e.tag, name: e.name || e.type, score: 94, reason: "board feeding it by cable " + c.no + ": isolate and lock its feeder" }); break; }
    }
    return r;
  }
  function feedOf(ix, e) {
    if (e.fed) return e.fed;
    for (const c of ix.cabTo.get(e.s) || []) if (c.power && c.from) return c.from;
    return "";
  }
  function boardOf(ix, s) {
    const x = ix.sld.get(s); if (!x || !x[1]) return null;
    const e = ix.elec.get(sq(x[1]));
    return { board: x[1], sheet: x[0], name: (e && e.name) || "switchboard / MCC" };
  }
  // Short electrical note for a reason: the drive tag and its board
  function elecNote(ix, o) {
    const its = elecItems(ix, o.s).filter(x => x.score >= 94);
    if (its.length) return " (" + its.map(x => x.tag + (x.reason.match(/fed from (\S+)/) ? " from " + x.reason.match(/fed from (\S+)/)[1] : "")).join(", ") + ")";
    const b = boardOf(ix, o.s);
    return b ? " (on " + b.board + ", SLD " + b.sheet + ")" : "";
  }
  function elecChain(ix, e) {
    const b = feedOf(ix, e);
    return b ? [{ tag: b, name: (ix.elec.get(sq(b)) || {}).name || "supply", reason: "supply to " + e.tag + ": isolate and lock" }] : [];
  }
  const actNote = v => v && v.hpu ? " (actuator from " + v.hpu + (v.fail ? ", fails " + v.fail.replace(/^F/, "").replace("C", "closed").replace("O", "open").replace("L", "last") : "") + ")" : "";
  function typeWord(o) {
    const w = { PP: "pump", PS: "sump pump", PW: "water pump", PO: "oil pump", CV: "conveyor", FA: "apron feeder", FB: "belt feeder", FV: "vibrating feeder",
      FE: "feeder", MS: "mill", MB: "mill", CC: "crusher", CG: "crusher", SC: "screen", SL: "screen", AG: "agitator", HU: "hydraulic unit", HY: "hydraulic unit",
      LU: "lube unit", CM: "compressor", CU: "cooling unit", CR: "hoist / crane", LH: "liner handler", BLC: "ball charger", FN: "fan", HT: "heater", MG: "magnet",
      BW: "blower", PR: "accumulator", AV: "accumulator", RA: "air receiver", RK: "rake", GB: "inching drive", XM: "item", HM: "hydraulic motor", WC: "trolley" }[o.code];
    return w || "equipment";
  }
  function push2(m, k, v) { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); }

  const ORDER = ["electrical", "upstream", "valve", "associated", "utility"];
  const CAPS = { electrical: 6, upstream: 7, valve: 6, associated: 8, utility: 5 };
  function finish(out) {
    let all = Array.from(out.values());
    const kept = [];
    for (const k of ORDER) kept.push.apply(kept, all.filter(s => s.kind === k).sort((a, b) => b.score - a.score).slice(0, CAPS[k]));
    // No more than 25 in all: drop the weakest
    const cut = kept.slice().sort((a, b) => b.score - a.score).slice(0, 25);
    return kept.filter(s => cut.includes(s)).map(s => {
      const r = { tag: s.tag, name: s.name, kind: s.kind, reason: s.reason.replace(/\s+/g, " ").trim() };
      if (s.tags) r.tags = s.tags;
      return r;
    });
  }

  return { build, suggest };
})();
if (typeof module !== "undefined") module.exports = IsolSuggest;
