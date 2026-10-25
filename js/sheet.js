/* ---------- Sheet: an action as a picture on the clipboard, to paste into an email or Teams.
   An A4 landscape page drawn on a canvas at twice screen size. The full sheet (the ID box copy button) splits the page
   in thirds: problem and solution, every photo, then the action's status and other tabs. The simple sheet (the copy
   button by Photos) is the ID and title, the problem and solution side by side, and every photo filling the rest.
   Photos are whole, never cropped, as big as the space allows. ---------- */
const Sheet = (() => {
  const PW = 1123, PH = 794, K = 2, INK = "#1d2430", MUT = "#5d6875", DIM = "#7a8591", LINE = "#d9dee5", SLATE = "#475569";
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
  /* the MTO as a short summary: "24 m 100x100x5 SHS" */
  const mtoLine = it => { const q = String(it.qty || "").trim(), u = it.unit && it.unit !== "ea" ? " " + it.unit : q ? " x" : ""; return (q ? q + u + " " : "") + (it.z || (it.desc || "").split(",")[0] || "Item"); };
  /* the right third of the full sheet: a heading and lines per part that has something in it */
  function info(a){ const S = [], st = Store.stage(a.stage) || {}, tags = Array.isArray(a.f.equipment) ? a.f.equipment.filter(Boolean) : [], eta = Store.eta ? Store.eta(a) : "";
    S.push(["Status", [["Stage", st.name || ""], ["Owner", (a.owner || {}).n || ""], ["Tags", tags.join(", ")], ["Location", a.f.location || ""], ["Parts ETA", a.f.parts ? "Arrived" : eta === "TBC" ? "TBC" : eta ? fmtDate(eta) : ""]].filter(x => x[1])]);
    const mto = a.mto || []; if (mto.length) S.push(["MTO", (mto.length > 6 ? mto.slice(0, 5) : mto).map(mtoLine).concat(mto.length > 6 ? ["+" + (mto.length - 5) + " more"] : [])]);
    const rfq = a.rfq || []; if (rfq.length){ const v = rfq[rfq.length - 1]; S.push(["RFQ", ["Rev " + rfq.map(r => r.rev).join(", ") + (v.vendor ? ", to " + v.vendor : "")]]); }
    const sp = a.spares || []; if (sp.length) S.push(["Spares", sp.slice(0, 5).map(s => (s.z || s.desc || s.name || "Spare") + (s.secured ? ", secured" : "")).concat(sp.length > 5 ? ["+" + (sp.length - 5) + " more"] : [])]);
    const is = a.isol || []; if (is.length) S.push(["Isolations", is.slice(0, 5).map(x => [x.tag, x.n || x.desc].filter(Boolean).join(" ")).concat(is.length > 5 ? ["+" + (is.length - 5) + " more"] : [])]);
    return S; }
  async function draw(a, simple){ const c = document.createElement("canvas"); c.width = PW * K; c.height = PH * K; const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.textBaseline = "alphabetic"; const M = 30, st = Store.stage(a.stage) || {};
    const ps = (await Promise.all(a.photos.map(p => load(a, p)))).filter(Boolean);
    /* the heading: the ID, the title and (on the full sheet) the stage, a rule under it */
    g.fillStyle = simple ? INK : SLATE; g.font = font(21, "900"); const id = Store.actId(a); g.fillText(id, M * K, (M + 20) * K); const iw = g.measureText(id).width / K + 14;
    let tr = PW - M; if (!simple && st.name){ g.font = font(12, "bold"); const sw = g.measureText(st.name).width / K + 22; tr -= sw; g.strokeStyle = "#c3cad3"; g.lineWidth = K; g.strokeRect(tr * K, (M + 4) * K, sw * K, 22 * K); g.fillStyle = st.color || SLATE; g.fillRect(tr * K, (M + 4) * K, 4 * K, 22 * K); g.fillStyle = INK; g.fillText(st.name, (tr + 13) * K, (M + 19.5) * K); tr -= 12; }
    g.fillStyle = INK; g.font = font(20, "bold"); let ti = a.f.title || ""; while (ti && g.measureText(ti).width / K > tr - M - iw) ti = ti.slice(0, -2).trimEnd() + "…"; g.fillText(ti, (M + iw) * K, (M + 20) * K);
    g.fillStyle = simple ? INK : SLATE; g.fillRect(M * K, (M + 32) * K, (PW - 2 * M) * K, 2 * K); let y = M + 52;
    const text = (t, x, yy, w, bot) => { g.fillStyle = t ? INK : DIM; g.font = font(14); return wrap(g, t || "None yet", x, yy, w, 20, bot); };
    if (simple){ const cw = (PW - 2 * M - 24) / 2; label(g, "Problem", M, y); label(g, "Solution", M + cw + 24, y);
      const y1 = text(a.f.problem, M, y + 20, cw, PH * 0.45), y2 = text(a.f.solution, M + cw + 24, y + 20, cw, PH * 0.45); y = Math.max(y1, y2) + 6;
      photos(g, ps, M, y, PW - 2 * M, PH - M - y, 8); }
    else { const gap = 18, cw = (PW - 2 * M - 2 * gap) / 3, x2 = M + cw + gap, x3 = x2 + cw + gap, bot = PH - M - 16;
      g.fillStyle = LINE; g.fillRect((x2 - gap / 2) * K, y * K, K, (bot - y) * K); g.fillRect((x3 - gap / 2) * K, y * K, K, (bot - y) * K);
      label(g, "Problem", M, y + 4); let yy = text(a.f.problem, M, y + 24, cw, (y + bot) / 2 + 40) + 14; label(g, "Solution", M, yy); text(a.f.solution, M, yy + 20, cw, bot);
      label(g, "Photos (" + a.photos.length + ")", x2, y + 4); if (ps.length) photos(g, ps, x2, y + 14, cw, bot - y - 14, 6); else { g.fillStyle = DIM; g.font = font(13); g.fillText("No photos", x2 * K, (y + 26) * K); }
      yy = y + 4; info(a).forEach(([h, lines]) => { if (yy > bot - 30 || !lines.length) return; label(g, h, x3, yy); g.fillStyle = LINE; g.fillRect(x3 * K, (yy + 5) * K, cw * K, K); yy += 22;
        lines.forEach(l => { if (yy > bot - 4) return; g.font = font(12.5); if (Array.isArray(l)){ g.fillStyle = MUT; g.font = font(12.5, "bold"); g.fillText(l[0], x3 * K, yy * K); g.fillStyle = INK; g.font = font(12.5); yy = wrap(g, l[1], x3 + 74, yy, cw - 74, 17, bot); } else { g.fillStyle = INK; yy = wrap(g, "• " + l, x3, yy, cw, 17, bot); } }); yy += 10; });
      g.fillStyle = DIM; g.font = font(10); g.fillText("Copied from Action Database " + fmtDate(new Date().toISOString().slice(0, 10)), M * K, (PH - M + 2) * K); }
    return c; }
  /* put the sheet on the clipboard (the picture is still being drawn while the click counts, so the browser allows it) */
  async function copy(a, simple){ if (!a) return false; const blob = draw(a, simple).then(c => new Promise(res => c.toBlob(res, "image/png")));
    try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); return true; }
    catch (e){ console.warn("copy sheet", e); return false; } }
  return { draw, copy };
})();
