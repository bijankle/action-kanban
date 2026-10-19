/* The Isolations tab of the action view: the action's equipment tags, and its list the isolation points (equipment
   number, name and a note). Typing a number or a name suggests equipment from the Project Library lists
   (mechanical and electrical equipment, valves, instruments) and the Equipment tags list; picking one fills
   both. The row can still be edited afterwards, and that never changes the lists. */
"use strict";
const Equip = (() => {
  const SRC = "https://raw.githubusercontent.com/bijankle/ProjectLibrary/HEAD/search-data.json";
  const KINDS = { mel: [0, 1, "Mech equipment"], elec: [0, 1, "Elec equipment"], cv: [0, 1, "Control valve"], mv: [0, 1, "Manual valve"], ins: [0, 1, "Instrument"] };
  let list = null, loadP = null;
  /* the Project Library list, kept on this device and refreshed once a day */
  function load(force){ if (loadP && !force) return loadP;
    loadP = (async () => { const c = await IDB.get("equip"); if (c && c.items){ list = c.items; if (!force && now() - c.at < 864e5) return list; }
      try { const r = await fetch(lsGet("adEquipSrc", "") || SRC, { cache: "no-store" }); if (!r.ok) throw new Error(r.status); const d = await r.json(), out = [], seen = new Set();
        Object.entries(KINDS).forEach(([k, [ti, ni, label]]) => (d.data && d.data[k] || []).forEach(row => { const t = String(row[ti] || "").trim(); if (!t || seen.has(k + t)) return; seen.add(k + t); out.push({ t, n: String(row[ni] || "").trim(), k: label }); }));
        list = out; IDB.set("equip", { at: now(), items: out }); }
      catch (e){ console.warn("Project Library equipment", e); if (!list) list = []; }
      return list; })();
    return loadP; }
  /* best matches for what's typed, from the tag (field "t") or the name (field "n") */
  function find(q, by){ const w = String(q || "").toLowerCase().split(/\s+/).filter(Boolean); if (!w.length) return [];
    const extra = ((Store.field("equipment") || {}).options || []).filter(o => !o.del).map(o => ({ t: o.label, n: "", k: "Equipment tags" }));
    const all = extra.concat(list || []), first = w[0], out = [];
    for (const it of all){ const t = it.t.toLowerCase(), n = it.n.toLowerCase(), hay = t + " " + n; if (!w.every(x => hay.includes(x))) continue;
      const f = by === "n" ? n : t; out.push([f.startsWith(first) ? 0 : f.includes(first) ? 1 : 2, it]); if (out.length > 4000) break; }
    out.sort((a, b) => a[0] - b[0] || a[1].t.localeCompare(b[1].t)); return out.slice(0, 40).map(x => x[1]); }
  return { load, find, get count(){ return (list || []).length; } };
})();

