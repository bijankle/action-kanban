/* The Assets tab of Data validation, the same as the Assets view of the Project Library app: pick an asset type
   (equipment, instruments, valves, lines…), then narrow it step by step with that type's own tag nomenclature
   (Equipment: code then area; Lines: service, area, pipe spec, size). Each pill shows how many it leaves; the picked
   steps sit on top as chips, ✕ on one steps back to it, and Any skips a step. The pills are in the Filters side bar,
   the matching assets in the table. The lists are the plant lists (search-data.json) and their names (browse.json)
   from the Project Library. */
"use strict";
const Assets = (() => {
  const TYPES = [["mel", "Equipment (mech)"], ["elec", "Equipment (elec)"], ["cable", "Cables"], ["ins", "Instruments"], ["cv", "Control valves"], ["mv", "Manual valves"], ["line", "Lines"],
    ["spi", "Pipe specials"], ["hose", "Hoses"], ["ctl", "Control tags"]];
  const TN = Object.fromEntries(TYPES);
  const STEPS = {
    mel: [["k", "Equipment code"], ["a", "Area"]], ins: [["k", "Instrument letters"], ["a", "Area"]],
    cv: [["k", "Valve type"], ["a", "Area"], ["sz", "Size (mm)"]], mv: [["k", "Valve type"], ["a", "Area"], ["sz", "Size (DN)"]],
    line: [["k", "Service"], ["a", "Area"], ["sp", "Pipe spec"], ["sz", "Size (DN)"]],
    spi: [["k", "Type"], ["a", "Area"]], hose: [["k", "Service"], ["a", "Area"]], ctl: [["k", "Kind"], ["a", "Area"]],
    elec: [["k", "Equipment code"], ["a", "Area"]], cable: [["k", "Cable kind"], ["a", "Area"]] };
  const SIZE = { cv: "Valve size (mm)", mv: "Size (DN)", line: "Size (DN)" };
  const NAMEF = { mel: "Equipment name", elec: "Equipment name", ins: "Description", cv: "Location", spi: "Description", hose: "Description", ctl: "Description", mv: "Valve type" };
  /* the names of the codes (as the Project Library gives them) */
  const CBK = { P: "Power", C: "Control", I: "Instrument", D: "Data / comms", E: "Earth", FO: "Fibre optic", F: "Fibre optic", S: "Signal", B: "DB circuit", R: "DB circuit", W: "DB circuit", N: "Neutral" };
  const CV = { XV: "On / off valve", PRV: "Pressure relief valve", SV: "Safety / solenoid valve", FCV: "Flow control valve", HV: "Hand actuated valve",
    PCV: "Pressure control valve", LCV: "Level control valve", TCV: "Temperature control valve", DCV: "Density control valve", XCV: "Control valve", SVO: "Solenoid valve" };
  const SPI = { EB: "Blower header", FR: "Not used", FS: "Deluge system", HS: "Slurry hose", MC: "Service / flushing coupling", MS: "Filter, trap, breather",
    MV: "Gland water valve", OP: "Orifice plate", SC: "Straub coupling", SP: "Spray nozzle / bar", SS: "Special spool / injector", ST: "Strainer", VC: "Victaulic coupling" };
  const INS = { XV: "On / off valve", SV: "Solenoid valve", SVO: "Solenoid valve, open", SVC: "Solenoid valve, close", ZSO: "Position switch, open",
    ZSC: "Position switch, closed", HS: "Hand switch", PRV: "Pressure relief valve", VT: "Vibration transmitter", VE: "Vibration element" };
  const ELN = { VS: "Variable speed drive", LCS: "Local control station", ISL: "Isolator", JB: "Junction box", XE: "Earth electrode", EB: "Earth bar",
    CP: "Control panel", NR: "Neutral earthing resistor", DPS: "Decontactor", KEB: "Key exchange box", GPO: "General power outlet", FOB: "Fibre optic break out",
    UA: "Fire alarm unit", CAM: "CCTV camera", BC: "Battery charger", GWY: "Network gateway", PS: "Power supply", PA: "Patch panel", PE: "Photo electric cell", UPS: "UPS" };
  let rows = null, built = null, B = { areas: {}, equip: {}, inst: {}, svc: {}, spec: {} }, elNames = {}, loadingB = null;
  const SHOW = 500; let more = 0;
  let path = lsGet("adAsP", []) || [];
  const keepPath = () => { lsSet("adAsP", path); sel = ""; lsSet("adAsSel", ""); };

  /* the names list (browse.json), from where the plant lists come from, kept on this device */
  function names(){ if (loadingB) return loadingB;
    const src = (lsGet("adEquipSrc", "") || "https://raw.githubusercontent.com/bijankle/ProjectLibrary/HEAD/search-data.json").replace(/search-data\.json(\?.*)?$/, "browse.json");
    loadingB = IDB.get("browse").then(c => { if (c && c.d) B = c.d; if (c && c.d && now() - c.at < 864e5) return;
      return fetch(src, { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(d => { if (d){ B = d; IDB.set("browse", { at: now(), d }); rows = null; App.render(); } }).catch(() => {}); });
    return loadingB; }

  const area = s => { const m = /\bF(\d{2})\b/.exec(s || ""); return m ? "F" + m[1] : ""; };
  function elCode(k){ let m = /^F\d{2,3}[A-Z]+\d+[A-Z]?-(R|W|B|RWB)\d+$/.exec(k); if (m) return "DB";
    m = /^F\d{2,3}[A-Z]+[0-9A-Z]*-([A-Z]+)[\d/]*$/.exec(k); if (m) return m[1] === "VSD" ? "VS" : m[1];
    m = /^F\d{2,3}-([A-Z]+)/.exec(k); return m ? m[1] : "?"; }
  /* an asset's area and code, from its tag (as the Project Library reads them) */
  function facet(t, k, g){
    switch (t){
      case "mel": { const m = /^F(\d\d)-([A-Z]+)/.exec(k); return m ? ["F" + m[1], m[2]] : [area(g("Area")), "?"]; }
      case "ins": { const m = /^([A-Z]*)\s*(\d{2})/.exec(k); return [m && m[2] !== "00" ? "F" + m[2] : m ? "F00" : "", m && m[1] ? m[1] : "?"]; }
      case "cv": { const m = /^([A-Z]+)\s*(\d{2})/.exec(k); return [m ? "F" + m[2] : "", g("Valve type") || (m && m[1]) || "?"]; }
      case "line": { const m = /^(\d{2,3})-[A-Z]?\d+-([A-Z0-9]+)-/.exec(k); return m ? ["F" + m[1], m[2]] : ["", g("Service") || "?"]; }
      case "mv": return [area(k), g("Valve type") || "?"];
      case "spi": return [area((/2000-F\d\d/.exec(g("P&IDs") || g("P&ID") || "") || [""])[0].slice(5)), g("Type") || "?"];
      case "hose": return [area(g("Location ref")), g("Service") || "?"];
      case "ctl": return [g("Area") || "?", (g("Kind") || "?").split(",")[0]];
      case "elec": { const m = /^F(\d{2,3})/.exec(k); return [m ? "F" + m[1] : "", elCode(k)]; }
      case "cable": { const m = /^F(\d{2,3})/.exec(k), c = /-([A-Z]{1,2})\d{1,2}(?:-[A-Z]{1,2})?$/.exec(k); return [m ? "F" + m[1] : "", c ? (CBK[c[1]] ? c[1] : "?") : "?"]; }
    } return null; }
  let FF = {}, IX = new Map(); const kx = k => String(k || "").toUpperCase().replace(/\s+/g, "");
  function build(){ const d = Equip.raw(); if (!d || !d.data) return null; if (rows && built === d) return rows; rows = []; built = d; const ec = {};
    TYPES.forEach(([t]) => { const ty = (d.types || {})[t], list = (d.data || {})[t] || []; if (!ty) return; const f = ty.f || [];
      list.forEach(r => { const g = n => { const i = f.indexOf(n); return i < 0 ? "" : String(r[i] == null ? "" : r[i]).trim(); }, key = String(r[0] || "").trim(); if (!key) return;
        const fc = facet(t, key, g); if (!fc) return;
        const name = t === "line" ? [g("Service description"), g("From") && "from " + g("From"), g("To") && "to " + g("To")].filter(Boolean).join(", ") : t === "cable" ? [g("From name") || g("From"), g("To name") || g("To")].filter(Boolean).join(" → ") : g(NAMEF[t]);
        rows.push({ rw: r, t, key, name, a: fc[0] || "?", k: fc[1] || "?", sp: t === "line" ? g("Pipe spec") || "?" : "", sz: SIZE[t] ? g(SIZE[t]) || "?" : "" });
        if (t === "elec"){ const ty2 = g("Type"); if (ty2){ const c = elCode(key); (ec[c] = ec[c] || {})[ty2] = (ec[c][ty2] || 0) + 1; } } }); });
    elNames = {}; for (const c in ec){ const n = Object.entries(ec[c]).sort((a, b) => b[1] - a[1])[0][0]; elNames[c] = n === n.toUpperCase() && n.length > 4 ? n.charAt(0) + n.slice(1).toLowerCase() : n; }
    const col = new Intl.Collator(undefined, { numeric: true }); rows.sort((x, y) => col.compare(x.key, y.key));
    FF = {}; TYPES.forEach(([t]) => { const ty2 = (d.types || {})[t]; if (ty2) FF[t] = { f: ty2.f || [], n: ty2.n || TN[t] }; }); IX = new Map(rows.map(r => [kx(r.key), r])); return rows; }

  const insName = p => { if (!p || p === "?") return "No letter code"; if (INS[p]) return INS[p]; const L = B.inst || {};
    const out = [L[p[0]] ? L[p[0]][0] : p[0]]; let rest = p.slice(1); if (rest[0] === "D" && rest.length > 1){ out.push("Differential"); rest = rest.slice(1); }
    return out.concat([...rest].map(c => L[c] ? L[c][1] : c)).filter(Boolean).join(" "); };
  const kName = (t, v) => ({ mel: () => (B.equip || {})[v], ins: () => insName(v), cv: () => CV[v], line: () => (B.svc || {})[v], hose: () => (B.svc || {})[v],
    elec: () => ELN[v] || elNames[v] || (B.equip || {})[v], cable: () => CBK[v], spi: () => SPI[v] }[t] || (() => ""))() || "";
  const nameOf = (f, t, v) => v === "?" ? (f === "a" ? "No area in the tag" : "Not given") : f === "k" ? kName(t, v) : f === "a" ? (B.areas || {})[v] || "" : f === "sp" ? (B.spec || {})[v] || "" : "";
  /* a short form of a name for the pills: the first one or two words, about 14 characters ("Pump Process") */
  const SKIP = /^(and|of|the|for|with|to|in|on|at)$/i;
  const shortName = n => { const w = String(n || "").replace(/\(.*?\)/g, " ").replace(/[·&/,;:]+|\s[-–]\s/g, " ").split(/\s+/).filter(x => x && !SKIP.test(x));
    if (!w.length) return ""; let s = w[0];
    if (w[1]) s += (s + " " + w[1]).length <= 14 ? " " + w[1] : " " + w[1].slice(0, Math.max(3, 12 - s.length)) + ".";
    const tag = w.slice(2).find(x => /\d/.test(x) || /^[A-Z]$/.test(x)); if (tag) s += " " + tag;
    return s === s.toUpperCase() && /[A-Z]{3}/.test(s) ? s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : s; };

  const ty = () => path.length ? path[0].v : "";
  const steps = () => ty() ? STEPS[ty()] || [] : [];
  const nextStep = () => ty() ? steps()[path.length - 1] : ["t", "Asset type"];
  const match = r => path.every(p => p.v == null || String(r[p.f]) === String(p.v));
  const ALPHA = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const label = (f, v) => f === "t" ? TN[v] : v === "?" ? "Other" : v;
  const searched = list => (App.q || "").trim() ? list.filter(r => smartHit(r.key + " " + r.name + " " + TN[r.t], App.q)) : list;
  const current = () => { const all = build(); return all ? searched(all.filter(match)) : null; };
  const fcount = () => path.filter(p => p.v != null || p.f !== "t").length + ((App.q || "").trim() ? 1 : 0);

  /* the Filters side bar: the picked steps as chips, then the pills of the next step */
  function filters(el){ let body = $(".fp-groups", el); if (!body){ body = document.createElement("div"); body.className = "fp-groups"; el.appendChild(body); }
    names(); const list = current();
    if (!list){ body.innerHTML = '<p class="dim fshown">Loading the plant lists…</p>'; if (!Equip.raw()) Equip.load().then(() => App.render()); return; }
    const crumbs = path.map((p, i) => { const nm = p.f === "t" || p.v == null || p.v === "?" ? "" : shortName(nameOf(p.f, ty(), p.v));
      const txt = p.f === "t" ? TN[p.v] : p.v == null ? "Any " + steps()[i - 1][1].toLowerCase() : label(p.f, p.v) + (nm ? " " + nm : "");
      return '<button type="button" class="pill fpill on as-cr" data-i="' + i + '" title="Take this step off, and the ones after it"><span class="fp-t">' + esc(txt) + '</span> <i aria-hidden="true">✕</i></button>'; }).join("");
    const st = nextStep(); let opts = "";
    if (st){ const c = {}; list.forEach(r => { const v = st[0] === "t" ? r.t : r[st[0]]; c[v] = (c[v] || 0) + 1; });
      const vals = st[0] === "t" ? TYPES.map(x => x[0]).filter(v => c[v]).sort((x, y) => ALPHA.compare(TN[x], TN[y])) : Object.keys(c).sort((x, y) => (x === "?") - (y === "?") || ALPHA.compare(x, y));
      opts = '<div class="fg2" data-k="step"><div class="fgh"><span>' + esc(st[1]) + '</span>' + (st[0] !== "t" ? '<button type="button" class="link as-any" title="Skip this step">Any</button>' : "") + '</div>'
        + vals.map(v => { const nm = st[0] === "t" || v === "?" ? "" : shortName(nameOf(st[0], ty(), v)), full = st[0] === "t" ? TN[v] : nameOf(st[0], ty(), v);
          return '<button type="button" class="pill fpill as-o" data-v="' + esc(v) + '" title="' + esc(label(st[0], v) + (full && full !== label(st[0], v) ? ", " + full : "")) + '"><span class="fp-t"><b class="as-c">' + esc(label(st[0], v)) + '</b>' + (nm ? " " + esc(nm) : "") + '</span> <b>' + c[v].toLocaleString() + '</b></button>'; }).join("") + '</div>'; }
    body.innerHTML = (crumbs ? '<div class="fg2 as-crs"><div class="fgh"><span>Picked</span><button type="button" class="link fall">Clear all</button></div>' + crumbs + '</div>' : "") + opts
      + '<p class="dim fshown">' + list.length.toLocaleString() + " of " + build().length.toLocaleString() + " assets</p>";
    $$(".as-o", body).forEach(b => b.onclick = () => { path.push({ f: st[0], v: b.dataset.v }); more = 0; keepPath(); App.render(); });
    const any = $(".as-any", body); if (any) any.onclick = () => { path.push({ f: st[0], v: null }); more = 0; keepPath(); App.render(); };
    $$(".as-cr", body).forEach(b => b.onclick = () => { path = path.slice(0, +b.dataset.i); more = 0; keepPath(); App.render(); });
    const fa = $(".fall", body); if (fa) fa.onclick = () => { path = []; more = 0; keepPath(); App.render(); }; }

  /* one asset, as the Project Library shows it: its kind and tag, then Details (every field with a value; a tag in a value
     opens that asset) and, for a line, its Pipe spec; the arrow goes back to the list as it was */
  let sel = lsGet("adAsSel", ""), tab = "d";
  const open = k => { sel = k || ""; tab = "d"; lsSet("adAsSel", sel); App.render(); };
  function detail(body, r){ const F = FF[r.t] || { f: [], n: TN[r.t] }, spec = r.t === "line" && r.sp && r.sp !== "?" ? r.sp : "", hasSpec = spec && PipeSpec.ready() && PipeSpec.classes().includes(spec);
    if (spec && !PipeSpec.ready()) PipeSpec.load();
    const val = v => { const s = String(v == null ? "" : v).trim(); if (!s) return ""; return s.split(/(,\s*)/).map(part => IX.has(kx(part)) && kx(part) !== kx(r.key) ? '<button type="button" class="as-go" data-k="' + esc(IX.get(kx(part)).key) + '">' + esc(part) + '</button>' : esc(part)).join(""); };
    const det = F.f.map((f, i) => [f, r.rw[i]]).filter(([f, v], i) => i > 0 && v != null && String(v).trim() !== "");
    let html = '<div class="as-dt"><div class="as-hd"><button type="button" class="ic-b as-back" title="Back to the list" aria-label="Back to the list">‹</button><div><div class="as-kind">' + esc(F.n) + '</div><div class="as-tag">' + esc(r.key) + '</div>' + (r.name ? '<div class="dim as-nm">' + esc(r.name) + '</div>' : "") + '</div></div>'
      + '<div class="av-sub as-tabs"><button type="button" data-tb="d"' + (tab === "d" ? ' class="on"' : "") + '>Details</button>' + (spec ? '<button type="button" data-tb="s"' + (tab === "s" ? ' class="on"' : "") + '>Pipe spec</button>' : "") + '</div>';
    if (tab === "s" && spec){ const C = hasSpec ? PipeSpec.spec(spec) : null;
      html += !C ? '<p class="dim">' + (PipeSpec.ready() ? "Pipe spec " + esc(spec) + " isn't in the spec." : "Loading the pipe spec…") + '</p>'
        : '<div class="as-sp"><div class="as-kind">Piping class ' + esc(spec) + '</div><p>' + esc(PipeSpec.clean(C.title)) + '</p><dl class="as-dl"><dt>Material</dt><dd>' + esc(PipeSpec.clean(C.material)) + '</dd><dt>Code</dt><dd>' + esc(PipeSpec.clean(C.codes)) + '</dd>'
          + (C.design || []).map(x => '<dt>' + esc(PipeSpec.clean(x[0])) + '</dt><dd>' + esc(x.slice(1).map(PipeSpec.clean).join(" to ")) + '</dd>').join("") + '<dt>Corrosion allowance</dt><dd>' + esc(C.ca) + ' mm</dd><dt>Testing</dt><dd>' + esc(PipeSpec.clean(C.test)) + '</dd><dt>NDE</dt><dd>' + esc(PipeSpec.clean(C.nde)) + '</dd></dl>'
          + '<div class="tw-wrap"><table class="tbl ct vd-tbl as-ct"><thead><tr><th>Description</th><th>Size range</th><th>Standard</th><th>Type</th><th>Ends</th><th>Material</th></tr></thead><tbody>'
          + C.comps.map(c => '<tr' + (r.rw && +String(r.sz).replace(/\D/g, "") >= c.lo && +String(r.sz).replace(/\D/g, "") <= c.hi ? ' class="as-fit"' : "") + '><td>' + [c.d, c.size, c.dim, c.type, c.ends, c.mat].map(x => esc(PipeSpec.clean(x))).join("</td><td>") + '</td></tr>').join("") + '</tbody></table></div></div>'; }
    else html += '<dl class="as-dl">' + det.map(([f, v]) => '<dt>' + esc(f) + '</dt><dd>' + val(v) + '</dd>').join("") + '</dl>';
    body.innerHTML = html + '</div>';
    $(".as-back", body).onclick = () => open("");
    $$("[data-tb]", body).forEach(b => b.onclick = () => { tab = b.dataset.tb; App.render(); });
    $$(".as-go", body).forEach(b => b.onclick = () => open(b.dataset.k));
    const ct = $(".as-ct", body); if (ct) gridCols(ct, "assetSpec", { max: 360 }); }
  /* the matching assets, as a table like every other (sort, fit, resize, move a column) */
  function page(body){ names(); const list = current();
    if (list && sel){ const r = IX.get(kx(sel)); if (r) return detail(body, r); }
    if (!list){ body.innerHTML = '<p class="dim">Loading the plant lists…</p>'; if (!Equip.raw()) Equip.load().then(() => App.render()); return; }
    const t = ty(), cols = [["key", "Tag"], ["name", "Name"]].concat(t ? [] : [["t", "Type"]]).concat((t ? steps() : [["a", "Area"]]).map(([f, n]) => [f, n]));
    const cell = (r, f) => f === "t" ? TN[r.t] : f === "key" || f === "name" ? r[f] : (r[f] === "?" ? "" : r[f]) + (f === "a" || f === "k" || f === "sp" ? (s => s ? " " + s : "")(r[f] === "?" ? "" : shortName(nameOf(f, r.t, r[f]))) : "");
    /* (the whole list sorts by the heading picked, then the first rows show) */
    const st = (tblKit.sort || {}).assets, ci = st ? cols.findIndex(([, n]) => n === st.c) : -1;
    const sorted = ci < 0 ? list : list.slice().sort((x, y) => st.d * ALPHA.compare(String(cell(x, cols[ci][0]) || "~"), String(cell(y, cols[ci][0]) || "~")));
    const n = Math.min(sorted.length, SHOW + more);
    body.innerHTML = '<div class="tw-wrap"><table class="tbl ct vd-tbl as-tbl"><thead><tr>' + cols.map(([f, nm]) => '<th data-col="' + esc(nm) + '">' + esc(nm) + '</th>').join("") + '</tr></thead><tbody>'
      + sorted.slice(0, n).map(r => '<tr data-k="' + esc(r.key) + '" title="Open ' + esc(r.key) + '">' + cols.map(([f]) => '<td>' + (f === "key" ? '<b>' + esc(r.key) + '</b>' : esc(cell(r, f))) + '</td>').join("") + '</tr>').join("") + '</tbody></table></div>'
      + (sorted.length > n ? '<button type="button" class="link as-more">' + (sorted.length - n).toLocaleString() + ' more…</button>' : "");
    const m = $(".as-more", body); if (m) m.onclick = () => { more += SHOW; App.render(); };
    $$(".as-tbl tbody tr[data-k]", body).forEach(tr => tr.onclick = () => open(tr.dataset.k));
    gridCols($(".as-tbl", body), "assets", { max: 520, onSort: () => App.render() }); }
  return { page, filters, fcount, reset: () => { more = 0; }, sel: () => sel, show: k => { sel = k || ""; tab = "d"; lsSet("adAsSel", sel); } };
})();
