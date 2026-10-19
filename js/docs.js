/* The drawings and documents for a piece of plant equipment, for the action's Overview and its work pack, from the
   plant document data, picked the way the equipment's own page there picks them:
     process     the P&IDs and PFD sheets it is on: the ones its equipment list record names, and the sheets its tag
                 is read on
     electrical  the single line, termination line and block diagrams and the schematics its tag is read on (or its
                 electrical list record names)
     docs        its datasheets and IOM manuals: the ones naming the tag first, then its parent's, then its package's
                 (from the package's number series that serves the equipment's area)

     await Docs.load();  Docs.forTag("F13-MB-401")  ->  { process: [doc], electrical: [doc], docs: [doc] }
     Docs.forTags(tags)  ->  Map tag -> the same
     doc: { n: number, t: title, rev, url: SharePoint (the controlled copy, in SharePoint's viewer), pdf: a PDF copy
            anyone can open, or null, kind: "P&ID" | "PFD" | "SLD" | "TLD" | "Schematic" | "Block diagram" |
            "Datasheet" | "IOM", via: "list" | "sheet" | "list, sheet" (drawings), why: "tag" | "parent" | "model" |
            "package" (docs), page (when the tag is on a later page), pdfRev (the copy's revision, when not rev) }

   The equipment lists (Equip, isol.js) give each record's P&ID, PFD, package and model; without them the documents
   still come from what is read on the drawings and from the datasheet and manual registers. A file that fails to
   load leaves out only what it gives. */