const Isol = (() => {
  const COLS = [["tag", "Equipment number"], ["name", "Equipment name"], ["note", "Note"]];
  const list = a => a.isol || (a.isol = []);
  const created = new Map();
  /* one action's isolations, drawn into its action view tab; keep is where the cursor was before the redraw */
  function renderFor(el, a, keep){ const ro = !Store.S.edit;
    const s = Store.stage(a.stage), items = list(a), tags = Array.isArray(a.f.equipment) ? a.f.equipment : [], blanks = Math.max(ro ? 0 : 1, 5 - items.length);
    el.innerHTML = '<div class="is-main"><div class="pt-head"><b class="pt-h">Isolations</b><span class="grow"></span><span class="dim is-src">' + (Equip.count ? Equip.count.toLocaleString() + " items from Project Library" : "Loading Project Library equipment…") + ' <button type="button" class="link" data-k="ref">Refresh</button></span></div>'
      + '<div class="is-tags"><b>Subject equipment</b>' + (tags.length ? tags.map(t => '<button type="button" class="is-chip" data-tag="' + esc(t) + '" title="' + (ro ? "" : "Add as an isolation row") + '">' + Fields.chip(t) + (ro ? "" : "<i>+</i>") + '</button>').join("") + (ro ? "" : '<span class="dim is-hint">click a tag to add it as a row</span>') : '<span class="dim">No equipment tags on this action. Add them in its side panel on the Actions tab.</span>') + '</div>'
      + '<table class="tbl pt-tbl is-tbl"><thead><tr><th class="pt-no">No.</th>' + COLS.map(([k, n]) => '<th class="is-' + k + '">' + esc(n) + '</th>').join("") + '<th class="pt-act"></th></tr></thead><tbody>'
      + items.map((it, i) => '<tr data-id="' + it.id + '"><td class="pt-no">' + (i + 1) + '</td>' + COLS.map(([k]) => cell(it.id, k, it[k], ro)).join("") + '<td class="pt-act">' + (ro ? "" : '<button type="button" class="ic-b sm pt-x" title="Remove this row">✕</button>') + '</td></tr>').join("")
      + Array.from({ length: blanks }, (_, k) => '<tr class="pt-blank"><td class="pt-no"></td>' + COLS.map(([c]) => cell("new" + k, c, "", ro)).join("") + '<td></td></tr>').join("") + '</tbody></table>'
      + '<div class="dim pt-foot">' + (items.length ? items.length + " isolation" + (items.length > 1 ? "s" : "") : "Empty, type an equipment number or name to start") + '. Picking a suggestion fills in the number and the name; you can still edit them, and that doesn\'t change the lists.</div></div>';
    $("[data-k=ref]", el).onclick = () => { note("Refreshing the Project Library equipment…"); Equip.load(true).then(() => { note(Equip.count.toLocaleString() + " equipment items loaded"); App.render(); }); };
    if (!Equip.count) Equip.load().then(() => { if (App.sub === "isol" && Equip.count) App.render(); });
    wire(el, a, ro);
    if (!ro) $$(".is-chip", el).forEach(b => b.onclick = () => { const t = b.dataset.tag, x = Equip.find(t, "t").find(y => y.t.toLowerCase() === t.toLowerCase() && y.n);
      put(a, "new-chip", { tag: t, name: x ? x.n : "" }); created.delete("new-chip"); });
    if (keep && keep.c){ let r = keep.r; if (created.has(r)){ r = created.get(r); created.delete(keep.r); } const t = $('[data-r="' + r + '"][data-c="' + keep.c + '"]', el); if (t){ if (t.value !== keep.v) t.value = keep.v; t.focus(); try { t.setSelectionRange(keep.s, keep.s); } catch (e) {} } } }
  const cell = (r, c, v, ro) => '<td' + (c !== "note" ? ' class="is-cb"' : "") + '><input class="in pt-in" autocomplete="off" data-r="' + r + '" data-c="' + c + '" value="' + esc(v || "") + '"' + (ro ? " readonly" : "") + '></td>';
  /* write one or both of a row's values; a blank row becomes a new isolation */
  function put(a, r, vals){ const key = "a:" + a._p, items = list(a);
    if (String(r).startsWith("new")){ if (!Object.values(vals).some(Boolean)) return; const it = Object.assign({ id: uid() }, vals); created.set(r, it.id); Store.mutate(key, () => { items.push(it); Store.touch(a); }); Store.log("Added an isolation to " + Store.actId(a)); return; }
    const it = items.find(x => x.id === r); if (!it || Object.keys(vals).every(k => (it[k] || "") === vals[k])) return; Store.mutate(key, () => { Object.assign(it, vals); Store.touch(a); }); Store.log("Edited an isolation on " + Store.actId(a)); }
  function wire(el, a, ro){
    $$(".pt-x", el).forEach(b => b.onclick = () => { const id = b.closest("tr").dataset.id; Store.mutate("a:" + a._p, () => { const i = list(a).findIndex(x => x.id === id); list(a).splice(i, 1); Store.touch(a); }); });
    $$(".pt-in", el).forEach(i => { if (ro) return; const c = i.dataset.c;
      i.onchange = () => { if (i._picked) return; put(a, i.dataset.r, { [c]: i.value.trim() }); };
      if (c === "note"){ i.onkeydown = e => { if (e.key === "Enter"){ e.preventDefault(); i.blur(); } }; return; }
      /* suggestions under the number and name boxes */
      let dd = null, hi = 0, res = [];
      const close = () => { dd && dd.remove(); dd = null; };
      const draw = () => { res = Equip.find(i.value, c === "tag" ? "t" : "n"); close(); if (!res.length || !i.value.trim()) return; hi = Math.min(hi, res.length - 1);
        dd = h('<div class="is-dd">' + res.map((x, k) => '<button type="button" class="is-o' + (k === hi ? " on" : "") + '" data-k="' + k + '"><b>' + esc(x.t) + '</b><span>' + esc(x.n || "") + '</span><small>' + esc(x.k) + '</small></button>').join("") + '</div>');
        document.body.appendChild(dd); const rc = i.getBoundingClientRect(); dd.style.left = rc.left + "px"; dd.style.width = Math.max(rc.width, 460) + "px";
        const below = innerHeight - rc.bottom > 260; dd.style.top = (below ? rc.bottom + 3 : Math.max(8, rc.top - 263)) + "px";
        $$(".is-o", dd).forEach(b => b.onmousedown = e => { e.preventDefault(); pick(res[+b.dataset.k]); }); };
      const pick = x => { i._picked = true; close(); i.value = c === "tag" ? x.t : x.n; put(a, i.dataset.r, { tag: x.t, name: x.n }); setTimeout(() => i._picked = false, 0); };
      i.oninput = () => { hi = 0; draw(); };
      i.onfocus = () => { if (i.value.trim()) draw(); };
      i.onblur = () => setTimeout(close, 120);
      i.onkeydown = e => { if (dd && (e.key === "ArrowDown" || e.key === "ArrowUp")){ e.preventDefault(); hi = (hi + (e.key === "ArrowDown" ? 1 : -1) + res.length) % res.length; $$(".is-o", dd).forEach((b, k) => b.classList.toggle("on", k === hi)); const o = $$(".is-o", dd)[hi]; o && o.scrollIntoView({ block: "nearest" }); }
        else if (e.key === "Enter"){ e.preventDefault(); if (dd && res[hi]) pick(res[hi]); else i.blur(); }
        else if (e.key === "Escape" && dd){ e.stopPropagation(); close(); } }; }); }
  return { renderFor };
})();
