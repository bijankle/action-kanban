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
  const CHEV = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 2l3 3-3 3"/></svg>';
  const WARN = '<svg width="14" height="13" viewBox="0 0 14 13"><path d="M7 1L13 12H1z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M7 5v3.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="7" cy="10.1" r=".85" fill="currentColor"/></svg>';
  const open = new Set();   // rows with their piece list showing
  const openG = new Set();   // steel parents with their cuts showing (closed when the app opens)
  const rules = () => Object.assign({ kerf: 3, keep: 300, green: 0 }, (Store.S.config || {}).cut || {});   // (green: the length left on a new piece for trimming to fit on site, mm)
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
    /* (a piece takes its length plus its green, the extra left on it to trim to fit on site) */
    cuts(it).forEach(c => { const g = Math.max(0, +c.g || 0); for (let i = 0; i < Math.max(1, Math.round(+c.n || 1)); i++) (+c.l + g > L ? long : ps).push({ l: +c.l, g, t: +c.l + g, mk: c.mk || "" }); });
    ps.sort((a, b) => b.t - a.t); const bars = [];
    ps.forEach(p => { let b = bars.find(b => b.used + (b.ps.length ? kerf : 0) + p.t <= L + 1e-6); if (!b){ b = { ps: [], used: 0 }; bars.push(b); } b.used += (b.ps.length ? kerf : 0) + p.t; b.ps.push(p); });
    bars.forEach(b => { const left = L - b.used; b.off = left > kerf ? left - kerf : 0; b.keep = b.off >= keep; });
    return { kind: "len", L, bars, long, pieces: ps.length, need: ps.reduce((t, p) => t + p.t, 0), green: ps.reduce((t, p) => t + p.g, 0) }; }
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
  /* (a piece longer than a stock length is counted as the lengths it takes joined end to end, so the order covers it) */
  const stockN = res => res ? (res.kind === "len" ? res.bars.length + (res.long || []).reduce((t, p) => t + Math.ceil(p.t / res.L), 0) : res.sheets.length) : 0;
  const n1 = x => +(+x).toFixed(x < 10 ? 2 : 1);
  /* the row's quantity from its pieces, in its unit */
  function total(it, res){ const n = stockN(res) + Math.max(0, Math.round(+it.spare || 0)), k = kg(it);
    if (res.kind === "len"){ const m = n * res.L / 1000; return it.unit === "lengths" ? n : it.unit === "kg" ? (k ? Math.ceil(m * k) : "") : n1(m); }
    const a = n * res.sh.l * res.sh.w / 1e6; return it.unit === "m2" ? n1(a) : it.unit === "kg" ? (k ? Math.ceil(a * k) : "") : n; }
  /* what's ordered: the quantity needed plus the spares (a row cut from stock lengths or sheets: its spare lengths or sheets are already in its quantity) */
  const nq = v => { const x = parseFloat(String(v == null ? "" : v).replace(/,/g, "")); return isFinite(x) ? x : 0; };
  const need = it => { const res = pack(it); return res ? String(total(Object.assign({}, it, { spare: 0 }), res)) : it.qty || ""; };
  const spareOf = it => pack(it) ? Math.max(0, Math.round(+it.spare || 0)) || "" : it.sq || "";
  /* the spare a row gets by itself (File, Parameters, MTO spares): a share of the quantity by heading, rounded up */
  function autoSpare(it){ const q = nq(it.qty); if (!(q > 0)) return ""; const g = GROUP(it), n = isSpec(it) ? (PipeSpec.U(it.cl) === "OD" ? it.dn * 50 / 63 : it.dn) : parseFloat(String(it.z || "").replace(/^DN/i, "")) || 0, sb = n > 0 && n <= 50;
    const k = { Pipes: sb ? "spPipeSB" : "spPipe", Fittings: sb ? "spFitSB" : "spFit", Flanges: "spFlg", Gaskets: "spGk", Bolts: "spBolt", Valves: "spValve", "Instruments and control valves": "spInst", Structural: "spSteel", Bar: "spSteel", "Plate and sheet": "spPlate" }[g], pc = k ? +pref(k) || 0 : 0;
    if (!pc) return ""; const x = q * pc / 100, m = String(it.unit || "").toLowerCase() === "m"; return String(m ? Math.ceil(x * 10) / 10 : Math.ceil(x)); }
  const spareTip = it => { const v = autoSpare(it); return v ? "Worked out: " + v + " (File, Parameters, MTO spares). Type over it to change it" : "Spares on top of the quantity needed"; };
  function ord(it){ if (pack(it)) return it.qty || ""; if (!String(it.qty || "").trim() && !String(it.sq || "").trim()) return ""; return String(+(nq(it.qty) + nq(it.sq)).toFixed(3)); }
  /* after any change: the quantity (when the pieces set it) and the description */
  function recalc(it){ if (!type(it)) return; const res = pack(it); if (res) it.qty = String(total(it, res)); it.desc = desc(it); }

  /* ---------- how a total was worked out, in words ---------- */
  const mm = x => Math.round(x).toLocaleString() + " mm", m_ = x => n1(x / 1000) + " m";
  function explain(it, res){ if (!res) return ""; const { kerf, keep } = rules(), sp = Math.max(0, Math.round(+it.spare || 0)), k = kg(it);
    if (res.kind === "len"){ const n = res.bars.length, N = stockN(res), keepO = res.bars.filter(b => b.off && b.keep), scrap = res.bars.filter(b => b.off && !b.keep);
      return res.pieces + " piece" + (res.pieces === 1 ? "" : "s") + ", " + m_(res.need) + " in all" + (res.green ? " (with " + mm(res.green) + " of green for site trimming)" : "") + ". They fit on " + n + " × " + lenTxt(res.L) + " length" + (n === 1 ? "" : "s") + " with a " + kerf + " mm saw cut between pieces"
        + (N > n ? ", plus " + (N - n) + " for the piece" + (res.long.length === 1 ? "" : "s") + " longer than a stock length (below)" : "") + (sp ? ", plus " + sp + " spare length" + (sp === 1 ? "" : "s") : "") + ", so " + (N + sp) + " × " + lenTxt(res.L) + " = " + m_((N + sp) * res.L) + " to order."
        + (keepO.length ? " Offcuts kept (" + keep + " mm or more): " + keepO.map(b => mm(b.off)).join(", ") + "." : "") + (scrap.length ? " Scrap: " + scrap.map(b => mm(b.off)).join(", ") + "." : "")
        + (k ? " Weight about " + Math.round((N + sp) * res.L / 1000 * k).toLocaleString() + " kg (" + k + " kg/m)." : "")
        + (res.long.length ? " " + res.long.length + " piece" + (res.long.length === 1 ? " is" : "s are") + " longer than a stock length (" + res.long.map(p => mm(p.l)).join(", ") + "), so " + (res.long.length === 1 ? "it needs" : "they need") + " a joint or a longer stock length: " + (res.long.length === 1 ? "it is" : "they are") + " counted as " + res.long.map(p => Math.ceil(p.t / res.L) + " lengths joined").join(", ") + "." : ""); }
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
    .replace(/^Hot dip galvanised$/, "HDG").replace(/^Cold galvanised \(zinc rich paint\)$/, "COLD GALV").replace(/^Zinc plated$/, "ZP").replace(/^Galvanised$/, "GALV").replace(/^PTFE coated \(Xylan\)$/, "PTFE CTD").replace(/^Sockolet /, "SOL ").replace(/^Threadolet /, "TOL ").replace(/^Weldolet /, "WOL ");
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
    F: "female", M: "male", SMLS: "seamless", ERW: "electric resistance welded", BE: "bevelled ends", PE: "plain ends", THD: "threaded", TOE: "threaded one end", HDG: "hot dip galvanised", "COLD GALV": "cold galvanised (zinc rich paint)", GALV: "galvanised", SS: "stainless steel", CS: "carbon steel",
    ELB: "elbow", LR: "long radius", SR: "short radius", CPLG: "coupling", NIP: "nipple", FLG: "flange", WN: "weld neck", SO: "slip on", BL: "blind", RF: "raised face", FF: "flat face", GK: "gasket", SPWD: "spiral wound", HB: "hex bolt", SB: "stud bolt", PL: "plate", FLT: "flat bar", PFC: "parallel flange channel", EA: "equal angle", SHS: "square hollow section", RHS: "rectangular hollow section", CHS: "circular hollow section", "U-BOLT": "U bolt", TAG: "tag" };
  const unAbbr = t => String(t || "").split(/(\s+|,)/).map(w => ABBR[w.toUpperCase()] ? ABBR[w.toUpperCase()] : w).join("");
  /* a spec row in the same short MTO form, in capitals: item, size, type, ends, material, standard, then the class (the (i) has it in full).
     The spec's own words are shortened the usual way; "manufacturer's standard" is left out (it says nothing a supplier needs) */
  const SPW = [[/\bstreet elbow\b/gi, "ST ELB"], [/\belbow\b/gi, "ELB"], [/(\d+)°/g, "$1"], [/\bshort radius\b/gi, "SR"], [/\blong radius\b/gi, "LR"], [/\btees?\b/gi, "TEE"], [/\bequal\b/gi, "EQ"], [/\breducing\b/gi, "RED"], [/\breducer\b/gi, "RED"],
    [/\bconcentric\b/gi, "CONC"], [/\beccentric\b/gi, "ECC"], [/\bcoupling\b/gi, "CPLG"], [/\bsliding\b/gi, "SLDG"], [/\bstandard\b(?! *$)/gi, "STD"], [/\bflange\b/gi, "FLG"], [/\bblind\b/gi, "BL"], [/\bslip-on\b/gi, "SO"], [/\bweld neck\b/gi, "WN"], [/\bada[pt][tp]er\b|\badaptor\b/gi, "ADPT"],
    [/\bnipple\b/gi, "NIP"], [/\bgaskets?\b/gi, "GK"], [/\bstud bolts?\b/gi, "STUD"], [/\bhex nut\b/gi, "NUT"], [/\bhex head\b/gi, "HEX HD"], [/\bflanges\b/gi, "FLGS"], [/\bthick\b/gi, "THK"], [/\bto suit piping class\b/gi, "TO SUIT"], [/\bmachine bolts?\b/gi, "MACH BOLT"], [/\bnuts\b/gi, "NUT"], [/\bhex head bushing\b/gi, "HEX BUSH"], [/\bhex head plug\b/gi, "HEX PLUG"], [/\(fabricated\)|\bfabricated\b/gi, "FAB"],
    [/\bplain ends?\b/gi, "PE"], [/\bbevelled ends?\b|\bbevelled\b/gi, "BE"], [/\bpress connector\b/gi, "PRESS"], [/\bsocket weld\b/gi, "SW"], [/\braised face\b/gi, "RF"], [/\belectrofusion sockets?\b/gi, "EF SKT"], [/\bthreaded\b/gi, "THD"],
    [/\bfemale\b/gi, "F"], [/\bmale\b/gi, "M"], [/\bseamless\b/gi, "SMLS"], [/\bsch (\d+\w*)/gi, "SCH$1"], [/\bhot dip(ped)? galvanised\b/gi, "HDG"], [/\bgalvanised\b/gi, "GALV"], [/\bstainless steel\b/gi, "SS"], [/\bcarbon steel\b/gi, "CS"], [/\bmodel\b/gi, "MDL"],
    [/\bASTM /g, ""], [/\bASME /g, ""], [/\bGr\.? /g, "GR "], [/\bmanufacturers?'?s? (std|standard)\b/gi, ""]];
  const spShort = t => { let o = PipeSpec.clean(t); SPW.forEach(([re, w]) => o = o.replace(re, w)); return o.replace(/\s*,\s*/g, " ").replace(/\s+/g, " ").trim().toUpperCase(); };
  function specShort(it){ const R = specRes(it), L = n => PipeSpec.lab(it.cl, n), dn = it.dn ? L(it.dn) + (it.dn2 && PipeSpec.reducing(it.it) ? (it.dn2 === it.dn ? " EQUAL" : " X " + L(it.dn2)) : "") : "";
    if (R.bolt || R.g) return spShort(R.line) + (R.chk ? " (CHECK)" : "");
    if (R.v){ const V = k => (R.rows.find(x => x[0] === k) || [, ""])[1], typ = spShort(PipeSpec.clean(V("Type")).replace(/\s+-\s+/, ", ")).replace(/\bBALL VALVE\b/, "BV").replace(/\bGATE VALVE\b/, "GV").replace(/\bGLOBE VALVE\b/, "GLV").replace(/\bBUTTERFLY VALVE\b/, "BFV").replace(/\bCHECK VALVE\b/, "CV").replace(/\bFULL BORE\b/, "FB").replace(/\b3 PIECE BODY\b/, "3PC");
      return [typ, dn, spShort(R.auto), V("Body") && "BODY " + spShort(V("Body")), V("Seats") && "SEATS " + spShort(V("Seats")), spShort(V("Made by")), "TO DATASHEET " + R.v, it.cl].filter(Boolean).join(" "); }
    if (R.g) return ["GK", dn, R.g, it.cl].filter(Boolean).join(" ");
    if (!R.c) return [it.cl, dn, it.it && itName(it.it)].filter(Boolean).join(" ").toUpperCase();
    const c = R.c, seen = new Set(); return [spShort(c.d), dn, spShort(c.type), spShort(c.ends), spShort(c.mat), spShort(c.dim)].concat(R.extra || [], [it.cl]).filter(x => x && !seen.has(x) && seen.add(x)).join(" "); }
  /* a spec row's details in the table: everything its short form says after the item and size (type, ends, material, standard,
     lining, finish), so what shows on the MTO is what the supplier is asked for */
  function specDetail(it){ const s = specShort(it), L = n => PipeSpec.lab(it.cl, n), z = (L(it.dn) + (it.dn2 && PipeSpec.reducing(it.it) ? (it.dn2 === it.dn ? " EQUAL" : " X " + L(it.dn2)) : "")).toUpperCase(), i = s.indexOf(z);
    return (i >= 0 ? s.slice(i + z.length) : s).replace(/^\s*GK\s+/, "").replace(new RegExp("\\s*" + String(it.cl).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"), "").trim(); }
  /* the short form, used on the MTO, the RFQ and the exports: item, size, rating, material, standard, stock length */
  function desc(it){ if (isSpec(it)) return specShort(it);
    const T = type(it), S = std(it); if (!T) return it.desc || "";
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
  function inFull(it){ if (isSpec(it)){ const R = specRes(it); return { line: R.line || "Still to pick: " + missing(it).join(", "), rows: R.rows || [] }; }
    const T = type(it), S = std(it), z = sz(it);
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
  function missing(it){ if (isSpec(it) && !PipeSpec.ready()) return [];   // (until the spec has loaded, nothing is known to be missing: no yellow while it loads)
    if (isSpec(it)){ const R = specRes(it), out = R.need ? [R.need] : []; if (!String(it.qty || "").trim()) out.push("quantity"); return out; }
    const T = type(it), out = []; if (it.cl === "N/A" && !T && it.desc == null){ if (!it.z) out.push("size"); out.push("item"); if (!String(it.qty || "").trim()) out.push("quantity"); return out; } if (!T){ if (!String(it.desc || "").trim()) out.push("item"); }
    else { if (PIPEK.has(T.id) && (!it.mk || !it.end)) out.push("how it's made and its ends"); if (!it.z) out.push("size"); if (ratings(it).length && !it.r) out.push(T.rl ? T.rl.toLowerCase() : "rating"); if ((std(it) || {}).mats && std(it).mats.length && !it.m) out.push("material"); if (it.sx) out.push("standard"); }
    if (!String(it.qty || "").trim()) out.push("quantity"); return out; }
  /* piping (to a class of the pipe spec, or N/A: the general library) sits in its own table above the steel and the rest */
  const PIPEG = new Set(["Pipe and tube", "Pipe fittings", "Flanges", "Gaskets", "Bolting"]);
  const isSpec = it => !!it.cl && it.cl !== "N/A";
  const isPipe = it => isSpec(it) || it.cl === "N/A" || !!it.cat || (!!type(it) && PIPEG.has(type(it).g));
  /* the headings of a typical MTO: piping first, then the steel and the rest */
  const HEADS = ["Pipes", "Flanges", "Fittings", "Valves", "Gaskets", "Bolts", "Instruments and control valves", "Specials", "Structural", "Bar", "Plate and sheet", "Other"];
  const LIBH = { "Pipe and tube": "Pipes", "Pipe fittings": "Fittings", Flanges: "Flanges", Gaskets: "Gaskets", Bolting: "Bolts" };
  const CATS = { inst: "Instruments and control valves", spec: "Specials" };
  function GROUP(it){ if (it.cat) return CATS[it.cat] || "Specials";
    if (isSpec(it)){ const v = it.it || ""; return /^V:/.test(v) ? "Valves" : /^G:/.test(v) ? "Gaskets" : /^pipe|^tube/i.test(v) ? "Pipes" : /flange|plate, blind/i.test(v) ? "Flanges" : /gasket/i.test(v) ? "Gaskets" : /bolt|stud|nut/i.test(v) ? "Bolts" : v ? "Fittings" : "Pipes"; }
    const T = type(it); if (T) return LIBH[T.g] || T.g; return it.cl === "N/A" ? "Specials" : "Other"; }
  const order = items => items.map((it, i) => [HEADS.indexOf(GROUP(it)), i, it]).sort((x, y) => (x[0] < 0 ? 99 : x[0]) - (y[0] < 0 ? 99 : y[0]) || x[1] - y[1]).map(x => x[2]);
  const specRes = it => PipeSpec.resolve(it);
  /* instruments and control valves, from the plant lists (the instrument index and the control valve list): each type with the makes and
     models it is bought as, most used first, and each tag, so a tag typed in fills in its type, make and model */
  const CVT = { XV: "On/off valve", FCV: "Flow control valve", PCV: "Pressure control valve", LCV: "Level control valve", TCV: "Temperature control valve", DCV: "Density control valve", SV: "Solenoid valve", PRV: "Pressure relief valve", PSV: "Pressure safety valve", HV: "Hand valve with feedback", BDV: "Blowdown valve" };
  const NOTI = /^(soft tag|signal|dry contact|tags reserved.*|spare|)$/i, NOMM = /^(tba|tbc|vta|n\/a|na|-|tags reserved.*|)$/i;
  let INS = null, INSof = null;
  function inst(){ const d = Equip.raw(); if (!d || !d.data) return null; if (INS && INSof === d) return INS; INSof = d;
    const T = new Map(), tags = new Map(), add = (g, ty, mk, md, tag, ex) => { ty = String(ty || "").trim(); if (!ty || NOTI.test(ty)) return;
      const k = ty.toLowerCase(); if (!T.has(k)) T.set(k, { t: ty, g, n: 0, mm: new Map(), sz: new Map() }); const e = T.get(k); e.n++;
      const dn = parseInt(String((ex || {}).sz || "").replace(/^DN\s*/i, ""), 10); if (PipeSpec.DNS.includes(dn)) e.sz.set(dn, (e.sz.get(dn) || 0) + 1);
      mk = String(mk || "").trim(); md = String(md || "").trim(); const good = !NOMM.test(mk) || !NOMM.test(md), m = [NOMM.test(mk) ? "" : mk, NOMM.test(md) ? "" : md].filter(Boolean).join(" ");
      if (good && m){ e.mm.set(m, (e.mm.get(m) || 0) + 1); } if (tag) tags.set(String(tag).toUpperCase(), { tag, ty, m: good ? m : "", g, ...ex }); };
    const F = t => ((d.types || {})[t] || { f: [] }).f, ix = (t, n) => F(t).indexOf(n);
    const fi = { ty: ix("ins", "Instrument type"), mk: ix("ins", "Make"), md: ix("ins", "Model"), cn: ix("ins", "Process connection"), ds: ix("ins", "Description"), sz: ix("ins", "Valve size") };
    (d.data.ins || []).forEach(r => add("Instruments", r[fi.ty], r[fi.mk], r[fi.md], r[0], { cn: r[fi.cn] || "", ds: r[fi.ds] || "", sz: fi.sz >= 0 ? r[fi.sz] || "" : "" }));
    const fv = { ty: ix("cv", "Valve type"), mk: ix("cv", "Valve make"), md: ix("cv", "Valve model"), sz: ix("cv", "Valve size (mm)"), ds: ix("cv", "Location") };
    (d.data.cv || []).forEach(r => { const c = String(r[fv.ty] || "").trim().toUpperCase(); add("Control valves", CVT[c] ? CVT[c] + " (" + c + ")" : c, r[fv.mk], r[fv.md], r[0], { sz: r[fv.sz] || "", ds: r[fv.ds] || "" }); });
    const types = [...T.values()].map(e => ({ t: e.t, g: e.g, n: e.n, mm: [...e.mm].sort((x, y) => y[1] - x[1]), sz: e.sz })).sort((x, y) => x.g.localeCompare(y.g) || y.n - x.n);
    return INS = { types, tags }; }
  const instType = t => { const L = inst(); return L && L.types.find(x => x.t.toLowerCase() === String(t || "").trim().toLowerCase()); };
  const isInst = it => it.cat === "inst";
  /* the boxes' lists */
  function choices(it, c, q){
    if (isInst(it) && c === "t"){ const L = inst(); if (!L){ if (!Equip.raw()) Equip.load().then(() => App.render()); return []; }
      const out = L.types.map(x => ({ v: "ity:" + x.t, t: x.t, sub: x.g + ", " + x.n + " in the plant lists", g: x.g }));
      const qq = String(q || "").replace(/[\s-]/g, "").toUpperCase(); if (qq.length >= 3){ const hits = []; for (const [k, x] of L.tags){ if (k.replace(/[\s-]/g, "").includes(qq)){ hits.push({ v: "tag:" + k, t: x.tag, sub: [x.ty, x.m, x.ds].filter(Boolean).join(", "), g: "Tags", tagHit: 1 }); if (hits.length > 40) break; } } return hits.concat(out); }
      return out; }
    /* an instrument's or control valve's size: the standard DN sizes, the ones that type comes in on the plant lists first */
    if (isInst(it) && c === "z"){ const e = instType(it.desc), used = e ? [...e.sz].sort((x, y) => y[1] - x[1]) : [], u = new Set(used.map(x => x[0]));
      /* in size order: each size the plant has that type in says how many tags; the non-preferred sizes (DN32, DN65, DN90, DN125) only when the plant has one */
      const np = PipeSpec.nonPrefDN(), cnt = new Map(used); return [...new Set(PipeSpec.DNS.filter(n => !np.has(n)).concat([...cnt.keys()]))].sort((x, y) => x - y)
        .map(n => ({ v: "DN" + n, t: "DN" + n, sub: cnt.has(n) ? cnt.get(n) + " " + (cnt.get(n) === 1 ? "tag" : "tags") + " of this type in the plant lists" + (np.has(n) ? ", a non-preferred size" : "") : "" })); }
    if (isInst(it) && c === "part"){ const e = instType(it.desc); return e ? e.mm.map(([m, n]) => ({ v: m, t: m, sub: n + " " + (n === 1 ? "tag" : "tags") + " in the plant lists" })) : []; }
    if (c === "cl") return [{ v: "N/A", t: "N/A", sub: "not to a piping class: the general choices", g: "Not to a class" }, { v: "cat:inst", t: "Instrument or control valve", sub: "from the instrument index and the control valve list", g: "Not to a class" }]
      .concat(PipeSpec.classes().map(x => ({ v: x, t: x, sub: PipeSpec.title(x).slice(0, 110), g: PipeSpec.family(x) })).sort((x, y) => PipeSpec.FAMS.indexOf(x.g) - PipeSpec.FAMS.indexOf(y.g))); const T = type(it), S = std(it);
    if (c === "dn") return PipeSpec.sizes(it.cl).map(n => ({ v: n, t: PipeSpec.lab(it.cl, n), sub: [PipeSpec.U(it.cl) === "OD" && PipeSpec.dnOf(it.cl, n) ? "DN" + PipeSpec.dnOf(it.cl, n) + " flanges and valves" : "", PipeSpec.nonPref(it.cl, n) ? "non-preferred size" : ""].filter(Boolean).join(", ") }));
    if (c === "dn2") return PipeSpec.branches(it.cl, it.dn, it.it).map(x => ({ v: x.v, t: x.t, sub: x.sub, dis: x.dis }));
    if (c === "it") return PipeSpec.items(it.cl, it.dn).map(x => ({ v: x.v, t: x.t, sub: x.sub || "", g: x.g }));
    if (c === "vt") return (specRes(it).vs || []).map(x => ({ v: x.v, t: x.t }));
    /* N/A piping: the size first (DN), then the library's piping kinds that come in it */
    if (it.cl === "N/A" && c === "z" && !T) return PipeSpec.DNS.map(n => ({ v: "DN" + n, t: "DN" + n }));
    if (it.cl === "N/A" && c === "t") return TYPES.filter(x => PIPEG.has(x.g) && (!it.z || x.stds.some(st => st.sizes.some(z => z.n === it.z)))).flatMap(x => PIPEK.has(x.id)
      ? ["SMLS", "ERW"].flatMap(mk => ["BE", "PE", "THD"].map(en => ({ v: x.id + "|" + mk + "|" + en, t: SHORT[x.id] + " " + mk + " " + en, sub: x.n + ", " + MK[mk] + ", " + EN[en], g: x.g })))
      : [{ v: x.id, t: SHORT[x.id] || x.n, sub: x.n, g: x.g }]).concat([{ v: "cat:inst", t: "Instrument or control valve", sub: "from the plant lists, or type it in", g: "Type it in" }, { v: "cat:spec", t: "Special", sub: "type it in (a strainer, a hose, an expansion joint)", g: "Type it in" }, { v: "other", t: "Other", sub: "type it in", g: "Type it in" }]);
    if (c === "t") return [{ v: "other", t: "Other", sub: "type it in (a bearing, a motor)" }].concat(...TYPES.filter(x => !PIPEG.has(x.g) || type(it) === x).map(x => PIPEK.has(x.id)
      ? ["SMLS", "ERW"].flatMap(mk => ["BE", "PE", "THD"].map(en => ({ v: x.id + "|" + mk + "|" + en, t: SHORT[x.id] + " " + mk + " " + en, sub: x.n + ", " + MK[mk] + ", " + EN[en], g: x.g })))
      : [{ v: x.id, t: SHORT[x.id] || x.n, sub: x.n, g: x.g }]));
    if (!T) return [];
    if (c === "z"){ const seen = new Set(), out = []; [S].concat(T.stds.filter(s => s !== S)).forEach(s => s.sizes.forEach(z => { if (seen.has(z.n)) return; seen.add(z.n); out.push({ v: z.n, t: z.n, sub: [z.a, s !== S ? stShort(s.n) : ""].filter(Boolean).join("  ·  ") }); })); return out; }
    if (c === "r") return ratings(it).map(r => ({ v: r, t: rShort(r), sub: rShort(r) !== r ? r : "" }));
    if (c === "m") return (S.mats || []).map(m => ({ v: m, t: mShort(m), sub: mShort(m) !== m ? m : "" }));
    if (c === "s") return T.stds.filter(s => !it.z || s.sizes.some(z => z.n === it.z)).map(s => ({ v: s.id, t: stShort(s.n), sub: (s.o !== "INT" ? ORIGIN[s.o] + ", " : "") + s.n }));
    if (c === "unit") return (T.units || []).map(u => ({ v: u, t: uShort(u), sub: u }));
    return []; }
  const itName = v => !v ? "" : /^V:/.test(v) ? v.slice(2) : /^G:/.test(v) ? "Gasket " + v.slice(2) : v;
  const shown = (it, c) => { const T = type(it), S = std(it);
    if (c === "cl") return it.cl || ""; if (c === "dn") return PipeSpec.lab(it.cl, it.dn); if (c === "dn2") return it.dn2 ? (it.dn2 === it.dn ? "equal" : "x " + PipeSpec.lab(it.cl, it.dn2)) : ""; if (c === "it") return itName(it.it); if (c === "vt") return it.vt || "";
    if (c === "t") return itemCode(it); if (!T) return c === "unit" ? it.unit || "" : it[c] || "";
    if (c === "z") return zShort(it); if (c === "r") return rShort(it.r); if (c === "m") return mShort(it.m); if (c === "s") return S && !it.sx ? stShort(S.n) : ""; if (c === "unit") return uShort(it.unit); return it[c] == null ? "" : it[c]; };
  const titleOf = (it, c) => { const T = type(it), S = std(it), z = sz(it); return c === "t" ? (T ? T.n : "") : c === "z" ? (z && z.a ? z.a : "") : c === "r" ? it.r || "" : c === "m" ? it.m || "" : c === "s" ? (S ? S.n : "") : ""; };
  let focusNext = null;
  /* the class last picked on an action's MTO: new piping rows start in it (rows already there keep theirs), and it can still be changed */
  const lastCl = new Map(), akey = a => a._p + ":" + a.u;   // (after a pick, the next box still to fill in on that row)
  /* steel cut from stock lengths: always one parent per stock item (section, size, grade, finish, standard and stock length), which is
     what's ordered; each row entered is one cut of it (its length in Qty, the green from Settings, its notes as the mark). The parent
     packs the cuts onto stock lengths with the green and the saw cuts, and adds the spare lengths. Only parents go to the supplier */
  const skey = x => [x.t, x.s, x.z, x.r, x.m, x.L, x.mk, x.end].join("|");
  const isCut = it => { const T = type(it); return !!T && T.k === "len" && !isPipe(it) && !it.draft; };
  const piecesOf = it => cuts(it).length ? it.cuts : nq(it.qty) > 0 ? [{ id: it.id, l: Math.round(nq(it.qty) * (String(it.unit || "m") === "m" ? 1000 : 1)), n: 1, g: it.g != null ? it.g : rules().green, mk: it.notes || "" }] : [];
  function groupsOf(items){ const g = new Map(); items.forEach(it => { if (!isCut(it)) return; const k = skey(it); if (!g.has(k)) g.set(k, { key: k, rows: [] }); g.get(k).rows.push(it); });
    g.forEach(G => { G.first = G.rows[0]; G.v = Object.assign({}, G.first, { cuts: G.rows.flatMap(piecesOf) }); G.res = pack(G.v); G.n = stockN(G.res); }); return g; }
  /* a parent's spare lengths: the team's share for its heading, rounded up, unless typed over (kept with the action, by stock item) */
  function gSpare(a, G){ const st = (a.mtoG || {})[G.key] || {}; if (st.sqm) return +st.sq || 0; return pref("spAuto") && G.n ? Math.ceil(G.n * (+pref("spSteel") || 0) / 100) : 0; }
  const lenTot = (G, n) => G.res ? n + " LG (" + n1(n * G.res.L / 1000) + " m)" : "? LG";
  /* everything cut from stock, as the cutting list draws it: each parent (its cuts, spare lengths) and each plate row with pieces */
  function packs(a){ const items = a.mto || [], gs = groupsOf(items), done = new Set(), out = [];
    items.forEach(it => { if (!isCut(it)){ const res = pack(it); if (res) out.push({ it, res }); return; } const G = gs.get(skey(it)); if (done.has(G.key)) return; done.add(G.key);
      if (G.res) out.push({ it: Object.assign({}, G.v, { spare: gSpare(a, G) }), res: G.res }); }); return out; }
  /* what goes to the supplier: each parent in place of its cuts (as stock lengths), everything else as it is */
  function orderRows(a){ const items = a.mto || [], gs = groupsOf(items), done = new Set(), out = [];
    items.forEach(it => { if (!isCut(it)) return out.push(it); const G = gs.get(skey(it)); if (done.has(G.key)) return; done.add(G.key); const n = G.n + gSpare(a, G);
      out.push({ id: "g:" + G.key, desc: desc(G.first), part: G.first.part || "", qty: String(n), unit: "lengths", notes: "", grp: G }); }); return out; }
  function table(a, ro){ const items = a.mto || (a.mto = []); shorten(items); if (!PipeSpec.ready()) PipeSpec.load();
    /* (shown and exported in the MTO's order: piping by heading, then the steel and the rest; in memory, it saves that way at the next change) */
    const sorted = order(items); if (sorted.some((it, i) => it !== items[i])) items.splice(0, items.length, ...sorted);
    /* a row being entered stays at the top of its table until all of it is picked and Done is pressed; only then does it go under its heading
       (rows already part filled when this came in start there too) */
    if (!a.mtoDr){ items.forEach(it => { if (missing(it).length) it.draft = 1; }); a.mtoDr = 1; }
    const pipes = items.filter(it => isPipe(it) && !it.draft), steel = items.filter(it => !isPipe(it) && !it.draft), pdr = items.filter(it => isPipe(it) && it.draft), sdr = items.filter(it => !isPipe(it) && it.draft); let n = 0;
    const box = (it, c, ph, ex, v) => '<input class="in pt-in mt-pk" data-r="' + it.id + '" data-c="' + c + '" value="' + esc(v != null ? v : shown(it, c)) + '" placeholder="' + ph + '" title="' + esc(titleOf(it, c)) + '"' + (ex || "") + (ro ? " readonly" : "") + ' autocomplete="off" spellcheck="false">';
    const iBtn = it => '<button type="button" class="mt-ii" data-info="' + it.id + '" title="About this item: in full, no abbreviations, sizes, weight, how the total was worked out" aria-label="About this item">' + INFO_I + '</button>';
    const qtyCell = (it, auto, kid) => '<td class="mt-qu"><input class="in pt-in mt-q" data-r="' + it.id + '" data-c="qty" inputmode="decimal" value="' + esc(need(it)) + '" placeholder="' + (kid ? "Length" : "Qty") + '"' + (ro || auto ? " readonly" : "") + (auto ? ' title="Worked out from the pieces (▸)"' : kid ? ' title="The length of this cut (the green from Settings is added for site trimming)"' : "") + '>'
      + (type(it) ? box(it, "unit", "", ' data-opt="1" tabindex="-1"').replace("mt-pk", "mt-pk mt-un") : '<input class="in pt-in mt-u mt-un" tabindex="-1" data-r="' + it.id + '" data-c="unit" value="' + esc(uShort(it.unit)) + '" placeholder="EA"' + (ro ? " readonly" : "") + '>') + '</td>'
      + (kid ? '<td></td><td></td>' : '<td><input class="in pt-in mt-q mt-sq' + (!auto && !it.sqm && String(it.sq || "") !== "" ? " mt-sqa" : "") + '" data-r="' + it.id + '" data-c="' + (auto ? "spare" : "sq") + '" inputmode="decimal" value="' + esc(spareOf(it)) + '" placeholder="0"' + (ro ? " readonly" : "") + ' title="' + (auto ? "Spare whole " + (isPlate(it) ? "sheets" : "lengths") + ", on top of what the pieces need" : it.sqm ? "Set by hand. Clear it to have it worked out again" : spareTip(it)) + '"></td>'
      + '<td class="mt-tot" title="Quantity plus spares: what is ordered">' + esc(ord(it)) + (ord(it) ? ' <span class="dim">' + esc(uShort(it.unit) || "EA") + '</span>' : "") + '</td>');
    const tail = it => '<td class="mt-itd"><input class="in pt-in" data-r="' + it.id + '" data-c="notes" value="' + esc(it.notes || "") + '"' + (it.auto ? ' placeholder="' + esc(it.an || "from the flanges") + '"' : "") + (ro ? " readonly" : "") + '>' + (type(it) || (isSpec(it) && it.it) || it.desc ? iBtn(it) : "") + '</td>'
      + '<td class="mt-ic">' + (it.draft && !ro && !missing(it).length ? '<button type="button" class="btn sm mt-done" data-done="' + it.id + '" title="Put it under its heading in the MTO">Done</button>' : "") + '' + (ro ? "" : (it.auto ? "" : '<button type="button" class="ic-b sm mt-dup" data-dup="' + it.id + '" title="Duplicate this row" aria-label="Duplicate this row">' + DUP_I + '</button>') + '<button type="button" class="ic-b sm pt-x mt-x" data-x="' + it.id + '" title="Remove this row">✕</button>') + '</td></tr>';
    const head = (it, cols, last) => GROUP(it) !== last ? '<tr class="mt-grp nosort"><td colspan="' + (cols + 1) + '">' + esc(GROUP(it)) + '</td></tr>' : "";
    const no = (it, miss, tg, kid) => '<td class="pt-no">' + (miss.length ? '<span class="mt-dot" title="Still to pick: ' + esc(miss.join(", ")) + '"></span>' : it.draft ? "" : kid || ++n) + ((c => c ? '<span class="mt-chk" title="Check: ' + esc(c) + '">' + WARN + '</span>' : "")(it.chk || (isSpec(it) ? specRes(it).chk : ((pack(it) || {}).long || []).length ? "a piece is longer than the stock length: it needs a joint, or pick a longer stock length" : ""))) + (tg || "") + '</td>';
    const toggle = (it, res) => { const T = type(it), on = open.has(it.id); return T && (T.k === "plate" || (T.k === "len" && cuts(it).length && !isCut(it))) ? '<button type="button" class="mt-tg' + (on ? " on" : "") + '" data-tg="' + it.id + '" title="' + (on ? "Hide" : "Show") + ' the pieces to cut">' + CHEV + (cuts(it).length ? '<b>' + cuts(it).reduce((t, c) => t + Math.max(1, Math.round(+c.n || 1)), 0) + '</b>' : "") + '</button>' : ""; };
    const sub = (it, res, cols) => { const T = type(it); return open.has(it.id) && T && (T.k === "plate" || (T.k === "len" && !isCut(it))) ? '<tr class="mt-sub" data-sub="' + it.id + '"><td colspan="' + (cols + 1) + '"><div class="mt-subin">' + piecesHtml(it, res, ro) + '</div></td></tr>' : ""; };
    /* ---- piping: Class, Size, Item, Ends / type, Qty ---- */
    const PC = [["cl", "Class"], ["sz", "Size"], ["t", "Item"], ["et", "Details"], ["qty", "Qty"], ["sq", "Spare"], ["tot", "Total"], ["notes", "Notes"], ["x", ""]];
    let last = null, ph = "";
    const pipeRow = it => { const T = type(it), miss = ro ? [] : missing(it), res = T && pack(it); let ph = "";
      ph += '<tr data-id="' + it.id + '" class="mt-row' + (miss.length ? " mt-part" : "") + '">' + no(it, miss, toggle(it, res));
      if (isSpec(it)){ const R = specRes(it);
        ph += '<td>' + box(it, "cl", "Class") + '</td><td class="mt-szd">' + box(it, "dn", "Size") + (PipeSpec.reducing(it.it) ? box(it, "dn2", "x small") : "") + '</td><td>' + box(it, "it", "Item") + '</td>'
          + '<td>' + (R.bolt && R.bolt !== "nut" && R.bolt !== "kit" ? '<div class="mt-dw"><input class="in pt-in mt-bl" data-r="' + it.id + '" data-c="bl" inputmode="numeric" value="' + esc(it.bl || "") + '" placeholder="' + esc(R.L || "length") + '"' + (ro ? " readonly" : "") + ' title="Length, mm: worked out flange on flange with the gasket. Change it for a valve or spacer between the flanges"><span class="mt-auto mt-det" data-fit="1" data-det="' + it.id + '"> mm, ' + esc(R.auto || "") + '</span></div>'
            : (R.vs || []).length ? '<div class="mt-dw">' + box(it, "vt", "Pick one") + '</div>'
            : '<div class="mt-dw"><span class="mt-auto mt-det" data-fit="1" data-det="' + it.id + '">' + esc(R.auto || "") + '</span></div>') + '</td>'; }
      else if (T || it.cl === "N/A" && !it.cat && it.desc == null){
        ph += '<td>' + box(it, "cl", "Class", "", "N/A") + '</td><td>' + box(it, "z", "Size") + '</td><td>' + box(it, "t", "Item") + '</td>'
          + '<td class="mt-rms">' + (T ? (ratings(it).length ? box(it, "r", "Sch") : "") + box(it, "m", "Material") + box(it, "s", "Std", ' data-opt="1"') : "") + '</td>'; }
      else ph += '<td>' + box(it, "cl", "Class", "", it.cl || "N/A") + '</td><td>' + box(it, "z", "Size") + '</td><td>' + box(it, "t", it.cat === "inst" ? "Instrument or control valve" : "Item") + '</td><td>' + box(it, "part", "Part / model") + '</td>';
      return ph + qtyCell(it, !!res) + tail(it) + sub(it, res, PC.length); };
    ph = pdr.map(pipeRow).join("");
    const lc = lastCl.get(akey(a));
    if (!ro) ph += '<tr class="pt-blank"><td class="pt-no"></td><td><input class="in pt-in mt-pk" data-r="newp" data-c="cl" placeholder="+ Class" value="' + esc(lc || "") + '" title="' + (lc ? "New rows start in " + esc(lc) + ", the class last picked; pick another to change it" : "") + '" autocomplete="off" spellcheck="false"></td>'
      + (lc ? '<td><input class="in pt-in mt-pk" data-r="newp" data-c="dn" placeholder="+ Size" autocomplete="off" spellcheck="false"></td><td colspan="' + (PC.length - 2) + '"></td></tr>' : '<td colspan="' + (PC.length - 1) + '"></td></tr>');
    pipes.forEach(it => { ph += head(it, PC.length, last) + pipeRow(it); last = GROUP(it); });
    /* ---- steel and the rest ---- */
    const hasPart = steel.concat(sdr).some(it => it.part || !type(it));
    /* (the same number of columns as the piping table, so the two line up: material and standard share a column, as do the type and part of a row typed in) */
    /* (steel's third pick is its finish, black, galvanised or primed: a coating, not a rating) */
    const SC = [["t", "Item"], ["z", "Size"], ["ms", "Material / std"], ["r", "Finish"], ["qty", "Qty"], ["sq", "Spare"], ["tot", "Total"], ["notes", "Notes"], ["x", ""]];
    let sh = ""; last = null;
    const steelRow = (it, kid) => { const T = type(it), miss = ro ? [] : missing(it), res = T && pack(it);
      return '<tr data-id="' + it.id + '" class="mt-row' + (kid ? " mt-kid" : "") + (miss.length ? " mt-part" : "") + '">' + no(it, miss, toggle(it, res), kid)
        + '<td>' + box(it, "t", "Item") + '</td><td>' + box(it, "z", "Size") + '</td>'
        + '<td class="mt-szd">' + (T ? box(it, "m", "Material") + box(it, "s", "Std", ' data-opt="1"') : box(it, "part", "Part / model")) + '</td><td>' + (T && ratings(it).length ? box(it, "r", T.rl || "Finish") : "") + '</td>'
        + qtyCell(it, !!res, kid) + tail(it) + sub(it, res, SC.length); };
    /* a parent row: the stock to order (worked out), its spare lengths, the total; clicking it shows or hides its cuts */
    const gs = groupsOf(items), drawn = new Set();
    const parentRow = G => { const sp = gSpare(a, G), st = (a.mtoG || {})[G.key] || {}, on = openG.has(G.key), R = G.res, f = G.first, T = type(f), S = std(f);
      return '<tr class="mt-par' + (on ? " on" : "") + '" data-g="' + esc(G.key) + '"><td class="pt-no">' + (++n) + '<span class="mt-tg' + (on ? " on" : "") + '" title="' + (on ? "Hide" : "Show") + ' the cuts">' + CHEV + '<b>' + G.rows.length + '</b></span>' + (R && R.long.length ? '<span class="mt-chk" title="Check: a cut is longer than the stock length, so it needs a joint (counted as lengths joined), or pick a longer stock length">' + WARN + '</span>' : "") + '</td>'
        + '<td class="mt-pv">' + esc(itemCode(f)) + '</td><td class="mt-pv">' + esc(zShort(f)) + '</td><td class="mt-pv">' + esc([mShort(f.m), S && !f.sx ? stShort(S.n) : ""].filter(Boolean).join("  ")) + '</td><td class="mt-pv">' + esc(rShort(f.r)) + '</td>'
        + '<td class="mt-qu mt-pq" title="Stock lengths to cut the ' + G.rows.length + ' cut' + (G.rows.length === 1 ? "" : "s") + ' from">' + esc(lenTot(G, G.n)) + '</td>'
        + '<td><input class="in pt-in mt-q mt-sq mt-gsq' + (st.sqm ? "" : sp ? " mt-sqa" : "") + '" data-gs="' + esc(G.key) + '" inputmode="numeric" value="' + esc(sp || "") + '" placeholder="0"' + (ro ? " readonly" : "") + ' title="' + (st.sqm ? "Spare lengths, set by hand. Clear it to have it worked out again" : "Spare lengths, worked out (File, Parameters, MTO spares). Type over it to change it") + '"></td>'
        + '<td class="mt-tot">' + esc(lenTot(G, G.n + sp)) + '</td><td class="mt-itd"><button type="button" class="mt-ii" data-ginfo="' + esc(G.key) + '" title="How the order is worked out" aria-label="How the order is worked out">' + INFO_I + '</button></td>'
        + '<td class="mt-ic">' + (ro ? "" : '<button type="button" class="ic-b sm pt-x mt-x" data-gx="' + esc(G.key) + '" title="Remove this item and all its cuts">✕</button>') + '</td></tr>'; };

    const steelItem = it => { if (!isCut(it)) return steelRow(it); const G = gs.get(skey(it)); if (drawn.has(G.key)) return ""; drawn.add(G.key); return parentRow(G) + (openG.has(G.key) ? G.rows.map((r, i) => steelRow(r, n + "." + (i + 1))).join("") : ""); };
    sh = sdr.map(steelRow).join("");
    if (!ro) sh += '<tr class="pt-blank"><td class="pt-no"></td><td><input class="in pt-in mt-pk" data-r="new0" data-c="t" placeholder="+ Item" autocomplete="off" spellcheck="false"></td><td colspan="' + (SC.length - 1) + '"></td></tr>';
    steel.forEach(it => { const r = steelItem(it); if (!r) return; sh += head(it, SC.length, last) + r; last = GROUP(it); });
    const thead = cols => '<thead><tr><th class="pt-no" data-col="No.">#</th>' + cols.map(([c, nm]) => '<th data-col="' + (nm || c) + '">' + esc(nm) + (REQ.has(c) || c === "cl" || c === "sz" || c === "ms" ? '<span class="mt-rq" title="Needed">*</span>' : "") + '</th>').join("") + '</tr></thead>';
    return '<div class="mt-h">Piping' + tipI("To the plant's pipe spec (" + ((PipeSpec.meta() || {}).doc || "loading the spec…") + "): pick the class, the size and the item, and the spec gives the rest. N/A for anything not to a class.") + '</div>'
      + '<div class="mt-wrap"><table class="tbl pt-tbl mt-tbl mt-pipe">' + thead(PC) + '<tbody>' + ph + '</tbody></table></div>'
      + '<div class="mt-h">Steel and other</div>' + '<div class="mt-wrap"><table class="tbl pt-tbl mt-tbl mt-steel">' + thead(SC) + '<tbody>' + sh + '</tbody></table></div>'; }

  /* the pieces under a row, with the packing drawn */
  function piecesHtml(it, res, ro){ const pl = isPlate(it), cs = it.cuts || [];
    const cin = (c, k, v, ph) => '<input class="in pt-in mt-cin" data-cut="' + c + '" data-r="' + it.id + '" data-c="' + k + '"' + (ro ? " readonly" : "") + (k === "mk" ? "" : ' inputmode="decimal"') + ' value="' + esc(v == null ? "" : v) + '"' + (ph ? ' placeholder="' + ph + '"' : "") + '>';
    const gt = 'Green: extra left on the piece to trim to fit on site, mm (File, Settings sets what a new piece starts with)';
    return '<div class="mt-cuts"><table class="mt-ct"><thead><tr><th>Piece</th><th>Length (mm)</th>' + (pl ? '<th>Width (mm)</th>' : '<th title="' + gt + '">Green (mm)</th>') + '<th>Qty</th><th>Mark / where it goes</th><th></th></tr></thead><tbody>'
      + cs.map((c, i) => '<tr><td class="pt-no">' + (i + 1) + '</td><td>' + cin(c.id, "l", c.l) + '</td>' + (pl ? '<td>' + cin(c.id, "w", c.w) + '</td>' : '<td>' + cin(c.id, "g", c.g, "0") + '</td>') + '<td>' + cin(c.id, "n", c.n || 1) + '</td><td>' + cin(c.id, "mk", c.mk, "e.g. A, or chute brace") + '</td><td>' + (ro ? "" : '<button type="button" class="ic-b sm" data-cx="' + c.id + '" data-r="' + it.id + '" title="Remove this piece">✕</button>') + '</td></tr>').join("")
      + (ro ? "" : '<tr class="pt-blank"><td class="pt-no"></td><td>' + cin("new", "l", "", pl ? "e.g. 600" : "e.g. 2400") + '</td>' + (pl ? '<td>' + cin("new", "w", "", "e.g. 400") + '</td>' : '<td>' + cin("new", "g", "", String(rules().green || 0)) + '</td>') + '<td>' + cin("new", "n", "", "1") + '</td><td>' + cin("new", "mk", "") + '</td><td></td></tr>')
      + '</tbody></table><div class="mt-side">'
      + '<button type="button" class="mt-i' + (res ? " on" : "") + '" data-info="' + it.id + '" title="How the total is worked out">' + INFO_I + '</button>'
      + '</div></div>' + (res ? '<div class="mt-draw">' + (res.kind === "len" ? barsSvg(res) : sheetsSvg(res)) + '</div>' : ""); }
  /* bars the same are drawn once, "× 3" */
  function groups(res){ const g = new Map(); res.bars.forEach(b => { const k = b.ps.map(p => p.l + "|" + p.g + "|" + p.mk).join(",") + "#" + b.off; if (!g.has(k)) g.set(k, { b, n: 0 }); g.get(k).n++; }); return [...g.values()]; }
  function barsSvg(res){ const L = res.L, { kerf } = rules();
    return groups(res).map(({ b, n }) => { let x = 0, s = "";
      b.ps.forEach((p, i) => { if (i){ s += '<rect class="kf" x="' + (x / L * 1000) + '" y="2" width="' + Math.max(1, kerf / L * 1000) + '" height="30"/>'; x += kerf; }
        const w = p.l / L * 1000, gw = (p.g || 0) / L * 1000; s += '<rect class="pc" x="' + (x / L * 1000) + '" y="2" width="' + w + '" height="30" rx="2"/>' + (gw ? '<rect class="gr" x="' + (x / L * 1000 + w) + '" y="2" width="' + gw + '" height="30"><title>Green ' + p.g + ' mm</title></rect>' : "")
          + (w > 40 ? '<text x="' + (x / L * 1000 + w / 2) + '" y="21">' + esc(p.l + (p.g && w > 70 ? " +" + p.g + "G" : "") + (p.mk && w > 90 ? " " + p.mk : "")) + '</text>' : ""); x += p.l + (p.g || 0); });
      if (b.off){ x += kerf; const w = b.off / L * 1000; s += '<rect class="' + (b.keep ? "of" : "sc") + '" x="' + (x / L * 1000) + '" y="2" width="' + w + '" height="30" rx="2"/>' + (w > 50 ? '<text class="ot" x="' + (x / L * 1000 + w / 2) + '" y="21">' + (b.keep ? "offcut " : "scrap ") + Math.round(b.off) + '</text>' : ""); }
      return '<div class="mt-bar"><span class="mt-bn">' + (n > 1 ? "× " + n : "× 1") + '</span><svg viewBox="0 0 1000 34" preserveAspectRatio="none" role="img" aria-label="Cut plan">' + s + '</svg></div>'; }).join("")
      + '<div class="mt-key"><i class="pc"></i>in the MTO' + (res.green ? '<i class="gr"></i>green' : "") + '<i class="of"></i>offcut kept<i class="sc"></i>scrap</div>'; }
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
    /* a steel parent: click it to show or hide its cuts; its spare lengths worked out or typed over; ✕ removes it with its cuts */
    const grp = k => groupsOf(items).get(k);
    $$("tr.mt-par", el).forEach(tr => tr.onclick = e => { if (e.target.closest("input,button")) return; const k = tr.dataset.g; openG.has(k) ? openG.delete(k) : openG.add(k); App.render(); });
    $$("[data-gs]", el).forEach(i => { const k = i.dataset.gs, td = i.closest("td").nextElementSibling;
      i.addEventListener("input", () => { i.classList.remove("mt-sqa"); const G = grp(k); if (G && td) td.textContent = lenTot(G, G.n + (i.value.trim() === "" ? gSpare(Object.assign({}, a, { mtoG: {} }), G) : Math.max(0, Math.round(+i.value) || 0))); });
      i.addEventListener("change", () => { if (ro) return; const v = i.value.trim(); Store.mutate(key, () => { a.mtoG = a.mtoG || {}; if (v === "") delete a.mtoG[k]; else a.mtoG[k] = { sq: Math.max(0, Math.round(+v) || 0), sqm: true }; Store.touch(a); }); Store.log("Edited the MTO of " + Store.actId(a)); App.render(); }); });
    $$("[data-gx]", el).forEach(b => b.onclick = async () => { const G = grp(b.dataset.gx); if (!G) return;
      if (!await confirmBox("Remove " + desc(G.first) + " and its " + G.rows.length + " cut" + (G.rows.length === 1 ? "" : "s") + " from the MTO?", "Remove", true)) return;
      Store.mutate(key, () => { G.rows.forEach(r => { const i = items.indexOf(r); if (i >= 0) items.splice(i, 1); }); if (a.mtoG) delete a.mtoG[G.key]; Store.touch(a); }); openG.delete(G.key); Store.log("Removed from the MTO of " + Store.actId(a)); App.render(); });
    $$("[data-ginfo]", el).forEach(b => b.onclick = e => { e.stopPropagation(); const G = grp(b.dataset.ginfo); if (!G) return; Fields.closePop(); const sp = gSpare(a, G), st = (a.mtoG || {})[G.key] || {};
      const p = document.createElement("div"); p.className = "pop mt-pop";
      p.innerHTML = '<div class="mt-ph">As printed on the MTO</div><b>' + esc(desc(G.first)) + '</b><div class="lbl">How the order is worked out</div><p>' + esc(G.res ? explain(Object.assign({}, G.v, { spare: sp }), G.res) : "Pick a stock length for the cuts first.") + '</p>'
        + (G.res ? '<p>' + esc("Spare: " + sp + " length" + (sp === 1 ? "" : "s") + (st.sqm ? ", set by hand." : ", " + (+pref("spSteel") || 0) + "% of the " + G.n + " rounded up (File, Parameters, MTO spares).")) + '</p>' : "")
        + '<p class="dim">Each row under it is one cut: its length, the green from Settings, its notes as the mark. The cutting list in the work pack shows where to cut. Only this row goes to the supplier.</p>';
      document.body.appendChild(p); Fields.place(p, b); const pr = p.getBoundingClientRect(); if (pr.bottom > innerHeight - 8) p.style.top = Math.max(8, innerHeight - pr.height - 8) + "px"; if (pr.right > innerWidth - 8) p.style.left = Math.max(8, innerWidth - pr.width - 8) + "px"; });
    /* the ⋯ at the row's end: about this item (sizes, weight, how the total was worked out, notes), move it to Spares, remove it */
    /* the row's end: move it to Spares, or remove it (asks first) */
    /* duplicate: a copy of the row straight under it, to change what differs (the studs and nuts that follow the flanges aren't copied: they are worked out) */
    $$("[data-dup]", el).forEach(b => b.onclick = () => { const it = find(b.dataset.dup); if (!it) return; const c = JSON.parse(JSON.stringify(it)); c.id = uid(); delete c.auto; delete c.qman;
      (c.cuts || []).forEach(x => x.id = uid()); Store.mutate(key, () => { items.splice(items.indexOf(it) + 1, 0, c); bolts(); Store.touch(a); }); Store.log("Duplicated a row of the MTO of " + Store.actId(a)); focusNext = { id: c.id, c: "qty" }; App.render(); });
    $$("[data-x]", el).forEach(b => b.onclick = async () => { const it = find(b.dataset.x); if (!it) return;
      if (await confirmBox("Remove " + (desc(it) || "this row") + " from the MTO?", "Remove", true)) Store.mutate(key, () => { const k = items.indexOf(it); if (k >= 0) items.splice(k, 1); bolts(); Store.touch(a); }); });
    if (ro) return;
    /* the order the boxes are filled in: to a class, Class Size Item (Ends / type) Qty; N/A, Class Size Item Rating Material Qty; the rest, Item Size Rating Material Qty */
    const orderOf = it => isInst(it) ? ["cl", "t", "part", "z", "qty"] : isSpec(it) ? ["cl", "dn", "it", "dn2", "vt", "qty"] : isPipe(it) ? ["cl", "z", "t", "r", "m", "qty"] : ["t", "z", "m", "r", "qty"];
    const needs = (it, x) => x === "z" && isInst(it) ? !it.z && (instType(it.desc) || {}).g === "Control valves" : x === "part" ? isInst(it) && !it.part && !!(instType(it.desc) || { mm: [] }).mm.length : x === "cl" ? !it.cl : x === "dn" ? !it.dn : x === "dn2" ? PipeSpec.reducing(it.it) && !it.dn2 : x === "it" ? !it.it : x === "vt" ? specRes(it).need === "ends or type" : x === "qty" ? !String(it.qty || "").trim()
      : x === "t" ? !type(it) && !String(it.desc || "").trim() : x === "z" ? (type(it) || it.cl === "N/A") && !it.z && !(it.desc != null && !type(it)) : x === "r" ? !!type(it) && ratings(it).length > 0 && !it.r : x === "m" ? !!type(it) && !it.m : false;
    /* the next box on the row still to fill in (after a pick, the cursor goes there and its list opens) */
    const after = (id, c) => { const it = find(id); if (!it || !missing(it).length) return null; const O = orderOf(it), from = O.indexOf(c);
      for (const x of O.slice(Math.max(0, from + 1)).concat(O)) if (needs(it, x)) return { id, c: x }; return null; };
    const set = (it, c, v) => { const T = type(it);
      if (c === "cl" && v === "cat:inst"){ ["dn", "it", "vt", "t", "s", "m", "r", "L", "mk", "end", "sx", "cuts"].forEach(k => delete it[k]); it.cl = "N/A"; it.cat = "inst"; it.desc = it.desc || ""; it.unit = it.unit || "ea"; return; }
      if (isInst(it) && (c === "t" || c === "part" || c === "z") && /^typed:/.test(v)){ it[c === "t" ? "desc" : c] = v.slice(6); return; }
      if (isInst(it) && c === "t" && /^ity:/.test(v)){ it.desc = v.slice(4); const e = instType(it.desc); if (e && e.mm.length === 1) it.part = e.mm[0][0]; else if (e && it.part && !e.mm.some(m => m[0] === it.part)) delete it.part; return; }
      if (isInst(it) && c === "t" && /^tag:/.test(v)){ const x = (inst() || { tags: new Map() }).tags.get(v.slice(4)); if (!x) return; it.desc = x.ty; if (x.m) it.part = x.m; if (x.sz && !it.z) it.z = "DN" + x.sz; if (!String(it.notes || "").includes(x.tag)) it.notes = [it.notes, x.tag].filter(Boolean).join(", "); return; }
      if (c === "cl"){ if (v === "N/A"){ if (isSpec(it)) ["dn", "it", "vt"].forEach(k => delete it[k]); it.cl = "N/A"; return; }
        ["t", "s", "z", "m", "r", "L", "mk", "end", "sx", "cuts", "cat", "desc"].forEach(k => delete it[k]); it.cl = v; if (it.dn && !PipeSpec.sizes(v).includes(it.dn)) delete it.dn; delete it.it; delete it.vt; return; }
      if (c === "dn2" && it.it === "BR:"){ const plan = PipeSpec.branchPlan(it.cl, it.dn, +v).filter(x => x.it); if (!plan.length){ it.dn2 = +v; return; }
        const nb = "Branch " + PipeSpec.lab(it.cl, it.dn) + (+v === it.dn ? " equal" : " x " + PipeSpec.lab(it.cl, +v));
        plan.forEach((x, k) => { const r = k === 0 ? it : { id: uid(), cl: it.cl, qty: it.qty || "", unit: "ea", draft: 1 }; r.it = x.it; r.dn = x.dn; if (x.dn2) r.dn2 = x.dn2; else delete r.dn2; delete r.vt; r.notes = r.notes || nb; if (k) items.push(r); });
        return; }
      if (c === "dn2"){ it.dn2 = +v; return; }
      if (c === "dn"){ it.dn = +v; if (it.dn2 && it.dn2 >= it.dn) delete it.dn2; if (it.it && !PipeSpec.items(it.cl, it.dn).some(x => x.v === it.it)) delete it.it; delete it.vt; return; }
      if (c === "it"){ it.it = v; delete it.vt; if (!PipeSpec.reducing(v)) delete it.dn2; const R = specRes(it); it.unit = R.unit || "ea"; return; }
      if (c === "vt"){ it.vt = v; return; }
      if (c === "t" && /^cat:/.test(v)){ ["t", "s", "m", "r", "L", "mk", "end", "sx", "cuts"].forEach(k => delete it[k]); it.cat = v.slice(4); it.desc = ""; it.unit = it.unit || "ea"; return; }
      if (c === "t"){ if (v === "other"){ const d = T ? desc(it) : it.desc || ""; ["t", "s", "z", "m", "r", "L", "cuts", "spare"].forEach(k => delete it[k]); it.desc = d; it.unit = it.unit || "ea"; return; }
        const [tv, mk, en] = String(v).split("|"); v = tv; it.t = v; if (mk){ it.mk = mk; it.end = en; } else { delete it.mk; delete it.end; } delete it.sx; const T2 = TY[v], keepZ = it.cl === "N/A" && it.z ? T2.stds.find(st => st.sizes.some(z => z.n === it.z)) : null, S = keepZ || T2.stds[0]; it.s = S.id; if (!keepZ) it.z = ""; delete it.m; delete it.r; it.L = S.lens ? S.defl : undefined; it.unit = T2.units[0]; if (T2.k !== "len" && T2.k !== "plate") delete it.cuts;
        if (S.mats.length === 1) it.m = S.mats[0]; const rs = ratings(it); if (rs.length === 1) it.r = rs[0]; return; }
      if (c === "z" && !T){ it.z = v; return; }
      if (c === "z"){ const S0 = std(it); let S = S0.sizes.some(z => z.n === v) ? S0 : T.stds.find(s => s.sizes.some(z => z.n === v)) || S0; it.s = S.id; it.z = v;
        if (it.m && !S.mats.includes(it.m)) delete it.m; if (!it.m && S.mats.length === 1) it.m = S.mats[0]; if (S.lens && !S.lens.includes(it.L)) it.L = S.defl;
        const rs = ratings(it); if (it.r && !rs.includes(it.r)) delete it.r; if (!it.r && rs.length === 1) it.r = rs[0]; return; }
      if (c === "s"){ const S = T.stds.find(s => s.id === v); if (!S) return; it.s = S.id; delete it.sx; if (it.z && !S.sizes.some(z => z.n === it.z)) it.z = ""; if (it.m && !S.mats.includes(it.m)) delete it.m; if (S.lens && !S.lens.includes(it.L)) it.L = S.defl; const rs = ratings(it); if (it.r && !rs.includes(it.r)) delete it.r; return; }
      it[c] = v; };
    /* the studs and nuts follow the flanges: for each class and size, the flange rows (not still being entered) make joints, flange on
       flange (two flanges a joint, a blind or an odd one counted as a joint too), and each joint takes the table's bolts and two nuts a stud.
       A quantity typed over an automatic row stays; a row whose flanges are gone goes */
    const fillSpare = it => { const T = type(it); if (pref("spAuto") && !it.sqm && !pack(it) && !(T && T.k === "len" && !isPipe(it))) it.sq = autoSpare(it); };   // (a cut's spare is on its parent, in whole lengths)
    function bolts(){ const want = new Map(), F = PipeSpec.FLG;
      items.filter(it => isSpec(it) && !it.draft && !it.auto && it.it && F.test(it.it) && it.dn).forEach(it => { const k = it.cl + "|" + it.dn, w = want.get(k) || { cl: it.cl, dn: it.dn, n: 0 }; w.n += nq(ord(it)); want.set(k, w); });
      const has = new Map(items.filter(it => it.auto).map(it => [it.auto, it]));
      want.forEach(w => { const J = PipeSpec.joint(w.cl, w.dn), joints = Math.ceil(w.n / 2), cs = (PipeSpec.spec(w.cl) || { comps: [] }).comps, nm = re => { const c = cs.find(c => re.test(PipeSpec.clean(c.d))); return c ? PipeSpec.clean(c.d) : null; };
        (PipeSpec.SAE(w.cl) ? [["kit", "B:kit", w.n]] : [["stud", nm(/^stud bolts/i) || "B:stud", J.n ? joints * J.n : ""], ["nut", nm(/^nuts?\b/i) || "B:nut", J.n ? joints * J.n * 2 : ""]]).forEach(([k, itn, q]) => { const key = "bolts|" + w.cl + "|" + w.dn + "|" + k; let r = has.get(key);
          if (!r){ r = { id: uid(), cl: w.cl, dn: w.dn, it: itn, qty: "", unit: "ea", auto: key }; items.push(r); } has.delete(key);
          if (!r.qman) r.qty = String(q); fillSpare(r); r.an = "from " + w.n + " flange" + (w.n === 1 ? "" : "s") + " (" + joints + " joint" + (joints === 1 ? "" : "s") + ")" + (J.n ? ", " + J.n + " per joint" : ""); }); });
      has.forEach(r => { if (!r.qman){ const k = items.indexOf(r); if (k >= 0) items.splice(k, 1); } });
      const o = order(items); items.splice(0, items.length, ...o); }
    const save = (id, c, v) => { const isNew = String(id).startsWith("new"); let it = isNew ? { id: uid(), qty: "", draft: 1 } : find(id); if (!it) return;
      if (c === "cl" && PipeSpec.classes().includes(v)) lastCl.set(akey(a), v);
      Store.mutate(key, () => { if (id === "newp" && c !== "cl" && lastCl.get(akey(a))) set(it, "cl", lastCl.get(akey(a))); set(it, c, v); recalc(it); if (isNew) items.push(it); const o = order(items); items.splice(0, items.length, ...o); bolts(); Store.touch(a); });
      Store.log((isNew ? "Added to" : "Edited") + " the MTO of " + Store.actId(a)); focusNext = after(it.id, c) || (!missing(it).length ? doneNext(it) : null);
      /* steel lengths and plate: the pieces open by themselves, and once the item is picked the cursor goes to the first piece (Qty then works itself out) */
      const T = type(it); if (T && T.k === "plate"){ open.add(it.id); if (!cuts(it).length && (!focusNext || focusNext.c === "qty")) focusNext = { id: it.id, c: "l", cut: "new" }; } };   // (plate: its pieces; a steel length row is itself one cut)
    const doneNext = it => it.draft ? { id: it.id, done: 1 } : isPipe(it) ? { id: "newp", c: lastCl.get(akey(a)) ? "dn" : "cl", quiet: true } : { id: "new0", c: "t", quiet: true };
    /* Done: the row goes under its heading, and the cursor back to a new row */
    /* steel cut from stock lengths or sheets: one summary row per stock item (what's ordered), the pieces to cut under it. A new row
       for an item already in the MTO, same size, grade, finish, standard and stock length, adds its pieces to that row on Done */
    const same = it => { const T = type(it); if (!T || T.k !== "plate") return null; const k = x => [x.t, x.s, x.z, x.r, x.m, x.L, x.mk, x.end].join("|");
      return items.find(x => x !== it && !x.draft && type(x) === T && k(x) === k(it)) || null; };
    $$("[data-done]", el).forEach(b => b.onclick = () => { const it = find(b.dataset.done); if (!it) return; const into = same(it);
      if (into){ Store.mutate(key, () => { into.cuts = (into.cuts || []).concat((it.cuts || []).map(c => Object.assign({}, c, { id: uid() }))); const k = items.indexOf(it); if (k >= 0) items.splice(k, 1); recalc(into); fillSpare(into); Store.touch(a); });
        open.add(into.id); Store.log("Added pieces to a row of the MTO of " + Store.actId(a)); note("Added to the " + desc(into) + " row: its pieces are listed under it"); focusNext = doneNext({}); App.render(); return; }
      Store.mutate(key, () => { delete it.draft; const o = order(items); items.splice(0, items.length, ...o); bolts(); Store.touch(a); }); Store.log("Added to the MTO of " + Store.actId(a)); focusNext = doneNext(it); App.render(); });
    /* the pick boxes: the app's card with what fits; typing narrows it */
    $$(".mt-pk", el).forEach(i => { const r = i.dataset.r, c = i.dataset.c, it = find(r) || (r === "newp" && lastCl.get(akey(a)) ? { qty: "", cl: lastCl.get(akey(a)) } : { qty: "" }); let key2 = null;
      const pt = isInst(it) && (c === "t" || c === "part" || c === "z");   // (an instrument's type and make / model: pick from the plant lists, or type it in)
      const free = c === "part" || c === "spec" || (c === "z" && !type(it) && !(it.cl === "N/A" && it.desc == null)) || (c === "t" && !type(it) && it.desc != null && r !== "new0");
      const show = () => { if (free && c !== "t" && !pt) return;
        const q = i.value.trim().toLowerCase(), cur0 = String(c === "t" && isInst(it) ? it.desc || "" : shown(it, c)).toLowerCase(), typed = q && q !== cur0, ws = typed ? q.split(/\s+/) : [];
        const all = choices(it, c, typed ? q : ""); if (!all.length && !(pt && typed)) return Look.close();
        let list = (ws.length ? all.filter(x => x.tagHit || ws.every(w => (x.t + " " + (x.sub || "") + " " + (x.g || "")).toLowerCase().includes(w))) : all).slice(0, 300);
        /* (what you typed in the name itself comes first: "tee red" lights Tee, reducing, not a choice that only mentions it underneath) */
        if (ws.length){ const inName = x => ws.every(w => x.t.toLowerCase().includes(w)); list = list.filter(inName).concat(list.filter(x => !inName(x))); }
        /* the headings in the list (the class list by material, the items by kind) when there is more than one */
        if (new Set(list.map(x => x.g).filter(Boolean)).size > 1){ const o = []; let g0 = null; list.forEach(x => { if (x.g && x.g !== g0){ o.push({ grp: true, t: x.g }); g0 = x.g; } o.push(x); }); list = o; }
        if (pt && typed && !list.some(x => x.t.toLowerCase() === q)) list = list.concat([{ v: "typed:" + i.value.trim(), t: "Use “" + i.value.trim() + "” as typed", sub: "not in the plant lists" }]);
        key2 = Look.open(i, list.length ? list : [{ v: "", t: "Nothing matches" + (c === "t" ? ", press Enter to use it as typed" : ""), dis: true }], c === "t" ? [it.t, it.mk, it.end].filter(Boolean).join("|") : c === "dn" ? it.dn : it[c], x => { if (x.v === "") return; if (!String(r).startsWith("new")) i.value = x.t; save(r, c, x.v); App.render(); }, { mark: ws }); };
      i.onfocus = () => { i.select(); show(); };
      i.oninput = () => { if (free && !pt) return; show(); };
      i.onkeydown = e => { if (key2 && /^(ArrowDown|ArrowUp|Escape)$/.test(e.key)) return key2(e);
        if (e.key === "Enter" || e.key === "Tab"){ const v = i.value.trim(); const lit = document.querySelector(".lk-card .lk-o.hi:not(.dis)");
          if (lit && (!free || pt)){ e.preventDefault(); lit.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); return; }
          if (c === "t" && v && (r === "new0" || !type(it))){ e.preventDefault(); Look.close(); Store.mutate(key, () => { let x = r === "new0" ? null : find(r); if (!x){ x = { id: uid(), desc: v, unit: "ea", qty: "", draft: 1 }; items.push(x); } else x.desc = v; Store.touch(a); focusNext = { id: x.id, c: "qty" }; }); App.render(); return; }
          if (free && v !== String(it[c] || "")){ e.preventDefault(); save(r, c, v); App.render(); } } };
      i.onblur = () => { setTimeout(() => { if (document.activeElement !== i) Look.closeFor(i); }, 150);
        if (free){ const v = i.value.trim(); if (v !== String((c === "t" ? it.desc : it[c]) || "")) { save(r, c === "t" ? "desc" : c, v); } } }; });
    /* quantity, unit (for one typed in) and notes: typed */
    $$(".mt-tbl .pt-in:not(.mt-pk):not(.mt-cin)", el).forEach(i => { const r = i.dataset.r, c = i.dataset.c;
      i.onchange = () => { const v = i.value.trim(), it = find(r); if (!it || String(it[c] == null ? "" : it[c]) === v) return; if (c === "spare"){ Store.mutate(key, () => { it.spare = Math.max(0, Math.round(+v || 0)) || undefined; recalc(it); Store.touch(a); }); return; }
        Store.mutate(key, () => { it[c] = v; if (it.auto && c === "qty") it.qman = v !== ""; if (c === "sq") it.sqm = v !== ""; recalc(it); bolts(); fillSpare(it); Store.touch(a); }); Store.log("Edited the MTO of " + Store.actId(a)); if (c === "qty" && !missing(it).length) focusNext = doneNext(it); };
      i.onkeydown = e => { if (e.key === "Enter"){ e.preventDefault(); i.blur(); } }; });
    /* details too long for the column end in more…, which opens the item in full */
    requestAnimationFrame(() => requestAnimationFrame(() => $$(".mt-det", el).forEach(d => { if (d.scrollWidth <= d.clientWidth + 1 || d.nextElementSibling) return;
      const m = h('<button type="button" class="link mt-more2">more…</button>'); d.after(m); d.parentElement.classList.add("mt-cut"); m.onclick = e => { e.stopPropagation(); info(a, find(d.dataset.det), m, ro); }; })));
    /* the total follows the spare as it's typed */
    $$(".mt-sq", el).forEach(i => i.addEventListener("input", () => { i.classList.remove("mt-sqa"); const it = find(i.dataset.r), td = i.closest("td").nextElementSibling; if (!it || !td || i.dataset.c !== "sq") return; const t = ord(Object.assign({}, it, { sq: i.value })); td.innerHTML = esc(t) + (t ? ' <span class="dim">' + esc(uShort(it.unit) || "EA") + '</span>' : ""); }));
    /* after a pick: the next box still to fill in on that row */
    if (focusNext){ const f = focusNext; focusNext = null; const t = f.done ? $('.mt-tbl [data-done="' + f.id + '"]', el) : f.cut ? $('.mt-tbl [data-r="' + f.id + '"][data-c="' + f.c + '"][data-cut="' + f.cut + '"]', el) : $('.mt-tbl [data-r="' + f.id + '"][data-c="' + f.c + '"]', el); if (t) setTimeout(() => { t.focus(); if (f.quiet) Look.closeFor(t); }, 0); }
    /* the pieces */
    $$(".mt-cin", el).forEach(i => { i.onchange = () => { const it = find(i.dataset.r), c = i.dataset.c, id = i.dataset.cut; if (!it) return; let v = i.value.trim();
        if (c !== "mk"){ if (v === "") { if (id === "new") return; } else { const x = c === "n" ? Math.round(+v) : num(v); if (!(x > 0) && !(c === "g" && x === 0)){ i.classList.add("bad"); i.title = c === "n" ? "A whole number" : "A length in mm, or in m with an m (2.4m)"; return; } v = x; } }
        if (id === "new"){ if (v === "") return; const cu = { id: uid(), n: 1 }; if (!isPlate(it) && rules().green) cu.g = rules().green; cu[c] = v;   // (a new length starts with the team's green) Parts.created.set("cut:" + it.id, cu.id);
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
    p.innerHTML = '<div class="mt-ph">As printed on the MTO</div><b>' + esc(desc(it) || "Item") + '</b>' + (isSpec(it) ? "" : '<p class="mt-full">' + esc(F.line) + '</p>') + '<dl class="mt-fl">' + F.rows.map(([t, v]) => '<dt>' + esc(t) + '</dt><dd>' + esc(v) + '</dd>').join("") + '</dl>' + (facts.length ? '<dl>' + facts.map(([t, v]) => '<dt>' + esc(t) + '</dt><dd>' + esc(v) + '</dd>').join("") + '</dl>' : "")
      + (res ? '<div class="lbl">How the total was worked out</div><p>' + esc(explain(it, res)) + '</p>'
        : T && (T.k === "len" || T.k === "plate") ? '<div class="lbl">How the total is worked out</div><p>' + esc(!it.L ? "Pick a stock " + (T.k === "plate" ? "sheet size" : "length") + " first." : "Add the pieces the job needs (▸). They're packed onto the fewest " + (T.k === "plate" ? "sheets" : "stock lengths, keeping offcuts of " + rules().keep + " mm or more,") + " with a " + rules().kerf + " mm saw cut between pieces, and Qty becomes the total.") + '</p>' : "")
      + (T && !z && it.z ? '<p class="bad">' + esc(it.z) + " isn't in the library for " + esc(S.n) + ". Check the size.</p>" : "")
      + '<label class="fl"><span class="fl-h">Notes' + tipI("Anything too long for a column.") + '</span>' + '<textarea class="in" rows="4"' + (ro ? " readonly" : "") + ' placeholder="e.g. Allowed 1 spare length for site fit up">' + esc(it.info || "") + '</textarea></label>';
    document.body.appendChild(p); Fields.place(p, anchor); const pr = p.getBoundingClientRect(); if (pr.bottom > innerHeight - 8) p.style.top = Math.max(8, innerHeight - pr.height - 8) + "px";
    if (pr.right > innerWidth - 8) p.style.left = Math.max(8, innerWidth - pr.width - 8) + "px";
    const ta = $("textarea", p); p._done = () => { const v = ta.value.trim(); if (ro || v === (it.info || "")) return; Store.mutate("a:" + a._p, () => { it.info = v || undefined; Store.touch(a); }); }; }

  /* ---------- the cutting list PDF ---------- */
  const needsCut = a => packs(a).some(x => stockN(x.res) > 1);
  async function cutPdf(a){ const jsPDF = await Parts.loadPdf(), doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" }), p = Store.project(a._p) || {}; cutDraw(doc, a);
    const W = 297, pages = doc.getNumberOfPages(); for (let i = 1; i <= pages; i++){ doc.setPage(i); doc.setFontSize(8); doc.setTextColor(140); doc.text(Store.actId(a) + " Cutting list   " + (p.name || "") + "   Page " + i + " of " + pages, W / 2, 204, { align: "center" }); }
    return doc.output("blob"); }
  /* the rows that are cut from stock lengths or sheets (the work pack adds the cutting list when there are any) */
  const hasCuts = a => packs(a).length > 0;
  /* the cutting list drawn into a PDF from the current page on (a landscape A4 page): each stock length or sheet with its pieces,
     their lengths, green, saw cuts, where to cut, and the offcuts. Its own export and the work pack both use it */
  function cutDraw(doc, a){ const { kerf, keep } = rules();
    const W = 297, X = 14, BW = W - 2 * X; let y = 0;
    const head = () => { doc.setFillColor(71, 85, 105); doc.rect(0, 0, W, 20, "F"); doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text("Cutting list", X, 12);
      doc.setFontSize(9.5); doc.setFont("helvetica", "normal"); doc.text(Store.actId(a) + "   " + (a.f.title || "").slice(0, 120), X + 34, 12); y = 28; };
    const room = h => { if (y + h > 196){ doc.addPage("a4", "landscape"); head(); } };
    const hatch = (x, yy, w, h) => { doc.setDrawColor(150); doc.setLineWidth(0.15); for (let d = -h; d < w; d += 2.2){ const x1 = x + Math.max(0, d), y1 = yy + h - Math.max(0, -d) * 0 - (d < 0 ? -d : 0); const x0 = x + Math.max(d, 0), y0 = yy + h - (d < 0 ? -d : 0), x2 = Math.min(x + w, x + d + h), y2 = yy + h - (x2 - (x + d)); if (x2 > x0) doc.line(x0, y0, x2, y2); } };
    head(); doc.setTextColor(60); doc.setFontSize(9);
    { const intro = doc.splitTextToSize("Saw cut allowed: " + kerf + " mm. Offcuts of " + keep + " mm or more are kept. Blue pieces are what the MTO is for" + (rules().green || packs(a).some(x => cuts(x.it).some(c => +c.g)) ? ", green is extra left on to trim to fit on site (piece +G)" : "") + "; grey is offcut. Lengths are in mm, measured from the left end.", BW); doc.text(intro, X, y); y += intro.length * 4 + 3; }
    packs(a).forEach(({ it, res }, idx) => {
      room(30); doc.setTextColor(20); doc.setFont("helvetica", "bold"); doc.setFontSize(11.5); doc.text(doc.splitTextToSize("Item " + (idx + 1) + ": " + desc(it), BW), X, y); y += 5.5;
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(80); const ex = doc.splitTextToSize(explain(it, res), BW); doc.text(ex, X, y); y += ex.length * 4 + 3;
      if (res.kind === "len"){ let no = 1;
        groups(res).forEach(({ b, n }) => { room(24); doc.setTextColor(30); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
          doc.text((n > 1 ? "Lengths " + no + " to " + (no + n - 1) + "  (" + n + " the same)" : "Length " + no) + "   " + lenTxt(res.L), X, y); no += n; y += 2.5;
          const s = BW / res.L, h = 9; let x = 0; const ticks = [];
          b.ps.forEach((pc, i) => { if (i) x += kerf; doc.setFillColor(205, 225, 248); doc.setDrawColor(60, 100, 160); doc.setLineWidth(0.3); doc.rect(X + x * s, y, pc.l * s, h, "FD");
            if (pc.g){ doc.setFillColor(198, 236, 198); doc.setDrawColor(46, 125, 50); doc.rect(X + (x + pc.l) * s, y, pc.g * s, h, "FD"); if (pc.g * s > 4){ doc.setFontSize(7); doc.setTextColor(30, 90, 35); doc.text("G", X + (x + pc.l + pc.g / 2) * s, y + 5.6, { align: "center" }); } }   // (green: left on to trim on site)
            const lab = pc.l + (pc.g ? " +" + pc.g + "G" : "") + (pc.mk ? "  " + pc.mk : ""); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(20, 50, 100); if (doc.getTextWidth(lab) < pc.l * s - 2) doc.text(lab, X + (x + pc.l / 2) * s, y + 5.8, { align: "center" }); else if (doc.getTextWidth(String(pc.l)) < pc.l * s - 1) doc.text(String(pc.l), X + (x + pc.l / 2) * s, y + 5.8, { align: "center" });
            x += pc.l + (pc.g || 0); ticks.push(x); });
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
      y += 3; }); }
  async function cutList(a, rev){ try { const blob = await cutPdf(a), name = Store.actId(a) + " Cutting list" + (rev ? " Rev " + rev : "") + ".pdf"; Excel.save(blob, name); Local.saveOriginal(a, name, blob); return name; }
    catch (e){ console.error(e); alert("Couldn't make the cutting list: " + e.message); } }

  /* the short form for rows saved before it (in memory only: they save that way at their next change) */
  /* every row keeps its short form in desc, which the exports, the RFQ and the search read (a spec row's needs the spec loaded; until it is, the last one stays) */
  const seen = new WeakSet(); function shorten(list){ (list || []).forEach(it => { if (!it) return; if (isSpec(it)){ if (PipeSpec.ready()){ const d = desc(it); if (d) it.desc = d; } return; } if (seen.has(it)) return; seen.add(it); if (type(it)) it.desc = desc(it); }); }
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
  function place(items, it){ items.push(it); const o = order(items); items.splice(0, items.length, ...o); }
  const codes = () => [...new Set(TYPES.map(t => SHORT[t.id]).filter(Boolean))];
  const shownKey = () => [...open, "|", ...openG].join(",");   // (what is opened up in the table, so the panel redraws when it changes)
  return { shownKey, orderRows, cutDraw, hasCuts, table, wire, recalc, desc, ord, pack, explain, needsCut, cutList, info, TY, shorten, missing, fromAi, codes, place };
})();
