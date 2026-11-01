/* A part's dimensions, for the (i) beside each Piping description: the card shows the description, a sketch of the part drawn to
   scale at its size with its dimensions lettered, and a table of the figures (from the standard or the maker's catalogue the spec
   names, or a fair stand-in, always with its source), then the designer's extras from the spec line (ends, type, material).
   The figures live in FITDIMS (js/fitdims-data.js): entries matched by class, item, ends and type, each a table by size. */
"use strict";
const FitDims = (() => {
  const DATA = () => (typeof FITDIMS !== "undefined" ? FITDIMS : []);
  /* steel pipe outside diameters (ASME B36.10 / B36.19), for drawing a part to scale */
  const OD = { 15: 21.3, 20: 26.7, 25: 33.4, 32: 42.2, 40: 48.3, 50: 60.3, 65: 73, 80: 88.9, 90: 101.6, 100: 114.3, 125: 141.3, 150: 168.3, 200: 219.1, 250: 273.1, 300: 323.9, 350: 355.6, 400: 406.4, 450: 457, 500: 508, 550: 559, 600: 610, 650: 660, 700: 711, 750: 762, 800: 813, 900: 914, 1000: 1016, 1050: 1067, 1200: 1219 };
  const odOf = (cl, n) => !n ? 0 : PipeSpec.U(cl) === "OD" ? +n : OD[n] || 0;
  const rx = s => { try { return s ? new RegExp(s, "i") : null; } catch (e) { return null; } };
  const specRows = r => (r.cl && r.dn && r.it ? (PipeSpec.resolve(r).rows || []) : []);
  const rowVal = (rows, k) => (rows.find(x => x[0] === k) || [])[1] || "";
  /* the entry for a row: its class (or any), its item, and its ends and type where the entry names them */
  function entryFor(r){ if (!r || !r.it) return null; const rows = specRows(r), it = String(r.it), ends = rowVal(rows, "Ends"), type = rowVal(rows, "Type");
    const ok = e => { const m = e.match || {}; if (m.classes && m.classes.length && !m.classes.includes(r.cl)) return false; const ri = rx(m.item); if (!ri || !ri.test(it)) return false;
      const re = rx(m.ends); if (re && ends && !re.test(ends)) return false; const rt = rx(m.type); if (rt && type && !rt.test(type)) return false; return true; };
    const all = DATA().filter(ok), has = e => e.table && sizeKeys(r).some(k => e.table[k]);   /* (the entry that has this size, its own class first) */
    return all.find(e => has(e) && (e.match.classes || []).length) || all.find(has) || all.find(e => (e.match.classes || []).length) || all[0] || null; }
  const sizeKeys = r => { const n = r.dn, n2 = r.dn2; return [n2 && n2 !== n ? n + "x" + n2 : null, n2 && n2 !== n ? n + " x " + n2 : null, String(n)].filter(Boolean); };
  function figures(r){ const e = entryFor(r); if (!e || !e.table) return { e, f: null }; const k = sizeKeys(r).find(x => e.table[x]); return { e, f: k ? e.table[k] : null, key: k }; }
  /* the key that plays a part in the sketch: a takeout named in the entry, else a key whose meaning says it */
  const keyBy = (e, role, re) => { const t = e.takeout || {}; if (t[role] && e.keys && e.keys[t[role]]) return t[role]; return Object.keys(e.keys || {}).find(k => re.test(e.keys[k])) || null; };
  /* ---------- the sketch, to scale, fitted into a 200 by 170 box ---------- */
  function sketch(e, f, r){ if (!e || !f) return ""; const shape = e.shape || "other", od = odOf(r.cl, r.dn) || 30, num = k => k && f[k] != null && isFinite(+f[k]) ? +f[k] : null;
    const W = 200, H = 170, P = 30;
    const g = [], dimc = 'stroke="var(--muted)" stroke-width="1"', wall = 'fill="none" stroke="var(--ink)" stroke-width="1.8"', cl = 'stroke="var(--line2)" stroke-width="1" stroke-dasharray="7 3 1 3"';
    let bb = null, sc = 1, ox = 0, oy = 0; const T = p => [P + (p[0] - bb[0]) * sc + ox, P + (p[1] - bb[1]) * sc + oy];
    const fit = (x0, y0, x1, y1) => { bb = [x0, y0]; sc = Math.min((W - 2 * P) / Math.max(1, x1 - x0), (H - 2 * P) / Math.max(1, y1 - y0)); ox = (W - 2 * P - (x1 - x0) * sc) / 2; oy = (H - 2 * P - (y1 - y0) * sc) / 2; };
    const f1 = v => Math.round(v * 10) / 10, L = (a, b, st) => { const p = T(a), q = T(b); return '<path d="M' + f1(p[0]) + " " + f1(p[1]) + " L" + f1(q[0]) + " " + f1(q[1]) + '" ' + st + "/>"; };
    const poly = (ps, st) => '<path d="M' + ps.map(T).map(q => f1(q[0]) + " " + f1(q[1])).join(" L") + '" ' + st + "/>";
    const lab = (p, t, anc) => { const q = T(p); return '<text x="' + f1(q[0]) + '" y="' + f1(q[1]) + '" text-anchor="' + (anc || "middle") + '" class="fd-l">' + esc(t) + "</text>"; };
    /* a dimension between two points, set off by o (in drawing units, sideways), with its letter */
    const dim = (a, b, o, t) => { const dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1, n = [-dy / m * o, dx / m * o], a2 = [a[0] + n[0], a[1] + n[1]], b2 = [b[0] + n[0], b[1] + n[1]], s = 3 / sc, u = [n[0] / Math.abs(o), n[1] / Math.abs(o)];
      return L(a, [a2[0] + u[0] * s, a2[1] + u[1] * s], dimc) + L(b, [b2[0] + u[0] * s, b2[1] + u[1] * s], dimc) + L(a2, b2, dimc) + [a2, b2].map(q => L([q[0] - s, q[1] + s], [q[0] + s, q[1] - s], dimc)).join("") + lab([(a2[0] + b2[0]) / 2 + u[0] * 9 / sc, (a2[1] + b2[1]) / 2 + u[1] * 9 / sc + 4 / sc], t); };
    const h = od / 2, kA = keyBy(e, "run", /centre to (end|face)|center to (end|face)|centre.to|takeout/i), kM = keyBy(e, "branch", /outlet|branch/i), kH = keyBy(e, "small", /end to end|length|overall|face to face/i), kD = Object.keys(e.keys || {}).find(k => /outside diameter|^od\b|flange od/i.test(e.keys[k]));
    const kIn = Object.keys(e.keys || {}).find(k => /insert|socket depth|goes in|spigot/i.test(e.keys[k]));
    if (/^elbow/.test(shape)){ const A = num(kA) || od * 1.5, ang = shape === "elbow45" ? 45 : 90, R = Math.max(h * 1.2, Math.min(A, ang === 90 ? A * 0.72 : A * 1.6));
      if (ang === 90){ fit(-h - 20, -h - 20, A + 24, A + 4); const arc = (rr, s) => { const out = []; for (let i = 0; i <= 12; i++){ const t = Math.PI / 2 * i / 12; out.push([R - Math.cos(t) * rr * s, R - Math.sin(t) * rr]); } return out; };
        const outer = [[-h, A]].concat(Array.from({ length: 13 }, (_, i) => { const t = Math.PI / 2 * i / 12; return [R - (R + h) * Math.cos(t), R - (R + h) * Math.sin(t)]; })).concat([[A, -h]]);
        const inner = [[h, A]].concat(Array.from({ length: 13 }, (_, i) => { const t = Math.PI / 2 * i / 12; return [R - (R - h) * Math.cos(t), R - (R - h) * Math.sin(t)]; })).concat([[A, h]]);
        g.push(poly(outer, wall), poly(inner, wall), L([-h, A], [h, A], wall), L([A, -h], [A, h], wall), L([0, 0], [0, A + 6], cl), L([0, 0], [A + 6, 0], cl));
        const In = num(kIn); if (In) g.push(L([-h - 2, A - In], [h + 2, A - In], 'stroke="var(--ink)" stroke-width="1.2"'), L([A - In, -h - 2], [A - In, h + 2], 'stroke="var(--ink)" stroke-width="1.2"'), dim([A - In, h], [A, h], 12 / sc, kIn));
        g.push(dim([0, 0], [A, 0], -(h + 12 / sc), kA || "A"), dim([0, 0], [0, A], h + 12 / sc, kA || "A"));
        if (kD) g.push(dim([A, -h], [A, h], -10 / sc, kD)); }
      else { const c = Math.cos(Math.PI / 4), s = Math.sin(Math.PI / 4), e2 = [A * c, A * s]; fit(-A - 10, -h - 22, A * c + h + 10, A * s + h + 10);
        g.push(L([-A, -h], [0, -h], wall), L([-A, h], [0, h], wall), L([0, -h], [e2[0] + s * h, e2[1] - c * h], wall), L([0, h], [e2[0] - s * h, e2[1] + c * h], wall), L([-A, -h], [-A, h], wall), L([e2[0] + s * h, e2[1] - c * h], [e2[0] - s * h, e2[1] + c * h], wall), L([-A - 6, 0], [0, 0], cl), L([0, 0], [e2[0] + 6 * c, e2[1] + 6 * s], cl), dim([-A, 0], [0, 0], -(h + 12 / sc), kA || "A")); } }
    else if (/^tee/.test(shape)){ const C = num(kA) || od * 1.3, M = num(kM) || C, hb = shape === "tee_red" && r.dn2 ? (odOf(r.cl, r.dn2) || od) / 2 : h; fit(-C - 4, -M - 16, C + 4, h + 26);
      g.push(L([-C, h], [C, h], wall), L([-C, -h], [-hb, -h], wall), L([hb, -h], [C, -h], wall), L([-hb, -h], [-hb, -M], wall), L([hb, -h], [hb, -M], wall), L([-C, -h], [-C, h], wall), L([C, -h], [C, h], wall), L([-hb, -M], [hb, -M], wall), L([-C - 6, 0], [C + 6, 0], cl), L([0, 0], [0, -M - 6], cl),
        dim([-C, 0], [0, 0], -(h + 12 / sc), kA || "C"), dim([0, 0], [0, -M], -(hb + 14 / sc), kM || "M")); }
    else if (/^reducer/.test(shape)){ const H2 = num(kH) || od * 1.5, h2 = r.dn2 ? (odOf(r.cl, r.dn2) || od * 0.6) / 2 : h * 0.6, ecc = shape === "reducer_ecc", L1 = H2 * 0.25; fit(-4, -h - 20, H2 + 4, h + 8);
      const yb = ecc ? -h + 2 * h2 : h2, yt = ecc ? -h : -h2; g.push(poly([[0, -h], [L1, -h], [H2 - L1, yt], [H2, yt], [H2, yb], [H2 - L1, yb], [L1, h], [0, h], [0, -h]], wall), L([-6, 0], [H2 + 6, ecc ? (yt + yb) / 2 : 0], cl), dim([0, -h], [H2, yt], -14 / sc, kH || "H")); }
    else if (shape === "cap"){ const E = num(kA) || num(kH) || od * 0.8; fit(-4, -h - 20, E + 6, h + 6); g.push(poly([[0, -h], [E * 0.65, -h]].concat(Array.from({ length: 11 }, (_, i) => { const t = Math.PI * i / 10; return [E * 0.65 + E * 0.35 * Math.sin(t), -h * Math.cos(t)]; })).concat([[0, h]]), wall), L([0, -h], [0, h], wall), dim([0, -h], [E, -h], -12 / sc, kA || kH || "E")); }
    else if (/^flange/.test(shape) || shape === "stub_backing"){ const D = num(kD) || od * 2, t = num(Object.keys(e.keys || {}).find(k => /thick/i.test(e.keys[k]))) || D * 0.12, Lh = shape === "flange_wn" ? (num(Object.keys(e.keys || {}).find(k => /length|hub/i.test(e.keys[k]))) || t * 3) : t, d = D / 2;
      fit(-6, -d - 8, Lh + od * 0.6, d + 22); g.push(poly([[0, -d], [t, -d], [t, -h - (Lh > t ? h * 0.3 : 0)], [Lh, -h], [Lh, h], [t, h + (Lh > t ? h * 0.3 : 0)], [t, d], [0, d], [0, -d]], wall));
      if (shape !== "flange_blind") g.push(L([t, -h], [Lh + od * 0.5, -h], 'stroke="var(--line2)" stroke-width="1"'), L([t, h], [Lh + od * 0.5, h], 'stroke="var(--line2)" stroke-width="1"'));
      g.push(L([-6, 0], [Lh + od * 0.5, 0], cl), dim([0, -d], [0, d], -12 / sc, kD || "D"), dim([0, d], [Lh, d], 12 / sc, Object.keys(e.keys || {}).find(k => /thick|length|hub/i.test(e.keys[k])) || "T")); }
    else if (shape === "valve"){ const F = num(kH) || num(Object.keys(e.keys || {})[0]) || od * 3, d = Math.max(h * 1.6, F * 0.32); fit(-4, -d - 22, F + 4, d + 8);
      g.push(L([0, -d], [0, d], wall), L([F, -d], [F, d], wall), poly([[0, -d * 0.7], [F, d * 0.7], [F, -d * 0.7], [0, d * 0.7], [0, -d * 0.7]], wall), L([F / 2, -d * 0.1], [F / 2, -d - 10 / sc], wall), L([F / 2 - d * 0.5, -d - 10 / sc], [F / 2 + d * 0.5, -d - 10 / sc], wall), dim([0, d], [F, d], 12 / sc, kH || Object.keys(e.keys || {})[0] || "L")); }
    else { const Lx = num(kH) || num(kA) || od * 1.4; fit(-4, -h - 22, Lx + 4, h + 6); g.push(poly([[0, -h], [Lx, -h], [Lx, h], [0, h], [0, -h]], wall), L([-6, 0], [Lx + 6, 0], cl), dim([0, -h], [Lx, -h], -12 / sc, kH || kA || "L")); }
    return '<svg class="fd-sk" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" aria-label="' + esc(shape) + ' to scale with its dimensions">' + g.join("") + "</svg>"; }
  /* ---------- the card ---------- */
  const EXTRA = ["Ends", "Type", "Material", "Standard", "Finish", "Body", "Seats", "Made by", "Valve datasheet", "To suit", "Thickness"];
  function card(r, anchor, txt){ $$(".fd-card").forEach(x => x.remove()); const rows = specRows(r), { e, f } = figures(r), sz = r.cl && r.dn ? PipeSpec.lab(r.cl, r.dn) + (r.dn2 && r.dn2 !== r.dn ? " x " + PipeSpec.lab(r.cl, r.dn2) : "") : "";
    const tr = (k, a, b, n) => "<tr><th>" + esc(k) + "</th><td" + (n ? "" : ' colspan="2"') + ">" + esc(a) + "</td>" + (n ? '<td class="fd-n">' + esc(b) + "</td>" : "") + "</tr>";
    let t = ""; if (e && f) Object.keys(e.keys || {}).forEach(k => { if (f[k] == null || f[k] === "") return; t += tr(k, String(e.keys[k]).split(/\s*\(/)[0].replace(/^./, c => c.toUpperCase()), String(f[k]) + (isFinite(+f[k]) ? " mm" : ""), true); });
    if (e && f && e.minPipe && typeof e.minPipe !== "object") t += tr("Min", "Pipe between two joints", String(e.minPipe), true); else if (e && f && e.minPipe && e.minPipe[String(r.dn)] != null) t += tr("Min", "Pipe between two joints", e.minPipe[String(r.dn)] + " mm", true);
    rows.filter(x => EXTRA.includes(x[0]) && x[1]).forEach(x => { t += tr(x[0], x[1]); });
    const src = e && f ? "From " + [e.source && e.source.title, e.source && e.source.edition].filter(Boolean).join(", ") + (e.confidence === "low" ? ". Check against the maker's drawing" : "") : "Dimensions for this part at " + (sz || "this size") + " aren't on file yet";
    const more = e && f ? [e.source && e.source.publisher, e.source && e.source.url, e.alt ? "Stand in: " + e.alt : "", e.note || ""].filter(Boolean).join(". ") : "";
    const d = h('<div class="fd-card" role="dialog" aria-label="About this part"><button type="button" class="ic-b sm fd-x" aria-label="Close">✕</button>' + (e && f ? sketch(e, f, r) : "") + '<div class="fd-r"><div class="fd-d">' + esc(txt || "") + "</div>" + (t ? '<table class="fd-t">' + t + "</table>" : "") + '<div class="fd-s">' + esc(src) + (more ? ' <button type="button" class="fd-m">more…</button><span class="fd-mt" hidden>' + esc(more) + "</span>" : "") + "</div></div></div>");
    if (!(e && f)) d.classList.add("fd-1"); document.body.appendChild(d);
    const b = anchor.getBoundingClientRect(), w = d.offsetWidth, hh = d.offsetHeight, top = b.bottom + 6 + hh > innerHeight - 8 ? Math.max(8, b.top - 6 - hh) : b.bottom + 6;
    Object.assign(d.style, { left: Math.max(8, Math.min(innerWidth - w - 8, b.left)) + "px", top: top + "px" });
    const close = () => { d.remove(); removeEventListener("keydown", k, true); removeEventListener("pointerdown", o, true); }, k = ev => { if (ev.key === "Escape"){ ev.stopPropagation(); ev.preventDefault(); close(); } }, o = ev => { if (!d.contains(ev.target) && !anchor.contains(ev.target)) close(); };
    const mb = $(".fd-m", d); if (mb) mb.onclick = () => { mb.remove(); $(".fd-mt", d).hidden = false; };
    $(".fd-x", d).onclick = close; addEventListener("keydown", k, true); setTimeout(() => addEventListener("pointerdown", o, true)); }
  /* the length from a part's dimension point to where its pipe starts, at one of its ends (run, branch, small), for the length checks */
  function takeout(r, role){ const { e, f } = figures(r); if (!e || !f) return null; const k = (e.takeout || {})[role || "run"]; if (!k) return null; if (f[k] != null && isFinite(+f[k])) return +f[k];
    try { const v = String(k).replace(/[A-Za-z][A-Za-z0-9]*/g, m => f[m] != null && isFinite(+f[m]) ? "(" + (+f[m]) + ")" : "NaN"); const x = /^[\d+\-*/(). ]+$/.test(v) ? Function("return " + v)() : NaN; return isFinite(x) ? x : null; } catch (er){ return null; } }
  return { entryFor, figures, card, takeout, sketch };
})();
