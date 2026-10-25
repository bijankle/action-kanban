/* Printing: first the Organizer board of every action being printed (A4 landscape), then each action's
   details, photos and attachment links. Which stages print is ticked in the print window; Completed is
   unticked to start with. Print to PDF keeps the attachment links clickable. */
"use strict";
const Print = (() => {
  const prefs = () => Object.assign({ photos: true, per: 2, board: true, newPage: true, pages: 0 }, lsGet("adPrint", {}));
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
      + '<label class="fl in-row">Pages per action <select class="in sm" data-o="pages">' + [[0, "No limit"], [1, "1"], [2, "2"], [3, "3"], [4, "4"]].map(([v, n]) => '<option value="' + v + '"' + (v === (pf.pages || 0) ? " selected" : "") + '>' + n + '</option>').join("") + '</select>' + tipI("The photos are made smaller, and more go on each row, until each action fits this many pages.") + '</label>'
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
    const skip = new Set(["title", "problem", "solution", "notes", "modified"])   /* (last modified is only for filtering in the app) */, links = await Media.shareLinks(list);   // (attachment links anyone can open)
    list.forEach((a, i) => { const s = Store.stage(a.stage);
      /* only what has something in it: blank boxes, unticked ticks and empty columns are left out to save the space */
      /* the ticked boxes together in one row, each with a tick (unticked ones are left out) */
      const ticks = Store.fields().filter(f => f.type === "check" && a.f[f.id] === true).map(f => '<span class="pa-tk">✓ ' + esc(f.label) + '</span>').join("");
      const det = (ticks ? '<tr><th>Done</th><td class="pa-tks">' + ticks + '</td></tr>' : "") + Store.fields().filter(f => !skip.has(f.id) && f.type !== "check").map(f => [f, Fields.show(a, f)]).filter(([, v]) => { const t = String(v || "").replace(/<[^>]*>/g, "").trim(); return t && !/^(none|–|-|0 items?)$/i.test(t); }).map(([f, v]) => '<tr><th>' + esc(f.label) + '</th><td>' + v + '</td></tr>').join("");
      const tbl = (title, cols, rows) => { const keep = cols.map((c, k) => k === 0 || rows.some(r => String(r[k] == null ? "" : r[k]).trim())); return rows.length ? '<div class="pa-b"><h5>' + title + '</h5><table class="pa-mto"><tr>' + cols.filter((c, k) => keep[k]).map(c => '<th>' + c + '</th>').join("") + '</tr>' + rows.map(r => '<tr>' + r.filter((c, k) => keep[k]).map(c => '<td>' + esc(c == null ? "" : c) + '</td>').join("") + '</tr>').join("") + '</table></div>' : ""; };
      const txt = [["Problem", a.f.problem], ["Solution", a.f.solution], ["Notes", a.f.notes]].filter(([, v]) => String(v || "").trim()).map(([k, v]) => '<div class="pa-b"><h5>' + k + '</h5><div class="pa-tx">' + esc(v) + '</div></div>').join("");
      root.appendChild(h('<section class="pr-act' + (o.newPage || (!o.board && i === 0) ? " np" : "") + '">' + (!o.board && i === 0 ? head : "") + '<div class="pa-h" style="--c:' + esc(s.color) + '"><b>' + esc(Store.actId(a)) + '</b><span class="pa-t">' + esc(a.f.title || "") + '</span></div>'
        + (Hold.lines(a).length ? '<div class="pa-hold"><b>On hold</b>' + Hold.lines(a).map(([k, v]) => '<span><i>' + esc(k) + '</i> ' + (k === "Mobile" ? '<a href="tel:' + esc(String(v).replace(/\s/g, "")) + '">' + esc(v) + '</a>' : k === "Email" ? '<a href="mailto:' + esc(v) + '">' + esc(v) + '</a>' : esc(v)) + '</span>').join("") + '</div>' : "")
        /* the text down the left column, the photos down the right; text that runs longer than the photos moves across
           under them (balance, below) */
        + '<div class="pa-cols' + (o.photos && a.photos.length ? "" : " one") + '"><div class="pa-l">' + (det ? '<div class="pa-b"><table class="pa-det">' + det + '</table></div>' : "") + txt
        + tbl("Isolations", ["No.", "Equipment number", "Equipment name", "Note"], (a.isol || []).map((it, k) => [k + 1, it.tag, it.name, it.note]))
        + tbl("MTO", ["Item", "Description", "Part / tag no.", "Qty", "Unit", "Notes"], (a.mto || []).map((it, k) => [k + 1, it.desc, it.part, it.qty, it.unit, it.notes]))
        + tbl("From spares", ["Item", "Description", "Part / tag no.", "Qty", "Unit", "Store location / notes", "Secured"], (a.spares || []).map((it, k) => [k + 1, it.desc, it.part, it.qty, it.unit, it.notes, it.secured ? "Yes" : ""]))
        + (a.files.length ? '<div class="pa-b"><h5>Attachments</h5>' + a.files.map(f => '<div class="pa-file">📎 <a href="' + esc(links.get(f) || Media.fileUrlOnline(a, f)) + '">' + esc(f.name) + '</a> <span class="dim">' + fmtSize(f.size || 0) + '</span></div>').join("") + '</div>' : "") + '</div>'
        + (o.photos && a.photos.length ? '<div class="pa-r"><h5>Photos</h5><div class="pa-ph" style="--per:' + Math.max(1, o.per - 1) + '">' + a.photos.map(ph => '<figure><img src="' + esc(Media.src(a, ph)) + '" alt=""><figcaption>' + esc(ph.name || "") + '</figcaption></figure>').join("") + '</div></div>' : "") + '</div></section>')); });
    document.body.appendChild(root); note("Getting the photos ready to print…", 8000);
    await Promise.race([Promise.all($$("img", root).map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; }))), new Promise(r => setTimeout(r, 20000))]);
    balance(root); if (o.pages > 0) fit(root, o);
    const done = () => { root.remove(); removeEventListener("afterprint", done); }; addEventListener("afterprint", done);
    window.print(); }
  /* when the text column runs well past the photos, its last blocks (tables, attachments, then notes) move across under
     the photos, one at a time while that evens the two columns up */
  function balance(root){ root.classList.add("measure"); $$(".pa-cols", root).forEach(bal); root.classList.remove("measure"); }
  function bal(c){ { const L = $(".pa-l", c), R = $(".pa-r", c); if (!L || !R) return;
      /* (a column that still ends on the action's first page stays as it is: nothing moves across while there's room) */
      const top = c.getBoundingClientRect().top - c.closest(".pr-act").getBoundingClientRect().top, fits = col => top + col.offsetHeight <= 273 * 96 / 25.4 - 6;
      $$(".pa-r > .pa-b", R).forEach(b => L.appendChild(b)); const lp0 = $(".pa-ph2", L), rp0 = $(".pa-ph", R); if (lp0){ if (rp0) $$("figure", lp0).forEach(f => rp0.appendChild(f)); lp0.remove(); }   // (start again from all the text on the left, all the photos on the right)
      let at = null; for (let n = 0; n < 20; n++){ const bs = $$(":scope > .pa-b", L); if (bs.length < 2 || fits(L)) break; const last = bs[bs.length - 1], d = L.offsetHeight - R.offsetHeight;
        if (d <= 0 || last.offsetHeight >= d) break; R.insertBefore(last, at); at = last; }
      /* and the other way: when the photos run well past the text, the last photos fill the left column under the text */
      const rp = $(".pa-ph", R); if (!rp) return; let lp = $(".pa-ph", L);
      for (let n = 0; n < 60; n++){ const fs = $$("figure", rp); if (fs.length < 2 || fits(R)) break; const f = fs[fs.length - 1], d = R.offsetHeight - L.offsetHeight; if (d <= 0 || f.offsetHeight >= d) break;
        if (!lp){ lp = h('<div class="pa-ph pa-ph2"></div>'); lp.style.setProperty("--per", rp.style.getPropertyValue("--per")); L.appendChild(lp); } lp.insertBefore(f, lp.firstChild); } } }
  /* pages per action: each action is laid out off screen at the printed width, and while it's taller than its pages its
     photos get more to a row and then a lower height, until it fits (or the photos are as small as they go) */
  function fit(root, o){ const mm = 96 / 25.4, page = 273 * mm, room = o.pages * page - 8 * mm; root.classList.add("measure");
    $$(".pr-act", root).forEach(sec => { const cols = $(".pa-cols", sec); if (!$(".pa-ph", sec) || sec.offsetHeight <= room) return; const imgs = $$(".pa-ph img", sec);
      const tries = []; for (let per = Math.max(1, o.per - 1); per <= 4; per++) tries.push([per, 85]); [70, 55, 45, 35, 28, 22].forEach(hh => tries.push([4, hh]));   // (in the half width photo column)
      for (const [per, hh] of tries){ $$(".pa-ph", sec).forEach(ph => ph.style.setProperty("--per", per)); imgs.forEach(im => im.style.maxHeight = hh + "mm"); bal(cols); if (sec.offsetHeight <= room) break; } });
    root.classList.remove("measure"); }
  return { excelDialog, dialog, run };
})();
