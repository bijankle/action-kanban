/* One look everywhere, never the browser's own: every dropdown (<select>) shows as the app's own box and opens the app's
   dropdown card; every box with a suggestion list (<datalist>) shows the app's suggestion card; every date box opens the app's calendar; messages show in the
   app's own window, not the browser's alert. It runs on whatever is drawn, so a new dropdown anywhere gets it too.
   (On a phone the built in pickers stay: they are the best there are there.) */
"use strict";
const Look = (() => {
  const CHEV = '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5"/></svg>';
  let card = null, cardFor = null, openedAt = 0;
  const close = () => { if (card){ card.remove(); card = null; } if (cardFor){ cardFor.setAttribute("aria-expanded", "false"); cardFor = null; } };
  /* the card under a box: options to pick from, the one under the arrow keys lit; typing narrows a long list */
  function open(anchor, items, cur, pick, opts){ close(); opts = opts || {};
    const c = card = h('<div class="pop lk-card" role="listbox"></div>'); cardFor = anchor; openedAt = Date.now(); anchor.setAttribute("aria-expanded", "true");
    /* (the words typed, in bold and underlined in each choice, as on the tags box) */
    const mk = t => { let o = esc(t); (opts.mark || []).concat(q ? [q] : []).filter(Boolean).forEach(w => { const re = new RegExp("(" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "i"); o = o.replace(re, "<mark>$1</mark>"); }); return o; };
    let q = "", hi = Math.max(0, items.findIndex(x => x.v === cur)), shown = items;
    const draw = () => { shown = q ? items.filter(x => x.t.toLowerCase().includes(q.toLowerCase())) : items; hi = Math.min(hi, Math.max(0, shown.length - 1));
      c.innerHTML = (opts.search ? '<input class="in lk-q" placeholder="Type to narrow" aria-label="Narrow the list" value="' + esc(q) + '">' : "")
        + '<div class="lk-ol">' + (shown.length ? shown.map((x, k) => x.grp ? '<div class="lk-g">' + esc(x.t) + '</div>' : '<button type="button" class="lk-o' + (k === hi ? " hi" : "") + (x.v === cur ? " on" : "") + (x.dis ? " dis" : "") + (x.sub ? " lk-2" : "") + '" data-k="' + k + '"' + (x.dis ? " disabled" : "") + '>' + (x.k ? kindSym(x.k) : "") + '<span class="lk-x"><b>' + mk(x.t) + '</b>' + (x.sub ? '<small>' + mk(x.sub) + '</small>' : "") + '</span></button>').join("") : '<div class="dim lk-none">Nothing matches</div>') + '</div>';
      $$(".lk-o", c).forEach(b => b.onmousedown = e => { e.preventDefault(); const x = shown[+b.dataset.k]; close(); pick(x); });
      $$(".lk-o", c).forEach(b => b.onmousemove = () => { const k = +b.dataset.k; if (hi === k || b.disabled) return; hi = k; $$(".lk-o", c).forEach(o => o.classList.toggle("hi", +o.dataset.k === k)); });   // (one choice lit at a time: the mouse moves it like the arrow keys)
      const qi = $(".lk-q", c); if (qi){ qi.oninput = () => { q = qi.value; hi = 0; draw(); const n = $(".lk-q", c); n.focus(); n.setSelectionRange(q.length, q.length); }; qi.onkeydown = key; }
      const o = $(".lk-o.hi", c); if (o) o.scrollIntoView({ block: "nearest" }); };
    const key = e => { const real = shown.filter(x => !x.grp && !x.dis);
      if (e.key === "ArrowDown" || e.key === "ArrowUp"){ e.preventDefault(); let k = hi; do { k = (k + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length; } while ((shown[k].grp || shown[k].dis) && real.length); hi = k; draw(); }
      else if (e.key === "Enter"){ e.preventDefault(); const x = shown[hi]; if (x && !x.grp){ close(); pick(x); } }
      else if (e.key === "Escape"){ e.stopPropagation(); close(); anchor.focus(); } else if (e.key === "Tab") close(); };
    c.__key = key; document.body.appendChild(c); draw();
    const r = anchor.getBoundingClientRect(); c.style.minWidth = Math.min(innerWidth - 16, Math.max(r.width, items.some(x => x.sub) ? 420 : 160)) + "px"; c.style.left = Math.max(8, Math.min(r.left, innerWidth - c.offsetWidth - 8)) + "px";
    const below = innerHeight - r.bottom > Math.min(300, c.offsetHeight + 8); c.style.top = (below ? r.bottom + 3 : Math.max(8, r.top - c.offsetHeight - 3)) + "px";
    const qi = $(".lk-q", c); if (qi) qi.focus();
    return key; }
  document.addEventListener("mousedown", e => { if (card && !card.contains(e.target) && e.target !== cardFor && !(cardFor && cardFor.contains(e.target))) close(); }, true);
  addEventListener("resize", close); document.addEventListener("scroll", e => { if (card && !card.contains(e.target) && Date.now() - openedAt > 400) close(); }, true);   // (not the scroll that brings the box into view as it opens)

  /* a <select>: the app's box in its place (the select stays, hidden, so everything reading or listening to it still works) */
  function sel(s){ if (s.__lk || s.multiple || s.closest(".lk-keep")) return; s.__lk = true;
    const b = h('<button type="button" class="' + (s.className || "in") + ' lk-sel" aria-haspopup="listbox" aria-expanded="false"><span class="lk-t"></span>' + CHEV + '</button>');
    if (s.getAttribute("style")) b.setAttribute("style", s.getAttribute("style")); if (s.title) b.title = s.title; const al = s.getAttribute("aria-label"); if (al) b.setAttribute("aria-label", al);
    s.after(b); s.classList.add("lk-hid"); s.tabIndex = -1;
    const sync = () => { const o = s.options[s.selectedIndex]; $(".lk-t", b).textContent = o ? o.text : ""; b.classList.toggle("lk-ph", !o || o.value === ""); b.disabled = s.disabled; };
    sync(); s.__sync = sync; s.addEventListener("change", sync);
    new MutationObserver(sync).observe(s, { attributes: true, attributeFilter: ["disabled"], childList: true, subtree: true });
    const items = () => { const out = []; [...s.children].forEach(n => { if (n.tagName === "OPTGROUP"){ out.push({ grp: true, t: n.label }); [...n.children].forEach(o => out.push({ v: o.value, t: o.text, dis: o.disabled })); } else if (n.tagName === "OPTION" && !(n.hidden)) out.push({ v: n.value, t: n.text, dis: n.disabled }); }); return out; };
    let key = null;
    b.onclick = () => { if (cardFor === b) return close(); sync(); const it = items(); key = open(b, it, s.value, x => { if (s.value !== x.v){ s.value = x.v; s.dispatchEvent(new Event("input", { bubbles: true })); s.dispatchEvent(new Event("change", { bubbles: true })); } sync(); b.focus(); }, { search: it.length > 12 }); };
    b.onkeydown = e => { if (cardFor === b && key && !$(".lk-q", card)) return key(e); if ((e.key === "ArrowDown" || e.key === " ") && cardFor !== b){ e.preventDefault(); b.onclick(); } };
    /* a value set from code (s.value = …) shows too */
    const d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
    Object.defineProperty(s, "value", { get(){ return d.get.call(this); }, set(v){ d.set.call(this, v); sync(); } }); }

  /* a box with a <datalist>: the app's suggestion card instead of the browser's */
  function sug(i){ if (i.__lk) return; const id = i.getAttribute("list"); if (!id) return; i.__lk = true; i.removeAttribute("list"); i.setAttribute("autocomplete", "off");
    const items = () => { const dl = document.getElementById(id); return dl ? [...dl.options].map(o => ({ v: o.value, t: o.value, sub: o.label && o.label !== o.value ? o.label : (o.textContent && o.textContent !== o.value ? o.textContent : "") })) : []; };
    let key = null;
    const show = () => { const q = i.value.trim().toLowerCase(), all = items(), list = q ? all.filter(x => x.t.toLowerCase().includes(q) && x.t.toLowerCase() !== q) : all;
      if (!list.length){ if (cardFor === i) close(); return; } key = open(i, list.slice(0, 200), null, x => { i.value = x.v; i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true })); close(); }); i.focus(); };
    i.addEventListener("focus", show); i.addEventListener("input", () => { if (document.activeElement === i) show(); });
    i.addEventListener("keydown", e => { if (cardFor === i && key && /^(ArrowDown|ArrowUp|Enter|Escape)$/.test(e.key)) key(e); }, true);
    i.addEventListener("blur", () => setTimeout(() => { if (cardFor === i) close(); }, 150)); }

  /* a date box: the app's calendar (Monday first, Clear and Today) in place of the browser's; the box stays, hidden, holding the value */
  function dat(i){ if (i.__lk) return; i.__lk = true;
    const b = dateBox(i.value, { cls: "lk-dt " + String(i.className || "").replace(/\bin\b/, "").trim(), ph: i.placeholder || "Add date", label: i.getAttribute("aria-label") || i.title || "Date" });
    if (i.title) b.title = i.title; b.disabled = i.readOnly || i.disabled; i.after(b); i.classList.add("lk-hid"); i.tabIndex = -1;
    b.addEventListener("change", e => { e.stopPropagation(); i.value = b.value; i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true })); });
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    Object.defineProperty(i, "value", { get(){ return d.get.call(this); }, set(v){ d.set.call(this, v); b.value = v; } }); }
  function scan(root){ if (TOUCH) return; (root.querySelectorAll ? [...root.querySelectorAll("select")] : []).forEach(sel); (root.querySelectorAll ? [...root.querySelectorAll("input[list]")] : []).forEach(sug); (root.querySelectorAll ? [...root.querySelectorAll('input[type="date"]')] : []).forEach(dat); }
  /* the browser's alert box: the app's own message window instead (the words, an OK button) */
  window.alert = msg => { const m = modal('<h3 class="lk-msg">' + esc(String(msg == null ? "" : msg)) + '</h3><div class="yn-btns"><button class="yn-yes" type="button">OK</button></div>'); const ok = $(".yn-yes", m); ok.onclick = () => m.close(); ok.focus(); };
  const start = () => { scan(document.body); new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1){ if (TOUCH) return; if (n.tagName === "SELECT") sel(n); else if (n.tagName === "INPUT"){ if (TOUCH) return; if (n.type === "date") dat(n); else sug(n); } else scan(n); } }))).observe(document.body, { childList: true, subtree: true }); };
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
  const closeFor = el => { if (cardFor === el) close(); };
  return { open, close, closeFor, scan };
})();
