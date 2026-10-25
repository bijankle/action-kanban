/* Small helpers shared by every part of the app. */
"use strict";
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));
const now = () => Date.now();
function debounce(fn, ms){ let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = (...a) => { clearTimeout(t); fn(...a); }; d.cancel = () => clearTimeout(t); return d; }
function lsGet(k, d){ try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
function lsSet(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function h(html){ const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }
/* the file picker: the input has to be on the page for every browser to open it from a click */
function pickFile(accept, multiple, done){ const i = document.createElement("input"); i.type = "file"; if (accept) i.accept = accept; i.multiple = !!multiple;
  i.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0"; document.body.appendChild(i);
  i.onchange = () => { const f = [...i.files]; i.remove(); if (f.length) done(multiple ? f : f[0]); }; i.oncancel = () => i.remove(); i.click(); }
function fmtDate(v){ if (!v) return ""; if (v === "TBC" || v === "N/A") return v; const d = new Date(typeof v === "number" ? v : v + (String(v).length === 10 ? "T00:00:00" : ""));
  return isNaN(d) ? String(v) : d.getDate() + " " + "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ")[d.getMonth()] + " " + d.getFullYear() + (/T\d\d:\d\d$/.test(String(v)) ? ", " + String(v).slice(11, 16) : ""); }   // (a date with a time shows it: 3 Nov 2026, 07:30)
function fmtSize(n){ return n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
function slug(s){ return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "x"; }
function safeName(s){ return String(s || "file").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 120); }

/* the user's profile (kept on this device): it signs edits, prints, workpacks and RFQs */
const Profile = { get: () => Object.assign({ first: "", last: "", mobile: "", email: "", role: "", company: "" }, lsGet("adProfile", {})),
  name(){ const p = Profile.get(); return [p.first, p.last].filter(Boolean).join(" ") || lsGet("adName", ""); },
  initials(){ const p = Profile.get(), n = Profile.name(); return ((p.first[0] || "") + (p.last[0] || "")).toUpperCase() || (n ? n.split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase() : ""); },
  set(p){ lsSet("adProfile", p); lsSet("adName", [p.first, p.last].filter(Boolean).join(" ")); },
  /* the contact lines for a PDF: name and role, then mobile and email */
  lines(){ const p = Profile.get(), n = Profile.name(); return [n + (p.role ? ", " + p.role : ""), [p.mobile && "Mobile " + p.mobile, p.email].filter(Boolean).join("   ")].filter(Boolean); } };

/* toast note at the bottom of the screen */
function note(msg, ms){ let n = $("#note"); if (!n){ n = h('<div id="note" role="status"></div>'); document.body.appendChild(n); }
  n.textContent = msg; n.classList.add("show"); clearTimeout(note._t); note._t = setTimeout(() => n.classList.remove("show"), ms || 3200); }

/* modal window; returns the window element */
function modal(html, opts){ opts = opts || {};
  const m = h('<div class="ynmodal show"><div class="yn-win ' + (opts.cls || "") + '">' + html + '</div></div>');
  (document.fullscreenElement || document.body).appendChild(m);   // (over everything, the photo viewer in full screen too)
  const close = () => { m.remove(); document.removeEventListener("keydown", key, true); opts.onClose && opts.onClose(); };
  const key = e => { if (e.key === "Escape" && m.parentNode && m.parentNode.lastElementChild === m){ e.stopPropagation(); close(); } };
  document.addEventListener("keydown", key, true);
  m.addEventListener("mousedown", e => { if (e.target === m && !opts.sticky) close(); });
  m.close = close; return m; }
function confirmBox(msg, yes, danger){ return new Promise(res => {
  const m = modal('<h3>' + esc(msg) + '</h3><div class="yn-btns"><button class="yn-no" type="button">Cancel</button><button class="yn-yes' + (danger ? " danger" : "") + '" type="button">' + esc(yes || "OK") + '</button></div>', { onClose: () => res(false) });
  $(".yn-no", m).onclick = () => m.close();
  $(".yn-yes", m).onclick = () => { res(true); m.close(); }; $(".yn-yes", m).focus(); }); }
function promptBox(msg, val){ return new Promise(res => { let done = false;
  const m = modal('<h3>' + esc(msg) + '</h3><input class="in wide" type="text" value="' + esc(val || "") + '"><div class="yn-btns"><button class="yn-no" type="button">Cancel</button><button class="yn-yes" type="button">OK</button></div>', { onClose: () => { if (!done) res(null); } });
  const i = $("input", m); i.focus(); i.select();
  const ok = () => { done = true; m.close(); res(i.value); };
  $(".yn-no", m).onclick = () => m.close(); $(".yn-yes", m).onclick = ok; i.onkeydown = e => { if (e.key === "Enter") ok(); }; }); }

/* tiny IndexedDB key value store (folder handles and cached data live here) */
const IDB = (() => { let dbp;
  const db = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open("actionDatabase", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const tx = (mode, fn) => db().then(d => new Promise((res, rej) => { const t = d.transaction("kv", mode); const s = t.objectStore("kv"); const r = fn(s); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }));
  return { get: k => tx("readonly", s => s.get(k)).catch(() => undefined), set: (k, v) => tx("readwrite", s => s.put(v, k)).catch(() => {}), del: k => tx("readwrite", s => s.delete(k)).catch(() => {}) }; })();

/* base64 and hashing for uploads */
function bufToB64(buf){ const b = new Uint8Array(buf); let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }
function utf8ToB64(str){ return bufToB64(new TextEncoder().encode(str)); }
async function sha1(buf){ const d = await crypto.subtle.digest("SHA-1", buf); return Array.from(new Uint8Array(d)).map(x => x.toString(16).padStart(2, "0")).join(""); }

/* drag a divider to resize; calls set(px) while dragging (sign -1: the panel sits right of the divider, so dragging left widens it) */
function dragResize(handle, get, set, sign){ sign = sign || -1; handle.addEventListener("pointerdown", e => { e.preventDefault(); const x0 = e.clientX, w0 = get(); handle.setPointerCapture(e.pointerId); handle.classList.add("on");
  const mv = ev => set(w0 + sign * (ev.clientX - x0));
  const up = () => { handle.classList.remove("on"); handle.removeEventListener("pointermove", mv); handle.removeEventListener("pointerup", up); };
  handle.addEventListener("pointermove", mv); handle.addEventListener("pointerup", up); }); }

/* an (i) button that shows a how-to note in a small callout, so guidance doesn't take up room on screen */
/* (a span, not a button, so a label around it doesn't pass its clicks on to it) */
const tipI = (text, label) => '<span class="tip-i" role="button" tabindex="0" data-tip="' + esc(text) + '" aria-label="' + esc(label || "More information") + '" title="' + esc(label || "More information") + '">i</span>';
(() => { let cur = null;
  const close = () => { if (cur){ cur.p.remove(); cur.b.setAttribute("aria-expanded", "false"); cur = null; } };
  document.addEventListener("click", e => { const b = e.target.closest("[data-tip]");
    if (!b){ if (cur && !e.target.closest(".tip-pop")) close(); return; }
    e.preventDefault(); e.stopPropagation(); if (cur && cur.b === b) return close(); close();
    const p = document.createElement("div"); p.className = "pop tip-pop"; p.setAttribute("role", "note"); p.textContent = b.dataset.tip; document.body.appendChild(p);
    const r = b.getBoundingClientRect(), pr = p.getBoundingClientRect();
    p.style.left = Math.max(8, Math.min(r.left - 10, innerWidth - pr.width - 8)) + "px";
    p.style.top = (innerHeight - r.bottom > pr.height + 12 ? r.bottom + 6 : Math.max(8, r.top - pr.height - 6)) + "px";
    b.setAttribute("aria-expanded", "true"); cur = { p, b }; }, true);
  document.addEventListener("keydown", e => { if (e.key === "Escape" && cur){ e.stopPropagation(); close(); }
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("[data-tip]")){ e.preventDefault(); e.target.click(); } }, true);
  addEventListener("scroll", close, true); addEventListener("resize", close); })();

/* search that ignores spaces, dashes and dots: CV 402, CV-402 and CV402 all find each other. Every word typed has to be
   somewhere in the text */
const squash = s => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, "");
const qWords = q => String(q || "").toLowerCase().split(/\s+/).map(squash).filter(Boolean);
const smartHit = (text, q) => { const w = Array.isArray(q) ? q : qWords(q); if (!w.length) return true; const t = squash(text); return w.every(x => t.includes(x)); };

