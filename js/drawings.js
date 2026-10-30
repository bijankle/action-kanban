/* The Drawings tab of an action (desktop): the drawings and documents of its equipment, sub equipment included (a
   ball mill's lube units, motors and fans). Two rows of pills narrow the list: the equipment (All or one tag), then the
   kind (All, P&ID, PFD, SLD, Schematic, Datasheet, IOM…). Each document is a line: its number and rev as one link that
   opens the controlled copy in SharePoint to view online, its title, ⓘ for where it comes from, and the download
   button for its PDF copy. A tick includes it in the work pack (a.dwgPick, the ticked numbers, kept with the action),
   and the box above the ticks ticks them all or clears them. Download ticked saves the ticked ones' PDF copies in one
   zip file, and says at the top which didn't download and why. */
"use strict";
const Drawings = (() => {
  const KORD = ["P&ID", "PFD", "SLD", "TLD", "Schematic", "Block diagram", "Datasheet", "IOM"];
  const GROUP = { "P&ID": "process", "PFD": "process", "SLD": "electrical", "TLD": "electrical", "Schematic": "electrical", "Block diagram": "electrical", "Datasheet": "docs", "IOM": "docs" };
  const st = new Map();   // per action: { eq, kind }
  const words = s => String(s || "").toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  const tagsOf = a => Array.isArray(a.f.equipment) ? [...new Set(a.f.equipment.filter(Boolean))] : [];
  /* a tag's sub equipment: same area, and a name that starts with the main one's (BALL MILL → BALL MILL LUBE UNIT), or the
     tag with a letter on the end (F13-MB-401A, its motor) */
  function family(tag){ const e = Equip.get(tag) || {}, nw = words(e.n), area = (tag.match(/^([A-Z]\d{2,3})-/) || [])[1], out = [tag];
    if (!area) return out; const strong = nw.length >= 2 || (nw.length === 1 && nw[0].length > 6), re = new RegExp("^" + tag.replace(/[-]/g, "\\-") + "[A-Z]$");
    Equip.list().forEach(x => { if (x.t === tag || !x.t.startsWith(area + "-") || out.length > 60) return;
      if (re.test(x.t) || (strong && nw.length && (w => w.length > nw.length && nw.every((v, i) => w[i] === v))(words(x.n)))) out.push(x.t); });
    return out; }
  /* every document for a listed tag, its sub equipment's merged in (each once), in kind order, the tag's own first */
  function listFor(tag){ const fam = family(tag), seen = new Map();
    fam.forEach((t, fi) => { const r = Docs.forTag(t); ["process", "electrical", "docs"].forEach(g => (r[g] || []).forEach(d => { if (seen.has(d.n)) return; seen.set(d.n, Object.assign({ of: t, own: fi === 0 }, d)); })); });
    return [...seen.values()].sort((x, y) => KORD.indexOf(x.kind) - KORD.indexOf(y.kind) || (y.own - x.own) || x.n.localeCompare(y.n)); }
  /* for the work pack and the tab: tag → its documents (after Docs.load and Equip.load) */
  function collect(a){ const m = new Map(); tagsOf(a).forEach(t => m.set(t, listFor(t))); return m; }
  const key = (t, d) => t + "|" + d.n;
  let cnt = new Map();   // documents per action, for the tab's count
  const count = a => cnt.get(a._p + ":" + a.u) || 0;
  function renderFor(el, a){ const tags = tagsOf(a);
    if (!tags.length){ el.innerHTML = '<div class="dw"><p class="dim">No equipment tags on this action.' + tipI("Add the equipment tags on the Overview (Equipment) and their drawings and documents show here.") + '</p></div>'; return; }
    el.innerHTML = '<div class="dw"><p class="dim">Finding the drawings and documents…</p></div>';
    Promise.all([Docs.load(), Equip.load().catch(() => {})]).then(() => { if (el.isConnected) draw(el, a); }).catch(e => { console.warn("documents", e); if (el.isConnected) el.innerHTML = '<div class="dw"><p class="dim">Couldn\'t load the drawing and document lists.</p></div>'; }); }
  function draw(el, a){ const ref = a._p + ":" + a.u, m = collect(a), s = st.get(ref) || { eq: "all", kind: "all" }; st.set(ref, s);
    const tags = [...m.keys()]; if (s.eq !== "all" && !m.has(s.eq)) s.eq = "all";
    const rows = []; tags.forEach(t => { if (s.eq === "all" || s.eq === t) m.get(t).forEach(d => rows.push([t, d])); });
    const total = new Set(), all = new Map(); m.forEach(l => l.forEach(d => { total.add(d.n); if (!all.has(d.n)) all.set(d.n, d); })); const had = cnt.get(ref); cnt.set(ref, total.size); if (had !== total.size) setTimeout(() => { const b = $('.av-tab[data-sub="drawings"]'); if (b) b.innerHTML = 'Drawings' + (total.size ? ' <b>' + total.size + '</b>' : ""); }, 0);
    const kinds = KORD.filter(k => rows.some(([, d]) => d.kind === k)); if (s.kind !== "all" && !kinds.includes(s.kind)) s.kind = "all";
    const shown = rows.filter(([, d]) => s.kind === "all" || d.kind === s.kind), seen = new Set(), list = shown.filter(([t, d]) => s.eq !== "all" || (!seen.has(d.n) && seen.add(d.n)));
    const anyOn = list.some(([, d]) => (a.dwgPick || []).includes(d.n));
    const pill = (k, v, label, n, on) => '<button type="button" class="pill' + (on ? " on" : "") + '" data-' + k + '="' + esc(v) + '">' + esc(label) + ' <b>' + n + '</b></button>';
    el.innerHTML = '<div class="dw"><div class="dw-p">' + pill("eq", "all", "All equipment", total.size, s.eq === "all") + tags.map(t => pill("eq", t, t, m.get(t).length, s.eq === t)).join("") + '</div>'
      + '<div class="dw-p dw-p2">' + pill("kind", "all", "All kinds", new Set(rows.map(([, d]) => d.n)).size, s.kind === "all") + kinds.map(k => pill("kind", k, k, new Set(rows.filter(([, d]) => d.kind === k).map(([, d]) => d.n)).size, s.kind === k)).join("") + '</div>'
      + (fails.get(ref) ? '<div class="dw-f"><div class="dw-fh"><b>' + fails.get(ref).length + ' of the ticked didn\'t download</b><button type="button" class="ic-b sm" data-k="fx" title="Dismiss">✕</button></div>' + fails.get(ref).map(f => '<div>' + (f.d.url ? '<a href="' + esc(f.d.url) + '" target="_blank" rel="noopener">' + esc(f.d.n) + '</a>' : esc(f.d.n)) + ': ' + esc(f.why) + '</div>').join("") + '</div>' : "")
      + ((a.dwgPick || []).length ? '<div class="dw-s"><button type="button" class="btn sm" data-k="dl">Download ticked (' + a.dwgPick.filter(n => (all.get(n) || {}).pdf).length + ')</button>' + tipI("Ticked documents go into the work pack's References table, each linked to its PDF copy.") + '</div>' : "")
      + (list.length ? table(list, a, anyOn) : '<p class="dim">No drawings or documents found' + (s.eq !== "all" ? " for " + esc(s.eq) : "") + '.</p>')
      + '</div>';
    $$("[data-eq]", el).forEach(b => b.onclick = () => { s.eq = b.dataset.eq; draw(el, a); });
    $$("[data-kind]", el).forEach(b => b.onclick = () => { s.kind = b.dataset.kind; draw(el, a); });
    const pick = (n, on) => Store.mutate("a:" + a._p, () => { const set = new Set(a.dwgPick || []); on ? set.add(n) : set.delete(n); a.dwgPick = [...set]; Store.touch(a); });
    $$(".dw-b .is-ck input", el).forEach(c => c.onchange = () => pick(c.dataset.n, c.checked));
    const dl = $("[data-k=dl]", el); if (dl) dl.onclick = () => download(el, a, all, dl);
    const fx = $("[data-k=fx]", el); if (fx) fx.onclick = () => { fails.delete(ref); draw(el, a); };
    /* the box above the ticks: clears the ones shown if any are ticked (ticks hidden by the filter stay), else ticks every one shown */
    const ta = $("[data-k=all]", el); if (ta) ta.onchange = () => Store.mutate("a:" + a._p, () => { a.dwgPick = anyOn ? (a.dwgPick || []).filter(n => !list.some(([, d]) => d.n === n)) : [...new Set((a.dwgPick || []).concat(list.map(([, d]) => d.n)))]; Store.touch(a); });
    $$(".dw-b", el).forEach(r => { const k = r.dataset.key, [t, d] = list.find(([t, d]) => key(t, d) === k) || [];
      $(".dw-i", r).onclick = e => { e.stopPropagation(); info(e.currentTarget, t, d); }; });
    const tb = $(".dw-tbl", el); if (tb) gridCols(tb, "dwg", { fixed: { c0: 52, "No.": 30, "(i)": 24, "PDF": 30, "Share": 30 } }); }
  /* one table, as Isolations: the ticked documents on top (numbered: they go into the work pack), then the rest as suggestions
     from the plant lists (a bulb), ticking one moves it up. Columns: Doc number, Title, Asset, (i), the PDF copy to download, SharePoint */
  const PAGE = '<svg class="is-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M9.5 12h6M9.5 15.5h6"/></svg>';
  const BULB = '<svg class="is-ic is-bulb" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M8.5 14.5a6 6 0 117 0c-.8.6-1.5 1.5-1.5 2.5h-4c0-1-.7-1.9-1.5-2.5z"/></svg>';
  function table(list, a, anyOn){ const ro = !Store.S.edit, pk = new Set(a.dwgPick || []), on = list.filter(([, d]) => pk.has(d.n)), off = list.filter(([, d]) => !pk.has(d.n));
    const head = '<thead><tr><th class="is-pk" data-col="c0">' + (ro ? "" : '<label class="ck is-ck" title="' + (anyOn ? "Untick all shown" : "Tick all shown") + '"><input type="checkbox" data-k="all"' + (anyOn ? " checked" : "") + ' aria-label="' + (anyOn ? "Untick all shown" : "Tick all shown") + '"></label>') + '</th><th class="pt-no" data-col="No.">#</th><th>Doc number</th><th>Title</th><th>Asset</th><th data-col="(i)"></th><th data-col="PDF" title="Download the PDF copy"></th><th data-col="Share" title="Open the controlled copy in SharePoint"></th></tr></thead>';
    return '<table class="tbl pt-tbl is-tbl dw-tbl">' + head + '<tbody>' + on.map(([t, d], i) => bar(t, d, a, i + 1)).join("")
      + (off.length ? '<tr class="is-sep nosort"><td colspan="8">Suggested from the plant lists' + tipI("The drawings and documents of this action's Tags and their sub equipment. Tick one to put it in the work pack.") + '</td></tr>' + off.map(([t, d]) => bar(t, d, a, 0)).join("") : "") + '</tbody></table>'; }
  /* a document's line: the tick, its number and rev as one link to SharePoint, its title, ⓘ, the sub equipment it's
     for (when not the tag itself), and the download button for the PDF copy */
  function bar(t, d, a, no){ const k = key(t, d), e = Equip.get(d.of) || {}, on = !!no, nr = esc(d.n + (d.rev ? "_" + d.rev : ""));
    return '<tr class="dw-b' + (on ? " pk" : " is-sr") + '" data-key="' + esc(k) + '"><td class="is-pk"><label class="ck is-ck" title="' + (on ? "In the work pack. Untick to take it out" : "Suggested. Tick to put it in the work pack") + '"><input type="checkbox" data-n="' + esc(d.n) + '"' + (on ? " checked" : "") + (Store.S.edit ? "" : " disabled") + ' aria-label="Include ' + esc(d.n) + ' in the work pack"></label>' + (on ? PAGE : BULB) + '</td>'
      + '<td class="pt-no">' + (no || "") + '</td><td>' + nr + '</td><td>' + esc(d.t || "") + '</td><td title="' + esc(e.n || "") + '">' + esc(d.of || t) + '</td>'
      + '<td class="dw-ic"><button type="button" class="dw-i" title="Where it comes from: which equipment it\'s for and why it\'s listed" aria-label="Where ' + esc(d.n) + ' comes from">' + INFO_I + '</button></td>'
      + '<td class="dw-ic">' + (d.pdf ? '<a class="dw-dl" href="' + esc(d.pdf.split("#")[0]) + '" target="_blank" rel="noopener" download title="Download the PDF copy' + (d.pdfRev ? ", rev " + esc(d.pdfRev) : "") + ' (no SharePoint needed)" aria-label="Download the PDF copy of ' + esc(d.n) + '">' + fileIco("PDF") + '</a>' : "") + '</td>'
      + '<td class="dw-ic">' + (d.url ? '<a class="dw-sp" href="' + esc(d.url) + '" target="_blank" rel="noopener" title="Open the controlled copy in SharePoint" aria-label="Open ' + esc(d.n) + ' in SharePoint">' + DLI + '</a>' : "") + '</td></tr>'; }
  /* the download button's symbol: a cloud with an arrow, SHARE in SharePoint teal underneath */
  const DLI = '<svg viewBox="0 0 24 26" aria-hidden="true"><path d="M7.2 14.5a3.6 3.6 0 01-.4-7.2 4.8 4.8 0 019.2-1.2 3.4 3.4 0 011.2 6.6 2.3 2.3 0 01-.8.1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 9V15.8M9.6 13.4L12 15.8l2.4-2.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><text class="fsp" x="12" y="24.5" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="6.4" letter-spacing=".1">SHARE</text></svg>';
  /* Download ticked: the ticked documents' PDF copies (number and title as each file's name) in one zip file named
     after the action; the ones that couldn't be had are listed at the top of the tab, with why and their SharePoint link */
  const fails = new Map();
  async function download(el, a, all, btn){ const ref = a._p + ":" + a.u, ns = a.dwgPick || [], bad = [], files = [];
    btn.disabled = true; const lbl = btn.textContent;
    for (const [i, n] of ns.entries()){ const d = all.get(n); btn.textContent = "Getting " + (i + 1) + " of " + ns.length + "…";
      if (!d){ bad.push({ d: { n }, why: "no longer listed for this equipment" }); continue; }
      if (!d.pdf){ bad.push({ d, why: "no PDF copy, open it in SharePoint" }); continue; }
      try { const r = await fetch(d.pdf.split("#")[0]); if (!r.ok) throw new Error(r.status === 404 ? "the PDF copy is missing" : "the copy didn't load (" + r.status + ")");
        const b = await r.blob(); if (!/pdf/i.test(b.type) && b.size < 2000) throw new Error("the copy isn't a PDF");
        files.push([(d.n + (d.rev ? "_" + d.rev : "") + (d.t ? " " + d.t : "")).replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) + ".pdf", new Uint8Array(await b.arrayBuffer())]); }
      catch (e){ bad.push({ d, why: /fetch|network/i.test(e.message) ? "no connection to the drawing copies" : e.message }); } }
    if (files.length) Excel.save(zip(files), Store.actId(a) + " drawings.zip");
    if (bad.length) fails.set(ref, bad); else fails.delete(ref);
    note(files.length + " in the zip" + (bad.length ? ", " + bad.length + " couldn't be added (listed at the top)" : ""), 5000); btn.textContent = lbl; btn.disabled = false; if (el.isConnected) draw(el, a); }
  /* a zip of [name, bytes] files, stored as they are (PDFs don't shrink further) */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++){ let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(files){ const enc = new TextEncoder(), parts = [], cen = []; let off = 0; const used = new Set();
    const le = (n, w) => { const a = new Uint8Array(w); for (let i = 0; i < w; i++) a[i] = (n >>> (8 * i)) & 255; return a; };
    files.forEach(([name, data]) => { let nm = name, k = 2; while (used.has(nm)) nm = name.replace(/\.pdf$/, "") + " (" + k++ + ").pdf"; used.add(nm);
      const nb = enc.encode(nm), c = crc32(data), head = [le(0x04034b50, 4), le(20, 2), le(0x0800, 2), le(0, 2), le(0, 4), le(c, 4), le(data.length, 4), le(data.length, 4), le(nb.length, 2), le(0, 2), nb];
      const hl = head.reduce((t, x) => t + x.length, 0); parts.push(...head, data);
      cen.push(le(0x02014b50, 4), le(20, 2), le(20, 2), le(0x0800, 2), le(0, 2), le(0, 4), le(c, 4), le(data.length, 4), le(data.length, 4), le(nb.length, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(off, 4), nb);
      off += hl + data.length; });
    const cl = cen.reduce((t, x) => t + x.length, 0);
    return new Blob([...parts, ...cen, le(0x06054b50, 4), le(0, 2), le(0, 2), le(files.length, 2), le(files.length, 2), le(cl, 4), le(off, 4), le(0, 2)], { type: "application/zip" }); }
  /* the ⓘ callout: the title, which equipment it's for and why it's listed */
  function info(btn, t, d){ Fields.closePop(); const e = Equip.get(d.of) || {}, why = { tag: "names the tag", parent: "is its main equipment's", model: "is for its model", package: "is from its supply package" }[d.why];
    const p = h('<div class="pop dw-pop"><b>' + esc(d.n) + '</b><div>' + esc(d.t || "No title in the register") + '</div><div class="dim">' + esc(d.kind) + (d.rev ? ", rev " + esc(d.rev) : "") + (d.pdfRev ? " (PDF copy rev " + esc(d.pdfRev) + ")" : "")
      + '</div><div class="dim">For ' + esc(d.of) + (e.n ? " " + esc(e.n.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())) : "") + (d.of !== t ? ", sub equipment of " + esc(t) : "") + (why ? "; it " + why : "") + (d.page ? "; the tag is on page " + d.page : "") + '</div></div>');
    document.body.appendChild(p); const r = btn.getBoundingClientRect(); p.style.left = Math.min(innerWidth - p.offsetWidth - 8, r.left) + "px"; p.style.top = (r.bottom + 6) + "px";
    setTimeout(() => document.addEventListener("mousedown", function off(ev){ if (!p.contains(ev.target)){ p.remove(); document.removeEventListener("mousedown", off); } }), 0); }
  return { renderFor, collect, count, GROUP };
})();
