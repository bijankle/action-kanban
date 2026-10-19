/* isolsuggest.js: suggests isolation points for maintenance on one piece of plant equipment, from the
   Project Library lists (search-data.json: {types: {key: {n, f}}, data: {key: [rows]}}).

     const idx = IsolSuggest.build(searchData [, extra]);   // the heavy work, once (~0.2 s in Node)
     IsolSuggest.suggest(idx, "F13-MB-401")  ->  [{ tag, name, kind, reason [, tags] }]

   It works the way a maintenance engineer does: isolate the subject's own energy, then whatever puts
   material into it (walking back through passive boxes, chutes, launders and cyclones to the first pump,
   feeder or conveyor), the valves on its lines, its own sub-equipment, and the services piped to it.

   kind (groups come back in this order, best first inside each group; 5 to 25 suggestions in all):
     electrical  the subject's own drives: motors (tag + A/B), VSD / soft starter, isolator, decontactor, local
                 control station, and the board feeding them (electrical and cable lists, SLDs via extra)
     upstream    feed gates and spouts, and the pumps, feeders, conveyors and mills that put material into the
                 subject: process line From / To chains, "X FEED ..." names, a pump's suction hopper, feeders on a
                 conveyor's P&ID, trucks tipping into a crusher's ROM bin, and PFD streams via extra
     valve       valves on process lines into the subject (inlet) and out of it (backflow, drains), the
                 actuated valves the instrument and control valve lists name for it, discharge gates
     associated  the subject's own sub-equipment by name, tag or P&ID: lube and hydraulic units, agitators,
                 compressors, chargers, hoists, liner handlers, take-ups, with small auxiliaries folded in
     utility     services piped to it: lube and hydraulic oil, gland, process and cooling water, air, reagents
   A suggestion that stands for several like items (15 cyclone isolation valves) lists them all in `tags`
   (`tag` is the first).

   extra (optional, ~40 KB, written by derive_extra.js from the SLD / schematic PDFs and pfd-data.js):
     { sld: {tag: {s: [SLD sheets], d: [drive tags on them, e.g. F13MB401A-VS, F13MB401AVS-ISL01], b: LV board}},
       pfd: [[fromTag, toTag, stream name]] }
   adds the drives and boards the electrical list doesn't cover (most HV drives, all of F12 and F13 milling),
   and the PFD's process routing (cyclone underflow to the ball mill, mill discharge to the cyclone feed hopper). */
