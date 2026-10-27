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
  /* 1 the sizes the class covers */
  const sizes = cl => !C(cl) ? [] : DNS.filter(n => C(cl).comps.some(c => n >= c.lo && n <= c.hi) || valves(cl).some(v => n >= D.valve[v].lo && n <= D.valve[v].hi));
  /* 2 the items the spec has at that size: its components, then its valves and gasket */
  function items(cl, dn){ const c0 = C(cl); if (!c0) return []; const out = [], seen = new Set();
    c0.comps.forEach(c => { const d = clean(c.d); if ((dn == null || (dn >= c.lo && dn <= c.hi)) && !seen.has(d)){ seen.add(d); out.push({ v: d, t: d, g: "Components" }); } });
    valves(cl).filter(v => dn == null || (dn >= D.valve[v].lo && dn <= D.valve[v].hi)).forEach(v => out.push({ v: "V:" + v, t: v + " " + vrow(v, "Type").split(" - ")[0], sub: vrow(v, "Type"), g: "Valves" }));
    gaskets(cl).forEach(g => out.push({ v: "G:" + g, t: "Gasket " + g, sub: "to suit " + cl + " flanges", g: "Gaskets" })); return out; }
  /* 3 the spec lines left for that item at that size; when more than one, what tells them apart is the last pick */
  const lines = (cl, dn, it) => !C(cl) || !it || /^[VG]:/.test(it) ? [] : C(cl).comps.filter(c => clean(c.d) === it && dn >= c.lo && dn <= c.hi);
  function variants(ls){ if (ls.length < 2) return []; const ends = new Set(ls.map(c => clean(c.ends))), types = new Set(ls.map(c => clean(c.type)));
    const lab = c => ends.size === ls.length ? clean(c.ends) : types.size === ls.length ? clean(c.type) : clean(c.ends) + ", " + clean(c.type); return ls.map(c => ({ v: lab(c), t: lab(c), c })); }
  /* a row's spec line: { line (the RFQ words), rows (the (i)), auto (what filled itself in), need } */
  function resolve(r){ if (!D) return { need: "the pipe spec (loading)" }; const c0 = C(r.cl); if (!c0) return { need: "class" }; if (!r.dn) return { need: "size" }; if (!r.it) return { need: "item" };
    if (/^V:/.test(r.it)){ const v = r.it.slice(2), V = D.valve[v]; if (!V) return { need: "item" };
      const R = k => vrow(v, k); return { v, auto: R("End Connections"), unit: "ea", line: "DN" + r.dn + " " + R("Type") + ", " + R("End Connections") + ", body " + R("Body Material") + (R("Manufacturer") ? ", " + R("Manufacturer") + " " + R("Model") : "") + ", valve datasheet " + v,
        rows: [["Valve datasheet", v + " (spec page " + V.page + ")"], ["Type", R("Type")], ["Ends", R("End Connections")], ["Body", R("Body Material")], ["Seats", R("Seat Material")], ["Made by", [R("Manufacturer"), R("Model")].filter(Boolean).join(" ")], ["Size range", R("Size Range (mm)")]].filter(x => x[1]) }; }
    if (/^G:/.test(r.it)){ const g = r.it.slice(2); return { g, auto: "to suit " + r.cl, unit: "ea", line: "DN" + r.dn + " gasket " + g + ", to suit piping class " + r.cl + " flanges", rows: [["Gasket", g], ["To suit", r.cl + " flanges"]] }; }
    const ls = lines(r.cl, r.dn, r.it); if (!ls.length) return { need: "item" }; const vs = variants(ls), c = ls.length === 1 ? ls[0] : (vs.find(x => x.v === r.vt) || {}).c;
    if (!c) return { need: "ends or type", vs };
    return { c, vs, auto: vs.length ? "" : [clean(c.type), clean(c.ends)].filter(Boolean).join(", "), unit: /^pipe/i.test(clean(c.d)) ? "m" : "ea",
      line: "DN" + r.dn + " " + clean(c.d) + ", " + clean(c.type) + ", " + clean(c.ends) + ", " + clean(c.mat) + ", " + clean(c.dim) + ", to piping class " + r.cl,
      rows: [["Piping class", r.cl + ": " + clean(c0.title)], ["Item", clean(c.d)], ["Size", "DN" + r.dn + " (the spec line covers " + clean(c.size) + ")"], ["Type", clean(c.type)], ["Ends", clean(c.ends)], ["Material", clean(c.mat)], ["Standard", clean(c.dim)],
        ["Spec", (D.meta.doc || "") + " Rev " + (D.meta.rev || "") + ", page " + c0.page]].filter(x => x[1]) }; }
  const title = cl => C(cl) ? clean(C(cl).title) : "";
  return { load, ready, classes, title, spec: cl => C(cl), sizes, items, lines, variants, resolve, clean, DNS, meta: () => D && D.meta };
})();
