/* ---------- Sheet: an action as a picture on the clipboard, to paste into an email or Teams, from the copy button by
   Photos: just what the problem is. An A4 landscape page drawn on a canvas at twice screen size, the ID and title, the
   problem and solution side by side, and every photo filling the rest, whole, never cropped, as big as the space
   allows. No status or work pack details: the PDF button is for those ---------- */
const Sheet = (() => {
  const PW = 1123, PH = 794, K = 2, INK = "#1d2430", MUT = "#5d6875", DIM = "#7a8591", LINE = "#d9dee5";
  const font = (px, w) => (w || "") + " " + px * K + "px Arial, Helvetica, sans-serif";
  /* text wrapped to a width, line by line; stops at the bottom with … */
  function wrap(g, t, x, y, w, lh, bot){ const out = []; String(t || "").split("\n").forEach(par => { let line = "";
      par.split(/\s+/).forEach(word => { const tryL = line ? line + " " + word : word; if (g.measureText(tryL).width > w * K && line){ out.push(line); line = word; } else line = tryL; }); out.push(line); });
    for (let i = 0; i < out.length; i++){ if (bot && y + lh > bot && i) return y; let l = out[i]; if (bot && y + 2 * lh > bot && i < out.length - 1) l = l.replace(/\s*\S*$/, "") + " …"; g.fillText(l, x * K, y * K); y += lh; if (bot && y + lh > bot && i < out.length - 1){ return y; } }
    return y; }
  const label = (g, t, x, y) => { g.fillStyle = MUT; g.font = font(10.5, "bold"); g.fillText(t.toUpperCase(), x * K, y * K); g.fillStyle = INK; };
  /* the photos, loaded full size (the thumbnail if that fails); each is [image, width, height] */
  const load = (a, p) => new Promise(res => { const i = new Image(); i.crossOrigin = "anonymous"; let alt = false;
    i.onload = () => res([i, i.naturalWidth, i.naturalHeight]); i.onerror = () => { if (alt) return res(null); alt = true; i.src = Media.src(a, p, true); }; i.src = Media.src(a, p); });
  /* every photo whole in rows that fill the box: try 1 to n rows and keep the one with the biggest photos */
  function photos(g, ps, X, Y, W, H, gap){ const n = ps.length; if (!n) return; let best = null;
    for (let r = 1; r <= n; r++){ const rows = []; let i = 0; for (let q = 0; q < r; q++){ const c = Math.round((n - i) / (r - q)); rows.push(ps.slice(i, i + c)); i += c; }
      const hs = rows.map(row => (W - gap * (row.length - 1)) / row.reduce((t, p) => t + p[1] / p[2], 0)), tot = hs.reduce((s, h) => s + h, 0) + gap * (r - 1), s = Math.min(1, (H - gap * (r - 1)) / (tot - gap * (r - 1)));
      const area = rows.reduce((t, row, q) => t + row.reduce((u, p) => u + (hs[q] * s) ** 2 * p[1] / p[2], 0), 0); if (!best || area > best.a) best = { a: area, rows, hs: hs.map(h => h * s) }; }
    let y = Y + (H - (best.hs.reduce((s, h) => s + h, 0) + gap * (best.rows.length - 1))) / 2;
    best.rows.forEach((row, q) => { const h = best.hs[q], rw = row.reduce((t, p) => t + h * p[1] / p[2], 0) + gap * (row.length - 1); let x = X + (W - rw) / 2;
      row.forEach(p => { const w = h * p[1] / p[2]; g.drawImage(p[0], x * K, y * K, w * K, h * K); g.strokeStyle = LINE; g.lineWidth = K; g.strokeRect(x * K, y * K, w * K, h * K); x += w + gap; }); y += h + gap; }); }
  async function draw(a){ const c = document.createElement("canvas"); c.width = PW * K; c.height = PH * K; const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.textBaseline = "alphabetic"; const M = 30;
    const ps = (await Promise.all(a.photos.map(p => load(a, p)))).filter(Boolean);
    /* the heading: the ID and the title, a rule under it */
    g.fillStyle = INK; g.font = font(21, "900"); const id = Store.actId(a); g.fillText(id, M * K, (M + 20) * K); const iw = g.measureText(id).width / K + 14;
    g.fillStyle = INK; g.font = font(20, "bold"); let ti = a.f.title || ""; while (ti && g.measureText(ti).width / K > PW - 2 * M - iw) ti = ti.slice(0, -2).trimEnd() + "…"; g.fillText(ti, (M + iw) * K, (M + 20) * K);
    g.fillStyle = INK; g.fillRect(M * K, (M + 32) * K, (PW - 2 * M) * K, 2 * K); let y = M + 52;
    const text = (t, x, yy, w, bot) => { g.fillStyle = t ? INK : DIM; g.font = font(14); return wrap(g, t || "None yet", x, yy, w, 20, bot); };
    const cw = (PW - 2 * M - 24) / 2; label(g, "Problem", M, y); label(g, "Solution", M + cw + 24, y);
    const y1 = text(a.f.problem, M, y + 20, cw, PH * 0.45), y2 = text(a.f.solution, M + cw + 24, y + 20, cw, PH * 0.45); y = Math.max(y1, y2) + 6;
    photos(g, ps, M, y, PW - 2 * M, PH - M - y, 8);
    return c; }
  /* put the sheet on the clipboard (the picture is still being drawn while the click counts, so the browser allows it) */
  async function copy(a){ if (!a) return false; const blob = draw(a).then(c => new Promise(res => c.toBlob(res, "image/png")));
    try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); return true; }
    catch (e){ console.warn("copy sheet", e); return false; } }
  return { draw, copy };
})();
