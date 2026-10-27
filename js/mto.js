/* The smart MTO rows. A row picks from the parts library (MTOLIB, js/mtolib.js): item type, standard (Australian,
   Chinese or international), size, material, rating (schedule, class, SDR or finish), stock length or sheet size, unit
   and quantity. Lengths and plate open a list of the pieces the job needs (▸): the app packs them onto the fewest
   stock lengths or sheets (saw cut and offcut rules in Help, Settings) and the row's quantity is that total. The i
   button explains how a total was worked out and holds anything too long for a column. A row of type Other is the
   old free text row, for motors, bearings and vendor parts. The description, quantity and unit are kept on the row
   too, so the RFQ, Excel, print and search read it like any other row. If any item needs more than one length or
   sheet, a cutting list PDF with the cut diagrams comes with the RFQ. */
"use strict";
const Mto = (() => {
  const TYPES = MTOLIB.types, TY = Object.fromEntries(TYPES.map(t => [t.id, t]));
  const ORIGIN = { AU: "Australian", CN: "Chinese", INT: "International" };
  const open = new Set();   // rows with their piece list showing
  const rules = () => Object.assign({ kerf: 3, keep: 300 }, (Store.S.config || {}).cut || {});
  const type = it => TY[it.t];
  const std = it => { const T = type(it); return T && (T.stds.find(s => s.id === it.s) || T.stds[0]); };
  const sz = it => { const S = std(it); return S && S.sizes.find(z => z.n === it.z); };
  const isLen = it => { const T = type(it); return !!T && T.k === "len"; }, isPlate = it => { const T = type(it); return !!T && T.k === "plate"; };
  const cuts = it => (it.cuts || []).filter(c => +c.l > 0 && (!isPlate(it) || +c.w > 0));
  function ratings(it){ const S = std(it); if (!S) return []; if (S.rat) return S.rat; const z = sz(it); if (z && z.r) return Object.keys(z.r);
    const all = []; S.sizes.forEach(z => Object.keys(z.r || {}).forEach(k => { if (!all.includes(k)) all.push(k); })); return all; }
  const PREF = ["SCH40", "SCH40S", "STD", "SDR 11", "Medium", "SCH10S", "Black"];
  const pickRating = (it, list) => list.includes(it.r) ? it.r : PREF.find(p => list.includes(p)) || list[0] || "";
  const lenTxt = L => typeof L === "string" ? L.replace("x", " x ") : (+L / 1000) + " m";
  const sheet = L => { const m = String(L || "").match(/^(\d+)x(\d+)$/); return m ? { l: +m[1], w: +m[2] } : null; };
  /* mass: kg per metre for lengths, kg per m2 for plate */
  function kg(it){ const z = sz(it); if (!z) return null; if (z.r){ const r = z.r[it.r]; return r ? r.kg : null; } return z.kg == null ? null : z.kg; }
  function desc(it){ const T = type(it), S = std(it); if (!T) return it.desc || "";
    const fin = T.rl === "Finish", ab = (T.n.match(/\(([A-Z]+)/) || [])[1], z = ab && it.z ? it.z.replace(new RegExp("\\s*" + ab + "$"), "") : it.z;   // ("(SHS) 100x100x5", not "(SHS) 100x100x5 SHS")
    return [T.n + (z ? " " + z : "") + (!fin && it.r ? " " + it.r : ""), it.m, fin && it.r, S && S.n, it.L && (T.k === "len" ? lenTxt(it.L) + " lengths" : T.k === "plate" ? lenTxt(it.L) + " mm sheets" : "")].filter(Boolean).join(", "); }

  /* ---------- packing ---------- */
  /* lengths: biggest piece first, each into the first length it fits (first fit decreasing), a saw cut between pieces */
  function packLen(it){ const L = +it.L, { kerf, keep } = rules(), ps = [], long = [];
    cuts(it).forEach(c => { for (let i = 0; i < Math.max(1, Math.round(+c.n || 1)); i++) (+c.l > L ? long : ps).push({ l: +c.l, mk: c.mk || "" }); });
    ps.sort((a, b) => b.l - a.l); const bars = [];
    ps.forEach(p => { let b = bars.find(b => b.used + (b.ps.length ? kerf : 0) + p.l <= L + 1e-6); if (!b){ b = { ps: [], used: 0 }; bars.push(b); } b.used += (b.ps.length ? kerf : 0) + p.l; b.ps.push(p); });
    bars.forEach(b => { const left = L - b.used; b.off = left > kerf ? left - kerf : 0; b.keep = b.off >= keep; });
    return { kind: "len", L, bars, long, pieces: ps.length, need: ps.reduce((t, p) => t + p.l, 0) }; }
  /* plate: shelves across the sheet, tallest pieces first, each piece turned to suit */
  function packPlate(it){ const sh = sheet(it.L), { kerf } = rules(), ps = [], big = []; if (!sh) return null;
    cuts(it).forEach(c => { for (let i = 0; i < Math.max(1, Math.round(+c.n || 1)); i++){ let a = +c.l, b = +c.w; const lo = Math.max(a, b), hi = Math.min(a, b);
      if (lo <= sh.l && hi <= sh.w) ps.push({ w: lo, h: hi, mk: c.mk || "", l0: +c.l, w0: +c.w }); else if (lo <= sh.w && hi <= sh.l) ps.push({ w: hi, h: lo, mk: c.mk || "", l0: +c.l, w0: +c.w }); else big.push({ l: +c.l, w: +c.w, mk: c.mk }); } });
    ps.sort((a, b) => b.h - a.h || b.w - a.w); const sheets = [];
    ps.forEach(p => { let done = false;
      for (const s of sheets){ for (const r of s.rows){ if (p.h <= r.h && r.x + (r.x ? kerf : 0) + p.w <= sh.l){ r.x += r.x ? kerf : 0; p.x = r.x; p.y = r.y; r.x += p.w; s.ps.push(p); done = true; break; } } if (done) break;
        const y = s.rows.length ? s.top + kerf : 0; if (y + p.h <= sh.w){ s.rows.push({ y, h: p.h, x: p.w }); s.top = y + p.h; p.x = 0; p.y = y; s.ps.push(p); done = true; break; } }
      if (!done){ const s = { rows: [{ y: 0, h: p.h, x: p.w }], top: p.h, ps: [] }; p.x = 0; p.y = 0; s.ps.push(p); sheets.push(s); } });
    sheets.forEach(s => { s.area = s.ps.reduce((t, p) => t + p.w * p.h, 0); s.use = s.area / (sh.l * sh.w); });
    return { kind: "plate", sh, sheets, big, pieces: ps.length, need: ps.reduce((t, p) => t + p.w * p.h, 0) }; }
  const pack = it => !cuts(it).length || !it.L ? null : isLen(it) ? packLen(it) : isPlate(it) ? packPlate(it) : null;
  const stockN = res => res ? (res.kind === "len" ? res.bars.length : res.sheets.length) : 0;
  const n1 = x => +(+x).toFixed(x < 10 ? 2 : 1);
  /* the row's quantity from its pieces, in its unit */
  function total(it, res){ const n = stockN(res) + Math.max(0, Math.round(+it.spare || 0)), k = kg(it);
    if (res.kind === "len"){ const m = n * res.L / 1000; return it.unit === "lengths" ? n : it.unit === "kg" ? (k ? Math.ceil(m * k) : "") : n1(m); }
    const a = n * res.sh.l * res.sh.w / 1e6; return it.unit === "m2" ? n1(a) : it.unit === "kg" ? (k ? Math.ceil(a * k) : "") : n; }
  /* after any change: the quantity (when the pieces set it) and the description */
  function recalc(it){ if (!type(it)) return; const res = pack(it); if (res) it.qty = String(total(it, res)); it.desc = desc(it); }

  /* ---------- how a total was worked out, in words ---------- */
  const mm = x => Math.round(x).toLocaleString() + " mm", m_ = x => n1(x / 1000) + " m";
  function explain(it, res){ if (!res) return ""; const { kerf, keep } = rules(), sp = Math.max(0, Math.round(+it.spare || 0)), k = kg(it);
    if (res.kind === "len"){ const n = res.bars.length, keepO = res.bars.filter(b => b.off && b.keep), scrap = res.bars.filter(b => b.off && !b.keep);
      return res.pieces + " piece" + (res.pieces === 1 ? "" : "s") + ", " + m_(res.need) + " in all. They fit on " + n + " × " + lenTxt(res.L) + " length" + (n === 1 ? "" : "s") + " with a " + kerf + " mm saw cut between pieces"
        + (sp ? ", plus " + sp + " spare length" + (sp === 1 ? "" : "s") : "") + ", so " + (n + sp) + " × " + lenTxt(res.L) + " = " + m_((n + sp) * res.L) + " to order."
        + (keepO.length ? " Offcuts kept (" + keep + " mm or more): " + keepO.map(b => mm(b.off)).join(", ") + "." : "") + (scrap.length ? " Scrap: " + scrap.map(b => mm(b.off)).join(", ") + "." : "")
        + (k ? " Weight about " + Math.round((n + sp) * res.L / 1000 * k).toLocaleString() + " kg (" + k + " kg/m)." : "")
        + (res.long.length ? " " + res.long.length + " piece" + (res.long.length === 1 ? " is" : "s are") + " longer than a stock length (" + res.long.map(p => mm(p.l)).join(", ") + "), so " + (res.long.length === 1 ? "it needs" : "they need") + " a joint or a longer length, and " + (res.long.length === 1 ? "isn't" : "aren't") + " counted." : ""); }
    const n = res.sheets.length, s = res.sh;
    return res.pieces + " piece" + (res.pieces === 1 ? "" : "s") + ", " + n1(res.need / 1e6) + " m² in all. They nest onto " + n + " × " + s.l + " x " + s.w + " sheet" + (n === 1 ? "" : "s") + " with a " + kerf + " mm cut between pieces"
      + (sp ? ", plus " + sp + " spare sheet" + (sp === 1 ? "" : "s") : "") + ". Use: " + res.sheets.map((x, i) => "sheet " + (i + 1) + " " + Math.round(x.use * 100) + "%").join(", ") + "."
      + (k ? " Weight about " + Math.round((n + sp) * s.l * s.w / 1e6 * k).toLocaleString() + " kg (" + k + " kg/m²)." : "")
      + (res.big.length ? " " + res.big.length + " piece" + (res.big.length === 1 ? " is" : "s are") + " bigger than the sheet and " + (res.big.length === 1 ? "isn't" : "aren't") + " counted." : ""); }

  /* ---------- the table ---------- */
  const typeOpts = cur => '<option value="other"' + (!TY[cur] ? " selected" : "") + '>Other (type it in)</option>' + [...new Set(TYPES.map(t => t.g))].map(g => '<optgroup label="' + esc(g) + '">' + TYPES.filter(t => t.g === g).map(t => '<option value="' + t.id + '"' + (t.id === cur ? " selected" : "") + '>' + esc(t.n) + '</option>').join("") + '</optgroup>').join("");
  const opts = (list, cur, lab) => list.map(v => '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? " selected" : "") + '>' + esc(lab ? lab(v) : v) + '</option>').join("");
  const sel = (it, c, inner, ro, cls) => '<select class="in pt-in mt-sel' + (cls || "") + '" data-r="' + it.id + '" data-c="' + c + '"' + (ro ? " disabled" : "") + '>' + inner + '</select>';
  const inp = (it, c, v, ro, ex) => '<input class="in pt-in' + (v === "TBC" ? " tbc" : "") + '" data-r="' + it.id + '" data-c="' + c + '"' + (ex || "") + (ro ? " readonly" : "") + ' value="' + esc(v == null ? "" : v) + '">';
  const UNITS = ["ea", "m", "lengths", "kg", "sheets", "m2", "set", "pairs", "L", "box", "roll", "lot"];
  const COLS = ["Type", "Standard", "Size", "Material", "Rating", "Stock length", "Qty", "Unit", "", "ETA", "Notes"];
  function table(a, ro){ const items = a.mto || (a.mto = []), lists = new Map();
    const blanks = ro ? 0 : 1;
    const row = (it, i) => { const T = type(it), S = std(it), res = T && pack(it), on = open.has(it.id), many = T && (T.k === "len" || T.k === "plate");
      const tg = many ? '<button type="button" class="mt-tg' + (on ? " on" : "") + '" data-tg="' + it.id + '" title="' + (on ? "Hide" : "Show") + ' the pieces to cut">' + (on ? "▾" : "▸") + (cuts(it).length ? '<b>' + cuts(it).reduce((t, c) => t + Math.max(1, Math.round(+c.n || 1)), 0) + '</b>' : "") + '</button>' : "";
      let h = '<tr data-id="' + it.id + '" class="mt-row' + (on ? " open" : "") + '"><td class="pt-no">' + (i + 1) + tg + '</td><td>' + sel(it, "t", typeOpts(it.t), ro) + '</td>';
      if (!T) h += '<td colspan="3">' + inp(it, "desc", it.desc, ro, ' placeholder="Description"') + '</td><td colspan="2">' + inp(it, "part", it.part, ro, ' placeholder="Part / tag no."') + '</td><td></td>';
      else { const key = "mtz-" + T.id + "-" + S.id; lists.set(key, S); const rs = ratings(it);
        h += '<td>' + sel(it, "s", T.stds.map(s => '<option value="' + s.id + '"' + (s === S ? " selected" : "") + '>' + esc((s.o === "INT" ? "" : s.o + " · ") + s.n) + '</option>').join(""), ro, " mt-std") + '</td>'
          + '<td>' + inp(it, "z", it.z, ro, ' list="' + key + '" placeholder="Pick or type" autocomplete="off"' + (it.z && !sz(it) ? ' title="Not in the library, check the size"' : "")) + '</td>'
          + '<td>' + sel(it, "m", opts(S.mats.includes(it.m) || !it.m ? S.mats : S.mats.concat(it.m), it.m), ro) + '</td>'
          + '<td>' + (rs.length ? sel(it, "r", opts(rs, it.r), ro) : '<span class="dim">—</span>') + '</td>'
          + '<td>' + (S.lens ? sel(it, "L", opts(S.lens, it.L, lenTxt), ro) : "") + '</td>'; }
      const auto = !!res;
      h += '<td>' + inp(it, "qty", it.qty, ro || auto, ' inputmode="decimal"' + (auto ? ' title="Worked out from the pieces (▸)"' : "")) + '</td>'
        + '<td>' + (T ? sel(it, "unit", opts(T.units.includes(it.unit) || !it.unit ? T.units : T.units.concat(it.unit), it.unit), ro) : inp(it, "unit", it.unit, ro, ' list="mt-units"')) + '</td>'
        + '<td class="mt-ic"><button type="button" class="mt-i' + (it.info || res || (T && sz(it)) ? " on" : "") + '" data-info="' + it.id + '" title="More about this item: sizes, weight, how the total was worked out, and notes">' + INFO_I + '</button></td>'
        + '<td>' + inp(it, "eta", it.eta, ro, ' type="date" title="When this part is expected on site"') + '</td><td>' + inp(it, "notes", it.notes, ro) + '</td>'
        + '<td class="pt-act">' + (ro ? "" : '<button type="button" class="btn ghost sm pt-mv" title="Move this row to Spares">→ Spares</button><button type="button" class="ic-b sm pt-x" title="Remove this row">✕</button>') + '</td></tr>';
      if (on && many) h += '<tr class="mt-sub" data-sub="' + it.id + '"><td colspan="13"><div class="mt-subin">' + piecesHtml(it, res, ro) + '</div></td></tr>';
      return h; };
    const blank = k => '<tr class="pt-blank"><td class="pt-no"></td><td><select class="in pt-in mt-sel" data-r="new' + k + '" data-c="t"' + (ro ? " disabled" : "") + '><option value="" selected>Choose a type…</option>' + typeOpts("~").replace(' selected', "") + '</select></td><td colspan="3"><input class="in pt-in" data-r="new' + k + '" data-c="desc" placeholder="or type a description"' + (ro ? " readonly" : "") + '></td><td colspan="9"></td></tr>';
    const body = items.map(row).join("") + Array.from({ length: blanks }, (_, k) => blank(k)).join("");
    return '<div class="mt-wrap"><table class="tbl pt-tbl mt-tbl"><thead><tr><th class="pt-no">Item</th>' + COLS.map(n => '<th>' + esc(n) + '</th>').join("") + '<th class="pt-act"></th></tr></thead><tbody>' + body + '</tbody></table></div>'
      + [...lists].map(([k, S]) => '<datalist id="' + k + '">' + S.sizes.map(z => '<option value="' + esc(z.n) + '">' + esc(z.a ? z.a + (z.od ? ", " + z.od + " OD" : "") : z.kg ? z.kg + " kg/m" : "") + '</option>').join("") + '</datalist>').join("")
      + '<datalist id="mt-units">' + UNITS.map(u => '<option value="' + u + '">').join("") + '</datalist>'; }

  /* the pieces under a row, with the packing drawn */
  function piecesHtml(it, res, ro){ const pl = isPlate(it), cs = it.cuts || [];
    const cin = (c, k, v, ph) => '<input class="in pt-in mt-cin" data-cut="' + c + '" data-r="' + it.id + '" data-c="' + k + '"' + (ro ? " readonly" : "") + (k === "mk" ? "" : ' inputmode="decimal"') + ' value="' + esc(v == null ? "" : v) + '"' + (ph ? ' placeholder="' + ph + '"' : "") + '>';
    return '<div class="mt-cuts"><table class="mt-ct"><thead><tr><th>Piece</th><th>Length (mm)</th>' + (pl ? '<th>Width (mm)</th>' : "") + '<th>Qty</th><th>Mark / where it goes</th><th></th></tr></thead><tbody>'
      + cs.map((c, i) => '<tr><td class="pt-no">' + (i + 1) + '</td><td>' + cin(c.id, "l", c.l) + '</td>' + (pl ? '<td>' + cin(c.id, "w", c.w) + '</td>' : "") + '<td>' + cin(c.id, "n", c.n || 1) + '</td><td>' + cin(c.id, "mk", c.mk, "e.g. A, or chute brace") + '</td><td>' + (ro ? "" : '<button type="button" class="ic-b sm" data-cx="' + c.id + '" data-r="' + it.id + '" title="Remove this piece">✕</button>') + '</td></tr>').join("")
      + (ro ? "" : '<tr class="pt-blank"><td class="pt-no"></td><td>' + cin("new", "l", "", pl ? "e.g. 600" : "e.g. 2400") + '</td>' + (pl ? '<td>' + cin("new", "w", "", "e.g. 400") + '</td>' : "") + '<td>' + cin("new", "n", "", "1") + '</td><td>' + cin("new", "mk", "") + '</td><td></td></tr>')
      + '</tbody></table><div class="mt-side"><label class="mt-sp">Spare ' + (pl ? "sheets" : "lengths") + ' <input class="in pt-in" data-r="' + it.id + '" data-c="spare" inputmode="numeric" value="' + esc(it.spare || "") + '" placeholder="0"' + (ro ? " readonly" : "") + '></label>'
      + '<button type="button" class="mt-i' + (res ? " on" : "") + '" data-info="' + it.id + '" title="How the total is worked out">' + INFO_I + '</button>'
      + '</div></div>' + (res ? '<div class="mt-draw">' + (res.kind === "len" ? barsSvg(res) : sheetsSvg(res)) + '</div>' : ""); }
  /* bars the same are drawn once, "× 3" */
  function groups(res){ const g = new Map(); res.bars.forEach(b => { const k = b.ps.map(p => p.l + "|" + p.mk).join(",") + "#" + b.off; if (!g.has(k)) g.set(k, { b, n: 0 }); g.get(k).n++; }); return [...g.values()]; }
  function barsSvg(res){ const L = res.L, { kerf } = rules();
    return groups(res).map(({ b, n }) => { let x = 0, s = "";
      b.ps.forEach((p, i) => { if (i){ s += '<rect class="kf" x="' + (x / L * 1000) + '" y="2" width="' + Math.max(1, kerf / L * 1000) + '" height="30"/>'; x += kerf; }
        const w = p.l / L * 1000; s += '<rect class="pc" x="' + (x / L * 1000) + '" y="2" width="' + w + '" height="30" rx="2"/>' + (w > 40 ? '<text x="' + (x / L * 1000 + w / 2) + '" y="21">' + esc(p.l + (p.mk && w > 90 ? " " + p.mk : "")) + '</text>' : ""); x += p.l; });
      if (b.off){ x += kerf; const w = b.off / L * 1000; s += '<rect class="' + (b.keep ? "of" : "sc") + '" x="' + (x / L * 1000) + '" y="2" width="' + w + '" height="30" rx="2"/>' + (w > 50 ? '<text class="ot" x="' + (x / L * 1000 + w / 2) + '" y="21">' + (b.keep ? "offcut " : "scrap ") + Math.round(b.off) + '</text>' : ""); }
      return '<div class="mt-bar"><span class="mt-bn">' + (n > 1 ? "× " + n : "× 1") + '</span><svg viewBox="0 0 1000 34" preserveAspectRatio="none" role="img" aria-label="Cut plan">' + s + '</svg></div>'; }).join("")
      + '<div class="mt-key"><i class="pc"></i>in the MTO<i class="of"></i>offcut kept<i class="sc"></i>scrap</div>'; }
  function sheetsSvg(res){ const { l, w } = res.sh;
    return '<div class="mt-shs">' + res.sheets.map((s, i) => '<div class="mt-sh"><span class="mt-bn">Sheet ' + (i + 1) + ', ' + Math.round(s.use * 100) + '%</span><svg viewBox="0 0 ' + l + ' ' + w + '" role="img" aria-label="Sheet layout"><rect class="of" x="0" y="0" width="' + l + '" height="' + w + '"/>'
      + s.ps.map(p => '<rect class="pc" x="' + p.x + '" y="' + p.y + '" width="' + p.w + '" height="' + p.h + '"/>' + (p.w > l / 8 && p.h > w / 10 ? '<text style="font-size:' + Math.round(Math.min(p.h * 0.32, l / 22)) + 'px" x="' + (p.x + p.w / 2) + '" y="' + (p.y + p.h / 2) + '" dominant-baseline="middle">' + esc(p.l0 + "x" + p.w0 + (p.mk ? " " + p.mk : "")) + '</text>' : "")).join("") + '</svg></div>').join("") + '</div>'
      + '<div class="mt-key"><i class="pc"></i>in the MTO<i class="of"></i>offcut</div>'; }

  /* ---------- editing ---------- */
  const num = v => { const m = String(v).replace(/,/g, "").trim().match(/^([\d.]+)\s*(mm|m)?$/i); if (!m) return null; const x = parseFloat(m[1]); return m[2] && m[2].toLowerCase() === "m" ? Math.round(x * 1000) : x; };
  /* a choice changed: keep the rest of the row sensible */
  function settle(it, c){ const T = type(it); if (!T) return;
    if (c === "t"){ const S = T.stds[0]; it.s = S.id; it.z = ""; it.m = S.mats[0]; it.L = S.lens ? S.defl : undefined; it.unit = T.units[0]; it.r = pickRating(it, ratings(it)); if (T.k !== "len" && T.k !== "plate") delete it.cuts; }
    const S = std(it); if (c === "s"){ if (!S.sizes.some(z => z.n === it.z)) it.z = ""; if (!S.mats.includes(it.m)) it.m = S.mats[0]; it.L = S.lens ? (S.lens.includes(it.L) ? it.L : S.defl) : undefined; }
    if (c === "z"){ const z = S.sizes.find(z => z.n.toLowerCase() === String(it.z).trim().toLowerCase()); if (z) it.z = z.n; }
    if (c === "L" && S.lens && typeof S.lens[0] === "number") it.L = +it.L;
    it.s = S.id; it.r = pickRating(it, ratings(it)); }
  function wire(el, a, ro){ const key = "a:" + a._p, items = a.mto || (a.mto = []), find = id => items.find(x => x.id === id);
    /* the pieces and drawings stay in view while the wide table scrolls sideways */
    const wrap = $(".mt-wrap", el); if (wrap){ const fit = () => $$(".mt-subin", wrap).forEach(d => d.style.width = Math.max(320, wrap.clientWidth - 24) + "px"); fit();
      const ro2 = new ResizeObserver(() => wrap.isConnected ? fit() : ro2.disconnect()); ro2.observe(wrap); }
    $$(".mt-tg", el).forEach(b => b.onclick = () => { const id = b.dataset.tg; open.has(id) ? open.delete(id) : open.add(id); App.render(); });
    $$("[data-info]", el).forEach(b => b.onclick = e => { e.stopPropagation(); info(a, find(b.dataset.info), b, ro); });
    if (ro) return;
    $$(".mt-tbl .pt-in", el).forEach(i => { if (i.classList.contains("mt-cin")) return;
      i.onchange = () => { const v = i.value.trim(), r = i.dataset.r, c = i.dataset.c;
        if (r.startsWith("new")){ if (!v) return; const it = { id: uid() };
          if (c === "t"){ if (v !== "other"){ it.t = v; settle(it, "t"); } else it.desc = ""; } else it[c] = v;
          Parts.created.set(r, it.id); if (it.t && (TY[it.t].k === "len" || TY[it.t].k === "plate")) open.add(it.id);
          recalc(it); Store.mutate(key, () => { items.push(it); Store.touch(a); }); Store.log("Added to the MTO of " + Store.actId(a)); return; }
        const it = find(r); if (!it) return; const was = c === "L" ? String(it.L) : it[c] == null ? "" : String(it[c]); if (was === v) return;
        Store.mutate(key, () => { if (c === "t"){ if (v === "other"){ const d = desc(it); ["t", "s", "z", "m", "r", "L", "cuts", "spare"].forEach(k => delete it[k]); it.desc = d; } else { it.t = v; settle(it, "t"); if (TY[v].k === "len" || TY[v].k === "plate") open.add(it.id); } }
          else if (c === "spare") it.spare = Math.max(0, Math.round(+v || 0)) || undefined; else { it[c] = v; settle(it, c); }
          recalc(it); Store.touch(a); }); Store.log("Edited the MTO of " + Store.actId(a)); }; });
    /* the pieces */
    $$(".mt-cin", el).forEach(i => { i.onchange = () => { const it = find(i.dataset.r), c = i.dataset.c, id = i.dataset.cut; if (!it) return; let v = i.value.trim();
        if (c !== "mk"){ if (v === "") { if (id === "new") return; } else { const x = c === "n" ? Math.round(+v) : num(v); if (!(x > 0)){ i.classList.add("bad"); i.title = c === "n" ? "A whole number" : "A length in mm, or in m with an m (2.4m)"; return; } v = x; } }
        if (id === "new"){ if (v === "") return; const cu = { id: uid(), n: 1 }; cu[c] = v; Parts.created.set("cut:" + it.id, cu.id);
          Store.mutate(key, () => { (it.cuts = it.cuts || []).push(cu); recalc(it); Store.touch(a); }); return; }
        const cu = (it.cuts || []).find(x => x.id === id); if (!cu || String(cu[c] == null ? "" : cu[c]) === String(v)) return;
        Store.mutate(key, () => { cu[c] = v === "" ? undefined : v; recalc(it); Store.touch(a); }); };
      i.onkeydown = e => { if (e.key === "Enter"){ e.preventDefault(); const all = $$(".mt-cin", i.closest("table")), k = all.indexOf(i); i.blur(); setTimeout(() => { const n = $$('.mt-cin[data-cut="new"][data-c="l"]', el).find(x => x.dataset.r === i.dataset.r); n && n.focus(); }, 40); } }; });
    $$("[data-cx]", el).forEach(b => b.onclick = () => { const it = find(b.dataset.r); if (!it) return; Store.mutate(key, () => { it.cuts = (it.cuts || []).filter(c => c.id !== b.dataset.cx); recalc(it); Store.touch(a); }); }); }

  /* ---------- the i callout ---------- */
  function info(a, it, anchor, ro){ if (!it) return; Fields.closePop(); const T = type(it), z = sz(it), res = T && pack(it), k = kg(it), S = std(it);
    const facts = [];
    if (T){ if (S) facts.push(["Standard", S.n + (S.o !== "INT" ? " (" + ORIGIN[S.o] + ")" : "")]);
      if (z && z.a) facts.push(["Nominal size", z.n + ", " + z.a]);
      if (z && z.od) facts.push(["Outside diameter", z.od + " mm"]);
      if (z && z.r && z.r[it.r]) { facts.push(["Wall", z.r[it.r].t + " mm"]); if (z.r[it.r].pn) facts.push(["Pressure rating", z.r[it.r].pn]); }
      if (z && z.d && !z.od) facts.push(["Size", [z.d && "depth " + z.d, z.b && "width " + z.b, z.t && "thickness " + z.t, z.tf && "flange " + z.tf, z.tw && "web " + z.tw].filter(Boolean).join(", ") + " mm"]);
      if (z && z.g) facts.push(["Grades made", z.g.join(", ")]);
      if (z && z.bolts){ const cls = Object.keys(z.bolts).find(c => String(it.r || "").startsWith(c)); if (cls && z.bolts[cls]) facts.push(["Bolting", z.bolts[cls] + " (ASME B16.5 " + cls + ")"]); }
      if (k) facts.push(["Mass", "about " + k + (T.k === "plate" ? " kg/m²" : " kg/m")]);
      if (S && S.note) facts.push(["Note", S.note]); }
    const p = document.createElement("div"); p.className = "pop mt-pop";
    p.innerHTML = '<b>' + esc(desc(it) || "Item") + '</b>' + (facts.length ? '<dl>' + facts.map(([t, v]) => '<dt>' + esc(t) + '</dt><dd>' + esc(v) + '</dd>').join("") + '</dl>' : "")
      + (res ? '<div class="lbl">How the total was worked out</div><p>' + esc(explain(it, res)) + '</p>'
        : T && (T.k === "len" || T.k === "plate") ? '<div class="lbl">How the total is worked out</div><p>' + esc(!it.L ? "Pick a stock " + (T.k === "plate" ? "sheet size" : "length") + " first." : "Add the pieces the job needs (▸). They're packed onto the fewest " + (T.k === "plate" ? "sheets" : "stock lengths, keeping offcuts of " + rules().keep + " mm or more,") + " with a " + rules().kerf + " mm saw cut between pieces, and Qty becomes the total.") + '</p>' : "")
      + (T && !z && it.z ? '<p class="bad">' + esc(it.z) + " isn't in the library for " + esc(S.n) + ". Check the size.</p>" : "")
      + '<label class="fl"><span class="fl-h">Notes' + tipI("Anything too long for a column.") + '</span>' + '<textarea class="in" rows="4"' + (ro ? " readonly" : "") + ' placeholder="e.g. Allowed 1 spare length for site fit up">' + esc(it.info || "") + '</textarea></label>';
    document.body.appendChild(p); Fields.place(p, anchor); const pr = p.getBoundingClientRect(); if (pr.bottom > innerHeight - 8) p.style.top = Math.max(8, innerHeight - pr.height - 8) + "px";
    if (pr.right > innerWidth - 8) p.style.left = Math.max(8, innerWidth - pr.width - 8) + "px";
    const ta = $("textarea", p); p._done = () => { const v = ta.value.trim(); if (ro || v === (it.info || "")) return; Store.mutate("a:" + a._p, () => { it.info = v || undefined; Store.touch(a); }); }; }

  /* ---------- the cutting list PDF ---------- */
  const needsCut = a => (a.mto || []).some(it => stockN(pack(it)) > 1);
  async function cutPdf(a){ const jsPDF = await Parts.loadPdf(), doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" }), { kerf, keep } = rules(), p = Store.project(a._p) || {};
    const W = 297, X = 14, BW = W - 2 * X; let y = 0;
    const head = () => { doc.setFillColor(71, 85, 105); doc.rect(0, 0, W, 20, "F"); doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text("Cutting list", X, 12);
      doc.setFontSize(9.5); doc.setFont("helvetica", "normal"); doc.text(Store.actId(a) + "   " + (a.f.title || "").slice(0, 120), X + 34, 12); y = 28; };
    const room = h => { if (y + h > 196){ doc.addPage(); head(); } };
    const hatch = (x, yy, w, h) => { doc.setDrawColor(150); doc.setLineWidth(0.15); for (let d = -h; d < w; d += 2.2){ const x1 = x + Math.max(0, d), y1 = yy + h - Math.max(0, -d) * 0 - (d < 0 ? -d : 0); const x0 = x + Math.max(d, 0), y0 = yy + h - (d < 0 ? -d : 0), x2 = Math.min(x + w, x + d + h), y2 = yy + h - (x2 - (x + d)); if (x2 > x0) doc.line(x0, y0, x2, y2); } };
    head(); doc.setTextColor(60); doc.setFontSize(9);
    doc.text("Saw cut allowed: " + kerf + " mm. Offcuts of " + keep + " mm or more are kept. Blue pieces are what the MTO is for; grey is offcut. Lengths are in mm, measured from the left end.", X, y); y += 7;
    (a.mto || []).forEach((it, idx) => { const res = pack(it); if (!res) return; const sp = Math.max(0, Math.round(+it.spare || 0));
      room(30); doc.setTextColor(20); doc.setFont("helvetica", "bold"); doc.setFontSize(11.5); doc.text(doc.splitTextToSize("Item " + (idx + 1) + ": " + desc(it), BW), X, y); y += 5.5;
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(80); const ex = doc.splitTextToSize(explain(it, res), BW); doc.text(ex, X, y); y += ex.length * 4 + 3;
      if (res.kind === "len"){ let no = 1;
        groups(res).forEach(({ b, n }) => { room(24); doc.setTextColor(30); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
          doc.text((n > 1 ? "Lengths " + no + " to " + (no + n - 1) + "  (" + n + " the same)" : "Length " + no) + "   " + lenTxt(res.L), X, y); no += n; y += 2.5;
          const s = BW / res.L, h = 9; let x = 0; const ticks = [];
          b.ps.forEach((pc, i) => { if (i) x += kerf; doc.setFillColor(205, 225, 248); doc.setDrawColor(60, 100, 160); doc.setLineWidth(0.3); doc.rect(X + x * s, y, pc.l * s, h, "FD");
            const lab = pc.l + (pc.mk ? "  " + pc.mk : ""); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(20, 50, 100); if (doc.getTextWidth(lab) < pc.l * s - 2) doc.text(lab, X + (x + pc.l / 2) * s, y + 5.8, { align: "center" }); else if (doc.getTextWidth(String(pc.l)) < pc.l * s - 1) doc.text(String(pc.l), X + (x + pc.l / 2) * s, y + 5.8, { align: "center" });
            x += pc.l; ticks.push(x); });
          if (b.off){ const ox = x + kerf; doc.setFillColor(232, 232, 232); doc.setDrawColor(150); doc.rect(X + ox * s, y, b.off * s, h, "FD"); hatch(X + ox * s, y, b.off * s, h);
            const lab = (b.keep ? "Offcut " : "Scrap ") + Math.round(b.off); doc.setFontSize(8); doc.setTextColor(70); if (doc.getTextWidth(lab) < b.off * s - 2){ doc.setFillColor(232, 232, 232); const tw = doc.getTextWidth(lab) + 2; doc.rect(X + (ox + b.off / 2) * s - tw / 2, y + 2.5, tw, 4.5, "F"); doc.text(lab, X + (ox + b.off / 2) * s, y + 5.8, { align: "center" }); } }
          doc.setDrawColor(40); doc.setLineWidth(0.25); doc.rect(X, y, BW, h);
          doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(90); let last = -99;
          ticks.forEach(t => { if (t >= res.L - 1) return; const tx = X + t * s; doc.line(tx, y + h, tx, y + h + 1.8); if (tx - last > 9){ doc.text(String(Math.round(t)), tx, y + h + 4.5, { align: "center" }); last = tx; } });
          doc.text("cut at", X - 1, y + h + 4.5, { align: "right" }); y += h + 9; }); }
      else { const sh = res.sh, maxW = BW * 0.62, maxH = 60, s = Math.min(maxW / sh.l, maxH / sh.w);
        res.sheets.forEach((S, i) => { room(sh.w * s + 12); doc.setTextColor(30); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.text("Sheet " + (i + 1) + " of " + res.sheets.length + "   " + sh.l + " x " + sh.w + "   " + Math.round(S.use * 100) + "% used", X, y); y += 2.5;
          doc.setFillColor(232, 232, 232); doc.setDrawColor(150); doc.rect(X, y, sh.l * s, sh.w * s, "F"); hatch(X, y, sh.l * s, sh.w * s);
          S.ps.forEach(pc => { doc.setFillColor(205, 225, 248); doc.setDrawColor(60, 100, 160); doc.setLineWidth(0.3); doc.rect(X + pc.x * s, y + pc.y * s, pc.w * s, pc.h * s, "FD");
            const lab = pc.l0 + " x " + pc.w0 + (pc.mk ? "  " + pc.mk : ""); doc.setFontSize(7.5); doc.setTextColor(20, 50, 100); if (doc.getTextWidth(lab) < pc.w * s - 1.5 && pc.h * s > 4) doc.text(lab, X + (pc.x + pc.w / 2) * s, y + (pc.y + pc.h / 2) * s + 1.2, { align: "center" }); });
          doc.setDrawColor(40); doc.setLineWidth(0.25); doc.rect(X, y, sh.l * s, sh.w * s); y += sh.w * s + 8; }); }
      y += 3; });
    const pages = doc.getNumberOfPages(); for (let i = 1; i <= pages; i++){ doc.setPage(i); doc.setFontSize(8); doc.setTextColor(140); doc.text(Store.actId(a) + " Cutting list   " + (p.name || "") + "   Page " + i + " of " + pages, W / 2, 204, { align: "center" }); }
    return doc.output("blob"); }
  async function cutList(a, rev){ try { const blob = await cutPdf(a), name = Store.actId(a) + " Cutting list" + (rev ? " Rev " + rev : "") + ".pdf"; Excel.save(blob, name); Local.saveOriginal(a, name, blob); return name; }
    catch (e){ console.error(e); alert("Couldn't make the cutting list: " + e.message); } }

  return { table, wire, recalc, desc, pack, explain, needsCut, cutList, info, TY };
})();
