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
/* (names are always shown as proper names, Bijan Khadembashi, however they were typed or came from the sign in) */
const Profile = { get: () => { const p = Object.assign({ first: "", last: "", mobile: "", email: "", role: "", company: "" }, lsGet("adProfile", {})); p.first = properName(p.first); p.last = properName(p.last); return p; },
  name(){ const p = Profile.get(); return [p.first, p.last].filter(Boolean).join(" ") || properName(lsGet("adName", "")); },
  initials(){ const p = Profile.get(), n = Profile.name(); return ((p.first[0] || "") + (p.last[0] || "")).toUpperCase() || (n ? n.split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase() : ""); },
  set(p){ p = Object.assign({}, p, { first: properName(p.first), last: properName(p.last) }); lsSet("adProfile", p); lsSet("adName", [p.first, p.last].filter(Boolean).join(" ")); },
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
/* the (i) symbol everywhere: a thin outlined circle with a plain upright i (its colour comes from the button) */
const DUP_I = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>';
const BIN_I = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/></svg>';
const INFO_I = '<svg class="ii" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 11v6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="12" cy="7.6" r="1.25" fill="currentColor"/></svg>';
const tipI = (text, label) => '<span class="tip-i" role="button" tabindex="0" data-tip="' + esc(text) + '" aria-label="' + esc(label || "More information") + '" title="' + esc(label || "More information") + '">' + INFO_I + '</span>';
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
/* the import (upload) symbol: a page with an up arrow in it and its type in coloured letters, like the upload with AI button */
const upIco = label => '<svg class="fico" viewBox="0 0 24 26" aria-hidden="true"><path d="M13 1.5H7.5a1.6 1.6 0 00-1.6 1.6v10.8a1.6 1.6 0 001.6 1.6h9a1.6 1.6 0 001.6-1.6V6.6z M13 1.5v5.1h5.1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>'
  + '<path d="M12 13V7.6M9.7 9.8L12 7.5l2.3 2.3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><text class="' + (/XLS|CSV/i.test(label) ? "fx" : "fp") + '" x="12" y="24.5" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="8.6" letter-spacing=".2">' + esc(label) + '</text></svg>';
/* the file symbol on export (download) buttons: a page with a down arrow in it, its type in coloured letters under it
   (red for PDF, green for Excel, blue for Word), like the up arrow on the upload with AI button */
const fileIco = (label, cls) => { let t = String(label).toUpperCase(); if (t === "XLSX") t = "XLS"; if (t === "DOCX") t = "DOC"; const xl = /XLS|CSV/.test(t), wd = t === "DOC";
  /* (option 1: a small page with the type in bold letters underneath, red for PDF, green for Excel) */
  return '<svg class="fico' + (cls ? " " + cls : "") + '" viewBox="0 0 24 26" aria-hidden="true"><path d="M13 1.5H7.5a1.6 1.6 0 00-1.6 1.6v10.8a1.6 1.6 0 001.6 1.6h9a1.6 1.6 0 001.6-1.6V6.6z M13 1.5v5.1h5.1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>'
    + '<path d="M12 7.5v5.4M9.7 10.6l2.3 2.3 2.3-2.3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<text class="' + (xl ? "fx" : wd ? "fw" : "fp") + '" x="12" y="24.5" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="' + (t.length > 3 ? 7.2 : 8.6) + '" letter-spacing=".2">' + esc(t) + '</text></svg>'; };

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
function moreFit(root){ (root || document).querySelectorAll(".mc").forEach(m => { const t = m.firstElementChild; m.classList.toggle("cut", !!t && (t.scrollWidth > t.clientWidth + 1 || t.scrollHeight > t.clientHeight + 1)); }); }   // (cut off at the side, or below its last line)
document.addEventListener("click", e => { const b = e.target.closest(".mc-more"); if (!b) return; e.preventDefault(); e.stopPropagation(); const m = b.closest(".mc"); if (typeof Fields !== "undefined") Fields.closePop();
  const p = document.createElement("div"); p.className = "pop mc-pop"; p.innerHTML = (m.dataset.h ? '<div class="mc-ph">' + esc(m.dataset.h) + '</div>' : "") + '<div class="mc-pt">' + m.firstElementChild.innerHTML + '</div>';
  document.body.appendChild(p); const r = b.getBoundingClientRect(); p.style.left = Math.max(8, Math.min(innerWidth - p.offsetWidth - 8, r.right - p.offsetWidth)) + "px"; p.style.top = (r.bottom + 6 + p.offsetHeight > innerHeight ? Math.max(8, r.top - p.offsetHeight - 6) : r.bottom + 6) + "px"; }, true);

/* a small symbol for each kind of plant tag, for the tag dropdowns (the kinds are the plant lists' names) */
const KSYM = { "Mech equipment": '<path d="M10.37 5.19L10.5 2.52L13.5 2.52L13.63 5.19A7 7 0 0 1 15.66 6.03L15.66 6.03L17.64 4.23L19.77 6.36L17.97 8.34A7 7 0 0 1 18.81 10.37L18.81 10.37L21.48 10.5L21.48 13.5L18.81 13.63A7 7 0 0 1 17.97 15.66L17.97 15.66L19.77 17.64L17.64 19.77L15.66 17.97A7 7 0 0 1 13.63 18.81L13.63 18.81L13.5 21.48L10.5 21.48L10.37 18.81A7 7 0 0 1 8.34 17.97L8.34 17.97L6.36 19.77L4.23 17.64L6.03 15.66A7 7 0 0 1 5.19 13.63L5.19 13.63L2.52 13.5L2.52 10.5L5.19 10.37A7 7 0 0 1 6.03 8.34L6.03 8.34L4.23 6.36L6.36 4.23L8.34 6.03A7 7 0 0 1 10.37 5.19Z"/><circle cx="12" cy="12" r="3"/>', "Elec equipment": '<path d="M13 2.5L5.5 13.5h6l-1 8 8-11.5h-6z"/>',
  "Control valve": '<path d="M3.5 13.5l8.5 5v-10zM20.5 13.5l-8.5 5v-10z"/><path d="M12 8.5V5M8 5a4 3 0 018 0z"/>', "Manual valve": '<path d="M3.5 13.5l8.5 5v-10zM20.5 13.5l-8.5 5v-10z"/><path d="M12 8.5V4M8 4h8"/>',
  "Instrument": '<circle cx="12" cy="13" r="8"/><path d="M12 13l4-4M8 17h8"/>', "Tags": '<path d="M3.5 12.5V4.5h8l9 9-8 8z"/><circle cx="8" cy="8.5" r="1.3"/>' };
/* (the other asset kinds: a pipe run, a pipe special in its run, a hose, a control tag's signal, a cable) */
Object.assign(KSYM, { "Pipe line": '<path d="M2 9h20M2 15h20M5 9v6M19 9v6"/>', "Pipe special": '<path d="M2 12h5M17 12h5"/><rect x="7" y="8" width="10" height="8" rx="1.5"/>',
  "Hose": '<path d="M3 18c3 0 4-12 9-12s6 12 9 12"/>', "Control tag": '<path d="M3 12h4l2-5 3 10 2-5h7"/>', "Cable": '<path d="M2 12c3-5 5 5 8 0s5 5 8 0 3-2 4-1"/><circle cx="2.5" cy="12" r="1.2"/>' });
const kindSym = k => { const n = k === "Tags" ? "Tag added in the app" : k; return '<span class="ksym" role="img" aria-label="' + esc(n) + '" title="' + esc(n) + '"><svg viewBox="0 0 24 24">' + (KSYM[k] || KSYM.Tags) + '</svg></span>'; };

/* a person's name with each word capitalised (bijan KHADEMBASHI → Bijan Khadembashi, o'brien → O'Brien) */
const properName = s => String(s || "").trim().replace(/\s+/g, " ").toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

/* the app's own date and time boxes: a square box with a calendar (or clock) symbol and the date (or 24 hour time),
   only as wide as its words. The date opens a calendar (Monday first, Clear and Today), the time is typed (730, 7:30,
   1930) or picked from a list in half hours. Each has .value (YYYY-MM-DD, HH:MM) and fires "change" like an input */
const ICO_CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
const ICO_CLK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';
let pickPop = null; const closePick = () => { if (pickPop){ pickPop.remove(); pickPop = null; } };
document.addEventListener("mousedown", e => { if (pickPop && !pickPop.contains(e.target) && !e.target.closest(".dchip")) closePick(); }, true);
document.addEventListener("keydown", e => { if (e.key === "Escape" && pickPop){ e.stopPropagation(); closePick(); } }, true);
const isoDay = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
function placePick(p, anchor){ const r = anchor.getBoundingClientRect(), below = innerHeight - r.bottom > p.offsetHeight + 8 || r.top < p.offsetHeight;
  Object.assign(p.style, { left: Math.max(8, Math.min(r.left, innerWidth - p.offsetWidth - 8)) + "px", top: (below ? r.bottom + 4 : r.top - p.offsetHeight - 4) + "px" }); }
/* (on a phone or tablet the device's own date and time pickers are used: big, familiar and made for fingers) */
const TOUCH = !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);
const nativeBox = (type, value, opts) => { const i = h('<input class="in dnat" type="' + type + '"' + (opts.label ? ' aria-label="' + esc(opts.label) + '"' : "") + '>'); i.value = value || ""; if (opts.cls) i.classList.add(...opts.cls.split(" ")); return i; };
function dateBox(value, opts){ opts = opts || {}; if (TOUCH) return nativeBox("date", /^\d{4}-\d\d-\d\d$/.test(value || "") ? value : "", opts); let v = value || "";
  const b = h('<button type="button" class="dchip' + (opts.cls ? " " + opts.cls : "") + '"' + (opts.label ? ' aria-label="' + esc(opts.label) + '"' : "") + '>' + ICO_CAL + '<span></span></button>');
  const show = () => { const ok = /^\d{4}-\d\d-\d\d$/.test(v); $("span", b).textContent = v ? (ok ? fmtDate(v) : v) : (opts.ph || "Add date"); b.classList.toggle("dc-ph", !v); };
  Object.defineProperty(b, "value", { get: () => v, set: x => { v = x || ""; show(); } }); show();
  const fire = () => b.dispatchEvent(new Event("change", { bubbles: true }));
  b.onclick = () => { if (pickPop && pickPop.__for === b) return closePick(); closePick(); let view = /^\d{4}-\d\d/.test(v) ? new Date(v.slice(0, 7) + "-01T12:00") : new Date(); view.setDate(1);
    const p = pickPop = h('<div class="pop calpop" role="dialog" aria-label="Pick a date"></div>'); p.__for = b; document.body.appendChild(p);
    const draw = () => { const y = view.getFullYear(), m = view.getMonth(), off = (new Date(y, m, 1).getDay() + 6) % 7, today = isoDay(new Date()); let g = "";
      for (let k = 0; k < 42; k++){ const d = new Date(y, m, 1 - off + k), id = isoDay(d); g += '<button type="button" data-d="' + id + '" class="' + (d.getMonth() !== m ? "x " : "") + (id === today ? "td " : "") + (id === v ? "on" : "") + '">' + d.getDate() + '</button>'; }
      p.innerHTML = '<div class="cal-h"><button type="button" data-mv="-1" aria-label="Previous month">‹</button><span>' + "January February March April May June July August September October November December".split(" ")[m] + " " + y + '</span><button type="button" data-mv="1" aria-label="Next month">›</button></div>'
        + '<div class="cal-g">' + "Mo Tu We Th Fr Sa Su".split(" ").map(x => "<span>" + x + "</span>").join("") + g + '</div><div class="cal-f"><button type="button" data-clr>Clear</button><button type="button" data-td>Today</button></div>'; };
    p.onclick = e => { const mv = e.target.closest("[data-mv]"); if (mv){ view.setMonth(view.getMonth() + +mv.dataset.mv); return draw(); }
      const d = e.target.closest("[data-d]"), pick = x => { closePick(); if (x !== v){ v = x; show(); fire(); } else b.focus(); };
      if (d) pick(d.dataset.d); else if (e.target.closest("[data-clr]")) pick(""); else if (e.target.closest("[data-td]")) pick(isoDay(new Date())); };
    draw(); placePick(p, b); };
  return b; }
