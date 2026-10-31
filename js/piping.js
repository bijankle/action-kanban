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
    return [
      { u: r.u + ".fa", rol: "fa", nm: "Flange", cl, dn, it: fa.it || "", qty: 1 },
      { u: r.u + ".fb", rol: "fb", nm: "Mating flange", cl: fb.cl || cl, dn, it: fb.it || fa.it || "", qty: 1, auto: !fb.it },
      { u: r.u + ".g", rol: "g", nm: "Gasket", cl, dn, it: r.g || g || "", qty: 1, auto: !r.g },
      { u: r.u + ".st", rol: "st", nm: "Studs", cl, dn, it: "B:stud", qty: r.stq != null ? r.stq : J.n || "", auto: r.stq == null },
      { u: r.u + ".nu", rol: "nu", nm: "Nuts", cl, dn, it: "B:nut", qty: r.nuq != null ? r.nuq : J.n ? 2 * J.n : "", auto: r.nuq == null } ]; }
  /* ---------- the BoM: every item added up by its spec line ---------- */
  const CAT = [["P", /^pipe\b/i], ["E", /^elbow/i], ["T", /^tee/i], ["R", /^reducer/i], ["C", /^cap/i], ["F", /^(flange|plate, blind)/i], ["V", /^V:/], ["G", /^G:/], ["B", /^B:(stud|bolt)/], ["N", /^B:nut/]];
  const catOf = it => (CAT.find(([, re]) => re.test(String(it || ""))) || ["X"])[0], ORD = "PERTCFVGBNX";
  function leaves(a){ const out = []; P(a).lines.forEach(L => L.rows.forEach(r => { if (r.k === "joint") jointKids(r).forEach(k => out.push(Object.assign({ par: r }, k))); else if (r.k !== "sup") out.push(Object.assign({ par: r }, r)); })); return out; }
  function bom(a){ const m = new Map();
    leaves(a).forEach(x => { if (!x.cl || !x.dn || !x.it) return; const t = lineTxt(x); if (!t) return; const pipe = isPipe(x), q = pipe ? (+x.len || 0) / 1000 : +x.qty || 0;
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
  function pipingHtml(a, ro){ const p = P(a), B = bom(a), sn = supNo(a), byItem = view.by === "item";
    const bar = '<div class="pp-bar"><span class="pp-spec' + (p.spec ? "" : " need") + '"><span class="dim">Spec</span><button type="button" class="pp-dd" data-pk="spec"' + (ro ? " disabled" : "") + '>' + esc(p.spec || "Pick a spec") + '</button><button type="button" class="pp-si" data-si="1"' + (p.spec ? "" : " disabled") + ' title="' + (p.spec ? "Show " + esc(p.spec) + " in the pipe spec" : "Pick a spec to see its pages") + '" aria-label="Show the spec pages">' + INFO_I + '</button></span>'
      + '<div class="seg pp-seg"><button type="button" data-v="list"' + (view.pv === "list" ? ' class="on"' : "") + '>Sketch and list</button><button type="button" data-v="bom"' + (view.pv === "bom" ? ' class="on"' : "") + '>BoM</button></div>'
      + (view.pv === "list" ? '<div class="seg pp-seg"><button type="button" data-by="line"' + (byItem ? "" : ' class="on"') + '>Line order</button><button type="button" data-by="item"' + (byItem ? ' class="on"' : "") + '>Item numbers</button></div>' : "")
      + (ro || view.pv !== "list" ? "" : '<button type="button" class="btn sm pp-line" title="Start another line, such as a branch off a tee">+ Line</button>') + '</div>';
    if (view.pv === "bom") return bar + '<table class="tbl pt-tbl pp-tbl pp-bom"><thead><tr><th class="pt-no" data-col="No.">#</th><th>Description</th><th>Size</th><th>Qty</th></tr></thead><tbody>'
      + B.map(e => '<tr><td class="pt-no">' + e.no + '</td><td>' + esc(e.desc) + '</td><td>' + esc(e.dn) + '</td><td class="pp-n">' + esc(e.unit === "m" ? (+e.qty.toFixed(2)) + " m" : String(e.qty)) + '</td></tr>').join("")
      + Object.values(sn).filter((v, i, A) => A.indexOf(v) === i && /^S\d/.test(v)).map(s => '<tr><td class="pt-no">' + s + '</td><td>Pipe support ' + s + ' (see Supports)</td><td></td><td class="pp-n">' + Object.values(sn).filter(x => x === s).length + '</td></tr>').join("") + '</tbody></table>';
    const dd = (r, c, txt, cls, dis) => '<button type="button" class="pp-dd' + (cls || "") + '" data-r="' + esc(r) + '" data-c="' + c + '"' + (ro || dis ? " disabled" : "") + '>' + esc(txt || "") + '</button>';
    const box = (r, c, v, ph) => '<input class="in pt-in pp-in" data-r="' + esc(r) + '" data-c="' + c + '" inputmode="decimal" value="' + esc(v == null ? "" : v) + '"' + (ro ? " readonly" : "") + (ph ? ' aria-label="' + esc(ph) + '"' : "") + '>';
    const desc = x => { const z = R(x); return z.line ? '<td class="pp-ds autof" title="' + esc(z.line) + '">' + esc(z.line) + '</td>' : '<td class="pp-ds dim">' + (x.cl ? "still to pick: " + esc(z.need || "") : "") + '</td>'; };
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
              + (ed ? '<td class="pp-ds' + (k.it ? (k.auto ? " autof" : "") : " need") + '">' + dd(k.u, "it", k.it ? lineTxt(k) || k.it : "", " pp-wide") + '</td>' : desc(k)) + '<td></td></tr>'; }); return; }
        body += '<tr data-u="' + esc(r.u) + '"' + (r.u === sk.sel ? ' class="sel"' : "") + '><td class="pt-no">' + esc(byItem ? numOf(B, r.u) : id) + '</td><td' + (r.it ? "" : ' class="need"') + '>' + dd(r.u, "it", r.it ? (/^[VGB]:/.test(r.it) ? (PipeSpec.items(r.cl, r.dn).find(x => x.v === r.it) || { t: r.it }).t : r.it) : "") + '</td><td>' + dd(r.u, "cl", r.cl) + '</td><td' + (r.dn ? "" : ' class="need"') + '>' + dd(r.u, "dn", r.cl && r.dn ? PipeSpec.lab(r.cl, r.dn) : "") + '</td>'
          + '<td' + (pipe && !r.len ? ' class="need"' : "") + '>' + (pipe ? box(r.u, "len", r.len, "Length, mm") : "") + '</td><td>' + (pipe ? "" : box(r.u, "qty", r.qty, "Qty")) + '</td>' + desc(r) + X(r.u) + '</tr>'; });
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
  const isElbow = r => /^elbow/i.test(String(r.it || "")), isTee = r => /^tee/i.test(String(r.it || ""));
  function layout(a){ const p = P(a), out = { segs: [], nodes: [], sups: [], ends: [], at: {} }; const placed = new Set(); let guard = 0, nextX = 0;
    while (placed.size < p.lines.length && guard++ < 20) p.lines.forEach(L => { if (placed.has(L.id)) return; let start;
      if (L.off){ if (!out.at[L.off]) return; start = out.at[L.off].p3; } else start = L.id === p.lines[0].id ? [0, 0, 0] : [nextX, -2, 0];
      placed.add(L.id); let cur = start, pd = L.dir0 || null, last = null, prev = null;
      L.rows.forEach(r => {
        if (r.k === "sup"){ if (last){ const f = r.at != null ? r.at : 0.5; out.sups.push({ r, L, p3: add3(last.a3, DIRS[last.d], last.n * f), d: last.d }); } return; }
        if (r.k === "it" && isPipe(r)){ const d = r.dir || (prev && isElbow(prev) && pd ? PERP(pd) : pd) || "E", n = Math.max(1, +r.gl || 3), s = { r, L, a3: cur, b3: add3(cur, DIRS[d], n), d, n };
          out.segs.push(s); cur = s.b3; pd = d; last = s; prev = r; return; }
        const nd = { r, L, p3: cur, d: pd || "E" }; out.nodes.push(nd); out.at[r.u] = nd; prev = r; });
      out.ends.push({ L, p3: cur, d: pd }); nextX = Math.max(nextX, ...out.segs.map(s => Math.max(s.a3[0], s.b3[0]) + 4)); });
    return out; }
  /* the symbols, ISO style: a joint two short bars across the pipe, a valve a bow tie, a reducer a taper, a tee a dot, a cap an arc,
     a support a stem off the pipe with a bar across its end (the same mark on every plane); tags boxed */
  function sketchSvg(a, ro){ const Lo = layout(a), B = bom(a), sn = supNo(a), pts = [];
    Lo.segs.forEach(s => pts.push(prj(s.a3), prj(s.b3))); Lo.nodes.forEach(n => pts.push(prj(n.p3))); Lo.ends.forEach(e => pts.push(prj(e.p3)));
    if (!pts.length) pts.push([0, 0]);
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]), M = 90; let x0 = Math.min(...xs) - M, y0 = Math.min(...ys) - M, w = Math.max(...xs) - x0 + M, hgt = Math.max(...ys) - y0 + M;
    /* (room to draw into: at least 700 by 460, the drawing in the middle) */
    if (w < 700){ x0 -= (700 - w) / 2; w = 700; } if (hgt < 460){ y0 -= (460 - hgt) / 2; hgt = 460; }
    const unit = d => { const q = prj(DIRS[d]), m = Math.hypot(q[0], q[1]); return [q[0] / m, q[1] / m]; }, nrm = d => { const u = unit(d); return [u[1], -u[0]]; };
    const f1 = v => Math.round(v * 10) / 10, L2 = (p, q, c, extra) => '<line class="' + c + '" x1="' + f1(p[0]) + '" y1="' + f1(p[1]) + '" x2="' + f1(q[0]) + '" y2="' + f1(q[1]) + '"' + (extra || "") + '/>';
    const tag = (q, t, u) => { if (!t) return ""; const tw = 8 + t.length * 6.4; return '<g class="iso-tg' + (u === sk.sel ? " on" : "") + '"' + (u ? ' data-u="' + esc(u) + '"' : "") + '><rect x="' + f1(q[0]) + '" y="' + f1(q[1] - 8) + '" width="' + f1(tw) + '" height="15"/><text x="' + f1(q[0] + 4) + '" y="' + f1(q[1] + 3.5) + '">' + esc(t) + '</text></g>'; };
    let g = "";
    /* the dot grid: every point of the iso lattice over the drawing */
    const k0 = Math.floor(x0 / CX), k1 = Math.ceil((x0 + w) / CX), m0 = Math.floor(y0 / CY), m1 = Math.ceil((y0 + hgt) / CY);
    for (let k = k0; k <= k1; k++) for (let m = m0; m <= m1; m++) if (((k + m) % 2 + 2) % 2 === 0) g += '<circle class="iso-dot" cx="' + f1(k * CX) + '" cy="' + f1(m * CY) + '" r="1"/>';
    Lo.segs.forEach(s => { const A = prj(s.a3), Bp = prj(s.b3), on = s.r.u === sk.sel, nm = nrm(s.d), lab = numOf(B, s.r.u);
      g += '<g data-u="' + esc(s.r.u) + '" class="iso-seg' + (on ? " on" : "") + '">' + L2(A, Bp, "iso-p") + L2(A, Bp, "iso-hit") + '</g>';
      /* the dimension: end to end, beside the run, its value the real length (? while still to fill in) */
      const o = 26, A2 = [A[0] + nm[0] * o, A[1] + nm[1] * o], B2 = [Bp[0] + nm[0] * o, Bp[1] + nm[1] * o], mid = [(A2[0] + B2[0]) / 2, (A2[1] + B2[1]) / 2];
      let ang = Math.atan2(B2[1] - A2[1], B2[0] - A2[0]) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      g += L2([A[0] + nm[0] * 6, A[1] + nm[1] * 6], [A2[0] + nm[0] * 4, A2[1] + nm[1] * 4], "iso-d") + L2([Bp[0] + nm[0] * 6, Bp[1] + nm[1] * 6], [B2[0] + nm[0] * 4, B2[1] + nm[1] * 4], "iso-d") + L2(A2, B2, "iso-d")
        + [A2, B2].map(q => L2([q[0] - 3, q[1] + 3], [q[0] + 3, q[1] - 3], "iso-d")).join("")
        + '<text class="iso-dt' + (s.r.len ? "" : " need") + '" data-dim="' + esc(s.r.u) + '" transform="translate(' + f1(mid[0]) + ',' + f1(mid[1]) + ') rotate(' + f1(ang) + ')" text-anchor="middle" dy="-4">' + esc(s.r.len ? String(s.r.len) : "?") + '</text>';
      const mp = [(A[0] + Bp[0]) / 2 - nm[0] * 14, (A[1] + Bp[1]) / 2 - nm[1] * 14]; g += tag(mp, lab, s.r.u); });
    Lo.nodes.forEach(n => { const q = prj(n.p3), u = unit(n.d), nm = nrm(n.d), r = n.r, on = r.u === sk.sel; let s = "";
      if (r.k === "joint"){ const ks = jointKids(r), t = [...new Set(ks.map(k => numOf(B, k.u)).filter(Boolean))].join(" ");
        [-3, 3].forEach(dd => { const c = [q[0] + u[0] * dd, q[1] + u[1] * dd]; s += L2([c[0] - nm[0] * 9, c[1] - nm[1] * 9], [c[0] + nm[0] * 9, c[1] + nm[1] * 9], "iso-s"); }); s += tag([q[0] - nm[0] * 18 + 6, q[1] - nm[1] * 18], t || "J", r.u); }
      else if (/^V:/.test(r.it || "") || r.sym === "valve"){ const a1 = [q[0] - u[0] * 9 + nm[0] * 7, q[1] - u[1] * 9 + nm[1] * 7], a2 = [q[0] - u[0] * 9 - nm[0] * 7, q[1] - u[1] * 9 - nm[1] * 7], b1 = [q[0] + u[0] * 9 + nm[0] * 7, q[1] + u[1] * 9 + nm[1] * 7], b2 = [q[0] + u[0] * 9 - nm[0] * 7, q[1] + u[1] * 9 - nm[1] * 7];
        s += '<path class="iso-s iso-fill" d="M' + [a1, b2, b1, a2].map(p2 => f1(p2[0]) + " " + f1(p2[1])).join(" L") + ' Z"/>' + tag([q[0] - nm[0] * 20 + 6, q[1] - nm[1] * 20], numOf(B, r.u), r.u); }
      else if (/^reducer/i.test(r.it || "") || r.sym === "red"){ s += '<path class="iso-s iso-fill" d="M' + [[-7, 8], [7, 4], [7, -4], [-7, -8]].map(([a1, b1]) => f1(q[0] + u[0] * a1 + nm[0] * b1) + " " + f1(q[1] + u[1] * a1 + nm[1] * b1)).join(" L") + ' Z"/>' + tag([q[0] - nm[0] * 20 + 6, q[1] - nm[1] * 20], numOf(B, r.u), r.u); }
      else if (isTee(r)){ s += '<circle class="iso-s iso-dotf" cx="' + f1(q[0]) + '" cy="' + f1(q[1]) + '" r="3.2"/>' + tag([q[0] + 8, q[1] + 14], numOf(B, r.u), r.u); }
      else if (/^cap/i.test(r.it || "")){ s += '<circle class="iso-s" cx="' + f1(q[0]) + '" cy="' + f1(q[1]) + '" r="5"/>' + tag([q[0] + 8, q[1] + 14], numOf(B, r.u), r.u); }
      else s += '<circle class="iso-s iso-dotf" cx="' + f1(q[0]) + '" cy="' + f1(q[1]) + '" r="2"/>' + tag([q[0] + 6, q[1] + 16], numOf(B, r.u), r.u);
      g += '<g class="iso-n' + (on ? " on" : "") + '" data-u="' + esc(r.u) + '">' + s + '<circle class="iso-hitn" cx="' + f1(q[0]) + '" cy="' + f1(q[1]) + '" r="9"/></g>'; });
    Lo.sups.forEach(n => { const q = prj(n.p3), nm = nrm(n.d), e = [q[0] + nm[0] * 12, q[1] + nm[1] * 12], on = n.r.u === sk.sel;
      g += '<g class="iso-n' + (on ? " on" : "") + '" data-u="' + esc(n.r.u) + '">' + L2(q, e, "iso-s") + L2([e[0] - nm[1] * 6, e[1] + nm[0] * 6], [e[0] + nm[1] * 6, e[1] - nm[0] * 6], "iso-s iso-bar") + tag([e[0] + nm[0] * 6 + 2, e[1] + nm[1] * 6 + 6], sn[n.r.sid] || n.r.sid, n.r.u) + '<circle class="iso-hitn" cx="' + f1(q[0]) + '" cy="' + f1(q[1]) + '" r="9"/></g>'; });
    if (!ro) Lo.ends.forEach(e => { const q = prj(e.p3); g += '<circle class="iso-end' + (sk.dl === e.L.id ? " on" : "") + '" data-end="' + esc(e.L.id) + '" cx="' + f1(q[0]) + '" cy="' + f1(q[1]) + '" r="6"><title>Draw line ' + esc(e.L.id) + ' on from here</title></circle>'; });
    if (!Lo.segs.length && !ro) g += '<text class="iso-hint" x="' + f1(prj([0, 0, 0])[0] + 12) + '" y="' + f1(prj([0, 0, 0])[1] - 12) + '">Click the dot, then click where the pipe runs to</text>';
    return '<svg class="iso" viewBox="' + f1(x0) + ' ' + f1(y0) + ' ' + f1(w) + ' ' + f1(hgt) + '" width="' + f1(w) + '" height="' + f1(hgt) + '" data-x0="' + f1(x0) + '" data-y0="' + f1(y0) + '">' + g + '<line class="iso-ghost" x1="0" y1="0" x2="0" y2="0" hidden/><text class="iso-gt" hidden></text></svg>'; }
  const TOOLS = [["sel", "Select", "↖"], ["pipe", "Pipe: click a line's end, then where it runs to", "╱"], ["joint", "Flange joint: click a pipe", "‖"], ["valve", "Valve: click a pipe", "⋈"], ["sup", "Support: click a pipe", "⊥"], ["tee", "Tee: click a pipe; a new line runs off it", "┬"], ["red", "Reducer: click a pipe", "▷"], ["cap", "Cap: click a line's end", "◖"], ["del", "Remove: click a part", "✕"]];
  const sketchHtml = (a, ro) => '<div class="iso-w">' + (ro ? "" : '<div class="iso-tb">' + TOOLS.map(([k, t, s]) => '<button type="button" class="iso-tl' + (sk.tool === k ? " on" : "") + '" data-tool="' + k + '" title="' + esc(t) + '" aria-label="' + esc(t) + '">' + s + '</button>').join("") + '<button type="button" class="iso-tl iso-af" data-af="1" title="Autofit: even, readable spacing (lengths aren\'t to scale)">Autofit</button></div>') + '<div class="iso-sc">' + sketchSvg(a, ro) + '</div></div>';
  /* ---------- the sketch's changes ---------- */
  const lineOf = (a, id) => P(a).lines.find(L => L.id === id);
  const lastOf = (L, f) => [...L.rows].reverse().find(f);
  const specItem = (cl, dn, re) => { const x = cl ? PipeSpec.items(cl, dn || null).find(i => re.test(i.v)) : null; return x ? x.v : ""; };
  function drawPipe(a, L, d, n){ const p = P(a), lp = lastOf(L, r => r.k === "it" && isPipe(r)), base = lastOf(L, r => r.cl) || (L.off && rowOf(a, L.off).r) || {}, cl = base.cl || p.spec, dn = base.dn || null;
    const pd = lp ? (lp.dir || "E") : null, c = pd ? cos3(DIRS[pd], DIRS[d]) : 1, rows = [];
    if (pd && c < -0.01) return note("A pipe can't double back on itself");
    if (pd && c < 0.99){ const e45 = c > 0.5; rows.push({ u: uid(), k: "it", cl, dn, it: specItem(cl, dn, e45 ? /^elbow, 45/i : /^elbow, 90/i) || (e45 ? "Elbow, 45°" : "Elbow, 90°"), qty: 1 }); }
    rows.push({ u: uid(), k: "it", cl, dn, it: specItem(cl, dn, /^pipe$/i) || "Pipe", dir: d, gl: n, len: "" });
    save(a, () => { L.rows.push(...rows); }, "Drew pipe on"); sk.sel = rows[rows.length - 1].u; }
  /* a part placed on a pipe: the pipe splits there (a support sits on it without splitting it); a tee starts a new line */
  function placeOn(a, u, t){ const { L, r } = rowOf(a, u); if (!L || !r || !isPipe(r)) return; const n = Math.max(1, +r.gl || 3), k = Math.max(1, Math.min(n - 1, Math.round(t * n))) || 1;
    if (sk.tool === "sup"){ const sid = "S" + (SUP(a).reduce((m, s) => Math.max(m, +s.sid.slice(1) || 0), 0) + 1); let i = L.rows.indexOf(r) + 1; while (L.rows[i] && L.rows[i].k === "sup") i++;
      return save(a, () => { L.rows.splice(i, 0, { u: uid(), k: "sup", sid, at: Math.round(t * 100) / 100 }); SUP(a).push({ sid, from: "", parts: [] }); }, "Placed a pipe support on"); }
    const nn = Math.max(2, n), kk = n < 2 ? 1 : k, len = +r.len || 0, r2 = Object.assign({}, r, { u: uid(), gl: nn - kk, len: len ? Math.round(len * (nn - kk) / nn) : "" });
    const node = sk.tool === "joint" ? { u: uid(), k: "joint", cl: r.cl, dn: r.dn } : { u: uid(), k: "it", cl: r.cl, dn: r.dn, qty: 1, sym: sk.tool, it: sk.tool === "valve" ? "" : sk.tool === "red" ? specItem(r.cl, r.dn, /^reducer/i) : specItem(r.cl, r.dn, /^tee, equal/i) || "Tee, equal" };
    let nl = null; if (sk.tool === "tee"){ const p = P(a); nl = { id: String.fromCharCode(65 + p.lines.length), off: node.u, rows: [] }; }
    save(a, () => { const i = L.rows.indexOf(r); let j = i + 1; while (L.rows[j] && L.rows[j].k === "sup") j++; const ss = L.rows.splice(i + 1, j - i - 1);   /* (the pipe's supports stay where they are: each goes with the half it's on) */
      const pos = x => (x.at != null ? x.at : 0.5) * nn, s1 = ss.filter(x => pos(x) <= kk), s2 = ss.filter(x => pos(x) > kk); s1.forEach(x => { x.at = Math.round(pos(x) / kk * 100) / 100; }); s2.forEach(x => { x.at = Math.round((pos(x) - kk) / (nn - kk) * 100) / 100; });
      r.gl = kk; if (len) r.len = Math.round(len * kk / nn); L.rows.splice(i + 1, 0, ...s1, node, r2, ...s2); if (nl) P(a).lines.push(nl); }, "Placed a part on the piping of");
    sk.sel = node.u; if (nl){ sk.tool = "pipe"; sk.dl = nl.id; } }
  function removeAt(a, u){ const { L, r } = rowOf(a, u); if (!L || !r) return; const i = L.rows.indexOf(r); let pi = i - 1; while (L.rows[pi] && L.rows[pi].k === "sup") pi--; const pv = L.rows[pi], nx = L.rows[i + 1];
    if (r.k === "sup") return save(a, () => { L.rows.splice(i, 1); const S = SUP(a), j = S.findIndex(s => s.sid === r.sid); if (j >= 0) S.splice(j, 1); }, "Removed a pipe support from");
    if (isPipe(r)){ if (L.rows.slice(i + 1).some(x => x.k !== "sup")) return note("Only the last pipe of a line can be taken off; remove the parts after it first"); return save(a, () => { L.rows.splice(i); const e = L.rows[L.rows.length - 1]; if (e && isElbow(e)) L.rows.pop(); }, "Removed a pipe from"); }
    if (isElbow(r) && pv && nx) return note("An elbow is where the line turns: draw the line on in another direction instead");
    save(a, () => { L.rows.splice(i, 1); if (pv && nx && isPipe(pv) && isPipe(nx) && (pv.dir || "E") === (nx.dir || "E")){   /* (the two pipes join up again, their supports kept where they were) */
        const g1 = +pv.gl || 3, g2 = +nx.gl || 3, t = g1 + g2; L.rows.slice(pi + 1, i).forEach(x => { x.at = Math.round((x.at != null ? x.at : 0.5) * g1 / t * 100) / 100; });
        let j = L.rows.indexOf(nx) + 1; while (L.rows[j] && L.rows[j].k === "sup"){ const x = L.rows[j]; x.at = Math.round((g1 + (x.at != null ? x.at : 0.5) * g2) / t * 100) / 100; j++; }
        pv.gl = t; pv.len = (+pv.len && +nx.len) ? +pv.len + +nx.len : pv.len || ""; L.rows.splice(L.rows.indexOf(nx), 1); }
      P(a).lines = P(a).lines.filter(x => x.off !== r.u || x.rows.length); }, "Removed a part from"); }
  /* Esc while drawing or placing stops that (back to Select) and leaves the action open */
  document.addEventListener("keydown", e => { if (e.key !== "Escape" || sk.tool === "sel" || !document.querySelector("svg.iso") || document.querySelector(".pop, .ynmodal, .ppv")) return; e.stopPropagation(); e.preventDefault(); sk.tool = "sel"; sk.dl = null; App.render(); }, true);
  function autofit(a){ save(a, () => P(a).lines.forEach(L => L.rows.forEach((r, i) => { if (!isPipe(r) || r.k !== "it") return; let ns = 0; for (let j = i + 1; L.rows[j] && L.rows[j].k === "sup"; j++) ns++; r.gl = Math.max(3, 2 * (ns + 1) + 1); })), "Autofitted the sketch of"); }
  function wireSketch(el, a){ const svg = $("svg.iso", el); if (!svg) return; const pt = e => { const m = svg.getScreenCTM().inverse(), q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m); return [q.x, q.y]; };
    $$("[data-tool]", el).forEach(b => b.onclick = () => { sk.tool = b.dataset.tool; if (sk.tool !== "pipe") sk.dl = null; App.render(); });
    const af = $("[data-af]", el); if (af) af.onclick = () => autofit(a);
    const ghost = $(".iso-ghost", svg), gt = $(".iso-gt", svg);
    const aim = e => { if (sk.tool !== "pipe" || !sk.dl) return null; const Lo = layout(a), en = Lo.ends.find(x => x.L.id === sk.dl); if (!en) return null; const s0 = prj(en.p3), q = pt(e), v = [q[0] - s0[0], q[1] - s0[1]], m = Math.hypot(...v); if (m < 8) return null;
      let best = null; Object.keys(DIRS).forEach(d => { const w = prj(DIRS[d]), wm = Math.hypot(...w), c = (v[0] * w[0] + v[1] * w[1]) / (m * wm); if (!best || c > best.c) best = { d, c, wm }; });
      const n = Math.max(1, Math.round(m / best.wm)), end = prj(add3(en.p3, DIRS[best.d], n)); return { L: lineOf(a, sk.dl), d: best.d, n, s0, end }; };
    svg.onpointermove = e => { const g0 = aim(e); if (!g0){ ghost.setAttribute("hidden", ""); gt.setAttribute("hidden", ""); return; } ghost.removeAttribute("hidden"); gt.removeAttribute("hidden");
      ghost.setAttribute("x1", g0.s0[0]); ghost.setAttribute("y1", g0.s0[1]); ghost.setAttribute("x2", g0.end[0]); ghost.setAttribute("y2", g0.end[1]); gt.setAttribute("x", g0.end[0] + 8); gt.setAttribute("y", g0.end[1] - 8); gt.textContent = g0.d; };
    svg.onclick = e => { const end = e.target.closest("[data-end]"); if (end){ sk.tool = "pipe"; sk.dl = end.dataset.end; App.render(); return; }
      const dim = e.target.closest("[data-dim]"); if (dim && sk.tool === "sel") return editDim(a, dim);
      if (sk.tool === "pipe"){ const g0 = aim(e); if (g0 && g0.L) drawPipe(a, g0.L, g0.d, g0.n); return; }
      const hit = e.target.closest("[data-u]"); if (!hit) return; const u = hit.dataset.u;
      if (sk.tool === "sel"){ sk.sel = sk.sel === u ? null : u; App.render(); return; }
      if (sk.tool === "del") return removeAt(a, u);
      if (sk.tool === "cap"){ const { L, r } = rowOf(a, u); if (L && r && L.rows[L.rows.length - 1] === r && isPipe(r)) save(a, () => { L.rows.push({ u: uid(), k: "it", cl: r.cl, dn: r.dn, it: specItem(r.cl, r.dn, /^cap/i) || "Cap", qty: 1 }); }, "Capped a line on"); else note("A cap goes on the end of a line: click its last pipe"); return; }
      const { r } = rowOf(a, u); if (!r || !isPipe(r)) return note("Click on a pipe to put it there");
      const Lo = layout(a), s = Lo.segs.find(x => x.r.u === u), A = prj(s.a3), Bq = prj(s.b3), q = pt(e), dx = Bq[0] - A[0], dy = Bq[1] - A[1], t = Math.max(0, Math.min(1, ((q[0] - A[0]) * dx + (q[1] - A[1]) * dy) / (dx * dx + dy * dy || 1)));
      placeOn(a, u, t); };
    svg.ondblclick = e => { const dim = e.target.closest("[data-dim]"); if (dim) editDim(a, dim); }; }
  /* a dimension clicked: its length typed in place (mm), the list's Length the same */
  function editDim(a, t){ const u = t.dataset.dim, { r } = rowOf(a, u); if (!r) return; const b = t.getBoundingClientRect(), i = h('<input class="in iso-din" inputmode="numeric" value="' + esc(r.len || "") + '">');
    Object.assign(i.style, { position: "fixed", left: (b.left + b.width / 2 - 40) + "px", top: (b.top - 4) + "px", width: "80px", zIndex: 9000 }); document.body.appendChild(i); i.focus(); i.select();
    let gone = false; const done = ok => { if (gone) return; gone = true; const v = Math.round(+i.value) || ""; i.remove(); if (ok && String(v) !== String(r.len || "")) save(a, () => { r.len = v; }, "Set a pipe length on"); };
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
      else if (c === "dn"){ list = sizeList(k.cl); cur = k.dn; done = v => save(a, () => { k.dn = +v; if (k.it && !/^[VGB]:/.test(k.it) && !PipeSpec.items(k.cl, k.dn).some(x => x.v === k.it)) delete k.it; }); }
      else if (c === "it"){ list = grouped(itemList(cl, k.dn, sub ? FLGRE : null)); cur = tgt.it; done = v => save(a, () => { tgt.it = v; if (sub === "fa" && !(k.fb && k.fb.it)) {} }); } }
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
  function wire(el, a, ro, which){
    const si = $("[data-si]", el); if (si) si.onclick = e => { e.stopPropagation(); specPages(P(a).spec); };
    $$("[data-v]", el).forEach(b => b.onclick = () => { view.pv = b.dataset.v; App.render(); });
    $$("[data-by]", el).forEach(b => b.onclick = () => { view.by = b.dataset.by; lsSet("adPipBy", view.by); App.render(); });
    $$("[data-sv]", el).forEach(b => b.onclick = () => { view.sv = b.dataset.sv; App.render(); });
    if (ro) return;
    $$(".pp-dd", el).forEach(b => b.onclick = e => { e.stopPropagation(); if (b.dataset.c === "from") return pickSup(a, b, b.dataset.r); pick(a, b, b.dataset.r || "", b.dataset.c || b.dataset.pk); });
    const ln = $(".pp-line", el); if (ln) ln.onclick = () => { const p = P(a), id = String.fromCharCode(65 + p.lines.length); save(a, () => { p.lines.push({ id, rows: [] }); }, "Started line " + id + " on"); };
    $$("[data-x]", el).forEach(b => b.onclick = async () => { const u = b.dataset.x, { L, r } = rowOf(a, u); if (!r) return;
      if (!await confirmBox("Remove " + (r.k === "sup" ? "support " + r.sid : r.k === "joint" ? "this flange joint" : "this row") + " from line " + L.id + "?", "Remove", true)) return;
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
    const sk = $(".pp-sk", el); if (sk) Sketch.renderFor(sk, a, ro, "supSk");
    wire(el, a, ro, which); if (which !== "supports" && view.pv === "list"){ wireSketch(el, a); $$(".pp-tbl tr[data-u] td.pt-no", el).forEach(td => td.onclick = () => { const u = td.parentElement.dataset.u; sk.sel = sk.sel === u ? null : u; App.render(); }); }
    $$(".pp-tbl", el).forEach(t => gridCols(t, "pp" + (t.classList.contains("pp-bom") ? "B" : t.classList.contains("pp-sups") ? "S" : "L"), { sort: false, fixed: { x: 24 }, cap: { Description: 520 } })); }
  return { renderFor, bom, order, supNo, has, stdsFor, rowsFor, qtyOf, jointKids, viewKey: () => [view.by, view.pv, view.sv, sk.tool, sk.dl, sk.sel].join("|"), layout, autofit };
})();
