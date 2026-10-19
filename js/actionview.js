/* The action view: clicking an action opens it in place of the list. The header holds everything for that one
   action (back to the list, previous and next, stage, priority, the workpack PDF, delete); below it the
   action's own tabs: Overview (problem, solution, photos, notes, attachments, details), MTO, Spares and
   Isolations. */
"use strict";
const ActionView = (() => {
  const CORE = new Set(["title", "status", "priority", "problem", "solution", "notes"]);
  const TABS = [["overview", "Overview"], ["mto", "MTO"], ["spares", "Spares"], ["isol", "Isolations"]];
  const DLI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="M7 10.5l5 5 5-5"/><path d="M5 20h14"/></svg>';
  let last = null;
  function render(el){ const a = App.act(App.selRef); if (!a) return; const ro = !Store.S.edit, p = Store.project(a._p) || {}, sub = App.sub || "overview";
    /* keep the cursor and scroll where they were when the view redraws */
    const ae = document.activeElement, keep = ae && el.contains(ae) && ae.closest("[data-f]") ? { f: ae.closest("[data-f]").dataset.f, s: ae.selectionStart, e: ae.selectionEnd, v: ae.value, tag: ae.tagName } : null;
    const keepP = ae && el.contains(ae) && ae.dataset.c ? { r: ae.dataset.r, c: ae.dataset.c, s: ae.selectionStart, v: ae.value } : null;
    const same = last === App.selRef + sub, sc = same && $(".av-body", el) ? $(".av-body", el).scrollTop : 0; last = App.selRef + sub;
    const list = Table.rows(), i = list.indexOf(a), n = k => (a[k] || []).length;
    el.innerHTML = '<div class="av"><div class="av-head"><button type="button" class="btn ghost sm av-back" data-k="x" title="Back to the list (Esc)">‹ Actions</button>'
      + '<span class="av-nav"><button type="button" class="ic-b" data-k="prev" title="Previous action"' + (i > 0 ? "" : " disabled") + '>‹</button><span class="dim">' + (i >= 0 ? (i + 1) + " of " + list.length : "") + '</span><button type="button" class="ic-b" data-k="next" title="Next action"' + (i >= 0 && i < list.length - 1 ? "" : " disabled") + '>›</button></span>'
      + '<span class="aid big">' + esc(Store.actId(a)) + '</span><span class="ptag" style="--c:' + esc(p.color || "#64748b") + '">' + esc(p.name || "") + '</span>'
      + '<div class="av-st" data-f="status"></div><label class="sd-pr">Priority <span data-f="priority"></span></label><span class="grow"></span>'
      + (ro ? "" : '<button class="ic-b" type="button" data-k="del" title="Delete this action">🗑</button>') + '<button class="dl dl-pdf" type="button" data-k="wp" title="Download the workpack PDF: details, problem, solution, notes, photos, isolations, MTO and spares">' + DLI + '<b>PDF</b></button></div>'
      + '<div class="av-title" data-f="title"></div>' + steps(a, ro)
      + '<div class="av-tabs">' + TABS.map(([k, t]) => { const c = k === "mto" ? n("mto") : k === "spares" ? n("spares") : k === "isol" ? n("isol") : 0; return '<button type="button" class="av-tab' + (k === sub ? " on" : "") + '" data-sub="' + k + '">' + t + (c ? ' <b>' + c + '</b>' : "") + '</button>'; }).join("") + '</div>'
      + '<div class="av-body' + (sub === "overview" ? " ov" : "") + '"></div></div>';
    $$(".av-head [data-f], .av-title[data-f]", el).forEach(d => { const f = Store.field(d.dataset.f); if (f) d.appendChild(Fields.editor(a, f, ro)); });
    const ti = $(".av-title .in", el); if (ti) ti.placeholder = "Title";
    const body = $(".av-body", el);
    if (sub === "overview") overview(body, a, ro); else if (sub === "isol") Isol.renderFor(body, a, keepP); else Parts.renderFor(body, a, sub, keepP);
    body.scrollTop = sc;
    if (keep){ const t = $('[data-f="' + keep.f + '"] input, [data-f="' + keep.f + '"] textarea, [data-f="' + keep.f + '"] select', el); if (t){ if (t.tagName === keep.tag && t.tagName !== "SELECT" && t.value !== keep.v) { t.value = keep.v; t.addEventListener("blur", () => t.dispatchEvent(new Event("change")), { once: true }); } t.focus(); try { if (keep.s != null) t.setSelectionRange(keep.s, keep.e); } catch (e) {} } }
    $$(".av-head [data-k]", el).forEach(b => b.onclick = () => act(b.dataset.k, a, list, i));
    $$(".av-tab", el).forEach(b => b.onclick = () => { App.sub = b.dataset.sub; App.render(); });
    if (!ro){ $$(".stp", el).forEach(b => b.onclick = () => go(a, b.dataset.st)); const hb = $(".stp-hold", el); if (hb) hb.onclick = () => hold(a); }
    const av = $(".av", el); av.ondragover = e => { if (Media.hasDrop(e) && sub === "overview"){ e.preventDefault(); av.classList.add("drop"); } };
    av.ondragleave = e => { if (!av.contains(e.relatedTarget)) av.classList.remove("drop"); };
    av.ondrop = e => { av.classList.remove("drop"); if (sub === "overview" && Media.hasDrop(e)){ e.preventDefault(); e.stopPropagation(); Media.dropOn(a, e); } }; }

  /* the workflow as steps (RFQ Sent, PO Sent and so on): done, current and to come, with the date each was
     reached; click one to move the action there. On hold sits apart, as a toggle. */
  function steps(a, ro){ const ss = Store.stages(), flow = ss.filter(s => s.kind !== "hold"), hs = ss.find(s => s.kind === "hold"), cur = Store.stage(a.stage), onHold = cur.kind === "hold";
    const at = onHold ? flow.findIndex(s => s.id === a.prevHold) : flow.findIndex(s => s.id === cur.id);
    return '<div class="av-steps' + (onHold ? " held" : "") + '">' + flow.map((s, i) => { const st = i < at ? "done" : i === at ? "on" : "todo", d = (a.stageAt || {})[s.id];
        return '<button type="button" class="stp ' + st + '" data-st="' + s.id + '" style="--c:' + esc(s.color) + '"' + (ro ? " disabled" : "") + ' title="' + (ro ? "" : "Move to " + esc(s.name)) + '"><i>' + (st === "done" || (st === "on" && s.kind === "done") ? "✓" : i + 1) + '</i><span>' + esc(s.name) + '</span>' + (d && st !== "todo" ? '<small>' + esc(fmtDate(d)) + '</small>' : "") + '</button>'; }).join('<b class="stp-l"></b>')
      + (hs ? '<button type="button" class="stp-hold' + (onHold ? " on" : "") + '"' + (ro ? " disabled" : "") + ' style="--c:' + esc(hs.color) + '">⏸ ' + esc(hs.name) + (onHold && (a.stageAt || {})[hs.id] ? " since " + esc(fmtDate(a.stageAt[hs.id])) : "") + '</button>' : "") + '</div>'; }
  function go(a, st){ if (a.stage === st) return; Fields.set(a, Store.field("status"), st); }
  function hold(a){ const ss = Store.stages(), hs = ss.find(s => s.kind === "hold"), cur = Store.stage(a.stage);
    if (cur.kind === "hold"){ const back = ss.find(s => s.id === a.prevHold && s.kind !== "hold") || ss.find(s => s.kind === "open"); Store.mutate("a:" + a._p, () => { Store.place(a, back.id); }); Store.log("Took " + Store.actId(a) + " off hold"); }
    else Store.mutate("a:" + a._p, () => { a.prevHold = a.stage; Store.place(a, hs.id); Store.log("Put " + Store.actId(a) + " on hold"); }); }
  function overview(el, a, ro){
    el.innerHTML = (!Store.mine(a) && a.mod && now() - a.mod < 15 * 60000 ? '<div class="sd-warn">⚠ <b>' + esc(App.who(a)) + '</b> edited this action ' + esc(App.ago(a.mod)) + ' and may still be working on it. Changes to different fields are both kept; if you both change the same field you\'ll both be warned.</div>' : "")
      + '<div class="ov-g"><div class="ov-l"><h4>Problem</h4><div data-f="problem"></div><h4>Solution</h4><div data-f="solution"></div><h4>Notes</h4><div data-f="notes"></div>'
      + '<h4>Attachments <span class="cnt">' + (a.files.length || "") + '</span>' + (ro ? "" : '<button type="button" class="link" data-k="addf">Attach file</button>') + '</h4><div class="att-l"></div></div>'
      + '<div class="ov-r"><h4>Photos <span class="cnt">' + (a.photos.length || "") + '</span></h4><div class="ph-block">' + (a.photos.length ? '<button type="button" class="ph-cover" data-k="viewall" title="Open the photos"><img alt=""><span class="ph-badge">📷 ' + a.photos.length + '</span></button>' : "")
      + '<div class="ph-btns"><button type="button" class="btn sm" data-k="viewall"' + (a.photos.length ? "" : " disabled") + '>Photos' + (a.photos.length ? " (" + a.photos.length + ")" : "") + '</button>' + (ro ? "" : '<button type="button" class="btn ghost sm" data-k="addph">Upload photos</button><span class="dim">or drop photos and files anywhere on the action</span>') + '</div></div>'
      + '<div class="ov-map" hidden><h4>Expected location</h4><img alt="Expected location of the equipment"><p class="dim"></p></div>'
      + '<h4>Details</h4><div class="det"></div><div class="sd-foot">' + (a.by ? "Last edited by " + esc(a.by) + " " + esc(fmtDate(a.mod)) : "") + (a.gps ? ' · <a target="_blank" rel="noopener" href="https://maps.google.com/?q=' + a.gps.lat + "," + a.gps.lng + '">Map pin</a>' : "") + '</div></div></div>'
      + '<div class="ov-docs" hidden><h4>Drawings and documents</h4><div class="dc-b"></div></div>';
    $$("[data-f]", el).forEach(d => { const f = Store.field(d.dataset.f); if (f) d.appendChild(Fields.editor(a, f, ro)); });
    $$("[data-f=problem] textarea,[data-f=solution] textarea,[data-f=notes] textarea", el).forEach(t => t.rows = 4);
    const cv = $(".ph-cover img", el); if (cv){ cv.src = Media.src(a, a.photos[0], true); cv.onerror = () => { if (!cv.dataset.r){ cv.dataset.r = 1; cv.src = Media.src(a, a.photos[0]); } }; }
    files(a, $(".att-l", el), ro);
    docsTable($(".ov-docs", el), a);
    const mp = $(".ov-map", el); SiteMap.forAction(a).then(sm => { if (!sm || !mp.isConnected) return; mp.hidden = false; $("img", mp).src = sm.url; $("p", mp).textContent = sm.note; }).catch(() => {});
    const det = $(".det", el); Store.fields().filter(f => !CORE.has(f.id) && !["mto", "sparelist", "isollist"].includes(f.type)).forEach(f => { const r = h('<div class="det-r" data-f="' + f.id + '"><label>' + esc(f.label) + '</label></div>'); r.appendChild(Fields.editor(a, f, ro)); det.appendChild(r); });
    $$("[data-k]", el).forEach(b => b.onclick = () => act(b.dataset.k, a)); }
  /* the equipment's drawings and documents: a row per equipment tag, a column per kind; each number opens the controlled
     copy in SharePoint, and PDF (when there is a copy) downloads it for anyone without SharePoint */
  const DCOLS = [["process", "Process"], ["electrical", "Electrical"], ["docs", "Datasheets & IOMs"]];
  const dcLink = d => '<span class="dc-i">' + (d.url ? '<a href="' + esc(d.url) + '" target="_blank" rel="noopener" title="' + esc((d.t || "") + (d.rev ? " (rev " + d.rev + ")" : "") + "\nOpen in SharePoint") + '">' + esc(d.n) + '</a>' : '<span title="' + esc(d.t || "") + '">' + esc(d.n) + '</span>')
    + (d.pdf ? '<a class="dc-pdf" href="' + esc(d.pdf) + '" target="_blank" rel="noopener" download title="Download a PDF copy (no SharePoint needed)">PDF</a>' : "") + '</span>';
  function docsTable(box, a){ const tags = Array.isArray(a.f.equipment) ? a.f.equipment.filter(Boolean) : []; if (!box || !tags.length || typeof Docs === "undefined") return;
    box.hidden = false; const b = $(".dc-b", box); b.innerHTML = '<span class="dim">Finding the drawings and documents…</span>';
    Promise.all([Docs.load(), Equip.load().catch(() => {})]).then(() => { if (!box.isConnected) return; const m = Docs.forTags(tags);
      const any = tags.some(t => DCOLS.some(([k]) => (m.get(t) || {})[k] && m.get(t)[k].length));
      b.innerHTML = !any ? '<span class="dim">No drawings or documents found for ' + esc(tags.join(", ")) + '.</span>'
        : '<table class="dc"><thead><tr><th>Equipment</th>' + DCOLS.map(([, n]) => '<th>' + n + '</th>').join("") + '</tr></thead><tbody>' + tags.map(t => { const r = m.get(t) || {}, e = Equip.get(t) || {};
          return '<tr><td><b>' + esc(t) + '</b>' + (e.n ? '<small>' + esc(e.n) + '</small>' : "") + '</td>' + DCOLS.map(([k]) => '<td>' + ((r[k] || []).map(dcLink).join("") || '<span class="dim">–</span>') + '</td>').join("") + '</tr>'; }).join("") + '</tbody></table>'
          + '<p class="dim dc-n">Numbers open the controlled copy in SharePoint. PDF downloads a copy for anyone without SharePoint access: check its revision before use. The work pack lists the same, with working links.</p>'; })
      .catch(e => { console.warn("documents", e); if (box.isConnected) b.innerHTML = '<span class="dim">Couldn\'t load the drawing and document lists.</span>'; }); }
  async function act(k, a, list, i){
    if (k === "x") App.select(null);
    else if (k === "prev" || k === "next"){ const b = list[i + (k === "next" ? 1 : -1)]; if (b) App.select(b._p + ":" + b.u); }
    else if (k === "wp") Workpack.run(a);
    else if (k === "viewall") Media.view(a, 0);
    else if (k === "addph") Media.pickFiles(a, "image/*");
    else if (k === "addf") Media.pickFiles(a);
    else if (k === "del"){ if (await confirmBox("Delete " + Store.actId(a) + "?  You can undo with Ctrl+Z.", "Delete", true)){ Store.mutate("a:" + a._p, () => { a.del = true; Store.touch(a); }); Store.log("Deleted " + Store.actId(a)); App.select(null); } } }
  function files(a, l, ro){ l.innerHTML = a.files.length ? "" : '<div class="dim">No attachments. Drop a PDF, Excel or any file on the action.</div>';
    a.files.forEach(f => { const r = h('<div class="att"><span class="att-ic">' + (/pdf$/i.test(f.name) ? "PDF" : /xlsx?$|csv$/i.test(f.name) ? "XLS" : /docx?$/i.test(f.name) ? "DOC" : "FILE") + '</span><button type="button" class="link att-n">' + esc(f.name) + '</button><span class="dim">' + fmtSize(f.size || 0) + '</span>' + (ro ? "" : '<button type="button" class="ic-b sm" title="Remove">✕</button>') + '</div>');
      $(".att-n", r).onclick = () => Media.openFile(a, f);
      const x = $(".ic-b", r); if (x) x.onclick = () => Store.mutate("a:" + a._p, () => { const i = a.files.indexOf(f); if (i >= 0) a.files.splice(i, 1); Store.touch(a); });
      l.appendChild(r); }); }
  return { render };
})();
