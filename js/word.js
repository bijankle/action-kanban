/* Export to Word: the same as the PDF export (the board of the stages, then each action's details, problem, solution
   and notes, its isolations, MTO and spares, attachment links and photos) as an editable .docx. Made with the docx
   library (js/lib/docx.min.js, loaded the first time it's needed). */
"use strict";
const Word = (() => {
  let libP = null;
  const lib = () => libP || (libP = new Promise((res, rej) => { const s = document.createElement("script"); s.src = "js/lib/docx.min.js"; s.onload = () => res(window.docx); s.onerror = () => { libP = null; rej(new Error("Couldn't load the Word maker")); }; document.head.appendChild(s); }));
  const hex = c => String(c || "#475569").replace("#", "").slice(0, 6).toUpperCase();
  /* a photo's bytes and size, scaled to fit w by h pixels */
  async function photo(url, w){ const r = await fetch(url); if (!r.ok) throw new Error(r.status); const buf = await r.arrayBuffer(), b = new Uint8Array(buf);
    const type = b[0] === 0x89 ? "png" : b[0] === 0x47 ? "gif" : "jpg";
    const im = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(new Blob([buf])); });
    const k = w / (im.naturalWidth || w); URL.revokeObjectURL(im.src); return { data: buf, type, transformation: { width: Math.round(w), height: Math.round((im.naturalHeight || w * .75) * k) } }; }
  async function run(list, o){ o = Object.assign({ photos: true, per: 2, board: true, newPage: true }, o || {}); note("Making the Word file…", 8000);
    const D = await lib(), { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, ImageRun, ExternalHyperlink, ShadingType, BorderStyle, PageBreak } = D;
    const th = hex(getComputedStyle(document.documentElement).getPropertyValue("--thb").trim() || "#475569");
    const P = (t, opt) => new Paragraph(Object.assign({ children: [new TextRun(Object.assign({ text: String(t == null ? "" : t) }, (opt || {}).run || {}))] }, (opt || {}).p || {}));
    const lines = t => String(t || "").split("\n").map(l => P(l, { p: { spacing: { after: 40 } } }));
    const H = (t, lvl) => new Paragraph({ heading: lvl || HeadingLevel.HEADING_3, spacing: { before: 200, after: 80 }, children: [new TextRun({ text: t })] });
    const cell = (t, head, w) => new TableCell({ width: w ? { size: w, type: WidthType.PERCENTAGE } : undefined, shading: head ? { type: ShadingType.CLEAR, fill: th, color: "auto" } : undefined,
      children: String(t == null ? "" : t).split("\n").map(l => P(l, { run: head ? { bold: true, color: "FFFFFF" } : {} })) });
    const table = (cols, rows) => { const keep = cols.map((c, k) => k === 0 || rows.some(r => String(r[k] == null ? "" : r[k]).trim())), f = r => r.filter((c, k) => keep[k]);
      return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ tableHeader: true, children: f(cols).map(c => cell(c, true)) })].concat(rows.map(r => new TableRow({ children: f(r).map(c => cell(c)) }))) }); };
    const projs = [...new Set(list.map(a => a._p))].map(p => (Store.project(p) || {}).name).join(", "), stamp = fmtDate(new Date().toISOString().slice(0, 10));
    const body = [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: "Action Database" })] }), P(projs + " · " + list.length + " action" + (list.length > 1 ? "s" : "") + " · Exported " + stamp + (Profile.name() ? " by " + Profile.name() : ""), { run: { color: "5D6875" } })];
    if (o.board){ Store.stages().filter(s => list.some(a => a.stage === s.id)).forEach(s => { body.push(H(Store.todo(s) + " (" + list.filter(a => a.stage === s.id).length + ")"));
      list.filter(a => a.stage === s.id).forEach(a => body.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: Store.actId(a) + "  ", bold: true }), new TextRun({ text: a.f.title || "" })].concat(Store.eta(a) ? [new TextRun({ text: "  ETA " + fmtDate(Store.eta(a)), color: "7A8591" })] : []) }))); }); }
    const skip = new Set(["title", "problem", "solution", "notes", "modified", "status"]), links = await Media.shareLinks(list);
    for (const [i, a] of list.entries()){ const s = Store.stage(a.stage);
      if (o.newPage || i === 0 && o.board) body.push(new Paragraph({ children: [new PageBreak()] }));
      body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 120, after: 60 }, children: [new TextRun({ text: Store.actId(a) + "  " }), new TextRun({ text: a.f.title || "" })] }), P(s.name, { run: { bold: true, color: hex(s.color) } }));
      if (Hold.lines(a).length) body.push(...Hold.lines(a).map(([k, v]) => new Paragraph({ shading: { type: ShadingType.CLEAR, fill: "FDF1D6" }, children: [new TextRun({ text: k + ": ", bold: true }), new TextRun({ text: String(v) })] })));
      const ticks = Store.fields().filter(f => f.type === "check" && a.f[f.id] === true).map(f => "✓ " + f.label);
      const notDone = o.blanks ? Store.fields().filter(f => f.type === "check" && a.f[f.id] !== true).map(f => a.f[f.id] === Flow.NA ? "– " + f.label + " (not needed)" : "☐ " + f.label) : [];
      const det = (ticks.length ? [["Done", ticks.join("   ")]] : []).concat(notDone.length ? [["Not done", notDone.join("   ")]] : [], Store.fields().filter(f => !skip.has(f.id) && f.type !== "check").map(f => [f.label, Fields.text(a, f)]).filter(([, v]) => { const t = String(v || "").trim(); return o.blanks || (t && !/^(none|–|-|0 items?)$/i.test(t)); }).map(([k, v]) => [k, String(v || "").trim() ? v : "–"]));
      if (det.length) body.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "DDE1E6" }, insideVertical: { style: BorderStyle.NONE } },
        rows: det.map(([k, v]) => new TableRow({ children: [new TableCell({ width: { size: 28, type: WidthType.PERCENTAGE }, children: [P(k, { run: { bold: true, color: "5D6875" } })] }), new TableCell({ width: { size: 72, type: WidthType.PERCENTAGE }, children: lines(v) })] })) }));
      [["Problem", a.f.problem], ["Solution", a.f.solution], ["Notes", a.f.notes]].filter(([, v]) => o.blanks || String(v || "").trim()).forEach(([k, v]) => body.push(H(k), ...lines(String(v || "").trim() ? v : "–")));
      const tb = (title, cols, rows) => { if (rows.length) body.push(H(title), table(cols, rows)); };
      tb("Isolations", ["#", "Equipment number", "Equipment name", "Note"], (a.isol || []).map((it, k) => [k + 1, it.tag, it.name, it.note]));
      /* the sketches, each as wide as the page, its number and name above it, just before the MTO */
      if ((a.sketches || []).length){ body.push(H("Sketches")); for (const [k, sk] of a.sketches.entries()){ try { const im = await photo(Sketch.src(a, sk), 640);
          body.push(new Paragraph({ children: [new TextRun({ text: (k + 1) + "  " + (sk.name || ""), bold: true, color: "5D6875", size: 18 })], shading: { type: ShadingType.CLEAR, fill: "F1F3F6" } }), new Paragraph({ children: [new ImageRun(im)] })); } catch (e){ console.warn("sketch", e); } } }
      tb("MTO", ["#", "Description", "Part / tag no.", "Qty", "Unit", "Notes"], Mto.orderRows(a).map((it, k) => [k + 1, it.desc, it.part, Mto.ord(it), it.unit, it.notes]));
      tb("From spares", ["#", "Description", "Part / tag no.", "Qty", "Unit", "Store location / notes", "Secured"], (a.spares || []).map((it, k) => [k + 1, it.desc, it.part, it.qty, it.unit, it.notes, it.secured ? "Yes" : ""]));
      if (a.files.length){ body.push(H("Attachments")); a.files.forEach(f => body.push(new Paragraph({ children: [new ExternalHyperlink({ link: links.get(f) || Media.fileUrlOnline(a, f), children: [new TextRun({ text: f.name, style: "Hyperlink" })] }), new TextRun({ text: "  " + fmtSize(f.size || 0), color: "7A8591" })] }))); }
      if (o.photos && a.photos.length){ body.push(H("Photos")); const per = Math.max(1, o.per || 2), w = (640 - (per - 1) * 8) / per, ims = [];
        for (const ph of a.photos){ try { ims.push(await photo(Media.src(a, ph), w)); } catch (e){ console.warn("photo", e); } }
        const rows = []; for (let k = 0; k < ims.length; k += per) rows.push(new TableRow({ children: Array.from({ length: per }, (_, n) => new TableCell({ width: { size: Math.floor(100 / per), type: WidthType.PERCENTAGE }, borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, children: [new Paragraph({ children: ims[k + n] ? [new ImageRun(ims[k + n])] : [] })] })) }));
        if (rows.length) body.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })); } }
    const doc = new Document({ creator: Profile.name() || "Action Database", title: "Action Database export", styles: { default: { document: { run: { font: "Calibri", size: 21 } } } },
      sections: [{ properties: { page: { margin: { top: 900, bottom: 900, left: 900, right: 900 } } }, children: body }] });
    const blob = await Packer.toBlob(doc), name = (list.length === 1 ? Store.actId(list[0]) : "Actions") + " " + new Date().toISOString().slice(0, 10) + ".docx";
    Excel.save(blob, name); note("Exported " + name); }
  return { run };
})();
