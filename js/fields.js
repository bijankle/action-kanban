/* How each kind of field shows and is edited. The kinds are set on the Data validation tab:
   text, long text, number, date, tick box, choice (one of a list), multi (tags), contact, phone,
   plus the status (stage) and priority (place in its Organizer column). */
"use strict";
const TYPES = { text: "Text", longtext: "Long text", number: "Number", date: "Date", check: "Tick box", choice: "Choice (one)", multi: "Tags (several)", contact: "Contact name", phone: "Contact number" };
const Fields = (() => {
  const tbc = v => v === "TBC";
  const extra = f => [].concat(f.tbc ? ["TBC"] : [], f.na ? ["N/A"] : []);
  const optLabels = f => (f.options || []).filter(o => !o.del).map(o => o.label);
  const optColor = (f, v) => { const o = (f.options || []).find(x => x.label === v); return o && o.color; };
  const META = { created: a => a.created, modified: a => a.mod, completed: a => a.doneAt };
  const done = a => Store.stage(a.stage).kind === "done";
  const val = (a, f) => f.type === "meta" ? (META[f.id] || (() => null))(a) : f.type === "complete" ? done(a) : f.id === "status" ? a.stage : f.id === "priority" ? Store.priority(a) : f.type === "mto" ? (a.mto || []).length : f.type === "sparelist" ? (a.spares || []).length : f.type === "isollist" ? (a.isol || []).length : (a.f || {})[f.id];
  /* the MTO and spares counts: a link to that action on the MTO or Spares tab */
  const partsLink = (a, f) => { const n = val(a, f); return '<a href="#" class="mto-l' + (n ? "" : " none") + '" data-parts="' + ({ mto: "mto", sparelist: "spares", isollist: "isol" })[f.type] + '" data-ref="' + a._p + ":" + a.u + '">' + (n ? n + (f.type === "isollist" ? " isolation" : " x item") + (n > 1 ? "s" : "") : "None") + '</a>'; };
  /* plain text for search, export and Gemini */
  function text(a, f){ const v = val(a, f); if (f.type === "meta") return v ? fmtDate(v) : ""; if (f.type === "complete") return v ? "Yes" : "No"; if (f.type === "mto" || f.type === "sparelist" || f.type === "isollist") return v ? v + (f.type === "isollist" ? " isolations" : " items") : ""; if (f.type === "stage") return Store.stage(v).name; if (f.type === "check") return v ? "Yes" : "No";
    if (f.type === "date") return fmtDate(v); if (Array.isArray(v)) return v.join(", "); return v == null ? "" : String(v); }
  function chip(label, color){ return '<span class="chip' + (tbc(label) ? " tbc" : "") + '"' + (color && !tbc(label) ? ' style="--c:' + esc(color) + '"' : "") + '>' + esc(label) + '</span>'; }
  /* read only display (table cells, mobile, print) */
  function show(a, f){ const v = val(a, f);
    switch (f.type){
      case "stage": { const s = Store.stage(v); return '<span class="stg" style="--c:' + esc(s.color) + '">' + esc(s.name) + '</span>'; }
      case "rank": return '<b>' + v + '</b>';
      case "mto": case "sparelist": case "isollist": return partsLink(a, f);
      case "meta": return v ? '<span class="meta-d" title="' + esc(new Date(v).toLocaleString()) + '">' + esc(fmtDate(v)) + '</span>' : "";
      case "complete": return v ? '<span class="tick">✓</span>' : "";
      case "check": return v ? '<span class="tick">✓</span>' : "";
      case "multi": { const arr = Array.isArray(v) ? v : []; return arr.map(x => chip(x, optColor(f, x))).join(" "); }
      case "choice": return v ? chip(v, optColor(f, v)) : "";
      case "date": return v ? '<span class="' + (tbc(v) ? "tbc" : "") + '">' + esc(fmtDate(v)) + '</span>' : "";
      case "phone": return v ? '<a href="tel:' + esc(String(v).replace(/\s/g, "")) + '">' + esc(v) + '</a>' : "";
      default: return v == null || v === "" ? "" : '<span class="' + (tbc(v) ? "tbc" : "") + '">' + esc(v) + '</span>'; } }

  function set(a, f, v){ Store.mutate("a:" + a._p, () => {
      if (f.id === "status"){ if (a.stage !== v) Store.place(a, v); Store.log("Moved " + Store.actId(a) + " to " + Store.stage(v).name); return; }
      if (f.type === "complete"){ const fin = Store.stages().find(s => s.kind === "done"), ret = Store.stages().find(s => s.id === a.prevStage && s.kind !== "done") || Store.stages().find(s => s.kind !== "done");
        if (v && !done(a) && fin){ Store.place(a, fin.id, 0); Store.log("Completed " + Store.actId(a)); } else if (!v && done(a) && ret){ Store.place(a, ret.id); Store.log("Reopened " + Store.actId(a)); } return; }
      if (f.id === "priority"){ Store.place(a, a.stage, v - 1); Store.log("Reordered " + Store.actId(a)); return; }
      a.f[f.id] = v; Store.touch(a); Store.log("Edited " + Store.actId(a));
      if (f.type === "contact"){ const c = Store.contacts().find(x => x.name.toLowerCase() === String(v || "").toLowerCase());
        Store.fields().filter(p => p.type === "phone" && p.link === f.id).forEach(p => { if (c && c.mobile) a.f[p.id] = c.mobile; else if (!v || v === "TBC" || v === "N/A") a.f[p.id] = ""; }); }
      if (f.type === "phone" && f.link){ const name = a.f[f.link]; if (name && name !== "TBC" && name !== "N/A" && v){ const c = Store.contacts().find(x => x.name.toLowerCase() === name.toLowerCase());
          if (!c){ Store.S.config.contacts.push(Store.touch({ id: uid(), name, company: "", mobile: v, email: "" })); Store.S.dirty.add("config"); }
          else if (!c.mobile){ c.mobile = v; Store.touch(c); Store.S.dirty.add("config"); } } }
    }); }

  /* the editor for one field, as an element; ro: show only */
  function editor(a, f, ro){ const v = val(a, f);
    if (f.type === "complete" && !ro){ const c = h('<label class="ck ck-done" title="Ticking moves the action to Completed; unticking moves it back"><input type="checkbox"' + (v ? " checked" : "") + '><span></span></label>'); $("input", c).onchange = e => set(a, f, e.target.checked); return c; }
    if (ro || f.type === "meta" || f.type === "mto" || f.type === "sparelist" || f.type === "isollist") return h('<div class="fv">' + (show(a, f) || '<span class="dim">–</span>') + '</div>');
    switch (f.type){
      case "stage": { const s = h('<select class="in sel-stage">' + Store.stages().map(x => '<option value="' + x.id + '"' + (x.id === v ? " selected" : "") + '>' + esc(x.name) + '</option>').join("") + '</select>');
        s.style.setProperty("--c", Store.stage(v).color); s.onchange = () => set(a, f, s.value); return s; }
      case "rank": { const n = Store.ranked(a.stage).length; const s = h('<select class="in">' + Array.from({ length: n }, (_, i) => '<option' + (i + 1 === v ? " selected" : "") + '>' + (i + 1) + '</option>').join("") + '</select>');
        s.onchange = () => set(a, f, +s.value); return s; }
      case "check": { const c = h('<label class="ck"><input type="checkbox"' + (v ? " checked" : "") + '><span></span></label>'); $("input", c).onchange = e => set(a, f, e.target.checked); return c; }
      case "choice": { const opts = optLabels(f).concat(extra(f)); if (v && !opts.includes(v)) opts.push(v);
        const s = h('<select class="in' + (tbc(v) ? " tbc" : "") + '"><option value=""></option>' + opts.map(o => '<option' + (o === v ? " selected" : "") + (tbc(o) ? ' class="tbc"' : "") + '>' + esc(o) + '</option>').join("") + '</select>');
        s.onchange = () => set(a, f, s.value); return s; }
      case "multi": return tagBox(a, f);
      case "contact": return combo(a, f, Store.contacts().map(c => ({ v: c.name, sub: [c.company, c.mobile].filter(Boolean).join("  ") })).concat(extra(f).map(x => ({ v: x }))));
      case "longtext": { const t = h('<textarea class="in ta' + (tbc(v) ? " tbc" : "") + '" rows="3"></textarea>'); t.value = v || ""; grow(t); t.oninput = () => grow(t); t.onchange = () => set(a, f, t.value); return t; }
      case "date": { const w = h('<div class="dt"><input class="in" type="date"><button type="button" class="mini">TBC</button>' + (f.na ? '<button type="button" class="mini">N/A</button>' : "") + '</div>');
        const i = $("input", w); if (v && /^\d{4}-\d\d-\d\d$/.test(v)) i.value = v; else if (v){ i.type = "text"; i.value = v; i.readOnly = true; i.classList.toggle("tbc", tbc(v)); i.title = "Click to pick a date"; i.onclick = () => { i.type = "date"; i.readOnly = false; i.value = ""; i.classList.remove("tbc"); i.showPicker && i.showPicker(); }; }
        i.onchange = () => i.type === "date" && set(a, f, i.value); $$(".mini", w).forEach(b => b.onclick = () => set(a, f, b.textContent)); return w; }
      case "number": { const i = h('<input class="in" type="number">'); i.value = v == null ? "" : v; i.onchange = () => set(a, f, i.value === "" ? "" : +i.value); return i; }
      default: { const i = h('<input class="in' + (tbc(v) ? " tbc" : "") + '" type="' + (f.type === "phone" ? "tel" : "text") + '">'); i.value = v == null ? "" : v;
        if (f.suggest){ const id = "dl_" + f.id; let dl = document.getElementById(id); if (!dl){ dl = h('<datalist id="' + id + '"></datalist>'); document.body.appendChild(dl); }
          dl.innerHTML = [...new Set(Store.all().map(x => x.f[f.id]).filter(Boolean))].sort().map(x => '<option value="' + esc(x) + '">').join(""); i.setAttribute("list", id); }
        i.onchange = () => set(a, f, i.value.trim()); i.onkeydown = e => { if (e.key === "Enter") i.blur(); }; return i; } } }
  function grow(t){ requestAnimationFrame(() => { t.style.height = "auto"; t.style.height = Math.min(420, t.scrollHeight + 2) + "px"; }); }

  /* combo box: type or pick (contacts) */
  function combo(a, f, items){ const v = val(a, f) || "";
    const w = h('<div class="combo"><input class="in' + (tbc(v) ? " tbc" : "") + '" type="text" autocomplete="off"><div class="dd" hidden></div></div>'); const i = $("input", w), dd = $(".dd", w); i.value = v;
    const draw = () => { const q = i.value.toLowerCase(); const list = items.filter(x => !q || x.v.toLowerCase().includes(q) || (x.sub || "").toLowerCase().includes(q));
      dd.innerHTML = list.length ? list.map(x => '<button type="button" class="dd-o" data-v="' + esc(x.v) + '"><span class="' + (tbc(x.v) ? "tbc" : "") + '">' + esc(x.v) + '</span>' + (x.sub ? '<small>' + esc(x.sub) + '</small>' : "") + '</button>').join("") : '<div class="dd-n">New name, it will be added to the contacts</div>';
      $$(".dd-o", dd).forEach(b => b.onmousedown = e => { e.preventDefault(); i.value = b.dataset.v; dd.hidden = true; set(a, f, b.dataset.v); }); };
    i.onfocus = () => { draw(); dd.hidden = false; }; i.oninput = draw;
    i.onblur = () => { dd.hidden = true; if (i.value.trim() !== v) set(a, f, i.value.trim()); };
    i.onkeydown = e => { if (e.key === "Enter") i.blur(); if (e.key === "Escape"){ i.value = v; i.blur(); } };
    return w; }

  /* equipment tags: the first tag, then +N; clicking opens the list of all tags with a box to add new ones */
  function tagBox(a, f){ const v = Array.isArray(val(a, f)) ? val(a, f) : [];
    const w = h('<div class="tagbox"><div class="tb-show">' + (v.length ? chip(v[0], optColor(f, v[0])) : '<span class="dim">None</span>') + '<button type="button" class="tb-more">' + (v.length > 1 ? "+" + (v.length - 1) : "+") + '</button></div></div>');
    $(".tb-show", w).onclick = e => { e.stopPropagation(); openTags(w, a, f); }; return w; }
  function openTags(anchor, a, f){ closePop(); let cur = (Array.isArray(a.f[f.id]) ? a.f[f.id] : []).slice();
    const p = h('<div class="pop tagpop"><input class="in" type="text" placeholder="Search or add a tag…"><div class="tp-l"></div></div>'); document.body.appendChild(p); place(p, anchor);
    const i = $("input", p), l = $(".tp-l", p);
    const commit = () => { if (JSON.stringify(cur) !== JSON.stringify(a.f[f.id] || [])) set(a, f, cur.slice()); };
    const draw = () => { const q = i.value.trim().toLowerCase(); const all = [...new Set(cur.concat(optLabels(f)))].filter(x => !q || x.toLowerCase().includes(q));
      l.innerHTML = all.map(x => '<label class="tp-o"><input type="checkbox"' + (cur.includes(x) ? " checked" : "") + ' data-v="' + esc(x) + '"><span>' + esc(x) + '</span></label>').join("")
        + (q && !all.some(x => x.toLowerCase() === q) ? '<button type="button" class="tp-add">Add “' + esc(i.value.trim()) + '”</button>' : "") + (!all.length && !q ? '<div class="dd-n">No tags yet, type one above</div>' : "");
      $$("input[type=checkbox]", l).forEach(c => c.onchange = () => { const x = c.dataset.v; cur = c.checked ? cur.concat(x) : cur.filter(y => y !== x); });
      const ad = $(".tp-add", l); if (ad) ad.onclick = add; };
    const add = () => { const t = i.value.trim(); if (!t) return; if (!optLabels(f).some(x => x.toLowerCase() === t.toLowerCase())){
        Store.mutate("config", () => { f.options = f.options || []; f.options.push({ id: uid(), label: t, color: "" }); Store.touch(f); }); }
      const ex = optLabels(f).find(x => x.toLowerCase() === t.toLowerCase()) || t; if (!cur.includes(ex)) cur.push(ex); i.value = ""; draw(); i.focus(); };
    i.oninput = draw; i.onkeydown = e => { if (e.key === "Enter"){ e.preventDefault(); add(); } if (e.key === "Escape") closePop(); };
    draw(); i.focus(); p._done = commit; }
  function place(p, anchor){ const r = anchor.getBoundingClientRect(); p.style.left = Math.min(r.left, innerWidth - 290) + "px";
    const below = innerHeight - r.bottom > 300; p.style.top = (below ? r.bottom + 4 : Math.max(8, r.top - 304)) + "px"; }
  function closePop(){ $$(".pop").forEach(p => { p._done && p._done(); p.remove(); }); }
  document.addEventListener("mousedown", e => { if (!e.target.closest(".pop")) closePop(); });
  return { show, text, editor, set, val, closePop, place, chip, optLabels, grow };
})();