var IsolSuggest = (function () {
  "use strict";

  // ---------- text helpers ----------
  const sq = t => String(t || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const MEL_RE = /\bF\d{2,3}-[A-Z]{1,4}-\d{1,4}[A-Z]{0,2}\b/g;
  const LINE_RE = /\b(\d{2,3})-(\d{4})-[A-Z]{1,4}-[A-Z0-9.]+-\d+/;
  const lineKey = s => { const m = String(s || "").match(LINE_RE); return m ? m[1] + "-" + m[2] : ""; };
  // Names for matching: upper case words, spelling variants folded, plural S dropped (FLOTATIONS = FLOTATION).
  function norm(s) {
    return String(s || "").toUpperCase().replace(/ROCK BREAKER/g, "ROCKBREAKER").replace(/TAKE[- ]UP/g, "TAKEUP").replace(/[^A-Z0-9]+/g, " ").trim()
      .split(" ").map(w => w === "LUBE" ? "LUBRICATION" : w === "MIL" ? "MILL" : w.length > 4 && /[^S]S$/.test(w) ? w.slice(0, -1) : w).join(" ");
  }
  const startsName = (n, s) => !!s && n.length > s.length && n.startsWith(s + " ");
  const hasWords = (n, s) => (" " + n + " ").includes(" " + s + " ");
  const stripNo = n => n.replace(/( \d+[A-Z]?| [A-Z])+$/, "");             // BALL MILL MOTOR 1 -> BALL MILL MOTOR
  const num = v => { const x = parseFloat(String(v || "").replace(/,/g, "")); return isFinite(x) ? x : 0; };
  const area = t => { const m = String(t || "").match(/^F(\d{2,3})/); return m ? m[1] : ""; };
  const typeCode = t => { const m = String(t || "").match(/^F\d+-([A-Z]+)-/); return m ? m[1] : ""; };
  const cap = s => String(s || "").replace(/\s+/g, " ").trim();
  const push = (m, k, v) => { if (!k) return; const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); };

  // Service codes in the line list. Process lines carry the material, the rest are services.
  const PROCESS = new Set("MS FS CON FT SC CS WM TL".split(" "));
  const REAGENT = new Set("CN XA FR CO LN HP FL NS HCL HPE AS LPG OXY CW LS".split(" "));
  const NEVER = new Set(["FW"]);   // fire water stays in service
  const SERVICE = { LO: "lube oil", HO: "hydraulic oil", IA: "instrument air", PA: "plant air", CA: "compressed air", BA: "blower air",
    PW: "process water", GW: "gland water", COW: "cooling water", BW: "bore water", PSW: "scheme water", POT: "potable water",
    WW: "washdown water", FD: "floor drainage", CN: "cyanide", OXY: "oxygen", FL: "flocculant", LS: "lime slurry", XA: "xanthate",
    FR: "frother", CO: "copper sulphate", LN: "lead nitrate", NS: "caustic", HCL: "hydrochloric acid", LPG: "LPG", AS: "antiscalant", HP: "hydrogen peroxide" };
  const svcName = L => SERVICE[L.svc] || String(L.desc || L.svc).toLowerCase().replace(/ - high pressure.*$/, "");
  // Equipment that only holds or passes material: walked through when looking upstream.
  const PASSIVE = new Set("BX CH VL HP CY FD TK BN DB SD SP SKP PN SI SA TH XM".split(" "));
  const STOP = new Set("TK TH SP SKP PN SI".split(" "));   // big inventories: isolate at their outlet, don't look past them
  const SURGE = new Set("HP BN".split(" "));                // small surge hoppers and bins: look past them, with less weight
  const GATE = new Set("GA DG LGV".split(" "));
  const FEEDER = new Set("FA FB FV FE FS VR".split(" "));
  const FEED_NOUN = /^(PUMP|BOX|HOPPER|CONVEYOR|GATE|SLIDE GATE|CHUTE|SPOUT|BIN|TANK|FEEDER|DISTRIBUTOR|DISTRIBUTION BOX|LAUNDER|CONVEYOR HEAD CHUTE)( \d+| [A-Z])?$/;
  // Sub-equipment worth isolating, and how much (powered items get a little more).
  const SUB_SCORE = { HU: 72, HY: 72, LU: 70, CM: 62, CU: 50, PK: 55, AG: 86, PP: 62, PS: 45, PW: 45, PO: 40, BLC: 52, LH: 48,
    CR: 44, WC: 40, MG: 45, CV: 58, FA: 58, FV: 58, SC: 42, FN: 22, HT: 20, BW: 40, RK: 50, HM: 45, GB: 60, PR: 34, AV: 34, RA: 25, MD: 15, WD: 15 };
  const FOLD_INTO = /^(HU|HY|LU|CM|CU|PK|AG|PP|CV|FA|FV|SC|MG|GB|BW|RK|BLC|LH)$/;   // units that small auxiliaries fold into
  const SKIP_PARENT = /^(SE|HYD|FHR|HC|HD|CH|PSF|SIF|XM|BX|VL|ST)$/;
  const ELEC_KEEP = /variable speed|vsd|soft starter|isolator|local control|decontactor|control panel|bypass switch|key exchange|remote switching/i;

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
      fedTo: new Map(),     // sq(src) -> [dst]
      valvesOnLine: new Map(), // line key -> [valve]
      cv: new Map(),        // sq(tag) -> control valve
      cvList: [], insValves: new Map(), trucks: new Map(), sld: new Map()
    };

    // Equipment list
    const mi = { name: C("mel", "Equipment name"), kw: C("mel", "Installed power (kW)"), st: C("mel", "Starter type"), pid: C("mel", "P&ID") };
    for (const r of rows("mel")) {
      const tag = cap(r[0]); if (!tag || ix.eq.has(sq(tag))) continue;
      const it = { tag, s: sq(tag), name: cap(r[mi.name]), n: norm(r[mi.name]), area: area(tag), code: typeCode(tag),
        kw: num(r[mi.kw]), starter: cap(r[mi.st]), pids: String(r[mi.pid] || "").match(/\d{4}-[A-Z0-9.]+-[A-Z0-9]+-[A-Z]+-\d+/g) || [] };
      ix.eq.set(it.s, it); push(ix.byArea, it.area, it);
      for (const p of it.pids) push(ix.byPid, p, it);
    }

    // Electrical lists (elx has the same columns)
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

    // Cables: which board feeds which drive (power cables end -P1, -P2 ...), and the equipment each serves
    const ci = { from: C("cable", "From"), to: C("cable", "To"), eq: C("cable", "Equipment") };
    for (const r of rows("cable")) {
      const c = { no: cap(r[0]), from: cap(r[ci.from]), to: cap(r[ci.to]), eq: sq(r[ci.eq]) };
      c.power = /-P\d*(-[A-Z])?$/.test(c.no);
      push(ix.cabTo, sq(c.to), c); push(ix.cabEq, c.eq, c);
    }

    // Line list: each end is a tag, a line number, or text naming one ("1200-MECH (F13-PP-401 PUMP SUCTION)")
    const li = { svc: C("line", "Service"), desc: C("line", "Service description"), from: C("line", "From"), to: C("line", "To"), pid: C("line", "P&ID") };
    const endpoint = v => {
      v = cap(v); if (!v) return null;
      if (ix.eq.has(sq(v))) return { eq: sq(v), text: v };
      const lk = lineKey(v), tags = v.match(MEL_RE) || [];
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

    // Valves by line. The manual valve list's line column is often a note, so only line numbers count,
    // matched on area + sequence (the spec and size change along a line).
    const vi = { loc: C("cv", "Location"), type: C("cv", "Valve type"), line: C("cv", "Line number"), fail: C("cv", "Fail position"),
      hpu: C("cv", "Pneumatic panel / HPU"), act: C("cv", "Actuator type") };
    for (const r of rows("cv")) {
      const v = { tag: cap(r[0]), name: cap(r[vi.loc]), n: norm(r[vi.loc]), vtype: cap(r[vi.type]), key: lineKey(r[vi.line]),
        line: cap(r[vi.line]), fail: cap(r[vi.fail]), hpu: cap(r[vi.hpu]), area: (String(r[0]).match(/(\d{2,3})\d{3}/) || [])[1] || "" };
      if (!v.tag || /^(PRV|PSV)$/.test(v.vtype)) continue;    // relief valves protect, they don't isolate
      ix.cvList.push(v); ix.cv.set(sq(v.tag), v); push(ix.valvesOnLine, v.key, v);
    }
    const mvi = { type: C("mv", "Valve type"), line: C("mv", "Line number"), size: C("mv", "Size (DN)") };
    for (const r of rows("mv")) {
      const k = lineKey(r[mvi.line]); if (!k) continue;
      push(ix.valvesOnLine, k, { tag: cap(r[0]), name: cap(r[mvi.type]) + " valve DN" + cap(r[mvi.size]), vtype: "manual", key: k });
    }
    // Actuated valves the instrument list gives to a piece of equipment (XV13082 on F13-PP-401), and truck traffic lights
    const ii = { desc: C("ins", "Description"), type: C("ins", "Instrument type"), eq: C("ins", "Equipment number") };
    for (const r of rows("ins")) {
      const t = cap(r[ii.type]), e = sq(r[ii.eq]); if (!e) continue;
      if (/traffic light/i.test(t)) push(ix.trucks, e, cap(r[0]));
      if (!/valve/i.test(t) || /limit switch|solenoid|position|relief/i.test(t)) continue;
      push(ix.insValves, e, { tag: cap(r[0]), name: cap(r[ii.desc]), vtype: t });
    }

    // ---------- material edges: src feeds dst ----------
    const edge = (dst, src, how, via) => {
      if (!dst || !src || dst === src || !ix.eq.has(dst) || !ix.eq.has(src)) return;
      const a = ix.feeds.get(dst) || [];
      if (!a.some(e => e.src === src)) { a.push({ src, how, via }); ix.feeds.set(dst, a); push(ix.fedTo, src, dst); }
    };
    // 1. Process lines: the source is found by walking back through the process lines that run into this one
    for (const L of allLines) if (L.process && L.to && L.to.eq)
      for (const s of lineSources(ix, L, true)) edge(L.to.eq, s, "line", L.no);
    // 2. Names: "<X> FEED <thing>" feeds X (BALL MILL FEED BOX 1 -> BALL MILL; CYCLONE FEED PUMP -> PRIMARY CYCLONE CLUSTER)
    for (const list of ix.byArea.values()) for (const it of list) {
      const m = (" " + it.n + " ").match(/^ (.+?) FEED (.+) $/);
      if (!m || !FEED_NOUN.test(m[2]) || /^(HD|HC|SE|HYD|FHR|XM|PSF)$/.test(it.code)) continue;
      for (const t of nameTarget(ix, it, m[1])) edge(t.s, it.s, "name");
    }
    // 3. A pump draws from the hopper / tank / sump / thickener that shares its service words
    //    (CYCLONE FEED PUMP <- PRIMARY CYCLONE FEED HOPPER, ... THICKENER UNDERFLOW PUMP 1 <- ... THICKENER)
    for (const list of ix.byArea.values()) for (const p of list) {
      if (!/^(PP|PS|PW)$/.test(p.code)) continue;
      const w = p.n.replace(/ PUMP( \d+[A-Z]?| [A-Z])?$/, "").split(" ");
      for (let k = w.length; k >= 2; k--) {
        const stem = w.slice(0, k).join(" ");
        const v = list.filter(o => /^(HP|TK|BN|BX|SA|TH)$/.test(o.code) && hasWords(o.n, stem) && /HOPPER|TANK|SUMP|BIN|BOX|THICKENER/.test(o.n) && !/OVERFLOW|SPARE/.test(o.n));
        const exact = v.filter(o => o.n === stem);
        if (v.length) { for (const o of (exact.length ? exact : v).slice(0, 2)) edge(p.s, o.s, "suction"); break; }
      }
    }
    // 4. Feeders on a conveyor's P&ID discharge onto it (reclaim feeders onto the SAG mill feed conveyor)
    for (const list of ix.byPid.values()) {
      const conv = list.filter(o => o.code === "CV"), feeders = list.filter(o => FEEDER.has(o.code) && o.kw > 1);
      if (conv.length === 1) for (const f of feeders) edge(conv[0].s, f.s, "pid");
    }
    // 5. PFD streams and SLD boards (optional extra data)
    if (extra && extra.pfd) for (const [f, t, nm] of extra.pfd) edge(sq(t), sq(f), "pfd", nm);
    if (extra && extra.sld) for (const t in extra.sld) ix.sld.set(sq(t), extra.sld[t]);
    ix.sheets = s => (ix.sld.get(s) || {}).s || [];
    return ix;
  }

  // Equipment a process line comes from: its From end, or the lines that run into it, followed back
  function lineSources(ix, L, processOnly, depth, seen) {
    seen = seen || new Set(); depth = depth || 0;
    if (seen.has(L.key) || depth > 6) return [];
    seen.add(L.key);
    let out = [];
    const ok = M => !processOnly || M.process;
    if (L.from && L.from.eq) out.push(L.from.eq);
    else if (L.from && L.from.line) for (const M of ix.lines.get(L.from.line) || []) if (ok(M)) out = out.concat(lineSources(ix, M, processOnly, depth + 1, seen));
    for (const M of ix.joins.get(L.key) || []) if (ok(M)) out = out.concat(lineSources(ix, M, processOnly, depth + 1, seen));
    return out;
  }
  // What "<stem> FEED ..." feeds: the item named exactly <stem>, else the item naming it with the fewest extra words
  function nameTarget(ix, it, stem) {
    const same = (ix.byArea.get(it.area) || []).filter(o => o !== it && !/ FEED /.test(" " + o.n + " ") && !/^(HD|HC|SE|HYD|FHR|XM|PSF|CH)$/.test(o.code));
    let best = same.filter(o => o.n === stem);
    if (!best.length) {
      const cand = same.filter(o => hasWords(o.n, stem));
      const extra = o => o.n.split(" ").length - stem.split(" ").length;
      const min = Math.min.apply(null, cand.map(extra));
      best = cand.filter(o => extra(o) === min);
    }
    return best.length && best.length <= 2 ? best : [];
  }

  // ---------- suggestions ----------
  function suggest(ix, tag) {
    const S = sq(tag);
    const out = new Map();   // sq(tag) -> suggestion, the best score kept
    const add = (t, name, kind, reason, score, tags) => {
      if (!t || sq(t) === S) return;
      const k = sq(t), old = out.get(k);
      if (!old || old.score < score) out.set(k, { tag: t, name: cap(name), kind, reason, score, tags: tags || (old && old.tags) });
    };
    let it = ix.eq.get(S);
    if (!it) {
      const v = ix.cv.get(S);
      if (v) return finish(valveSubject(ix, v, add, out));
      // An electrical item (from the list, or a drive tag on the SLDs like F13PP401-VS): its supply, then the equipment it serves
      const e = ix.elec.get(S), m = String(tag).toUpperCase().match(/^(F\d+[A-Z]+\d+[A-Z]?)(?:VS)?-[A-Z]+\d*$/);
      const owner = e && e.owner || m && sq(m[1]);
      if (!e && !(owner && ix.eq.has(owner))) return [];
      const b = e && feedOf(ix, e);
      if (b) add(b, (ix.elec.get(sq(b)) || {}).name || "switchboard / MCC", "electrical", "supply to " + tag + ": isolate and lock its feeder", 99);
      if (!owner || !ix.eq.has(owner)) return finish(out);
      it = ix.eq.get(owner);
      add(it.tag, it.name, "associated", tag + " serves it: stop it before isolating", 90);
    }
    const label = s => { const o = ix.eq.get(sq(s)); return o ? o.tag + " " + o.name.toLowerCase() : s; };
    const restOf = n => startsName(n, it.n) ? n.slice(it.n.length + 1) : n;

    // ----- electrical: the subject's motors, then every drive / isolator / LCS tied to them -----
    const motors = (ix.byArea.get(it.area) || []).filter(o => o.s !== it.s && o.s.startsWith(it.s) && /^[A-Z]{1,2}$/.test(o.s.slice(it.s.length)) && (o.kw > 0 || / MOTOR/.test(o.n)));
    // A tank or cell has no motor of its own: its agitator is its drive
    const agit = it.kw > 1 ? [] : (ix.byArea.get(it.area) || []).filter(o => o.code === "AG" && startsName(o.n, it.n));
    const own = [it].concat(motors, agit);
    motors.forEach((m, i) => add(m.tag, m.name, "electrical", "drive motor" + (m.kw ? ", " + m.kw + " kW" : "") + (m.starter ? " " + m.starter : "") +
      elecNote(ix, m) + ": isolate and lock at its starter / VSD, prove dead", 100 - i));
    for (const o of own) {
      const items = elecItems(ix, o.s);
      for (const e of items) add(e.tag, e.name, "electrical", e.reason, e.score - (o === it ? 0 : 3));
      if (items.some(x => x.score >= 94)) continue;
      // Not in the electrical list: the drive and isolator tags on its SLD, else the LV board it is on
      const x = ix.sld.get(o.s) || {};
      const sheet = (x.s || [])[0];      // sorted, so the HV overview (2000-F00-SLD-...) comes first for big drives
      for (const d of x.d || []) {
        const isl = /ISL(\d+)$/.exec(d);
        add(d, (isl ? o.name + " VSD isolator " + (+isl[1]) : o.name + (/-SS$/.test(d) ? " soft starter" : /-DPS$/.test(d) ? " decontactor" : " VSD")), "electrical",
          (isl ? "isolator panel on the VSD supply" : "drive") + " (SLD " + sheet + ", not in the electrical list): isolate and lock, prove dead", isl ? 97 - (o === it ? 0 : 3) : 99 - (o === it ? 0 : 3));
      }
      if (!(x.d || []).length && x.b && o.kw >= 1)
        add(x.b, (ix.elec.get(sq(x.b)) || {}).name || "switchboard / MCC (from the SLD)", "electrical", "board feeding " + o.tag + " (" + what(o) + ", SLD " + sheet + "): isolate and lock its feeder", 93 - (o === it ? 0 : 3));
    }

    // ----- sub-equipment by name prefix, tag in the name, or the subject's P&ID -----
    const subs = (ix.byArea.get(it.area) || []).filter(o => o.s !== it.s && !motors.includes(o) && !/\bSPARE\b/.test(o.n) &&
      (startsName(o.n, it.n) || hasWords(o.n, norm(it.tag))));
    const head = it.n.split(" ").slice(-1)[0];
    for (const p of it.pids) for (const o of ix.byPid.get(p) || [])
      if (o !== it && !subs.includes(o) && !motors.includes(o) && o.kw > 1 && o.area === it.area && head.length > 3 && hasWords(o.n, head) && o.code !== it.code) subs.push(o);
    const subSet = new Set(subs.map(o => o.s));

    // ----- the parent it is part of (ROCKBREAKER HPU for ROCKBREAKER HPU COOLING FAN, F13-MB-401 for motor F13-MB-401A) -----
    let parent = null;
    for (const o of ix.byArea.get(it.area) || [])
      if (o !== it && !SKIP_PARENT.test(o.code) && (startsName(it.n, o.n) && !/^(FEED|DISCHARGE|UNDERFLOW|OVERFLOW|TAILS|AREA|ROOM)\b/.test(it.n.slice(o.n.length + 1)) || it.s.startsWith(o.s) && /^[A-Z]{1,2}$/.test(it.s.slice(o.s.length))) && (!parent || o.n.length > parent.n.length)) parent = o;
    if (parent) add(parent.tag, parent.name, "associated", "parent equipment of " + it.tag + ": stop and isolate it too" + elecNote(ix, parent), 84);

    // ----- upstream: walk back through passive items to the first active one -----
    const seen = new Set([it.s]);
    const sibling = o => o.code === it.code && stripNo(o.n) === stripNo(it.n);        // duty / standby twin
    const walk = (dst, depth, path, surge) => {
      const direct = ix.feeds.get(dst) || [];
      for (const e of direct) {
        // A hopper that feeds the pump that feeds dst is not a feed of dst itself
        if (direct.some(f => f !== e && (ix.feeds.get(f.src) || []).some(g => g.src === e.src && g.how === "suction"))) continue;
        if (seen.has(e.src)) continue;
        seen.add(e.src);
        const o = ix.eq.get(e.src);
        if (!o || sibling(o)) continue;
        const passive = PASSIVE.has(o.code) && !(o.kw > 1);
        if (subSet.has(o.s) && !passive && !/^FEED/.test(restOf(o.n))) continue;     // its own underflow pump recirculating: listed as associated
        const via = path.concat([o]);
        const how = e.how === "line" ? "line " + e.via : e.how === "pfd" ? "PFD" + (e.via ? " stream '" + e.via + "'" : "") :
          e.how === "suction" ? "suction vessel" : e.how === "pid" ? "feeder on the same P&ID" : "by name";
        const chain = via.slice(0, -1).reverse().map(p => p.tag).concat(["the subject"]).join(" → ");
        if (GATE.has(o.code)) add(o.tag, o.name, "upstream", "feed gate into " + (path.length ? chain : "the subject") + ": close, lock and isolate", 96 - depth * 8);
        else if (/SPOUT|CHUTE TRANSPORTER/.test(o.n) && depth === 0) add(o.tag, o.name, "upstream", "feed spout into the subject: pull clear before entry", 84);
        else if (!passive && !/^(PS|SE|HYD|HD|HC|WD)$/.test(o.code)) {
          add(o.tag, o.name, "upstream", what(o) + " feeding " + (via.length > 1 ? chain : "the subject") + " (" + how + "): stop and isolate" + elecNote(ix, o),
            (FEEDER.has(o.code) || /^(CV|PP|MS|MB|CC|CG|SC|SL)$/.test(o.code) ? 88 : 78) - depth * 9 - (surge ? 20 : 0) - (e.how === "pid" || e.how === "pfd" ? 5 : 0));
        } else if (e.how === "suction" && depth === 0) add(o.tag, o.name, "upstream", "suction vessel: drain down or isolate its feeds before opening the pump", 70);
        if (passive && depth < 4 && !STOP.has(o.code)) walk(o.s, depth + 1, via, surge || SURGE.has(o.code));
      }
    };
    walk(it.s, 0, [], false);
    // Trucks tip into a crusher's ROM bin: the traffic lights stop them
    for (const p of it.pids) for (const o of ix.byPid.get(p) || [])
      if (o !== it && ix.trucks.has(o.s) && /^(RB|CG|FA|BN)$/.test(it.code))
        add(o.tag, o.name, "upstream", "truck tipping: set traffic lights " + ix.trucks.get(o.s).slice(0, 2).join(", ") + (ix.trucks.get(o.s).length > 2 ? "…" : "") + " to red and barricade the dump pocket", 92);
    // The rockbreaker works over the crusher's bin: park and isolate it before entry
    if (/^(CG|BN)$/.test(it.code)) for (const p of it.pids) for (const o of ix.byPid.get(p) || [])
      if (o.code === "RB") add(o.tag, o.name, "associated", "works over the crusher bin: park clear and isolate its HPU", 80);

    // ----- the sub-equipment: feed items to upstream, discharge gates to valves, the rest associated -----
    const units = [], small = [];
    for (const o of subs) {
      const rest = restOf(o.n);
      if (/TAKEUP.*COUNTERWEIGHT|COUNTERWEIGHT/.test(o.n) && it.code === "CV" && !/^(HC|HD)$/.test(o.code)) { add(o.tag, o.name, "associated", "gravity take-up: secure the counterweight before belt work (stored energy)", 66); continue; }
      if (/^(SE|HYD|FHR|HC|HD|CH|PSF|SIF|FI|HE|BX|VL|ST|WS|DC|TK|SA|SD)$/.test(o.code) && !GATE.has(o.code)) continue;
      if (GATE.has(o.code) || / GATE( \d+| [A-Z])?$/.test(rest)) {
        if (/DISCHARGE|OUTLET|UNDERFLOW|OVERFLOW|BYPASS/.test(rest)) add(o.tag, o.name, "valve", "discharge gate: close and lock against backflow", 70);
        else add(o.tag, o.name, "upstream", "feed gate: close, lock and isolate before entry", 97);
        continue;
      }
      if (/FEED CHUTE TRANSPORTER|FEED SPOUT/.test(o.n) && !startsName(o.n, it.n) || /^FEED(ER)?\b/.test(rest) && (FEED_NOUN.test(rest.replace(/^FEED /, "")) || /^FEEDER/.test(rest) || /SPOUT|TRANSPORTER/.test(rest))) {
        if (/^FEED CONVEYOR \w/.test(rest) || o.code === "WD") continue;       // parts of the feed conveyor, which is listed itself
        if (/TRANSPORTER/.test(rest)) add(o.tag, o.name, "upstream", what(o) + " feed chute transporter: pull the feed chute clear, then isolate" + elecNote(ix, o), 86);
        else if (o.kw > 1) add(o.tag, o.name, "upstream", what(o) + " feeding the subject: stop and isolate" + elecNote(ix, o), 90);
        else if (/SPOUT/.test(rest)) add(o.tag, o.name, "upstream", "feed spout: pull clear of the feed end before entry", 84);
        continue;
      }
      if (!(o.code in SUB_SCORE) && !(o.kw > 1)) continue;
      if (o.code === "XM" && !(o.kw > 1)) continue;
      (FOLD_INTO.test(o.code) || o.kw >= 30 ? units : small).push(o);
    }
    // Small auxiliaries (lube pumps, fans, heaters, accumulators) fold into the unit or motor they serve
    const targets = units.concat(motors);
    const restW = o => restOf(o.n).split(" ");
    // Shared words decide where an auxiliary belongs; generic words count for nothing, MOTOR for half
    const wt = w => /^(PUMP|UNIT|SYSTEM|HEATER|FAN|MILL|COOLING|AREA|SKID)$/.test(w) ? 0 : w === "MOTOR" ? 0.5 : 1;
    const sig = o => new Set(restW(o).filter(w => w.length > 3 && !/^\d+$/.test(w) && !hasWords(it.n, w) && wt(w) > 0));
    const folded = new Map(), child = new Set();
    const foldTarget = o => {
      const w = restW(o);
      let best = null, bl = 0;
      for (const u of targets) {    // longest unit name that starts this one (MOTOR 1 for MOTOR 1 FAN 2, HPU for HPU OIL HEATER)
        const uw = restW(u);
        if (u !== o && uw.length < w.length && uw.every((x, i) => x === w[i]) && uw.length > bl) { best = u; bl = uw.length; }
      }
      if (best || units.includes(o) && o.code !== "PO") return best;
      const ws = sig(o), sh = ix.sheets(o.s); let bs = 0, tie = false;
      for (const u of units) {
        if (u === o || !FOLD_INTO.test(u.code) || hasWords(restOf(u.n), "MOTOR") && !ws.has("MOTOR")) continue;     // a motor lube unit serves motor-named items only
        let c = 0; for (const x of sig(u)) c += ws.has(x) ? wt(x) : -0.15 * wt(x);
        if (c <= 0) continue;
        if (ix.sheets(u.s).some(t => sh.includes(t))) c += 0.75;      // drawn on the same SLD sheet
        if (c > bs + 0.1) { bs = c; best = u; tie = false; } else if (c > bs - 0.1) { tie = true; if (c > bs) { bs = c; best = u; } }
      }
      if (tie && !/^(HT|FN)$/.test(o.code)) return null;      // can't tell which unit it serves: leave it on its own
      // Heaters and fans nobody claims belong with the main drive (agitator, or the first motor)
      if (!best && /^(HT|FN)$/.test(o.code) && o.kw < 5) best = units.find(u => u.code === "AG") || motors[0] || null;
      return best;
    };
    for (const o of small.concat(units.filter(u => !/^(AG|PP|CV|FA|FV)$/.test(u.code)))) {
      const u = foldTarget(o);
      if (u && u !== o && !child.has(o.s) && !child.has(u.s)) {
        push(folded, u.s, o); child.add(o.s);
        for (const c of folded.get(o.s) || []) push(folded, u.s, c);      // its own auxiliaries move up with it
        folded.delete(o.s);
        if (units.includes(o)) units.splice(units.indexOf(o), 1);
      } else if (!units.includes(o)) units.push(o);
    }
    for (const m of motors) if (folded.has(m.s)) { const s = out.get(m.s), f = folded.get(m.s); s.reason += "; with " + f.map(x => x.tag).join(", "); s.tags = [m.tag].concat(f.map(x => x.tag)); }
    for (const o of units) {
      const f = folded.get(o.s) || [];
      const sup = (ix.outof.get(o.s) || []).filter(L => L.to && L.to.eq && own.some(x => x.s === L.to.eq));
      const ret = (ix.into.get(o.s) || []).filter(L => L.process && L.from && L.from.eq === it.s).length && sup.length;
      const stored = /^(PR|AV|RA)$/.test(o.code);
      const score = (SUB_SCORE[o.code] || (/INCHING/.test(o.n) ? 78 : 30)) + (o.kw > 0 ? Math.min(12, Math.log10(o.kw + 1) * 5) : 0) + (sup.length ? 12 : 0) + (startsName(o.n, it.n) ? 0 : -14);
      const why = what(o) + (sup.length ? (ret ? ", circulates from and back to the subject" : ", supplies " + svcName(sup[0]) + " to the subject (" + sup.length + " line" + (sup.length > 1 ? "s" : "") + ")") : "") +
        (f.length ? "; with " + f.map(x => x.tag).join(", ") : "") + elecNote(ix, o) + (stored ? ": stored energy, bleed down" : ": isolate" + (o.kw > 1 ? " and lock" : ""));
      add(o.tag, o.name, "associated", why, score, f.length ? [o.tag].concat(f.map(x => x.tag)) : null);
    }

    // ----- lines into and out of the subject (and its motors) -----
    const linesIn = [], linesOut = [];
    for (const o of own) { (ix.into.get(o.s) || []).forEach(L => linesIn.push(L)); (ix.outof.get(o.s) || []).forEach(L => linesOut.push(L)); }
    const svcGroups = new Map();
    for (const L of linesIn) {
      if (NEVER.has(L.svc)) continue;
      const valves = ix.valvesOnLine.get(L.key) || [];
      if (L.process) {
        const srcs = lineSources(ix, L, true);
        for (const v of valves) {
          const drain = /DRAIN|VENT|DUMP/i.test(v.name);
          add(v.tag, v.name || v.vtype, "valve", (drain ? "drain on inlet line " + L.no + ": open to drain down, then lock" : "on inlet line " + L.no + (srcs.length ? " from " + label(srcs[0]) : "") + ": close and lock") + actNote(v), drain ? 62 : 86);
        }
        continue;
      }
      const srcEq = L.from && L.from.eq ? ix.eq.get(L.from.eq) : null;
      if (srcEq && (out.has(srcEq.s) || subSet.has(srcEq.s))) continue;     // a lube unit already listed covers its lines
      for (const v of valves) add(v.tag, v.name || v.vtype, "utility", svcName(L) + " valve on " + L.no + ": close and lock" + actNote(v), L.reagent ? 64 : 52);
      if (!valves.length) push(svcGroups, L.svc + "|" + (srcEq ? srcEq.s : ""), L);
    }
    for (const Ls of svcGroups.values()) {
      const L = Ls[0], srcEq = L.from && L.from.eq ? ix.eq.get(L.from.eq) : null;
      const sp = Ls.every(x => /\bSP ?@/.test(x.to.text || ""));
      if (srcEq) { add(srcEq.tag, srcEq.name, "utility", "supplies " + svcName(L) + " (" + Ls.map(x => x.no).join(", ") + "): isolate", L.reagent ? 66 : 58); continue; }
      add(L.no, cap(L.desc || L.svc) + (sp ? " service point" + (Ls.length > 1 ? "s" : "") : " supply") + (L.from && L.from.text ? " from " + L.from.text : ""), "utility",
        (sp ? "hose / service point" + (Ls.length > 1 ? "s" : "") + ": close the valve" : "close the isolation valve") + (Ls.length > 1 ? "s on " + Ls.length + " lines" : "") + " at the header",
        (L.reagent ? 62 : /^(GW|LO|HO|COW|IA|PA)$/.test(L.svc) ? 54 : 44) - (sp ? 14 : 0), Ls.length > 1 ? Ls.map(x => x.no) : null);
    }
    for (const L of linesOut) {
      if (NEVER.has(L.svc)) continue;
      for (const v of ix.valvesOnLine.get(L.key) || []) {
        const drain = /DRAIN|VENT|DUMP/i.test(v.name) || /GRADE|SUMP|SKIP/i.test((L.to && L.to.text) || "");
        add(v.tag, v.name || v.vtype, L.process || drain ? "valve" : "utility",
          (drain ? "drain on " + L.no + ": open to drain down, then lock" : "on outlet line " + L.no + (L.to && L.to.text ? " to " + label(L.to.text) : "") + ": close against backflow") + actNote(v), drain ? 62 : 72);
      }
    }

    // ----- valves named for the subject (instrument list, control valve locations) -----
    const named = [];
    for (const o of own) for (const v of ix.insValves.get(o.s) || []) named.push(v);
    if (it.n.split(" ").length >= 2) for (const v of ix.cvList)
      if (v.area === it.area && startsName(v.n, it.n) && !named.some(x => sq(x.tag) === sq(v.tag))) named.push(v);
    for (const v of named) {
      const cv = ix.cv.get(sq(v.tag)) || v;
      const vn = norm(v.name).replace(/^F\d+ [A-Z]+ \d+[A-Z]? /, ""), r = restOf(vn);
      if (/SPRINKLER|DELUGE|FIRE/.test(r)) continue;
      if (subs.some(o => !motors.includes(o) && startsName(vn, stripNo(o.n)) && stripNo(o.n) !== it.n)) continue;   // a sub-equipment's own valve (the underflow pumps')
      const drain = /DRAIN|DUMP|VENT/.test(r), inlet = /^(FEED|INLET|SUCTION|ISOLATION)\b/.test(r) && !/WATER|AIR|FLUSH/.test(r);
      const outlet = /DISCHARGE|OUTLET|UNDERFLOW|OVERFLOW/.test(r) && !/WATER|AIR|FLUSH/.test(r);
      const util = !inlet && !outlet && !drain && /WATER|GLAND|AIR|LUBRICATION|OIL|COOLING|STEAM|FLUSH|SPRAY|CYANIDE|OXYGEN|REAGENT|LIME|FLOCCULANT/.test(r);
      add(v.tag, v.name, util ? "utility" : "valve",
        (drain ? "drain: open to drain down, then lock" : inlet ? "inlet isolation: close and lock" : outlet ? "outlet: close against backflow" : util ? "service valve: close and lock" : "close and lock") + actNote(cv),
        drain ? 64 : inlet ? 92 : outlet ? 76 : util ? (/CYANIDE|OXYGEN|REAGENT/.test(r) ? 66 : 56) : 60);
    }
    // A pump: the isolation valves of what it feeds stop backflow into it (cyclone feed valves for the cyclone feed pump)
    if (/^(PP|PS|PW)$/.test(it.code)) {
      for (const d of ix.fedTo.get(it.s) || []) {
        const o = ix.eq.get(d); if (!o || !/^(CY|DB|FD|BX)$/.test(o.code)) continue;
        const vs = (ix.insValves.get(d) || []).filter(v => /ISOLATION/.test(norm(v.name)));
        if (vs.length) add(vs[0].tag, vs[0].name, "valve", "isolation valve" + (vs.length > 1 ? "s" : "") + " on " + label(d) + " (fed by the subject): close against backflow", 74, vs.length > 1 ? vs.map(v => v.tag) : null);
      }
      for (const e of ix.feeds.get(it.s) || []) if (e.how === "suction") {
        const vs = (ix.insValves.get(e.src) || []).filter(v => /DISCHARGE|OUTLET|UNDERFLOW|SUCTION/.test(norm(v.name)) && !/DRAIN|FLUSH|WATER/.test(norm(v.name)));
        if (vs.length) add(vs[0].tag, vs[0].name, "valve", "outlet valve" + (vs.length > 1 ? "s" : "") + " of the suction vessel " + label(e.src) + ": close the one" + (vs.length > 1 ? "s" : "") + " on this pump's suction and lock", 88, vs.length > 1 ? vs.map(v => v.tag) : null);
      }
    }
    // The power units that work the subject's valves (F13-HU-407 for XV13082) are energy sources too
    for (const s of Array.from(out.values())) if (s.kind === "valve") {
      const cv = ix.cv.get(sq(s.tag)), hp = cv && ix.eq.get(sq(cv.hpu));
      if (hp) add(hp.tag, hp.name, "associated", "works valve " + cv.tag + ": isolate and bleed down" + elecNote(ix, hp), 76);
    }
    return finish(out);
  }

  // A control valve as the subject: its actuator supply, what feeds its line, the other valves on the line
  function valveSubject(ix, v, add, out) {
    if (v.hpu) add(v.hpu, (ix.eq.get(sq(v.hpu)) || {}).name || "actuator panel / HPU", "utility", "actuator air / hydraulic supply to " + v.tag + ": isolate and vent", 90);
    const L = (ix.lines.get(v.key) || [])[0];
    if (L) {
      for (const s of lineSources(ix, L, L.process).slice(0, 3)) { const o = ix.eq.get(s); if (o) add(o.tag, o.name, "upstream", "feeds line " + L.no + ": stop and isolate" + elecNote(ix, o), 80); }
      for (const o of (ix.valvesOnLine.get(v.key) || []).filter(x => x.tag !== v.tag).slice(0, 4)) add(o.tag, o.name, "valve", "also on line " + L.no + ": close either side of " + v.tag, 70);
    }
    return out;
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
      const through = lcs && (ix.cabTo.get(s) || []).some(c => c.power && sq(c.from) === e.s);      // power runs LCS -> motor: it has the isolator
      // Further power cables into a drive are auxiliary supplies (control, UPS) that need isolating too
      const aux = Array.from(new Set((ix.cabTo.get(e.s) || []).filter(c => c.power && c.from && c.from !== b).map(c => c.from)));
      r.push({ tag: e.tag, name: e.name || ty, board: b, score: drive ? 98 : /isolator/i.test(ty) || through ? 96 : lcs ? 70 : 60,
        reason: (drive ? ty.toLowerCase() + (b ? " fed from " + b : "") + (e.mcc ? " (module " + e.mcc + ")" : "") + (aux.length ? ", auxiliary supply from " + aux.join(", ") : "") + ": isolate and lock, prove dead" :
          /isolator/i.test(ty) ? "local isolator" + (b ? " fed from " + b : "") + ": open and lock" :
          through ? "local control station with isolator, motor power runs through it" + (b ? " (fed from " + b + ")" : "") + ": open its isolator and lock" :
          lcs ? "local control station: stop and tag (not an isolation point on its own)" : ty.toLowerCase() + ": isolate") });
    }
    // A power cable straight from a board (DOL starters the electrical list has no row for)
    if (!r.some(x => x.score >= 94)) for (const c of ix.cabTo.get(s) || []) if (c.power) {
      const e = ix.elec.get(sq(c.from));
      if (e && /switchboard|mcc|board/i.test(e.type)) { r.push({ tag: e.tag, name: e.name || e.type, board: e.tag, score: 94, reason: "board feeding it by cable " + c.no + ": isolate and lock its feeder" }); break; }
    }
    return r;
  }
  function feedOf(ix, e) {
    if (e.fed && !/^N\/?A$/i.test(e.fed)) return e.fed;
    for (const c of ix.cabTo.get(e.s) || []) if (c.power && c.from) return c.from;
    return "";
  }
  // Short electrical note for a reason: the drive and its board
  function elecNote(ix, o) {
    const its = elecItems(ix, o.s).filter(x => x.score >= 94);
    if (its.length) return " (" + its.map(x => x.tag + (x.board && x.board !== x.tag ? " on " + x.board : "")).join(", ") + ")";
    const x = ix.sld.get(o.s) || {}, d = (x.d || []).filter(t => !/ISL/.test(t));
    return d.length ? " (" + d.join(", ") + ")" : x.b ? " (on " + x.b + ")" : "";
  }
  const FAIL = { FC: "fails closed", FO: "fails open", FL: "fails last" };
  const actNote = v => v && v.hpu && !/solenoid on valve|^n\/?a$/i.test(v.hpu) ? " (actuator supply " + v.hpu + (FAIL[v.fail] ? ", " + FAIL[v.fail] : "") + ")" : "";
  // "355 kW conveyor" style lead-in for a reason
  function what(o) {
    const w = { PP: "pump", PS: "sump pump", PW: "water pump", PO: "oil pump", CV: "conveyor", FA: "apron feeder", FB: "belt feeder", FV: "vibrating feeder",
      FE: "feeder", XM: /INCHING/.test(o.n) ? "inching drive" : "", MS: "mill", MB: "mill", CC: "crusher", CG: "crusher", SC: "screen", SL: "screen", AG: "agitator", HU: "hydraulic power unit", HY: "hydraulic power unit",
      LU: "lube unit", CM: "compressor", CU: "cooling unit", CR: "hoist / crane", LH: "liner handler", BLC: "ball charger", FN: "fan", HT: "heater", MG: "tramp magnet",
      BW: "blower", PR: "accumulator", AV: "accumulator", RA: "air receiver", RK: "rake", GB: "inching drive", HM: "hydraulic motor", WC: "trolley", CF: "flotation cell", CO: "concentrator" }[o.code];
    const kw = o.kw > 0 ? (o.kw >= 10 ? Math.round(o.kw) : o.kw) + " kW " + (o.starter && !/^FE/.test(o.starter) ? o.starter + " " : "") : "";
    return (kw + (w === undefined ? "unit" : w)).trim();
  }

  const ORDER = ["electrical", "upstream", "valve", "associated", "utility"];
  const CAPS = { electrical: 6, upstream: 7, valve: 7, associated: 10, utility: 5 };
  function finish(out) {
    let all = Array.from(out.values());
    // A tag folded into another suggestion doesn't stand on its own
    const inGroup = new Set();
    for (const s of all) if (s.tags) for (const t of s.tags.slice(1)) inGroup.add(sq(t));
    all = all.filter(s => !inGroup.has(sq(s.tag)));
    // Three or more like items (ISOLATION VALVE 1..15, DISCHARGE GATE 1..4) become one suggestion
    const groups = new Map();
    for (const s of all) push(groups, s.kind + "|" + stripNo(norm(s.name.replace(/^F\d+-[A-Z]+-\d+[A-Z]? /, ""))) + "|" + s.reason.replace(/\(actuator.*?\)/, "").replace(/[A-Z0-9-]*\d[A-Z0-9-]*/g, "#"), s);
    all = [];
    for (const g of groups.values()) {
      if (g.length < 3) { all.push.apply(all, g); continue; }
      const f = g[0], tags = [];
      for (const s of g) for (const t of s.tags || [s.tag]) tags.push(t);
      const panels = Array.from(new Set(g.map(s => (s.reason.match(/actuator supply ([^,)]+)/) || [])[1]).filter(Boolean)));
      all.push({ tag: f.tag, name: stripNo(f.name.replace(/\s*\d+$/, "")) + " (" + g.length + ")", kind: f.kind, score: Math.max.apply(null, g.map(s => s.score)) + 1,
        reason: f.reason.replace(/actuator supply [^,)]+/, "actuator supply " + panels.join(" / ")) + " (" + g[0].tag + " to " + g[g.length - 1].tag + ")", tags });
    }
    const kept = [];
    for (const k of ORDER) kept.push.apply(kept, all.filter(s => s.kind === k).sort((a, b) => b.score - a.score).slice(0, CAPS[k]));
    const cut = new Set(kept.slice().sort((a, b) => b.score - a.score).slice(0, 25));    // 25 at most: drop the weakest
    return kept.filter(s => cut.has(s)).map(s => {
      const r = { tag: s.tag, name: s.name, kind: s.kind, reason: s.reason.replace(/\s+/g, " ").trim() };
      if (s.tags) r.tags = s.tags;
      return r;
    });
  }

  return { build, suggest };
})();
if (typeof module !== "undefined") module.exports = IsolSuggest;
