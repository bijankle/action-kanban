/* The work pack: one job as a PDF for whoever does the work. Only what they need, each part on its own page, in
   the order a job is read: a cover with who to contact and a contents list (each line jumps to its page), the job
   and scope (equipment, expected location, problem, work required), isolations, parts, the drawing and document
   register (SharePoint links and PDF copies), photos, attachments, then the drawings ticked on the Drawings tab,
   their own pages added at the back. Nothing about the tracker itself (project, stage, procurement). */
"use strict";
const Workpack = (() => {
  const toData = async url => { const r = await fetch(url); if (!r.ok) throw new Error(r.status); const b = await r.blob();
    return new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); }); };
  /* a photo cropped to fill a 4:3 tile (the thumbnail, else the full photo) */
  const thumb = (src, alt) => new Promise((res, rej) => { const i = new Image(); i.crossOrigin = "anonymous";
    i.onload = () => { const c = document.createElement("canvas"); c.width = 480; c.height = 360; const g = c.getContext("2d"), k = Math.max(480 / i.naturalWidth, 360 / i.naturalHeight), w = i.naturalWidth * k, h = i.naturalHeight * k;
      g.drawImage(i, (480 - w) / 2, (360 - h) / 2, w, h); try { res(c.toDataURL("image/jpeg", 0.82)); } catch (e){ rej(e); } };
    i.onerror = () => alt && alt !== src ? thumb(alt).then(res, rej) : rej(new Error("photo")); i.src = src; });
  const size = src => new Promise(res => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = () => res([4, 3]); i.src = src; });
  async function run(a){ if (!a) return; note("Making the work pack for " + Store.actId(a) + "…", 30000);
    try { const blob = await build(a); Excel.save(blob, Store.actId(a) + " Work pack.pdf"); note("Work pack downloaded"); }
    catch (e){ console.error(e); alert("Couldn't make the work pack: " + e.message); } }
  let libP = null;
  const pdfLib = () => libP || (libP = new Promise((res, rej) => { const s = document.createElement("script"); s.src = "js/lib/pdf-lib.min.js"; s.onload = () => res(PDFLib); s.onerror = () => { libP = null; rej(new Error("PDF joiner")); }; document.head.appendChild(s); }));
  async function build(a){ const jsPDF = await Parts.loadPdf(), doc = new jsPDF({ unit: "mm", format: "a4" });
    const W = 210, H = 297, M = 14, CW = W - 2 * M, BOT = 282;
    const thb = (getComputedStyle(document.documentElement).getPropertyValue("--thb") || "#475569").trim(), rgb = /^#[0-9a-f]{6}$/i.test(thb) ? [1, 3, 5].map(i => parseInt(thb.substr(i, 2), 16)) : [71, 85, 105];
    let y = 0; const need = n => { if (y + n > BOT){ doc.addPage(); y = 18; } };
    const head = t => { need(14); y += 4; doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(...rgb); doc.text(t.toUpperCase(), M, y); doc.setDrawColor(...rgb); doc.setLineWidth(0.4); doc.line(M, y + 1.5, W - M, y + 1.5); y += 7; doc.setTextColor(30); };
    const para = t => { doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(30); doc.splitTextToSize(t || "–", CW).forEach(l => { need(5.2); doc.text(l, M, y); y += 5; }); y += 2; };
    const table = (hd, body, cols) => { doc.autoTable({ startY: y, head: [hd], body, margin: { top: 16, left: M, right: M, bottom: 16 }, styles: { font: "helvetica", fontSize: 9, cellPadding: 1.8, lineColor: [217, 222, 229], lineWidth: 0.2, valign: "top" },
      headStyles: { fillColor: rgb, textColor: 255, fontStyle: "bold" }, alternateRowStyles: { fillColor: [246, 247, 249] }, columnStyles: cols || {} }); y = doc.lastAutoTable.finalY + 6; };
    /* what goes in: the equipment's documents, and the ticked drawings with their own pages (fetched first, to count them) */
    await Equip.load().catch(() => {});
    const tags = Array.isArray(a.f.equipment) ? a.f.equipment.filter(Boolean) : [];
    let dm = new Map(); if (tags.length && typeof Docs !== "undefined"){ try { await Docs.load(); dm = Drawings.collect(a); } catch (e){ console.warn("documents", e); } }
    const all = new Map(); dm.forEach(l => l.forEach(d => { if (!all.has(d.n)) all.set(d.n, d); }));
    const picks = [], miss = []; let L = null;
    for (const n of a.dwgPick || []){ const d = all.get(n); if (!d || !d.pdf){ miss.push(n); continue; }
      try { L = L || await pdfLib(); const r = await fetch(d.pdf.split("#")[0]); if (!r.ok) throw new Error(r.status); const src = await L.PDFDocument.load(await r.arrayBuffer(), { ignoreEncryption: true }); picks.push({ d, src, n: src.getPageCount() }); }
      catch (e){ console.warn("drawing", n, e); miss.push(n); } }
    /* the parts, in reading order; each one present gets a line in the contents and starts a page */
    const parts = (a.mto || []).map(it => Object.assign({ src: "New" }, it)).concat((a.spares || []).map(it => Object.assign({ src: "Site spares" }, it)));
    const S = [["job", "Job and scope", true], ["isol", "Isolations", (a.isol || []).length], ["parts", "Parts", parts.length], ["reg", "Drawings and documents", all.size], ["photos", "Photos (" + a.photos.length + ")", a.photos.length],
      ["att", "Attachments", a.files.length], ["dwg", "Attached drawings (" + picks.length + ")", picks.length]].filter(x => x[2]);
    /* cover: the job, who to contact, the contents */
    doc.setFillColor(...rgb); doc.rect(0, 0, W, 32, "F"); doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.text("WORK PACK", M, 9);
    doc.setFontSize(16); doc.splitTextToSize(a.f.title || "Work pack", CW - 46).slice(0, 2).forEach((l, i) => doc.text(l, M, 17.5 + i * 7));
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.text("Job ref", W - M, 9, { align: "right" }); doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text(Store.actId(a), W - M, 16, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text("Issued " + new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }), W - M, 22.5, { align: "right" });
    y = 41;
    const pf = Profile.get(), cl = Profile.lines(); if (Profile.name()){ const bh = 6 + cl.length * 5; doc.setFillColor(243, 244, 246); doc.setDrawColor(...rgb); doc.setLineWidth(0.6); doc.roundedRect(M, y, CW, bh, 2, 2, "F"); doc.line(M, y, M, y + bh);
      doc.setFontSize(8); doc.setTextColor(110); doc.setFont("helvetica", "bold"); doc.text("CONTACT FOR QUERIES", M + 4, y + 4.5); doc.setFontSize(10); doc.setTextColor(30);
      cl.forEach((l, i) => { doc.setFont("helvetica", i ? "normal" : "bold"); doc.text(l, M + 52, y + 4.6 + i * 5); });
      if (pf.email){ doc.link(M + 52, y + 1 + (cl.length - 1) * 5, CW - 52, 5, { url: "mailto:" + pf.email }); } y += bh + 6; }
    head("Contents"); const toc = [];   // { label, y, page, sub } — page filled in once known
    const tocLine = (label, sub) => { const h = sub ? 5.4 : 7.4; if (y + h > BOT) return null; const e = { label, y, sub, h }; toc.push(e); y += h; return e; };
    const tocE = {}; S.forEach(([id, t]) => { tocE[id] = tocLine(t); if (id === "dwg") picks.forEach(p => { p.toc = tocLine(p.d.n + "   " + (p.d.t || p.d.kind), true); }); });
    /* each part from a new page */
    const start = id => { doc.addPage(); y = 18; if (tocE[id]) tocE[id].page = doc.getNumberOfPages(); };
    const regLinks = [];   // register lines that jump to a drawing's own pages (added once those pages exist)
    const photoLinks = [];   // the photo panel beside the map: links to the Photos page (added once it exists)
    for (const [id] of S){ start(id);
      if (id === "job"){ head("Job"); const names = tags.map(t => { const e = Equip.get(t); return e && e.n ? t + "  " + e.n.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : t; });
        const job = [["Location", a.f.location], ["Equipment", names.join("\n")], ["Contractor", [a.f.contractor, a.f.contractorPhone].filter(x => x && x !== "TBC" && x !== "N/A").join(", ")]].filter(r => r[1]);
        if (job.length){ doc.autoTable({ startY: y, body: job, margin: { top: 16, left: M, right: M, bottom: 16 }, theme: "plain", styles: { font: "helvetica", fontSize: 10, cellPadding: 1.5 }, columnStyles: { 0: { cellWidth: 34, textColor: [90, 100, 112], fontStyle: "bold" } } }); y = doc.lastAutoTable.finalY + 4; }
        /* the expected location, with a few of the photos beside it (a link to the rest above them) */
        let sm = null; try { sm = await SiteMap.forAction(a); } catch (e){ console.warn("site map", e); }
        if (sm || a.photos.length){ head(sm ? "Expected location and photos" : "Photos"); const mw = sm ? 112 : 0, mh = sm ? mw * 9 / 16 : 0, gx = sm ? M + mw + 6 : M, gw = sm ? CW - mw - 6 : CW;
          need(Math.max(mh, 40) + 16); const top = y;
          if (sm) doc.addImage(sm.url, "JPEG", M, y, mw, mh, undefined, "FAST");
          if (a.photos.length){ const cols = sm ? 2 : 4, gap = 3, cw = (gw - gap * (cols - 1)) / cols, ch = cw * 3 / 4, max = cols * (sm ? Math.max(1, Math.floor((mh - 7 + gap) / (ch + gap))) : 1), shown = Math.min(a.photos.length, max);
            doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(31, 95, 191); const lbl = "Photos (" + a.photos.length + ")  ›  see page ";
            doc.text(lbl, gx, y + 3); photoLinks.push({ page: doc.getNumberOfPages(), x: gx, y: y - 1, w: gw, h: 5.5, tx: gx + doc.getTextWidth(lbl), ty: y + 3 });
            for (let i = 0; i < shown; i++){ const x = gx + (i % cols) * (cw + gap), yy = y + 6 + Math.floor(i / cols) * (ch + gap);
              try { doc.addImage(await thumb(Media.src(a, a.photos[i], true), Media.src(a, a.photos[i])), "JPEG", x, yy, cw, ch, undefined, "FAST"); } catch (e){ doc.setFillColor(235); doc.rect(x, yy, cw, ch, "F"); }
              if (i === shown - 1 && a.photos.length > shown){ doc.setFillColor(20, 24, 30); doc.setGState(new doc.GState({ opacity: 0.6 })); doc.rect(x, yy, cw, ch, "F"); doc.setGState(new doc.GState({ opacity: 1 }));
                doc.setTextColor(255); doc.setFontSize(12); doc.text("+" + (a.photos.length - shown) + " more", x + cw / 2, yy + ch / 2 + 1.5, { align: "center" }); }
              photoLinks.push({ page: doc.getNumberOfPages(), x, y: yy, w: cw, h: ch }); }
            doc.setFont("helvetica", "normal"); y = Math.max(y, y + 6 + Math.ceil(shown / cols) * (ch + gap)); }
          y = Math.max(y, top + mh) + 2;
          if (sm){ doc.setFontSize(8); doc.setTextColor(110); doc.setFont("helvetica", "italic"); doc.splitTextToSize(sm.note, CW).forEach(l => { doc.text(l, M, y + 2.5); y += 3.6; }); doc.setFont("helvetica", "normal"); }
          y += 5; }
        head("Problem"); para(a.f.problem); head("Work required"); para(a.f.solution); if (a.f.notes){ head("Notes"); para(a.f.notes); } }
      if (id === "isol"){ head("Isolations"); table(["No.", "Equipment number", "Equipment name", "Note"], a.isol.map((it, i) => [i + 1, it.tag || "", it.name || "", it.note || ""]), { 0: { cellWidth: 12, halign: "center" }, 1: { cellWidth: 40 }, 2: { cellWidth: 62 } }); }
      if (id === "parts"){ head("Parts"); table(["Item", "Description", "Part / tag no.", "Qty", "Unit", "Supplied from", "Notes"], parts.map((it, i) => [i + 1, it.desc || "", it.part || "", it.qty || "", it.unit || "", it.src, it.notes || ""]),
        { 0: { cellWidth: 11, halign: "center" }, 1: { cellWidth: 50 }, 3: { cellWidth: 12, halign: "right" }, 4: { cellWidth: 13 }, 5: { cellWidth: 22 } }); }
      if (id === "reg") register(doc, { head, need, M, CW, rgb, get y(){ return y; }, set y(v){ y = v; } }, tags, dm, picks, regLinks);
      if (id === "photos"){ head("Photos (" + a.photos.length + ")"); const gw = (CW - 6) / 2, gh = 66;
        for (let i = 0; i < a.photos.length; i += 2){ need(gh + 8); let rowH = 0;
          for (let k = 0; k < 2 && i + k < a.photos.length; k++){ const ph = a.photos[i + k]; try { const d = await toData(Media.src(a, ph)), [iw, ih] = await size(d);
              const sc2 = Math.min(gw / iw, gh / ih), w = iw * sc2, hh = ih * sc2, x = M + k * (gw + 6);
              doc.addImage(d, /png/i.test(d.slice(0, 30)) ? "PNG" : "JPEG", x, y, w, hh, undefined, "FAST"); rowH = Math.max(rowH, hh);
              if (ph.cap){ doc.setFontSize(7.5); doc.setTextColor(110); doc.text(doc.splitTextToSize(ph.cap, gw)[0] || "", M + k * (gw + 6), y + hh + 3.5); } } catch (e){ console.warn("photo", e); } }
          y += rowH + 8; } }
      if (id === "att"){ head("Attachments"); doc.setFontSize(9.5); a.files.forEach(f => { need(5.5); doc.setTextColor(31, 95, 191); doc.textWithLink(f.name, M, y, { url: Media.fileUrlOnline(a, f) }); doc.setTextColor(120); doc.text(fmtSize(f.size || 0), W - M, y, { align: "right" }); y += 5.5; }); y += 2; }
      if (id === "dwg"){ head("Attached drawings"); para("The drawings ticked for this job follow, each from the PDF copy. Check each revision against the controlled copy in SharePoint before use.");
        const at = y; doc.setFontSize(9.5); picks.forEach(p => { need(6); p.ly = y; p.lp = doc.getNumberOfPages(); doc.setTextColor(31, 95, 191); doc.setFont("helvetica", "bold"); doc.text(p.d.n, M, y); doc.setFont("helvetica", "normal"); doc.setTextColor(60);
          doc.text(doc.splitTextToSize((p.d.t || p.d.kind) + (p.d.pdfRev || p.d.rev ? "  (rev " + (p.d.pdfRev || p.d.rev) + ")" : ""), CW - 72)[0], M + 48, y); y += 6; });
        if (miss.length){ y += 3; para("Ticked but couldn't be added (no PDF copy, or it wouldn't load): " + miss.join(", ") + "."); } } }
    /* the photo panel's page number and links, now the Photos page exists */
    const php = tocE.photos && tocE.photos.page; photoLinks.forEach(l => { doc.setPage(l.page); if (!php) return; if (l.tx != null){ doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(31, 95, 191); doc.text(String(php), l.tx, l.ty); doc.setFont("helvetica", "normal"); } doc.link(l.x, l.y, l.w, l.h, { pageNumber: php }); });
    /* page numbers: the pack's own pages, then each attached drawing's */
    const P = doc.getNumberOfPages(); let at = P; picks.forEach(p => { p.page = at + 1; at += p.n; }); const N = at;
    doc.setPage(1); toc.forEach(e => { const pg = e.page || (picks.find(p => p.toc === e) || {}).page; if (!pg) return; const bl = e.y + (e.sub ? 3.6 : 4.8);
      doc.setFont("helvetica", e.sub ? "normal" : "bold"); doc.setFontSize(e.sub ? 9 : 10.5); doc.setTextColor(e.sub ? 70 : 30); const x = M + (e.sub ? 8 : 0), lab = doc.splitTextToSize(e.label, CW - 28 - (e.sub ? 8 : 0))[0];
      doc.text(lab, x, bl); doc.setTextColor(...rgb); doc.text(String(pg), W - M, bl, { align: "right" });
      doc.setDrawColor(200); doc.setLineDashPattern([0.4, 1], 0); doc.setLineWidth(0.25); doc.line(x + doc.getTextWidth(lab) + 2, bl, W - M - doc.getTextWidth(String(pg)) - 2, bl); doc.setLineDashPattern([], 0);
      if (!e.sub){ doc.setDrawColor(225); doc.setLineWidth(0.2); doc.line(M, e.y + e.h - 0.6, W - M, e.y + e.h - 0.6); }   // a rule between the parts
      if (pg <= P) doc.link(M, e.y, CW, e.h, { pageNumber: pg }); else e.to = pg; });
    for (let i = 1; i <= P; i++){ doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(140); doc.text("Job " + Store.actId(a) + " work pack" + (Profile.name() ? "   Queries: " + [Profile.name(), Profile.get().mobile, Profile.get().email].filter(Boolean).join(", ") : "") + "   Page " + i + " of " + N, W / 2, 291, { align: "center" });
      if (i > 1){ doc.setTextColor(31, 95, 191); doc.textWithLink("Contents", W - M, 291, { align: "right", pageNumber: 1 }); } }
    const blob = doc.output("blob"); if (!picks.length) return blob;
    /* the ticked drawings' own pages at the back, and the links that jump to them */
    const out = await L.PDFDocument.load(await blob.arrayBuffer()), k = 72 / 25.4;
    for (const p of picks){ const pages = await out.copyPages(p.src, p.src.getPageIndices()); pages.forEach(pg => out.addPage(pg)); }
    const pgs = out.getPages(), link = (on, x, y0, w, h, to) => { const ctx = out.context, an = ctx.obj({ Type: "Annot", Subtype: "Link", Rect: [x * k, (H - y0 - h) * k, (x + w) * k, (H - y0) * k], Border: [0, 0, 0], Dest: [pgs[to - 1].ref, "Fit"] }); pgs[on - 1].node.addAnnot(ctx.register(an)); };
    toc.forEach(e => { if (e.to) link(1, M, e.y, CW, e.h, e.to); });
    picks.forEach(p => { link(p.lp, M, p.ly - 4, CW, 6, p.page); });
    regLinks.forEach(r => { const p = picks.find(q => q.d.n === r.n); if (p) link(r.on, r.x, r.y, r.w, r.h, p.page); });
    return new Blob([await out.save()], { type: "application/pdf" }); }
  /* the register: one line per document, under a heading per equipment tag: kind, number (opens SharePoint), title, and
     a PDF badge linked to the copy; a ticked drawing says Attached and jumps to its pages at the back */
  function register(doc, P, tags, dm, picks, regLinks){ const body = [], meta = new Map(), on = new Set(picks.map(p => p.d.n));
    tags.forEach(t => { const ds = dm.get(t) || []; if (!ds.length) return; const e = Equip.get(t) || {}, nm = e.n ? "  " + e.n.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : "";
      body.push([{ content: t + nm + "   (" + ds.length + ")", colSpan: 5, styles: { fontStyle: "bold", fillColor: [234, 237, 241], textColor: 30 } }]);
      ds.forEach(d => { const r = [d.kind, d.n, (d.t || "") + (d.of !== t ? "  [" + d.of + "]" : ""), d.rev || "", ""]; meta.set(r, d); body.push(r); }); });
    P.head("Drawings and documents");
    doc.autoTable({ startY: P.y, head: [["Kind", "Number", "Title", "Rev", "Copy"]], body, margin: { top: 16, left: P.M, right: P.M, bottom: 16 },
      styles: { font: "helvetica", fontSize: 7.6, cellPadding: 1.4, lineColor: [217, 222, 229], lineWidth: 0.2, valign: "middle", overflow: "linebreak" },
      headStyles: { fillColor: P.rgb, textColor: 255, fontStyle: "bold", fontSize: 8.2 }, columnStyles: { 0: { cellWidth: 20, textColor: [90, 100, 112] }, 1: { cellWidth: 42, textColor: [31, 95, 191] }, 3: { cellWidth: 14 }, 4: { cellWidth: 17 } },
      didDrawCell: c => { if (c.section !== "body") return; const d = meta.get(c.row.raw); if (!d) return; const C = c.cell, pg = doc.getCurrentPageInfo().pageNumber;
        if (c.column.index === 1 && d.url) doc.link(C.x, C.y, C.width, C.height, { url: d.url });
        if (c.column.index === 4 && d.pdf){ const att = on.has(d.n), bw = att ? 14 : 7, bh = 3.4, bx = C.x + (C.width - bw) / 2, by = C.y + (C.height - bh) / 2; doc.setFillColor(...(att ? [31, 138, 88] : [200, 40, 30])); doc.roundedRect(bx, by, bw, bh, 0.8, 0.8, "F");
          doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(5.8); doc.text(att ? "ATTACHED" : "PDF", bx + bw / 2, by + bh / 2 + 0.75, { align: "center" }); doc.setFont("helvetica", "normal");
          if (att) regLinks.push({ n: d.n, on: pg, x: C.x, y: C.y, w: C.width, h: C.height }); else doc.link(C.x, C.y, C.width, C.height, { url: d.pdf }); } } });
    P.y = doc.lastAutoTable.finalY + 2.5; doc.setFontSize(7.8); doc.setTextColor(110); doc.setFont("helvetica", "italic");
    doc.splitTextToSize("Numbers open the controlled copy in SharePoint (needs a SharePoint login). The red PDF badge downloads a copy for anyone without SharePoint access; ATTACHED drawings are at the back of this pack. Check each revision against SharePoint before use. Sub equipment's documents are listed with their main equipment, its tag in brackets.", P.CW).forEach(l => { P.need(4); doc.text(l, P.M, P.y + 2); P.y += 3.6; });
    doc.setFont("helvetica", "normal"); P.y += 4; }
  return { run, build };
})();
