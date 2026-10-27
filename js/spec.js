/* The plant's pipe and valve spec (2000-F00-STS-PP-10001, Piping Materials and Valves) behind the MTO's piping rows: each
   piping class lists its components by size range (description, dimensional standard, type, ends, material), the valve
   datasheets and, through the services table, the valves and gasket each class uses. It comes from the Project Library
   (spec/index.json), kept on this device and refreshed once a day. A piping row is Class, Size, Item, and the ends or
   type only when the spec still has more than one line for that item at that size; the spec gives the rest. */
"use strict";
const PipeSpec = (() => {
  let D = null, loadP = null;
  const src = () => (lsGet("adEquipSrc", "") || "https://raw.githubusercontent.com/bijankle/ProjectLibrary/HEAD/search-data.json").replace(/search-data\.json(\?.*)?$/, "spec/index.json");
  function load(force){ if (loadP && !force) return loadP;
    loadP = IDB.get("pspec").then(c => { if (c && c.d){ D = c.d; if (!force && now() - c.at < 864e5) return D; }
      return fetch(src(), { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(d => { if (d && d.pipe){ D = d; IDB.set("pspec", { at: now(), d }); App.render(); } return D; }).catch(() => D); });
    return loadP; }
  const clean = s => String(s || "").replace(/\^\d+/g, "").replace(/\s+/g, " ").trim();
  const DNS = [15, 20, 25, 32, 40, 50, 65, 80, 90, 100, 125, 150, 200, 250, 300, 350, 400, 450, 500, 600, 650, 700, 750, 800, 900, 1000, 1050, 1200];
  const ready = () => !!D;
  const classes = () => D ? Object.keys(D.pipe) : [];
  const C = cl => D && D.pipe[cl];
  /* (the services table writes a valve with its note number on the end: VB03S12 is VB03S1, note 2) */
  const vkey = v => !D ? null : D.valve[v] ? v : Object.keys(D.valve).filter(k => v.startsWith(k)).sort((a, b) => b.length - a.length)[0] || null;
  const svc = cl => D ? D.services.filter(s => s.sys === cl) : [];
  const valves = cl => [...new Set(svc(cl).flatMap(s => String(s.valves || "").split(",").map(x => vkey(x.trim()))).filter(Boolean))];
  const gaskets = cl => [...new Set(svc(cl).map(s => clean(s.gasket)).filter(g => g && g !== "N/A"))];
  const vrow = (v, k) => { const V = D && D.valve[v]; if (!V) return ""; const r = V.rows.find(x => x[0] === k); return r ? clean(r[1]) : ""; };
  const unit = c => /[A-Z]{2}/.test(c.u || "") ? c.u : "DN";
  /* a class is sized by DN (steel pipe) or by outside diameter (PE and other plastic pipe, OD in mm; instrument tube, OD in mm) */
  const OD_PE = [16, 20, 25, 32, 40, 50, 63, 75, 90, 110, 125, 140, 160, 180, 200, 225, 250, 280, 315, 355, 400, 450, 500, 560, 630, 710, 800, 900, 1000, 1200], OD_TUBE = [6, 8, 10, 12, 14, 15, 16, 18, 20, 22, 25];
  const U = cl => { const cs = (C(cl) || { comps: [] }).comps; return cs.filter(c => unit(c) === "OD").length > cs.length / 2 ? "OD" : "DN"; };
  const tube = cl => U(cl) === "OD" && /\btube\b/i.test((C(cl) || {}).title || "");
  const lab = (cl, n) => n == null || n === "" ? "" : (U(cl) === "OD" ? "OD" : "DN") + n;
  /* a PE size's nominal DN, for its flanges (stub and backing ring), valves and bolts (the usual PE stub flange sizes; ones marked * to check) */
  const ODDN = { 20: 15, 25: 20, 32: 25, 40: 32, 50: 40, 63: 50, 75: 65, 90: 80, 110: 100, 125: 100, 140: 125, 160: 150, 180: 150, 200: 200, 225: 200, 250: 250, 280: 250, 315: 300, 355: 350, 400: 400, 450: 450, 500: 500, 560: 500, 630: 600, 710: 700, 800: 800, 900: 900, 1000: 1000, 1200: 1200 }, ODCHK = new Set([125, 180, 200, 250, 560]);
  const dnOf = (cl, n) => U(cl) !== "OD" ? n : tube(cl) ? null : ODDN[n] || null;
  /* 1 the sizes the class covers */
  const sizes = cl => { if (!C(cl)) return []; const ser = U(cl) === "DN" ? DNS : tube(cl) ? OD_TUBE : OD_PE;
    return ser.filter(n => C(cl).comps.some(c => n >= c.lo && n <= c.hi) || (dnOf(cl, n) && valves(cl).some(v => dnOf(cl, n) >= D.valve[v].lo && dnOf(cl, n) <= D.valve[v].hi))); };
  /* 2 the items the spec has at that size: its components, then its valves and gasket */
  const LINING = /\blining\b/i;
  function items(cl, dn){ const c0 = C(cl); if (!c0) return []; const out = [], seen = new Set(), nd = dn == null ? null : dnOf(cl, dn);
    if (c0.branch && dn != null && branchOpts(cl, dn).length) out.push({ v: "BR:", t: "Branch", sub: "pick the branch size: the branch table says which fitting (tee, reducing tee, olet, with a reducer where needed)", g: "Components" });
    c0.comps.forEach(c => { const d = clean(c.d); if (LINING.test(d)) return;   // (a lining isn't ordered on its own: it is in the words of the pipe and fittings it lines)
      if (dn != null && (reducing(d) || branchy(d)) && !branches(cl, dn, d).length) return;
      if (dn != null && (BOLTS.test(d) || /gasket/i.test(d)) && !hasFlange(cl, dn)) return;   // (bolting and gaskets only where the class has a flange at that size)   // (a reducing fitting at the class's smallest size has nothing to reduce to)
      if ((dn == null || (dn >= c.lo && dn <= c.hi)) && !seen.has(d)){ seen.add(d); out.push({ v: d, t: d, g: "Components" }); } });
    valves(cl).filter(v => dn == null || (nd && nd >= D.valve[v].lo && nd <= D.valve[v].hi)).forEach(v => out.push({ v: "V:" + v, t: v + " " + vrow(v, "Type").split(" - ")[0], sub: vrow(v, "Type"), g: "Valves" }));
    if (dn == null || hasFlange(cl, dn)) gaskets(cl).forEach(g => out.push({ v: "G:" + g, t: "Gasket " + g, sub: "to suit " + cl + " flanges", g: "Gaskets" })); return out; }
  /* a reducing fitting (reducing tee, reducer, olet, swage, bush) has a second, smaller size: the branch or small end. Its choices are the class's
     sizes below the main size that the spec line still covers; where the class has a branch table, it says how the branch is made */
  /* a reducing fitting (reducing tee, reducer, olet, swage, bush) has a second, smaller size: the branch or small end; a branch
     fitting (lateral, wye, Y piece, junction, tapping saddle) has a branch size too, the same as the run or smaller */
  const RED = /reduc|olet|swage|bush/i, BRY = /lateral|\bwye\b|y piece|junction|tapping saddle/i, EQOK = /lateral|\bwye\b|y piece|junction/i;
  const reducing = it => it === "BR:" || (!!it && !/^(V|G|B):/.test(it) && (RED.test(it) || BRY.test(it)));
  const branchy = it => !!it && BRY.test(it);
  /* the class's branch table, by run then branch size: ET equal tee, RT reducing tee, SO sockolet, TO threadolet, WO weldolet, +RED with a reducer */
  const bt = (cl, dn) => { const B = (C(cl) || {}).branch; if (!B || !B.g) return null; const row = B.g[dn] || B.g[dn + "*"]; if (!row) return null; const o = {}; Object.keys(row).forEach(k => o[parseFloat(k)] = row[k]); return o; };
  const bcode = (cl, dn, n) => (bt(cl, dn) || {})[n] || "", bname = (cl, code) => clean(((C(cl) || {}).branch || { codes: {} }).codes[code] || code);
  const FIT = { RT: /^tee, reducing/i, SO: /sockolet/i, TO: /thre?a?dolet/i, WO: /weldolet/i };
  /* (a table entry that is a note, not a fitting, is a size the class doesn't branch at: shown greyed, with the note) */
  const noteTxt = (cl, code) => { const m = String(code).match(/note\s*(\d+)/i), n = m && ((C(cl) || {}).notes || []).find(x => x[0] === m[1]); return n ? clean(n[1]).split(/\.\s/)[0] : code; };
  const branchOpts = (cl, dn) => { const t = bt(cl, dn), codes = ((C(cl) || {}).branch || { codes: {} }).codes; return t ? Object.keys(t).map(Number).sort((x, y) => y - x).map(n => codes[t[n]] ? { v: n, t: n === dn ? "Equal, " + lab(cl, n) : "x " + lab(cl, n), sub: bname(cl, t[n]) } : { v: n, t: "x " + lab(cl, n), sub: noteTxt(cl, t[n]), dis: true }) : []; };
  function branches(cl, dn, it){ if (it === "BR:") return branchOpts(cl, dn);
    const ls = C(cl) ? C(cl).comps.filter(c => clean(c.d) === it && (/olet/i.test(it) || (dn >= c.lo && dn <= c.hi))) : [], lo = Math.min(...ls.map(c => c.lo), dn), t = bt(cl, dn);
    /* lined spools: laterals and Y pieces are equal (the standard piping drawings have them by run size only) */
    if (EQOK.test(it) && /^(CL|RL)\d/.test(cl)) return [{ v: dn, t: "Equal, " + lab(cl, dn), sub: "lined laterals and Y pieces are equal, to the standard piping drawings" }];
    let ns = sizes(cl).filter(n => n < dn && n >= Math.min(lo, 15)).reverse();
    /* where the class has a branch table, a reducing tee or an olet is offered only at the branch sizes the table gives it */
    const code = Object.keys(FIT).find(k => FIT[k].test(it)); if (t && code) ns = ns.filter(n => t[n] === code);
    const out = ns.map(n => ({ v: n, t: "x " + lab(cl, n), sub: t && t[n] ? bname(cl, t[n]) : "" }));
    return EQOK.test(it) ? [{ v: dn, t: "Equal, " + lab(cl, dn), sub: "branch the same size as the run" }].concat(out) : out; }
  /* a branch from the table, as the fittings that make it: the tee or olet, and the reducer when the table says +RED */
  function branchPlan(cl, dn, n){ const code = bcode(cl, dn, n), cs = (C(cl) || { comps: [] }).comps, find = (re, z) => { const c = cs.find(c => re.test(clean(c.d)) && (z || dn) >= c.lo && (z || dn) <= c.hi) || cs.find(c => re.test(clean(c.d))); return c ? clean(c.d) : null; };   // (an olet's size range is its branch size)
    const tee = find(/^tee, equal/i), rtee = find(/^tee, reducing/i), red = find(/^reducer, concentric/i) || find(/^reducer/i), t = bt(cl, dn) || {};
    if (code === "ET") return [{ it: tee, dn }];
    if (code === "ET+RED") return [{ it: tee, dn }, { it: red, dn, dn2: n }];
    if (code === "RT") return [{ it: rtee, dn, dn2: n }];
    if (code === "RT+RED"){ const k = Object.keys(t).map(Number).filter(m => t[m] === "RT" && m > n).sort((x, y) => x - y)[0]; return k ? [{ it: rtee, dn, dn2: k }, { it: red, dn: k, dn2: n }] : [{ it: rtee, dn, dn2: n }]; }
    const ol = FIT[code] && find(FIT[code], n); return ol ? [{ it: ol, dn, dn2: n }] : []; }
  /* 3 the spec lines left for that item at that size; when more than one, what tells them apart is the last pick */
  const lines = (cl, dn, it) => !C(cl) || !it || /^[VG]:/.test(it) ? [] : C(cl).comps.filter(c => clean(c.d) === it && dn >= c.lo && dn <= c.hi);
  function variants(ls){ if (ls.length < 2) return []; const ends = new Set(ls.map(c => clean(c.ends))), types = new Set(ls.map(c => clean(c.type)));
    const lab = c => ends.size === ls.length ? clean(c.ends) : types.size === ls.length ? clean(c.type) : clean(c.ends) + ", " + clean(c.type); return ls.map(c => ({ v: lab(c), t: lab(c), c })); }
  /* a row's spec line: { line (the RFQ words), rows (the (i)), auto (what filled itself in), need } */
  function resolve(r){ if (!D) return { need: "the pipe spec (loading)" }; const c0 = C(r.cl); if (!c0) return { need: "class" }; if (!r.dn) return { need: "size" }; if (!r.it) return { need: "item" };
    if (r.it === "BR:") return r.dn2 ? { need: "item" } : { need: "branch size" };
    if (BOLTS.test(r.it) || /^B:/.test(r.it)) return bolt(r);
    if (/^V:/.test(r.it)){ const v = r.it.slice(2), V = D.valve[v]; if (!V) return { need: "item" };
      const R = k => vrow(v, k); return { v, auto: R("End Connections"), unit: "ea", line: "DN" + (dnOf(r.cl, r.dn) || r.dn) + (U(r.cl) === "OD" ? " (" + lab(r.cl, r.dn) + " pipe)" : "") + " " + R("Type") + ", " + R("End Connections") + ", body " + R("Body Material") + (R("Manufacturer") ? ", " + R("Manufacturer") + " " + R("Model") : "") + ", valve datasheet " + v,
        rows: [["Valve datasheet", v + " (spec page " + V.page + ")"], ["Type", R("Type")], ["Ends", R("End Connections")], ["Body", R("Body Material")], ["Seats", R("Seat Material")], ["Made by", [R("Manufacturer"), R("Model")].filter(Boolean).join(" ")], ["Size range", R("Size Range (mm)")]].filter(x => x[1]) }; }
    if (/^G:/.test(r.it)){ const g = r.it.slice(2), nd = dnOf(r.cl, r.dn), ft = ftab(r.cl, r.dn), gc = gcomp(r.cl, g), gt = gthk(r.cl, g);
      const txt = gc ? clean(gc.type) : ""; const chk = [gt ? "" : "the gasket's thickness (the spec doesn't give it for this class)", ft ? "" : "the flange table"].filter(Boolean);
      return { g, gt, auto: "to suit " + r.cl, unit: "ea", chk: chk.join(", "),
        line: "DN" + (nd || r.dn) + " gasket " + g + (ft ? ", Table " + ft : "") + (gt ? ", " + gt + "mm thick" : "") + (/full face/i.test(txt) ? ", full face" : /flat face|ring|raised/i.test(txt) ? ", flat ring" : "") + ", to suit piping class " + r.cl + " flanges",
        rows: [["Gasket", g + (txt ? ": " + txt : "")], ["To suit", r.cl + " flanges" + (ft ? ", AS 2129 Table " + ft : "")], ["Thickness", gt ? gt + " mm" : "not given, check"]] }; }
    const ls = lines(r.cl, r.dn, r.it); if (!ls.length) return { need: "item" };
    if (reducing(r.it) && !r.dn2) return { need: branchy(r.it) ? "branch size" : "small end size", vs: variants(ls) };
    const sz = lab(r.cl, r.dn) + (reducing(r.it) && r.dn2 ? (r.dn2 === r.dn ? " equal" : " x " + lab(r.cl, r.dn2)) : ""); const vs = variants(ls), c = ls.length === 1 ? ls[0] : (vs.find(x => x.v === r.vt) || {}).c;
    if (!c) return { need: "ends or type", vs };
    return { c, vs, auto: vs.length ? "" : [clean(c.type), clean(c.ends)].filter(Boolean).join(", "), unit: /^pipe/i.test(clean(c.d)) ? "m" : "ea",
      line: sz + " " + clean(c.d) + ", " + clean(c.type) + ", " + clean(c.ends) + ", " + clean(c.mat) + (/manufacturer/i.test(c.mat) && /manufacturer/i.test(c.dim) ? "" : ", " + clean(c.dim)) + ", to piping class " + r.cl,
      extra: extras(r.cl, c), rows: [["Piping class", r.cl + ": " + clean(c0.title)], ["Item", clean(c.d)], ["Size", sz + (reducing(r.it) ? " (run x branch, or large x small end)" : "") + " (the spec line covers " + clean(c.size) + ")"], ["Type", clean(c.type)], ["Ends", clean(c.ends)], ["Material", clean(c.mat)], ["Standard", clean(c.dim)],
        ["Lining", lining(r.cl) ? lining(r.cl).full : ""], ["Finish", extras(r.cl, c).includes("HDG") ? "Hot dip galvanised (spec note)" : ""],
        ["Spec", (D.meta.doc || "") + " Rev " + (D.meta.rev || "") + ", page " + c0.page]].filter(x => x[1]) }; }
  /* what the supplier must be told that the line itself leaves to the class: the lining it is supplied with, and galvanising the class's notes ask for */
  function lining(cl){ const c = ((C(cl) || { comps: [] }).comps).find(x => LINING.test(clean(x.d))); if (!c) return null; const t = clean(c.dim || c.type), mm = (t.match(/(\d+(?:\.\d+)?)\s*mm/) || [])[1];
    const what = /ceramic/i.test(t) ? "spun ceramic" : /butyl/i.test(t) ? "butyl rubber" : /natural rubber/i.test(t) ? "natural rubber" : /rubber/i.test(t) ? "rubber" : "lining";
    const ir = (t.match(/IRHD\s*\d+/i) || [])[0], mk = (t.match(/(Linatex[^.,]*?)(?: or |\.|,)/i) || [])[1];
    /* the lining at the flange faces, from the note the lining line refers to */
    const nn = (t.match(/note\s*(\d+)/i) || [])[1], note = nn && ((C(cl) || {}).notes || []).find(x => x[0] === nn), nt = note ? clean(note[1]) : "", fm = nt.match(/(\d+(?:\.\d+)?)\s*mm thick lining on flange faces,?\s*(IRHD\s*\d+)?/i);
    const face = fm ? ", FLANGE FACES " + fm[1] + "MM" + (fm[2] ? " " + fm[2].toUpperCase() : "") : /no lining on flange faces/i.test(nt) ? ", NO LINING ON FLANGE FACES" : "";
    return { mm, what, short: "C/W " + (mm ? mm + "MM " : "") + what.toUpperCase() + " LINING" + (ir ? " " + ir.toUpperCase() : "") + (mk ? " (" + mk.toUpperCase() + " OR EQUIV)" : "") + face, full: t + (nt ? " " + nt : "") }; }
  const LINED = /^(pipe|elbow|tee|reducer|lateral|wye|y piece|induction bend|bend|cap|flange|spool|sweep|junction)/i;
  function extras(cl, c){ const out = [], c0 = C(cl) || {}, notes = new Map((c0.notes || []).map(n => [n[0], n[1]])), refs = [c.d, c.type, c.mat, c.dim, c.ends, c.size].join(" ").match(/\^(\d+)/g) || [];
    const d = clean(c.d), all = [c.type, c.mat, c.dim].join(" "), M = String(c0.material || ""), pipe = /^(pipe|tube)/i.test(d), steel = !/gasket|bolt|nut|seal|o-ring|sealant/i.test(d);
    /* the finish the class's material line or notes ask for (pipe and fittings can differ: Megapress pipe is galvanised, its fittings zinc nickel coated) */
    const galv = refs.some(r => /galvanis/i.test(notes.get(r.slice(1)) || "")) || (/hot dipped galvanised pipe/i.test(M) ? pipe : /hot dipped galvanised/i.test(M) && steel);
    if (galv && !/galv|hdg/i.test(all)) out.push("HDG");
    if (/zinc\s*-?\s*nick/i.test(M) && !pipe && steel && !/zinc/i.test(all)) out.push("ZN-NI COATED");
    /* PE pipe colour, from the class's material line */
    if (pipe && /white outer\s*\/\s*black inner/i.test(M)) out.push("WHITE OUTER BLACK INNER"); else if (pipe && /black pipe/i.test(M)) out.push("BLACK");
    const L = lining(cl); if (L && LINED.test(d) && !/blind/i.test(d)) out.push(L.short); return out; }
  /* ---------- studs, bolts and nuts, from the flange table ----------
     AS 2129 bolting by table and size: [bolts per flange, bolt diameter (M), plate flange thickness mm]. From supplier data sheets of
     AS 2129 (Engineering Toolbox Table D plate flange, Matthew Davis Table E); Table H has no thickness there, so its lengths are left to check. */
  const FT = { D: { 15: [4, 12, 5], 20: [4, 12, 5], 25: [4, 12, 5], 32: [4, 12, 6], 40: [4, 12, 6], 50: [4, 16, 8], 65: [4, 16, 8], 80: [4, 16, 10], 100: [4, 16, 10], 125: [8, 16, 13], 150: [8, 16, 13], 200: [8, 16, 13], 250: [8, 20, 16], 300: [12, 20, 19], 350: [12, 20, 22], 400: [12, 24, 22], 450: [12, 24, 25], 500: [16, 24, 29], 600: [16, 27, 32] },
    E: { 15: [4, 12, 6], 20: [4, 12, 6], 25: [4, 12, 7], 32: [4, 12, 8], 40: [4, 12, 9], 50: [4, 16, 10], 65: [4, 16, 10], 80: [4, 16, 11], 100: [8, 16, 13], 125: [8, 16, 14], 150: [8, 20, 17], 200: [8, 20, 19], 250: [12, 20, 22], 300: [12, 24, 25], 350: [12, 24, 29], 400: [12, 24, 32], 450: [16, 24, 35], 500: [16, 24, 38], 600: [16, 30, 48] },
    H: { 15: [4, 16], 20: [4, 16], 25: [4, 16], 32: [4, 16], 40: [4, 16], 50: [4, 20], 65: [8, 20], 80: [8, 20], 100: [8, 20], 150: [12, 24], 200: [12, 24], 250: [12, 27], 300: [16, 24] } };
  /* ISO 4032 nut height and coarse thread pitch, by diameter */
  const NUT = { 12: 10.8, 16: 14.8, 20: 18, 24: 21.5, 27: 23.8, 30: 25.6 }, PITCH = { 12: 1.75, 16: 2, 20: 2.5, 24: 3, 27: 3, 30: 3.5 };
  const BOLTS = /stud bolt|machine bolt|^nuts?\b/i;
  const FLG = /^(flange|stub flange|flange adaptor|single-part flange|plate, blind)/i;
  const hasFlange = (cl, dn) => ((C(cl) || { comps: [] }).comps).some(c => FLG.test(clean(c.d)) && dn >= c.lo && dn <= c.hi);
  function ftab(cl, dn){ const nd = dnOf(cl, dn), cs = ((C(cl) || { comps: [] }).comps).filter(c => FLG.test(clean(c.d)) && dn >= c.lo && dn <= c.hi);
    const m = cs.map(c => (clean(c.type).match(/Table ([DEFH])/) || [])[1]).find(Boolean) || (String((C(cl) || {}).title || "").match(/Table ([DEFH])/) || [])[1]; return nd ? m || null : null; }
  const gcomp = (cl, g) => ((C(cl) || { comps: [] }).comps).find(c => /gasket/i.test(c.d) && (!g || clean(c.type).includes(g))) || ((C(cl) || { comps: [] }).comps).find(c => /gasket/i.test(c.d));
  const thk = c => { const m = c && clean(c.type).match(/(\d+(?:\.\d+)?)\s*mm\s*thick/i); return m ? +m[1] : null; };
  function gthk(cl, g){ g = g || gaskets(cl)[0]; const own = gcomp(cl, g); if (own && thk(own) && (!g || clean(own.type).includes(g))) return thk(own);
    /* (the class doesn't say: the same gasket where another class does, to the same flange table when it can) */
    const t = (String((C(cl) || {}).title || "").match(/Table ([DEFH])/) || [])[1], all = Object.values(D ? D.pipe : {}).flatMap(c => c.comps).filter(c => /gasket/i.test(c.d) && g && clean(c.type).includes(g) && thk(c));
    const best = all.find(c => t && clean(c.type).includes("Table " + t)) || all[0]; return best ? thk(best) : own ? thk(own) : null; }
  /* a flange joint's bolting: flange on flange with the class's gasket (a wafer valve or the like between them takes a longer stud: change the length) */
  function joint(cl, dn){ const nd = dnOf(cl, dn), t = ftab(cl, dn), row = t && FT[t] && FT[t][nd], chk = [];
    if (!row) return { chk: "the flange table at this size", nd, t };
    const [n, d, T] = row, g = gthk(cl) || (chk.push("gasket thickness, 3 mm assumed"), 3), L0 = lining(cl), faces = /^RL/.test(cl) ? 6 : 0;   // (rubber lined classes: 3 mm of rubber on each flange face)
    if (!T) chk.push("the flange thickness (Table " + t + ")"); if (U(cl) === "OD") chk.push("the stub flange and backing ring thickness"); if (U(cl) === "OD" && ODCHK.has(dn)) chk.push("the DN of an " + lab(cl, dn) + " stub flange");
    const grip = T ? 2 * T + g + faces : null, m = NUT[d], p = PITCH[d], up = (x, s) => Math.ceil(x / s) * s;
    return { n, d, t, nd, T, g, faces, grip, stud: grip ? up(grip + 2 * m + 6 * p, 5) : null, bolt: grip ? up(grip + m + 3 * p, grip + m + 3 * p > 80 ? 10 : 5) : null, chk: chk.join(", ") }; }
  function bolt(r){ const J = joint(r.cl, r.dn), comp = ((C(r.cl) || { comps: [] }).comps).find(c => clean(c.d) === r.it), kind = /^B:/.test(r.it) ? r.it.slice(2) : /nut/i.test(r.it) ? "nut" : /machine/i.test(r.it) ? "bolt" : "stud";
    const what = comp ? clean(comp.type) + (clean(comp.dim) && clean(comp.dim) !== "-" ? ", " + clean(comp.dim) : "") : "material to suit piping class " + r.cl, L = +r.bl || (kind === "stud" ? J.stud : kind === "bolt" ? J.bolt : null);
    const chk = [J.chk, comp ? "" : "the bolting material (the spec doesn't list bolting for " + r.cl + ")", L || kind === "nut" ? "" : "the length"].filter(Boolean).join(", ");
    const size = J.d ? "M" + J.d + (kind === "nut" ? "" : " x " + (L || "?") + (r.bl ? "" : "")) : "";
    const NAME = { stud: "Stud bolt", bolt: "Machine bolt, hex head", nut: "Hex nut" };
    return { bolt: kind, J, L, chk, unit: "ea", auto: size + (J.n ? ", " + (kind === "nut" ? 2 * J.n : J.n) + " per joint" : ""),
      line: NAME[kind] + " " + size + ", " + what + (J.t ? ", for DN" + J.nd + " AS 2129 Table " + J.t + " flanges" : ""),
      rows: [["Item", NAME[kind]], ["Size", size || "not known: " + (J.chk || "")], ["Material", what], ["Per joint", J.n ? (kind === "nut" ? 2 * J.n + " nuts (2 per stud)" : J.n + " " + kind + "s") : ""], ["Flange", J.t ? "DN" + J.nd + ", AS 2129 Table " + J.t + (J.T ? ", " + J.T + " mm plate" : "") : ""],
        ["Length worked out", J.grip && kind !== "nut" ? (r.bl ? r.bl + " mm, set by hand (worked out: " + (kind === "stud" ? J.stud : J.bolt) + " mm)" : L + " mm: two flanges " + 2 * J.T + " mm, gasket " + J.g + " mm" + (J.faces ? ", rubber faces " + J.faces + " mm" : "") + ", " + (kind === "stud" ? "two nuts" : "one nut") + " and 3 threads clear, rounded up") : ""],
        ["To check", chk]].filter(x => x[1]) }; }
  /* the material family a class belongs to, for the headings in the class list */
  const FAM = [["Carbon steel", /^(MS\d|XS)/], ["Galvanised steel", /^MSG/], ["Lined steel", /^(CL|RL)\d/], ["Stainless steel", /^SS\d/], ["Poly (HDPE)", /^PE/], ["Other plastic", /./]];
  const family = cl => (FAM.find(([, re]) => re.test(cl)) || FAM[FAM.length - 1])[0], FAMS = FAM.map(f => f[0]);
  const title = cl => C(cl) ? clean(C(cl).title) : "";
  return { lab, U, dnOf, joint, branchPlan, branchy, BOLTS, FLG, family, FAMS, reducing, branches, load, ready, classes, title, spec: cl => C(cl), sizes, items, lines, variants, resolve, clean, DNS, meta: () => D && D.meta };
})();
