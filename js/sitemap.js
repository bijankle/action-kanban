/* Where an action's equipment is expected to be, for the action's Overview and its workpack: the plant layout
   data (equipment positions from the plant layout drawings) and the site map picture. A tag with a layout
   position is placed exactly. Sub equipment takes the position of the main equipment it belongs to, found by
   name (a ball mill lube unit sits where the ball mill is); failing that it's estimated from equipment on the
   same P&ID, or the middle of its plant area. Each placement says how it was made, with a note to check it. */
"use strict";
const SiteMap = (() => {
  const BASE = "https://raw.githubusercontent.com/bijankle/ProjectLibrary/HEAD/";   // where the plant layout data lives
  const BOUNDS = { n: -30.7542, s: -30.7782, w: 121.4955, e: 121.5279 };   // the site map picture, north up
  /* the whole site view: the plant area the user outlined on the 3101 px wide picture, and the box round it. Outside the
     outline is left plain so the ragged edges of the photo don't show */
  const POLY = [[884, 998], [1330, 820], [1645, 1024], [1849, 1209], [1849, 1451], [1432, 1893], [1392, 1882], [864, 1206], [848, 1140]];
  const VIEW = { x: 740, y: 805, w: 1125, h: 1125 };
  let dataP = null, imgP = null; const shots = new Map(), done = new Map();
  const src = f => (lsGet("adPlBase", "") || BASE) + f;
  const grab = (t, name) => { const i = t.indexOf("const " + name + " = "); if (i < 0) return null; const a = t.indexOf("=", i) + 1; let j = t.indexOf(";\nconst ", a); if (j < 0) j = t.lastIndexOf(";"); return JSON.parse(t.slice(a, j)); };
  /* tag → { ll, est, name, pid } for every equipment item with a layout position */
  function data(){ return dataP || (dataP = Promise.all([fetch(src("pfd-layout-data.js")).then(r => r.text()), fetch(src("pfd-equip.js")).then(r => r.text())]).then(([lt, et]) => {
      const L = grab(lt, "LAYOUT"), E = grab(et, "EQUIP_DATA"), at = new Map();
      Object.values(E || {}).forEach((d, i) => { const node = Object.keys(E)[i], p = (L.nodes || {})[node]; if (p && p.ll) (d.eq || []).forEach(x => at.set(x.tag, { ll: p.ll, est: !!p.est, name: String(x.n || "").toUpperCase(), pid: x.pid })); });
      return at; }).catch(e => { dataP = null; throw e; })); }
  const words = s => String(s || "").toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  /* one tag: its position and how it was found, or null */
  async function locate(tag){ const at = await data(); await Equip.load(); const p = at.get(tag);
    if (p) return { tag, ll: p.ll, how: p.est ? "its approximate layout position" : "its layout position" };
    const e = Equip.get(tag) || {}, nw = words(e.n), area = (tag.match(/^([A-Z]\d{2,3})-/) || [])[1];
    const placed = [...at.entries()].map(([t, v]) => Object.assign({ t }, v));
    /* the main equipment: the placed item whose name is the longest run of words this name starts with */
    let best = null; placed.forEach(x => { const xw = words(x.name); if (xw.length < 2 && !(xw.length === 1 && xw[0].length > 6)) return; if (xw.length > nw.length || !xw.every((w, i) => nw[i] === w)) return;
      const sc = xw.length * 10 + (area && x.t.startsWith(area + "-") ? 5 : 0); if (!best || sc > best.sc) best = { x, sc }; });
    if (best) return { tag, ll: best.x.ll, how: "the position of " + best.x.t + " " + best.x.name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) + ", the main equipment it belongs to" };
    const avg = list => [list.reduce((s, x) => s + x.ll[0], 0) / list.length, list.reduce((s, x) => s + x.ll[1], 0) / list.length];
    const same = e.p && placed.filter(x => x.pid === e.p); if (same && same.length) return { tag, ll: avg(same), how: "equipment on the same P&ID (" + e.p + ")" };
    const inArea = area && placed.filter(x => x.t.startsWith(area + "-")); if (inArea && inArea.length) return { tag, ll: avg(inArea), how: "the middle of plant area " + area + ", so it's only rough" };
    return null; }
  async function locateAll(tags){ const out = []; for (const t of [...new Set((tags || []).filter(Boolean))]){ const l = await locate(t).catch(() => null); if (l) out.push(l); } return out; }
  /* the tags an action is about: its equipment tags, else tags named in its isolations, title or problem */
  const tagsOf = a => { const eq = Array.isArray(a.f.equipment) ? a.f.equipment : []; if (eq.length) return eq;
    return [...new Set([].concat((a.isol || []).map(x => x.tag), String((a.f.title || "") + " " + (a.f.problem || "")).match(/\b[A-Z]\d{2,3}-[A-Z]{2,3}-\d{2,4}[A-Z]?\b/g) || []))].slice(0, 8); };
  const metres = (p, q) => { const dy = (p[0] - q[0]) * 111320, dx = (p[1] - q[1]) * 111320 * Math.cos(p[0] * Math.PI / 180); return Math.hypot(dx, dy); };
  /* the placements grouped: tags within 25 m of each other share one callout */
  function groups(locs){ const gs = []; locs.forEach(l => { const g = gs.find(g => metres(g.ll, l.ll) < 25); if (g){ g.tags.push(l.tag); } else gs.push({ ll: l.ll, tags: [l.tag] }); }); return gs; }
  const img = () => imgP || (imgP = new Promise((res, rej) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => { imgP = null; rej(new Error("site map")); }; i.src = src("map/site.webp"); }));
  /* a picture of the site showing every placement, with one callout per group: a JPEG data URL, 16:9 zoomed to the
     placements, or with whole set the whole site at its own shape, the same view every time */
  async function render(locs, w, whole){ const im = await img(), W = w || 1200, H = Math.round(whole ? W * VIEW.h / VIEW.w : W * 9 / 16), c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
    const gs = groups(locs), toPx = ll => [((ll[1] - BOUNDS.w) / (BOUNDS.e - BOUNDS.w)) * im.naturalWidth, ((BOUNDS.n - ll[0]) / (BOUNDS.n - BOUNDS.s)) * im.naturalHeight];
    const pts = gs.map(x => toPx(x.ll)), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    let sw = Math.max(420, (Math.max(...xs) - Math.min(...xs)) * 1.5 + 160), sh = sw * H / W; if ((Math.max(...ys) - Math.min(...ys)) * 1.5 + 140 > sh){ sh = (Math.max(...ys) - Math.min(...ys)) * 1.5 + 140; sw = sh * W / H; }
    sw = Math.min(sw, im.naturalWidth); sh = sw * H / W; const q = im.naturalWidth / 3101; if (whole){ sw = VIEW.w * q; sh = VIEW.h * q; }
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2, sx = whole ? VIEW.x * q : Math.max(0, Math.min(im.naturalWidth - sw, cx - sw / 2)), sy = whole ? VIEW.y * q : Math.max(0, Math.min(im.naturalHeight - sh, cy - sh / 2)), k = W / sw;
    g.fillStyle = whole ? "#ebe8e1" : "#d9d4c7"; g.fillRect(0, 0, W, H); g.imageSmoothingQuality = "high"; g.drawImage(im, sx, sy, sw, sh, 0, 0, W, H);
    if (whole){ const P = POLY.map(([px, py]) => [(px * q - sx) * k, (py * q - sy) * k]); g.beginPath(); g.rect(0, 0, W, H); P.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py)); g.closePath();
      g.fillStyle = "#ebe8e1"; g.fill("evenodd"); g.beginPath(); P.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py)); g.closePath(); g.strokeStyle = "rgba(29,36,48,.45)"; g.lineWidth = Math.max(1.5, W / 600); g.stroke(); }
    const r = Math.max(12, 20 * W / 1200) * (whole ? 2 : 1), fs = Math.round(r * 0.95);
    const boxes = [], hit = (b) => boxes.some(o => b.x < o.x + o.w + 6 && b.x + b.w + 6 > o.x && b.y < o.y + o.h + 6 && b.y + b.h + 6 > o.y);
    const r0 = r; pts.forEach(p => { const x = (p[0] - sx) * k, y = (p[1] - sy) * k; boxes.push({ x: x - r0 * 1.8, y: y - r0 * 1.8, w: r0 * 3.6, h: r0 * 3.6 }); });   // callouts keep clear of the markers too
    /* the whole site view with one spot: a small pin, and a square close up of it in the bottom left corner (outside the
       plant outline, so it hides nothing), joined to the pin by a line, with the tag in its top left corner */
    const mag = whole && gs.length === 1;
    if (mag){ const x = (pts[0][0] - sx) * k, y = (pts[0][1] - sy) * k, R = Math.round(W * 0.19), z = 3.5, rp = W / 130;
      const bx = R + 10, by = H - R - 10;
      const dx = bx - x, dy = by - y, d = Math.hypot(dx, dy) || 1, e = 1 - R / Math.max(Math.abs(dx), Math.abs(dy), R + 1);
      g.strokeStyle = "rgba(29,36,48,.7)"; g.lineWidth = Math.max(2, W / 400); g.beginPath(); g.moveTo(x + dx / d * rp * 2.6, y + dy / d * rp * 2.6); g.lineTo(x + dx * e, y + dy * e); g.stroke();
      const ss = 2 * R / k / z; g.fillStyle = "#d9d4c7"; g.fillRect(bx - R, by - R, 2 * R, 2 * R); g.drawImage(im, pts[0][0] - ss / 2, pts[0][1] - ss / 2, ss, ss, bx - R, by - R, 2 * R, 2 * R);
      g.lineWidth = rp * 1.1; g.strokeStyle = "#fff"; g.strokeRect(bx - R, by - R, 2 * R, 2 * R); g.lineWidth = rp * 0.5; g.strokeStyle = "#d42a1e"; g.strokeRect(bx - R, by - R, 2 * R, 2 * R);
      [[x, y, rp], [bx, by, rp * 1.15]].forEach(([px, py, pr]) => { g.lineWidth = pr * 0.6; g.strokeStyle = "#fff"; g.beginPath(); g.arc(px, py, pr * 2.2, 0, 7); g.stroke(); g.strokeStyle = "#d42a1e"; g.lineWidth = pr * 0.35; g.beginPath(); g.arc(px, py, pr * 2.2, 0, 7); g.stroke(); g.fillStyle = "#d42a1e"; g.strokeStyle = "#fff"; g.lineWidth = pr * 0.4; g.beginPath(); g.arc(px, py, pr, 0, 7); g.fill(); g.stroke(); });
      /* the tag in the top left corner, made smaller if it would run past the right edge */
      const t = gs[0].tags.length > 1 ? gs[0].tags[0] + " +" + (gs[0].tags.length - 1) : gs[0].tags[0], lx = bx - R + rp * 0.3, ly = by - R + rp * 0.3, room = 2 * R - rp * 0.6 - 12;
      let f2 = Math.round(W / 38); g.font = "bold " + f2 + "px Arial"; const w0 = g.measureText(t).width; if (w0 > room){ f2 = Math.max(9, Math.floor(f2 * room / w0)); g.font = "bold " + f2 + "px Arial"; }
      const tw = g.measureText(t).width, bh = f2 * 1.45; g.fillStyle = "#d42a1e"; g.fillRect(lx, ly, tw + 12, bh); g.fillStyle = "#fff"; g.fillText(t, lx + 6, ly + bh / 2 + f2 * 0.36); }
    (mag ? [] : gs).forEach((grp, gi) => { const x = (pts[gi][0] - sx) * k, y = (pts[gi][1] - sy) * k;
      g.lineWidth = r * 0.28; g.strokeStyle = "#fff"; g.beginPath(); g.arc(x, y, r * 1.6, 0, 7); g.stroke(); g.strokeStyle = "#d42a1e"; g.lineWidth = r * 0.16; g.beginPath(); g.arc(x, y, r * 1.6, 0, 7); g.stroke();
      g.fillStyle = "#d42a1e"; g.strokeStyle = "#fff"; g.lineWidth = r * 0.2; g.beginPath(); g.arc(x, y, r * 0.5, 0, 7); g.fill(); g.stroke();
      /* the callout: one line per tag (a few, then "+n more") */
      const lines = grp.tags.length > 5 ? grp.tags.slice(0, 4).concat("+" + (grp.tags.length - 4) + " more") : grp.tags; g.font = "bold " + fs + "px Arial";
      const tw = Math.max(...lines.map(t => g.measureText(t).width)), bh = lines.length * fs * 1.25 + fs * 0.5;
      /* the first spot (right, left, then further up or down) where the callout doesn't cover another one */
      let right = x + r * 2.2 + tw + 18 < W, bx = 0, by = 0; const tries = [];
      [0, -1, 1, -2, 2, -3, 3, -4, 4].forEach(d => [right, !right].forEach(rt => tries.push([rt, y - bh / 2 + d * (bh * 0.6 + 8)])));
      for (const [rt, ty] of tries){ const tx = rt ? x + r * 2.2 : x - r * 2.2 - tw - 16; if (tx < 2 || tx + tw + 16 > W - 2) continue; const b = { x: tx, y: Math.max(4, Math.min(H - bh - 4, ty)), w: tw + 16, h: bh }; if (!hit(b)){ right = rt; bx = b.x; by = b.y; break; } }
      if (!bx){ bx = right ? x + r * 2.2 : x - r * 2.2 - tw - 16; by = Math.max(4, Math.min(H - bh - 4, y - bh / 2)); } boxes.push({ x: bx, y: by, w: tw + 16, h: bh });
      g.strokeStyle = "rgba(29,36,48,.6)"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + (right ? r * 1.6 : -r * 1.6), y); g.lineTo(right ? bx : bx + tw + 16, by + bh / 2); g.stroke();
      g.fillStyle = "rgba(255,255,255,.94)"; g.fillRect(bx, by, tw + 16, bh); g.fillStyle = "#1d2430"; lines.forEach((t, i) => g.fillText(t, bx + 8, by + fs * 1.05 + i * fs * 1.25)); });
    /* north arrow, and a scale bar on the zoomed views (the site map is about 1 m a pixel) */
    const mpp = ((BOUNDS.e - BOUNDS.w) * 111320 * Math.cos(locs[0].ll[0] * Math.PI / 180)) / im.naturalWidth, m = sw * mpp > 900 ? 200 : sw * mpp > 450 ? 100 : 50, bar = m / mpp * k;
    if (!whole){ g.fillStyle = "rgba(255,255,255,.9)"; g.fillRect(16, H - 48, bar + 20, 32); g.fillStyle = "#1d2430"; g.fillRect(26, H - 26, bar, 5); g.font = "bold " + Math.round(Math.min(r, 24) * 0.8) + "px Arial"; g.fillText(m + " m", 26, H - 32); }
    g.fillStyle = "rgba(255,255,255,.9)"; g.beginPath(); g.arc(W - 36, 38, 24, 0, 7); g.fill(); g.fillStyle = "#1d2430"; g.beginPath(); g.moveTo(W - 36, 18); g.lineTo(W - 44, 42); g.lineTo(W - 36, 37); g.lineTo(W - 28, 42); g.closePath(); g.fill(); g.font = "bold 12px Arial"; g.fillText("N", W - 40, 56);
    return c.toDataURL("image/jpeg", 0.85); }
  /* the note under the map: how each tag was placed, and to check it */
  const note = locs => "Auto generated location, check it on site before relying on it. " + locs.map(l => l.tag + " is placed from " + l.how + ".").join(" ");
  /* for an action: { url, locs, note } (cached while its tags stay the same), or null if nothing can be placed */
  function forAction(a, whole){ const tags = tagsOf(a), key = tags.join("|") + (whole ? "|whole" : ""); if (!tags.length) return Promise.resolve(null);
    if (!shots.has(key)) shots.set(key, locateAll(tags).then(async locs => { const r = locs.length ? { url: await render(locs, 1200, whole), locs, note: note(locs) } : null; done.set(key, r); return r; }).catch(e => { shots.delete(key); throw e; }));
    return shots.get(key); }
  /* the picture already made for an action (undefined if not yet), so a redraw can show it straight away */
  const ready = (a, whole) => done.get(tagsOf(a).join("|") + (whole ? "|whole" : ""));
  return { locate, locateAll, render, forAction, ready, tagsOf, note };
})();