/* a date range in one box ("3 Nov 2026 to 10 Nov 2026"): one calendar, the first day picked is the start, the second the
   end (in either order), with Clear and Today. .from and .to hold the days; it fires change when both are set or cleared */
function rangeBox(from, to, opts){ opts = opts || {}; let f = from || "", t = to || "", half = "";
  const b = h('<button type="button" class="dchip drange' + (opts.cls ? " " + opts.cls : "") + '" aria-label="' + esc(opts.label || "Date range") + '">' + ICO_CAL + '<span class="dr-f"></span><span class="dr-to">to</span><span class="dr-t"></span></button>');
  const show = () => { const a = $(".dr-f", b), z = $(".dr-t", b); const sy = f && t && f.slice(0, 4) === t.slice(0, 4), sm = sy && f.slice(5, 7) === t.slice(5, 7);   // (21 to 28 Oct 2026; 21 Sep to 3 Oct 2026: the year, and the month, said once)
    a.textContent = !f ? "From" : sm ? String(+f.slice(8, 10)) : sy ? fmtDate(f).replace(/\s+\d{4}$/, "") : fmtDate(f); z.textContent = t ? fmtDate(t) : "To"; a.classList.toggle("dc-ph", !f); z.classList.toggle("dc-ph", !t); };
  Object.defineProperty(b, "from", { get: () => f, set: x => { f = x || ""; show(); } }); Object.defineProperty(b, "to", { get: () => t, set: x => { t = x || ""; show(); } }); show();
  const fire = () => b.dispatchEvent(new Event("change", { bubbles: true }));
  b.onclick = () => { if (pickPop && pickPop.__for === b) return closePick(); closePick(); half = ""; let view = /^\d{4}-\d\d/.test(f) ? new Date(f.slice(0, 7) + "-01T12:00") : new Date(); view.setDate(1);
    const p = pickPop = h('<div class="pop calpop" role="dialog" aria-label="Pick the start and end days"></div>'); p.__for = b; document.body.appendChild(p);
    const draw = () => { const y = view.getFullYear(), m = view.getMonth(), off = (new Date(y, m, 1).getDay() + 6) % 7, today = isoDay(new Date()), lo = half || f, hi = half ? "" : t; let g = "";
      for (let k = 0; k < 42; k++){ const d = new Date(y, m, 1 - off + k), id = isoDay(d), inR = lo && hi && id > lo && id < hi;
        g += '<button type="button" data-d="' + id + '" class="' + (d.getMonth() !== m ? "x " : "") + (id === today ? "td " : "") + (id === lo || id === hi ? "on " : "") + (inR ? "in" : "") + '">' + d.getDate() + '</button>'; }
      p.innerHTML = '<div class="cal-h"><button type="button" data-mv="-1" aria-label="Previous month">‹</button><span>' + "January February March April May June July August September October November December".split(" ")[m] + " " + y + '</span><button type="button" data-mv="1" aria-label="Next month">›</button></div>'
        + '<div class="cal-g">' + "Mo Tu We Th Fr Sa Su".split(" ").map(x => "<span>" + x + "</span>").join("") + g + '</div><div class="cal-hint dim">' + (half ? "Now pick the end day" : "Pick the start day") + '</div><div class="cal-f"><button type="button" data-clr>Clear</button><button type="button" data-td>Today</button></div>'; };
    const pick = x => { if (!half){ half = x; draw(); return; } const a = half < x ? half : x, z = half < x ? x : half; half = ""; closePick(); if (a !== f || z !== t){ f = a; t = z; show(); fire(); } };
    p.onclick = e => { const mv = e.target.closest("[data-mv]"); if (mv){ view.setMonth(view.getMonth() + +mv.dataset.mv); return draw(); }
      const d = e.target.closest("[data-d]"); if (d) return pick(d.dataset.d);
      if (e.target.closest("[data-clr]")){ closePick(); if (f || t){ f = t = ""; show(); fire(); } return; }
      if (e.target.closest("[data-td]")) pick(isoDay(new Date())); };
    draw(); placePick(p, b); };
  return b; }
