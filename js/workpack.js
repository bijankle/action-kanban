/* The workpack: one action as a PDF file, with its details, problem, solution, notes, photos, MTO, spare
   parts, RFQ revisions, quotes and attachments (the files themselves are linked, not embedded). */
"use strict";
const Workpack = (() => {
  const toData = async url => { const r = await fetch(url); if (!r.ok) throw new Error(r.status); const b = await r.blob();
    return new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); }); };
  const size = src => new Promise(res => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = () => res([4, 3]); i.src = src; });
  async function run(a){ if (!a) return; note("Making the workpack for " + Store.actId(a) + "…", 15000);
    try { const blob = await build(a); Excel.save(blob, Store.actId(a) + " Workpack.pdf"); note("Workpack downloaded"); }
    catch (e){ console.error(e); alert("Couldn't make the workpack: " + e.message); } }
  async function build(a){ const jsPDF = await Parts.loadPdf(), doc = new jsPDF({ unit: "mm", format: "a4" }), p = Store.project(a._p) || {}, s = Store.stage(a.stage);
    const W = 210, M = 14, CW = W - 2 * M, BOT = 282;
    const thb = (getComputedStyle(document.documentElement).getPropertyValue("--thb") || "#475569").trim(), rgb = /^#[0-9a-f]{6}$/i.test(thb) ? [1, 3, 5].map(i => parseInt(thb.substr(i, 2), 16)) : [71, 85, 105];
    const hex = c => /^#[0-9a-f]{6}$/i.test(c || "") ? [1, 3, 5].map(i => parseInt(c.substr(i, 2), 16)) : [100, 116, 139];
    let y = 0; const need = n => { if (y + n > BOT){ doc.addPage(); y = 18; } };
    const head = t => { need(14); y += 4; doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(...rgb); doc.text(t.toUpperCase(), M, y); doc.setDrawColor(...rgb); doc.setLineWidth(0.4); doc.line(M, y + 1.5, W - M, y + 1.5); y += 7; doc.setTextColor(30); };
    const para = (t, dim) => { doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(dim ? 140 : 30); const lines = doc.splitTextToSize(t || "–", CW);
      lines.forEach(l => { need(5.2); doc.text(l, M, y); y += 5; }); y += 2; };
    const table = (hd, body, cols) => { doc.autoTable({ startY: y, head: [hd], body, margin: { top: 16, left: M, right: M, bottom: 16 }, styles: { font: "helvetica", fontSize: 9, cellPadding: 1.8, lineColor: [217, 222, 229], lineWidth: 0.2, valign: "top" },
      headStyles: { fillColor: rgb, textColor: 255, fontStyle: "bold" }, alternateRowStyles: { fillColor: [246, 247, 249] }, columnStyles: cols || {} }); y = doc.lastAutoTable.finalY + 6; };
    /* title band */
    doc.setFillColor(...rgb); doc.rect(0, 0, W, 30, "F"); doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("WORKPACK", M, 9);
    doc.setFontSize(17); doc.text(Store.actId(a), M, 18); doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.text(p.name || "", M, 25);
    doc.setFontSize(9); doc.text("Printed " + new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) + (lsGet("adName", "") ? " by " + lsGet("adName", "") : ""), W - M, 9, { align: "right" });
    const sc = hex(s.color); doc.setFillColor(255); doc.roundedRect(W - M - 52, 14, 52, 9, 2, 2, "F"); doc.setFillColor(...sc); doc.circle(W - M - 47, 18.5, 1.6, "F"); doc.setTextColor(30); doc.setFont("helvetica", "bold"); doc.text(s.name, W - M - 43, 19.8);
    y = 40; doc.setTextColor(30); doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.splitTextToSize(a.f.title || "No title", CW).forEach(l => { doc.text(l, M, y); y += 6.5; }); y += 2;
    /* details */
    const skip = new Set(["title", "problem", "solution", "notes", "status"]);
    const det = Store.fields().filter(f => !skip.has(f.id)).map(f => [f.label, Fields.text(a, f) || "–"]);
    head("Details"); doc.autoTable({ startY: y, body: det, margin: { top: 16, left: M, right: M, bottom: 16 }, theme: "plain", styles: { font: "helvetica", fontSize: 9.5, cellPadding: 1.4 },
      columnStyles: { 0: { cellWidth: 52, textColor: [90, 100, 112], fontStyle: "bold" } }, didParseCell: d => { if (d.column.index === 1 && d.cell.raw === "TBC"){ d.cell.styles.textColor = [212, 42, 30]; d.cell.styles.fontStyle = "bold"; } } });
    y = doc.lastAutoTable.finalY + 4;
    head("Problem"); para(a.f.problem); head("Solution"); para(a.f.solution); if (a.f.notes){ head("Notes"); para(a.f.notes); }
    /* MTO and spares */
    const PCOLS = ["Item", "Description", "Part / tag no.", "Qty", "Unit"], pc = { 0: { cellWidth: 12, halign: "center" }, 1: { cellWidth: 58 }, 3: { cellWidth: 14, halign: "right" }, 4: { cellWidth: 15 } };
    const prow = (it, i) => [i + 1, it.desc || "", it.part || "", it.qty || "", it.unit || "", it.notes || ""];
    head("Isolations"); if ((a.isol || []).length) table(["No.", "Equipment number", "Equipment name", "Note"], a.isol.map((it, i) => [i + 1, it.tag || "", it.name || "", it.note || ""]), { 0: { cellWidth: 12, halign: "center" }, 1: { cellWidth: 40 }, 2: { cellWidth: 62 } }); else para("No isolations listed.", true);
    head("MTO"); if ((a.mto || []).length) table(PCOLS.concat("Notes"), a.mto.map(prow), pc); else para("No MTO items.", true);
    if ((a.rfq || []).length){ need(10); doc.setFontSize(9); doc.setTextColor(90); doc.setFont("helvetica", "bold"); doc.text("RFQ revisions", M, y); y += 5; doc.setFont("helvetica", "normal");
      a.rfq.slice().reverse().forEach(r => { need(5); doc.setTextColor(30); doc.text("Rev " + r.rev, M, y); doc.setTextColor(31, 95, 191); doc.textWithLink(r.name, M + 16, y, { url: GH.fileUrl(r.path) }); doc.setTextColor(120); doc.text(fmtDate(r.at) + (r.by ? ", " + r.by : "") + ", " + r.n + " items", W - M, y, { align: "right" }); y += 5; }); y += 2; }
    if ((a.quotes || []).length){ need(10); doc.setFontSize(9); doc.setTextColor(90); doc.setFont("helvetica", "bold"); doc.text("Quotes", M, y); y += 5; doc.setFont("helvetica", "normal");
      a.quotes.slice().reverse().forEach(f => { need(5); doc.setTextColor(31, 95, 191); doc.textWithLink(f.name, M, y, { url: Media.fileUrlOnline(a, f) }); doc.setTextColor(120); doc.text(fmtDate(f.added) + ", " + fmtSize(f.size || 0), W - M, y, { align: "right" }); y += 5; }); y += 2; }
    head("Spare parts"); if ((a.spares || []).length) table(PCOLS.concat("Store location / notes"), a.spares.map(prow), pc); else para("No spare parts.", true);
    if (a.files.length){ head("Attachments"); doc.setFontSize(9.5); a.files.forEach(f => { need(5.5); doc.setTextColor(31, 95, 191); doc.textWithLink(f.name, M, y, { url: Media.fileUrlOnline(a, f) }); doc.setTextColor(120); doc.text(fmtSize(f.size || 0), W - M, y, { align: "right" }); y += 5.5; }); y += 2; }
    /* photos, two to a row */
    if (a.photos.length){ head("Photos (" + a.photos.length + ")"); const gw = (CW - 6) / 2, gh = 66;
      for (let i = 0; i < a.photos.length; i += 2){ need(gh + 8); let rowH = 0;
        for (let k = 0; k < 2 && i + k < a.photos.length; k++){ const ph = a.photos[i + k]; try { const d = await toData(Media.src(a, ph)), [iw, ih] = await size(d);
            const sc2 = Math.min(gw / iw, gh / ih), w = iw * sc2, hh = ih * sc2, x = M + k * (gw + 6) + (gw - w) / 2;
            doc.addImage(d, /png/i.test(d.slice(0, 30)) ? "PNG" : "JPEG", x, y, w, hh, undefined, "FAST"); rowH = Math.max(rowH, hh);
            doc.setFontSize(7.5); doc.setTextColor(130); doc.text(doc.splitTextToSize(ph.name || "", gw)[0] || "", M + k * (gw + 6), y + hh + 3.5); } catch (e){ console.warn("photo", e); } }
        y += rowH + 8; } }
    const n = doc.getNumberOfPages(); for (let i = 1; i <= n; i++){ doc.setPage(i); doc.setFontSize(8); doc.setTextColor(140); doc.text(Store.actId(a) + " Workpack   Page " + i + " of " + n, W / 2, 291, { align: "center" }); }
    return doc.output("blob"); }
  return { run, build };
})();
