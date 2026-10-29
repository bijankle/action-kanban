/* The Sketches tab (its own tab, left of Materials): sketches for the job, each as wide as the page, one under another. Click,
   drop or paste images or PDFs onto the slim bar at the top; a PDF becomes one lossless image per page (drawn at high
   resolution, kept as PNG), an image is kept exactly as it came. Click a sketch to see it fullscreen; drag one up or
   down to reorder (live); the bin takes one off (it asks first). They print just before the MTO in the action PDF and the
   work pack (PDF and Word). Stored like the photos, one file each in the data repo. */
"use strict";
const Sketch = (() => {
  const path = (pid, s) => "data/p/" + pid + "/sk/" + s.h + "." + (s.ext || "png");
  const mem = new Map();   // (sketches just added, shown from this computer at once while they upload)
  const src = (a, s) => mem.get(s.h) || GH.fileUrl(path(a._p, s));
  const list = a => a.sketches || (a.sketches = []);
  let pdfjs = null;
  const loadPdfjs = () => pdfjs || (pdfjs = new Promise((res, rej) => { if (window.pdfjsLib) return res(window.pdfjsLib); const s = document.createElement("script"); s.src = "js/lib/pdfjs/pdf.min.js";
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "js/lib/pdfjs/pdf.worker.min.js"; res(window.pdfjsLib); }; s.onerror = () => rej(new Error("couldn't load the PDF reader")); document.head.appendChild(s); }));
  /* a PDF's pages as PNG images, about 2400px wide (sharp enough to read small print fullscreen) */
  async function pdfPages(f){ const L = await loadPdfjs(), doc = await L.getDocument({ data: await f.arrayBuffer() }).promise, out = [];
    for (let n = 1; n <= doc.numPages; n++){ const pg = await doc.getPage(n), v0 = pg.getViewport({ scale: 1 }), v = pg.getViewport({ scale: Math.min(4, 2400 / v0.width) });
      const c = document.createElement("canvas"); c.width = Math.round(v.width); c.height = Math.round(v.height); const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: g, viewport: v }).promise; const blob = await new Promise(r => c.toBlob(r, "image/png"));
      out.push({ blob, name: f.name.replace(/\.pdf$/i, "") + (doc.numPages > 1 ? ", page " + n : ""), w: c.width, ht: c.height, ext: "png" }); }
    return out; }
  const isPdf = f => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name || "");
  const extOf = f => ({ "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg", "image/bmp": "bmp" })[f.type] || (/\.(\w+)$/.exec(f.name || "") || [, "png"])[1].toLowerCase();
  async function add(a, files){ files = Array.from(files || []).filter(f => /^image\//.test(f.type) || isPdf(f)); if (!files.length || !a) return; if (!Store.S.edit) return App.viewOnly();
    note("Adding " + files.length + " sketch" + (files.length > 1 ? "es" : "") + " to " + Store.actId(a) + "…", 6000);
    for (const f of files){ try {
        const parts = isPdf(f) ? await pdfPages(f) : [await (async () => { const b = await createImageBitmap(f).catch(() => null); return { blob: f, name: (f.name && !/^image\.\w+$/.test(f.name) ? f.name.replace(/\.\w+$/, "") : "Pasted sketch"), w: b ? b.width : 0, ht: b ? b.height : 0, ext: extOf(f) }; })()];
        for (const p of parts){ const buf = await p.blob.arrayBuffer(), h = (await sha1(buf)).slice(0, 16); if (list(a).some(s => s.h === h)) continue;
          const s = { h, name: p.name, w: p.w, ht: p.ht, ext: p.ext, added: now() }; mem.set(h, URL.createObjectURL(p.blob));
          Store.mutate("a:" + a._p, () => { list(a).push(s); Store.touch(a); });   /* (shows at once; the file uploads behind it) */
          await Store.addBlob(path(a._p, s), bufToB64(buf)); }
        Store.log("Added sketches to " + Store.actId(a)); }
      catch (e){ console.error(e); alert("Couldn't add " + f.name + ": " + e.message); } }
    note("Sketches added to " + Store.actId(a) + ", saving online…"); }
  const BIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
  const FS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
  function renderFor(el, a, ro){ const S = list(a), M = "2";   /* (each sketch headed by a row: its number, its name, fullscreen and the bin) */
    el.innerHTML = '<div class="sk sk' + M + '">' + (ro ? "" : '<button type="button" class="att-add sk-up" title="Click, drop or paste images or PDFs (each PDF page becomes a sketch)">+ Add sketches (images or PDFs)</button>')
      + S.map((s, i) => '<figure class="sk-f" data-i="' + i + '">'
        + (M === "2" ? '<div class="sk-h"><span class="sk-n">' + (i + 1) + '</span><span class="sk-t">' + esc(s.name || "") + '</span><button type="button" class="sk-b" data-k="fs" title="Fullscreen">' + FS + '</button>' + (ro ? "" : '<button type="button" class="sk-b" data-k="del" title="Remove this sketch">' + BIN + '</button>') + '</div>' : "")
        + '<img alt="' + esc(s.name || "Sketch " + (i + 1)) + '" src="' + esc(src(a, s)) + '" loading="lazy" draggable="false">'
        + (M === "1" ? '<figcaption class="sk-h"><span class="sk-n">' + (i + 1) + '</span><span class="sk-t">' + esc(s.name || "") + '</span>' + (ro ? "" : '<button type="button" class="sk-b" data-k="del" title="Remove this sketch">' + BIN + '</button>') + '</figcaption>' : "")
        + (M === "3" ? '<span class="sk-badge">' + (i + 1) + '</span>' + (ro ? "" : '<button type="button" class="sk-b sk-ov" data-k="del" title="Remove this sketch">' + BIN + '</button>') : "")
        + '</figure>').join("") + '</div>';
    const up = $(".sk-up", el); if (up){ up.onclick = () => pickFile("image/*,application/pdf,.pdf", true, fs => add(a, fs));
      up.ondragover = e => { if (Media.hasDrop(e)){ e.preventDefault(); up.classList.add("drop"); } }; up.ondragleave = () => up.classList.remove("drop");
      up.ondrop = e => { up.classList.remove("drop"); if (!e.dataTransfer.files.length) return; e.preventDefault(); e.stopPropagation(); add(a, e.dataTransfer.files); }; }
    $$(".sk-f", el).forEach(f => { const i = +f.dataset.i;
      $("img", f).onclick = () => { if (Date.now() - (f.__moved || 0) > 300) view(a, i); }; const fs = $('[data-k="fs"]', f); if (fs) fs.onclick = () => view(a, i);
      const d = $('[data-k="del"]', f); if (d) d.onclick = async e => { e.stopPropagation(); const s = list(a)[i]; if (s && await confirmBox("Remove sketch " + (i + 1) + " from " + Store.actId(a) + "? You can undo with Ctrl+Z.", "Remove", true)){ Store.mutate("a:" + a._p, () => { const k = list(a).indexOf(s); if (k >= 0) list(a).splice(k, 1); Store.touch(a); }); Store.log("Removed a sketch from " + Store.actId(a)); } };
      if (ro) return;
      /* drag to reorder, live: once the pointer has moved a little, the sketch follows it and the others make way as it passes
         them, so what you see while dragging is where it lands (a click without moving opens it fullscreen) */
      f.ondragstart = e => e.preventDefault();   /* (not the browser's own picture drag) */
      f.onpointerdown = e => { if (e.button !== 0 || e.target.closest("button")) return; const y0 = e.clientY, box = f.parentElement; let on = false;
        const move = ev => { if (!on){ if (Math.abs(ev.clientY - y0) < 6) return; on = true; f.classList.add("drag"); box.classList.add("sk-dragging"); }
          ev.preventDefault(); const fs = $$(".sk-f", box).filter(x => x !== f), over = fs.find(x => { const r = x.getBoundingClientRect(); return ev.clientY >= r.top && ev.clientY <= r.bottom; });
          if (!over) return; const r = over.getBoundingClientRect(), after = ev.clientY > r.top + r.height / 2; if (after ? over.nextElementSibling !== f : over.previousElementSibling !== f) after ? over.after(f) : over.before(f); };
        const up = () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); if (!on) return; f.classList.remove("drag"); box.classList.remove("sk-dragging"); f.__moved = Date.now();
          const order = $$(".sk-f", box).map(x => +x.dataset.i); if (order.every((v, k) => v === k)) return;
          Store.mutate("a:" + a._p, () => { const old = list(a).slice(); order.forEach((from, k) => { list(a)[k] = old[from]; }); Store.touch(a); }); Store.log("Reordered the sketches of " + Store.actId(a)); };
        document.addEventListener("pointermove", move); document.addEventListener("pointerup", up); }; }); }
  /* fullscreen: one sketch at a time, as large as the screen allows; the arrows (or ← →) step through, Esc closes */
  function view(a, i){ const S = list(a); if (!S[i]) return; const v = h('<div class="skv" tabindex="-1"><img alt=""><span class="skv-n"></span><button type="button" class="skv-x" title="Close (Esc)">✕</button><button type="button" class="skv-a skv-p" aria-label="Previous">‹</button><button type="button" class="skv-a skv-q" aria-label="Next">›</button></div>');
    const show = () => { $("img", v).src = src(a, S[i]); $(".skv-n", v).textContent = (i + 1) + " of " + S.length + "  " + (S[i].name || ""); };
    const go = d => { i = (i + d + S.length) % S.length; show(); }, close = () => v.remove();
    $(".skv-x", v).onclick = close; $(".skv-p", v).onclick = () => go(-1); $(".skv-q", v).onclick = () => go(1); v.onclick = e => { if (e.target === v) close(); };
    v.onkeydown = e => { if (e.key === "Escape") close(); else if (e.key === "ArrowLeft") go(-1); else if (e.key === "ArrowRight") go(1); };
    document.body.appendChild(v); show(); v.focus(); if (v.requestFullscreen) v.requestFullscreen().catch(() => {}); }
  /* pasting on the Sketches tab adds the pasted images as sketches */
  document.addEventListener("paste", e => { if (App.sub !== "sketches" || !App.selRef || !Store.S.edit) return; const fs = [...(e.clipboardData || {}).files || []].filter(f => /^image\//.test(f.type) || isPdf(f)); if (!fs.length) return;
    e.preventDefault(); e.stopImmediatePropagation(); add(App.act(App.selRef), fs); }, true);
  /* for the exports: each sketch as a data URL with its size, in order */
  async function dataUrls(a){ const out = []; for (const s of list(a)){ try { let b = await (await fetch(src(a, s))).blob();
      if (!/png|jpe?g/.test(s.ext || "png")){ const bm = await createImageBitmap(b), c = document.createElement("canvas"); c.width = bm.width; c.height = bm.height; const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(bm, 0, 0); b = await new Promise(r => c.toBlob(r, "image/png")); }   /* (the PDF and Word makers take PNG or JPEG) */
      out.push({ url: await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }), w: s.w, h: s.ht, name: s.name, ext: s.ext }); } catch (e){} } return out; }
  return { renderFor, add, view, src, dataUrls, count: a => (a.sketches || []).length };
})();