function timeBox(value, opts){ opts = opts || {}; if (TOUCH) return nativeBox("time", value, opts);
  const w = h('<span class="dchip tchip">' + ICO_CLK + '<input type="text" inputmode="numeric" maxlength="5" placeholder="' + esc(opts.ph || "Time") + '" aria-label="' + esc(opts.label || "Time, 24 hour") + '" title="24 hour time" autocomplete="off" spellcheck="false"></span>'), i = $("input", w);
  i.value = value || ""; Object.defineProperty(w, "value", { get: () => i.value, set: x => { i.value = x || ""; } });
  const norm = x => { const g = String(x).replace(/[^\d:]/g, "").match(/^(\d{1,2}):?(\d{2})?$/); if (!g) return ""; const hh = +g[1], mm = +(g[2] || 0); return hh < 24 && mm < 60 ? String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0") : ""; };
  let was = i.value; w.addEventListener("pointerdown", e => { if (e.target !== i){ e.preventDefault(); i.focus(); } else if (document.activeElement === i && !(pickPop && pickPop.__for === w)) setTimeout(() => i.onfocus(), 0); });   // (a box that already had the focus, after the panel redrew, opens on a click too)
  i.onfocus = () => { was = i.value; i.select(); closePick(); const p = pickPop = h('<div class="pop tmpop" role="listbox" aria-label="Pick a time"></div>'); p.__for = w; let o = "";
    const step = +pref("timeStep") || 30; for (let k = 0; k < 1440; k += step){ const x = String(k / 60 | 0).padStart(2, "0") + ":" + String(k % 60).padStart(2, "0"); o += '<button type="button" data-t="' + x + '"' + (x === i.value ? ' class="on"' : "") + '>' + x + '</button>'; }
    p.innerHTML = o; document.body.appendChild(p); placePick(p, w); const on = $(".on", p) || $('[data-t="' + pref("defTime") + '"]', p) || p.firstChild; if (on) p.scrollTop = on.offsetTop - 80;
    p.onmousedown = e => { const t = e.target.closest("[data-t]"); if (!t) return; e.preventDefault(); i.value = t.dataset.t; i.blur(); }; };
  i.onblur = () => { setTimeout(() => { if (pickPop && pickPop.__for === w) closePick(); }, 0); const n = i.value.trim() ? norm(i.value) || was : ""; i.value = n; if (n !== was){ was = n; i.dispatchEvent(new Event("change", { bubbles: true })); } };
  i.onkeydown = e => { if (e.key === "Enter") i.blur(); };
  i.addEventListener("change", e => { if (e.isTrusted) e.stopPropagation(); });   // (only the tidied time counts, not the raw typing)
  return w; }

/* the parameters: the app's rules and presets, set by each person for themselves in File, Parameters (kept on this
   computer). These are the defaults */
const PREF_DEF = { etaSoon: 7, etaHover: 300, defTime: "07:00", timeStep: 30, passDefault: "done", defectCat: true, handover: true, quoteTick: true, poTick: true,
  autoFit: true, notesW: 220, titleMin: 260, openLast: true, kbClear: true, pasteInto: true, locFromWbs: true,
  /* MTO spares, as a share of the quantity, by heading (the usual construction allowances; small bore is DN50 / OD63 and under) */
  spAuto: true, spPipe: 5, spPipeSB: 10, spFit: 5, spFitSB: 10, spFlg: 5, spGk: 20, spBolt: 10, spValve: 0, spInst: 0, spSteel: 5, spPlate: 10 };
/* the team rules (they change shared data, so they're the same for everyone and set by the admin) are kept in the shared
   config; the rest are each person's own, on their computer */
const TEAM_RULES = new Set(["passDefault", "defectCat", "handover", "quoteTick", "poTick", "locFromWbs"]);
const pref = k => { const src = TEAM_RULES.has(k) ? ((typeof Store !== "undefined" && Store.S.config && Store.S.config.rules) || {}) : (lsGet("adRules", {}) || {}); const v = src[k]; return v === undefined || v === null || v === "" ? PREF_DEF[k] : v; };

/* the hide and show symbol of the Filters and Details panels: a little screen with the panel's side shaded and an
   arrow the way it goes (side l or r, way -1 left or 1 right), so it plainly means the whole panel */
const panelIco = (side, way) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="15" rx="2.2"/>'
  + (side === "l" ? '<path d="M9 4.5v15"/><path d="M3.8 5.3h4.4v13.4H3.8z" fill="currentColor" stroke="none" opacity=".25"/>' : '<path d="M15 4.5v15"/><path d="M15.8 5.3h4.4v13.4h-4.4z" fill="currentColor" stroke="none" opacity=".25"/>')
  + '<path d="' + (way < 0 ? "M15.5 9.5l-2.5 2.5 2.5 2.5" : "M8.5 9.5l2.5 2.5-2.5 2.5") + '" stroke-width="2.2"/></svg>';

/* any other table behaves like the Actions list: one line per row (cut off text ends in …, the full text on pointing),
   the columns filling the width, each one draggable to a new width, and a double click on its edge fits it to its
   contents. The widths are kept per table (key) on this computer; until one is set, the columns share the width in
   proportion to what they hold */
/* every table works like the Actions list: click a heading to sort (again to reverse, a third time to go back), drag a
   heading onto another to move the column; the order and the sort are kept per table (the order for good, the sort while
   the app is open). Rows that aren't data (the blank row to type in, a divider) stay where they are: each run of data rows
   between them sorts on its own. */
tblKit.id = (th, i) => th.dataset.col || th.textContent.replace(/[▲▼]/g, "").trim() || "c" + i;
function tblKit(table, key, opts){ const hr = table.tHead && table.tHead.rows[0]; if (!hr) return;
  const n = hr.cells.length, cid = tblKit.id;
  const plain = r => r.cells.length === n && ![...r.cells].some(c => c.colSpan > 1);
  /* the column order this person dragged */
  const ord = (lsGet("adTO", {}) || {})[key];
  if (ord && ord.length){ const ids = [...hr.cells].map(cid), want = ord.filter(x => ids.includes(x)).concat(ids.filter(x => !ord.includes(x)));
    const perm = want.map(x => ids.indexOf(x)); if (perm.some((p, i) => p !== i)) [hr].concat([...table.tBodies[0].rows].filter(plain)).forEach(r => { const cs = [...r.cells]; perm.forEach(p => r.appendChild(cs[p])); }); }
  const ths = [...hr.cells], S = tblKit.sort || (tblKit.sort = {});
  const val = td => { if (!td) return ""; const f = td.querySelector("input,select,textarea"); return f ? (f.type === "checkbox" ? (f.checked ? "1" : "0") : f.tagName === "SELECT" ? (f.options[f.selectedIndex] || {}).text || "" : f.value) : td.textContent.trim(); };
  const num = v => { const t = String(v).replace(/[, ]/g, ""); return t !== "" && isFinite(t) ? +t : null; }, day = v => /\d{4}|\d{1,2} [A-Z][a-z]{2}/.test(v) ? Date.parse(v) : NaN;
  const cmp = (a, b) => { if (a === b) return 0; if (a === "") return 1; if (b === "") return -1; const x = num(a), y = num(b); if (x != null && y != null) return x - y;
    const dx = day(a), dy = day(b); if (!isNaN(dx) && !isNaN(dy)) return dx - dy; return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }); };
  const sortNow = () => { const st = S[key], tb = table.tBodies[0]; ths.forEach(th => { const m = th.querySelector(".tk-s"); if (m) m.remove(); });
    if (!st) return; const i = ths.findIndex((th, k) => cid(th, k) === st.c); if (i < 0) return;
    const lab = ths[i].querySelector(".th-l") || ths[i]; lab.insertAdjacentHTML("beforeend", '<span class="tk-s">' + (st.d > 0 ? " ▲" : " ▼") + '</span>');
    /* (a row that belongs under the one before it, such as an MTO row's pieces, moves with it) */
    const rows = [...tb.rows], att = r => r.matches(".mt-sub, .tk-att"), data = r => plain(r) && !r.matches(".pt-blank, .ct-new, .is-sep, .nosort"); let run = [];
    const flush = () => { if (run.length > 1){ const last = run[run.length - 1], anchor = (last.sub.length ? last.sub[last.sub.length - 1] : last.r).nextSibling;
        run.slice().sort((a, b) => st.d * cmp(val(a.r.cells[i]), val(b.r.cells[i]))).forEach(g => [g.r].concat(g.sub).forEach(r => tb.insertBefore(r, anchor))); } run = []; };
    rows.forEach(r => att(r) && run.length ? run[run.length - 1].sub.push(r) : data(r) ? run.push({ r, sub: [] }) : flush()); flush(); };
  if (opts.sort !== false) ths.forEach((th, i) => { if (!th.textContent.trim()) return; th.classList.add("tk-h");
    th.onclick = e => { if (e.target.closest(".tw-r, button, input, select, a")) return; const c = cid(th, i), st = S[key];
      S[key] = !st || st.c !== c ? { c, d: 1 } : st.d > 0 ? { c, d: -1 } : null; if (opts.onSort) opts.onSort(); else sortNow(); }; });   // (a list too long to show at once sorts itself, onSort)
  sortNow();
  /* drag a heading onto another to move its column */
  ths.forEach((th, i) => { th.draggable = true;
    th.ondragstart = e => { if (e.target.closest && e.target.closest(".tw-r")) return e.preventDefault(); e.dataTransfer.setData("text/tcol", key + "|" + cid(th, i)); th.classList.add("drag"); };
    th.ondragend = () => th.classList.remove("drag");
    th.ondragover = e => { if ([...e.dataTransfer.types].includes("text/tcol")){ e.preventDefault(); th.classList.add("dover"); } };
    th.ondragleave = () => th.classList.remove("dover");
    th.ondrop = e => { th.classList.remove("dover"); const [k, from] = (e.dataTransfer.getData("text/tcol") || "").split("|"); const to = cid(th, i); if (k !== key || !from || from === to) return; e.preventDefault();
      const ids = ths.map(cid), a = ids.indexOf(from), b0 = ids.indexOf(to); ids.splice(a, 1); let b = ids.indexOf(to); b = a < b0 ? b + 1 : b; ids.splice(b, 0, from);
      const all = lsGet("adTO", {}) || {}; all[key] = ids; lsSet("adTO", all); App.render(); }; }); }
