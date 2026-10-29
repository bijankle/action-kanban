/* The Actions tab: one row per action, filtered by the search box and the stage pills.
   Click a row to open it in the side panel. Drag a header to reorder columns, drag its edge to resize. */
"use strict";
const Table = (() => {
  const NEED = { act: 45, id: 200, stage: 150, rank: 60, check: 34, complete: 34, choice: 96, date: 104, meta: 96, mto: 64, sparelist: 64, isollist: 64, phone: 116, number: 64 };
  let cv = null; const TICK = new Set(["check", "complete"]);
  /* a tick column's heading is one word (its short name); the i beside it says what it means */
  /* a tick column is headed by one word, set on end (Parts for Parts Arrived), so the header stays short; its (i) gives the full name and what it means */
  const head = c => c.type === "complete" ? "Complete" : TICK.has(c.type) ? String(c.short || c.label).trim().split(/\s+/)[0] : c.label;
  /* the (i) under the On Hold, Delete and Complete headings: what each does (the step ticks have their own, from the field) */
  const HELP = { _hold: ["On hold", "The action is waiting on someone outside the team. Click the square to put it on hold, then the i on it (red until it's filled in) to say who it's waiting on, their mobile and since when. Put back on hold later, it remembers them. Click the square again to take it off hold: it goes back to the step its ticks say."],
    _del: ["Delete", "Click the bin to delete the action; it asks first. Nothing is lost: deleted actions stay under the Deleted filter with their history, and clicking the red bin again brings one back where it was."],
    complete: ["Complete", "Tick it by hand when the work is physically done; nothing ticks it for you, not even Handover. A complete action moves out of the open list to the Complete filter, with its history. Untick it to reopen the action at the step its ticks say."] };
  document.addEventListener("click", e => { const b = e.target.closest(".th-i"); if (!b) return; e.stopPropagation(); e.preventDefault(); Fields.closePop(); const hp = HELP[b.dataset.c] || (b.dataset.c && Store.field(b.dataset.c) && Store.field(b.dataset.c).type === "complete" ? HELP.complete : null);
    if (hp){ const p = h('<div class="pop thpop"><b>' + esc(hp[0]) + '</b><p>' + esc(hp[1]) + '</p></div>'); document.body.appendChild(p); Fields.place(p, b); return; }
    const f = Store.field(b.dataset.c); if (!f) return;
    const p = h('<div class="pop thpop"><b>' + esc(f.label) + '</b>' + (f.desc ? '<p>' + esc(f.desc) + '</p>' : "") + '</div>'); document.body.appendChild(p); Fields.place(p, b); }, true);
  /* the width of a heading's longest word, plus the cell padding and room for the sort arrow */
  function headW(label, font){ cv = cv || document.createElement("canvas").getContext("2d"); cv.font = font || "700 13px " + getComputedStyle(document.body).fontFamily;
    return Math.ceil(Math.max(...String(label || "").split(/\s+/).map(w => cv.measureText(w).width), 0)) + 20 + 10; }
  const W = { text: 200, longtext: 260, multi: 170, stage: 170, rank: 74, check: 90, choice: 120, date: 120, contact: 160, phone: 130, number: 90 };
  const widths = () => lsGet("adColW", {});
  /* (once: the headings now wrap a word at a time and the i sits underneath, so column widths saved before that are
     dropped and every column takes its new default; a title width someone set is kept) */
  if (lsGet("adColWv", 0) < 2){ const w = widths(), keep = {}; if (w.title) keep.title = w.title; lsSet("adColW", keep); lsSet("adColWv", 2); }
  /* the ID and title always lead; the Status column goes after title until it's dragged elsewhere (config.actAfter is
     the column it follows, shared like the field order) */
  function cols(){ const t = Store.field("title"), rest = (Store.selected().length > 1 ? [{ id: "_proj", label: "Project", type: "proj" }] : []).concat(Store.fields().filter(f => f.table && f.id !== "title"));
    /* Complete: its own tick column, after the last step tick (Contractor); the Status cell keeps hold and delete */
    const cp = Store.fields().find(f => f.type === "complete"); if (cp && !rest.includes(cp)){ let k = -1; rest.forEach((f, n) => { if (f.type === "check" && f.stage) k = n; }); rest.splice(k < 0 ? rest.length : k + 1, 0, cp); }
    const at = Store.S.config.actAfter; rest.splice(at && at !== "title" ? rest.findIndex(f => f.id === at) + 1 : 0, 0, { id: "_act", label: "", type: "act" });
    const base = [{ id: "_id", label: "ID", type: "id" }].concat(t && t.table !== false ? [t] : [], rest);
    /* once any column has been dragged, the whole order is kept (each person's own, on their computer: moving columns
       never changes anyone else's list); columns added since keep their place in the default order */
    const ord = lsGet("adColOrder", null); if (!Array.isArray(ord) || !ord.length) return base;
    const at2 = new Map(ord.map((id, n) => [id, n])), dflt = new Map(base.map((c, n) => [c.id, n]));
    const rank = c => at2.has(c.id) ? at2.get(c.id) : (() => { for (let n = dflt.get(c.id) - 1; n >= 0; n--) if (at2.has(base[n].id)) return at2.get(base[n].id) + 0.5; return -0.5; })();
    return base.slice().sort((x, y) => rank(x) - rank(y) || dflt.get(x.id) - dflt.get(y.id)); }
  /* what's on show: the projects ticked, the stage pills, the search */
  /* the order sticks while you work: ticking Done or Hold, or changing a status, leaves the row where it is (so you
     can carry on with it) until the list is opened again, sorted, filtered or searched */
  let stick = { ctx: null, pos: new Map() };
  const forget = () => { stick = { ctx: null, pos: new Map() }; };
  function rows(fresh){ const list = sorted(); if (fresh) return list;
    const ctx = [App.tab, JSON.stringify(App.sort || {}), App.q || "", JSON.stringify(lsGet("adF", {})), JSON.stringify(lsGet("adDate", {})), [...(App.pills || [])].join(","), Store.selected().join(",")].join("|"), ref = a => a._p + ":" + a.u;
    if (ctx === stick.ctx){ const at = a => stick.pos.has(ref(a)) ? stick.pos.get(ref(a)) : -1, had = new Set(list.map(ref));
      Store.visible().forEach(a => { if (!had.has(ref(a)) && stick.pos.has(ref(a))) list.push(a); });   // (one that no longer fits a Status filter stays too, until next time)
      list.sort((x, y) => at(x) - at(y)); }   // (new ones first, the rest where they were)
    stick = { ctx, pos: new Map(list.map((a, i) => [ref(a), i])) }; return list; }
  function sorted(){ let list = Filters.apply(Store.visible().concat(Store.deleted()));   // (the search box and the Filters panel's pills)
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
  /* (a deleted action is neither on hold nor complete: those two stay off, and only its red bin, to bring it back, works) */
  function rowBtns(a, noDone){ const gone = !!a.del, dn = !gone && Store.stage(a.stage).kind === "done", hd = !gone && Hold.on(a), id = esc(Store.actId(a)), dis = Store.S.edit ? "" : " disabled";
    const b = (k, on, tip) => '<button type="button" class="rb rb-' + k + (on ? " on" : "") + '" data-rb="' + k + '" aria-pressed="' + on + '" title="' + (gone && k !== "del" ? "Deleted: bring it back with the red bin first" : tip) + '" aria-label="' + tip + '"' + (gone && k !== "del" ? " disabled" : dis) + '>' + IC[k] + '</button>';
    /* on hold (its i, who it's waiting on, red while details are missing, sits on the hold square's top right corner), complete and delete */
    return '<span class="rbs"><span class="rb-hw">' + b("hold", hd, hd ? (Hold.missing(a).length ? "On hold: click to add who it's waiting on" : "On hold: click to see or change who it's waiting on") : "Put " + id + " on hold").replace('class="rb rb-hold', 'class="rb rb-hold' + (hd && Hold.missing(a).length ? " miss" : "")) + '</span>' + (noDone ? "" : b("done", dn, dn ? "Complete: click to reopen " + id : "Mark " + id + " complete")) + b("del", !!a.del, a.del ? "Deleted: click to bring " + id + " back" : "Delete " + id) + '</span>'; }
  /* the ID in a box; in the Details header it carries the PDF button too (the list shows just the ID) */
  const IDI = { copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2"/><path d="M15.5 8.5V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7.5a2 2 0 002 2h2.5"/></svg>',
    tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5 9.5-10"/></svg>',
    dn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="M7 10.5l5 5 5-5"/><path d="M5 20h14"/></svg>' };
  function idBox(a, big){ const id = esc(Store.actId(a));
    return '<span class="idw' + (big ? " big" : "") + '"' + (a.oldId ? ' title="Was ' + esc(a.oldId) + '"' : "") + '><span class="aid">' + id + '</span>' + (big ? '<button type="button" class="pj" data-idk="pdf" title="Download the workpack PDF: details, problem, solution, notes, photos, isolations, MTO and spares" aria-label="Download the PDF of ' + id + '">' + fileIco("PDF") + '</button>' : "") + '</span>'; }
  document.addEventListener("click", async e => { const b = e.target.closest("[data-idk]"); if (!b) return; e.stopPropagation(); const r = b.closest("[data-ref]"), a = r && App.act(r.dataset.ref); if (!a) return;
    if (b.dataset.idk === "pdf") return Workpack.run(a); }, true);
  /* a picture of the action on the clipboard (Sheet, from the copy button by Photos: problem, solution and photos);
     the button shows a tick when it's there */
  async function copySheet(b, a){ note("Copying " + Store.actId(a) + " as a picture…", 8000); const ok = await Sheet.copy(a);
    if (!ok) return note("Couldn't copy the picture here. Try again in Chrome or Edge.");
    b.classList.add("ok"); const was = b.innerHTML; b.innerHTML = IDI.tick; note("Copied " + Store.actId(a) + " as a picture. Paste it into an email or Teams."); setTimeout(() => { b.classList.remove("ok"); b.innerHTML = was; }, 1400); }
  document.addEventListener("click", async e => { const b = e.target.closest("[data-rb]"); if (!b) return; e.stopPropagation(); const tr = b.closest("[data-ref]"), a = tr && App.act(tr.dataset.ref); if (!a) return;
    if (!Store.S.edit) return App.viewOnly(); const k = b.dataset.rb;
    if (k === "done"){ const f = Store.field("complete"); if (f) Fields.set(a, f, Store.stage(a.stage).kind !== "done"); }
    else if (k === "hold"){ if (Hold.on(a)) return Hold.open(a._p + ":" + a.u, b); const f = Store.field("onhold") || { id: "onhold", type: "check" }; Fields.set(a, f, true); }
    else if (k === "del" && a.del){ Store.mutate("a:" + a._p, () => { a.del = false; Store.touch(a); }); Store.log("Brought back " + Store.actId(a)); note("Brought back " + Store.actId(a)); }
    else if (k === "del"){ if (await confirmBox("Delete " + Store.actId(a) + "? It goes to the Deleted pill, where its bin brings it back.", "Delete", true)){ Flow.remove(a); if (App.selRef === tr.dataset.ref) App.select(null); } } }, true);
  /* titles are one line: a title too long for its column ends in … with a more… that shows it in full */
  /* the ID column is just wide enough for its box with an 8px margin each side, like the Status buttons */
  let idW = NEED.id;
  /* a tags cell shows as many tags as fit its width, the rest as +N (widen the column to see more) */
  function tagFit(el){ $$("td.tgc .tgv", el).forEach(v => { const a = App.act(v.closest("tr").dataset.ref), tags = a ? [].concat(a.f.equipment || []).filter(Boolean) : []; if (tags.length < 2) return;
    const t1 = $(".tg1", v), mb = $(".tg-more", v), font = getComputedStyle(t1).font, room = v.clientWidth - 20 - (mb ? 34 : 0);
    let k = 1; while (k < tags.length && headW(tags.slice(0, k + 1).join(", "), font) <= (k + 1 === tags.length ? room + 34 : room)) k++;
    t1.textContent = tags.slice(0, k).join(", "); if (mb){ mb.hidden = k >= tags.length; mb.textContent = "+" + (tags.length - k); } }); }
  function cut(el){ moreFit(el); tagFit(el); const ids = $$(".idw .aid", el); el.style.removeProperty("--aid-w"); if (ids.length) el.style.setProperty("--aid-w", Math.ceil(Math.max(...ids.map(x => x.getBoundingClientRect().width))) + "px");
    /* (the ID column is as wide as the widest ID there can be, every category's letters and the most digits, not the widest
       showing: recategorising an action never moves the columns) */
    const one = $("td.idc .aid", el); if (one){ const f = getComputedStyle(one).font, dg = "8".repeat(Math.max(4, String(Math.max(0, ...Store.all().map(x => x.no || 0))).length));
      const want = Math.ceil(Math.max(...Store.idLetters().map(l => headW(l + "-" + dg, f)))) + 20 + 2; if (Math.abs(want - idW) > 1){ idW = want; requestAnimationFrame(() => App.render()); } }
    $$("td.ttl", el).forEach(td => { const t = $(".tt", td); if (t) td.classList.toggle("cut", t.scrollWidth > t.clientWidth + 1); });
    $$("td.ltc", el).forEach(td => { const t = $(".lt-b", td), v = String((App.act(td.closest("tr").dataset.ref) || { f: {} }).f[t.dataset.lt] || ""); td.classList.toggle("cut", v.includes("\n") || t.scrollWidth > t.clientWidth + 1); }); }
  /* long text (notes and the like) in the list: click the box, or its more…, and it opens over the cell in full to edit,
     saved when you click away or press Ctrl+Enter, Esc to leave it as it was */
  document.addEventListener("click", e => { const b = e.target.closest("[data-lt]"); if (!b || !b.closest(".tbl")) return; e.stopPropagation(); Fields.closePop();
    const tr = b.closest("tr"), a = tr && App.act(tr.dataset.ref), f = a && Store.field(b.dataset.lt); if (!f) return;
    /* (the cursor goes where the text was clicked; a click on more…, or past the text, puts it at the end) */
    const box = $(".lt-b", b.closest("td")), cp = b === box && (document.caretPositionFromPoint ? document.caretPositionFromPoint(e.clientX, e.clientY) : document.caretRangeFromPoint && document.caretRangeFromPoint(e.clientX, e.clientY));
    const node = cp && (cp.offsetNode || cp.startContainer), off = cp && (cp.offset != null ? cp.offset : cp.startOffset), at = node && box.contains(node) && node.nodeType === 3 && !node.parentElement.closest(".dim") ? off : null;
    Fields.textPop(box, a, f, true, at); }, true);
  document.addEventListener("click", e => { const b = e.target.closest(".tt-more"); if (!b) return; e.stopPropagation(); Fields.closePop(); const tr = b.closest("tr"), a = tr && App.act(tr.dataset.ref); if (!a) return;
    const p = h('<div class="pop ttpop"><div class="ttpop-id">' + esc(Store.actId(a)) + '</div><div class="ttpop-t">' + esc(a.f.title || "") + '</div><button type="button" class="link">Open the action</button></div>');
    document.body.appendChild(p); Fields.place(p, b); $(".link", p).onclick = () => { Fields.closePop(); App.select(tr.dataset.ref); }; }, true);
  function render(el){ if (App.view === "tiles") return tiles(el); const all = cols(), ws = widths(), list = rows(), sel = App.last;
    /* the columns share the width there is (their widths are proportions), so the list never scrolls sideways */
    /* the narrow columns (ID, stage, ticks, counts) keep their width; the text columns share what's left */
    /* a column nobody has sized: the narrow kinds (ticks, yes or no, dates, counts) are as wide as the longest word in
       their heading (headings wrap onto two lines), or what their contents need if that's wider */
    const tickF = "700 11.5px " + getComputedStyle(document.body).fontFamily;
    /* a column nobody has sized is as wide as the longest word in its heading (the heading wraps a word at a line) or its widest entry */
    const tickOf = () => 23;   // (a tick column is one square cell wide: the row height and its line)
    const px = c => TICK.has(c.type) ? tickOf(c) : ws[c.id] || (c.id === "equipment" ? Math.max(headW("F12-CV-402", "600 13px " + getComputedStyle(document.body).fontFamily) + 34, headW(head(c))) : TICK.has(c.type) ? tickOf(c) : fix(c) ? Math.max(headW(head(c)), NEED[c.type] || 60) : c.type === "proj" ? 140 : W[c.type] || 140);
    const FIX = new Set(["act", "id", "stage", "rank", "check", "complete", "mto", "sparelist", "isollist", "date", "meta", "phone", "number"]), fix = c => FIX.has(c.type) || c.id === "equipment" || (c.type === "choice" && (c.options || []).length <= 3) || !!ws[c.id];   // (a column someone has sized keeps that width; the rest share what's left)
    /* when space runs out, the counts and dates go first, then the location; the tick boxes stay */
    const lp = c => (["sparelist", "isollist", "date", "meta", "phone", "number"].includes(c.type) || (c.type === "choice" && (c.options || []).length <= 3)) ? " lp1" : c.id === "location" ? " lp2" : "";
    /* the least each column can be; when they don't all fit, the tick columns go first, then the dates and numbers,
       so a title never gets squeezed to one letter per line (and the list scrolls sideways only if even that's not enough) */
    const fw = c => c.type === "id" ? idW : ws[c.id] || Math.min(px(c), 150);   // (the ID column fits its box)   // (a width someone set is kept as it is)
    const least = c => fix(c) ? fw(c) : c.id === "title" ? pref("titleMin") : 110;
    const lv = c => lp(c) === " lp1" ? 1 : lp(c) === " lp2" ? 2 : 3, need = n => all.filter(c => lv(c) > n).reduce((t, c) => t + least(c), 0);
    const w = el.clientWidth || 9999, level = need(0) <= w ? 0 : need(1) <= w ? 1 : 2, cs = all.filter(c => lv(c) > level); lastLv = level; levelOf = w2 => need(0) <= w2 ? 0 : need(1) <= w2 ? 1 : 2;
    if (!ro && window.ResizeObserver){ ro = new ResizeObserver(() => { if (App.view === "tiles" || !el.isConnected || !$(".tbl", el)) return; if (levelOf(el.clientWidth) !== lastLv) App.render(); else { cut(el); if (lastCs) autoFit(el, lastCs); } }); ro.observe(el); }   // (a side panel opening or closing re-fits the widths)
    /* the spare width at the end goes to the + Add column strip, so every column stays as wide as it was set */
    const ADD = App.isAdmin() ? (ws._add || 140) : 24, fixW = cs.filter(fix).reduce((t, c) => t + fw(c), 0) + ADD, flex = cs.filter(c => !fix(c)), ftot = flex.reduce((t, c) => t + px(c), 0) || 1;
    /* (a text column never goes below a readable width: with many columns the list scrolls sideways instead of squeezing a title to one letter per line) */
    const tight = cs.reduce((t, c) => t + least(c), 0) + ADD >= w;   // (no room to share: each text column takes its least width, and the list scrolls sideways)
    const wid = c => fix(c) ? fw(c) + "px" : tight ? least(c) + "px" : "max(" + (c.id === "title" ? pref("titleMin") : 110) + "px, calc((100% - " + fixW + "px) * " + (px(c) / ftot).toFixed(4) + "))";
    const th = cs.map(c => c.type === "act" ? '<th class="actc" data-c="_act" draggable="' + !!Store.S.edit + '" aria-label="On hold, delete" style="width:' + NEED.act + 'px"><span class="th-2"><span class="th-c"><span class="th-v">On Hold</span><button type="button" class="th-i" data-c="_hold" aria-label="What On Hold means">' + INFO_I + '</button></span><span class="th-c"><span class="th-v">Delete</span><button type="button" class="th-i" data-c="_del" aria-label="What Delete means">' + INFO_I + '</button></span></span></th>' : '<th class="' + (lp(c) + (TICK.has(c.type) ? " tk" : "")).trim() + '" data-c="' + c.id + '" draggable="' + !!Store.S.edit + '" style="width:' + wid(c) + '">'
      + '<span class="th-l">' + (TICK.has(c.type) ? '<span class="th-v">' + esc(head(c)) + '</span>' : esc(head(c))) + (TICK.has(c.type) ? '<button type="button" class="th-i" data-c="' + esc(c.id) + '" title="' + esc(c.label) + '" aria-label="What ' + esc(head(c)) + ' means">' + INFO_I + '</button>' : "") + (App.sort && App.sort.id === c.id ? (App.sort.dir > 0 ? " ▲" : " ▼") : "") + '</span><button type="button" class="th-m" data-c="' + esc(c.id) + '" title="Sort, fit or remove this column" aria-label="' + esc(c.label) + ' column options" aria-haspopup="true"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5"/></svg></button><i class="th-r"></i></th>').join("") + (ADD ? '<th class="addcol"' + (flex.length ? ' style="width:' + ADD + 'px"' : "") + '>' + (App.isAdmin() ? (ADD < 60 ? '<button type="button" class="addc addc-s" aria-haspopup="true" title="Add a column" aria-label="Add a column">+</button>' : '<button type="button" class="addc" aria-haspopup="true">+ Add column</button>') : "") + '</th>' : "");
    const minW = cs.reduce((t, c) => t + least(c), 0) + ADD;
    el.innerHTML = '<div class="tbl-wrap"><table class="tbl" style="min-width:' + minW + 'px"><colgroup></colgroup><thead><tr>' + th + '</tr></thead><tbody></tbody></table>'
      + (list.length ? "" : '<div class="empty">' + (Store.visible().length ? Filters.emptyHtml() : "No actions yet. Click <b>+ New action</b>, or the upload with AI button beside it to make one from an email.") + '</div>') + '</div>';
    const tb = $("tbody", el), frag = document.createDocumentFragment();
    list.forEach(a => { const ref = a._p + ":" + a.u; const tr = document.createElement("tr"); tr.dataset.ref = ref; if (ref === sel) tr.className = "on"; if (a.del || a.f.handover === true || Store.stage(a.stage).kind === "done") tr.classList.add("struck");   // (handed over, complete or deleted: a line through the whole row)
      cs.forEach(c => { const td = document.createElement("td"); const l = lp(c).trim(); if (l) td.classList.add(l); if (TICK.has(c.type)) td.classList.add("tk");
        if (c.type === "act"){ td.classList.add("actc"); td.innerHTML = rowBtns(a, true); }
        else if (c.type === "id"){ td.classList.add("idc"); td.innerHTML = '<span class="idw idt"' + (a.oldId ? ' title="Was ' + esc(a.oldId) + '"' : "") + '><span class="aid">' + esc(Store.actId(a)) + '</span></span>'; }   // (plain bold text in the list: it can't be edited, so no box)
        else if (c.type === "proj"){ const p = Store.project(a._p) || {}; td.innerHTML = '<span class="ptag" style="--c:' + esc(p.color || "#64748b") + '">' + esc(p.name || "") + '</span>'; }
        else if (c.id === "equipment"){ td.classList.add("ed", "tgc"); tagCell(td, a, c); }
        else if (Store.S.edit && (["stage", "rank", "check", "complete", "multi", "choice"].includes(c.type) || c.id === "location") && !Fields.DERIVED[c.id]){ td.classList.add("ed"); td.appendChild(Fields.editor(a, c)); if (c.id === "onhold"){ const hb = Hold.btn(a); if (hb){ td.classList.add("has-hold"); td.insertAdjacentHTML("beforeend", hb); } } }
        else if (c.type === "longtext" && Store.S.edit){ td.classList.add("ed", "ltc"); const v = String(a.f[c.id] || ""); td.innerHTML = '<div class="lt-w"><button type="button" class="lt-b in" data-lt="' + esc(c.id) + '" title="Click to edit">' + (v ? esc(v.split("\n").join("  ·  ")) : '<span class="dim">Add ' + esc((c.label || "").toLowerCase()) + '</span>') + '</button><button type="button" class="lt-more" data-lt="' + esc(c.id) + '" title="Show and edit it all">more…</button></div>'; }
        else if (c.id === "title" && Store.S.edit){ td.classList.add("ed", "ltc"); const v = String(a.f.title || ""); td.innerHTML = '<div class="lt-w"><button type="button" class="lt-b in" data-lt="title" title="Click to edit the title">' + (v ? esc(v) : '<span class="dim">Add a title</span>') + '</button><button type="button" class="lt-more" data-lt="title" title="Show and edit it all">more…</button></div>'; }   // (the title is a box like the others, edited in place)
        else if (c.id === "title"){ td.classList.add("ttl"); td.innerHTML = '<div class="tt-w"><span class="tt">' + (esc(a.f.title || "") || '<span class="dim">No title</span>') + '</span><button type="button" class="tt-more" title="Show the full title">more…</button></div>'; }
        else { const v = Fields.show(a, c); td.innerHTML = v && !TICK.has(c.type) && /^(text|longtext|choice|contact|multi)$/.test(c.type) ? moreCut(v, Store.actId(a) + " " + c.label) : v; }
        if (c.id === "parts"){ const st = etaState(a); if (st){ td.classList.add("eta", st); td.dataset.eta = ""; } }
        if (c.type === "check" && c.id !== "parts" && Store.S.edit !== undefined){ td.dataset.tk = c.id; td.classList.add("tkc"); }   // (click beside the box for its card)   // (a coloured dot on the box's corner; point at it for the delivery)
        /* the cell's fill: needed and still empty (the Category, a step still to tick) lavender; filled in by the app blue; by hand white */
        if (Store.S.edit && !a.del && Store.stage(a.stage).kind !== "done"){ const v = a.f[c.id];
          if ((c.id === "category" && !v) || (c.id === "equipment" && !(Array.isArray(v) && v.length)) || (c.type === "check" && c.stage && !v)) td.classList.add("need"); }
        if (c.type === "check" && a.f[c.id] === Flow.NA && ((a.hoNA || []).includes(c.id) || (a.auto || {})[c.id])) td.classList.add("autof");
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
    wireHead(el, cs); lastCs = cs; autoFit(el, cs); }
  /* the Tags cell shows the first tag only, as wide as a typical tag number, with +2 when there are more (click it to see
     them all); clicking the tag box opens it for typing */
  function tagCell(td, a, c){ const tags = [].concat(a.f[c.id] || []).filter(Boolean), ro = !Store.S.edit;
    td.innerHTML = '<div class="tgv" data-n="' + tags.length + '"><span class="tg1' + (tags.length ? "" : " ph") + '"' + (ro ? "" : ' role="button" tabindex="0" title="Edit the tags"') + '>' + esc(tags[0] || (ro ? "" : "Add tag")) + '</span>'
      + (tags.length > 1 ? '<button type="button" class="tg-more" title="Show all ' + tags.length + ' tags">+' + (tags.length - 1) + '</button>' : "") + '</div>';
    /* (the typing point goes where you clicked in the tags shown; a click past them, or on +N, puts it at the end) */
    const at = e => { const t1 = $(".tg1", td); if (!e || !t1 || !t1.firstChild) return null; const p = document.caretPositionFromPoint ? document.caretPositionFromPoint(e.clientX, e.clientY) : document.caretRangeFromPoint && document.caretRangeFromPoint(e.clientX, e.clientY);
      const node = p && (p.offsetNode || p.startContainer), off = p && (p.offset != null ? p.offset : p.startOffset); return node && t1.contains(node) ? off : null; };
    const edit = e => { if (ro) return; const pos = at(e); td.innerHTML = ""; const ed = Fields.editor(a, c); td.appendChild(ed); const i = $("input", ed); if (i){ if (pos != null) i.dataset.caret = pos; i.focus(); if (pos == null) try { i.setSelectionRange(i.value.length, i.value.length); } catch (e2) {} i.addEventListener("blur", () => setTimeout(() => { if (td.isConnected && !td.contains(document.activeElement)) tagCell(td, a, c); }, 150)); } };
    const t1 = $(".tg1", td); t1.onclick = e => { e.stopPropagation(); edit(e); }; t1.onkeydown = e => { if (e.key === "Enter" || e.key === " "){ e.preventDefault(); edit(); } };
    const mb = $(".tg-more", td); if (mb) mb.onclick = e => { e.stopPropagation(); Fields.closePop();
      const p = h('<div class="pop tgpop"><div class="pop-h">' + tags.length + ' tags on ' + esc(Store.actId(a)) + '</div>' + tags.map(t => { const it = Equip.get(t); return '<div class="tgp-r"><b>' + esc(t) + '</b>' + (it && it.n ? '<span class="dim">' + esc(it.n) + '</span>' : "") + '</div>'; }).join("") + (ro ? "" : '<button type="button" class="link">Edit the tags</button>') + '</div>');
      document.body.appendChild(p); Fields.place(p, mb); const l = $(".link", p); if (l) l.onclick = () => { Fields.closePop(); edit(); }; }; }
  /* beside the Parts Arrived box, until it's ticked: an i for the parts ETA (the latest ETA on the MTO), green while
     it's still to come, red once it's past, grey while it's TBC. Click it for the date and the MTO items */
  /* Parts Arrived, while the parts are still to come: a dot on the box's corner, red when they're overdue, yellow when
     they're due within 7 days, green when they're further off, grey while the ETA is to be confirmed. Pointing at the
     box shows when the whole order is due, who from and who to call, and a short count of what's on it */
  const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const daysTo = e => Math.round((new Date(e + "T12:00") - new Date(today() + "T12:00")) / 864e5);
  function etaState(a){ if (a.f.parts === true || a.f.parts === Flow.NA) return ""; const e = Store.eta(a); if (!e) return ""; if (e === "TBC") return "tbc"; const n = daysTo(e); return n < 0 ? "late" : n <= pref("etaSoon") ? "soon" : "ok"; }
  let etaT = null;
  function etaCard(td, pin){ Fields.closePop(); const a = App.act(td.closest("[data-ref]").dataset.ref); if (!a) return; const e0 = Store.eta(a), st = etaState(a), n = e0 && e0 !== "TBC" ? daysTo(e0) : null;
    /* what's on the order, in a few lines: how many piping, structural, plate and other items (steel cut from stock counted as the lengths or sheets ordered) */
    const kinds = [["piping items", it => it.cl && it.cl !== "N/A" || it.it], ["structural items", it => it.t && it.t !== "plate"], ["plate items", it => it.t === "plate"], ["other items", () => true]];
    const lines = (typeof Mto !== "undefined" && Mto.orderRows ? Mto.orderRows(a) : a.mto || []).filter(it => it.grp || it.desc || it.part || it.qty).map(it => it.grp ? it.grp.first : it);
    const sum = kinds.map(([t, f]) => [lines.filter(it => kinds.find(k => k[1](it)) [0] === t).length, t]).filter(([n]) => n);
    const ven = (a.rfqTo || [])[0], v = ven && Vendors.byName(ven) || {}, po = (a.pos || []).slice(-1)[0];
    const head = st === "tbc" ? "ETA to be confirmed" : st === "late" ? "Should have arrived" : st === "soon" ? "Due within a week" : "On track";
    const p = h('<div class="pop etapop ' + st + (pin ? " pin" : "") + '" role="' + (pin ? "dialog" : "tooltip") + '" aria-label="Delivery"><b class="ep-h"><i></i>' + head + (pin ? '<button type="button" class="ic-b sm ep-x" aria-label="Close">✕</button>' : "") + '</b><div class="ep-g">'
      + '<span class="dim">' + (n !== null && n < 0 ? "Was due" : "Due") + '</span><span>' + (e0 === "TBC" ? "To be confirmed" : esc(fmtDate(e0)) + ' · ' + (n === 0 ? "today" : n > 0 ? "in " + n + " day" + (n === 1 ? "" : "s") : "overdue by " + -n + " day" + (n === -1 ? "" : "s"))) + '</span>'
      + (ven ? '<span class="dim">From</span><span>' + esc(ven) + (po ? ', ' + esc(po.name.replace(/\.[a-z0-9]+$/i, "")) : "") + '</span>' : "")
      + (v.contact || v.phone || v.email ? '<span class="dim">Contact</span><span>' + esc(v.contact || "") + (v.phone ? (v.contact ? ", " : "") + '<a href="tel:' + esc(String(v.phone).replace(/\s/g, "")) + '">' + esc(v.phone) + '</a>' : "") + (!v.phone && v.email ? (v.contact ? ", " : "") + '<a href="mailto:' + esc(v.email) + '">' + esc(v.email) + '</a>' : "") + '</span>' : ven ? '<span class="dim">Contact</span><span class="dim">None on file for ' + esc(ven) + '</span>' : "") + '</div>'
      + (sum.length ? '<div class="ep-items">' + sum.map(([n, t]) => '<div class="ep-r">' + n + ' × ' + esc(n === 1 ? t.replace(/s$/, "") : t) + '</div>').join("") + '</div>' : "")
      + '<button type="button" class="link">Open the MTO</button></div>');
    document.body.appendChild(p); Fields.place(p, td); $(".link", p).onclick = () => { Fields.closePop(); App.openParts(a._p + ":" + a.u, "mto"); };
    const x = $(".ep-x", p); if (x) x.onclick = () => p.remove();
    p.onmouseenter = () => clearTimeout(etaT); p.onmouseleave = () => { if (!p.classList.contains("pin")) etaT = setTimeout(() => p.remove(), 250); }; }
  /* every other tick column: a click beside the box opens a short card about that step (whether it's done, who ticked
     it and when, what's behind it) with a link to the tab where it's worked on */
  const tabFor = id => ({ mtodone: ["mto", "Open the MTO"], rfq: ["mto", "Open the MTO"], po: ["mto", "Open the MTO"], secured: ["spares", "Open the Spares"] })[id] || ["overview", "Open the action"];
  function stepCard(td){ Fields.closePop(); const a = App.act(td.closest("[data-ref]").dataset.ref), f = a && Store.field(td.dataset.tk); if (!f) return;
    const v = a.f[f.id], st = v === Flow.NA ? "na" : v === true ? "done" : "open", who = Flow.who(a, f), L = [];
    const files = k => (a[k] || []).map(x => esc(x.name)).join(", "), n = k => (a[k] || []).filter(it => it.desc || it.part || it.t).length;
    if (f.id === "mtodone") L.push(["Items", n("mto") ? n("mto") + " on the MTO" : "None yet"]);
    if (f.id === "secured"){ const sp = (a.spares || []), ok = sp.filter(x => x.secured).length; L.push(["Spares", sp.length ? ok + " of " + sp.length + " secured" : "None listed"]); }
    if (f.id === "rfq"){ L.push(["Sent to", (a.rfqTo || []).length ? a.rfqTo.map(esc).join(", ") : "No vendor picked"]); if ((a.quotes || []).length) L.push(["Quotes", files("quotes")]); }
    if (f.id === "po"){ L.push(["PO", (a.pos || []).length ? files("pos") : "None uploaded"]); if ((a.rfqTo || []).length) L.push(["Vendor", a.rfqTo.map(esc).join(", ")]); }
    if (f.id === "engaged"){ const ff = k => { const x = Store.field(k); return x ? Fields.text(a, x) : ""; }; [["Contractor", ff("contractor")], ["On site", ff("contractorDate")], ["Contact", [ff("contractorContact"), ff("contractorPhone")].filter(Boolean).join(", ")]].forEach(([k, x]) => x && L.push([k, esc(x)])); if (L.length === 0) L.push(["Contractor", "Not set yet"]); }
    if (f.id === "pccr" || f.id === "defect"){ const at = (a.files || []).filter(x => new RegExp(f.id === "pccr" ? "pccr" : "defect", "i").test(x.name)); if (at.length) L.push(["Attached", at.map(x => esc(x.name)).join(", ")]); }
    const [tab, lab] = tabFor(f.id);
    const p = h('<div class="pop etapop tkpop pin ' + st + '" role="dialog" aria-label="' + esc(f.label) + '"><b class="ep-h"><i></i>' + esc(f.label) + '<span class="dim tk-st">' + (st === "done" ? "done" : st === "na" ? "not needed" : "not done yet") + '</span><button type="button" class="ic-b sm ep-x" aria-label="Close">✕</button></b>'
      + (f.desc ? '<div class="dim tk-d">' + esc(f.desc) + '</div>' : "") + (L.length || who ? '<div class="ep-g">' + L.map(([k, x]) => '<span class="dim">' + k + '</span><span>' + x + '</span>').join("") + (who ? '<span class="dim">By</span><span>' + esc(who.replace(/^(Ticked|Marked not needed|Set) by /, "")) + '</span>' : "") + '</div>' : "")
      + '<button type="button" class="link">' + lab + '</button></div>');
    document.body.appendChild(p); p.__td = td; Fields.place(p, td); $(".ep-x", p).onclick = () => p.remove(); $(".link", p).onclick = () => { Fields.closePop(); p.remove(); App.select(a._p + ":" + a.u, tab); }; }
  document.addEventListener("click", e => { const td = e.target.closest("td[data-tk]"); if (!td || e.target.closest(".ck,input,label")) return; e.stopPropagation(); const open = $(".tkpop"); if (open && open.__td === td){ open.remove(); return; } stepCard(td); }, true);
  /* a click in the cell, outside the box, pins the card open (the box itself still ticks Parts Arrived) */
  document.addEventListener("click", e => { const td = e.target.closest("td[data-eta]"); if (!td || e.target.closest(".ck,input,label")) return; e.stopPropagation(); clearTimeout(etaT); const open = $(".etapop.pin"); if (open && open.__td === td){ open.remove(); return; } etaCard(td, true); const p = $(".etapop.pin"); if (p) p.__td = td; }, true);
  document.addEventListener("mouseover", e => { const td = e.target.closest("td[data-eta]"); if (!td || td.__on || $(".etapop.pin")) return; td.__on = true; clearTimeout(etaT); etaT = setTimeout(() => etaCard(td), pref("etaHover"));
    td.addEventListener("mouseleave", () => { td.__on = false; clearTimeout(etaT); etaT = setTimeout(() => { const p = $(".etapop"); if (p && !p.matches(":hover") && !p.classList.contains("pin")) p.remove(); }, 250); }, { once: true }); });
  /* a column heading's ▾: sort it either way, fit it to its contents, or take it out of the list (+ Add column brings it back) */
  function colMenu(anchor, id, fit){ Fields.closePop(); const f = Store.field(id), keep = id[0] === "_" || id === "title";
    const p = h('<div class="pop colm"><button type="button" data-m="asc">Sort A to Z</button><button type="button" data-m="desc">Sort Z to A</button>' + (App.sort && App.sort.id === id ? '<button type="button" data-m="off">Clear the sort</button>' : "")
      + '<button type="button" data-m="fit">Fit to its contents</button>' + (keep || !f || !App.isAdmin() ? "" : '<div class="msep"></div><button type="button" data-m="rm" class="bad">Remove this column</button>') + '</div>');
    document.body.appendChild(p); const rc = anchor.getBoundingClientRect(); p.style.top = rc.bottom + 4 + "px"; p.style.left = Math.max(8, Math.min(rc.right - 200, innerWidth - 208)) + "px";
    $$("[data-m]", p).forEach(b => b.onclick = () => { const m = b.dataset.m; Fields.closePop();
      if (m === "asc" || m === "desc"){ App.sort = { id, dir: m === "asc" ? 1 : -1 }; App.render(); } else if (m === "off"){ App.sort = null; App.render(); } else if (m === "fit") fit();
      else if (m === "rm"){ Store.mutate("config", () => { f.table = false; Store.S.config.mod = now(); Store.touch(f); }); Store.log("Removed the " + f.label + " column"); note("Removed the " + f.label + " column. + Add column brings it back."); } }); }
  /* + Add column: the columns not in the list, A to Z, with a search; picking one adds it at the end */
  function addPop(anchor){ Fields.closePop(); if (!App.isAdmin()) return note("Only the admin adds and removes columns"); const hid = Store.fields().filter(f => !f.table && f.id !== "title").sort((x, y) => x.label.localeCompare(y.label));
    const p = h('<div class="pop addpop"><div class="pop-h">Add a column</div>' + (hid.length ? '<input class="in" type="search" placeholder="Search columns" aria-label="Search columns"><div class="ap-l">' + hid.map(f => '<button type="button" data-f="' + esc(f.id) + '">' + esc(f.label) + '</button>').join("") + '</div>' : '<p class="dim">Every column is already in the list.</p>') + '</div>');
    document.body.appendChild(p); const r = anchor.getBoundingClientRect(); p.style.top = r.bottom + 6 + "px"; p.style.left = Math.max(8, Math.min(r.right - 240, innerWidth - 248)) + "px";
    const q = $("input", p); if (q){ q.focus(); q.oninput = () => $$("[data-f]", p).forEach(b => b.hidden = !smartHit(b.textContent, q.value));
      q.onkeydown = e => { if (e.key === "Enter"){ const b = $$("[data-f]", p).find(x => !x.hidden); if (b) b.click(); } if (e.key === "Escape") Fields.closePop(); }; }
    $$("[data-f]", p).forEach(b => b.onclick = () => { Fields.closePop(); Store.mutate("config", () => { const f = Store.field(b.dataset.f), fs = Store.S.config.fields; f.table = true; fs.splice(fs.indexOf(f), 1); fs.push(f); Store.S.config.mod = now(); Store.touch(f); }); Store.log("Added the " + b.textContent + " column"); }); }
  /* a column's tight width (as a double click on its edge gives): its heading's longest word, or its widest cell */
  function fitW(el, cs, th, i){ const l = $(".th-l", th); if (cs[i] && TICK.has(cs[i].type)) return 23;   // (a tick column: one square cell)
    if (cs[i] && cs[i].type === "choice"){ const td = $("tbody td:nth-child(" + (i + 1) + ")", el), f = td ? getComputedStyle(td).font : "13px " + getComputedStyle(document.body).fontFamily;   // (a strict list: as wide as its widest choice, so picking another never moves the columns)
      return Math.round(Math.max(headW(head(cs[i]), getComputedStyle(l).font), ...(cs[i].options || []).map(o => headW(o.label || o, f) + 6 + 22 + 8)) + 2); }
    let w = cs[i] && TICK.has(cs[i].type) ? headW(head(cs[i]), getComputedStyle(l).font) - 14 : headW(cs[i] ? head(cs[i]) : l.textContent, getComputedStyle(l).font);
    $$("tbody tr", el).forEach(tr => { const td = tr.children[i]; if (!td) return;
      const m = document.createElement("div"); m.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;left:-9999px;top:0;font:" + getComputedStyle(td).font; m.innerHTML = td.innerHTML;
      /* (a box you type in measures by what's in it, or its hint when empty, not by the box's default width) */
      $$("input,select,textarea", m).forEach((x, n) => { const src = $$("input,select,textarea", td)[n], t = document.createElement("span");
        t.textContent = src.tagName === "SELECT" ? ((src.options[src.selectedIndex] || {}).text || "") : (src.value || src.placeholder || ""); t.style.padding = "0 " + (src.tagName === "SELECT" ? 28 : 12) + "px"; x.replaceWith(t); });   // (a box's own padding and border, and a dropdown's arrow)
      $$(".mc-more,.lt-more,.tt-more", m).forEach(x => x.remove());
      $$(".tgv", m).forEach(v => { const n = +v.dataset.n || 0, t = $(".tg1", v), b = $(".tg-more", v); if (t && n > 1) t.textContent = t.textContent.split(", ")[0]; if (b){ b.hidden = false; b.textContent = "+" + (n - 1); } });   // (Tags fits its first tag and the +N)   // (the more… links only show when cut off)
      document.body.appendChild(m); w = Math.max(w, Math.min(cs[i] && cs[i].type === "longtext" ? 220 : 640, m.scrollWidth + 22)); m.remove(); });
    return Math.round(w); }
  /* the column widths. The short columns fit their contents fully when the app opens, when a side panel opens or
     closes (the list's width changes) and once the app's font has loaded; while working they only ever widen to fit
     something longer, never narrow under you. The long ones (Title, Notes) keep the width they were last set to by hand
     (dragged or double clicked), remembered from one opening to the next, and only widen by themselves when there's
     spare room: the title first, up to its longest title, then Notes takes the rest. The + Add column strip stays about
     the ID column's width, and shrinks to a + only when there's no room. The tick columns share one even width. A
     column dragged to a width keeps it until the app is next opened (a long one, from then on) */
  let fitted = false, fitKey = "", fitW0 = 0, lastCs = null; const dragged = new Set(), LONG = c => c.id === "title" || c.type === "longtext";
  const longMem = () => lsGet("adColLong", {}) || {};
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fitW0 = -1; fitKey = ""; if (typeof App !== "undefined" && App.render) App.render(); });   // (measured again with the real font)
  function autoFit(el, cs){ if (!pref("autoFit") || !$$("tbody tr", el).length) return; const first = !fitted; fitted = true;
    const W = el.clientWidth, key = W + "|" + cs.map(c => c.id).join() + "|" + $$("tbody tr", el).map(tr => { const a = App.act(tr.dataset.ref); return a ? a.u + ":" + (a.mod || 0) : ""; }).join();
    if (!first && key === fitKey) return; fitKey = key; const full = first || W !== fitW0; fitW0 = W;
    const old = widths(), ws = Object.assign({}, old), mem = longMem(), ths = $$("th[data-c]", el);
    ths.forEach((th, i) => { const c = cs[i]; if (!c || c.type === "act" || c.type === "id" || dragged.has(c.id) || LONG(c)) return; const w = fitW(el, cs, th, i); ws[c.id] = full ? w : Math.max(old[c.id] || 0, w); });
    const tk = cs.filter(c => TICK.has(c.type) && !dragged.has(c.id)), tw = Math.max(0, ...tk.map(c => ws[c.id] || 0)); tk.forEach(c => { if (tw) ws[c.id] = tw; });
    const add = App.isAdmin() ? Math.max(90, idW) : 24; ws._add = add;
    const lc = cs.filter(c => LONG(c) && !dragged.has(c.id)), fitOf = {};
    lc.forEach(c => { const n = cs.indexOf(c), th = ths[n]; fitOf[c.id] = th ? fitW(el, cs, th, n) : 0; ws[c.id] = mem[c.id] || (c.id === "title" ? Math.max(pref("titleMin"), fitOf[c.id]) : pref("notesW")); });
    const used = cs.filter(c => !lc.includes(c)).reduce((t, c) => t + (c.type === "act" ? NEED.act : c.type === "id" ? idW : ws[c.id] || 0), 0);
    let spare = W - used - add - 2 - lc.reduce((t, c) => t + ws[c.id], 0);
    if (spare > 0){ const t = lc.find(c => c.id === "title"); if (t){ const g = Math.min(spare, Math.max(0, Math.min(640, fitOf.title) - ws.title)); ws.title += g; spare -= g; }
      const ns = lc.filter(c => c.id !== "title"); if (ns.length && spare > 0) ns.forEach(c => { ws[c.id] += Math.floor(spare / ns.length); }); }
    else if (spare < 0){   /* no room for it all: Notes (and any long text) gives first, down to a little, then the title, so the + column always shows; their text ends in more… */
      let short = -spare; ws._add = 24; short -= add - 24;
      lc.filter(c => c.id !== "title").forEach(c => { if (short <= 0) return; const g = Math.min(short, Math.max(0, ws[c.id] - 90)); ws[c.id] -= g; short -= g; });
      const t = lc.find(c => c.id === "title"); if (t && short > 0){ const g = Math.min(short, Math.max(0, ws.title - 160)); ws.title -= g; short -= g; } }
    if (JSON.stringify(ws) !== JSON.stringify(old) || first){ lsSet("adColW", ws); requestAnimationFrame(() => App.render()); } }
  /* a long column set by hand is remembered from one opening to the next */
  const remember = (c, w) => { if (c && LONG(c)){ const m = longMem(); m[c.id] = Math.round(w); lsSet("adColLong", m); } };
  function wireHead(el, cs){ $$("th", el).forEach(th => { const id = th.dataset.c; if (!$(".th-l", th)) return;   // (the row buttons' column has no heading)
      $(".th-l", th).onclick = () => { App.sort = App.sort && App.sort.id === id ? (App.sort.dir > 0 ? { id, dir: -1 } : null) : { id, dir: 1 }; App.render(); };
      /* resize */
      const r = $(".th-r", th); r.onclick = e => e.stopPropagation();
      const mb = $(".th-m", th); if (mb) mb.onclick = e => { e.stopPropagation(); colMenu(mb, id, () => r.ondblclick(new MouseEvent("dblclick"))); };
      /* double click the edge: fit the column to its heading's longest word and its widest cell (as in Excel) */
      r.ondblclick = e => { e.stopPropagation(); dragged.delete(id); const i = [...th.parentNode.children].indexOf(th), ws = widths(), c = cs[i];
        /* Notes (a long text column) fills the width there is, leaving the + Add column strip about the ID column's width */
        if (c && c.id !== "title" && LONG(c)){ const others = $$("th[data-c]", el).filter(x => x !== th).reduce((t, x) => t + x.getBoundingClientRect().width, 0); ws[id] = Math.max(120, Math.floor(el.clientWidth - others - (ws._add || Math.max(90, idW)) - 2)); }
        else ws[id] = fitW(el, cs, th, i); remember(c, ws[id]); lsSet("adColW", ws); App.render(); };
      r.onpointerdown = e => { e.preventDefault(); e.stopPropagation(); if (e.detail > 1) return; const x0 = e.clientX, w0 = th.offsetWidth; r.setPointerCapture(e.pointerId);
        let moved = false, raf = 0; r.onpointermove = ev => { if (Math.abs(ev.clientX - x0) > 2) moved = true; if (!moved) return; th.style.width = Math.max(50, w0 + ev.clientX - x0) + "px";
          if (!raf) raf = requestAnimationFrame(() => { raf = 0; tagFit(el); moreFit(el); }); };   // (the tags and more… follow the width as it's dragged)
        r.onpointerup = () => { r.onpointermove = null; if (!moved) return; dragged.add(id); remember(Store.field(id) || { id }, parseFloat(th.style.width) || th.offsetWidth); const ws = widths(); ws[id] = Math.round(parseFloat(th.style.width) || th.offsetWidth); lsSet("adColW", ws); App.render(); }; };   // (only the column dragged)
    }); dragHead(el, cs); }
  /* reorder by dragging a heading (the field order is shared, it's also the order in the side panel); ID and title stay
     first, Status can go anywhere after them */
  function dragHead(el){ const ids = cols().map(c => c.id), movable = () => !!Store.S.edit;   // (every column moves, the ID and title too)
    $$("th[data-c]", el).forEach(th => { const id = th.dataset.c;
      th.ondragstart = e => { if (!movable(id)) return e.preventDefault(); e.dataTransfer.setData("text/col", id); th.classList.add("drag"); };
      th.ondragend = () => th.classList.remove("drag");
      th.ondragover = e => { if ([...e.dataTransfer.types].includes("text/col")){ e.preventDefault(); th.classList.add("dover"); } };
      th.ondragleave = () => th.classList.remove("dover");
      th.ondrop = e => { th.classList.remove("dover"); const from = e.dataTransfer.getData("text/col"); if (!from || from === id) return; e.preventDefault();
        /* the new order of all the columns: the dragged one takes the dropped on one's place (after it going right, before it going left) */
        const o = ids.slice(), a = o.indexOf(from), b0 = o.indexOf(id); o.splice(a, 1); let b = o.indexOf(id); b = a < b0 ? b + 1 : b;
        o.splice(Math.max(0, b), 0, from);
        lsSet("adColOrder", o); App.render(); }; }); }
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
      + '</div>' + (list.length ? "" : '<div class="empty">' + (Store.visible().length ? Filters.emptyHtml() : "No actions yet.") + '</div>');
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
  function columnsPop(anchor){ Fields.closePop(); if (!App.isAdmin()) return note("Only the admin adds and removes columns"); const p = h('<div class="pop colpop"><div class="pop-h">Columns in the table</div>' + Store.fields().filter(f => f.id !== "title").map(f => '<label class="tp-o"><input type="checkbox" data-f="' + f.id + '"' + (f.table ? " checked" : "") + '><span>' + esc(f.label) + '</span></label>').join("") + '<div class="pop-n">Drag the column headers to reorder them.</div></div>');
    document.body.appendChild(p); Fields.place(p, anchor);
    $$("input", p).forEach(c => c.onchange = () => Store.mutate("config", () => { const f = Store.field(c.dataset.f); f.table = c.checked; Store.touch(f); })); }
  return { render, rows, forget, columnsPop, sizePop, rowBtns, idBox, copySheet, IDI };
})();
