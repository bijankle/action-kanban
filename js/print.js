/* Printing: first the Organizer board of every action being printed (A4 landscape), then each action's
   details, photos and attachment links. Which stages print is ticked in the print window; Completed is
   unticked to start with. Print to PDF keeps the attachment links clickable. */
"use strict";
const Print = (() => {
  const prefs = () => Object.assign({ photos: true, per: 2, board: true, newPage: true }, lsGet("adPrint", {}));
  /* what goes into an export (the list's PDF and Excel buttons): which statuses, Deleted included, and a date range
     on the date created, last modified or completed (blank is all time). The search and the other Filters panel pills
     still apply. Done and Deleted are unticked to start with; the choice is remembered per export. */
  const DATES = [["created", "Date created"], ["mod", "Last modified"], ["doneAt", "Date completed"]];
  function pickHtml(key){ const pick = lsGet(key, null), base = Store.visible().concat(Store.deleted()).filter(a => Filters.match(a, "st"));
    const sts = Store.stages().map(s => ({ id: s.id, name: s.name, c: s.color, def: s.kind !== "done" })).concat({ id: "_del", name: "Deleted", c: "#9aa3ad", def: false });
    const on = s => pick && pick.st && s.id in pick.st ? pick.st[s.id] : s.def, d = (pick && pick.d) || {};
    return '<div class="lbl">Include</div><div class="pr-st">' + sts.map(s => '<label class="tp-o"><input type="checkbox" data-s="' + s.id + '"' + (on(s) ? " checked" : "") + '><span class="stg" style="--c:' + esc(s.c) + '">' + esc(s.name) + '</span><span class="dim">' + base.filter(a => Filters.val(a, "st") === s.id).length + '</span></label>').join("") + '</div>'
      + '<div class="msep"></div><div class="lbl">Dates <span class="dim">blank is all time</span></div><div class="pr-dt"><select class="in sm" data-d="by">' + DATES.map(([k, n]) => '<option value="' + k + '"' + (d.by === k ? " selected" : "") + '>' + n + '</option>').join("") + '</select>'
      + '<label class="dim">from <input class="in sm" type="date" data-d="from" value="' + esc(d.from || "") + '"></label><label class="dim">to <input class="in sm" type="date" data-d="to" value="' + esc(d.to || "") + '"></label></div>'; }
  function pickList(m, key){ const st = {}; $$("[data-s]", m).forEach(c => st[c.dataset.s] = c.checked); const d = {}; $$("[data-d]", m).forEach(i => d[i.dataset.d] = i.value); lsSet(key, { st, d });
    const from = d.from ? new Date(d.from + "T00:00:00").getTime() : -Infinity, to = d.to ? new Date(d.to + "T23:59:59").getTime() : Infinity;
    const inRange = a => { if (!d.from && !d.to) return true; const t = a[d.by] || (d.by === "created" ? a.mod : null); if (!t) return false; const x = typeof t === "number" ? t : new Date(t).getTime(); return x >= from && x <= to; };
    const ord = new Map(Store.stages().map((s, i) => [s.id, i]));
    return Store.visible().concat(Store.deleted()).filter(a => st[Filters.val(a, "st")] && Filters.match(a, "st") && inRange(a))
      .sort((x, y) => (x.del - y.del) || (ord.get(x.stage) - ord.get(y.stage)) || (x.rank || 0) - (y.rank || 0) || x.no - y.no); }
  function dialog(){ const pf = prefs();
    const m = modal('<h3>Export to PDF or print' + tipI("Pick “Save as PDF” as the printer for a PDF. Only the projects ticked in the project box are included, and only what the search and the other filters show.") + '</h3>' + pickHtml("adPrintPick")
      + '<div class="msep"></div><label class="tp-o"><input type="checkbox" data-o="board"' + (pf.board ? " checked" : "") + '><span>Organizer overview first</span></label>'
      + '<label class="tp-o"><input type="checkbox" data-o="photos"' + (pf.photos ? " checked" : "") + '><span>Photos</span></label><label class="fl in-row">Photos per row <select class="in sm" data-o="per">' + [1, 2, 3, 4].map(n => '<option' + (n === pf.per ? " selected" : "") + '>' + n + '</option>').join("") + '</select></label>'
      + '<label class="tp-o"><input type="checkbox" data-o="newPage"' + (pf.newPage ? " checked" : "") + '><span>Each action on a new page</span></label>'
      + '<div class="yn-btns"><button class="yn-no" type="button">Cancel</button><button class="yn-yes" type="button">Export</button></div>', { cls: "pr-win" });
    $(".yn-no", m).onclick = () => m.close();
    $(".yn-yes", m).onclick = () => { const list = pickList(m, "adPrintPick"); const o = {}; $$("[data-o]", m).forEach(c => o[c.dataset.o] = c.type === "checkbox" ? c.checked : +c.value); lsSet("adPrint", o);
      if (!list.length) return alert("Nothing matches those choices."); m.close(); run(list, o); }; }
  /* the Excel export's window: the same choices, then the list as a spreadsheet */
  function excelDialog(){ const m = modal('<h3>Export to Excel' + tipI("Only the projects ticked in the project box are included, and only what the search and the other filters show.") + '</h3>' + pickHtml("adXlsPick")
      + '<div class="yn-btns"><button class="yn-no" type="button">Cancel</button><button class="yn-yes" type="button">Export</button></div>', { cls: "pr-win" });
    $(".yn-no", m).onclick = () => m.close();
    $(".yn-yes", m).onclick = () => { const list = pickList(m, "adXlsPick"); if (!list.length) return alert("Nothing matches those choices."); m.close(); Excel.run(list); }; }
  async function run(list, o){ o = Object.assign(prefs(), o || {}); if (list.length === 1 && !arguments[1]) o.board = false;
    $$("#printRoot").forEach(x => x.remove());
    const root = h('<div id="printRoot"></div>'), projs = [...new Set(list.map(a => a._p))].map(p => (Store.project(p) || {}).name).join(", ");
    const stamp = new Date().toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
    const head = '<div class="pr-head"><span class="pr-logo">' + LOGO(28) + '</span><div><b>Action Database</b><span>' + esc(projs) + '</span></div><span class="grow"></span><div class="pr-meta">' + list.length + ' action' + (list.length > 1 ? "s" : "") + '<br>Printed ' + esc(stamp) + (Profile.name() ? " by " + esc(Profile.name()) : "") + '</div></div>';
    if (o.board){ const ss = Store.stages().filter(s => list.some(a => a.stage === s.id));
      root.appendChild(h('<section class="pr-board">' + head + '<div class="pb-cols" style="--n:' + ss.length + '">' + ss.map(s => '<div class="pb-col" style="--c:' + esc(s.color) + '"><div class="pb-h">' + esc(Store.todo(s)) + ' <span>' + list.filter(a => a.stage === s.id).length + '</span></div>'
        + list.filter(a => a.stage === s.id).map(a => '<div class="pb-card"><b>' + esc(Store.actId(a)) + '</b> ' + esc(a.f.title || "") + (Store.eta(a) ? '<i class="' + (Store.eta(a) === "TBC" ? "tbc" : "") + '">ETA ' + esc(fmtDate(Store.eta(a))) + '</i>' : "") + '</div>').join("") + '</div>').join("") + '</div></section>')); }
    const skip = new Set(["title", "problem", "solution", "notes"]);
    list.forEach((a, i) => { const s = Store.stage(a.stage), p = Store.project(a._p) || {};
      const det = Store.fields().filter(f => !skip.has(f.id)).map(f => '<tr><th>' + esc(f.label) + '</th><td>' + (Fields.show(a, f) || '<span class="dim">–</span>') + '</td></tr>').join("");
      const link = GH.appUrl() + "?a=" + encodeURIComponent(a._p + ":" + a.no);
      root.appendChild(h('<section class="pr-act' + (o.newPage || (!o.board && i === 0) ? " np" : "") + '">' + (!o.board && i === 0 ? head : "") + '<div class="pa-h" style="--c:' + esc(s.color) + '"><b>' + esc(Store.actId(a)) + '</b><span class="pa-t">' + esc(a.f.title || "") + '</span><span class="stg">' + esc(s.name) + '</span></div>'
        + '<div class="pa-sub">' + esc(p.name || "") + ' · <a href="' + esc(link) + '">Open online</a></div>'
        + '<div class="pa-grid"><div><h5>Problem</h5><div class="pa-tx">' + (esc(a.f.problem) || '<span class="dim">–</span>') + '</div><h5>Solution</h5><div class="pa-tx">' + (esc(a.f.solution) || '<span class="dim">–</span>') + '</div>'
        + (a.f.notes ? '<h5>Notes</h5><div class="pa-tx">' + esc(a.f.notes) + '</div>' : "") + '</div><table class="pa-det">' + det + '</table></div>'
        + ((a.isol || []).length ? '<h5>Isolations</h5><table class="pa-mto"><tr><th>No.</th><th>Equipment number</th><th>Equipment name</th><th>Note</th></tr>' + a.isol.map((it, k) => '<tr><td>' + (k + 1) + '</td><td>' + esc(it.tag || "") + '</td><td>' + esc(it.name || "") + '</td><td>' + esc(it.note || "") + '</td></tr>').join("") + '</table>' : "")
        + ((a.mto || []).length ? '<h5>MTO</h5><table class="pa-mto"><tr><th>Item</th><th>Description</th><th>Part / tag no.</th><th>Qty</th><th>Unit</th><th>Notes</th></tr>' + a.mto.map((it, k) => '<tr><td>' + (k + 1) + '</td><td>' + esc(it.desc || "") + '</td><td>' + esc(it.part || "") + '</td><td>' + esc(it.qty || "") + '</td><td>' + esc(it.unit || "") + '</td><td>' + esc(it.notes || "") + '</td></tr>').join("") + '</table>' : "")
        + ((a.spares || []).length ? '<h5>From spares</h5><table class="pa-mto"><tr><th>Item</th><th>Description</th><th>Part / tag no.</th><th>Qty</th><th>Unit</th><th>Store location / notes</th><th>Secured</th></tr>' + a.spares.map((it, k) => '<tr><td>' + (k + 1) + '</td><td>' + esc(it.desc || "") + '</td><td>' + esc(it.part || "") + '</td><td>' + esc(it.qty || "") + '</td><td>' + esc(it.unit || "") + '</td><td>' + esc(it.notes || "") + '</td><td>' + (it.secured ? "Yes" : "No") + '</td></tr>').join("") + '</table>' : "")
        + (a.files.length ? '<h5>Attachments</h5>' + a.files.map(f => '<div class="pa-file">📎 <a href="' + esc(Media.fileUrlOnline(a, f)) + '">' + esc(f.name) + '</a> <span class="dim">' + fmtSize(f.size || 0) + '</span></div>').join("") : "")
        + (o.photos && a.photos.length ? '<h5>Photos</h5><div class="pa-ph" style="--per:' + o.per + '">' + a.photos.map(ph => '<figure><img src="' + esc(Media.src(a, ph)) + '" alt=""><figcaption>' + esc(ph.name || "") + '</figcaption></figure>').join("") + '</div>' : "") + '</section>')); });
    document.body.appendChild(root); note("Getting the photos ready to print…", 8000);
    await Promise.race([Promise.all($$("img", root).map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; }))), new Promise(r => setTimeout(r, 20000))]);
    const done = () => { root.remove(); removeEventListener("afterprint", done); }; addEventListener("afterprint", done);
    window.print(); }
  return { excelDialog, dialog, run };
})();