/* numbers sit in the middle of their column in every table (a quantity, a size, a count); only section numbers (1.2, 1.1.2) stay on the left */
const NUMV = /^[-+]?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?\s*(%|mm|m|kg|t|kw|kpag?|°c|ea|no\.?)?$/i;
function numCols(table){ const ths = [...(table.tHead ? table.tHead.rows[0].cells : [])], rows = [...table.tBodies[0].rows].filter(r => r.cells.length === ths.length).slice(0, 300);
  ths.forEach((th, i) => { let n = 0, bad = false, sec = /\b(section|clause|item no)\b/i.test(th.textContent);
    rows.forEach(r => { if (bad) return; const td = r.cells[i], f = td && td.querySelector("input:not([type=checkbox]),select,textarea"); if (f && f.tagName !== "INPUT") return bad = true;
      const v = (f ? f.value : td ? td.textContent : "").trim(); if (f && /decimal|numeric/.test(f.inputMode)){ n++; return; } if (!v) return;
      if (!NUMV.test(v) || !/\d/.test(v)) return bad = true; n++; if (/^\d+\.\d+\.\d/.test(v)) sec = true; });
    const on = n > 0 && !bad && !sec; th.classList.toggle("tc-n", on); rows.forEach(r => r.cells[i] && r.cells[i].classList.toggle("tc-n", on)); }); }
