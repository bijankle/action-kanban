/* The work pack: one job as a PDF for whoever does the work. Only what they need: the job and its location,
   the problem and the work required, isolations, the parts (new and from site spares), attachments (linked)
   and photos, with who to contact. Nothing about the tracker itself (project, stage, procurement). */
"use strict";
const Workpack = (() => {
  const toData = async url => { const r = await fetch(url); if (!r.ok) throw new Error(r.status); const b = await r.blob();
    return new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); }); };
  const size = src => new Promise(res => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = () => res([4, 3]); i.src = src; });
  async function run(a){ if (!a) return; note("Making the work pack for " + Store.actId(a) + "…", 15000);
    try { const blob = await build(a); Excel.save(blob, Store.actId(a) + " Work pack.pdf"); note("Work pack downloaded"); }
    catch (e){ console.error(e); alert("Couldn't make the work pack: " + e.message); } }
  async function build(a){ const jsPDF = await Parts.loadPdf(), doc = new jsPDF({ unit: "mm", format: "a4" });
    const W = 210, M = 14, CW = W - 2 * M, BOT = 282;
    const thb = (getComputedStyle(document.documentElement).getPropertyValue("--thb") || "#475569").trim(), rgb = /^#[0-9a-f]{6}$/i.test(thb) ? [1, 3, 5].map(i => parseInt(thb.substr(i, 2), 16)) : [71, 85, 105];
    const hex = c => /^#[0-9a-f]{6}$/i.test(c || "") ? [1, 3, 5].map(i => parseInt(c.substr(i, 2), 16)) : [100, 116, 139];
    let y = 0; const need = n => { if (y + n > BOT){ doc.addPage(); y = 18; } };
    const head = t => { need(14); y += 4; doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(...rgb); doc.text(t.toUpperCase(), M, y); doc.setDrawColor(...rgb); doc.setLineWidth(0.4); doc.line(M, y + 1.5, W - M, y + 1.5); y += 7; doc.setTextColor(30); };
    const para = (t, dim) => { doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(dim ? 140 : 30); const lines = doc.splitTextToSize(t || "–", CW);
      lines.forEach(l => { need(5.2); doc.text(l, M, y); y += 5; }); y += 2; };
    const table = (hd, body, cols) => { doc.autoTable({ startY: y, head: [hd], body, margin: { top: 16, left: M, right: M, bottom: 16 }, styles: { font: "helvetica", fontSize: 9, cellPadding: 1.8, lineColor: [217, 222, 229], lineWidth: 0.2, valign: "top" },
      headStyles: { fillColor: rgb, textColor: 255, fontStyle: "bold" }, alternateRowStyles: { fillColor: [246, 247, 249] }, columnStyles: cols || {} }); y = doc.lastAutoTable.finalY + 6; };
    /* title band: just the job */
    doc.setFillColor(...rgb); doc.rect(0, 0, W, 32, "F"); doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.text("WORK PACK", M, 9);
    doc.setFontSize(16); doc.splitTextToSize(a.f.title || "Work pack", CW - 46).slice(0, 2).forEach((l, i) => doc.text(l, M, 17.5 + i * 7));
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.text("Job ref", W - M, 9, { align: "right" }); doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text(Store.actId(a), W - M, 16, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text("Issued " + new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }), W - M, 22.5, { align: "right" });
    y = 41;
    /* who to contact with any queries */
    const pf = Profile.get(), cl = Profile.lines(); if (Profile.name()){ const bh = 6 + cl.length * 5; doc.setFillColor(243, 244, 246); doc.setDrawColor(...rgb); doc.setLineWidth(0.6); doc.roundedRect(M, y, CW, bh, 2, 2, "F"); doc.line(M, y, M, y + bh);
      doc.setFontSize(8); doc.setTextColor(110); doc.setFont("helvetica", "bold"); doc.text("CONTACT FOR QUERIES", M + 4, y + 4.5); doc.setFontSize(10); doc.setTextColor(30);
      cl.forEach((l, i) => { doc.setFont("helvetica", i ? "normal" : "bold"); doc.text(l, M + 52, y + 4.6 + i * 5); });
      if (pf.email){ doc.link(M + 52, y + 1 + (cl.length - 1) * 5, CW - 52, 5, { url: "mailto:" + pf.email }); } y += bh + 4; }
    /* the job: where, what equipment, who's doing it */
    await Equip.load().catch(() => {});
    const eq = Array.isArray(a.f.equipment) ? a.f.equipment : [], names = eq.map(t => { const e = Equip.get(t); return e && e.n ? t + "  " + e.n.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : t; });
    const job = [["Location", a.f.location], ["Equipment", names.join("\n")], ["Contractor", [a.f.contractor, a.f.contractorPhone].filter(x => x && x !== "TBC" && x !== "N/A").join(", ")]].filter(r => r[1]);
    if (job.length){ head("Job"); doc.autoTable({ startY: y, body: job, margin: { top: 16, left: M, right: M, bottom: 16 }, theme: "plain", styles: { font: "helvetica", fontSize: 10, cellPadding: 1.5 },
      columnStyles: { 0: { cellWidth: 34, textColor: [90, 100, 112], fontStyle: "bold" } } }); y = doc.lastAutoTable.finalY + 4; }
    /* where the equipment is expected to be (auto generated, with a note to check it) */
    try { const sm = await SiteMap.forAction(a);
      if (sm){ const mw = 120, mh = mw * 9 / 16; head("Expected location"); need(mh + 14); doc.addImage(sm.url, "JPEG", M, y, mw, mh, undefined, "FAST");
        doc.setFontSize(8.5); doc.setTextColor(110); doc.setFont("helvetica", "italic"); doc.text(doc.splitTextToSize(sm.note, CW - mw - 6), M + mw + 6, y + 4);
        doc.setFont("helvetica", "normal"); y += mh + 6; } }
    catch (e){ console.warn("site map", e); }
    /* the scope */
    head("Problem"); para(a.f.problem); head("Work required"); para(a.f.solution); if (a.f.notes){ head("Notes"); para(a.f.notes); }
    if ((a.isol || []).length){ head("Isolations"); table(["No.", "Equipment number", "Equipment name", "Note"], a.isol.map((it, i) => [i + 1, it.tag || "", it.name || "", it.note || ""]), { 0: { cellWidth: 12, halign: "center" }, 1: { cellWidth: 40 }, 2: { cellWidth: 62 } }); }
    /* the parts for the job: new parts and parts from site spares, in one list */
    const parts = (a.mto || []).map(it => Object.assign({ src: "New" }, it)).concat((a.spares || []).map(it => Object.assign({ src: "Site spares" }, it)));
    if (parts.length){ head("Parts"); table(["Item", "Description", "Part / tag no.", "Qty", "Unit", "Supplied from", "Notes"], parts.map((it, i) => [i + 1, it.desc || "", it.part || "", it.qty || "", it.unit || "", it.src, it.notes || ""]),
      { 0: { cellWidth: 11, halign: "center" }, 1: { cellWidth: 50 }, 3: { cellWidth: 12, halign: "right" }, 4: { cellWidth: 13 }, 5: { cellWidth: 22 } }); }
    if (a.files.length){ head("Attachments"); doc.setFontSize(9.5); a.files.forEach(f => { need(5.5); doc.setTextColor(31, 95, 191); doc.textWithLink(f.name, M, y, { url: Media.fileUrlOnline(a, f) }); doc.setTextColor(120); doc.text(fmtSize(f.size || 0), W - M, y, { align: "right" }); y += 5.5; }); y += 2; }
    /* photos, two to a row */
    if (a.photos.length){ head("Photos (" + a.photos.length + ")"); const gw = (CW - 6) / 2, gh = 66;
      for (let i = 0; i < a.photos.length; i += 2){ need(gh + 8); let rowH = 0;
        for (let k = 0; k < 2 && i + k < a.photos.length; k++){ const ph = a.photos[i + k]; try { const d = await toData(Media.src(a, ph)), [iw, ih] = await size(d);
            const sc2 = Math.min(gw / iw, gh / ih), w = iw * sc2, hh = ih * sc2, x = M + k * (gw + 6) + (gw - w) / 2;
            doc.addImage(d, /png/i.test(d.slice(0, 30)) ? "PNG" : "JPEG", x, y, w, hh, undefined, "FAST"); rowH = Math.max(rowH, hh);
            if (ph.cap){ doc.setFontSize(7.5); doc.setTextColor(110); doc.text(doc.splitTextToSize(ph.cap, gw)[0] || "", M + k * (gw + 6), y + hh + 3.5); } } catch (e){ console.warn("photo", e); } }
        y += rowH + 8; } }
    const n = doc.getNumberOfPages(); for (let i = 1; i <= n; i++){ doc.setPage(i); doc.setFontSize(8); doc.setTextColor(140); doc.text("Job " + Store.actId(a) + " work pack" + (Profile.name() ? "   Queries: " + [Profile.name(), Profile.get().mobile, Profile.get().email].filter(Boolean).join(", ") : "") + "   Page " + i + " of " + n, W / 2, 291, { align: "center" }); }
    return doc.output("blob"); }
  return { run, build };
})();
