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

  /* ---------- short form (standard MTO wording: ELB 90 LR, FLG WN, CL150 RF, A403 WP316L, B16.9) ---------- */
  const SHORT = { pipe: "PIPE", sspipe: "PIPE", sstube: "TUBE", pe: "PIPE HDPE", ub: "UB", uc: "UC", wb: "WB", pfc: "PFC", tfb: "TFB", ea: "EA", ua: "UA", shs: "SHS", rhs: "RHS", chs: "CHS",
    flat: "FLT", round: "RND BAR", square: "SQ BAR", rod: "THD ROD", plate: "PL", el90: "ELB 90 LR", el90s: "ELB 90 SR", el45: "ELB 45", tee: "TEE EQ", cap: "CAP", rtee: "TEE RED", rcon: "RED CONC",
    recc: "RED ECC", stub: "STUB END", coup: "CPLG", union: "UNION", nip: "NIP", plug: "PLUG", bush: "BUSH", olet: "OLET", flwn: "FLG WN", flso: "FLG SO", flbl: "FLG BL", flpl: "FLG PL", fllj: "FLG LJ",
    flsw: "FLG SW", flth: "FLG THD", gksw: "GK SPWD", gkring: "GK RING", gkff: "GK FF", gkrj: "GK RTJ", bolt: "HB", screw: "SET SCR", stud: "SB", nut: "NUT", washer: "WSHR", anchor: "ANCHOR" };
  const rShort = r => String(r || "").replace(/^AS 2129 Table /, "TBL ").replace(/^Table /, "TBL ").replace(/^AS 4087 /, "").replace(/^Class (\d+)/, "CL$1").replace(/ socket weld$/, " SW").replace(/ threaded$/, " THD")
    .replace(/^Hot dip galvanised$/, "HDG").replace(/^Zinc plated$/, "ZP").replace(/^Galvanised$/, "GALV").replace(/^PTFE coated \(Xylan\)$/, "PTFE CTD").replace(/^Sockolet /, "SOL ").replace(/^Threadolet /, "TOL ").replace(/^Weldolet /, "WOL ");
  function mShort(m){ let s = String(m || "").replace(/^ASTM /, ""); if (!s) return "";
    const g = s.match(/^(\d+) \/ (graphite|PTFE), (.*)$/); if (g) return g[1] + "/" + (g[2] === "graphite" ? "GRAPH" : "PTFE") + " " + g[3].replace(/316 inner and /, "316 IR ").replace(/CS outer ring/, "CS OR");
    s = s.replace(/^Compressed fibre \(CNAF\) ([\d.]+) mm$/, "CNAF $1").replace(/ (\d+(\.\d+)?) mm$/, " $1");
    const p = s.match(/^(.*?)\s*\(([^)]*)\)\s*(.*)$/); if (p){ const inner = p[2].replace(/^ASTM /, ""); s = /^A\d{3} (TP|WP|F)/.test(inner) ? inner : /^(A\d{3}|A\d-\d\d)$/.test(inner) ? p[1] + " " + inner : (p[1] + " " + p[3]).trim(); }
    return s.replace(/\bGr /, "GR ").replace(/\bgalvanised\b/i, "GALV"); }
  const stShort = n => !/\d/.test(n || "") ? "" : String(n || "").replace(/^Stainless, /, "").replace(/\bASME /g, "").replace(/\bASTM /g, "").replace(/ butt weld$/, "").replace(/ forged \(threaded \/ socket weld\)$/, "").replace(/ \(China\)$/, " CN").replace(/ \((hot rolled|water|water, gas, air)\)$/, "").replace(/ \(Bisalloy, Hardox\)$/, "");
  const UNIT = { ea: "EA", m: "M", lengths: "LG", sheets: "SHT", m2: "M2", kg: "KG", pairs: "PR", sets: "SET", boxes: "BOX", set: "SET", box: "BOX", roll: "ROLL", lot: "LOT", L: "L" };
  const uShort = u => UNIT[u] || String(u || "").toUpperCase();
  /* a size without its section's letters repeated ("100x100x5", not "100x100x5 SHS") */
  const zShort = it => { const T = type(it), ab = T && (T.n.match(/\(([A-Z]+)/) || [])[1]; return ab && it.z ? String(it.z).replace(new RegExp("\\s*" + ab + "$"), "") : it.z || ""; };
  /* pipe: how it's made and its ends are part of the item (PIPE SMLS PE: seamless, plain ends) */
  const PIPEK = new Set(["pipe", "sspipe"]), MK = { SMLS: "seamless", ERW: "electric resistance welded", WLD: "welded" }, EN = { BE: "bevelled ends", PE: "plain ends", THD: "threaded ends", TOE: "threaded one end" };
  const itemCode = it => { const T = type(it); return T ? [SHORT[T.id] || T.n, PIPEK.has(T.id) && it.mk, PIPEK.has(T.id) && it.end].filter(Boolean).join(" ") : it.desc || ""; };
  /* abbreviations written out, for the (i) of a row typed in */
  const ABBR = { BV: "ball valve", GV: "gate valve", CV: "check valve", BFV: "butterfly valve", GLV: "globe valve", FB: "full bore", RB: "reduced bore", "3PC": "3 piece body", BSPT: "British standard pipe thread, taper", BSP: "British standard pipe thread", NPT: "national pipe thread",
    F: "female", M: "male", SMLS: "seamless", ERW: "electric resistance welded", BE: "bevelled ends", PE: "plain ends", THD: "threaded", TOE: "threaded one end", HDG: "hot dip galvanised", GALV: "galvanised", SS: "stainless steel", CS: "carbon steel",
    ELB: "elbow", LR: "long radius", SR: "short radius", CPLG: "coupling", NIP: "nipple", FLG: "flange", WN: "weld neck", SO: "slip on", BL: "blind", RF: "raised face", FF: "flat face", GK: "gasket", SPWD: "spiral wound", HB: "hex bolt", SB: "stud bolt", PL: "plate", FLT: "flat bar", PFC: "parallel flange channel", EA: "equal angle", SHS: "square hollow section", RHS: "rectangular hollow section", CHS: "circular hollow section", "U-BOLT": "U bolt", TAG: "tag" };
  const unAbbr = t => String(t || "").split(/(\s+|,)/).map(w => ABBR[w.toUpperCase()] ? ABBR[w.toUpperCase()] : w).join("");
  /* the short form, used on the MTO, the RFQ and the exports: item, size, rating, material, standard, stock length */
  function desc(it){ const T = type(it), S = std(it); if (!T) return it.desc || "";
    const L = it.L && (T.k === "len" ? lenTxt(it.L).replace(" m", "m") + " LG" : T.k === "plate" ? String(it.L).replace("x", "×") + " SHT" : "");
    return [itemCode(it), zShort(it), rShort(it.r), mShort(it.m), S && !it.sx && stShort(S.n), L].filter(Boolean).join(" "); }

  /* ---------- in full, no abbreviations (the row's (i)) ---------- */
  const STDX = { "B16.9": "butt weld fittings (elbows, tees, reducers, caps)", "B16.11": "forged socket weld and threaded fittings", "B16.5": "pipe flanges, Class 150 to 2500", "B16.20": "metal gaskets for flanges (spiral wound, ring joint)",
    "B16.21": "non metallic flat gaskets for flanges", "B36.10M": "carbon steel pipe sizes and wall thicknesses", "B36.19M": "stainless steel pipe sizes and wall thicknesses", "AS 2129": "Australian flanges (Tables D, E, F, H)",
    "AS/NZS 1163": "Australian cold formed hollow sections (SHS, RHS, CHS)", "AS/NZS 3679.1": "Australian hot rolled sections and bar", "AS/NZS 3679.2": "Australian welded beams and columns", "AS/NZS 3678": "Australian hot rolled plate",
    "AS/NZS 4130": "Australian polyethylene (PE) pressure pipe", "AS 4087": "Australian flanges for waterworks", "AS 1074": "Australian steel pipe for water, gas and air", "MSS SP-97": "branch outlet fittings (weldolets, sockolets)" };
  const rFull = r => String(r || "").replace(/^SCH(\d+)S$/, "Schedule $1S (stainless wall)").replace(/^SCH(\d+)$/, "Schedule $1").replace(/^STD$/, "Standard wall").replace(/^XS$/, "Extra strong wall").replace(/^XXS$/, "Double extra strong wall")
    .replace(/ RF$/, ", raised face").replace(/ FF$/, ", flat face").replace(/ RJ$/, ", ring joint").replace(/^SDR (\d+)/, "SDR $1 (wall ratio)").replace(/^PN(\d+)/, "PN$1 (pressure rating $1 bar)");
  const mFull = m => String(m || "").replace(/\(CS\)/, "(carbon steel)").replace(/\bGr\b/, "Grade").replace(/\bCNAF\b/, "compressed non asbestos fibre");
  function inFull(it){ const T = type(it), S = std(it), z = sz(it);
    if (!T) return { line: unAbbr([it.desc, it.z, it.r, it.m].filter(Boolean).join(", ")), rows: [["Item", unAbbr(it.desc || "")], ["Size", it.z || ""], ["Part / model", it.part || ""], ["Line class", it.spec || ""]].filter(r => r[1]) };
    const sk = S ? stShort(S.n) : "", sx = Object.keys(STDX).find(k => sk === k || sk.startsWith(k + " ") || sk.includes(k));
    const nm = T.n + (PIPEK.has(T.id) ? [it.mk && MK[it.mk], it.end && EN[it.end]].filter(Boolean).map(x => ", " + x).join("") : "");
    const rows = [["Item", nm], ["Size", it.z ? it.z + (z && z.a ? " (" + z.a + ")" : "") + (z && z.od ? ", " + z.od + " mm outside diameter" : "") : ""], [T.rl || "Rating", rFull(it.r)], ["Material", mFull(it.m)],
      ["Standard", S && !it.sx ? S.n + (sx ? ": " + STDX[sx] : "") : "not given yet"], ["Part / model", it.part || ""], ["Line class", it.spec || ""], ["Stock " + (T.k === "plate" ? "sheet" : "length"), it.L && (T.k === "len" || T.k === "plate") ? (T.k === "len" ? lenTxt(it.L) : String(it.L).replace("x", " x ") + " mm") : ""]].filter(r => r[1]);
    return { line: [nm, it.z && rows[1][1], rFull(it.r), mFull(it.m), S && !it.sx && "to " + S.n].filter(Boolean).join(", "), rows }; }
  /* ---------- the table: one row per item, under thin headings by kind; each pick is a box that only offers what fits ---------- */
  const COLS = [["t", "Item"], ["z", "Size"], ["r", "Rating"], ["m", "Material"], ["s", "Std"], ["spec", "Class"], ["part", "Part"], ["qty", "Qty"], ["notes", "Notes"], ["x", ""]];
  const REQ = new Set(["t", "z", "r", "m", "qty"]);
  /* what a row still needs picked: its item, size, schedule or class, material and quantity (for one typed in: what it is and how many) */
  function missing(it){ const T = type(it), out = []; if (!T){ if (!String(it.desc || "").trim()) out.push("item"); }
    else { if (PIPEK.has(T.id) && (!it.mk || !it.end)) out.push("how it's made and its ends"); if (!it.z) out.push("size"); if (ratings(it).length && !it.r) out.push(T.rl ? T.rl.toLowerCase() : "rating"); if ((std(it) || {}).mats && std(it).mats.length && !it.m) out.push("material"); if (it.sx) out.push("standard"); }
    if (!String(it.qty || "").trim()) out.push("quantity"); return out; }
  const GROUP = it => { const T = type(it); return T ? T.g : "Other"; };
  /* the boxes' lists */
  function choices(it, c){ const T = type(it), S = std(it);
    if (c === "t") return [{ v: "other", t: "Other", sub: "type it in (a valve, a bearing, press fittings)" }].concat(...TYPES.map(x => PIPEK.has(x.id)
      ? ["SMLS", "ERW"].flatMap(mk => ["BE", "PE", "THD"].map(en => ({ v: x.id + "|" + mk + "|" + en, t: SHORT[x.id] + " " + mk + " " + en, sub: x.n + ", " + MK[mk] + ", " + EN[en], g: x.g })))
      : [{ v: x.id, t: SHORT[x.id] || x.n, sub: x.n, g: x.g }]));
    if (!T) return [];
    if (c === "z"){ const seen = new Set(), out = []; [S].concat(T.stds.filter(s => s !== S)).forEach(s => s.sizes.forEach(z => { if (seen.has(z.n)) return; seen.add(z.n); out.push({ v: z.n, t: z.n, sub: [z.a, s !== S ? stShort(s.n) : ""].filter(Boolean).join("  ·  ") }); })); return out; }
    if (c === "r") return ratings(it).map(r => ({ v: r, t: rShort(r), sub: rShort(r) !== r ? r : "" }));
    if (c === "m") return (S.mats || []).map(m => ({ v: m, t: mShort(m), sub: mShort(m) !== m ? m : "" }));
    if (c === "s") return T.stds.filter(s => !it.z || s.sizes.some(z => z.n === it.z)).map(s => ({ v: s.id, t: stShort(s.n), sub: (s.o !== "INT" ? ORIGIN[s.o] + ", " : "") + s.n }));
    if (c === "unit") return (T.units || []).map(u => ({ v: u, t: uShort(u), sub: u }));
    return []; }
  const shown = (it, c) => { const T = type(it), S = std(it);
    if (c === "t") return itemCode(it); if (!T) return c === "unit" ? it.unit || "" : it[c] || "";
    if (c === "z") return zShort(it); if (c === "r") return rShort(it.r); if (c === "m") return mShort(it.m); if (c === "s") return S && !it.sx ? stShort(S.n) : ""; if (c === "unit") return uShort(it.unit); return it[c] == null ? "" : it[c]; };
  const titleOf = (it, c) => { const T = type(it), S = std(it), z = sz(it); return c === "t" ? (T ? T.n : "") : c === "z" ? (z && z.a ? z.a : "") : c === "r" ? it.r || "" : c === "m" ? it.m || "" : c === "s" ? (S ? S.n : "") : ""; };
  let focusNext = null;   // (after a pick, the next box still to fill in on that row)
  function table(a, ro){ const items = a.mto || (a.mto = []); let last = null, n = 0; shorten(items);
    /* the line class and part / model columns only show when a row has one (or a row is typed in, for its part) */
    const hasSpec = items.some(it => it.spec), hasPart = items.some(it => it.part || !type(it));
    const CS = COLS.filter(([c]) => c !== "spec" || hasSpec).filter(([c]) => c !== "part" || hasPart);
    const row = it => { const T = type(it), res = T && pack(it), on = open.has(it.id), many = T && (T.k === "len" || T.k === "plate"), miss = ro ? [] : missing(it), auto = !!res;
      const tg = many ? '<button type="button" class="mt-tg' + (on ? " on" : "") + '" data-tg="' + it.id + '" title="' + (on ? "Hide" : "Show") + ' the pieces to cut">' + (on ? "▾" : "▸") + (cuts(it).length ? '<b>' + cuts(it).reduce((t, c) => t + Math.max(1, Math.round(+c.n || 1)), 0) + '</b>' : "") + '</button>' : "";
      const box = (c, ph, ex) => '<input class="in pt-in mt-pk" data-r="' + it.id + '" data-c="' + c + '" value="' + esc(shown(it, c)) + '" placeholder="' + ph + '" title="' + esc(titleOf(it, c)) + '"' + (ex || "") + (ro ? " readonly" : "") + ' autocomplete="off" spellcheck="false">';
      let h = (GROUP(it) !== last ? '<tr class="mt-grp nosort"><td colspan="' + (CS.length + 1) + '">' + esc(last = GROUP(it)) + '</td></tr>' : "")
        + '<tr data-id="' + it.id + '" class="mt-row' + (on ? " open" : "") + (miss.length ? " mt-part" : "") + '"><td class="pt-no">' + (miss.length ? '<span class="mt-dot" title="Still to pick: ' + esc(miss.join(", ")) + '"></span>' : ++n) + tg + '</td>'
        + '<td class="mt-itd">' + box("t", "Item") + ((T || it.desc) ? '<button type="button" class="mt-ii" data-info="' + it.id + '" title="This item in full, no abbreviations" aria-label="This item in full">' + INFO_I + '</button>' : "") + '</td>'
        + '<td>' + box("z", "Size") + '</td>'
        + '<td>' + (T && !ratings(it).length ? "" : T ? box("r", "Sch") : "") + '</td>'
        + '<td>' + (T ? box("m", "Material") : "") + '</td>'
        + '<td>' + (T ? box("s", "Std", ' data-opt="1"') : "") + '</td>'
        + (hasSpec ? '<td>' + box("spec", "Class") + '</td>' : "") + (hasPart ? '<td>' + box("part", "Part") + '</td>' : "")
        + '<td class="mt-qu"><input class="in pt-in mt-q" data-r="' + it.id + '" data-c="qty" inputmode="decimal" value="' + esc(it.qty || "") + '" placeholder="Qty"' + (ro || auto ? " readonly" : "") + (auto ? ' title="Worked out from the pieces (▸)"' : "") + '>'
          + (T ? box("unit", "", ' data-opt="1"').replace("mt-pk", "mt-pk mt-un") : '<input class="in pt-in mt-u mt-un" data-r="' + it.id + '" data-c="unit" value="' + esc(uShort(it.unit)) + '" placeholder="EA"' + (ro ? " readonly" : "") + '>') + '</td>'
        + '<td><input class="in pt-in" data-r="' + it.id + '" data-c="notes" value="' + esc(it.notes || "") + '"' + (ro ? " readonly" : "") + '></td>'
        + '<td class="mt-ic"><button type="button" class="ic-b sm mt-more' + (it.info ? " on" : "") + '" data-more="' + it.id + '" title="About this item, move it to Spares, or remove it" aria-label="More for this row" aria-haspopup="true">⋯</button></td></tr>';
      if (on && many) h += '<tr class="mt-sub" data-sub="' + it.id + '"><td colspan="' + (CS.length + 1) + '"><div class="mt-subin">' + piecesHtml(it, res, ro) + '</div></td></tr>';
      return h; };
    const blank = ro ? "" : '<tr class="pt-blank"><td class="pt-no"></td><td><input class="in pt-in mt-pk" data-r="new0" data-c="t" placeholder="+ Item" autocomplete="off" spellcheck="false"></td><td colspan="' + (CS.length - 1) + '"></td></tr>';
    return '<div class="mt-wrap"><table class="tbl pt-tbl mt-tbl"><thead><tr><th class="pt-no" data-col="No.">#</th>' + CS.map(([c, n]) => '<th data-col="' + (n || c) + '">' + esc(n) + (REQ.has(c) ? '<span class="mt-rq" title="Needed">*</span>' : "") + '</th>').join("") + '</tr></thead><tbody>'
      + items.map(row).join("") + blank + '</tbody></table></div>'; }

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
    /* the ⋯ at the row's end: about this item (sizes, weight, how the total was worked out, notes), move it to Spares, remove it */
    $$("[data-more]", el).forEach(b => b.onclick = e => { e.stopPropagation(); const it = find(b.dataset.more); if (!it) return;
      if (ro) return info(a, it, b, ro);
      Look.open(b, [{ v: "info", t: "About this item", sub: "sizes, weight, how the total was worked out, notes" }, { v: "mv", t: "Move to Spares" }, { v: "x", t: "Remove this row" }], null, async x => {
        if (x.v === "info") return info(a, it, b, ro);
        if (x.v === "mv"){ Store.mutate(key, () => { const k = items.indexOf(it); if (k >= 0) items.splice(k, 1); it.desc = desc(it); (a.spares || (a.spares = [])).push(it); Store.touch(a); }); note("Moved to Spares (Ctrl+Z to undo)"); Store.log("Moved a part of " + Store.actId(a) + " to Spares"); return; }
        if (await confirmBox("Remove " + (desc(it) || "this row") + " from the MTO?", "Remove", true)) Store.mutate(key, () => { const k = items.indexOf(it); if (k >= 0) items.splice(k, 1); Store.touch(a); }); }); });
    if (ro) return;
    const ORDER = ["t", "z", "r", "m", "qty"];
    /* the next box on the row still to fill in (after a pick, the cursor goes there and its list opens) */
    const after = (id, c) => { const it = find(id); if (!it) return null; const miss = missing(it); if (!miss.length) return null; const from = ORDER.indexOf(c);
      for (const x of ORDER.slice(Math.max(0, from + 1)).concat(ORDER)){ const need = x === "t" ? !type(it) && !String(it.desc || "").trim() : x === "z" ? type(it) && !it.z : x === "r" ? type(it) && ratings(it).length && !it.r : x === "m" ? type(it) && !it.m : !String(it.qty || "").trim(); if (need) return { id, c: x }; } return null; };
    const set = (it, c, v) => { const T = type(it);
      if (c === "t"){ if (v === "other"){ const d = T ? desc(it) : it.desc || ""; ["t", "s", "z", "m", "r", "L", "cuts", "spare"].forEach(k => delete it[k]); it.desc = d; it.unit = it.unit || "ea"; return; }
        const [tv, mk, en] = String(v).split("|"); v = tv; it.t = v; if (mk){ it.mk = mk; it.end = en; } else { delete it.mk; delete it.end; } delete it.sx; const T2 = TY[v], S = T2.stds[0]; it.s = S.id; it.z = ""; delete it.m; delete it.r; it.L = S.lens ? S.defl : undefined; it.unit = T2.units[0]; if (T2.k !== "len" && T2.k !== "plate") delete it.cuts;
        if (S.mats.length === 1) it.m = S.mats[0]; const rs = ratings(it); if (rs.length === 1) it.r = rs[0]; return; }
      if (c === "z"){ const S0 = std(it); let S = S0.sizes.some(z => z.n === v) ? S0 : T.stds.find(s => s.sizes.some(z => z.n === v)) || S0; it.s = S.id; it.z = v;
        if (it.m && !S.mats.includes(it.m)) delete it.m; if (!it.m && S.mats.length === 1) it.m = S.mats[0]; if (S.lens && !S.lens.includes(it.L)) it.L = S.defl;
        const rs = ratings(it); if (it.r && !rs.includes(it.r)) delete it.r; if (!it.r && rs.length === 1) it.r = rs[0]; return; }
      if (c === "s"){ const S = T.stds.find(s => s.id === v); if (!S) return; it.s = S.id; delete it.sx; if (it.z && !S.sizes.some(z => z.n === it.z)) it.z = ""; if (it.m && !S.mats.includes(it.m)) delete it.m; if (S.lens && !S.lens.includes(it.L)) it.L = S.defl; const rs = ratings(it); if (it.r && !rs.includes(it.r)) delete it.r; return; }
      it[c] = v; };
    const save = (id, c, v) => { const isNew = String(id).startsWith("new"); let it = isNew ? { id: uid(), qty: "" } : find(id); if (!it) return;
      Store.mutate(key, () => { set(it, c, v); recalc(it); if (isNew){ const g = GROUP(it), at = items.map(GROUP).lastIndexOf(g); items.splice(at < 0 ? items.length : at + 1, 0, it); } Store.touch(a); });
      Store.log((isNew ? "Added to" : "Edited") + " the MTO of " + Store.actId(a)); focusNext = after(it.id, c) || (isNew || !missing(it).length ? { id: "new0", c: "t", quiet: true } : null); };
    /* the pick boxes: the app's card with what fits; typing narrows it */
    $$(".mt-pk", el).forEach(i => { const r = i.dataset.r, c = i.dataset.c, it = find(r) || { qty: "" }; let key2 = null;
      const free = c === "part" || c === "spec" || (c === "z" && !type(it)) || (c === "t" && !type(it) && it.desc != null && r !== "new0");
      const show = () => { if (free && c !== "t") return; const all = choices(it, c); if (!all.length) return Look.close();
        const q = i.value.trim().toLowerCase(), typed = q && q !== String(shown(it, c)).toLowerCase(), ws = typed ? q.split(/\s+/) : [];
        const list = (ws.length ? all.filter(x => ws.every(w => (x.t + " " + (x.sub || "") + " " + (x.g || "")).toLowerCase().includes(w))) : all).slice(0, 300);
        key2 = Look.open(i, list.length ? list : [{ v: "", t: "Nothing matches" + (c === "t" ? ", press Enter to use it as typed" : ""), dis: true }], c === "t" ? [it.t, it.mk, it.end].filter(Boolean).join("|") : it[c], x => { if (x.v === "") return; i.value = x.t; save(r, c, x.v); App.render(); }); };
      i.onfocus = () => { i.select(); show(); };
      i.oninput = () => { if (free) return; show(); };
      i.onkeydown = e => { if (key2 && /^(ArrowDown|ArrowUp|Escape)$/.test(e.key)) return key2(e);
        if (e.key === "Enter" || e.key === "Tab"){ const v = i.value.trim(); const lit = document.querySelector(".lk-card .lk-o.hi:not(.dis)");
          if (lit && !free){ e.preventDefault(); lit.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); return; }
          if (c === "t" && v && (r === "new0" || !type(it))){ e.preventDefault(); Look.close(); Store.mutate(key, () => { let x = r === "new0" ? null : find(r); if (!x){ x = { id: uid(), desc: v, unit: "ea", qty: "" }; items.push(x); } else x.desc = v; Store.touch(a); focusNext = { id: x.id, c: "qty" }; }); App.render(); return; }
          if (free && v !== String(it[c] || "")){ e.preventDefault(); save(r, c, v); App.render(); } } };
      i.onblur = () => { setTimeout(() => { if (document.activeElement !== i) Look.closeFor(i); }, 150);
        if (free){ const v = i.value.trim(); if (v !== String((c === "t" ? it.desc : it[c]) || "")) { save(r, c === "t" ? "desc" : c, v); } } }; });
    /* quantity, unit (for one typed in) and notes: typed */
    $$(".mt-tbl .pt-in:not(.mt-pk):not(.mt-cin)", el).forEach(i => { const r = i.dataset.r, c = i.dataset.c;
      i.onchange = () => { const v = i.value.trim(), it = find(r); if (!it || String(it[c] == null ? "" : it[c]) === v) return; if (c === "spare"){ Store.mutate(key, () => { it.spare = Math.max(0, Math.round(+v || 0)) || undefined; recalc(it); Store.touch(a); }); return; }
        Store.mutate(key, () => { it[c] = v; recalc(it); Store.touch(a); }); Store.log("Edited the MTO of " + Store.actId(a)); if (c === "qty" && !missing(it).length) focusNext = { id: "new0", c: "t", quiet: true }; };
      i.onkeydown = e => { if (e.key === "Enter"){ e.preventDefault(); i.blur(); } }; });
    /* after a pick: the next box still to fill in on that row */
    if (focusNext){ const f = focusNext; focusNext = null; const t = $('.mt-tbl [data-r="' + f.id + '"][data-c="' + f.c + '"]', el); if (t) setTimeout(() => { t.focus(); if (f.quiet) Look.closeFor(t); }, 0); }
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
    if (T){ if (S && S.o !== "INT") facts.push(["Made to", ORIGIN[S.o] + " standard"]);
      if (z && z.r && z.r[it.r]) { facts.push(["Wall", z.r[it.r].t + " mm"]); if (z.r[it.r].pn) facts.push(["Pressure rating", z.r[it.r].pn]); }
      if (z && z.d && !z.od) facts.push(["Size", [z.d && "depth " + z.d, z.b && "width " + z.b, z.t && "thickness " + z.t, z.tf && "flange " + z.tf, z.tw && "web " + z.tw].filter(Boolean).join(", ") + " mm"]);
      if (z && z.g) facts.push(["Grades made", z.g.join(", ")]);
      if (z && z.bolts){ const cls = Object.keys(z.bolts).find(c => String(it.r || "").startsWith(c)); if (cls && z.bolts[cls]) facts.push(["Bolting", z.bolts[cls] + " (ASME B16.5 " + cls + ")"]); }
      if (k) facts.push(["Mass", "about " + k + (T.k === "plate" ? " kg/m²" : " kg/m")]);
      if (S && S.note) facts.push(["Note", S.note]); }
    const p = document.createElement("div"); p.className = "pop mt-pop";   // (in full first, then the sizes, weight and how the total was worked out)
    const F = inFull(it);
    p.innerHTML = '<b>' + esc(desc(it) || "Item") + '</b><p class="mt-full">' + esc(F.line) + '</p><dl class="mt-fl">' + F.rows.map(([t, v]) => '<dt>' + esc(t) + '</dt><dd>' + esc(v) + '</dd>').join("") + '</dl>' + (facts.length ? '<dl>' + facts.map(([t, v]) => '<dt>' + esc(t) + '</dt><dd>' + esc(v) + '</dd>').join("") + '</dl>' : "")
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

  /* the short form for rows saved before it (in memory only: they save that way at their next change) */
  const seen = new WeakSet(); function shorten(list){ (list || []).forEach(it => { if (!it || seen.has(it)) return; seen.add(it); if (type(it)) it.desc = desc(it); }); }
  /* a line from the AI (item, size, rating, material, standard, qty, unit, notes) as a row: matched to the library where
     it can be, the rest left to pick (the row shows its yellow dot); an item not in the library is typed in as it came */
  const norm = x => String(x || "").toUpperCase().replace(/\s+/g, " ").replace(/[×]/g, "X").trim();
  function fromAi(p){ p = p.map(x => (x || "").trim());
    /* ITEM | SIZE | RATING | MATERIAL | STANDARD | CLASS | PART | QTY | UNIT | NOTES (an older reply without CLASS and PART has 8) */
    const [ci, cz, cr, cm, cs, cc, cp, cq, cu, cn0] = p.length >= 10 ? p : [p[0], p[1], p[2], p[3], p[4], "", "", p[5], p[6], p[7]];
    let cn = cn0 || ""; const it = { qty: String(cq || "").replace(/[^\d.]/g, ""), notes: "", spec: cc || undefined, part: cp || undefined };
    const U = { EA: "ea", M: "m", LG: "lengths", SHT: "sheets", KG: "kg", SET: "sets", M2: "m2", PR: "pairs" };
    const plainRow = () => { const press = /press/i.test(cn) && !/press/i.test(ci); it.desc = [press ? "PRESS " + ci : ci, cz, cr, cm, cs].filter(Boolean).join(" "); it.notes = press ? cn.replace(/,?\s*press connector\s*,?/i, " ").trim() : cn; it.unit = U[norm(cu)] || String(cu || "").toLowerCase() || "ea"; return it; };
    /* press fit, grooved, compression or a maker's own system: not a library fitting, written as it came, with its model */
    if (/press|groov|compression|victaulic|viega|crimp|push.?fit|proprietary/i.test([ci, cn, cp].join(" "))) return plainRow();
    /* pipe: how it's made and its ends, from the item or the notes (SMLS, PE), go into the item */
    const toks = norm(ci).split(" "); let mk = toks.find(t => MK[t]), en = toks.find(t => EN[t]);
    if (/^PIPE\b/.test(norm(ci))){ const nt = norm(cn).split(/[\s,]+/); mk = mk || nt.find(t => MK[t]); en = en || nt.find(t => EN[t]); cn = cn.split(/[\s,]+/).filter(t => !(MK[t.toUpperCase()] || EN[t.toUpperCase()])).join(" ").trim(); }
    const base = toks.filter(t => !MK[t] && !EN[t]).join(" ");
    /* sizes compared without spaces or the section's letters: 150x75 finds 150PFC, M16x200 finds M16 x 200, 16 finds 16 mm */
    const key = x => norm(x).replace(/\s+/g, "").replace(/(PFC|EA|UA|SHS|RHS|CHS|UB|UC|WB|TFB|MM)$/, ""), kz = key(cz), kd = kz.replace(/^DN/, "").replace(/^(\d+)$/, "DN$1"), kf = kz.split("X")[0];
    const sizeIn = s => s.sizes.find(x => { const k = key(x.n); return k === kz || k === kd || (x.a && key(x.a) === kz); }) || s.sizes.find(x => kf && /^\d+$/.test(key(x.n)) && key(x.n) === kf);
    let cands = TYPES.filter(t => norm(SHORT[t.id]) === base); if (!cands.length) cands = TYPES.filter(t => base.startsWith(norm(SHORT[t.id]) + " ") || norm(t.n) === base);
    const score = t => t.stds.reduce((best, st) => Math.max(best, (cs && norm(stShort(st.n)) === norm(cs) ? 2 : 0) + (cm && (st.mats || []).some(x => norm(mShort(x)) === norm(cm) || norm(x).includes(norm(cm))) ? 2 : 0) + (sizeIn(st) ? 1 : 0)), 0);
    const T = cands.sort((x, y) => score(y) - score(x))[0];
    if (!T) return plainRow();
    it.t = T.id; if (PIPEK.has(T.id)){ if (mk) it.mk = mk; if (en) it.end = en; }
    const S = T.stds.find(st => cs && norm(stShort(st.n)) === norm(cs) && sizeIn(st)) || T.stds.find(st => sizeIn(st)) || T.stds.find(st => cs && norm(stShort(st.n)) === norm(cs)) || T.stds[0], z = sizeIn(S);
    it.s = S.id; if (z) it.z = z.n; it.L = S.lens ? S.defl : undefined;
    /* a fitting, flange, gasket or bolt with no standard given: the standard is left to pick, never filled in */
    if (!cs && /fittings|Flanges|Gaskets|Bolting/i.test(T.g)) it.sx = true;
    const rs = ratings(it), r = rs.find(x => norm(rShort(x)) === norm(cr) || norm(x) === norm(cr)); if (r) it.r = r; else if (rs.length === 1) it.r = rs[0];
    const ms = S.mats || [], mm = ms.find(x => norm(mShort(x)) === norm(cm) || norm(x) === norm(cm)) || (cm && ms.find(x => norm(x).includes(norm(cm)))); if (mm) it.m = mm; else if (ms.length === 1) it.m = ms[0];
    it.unit = U[norm(cu)] && (T.units || []).includes(U[norm(cu)]) ? U[norm(cu)] : T.units[0];
    /* plate asked for as pieces (290 x 290, qty 1): the pieces go in its cut list, and the sheets it needs are worked out from them */
    if (T.k === "plate"){ const d = String(cn).match(/(\d{2,5})\s*(?:mm)?\s*[x×]\s*(\d{2,5})/i); if (d){ it.cuts = [{ id: uid(), l: +d[1], w: +d[2], n: Math.max(1, Math.round(+it.qty || 1)) }]; cn = cn.replace(d[0], "").replace(/^[\s,]*(mm)?[\s,]*|[\s,]+$/g, ""); it.unit = "sheets"; } }
    it.notes = cn; return it; }
  /* put a new row with the others of its kind, so each heading shows once */
  function place(items, it){ const g = GROUP(it), at = items.map(GROUP).lastIndexOf(g); items.splice(at < 0 ? items.length : at + 1, 0, it); }
  const codes = () => [...new Set(TYPES.map(t => SHORT[t.id]).filter(Boolean))];
  return { table, wire, recalc, desc, pack, explain, needsCut, cutList, info, TY, shorten, missing, fromAi, codes, place };
})();