/* a click only counts when the press and the release are on the same thing: pressing in a box and letting go
   past its edge (or dragging to select text) doesn't open the row or card underneath */
(() => { let down = null, x0 = 0, y0 = 0;
  document.addEventListener("mousedown", e => { down = e.target; x0 = e.clientX; y0 = e.clientY; }, true);
  document.addEventListener("click", e => { const d = down; down = null; if (!d || e.detail === 0 || !e.isTrusted) return;
    const field = d.closest && d.closest("input,textarea,select,[contenteditable]"), moved = Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) > 6;
    if ((field && !field.contains(e.target)) || (moved && !(e.target.contains(d) && e.target.closest("button,a,label,input,select,textarea,[role=button]")))){ e.stopPropagation(); e.preventDefault(); } }, true); })();

/* a stage's label colours (option 2): a pale tint of its colour, and its text in a deep shade of the same colour,
   dark enough to read (6 to 1 or better). Returned as style variables: --c, --stb (the tint) and --stf (the text) */
const stageVars = (() => { const memo = new Map();
  const hx = h => [1, 3, 5].map(i => parseInt(String(h).substr(i, 2), 16) || 0), toH = c => "#" + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
  const lum = h => { const c = hx(h).map(v => v / 255).map(v => v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4)); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
  const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const mix = (a, b, t) => { const x = hx(a), y = hx(b); return toH(x.map((v, i) => v + (y[i] - v) * t)); };
  return c => { c = /^#[0-9a-f]{6}$/i.test(c || "") ? c : "#64748b"; if (memo.has(c)) return memo.get(c);
    const stb = mix(c, "#ffffff", .8); let t = 0, stf = c; while (cr(stf, stb) < 6 && t < 1){ t += .02; stf = mix(c, "#101418", t); }
    const out = "--c:" + c + ";--stb:" + stb + ";--stf:" + stf; memo.set(c, out); return out; }; })();

