/* The side panel: the selected action's title, problem, solution and photos, then its attachments,
   steps and the rest of its details. Drag its left edge to resize it. */
"use strict";
const Panel = (() => {
  let last = null;
  const CORE = new Set(["title", "status", "priority", "problem", "solution"]);
  function render(el){ const a = App.act(App.selRef); el.classList.toggle("open", !!a); document.body.classList.toggle("side-open", !!a);
    if (!a){ el.innerHTML = ""; return; }
    const ro = !Store.S.edit, p = Store.project(a._p) || {};
    /* keep the cursor where it was when the panel redraws */
    const ae = document.activeElement, keep = ae && el.contains(ae) && ae.closest("[data-f]") ? { f: ae.closest("[data-f]").dataset.f, s: ae.selectionStart, e: ae.selectionEnd } : null;
    const sc = $(".sd-body", el) && last === App.selRef ? $(".sd-body", el).scrollTop : 0; last = App.selRef;
    el.innerHTML = '<div class="sd-split" title="Drag to resize"></div><div class="sd-head"><span class="aid big">' + esc(Store.actId(a)) + '</span><span class="ptag" style="--c:' + esc(p.color || "#64748b") + '">' + esc(p.name || "") + '</span><span class="grow"></span>'
      + (ro ? "" : '<button class="ic-b" type="button" data-k="del" title="Delete this action">🗑</button>') + '<button class="ic-b" type="button" data-k="print" title="Print this action">⎙</button><button class="ic-b" type="button" data-k="x" title="Close (Esc)">✕</button></div>'
      + '<div class="sd-body"><div class="sd-title" data-f="title"></div><div class="sd-row"><div class="sd-st" data-f="status"></div><label class="sd-pr">Priority <span data-f="priority"></span></label></div>'
      + '<h4>Problem</h4><div data-f="problem"></div><h4>Solution</h4><div data-f="solution"></div>'
      + '<h4>Photos <span class="cnt">' + (a.photos.length || "") + '</span>' + (a.photos.length ? '<button type="button" class="link" data-k="viewall">View photos</button>' : "") + '</h4><div class="ph-grid"></div>'
      + (ro ? "" : '<div class="ph-add"><button type="button" class="btn ghost sm" data-k="addph">+ Add photos or files</button><span class="dim">or paste (Ctrl+V), or drop them here</span></div>')
      + '<h4>Attachments <span class="cnt">' + (a.files.length || "") + '</span></h4><div class="att-l"></div>'
      + '<h4>Steps <span class="cnt">' + (a.steps.length ? a.steps.filter(s => s.d).length + " of " + a.steps.length : "") + '</span></h4><div class="steps"></div>'
      + '<h4>Details</h4><div class="det"></div><div class="sd-foot">Created ' + esc(fmtDate(a.created)) + (a.by ? ", last edited by " + esc(a.by) + " " + esc(fmtDate(a.mod)) : "") + (a.gps ? ' · <a target="_blank" rel="noopener" href="https://maps.google.com/?q=' + a.gps.lat + "," + a.gps.lng + '">Map pin</a>' : "") + '</div></div>';
    $$("[data-f]", el).forEach(d => { const f = Store.field(d.dataset.f); if (f) d.appendChild(Fields.editor(a, f, ro)); });
    const ti = $(".sd-title .in", el); if (ti) ti.placeholder = "Title";
    $$("[data-f=problem] textarea,[data-f=solution] textarea", el).forEach(t => t.rows = 4);
    photos(a, $(".ph-grid", el), ro); files(a, $(".att-l", el), ro); steps(a, $(".steps", el), ro);
    const det = $(".det", el); Store.fields().filter(f => !CORE.has(f.id)).forEach(f => { const r = h('<div class="det-r" data-f="' + f.id + '"><label>' + esc(f.label) + '</label></div>'); r.appendChild(Fields.editor(a, f, ro)); det.appendChild(r); });
    $(".sd-body", el).scrollTop = sc;
    if (keep){ const t = $('[data-f="' + keep.f + '"] input, [data-f="' + keep.f + '"] textarea, [data-f="' + keep.f + '"] select', el); if (t){ t.focus(); try { if (keep.s != null) t.setSelectionRange(keep.s, keep.e); } catch (e) {} } }
    el.querySelectorAll("[data-k]").forEach(b => b.onclick = () => act(b.dataset.k, a));
    dragResize($(".sd-split", el), () => el.offsetWidth, w => { w = Math.max(320, Math.min(innerWidth - 360, w)); document.documentElement.style.setProperty("--side-w", w + "px"); lsSet("adSideW", w); });
    el.ondragover = e => { if ([...e.dataTransfer.types].includes("Files")){ e.preventDefault(); el.classList.add("drop"); } };
    el.ondragleave = e => { if (!el.contains(e.relatedTarget)) el.classList.remove("drop"); };
    el.ondrop = e => { el.classList.remove("drop"); if (e.dataTransfer.files.length){ e.preventDefault(); Media.addFiles(a, e.dataTransfer.files); } }; }
  async function act(k, a){
    if (k === "x") App.select(null);
    else if (k === "print") Print.run([a]);
    else if (k === "viewall") Media.view(a, 0);
    else if (k === "addph"){ const i = h('<input type="file" multiple>'); i.onchange = () => Media.addFiles(a, i.files); i.click(); }
    else if (k === "del"){ if (await confirmBox("Delete " + Store.actId(a) + "?  You can undo with Ctrl+Z.", "Delete", true)){ Store.mutate("a:" + a._p, () => { a.del = true; Store.touch(a); }); Store.log("Deleted " + Store.actId(a)); App.select(null); } } }
  function photos(a, g, ro){ g.innerHTML = a.photos.length ? "" : '<div class="dim">No photos yet.</div>';
    a.photos.forEach((p, i) => { const t = h('<div class="ph" draggable="' + !ro + '" title="' + esc(p.name || "") + '\nDouble click for full screen"><img loading="lazy" alt=""><button type="button" class="ph-fs" title="Full screen">⛶</button>' + (ro ? "" : '<button type="button" class="ph-x" title="Remove photo">✕</button>') + '</div>');
      const img = $("img", t); img.src = Media.src(a, p, true); img.onerror = () => { if (!img.dataset.r){ img.dataset.r = 1; img.src = Media.src(a, p); } };
      t.ondblclick = () => Media.view(a, i); $(".ph-fs", t).onclick = e => { e.stopPropagation(); Media.view(a, i); };
      const x = $(".ph-x", t); if (x) x.onclick = e => { e.stopPropagation(); Store.mutate("a:" + a._p, () => { a.photos.splice(i, 1); Store.touch(a); }); Store.log("Removed a photo from " + Store.actId(a)); };
      t.ondragstart = e => { e.dataTransfer.setData("text/ph", String(i)); };
      t.ondragover = e => { if ([...e.dataTransfer.types].includes("text/ph")){ e.preventDefault(); t.classList.add("dover"); } };
      t.ondragleave = () => t.classList.remove("dover");
      t.ondrop = e => { t.classList.remove("dover"); const from = e.dataTransfer.getData("text/ph"); if (from === "") return; e.preventDefault(); e.stopPropagation();
        Store.mutate("a:" + a._p, () => { const m = a.photos.splice(+from, 1)[0]; a.photos.splice(i, 0, m); Store.touch(a); }); };
      g.appendChild(t); }); }
  function files(a, l, ro){ l.innerHTML = a.files.length ? "" : '<div class="dim">No attachments. Drop a PDF, Excel or any file here.</div>';
    a.files.forEach((f, i) => { const r = h('<div class="att"><span class="att-ic">' + (/pdf$/i.test(f.name) ? "PDF" : /xlsx?$|csv$/i.test(f.name) ? "XLS" : /docx?$/i.test(f.name) ? "DOC" : "FILE") + '</span><button type="button" class="link att-n">' + esc(f.name) + '</button><span class="dim">' + fmtSize(f.size || 0) + '</span>' + (ro ? "" : '<button type="button" class="ic-b sm" title="Remove">✕</button>') + '</div>');
      $(".att-n", r).onclick = () => Media.openFile(a, f);
      const x = $(".ic-b", r); if (x) x.onclick = () => Store.mutate("a:" + a._p, () => { a.files.splice(i, 1); Store.touch(a); });
      l.appendChild(r); }); }
  function steps(a, l, ro){ a.steps.forEach((s, i) => { const r = h('<div class="step' + (s.d ? " done" : "") + '"><label class="ck"><input type="checkbox"' + (s.d ? " checked" : "") + (ro ? " disabled" : "") + '><span></span></label><input class="in st-t" type="text"' + (ro ? " readonly" : "") + '>' + (ro ? "" : '<button type="button" class="ic-b sm" title="Remove step">✕</button>') + '</div>');
      const t = $(".st-t", r); t.value = s.t;
      $("input[type=checkbox]", r).onchange = e => Store.mutate("a:" + a._p, () => { s.d = e.target.checked; Store.touch(a); });
      t.onchange = () => Store.mutate("a:" + a._p, () => { s.t = t.value; Store.touch(a); });
      const x = $(".ic-b", r); if (x) x.onclick = () => Store.mutate("a:" + a._p, () => { a.steps.splice(i, 1); Store.touch(a); });
      l.appendChild(r); });
    if (!ro){ const n = h('<input class="in st-new" type="text" placeholder="+ Add a step, then Enter">'); n.onkeydown = e => { if (e.key === "Enter" && n.value.trim()){ const v = n.value.trim(); Store.mutate("a:" + a._p, () => { a.steps.push({ id: uid(), t: v, d: false }); Store.touch(a); }); setTimeout(() => { const m = $(".st-new"); m && m.focus(); }, 0); } }; l.appendChild(n); }
    else if (!a.steps.length) l.innerHTML = '<div class="dim">None</div>'; }
  return { render };
})();
