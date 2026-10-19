/* Where an action's equipment is expected to be, for the workpack: Project Library's Layout data (equipment
   positions on the plant, from the FIM 1 and FIM 2 layout drawings) and its site map image. A tag with a
   layout position is placed exactly; otherwise it's estimated from equipment on the same P&ID, a similar name,
   or the same plant area, and the workpack says which, with a note to check it on site. */
"use strict";
const SiteMap = (() => {
  const BASE = "https://raw.githubusercontent.com/bijankle/ProjectLibrary/HEAD/";
  const BOUNDS = { n: -30.7542, s: -30.7782, w: 121.4955, e: 121.5279 };   // map/site.webp, north up (as pfd-layout.js places it)
  let dataP = null, imgP = null;
  const src = f => (lsGet("adPlBase", "") || BASE) + f;
  const grab = (t, name) => { const i = t.indexOf("const " + name + " = "); if (i < 0) return null; const a = t.indexOf("=", i) + 1; let j = t.indexOf(";\nconst ", a); if (j < 0) j = t.lastIndexOf(";"); return JSON.parse(t.slice(a, j)); };
  /* tag → { ll, node, name } for every equipment item that has a layout position */
  function data(){ return dataP || (dataP = Promise.all([fetch(src("pfd-layout-data.js")).then(r => r.text()), fetch(src("pfd-equip.js")).then(r => r.text())]).then(([lt, et]) => {
      const L = grab(lt, "LAYOUT"), E = grab(et, "EQUIP_DATA"), at = new Map();
      Object.entries(E || {}).forEach(([node, d]) => { const p = (L.nodes || {})[node]; if (p && p.ll) (d.eq || []).forEach(x => at.set(x.tag, { ll: p.ll, node, est: !!p.est, name: x.n, pid: x.pid })); });
      return at; }).catch(e => { dataP = null; throw e; })); }
  /* the best position for the first of these tags that can be placed */
  async function locate(tags){ const at = await data(); await Equip.load(); tags = (tags || []).filter(Boolean); if (!tags.length) return null;
    const avg = list => { const n = list.length; return [list.reduce((s, x) => s + x.ll[0], 0) / n, list.reduce((s, x) => s + x.ll[1], 0) / n]; };
    const placed = [...at.entries()].map(([t, v]) => Object.assign({ t }, v));
    for (const t of tags){ const p = at.get(t); if (p) return { tag: t, ll: p.ll, how: p.est ? "its position on the Project Library layout, which is itself estimated" : "its position on the Project Library layout" }; }
    for (const t of tags){ const e = Equip.get(t) || {}, pid = e.p, area = (t.match(/^([A-Z]\d{2,3})-/) || [])[1], words = String(e.n || "").split(/\s+/).filter(w => w.length > 2).slice(0, 2).join(" ");
      const same = pid && placed.filter(x => x.pid === pid); if (same && same.length) return { tag: t, ll: avg(same), how: "equipment on the same P&ID (" + pid + ")" };
      const like = words && placed.filter(x => x.t.startsWith(area + "-") && String(x.name || "").toUpperCase().startsWith(words.toUpperCase())); if (like && like.length) return { tag: t, ll: avg(like), how: "equipment with a similar name in area " + area };
      const inArea = area && placed.filter(x => x.t.startsWith(area + "-")); if (inArea && inArea.length) return { tag: t, ll: avg(inArea), how: "the middle of plant area " + area + ", so it's only rough" }; }
    return null; }
  const img = () => imgP || (imgP = new Promise((res, rej) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => { imgP = null; rej(new Error("site map")); }; i.src = src("map/site.webp"); }));
  /* a picture of the site round the position, with a marker: returns a JPEG data URL (w:h is 16:9) */
  async function render(loc, w){ const im = await img(), W = w || 1200, H = Math.round(W * 9 / 16), c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
    const px = ((loc.ll[1] - BOUNDS.w) / (BOUNDS.e - BOUNDS.w)) * im.naturalWidth, py = ((BOUNDS.n - loc.ll[0]) / (BOUNDS.n - BOUNDS.s)) * im.naturalHeight;
    const sw = 420, sh = sw * H / W, sx = Math.max(0, Math.min(im.naturalWidth - sw, px - sw / 2)), sy = Math.max(0, Math.min(im.naturalHeight - sh, py - sh / 2));
    g.fillStyle = "#d9d4c7"; g.fillRect(0, 0, W, H); g.imageSmoothingQuality = "high"; g.drawImage(im, sx, sy, sw, sh, 0, 0, W, H);
    const k = W / sw, x = (px - sx) * k, y = (py - sy) * k, r = Math.max(14, 22 * W / 1200);
    g.lineWidth = r * 0.28; g.strokeStyle = "#fff"; g.beginPath(); g.arc(x, y, r * 1.9, 0, 7); g.stroke(); g.strokeStyle = "#d42a1e"; g.lineWidth = r * 0.18; g.beginPath(); g.arc(x, y, r * 1.9, 0, 7); g.stroke();
    g.fillStyle = "#d42a1e"; g.strokeStyle = "#fff"; g.lineWidth = r * 0.2; g.beginPath(); g.arc(x, y, r * 0.55, 0, 7); g.fill(); g.stroke();
    g.font = "bold " + Math.round(r * 1.05) + "px Arial"; const label = loc.tag, tw = g.measureText(label).width, lx = Math.min(W - tw - 16, x + r * 2.4), ly = Math.max(r * 1.6, y - r * 1.2);
    g.fillStyle = "rgba(255,255,255,.92)"; g.fillRect(lx - 8, ly - r * 1.1, tw + 16, r * 1.5); g.fillStyle = "#1d2430"; g.fillText(label, lx, ly);
    /* north arrow and a 50 m scale bar (1 px of the site map is about 1.05 m) */
    const mpp = ((BOUNDS.e - BOUNDS.w) * 111320 * Math.cos(loc.ll[0] * Math.PI / 180)) / im.naturalWidth, bar = 50 / mpp * k;
    g.fillStyle = "rgba(255,255,255,.9)"; g.fillRect(16, H - 46, bar + 20, 30); g.fillStyle = "#1d2430"; g.fillRect(26, H - 26, bar, 5); g.font = "bold " + Math.round(r * 0.75) + "px Arial"; g.fillText("50 m", 26, H - 32);
    g.fillStyle = "rgba(255,255,255,.9)"; g.beginPath(); g.arc(W - 36, 36, 22, 0, 7); g.fill(); g.fillStyle = "#1d2430"; g.beginPath(); g.moveTo(W - 36, 18); g.lineTo(W - 44, 42); g.lineTo(W - 36, 37); g.lineTo(W - 28, 42); g.closePath(); g.fill(); g.font = "bold 12px Arial"; g.fillText("N", W - 40, 54 > H ? 50 : 52);
    return c.toDataURL("image/jpeg", 0.85); }
  return { locate, render };
})();