/* titles in proper case: each word starts with a capital, except the small joining words (and, or, of, the…) unless
   they come first; words already in capitals (PC2, FIM, III), codes with digits (cv402 → CV402, f12-rb-401 → F12-RB-401)
   and common plant acronyms (rom → ROM) are kept or put in capitals; mixed case words (McKenzie) are left alone */
const properTitle = (() => {
  const SMALL = new Set("a an and as at but by for from in into nor of on onto or over per the to via vs with".split(" "));
  const ACR = new Set("ac bom ccr cctv cv dc dcs dol esd fat fim hmi hpgr hv hvac id ip lan lv mcc mcp mto ocr od oem ohs pc pcs pid plc po ppe ptw qa qc rfi rfq rom sag scada sop tsf ups vfd vsd wbs wo".split(" "));
  const word = (w, first) => w.replace(/[A-Za-z0-9][A-Za-z0-9'’.]*/g, (t, i) => {
    const low = t.toLowerCase(), lead = first && i === 0;
    if (/[0-9]/.test(t) && /[a-z]/i.test(t)) return t.toUpperCase();   // (a code or tag number)
    if (t.length > 1 && t === t.toUpperCase() && /[A-Z]/.test(t)) return t;   // (already capitals)
    if (/[a-z]/.test(t) && /[A-Z]/.test(t.slice(1))) return t;   // (mixed case on purpose)
    if (ACR.has(low.replace(/[.'’]/g, ""))) return low.replace(/[.'’]/g, "").toUpperCase();
    if (!lead && SMALL.has(low)) return low;
    return low.charAt(0).toUpperCase() + low.slice(1); });
  return s => String(s || "").replace(/\s+/g, " ").trim().split(" ").map((w, i) => word(w, i === 0)).join(" "); })();

/* the upload with AI symbol (option 2): the same small page as the file buttons with an up arrow in it, and AI in bold
   purple letters underneath */
const aiIco = () => '<svg class="fico" viewBox="0 0 24 26" aria-hidden="true"><path d="M13 1.5H7.5a1.6 1.6 0 00-1.6 1.6v10.8a1.6 1.6 0 001.6 1.6h9a1.6 1.6 0 001.6-1.6V6.6z M13 1.5v5.1h5.1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>'
  + '<path d="M12 13V7.6M9.7 9.8L12 7.5l2.3 2.3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><text class="fa" x="12" y="24.5" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="8.6" letter-spacing=".2">AI</text></svg>';
/* the file symbol on export buttons: a page with its type on a coloured label (red for PDF, green for Excel) */
const fileIco = (label, cls) => { let t = String(label).toUpperCase(); if (t === "XLSX") t = "XLS"; const xl = /XLS|CSV/.test(t);
  /* (option 1: a small page with the type in bold letters underneath, red for PDF, green for Excel) */
  return '<svg class="fico' + (cls ? " " + cls : "") + '" viewBox="0 0 24 26" aria-hidden="true"><path d="M13 1.5H7.5a1.6 1.6 0 00-1.6 1.6v10.8a1.6 1.6 0 001.6 1.6h9a1.6 1.6 0 001.6-1.6V6.6z M13 1.5v5.1h5.1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>'
    + '<text class="' + (xl ? "fx" : "fp") + '" x="12" y="24.5" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="' + (t.length > 3 ? 7.2 : 8.6) + '" letter-spacing=".2">' + esc(t) + '</text></svg>'; };

/* the browser's own autofill (saved names, phone numbers, addresses) is turned off for every box in the app, so only
   the app's own dropdowns show. Browsers ignore autocomplete="off" on boxes that look like a name or phone number, but
   leave alone a box whose autocomplete is a word they don't know. The sign in page is separate and keeps its autofill */
const noAutofill = root => (root.matches && root.matches(AF_SEL) ? [root] : []).concat(root.querySelectorAll ? [...root.querySelectorAll(AF_SEL)] : []).forEach(i => { i.dataset.af = 1; i.setAttribute("autocomplete", "ad-" + Math.random().toString(36).slice(2, 8)); });
const AF_SEL = "input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=password]):not([data-af]), textarea:not([data-af])";
new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && noAutofill(n)))).observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener("DOMContentLoaded", () => noAutofill(document.body));

