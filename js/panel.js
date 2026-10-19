/* The side panel: the selected action's title, problem, solution and its Photos button (a big gallery
   pops up), then its attachments, notes and the rest of its details. Drag its left edge to resize it. */
"use strict";
const Panel = (() => {
  let last = null;
  const CORE = new Set(["title", "status", "priority", "problem", "solution", "notes"]);
  function render(el){ const a = App.act(App.selRef); el.classList.toggle("open", !!a); document.body.classList.toggle("side-open", !!a);
    if (!a){ el.innerHTML = ""; return; }
    const ro = !Store.S.edit, p = Store.project(a._p) || {};
    /* keep the cursor where it was when the panel redraws */
    const ae = document.activeElement, keep = ae && el.contains(ae) && ae.closest("[data-f]") ? { f: ae.closest("[data-f]").dataset.f, s: ae.selectionStart, e: ae.selectionEnd, v: ae.value, tag: ae.tagName } : null;
    const sc = $(".sd-body", el) && last === App.selRef ? $(".sd-body", el).scrollTop : 0; last = App.selRef;
    el.innerHTML = '<div class="sd-split" title="Drag to resize"></div><div class="sd-head"><span class="aid big">' + esc(Store.actId(a)) + '</span><span class="ptag" style="--c:' + esc(p.color || "#64748b") + '">' + esc(p.name || "") + '</span><span class="grow"></span>'
      + (ro ? "" : '<button class="ic-b" type="button" data-k="del" title="Delete this action">🗑</button>') + '<button class="ic-b" type="button" data-k="print" title="Print this action">⎙</button><button class="ic-b" type="button" data-k="x" title="Close (Esc)">✕</button></div>'
      + '<div class="sd-body"><div class="sd-title" data-f="title"></div><div class="sd-row"><div class="sd-st" data-f="status"></div><label class="sd-pr">Priority <span data-f="priority"></span></label></div>'
      + '<h4>Problem</h4><div data-f="problem"></div><h4>Solution</h4><div data-f="solution"></div>'
      + '<h4>Photos <span class="cnt">' + (a.photos.length || "") + '</span></h4><div class="ph-block">' + (a.photos.length ? '<button type="button" class="ph-cover" data-k="viewall" title="Open the photos"><img alt=""><span class="ph-badge">📷 ' + a.photos.length + '</span></button>' : "")
      + '<div class="ph-btns"><button type="button" class="btn sm" data-k="viewall"' + (a.photos.length ? "" : " disabled") + '>Photos' + (a.photos.length ? " (" + a.photos.length + ")" : "") + '</button>' + (ro ? "" : '<button type="button" class="btn ghost sm" data-k="addph">Upload photos</button><button type="button" class="btn ghost sm" data-k="addf">Attach file</button><span class="dim">or drop them on the action</span>') + '</div></div>'
      + '<h4>Attachments <span class="cnt">' + (a.files.length || "") + '</span></h4><div class="att-l"></div>'
      + '<h4>Notes</h4><div data-f="notes"></div>'
      + '<h4>Details</h4><div class="det"></div><div class="sd-foot">Created ' + esc(fmtDate(a.created)) + (a.by ? ", last edited by " + esc(a.by) + " " + esc(fmtDate(a.mod)) : "") + (a.gps ? ' · <a target="_blank" rel="noopener" href="https://maps.google.com/?q=' + a.gps.lat + "," + a.gps.lng + '">Map pin</a>' : "") + '</div></div>';
    $$("[data-f]", el).forEach(d => { const f = Store.field(d.dataset.f); if (f) d.appendChild(Fields.editor(a, f, ro)); });
    const ti = $(".sd-title .in", el); if (ti) ti.placeholder = "Title";
    $$("[data-f=problem] textarea,[data-f=solution] textarea,[data-f=notes] textarea", el).forEach(t => t.rows = 4);
    const cv = $(".ph-cover img", el); if (cv){ cv.src = Media.src(a, a.photos[0], true); cv.onerror = () => { if (!cv.dataset.r){ cv.dataset.r = 1; cv.src = Media.src(a, a.photos[0]); } }; }
    files(a, $(".att-l", el), ro);
    const det = $(".det", el); Store.fields().filter(f => !CORE.has(f.id)).forEach(f => { const r = h('<div class="det-r" data-f="' + f.id + '"><label>' + esc(f.label) + '</label></div>'); r.appendChild(Fields.editor(a, f, ro)); det.appendChild(r); });
    $(".sd-body", el).scrollTop = sc;
    if (keep){ const t = $('[data-f="' + keep.f + '"] input, [data-f="' + keep.f + '"] textarea, [data-f="' + keep.f + '"] select', el); if (t){ if (t.tagName === keep.tag && t.tagName !== "SELECT" && t.value !== keep.v) t.value = keep.v; t.focus(); try { if (keep.s != null) t.setSelectionRange(keep.s, keep.e); } catch (e) {} } }
    el.querySelectorAll("[data-k]").forEach(b => b.onclick = () => act(b.dataset.k, a));
    dragResize($(".sd-split", el), () => el.offsetWidth, w => { w = Math.max(320, Math.min(innerWidth - 360, w)); document.documentElement.style.setProperty("--side-w", w + "px"); lsSet("adSideW", w); });
    el.ondragover = e => { if (Media.hasDrop(e)){ e.preventDefault(); el.classList.add("drop"); } };
    el.ondragleave = e => { if (!el.contains(e.relatedTarget)) el.classList.remove("drop"); };
    el.ondrop = e => { el.classList.remove("drop"); if (Media.hasDrop(e)){ e.preventDefault(); e.stopPropagation(); Media.dropOn(a, e); } }; }
  async function act(k, a){
    if (k === "x") App.select(null);
    else if (k === "print") Print.run([a]);
    else if (k === "viewall") Media.view(a, 0);
    else if (k === "addph") Media.pickFiles(a, "image/*");
    else if (k === "addf") Media.pickFiles(a);
    else if (k === "del"){ if (await confirmBox("Delete " + Store.actId(a) + "?  You can undo with Ctrl+Z.", "Delete", true)){ Store.mutate("a:" + a._p, () => { a.del = true; Store.touch(a); }); Store.log("Deleted " + Store.actId(a)); App.select(null); } } }
  function files(a, l, ro){ l.innerHTML = a.files.length ? "" : '<div class="dim">No attachments. Drop a PDF, Excel or any file here.</div>';
    a.files.forEach((f, i) => { const r = h('<div class="att"><span class="att-ic">' + (/pdf$/i.test(f.name) ? "PDF" : /xlsx?$|csv$/i.test(f.name) ? "XLS" : /docx?$/i.test(f.name) ? "DOC" : "FILE") + '</span><button type="button" class="link att-n">' + esc(f.name) + '</button><span class="dim">' + fmtSize(f.size || 0) + '</span>' + (ro ? "" : '<button type="button" class="ic-b sm" title="Remove">✕</button>') + '</div>');
      $(".att-n", r).onclick = () => Media.openFile(a, f);
      const x = $(".ic-b", r); if (x) x.onclick = () => Store.mutate("a:" + a._p, () => { a.files.splice(i, 1); Store.touch(a); });
      l.appendChild(r); }); }
  return { render };
})();
