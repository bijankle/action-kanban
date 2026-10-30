/* Export to Excel (.xlsx, written here without any library). The Photos column is a link that opens
   the app on that action with its first photo full screen. */
"use strict";
const Excel = (() => {
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++){ let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  /* a zip with no compression ("stored"), which is all xlsx needs */
  function zip(files){ const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
    files.forEach(([name, text]) => { const n = enc.encode(name), d = enc.encode(text), c = crc(d);
      const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(8, 0, true); lh.setUint32(14, c, true); lh.setUint32(18, d.length, true); lh.setUint32(22, d.length, true); lh.setUint16(26, n.length, true);
      parts.push(new Uint8Array(lh.buffer), n, d);
      const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint32(16, c, true); ch.setUint32(20, d.length, true); ch.setUint32(24, d.length, true); ch.setUint16(28, n.length, true); ch.setUint32(42, off, true);
      cen.push(new Uint8Array(ch.buffer), n); off += 30 + n.length + d.length; });
    const cs = cen.reduce((s, x) => s + x.length, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cs, true); end.setUint32(16, off, true);
    return new Blob(parts.concat(cen, [new Uint8Array(end.buffer)]), { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }); }
  const x = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  const col = i => { let s = ""; i++; while (i){ const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; } return s; };
  function exportRows(list){ const fs = Store.fields(), base = GH.appUrl();
    const head = ["ID", "Project"].concat(fs.map(f => f.label), ["Photos", "Attachments", "Created"]);
    const rows = list.map(a => ["ID", "Project"].map((k, i) => i ? (Store.project(a._p) || {}).name : Store.actId(a))
      .concat(fs.map(f => f.type === "date" && /^\d{4}-/.test(Fields.val(a, f) || "") ? { d: Fields.val(a, f) } : f.type === "meta" && Fields.val(a, f) ? { d: isoDay(new Date(Fields.val(a, f))) } : Fields.text(a, f)),
        [a.photos.length ? { link: base + "?a=" + encodeURIComponent(a._p + ":" + a.no) + "&photo=1", text: "Photos (" + a.photos.length + ")" } : "", a.files.map(f => f.name).join("\n"), { d: isoDay(new Date(a.created)) }]));
    return book(head, rows, "Actions"); }
  /* one sheet workbook: head is the header row, rows hold strings, {d: "YYYY-MM-DD"} dates or {link, text} links */
  function book(head, rows, name){ name = String(name || "Sheet1").replace(/[\\/?*\[\]:]/g, " ").slice(0, 31);
    const cell = (v, r, c) => { const ref = col(c) + (r + 1);
      if (v && typeof v === "object" && v.link) return '<c r="' + ref + '" t="str" s="3"><f>HYPERLINK("' + x(v.link) + '","' + x(v.text) + '")</f><v>' + x(v.text) + '</v></c>';
      if (v && typeof v === "object" && v.d){ const days = (Date.parse(v.d + "T00:00:00Z") - Date.UTC(1899, 11, 30)) / 864e5; return '<c r="' + ref + '" s="4"><v>' + days + '</v></c>'; }
      return '<c r="' + ref + '" t="inlineStr" s="' + (r === 0 ? 1 : v === "TBC" ? 2 : 5) + '"><is><t xml:space="preserve">' + x(v) + '</t></is></c>'; };
    const all = [head].concat(rows), widths = head.map((hd, c) => Math.min(60, Math.max(8, ...all.map(r => String(r[c] && typeof r[c] === "object" ? r[c].text || r[c].d : r[c] || "").split("\n")[0].length)) + 2));
    const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>'
      + widths.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join("") + '</cols><sheetData>'
      + all.map((r, ri) => '<row r="' + (ri + 1) + '">' + r.map((v, ci) => cell(v, ri, ci)).join("") + '</row>').join("") + '</sheetData><autoFilter ref="A1:' + col(head.length - 1) + all.length + '"/></worksheet>';
    const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="d mmm yyyy"/></numFmts><fonts count="4"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FFC2412F"/><name val="Aptos"/></font><font><u/><sz val="11"/><color rgb="FF1F5FBF"/><name val="Aptos"/></font></fonts>'
      + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF475569"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs>'
      + '<cellXfs count="6"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf fontId="2" applyFont="1"/><xf fontId="3" applyFont="1"/><xf numFmtId="164" applyNumberFormat="1"/><xf applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs></styleSheet>';
    return zip([["[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
      ["_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ["xl/workbook.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + x(name) + '" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">\'' + x(name).replace(/'/g, "''") + '\'!$A$1:$' + col(head.length - 1) + '$' + all.length + '</definedName></definedNames></workbook>'],
      ["xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ["xl/worksheets/sheet1.xml", sheet], ["xl/styles.xml", styles]]); }
  function save(blob, fname){ const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = fname; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  function run(pick){ const list = Array.isArray(pick) ? pick : Table.rows(true); if (!list.length) return alert("No actions to export.");
    const b = exportRows(list), a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "Actions " + isoDay(new Date()) + ".xlsx"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    note("Exported " + list.length + " action" + (list.length === 1 ? "" : "s")); }
  /* ---------- reading an .xlsx (for importing the approved vendor list): every sheet as rows of cell values ---------- */
  async function read(file){ const buf = new Uint8Array(await file.arrayBuffer()), dv = new DataView(buf.buffer), files = {};
    let e = buf.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--; if (e < 0) throw new Error("That isn't an Excel (.xlsx) file.");
    let p = dv.getUint32(e + 16, true); const n = dv.getUint16(e + 10, true), dec = new TextDecoder();
    for (let i = 0; i < n; i++){ const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const name = dec.decode(buf.subarray(p + 46, p + 46 + nl)); const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), data = buf.subarray(start, start + size);
      files[name] = { method, data }; p += 46 + nl + xl + cl; }
    const text = async name => { const f = files[name]; if (!f) return ""; if (f.method === 0) return dec.decode(f.data);
      const ds = new Blob([f.data]).stream().pipeThrough(new DecompressionStream("deflate-raw")); return await new Response(ds).text(); };
    const X = s => new DOMParser().parseFromString(s, "application/xml");
    const ss = [...X(await text("xl/sharedStrings.xml")).getElementsByTagName("si")].map(si => [...si.getElementsByTagName("t")].map(t => t.textContent).join(""));
    const rels = {}; [...X(await text("xl/_rels/workbook.xml.rels")).getElementsByTagName("Relationship")].forEach(r => rels[r.getAttribute("Id")] = r.getAttribute("Target").replace(/^\/?(xl\/)?/, ""));
    const out = {}, colN = ref => { let c = 0; for (const ch of ref.replace(/\d+/g, "")) c = c * 26 + ch.charCodeAt(0) - 64; return c - 1; };
    for (const sh of X(await text("xl/workbook.xml")).getElementsByTagName("sheet")){ const rid = sh.getAttribute("r:id") || sh.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
      const doc = X(await text("xl/" + rels[rid])), rows = [];
      for (const row of doc.getElementsByTagName("row")){ const r = []; for (const c of row.getElementsByTagName("c")){ const t = c.getAttribute("t"), v = (c.getElementsByTagName("v")[0] || {}).textContent;
          r[colN(c.getAttribute("r"))] = t === "s" ? ss[+v] : t === "inlineStr" ? [...c.getElementsByTagName("t")].map(x => x.textContent).join("") : t === "str" || t === "b" ? v : v != null && v !== "" ? +v : ""; }
        rows[(+row.getAttribute("r") || rows.length + 1) - 1] = r; }
      out[sh.getAttribute("name")] = rows; }
    return out; }
  /* an Excel date (days since 1900) as YYYY-MM-DD */
  const xlDate = v => typeof v === "number" && v > 20000 ? new Date(Date.UTC(1899, 11, 30) + v * 864e5).toISOString().slice(0, 10) : String(v || "");
  return { run, exportRows, book, save, read, xlDate };
})();