/* text that may be cut short: moreCut(html, heading) is the text with a more… after it, shown only when the text doesn't
   fit (moreFit(root) checks after drawing). Clicking more… shows it all in a small popup under the heading. Use ⓘ only
   for explaining something, not for showing text that was cut */
const moreCut = (html, head) => '<span class="mc"' + (head ? ' data-h="' + esc(head) + '"' : "") + '><span class="mc-t">' + html + '</span><button type="button" class="mc-more" title="Show it all">more…</button></span>';
function moreFit(root){ (root || document).querySelectorAll(".mc").forEach(m => { const t = m.firstElementChild; m.classList.toggle("cut", !!t && t.scrollWidth > t.clientWidth + 1); }); }
document.addEventListener("click", e => { const b = e.target.closest(".mc-more"); if (!b) return; e.preventDefault(); e.stopPropagation(); const m = b.closest(".mc"); if (typeof Fields !== "undefined") Fields.closePop();
  const p = document.createElement("div"); p.className = "pop mc-pop"; p.innerHTML = (m.dataset.h ? '<div class="mc-ph">' + esc(m.dataset.h) + '</div>' : "") + '<div class="mc-pt">' + m.firstElementChild.innerHTML + '</div>';
  document.body.appendChild(p); const r = b.getBoundingClientRect(); p.style.left = Math.max(8, Math.min(innerWidth - p.offsetWidth - 8, r.right - p.offsetWidth)) + "px"; p.style.top = (r.bottom + 6 + p.offsetHeight > innerHeight ? Math.max(8, r.top - p.offsetHeight - 6) : r.bottom + 6) + "px"; }, true);
