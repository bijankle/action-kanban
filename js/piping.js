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
      + '<div class="seg pp-seg"><button type="button" data-v="list"' + (view.pv === "list" ? ' class="on"' : "") + '>List</button><button type="button" data-v="bom"' + (view.pv === "bom" ? ' class="on"' : "") + '>BoM</button></div>'
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
        body += '<tr data-u="' + esc(r.u) + '"><td class="pt-no">' + esc(byItem ? numOf(B, r.u) : id) + '</td><td' + (r.it ? "" : ' class="need"') + '>' + dd(r.u, "it", r.it ? (/^[VGB]:/.test(r.it) ? (PipeSpec.items(r.cl, r.dn).find(x => x.v === r.it) || { t: r.it }).t : r.it) : "") + '</td><td>' + dd(r.u, "cl", r.cl) + '</td><td' + (r.dn ? "" : ' class="need"') + '>' + dd(r.u, "dn", r.cl && r.dn ? PipeSpec.lab(r.cl, r.dn) : "") + '</td>'
          + '<td' + (pipe && !r.len ? ' class="need"' : "") + '>' + (pipe ? box(r.u, "len", r.len, "Length, mm") : "") + '</td><td>' + (pipe ? "" : box(r.u, "qty", r.qty, "Qty")) + '</td>' + desc(r) + X(r.u) + '</tr>'; });
      if (!ro) body += '<tr class="pt-blank pp-add"><td class="pt-no"></td><td class="need">' + dd("+" + L.id, "add", "+ Add to line " + L.id) + '</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>'; });
    return bar + '<table class="tbl pt-tbl pp-tbl"><thead><tr><th class="pt-no" data-col="No.">#</th><th>Item</th><th>Spec</th><th>Size</th><th>Length</th><th>Qty</th><th>Description</th><th data-col="x"></th></tr></thead><tbody>' + body + '</tbody></table>'; }
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
    wire(el, a, ro, which);
    $$(".pp-tbl", el).forEach(t => gridCols(t, "pp" + (t.classList.contains("pp-bom") ? "B" : t.classList.contains("pp-sups") ? "S" : "L"), { sort: false, fixed: { x: 24 }, cap: { Description: 520 } })); }
  return { renderFor, bom, order, supNo, has, stdsFor, rowsFor, qtyOf, jointKids, viewKey: () => view.by + view.pv + view.sv };
})();
