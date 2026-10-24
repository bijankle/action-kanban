/* The Drawings tab of an action (desktop): the drawings and documents of its equipment, sub equipment included (a
   ball mill's lube units, motors and fans). Two rows of pills narrow the list: the equipment (All or one tag), then the
   kind (All, P&ID, PFD, SLD, Schematic, Datasheet, IOM…). Each document is a bar: its number opens the controlled
   copy in SharePoint, ⓘ shows its title, PDF downloads a copy, and when there is a copy the arrow opens it in place
   with the essentials (pages, zoom, fit, drag to pan). Bars start closed. A tick marks a document as needed for the
   job (a.dwgPick, the ticked numbers, kept with the action); Download ticked saves each ticked one with a copy as its
   own PDF, to print separately, and says at the top which didn't download and why. The work pack lists the register. */
"use strict";
const Drawings = (() => {
  const KORD = ["P&ID", "PFD", "SLD", "TLD", "Schematic", "Block diagram", "Datasheet", "IOM"];
  const GROUP = { "P&ID": "process", "PFD": "process", "SLD": "electrical", "TLD": "electrical", "Schematic": "electrical", "Block diagram": "electrical", "Datasheet": "docs", "IOM": "docs" };
  const st = new Map(), open = new Set(), views = new Map();   // per action: { eq, kind }; open bars; live viewers by key
  const words = s => String(s || "").toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  const tagsOf = a => Array.isArray(a.f.equipment) ? [...new Set(a.f.equipment.filter(Boolean))] : [];
  /* a tag's sub equipment: same area, and a name that starts with the main one's (BALL MILL → BALL MILL LUBE UNIT), or the
     tag with a letter on the end (F13-MB-401A, its motor) */
  function family(tag){ const e = Equip.get(tag) || {}, nw = words(e.n), area = (tag.match(/^([A-Z]\d{2,3})-/) || [])[1], out = [tag];
    if (!area) return out; const strong = nw.length >= 2 || (nw.length === 1 && nw[0].length > 6), re = new RegExp("^" + tag.replace(/[-]/g, "\\-") + "[A-Z]$");
    Equip.list().forEach(x => { if (x.t === tag || !x.t.startsWith(area + "-") || out.length > 60) return;
      if (re.test(x.t) || (strong && nw.length && (w => w.length > nw.length && nw.every((v, i) => w[i] === v))(words(x.n)))) out.push(x.t); });
    return out; }
  /* every document for a listed tag, its sub equipment's merged in (each once), in kind order, the tag's own first */
  function listFor(tag){ const fam = family(tag), seen = new Map();
    fam.forEach((t, fi) => { const r = Docs.forTag(t); ["process", "electrical", "docs"].forEach(g => (r[g] || []).forEach(d => { if (seen.has(d.n)) return; seen.set(d.n, Object.assign({ of: t, own: fi === 0 }, d)); })); });
    return [...seen.values()].sort((x, y) => KORD.indexOf(x.kind) - KORD.indexOf(y.kind) || (y.own - x.own) || x.n.localeCompare(y.n)); }
  /* for the work pack and the tab: tag → its documents (after Docs.load and Equip.load) */
  function collect(a){ const m = new Map(); tagsOf(a).forEach(t => m.set(t, listFor(t))); return m; }
  const key = (t, d) => t + "|" + d.n;
  let cnt = new Map();   // documents per action, for the tab's count
  const count = a => cnt.get(a._p + ":" + a.u) || 0;
  function renderFor(el, a){ const tags = tagsOf(a);
    if (!tags.length){ el.innerHTML = '<div class="dw"><p class="dim">No equipment tags on this action.' + tipI("Add the equipment tags on the Overview (Equipment) and their drawings and documents show here.") + '</p></div>'; return; }
    el.innerHTML = '<div class="dw"><p class="dim">Finding the drawings and documents…</p></div>';
    Promise.all([Docs.load(), Equip.load().catch(() => {})]).then(() => { if (el.isConnected) draw(el, a); }).catch(e => { console.warn("documents", e); if (el.isConnected) el.innerHTML = '<div class="dw"><p class="dim">Couldn\'t load the drawing and document lists.</p></div>'; }); }
  function draw(el, a){ const ref = a._p + ":" + a.u, m = collect(a), s = st.get(ref) || { eq: "all", kind: "all" }; st.set(ref, s);
    const tags = [...m.keys()]; if (s.eq !== "all" && !m.has(s.eq)) s.eq = "all";
    const rows = []; tags.forEach(t => { if (s.eq === "all" || s.eq === t) m.get(t).forEach(d => rows.push([t, d])); });
    const total = new Set(), all = new Map(); m.forEach(l => l.forEach(d => { total.add(d.n); if (!all.has(d.n)) all.set(d.n, d); })); const had = cnt.get(ref); cnt.set(ref, total.size); if (had !== total.size) setTimeout(() => { const b = $('.av-tab[data-sub="drawings"]'); if (b) b.innerHTML = 'Drawings' + (total.size ? ' <b>' + total.size + '</b>' : ""); }, 0);
    const kinds = KORD.filter(k => rows.some(([, d]) => d.kind === k)); if (s.kind !== "all" && !kinds.includes(s.kind)) s.kind = "all";
    const shown = rows.filter(([, d]) => s.kind === "all" || d.kind === s.kind), seen = new Set(), list = shown.filter(([t, d]) => s.eq !== "all" || (!seen.has(d.n) && seen.add(d.n)));
    const pill = (k, v, label, n, on) => '<button type="button" class="pill' + (on ? " on" : "") + '" data-' + k + '="' + esc(v) + '">' + esc(label) + ' <b>' + n + '</b></button>';
    el.innerHTML = '<div class="dw"><div class="dw-p">' + pill("eq", "all", "All equipment", total.size, s.eq === "all") + tags.map(t => pill("eq", t, t, m.get(t).length, s.eq === t)).join("") + '</div>'
      + '<div class="dw-p dw-p2">' + pill("kind", "all", "All kinds", new Set(rows.map(([, d]) => d.n)).size, s.kind === "all") + kinds.map(k => pill("kind", k, k, new Set(rows.filter(([, d]) => d.kind === k).map(([, d]) => d.n)).size, s.kind === k)).join("") + '</div>'
      + (fails.get(ref) ? '<div class="dw-f"><div class="dw-fh"><b>' + fails.get(ref).length + ' of the ticked didn\'t download</b><button type="button" class="ic-b sm" data-k="fx" title="Dismiss">✕</button></div>' + fails.get(ref).map(f => '<div>' + (f.d.url ? '<a href="' + esc(f.d.url) + '" target="_blank" rel="noopener">' + esc(f.d.n) + '</a>' : esc(f.d.n)) + ': ' + esc(f.why) + '</div>').join("") + '</div>' : "")
      + '<div class="dw-s">' + ((a.dwgPick || []).length ? '<b>' + a.dwgPick.length + '</b> ticked for this job <button type="button" class="btn sm" data-k="dl">Download ticked (' + a.dwgPick.filter(n => (all.get(n) || {}).pdf).length + ')</button>' + (Store.S.edit ? ' <button type="button" class="link" data-k="clr">Clear ticks</button>' : "") : "") + tipI("Tick the drawings and documents this job needs. The ticks are kept with the action, and Download ticked saves each one as its own PDF to print.\n\nNumbers open the controlled copy in SharePoint. PDF downloads a copy for anyone without SharePoint access: check its revision before use. Sub equipment (lube units, motors, fans) is included with its main equipment.") + '</div>'
      + (list.length ? '<div class="dw-l">' + list.map(([t, d]) => bar(t, d, a)).join("") + '</div>' : '<p class="dim">No drawings or documents found' + (s.eq !== "all" ? " for " + esc(s.eq) : "") + '.</p>')
      + '</div>';
    $$("[data-eq]", el).forEach(b => b.onclick = () => { s.eq = b.dataset.eq; draw(el, a); });
    $$("[data-kind]", el).forEach(b => b.onclick = () => { s.kind = b.dataset.kind; draw(el, a); });
    const pick = (n, on) => Store.mutate("a:" + a._p, () => { const set = new Set(a.dwgPick || []); on ? set.add(n) : set.delete(n); a.dwgPick = [...set]; Store.touch(a); });
    $$(".dw-ck input", el).forEach(c => c.onchange = () => pick(c.dataset.n, c.checked));
    const dl = $("[data-k=dl]", el); if (dl) dl.onclick = () => download(el, a, all, dl);
    const fx = $("[data-k=fx]", el); if (fx) fx.onclick = () => { fails.delete(ref); draw(el, a); };
    const clr = $("[data-k=clr]", el); if (clr) clr.onclick = () => Store.mutate("a:" + a._p, () => { a.dwgPick = []; Store.touch(a); });
    $$(".dw-b", el).forEach(r => { const k = r.dataset.key, [t, d] = list.find(([t, d]) => key(t, d) === k) || [];
      const tg = $(".dw-tg", r); if (tg) tg.onclick = () => { if (open.has(k)) open.delete(k); else open.add(k); r.classList.toggle("on", open.has(k)); show(r, d, k); };
      $(".dw-i", r).onclick = e => { e.stopPropagation(); info(e.currentTarget, t, d); };
      if (open.has(k)) show(r, d, k); }); }
  function bar(t, d, a){ const k = key(t, d), e = Equip.get(d.of) || {}, on = (a.dwgPick || []).includes(d.n);
    return '<div class="dw-b' + (open.has(k) ? " on" : "") + (on ? " pk" : "") + '" data-key="' + esc(k) + '"><div class="dw-h">'
      + '<label class="dw-ck" title="' + (d.pdf ? "Needed for this job" : "Needed for this job (no PDF copy: open it in SharePoint)") + '"><input type="checkbox" data-n="' + esc(d.n) + '"' + (on ? " checked" : "") + (Store.S.edit ? "" : " disabled") + '></label>'
      + (d.pdf ? '<button type="button" class="dw-tg" title="Show the drawing here" aria-label="Show the drawing">▸</button>' : '<span class="dw-tg0"></span>')
      + '<span class="dw-k">' + esc(d.kind) + '</span>' + (d.url ? '<a class="dw-a" href="' + esc(d.url) + '" target="_blank" rel="noopener" title="Open in SharePoint">' + esc(d.n) + '</a>' : '<span class="dw-a">' + esc(d.n) + '</span>')
      + (d.rev ? '<span class="dw-r">Rev ' + esc(d.rev) + '</span>' : "") + '<button type="button" class="dw-i" title="What is this?" aria-label="Document title">i</button>'
      + (!d.own ? '<span class="dw-of" title="' + esc(e.n || "") + '">' + esc(d.of) + '</span>' : "") + '<span class="grow"></span>'
      + (d.pdf ? '<a class="dc-pdf" href="' + esc(d.pdf.split("#")[0]) + '" target="_blank" rel="noopener" download title="Download a PDF copy (no SharePoint needed)' + (d.pdfRev ? ", rev " + esc(d.pdfRev) : "") + '">PDF</a>' : "") + '</div><div class="dw-v"></div></div>'; }
  /* Download ticked: each ticked document with a copy saved as its own PDF (number and title as the name), one after
     another; the ones that couldn't be saved are listed at the top of the tab, with why and their SharePoint link */
  const fails = new Map();
  async function download(el, a, all, btn){ const ref = a._p + ":" + a.u, ns = a.dwgPick || [], bad = []; let ok = 0;
    btn.disabled = true; const lbl = btn.textContent;
    for (const [i, n] of ns.entries()){ const d = all.get(n); btn.textContent = "Downloading " + (i + 1) + " of " + ns.length + "…";
      if (!d){ bad.push({ d: { n }, why: "no longer listed for this equipment" }); continue; }
      if (!d.pdf){ bad.push({ d, why: "no PDF copy, open it in SharePoint" }); continue; }
      try { const r = await fetch(d.pdf.split("#")[0]); if (!r.ok) throw new Error(r.status === 404 ? "the PDF copy is missing" : "the copy didn't load (" + r.status + ")");
        const b = await r.blob(); if (!/pdf/i.test(b.type) && b.size < 2000) throw new Error("the copy isn't a PDF");
        Excel.save(new Blob([b], { type: "application/pdf" }), (d.n + (d.t ? " " + d.t : "")).replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) + ".pdf"); ok++;
        await new Promise(res => setTimeout(res, 350)); }   // (a pause between, so the browser takes each one)
      catch (e){ bad.push({ d, why: /fetch|network/i.test(e.message) ? "no connection to the drawing copies" : e.message }); } }
    if (bad.length) fails.set(ref, bad); else fails.delete(ref);
    note(ok + " downloaded" + (bad.length ? ", " + bad.length + " didn't (listed at the top)" : ""), 5000); btn.textContent = lbl; btn.disabled = false; if (el.isConnected) draw(el, a); }
  /* the ⓘ callout: the title, which equipment it's for and why it's listed */
  function info(btn, t, d){ Fields.closePop(); const e = Equip.get(d.of) || {}, why = { tag: "names the tag", parent: "is its main equipment's", model: "is for its model", package: "is from its supply package" }[d.why];
    const p = h('<div class="pop dw-pop"><b>' + esc(d.n) + '</b><div>' + esc(d.t || "No title in the register") + '</div><div class="dim">' + esc(d.kind) + (d.rev ? ", rev " + esc(d.rev) : "") + (d.pdfRev ? " (PDF copy rev " + esc(d.pdfRev) + ")" : "")
      + '</div><div class="dim">For ' + esc(d.of) + (e.n ? " " + esc(e.n.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())) : "") + (d.of !== t ? ", sub equipment of " + esc(t) : "") + (why ? "; it " + why : "") + (d.page ? "; the tag is on page " + d.page : "") + '</div></div>');
    document.body.appendChild(p); const r = btn.getBoundingClientRect(); p.style.left = Math.min(innerWidth - p.offsetWidth - 8, r.left) + "px"; p.style.top = (r.bottom + 6) + "px";
    setTimeout(() => document.addEventListener("mousedown", function off(ev){ if (!p.contains(ev.target)){ p.remove(); document.removeEventListener("mousedown", off); } }), 0); }
  /* ---------- the viewer: pdf.js, one page at a time, sharp at any zoom ---------- */
  let libP = null;
  const lib = () => libP || (libP = new Promise((res, rej) => { const s = document.createElement("script"); s.src = "js/lib/pdfjs/pdf.min.js"; s.onload = () => { pdfjsLib.GlobalWorkerOptions.workerSrc = "js/lib/pdfjs/pdf.worker.min.js"; res(pdfjsLib); }; s.onerror = () => { libP = null; rej(new Error("PDF viewer")); }; document.head.appendChild(s); }));
  const docs = new Map();   // pdf url → loading document
  function show(r, d, k){ const v = $(".dw-v", r); if (!open.has(k)){ v.innerHTML = ""; return; }
    let w = views.get(k); if (w && w.el){ v.appendChild(w.el); return; }   // (kept across redraws: same page and zoom)
    const el = h('<div class="pv"><div class="pv-t"><button type="button" data-p="-1" title="Previous page">‹</button><span class="pv-n">…</span><button type="button" data-p="1" title="Next page">›</button><span class="pv-s"></span>'
      + '<button type="button" data-z="-1" title="Zoom out">−</button><span class="pv-z">Fit</span><button type="button" data-z="1" title="Zoom in">+</button><button type="button" data-z="0" title="Fit the page width">Fit</button><span class="grow"></span>'
      + (d.url ? '<a href="' + esc(d.url) + '" target="_blank" rel="noopener">SharePoint ↗</a>' : "") + '<a href="' + esc(d.pdf.split("#")[0]) + '" target="_blank" rel="noopener">Open PDF ↗</a></div><div class="pv-c"><canvas></canvas><div class="pv-m dim">Loading the drawing…</div></div></div>');
    v.appendChild(el); w = { el, page: d.page || 1, zoom: 1, n: 0 }; views.set(k, w);
    const c = $(".pv-c", el), cv = $("canvas", el), msg = $(".pv-m", el), url = d.pdf.split("#")[0];
    let pdf = null, task = null;
    const paint = async () => { if (!pdf) return; const pg = await pdf.getPage(w.page), base = pg.getViewport({ scale: 1 }), fit = (c.clientWidth - 2) / base.width, sc = fit * w.zoom, dpr = Math.min(3, (devicePixelRatio || 1) * 1.5);
      const vp = pg.getViewport({ scale: sc * dpr }); if (task) task.cancel(); cv.width = vp.width; cv.height = vp.height; cv.style.width = (vp.width / dpr) + "px"; cv.style.height = (vp.height / dpr) + "px";
      task = pg.render({ canvasContext: cv.getContext("2d"), viewport: vp }); await task.promise.catch(() => {}); task = null;
      $(".pv-n", el).textContent = "Page " + w.page + " of " + w.n; $(".pv-z", el).textContent = w.zoom === 1 ? "Fit" : Math.round(w.zoom * 100) + "%"; };
    const zoomTo = (z, cx, cy) => { const ox = (c.scrollLeft + (cx == null ? c.clientWidth / 2 : cx)) / (cv.offsetWidth || 1), oy = (c.scrollTop + (cy == null ? c.clientHeight / 2 : cy)) / (cv.offsetHeight || 1);
      w.zoom = Math.max(1, Math.min(8, z)); paint().then(() => { c.scrollLeft = ox * cv.offsetWidth - (cx == null ? c.clientWidth / 2 : cx); c.scrollTop = oy * cv.offsetHeight - (cy == null ? c.clientHeight / 2 : cy); }); };
    $$("[data-p]", el).forEach(b => b.onclick = () => { const p = w.page + +b.dataset.p; if (p >= 1 && p <= w.n){ w.page = p; c.scrollTop = 0; paint(); } });
    $$("[data-z]", el).forEach(b => b.onclick = () => { const z = +b.dataset.z; zoomTo(z ? w.zoom * (z > 0 ? 1.5 : 1 / 1.5) : 1); });
    c.addEventListener("wheel", e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); const r = c.getBoundingClientRect(); zoomTo(w.zoom * (e.deltaY < 0 ? 1.25 : 0.8), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    let drag = null; c.onpointerdown = e => { if (w.zoom === 1) return; drag = [e.clientX, e.clientY, c.scrollLeft, c.scrollTop]; c.setPointerCapture(e.pointerId); c.classList.add("grab"); };
    c.onpointermove = e => { if (drag){ c.scrollLeft = drag[2] - (e.clientX - drag[0]); c.scrollTop = drag[3] - (e.clientY - drag[1]); } };
    c.onpointerup = c.onpointercancel = () => { drag = null; c.classList.remove("grab"); };
    c.ondblclick = e => { const r = c.getBoundingClientRect(); zoomTo(w.zoom === 1 ? 3 : 1, e.clientX - r.left, e.clientY - r.top); };
    lib().then(L => { if (!docs.has(url)) docs.set(url, L.getDocument({ url }).promise.catch(e => { docs.delete(url); throw e; })); return docs.get(url); })
      .then(p => { pdf = p; w.n = p.numPages; w.page = Math.min(w.page, w.n); msg.remove(); $(".pv-s", el).textContent = d.page && w.n > 1 ? "(the tag is on page " + d.page + ")" : ""; return paint(); })
      .catch(e => { console.warn("drawing", e); msg.textContent = "Couldn't show this one here. Use Open PDF or SharePoint above."; }); }
  return { renderFor, collect, count, GROUP };
})();
