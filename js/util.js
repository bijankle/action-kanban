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
  return isNaN(d) ? String(v) : d.getDate() + " " + "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ")[d.getMonth()] + " " + d.getFullYear(); }
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
  document.body.appendChild(m);
  const close = () => { m.remove(); document.removeEventListener("keydown", key, true); opts.onClose && opts.onClose(); };
  const key = e => { if (e.key === "Escape" && document.body.lastElementChild === m){ e.stopPropagation(); close(); } };
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
