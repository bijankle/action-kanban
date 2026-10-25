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
  const DERIVED = { eta: a => Store.eta(a) };   // (from the Materials tab, not typed in; the tick boxes are all ticked by hand, or by the stage)
  const val = (a, f) => f.id === "onhold" ? Hold.on(a) : DERIVED[f.id] ? DERIVED[f.id](a) : f.type === "meta" ? (META[f.id] || (() => null))(a) : f.type === "complete" ? done(a) : f.id === "status" ? a.stage : f.id === "priority" ? Store.priority(a) : f.type === "mto" ? (a.mto || []).length : f.type === "sparelist" ? (a.spares || []).length : f.type === "isollist" ? (a.isol || []).length : (a.f || {})[f.id];
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

  function set(a, f, v){ if (f.id === "title" && typeof v === "string") v = properTitle(v);   // (titles in proper case)
    if (!["stage", "rank", "complete"].includes(f.type) && JSON.stringify(a.f[f.id] == null ? "" : a.f[f.id]) === JSON.stringify(v == null ? "" : v)) return;   // nothing changed
    Store.mutate("a:" + a._p, () => {
      if (f.id === "status"){ if (a.stage !== v) Store.place(a, v); Store.log("Moved " + Store.actId(a) + " to " + Store.stage(v).name); return; }
      if (f.type === "complete"){ const fin = Store.stages().find(s => s.kind === "done"), ret = Store.stages().find(s => s.id === a.prevStage && s.kind !== "done") || Store.stages().find(s => s.kind !== "done");
        if (v && !done(a) && fin){ Store.place(a, fin.id, 0); Store.log("Completed " + Store.actId(a)); } else if (!v && done(a) && ret){ Store.place(a, ret.id); Store.log("Reopened " + Store.actId(a)); } return; }
      /* the On hold tick: ticking it puts the action on hold (the i beside it then asks who it's waiting on); unticking takes it back to where it came from */
      if (f.id === "onhold"){ const hold = Store.stages().find(s => s.kind === "hold"), back = Store.stages().find(s => s.id === a.prevHold && s.kind !== "hold") || Store.stages()[0];
        if (v && hold && !Hold.on(a)){ Store.place(a, hold.id); Store.log("Put " + Store.actId(a) + " on hold"); } else if (!v && Hold.on(a)){ Store.place(a, back.id); Store.log("Took " + Store.actId(a) + " off hold"); } return; }
      if (f.id === "priority"){ Store.place(a, a.stage, v - 1); Store.log("Reordered " + Store.actId(a)); return; }
      a.f[f.id] = v; Store.touch(a); Store.log("Edited " + Store.actId(a));
      /* a stage's tick box moves the action on the Organizer. Ticking it moves the action on when nothing before it is
         still waiting: past that stage, and past any later stage already ticked (a contractor booked early), stopping at
         the first one still to do, never into Done by itself. A box ticked ahead of time just records it: the action
         stays where it is until the earlier box is ticked. Unticking a box takes the action back to that stage. On hold
         and done actions just keep the tick */
      if (f.stage && f.type === "check" && !Hold.on(a) && !done(a)){ const order = Store.stages().filter(s => s.kind !== "hold"), at = id => order.findIndex(s => s.id === id), k = at(f.stage), cur = at(a.stage);
        const box = st => Store.fields().find(x => x.stage === st.id && x.type === "check"), ticked = st => { const x = box(st); return !!x && !!a.f[x.id]; };
        if (k >= 0 && cur >= 0){
          if (v && cur <= k && order.slice(cur, k).every(st => !box(st) || ticked(st))){ let n = k + 1; while (order[n] && order[n].kind !== "done" && ticked(order[n])) n++;
            const next = order[n]; if (next && next.kind !== "done" && n !== cur){ Store.place(a, next.id); Store.log("Moved " + Store.actId(a) + " to " + Store.todo(next)); } }
          else if (!v && cur > k){ Store.place(a, f.stage); Store.log("Moved " + Store.actId(a) + " back to " + Store.todo(Store.stage(f.stage))); } } }
      const auto = a.auto = a.auto || {}; delete auto[f.id]; if (f.id === "location") delete a.locAuto;
      const fill = (id, val) => { if (a.f[id] && !auto[id] && !(id === "location" && a.locAuto)) return; if (val){ a.f[id] = val; auto[id] = true; } else if (auto[id]){ a.f[id] = ""; delete auto[id]; } };
      /* the location follows the equipment's WBS area until someone types their own */
      if (f.id === "equipment"){ fill("location", (Array.isArray(v) ? v : []).map(t => Equip.areaOf(t)).find(Boolean)); if (auto.location) delete a.locAuto; }
      /* the contractor's company brings its contact and number from the last job with that company */
      if (f.id === "contractor"){ const prev = Store.all().filter(x => x !== a && x.f.contractor && x.f.contractor.toLowerCase() === String(v || "").toLowerCase() && x.f.contractorContact).sort((x, y) => (y.mod || 0) - (x.mod || 0))[0],
          ct = !prev && v ? Store.contacts().find(c => (c.company || "").toLowerCase() === String(v).toLowerCase()) : null;
        fill("contractorContact", prev ? prev.f.contractorContact : ct ? ct.name : ""); fill("contractorPhone", prev ? prev.f.contractorPhone : ct ? ct.mobile : ""); }
      /* the contact brings their number (from Contacts, else their last job), and their company if it's empty */
      if (f.id === "contractorContact"){ const n = String(v || "").toLowerCase(), c = Store.contacts().find(x => x.name.toLowerCase() === n), prev = Store.all().filter(x => x !== a && (x.f.contractorContact || "").toLowerCase() === n && x.f.contractorPhone).sort((x, y) => (y.mod || 0) - (x.mod || 0))[0];
        if (n && n !== "tbc" && n !== "n/a"){ fill("contractorPhone", (c && c.mobile) || (prev && prev.f.contractorPhone) || ""); fill("contractor", (c && c.company) || (prev && prev.f.contractor) || ""); } else fill("contractorPhone", ""); }
      if (f.type === "contact" && f.id !== "contractorContact"){ const c = Store.contacts().find(x => x.name.toLowerCase() === String(v || "").toLowerCase());
        Store.fields().filter(p => p.type === "phone" && p.link === f.id).forEach(p => { if (c && c.mobile) a.f[p.id] = c.mobile; else if (!v || v === "TBC" || v === "N/A") a.f[p.id] = ""; }); }
      if (f.type === "phone" && f.link){ const name = a.f[f.link]; if (name && name !== "TBC" && name !== "N/A" && v){ const c = Store.contacts().find(x => x.name.toLowerCase() === name.toLowerCase());
          if (!c){ Store.S.config.contacts.push(Store.touch({ id: uid(), name, company: f.link === "contractorContact" ? a.f.contractor || "" : "", mobile: v, email: "" })); Store.S.dirty.add("config"); }
          else if (!c.mobile){ c.mobile = v; Store.touch(c); Store.S.dirty.add("config"); } } }
    }); }

  /* the editor for one field, as an element; ro: show only */
  /* a box filled in from a linked box (the location from the equipment, the contractor's contact from the company,
     the number from the contact) shows in the theme colour until someone types over it (a.auto) */
  const isAuto = (a, f) => !!((a.auto || {})[f.id] || (f.id === "location" && a.locAuto));
  const LINKED = { location: "the equipment's WBS area", contractorContact: "the company's last contact", contractorPhone: "the contact's number" };
  function editor(a, f, ro){ const el = editor0(a, f, ro); if (!ro && isAuto(a, f) && a.f[f.id]){ el.classList.add("lk"); el.title = "Filled in from " + (LINKED[f.id] || "a linked box") + ". Type over it to change it."; } return el; }
  function editor0(a, f, ro){ const v = val(a, f);
    if (f.type === "complete" && !ro){ const c = h('<label class="ck ck-done" title="Ticking moves the action to Completed; unticking moves it back"><input type="checkbox"' + (v ? " checked" : "") + '><span></span></label>'); $("input", c).onchange = e => set(a, f, e.target.checked); return c; }
    if (ro || DERIVED[f.id] || f.type === "meta" || f.type === "mto" || f.type === "sparelist" || f.type === "isollist") return h('<div class="fv">' + (show(a, f) || '<span class="dim">–</span>') + '</div>');
    switch (f.type){
      case "stage": { const back = Store.stage(v).kind === "hold" && a.prevHold && Store.stages().find(x => x.id === a.prevHold && x.kind !== "hold");   // (On Hold offers the way back to where it came from)
        const s = h('<select class="in sel-stage">' + (back ? '<option value="' + back.id + '">↩ Back to ' + esc(back.name) + '</option>' : "") + Store.stages().map(x => '<option value="' + x.id + '"' + (x.id === v ? " selected" : "") + '>' + esc(x.name) + '</option>').join("") + '</select>');
        s.style.setProperty("--c", Store.stage(v).color); s.onchange = () => set(a, f, s.value); return s; }
      case "rank": { const n = Store.ranked(a.stage).length; const s = h('<select class="in">' + Array.from({ length: n }, (_, i) => '<option' + (i + 1 === v ? " selected" : "") + '>' + (i + 1) + '</option>').join("") + '</select>');
        s.onchange = () => set(a, f, +s.value); return s; }
      case "check": { const c = h('<label class="ck"><input type="checkbox"' + (v ? " checked" : "") + '><span></span></label>'); $("input", c).onchange = e => set(a, f, e.target.checked); return c; }
      /* choices suggest, they don't restrict: pick one of the list or type your own (which isn't added to the list) */
      case "choice": return combo(a, f, optLabels(f).map(o => ({ v: o, c: optColor(f, o) })).concat(extra(f).map(x => ({ v: x }))), true);
      case "multi": return tagBox(a, f);
      case "contact": { const co = String(a.f.contractor || "").toLowerCase(), seen = new Set(), its = [];
        Store.contacts().slice().sort((x, y) => ((y.company || "").toLowerCase() === co) - ((x.company || "").toLowerCase() === co)).forEach(c => { seen.add(c.name.toLowerCase()); its.push({ v: c.name, sub: [c.company, c.mobile].filter(Boolean).join("  ") }); });
        if (f.id === "contractorContact") Store.all().forEach(x => { const n = x.f.contractorContact; if (n && !seen.has(n.toLowerCase()) && !/^(TBC|N\/A)$/.test(n)){ seen.add(n.toLowerCase()); its.push({ v: n, sub: [x.f.contractor, x.f.contractorPhone].filter(Boolean).join("  ") }); } });
        return combo(a, f, its.concat(extra(f).map(x => ({ v: x })))); }
      case "longtext": { const t = h('<textarea class="in ta' + (tbc(v) ? " tbc" : "") + '" rows="3"></textarea>'); t.value = v || ""; grow(t); t.oninput = () => grow(t); t.onchange = () => set(a, f, t.value); return t; }
      case "date": { const w = h('<div class="dt"><input class="in" type="date"><button type="button" class="mini">TBC</button>' + (f.na ? '<button type="button" class="mini">N/A</button>' : "") + '</div>');
        const i = $("input", w); if (v && /^\d{4}-\d\d-\d\d$/.test(v)) i.value = v; else if (v){ i.type = "text"; i.value = v; i.readOnly = true; i.classList.toggle("tbc", tbc(v)); i.title = "Click to pick a date"; i.onclick = () => { i.type = "date"; i.readOnly = false; i.value = ""; i.classList.remove("tbc"); i.showPicker && i.showPicker(); }; }
        i.onchange = () => i.type === "date" && set(a, f, i.value); $$(".mini", w).forEach(b => b.onclick = () => set(a, f, b.textContent)); return w; }
      case "number": { const i = h('<input class="in" type="number">'); i.value = v == null ? "" : v; i.onchange = () => set(a, f, i.value === "" ? "" : +i.value); return i; }
      default: { const i = h('<input class="in' + (tbc(v) ? " tbc" : "") + '" type="' + (f.type === "phone" ? "tel" : "text") + '">'); i.value = v == null ? "" : v;
        if (f.suggest){ const id = "dl_" + f.id; let dl = document.getElementById(id); if (!dl){ dl = h('<datalist id="' + id + '"></datalist>'); document.body.appendChild(dl); }
          dl.innerHTML = [...new Set(Store.all().map(x => x.f[f.id]).filter(Boolean).concat(f.id === "location" ? [...Equip.areas().values()] : f.id === "contractor" ? Store.contacts().map(c => c.company) : []).filter(Boolean))].sort().map(x => '<option value="' + esc(x) + '">').join(""); i.setAttribute("list", id); }
        i.onchange = () => set(a, f, i.value.trim()); i.onkeydown = e => { if (e.key === "Enter") i.blur(); }; return i; } } }
  function grow(t){ requestAnimationFrame(() => { t.style.height = "auto"; t.style.height = Math.min(420, t.scrollHeight + 2) + "px"; }); }

  /* combo box: type or pick (contacts) */
  function combo(a, f, items, all){ const v = val(a, f) || "";
    const w = h('<div class="combo"><input class="in' + (tbc(v) ? " tbc" : "") + '" type="text" autocomplete="off"><div class="dd" hidden></div></div>'); const i = $("input", w), dd = $(".dd", w); i.value = v;
    const draw = () => { const q = all && i.value === v ? "" : i.value; const list = items.filter(x => smartHit(x.v + " " + (x.sub || ""), q));
      dd.innerHTML = list.length ? list.map(x => '<button type="button" class="dd-o" data-v="' + esc(x.v) + '"><span class="' + (tbc(x.v) ? "tbc" : "") + '"' + (x.c ? ' style="box-shadow:inset 3px 0 0 ' + esc(x.c) + ';padding-left:7px"' : "") + '>' + esc(x.v) + '</span>' + (x.sub ? '<small>' + esc(x.sub) + '</small>' : "") + '</button>').join("") : '<div class="dd-n">' + (f.type === "contact" ? "New name, it will be added to the contacts" : "Not in the list; it's kept just for this action") + '</div>';
      $$(".dd-o", dd).forEach(b => b.onmousedown = e => { e.preventDefault(); i.value = b.dataset.v; dd.hidden = true; set(a, f, b.dataset.v); }); };
    i.onfocus = () => { draw(); dd.hidden = false; }; i.oninput = draw;
    i.onblur = () => { dd.hidden = true; if (i.value.trim() !== v) set(a, f, i.value.trim()); };
    i.onkeydown = e => { if (e.key === "Enter") i.blur(); if (e.key === "Escape"){ e.stopPropagation(); i.value = v; i.blur(); } };
    return w; }

  /* equipment tags: the first tag, then +N; clicking opens the list of all tags with a box to add new ones */
  /* tags (equipment and the like): typed straight into the box, several split by commas. As you type, the box finishes the
     tag from the plant lists (or the tags used before) in place, the way Excel finishes a word: Tab or Enter keeps it, carrying
     on typing replaces it. Nothing pops up over the rows below. */
  /* the dropdown of candidates on a tags box, used by every tags box (the list, an action, the New action window):
     typing shows the matching candidates under the box, the plant equipment and instruments for tags (spaces and
     dashes don't matter, so cv 402 finds F12-CV-402), the list's own options otherwise. Arrows move, Enter, Tab or a
     click picks, Escape closes. A picked tag ends the box; the next letter typed starts a new tag after a comma */
  function suggest(i, f){ const eq = f.id === "equipment";
    const pool = () => eq ? [] : optLabels(f).concat(...Store.all().map(x => Array.isArray(x.f[f.id]) ? x.f[f.id] : []));
    let dd = null, res = [], hi = 0;
    const seg = () => { const cut = i.value.lastIndexOf(","); return { head: cut < 0 ? "" : i.value.slice(0, cut + 1) + " ", q: i.value.slice(cut + 1).trimStart() }; };
    const closeDD = () => { if (dd){ dd.remove(); dd = null; } i.setAttribute("aria-expanded", "false"); };
    const mark = (t, w) => { let o = esc(t); w.forEach(x => { const re = new RegExp("(" + x.split("").map(c => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^a-z0-9]*") + ")", "i"); o = o.replace(re, "<mark>$1</mark>"); }); return o; };
    const paint = () => { if (!dd) return; $$(".tg-o", dd).forEach((o, k) => { o.classList.toggle("on", k === hi); if (k === hi) o.scrollIntoView({ block: "nearest" }); }); };
    const draw = () => { const { q } = seg(), w = qWords(q); if (!w.length){ closeDD(); return; }
      const have = new Set(i.value.split(",").map(t => t.trim().toLowerCase()).filter(Boolean));
      res = (eq ? (Equip.find(q, "t") || []).map(x => ({ t: x.t, n: x.n ? x.n.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : "", k: x.k })) : [...new Set(pool())].filter(t => smartHit(t, w)).map(t => ({ t, n: "" })))
        .filter(x => !have.has(x.t.toLowerCase()) || x.t.toLowerCase() === q.trim().toLowerCase()).slice(0, 40);
      if (!res.length){ closeDD(); return; } hi = 0;
      if (!dd){ dd = h('<div class="tg-dd" role="listbox"></div>'); document.body.appendChild(dd); }
      dd.innerHTML = res.map((x, k) => '<div class="tg-o" role="option" data-k="' + k + '"><b>' + mark(x.t, w) + '</b>' + (x.n ? '<span>' + mark(x.n, w) + '</span>' : "") + (x.k ? '<i>' + esc(x.k) + '</i>' : "") + '</div>').join("");
      const r = i.getBoundingClientRect(), below = innerHeight - r.bottom > 260; Object.assign(dd.style, { left: Math.max(8, Math.min(r.left, innerWidth - 428)) + "px", width: Math.max(r.width, 420) + "px", top: (below ? r.bottom + 3 : Math.max(8, r.top - 263)) + "px" });
      i.setAttribute("aria-expanded", "true"); paint();
      $$(".tg-o", dd).forEach(o => { o.onmousedown = e => { e.preventDefault(); pick(res[+o.dataset.k]); }; o.onmousemove = () => { if (hi !== +o.dataset.k){ hi = +o.dataset.k; paint(); } }; }); };
    let sep = false;
    const pick = x => { const { head } = seg(); i.value = head + x.t; const n = i.value.length; i.setSelectionRange(n, n); closeDD(); i.focus(); sep = true; };
    i.setAttribute("role", "combobox"); i.setAttribute("aria-autocomplete", "list"); i.setAttribute("aria-expanded", "false"); i.autocomplete = "off"; i.spellcheck = false;
    i.addEventListener("focus", () => { if (eq) Equip.load().catch(() => {}); sep = !!i.value.trim() && !/,\s*$/.test(i.value); const n0 = i.value.length; setTimeout(() => { if (i.value.length === n0) i.setSelectionRange(n0, n0); }, 0); });
    i.addEventListener("input", () => { if (eq && !Equip.count) Equip.load().then(() => document.activeElement === i && draw()).catch(() => {}); draw(); });
    i.addEventListener("blur", closeDD);
    i.addEventListener("beforeinput", e => { if (!sep) return; if (e.inputType !== "insertText"){ if (/^delete/.test(e.inputType)) sep = false; return; }
      sep = false; if (i.selectionStart !== i.value.length || /^[,\s]/.test(e.data || "")) return; e.preventDefault(); i.value += ", " + e.data; const n = i.value.length; i.setSelectionRange(n, n); i.dispatchEvent(new Event("input")); });
    i.addEventListener("keydown", e => { if (e.key === ","){ sep = false; return; } if (!dd) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp"){ e.preventDefault(); hi = (hi + (e.key === "ArrowDown" ? 1 : -1) + res.length) % res.length; paint(); }
      else if ((e.key === "Enter" || e.key === "Tab") && res[hi]){ e.preventDefault(); pick(res[hi]); }
      else if (e.key === "Escape"){ e.stopPropagation(); closeDD(); }
      else return;
      e.stopImmediatePropagation(); });
    return i; }
  function tagBox(a, f){ const v = Array.isArray(val(a, f)) ? val(a, f) : [], eq = f.id === "equipment";
    const nm = t => { const e = eq && Equip.get(t); return e && e.n ? e.n.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : ""; };
    const w = h('<div class="tagbox"><input class="in tagin" type="text" spellcheck="false" autocomplete="off" placeholder="' + (eq ? "Add tag" : "Add " + esc(f.label.toLowerCase())) + '"></div>'), i = $("input", w);
    const show = () => { i.value = v.join(", "); i.title = v.map(t => t + (nm(t) ? "  " + nm(t) : "")).join("\n"); }; show();
    if (!Store.S.edit){ i.readOnly = true; return w; }
    suggest(i, f);
    const commit = () => { let tags = i.value.split(",").map(t => t.trim()).filter(Boolean);
      tags = tags.map(t => { if (eq){ const hit = (Equip.find(t, "t") || []).find(x => x.t.toLowerCase() === t.toLowerCase()); return hit ? hit.t : t.toUpperCase(); } return optLabels(f).find(x => x.toLowerCase() === t.toLowerCase()) || t; });
      tags = [...new Set(tags)];
      if (!eq){ const fresh = tags.filter(t => !optLabels(f).includes(t)); if (fresh.length) Store.mutate("config", () => { f.options = f.options || []; fresh.forEach(t => f.options.push({ id: uid(), label: t, color: "" })); Store.touch(f); }); }
      if (JSON.stringify(tags) !== JSON.stringify(v)) set(a, f, tags); else show(); };
    i.onblur = commit;
    i.onkeydown = e => { if (e.key === "Enter"){ e.preventDefault(); i.blur(); }
      else if (e.key === "Escape"){ show(); i.blur(); } };
    return w; }
  function openTags(anchor, a, f){ closePop(); let cur = (Array.isArray(a.f[f.id]) ? a.f[f.id] : []).slice();
    const p = h('<div class="pop tagpop"><input class="in" type="text" placeholder="Search or add a tag…"><div class="tp-l"></div></div>'); document.body.appendChild(p); place(p, anchor);
    const i = $("input", p), l = $(".tp-l", p);
    const commit = () => { if (JSON.stringify(cur) !== JSON.stringify(a.f[f.id] || [])) set(a, f, cur.slice()); };
    /* equipment tags: every tag in the plant lists, searched by tag or name (the ones chosen first) */
    const eq = f.id === "equipment"; if (eq) Equip.load().then(() => p.isConnected && draw()).catch(() => {});
    const draw = () => { const q = i.value.trim().toLowerCase(); const found = eq && q ? Equip.find(q, /^[a-z]{0,2}\d/i.test(q) ? "t" : "n").map(x => x.t) : [];
      const all = [...new Set(cur.concat(eq ? found : optLabels(f)))].filter(x => !q || cur.includes(x) || found.includes(x) || smartHit(x, q));
      const nm = x => { const e = eq && Equip.get(x); return e && e.n ? '<small>' + esc(e.n) + '</small>' : ""; };
      l.innerHTML = (eq && !q && !cur.length ? '<div class="dd-n">Type a tag or a name, e.g. F13-MB-401 or ball mill</div>' : "") + all.map(x => '<label class="tp-o"><input type="checkbox"' + (cur.includes(x) ? " checked" : "") + ' data-v="' + esc(x) + '"><span>' + esc(x) + nm(x) + '</span></label>').join("")
        + (q && !all.some(x => x.toLowerCase() === q) ? '<button type="button" class="tp-add">Add “' + esc(i.value.trim()) + '”</button>' : "") + (!all.length && !q && !eq ? '<div class="dd-n">No tags yet, type one above</div>' : "");
      $$("input[type=checkbox]", l).forEach(c => c.onchange = () => { const x = c.dataset.v; cur = c.checked ? cur.concat(x) : cur.filter(y => y !== x); });
      const ad = $(".tp-add", l); if (ad) ad.onclick = add; };
    const add = () => { const t = i.value.trim(); if (!t) return; if (eq){ const hit = Equip.find(t, "t")[0]; const x = hit && hit.t.toLowerCase() === t.toLowerCase() ? hit.t : t.toUpperCase(); if (!cur.includes(x)) cur.push(x); i.value = ""; draw(); i.focus(); return; }
      if (!optLabels(f).some(x => x.toLowerCase() === t.toLowerCase())){
        Store.mutate("config", () => { f.options = f.options || []; f.options.push({ id: uid(), label: t, color: "" }); Store.touch(f); }); }
      const ex = optLabels(f).find(x => x.toLowerCase() === t.toLowerCase()) || t; if (!cur.includes(ex)) cur.push(ex); i.value = ""; draw(); i.focus(); };
    i.oninput = draw; i.onkeydown = e => { if (e.key === "Enter"){ e.preventDefault(); add(); } if (e.key === "Escape"){ e.stopPropagation(); closePop(); } };
    draw(); i.focus(); p._done = commit; }
  function place(p, anchor){ const r = anchor.getBoundingClientRect(); p.style.left = Math.min(r.left, innerWidth - 290) + "px";
    const below = innerHeight - r.bottom > 300; p.style.top = (below ? r.bottom + 4 : Math.max(8, r.top - 304)) + "px"; }
  /* a text field opened over its box in full to read and edit: saved when you click away or press Ctrl+Enter (Enter too
     for one line fields like the title), Esc to leave it as it was */
  function textPop(anchor, a, f){ closePop(); const r = anchor.getBoundingClientRect(), one = f.type !== "longtext";
    const p = h('<div class="pop ltpop"><div class="ltpop-h"><b>' + esc(Store.actId(a)) + '</b> ' + esc(f.label) + '</div><textarea class="in ta" rows="' + (one ? 2 : 5) + '"></textarea><div class="dim sm-t">Saved when you click away' + (one ? " or press Enter" : "") + '. Esc to cancel.</div></div>');
    const ta = $("textarea", p), was = String(a.f[f.id] || ""); ta.value = was; document.body.appendChild(p);
    const w = Math.max(r.width, 340); p.style.width = Math.min(w, innerWidth - 16) + "px"; p.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + "px"; p.style.top = Math.max(8, Math.min(r.top, innerHeight - p.offsetHeight - 8)) + "px";
    const grow = () => { ta.style.height = "auto"; ta.style.height = Math.min(innerHeight * 0.6, ta.scrollHeight + 2) + "px"; }; ta.oninput = grow; grow();
    let keep = true; p._done = () => { const v = one ? ta.value.replace(/\s*\n\s*/g, " ").trim() : ta.value; if (keep && v !== was) set(a, f, v); };
    ta.onkeydown = ev => { if (ev.key === "Escape"){ ev.stopPropagation(); keep = false; closePop(); } else if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey || one)){ ev.preventDefault(); closePop(); } };
    ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); return p; }
  function closePop(){ $$(".pop").forEach(p => { p._done && p._done(); p.remove(); }); }
  document.addEventListener("mousedown", e => { if (!e.target.closest(".pop, .pj-b, #profB")) closePop(); });
  return { DERIVED, show, text, editor, set, val, closePop, place, chip, optLabels, grow, suggest, textPop };
})();
