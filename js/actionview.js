/* The action view: clicking an action opens it in the side panel beside the list (or a pop up). The header holds
   everything for that one action (close, previous and next, stage, owner, the workpack PDF, complete, delete); below it the
   action's own tabs: Overview (problem, solution, photos, notes, attachments, details), MTO, Spares and
   Isolations. */
"use strict";
const ActionView = (() => {
  const CORE = new Set(["title", "status", "priority", "problem", "solution", "notes"]);
  const TABS = [["overview", "Overview"], ["materials", "Materials"], ["isol", "Isolations"], ["drawings", "Drawings"]];   // (Materials holds the MTO and Spares)
  /* simple yes or no fields (tick boxes, Yes / No choices) are kept to the Actions table, not the action's details */
  const yesNo = f => f.type === "check" || (f.type === "choice" && (f.options || []).filter(o => !o.del).length && (f.options || []).filter(o => !o.del).every(o => /^(yes|no)$/i.test(o.label)));
  /* the little diagonal arrow on a heading that opens more (a tab, the photos) */
  const GO = '<svg class="go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 16 16 8"/><path d="M9 8h7v7"/></svg>';
  const DLI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="M7 10.5l5 5 5-5"/><path d="M5 20h14"/></svg>';
  let last = null;
  /* (the same action with its keys in another order, as after a save, reads the same) */
  const stable = o => Array.isArray(o) ? o.map(stable) : o && typeof o === "object" ? Object.keys(o).filter(k => k[0] !== "_").sort().map(k => [k, stable(o[k])]) : o;
  function render(el){ const a = App.act(App.selRef); if (!a) return; const ro = !Store.S.edit, p = Store.project(a._p) || {}, sub = App.sub || "overview";
    /* keep the cursor and scroll where they were when the view redraws */
    const ae = document.activeElement, keep = ae && el.contains(ae) && ae.closest("[data-f]") ? { f: ae.closest("[data-f]").dataset.f, s: ae.selectionStart, e: ae.selectionEnd, v: ae.value, tag: ae.tagName } : null;
    const keepP = ae && el.contains(ae) && ae.dataset.c ? { r: ae.dataset.r, c: ae.dataset.c, cut: ae.dataset.cut, s: ae.selectionStart, v: ae.value } : null;
    const same = last === App.selRef + sub, sc = same && $(".av-body", el) ? $(".av-body", el).scrollTop : 0; last = App.selRef + sub;
    const list = Table.rows(), i = list.indexOf(a), n = k => (a[k] || []).length;
    /* nothing about this action, its tab or the settings has changed (a save finishing, a redraw for something else):
       leave the panel as it is, so its photos and map don't flash */
    const sig = JSON.stringify([stable(a), Media.pendingOf(a).length, sub, ro, i, list.length, Store.S.config.mod, (Store.S.config.contacts || []).length, Store.S.vendors && Store.S.vendors.mod, Equip.count, Store.projects().length]);
    if (el.__sig === sig && el.isConnected && $(".av", el)) return; el.__sig = sig;
    /* the header repeats the list row: complete, delete and on hold, then the ID with its copy and PDF buttons; the arrows and close sit at the right */
    el.innerHTML = '<div class="av"><div class="av-head" data-ref="' + esc(a._p + ":" + a.u) + '">' + Table.rowBtns(a) + Table.idBox(a, true) + (Store.projects().length > 1 ? '<span class="ptag" style="--c:' + esc(p.color || "#64748b") + '">' + esc(p.name || "") + '</span>' : "") + '<span class="grow"></span>'
      + '<span class="av-nav"><button type="button" class="ic-b" data-k="prev" title="Previous action"' + (i > 0 ? "" : " disabled") + '>‹</button><span class="dim">' + (i >= 0 ? (i + 1) + " of " + list.length : "") + '</span><button type="button" class="ic-b" data-k="next" title="Next action"' + (i >= 0 && i < list.length - 1 ? "" : " disabled") + '>›</button></span>'
      + '<button type="button" class="ic-b av-close" data-k="x" title="Close (Esc)" aria-label="Close">✕</button></div>'
      + '<div class="av-title" data-f="title"></div>'
      + '<div class="av-tabs">' + TABS.map(([k, t]) => { const mat = sub === "mto" || sub === "spares", on = k === sub || (k === "materials" && mat), c = k === "materials" ? n("mto") + n("spares") : k === "isol" ? n("isol") : k === "drawings" ? Drawings.count(a) : 0; return '<button type="button" class="av-tab' + (on ? " on" : "") + '" data-sub="' + k + '">' + t + (c ? ' <b>' + c + '</b>' : "") + '</button>'; }).join("") + '</div>'
      + '<div class="av-body' + (sub === "overview" ? " ov" : "") + '"></div></div>';
    $$(".av-head [data-f], .av-title[data-f]", el).forEach(d => { const f = Store.field(d.dataset.f); if (f) d.appendChild(Fields.editor(a, f, ro)); });
    const ti = $(".av-title .in", el); if (ti) ti.placeholder = "Title";
    /* a title too long for the header ends in … with a more… that opens it in full to read and edit */
    const avt = $(".av-title", el); if (avt){ const mb = h('<button type="button" class="av-more" title="Show the full title">more…</button>'); avt.appendChild(mb); mb.onclick = () => Fields.textPop(avt, a, Store.field("title"));
      const fit = () => { if (!avt.isConnected){ ob.disconnect(); return; } const t = $(".in, .fv", avt); avt.classList.toggle("cut", !!t && document.activeElement !== t && t.scrollWidth > t.clientWidth + 1); };
      const ob = new ResizeObserver(fit); ob.observe(avt); const t = $(".in", avt); if (t){ t.addEventListener("focus", fit); t.addEventListener("blur", () => setTimeout(fit, 0)); } }
    const body = $(".av-body", el);
    if (sub === "overview") overview(body, a, ro); else if (sub === "isol") Isol.renderFor(body, a, keepP); else if (sub === "drawings") Drawings.renderFor(body, a); else { Parts.renderFor(body, a, sub, keepP); body.insertAdjacentHTML("afterbegin", '<div class="av-sub" role="tablist">' + [["mto", "MTO"], ["spares", "Spares"]].map(([k, t]) => '<button type="button" data-m="' + k + '"' + (k === sub ? ' class="on"' : "") + '>' + t + (n(k) ? ' <b>' + n(k) + '</b>' : "") + '</button>').join("") + '</div>'); $$(".av-sub button", body).forEach(b => b.onclick = () => { App.sub = b.dataset.m; lsSet("adMat", b.dataset.m); App.render(); }); }
    body.scrollTop = sc;
    if (keep){ const t = $('[data-f="' + keep.f + '"] input, [data-f="' + keep.f + '"] textarea, [data-f="' + keep.f + '"] select', el); if (t){ if (t.tagName === keep.tag && t.tagName !== "SELECT" && t.value !== keep.v) { t.value = keep.v; t.addEventListener("blur", () => t.dispatchEvent(new Event("change")), { once: true }); } t.focus(); try { if (keep.s != null) t.setSelectionRange(keep.s, keep.e); } catch (e) {} } }
    $$(".av-head [data-k]", el).forEach(b => b.onclick = () => act(b.dataset.k, a, list, i));
    $$(".av-tab", el).forEach(b => b.onclick = () => { const k = b.dataset.sub; App.sub = k === "materials" ? (App.sub === "spares" ? "spares" : lsGet("adMat", "mto")) : k; App.render(); });
    const av = $(".av", el); av.ondragover = e => { if (Media.hasDrop(e) && sub === "overview"){ e.preventDefault(); av.classList.add("drop"); } };
    av.ondragleave = e => { if (!av.contains(e.relatedTarget)) av.classList.remove("drop"); };
    av.ondrop = e => { av.classList.remove("drop"); if (sub === "overview" && Media.hasDrop(e)){ e.preventDefault(); e.stopPropagation(); Media.dropOn(a, e); } }; }

  /* the action owner: anyone signed in (or any name typed); their name, role, mobile and email go on the work pack */
  /* (the names come from the people who've signed up; a new name typed in is tidied to capitals and joins that list) */
  function ownerBox(box, a, ro){ const cur = Store.owner(a);
    if (ro){ box.innerHTML = '<b>' + esc(cur.n || "–") + '</b>'; return; }
    box.innerHTML = '<input class="in sm" value="' + esc(cur.n || "") + '" placeholder="Who owns it" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="false">';
    const i = $("input", box); let dd = null, res = [], hi = 0;
    const close = () => { if (dd){ dd.remove(); dd = null; } i.setAttribute("aria-expanded", "false"); };
    const draw = () => { const w = qWords(i.value); res = Store.people().filter(u => !w.length || smartHit(Store.fullName(u) + " " + (u.role || ""), w)).sort((x, y) => Store.fullName(x).localeCompare(Store.fullName(y))).slice(0, 30);
      if (!res.length){ close(); return; } hi = Math.min(hi, res.length - 1);
      if (!dd){ dd = h('<div class="tg-dd" role="listbox"></div>'); document.body.appendChild(dd); }
      dd.innerHTML = res.map((u, k) => '<div class="tg-o' + (k === hi ? " on" : "") + '" role="option" data-k="' + k + '"><span class="tg-x"><b>' + esc(Store.fullName(u)) + '</b><span>' + esc(u.nameOnly ? "Not signed up yet" : [u.role, u.company].filter(Boolean).join(" · ") || u.email || u.id) + '</span></span></div>').join("");
      const r = i.getBoundingClientRect(); Object.assign(dd.style, { left: r.left + "px", top: r.bottom + 3 + "px", width: Math.max(r.width, 260) + "px" }); i.setAttribute("aria-expanded", "true");
      $$(".tg-o", dd).forEach(o => o.onmousedown = e => { e.preventDefault(); i.value = Store.fullName(res[+o.dataset.k]); close(); i.blur(); }); };
    const save = () => { close(); const n = properName(i.value); i.value = n; if (n === (cur.n || "")) return; const u = Store.people().find(x => Store.fullName(x).toLowerCase() === n.toLowerCase());
      if (n && !u) Store.addPerson(n);
      Store.mutate("a:" + a._p, () => { if (n) a.owner = u && !u.nameOnly ? { n: Store.fullName(u), e: u.id } : { n }; else delete a.owner; Store.touch(a); }); Store.log("Changed the owner of " + Store.actId(a)); };
    i.onfocus = () => { i.select(); hi = 0; draw(); }; i.oninput = () => { hi = 0; draw(); }; i.onblur = save;
    i.onkeydown = e => { if (dd && (e.key === "ArrowDown" || e.key === "ArrowUp")){ e.preventDefault(); hi = (hi + (e.key === "ArrowDown" ? 1 : -1) + res.length) % res.length; draw(); }
      else if (e.key === "Enter"){ if (dd && res[hi]) i.value = Store.fullName(res[hi]); i.blur(); } else if (e.key === "Escape"){ i.value = cur.n || ""; close(); i.blur(); } }; }
  /* the change history: who changed what, and when, newest first (opened from the small link at the foot of Overview) */
  function history(a){ const hs = (a.hist || []).slice().reverse();
    const when = t => new Date(t).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const m = modal('<h3>Change history <span class="dim">' + esc(Store.actId(a)) + (a.oldId ? ", was " + esc(a.oldId) : "") + '</span></h3>'
      + (hs.length ? '<div class="ch-l">' + hs.map(h => '<div class="ch-e"><div class="ch-h"><b>' + esc(h.by || "Someone") + '</b><span class="dim">' + esc(when(h.t)) + (h.note ? " · " + esc(h.note) : "") + '</span></div>'
          + (h.c || []).map(([k, f, t]) => '<div class="ch-c"><span class="ch-k">' + esc(k) + '</span>' + (f || t ? '<span class="ch-v">' + (f ? '<s>' + esc(f) + '</s>' : "") + (f && t ? ' → ' : "") + (t ? esc(t) : "") + '</span>' : "") + '</div>').join("") + '</div>').join("") + '</div>'
        : '<p class="dim">No changes recorded yet. Changes are recorded from now on.</p>')
      + '<p class="dim sm-t">Created ' + esc(when(a.created || a.mod)) + '.' + tipI("The last 400 changes are kept with the action.") + '</p><div class="yn-btns"><button class="yn-yes" type="button">Close</button></div>', { cls: "ch-win" });
    $(".yn-yes", m).onclick = () => m.close(); }
  function overview(el, a, ro){
    el.innerHTML = (!Store.mine(a) && a.mod && now() - a.mod < 15 * 60000 ? '<div class="sd-warn">⚠ <b>' + esc(App.who(a)) + '</b> edited this action ' + esc(App.ago(a.mod)) + ' and may still be working on it. Changes to different fields are both kept; if you both change the same field you\'ll both be warned.</div>' : "")
      + '<div class="ov-g"><div class="ov-l"><h4>Problem</h4><div data-f="problem"></div><h4>Solution</h4><div data-f="solution"></div><h4>Notes</h4><div data-f="notes"></div>'
      + '<h4>Attachments <span class="cnt">' + (a.files.length || "") + '</span></h4><div class="att-l"></div>'
      + '<h4>Photos <span class="cnt">' + (a.photos.length || "") + '</span><button type="button" class="ph-cp" data-k="phcopy" title="Copy a picture of this action: ID and title, problem, solution and every photo" aria-label="Copy a picture of the problem, solution and photos">' + Table.IDI.copy + '</button></h4><div class="ph-fill"><div class="ph-g"></div></div></div>'
      + '<div class="ov-r">'
      + '<h4>Details</h4><div class="det"></div><h4 class="det-h2" hidden>Contractor</h4><div class="det det-c"></div><h4 class="det-h2">Record</h4><div class="det det-m"></div><div class="sd-foot">' + (a.by ? "Last edited by " + esc(a.by) + " " + esc(fmtDate(a.mod)) + " · " : "") + '<button type="button" class="link ch-ln" data-k="hist">Change history</button>' + (a.gps ? ' · <a target="_blank" rel="noopener" href="https://maps.google.com/?q=' + a.gps.lat + "," + a.gps.lng + '">Map pin</a>' : "") + '</div></div></div>';
    $$("[data-f]", el).forEach(d => { const f = Store.field(d.dataset.f); if (f) d.appendChild(Fields.editor(a, f, ro)); });
    $$("[data-f=problem] textarea,[data-f=solution] textarea,[data-f=notes] textarea", el).forEach(t => t.rows = 4);
    photos(a, $(".ph-fill", el), ro);
    files(a, $(".att-l", el), ro);
    /* (the expected location map is for the work pack only, not shown here) */
    const det = $(".det", el);
    /* the action owner leads the details: their name and contact details go on the workpack */
    const ow = h('<div class="det-r det-own"><label>Action owner</label><span class="own"></span></div>'); det.appendChild(ow); ownerBox($(".own", ow), a, ro);
    /* the details in three parts: the job, the contractor, and the record of when (created, modified, completed) */
    const CONTR = /^contractor/;
    Store.fields().filter(f => !CORE.has(f.id) && !["mto", "sparelist", "isollist", "complete"].includes(f.type) && !Fields.DERIVED[f.id] && !yesNo(f)).forEach(f => { const r = h('<div class="det-r" data-f="' + f.id + '"><label>' + esc(f.label) + '</label></div>'); r.appendChild(Fields.editor(a, f, ro)); (CONTR.test(f.id) ? $(".det-c", el) : f.type === "meta" ? $(".det-m", el) : det).appendChild(r); });
    $(".det-c", el).previousElementSibling.hidden = !$(".det-c", el).children.length;
    $$("[data-k]", el).forEach(b => b.onclick = () => act(b.dataset.k, a)); }
  async function act(k, a, list, i){
    if (k === "x") App.select(null);
    else if (k === "prev" || k === "next"){ const b = list[i + (k === "next" ? 1 : -1)]; if (b) App.select(b._p + ":" + b.u, App.sub); }   // (stays on the tab you were on: Materials, Isolations, Drawings)
    else if (k === "wp") Workpack.run(a);
    else if (k === "hist") history(a);
    else if (k === "phcopy") Table.copySheet($("[data-k=phcopy]"), a);
    else if (k === "done"){ const f = Store.field("complete"); if (f) Fields.set(a, f, Store.stage(a.stage).kind !== "done"); }
    else if (k === "viewall") Media.view(a, 0);
    else if (k === "addph") Media.pickFiles(a, "image/*");
    else if (k === "addf") Media.pickFiles(a);
    else if (k === "del"){ if (await confirmBox("Delete " + Store.actId(a) + "? It goes to the Deleted pill, where its bin brings it back.", "Delete", true)){ Store.mutate("a:" + a._p, () => { a.del = true; Store.touch(a); }); Store.log("Deleted " + Store.actId(a)); App.select(null); } } }
  /* every photo as an even tile under the attachments, click one to view it. The tiles fill the width, in the fewest
     columns (at least 2) whose rows still fit the height left beside the map and details; if none fit, the smallest
     tiles and the box grows */
  const GRID = new Map();
  function photos(a, box, ro){ const g = $(".ph-g", box), up = Media.pendingOf(a), n = a.photos.length + up.length + (ro ? 0 : 1), GAP = 6, MIN = 64;
    g.innerHTML = a.photos.map((p, i) => '<div class="ph-c"><button type="button" class="ph-t" data-i="' + i + '" title="View photo ' + (i + 1) + '"><img alt="Photo ' + (i + 1) + '" loading="lazy"></button>' + (ro ? "" : '<button type="button" class="ph-del" data-i="' + i + '" title="Remove this photo" aria-label="Remove photo ' + (i + 1) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/></svg></button>') + '</div>').join("")
      + up.map(u => '<div class="ph-c ph-up" data-pid="' + u.id + '" title="Adding this photo…"><img alt="Photo being added" src="' + esc(u.url) + '"><span class="ph-bar" aria-hidden="true"><i style="width:' + Math.round(u.p * 100) + '%"></i></span></div>').join("")
      + (ro ? "" : '<button type="button" class="ph-add" title="Upload photos, or drop or paste them anywhere on the action">+ Add photos</button>');
    $$(".ph-t", g).forEach(b => { const p = a.photos[+b.dataset.i], im = $("img", b); im.src = Media.src(a, p, true); im.onerror = () => { if (!im.dataset.r){ im.dataset.r = 1; im.src = Media.src(a, p); } }; b.onclick = () => Media.view(a, +b.dataset.i); });
    /* drag a tile onto another to move it there; the tile under it gets a line on the side it will go */
    if (!ro) $$(".ph-c:not(.ph-up)", g).forEach((c, i) => { c.draggable = true;
      c.addEventListener("dragstart", e => { e.dataTransfer.setData("x-ph", String(i)); e.dataTransfer.effectAllowed = "move"; c.classList.add("ph-drag"); });
      c.addEventListener("dragend", () => { c.classList.remove("ph-drag"); $$(".ph-c", g).forEach(x => x.classList.remove("ph-l", "ph-r")); });
      const side = e => { const r = c.getBoundingClientRect(); return e.clientX < r.left + r.width / 2 ? "l" : "r"; };
      c.addEventListener("dragover", e => { if (!e.dataTransfer.types.includes("x-ph")) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move"; const sd = side(e); c.classList.toggle("ph-l", sd === "l"); c.classList.toggle("ph-r", sd === "r"); });
      c.addEventListener("dragleave", () => c.classList.remove("ph-l", "ph-r"));
      c.addEventListener("drop", e => { if (!e.dataTransfer.types.includes("x-ph")) return; e.preventDefault(); e.stopPropagation(); c.classList.remove("ph-l", "ph-r");
        const from = +e.dataTransfer.getData("x-ph"); let to = i + (side(e) === "r" ? 1 : 0); if (from < to) to--; if (to === from || !a.photos[from]) return;
        Store.mutate("a:" + a._p, () => { const [p] = a.photos.splice(from, 1); a.photos.splice(to, 0, p); Store.touch(a); }); Store.log("Reordered the photos of " + Store.actId(a)); }); });
    $$(".ph-del", g).forEach(b => b.onclick = async () => { const i = +b.dataset.i, p = a.photos[i];
      if (p && await confirmBox("Remove photo " + (i + 1) + " from " + Store.actId(a) + "? You can undo with Ctrl+Z.", "Remove", true)){ Store.mutate("a:" + a._p, () => { const k = a.photos.indexOf(p); if (k >= 0) a.photos.splice(k, 1); Store.touch(a); }); Store.log("Removed a photo from " + Store.actId(a)); } });
    const ad = $(".ph-add", g); if (ad) ad.onclick = () => Media.pickFiles(a, "image/*");
    if (!n) return;
    let last = ""; const was = GRID.get(a.u); if (was){ g.style.gridTemplateColumns = was[0]; g.style.gridAutoRows = was[1]; box.style.minHeight = was[2]; }   // (the last sizes straight away, so a redraw doesn't jump)
    const fit = () => { if (!box.isConnected){ ro2.disconnect(); return; } box.style.minHeight = ""; const W = box.clientWidth, H = box.clientHeight; if (!W) return;
      const one = getComputedStyle(box.closest(".ov-g")).gridTemplateColumns.split(" ").length < 2, size = c => (W - GAP * (c - 1)) / c, tall = c => { const r = Math.ceil(n / c); return r * size(c) + GAP * (r - 1); };
      let c = one ? 3 : 2;   // stacked under the details there's no height to fill, so three across
      if (!one) while (tall(c) > H && c < n && size(c + 1) >= MIN) c++;   // never more columns than tiles
      const s = Math.floor(size(c)), need = Math.ceil(tall(c)), k = c + "," + s;
      box.style.minHeight = need > H ? need + "px" : "";
      if (k === last) return; last = k; g.style.gridTemplateColumns = "repeat(" + c + "," + s + "px)"; g.style.gridAutoRows = s + "px"; GRID.set(a.u, [g.style.gridTemplateColumns, g.style.gridAutoRows, box.style.minHeight]); };
    const ro2 = new ResizeObserver(() => requestAnimationFrame(fit)); ro2.observe(box.closest(".ov-g") || box); requestAnimationFrame(fit); }
  /* the files, then a slim dashed bar one box high to attach another (or drop one on it) */
  function files(a, l, ro){ l.innerHTML = a.files.length || !ro ? "" : '<div class="dim">No attachments.</div>';
    a.files.forEach(f => { const r = h('<div class="att"><span class="att-ic">' + (/pdf$/i.test(f.name) ? "PDF" : /xlsx?$|csv$/i.test(f.name) ? "XLS" : /docx?$/i.test(f.name) ? "DOC" : "FILE") + '</span><button type="button" class="link att-n">' + esc(f.name) + '</button><span class="dim">' + fmtSize(f.size || 0) + '</span>' + (ro ? "" : '<button type="button" class="ic-b sm" title="Remove">✕</button>') + '</div>');
      $(".att-n", r).onclick = () => Media.openFile(a, f);
      const x = $(".ic-b", r); if (x) x.onclick = () => Store.mutate("a:" + a._p, () => { const i = a.files.indexOf(f); if (i >= 0) a.files.splice(i, 1); Store.touch(a); });
      l.appendChild(r); });
    if (!ro){ const b = h('<button type="button" class="att-add" title="Attach a PDF, Excel or any file, or drop one here">+ Attach file</button>'); b.onclick = () => Media.pickFiles(a);
      b.ondragover = e => { if (Media.hasDrop(e)){ e.preventDefault(); b.classList.add("drop"); } }; b.ondragleave = () => b.classList.remove("drop"); b.ondrop = () => b.classList.remove("drop"); l.appendChild(b); } }
  return { render };
})();
