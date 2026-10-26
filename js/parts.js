/* The MTO and Spares tabs of the action view: the action's list of parts as a simple table, ready to fill in. Each row can move across (MTO to spares, spares to MTO). The MTO also holds the
   quotes, and exports the RFQ as a PDF. */
"use strict";
const Parts = (() => {
  const COLS = { mto: [["desc", "Description"], ["part", "Part / tag no."], ["qty", "Qty"], ["unit", "Unit"], ["eta", "ETA"], ["notes", "Notes"]],
    spares: [["desc", "Description"], ["part", "Part / tag no."], ["qty", "Qty"], ["unit", "Unit"], ["notes", "Store location / notes"]] };
  const NAME = { mto: "MTO", spares: "Spares" }, OTHER = { mto: "spares", spares: "mto" };
  const list = (a, k) => a[k] || (a[k] = []);
  const created = new Map();   // a blank row that became an item: keep the cursor in it

  /* one action's list, drawn into its action view tab; keep is where the cursor was before the redraw */
  function renderFor(el, a, kind, keep){ const ro = !Store.S.edit;
    el.innerHTML = '<div class="pt-main">' + pane(a, kind, ro) + '</div>'; wire(el, a, kind, ro);
    if (keep && keep.c){ let r = keep.r, cut = keep.cut; if (created.has(r)){ r = created.get(r); created.delete(keep.r); } if (cut === "new" && created.has("cut:" + r)) cut = created.get("cut:" + r);
      const t = $('[data-r="' + r + '"][data-c="' + keep.c + '"]' + (cut ? '[data-cut="' + cut + '"]' : ":not([data-cut])"), el); if (t){ if (t.value !== keep.v) { t.value = keep.v; t.addEventListener("blur", () => t.dispatchEvent(new Event("change")), { once: true }); } t.focus(); try { t.setSelectionRange(keep.s, keep.s); } catch (e) {} } } created.clear(); }

  function pane(a, kind, ro){ const s = Store.stage(a.stage), items = list(a, kind), cols = COLS[kind];
    const blanks = Math.max(ro ? 0 : 1, 5 - items.length);
    const row = (it, i) => '<tr data-id="' + it.id + '"><td class="pt-no">' + (i + 1) + '</td>' + cols.map(([k]) => '<td><input class="in pt-in' + (it[k] === "TBC" ? " tbc" : "") + '" data-r="' + it.id + '" data-c="' + k + '"' + (k === "qty" ? ' inputmode="decimal"' : k === "eta" ? ' type="date" title="When this part is expected on site"' : "") + (ro ? " readonly" : "") + ' value="' + esc(it[k] == null ? "" : it[k]) + '"></td>').join("")
      + (kind === "spares" ? '<td class="pt-sec"><input type="checkbox" class="ck pt-ck" data-sec="' + it.id + '"' + (it.secured ? " checked" : "") + (ro ? " disabled" : "") + ' title="Tick when this spare is secured: found in the store and set aside for the job" aria-label="Secured"></td>' : "")
      + '<td class="pt-act">' + (ro ? "" : '<button type="button" class="btn ghost sm pt-mv" title="Move this row to ' + NAME[OTHER[kind]] + '">→ ' + (kind === "mto" ? "Spares" : "MTO") + '</button><button type="button" class="ic-b sm pt-x" title="Remove this row">✕</button>') + '</td></tr>';
    const blank = k => '<tr class="pt-blank"><td class="pt-no"></td>' + cols.map(([c]) => '<td><input class="in pt-in" data-r="new' + k + '" data-c="' + c + '"' + (c === "eta" ? ' type="date"' : "") + (ro ? " readonly" : "") + '></td>').join("") + (kind === "spares" ? '<td></td>' : "") + '<td></td></tr>';
    return '<div class="pt-head"><b class="pt-h">' + NAME[kind] + '</b><span class="grow"></span>'
      + (ro ? "" : '<button type="button" class="dl dl-ai" data-k="gem" title="Paste a parts list, quote or email. Gemini splits it into rows, and you check them before they are added." aria-label="Make rows from text with AI">' + aiIco() + '</button>')
      + (kind === "mto" && Mto.needsCut(a) ? '<button type="button" class="dl dl-pdf" data-k="cut" title="The cutting list for the trades: which pieces come out of which length or sheet, and the offcuts. It also comes with each RFQ export.">' + fileIco("Cut") + '</button>' : "")
      + '<button type="button" class="dl dl-xl" data-k="xls" title="Export this ' + NAME[kind] + ' to Excel">' + fileIco("XLSX") + '</button>'
      + '<button type="button" class="dl dl-pdf" data-k="pdf" title="' + (kind === "mto" ? "Export the RFQ as a PDF" : "Export the spares list as a PDF") + '">' + fileIco(kind === "mto" ? "RFQ" : "PDF") + '</button></div>'
      + (kind === "mto" ? Vendors.box(a, ro) : "")
      + (kind === "mto" ? '<div class="pt-docs"><div class="pt-box pt-quotes"><div class="pt-bh"><b>Quotes</b><span class="dim">' + (a.quotes || []).length + '</span><span class="grow"></span>' + (ro ? "" : '<button type="button" class="btn ghost sm" data-k="quote">Upload quotes</button>') + '</div>'
          + ((a.quotes || []).length ? (a.quotes || []).slice().reverse().map(f => '<div class="pt-file"><span class="att-ic">' + (/pdf$/i.test(f.name) ? "PDF" : /xlsx?$|csv$/i.test(f.name) ? "XLS" : "FILE") + '</span><button type="button" class="link" data-q="' + f.h + '">' + esc(f.name) + '</button><span class="dim">' + esc(fmtDate(f.added)) + ' · ' + fmtSize(f.size || 0) + '</span>' + (ro ? "" : '<button type="button" class="ic-b sm" data-qx="' + f.h + '" title="Remove">✕</button>') + '</div>').join("") : '<div class="dim pt-drop">No quotes yet.' + (ro ? "" : tipI("Upload them, or drop them here.")) + '</div>') + '</div>'
        + '</div>' : "")
      + (kind === "mto" ? Mto.table(a, ro) : '<table class="tbl pt-tbl"><thead><tr><th class="pt-no">Item</th>' + cols.map(([k, n]) => '<th class="pt-' + k + '">' + esc(n) + '</th>').join("") + (kind === "spares" ? '<th class="pt-sec">Secured</th>' : "") + '<th class="pt-act"></th></tr></thead><tbody>'
      + items.map(row).join("") + Array.from({ length: blanks }, (_, k) => blank(k)).join("") + '</tbody></table>')
      + '<div class="dim pt-foot">' + (items.length ? items.length + " item" + (items.length > 1 ? "s" : "") : "") + (kind === "mto" && (a.spares || []).length ? " · " + a.spares.length + " more from spares, not on the RFQ" : "") + (kind === "spares" && items.length ? " · " + items.filter(x => x.secured).length + " of " + items.length + " secured" : "") + '</div>'; }
  const DLI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="M7 10.5l5 5 5-5"/><path d="M5 20h14"/></svg>';

  function wire(el, a, kind, ro){ const key = "a:" + a._p, items = list(a, kind); if (kind === "mto"){ Vendors.wire(el, a, ro); Mto.wire(el, a, ro); }
    $$(kind === "mto" ? ".mt-tbl .pt-in:not(.mt-cin)" : ".pt-in", el).forEach(i => { if (kind === "mto"){ i.addEventListener("keydown", e => { if (e.key === "Enter" && i.tagName === "INPUT"){ e.preventDefault(); i.blur(); } }); return; } i.onkeydown = e => { if (e.key === "Enter"){ e.preventDefault(); const c = i.dataset.c, k = $$('.pt-in[data-c="' + c + '"]').indexOf(i); i.blur();
        setTimeout(() => { const ins = $$('.pt-in[data-c="' + c + '"]'), n = ins[k + 1] || $('.pt-in[data-r^="new"][data-c="' + c + '"]'); n && n.focus(); }, 40); } };
      if (ro) return;
      i.onchange = () => { const v = i.value.trim(), r = i.dataset.r, c = i.dataset.c;
        if (r.startsWith("new")){ if (!v) return; const it = { id: uid() }; it[c] = v; created.set(r, it.id); Store.mutate(key, () => { items.push(it); Store.touch(a); }); Store.log("Added to the " + NAME[kind] + " of " + Store.actId(a)); return; }
        const it = items.find(x => x.id === r); if (!it || (it[c] || "") === v) return; Store.mutate(key, () => { it[c] = v; Store.touch(a); }); Store.log("Edited the " + NAME[kind] + " of " + Store.actId(a)); }; });
    $$("[data-sec]", el).forEach(c => c.onchange = () => { const it = items.find(x => x.id === c.dataset.sec); if (!it) return; Store.mutate(key, () => { if (c.checked) it.secured = true; else delete it.secured; Store.touch(a); }); Store.log((c.checked ? "Secured" : "Unsecured") + " a spare on " + Store.actId(a)); });
    $$(".pt-mv", el).forEach(b => b.onclick = () => { const id = b.closest("tr").dataset.id; Store.mutate(key, () => { const i = items.findIndex(x => x.id === id); const it = items.splice(i, 1)[0]; if (kind === "mto") it.desc = Mto.desc(it); list(a, OTHER[kind]).push(it); Store.touch(a); });
      note("Moved to " + NAME[OTHER[kind]] + " (Ctrl+Z to undo)"); Store.log("Moved a part of " + Store.actId(a) + " to " + NAME[OTHER[kind]]); });
    $$(".pt-x", el).forEach(b => b.onclick = () => { const id = b.closest("tr").dataset.id; Store.mutate(key, () => { const i = items.findIndex(x => x.id === id); items.splice(i, 1); Store.touch(a); }); });
    $$("[data-q]", el).forEach(b => b.onclick = () => Media.openFile(a, a.quotes.find(f => f.h === b.dataset.q)));
    $$("[data-qx]", el).forEach(b => b.onclick = () => Store.mutate(key, () => { a.quotes = a.quotes.filter(f => f.h !== b.dataset.qx); Store.touch(a); }));
    $$("[data-k]", el).forEach(b => b.onclick = () => { const k = b.dataset.k;
      if (k === "quote") pickFile("", true, fs => quotes(a, fs));
      else if (k === "xls") excel(a, kind); else if (k === "pdf") pdf(a, kind); else if (k === "gem") gemini(a, kind); else if (k === "cut") Mto.cutList(a); });
    const qb = $(".pt-quotes", el); if (qb && !ro){ qb.ondragover = e => { if ([...e.dataTransfer.types].includes("Files")){ e.preventDefault(); qb.classList.add("drop"); } };
      qb.ondragleave = () => qb.classList.remove("drop"); qb.ondrop = e => { qb.classList.remove("drop"); if (!e.dataTransfer.files.length) return; e.preventDefault(); e.stopPropagation(); quotes(a, e.dataTransfer.files); }; } }

  /* quotes: kept like attachments (online, and the original in the local folder), newest at the top */
  async function quotes(a, files){ if (!Store.S.edit) return App.viewOnly();
    for (const f of Array.from(files)){ try { const buf = await f.arrayBuffer(), hh = (await sha1(buf)).slice(0, 12);
        if ((a.quotes || []).some(x => x.h === hh)){ note(f.name + " is already there"); continue; }
        const lname = Media.uniq(a, "Quote " + f.name, hh); Local.saveOriginal(a, lname, f); await Store.addBlob(pFile(a._p, hh, f.name), bufToB64(buf)); Media.mem.set("f" + hh, URL.createObjectURL(f));
        Store.mutate("a:" + a._p, () => { (a.quotes = a.quotes || []).push({ h: hh, name: f.name, lname, size: f.size, type: f.type, added: now(), by: Profile.name() }); Store.touch(a); }); Store.log("Added quote " + f.name + " to " + Store.actId(a));
      } catch (e){ alert("Couldn't add " + f.name + ": " + e.message); } } }

  /* ---------- exports ---------- */
  const fname = (a, kind) => Store.actId(a) + " " + (kind === "mto" ? "RFQ" : "Spares") + " " + new Date().toISOString().slice(0, 10) + ".pdf";
  function excel(a, kind){ const items = list(a, kind); if (!items.length) return alert("Nothing to export yet.");
    const sec = kind === "spares", head = ["Item"].concat(COLS[kind].map(c => c[1]), sec ? ["Secured"] : []), rows = items.map((it, i) => [String(i + 1)].concat(COLS[kind].map(([k]) => it[k] || ""), sec ? [it.secured ? "Yes" : "No"] : []));
    Excel.save(Excel.book(head, rows, Store.actId(a) + " " + NAME[kind]), Store.actId(a) + " " + NAME[kind] + " " + new Date().toISOString().slice(0, 10) + ".xlsx"); }
  let pdfP = null;
  const loadPdf = () => pdfP || (pdfP = new Promise((res, rej) => { const add = (src, next) => { const s = document.createElement("script"); s.src = src; s.onload = next; s.onerror = () => { pdfP = null; rej(new Error("Couldn't load the PDF maker")); }; document.head.appendChild(s); };
    add("js/lib/jspdf.umd.min.js", () => add("js/lib/jspdf.plugin.autotable.min.js", () => res(window.jspdf.jsPDF))); }));
  async function build(a, kind, r){ const jsPDF = await loadPdf(), doc = new jsPDF({ unit: "mm", format: "a4" }), p = Store.project(a._p) || {}, items = list(a, kind);
    const thb = (getComputedStyle(document.documentElement).getPropertyValue("--thb") || "#475569").trim(), rgb = /^#[0-9a-f]{6}$/i.test(thb) ? [1, 3, 5].map(i => parseInt(thb.substr(i, 2), 16)) : [71, 85, 105];
    doc.setFillColor(...rgb); doc.rect(0, 0, 210, 26, "F"); doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(17);
    doc.text(kind === "mto" ? "Request for Quotation" : "Spares list", 14, 13); doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.text(Store.actId(a) + "   " + (p.name || ""), 14, 20);
    doc.setTextColor(30); doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.text(doc.splitTextToSize(a.f.title || "", 182), 14, 36);
    doc.setFont("helvetica", "normal"); doc.setTextColor(90);
    const pf = Profile.get(), tl = doc.splitTextToSize(a.f.title || "", 182).length;
    let y0 = 36 + tl * 4.6 + 2;
    if (kind === "mto"){
      /* From (whoever exports it, from their profile) and To (the vendors picked), side by side */
      const from = [Profile.name() || "Name not set (File, Your profile)", pf.role, pf.company, pf.mobile && "Mobile " + pf.mobile, pf.email].filter(Boolean);
      const to = (a.rfqTo || []).length ? a.rfqTo.map(n => Vendors.lines(n)) : [["No vendor picked"]];
      const box = (x, label, groups) => { let yy = y0 + 5.5; doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(110); doc.text(label.toUpperCase(), x + 3, y0 + 4.5); yy += 1;
        groups.forEach((g, gi) => { if (gi) yy += 2; g.forEach((l, li) => { doc.setFont("helvetica", li ? "normal" : "bold"); doc.setFontSize(li ? 9 : 10); doc.setTextColor(li ? 60 : 25); const w = doc.splitTextToSize(String(l), 84); doc.text(w, x + 3, yy + 3); yy += w.length * 4.2; }); });
        return yy - y0 + 2; };
      const hF = box(14, "From", [from]), hT = box(108, "To" + (a.rfqCat ? "  ·  " + a.rfqCat : ""), to), hb = Math.max(hF, hT);
      doc.setDrawColor(217, 222, 229); doc.setLineWidth(0.3); doc.roundedRect(14, y0, 90, hb, 1.5, 1.5); doc.roundedRect(108, y0, 88, hb, 1.5, 1.5); y0 += hb + 5; }
    const meta = ["Date: " + fmtDate(now()), kind !== "mto" && Profile.name() ? "Issued by: " + Profile.name() + (pf.role ? ", " + pf.role : "") : "", kind !== "mto" && pf.mobile ? "Mobile: " + pf.mobile : "", kind !== "mto" && pf.email ? "Email: " + pf.email : "", a.f.location ? "Location: " + a.f.location : "", Array.isArray(a.f.equipment) && a.f.equipment.length ? "Equipment: " + a.f.equipment.join(", ") : ""].filter(Boolean);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(90); const ml = doc.splitTextToSize(meta.join("     "), 182); doc.text(ml, 14, y0 + 2); y0 += ml.length * 4.4 + 4;
    doc.autoTable({ startY: y0, head: [["Item"].concat(COLS[kind].map(c => c[1]), kind === "spares" ? ["Secured"] : [])], body: items.map((it, i) => [i + 1].concat(COLS[kind].map(([k]) => it[k] || ""), kind === "spares" ? [it.secured ? "Yes" : "No"] : [])),
      styles: { font: "helvetica", fontSize: 9.5, cellPadding: 2.2, lineColor: [217, 222, 229], lineWidth: 0.2, valign: "top" }, headStyles: { fillColor: rgb, textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [246, 247, 249] }, columnStyles: { 0: { cellWidth: 12, halign: "center" }, 1: { cellWidth: 62 }, 3: { cellWidth: 14, halign: "right" }, 4: { cellWidth: 16 } }, margin: { left: 14, right: 14 } });
    let y = doc.lastAutoTable.finalY + 8; doc.setFontSize(9); doc.setTextColor(110);
    if (kind === "mto" && (a.spares || []).length) { doc.text((a.spares.length) + " further item" + (a.spares.length > 1 ? "s come" : " comes") + " from site spares and " + (a.spares.length > 1 ? "are" : "is") + " not part of this request.", 14, y); y += 6; }
    const pages = doc.getNumberOfPages(); for (let i = 1; i <= pages; i++){ doc.setPage(i); doc.setFontSize(8); doc.setTextColor(140); doc.text(fname(a, kind).replace(/\.pdf$/, "") + "   Page " + i + " of " + pages, 105, 290, { align: "center" }); }
    return doc.output("blob"); }
  let exporting = false;
  async function pdf(a, kind){ const items = list(a, kind); if (!items.length) return alert("Nothing to export yet."); if (exporting) return; exporting = true;
    try { if (kind !== "mto"){ Excel.save(await build(a, kind), fname(a, kind)); return; }
      if (!Store.S.edit) return App.viewOnly();
      const pf = Profile.get(), miss = [!Profile.name() && "your name", !pf.mobile && "your mobile", !pf.email && "your email"].filter(Boolean), noTo = !(a.rfqTo || []).length, bare = (a.rfqTo || []).filter(n => { const v = Vendors.byName(n) || {}; return !(v.contact || v.email || v.phone); });
      const warn = (miss.length ? " Your profile has no " + miss.join(", ") + " (File, Your profile)." : "") + (noTo ? " No vendor is picked." : bare.length ? " No contact details for " + bare.join(", ") + " (click the vendor to add them)." : "");
      if (warn && !await confirmBox("Missing on the RFQ:" + warn + " Export it anyway?", "Export")) return;
      const blob = await build(a, kind), name = fname(a, kind); Excel.save(blob, name); Local.saveOriginal(a, name, blob); Store.log("Exported " + name);
      if (Mto.needsCut(a)) await Mto.cutList(a);   // (the trades' cutting list comes too, only when something needs more than one length or sheet)
    }
    catch (e){ console.error(e); alert("Couldn't make the PDF: " + e.message); } finally { exporting = false; } }

  /* ---------- Gemini: paste a list of parts, check the rows, then add them ---------- */
  function gemini(a, kind){ if (!Store.S.edit) return App.viewOnly(); const cols = COLS[kind];
    const m = modal('<h3>Paste text into the ' + NAME[kind] + tipI("Paste an email, quote or parts list. Gemini splits it into rows; check them, then add.") + '</h3><textarea class="in ta" rows="8" placeholder="Paste the parts here…"></textarea><div class="nw-pb"><button type="button" class="btn" data-k="go">Split into rows</button><span class="dim nw-msg"></span></div><div class="pg-prev"></div><div class="yn-btns"><button class="yn-no" type="button">Cancel</button><button class="yn-yes" type="button" disabled>Add rows</button></div>', { cls: "nw-win", sticky: true });
    let rows = []; const prev = $(".pg-prev", m), add = $(".yn-yes", m);
    const draw = () => { prev.innerHTML = rows.length ? '<table class="tbl pt-tbl"><thead><tr><th class="pt-no">Add</th>' + cols.map(([k, n]) => '<th>' + esc(n) + '</th>').join("") + '</tr></thead><tbody>' + rows.map((r, i) => '<tr><td class="pt-no"><input type="checkbox" data-i="' + i + '"' + (r._on ? " checked" : "") + '></td>' + cols.map(([k]) => '<td><input class="in pt-in" data-i="' + i + '" data-k="' + k + '" value="' + esc(r[k] || "") + '"></td>').join("") + '</tr>').join("") + '</tbody></table>' : "";
      $$("input[type=checkbox]", prev).forEach(c => c.onchange = () => { rows[+c.dataset.i]._on = c.checked; count(); });
      $$("input.pt-in", prev).forEach(i => i.onchange = () => rows[+i.dataset.i][i.dataset.k] = i.value.trim()); count(); };
    const count = () => { const n = rows.filter(r => r._on).length; add.disabled = !n; add.textContent = "Add " + n + " row" + (n === 1 ? "" : "s"); };
    $("[data-k=go]", m).onclick = async () => { const tx = $("textarea", m).value.trim(), msg = $(".nw-msg", m), b = $("[data-k=go]", m); if (!tx) return; b.disabled = true; msg.textContent = "Asking Gemini…";
      try { const out = await Intake.ask("Turn this text into a parts list (a material take off) for a maintenance action at a processing plant.\nReturn ONLY a JSON object: {\"items\": [{\"desc\": description, \"part\": part number or equipment tag, \"qty\": quantity as a number or string, \"unit\": unit such as ea, m, kg, L, set, \"notes\": anything else useful such as supplier, size or rating}]}."
          + " One item per distinct part. If the text doesn't give a value, use an empty string. Do not guess. Keep part numbers and tags exactly as written.\n\nTEXT:\n" + tx);
        rows = (out.items || out.parts || []).map(r => { const o = { _on: true }; cols.forEach(([k]) => { const v = r[k]; o[k] = v == null ? "" : String(v).trim(); }); return o; }).filter(r => cols.some(([k]) => r[k]));
        msg.textContent = rows.length ? "Found " + rows.length + ". Check them, untick any you don't want, then add." : "No parts found in that text."; draw(); }
      catch (e){ msg.textContent = e.message; } finally { b.disabled = false; } };
    $(".yn-no", m).onclick = () => m.close();
    add.onclick = () => { const take = rows.filter(r => r._on).map(r => { const o = { id: uid() }; cols.forEach(([k]) => { if (r[k]) o[k] = r[k]; }); return o; }); if (!take.length) return;
      Store.mutate("a:" + a._p, () => { list(a, kind).push(...take); Store.touch(a); }); Store.log("Added " + take.length + " parts to the " + NAME[kind] + " of " + Store.actId(a)); m.close(); }; }
  return { renderFor, NAME, loadPdf, created };
})();
