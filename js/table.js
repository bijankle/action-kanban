/* The Actions tab: one row per action, filtered by the search box and the stage pills.
   Click a row to open it in the side panel. Drag a header to reorder columns, drag its edge to resize. */
"use strict";
const Table = (() => {
  const NEED = { act: 144, id: 200, stage: 150, rank: 60, check: 34, complete: 34, choice: 96, date: 104, meta: 96, mto: 64, sparelist: 64, isollist: 64, phone: 116, number: 64 };
  let cv = null; const TICK = new Set(["check", "complete"]);
  /* a tick column's heading is one word (its short name); the i beside it says what it means */
  const head = c => TICK.has(c.type) && c.short ? c.short : c.label;
  document.addEventListener("click", e => { const b = e.target.closest(".th-i"); if (!b) return; e.stopPropagation(); e.preventDefault(); Fields.closePop(); const f = Store.field(b.dataset.c); if (!f) return;
    const p = h('<div class="pop thpop"><b>' + esc(f.label) + '</b>' + (f.desc ? '<p>' + esc(f.desc) + '</p>' : "") + '</div>'); document.body.appendChild(p); Fields.place(p, b); }, true);
  /* the width of a heading's longest word, plus the cell padding and room for the sort arrow */
  function headW(label, font){ cv = cv || document.createElement("canvas").getContext("2d"); cv.font = font || "700 13px " + getComputedStyle(document.body).fontFamily;
    return Math.ceil(Math.max(...String(label || "").split(/\s+/).map(w => cv.measureText(w).width), 0)) + 20 + 10; }
  const W = { text: 200, longtext: 260, multi: 170, stage: 170, rank: 74, check: 90, choice: 120, date: 120, contact: 160, phone: 130, number: 90 };
  const widths = () => lsGet("adColW", {});
  function cols(){ const c = [{ id: "_act", label: "", type: "act" }, { id: "_id", label: "ID", type: "id" }]; if (Store.selected().length > 1) c.push({ id: "_proj", label: "Project", type: "proj" });
    return c.concat(Store.fields().filter(f => f.table)); }
  /* what's on show: the projects ticked, the stage pills, the search */
  /* the order sticks while you work: ticking Done or Hold, or changing a status, leaves the row where it is (so you
     can carry on with it) until the list is opened again, sorted, filtered or searched */
  let stick = { ctx: null, pos: new Map() };
  const forget = () => { stick = { ctx: null, pos: new Map() }; };
  function rows(fresh){ const list = sorted(); if (fresh) return list;
    const ctx = [App.tab, JSON.stringify(App.sort || {}), App.q || "", JSON.stringify(lsGet("adF", {})), [...(App.pills || [])].join(","), Store.selected().join(",")].join("|"), ref = a => a._p + ":" + a.u;
    if (ctx === stick.ctx){ const at = a => stick.pos.has(ref(a)) ? stick.pos.get(ref(a)) : -1, had = new Set(list.map(ref));
      Store.visible().forEach(a => { if (!had.has(ref(a)) && stick.pos.has(ref(a))) list.push(a); });   // (one that no longer fits a Status filter stays too, until next time)
      list.sort((x, y) => at(x) - at(y)); }   // (new ones first, the rest where they were)
    stick = { ctx, pos: new Map(list.map((a, i) => [ref(a), i])) }; return list; }
  function sorted(){ let list = Filters.apply(Store.visible());   // (the search box and the Filters panel's pills)
    const so = App.sort, ord = new Map(Store.stages().map((s, i) => [s.id, i]));
    const base = (x, y) => (ord.get(x.stage) - ord.get(y.stage)) || (x.rank || 0) - (y.rank || 0) || x.no - y.no;
    if (so && so.id){ const f = Store.field(so.id); const key = a => so.id === "_id" ? Store.actId(a) : so.id === "_proj" ? (Store.project(a._p) || {}).name : f ? (f.type === "rank" ? Fields.val(a, f) : f.type === "stage" ? ord.get(a.stage) : ["date", "meta", "number", "mto", "sparelist", "isollist"].includes(f.type) ? (v => v === "" || v == null || v === "TBC" || v === "N/A" || (typeof v === "number" && isNaN(v)) ? "\uffff" : typeof v === "number" ? String(v).padStart(16, "0") : String(v))(Fields.val(a, f)) : Fields.text(a, f).toLowerCase()) : "";
      list.sort((x, y) => { const kx = key(x), ky = key(y); const r = kx < ky ? -1 : kx > ky ? 1 : 0; return (r * so.dir) || base(x, y); }); }
    else list.sort(base);
    return list; }
  let ro = null, lastLv = -1, levelOf = () => -1;
  /* the row's own buttons, before the ID: complete (green), delete (red) and on hold (amber) */
  const IC = { done: '<svg class="big" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12.5l5 5 10-11"/></svg>',
    hold: '<svg class="big" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M8.75 7.25v9.5M15.25 7.25v9.5"/></svg>',
    del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/></svg>' };
  function rowBtns(a){ const dn = Store.stage(a.stage).kind === "done", hd = Hold.on(a), id = esc(Store.actId(a)), dis = Store.S.edit ? "" : " disabled";
    const b = (k, on, tip) => '<button type="button" class="rb rb-' + k + (on ? " on" : "") + '" data-rb="' + k + '" aria-pressed="' + on + '" title="' + tip + '" aria-label="' + tip + '"' + dis + '>' + IC[k] + '</button>';
    /* complete, delete, then on hold furthest right, with its i (who it's waiting on, red while details are missing) after it */
    return '<span class="rbs">' + b("done", dn, dn ? "Complete: click to reopen " + id : "Mark " + id + " complete") + b("del", false, "Delete " + id) + b("hold", hd, hd ? "On hold: click to take " + id + " off hold" : "Put " + id + " on hold") + '<span class="rb-hi">' + Hold.btn(a) + '</span></span>'; }
  /* the ID in a box with its copy and PDF buttons, in the list and the Details header alike */
  const IDI = { copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2"/><path d="M15.5 8.5V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7.5a2 2 0 002 2h2.5"/></svg>',
    tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5 9.5-10"/></svg>',
    dn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="M7 10.5l5 5 5-5"/><path d="M5 20h14"/></svg>' };
  function idBox(a, big){ const id = esc(Store.actId(a));
    return '<span class="idw' + (big ? " big" : "") + '"' + (a.oldId ? ' title="Was ' + esc(a.oldId) + '"' : "") + '><span class="aid">' + id + '</span><button type="button" class="cp" data-idk="copy" title="Copy ' + id + ' to the clipboard" aria-label="Copy ' + id + '">' + IDI.copy + '</button><button type="button" class="pj" data-idk="pdf" title="Download the workpack PDF: details, problem, solution, notes, photos, isolations, MTO and spares" aria-label="Download the PDF of ' + id + '">' + IDI.dn + '<b>PDF</b></button></span>'; }
  document.addEventListener("click", async e => { const b = e.target.closest("[data-idk]"); if (!b) return; e.stopPropagation(); const r = b.closest("[data-ref]"), a = r && App.act(r.dataset.ref); if (!a) return;
    if (b.dataset.idk === "pdf") return Workpack.run(a);
    const t = Store.actId(a) + " " + (a.f.title || ""); let ok = true; try { await navigator.clipboard.writeText(t); } catch (err){ ok = false; }
    if (!ok) return note("Couldn't copy here: " + t); b.classList.add("ok"); b.innerHTML = IDI.tick; note("Copied " + Store.actId(a)); setTimeout(() => { b.classList.remove("ok"); b.innerHTML = IDI.copy; }, 1400); }, true);
  document.addEventListener("click", async e => { const b = e.target.closest("[data-rb]"); if (!b) return; e.stopPropagation(); const tr = b.closest("[data-ref]"), a = tr && App.act(tr.dataset.ref); if (!a) return;
    if (!Store.S.edit) return App.viewOnly(); const k = b.dataset.rb;
    if (k === "done"){ const f = Store.field("complete"); if (f) Fields.set(a, f, Store.stage(a.stage).kind !== "done"); }
    else if (k === "hold"){ const f = Store.field("onhold") || { id: "onhold", type: "check" }; Fields.set(a, f, !Hold.on(a)); }
    else if (k === "del"){ if (await confirmBox("Delete " + Store.actId(a) + "?  You can undo with Ctrl+Z.", "Delete", true)){ Store.mutate("a:" + a._p, () => { a.del = true; Store.touch(a); }); Store.log("Deleted " + Store.actId(a)); if (App.selRef === tr.dataset.ref) App.select(null); } } }, true);
  /* titles are one line: a title too long for its column ends in … with a more… that shows it in full */
  function cut(el){ $$("td.ttl", el).forEach(td => { const t = $(".tt", td); if (t) td.classList.toggle("cut", t.scrollWidth > t.clientWidth + 1); }); }
  document.addEventListener("click", e => { const b = e.target.closest(".tt-more"); if (!b) return; e.stopPropagation(); Fields.closePop(); const tr = b.closest("tr"), a = tr && App.act(tr.dataset.ref); if (!a) return;
    const p = h('<div class="pop ttpop"><div class="ttpop-id">' + esc(Store.actId(a)) + '</div><div class="ttpop-t">' + esc(a.f.title || "") + '</div><button type="button" class="link">Open the action</button></div>');
    document.body.appendChild(p); Fields.place(p, b); $(".link", p).onclick = () => { Fields.closePop(); App.select(tr.dataset.ref); }; }, true);
  function render(el){ if (App.view === "tiles") return tiles(el); const all = cols(), ws = widths(), list = rows(), sel = App.last;
    /* the columns share the width there is (their widths are proportions), so the list never scrolls sideways */
    /* the narrow columns (ID, stage, ticks, counts) keep their width; the text columns share what's left */
    /* a column nobody has sized: the narrow kinds (ticks, yes or no, dates, counts) are as wide as the longest word in
       their heading (headings wrap onto two lines), or what their contents need if that's wider */
    /* the tick box columns are all one width: the widest of their headings' longest words */
    const tickF = "700 11.5px " + getComputedStyle(document.body).fontFamily, tickW = Math.max(52, ...all.filter(c => TICK.has(c.type)).map(c => headW(head(c), tickF) + 20));   // (+ the i)
    const px = c => ws[c.id] || (TICK.has(c.type) ? tickW : fix(c) ? Math.max(headW(c.label), NEED[c.type] || 60) : c.type === "proj" ? 140 : W[c.type] || 140);
    const FIX = new Set(["act", "id", "stage", "rank", "check", "complete", "mto", "sparelist", "isollist", "date", "meta", "phone", "number"]), fix = c => FIX.has(c.type) || (c.type === "choice" && (c.options || []).length <= 3) || !!ws[c.id];   // (a column someone has sized keeps that width; the rest share what's left)
    /* when space runs out, the counts and dates go first, then the location; the tick boxes stay */
    const lp = c => (["sparelist", "isollist", "date", "meta", "phone", "number"].includes(c.type) || (c.type === "choice" && (c.options || []).length <= 3)) ? " lp1" : c.id === "location" ? " lp2" : "";
    /* the least each column can be; when they don't all fit, the tick columns go first, then the dates and numbers,
       so a title never gets squeezed to one letter per line (and the list scrolls sideways only if even that's not enough) */
    const fw = c => ws[c.id] || (c.type === "id" ? NEED.id : Math.min(px(c), 150));   // (the ID column fits its box: ID, copy, PDF)   // (a width someone set is kept as it is)
    const least = c => fix(c) ? fw(c) : c.id === "title" ? 260 : 110;
    const lv = c => lp(c) === " lp1" ? 1 : lp(c) === " lp2" ? 2 : 3, need = n => all.filter(c => lv(c) > n).reduce((t, c) => t + least(c), 0);
    const w = el.clientWidth || 9999, level = need(0) <= w ? 0 : need(1) <= w ? 1 : 2, cs = all.filter(c => lv(c) > level); lastLv = level; levelOf = w2 => need(0) <= w2 ? 0 : need(1) <= w2 ? 1 : 2;
    if (!ro && window.ResizeObserver){ ro = new ResizeObserver(() => { if (App.view === "tiles" || !el.isConnected || !$(".tbl", el)) return; if (levelOf(el.clientWidth) !== lastLv) App.render(); else cut(el); }); ro.observe(el); }
    /* the spare width at the end goes to the + Add column strip, so every column stays as wide as it was set */
    const ADD = Store.S.edit ? 140 : 0, fixW = cs.filter(fix).reduce((t, c) => t + fw(c), 0) + ADD, flex = cs.filter(c => !fix(c)), ftot = flex.reduce((t, c) => t + px(c), 0) || 1;
    /* (a text column never goes below a readable width: with many columns the list scrolls sideways instead of squeezing a title to one letter per line) */
    const tight = cs.reduce((t, c) => t + least(c), 0) + ADD >= w;   // (no room to share: each text column takes its least width, and the list scrolls sideways)
    const wid = c => fix(c) ? fw(c) + "px" : tight ? least(c) + "px" : "max(" + (c.id === "title" ? 260 : 110) + "px, calc((100% - " + fixW + "px) * " + (px(c) / ftot).toFixed(4) + "))";
    const th = cs.map(c => c.type === "act" ? '<th class="actc" data-c="_act" aria-label="Complete, delete, on hold" style="width:' + NEED.act + 'px"></th>' : '<th class="' + (lp(c) + (TICK.has(c.type) ? " tk" : "")).trim() + '" data-c="' + c.id + '" draggable="' + (c.id[0] !== "_") + '" style="width:' + wid(c) + '">'
      + '<span class="th-l">' + esc(head(c)) + (TICK.has(c.type) ? '<button type="button" class="th-i" data-c="' + esc(c.id) + '" title="' + esc(c.label) + '" aria-label="What ' + esc(head(c)) + ' means">i</button>' : "") + (App.sort && App.sort.id === c.id ? (App.sort.dir > 0 ? " ▲" : " ▼") : "") + '</span><i class="th-r"></i></th>').join("") + (ADD ? '<th class="addcol"' + (flex.length ? ' style="width:' + ADD + 'px"' : "") + '><button type="button" class="addc" aria-haspopup="true">+ Add column</button></th>' : "");
    const minW = cs.reduce((t, c) => t + least(c), 0) + ADD;
    el.innerHTML = '<div class="tbl-wrap"><table class="tbl" style="min-width:' + minW + 'px"><colgroup></colgroup><thead><tr>' + th + '</tr></thead><tbody></tbody></table>'
      + (list.length ? "" : '<div class="empty">' + (Store.visible().length ? "No actions match the filter." : "No actions yet. Click <b>+ New action</b>, or <b>Paste text</b> to make one from an email.") + '</div>') + '</div>';
    const tb = $("tbody", el), frag = document.createDocumentFragment();
    list.forEach(a => { const ref = a._p + ":" + a.u; const tr = document.createElement("tr"); tr.dataset.ref = ref; if (ref === sel) tr.className = "on";
      cs.forEach(c => { const td = document.createElement("td"); const l = lp(c).trim(); if (l) td.classList.add(l); if (TICK.has(c.type)) td.classList.add("tk");
        if (c.type === "act"){ td.classList.add("actc"); td.innerHTML = rowBtns(a); }
        else if (c.type === "id"){ td.classList.add("idc"); td.innerHTML = idBox(a); }
        else if (c.type === "proj"){ const p = Store.project(a._p) || {}; td.innerHTML = '<span class="ptag" style="--c:' + esc(p.color || "#64748b") + '">' + esc(p.name || "") + '</span>'; }
        else if (Store.S.edit && (["stage", "rank", "check", "complete", "multi", "choice"].includes(c.type) || c.id === "location") && !Fields.DERIVED[c.id]){ td.classList.add("ed"); td.appendChild(Fields.editor(a, c)); if (c.id === "onhold"){ const hb = Hold.btn(a); if (hb){ td.classList.add("has-hold"); td.insertAdjacentHTML("beforeend", hb); } } }
        else if (c.id === "title"){ td.classList.add("ttl"); td.innerHTML = '<div class="tt-w"><span class="tt">' + (esc(a.f.title || "") || '<span class="dim">No title</span>') + '</span><button type="button" class="tt-more" title="Show the full title">more…</button></div>'; }
        else td.innerHTML = Fields.show(a, c);
        tr.appendChild(td); });
      if (ADD){ const td = document.createElement("td"); td.className = "addcol"; tr.appendChild(td); }
      frag.appendChild(tr); });
    tb.appendChild(frag); cut(el);
    tb.onclick = e => { const tr0 = e.target.closest("tr"); const pl = e.target.closest("[data-parts]"); if (pl){ e.preventDefault(); return App.openParts(pl.dataset.ref, pl.dataset.parts); } 
      if (e.target.closest("select,input,label,button,a")) return; const tr = e.target.closest("tr"); if (tr) App.select(tr.dataset.ref); };
    /* files dropped on a row go to that action */
    tb.ondragover = e => { if (!Media.hasDrop(e)) return; e.preventDefault(); const tr = e.target.closest("tr"); $$("tr.drop", tb).forEach(x => x !== tr && x.classList.remove("drop")); tr && tr.classList.add("drop"); };
    tb.ondragleave = e => { if (!tb.contains(e.relatedTarget)) $$("tr.drop", tb).forEach(x => x.classList.remove("drop")); };
    tb.ondrop = e => { const tr = e.target.closest("tr"); $$("tr.drop", tb).forEach(x => x.classList.remove("drop")); if (!tr || !Media.hasDrop(e)) return; e.preventDefault(); e.stopPropagation(); const a = App.act(tr.dataset.ref); Media.dropOn(a, e); };
    const ab = $(".addc", el); if (ab) ab.onclick = e => { e.stopPropagation(); addPop(ab); };
    wireHead(el, cs); }
  /* + Add column: the columns not in the list, A to Z, with a search; picking one adds it at the end */
  function addPop(anchor){ Fields.closePop(); const hid = Store.fields().filter(f => !f.table && f.id !== "title").sort((x, y) => x.label.localeCompare(y.label));
    const p = h('<div class="pop addpop"><div class="pop-h">Add a column</div>' + (hid.length ? '<input class="in" type="search" placeholder="Search columns" aria-label="Search columns"><div class="ap-l">' + hid.map(f => '<button type="button" data-f="' + esc(f.id) + '">' + esc(f.label) + '</button>').join("") + '</div>' : '<p class="dim">Every column is already in the list.</p>') + '</div>');
    document.body.appendChild(p); const r = anchor.getBoundingClientRect(); p.style.top = r.bottom + 6 + "px"; p.style.left = Math.max(8, Math.min(r.right - 240, innerWidth - 248)) + "px";
    const q = $("input", p); if (q){ q.focus(); q.oninput = () => $$("[data-f]", p).forEach(b => b.hidden = !smartHit(b.textContent, q.value));
      q.onkeydown = e => { if (e.key === "Enter"){ const b = $$("[data-f]", p).find(x => !x.hidden); if (b) b.click(); } if (e.key === "Escape") Fields.closePop(); }; }
    $$("[data-f]", p).forEach(b => b.onclick = () => { Fields.closePop(); Store.mutate("config", () => { const f = Store.field(b.dataset.f), fs = Store.S.config.fields; f.table = true; fs.splice(fs.indexOf(f), 1); fs.push(f); Store.S.config.mod = now(); Store.touch(f); }); Store.log("Added the " + b.textContent + " column"); }); }
  function wireHead(el, cs){ $$("th", el).forEach(th => { const id = th.dataset.c; if (!$(".th-l", th)) return;   // (the row buttons' column has no heading)
      $(".th-l", th).onclick = () => { App.sort = App.sort && App.sort.id === id ? (App.sort.dir > 0 ? { id, dir: -1 } : null) : { id, dir: 1 }; App.render(); };
      /* resize */
      const r = $(".th-r", th); r.onclick = e => e.stopPropagation();
      /* double click the edge: fit the column to its heading's longest word and its widest cell (as in Excel) */
      r.ondblclick = e => { e.stopPropagation(); const i = [...th.parentNode.children].indexOf(th), l = $(".th-l", th);
        let w = headW(cs[i] ? cs[i].label : l.textContent, getComputedStyle(l).font);
        $$("tbody tr", el).forEach(tr => { const td = tr.children[i]; if (!td) return; const k = td.firstElementChild;
          const m = document.createElement("div"); m.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;left:-9999px;top:0;font:" + getComputedStyle(td).font; m.innerHTML = td.innerHTML;
          /* (a box you type in measures by what's in it, or its hint when empty, not by the box's default width) */
          $$("input,select,textarea", m).forEach((x, n) => { const src = $$("input,select,textarea", td)[n], t = document.createElement("span");
            t.textContent = src.tagName === "SELECT" ? ((src.options[src.selectedIndex] || {}).text || "") : (src.value || src.placeholder || ""); t.style.padding = "0 9px"; x.replaceWith(t); });
          document.body.appendChild(m); w = Math.max(w, Math.min(640, m.scrollWidth + 22)); m.remove(); });
        const ws = widths(); ws[id] = Math.round(w); lsSet("adColW", ws); App.render(); };
      r.onpointerdown = e => { e.preventDefault(); e.stopPropagation(); if (e.detail > 1) return; const x0 = e.clientX, w0 = th.offsetWidth; r.setPointerCapture(e.pointerId);
        let moved = false; r.onpointermove = ev => { if (Math.abs(ev.clientX - x0) > 2) moved = true; if (moved) th.style.width = Math.max(50, w0 + ev.clientX - x0) + "px"; };
        r.onpointerup = () => { r.onpointermove = null; if (!moved) return; const ws = widths(); ws[id] = Math.round(parseFloat(th.style.width) || th.offsetWidth); lsSet("adColW", ws); App.render(); }; };   // (only the column dragged)
      /* reorder (the field order is shared, it's also the order in the side panel) */
      th.ondragstart = e => { if (id[0] === "_") return e.preventDefault(); e.dataTransfer.setData("text/col", id); th.classList.add("drag"); };
      th.ondragend = () => th.classList.remove("drag");
      th.ondragover = e => { if ([...e.dataTransfer.types].includes("text/col")){ e.preventDefault(); th.classList.add("dover"); } };
      th.ondragleave = () => th.classList.remove("dover");
      th.ondrop = e => { th.classList.remove("dover"); const from = e.dataTransfer.getData("text/col"); if (!from || from === id) return; e.preventDefault();
        Store.mutate("config", () => { const fs = Store.S.config.fields; const a = fs.findIndex(f => f.id === from); const b0 = fs.findIndex(f => f.id === id), item = fs.splice(a, 1)[0]; let b = fs.findIndex(f => f.id === id); if (b < 0) b = 0; fs.splice(a < b0 ? b + 1 : b, 0, item); Store.S.config.mod = now(); Store.touch(item); }); }; }); }
  /* tiles view (like SharePoint or Google Drive): the main photo fills the tile, the title over it; the
     arrows on a tile step through its photos. The tile size is set from the Size callout. */
  const tileIx = new Map();
  function tiles(el){ const list = rows(), sel = App.last, ed = Store.S.edit, multi = Store.selected().length > 1;
    el.innerHTML = '<div class="tiles" style="--tw:' + (lsGet("adTileW", 240)) + 'px">' + list.map(a => { const ref = a._p + ":" + a.u, s = Store.stage(a.stage), p = Store.project(a._p) || {};
        return '<div class="tile' + (ref === sel ? " on" : "") + (a.photos.length ? "" : " nophoto") + '" data-ref="' + ref + '"><div class="tl-img"></div>'
          + '<div class="tl-top"><span class="tl-id">' + esc(Store.actId(a)) + '</span><span class="tl-st" style="--c:' + esc(s.color) + '">' + esc(s.name) + '</span></div>'
          + (a.photos.length > 1 ? '<button type="button" class="tl-arr tl-prev" aria-label="Previous photo">‹</button><button type="button" class="tl-arr tl-next" aria-label="Next photo">›</button>' : "")
          + '<div class="tl-bot"><div class="tl-t">' + (esc(a.f.title) || "No title") + '</div><div class="tl-m">' + (multi ? esc(p.name) + " · " : "") + '<span class="tl-n"></span></div>'
          + '</div></div>'; }).join("")
      + '</div>' + (list.length ? "" : '<div class="empty">' + (Store.visible().length ? "No actions match the filter." : "No actions yet.") + '</div>');
    $$(".tile", el).forEach(t => { const a = App.act(t.dataset.ref), n = a.photos.length;
      const show = i => { if (!n) return; i = (i + n) % n; tileIx.set(t.dataset.ref, i); $(".tl-img", t).style.backgroundImage = 'url("' + Media.src(a, a.photos[i], lsGet("adTileW", 240) < 300) + '")'; $(".tl-n", t).textContent = "📷 " + (n > 1 ? (i + 1) + "/" : "") + n; };
      show(tileIx.get(t.dataset.ref) || 0);
      t.onclick = e => { const i = tileIx.get(t.dataset.ref) || 0;
        if (e.target.closest(".tl-prev")) return show(i - 1); if (e.target.closest(".tl-next")) return show(i + 1);
        App.select(t.dataset.ref); };
      t.ondragover = e => { if (Media.hasDrop(e) && ed){ e.preventDefault(); t.classList.add("drop"); } };
      t.ondragleave = e => { if (!t.contains(e.relatedTarget)) t.classList.remove("drop"); };
      t.ondrop = e => { t.classList.remove("drop"); if (!Media.hasDrop(e)) return; e.preventDefault(); e.stopPropagation(); Media.dropOn(a, e); }; }); }
  /* the compact Size callout beside the view toggle */
  function sizePop(anchor){ Fields.closePop(); const p = h('<div class="pop sizepop"><div class="pop-h">Tile size</div><input type="range" min="150" max="520" step="10" value="' + lsGet("adTileW", 240) + '"></div>');
    document.body.appendChild(p); Fields.place(p, anchor); const r = $("input", p); r.focus();
    r.oninput = () => { lsSet("adTileW", +r.value); const g = $(".tiles"); if (g) g.style.setProperty("--tw", r.value + "px"); };
    r.onchange = () => App.render(); }
  /* Columns button: which fields show as columns */
  function columnsPop(anchor){ Fields.closePop(); const p = h('<div class="pop colpop"><div class="pop-h">Columns in the table</div>' + Store.fields().filter(f => f.id !== "title").map(f => '<label class="tp-o"><input type="checkbox" data-f="' + f.id + '"' + (f.table ? " checked" : "") + '><span>' + esc(f.label) + '</span></label>').join("") + '<div class="pop-n">Drag the column headers to reorder them.</div></div>');
    document.body.appendChild(p); Fields.place(p, anchor);
    $$("input", p).forEach(c => c.onchange = () => Store.mutate("config", () => { const f = Store.field(c.dataset.f); f.table = c.checked; Store.touch(f); })); }
  return { render, rows, forget, columnsPop, sizePop, rowBtns, idBox };
})();