"use strict";
const Docs = (() => {
  const BASE = "https://raw.githubusercontent.com/bijankle/ProjectLibrary/HEAD/";   // where the plant document data lives
  const SITE = "https://bijankle.github.io/ProjectLibrary/";   // where its PDF copies open
  const FILES = { ct: "contents.json", ix: "PIDs/index.json", dt: "doc-tags.json", ds: "ds-links.json", iom: "iom.json", held: "sp-held.json", sp: "sp.json" };
  const ORDER = ["mel", "elec", "cable", "ins", "cv", "mv", "line", "spi", "hose", "ctl"], PAIR = { cv: "ins", hose: "spi" };
  const KINDS = [["P&ID", /-PID-/, "process"], ["PFD", /-PFD-/, "process"], ["SLD", /-SLD-/, "electrical"], ["TLD", /-TLD-/, "electrical"], ["Schematic", /-SCM-/, "electrical"], ["Block diagram", /-BLK-/, "electrical"], ["Datasheet", /-DSH-/, "docs"]];
  const DWG = /2000-[A-Z0-9]{2,6}-[A-Z]{3}-[A-Z]{2}-\d{4,5}[A-Z]?/g, PDWG = /2000-[A-Z0-9]{2,6}-P[FI]D-[A-Z]{2}-\d{4,5}/g;
  const norm = s => String(s || "").toUpperCase().replace(/[\s\-_/.]+/g, "");
  const src = f => (lsGet("adPlBase", "") || BASE) + f;
  let D = {}, loadP = null, IX = new Map(), HELD = new Map(), SPN = new Map(), CTBY = new Map(), recRaw = null, REC = new Map();
  /* the document data files, fetched once and together; resolves when they (and the equipment lists) are in */
  function load(){ return loadP || (loadP = Promise.all([...Object.entries(FILES).map(([k, f]) => fetch(src(f)).then(r => { if (!r.ok) throw new Error(f + " " + r.status); return r.json(); })
      .then(d => { D[k] = d; }).catch(e => console.warn("document data", e))), typeof Equip !== "undefined" ? Equip.load().catch(() => {}) : null])
    .then(() => { if (!Object.keys(D).length){ loadP = null; throw new Error("no document data"); } index(); })); }
  /* lookups by number and by tag */
  function index(){ const ix = (D.ix && D.ix.pids) || {};
    IX = new Map(Object.keys(ix).map(k => [norm(k), Object.assign({ number: k }, ix[k])]));
    HELD = new Map(Object.entries(D.held || {}).map(([k, v]) => [norm(k), v])); SPN = new Map(Object.entries(D.sp || {}).map(([k, v]) => [norm(k), v]));
    CTBY = new Map(); Object.entries((D.ct && D.ct.d) || {}).forEach(([d, e]) => [...(e.k || []), ...(e.o || [])].forEach(k => { const n = norm(k), a = CTBY.get(n); if (a) a.push(d); else CTBY.set(n, [d]); })); }
  /* the equipment list records by tag, rebuilt when the lists are refreshed */
  function records(){ const raw = typeof Equip !== "undefined" && Equip.raw ? Equip.raw() : null; if (raw === recRaw) return REC; recRaw = raw; REC = new Map();
    if (raw && raw.data) Object.entries(raw.data).forEach(([t, rows]) => { const T = (raw.types || {})[t]; if (!T) return;
      rows.forEach(r => { const k = norm(r[0]); if (!k) return; const a = REC.get(k), x = { t, r, f: T.f, hid: !!T.hidden }; if (a) a.push(x); else REC.set(k, [x]); }); });
    return REC; }
  const get = (x, n) => { if (!x) return ""; const i = x.f.indexOf(n); return i < 0 ? "" : String(x.r[i] || ""); };
  const kindOf = n => KINDS.find(([, re]) => re.test(n)) || null;
  /* SharePoint's viewer page for a file (a bare PDF link downloads, or opens blank in a phone's PDF app) */
  const enc = u => { try { return encodeURI(decodeURI(u)); } catch (e) { return encodeURI(u); } };
  const view = u => { if (!/sharepoint\.com/i.test(u) || /[?&](web=1|id=)/.test(u)) return u;
    const m = u.match(/^(https:\/\/[^/]+)(\/sites\/[^/]+\/[^/?#]+)(\/[^?#]+\.pdf)(?:[?#].*)?$/i); if (!m) return u + (u.includes("?") ? "&" : "?") + "web=1";
    try { const lib = decodeURIComponent(m[2]), path = decodeURIComponent(m[2] + m[3]); return m[1] + encodeURI(lib) + "/Forms/AllItems.aspx?id=" + encodeURIComponent(path) + "&parent=" + encodeURIComponent(path.replace(/\/[^/]*$/, "")); } catch (e) { return u; } };
  /* the revision in a SharePoint file name: 2000-F13-PID-PR-10004_2.pdf is Rev 2, …_MS_1.pdf is MS_1 */
  const spRev = (n, u) => { const f = decodeURIComponent(String(u).split("?")[0].split("/").pop()).replace(/\.pdf$/i, ""), x = f.slice(n.length + 1); if (!x || f.slice(0, n.length).toUpperCase() !== n.toUpperCase()) return "";
    const m = x.match(/^(\d+[A-Z]?)(?:_[A-Z]{2,4})?$/i); return m ? m[1] : x; };
  /* one document: its title, revision, SharePoint link and PDF copy */
  function doc(n, o = {}){ const d = IX.get(norm(n)), raw = o.u || HELD.get(norm(n)) || SPN.get(norm(n)) || "", sr = raw && !o.u ? spRev(n, raw) : "";
    const page = o.page > 1 ? o.page : 0, x = { n, t: o.t || (d && d.title) || "", rev: sr || o.rev || (d && d.rev) || "", url: raw ? view(enc(raw)) : "", pdf: d && d.file ? SITE + encodeURI(d.file) + (page ? "#page=" + page : "") : null, kind: o.kind };
    if (page) x.page = page; if (x.pdf && d.rev && d.rev !== x.rev) x.pdfRev = d.rev; return x; }
  /* the drawings: what the tag's list records name (P&ID, PFD, single line diagram, schematic) and what it is read on */
  function drawings(key, recs, it){ const by = new Map(), add = (n, via, page) => { const k = kindOf(n); if (!k || n === key) return; let e = by.get(n); if (!e) by.set(n, e = { n, k, via: new Set(), page: 0 }); e.via.add(via); if (page > 1 && !e.page) e.page = page; };
    recs.forEach(x => x.f.forEach((f, i) => { const v = String(x.r[i] || ""); if (!v) return;
      if (/^P&IDs?$/.test(f) || (f === "PFD" && x === it && it.t === "mel")) (v.match(PDWG) || []).forEach(n => add(n, "list"));
      else if (/^(Single line diagram|Schematic)$/.test(f) && /^(elec|elx)$/.test(x.t)) (v.match(DWG) || []).filter(n => /-(SLD|TLD|SCM|BLK)-/.test(n)).forEach(n => add(n, "list")); }));
    if (it) ((D.dt || {})[it.r[0]] || []).forEach(([n, p]) => { if (!/-P[FI]D-/.test(n) || it.t === "mel") add(n, "sheet", p); });   // (PFD sheets read: equipment only, as its page)
    (CTBY.get(norm(key)) || []).filter(d => !IX.size || IX.has(norm(d))).forEach(d => add(d, "sheet"));
    return [...by.values()]; }
  /* the IOM manuals: its package's (from the number series serving its area) and those naming it, the ones naming
     the tag (or its valve code, make or model) first */
  function ioms(key, it){ const I = D.iom; if (!I || !it || !/^(mel|ins|cv)$/.test(it.t)) return [];
    const tp = (I.tp && I.tp[key]) || [], area = String(key).split("-")[0];
    const pk = [...new Set([...get(it, "Package").split(/[\s,/;&]+/).filter(Boolean), ...tp.map(x => x.split(":")[0])])], ns = new Set(I.t[key] || []);
    const ser = (p, n) => { const S = I.s && (I.s[p] || I.s[p.replace(/[A-Z]$/, "")]), k = (String(n).match(/-(\d)\d{4}$/) || [])[1];
      if (!S || !k || !S[k] || S[k].includes(area) || tp.includes(p + ":" + k)) return true;
      const docs = I.p[p] || I.p[p.replace(/[A-Z]$/, "")] || [];
      return !Object.keys(S).some(x => x !== k && S[x].includes(area) && docs.some(d => new RegExp("-" + x + "\\d{4}$").test(d))); };
    pk.forEach(p => (I.p[p] || I.p[p.replace(/[A-Z]$/, "")] || []).forEach(n => { if (ser(p, n)) ns.add(n); }));
    const words = [key, get(it, "Valve code"), get(it, "Make / model"), get(it, "Model")].map(v => String(v || "").toUpperCase().trim()).filter(v => v.length > 3);
    const score = n => (I.t[key] || []).includes(n) ? 2 : words.some(w => String(I.d[n][0]).toUpperCase().includes(w)) ? 1 : 0;
    return [...ns].filter(n => I.d[n]).sort((x, y) => score(y) - score(x) || x.localeCompare(y))
      .map(n => Object.assign(doc(n, { t: I.d[n][0], rev: I.d[n][1], u: I.d[n][3], kind: "IOM" }), { why: ["package", "model", "tag"][score(n)] })); }
  /* the datasheets: those naming the tag (or its valve code), its parent's, then its package's, those whose title
     names the equipment first */
  function sheets(key, it){ const S = D.ds; if (!S) return [[], []]; const code = it && /^(mv|cv)$/.test(it.t) ? get(it, it.t === "mv" ? "Spec" : "Valve class").trim() : "";
    const m = Object.assign({}, S.t[key] || {}); if (S.x && S.x[key]) m.d = [...(m.d || []), ...S.x[key]];
    if (code && S.v && S.v[code]) m.d = [...(m.d || []), ...S.v[code]];
    const area = String(key).split("-")[0], nm = get(it, "Equipment name").toUpperCase().replace(/\s+/g, ""), I = D.iom;
    const inSer = n => { const v = (n.match(/^2000-([A-Z]{2}\d{3}[A-Z]?(?:\.\d+)?)-[A-Z0-9]{2,4}-(\d)\d{4}$/) || []), s = v[1] && I && I.s && I.s[v[1]];
      return !s || !s[v[2]] || s[v[2]].includes(area) || !Object.keys(s).some(x => x !== v[2] && s[x].includes(area)); };
    const named = n => nm.length > 4 && String(S.d[n][0]).toUpperCase().replace(/\s+/g, "").includes(nm);
    let a = [...new Set([...(m.d || []), ...(m.s || []), ...(m.f || [])])].filter(n => S.d[n]), pk = (m.p || []).filter(n => S.d[n] && !a.includes(n) && inSer(n));
    const own = new Set(a), why = n => (m.s || []).includes(n) ? "parent" : own.has(n) ? "tag" : "package";
    a = a.concat(pk.filter(named)); pk = pk.filter(n => !named(n));
    const one = n => Object.assign(doc(n, { t: S.d[n][0], rev: S.d[n][1], u: S.d[n][3], kind: "Datasheet" }), { why: why(n) });
    return [a.map(one), pk.map(one)]; }
  const KO = KINDS.map(k => k[0]), byNum = (a, b) => KO.indexOf(a.kind) - KO.indexOf(b.kind) || a.n.localeCompare(b.n, undefined, { numeric: true });
  /* one tag's documents, in three groups */
  function forTag(tag){ const out = { process: [], electrical: [], docs: [] }, k = norm(tag); if (!k) return out;
    const recs = (records().get(k) || []).slice().sort((a, b) => (ORDER.indexOf(a.t) + 1 || 99) - (ORDER.indexOf(b.t) + 1 || 99));
    const it = recs.find(x => !x.hid && !(PAIR[x.t] && recs.some(y => y.t === PAIR[x.t]))) || null, key = it ? String(it.r[0]).trim() : String(tag).trim().toUpperCase();
    const [ds, dsPk] = sheets(key, it), docs = [...ds, ...ioms(key, it), ...dsPk], seen = new Set(docs.map(d => d.n));
    drawings(key, recs, it).forEach(e => { const g = e.k[2];
      if (g === "docs"){ if (!seen.has(e.n)){ seen.add(e.n); docs.push(Object.assign(doc(e.n, { kind: "Datasheet", page: e.page }), { why: "tag" })); } return; }
      out[g].push(Object.assign(doc(e.n, { kind: e.k[0], page: e.page }), { via: [...e.via].sort().join(", ") })); });
    out.process.sort(byNum); out.electrical.sort(byNum);
    out.docs = docs.filter((d, i) => docs.findIndex(x => x.n === d.n) === i); return out; }
  /* several tags at once: Map tag -> forTag(tag) */
  const forTags = tags => new Map((tags || []).map(t => [t, forTag(t)]));
  return { load, forTag, forTags };
})();