function gridCols(table, key, opts){ opts = opts || {}; tblKit(table, key, opts); const ths = [...(table.tHead ? table.tHead.rows[0].cells : [])]; if (!ths.length) return;
  const store = lsGet("adTW", {}) || {}, W = store[key] = store[key] || {}, fixed = opts.fixed || {};
  const cv = gridCols.cv || (gridCols.cv = document.createElement("canvas").getContext("2d"));
  const textW = (t, font) => { cv.font = font; return cv.measureText(String(t || "")).width; };
  const rows = [...table.tBodies[0].rows].slice(0, 300);
  /* a column's natural width: its heading or its widest entry (a box measures by what's typed in it, or its hint) */
  const natural = i => { const th = ths[i], hf = getComputedStyle(th).font; let w = textW(th.textContent.trim(), hf) + (opts.hPad || 34);
    rows.forEach(r => { const td = r.cells[i]; if (!td) return; const f = td.querySelector("input,select,textarea"), tx = !f && td.querySelector("[data-fit]"), font = getComputedStyle(f || tx || td).font;   // (data-fit: the element whose own font sets the width)
      const t = f ? (f.tagName === "SELECT" ? (f.options[f.selectedIndex] || {}).text : f.value || f.placeholder) : td.textContent.trim(); const more = [...td.querySelectorAll("input:not([type=checkbox]):not([hidden])")].slice(1).reduce((t2, g) => t2 + textW(g.value || g.placeholder, getComputedStyle(g).font) + (opts.inPad || 36) + 2, 0);   // (two boxes in a cell, a reducing fitting's sizes: room for both)
      const side = f ? [...td.querySelectorAll("[data-fit]")].reduce((t2, g) => t2 + textW(g.textContent, getComputedStyle(g).font) + 28, 0) : 0;   // (a box with words beside it: room for both)
      w = Math.max(w, textW(t, font) + (f ? (f.tagName === "SELECT" ? 48 : opts.inPad || 36) : 20) + more + side); });
    return Math.min((opts.cap || {})[tblKit.id(th, i)] || opts.max || 480, Math.ceil(w + ((opts.extra || {})[tblKit.id(th, i)] || 0))); };   // (cap: a column that shows long text ends in more… past this width)   // (extra: room for something inside a column's boxes, like the MTO's (i))
  const id = tblKit.id;
  let cg = table.querySelector("colgroup"); if (!cg){ cg = document.createElement("colgroup"); table.insertBefore(cg, table.firstChild); } cg.innerHTML = ths.map(() => "<col>").join("");
  /* the width there is: the nearest box round the table that has a width (measured after the page has laid out) */
  let host = table.parentElement; while (host && host !== document.body && !host.clientWidth) host = host.parentElement;
  const hs = host ? getComputedStyle(host) : null, cols = [...cg.children], room = Math.max(300, ((host && host.clientWidth) || 800) - (hs ? parseFloat(hs.paddingLeft) + parseFloat(hs.paddingRight) : 0) - 2);
  const nat = ths.map((th, i) => fixed[id(th, i)] || natural(i)), set = ths.map((th, i) => W[id(th, i)]);
  /* the columns nobody has set share what's left, in proportion to what they hold (a short one never below its own width) */
  const used = set.reduce((t, w, i) => t + (w || 0), 0), free = ths.map((th, i) => !set[i] && !fixed[id(th, i)]), natFree = nat.reduce((t, w, i) => t + (free[i] ? w : 0), 0), fix = nat.reduce((t, w, i) => t + (!set[i] && !free[i] ? w : 0), 0);
  /* (more than fits: the columns nobody has set narrow in proportion, each to no less than its heading, and their
     text ends in …; less than fits: each keeps its own width, so there's no blank space) */
  const minW = i => Math.min(nat[i], Math.ceil(textW(ths[i].textContent.trim(), getComputedStyle(ths[i]).font) + (opts.hPad || 34))), flo = new Set();
  let k = 1; for (let pass = 0; pass < 4; pass++){ const left = room - used - fix - [...flo].reduce((t, i) => t + minW(i), 0), sc = nat.reduce((t, w, i) => t + (free[i] && !flo.has(i) ? w : 0), 0);
    k = sc ? Math.min(1, opts.scroll ? 1 : left / sc) : 1; let more = false; ths.forEach((th, i) => { if (free[i] && !flo.has(i) && nat[i] * k < minW(i)){ flo.add(i); more = true; } }); if (!more) break; }   // (a column held at its heading's width leaves the rest to share what's left)
  const widths = ths.map((th, i) => Math.round(set[i] || (free[i] ? (flo.has(i) ? minW(i) : nat[i] * k) : nat[i])));
  cols.forEach((c, i) => c.style.width = widths[i] + "px"); table.classList.add("tw"); table.style.width = widths.reduce((t, w) => t + w, 0) + "px";
  rows.forEach(r => [...r.cells].forEach(td => { if (!td.title && !td.querySelector("input,select,textarea,button")) td.title = td.textContent.trim(); }));
  /* one row height, always: text that doesn't fit its cell stays on one line and ends in more…, which shows it all */
  rows.forEach(r => [...r.cells].forEach(td => { if (td.colSpan > 1 || !td.textContent.trim() || td.querySelector("input,select,textarea,button,svg,img,.mc,.lt-w")) return;
    const th = ths[td.cellIndex]; td.innerHTML = moreCut(td.innerHTML, th ? th.textContent.trim() : ""); }));
  requestAnimationFrame(() => moreFit(table));
  numCols(table);
  const save = () => lsSet("adTW", store);
  ths.forEach((th, i) => { if (th.querySelector(".tw-r")) return; const h = document.createElement("i"); h.className = "tw-r"; th.appendChild(h);
    h.onclick = e => e.stopPropagation();
    h.onpointerdown = e => { e.preventDefault(); e.stopPropagation(); const x0 = e.clientX, w0 = cols[i].getBoundingClientRect().width || widths[i]; h.setPointerCapture(e.pointerId);
      h.onpointermove = ev => { const w = Math.max(40, w0 + ev.clientX - x0); cols[i].style.width = w + "px"; W[id(th, i)] = Math.round(w); table.style.width = cols.reduce((t, c) => t + parseFloat(c.style.width), 0) + "px"; moreFit(table); };
      h.onpointerup = () => { h.onpointermove = null; save(); }; };
    h.ondblclick = e => { e.stopPropagation(); W[id(th, i)] = natural(i); save(); gridCols(table, key, opts); }; }); }

