/* The Piping and Supports pages of an action's Materials (stage 1: the lists; the isometric sketch comes next).
   Piping: the job as it's built, line by line: line A is A1, A2, A3…, and a branch off a tee is its own line B (B1, B2…).
   Each row is an item from the pipe spec (class, size, item; a pipe has its length), a flange joint (one row, its flanges,
   gasket, studs and nuts under it: the gasket and bolting worked out from the spec, the mating flange can be another class),
   or a support on the pipe before it (S1, S2…). The Spec at the top is what new rows start in and what the lists offer.
   Two ways to number it: Line order (A1, A2, A4.1…) or Item numbers (P1, E2, F4, G5…: the BoM's numbers, as an ISO's tags).
   The BoM adds it all up by specification; the RFQ and the work pack take the BoM (with the supports' parts).
   Supports: one row per support placed on the piping, each started from scratch, from one of the client's standard supports
   (only those that suit the pipe's size and material; its parts come from the standard's table) or the same as another
   support; parts of the frame that holds it up are added under it. Supports with the same parts print with the same number */
"use strict";
const Piping = (() => {
  /* steel pipe outside diameters (ASME B36.10), for the standards sized by OD */
  const ODS = { 15: 21.3, 20: 26.7, 25: 33.4, 32: 42.2, 40: 48.3, 50: 60.3, 65: 73, 80: 88.9, 90: 101.6, 100: 114.3, 125: 141.3, 150: 168.3, 200: 219.1, 250: 273.1, 300: 323.9, 350: 355.6, 400: 406.4, 450: 457, 500: 508, 550: 559, 600: 610, 650: 660, 700: 711, 750: 762, 800: 813, 900: 914, 1000: 1016, 1050: 1067, 1200: 1219 };
  const P = a => a.pip || (a.pip = { spec: "", lines: [{ id: "A", rows: [] }] });
  const SUP = a => a.sups || (a.sups = []);
  const K = a => "a:" + a._p;
  const view = { by: lsGet("adPipBy", "line"), pv: "list", sv: "list" };
  const isPipe = r => /^pipe$/i.test(String(r.it || "").trim()) || /^pipe\b(?! nipple)/i.test(String(r.it || ""));
  const R = r => r.cl && r.dn && r.it ? PipeSpec.resolve(r) : { need: !r.cl ? "spec" : !r.dn ? "size" : "item" };
  const lineTxt = r => { const x = R(r); return x.line || ""; };
  /* ---------- a joint's parts: the two flanges as picked, the gasket, studs and nuts from the first flange's class ---------- */
  function jointKids(r){ const fa = r.fa || {}, fb = r.fb || {}, cl = fa.cl || r.cl, dn = r.dn, J = cl && dn ? PipeSpec.joint(cl, dn) : {};
    const g = cl && dn ? (PipeSpec.items(cl, dn).find(x => /^G:/.test(x.v)) || {}).v : "";
    const fl = cl && dn ? PipeSpec.items(cl, dn).filter(x => /^(flange|stub flange|flange adaptor)/i.test(x.v) && !/blind/i.test(x.v)) : [], one = fl.length === 1 ? fl[0].v : "";   /* (the class's only flange at that size goes in by itself: on PE the stub flange with its backing ring) */
    return [
      { u: r.u + ".fa", rol: "fa", nm: "Flange", cl, dn, it: fa.it || one, qty: 1, auto: !fa.it && !!one },
      { u: r.u + ".fb", rol: "fb", nm: "Mating flange", cl: fb.cl || cl, dn, it: fb.it || (fb.cl && fb.cl !== cl ? "" : fa.it || one), qty: 1, auto: !fb.it },
      { u: r.u + ".g", rol: "g", nm: "Gasket", cl, dn, it: r.g || g || "", qty: 1, auto: !r.g },
      { u: r.u + ".st", rol: "st", nm: "Studs", cl, dn, it: "B:stud", qty: r.stq != null ? r.stq : J.n || "", auto: r.stq == null },
      { u: r.u + ".nu", rol: "nu", nm: "Nuts", cl, dn, it: "B:nut", qty: r.nuq != null ? r.nuq : J.n ? 2 * J.n : "", auto: r.nuq == null } ]; }
  /* ---------- the BoM: every item added up by its spec line ---------- */
  const CAT = [["P", /^pipe\b/i], ["E", /^elbow/i], ["T", /^tee/i], ["R", /^reducer/i], ["C", /^cap/i], ["F", /^(flange|plate, blind)/i], ["V", /^V:/], ["G", /^G:/], ["B", /^B:(stud|bolt)/], ["N", /^B:nut/]];
  const catOf = it => (CAT.find(([, re]) => re.test(String(it || ""))) || ["X"])[0], ORD = "PERTCFVGBNX";
  function leaves(a){ const out = []; P(a).lines.forEach(L => L.rows.forEach(r => { if (r.k === "joint") jointKids(r).forEach(k => out.push(Object.assign({ par: r }, k))); else if (r.k !== "sup") out.push(Object.assign({ par: r }, r)); })); return out; }
  /* what each pipe meets at its two ends, and how much of its dimension the fittings there take (their centre to pipe stop; a face takes none) */
  const CENTRED = r => r && r.k === "it" && (isElbow(r) || isTee(r) || /^(coupling|union)/i.test(String(r.it || "")));
  function pipeEnds(a){ const out = []; P(a).lines.forEach(L => { const rs = L.rows.filter(x => x.k !== "sup");
      rs.forEach((r, i) => { if (r.k !== "it" || !isPipe(r)) return; let A = rs[i - 1] ? { p: rs[i - 1], role: "run" } : null; if (!A && L.off){ const t = rowOf(a, L.off).r; if (t) A = { p: t, role: "branch" }; } const B = rs[i + 1] ? { p: rs[i + 1], role: "run" } : null; out.push({ r, L, A, B }); }); }); return out; }
  const tk = (end, fn) => end && CENTRED(end.p) && typeof FitDims !== "undefined" ? FitDims[fn](end.p, end.role) : 0;
  /* a pipe's cut length: its dimension less what the fittings at its ends take (the dimension where they aren't on file) */
  function cuts(a){ const m = {}; pipeEnds(a).forEach(x => { const len = +x.r.len || 0; if (!len) return; const c = len - (tk(x.A, "takeout") || 0) - (tk(x.B, "takeout") || 0); m[x.r.u] = Math.max(0, Math.round(c)); }); return m; }
  function bom(a){ const m = new Map(), CU = cuts(a);
    leaves(a).forEach(x => { if (!x.cl || !x.dn || !x.it) return; const t = lineTxt(x); if (!t) return; const pipe = isPipe(x), q = pipe ? (CU[x.u] != null ? CU[x.u] : +x.len || 0) / 1000 : +x.qty || 0;   /* (pipe by its cut length) */
      const k = t; if (!m.has(k)) m.set(k, { desc: t, cat: catOf(x.it), dn: PipeSpec.lab(x.cl, x.dn), qty: 0, unit: pipe ? "m" : "ea", us: [] }); const e = m.get(k); e.qty += q; e.us.push(x.u); });
    const list = [...m.values()].sort((p, q) => ORD.indexOf(p.cat) - ORD.indexOf(q.cat)); list.forEach((e, i) => { e.no = e.cat + (i + 1); e.n = i + 1; }); return list; }
  const numOf = (B, u) => { const e = B.find(x => x.us.includes(u)); return e ? e.no : ""; };
  /* ---------- supports ---------- */
  const famOf = cl => { const f = cl ? PipeSpec.family(cl) : ""; return /Stainless/.test(f) ? "stainless" : /Poly/.test(f) ? "hdpe" : /plastic/i.test(f) ? "other" : "steel"; };
  /* the pipe a support sits on: the last pipe row before it in its line */
  function pipeFor(a, sid){ for (const L of P(a).lines){ let last = null; for (const r of L.rows){ if (r.k === "sup" && r.sid === sid) return last; if (r.k !== "sup" && isPipe(r)) last = r; } } return null; }
  /* a standard's table rows for this pipe: every table keyed by DN (or a DN range) or OD, merged into one set of values */
  const inRange = (v, x) => { const s = String(x); const m = s.match(/^(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)$/); return m ? v >= +m[1] && v <= +m[2] : +s === v; };
  function rowsFor(T, dn, od){ const vars = {}; let hit = false;
    (T.table ? [T.table] : T.tables || []).concat(Array.isArray(T.derived) ? T.derived : T.derived ? [T.derived] : []).forEach(tb => { if (!tb || !tb.rows || !tb.cols) return; const c0 = String(tb.cols[0]);
      const byOD = /^OD$/i.test(c0) || /OD/i.test(String(tb.key || "")) && !/DN/i.test(String(tb.key || "")), v = byOD ? od : dn;
      const row = /^DNmin$/i.test(c0) ? tb.rows.find(r => dn >= +r[0] && dn <= +r[1]) : tb.rows.find(r => inRange(v, r[0]));
      if (/^(FINISH|code|MATL CODE)$/i.test(c0)) return; if (!row) return; hit = true; tb.cols.forEach((c, i) => { vars[c] = row[i]; }); });
    return hit ? vars : null; }
  function stdsFor(pipe){ if (!pipe || typeof SUPSTD === "undefined") return []; const dn = +pipe.dn, od = PipeSpec.U(pipe.cl) === "OD" ? dn : ODS[dn] || dn, fam = famOf(pipe.cl);
    return SUPSTD.filter(T => /^[A-Z]{2,3}\d/.test(T.id) && (T.pipe || []).includes(fam) && !(fam === "hdpe" && T.weldedToPipe) && rowsFor(T, PipeSpec.U(pipe.cl) === "OD" ? dn : dn, od)); }
  /* fill a template: {name} from the row's values and what the user entered; a quantity may be a small sum or an "x if y, else z" */
  const fill = (s, V) => String(s).replace(/\{([^}]+)\}/g, (m, k) => { const key = Object.keys(V).find(x => x.toLowerCase() === k.trim().toLowerCase()); return key != null && V[key] !== "" && V[key] != null ? V[key] : "?"; });
  function qtyOf(q, V){ if (typeof q === "number") return q; let s = fill(q, V).trim(); if (/^\d+(\.\d+)?$/.test(s)) return +s;
    s = s.replace(/^(.+?)\s+if\s+(.+?),\s*else\s+(.+)$/i, "($2)?($1):($3)").replace(/\bis\b/g, "==").replace(/\band\b/g, "&&").replace(/\bor\b/g, "||");
    const names = Object.keys(V).filter(k => /^[A-Za-z_]\w*$/.test(k)); try { const v = Function(...names, '"use strict";return (' + s + ")")(...names.map(k => V[k])); return isFinite(v) ? Math.round(v * 1000) / 1000 : ""; } catch (e){ return ""; } }
  function stdParts(a, S){ const T = (typeof SUPSTD !== "undefined" ? SUPSTD : []).find(x => x.id === S.std), pipe = pipeFor(a, S.sid); if (!T || !pipe) return [];
    const dn = +pipe.dn, od = PipeSpec.U(pipe.cl) === "OD" ? dn : ODS[dn] || dn, V = Object.assign({ DN: dn, OD: od, PIPE: dn }, rowsFor(T, dn, od) || {}, S.vals || {});
    return (T.parts || []).map((p, i) => ({ u: S.sid + ".s" + i, d: fill(p.part, V), size: "", qty: qtyOf(p.qty, V), auto: 1 })); }
  const needIn = T => (T.inputs || []).filter(x => !/^(DN|OD|PIPE)$/i.test(x));
  const partsOf = (a, S) => S.from === "same" ? partsOf(a, SUP(a).find(x => x.sid === S.same) || { parts: [] }) : (S.std ? stdParts(a, S) : []).concat(S.parts || []);
  const sigOf = (a, S) => JSON.stringify(partsOf(a, S).map(p => [p.d, p.size, p.qty]).sort());
  /* supports with the same parts share a number on the iso and in the BoM: the first one's */
  function supNo(a){ const seen = new Map(), out = {}; let n = 0; SUP(a).forEach(S => { const g = sigOf(a, S); if (!partsOf(a, S).length){ out[S.sid] = S.sid; return; } if (!seen.has(g)) seen.set(g, "S" + (++n)); out[S.sid] = seen.get(g); }); return out; }
  function supBom(a){ const m = new Map(); SUP(a).forEach(S => partsOf(a, S).forEach(p => { const k = p.d + "|" + (p.size || ""); if (!m.has(k)) m.set(k, { desc: p.d, size: p.size || "", qty: 0 }); m.get(k).qty += +p.qty || 0; })); return [...m.values()]; }
  /* what the RFQ and the work pack take from here: the piping BoM, then the supports' parts */
  function order(a){ const B = bom(a), out = B.map(e => ({ desc: e.desc, part: "", qty: String(+e.qty.toFixed(3)), unit: e.unit, notes: e.no }));
    supBom(a).forEach(e => out.push({ desc: e.desc + (e.size ? ", " + e.size : ""), part: "", qty: String(e.qty), unit: "ea", notes: "Pipe supports" })); return out; }
  const has = a => !!(a.pip && a.pip.lines.some(L => L.rows.length)) || !!(a.sups && a.sups.length);
  /* ---------- the lists offered ---------- */
  const grouped = l => { const o = []; let g0 = null; if (new Set(l.map(x => x.g).filter(Boolean)).size > 1) l.forEach(x => { if (x.g && x.g !== g0){ o.push({ grp: true, t: x.g }); g0 = x.g; } o.push(x); }); else return l; return o; };
  const classList = () => PipeSpec.classes().map(cl => ({ v: cl, t: cl, sub: PipeSpec.short(cl), g: PipeSpec.family(cl) }));
  const sizeList = cl => PipeSpec.sizes(cl).map(n => ({ v: n, t: PipeSpec.lab(cl, n) }));
  const itemList = (cl, dn, only) => PipeSpec.items(cl, dn).filter(x => x.v !== "BR:" && (!only || only.test(x.v))).map(x => ({ v: x.v, t: x.t || x.v, sub: x.sub || "", g: x.g }));
  const FLGRE = /^(flange|stub flange|flange adaptor|plate, blind)/i;
  /* ---------- drawing the Piping page ---------- */
  function pipingHtml(a, ro){ const CUT = cuts(a), p = P(a), B = bom(a), sn = supNo(a), byItem = view.by === "item";
    const bar = '<div class="pp-bar"><span class="pp-spec' + (p.spec ? "" : " need") + '"><span class="dim">Spec</span><button type="button" class="pp-dd" data-pk="spec"' + (ro ? " disabled" : "") + '>' + esc(p.spec || "Pick a spec") + '</button><button type="button" class="pp-si" data-si="1"' + (p.spec ? "" : " disabled") + ' title="' + (p.spec ? "Show " + esc(p.spec) + " in the pipe spec" : "Pick a spec to see its pages") + '" aria-label="Show the spec pages">' + INFO_I + '</button></span>'
      + ('<div class="seg pp-seg"><button type="button" data-by="line" title="Every part in line order, A1, A2, A3…, as it\x27s built: the list to edit"' + (byItem ? "" : ' class="on"') + '>Sequential</button><button type="button" data-by="item" title="The same parts grouped by specification and numbered P1, E2, F4…: the bill of materials"' + (byItem ? ' class="on"' : "") + '>Grouped</button></div>')
      + (ro ? "" : '<button type="button" class="btn sm pp-line" title="Start another line, such as a branch off a tee">+ Line</button>') + '</div>';
    const fi = u => '<button type="button" class="pp-i" data-fi="' + esc(u) + '" title="About this part: its dimensions, ends and where they come from" aria-label="About this part">' + INFO_I + '</button>';
    if (byItem) return bar + '<div class="pp-sl">' + sketchHtml(a, ro) + '<table class="tbl pt-tbl pp-tbl pp-bom"><thead><tr><th class="pt-no" data-col="No.">#</th><th>Description</th><th>Size</th><th>Qty</th></tr></thead><tbody>'
      + B.map(e => '<tr><td class="pt-no">' + e.no + '</td><td class="pp-ds">' + fi(e.us[0]) + esc(e.desc) + '</td><td>' + esc(e.dn) + '</td><td class="pp-n">' + esc(e.unit === "m" ? (+e.qty.toFixed(2)) + " m" : String(e.qty)) + '</td></tr>').join("")
      + Object.values(sn).filter((v, i, A) => A.indexOf(v) === i && /^S\d/.test(v)).map(s => '<tr><td class="pt-no">' + s + '</td><td>Pipe support ' + s + ' (see Supports)</td><td></td><td class="pp-n">' + Object.values(sn).filter(x => x === s).length + '</td></tr>').join("") + '</tbody></table></div>';
    const dd = (r, c, txt, cls, dis) => '<button type="button" class="pp-dd' + (cls || "") + '" data-r="' + esc(r) + '" data-c="' + c + '"' + (ro || dis ? " disabled" : "") + '>' + esc(txt || "") + '</button>';
    const box = (r, c, v, ph) => '<input class="in pt-in pp-in" data-r="' + esc(r) + '" data-c="' + c + '" inputmode="decimal" value="' + esc(v == null ? "" : v) + '"' + (ro ? " readonly" : "") + (ph ? ' aria-label="' + esc(ph) + '" title="' + esc(ph) + '"' : "") + '>';
    const desc0 = x => { const z = R(x); if (!ro && (z.need === "small end size" || z.need === "branch size")) return '<td class="pp-ds need">' + dd(x.u, "dn2", "Pick the " + z.need) + '</td>'; if (!ro && z.need === "ends or type" && (z.vs || []).length) return '<td class="pp-ds need">' + dd(x.u, "vt", "Pick the ends or type", " pp-wide") + '</td>'; return z.line ? '<td class="pp-ds autof" title="' + esc(z.line) + '">' + esc(z.line) + '</td>' : '<td class="pp-ds dim">' + (x.cl ? "still to pick: " + esc(z.need || "") : "") + '</td>'; };
    const desc = x => desc0(x).replace(/^(<td[^>]*>)/, "$1" + fi(x.u));   /* (the (i) on every description) */
    const X = u => ro ? '<td></td>' : '<td class="pp-x"><button type="button" class="ic-b sm" data-x="' + esc(u) + '" title="Remove">✕</button></td>';
    let body = "";
    p.lines.forEach(L => { let n = 0;
      body += '<tr class="mt-grp nosort pp-lh"><td colspan="8">LINE ' + esc(L.id) + (L.off ? ', OFF ' + esc(L.off) : "") + '</td></tr>';
      L.rows.forEach(r => {
        if (r.k === "sup"){ body += '<tr class="pp-sup" data-u="' + esc(r.u) + '"><td class="pt-no">' + esc(byItem ? sn[r.sid] || r.sid : r.sid) + '</td><td>Pipe support</td><td></td><td></td><td></td><td></td><td class="pp-ds dim">' + esc(supSum(a, r.sid)) + '</td>' + X(r.u) + '</tr>'; return; }
        const id = L.id + (++n), pipe = isPipe(r);
        if (r.k === "joint"){ const ks = jointKids(r);
          body += '<tr class="pp-j" data-u="' + esc(r.u) + '"><td class="pt-no">' + esc(byItem ? [...new Set(ks.map(k => numOf(B, k.u)).filter(Boolean))].join(" ") || id : id) + '</td><td>Flange joint</td><td>' + dd(r.u, "cl", r.cl) + '</td><td>' + dd(r.u, "dn", r.cl ? PipeSpec.lab(r.cl, r.dn) : "") + '</td><td></td><td></td><td class="pp-ds dim">' + (ks.every(k => k.it) ? "" : "pick the flange") + '</td>' + X(r.u) + '</tr>';
          ks.forEach((k, i) => { const ed = k.rol === "fa" || k.rol === "fb";
            body += '<tr class="pp-k" data-u="' + esc(k.u) + '"><td class="pt-no">' + esc(byItem ? numOf(B, k.u) : id + "." + (i + 1)) + '</td><td>' + esc(k.nm) + '</td><td>' + (k.rol === "fb" ? dd(k.u, "cl", k.cl, k.auto ? " autof" : "") : esc(k.cl || "")) + '</td><td>' + esc(k.cl ? PipeSpec.lab(k.cl, k.dn) : "") + '</td><td></td><td' + (k.auto && !ed ? ' class="autof"' : "") + '>' + (ed ? "1" : (k.rol === "st" || k.rol === "nu") ? box(k.u, "q", k.qty) : esc(String(k.qty))) + '</td>'
              + (ed ? '<td class="pp-ds' + (k.it ? (k.auto ? " autof" : "") : " need") + '">' + fi(k.u) + dd(k.u, "it", k.it ? lineTxt(k) || k.it : "", " pp-wide") + '</td>' : desc(k)) + '<td></td></tr>'; }); return; }
        body += '<tr data-u="' + esc(r.u) + '"' + (r.u === sk.sel ? ' class="sel"' : "") + '><td class="pt-no">' + esc(byItem ? numOf(B, r.u) : id) + '</td><td' + (r.it ? "" : ' class="need"') + '>' + dd(r.u, "it", r.it ? (/^[VGB]:/.test(r.it) ? (PipeSpec.items(r.cl, r.dn).find(x => x.v === r.it) || { t: r.it }).t : r.it) : "") + '</td><td>' + dd(r.u, "cl", r.cl) + '</td><td' + (r.dn ? "" : ' class="need"') + '>' + (r.dn && PipeSpec.reducing(r.it) ? '<span class="pp-sz">' + dd(r.u, "dn", PipeSpec.lab(r.cl, r.dn)) + dd(r.u, "dn2", r.dn2 ? (r.dn2 === r.dn ? "× equal" : "× " + PipeSpec.lab(r.cl, r.dn2)) : "× ?", " pp-dn2" + (r.dn2 ? "" : " need")) + '</span>' : dd(r.u, "dn", r.cl && r.dn ? PipeSpec.lab(r.cl, r.dn) : "")) + '</td>'
          + '<td' + (pipe && !r.len ? ' class="need"' : "") + '>' + (pipe ? box(r.u, "len", r.len, CUT[r.u] != null && CUT[r.u] !== +r.len ? "Length, mm (cut length " + CUT[r.u] + " mm, less the fittings at its ends)" : "Length, mm") : "") + '</td><td>' + (pipe ? "" : box(r.u, "qty", r.qty, "Qty")) + '</td>' + desc(r) + X(r.u) + '</tr>'; });
      if (!ro) body += '<tr class="pt-blank pp-add"><td class="pt-no"></td><td class="need">' + dd("+" + L.id, "add", "+ Add to line " + L.id) + '</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>'; });
    return bar + '<div class="pp-sl">' + sketchHtml(a, ro) + '<div class="pp-lw"><table class="tbl pt-tbl pp-tbl"><thead><tr><th class="pt-no" data-col="No.">#</th><th>Item</th><th>Spec</th><th>Size</th><th>Length</th><th>Qty</th><th>Description</th><th data-col="x"></th></tr></thead><tbody>' + body + '</tbody></table></div></div>'; }
  function supSum(a, sid){ const S = SUP(a).find(x => x.sid === sid); if (!S) return ""; const n = partsOf(a, S).length; return (S.from === "same" ? "same as " + S.same : S.std ? "standard " + S.std : n ? "" : "no parts yet") + (n ? (S.from === "same" || S.std ? ", " : "") + n + " part" + (n === 1 ? "" : "s") : ""); }
  /* ---------- drawing the Supports page ---------- */
  function supportsHtml(a, ro){ const S = SUP(a), sn = supNo(a);
    const bar = '<div class="pp-bar"><div class="seg pp-seg"><button type="button" data-sv="list"' + (view.sv === "list" ? ' class="on"' : "") + '>Supports</button><button type="button" data-sv="bom"' + (view.sv === "bom" ? ' class="on"' : "") + '>BoM</button></div></div>';
    if (view.sv === "bom") return bar + '<table class="tbl pt-tbl pp-tbl pp-bom"><thead><tr><th class="pt-no" data-col="No.">#</th><th>Part</th><th>Size</th><th>Qty</th></tr></thead><tbody>' + supBom(a).map((e, i) => '<tr><td class="pt-no">' + (i + 1) + '</td><td>' + esc(e.desc) + '</td><td>' + esc(e.size) + '</td><td class="pp-n">' + e.qty + '</td></tr>').join("") + '</tbody></table>';
    const dd = (r, c, txt, cls) => '<button type="button" class="pp-dd' + (cls || "") + '" data-r="' + esc(r) + '" data-c="' + c + '"' + (ro ? " disabled" : "") + '>' + esc(txt || "") + '</button>';
    const tin = (r, c, v, cls) => '<input class="in pt-in pp-in' + (cls || "") + '" data-r="' + esc(r) + '" data-c="' + c + '" value="' + esc(v == null ? "" : v) + '"' + (ro ? " readonly" : "") + '>';
    let body = "";
    S.forEach(s => { const pipe = pipeFor(a, s.sid), T = s.std && SUPSTD.find(x => x.id === s.std), from = s.from === "same" ? "Same as " + s.same : T ? T.id + "  " + T.name : s.from === "scratch" ? "From scratch" : "";
      body += '<tr class="pp-sp" data-s="' + esc(s.sid) + '"><td class="pt-no">' + esc(s.sid) + (sn[s.sid] !== s.sid && /^S\d/.test(sn[s.sid] || "") ? ' <span class="dim">= ' + esc(sn[s.sid]) + '</span>' : "") + '</td><td' + (from ? "" : ' class="need"') + '>' + dd(s.sid, "from", from) + '</td><td class="dim">' + esc(pipe && pipe.cl ? "on " + PipeSpec.lab(pipe.cl, pipe.dn) + " " + pipe.cl : "on no pipe yet") + '</td><td></td><td></td>' + (ro ? '<td></td>' : '<td class="pp-x"><button type="button" class="ic-b sm" data-xs="' + esc(s.sid) + '" title="Remove this support">✕</button></td>') + '</tr>';
      if (s.from === "same"){ partsOf(a, s).forEach((p, i) => body += '<tr class="pp-k"><td class="pt-no">' + esc(s.sid + "." + (i + 1)) + '</td><td></td><td class="autof">' + esc(p.d) + '</td><td class="autof">' + esc(p.size || "") + '</td><td class="autof pp-n">' + esc(String(p.qty)) + '</td><td></td></tr>'); return; }
      if (T) needIn(T).forEach(k => { const v = (s.vals || {})[k]; body += '<tr class="pp-k"><td class="pt-no"></td><td class="dim">' + esc(k) + '</td><td' + (v ? "" : ' class="need"') + '>' + tin(s.sid, "val:" + k, v) + '</td><td></td><td></td><td></td></tr>'; });
      let i = 0; (T ? stdParts(a, s) : []).forEach(p => body += '<tr class="pp-k"><td class="pt-no">' + esc(s.sid + "." + (++i)) + '</td><td></td><td class="autof" title="' + esc(p.d) + '">' + esc(p.d) + '</td><td class="autof"></td><td class="autof pp-n">' + esc(String(p.qty)) + '</td><td></td></tr>');
      (s.parts || []).forEach((p, j) => body += '<tr class="pp-k"><td class="pt-no">' + esc(s.sid + "." + (++i)) + '</td><td></td><td>' + tin(s.sid, "p" + j + ":d", p.d) + '</td><td>' + tin(s.sid, "p" + j + ":size", p.size) + '</td><td>' + tin(s.sid, "p" + j + ":qty", p.qty, " pp-n") + '</td>' + (ro ? '<td></td>' : '<td class="pp-x"><button type="button" class="ic-b sm" data-xp="' + esc(s.sid + "|" + j) + '" title="Remove this part">✕</button></td>') + '</tr>');
      if (!ro && s.from && s.from !== "same") body += '<tr class="pt-blank pp-k"><td class="pt-no"></td><td></td><td>' + tin(s.sid, "new:d", "", "") + '</td><td></td><td></td><td></td></tr>'; });
    return bar + '<div class="pp-sk"></div>' + (S.length ? '<table class="tbl pt-tbl pp-tbl pp-sups"><thead><tr><th class="pt-no" data-col="No.">#</th><th>Start from</th><th>Part</th><th>Size</th><th>Qty</th><th data-col="x"></th></tr></thead><tbody>' + body + '</tbody></table>' : '<p class="dim">Supports placed on the piping list show here, S1, S2 and on.</p>'); }
  /* ---------- the sketch: an isometric of the lines, drawn from the list ----------
     Each pipe row holds its direction (E, W, N, S, U, D, or a 45° run between two of them, such as EN) and its drawn length in
     grid steps (gl; not to scale: Autofit evens them out). Walking a line's rows in order lays it out: a pipe runs from where
     the last one ended, a fitting, valve or joint sits at that point, a support sits on the pipe before it (at), a tee starts
     the line that comes off it. The real lengths are the dimensions; the item numbers are the BoM's, boxed as on an ISO */
  const G = 46, CX = G * Math.cos(Math.PI / 6), CY = G / 2;
  const AX = { E: [1, 0, 0], W: [-1, 0, 0], N: [0, 1, 0], S: [0, -1, 0], U: [0, 0, 1], D: [0, 0, -1] };
  const DIRS = Object.assign({}, AX); [["E", "W"], ["N", "S"], ["U", "D"]].forEach((p, i, A) => A.slice(i + 1).forEach(q => p.forEach(x => q.forEach(y => { DIRS[x + y] = AX[x].map((v, k) => v + AX[y][k]); }))));
  const add3 = (a, b, n) => a.map((v, k) => v + b[k] * (n == null ? 1 : n));
  const prj = p => [(p[0] + p[1]) * CX, (p[0] - p[1]) * CY - p[2] * G];
  const cos3 = (a, b) => { const d = a.reduce((t, v, k) => t + v * b[k], 0), m = Math.hypot(...a) * Math.hypot(...b); return m ? d / m : 0; };
  const PERP = d => /^[EW]/.test(d) && d.length === 1 ? "N" : /^[NS]$/.test(d) ? "E" : "E";
  const sk = { tool: "sel", dl: null, sel: null };
  const isElbow = r => /^elbow/i.test(String(r.it || "")), isTee = r => /^(tee|lateral|cross|y piece|junction|tapping saddle)|olet\b/i.test(String(r.it || ""));
  const isEnd = r => /^(cap|plug|plate, blind|flange, blind|blind)/i.test(String(r.it || "")) || r.sym === "cap";
  const valveType = r => { if (!/^V:/.test(r.it || "")) return ""; const z = R(r); return String(((z.rows || []).find(x => x[0] === "Type") || [])[1] || ""); };
  function layout(a){ const p = P(a), out = { segs: [], nodes: [], sups: [], ends: [], at: {} }; const placed = new Set(); let guard = 0, nextX = 0;
    while (placed.size < p.lines.length && guard++ < 20) p.lines.forEach(L => { if (placed.has(L.id)) return; let start;
      if (L.off){ if (!out.at[L.off]) return; start = out.at[L.off].p3; } else start = Array.isArray(L.at) ? L.at.slice() : L.id === p.lines[0].id ? [0, 0, 0] : [nextX, -2, 0];
      placed.add(L.id); let cur = start, pd = L.dir0 || null, last = null, prev = null;
      L.rows.forEach(r => {
        if (r.k === "sup"){ if (last){ const ln = +last.r.len || 0, f = r.dd && ln ? Math.min(0.96, Math.max(0.04, r.from === "b" ? 1 - r.dd / ln : r.dd / ln)) : r.at != null ? r.at : 0.5; out.sups.push({ r, L, pipe: last.r, f, p3: add3(last.a3, DIRS[last.d], last.n * f), d: last.d }); } return; }
        if (r.k === "it" && isPipe(r)){ const d = r.dir || (prev && isElbow(prev) && pd ? PERP(pd) : pd) || "E", n = Math.max(1, +r.gl || 3), s = { r, L, a3: cur, b3: add3(cur, DIRS[d], n), d, n };
          out.segs.push(s); cur = s.b3; pd = d; last = s; prev = r; return; }
        const nd = { r, L, p3: cur, d: pd || "E" }; out.nodes.push(nd); out.at[r.u] = nd; prev = r; });
      (out.lastPt = out.lastPt || {})[L.id] = cur; { const lr = [...L.rows].reverse().find(x => x.k !== "sup"); if (!(lr && isEnd(lr))) out.ends.push({ L, p3: cur, d: pd }); } nextX = Math.max(nextX, ...out.segs.map(s => Math.max(s.a3[0], s.b3[0]) + 4)); });
    return out; }
  /* the symbols, ISO style: a joint two short bars across the pipe, a valve a bow tie, a reducer a taper, a tee a dot, a cap an arc,
     a support a stem off the pipe with a bar across its end (the same mark on every plane); tags boxed */
  /* ---------- what doesn't fit together: where two neighbours meet ----------
     Sizes: a size change needs a reducer (or a reducing tee for a branch). Ends: each item's ends from its spec line ("Plain end",
     "Press Connector x Threaded, BSP Female"…), and what can be joined straight to what: plain end into a socket weld, press,
     electrofusion or tube fitting; bevel to bevel; thread to thread (not male to male or female to female); flange to flange;
     plain end to plain end only on PE pipe (butt fusion). A flange joint joins anything; an end the spec doesn't say isn't checked */
  const itemTxt = r => !r.it ? (r.sym === "valve" ? "Valve" : r.sym === "red" ? "Reducer" : "Item") : /^[VGB]:/.test(r.it) ? (PipeSpec.items(r.cl, r.dn).find(x => x.v === r.it) || { t: r.it }).t : r.it;
  const endCode = t => { t = String(t || "").toLowerCase(); return /press/.test(t) ? "PR" : /electrofusion/.test(t) ? "EF" : /tube fitting/.test(t) ? "TF" : /socket weld/.test(t) ? "SW"
    : /thread|bsp|npt/.test(t) ? "TH" + (/female|tapping/.test(t) ? "F" : /\bmale/.test(t) ? "M" : "") : /bevel/.test(t) ? "BW" : /plain|spigot/.test(t) ? "PE" : /flange|raised face/.test(t) ? "FL" : ""; };
  const END_W = { PE: "a plain end", BW: "a bevelled end", SW: "a socket weld end", PR: "a press connector", EF: "an electrofusion socket", TF: "a tube fitting end", FL: "a flanged end", TH: "a threaded end", THM: "a male thread", THF: "a female thread" };
  const endsOf = r => { if (r.k !== "it" || !r.it) return null; const z = R(r), e = ((z.rows || []).find(x => x[0] === "Ends") || [])[1]; if (!e) return null; const cs = String(e).split(/\s+x\s+/i).map(endCode).filter(Boolean); return cs.length ? { t: e, cs } : null; };
  function endsFit(x, y, hd){ const k = [x, y].sort().join("|"), th = c => /^TH/.test(c);
    if (th(x) && th(y)) return !(x.length === 3 && x === y);
    if (x === y) return x === "BW" || x === "FL" || (x === "PE" && hd);
    return ["PE|SW", "PE|PR", "EF|PE", "PE|TF"].includes(k); }
  const nd = (cl, v) => (cl && PipeSpec.dnOf(cl, v)) || v;   /* (sizes compared as DN, so OD110 PE meets DN100 steel) */
  const sizesIn = r => r.k === "joint" || r.k === "it" ? (r.dn ? (PipeSpec.reducing(r.it) && r.dn2 && !isTee(r) ? [r.dn, r.dn2] : [r.dn]).map(v => nd(r.cl, v)) : []) : [];
  function checks(a, Lo){ const p = P(a), out = [], name = (L, r) => { let n = 0; for (const x of L.rows){ if (x.k !== "sup") n++; if (x === r) break; } return L.id + n + " " + (r.k === "joint" ? "Flange joint" : itemTxt(r)); };
    const lab = r => r.cl && r.dn ? PipeSpec.lab(r.cl, r.dn) : "";
    const meet = (L1, r1, L2, r2, p3, branch) => { const m = [];
      const s1 = branch ? [r1.dn2 || r1.dn].filter(Boolean).map(v => nd(r1.cl, v)) : sizesIn(r1), s2 = sizesIn(r2);
      if (s1.length && s2.length && !s1.some(v => s2.includes(v))) m.push({ t: "Size change with no reducer", d: name(L1, r1) + " is " + (branch && r1.dn2 ? PipeSpec.lab(r1.cl, r1.dn2) + " on its branch" : lab(r1)) + ", " + name(L2, r2) + " is " + lab(r2) + ". Put a reducer between them, or change one of the sizes." });
      const cs = r => r.k === "joint" ? [(r.fa && r.fa.cl) || r.cl, (r.fb && r.fb.cl) || r.cl] : [r.cl], k1 = cs(r1), k2 = cs(r2), c1 = k1.find(x => !k2.includes(x)) || k1[0], c2 = k2.find(x => !k1.includes(x)) || k2[0], adp = x => /adapt|transition|stub flange/i.test(itemTxt(x));   /* (a joint suits either of its flanges' specs) */
      if (c1 && c2 && !k1.some(x => k2.includes(x)) && !adp(r1) && !adp(r2)) m.push({ t: "Spec change with no flange or adaptor", d: name(L1, r1) + " is " + c1 + ", " + name(L2, r2) + " is " + c2 + ". Put a flange joint between them (its mating flange can be in the other spec), or an adaptor." });
      const e1 = r1.k === "joint" ? null : endsOf(r1), e2 = r2.k === "joint" ? null : endsOf(r2), hd = famOf(r1.cl) === "hdpe" && famOf(r2.cl) === "hdpe";
      if (e1 && e2 && !e1.cs.some(x => e2.cs.some(y => endsFit(x, y, hd)))) m.push({ t: "Ends that don't join", d: name(L1, r1) + " has " + e1.t.toLowerCase() + ", " + name(L2, r2) + " has " + e2.t.toLowerCase() + ". " + (e1.cs.concat(e2.cs).includes("FL") ? "Put a flange joint between them, or pick" : "Pick") + " items whose ends join (for example a plain end into a socket weld or press fitting)." });
      if (m.length) out.push({ k: r1.u + ">" + r2.u, p3, m }); };
    const posEnd = r => { const s = Lo.segs.find(x => x.r === r); if (s) return s.b3; const n = Lo.nodes.find(x => x.r === r); return n && n.p3; };
    /* a pipe shorter than the fittings at its ends reach */
    pipeEnds(a).forEach(x => { const len = +x.r.len || 0; if (!len) return; const ra = tk(x.A, "reach"), rb = tk(x.B, "reach"); if (!ra && !rb) return; const need = Math.round((ra || 0) + (rb || 0)); if (len >= need) return;
      const s0 = Lo.segs.find(q => q.r === x.r); if (!s0) return; const mid = s0.a3.map((v, k) => (v + s0.b3[k]) / 2);
      out.push({ k: "short>" + x.r.u, p3: mid, m: [{ t: "Too short for its fittings", d: name(x.L, x.r) + " is " + len + " mm, but the fittings at its ends reach " + [ra, rb].filter(Boolean).map(v => Math.round(v)).join(" + ") + " mm from their centres. The shortest it can be is " + need + " mm (more where the maker sets a least pipe between joints)." }] }); });
    p.lines.forEach(L => { const rs = L.rows.filter(r => r.k !== "sup");
      if (L.off){ const T = rowOf(a, L.off), r0 = rs[0]; if (T.r && r0){ const pt = posEnd(T.r); if (pt) meet(T.L, T.r, L, r0, pt, true); } }
      rs.forEach((r, i) => { if (!i) return; const pt = posEnd(rs[i - 1]); if (pt) meet(L, rs[i - 1], L, r, pt, false); }); });
    return out; }
  const WELD_T = { FW: "Field weld", FFW: "Field fit weld (150 mm pipe green)", FFG: "Field fit groove (150 mm pipe green)" };
  function sketchSvg(a, ro){ const byI = view.by === "item", seq = {}; P(a).lines.forEach(L => { let n = 0; L.rows.forEach(r => { if (r.k !== "sup") seq[r.u] = L.id + (++n); }); });   /* (the tags follow the list: A1, A2… in Sequential, P1, E2… in Grouped) */
    const TL = u => byI ? numOf(B, u) : seq[u] || ""; const noteTxt = (q, t, k) => '<text class="iso-note" data-note="' + esc(k) + '" x="' + Math.round(q[0]) + '" y="' + Math.round(q[1]) + '">' + String(t).split(/\n/).map((x, i) => '<tspan x="' + Math.round(q[0]) + '" dy="' + (i ? "1.2em" : 0) + '">' + esc(x) + '</tspan>').join("") + '</text>'; const Lo = layout(a), B = bom(a), sn = supNo(a), pts = [];
    Lo.segs.forEach(s => pts.push(prj(s.a3), prj(s.b3))); Lo.nodes.forEach(n => pts.push(prj(n.p3))); Lo.ends.forEach(e => pts.push(prj(e.p3)));
    if (!pts.length) pts.push([0, 0]);
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]), M = 90; let x0 = Math.min(...xs) - M, y0 = Math.min(...ys) - M, w = Math.max(...xs) - x0 + M, hgt = Math.max(...ys) - y0 + M;
    /* (room to draw into: at least 700 by 460, the drawing in the middle) */
    if (w < 520){ x0 -= (520 - w) / 2; w = 520; } if (hgt < 300){ y0 -= (300 - hgt) / 2; hgt = 300; }
    const unit = d => { const q = prj(DIRS[d]), m = Math.hypot(q[0], q[1]); return [q[0] / m, q[1] / m]; }, nrm = d => { const u = unit(d); return [u[1], -u[0]]; };
    const f1 = v => Math.round(v * 10) / 10, L2 = (p, q, c, extra) => '<line class="' + c + '" x1="' + f1(p[0]) + '" y1="' + f1(p[1]) + '" x2="' + f1(q[0]) + '" y2="' + f1(q[1]) + '"' + (extra || "") + '/>';
    const vbA = (sk.vb && sk.vbA === a.id ? sk.vb : [x0, y0, w, hgt]), kNow = sk.fw ? Math.max(1, Math.min(6, 1 / Math.min(sk.fw / vbA[2], sk.fh / vbA[3]))) : 1;   /* (how much the text is scaled up in this view, so clashes are judged at the size it shows) */
    const obs = [], tag = (q, t, u) => { if (!t) return ""; const tw = 8 + t.length * 6.4, k0 = kNow; obs.push({ c: [q[0] + tw * k0 / 2, q[1]], r: tw * k0 / 2 + 2 }); return '<g class="iso-tg' + (u === sk.sel ? " on" : "") + '"' + (u ? ' data-u="' + esc(u) + '"' : "") + ' transform="translate(' + f1(q[0]) + ',' + f1(q[1]) + ')"><g class="iso-k"><rect x="0" y="-8" width="' + f1(tw) + '" height="15"/><text x="4" y="3.5">' + esc(t) + '</text></g></g>'; };
    /* a tag beside a part on the pipe (valve, joint, reducer, coupling): pushed out along v, clear of the symbol, the whole box on that side (it never sits on the part) */
    const tagOut = (q, v, d, t, u) => { if (!t) return ""; const k0 = kNow, tw = (8 + t.length * 6.4) * k0;
      const spot = dd => { const p = [q[0] + v[0] * dd * k0, q[1] + v[1] * dd * k0]; return [v[0] < -0.25 ? p[0] - tw : v[0] > 0.25 ? p[0] : p[0] - tw / 2, p[1] + (Math.abs(v[0]) <= 0.25 ? Math.sign(v[1] || 1) * 8 * k0 : v[1] * 8 * k0)]; };
      return tag(spot(d), t, u); };
    let g = "";
    /* the dot grid: every point of the iso lattice over the drawing */
    g += '<defs><pattern id="iso-dots" patternUnits="userSpaceOnUse" width="' + f1(2 * CX) + '" height="' + f1(2 * CY) + '"><circle class="iso-dot" cx="0" cy="0" r="1"/><circle class="iso-dot" cx="' + f1(CX) + '" cy="' + f1(CY) + '" r="1"/><circle class="iso-dot" cx="' + f1(2 * CX) + '" cy="0" r="1"/><circle class="iso-dot" cx="0" cy="' + f1(2 * CY) + '" r="1"/><circle class="iso-dot" cx="' + f1(2 * CX) + '" cy="' + f1(2 * CY) + '" r="1"/></pattern></defs><rect class="iso-bg" x="-100000" y="-100000" width="200000" height="200000" fill="url(#iso-dots)"/>';
    /* dimensions run to the face of a valve, reducer, flange joint or cap, to the centre of an elbow or tee (as on the ISOs) */
    const halfOf = r => !r ? 0 : r.k === "joint" ? 3 : /^V:/.test(r.it || "") || r.sym === "valve" ? 9 : /^reducer/i.test(r.it || "") || r.sym === "red" ? 7 : isEnd(r) ? 5 : 0;
    const nbr = (s, dir) => { const rs = s.L.rows.filter(x => x.k !== "sup"), i = rs.indexOf(s.r); return rs[i + dir] || null; };
    const face = (s, end) => { const A = prj(s.a3), Bp = prj(s.b3), u = unit(s.d), hf = halfOf(nbr(s, end === "a" ? -1 : 1)); return end === "a" ? [A[0] + u[0] * hf, A[1] + u[1] * hf] : [Bp[0] - u[0] * hf, Bp[1] - u[1] * hf]; };
    const dimLine = (A, Bp, nm, o, txt, need, attr) => { const A2 = [A[0] + nm[0] * o, A[1] + nm[1] * o], B2 = [Bp[0] + nm[0] * o, Bp[1] + nm[1] * o], mid = [(A2[0] + B2[0]) / 2, (A2[1] + B2[1]) / 2], sg = Math.sign(o) || 1;
      let ang = Math.atan2(B2[1] - A2[1], B2[0] - A2[0]) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      return L2([A[0] + nm[0] * 6 * sg, A[1] + nm[1] * 6 * sg], [A2[0] + nm[0] * 4 * sg, A2[1] + nm[1] * 4 * sg], "iso-d") + L2([Bp[0] + nm[0] * 6 * sg, Bp[1] + nm[1] * 6 * sg], [B2[0] + nm[0] * 4 * sg, B2[1] + nm[1] * 4 * sg], "iso-d") + L2(A2, B2, "iso-d")
        + [A2, B2].map(q => L2([q[0] - 3, q[1] + 3], [q[0] + 3, q[1] - 3], "iso-d")).join("")
        + (dls.push({ A2, B2, ang, o, txt, need, attr, t: 0.5 }), ""); };
    /* the dimensions' figures go in last: where two would sit on each other, one slides to the quarter mark of its line one way and the other the other way */
    const dls = [], dimTexts = () => { const k = kNow, at = (d, t) => [d.A2[0] + (d.B2[0] - d.A2[0]) * t, d.A2[1] + (d.B2[1] - d.A2[1]) * t], rad = d => (Math.max(String(d.txt).length * 6.6 + 6, 13) * k) / 2;
      const hit = (d, e) => { const p1 = at(d, d.t), p2 = at(e, e.t); return Math.hypot(p1[0] - p2[0], p1[1] - p2[1]) < rad(d) + rad(e) - 1; };
      const far = (d, q) => { const a1 = at(d, 0.25), a2 = at(d, 0.75); return Math.hypot(a1[0] - q[0], a1[1] - q[1]) > Math.hypot(a2[0] - q[0], a2[1] - q[1]) ? 0.25 : 0.75; };
      const onTag = d => { const p1 = at(d, d.t); return obs.find(o => Math.hypot(p1[0] - o.c[0], p1[1] - o.c[1]) < rad(d) + o.r - 1); };
      /* each figure in turn: the middle if it's clear, else the quarter mark away from what it would sit on, else the other quarter mark (clear of tags and the figures already placed) */
      const done = []; dls.forEach(d => { const bad = () => onTag(d) || done.find(e => hit(d, e)); d.t = 0.5; const b0 = bad(); if (b0){ const f = far(d, b0.c || at(b0, b0.t)), tries = [f, f === 0.25 ? 0.75 : 0.25]; const ok = tries.find(t => { d.t = t; return !bad(); }); d.t = ok != null ? ok : f; } done.push(d); });
      return dls.map(d => { const m = at(d, d.t); return '<text class="iso-dt' + (d.need ? " need" : "") + '" ' + d.attr + ' transform="translate(' + f1(m[0]) + ',' + f1(m[1]) + ') rotate(' + f1(d.ang) + ')" text-anchor="middle" dy="' + (d.o < 0 ? 12 : -4) + '">' + esc(d.txt) + '</text>'; }).join(""); };
    /* a dimension goes on the outside: the side of its pipe away from the pipes either side of it (the tag goes on the other side) */
    const sideNrm = s => { if (s._nm) return s._nm; const n0 = nrm(s.d), ls = Lo.segs.filter(x => x.L === s.L), i = ls.indexOf(s), A = prj(s.a3), Bp = prj(s.b3), m = [(A[0] + Bp[0]) / 2, (A[1] + Bp[1]) / 2], dot = q => q[0] * n0[0] + q[1] * n0[1];
      let v = 0; if (ls[i - 1]) v -= dot(unit(ls[i - 1].d)); if (ls[i + 1]) v += dot(unit(ls[i + 1].d));   /* (the way the pipes either side turn: the bend's inside) */
      if (Math.abs(v) < 0.05){ v = 0; Lo.segs.forEach(x => { if (x === s) return; const a2 = prj(x.a3), b2 = prj(x.b3); [a2, b2, [(a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2]].forEach(q => { const d = Math.hypot(q[0] - m[0], q[1] - m[1]); if (d > 1 && d < 3 * G) v += dot([q[0] - m[0], q[1] - m[1]]) / d; }); }); }   /* (a Z turns both ways: then the side with less drawn near it) */
      return (s._nm = v > 0.05 ? [-n0[0], -n0[1]] : n0); };
    Lo.segs.forEach(s => { const A = prj(s.a3), Bp = prj(s.b3), on = s.r.u === sk.sel, nm = sideNrm(s), lab = TL(s.r.u);
      g += '<g data-u="' + esc(s.r.u) + '" class="iso-seg' + (on ? " on" : "") + '">' + L2(A, Bp, "iso-p") + L2(A, Bp, "iso-hit") + '</g>';
      /* the dimension: end to end, beside the run, its value the real length (? while still to fill in) */
      g += dimLine(face(s, "a"), face(s, "b"), nm, 26, s.r.len ? String(s.r.len) : "?", !s.r.len, 'data-dim="' + esc(s.r.u) + '"');
      g += tagOut([(A[0] + Bp[0]) / 2, (A[1] + Bp[1]) / 2], [-nm[0], -nm[1]], 8, lab, s.r.u);
      const at = f => [A[0] + (Bp[0] - A[0]) * f, A[1] + (Bp[1] - A[1]) * f], uu = unit(s.d);
      if (!ro) for (let i = 1; i < s.n; i++){ const c = at(i / s.n), on = sk.pt && sk.pt.u === s.r.u && Math.abs(sk.pt.t - i / s.n) < 1e-6; g += '<circle class="iso-pd' + (on ? " on" : "") + '" data-pd="' + esc(s.r.u) + '|' + i + '|' + s.n + '" cx="' + f1(c[0]) + '" cy="' + f1(c[1]) + '" r="' + (on ? 4 : 1.8) + '"><title>A point on the pipe: click it, then a part to put there</title></circle>'; }
      if (s.r.flow){ const c = at(0.3), w = s.r.flow > 0 ? 1 : -1, tp = [c[0] + uu[0] * 9 * w, c[1] + uu[1] * 9 * w], bk = [c[0] - uu[0] * 9 * w, c[1] - uu[1] * 9 * w];
        g += '<path class="iso-flow" data-flow="' + esc(s.r.u) + '" d="M' + f1(tp[0]) + ' ' + f1(tp[1]) + ' L' + f1(bk[0] + nm[0] * 5) + ' ' + f1(bk[1] + nm[1] * 5) + ' L' + f1(bk[0] - nm[0] * 5) + ' ' + f1(bk[1] - nm[1] * 5) + ' Z"><title>Flow</title></path>'; }
      (s.r.welds || []).forEach(w => { const c = at(w.at); g += '<g class="iso-fw" data-weld="' + esc(s.r.u + "|" + w.u) + '"><title>' + esc(WELD_T[w.t] || w.t) + ' (click to change)</title><circle cx="' + f1(c[0]) + '" cy="' + f1(c[1]) + '" r="3.2"/>' + tag([c[0] + nm[0] * 14 - 10, c[1] + nm[1] * 14], w.t) + '</g>'; });
      if (s.r.note) g += noteTxt([mp[0] - nm[0] * 18, mp[1] - nm[1] * 18], s.r.note, s.r.u); });
    Lo.nodes.forEach(n => { const q = prj(n.p3), u = unit(n.d), nm = nrm(n.d), r = n.r, on = r.u === sk.sel; let s = "";
      if (r.k === "joint"){ const ks = jointKids(r), t = byI ? [...new Set(ks.map(k => TL(k.u)).filter(Boolean))].join(" ") : seq[r.u];
        [-3, 3].forEach(dd => { const c = [q[0] + u[0] * dd, q[1] + u[1] * dd]; s += L2([c[0] - nm[0] * 9, c[1] - nm[1] * 9], [c[0] + nm[0] * 9, c[1] + nm[1] * 9], "iso-s"); }); s += tagOut(q, [-nm[0], -nm[1]], 14, t || "J", r.u); }
      else if (/^V:/.test(r.it || "") || r.sym === "valve"){ const vt = valveType(r), P2 = (x, y) => [q[0] + u[0] * x + nm[0] * y, q[1] + u[1] * x + nm[1] * y], pth = (ps, c) => '<path class="iso-s ' + (c || "iso-fill") + '" d="M' + ps.map(p2 => f1(p2[0]) + " " + f1(p2[1])).join(" L") + ' Z"/>';
        if (/butterfly/i.test(vt)){ s += L2(P2(-3, -9), P2(-3, 9), "iso-s") + L2(P2(3, -9), P2(3, 9), "iso-s") + '<circle class="iso-s iso-dotf" cx="' + f1(q[0]) + '" cy="' + f1(q[1]) + '" r="2.6"/>' + tagOut(q, [-nm[0], -nm[1]], 14, TL(r.u), r.u); }
        else if (/check|non.?return/i.test(vt)){ s += pth([P2(-9, 7), P2(9, -7), P2(9, 7), P2(-9, -7)]) + pth([P2(-9, 7), P2(0, 0), P2(-9, -7)], "iso-dotf") + tagOut(q, [-nm[0], -nm[1]], 14, TL(r.u), r.u); }
        else s += pth([P2(-9, 7), P2(9, -7), P2(9, 7), P2(-9, -7)]) + (/ball/i.test(vt) ? '<circle class="iso-s iso-dotf" cx="' + f1(q[0]) + '" cy="' + f1(q[1]) + '" r="3"/>' : "") + tagOut(q, [-nm[0], -nm[1]], 14, TL(r.u), r.u); }
      else if (/^reducer/i.test(r.it || "") || r.sym === "red"){ s += '<path class="iso-s iso-fill" d="M' + [[-7, 8], [7, 4], [7, -4], [-7, -8]].map(([a1, b1]) => f1(q[0] + u[0] * a1 + nm[0] * b1) + " " + f1(q[1] + u[1] * a1 + nm[1] * b1)).join(" L") + ' Z"/>' + tagOut(q, [-nm[0], -nm[1]], 14, TL(r.u), r.u); }
      else if (/^(coupling|union|induction e-coupler)/i.test(r.it || "") || r.sym === "cpl"){ s += '<path class="iso-s iso-fill" d="M' + [[-4, 6], [4, 6], [4, -6], [-4, -6]].map(([a1, b1]) => f1(q[0] + u[0] * a1 + nm[0] * b1) + " " + f1(q[1] + u[1] * a1 + nm[1] * b1)).join(" L") + ' Z"/>' + tagOut(q, [-nm[0], -nm[1]], 14, TL(r.u), r.u); }
      else if (isTee(r)){ s += '<circle class="iso-s iso-dotf" cx="' + f1(q[0]) + '" cy="' + f1(q[1]) + '" r="3.2"/>' + tag([q[0] + 8, q[1] + 14], TL(r.u), r.u); }
      else if (/blind/i.test(r.it || "")){ s += L2([q[0] - nm[0] * 9, q[1] - nm[1] * 9], [q[0] + nm[0] * 9, q[1] + nm[1] * 9], "iso-s") + L2([q[0] + u[0] * 3 - nm[0] * 9, q[1] + u[1] * 3 - nm[1] * 9], [q[0] + u[0] * 3 + nm[0] * 9, q[1] + u[1] * 3 + nm[1] * 9], "iso-s iso-bar") + tag([q[0] - nm[0] * 18 + 6, q[1] - nm[1] * 18], TL(r.u), r.u); }
      else if (/^plug/i.test(r.it || "")){ s += '<rect class="iso-s iso-dotf" x="' + f1(q[0] - 3.5) + '" y="' + f1(q[1] - 3.5) + '" width="7" height="7"/>' + tag([q[0] + 8, q[1] + 14], TL(r.u), r.u); }
      else if (isEnd(r)){ s += '<circle class="iso-s" cx="' + f1(q[0]) + '" cy="' + f1(q[1]) + '" r="5"/>' + tag([q[0] + 8, q[1] + 14], TL(r.u), r.u); }
      else s += '<circle class="iso-s iso-dotf" cx="' + f1(q[0]) + '" cy="' + f1(q[1]) + '" r="2"/>' + tag([q[0] + 6, q[1] + 16], TL(r.u), r.u);
      if (r.note) s += noteTxt([q[0] + nm[0] * 30, q[1] + nm[1] * 30], r.note, r.u);
      g += '<g class="iso-n' + (on ? " on" : "") + '" data-u="' + esc(r.u) + '">' + s + '<circle class="iso-hitn" cx="' + f1(q[0]) + '" cy="' + f1(q[1]) + '" r="9"/></g>'; });
    Lo.sups.forEach(n => { const q = prj(n.p3), lvl = !/[UD]/.test(n.d), sd = lvl ? [0, 1] : nrm(n.d), e = [q[0] + sd[0] * 12, q[1] + sd[1] * 12], on = n.r.u === sk.sel;
      g += '<g class="iso-n' + (on ? " on" : "") + '" data-u="' + esc(n.r.u) + '">' + L2(q, e, "iso-s") + L2([e[0] - sd[1] * 6, e[1] + sd[0] * 6], [e[0] + sd[1] * 6, e[1] - sd[0] * 6], "iso-s iso-bar") + tag(lvl ? [e[0] + 8, e[1] + 4] : [e[0] + sd[0] * 6 + 2, e[1] + sd[1] * 6 + 6], (byI && sn[n.r.sid]) || n.r.sid, n.r.u) + '<circle class="iso-hitn" cx="' + f1(q[0]) + '" cy="' + f1(q[1]) + '" r="9"/></g>';
      const s = Lo.segs.find(x => x.L === n.L && x.r === n.pipe); if (!s) return; const ha = !!nbr(s, -1) || !!s.L.off && s.L.rows.find(x => x.k !== "sup") === s.r, hb = !!nbr(s, 1), end = n.r.from || (ha && !hb ? "a" : hb && !ha ? "b" : n.f <= 0.5 ? "a" : "b"), fp = face(s, end);
      g += dimLine(end === "a" ? fp : q, end === "a" ? q : fp, sideNrm(s), -34, n.r.dd ? String(n.r.dd) : "?", !n.r.dd, 'data-sdim="' + esc(n.r.u) + '" data-se="' + end + '"'); });
    g += dimTexts();
    checks(a, Lo).forEach(c => { const q = prj(c.p3), x = q[0] + 10, y = q[1] - 26;
      g += '<g class="iso-warn" data-warn="' + esc(c.k) + '"><title>' + esc(c.m.map(m => m.t).join("; ") + " (click for more)") + '</title><path d="M' + f1(x) + ' ' + f1(y - 9) + ' L' + f1(x + 10) + ' ' + f1(y + 8) + ' L' + f1(x - 10) + ' ' + f1(y + 8) + ' Z"/><text x="' + f1(x) + '" y="' + f1(y + 6) + '">!</text></g>'; });
    P(a).lines.forEach(L => { if (!L.endNote) return; const e = Lo.lastPt && Lo.lastPt[L.id]; if (e) g += noteTxt([prj(e)[0] + 12, prj(e)[1] + 36], L.endNote, "end:" + L.id); });
    if (!ro && sk.st && sk.st.a === a.id){ const q = prj(sk.st.p3); g += '<circle class="iso-st" cx="' + f1(q[0]) + '" cy="' + f1(q[1]) + '" r="3.5"/>'; }
    if (!ro) Lo.ends.filter(e => e.L.rows.some(x => x.k !== "sup") || e.L.off).forEach(e => { const q = prj(e.p3); g += '<circle class="iso-end' + (sk.dl === e.L.id ? " on" : "") + '" data-end="' + esc(e.L.id) + '" cx="' + f1(q[0]) + '" cy="' + f1(q[1]) + '" r="9"><title>Draw line ' + esc(e.L.id) + ' on from here</title></circle>'; });
    if (!Lo.segs.length && !ro) g += '<text class="iso-hint" x="' + f1(prj([0, 0, 0])[0] + 12) + '" y="' + f1(prj([0, 0, 0])[1] - 12) + '">Pick the Pipe tool, click any dot to start, then click where the pipe runs to</text>';
    const fit = [x0, y0, w, hgt].map(f1).join(" "), vb = sk.vb && sk.vbA === a.id ? sk.vb.map(f1).join(" ") : fit;
    return '<svg class="iso" viewBox="' + vb + '" data-fit="' + fit + '" preserveAspectRatio="xMidYMid meet">' + g + '<line class="iso-ghost" x1="0" y1="0" x2="0" y2="0" hidden/><text class="iso-gt" hidden></text></svg>'; }
  /* the tool buttons show the very symbol each places (drawn the same way as on the sketch, along a level pipe) */
  const IC = d => '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">' + d + '</svg>', PL = '<path d="M1 10H19" stroke-width="2"/>';
  const TOOLS = [["sel", "Select: click a part to find it in the list; click a dimension to type it", IC('<path d="M5 3v13l3.5-3.5 2.5 5 2-1-2.5-5H15z" fill="currentColor" stroke="none"/>')], ["del", "Remove: click a part", IC('<path d="M5 5l10 10M15 5L5 15" stroke-width="2"/>')], 0, ["pipe", "Pipe: click a line\x27s end, then where it runs to", IC('<path d="M3 15L17 5" stroke-width="2.2"/><circle cx="3" cy="15" r="1.8" fill="currentColor" stroke="none"/>')], 0, ["joint", "Flange joint: click a pipe", IC(PL + '<path d="M8.5 3.5v13M11.5 3.5v13"/>')], ["cpl", "Coupling or union: click a pipe (pick which in the list)", IC(PL + '<rect x="7" y="5" width="6" height="10" fill="var(--panel)"/>')], ["valve", "Valve: click a pipe (pick the valve in the list; its symbol follows its type)", IC(PL + '<path d="M5 5v10l10-10v10z" fill="var(--panel)"/>')], ["red", "Reducer: click a pipe (concentric or eccentric in the list)", IC('<path d="M1 10h5M14 10h5" stroke-width="2"/><path d="M6 4l8 3v6l-8 3z" fill="var(--panel)"/>')], ["tee", "Branch: a tee, reducing tee or olet; click a pipe, a new line runs off it", IC('<path d="M1 7H19M10 7v12" stroke-width="2"/><circle cx="10" cy="7" r="2.2" fill="currentColor" stroke="none"/>')], ["cap", "End: a cap, blind flange or plug on a line\x27s open end (pick which in the list)", IC('<path d="M1 10h11" stroke-width="2"/><circle cx="14" cy="10" r="3.5"/>')], 0, ["sup", "Support: click a pipe", IC('<path d="M1 7H19" stroke-width="2"/><path d="M10 7v7M6 14h8" stroke-width="2"/>')], 0, ["flow", "Flow arrow: click a pipe (again to turn it round, a third time to take it off)", IC('<path d="M1 10h7" stroke-width="2"/><path d="M18 10l-10 5V5z" fill="currentColor" stroke="none"/>')], ["note", "Note: click a part or a line\x27s end to write beside it (CONT. ON, CONN. TO, RL, spindle…)", IC('<path d="M3 5h14M3 10h14M3 15h9"/>')]];
  const sketchHtml = (a, ro) => '<div class="iso-w' + (sk.fs ? " iso-full" : "") + '">' + (ro ? "" : '<div class="iso-tb">' + TOOLS.map(x => x === 0 ? '<span class="iso-gap"></span>' : x).map(x => typeof x === "string" ? x : ((k, t, s) => '<button type="button" class="iso-tl' + (sk.tool === k ? " on" : "") + '" data-tool="' + k + '" title="' + esc(t) + '" aria-label="' + esc(t) + '">' + s + '</button>')(...x)).join("") + '<button type="button" class="iso-tl iso-af" data-isofit="1" title="Autofit: even, readable spacing (lengths aren\'t to scale)">Autofit</button><button type="button" class="iso-tl iso-gp" data-isogap="1" title="Free dots Autofit leaves between any two points">' + isoGap() + (isoGap() === 1 ? " dot" : " dots") + '</button></div>') + '<div class="iso-sc">' + sketchSvg(a, ro) + '<button type="button" class="iso-fs" data-fs="1" title="' + (sk.fs ? "Leave full screen (Esc)" : "Full screen") + '" aria-label="' + (sk.fs ? "Leave full screen" : "Full screen") + '">' + (sk.fs ? FS_OUT : FS_IN) + '</button></div></div>';
  const FS_IN = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg>', FS_OUT = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 2v4H2M14 6h-4V2M10 14v-4h4M2 10h4v4"/></svg>';
  /* ---------- the sketch's changes ---------- */
  const lineOf = (a, id) => P(a).lines.find(L => L.id === id);
  const lastOf = (L, f) => [...L.rows].reverse().find(f);
  const specItem = (cl, dn, re) => { const x = cl ? PipeSpec.items(cl, dn || null).find(i => re.test(i.v)) : null; return x ? x.v : ""; };
  function drawPipe(a, L, d, n, pre){ const p = P(a), lp = lastOf(L, r => r.k === "it" && isPipe(r)), base = lastOf(L, r => r.cl) || (L.off && rowOf(a, L.off).r) || {}, cl = p.spec || base.cl, dn = base.cl === cl && base.dn ? base.dn : null;
    const pd = lp ? (lp.dir || "E") : null, c = pd ? cos3(DIRS[pd], DIRS[d]) : 1, rows = [];
    if (pd && c < -0.01) return note("A pipe can't double back on itself");
    if (pd && c < 0.99){ const e45 = c > 0.5; rows.push({ u: uid(), k: "it", cl, dn, it: specItem(cl, dn, e45 ? /^elbow, 45/i : /^elbow, 90/i) || (e45 ? "Elbow, 45°" : "Elbow, 90°"), qty: 1 }); }
    rows.push({ u: uid(), k: "it", cl, dn, it: specItem(cl, dn, /^pipe$/i) || "Pipe", dir: d, gl: n, len: "" });
    save(a, () => { if (pre) pre(); L.rows.push(...rows); }, "Drew pipe on"); sk.sel = rows[rows.length - 1].u; }
  /* a new line from any dot: the first line if nothing is drawn on it yet, else the next letter (A1, A2… then B1, B2…) */
  const nextLine = p => { for (let i = 0; i < 26; i++){ const id = String.fromCharCode(65 + i); if (!p.lines.some(L => L.id === id)) return id; } return "Z" + p.lines.length; };
  function startLine(a, st, d, n){ const p = P(a), L0 = p.lines.find(L => !L.off && !L.rows.some(x => x.k !== "sup")), L = L0 || { id: nextLine(p), rows: [] };
    drawPipe(a, L, d, n, () => { L.at = st.slice(); if (!L0) p.lines.push(L); }); sk.st = null; sk.dl = L.id; }
  /* the grid dot nearest a point on the drawing (on the floor, z 0) */
  const snap = q => { let i = Math.round(q[0] / CX), j = Math.round(q[1] / CY); if ((i + j) % 2){ const di = Math.abs(q[0] / CX - i), dj = Math.abs(q[1] / CY - j); if (di > dj) i += q[0] / CX > i ? 1 : -1; else j += q[1] / CY > j ? 1 : -1; } return [(i + j) / 2, (i - j) / 2, 0]; };
  /* a part placed on a pipe: the pipe splits there (a support sits on it without splitting it); a tee starts a new line */
  function placeOn(a, u, t){ const { L, r } = rowOf(a, u); if (!L || !r || !isPipe(r)) return; const n = Math.max(1, +r.gl || 3), k = Math.max(1, Math.min(n - 1, Math.round(t * n))) || 1;
    if (sk.tool === "sup"){ const sid = "S" + (SUP(a).reduce((m, s) => Math.max(m, +s.sid.slice(1) || 0), 0) + 1); let i = L.rows.indexOf(r) + 1; while (L.rows[i] && L.rows[i].k === "sup") i++;
      return save(a, () => { L.rows.splice(i, 0, { u: uid(), k: "sup", sid, at: Math.round(t * 100) / 100 }); SUP(a).push({ sid, from: "", parts: [] }); }, "Placed a pipe support on"); }
    const nn = Math.max(2, n), kk = n < 2 ? 1 : k, len = +r.len || 0, r2 = Object.assign({}, r, { u: uid(), gl: nn - kk, len: len ? Math.round(len * (nn - kk) / nn) : "" });
    const node = sk.tool === "joint" ? { u: uid(), k: "joint", cl: r.cl, dn: r.dn } : { u: uid(), k: "it", cl: r.cl, dn: r.dn, qty: 1, sym: sk.tool, it: sk.tool === "valve" ? "" : sk.tool === "cpl" ? specItem(r.cl, r.dn, /^coupling(, (standard|sliding))?$/i) || specItem(r.cl, r.dn, /^(coupling(?!, reducing)|induction e-coupler)/i) || specItem(r.cl, r.dn, /^union(?!, reducing)/i) : sk.tool === "red" ? specItem(r.cl, r.dn, /^reducer/i) : specItem(r.cl, r.dn, /^tee, equal/i) || "Tee, equal" };
    let nl = null; if (sk.tool === "tee"){ const p = P(a); nl = { id: nextLine(p), off: node.u, rows: [] }; }
    save(a, () => { const i = L.rows.indexOf(r); let j = i + 1; while (L.rows[j] && L.rows[j].k === "sup") j++; const ss = L.rows.splice(i + 1, j - i - 1);   /* (the pipe's supports stay where they are: each goes with the half it's on) */
      const pos = x => (x.at != null ? x.at : 0.5) * nn, s1 = ss.filter(x => pos(x) <= kk), s2 = ss.filter(x => pos(x) > kk); s1.forEach(x => { x.at = Math.round(pos(x) / kk * 100) / 100; if (x.from === "b"){ delete x.dd; delete x.from; } }); s2.forEach(x => { x.at = Math.round((pos(x) - kk) / (nn - kk) * 100) / 100; if (x.from !== "b"){ delete x.dd; delete x.from; } });   /* (a distance from an end that's now the new part's face is asked for again: ?) */
      const ws = r.welds || []; r.welds = ws.filter(w => w.at * nn <= kk).map(w => Object.assign(w, { at: Math.round(w.at * nn / kk * 100) / 100 })); r2.welds = ws.filter(w => w.at * nn > kk).map(w => Object.assign({}, w, { at: Math.round((w.at * nn - kk) / (nn - kk) * 100) / 100 })); delete r2.flow; delete r2.note;
      r.gl = Math.max(2, kk); r2.gl = Math.max(2, nn - kk); if (len) r.len = Math.round(len * kk / nn); L.rows.splice(i + 1, 0, ...s1, node, r2, ...s2); if (nl) P(a).lines.push(nl); }, "Placed a part on the piping of");
    sk.sel = node.u; if (nl){ sk.tool = "pipe"; sk.dl = nl.id; } }
  function removeAt(a, u){ const { L, r } = rowOf(a, u); if (!L || !r) return; const i = L.rows.indexOf(r); let pi = i - 1; while (L.rows[pi] && L.rows[pi].k === "sup") pi--; const pv = L.rows[pi], nx = L.rows[i + 1];
    if (r.k === "sup") return save(a, () => { L.rows.splice(i, 1); const S = SUP(a), j = S.findIndex(s => s.sid === r.sid); if (j >= 0) S.splice(j, 1); }, "Removed a pipe support from");
    if (isPipe(r)){ if (L.rows.slice(i + 1).some(x => x.k !== "sup")) return note("Only the last pipe of a line can be taken off; remove the parts after it first"); return save(a, () => { L.rows.splice(i); const e = L.rows[L.rows.length - 1]; if (e && isElbow(e)) L.rows.pop(); }, "Removed a pipe from"); }
    if (isElbow(r) && pv && nx) return note("An elbow is where the line turns: draw the line on in another direction instead");
    save(a, () => { L.rows.splice(i, 1); if (pv && nx && isPipe(pv) && isPipe(nx) && (pv.dir || "E") === (nx.dir || "E")){   /* (the two pipes join up again, their supports kept where they were) */
        const g1 = +pv.gl || 3, g2 = +nx.gl || 3, t = g1 + g2; L.rows.slice(pi + 1, i).forEach(x => { x.at = Math.round((x.at != null ? x.at : 0.5) * g1 / t * 100) / 100; });
        let j = L.rows.indexOf(nx) + 1; while (L.rows[j] && L.rows[j].k === "sup"){ const x = L.rows[j]; x.at = Math.round((g1 + (x.at != null ? x.at : 0.5) * g2) / t * 100) / 100; j++; }
        pv.welds = (pv.welds || []).map(w => Object.assign(w, { at: Math.round(w.at * g1 / t * 100) / 100 })).concat((nx.welds || []).map(w => Object.assign(w, { at: Math.round((g1 + w.at * g2) / t * 100) / 100 })));
        pv.gl = t; pv.len = (+pv.len && +nx.len) ? +pv.len + +nx.len : pv.len || ""; L.rows.splice(L.rows.indexOf(nx), 1); }
      P(a).lines = P(a).lines.filter(x => x.off !== r.u || x.rows.length); }, "Removed a part from"); }
  /* Esc while drawing or placing stops that (back to Select) and leaves the action open */
  /* Esc puts the tool away first (the action stays open, full screen stays on); with no tool out, Esc leaves full screen */
  addEventListener("keydown", e => { if (e.key !== "Escape" || !document.querySelector("svg.iso") || document.querySelector(".pop, .ynmodal, .ppv, .iso-co, .iso-din")) return;
    if (sk.tool !== "sel"){ e.stopPropagation(); e.preventDefault(); sk.tool = "sel"; sk.dl = null; sk.st = null; App.render(); return; }
    if (sk.fs){ e.stopPropagation(); e.preventDefault(); fullScreen(false); } }, true);
  const isoGap = () => Math.max(1, Math.min(6, +lsGet("adIsoGap", 1) || 1));
  function autofit(a){ sk.vb = null; save(a, () => P(a).lines.forEach(L => L.rows.forEach((r, i) => { if (!isPipe(r) || r.k !== "it") return; const ss = []; for (let j = i + 1; L.rows[j] && L.rows[j].k === "sup"; j++) ss.push(L.rows[j]);
    const marks = ss.map(x => ({ x, at: x.at != null ? x.at : 0.5 })).concat((r.welds || []).map(w => ({ w, at: w.at }))).sort((p, q) => p.at - q.at), n = marks.length;
    const st = isoGap() + 1; r.gl = st * (n + 1); marks.forEach((m, k) => { const at = (st * (k + 1)) / r.gl; if (m.x) m.x.at = at; else m.w.at = at; }); })), "Autofitted the sketch of"); }
  function wireSketch(el, a){ const svg = $("svg.iso", el); if (!svg) return; const pt = e => { const m = svg.getScreenCTM().inverse(), q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m); return [q.x, q.y]; };
    $$("[data-tool]", el).forEach(b => b.onclick = () => { const t = b.dataset.tool; if (sk.pt && sk.tool === "sel" && PLACE.includes(t)){ const q = sk.pt; sk.pt = null; return placeTool(a, t, q.u, q.t); } sk.pt = null; sk.tool = sk.tool === t ? "sel" : t; if (sk.tool !== "pipe") sk.dl = null; App.render(); });
    const af = $("[data-isofit]", el); if (af) af.onclick = () => autofit(a);
    const gp = $("[data-isogap]", el); if (gp) gp.onclick = () => { const key = Look.open(gp, [1, 2, 3, 4, 5, 6].map(n => ({ v: String(n), t: n + (n === 1 ? " dot" : " dots"), sub: "between any two points" })), String(isoGap()), x => { lsSet("adIsoGap", +x.v); autofit(a); }, { num: true }); gp.onkeydown = e => key && key(e); };
    const fsb = $("[data-fs]", el); if (fsb) fsb.onclick = () => fullScreen(!sk.fs);
    /* zoom and pan: the wheel zooms on the point under the pointer, a drag on the paper pans, a double click on the paper fits it all in */
    const seen = () => { const r = svg.getBoundingClientRect(), m = svg.getScreenCTM().inverse(), p0 = new DOMPoint(r.left, r.top).matrixTransform(m), p1 = new DOMPoint(r.right, r.bottom).matrixTransform(m); return [p0.x, p0.y, p1.x - p0.x, p1.y - p0.y]; };
    const fitText = () => { const m = svg.getScreenCTM(); sk.fw = svg.clientWidth || sk.fw; sk.fh = svg.clientHeight || sk.fh; if (m && m.a){ const k = Math.max(1, Math.min(6, 1 / m.a)); svg.style.setProperty("--k", k.toFixed(3)); sk.k = k; } }; fitText(); requestAnimationFrame(fitText);
    if (!svg._ro && window.ResizeObserver){ svg._ro = new ResizeObserver(fitText); svg._ro.observe(svg); }
    const setVb = v => { sk.vb = v; sk.vbA = a.id; svg.setAttribute("viewBox", v.join(" ")); fitText(); };
    svg.onwheel = e => { e.preventDefault(); const q = pt(e), v = seen(), f = Math.exp((e.deltaY > 0 ? 1 : -1) * Math.min(Math.abs(e.deltaY), 120) * 0.0018), nw = Math.min(Math.max(v[2] * f, 80), 40000), k = nw / v[2];
      setVb([q[0] - (q[0] - v[0]) * k, q[1] - (q[1] - v[1]) * k, v[2] * k, v[3] * k]); };
    let pan = null, panned = false;
    const paper = t => !t.closest("[data-pd],[data-u],[data-end],[data-dim],[data-sdim],[data-warn],[data-weld],[data-flow],[data-note],.iso-fs");
    svg.onpointerdown = e => { panned = false; if (e.button !== 0 && e.button !== 1) return; if (e.button === 0 && !paper(e.target)) return;
      if (e.button === 0 && sk.tool === "del"){ const q = pt(e); box = { q, x: e.clientX, y: e.clientY, id: e.pointerId, el: null }; return; } pan = { x: e.clientX, y: e.clientY, v: seen(), s: svg.getScreenCTM().a, id: e.pointerId }; };
    svg.addEventListener("pointermove", e => { if (box){ if (!box.el && Math.hypot(e.clientX - box.x, e.clientY - box.y) < 4) return;
        if (!box.el){ box.el = document.createElementNS("http://www.w3.org/2000/svg", "rect"); box.el.setAttribute("class", "iso-box"); svg.appendChild(box.el); try { svg.setPointerCapture(box.id); } catch (_){} panned = true; }
        const q = pt(e), x = Math.min(q[0], box.q[0]), y = Math.min(q[1], box.q[1]); box.r = [x, y, Math.abs(q[0] - box.q[0]), Math.abs(q[1] - box.q[1])]; ["x", "y", "width", "height"].forEach((k, i) => box.el.setAttribute(k, box.r[i])); return; }
      if (!pan) return; const dx = e.clientX - pan.x, dy = e.clientY - pan.y; if (!panned && Math.hypot(dx, dy) < 4) return;
      if (!panned){ panned = true; try { svg.setPointerCapture(pan.id); } catch (_){} svg.classList.add("panning"); }
      setVb([pan.v[0] - dx / pan.s, pan.v[1] - dy / pan.s, pan.v[2], pan.v[3]]); });
    let box = null; const endPan = () => { pan = null; svg.classList.remove("panning"); if (box){ const b0 = box; box = null; if (b0.el){ b0.el.remove(); if (b0.r) removeIn(a, b0.r); } } }; svg.addEventListener("pointerup", endPan); svg.addEventListener("pointercancel", endPan);
    const ghost = $(".iso-ghost", svg), gt = $(".iso-gt", svg);
    const aim = e => { if (sk.tool !== "pipe") return null; const st = sk.st && sk.st.a === a.id ? sk.st.p3 : null; if (!sk.dl && !st) return null; const Lo = layout(a), en = sk.dl ? Lo.ends.find(x => x.L.id === sk.dl) : { p3: st }; if (!en) return null; const s0 = prj(en.p3), q = pt(e), v = [q[0] - s0[0], q[1] - s0[1]], m = Math.hypot(...v); if (m < 8) return null;
      let best = null; Object.keys(DIRS).forEach(d => { const w = prj(DIRS[d]), wm = Math.hypot(...w), c = (v[0] * w[0] + v[1] * w[1]) / (m * wm); if (!best || c > best.c) best = { d, c, wm }; });
      const n = Math.max(2, Math.round(m / best.wm)), end = prj(add3(en.p3, DIRS[best.d], n)); return { L: sk.dl ? lineOf(a, sk.dl) : null, st: sk.dl ? null : st, d: best.d, n, s0, end }; };
    svg.onpointermove = e => { const g0 = aim(e); if (!g0){ ghost.setAttribute("hidden", ""); gt.setAttribute("hidden", ""); return; } ghost.removeAttribute("hidden"); gt.removeAttribute("hidden");
      ghost.setAttribute("x1", g0.s0[0]); ghost.setAttribute("y1", g0.s0[1]); ghost.setAttribute("x2", g0.end[0]); ghost.setAttribute("y2", g0.end[1]); gt.setAttribute("x", g0.end[0] + 8); gt.setAttribute("y", g0.end[1] - 8); gt.textContent = g0.d; };
    svg.onclick = e => { if (panned){ panned = false; return; } const wn = e.target.closest("[data-warn]"); if (wn) return callout(a, wn);
      const wd = e.target.closest("[data-weld]"); if (wd && (sk.tool === "sel" || sk.tool === "weld" || sk.tool === "del")) return weldAt(a, wd.dataset.weld, sk.tool === "del");
      const fl = e.target.closest("[data-flow]"); if (fl && (sk.tool === "flow" || sk.tool === "del")) return flowOn(a, fl.dataset.flow, sk.tool === "del");
      const pd = e.target.closest("[data-pd]"); if (pd){ const [u, i, n] = pd.dataset.pd.split("|"), t = +i / +n;
        if (sk.tool === "sel"){ sk.pt = sk.pt && sk.pt.u === u && Math.abs(sk.pt.t - t) < 1e-6 ? null : { u, t }; sk.sel = null; App.render(); return; }
        if (PLACE.includes(sk.tool)) return placeTool(a, sk.tool, u, t); if (sk.tool === "del") return removeAt(a, u); if (sk.tool === "note") return editNote(a, u, pd); }
      const nt = e.target.closest("[data-note]"); if (nt && (sk.tool === "note" || sk.tool === "sel")) return editNote(a, nt.dataset.note, nt);
      const end = e.target.closest("[data-end]"); if (end && sk.tool === "note") return editNote(a, "end:" + end.dataset.end, end); if (end && sk.tool === "cap") return capAt(a, lineOf(a, end.dataset.end), "end"); if (end && sk.tool === "del") return dropLine(a, end.dataset.end); if (end){ if (sk.tool !== "pipe") return; sk.dl = end.dataset.end; App.render(); return; }
      const dim = e.target.closest("[data-dim],[data-sdim]"); if (dim && sk.tool === "sel") return editDim(a, dim);
      if (sk.tool === "pipe"){ const hn = e.target.closest(".iso-n[data-u]"), hr = hn && rowOf(a, hn.dataset.u); if (hr && hr.r && isElbow(hr.r)) return elbowToTee(a, hr.L, hr.r);
        const g0 = aim(e); if (g0 && g0.L) return drawPipe(a, g0.L, g0.d, g0.n); if (g0 && g0.st) return startLine(a, g0.st, g0.d, g0.n);
        const q3 = snap(pt(e)), Lo1 = layout(a), en1 = Lo1.ends.find(x => x.p3.every((v, k) => Math.abs(v - q3[k]) < 1e-6) && x.L.rows.some(y => y.k !== "sup"));
        if (en1){ sk.dl = en1.L.id; sk.st = null; } else { sk.dl = null; sk.st = { a: a.id, p3: q3 }; } App.render(); return; }
      const hit = e.target.closest("[data-u]"); if (!hit) return; const u = hit.dataset.u;
      if (sk.tool === "sel"){ sk.sel = sk.sel === u ? null : u; App.render(); return; }
      if (sk.tool === "del") return removeAt(a, u);
      if (sk.tool === "note") return editNote(a, u, hit);
      if (sk.tool === "cap"){ const { L, r } = rowOf(a, u); if (!L || !r || !isPipe(r)) return note("Click a line's end, or the pipe at either end of it"); const rs = L.rows.filter(x => x.k !== "sup"), Lo0 = layout(a), s0 = Lo0.segs.find(x => x.r === r), A0 = prj(s0.a3), B0 = prj(s0.b3), q0 = pt(e), nearB = Math.hypot(q0[0] - B0[0], q0[1] - B0[1]) < Math.hypot(q0[0] - A0[0], q0[1] - A0[1]);
        const first = rs[0] === r && !L.off, last = rs[rs.length - 1] === r; if (last && (nearB || !first)) return capAt(a, L, "end"); if (first) return capAt(a, L, "start"); return note("An end closure goes on an open end: this pipe has parts at both ends"); }
      if (sk.tool === "flow"){ const { r } = rowOf(a, u); if (!r || !isPipe(r)) return note("Click a pipe to show its flow"); return flowOn(a, u); }
      const { r } = rowOf(a, u); if (!r || !isPipe(r)) return note("Click on a pipe to put it there");
      const Lo = layout(a), s = Lo.segs.find(x => x.r.u === u), A = prj(s.a3), Bq = prj(s.b3), q = pt(e), dx = Bq[0] - A[0], dy = Bq[1] - A[1], t = Math.max(0, Math.min(1, ((q[0] - A[0]) * dx + (q[1] - A[1]) * dy) / (dx * dx + dy * dy || 1)));
      if (sk.tool === "weld") return save(a, () => { (r.welds = r.welds || []).push({ u: uid(), at: Math.round(t * 100) / 100, t: "FW" }); }, "Marked a field weld on");
      placeOn(a, u, t); };
    svg.ondblclick = e => { const dim = e.target.closest("[data-dim],[data-sdim]"); if (dim) return editDim(a, dim); if (sk.tool === "sel" && paper(e.target)){ sk.vb = null; svg.setAttribute("viewBox", svg.dataset.fit); fitText(); } }; }
  /* the Pipe tool on an elbow: it becomes a tee, and a new line starts off it to draw on (the run still turns there) */
  function elbowToTee(a, L, r){ const p = P(a), id = nextLine(p), nl = { id, off: r.u, rows: [] };
    save(a, () => { r.it = specItem(r.cl, r.dn, /^tee, equal$/i) || specItem(r.cl, r.dn, /^tee/i) || "Tee, equal"; delete r.vt; delete r.dn2; p.lines.push(nl); }, "Made an elbow a tee on"); sk.dl = id; sk.sel = r.u; }
  const PLACE = ["joint", "cpl", "valve", "red", "tee", "sup", "weld", "flow"];
  function placeTool(a, tool, u, t){ const { r } = rowOf(a, u); if (!r || !isPipe(r)) return;
    if (tool === "weld") return save(a, () => { (r.welds = r.welds || []).push({ u: uid(), at: Math.round(t * 100) / 100, t: "FW" }); }, "Marked a field weld on");
    if (tool === "flow") return flowOn(a, u);
    const was = sk.tool; sk.tool = tool; placeOn(a, u, t); if (sk.tool === tool) sk.tool = was; App.render(); }
  /* the Remove tool on a line's end dot: a line with nothing drawn on it yet goes (Ctrl+Z brings it back) */
  function dropLine(a, id){ const L = lineOf(a, id); if (!L) return; if (L.rows.some(x => x.k !== "sup")) return note("Line " + id + " has parts on it: remove them first, then its dot");
    if (sk.dl === id) sk.dl = null; save(a, () => { P(a).lines = P(a).lines.filter(x => x !== L); }, "Removed an empty line from"); }
  function removeIn(a, r){ const Lo = layout(a), inn = p3 => { const q = prj(p3); return q[0] >= r[0] && q[0] <= r[0] + r[2] && q[1] >= r[1] && q[1] <= r[1] + r[3]; };
    const sups = Lo.sups.filter(n => inn(n.p3)).map(n => n.r.u), nodes = Lo.nodes.filter(n => inn(n.p3) && !isElbow(n.r)).map(n => n.r.u), pipes = Lo.segs.filter(x => inn(x.a3) && inn(x.b3));
    const marks = Lo.segs.map(x => ({ x, ws: (x.r.welds || []).filter(w => inn(x.a3.map((v, k) => v + (x.b3[k] - v) * w.at))).map(w => w.u), fl: x.r.flow && inn(x.a3.map((v, k) => v + (x.b3[k] - v) * 0.3)) })).filter(m => m.ws.length || m.fl);
    const empt = Lo.ends.filter(e => !e.L.rows.some(x => x.k !== "sup") && inn(e.p3)).map(e => e.L.id);
    const n0 = sups.length + nodes.length + pipes.length + marks.length + empt.length; if (!n0) return note("Nothing inside the box");
    let left = 0; if (sups.length || marks.length || empt.length) save(a, () => { P(a).lines = P(a).lines.filter(L => !empt.includes(L.id)); if (empt.includes(sk.dl)) sk.dl = null; marks.forEach(m => { m.x.r.welds = (m.x.r.welds || []).filter(w => !m.ws.includes(w.u)); if (m.fl) delete m.x.r.flow; });
      P(a).lines.forEach(L => { L.rows = L.rows.filter(x => !(x.k === "sup" && sups.includes(x.u))); }); SUP(a).splice(0, SUP(a).length, ...SUP(a).filter(s => P(a).lines.some(L => L.rows.some(x => x.k === "sup" && x.sid === s.sid)))); }, "Removed parts from");
    nodes.forEach(u => { if (rowOf(a, u).r) removeAt(a, u); });
    P(a).lines.forEach(L => { for (let i = L.rows.length - 1; i >= 0; i--){ const x = L.rows[i]; if (!x || !pipes.some(s => s.r.u === x.u)) continue; if (L.rows.slice(i + 1).some(y => y.k !== "sup" && !isElbow(y))){ left++; continue; } removeAt(a, x.u); } });
    if (left) note(left + " pipe" + (left === 1 ? "" : "s") + " stayed: only a line's last pipe can go (take the parts after it first)"); }
  /* a field weld: FW, then FFW, then FFG on each click (Remove takes it off) */
  function weldAt(a, key, del){ const [u, wu] = key.split("|"), { r } = rowOf(a, u); if (!r || !r.welds) return; const w = r.welds.find(x => x.u === wu); if (!w) return;
    save(a, () => { if (del) r.welds = r.welds.filter(x => x !== w); else w.t = w.t === "FW" ? "FFW" : w.t === "FFW" ? "FFG" : "FW"; }, del ? "Removed a field weld from" : "Changed a field weld on"); }
  /* a pipe's flow arrow: on, turned round, off */
  function flowOn(a, u, del){ const { r } = rowOf(a, u); if (!r) return; save(a, () => { r.flow = del ? 0 : r.flow === 1 ? -1 : r.flow === -1 ? 0 : 1; if (!r.flow) delete r.flow; }, "Set the flow arrow on"); }
  /* a note beside a part or a line's end, typed in place; Enter keeps it, Shift+Enter starts a second line, empty takes it off */
  function editNote(a, key, el){ const isEndK = /^end:/.test(key), L = isEndK ? lineOf(a, key.slice(4)) : null, { r } = isEndK ? {} : rowOf(a, key); if (!L && !r) return; const cur = (isEndK ? L.endNote : r.note) || "";
    const b = el.getBoundingClientRect(), i = h('<textarea class="in iso-din iso-nin" rows="2" placeholder="CONT. ON…, CONN. TO…, RL…, spindle…">' + esc(cur) + '</textarea>');
    Object.assign(i.style, { position: "fixed", left: Math.min(innerWidth - 268, b.right + 6) + "px", top: (b.top - 4) + "px", width: "260px", zIndex: 9000 }); document.body.appendChild(i); i.focus(); i.select();
    let gone = false; const done = ok => { if (gone) return; gone = true; const v = i.value.trim(); i.remove(); if (ok && v !== cur) save(a, () => { if (isEndK){ if (v) L.endNote = v; else delete L.endNote; } else { if (v) r.note = v; else delete r.note; } }, "Wrote a note on the sketch of"); };
    i.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey){ e.preventDefault(); done(true); } if (e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); done(false); } }; i.onblur = () => done(true); }
  /* an alert's callout: what doesn't fit and how to put it right; ✕, Esc or a click elsewhere closes it */
  function callout(a, el){ const c = checks(a, layout(a)).find(x => x.k === el.dataset.warn); if (!c) return; $$(".iso-co").forEach(x => x.remove());
    const b = el.getBoundingClientRect(), d = h('<div class="iso-co" role="dialog"><button type="button" class="ic-b sm" aria-label="Close">✕</button>' + c.m.map(m => '<p><b>' + esc(m.t) + '</b><br>' + esc(m.d) + '</p>').join("") + '</div>');
    document.body.appendChild(d); const w = d.offsetWidth; Object.assign(d.style, { left: Math.max(8, Math.min(innerWidth - w - 8, b.left + b.width / 2 - w / 2)) + "px", top: (b.bottom + 6) + "px" });
    const close = () => { d.remove(); removeEventListener("keydown", k, true); removeEventListener("pointerdown", o, true); }, k = e => { if (e.key === "Escape"){ e.stopPropagation(); e.preventDefault(); close(); } }, o = e => { if (!d.contains(e.target) && !el.contains(e.target)) close(); };
    $(".ic-b", d).onclick = close; addEventListener("keydown", k, true); setTimeout(() => addEventListener("pointerdown", o, true)); }
  /* full screen: the real one (the browser's), the sketch filling it; Esc leaves it and you're back where you were */
  function fullScreen(on){ sk.fs = on; App.render();
    if (on){ const d = document.documentElement; if (!document.fullscreenElement && d.requestFullscreen) d.requestFullscreen().then(() => { if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock(["Escape"]).catch(() => {}); }).catch(() => {}); }   /* (the lock lets Esc reach the sketch first; holding Esc still leaves full screen) */
    else { if (navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock(); if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); } }
  document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && sk.fs){ sk.fs = false; App.render(); } });
  /* a cap on a line's open end, the start or the end (the start of a branch is its tee, so no cap there) */
  function capAt(a, L, at){ if (!L) return; const rs = L.rows.filter(x => x.k !== "sup"), r = at === "end" ? rs[rs.length - 1] : rs[0], src = r || { cl: P(a).spec, dn: null };
    if (r && isEnd(r)) return note("That end is closed already");
    if (at === "start" && L.off) return note("A branch starts at its tee: cap its other end");
    const c = { u: uid(), k: "it", cl: src.cl, dn: src.dn, it: specItem(src.cl, src.dn, /^cap/i) || "Cap", qty: 1 };
    save(a, () => { if (at === "end") L.rows.push(c); else L.rows.unshift(c); }, "Capped a line on"); sk.sel = c.u; }
  /* a dimension clicked: its length typed in place (mm), the list's Length the same */
  function editDim(a, t){ const sup = !!t.dataset.sdim, u = t.dataset.dim || t.dataset.sdim, { r } = rowOf(a, u); if (!r) return; const fk = sup ? "dd" : "len", b = t.getBoundingClientRect(), i = h('<input class="in iso-din" inputmode="numeric" value="' + esc(r[fk] || "") + '">');
    Object.assign(i.style, { position: "fixed", left: (b.left + b.width / 2 - 40) + "px", top: (b.top - 4) + "px", width: "80px", zIndex: 9000 }); document.body.appendChild(i); i.focus(); i.select();
    let gone = false; const done = ok => { if (gone) return; gone = true; const v = Math.round(+i.value) || ""; i.remove(); if (ok && String(v) !== String(r[fk] || "")) save(a, () => { r[fk] = v; if (sup){ if (v) r.from = t.dataset.se; else delete r.from; } }, sup ? "Set a support's distance on" : "Set a pipe length on"); };
    i.onkeydown = e => { if (e.key === "Enter"){ e.preventDefault(); done(true); } if (e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); done(false); } }; i.onblur = () => done(true); }
  /* ---------- changes ---------- */
  const rowOf = (a, u) => { for (const L of P(a).lines){ const r = L.rows.find(x => x.u === u); if (r) return { L, r }; } return {}; };
  const save = (a, fn, msg) => { Store.mutate(K(a), () => { fn(); Store.touch(a); }); Store.log((msg || "Edited the piping of") + " " + Store.actId(a)); };
  function pick(a, el, r, c){ const p = P(a), [u, sub] = String(r).split(/\.(?=fa$|fb$)/);
    let list = [], cur = null, done = null;
    if (c === "spec"){ list = grouped(classList()); cur = p.spec; done = v => save(a, () => { p.spec = v; }, "Set the pipe spec of"); }
    else if (c === "add"){ const L = p.lines.find(x => "+" + x.id === r), last = [...L.rows].reverse().find(x => x.dn), cl = (last && last.cl) || p.spec, dn = last ? last.dn : null;
      if (!p.spec && !cl) return note("Pick a spec first (top left)");
      list = [{ v: "J", t: "Flange joint", sub: "flanges, gasket, studs and nuts", g: "Joints and supports" }, { v: "S", t: "Support", sub: "on the pipe before it", g: "Joints and supports" }].concat(itemList(cl, dn || null));   /* (no size yet: every item in the class) */
      done = v => { const nr = v === "S" ? null : { u: uid(), k: v === "J" ? "joint" : "it", cl, dn: dn || null, it: v === "J" ? "" : v, qty: v === "J" ? undefined : 1 };
        if (v === "S"){ const sid = "S" + (SUP(a).reduce((m, s) => Math.max(m, +s.sid.slice(1) || 0), 0) + 1); save(a, () => { L.rows.push({ u: uid(), k: "sup", sid }); SUP(a).push({ sid, from: "", parts: [] }); }, "Added a pipe support to"); return; }
        save(a, () => { L.rows.push(nr); }, "Added to the piping of"); }; list = grouped(list); }
    else { const k = rowOf(a, u).r; if (!k) return; const tgt = sub ? (k[sub] = k[sub] || {}) : k, cl = sub ? tgt.cl || k.cl : k.cl;
      if (c === "cl"){ list = grouped(classList()); cur = cl; done = v => save(a, () => { tgt.cl = v; if (!sub && k.dn && !PipeSpec.sizes(v).includes(k.dn)) delete k.dn; if (sub) delete tgt.it; }); }
      else if (c === "dn"){ list = sizeList(k.cl); cur = k.dn; done = v => save(a, () => { k.dn = +v; delete k.vt; delete k.dn2; if (k.it && !/^[VGB]:/.test(k.it) && !PipeSpec.items(k.cl, k.dn).some(x => x.v === k.it)) delete k.it; }); }
      else if (c === "dn2"){ list = PipeSpec.branches(k.cl, k.dn, k.it).map(x => ({ v: x.v, t: x.t, dis: x.dis }));   /* (just the sizes) */ cur = k.dn2 ? String(k.dn2) : null; done = v => save(a, () => { k.dn2 = +v; delete k.vt; }, "Picked the " + (isTee(k) ? "branch" : "small end") + " size on"); }
      else if (c === "vt"){ list = (R(sub ? Object.assign({}, tgt, { cl, dn: k.dn }) : k).vs || []).map(x => ({ v: x.v, t: x.t })); cur = tgt.vt; done = v => save(a, () => { tgt.vt = v; }, "Picked the ends or type on"); }
      else if (c === "it"){ list = grouped(itemList(cl, k.dn, sub ? FLGRE : null)); cur = tgt.it; done = v => save(a, () => { tgt.it = v; delete tgt.vt; if (!sub) delete k.dn2; if (sub === "fa" && !(k.fb && k.fb.it)) {} }); } }
    if (!done) return; const key = Look.open(el, list.length ? list : [{ v: "", t: "Nothing to pick: check the spec and size", dis: true }], cur, x => { if (x.v === "" || x.dis) return; done(x.v); }, { num: list.length <= 12 }); el.onkeydown = e => key && key(e); }
  function pickSup(a, el, sid){ const s = SUP(a).find(x => x.sid === sid); if (!s) return; const pipe = pipeFor(a, sid);
    const sames = SUP(a).filter(x => x.sid !== sid && x.from !== "same" && partsOf(a, x).length).map(x => ({ v: "same:" + x.sid, t: "Same as " + x.sid, sub: supSum(a, x.sid), g: "Copy a support" }));
    const stds = stdsFor(pipe).map(T => ({ v: "std:" + T.id, t: T.id, sub: T.name + (T.sheet ? ", " + T.sheet.replace("2000-F00-STD-PP-", "") : ""), g: "Standard supports" + (pipe ? " for " + PipeSpec.lab(pipe.cl, pipe.dn) + " " + famOf(pipe.cl) : "") }));
    const list = grouped([{ v: "scratch", t: "From scratch", sub: "list its parts", g: "Start" }].concat(sames, pipe ? stds : [{ v: "", t: "Put it after a pipe to see the standard supports that suit it", dis: true, g: "Standard supports" }]));
    const key = Look.open(el, list, s.from === "same" ? "same:" + s.same : s.std ? "std:" + s.std : s.from, x => { if (!x.v || x.dis) return;
      save(a, () => { delete s.same; delete s.std; delete s.vals; if (x.v === "scratch") s.from = "scratch"; else if (/^same:/.test(x.v)){ s.from = "same"; s.same = x.v.slice(5); } else { s.from = "std"; s.std = x.v.slice(4); s.vals = {}; } }, "Set a pipe support on"); });
    el.onkeydown = e => key && key(e); }
  /* the spec's own pages for a class, big, over the app: the PDF's pages drawn one under another; Esc or ✕ closes */
  let pdfP = null;
  async function specPages(cl){ const C0 = PipeSpec.spec(cl), M = PipeSpec.meta() || {}, url = PipeSpec.pdfUrl(); if (!C0 || !url) return note("The spec pages aren't available yet");
    const v = h('<div class="ppv" role="dialog" aria-label="Pipe spec ' + esc(cl) + '"><div class="ppv-h"><b>' + esc(cl) + '</b><span class="dim">' + esc((M.doc || "") + " Rev " + (M.rev || "") + ", page" + (C0.pages > 1 ? "s " + C0.page + " to " + (C0.page + C0.pages - 1) : " " + C0.page)) + '</span><span class="grow"></span><button type="button" class="ic-b" aria-label="Close">✕</button></div><div class="ppv-b"><p class="dim">Loading the spec…</p></div></div>');
    document.body.appendChild(v); const close = () => { v.remove(); removeEventListener("keydown", esc0, true); }, esc0 = e => { if (e.key === "Escape"){ e.stopPropagation(); e.preventDefault(); close(); } };
    addEventListener("keydown", esc0, true); $(".ic-b", v).onclick = close; v.onclick = e => { if (e.target === v) close(); };
    try { const L = await Sketch.loadPdfjs(); pdfP = pdfP || L.getDocument({ url }).promise; const doc = await pdfP, body = $(".ppv-b", v); body.innerHTML = "";
      for (let n = C0.page; n < C0.page + (C0.pages || 1) && n <= doc.numPages; n++){ if (!v.isConnected) return; const pg = await doc.getPage(n), w = Math.min(1600, body.clientWidth - 24), v0 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: w / v0.width * (devicePixelRatio || 1) });
        const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height; c.style.width = w + "px"; body.appendChild(c); await pg.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise; } }
    catch (e){ console.error(e); $(".ppv-b", v).innerHTML = '<p class="dim">Couldn\'t load the spec: ' + esc(e.message) + '</p>'; } }
  /* a row or a joint's part by its id */
  const partOf = (a, u) => { const r = rowOf(a, u).r; if (r) return r; const m = String(u).match(/^(.*)\.(fa|fb|g|st|nu)$/); if (!m) return null; const j = rowOf(a, m[1]).r; return j ? jointKids(j).find(k => k.u === u) : null; };
  function wire(el, a, ro, which){
    $$("[data-fi]", el).forEach(b => b.onclick = ev => { ev.stopPropagation(); ev.preventDefault(); const r = partOf(a, b.dataset.fi); if (!r) return; FitDims.card(r, b, lineTxt(r) || (b.parentElement.textContent || "").trim()); });
    const si = $("[data-si]", el); if (si) si.onclick = e => { e.stopPropagation(); specPages(P(a).spec); };
    $$("[data-by]", el).forEach(b => b.onclick = () => { view.by = b.dataset.by; lsSet("adPipBy", view.by); App.render(); });
    $$("[data-sv]", el).forEach(b => b.onclick = () => { view.sv = b.dataset.sv; App.render(); });
    if (ro) return;
    $$(".pp-dd", el).forEach(b => b.onclick = e => { e.stopPropagation(); if (b.dataset.c === "from") return pickSup(a, b, b.dataset.r); pick(a, b, b.dataset.r || "", b.dataset.c || b.dataset.pk); });
    const ln = $(".pp-line", el); if (ln) ln.onclick = () => { const p = P(a), id = nextLine(p); save(a, () => { p.lines.push({ id, rows: [] }); }, "Started line " + id + " on"); };
    $$("[data-x]", el).forEach(b => b.onclick = async () => { const u = b.dataset.x, { L, r } = rowOf(a, u); if (!r) return;
      save(a, () => { L.rows.splice(L.rows.indexOf(r), 1); if (r.k === "sup"){ const S = SUP(a), i = S.findIndex(s => s.sid === r.sid); if (i >= 0) S.splice(i, 1); } }, "Removed from the piping of"); });
    $$("[data-xs]", el).forEach(b => b.onclick = async () => { const sid = b.dataset.xs; if (!await confirmBox("Remove support " + sid + " and its parts?", "Remove", true)) return;
      save(a, () => { const S = SUP(a), i = S.findIndex(s => s.sid === sid); if (i >= 0) S.splice(i, 1); P(a).lines.forEach(L => { const k = L.rows.findIndex(r => r.k === "sup" && r.sid === sid); if (k >= 0) L.rows.splice(k, 1); }); }, "Removed a pipe support from"); });
    $$("[data-xp]", el).forEach(b => b.onclick = () => { const [sid, j] = b.dataset.xp.split("|"), s = SUP(a).find(x => x.sid === sid); if (!s) return; save(a, () => { s.parts.splice(+j, 1); }, "Removed a support part from"); });
    $$(".pp-in", el).forEach(i => { i.onkeydown = e => { if (e.key === "Enter"){ e.preventDefault(); i.blur(); } };
      i.onchange = () => { const r = i.dataset.r, c = i.dataset.c, v = i.value.trim();
        if (which === "supports"){ const s = SUP(a).find(x => x.sid === r); if (!s) return;
          if (/^val:/.test(c)) return save(a, () => { (s.vals = s.vals || {})[c.slice(4)] = v; });
          if (c === "new:d"){ if (!v) return; return save(a, () => { (s.parts = s.parts || []).push({ d: v, size: "", qty: 1 }); }, "Added a support part to"); }
          const m = c.match(/^p(\d+):(\w+)$/); if (m) return save(a, () => { const p = s.parts[+m[1]]; if (p) p[m[2]] = m[2] === "qty" ? (+v || v) : v; }); return; }
        const [u, sub] = r.split(/\.(?=st$|nu$)/), { r: row } = rowOf(a, u); if (!row) return;
        if (sub) return save(a, () => { if (v === "") delete row[sub === "st" ? "stq" : "nuq"]; else row[sub === "st" ? "stq" : "nuq"] = +v || 0; });
        save(a, () => { if (c === "len") row.len = Math.round(+v) || ""; else row.qty = +v || ""; }); }; }); }
  function renderFor(el, a, which, ro){ if (!PipeSpec.ready()) PipeSpec.load();
    el.innerHTML = '<div class="pp">' + (which === "supports" ? supportsHtml(a, ro) : pipingHtml(a, ro)) + '</div>';
    const skEl = $(".pp-sk", el); if (skEl) Sketch.renderFor(skEl, a, ro, "supSk");
    wire(el, a, ro, which); if (which !== "supports" && view.pv === "list"){ wireSketch(el, a); $$(".pp-tbl tr[data-u] td.pt-no", el).forEach(td => td.onclick = () => { const u = td.parentElement.dataset.u; sk.sel = sk.sel === u ? null : u; App.render(); }); }
    $$(".pp-tbl", el).forEach(t => gridCols(t, "pp" + (t.classList.contains("pp-bom") ? "B" : t.classList.contains("pp-sups") ? "S" : "L"), { sort: false, fixed: { x: 24 }, cap: { Description: 520 } })); }
  return { renderFor, bom, order, supNo, has, stdsFor, rowsFor, qtyOf, jointKids, checks: a => checks(a, layout(a)), cuts, viewKey: () => [view.by, view.pv, view.sv, sk.tool, sk.dl, sk.st ? sk.st.p3.join(",") : "", sk.sel, sk.pt ? sk.pt.u + sk.pt.t : "", sk.fs ? 1 : 0].join("|"), layout, autofit };
})();