/* filter pills for a list in the Filters side bar (the Data validation tabs): groups of pills, each pill a value with how many
   it leaves. Picks are kept per list. A group with many values shows the common ones and folds the rest behind more…
   (a picked one always shows). groups: [{ k, name, of: item => value }] */
const PillF = (() => {
  const S = lsGet("adPF", {}) || {}, open = {};
  const sel = (key, k) => new Set((S[key] || {})[k] || []);
  const pass = (key, groups, it, skip) => groups.every(g => g.k === skip || !sel(key, g.k).size || sel(key, g.k).has(String(g.of(it) || "Not set")));
  const apply = (key, groups, items) => items.filter(it => pass(key, groups, it));
  const count = (key, groups) => groups.reduce((t, g) => t + sel(key, g.k).size, 0);
  const keep = () => lsSet("adPF", S);
  function render(el, key, groups, items, total){ let body = $(".fp-groups", el); if (!body){ body = document.createElement("div"); body.className = "fp-groups"; el.appendChild(body); }
    const html = groups.map(g => { const on = sel(key, g.k), tot = new Map(); total.forEach(it => { const v = String(g.of(it) || "Not set"); tot.set(v, (tot.get(v) || 0) + 1); });
      const cnt = v => items.filter(it => pass(key, groups, it, g.k) && String(g.of(it) || "Not set") === v).length;
      let vals = [...tot.keys()].sort((a, b) => a === "Not set" ? 1 : b === "Not set" ? -1 : g.order ? g.order(a, b) : a.localeCompare(b, undefined, { numeric: true }));
      const big = !g.all && vals.length > 12 ? new Set([...tot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(x => x[0])) : null, few = big ? vals.filter(v => !big.has(v) && !on.has(v)) : [];
      if (few.length && !open[key + g.k]) vals = vals.filter(v => !few.includes(v));
      return '<div class="fg2" data-k="' + esc(g.k) + '"><div class="fgh"><span>' + esc(g.name) + '</span>' + (on.size ? '<button type="button" class="link fclr">Clear</button>' : "") + '</div>'
        + vals.map(v => { const n = cnt(v), p = on.has(v); if (!n && !p) return ""; return '<button type="button" class="pill fpill' + (p ? " on" : "") + (v === "Not set" ? " ns" : "") + '" data-v="' + esc(v) + '" aria-pressed="' + p + '" title="' + esc(v) + '"><span class="fp-t">' + esc(v) + '</span> <b>' + n + '</b></button>'; }).join("")
        + (few.length ? '<button type="button" class="link fco-more">' + (open[key + g.k] ? "fewer" : few.length + " more…") + '</button>' : "") + '</div>'; }).join("");
    const shown = apply(key, groups, items).length;
    body.innerHTML = html + (count(key, groups) ? '<p class="dim fshown"><button type="button" class="link fall">Clear all</button></p>' : "");
    $$(".fg2", body).forEach(gEl => { const k = gEl.dataset.k; gEl.onclick = e => { const b = e.target.closest(".fpill"), o = S[key] = S[key] || {};
      if (b){ const v = b.dataset.v, set = sel(key, k); set.has(v) ? set.delete(v) : set.add(v); o[k] = [...set]; keep(); App.render(); }
      else if (e.target.closest(".fclr")){ o[k] = []; keep(); App.render(); }
      else if (e.target.closest(".fco-more")){ open[key + k] = !open[key + k]; App.render(); } }; });
    const fa = $(".fall", body); if (fa) fa.onclick = () => { S[key] = {}; keep(); App.render(); }; }
  return { apply, render, count };
})();

/* a PDF table's columns fitted to what they hold, as the app's own tables are: each column as wide as its longest entry (or its
   heading), and the long text columns (a description) share what's left; too wide for the page, the widest give way first, down
   to their longest word. Returns autoTable columnStyles; a column already given a width keeps it */
function pdfCols(doc, head, body, W, o){ o = o || {}; const fs = o.fs || 9, hfs = o.hfs || fs, pad = (o.pad == null ? 1.8 : o.pad) * 2 + 0.6, fixed = o.fixed || {}, n = head.length;
  const tw = (t, b, f) => { doc.setFont("helvetica", b ? "bold" : "normal"); doc.setFontSize(f); return doc.getTextWidth(String(t == null ? "" : t)); };
  const nat = [], min = [];
  for (let j = 0; j < n; j++){ const cells = body.map(r => String(r[j] == null ? "" : r[j])); const hw = Math.max(...String(head[j]).split(/\s+/).map(w => tw(w, true, hfs)));
    nat[j] = Math.max(tw(head[j], true, hfs), ...cells.map(c => Math.max(...c.split("\n").map(l => tw(l, false, fs))))) + pad;
    min[j] = Math.max(hw, ...cells.map(c => Math.max(0, ...c.split(/\s+/).map(w => tw(w, false, fs))))) + pad; }
  const w = nat.map((x, j) => fixed[j] && fixed[j].cellWidth ? fixed[j].cellWidth : Math.max(x, min[j])), free = j => !(fixed[j] && fixed[j].cellWidth), sum = () => w.reduce((t, x) => t + x, 0);
  if (sum() <= W){ const long = w.map((x, j) => j).filter(j => free(j) && nat[j] > W * 0.22); const named = w.map((x, j) => j).filter(j => free(j) && /desc|name|title|notes|location|item text/i.test(head[j])); const ls = long.length ? long : named.length ? named : [w.indexOf(Math.max(...w.filter((x, j) => free(j))))]; const tot = ls.reduce((t, j) => t + w[j], 0), extra = W - sum(); ls.forEach(j => w[j] += extra * w[j] / tot); }
  else { for (let g = 0; g < 60 && sum() > W + 0.1; g++){ const top = Math.max(...w.filter((x, j) => free(j) && x > min[j])); if (!isFinite(top)) break; const js = w.map((x, j) => j).filter(j => free(j) && w[j] === top);
      const next = Math.max(...w.filter((x, j) => free(j) && x < top), 0), cut = Math.min(top - next, (sum() - W) / js.length) || (sum() - W) / js.length; js.forEach(j => w[j] = Math.max(min[j], w[j] - cut)); } }
  const out = {}; for (let j = 0; j < n; j++) out[j] = Object.assign({}, fixed[j] || {}, { cellWidth: w[j] }); doc.setFont("helvetica", "normal"); return out; }

/* tables work like Excel: one click on a cell you can type in selects its row (and marks the cell); a double click, or
   Enter or F2 on the marked cell, edits it, with the cursor where the text was clicked. The rows for adding something
   new (+ Class, + Item, Type a number, + New person) take typing on one click, as before */
const CellEdit = (() => {
  const ED = ".in:not(.lk-sel),.pt-in,.lt-b,.tg1,.tagin";   // (a dropdown cell is a pick from a fixed list, as Excel's data validation: one click opens it)
  const box = t => { const el = t && t.closest && t.closest(ED), td = el && el.closest("td"); return td && td.closest("table.tbl") && !el.disabled && !el.readOnly ? el : null; };
  const fresh = el => !!el.closest("tr.pt-blank,tr.cts-new") || /^new/.test(el.dataset.r || "") || (el.placeholder && /^\+ /.test(el.placeholder) && !el.value);
  let armed = null, at = null, selT = 0;   // (at: the marked cell, as its row and column, found again after a redraw)
  const rowKey = tr => tr && (tr.dataset.ref || tr.dataset.id);
  const again = () => { if (!at) return null; const tr = [...document.querySelectorAll("table.tbl tr[data-ref],table.tbl tr[data-id]")].find(t => rowKey(t) === at.r); const td = tr && tr.children[at.c]; if (td){ td.classList.add("cell-sel"); tr.classList.add("row-sel"); } return td; };
  const mark = td => { at = td ? { r: rowKey(td.parentElement), c: td.cellIndex } : null; document.querySelectorAll("td.cell-sel").forEach(x => { if (x !== td) x.classList.remove("cell-sel"); }); document.querySelectorAll("tr.row-sel").forEach(x => { if (!td || x !== td.parentElement) x.classList.remove("row-sel"); });
    if (td){ td.classList.add("cell-sel"); td.parentElement.classList.add("row-sel"); } };
  /* (where in an input's text a point falls, so the cursor goes where the double click was) */
  const cv = document.createElement("canvas").getContext("2d");
  function caretAt(el, x){ const cs = getComputedStyle(el), r = el.getBoundingClientRect(); cv.font = cs.font; const v = el.value, rel = x - r.left - parseFloat(cs.paddingLeft) - parseFloat(cs.borderLeftWidth) + el.scrollLeft;
    for (let i = 0; i < v.length; i++){ const w0 = cv.measureText(v.slice(0, i)).width, w1 = cv.measureText(v.slice(0, i + 1)).width; if (rel < (w0 + w1) / 2) return i; } return v.length; }
  function edit(el, x, y){ armed = el; mark(el.closest("td"));
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA"){ el.focus(); const i = x != null ? caretAt(el, x) : el.value.length; try { el.setSelectionRange(i, i); } catch (e){} armed = null; }
    else { el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: x || 0, clientY: y || 0 })); armed = null; } }
  document.addEventListener("mousedown", e => { const el = box(e.target); if (!el){ if (!e.target.closest || !e.target.closest(".pop,.lk-card")) mark(null); return; }
    if (el === document.activeElement || fresh(el) || el === armed) return; e.preventDefault(); if (document.activeElement && document.activeElement.blur && document.activeElement.closest && document.activeElement.closest("table.tbl")) document.activeElement.blur(); mark(el.closest("td")); }, true);
  document.addEventListener("click", e => { const el = box(e.target); if (!el || el === armed || el === document.activeElement || fresh(el)) return;
    e.preventDefault(); e.stopImmediatePropagation(); const tr = el.closest("tr[data-ref]");
    /* (the row is selected a moment later, so a double click isn't lost to the list being redrawn under the second click) */
    clearTimeout(selT); if (tr && typeof App !== "undefined" && App.selRef !== tr.dataset.ref){ const ref = tr.dataset.ref; selT = setTimeout(() => App.select(ref), 260); } }, true);
  document.addEventListener("dblclick", e => { const el = box(e.target); if (!el || fresh(el) || el === document.activeElement) return; e.preventDefault(); e.stopImmediatePropagation(); clearTimeout(selT); edit(el, e.clientX, e.clientY); }, true);
  document.addEventListener("keydown", e => { if (e.key !== "Enter" && e.key !== "F2") return; const a = document.activeElement; if (a && a !== document.body && a.matches("input,textarea,select,button,[contenteditable]")) return;
    const td = (() => { const t = document.querySelector("td.cell-sel"); return t && t.isConnected ? t : again(); })(), el = td && $(ED, td); if (!el || !el.isConnected) return; e.preventDefault(); edit(el); });
  new MutationObserver(() => { if (at && !document.querySelector("td.cell-sel")) again(); }).observe(document.body, { childList: true, subtree: true });
  return { edit, mark };
})();
