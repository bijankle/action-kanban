/* The Isolations tab of the action view: one table of the isolation points (equipment number, name and a note), the
   picked ones on top and the suggestions for the action's Tags under them. Typing a number or a name suggests equipment
   from the plant equipment lists (mechanical and electrical equipment, valves, instruments) and the Equipment tags list;
   picking one fills both. The row can still be edited afterwards, and that never changes the lists. */
"use strict";
const Equip = (() => {
  const SRC = "https://raw.githubusercontent.com/bijankle/ProjectLibrary/HEAD/search-data.json";   // where the plant equipment lists live
  /* every asset list in the Project Library (not its drawings or documents): [tag column, name column, kind]; a cable is named by its two ends */
  const KINDS = { mel: [0, 1, "Mech equipment"], elec: [0, 1, "Elec equipment"], elx: [0, 1, "Elec equipment"], cv: [0, 1, "Control valve"], mv: [0, 1, "Manual valve"], ins: [0, 1, "Instrument"],
    line: [0, 2, "Pipe line"], spi: [0, 2, "Pipe special"], hose: [0, 1, "Hose"], ctl: [0, 1, "Control tag"], cable: [0, r => [r[1], r[4]].filter(Boolean).join(" to "), "Cable"] };
  const KV = 2;   // (bumped when KINDS changes, so the copy on this device is rebuilt at once)
  let list = null, loadP = null, raw = null;
  /* the plant equipment lists, kept on this device and refreshed once a day */
  /* the plant lists give some equipment the same name (F10-MG-01 and F10-MG-02 are both TRAMP MAGNET): where tags of
     the same area and type share a name, the tag's own number is added to it (Tramp Magnet 1, Tramp Magnet 2) */
  function number(items){ const key = it => it.t.replace(/[0-9A-Z]+$/i, "") + "|" + it.n.toUpperCase(), n = new Map();
    items.forEach(it => { if (it.n) n.set(key(it), (n.get(key(it)) || 0) + 1); });
    items.forEach(it => { if (it.n && n.get(key(it)) > 1 && !it.dn){ const m = it.t.match(/([0-9A-Z]+)$/i); if (m){ it.n = it.n + " " + m[1].replace(/^0+(?=\w)/, ""); it.dn = 1; } } });
    return items; }
  function load(force){ if (loadP && !force) return loadP;
    loadP = (async () => { const c = await IDB.get("equip"); if (c && c.items){ list = number(c.items); raw = c.raw || null; if (!force && raw && c.v === KV && now() - c.at < 864e5) return list; }
      try { const r = await fetch(lsGet("adEquipSrc", "") || SRC, { cache: "no-store" }); if (!r.ok) throw new Error(r.status); const d = await r.json(), out = [], seen = new Set();
        const pidCol = ((d.types || {}).mel || { f: [] }).f.indexOf("P&ID");
        Object.entries(KINDS).forEach(([k, [ti, ni, label]]) => (d.data && d.data[k] || []).forEach(row => { const t = String(row[ti] || "").trim(); if (!t || seen.has(k + t)) return; seen.add(k + t);
          const it = { t, n: String((typeof ni === "function" ? ni(row) : row[ni]) || "").trim(), k: label }; if (k === "mel" && pidCol >= 0 && row[pidCol]) it.p = row[pidCol]; out.push(it); }));
        list = number(out); raw = d; areaM = null; IDB.set("equip", { at: now(), v: KV, items: out, raw: d }); }
      catch (e){ console.warn("plant equipment lists", e); if (!list) list = []; }
      return list; })();
    return loadP; }
  /* best matches for what's typed, from the tag (field "t") or the name (field "n") */
  function find(q, by){ const w = qWords(q); if (!w.length) return [];   // (spaces and dashes don't matter: CV 402 finds CV-402)
    const extra = ((Store.field("equipment") || {}).options || []).filter(o => !o.del).map(o => ({ t: o.label, n: o.desc || "", k: "Tags" }));
    const all = extra.concat(list || []), first = w[0], whole = w.join(""), out = [];   // (the words run together, CV402, rank first)
    for (const it of all){ const t = squash(it.t), n = squash(it.n), hay = t + " " + n; if (!w.every(x => hay.includes(x))) continue;
      const f = by === "n" ? n : t; out.push([f.startsWith(whole) ? 0 : f.includes(whole) ? 1 : f.startsWith(first) ? 2 : f.includes(first) ? 3 : 4, it, KR[it.k] == null ? 3 : KR[it.k], n.length]); if (out.length > 4000) break; }
    /* (main equipment before its instruments and valves; for a name, the shortest match first: BALL MILL before BALL MILL LUBE UNIT) */
    out.sort((a, b) => a[0] - b[0] || a[2] - b[2] || (by === "n" ? a[3] - b[3] : 0) || a[1].t.localeCompare(b[1].t)); return out.slice(0, 40).map(x => x[1]); }
  const KR = { "Tags": 0, "Mech equipment": 1, "Elec equipment": 2 };
  const get = t => (list || []).find(x => x.t === t);
  /* the plant's WBS areas from the equipment list: area code → its name (the name most of its equipment gives) */
  let areaM = null;
  function areas(){ if (areaM) return areaM; const d = raw; if (!d || !d.data || !d.data.mel) return new Map(); const fi = ((d.types || {}).mel || { f: [] }).f.indexOf("Area"), cnt = new Map();
    d.data.mel.forEach(r => { const code = (String(r[0] || "").match(/^([A-Z]\d{2,3})-/) || [])[1], n = String(r[fi] || "").trim(); if (!code || !n || /^\d+$/.test(n)) return; const k = code + "|" + n; cnt.set(k, (cnt.get(k) || 0) + 1); });
    const best = new Map(); cnt.forEach((c, k) => { const [code, n] = k.split("|"); if (!best.has(code) || best.get(code)[1] < c) best.set(code, [n, c]); });
    areaM = new Map([...best.entries()].sort().map(([c, [n]]) => [c, c + " " + n])); return areaM; }
  /* a tag's WBS area, as "F13 Milling & Classification" */
  /* a tag's WBS area: from the tag itself (F12-CV-402), or for a tag without one (an instrument like ZT12005A) from the
     first WBS code in its description (F12-BN-401 ROM BIN …) */
  const areaOf = t => { const at = c => c ? areas().get(c) || "" : "";
    const own = at((String(t || "").match(/^([A-Z]\d{2,3})-?/) || [])[1]); if (own) return own;
    const e = get(String(t || "")) || get(String(t || "").toUpperCase()); const m = e && String(e.n || "").toUpperCase().match(/\b([A-Z]\d{2,3})-[A-Z]/); return m ? at(m[1]) : ""; };
  return { load, find, get, areas, areaOf, raw: () => raw, list: () => list || [], get count(){ return (list || []).length; } };
})();

const Isol = (() => {
  const COLS = [["tag", "Equipment number"], ["name", "Equipment name"], ["note", "Note"]];
  const list = a => a.isol || (a.isol = []);
  const created = new Map();
  /* one action's isolations, drawn into its action view tab; keep is where the cursor was before the redraw */
  /* one table: the picked isolations on top (ticked, a padlock, numbered, then a blank row to type another), and under them
     the suggestions for the action's Tags (unticked, a bulb, the reason in italics). Ticking a suggestion moves it up;
     unticking a picked one drops it back down, or takes it off if it was typed in (asking first if it has a note). */
  const LOCK = '<svg class="is-ic is-lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 018 0v3"/><path d="M12 14.5v2.5"/></svg>';
  const BULB = '<svg class="is-ic is-bulb" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M8.5 14.5a6 6 0 117 0c-.8.6-1.5 1.5-1.5 2.5h-4c0-1-.7-1.9-1.5-2.5z"/></svg>';
  const tick = (on, ro, key, tip) => '<td class="is-pk"><label class="ck is-ck" title="' + esc(tip) + '"><input type="checkbox"' + (on ? " checked" : "") + (ro ? " disabled" : "") + ' data-pk="' + esc(key) + '"></label>' + (on ? LOCK : BULB) + '</td>';
  function renderFor(el, a, keep){ const ro = !Store.S.edit;
    const items = list(a), tags = Array.isArray(a.f.equipment) ? a.f.equipment : [], sug = tags.length && typeof IsolSuggest !== "undefined" ? suggestions(a, tags) : [];
    el.innerHTML = '<div class="is-main"><table class="tbl pt-tbl is-tbl"><thead><tr><th class="is-pk"></th><th class="pt-no" data-col="No.">#</th>' + COLS.map(([k, n]) => '<th class="is-' + k + '">' + esc(n) + '</th>').join("") + '</tr></thead><tbody>'
      + items.map((it, i) => '<tr data-id="' + it.id + '">' + tick(true, ro, it.id, ro ? "Isolated" : "Isolated. Untick to take it off") + '<td class="pt-no">' + (i + 1) + '</td>' + COLS.map(([k]) => cell(it.id, k, it[k], ro)).join("") + '</tr>').join("")
      + (ro ? "" : '<tr class="pt-blank"><td class="is-pk"></td><td class="pt-no"></td>' + COLS.map(([c]) => cell("new0", c, "", ro, c === "tag" ? "Type a number" : c === "name" ? "or a name" : "")).join("") + '</tr>')
      + (sug === null ? '<tr class="is-sep"><td colspan="5">Suggested from the plant lists <span class="dim">' + (Equip.raw() ? "working them out…" : "loading the lists…") + '</span></td></tr>'
        : sug.length ? '<tr class="is-sep"><td colspan="5">Suggested from the plant lists' + tipI("Worked out from this action's Tags. Check each one before ticking it.") + '</td></tr>'
          + sug.map(x => '<tr class="is-sr">' + tick(false, ro, x.tag, ro ? "Suggested" : "Suggested. Tick to add it") + '<td class="pt-no"></td><td class="is-cb"><span class="is-tx" title="' + esc(x.tag) + '">' + esc(x.tag) + '</span></td><td class="is-cb"><span class="is-tx" title="' + esc(x.name || "") + '">' + esc(x.name || "") + '</span></td><td><span class="is-why">' + esc(x.reason || "") + (tags.length > 1 && x.for !== x.tag ? " (for " + esc(x.for) + ")" : "") + '</span></td></tr>').join("") : "")
      + '</tbody></table></div>';
    if (!Equip.count) Equip.load().then(() => { if (App.sub === "isol" && Equip.count) App.render(); });
    wire(el, a, ro);
    wireSug(el, a, ro, sug || []);
    gridCols($(".is-tbl", el), "isol", { fixed: { c0: 64, "No.": 30 } });
    if (keep && keep.c){ let r = keep.r; if (created.has(r)){ r = created.get(r); created.delete(keep.r); } const t = $('[data-r="' + r + '"][data-c="' + keep.c + '"]', el); if (t){ if (t.value !== keep.v) { t.value = keep.v; t.addEventListener("blur", () => t.dispatchEvent(new Event("change")), { once: true }); } t.focus(); try { t.setSelectionRange(keep.s, keep.s); } catch (e) {} } } created.clear(); }
  /* ---------- suggested isolations: what to isolate for the subject equipment, as pills to add or dismiss ---------- */
  let index = null, building = null;
  function idx(){ if (index || building || typeof IsolSuggest === "undefined") return index; const raw = Equip.raw(); if (!raw) return null;
    /* iso-extra.json (drives, isolator panels and boards from the single line diagrams, process streams from the PFD) is optional: without it the suggestions still come, just with fewer drives */
    building = fetch("js/iso-extra.json?v=" + APP_VERSION).then(r => r.ok ? r.json() : null).catch(() => null).then(extra => new Promise(res => setTimeout(() => { try { index = IsolSuggest.build(raw, extra || undefined); } catch (e){ console.warn("isolation suggestions", e); } building = null; res(); App.render(); }, 30))); return null; }
  /* the suggestions for the action's Tags: each tag itself first, then what the plant lists say to isolate for it */
  function suggestions(a, tags){ const ix = idx(); if (!ix) return null; const have = new Set((a.isol || []).map(x => String(x.tag || "").toUpperCase())), seen = new Set(), out = [];
    const add = x => { const k = String(x.tag || "").toUpperCase(); if (!k || seen.has(k) || have.has(k)) return; seen.add(k); out.push(x); };
    tags.forEach(t => { const e = Equip.get(t) || Equip.get(String(t).toUpperCase()); add({ for: t, tag: t, name: e ? e.n : "", reason: "Tagged on this action" }); });
    tags.forEach(t => { let r = []; try { r = IsolSuggest.suggest(ix, t) || []; } catch (e){ console.warn(e); } r.forEach(x => add(Object.assign({ for: t }, x))); });
    return out; }
  function wireSug(el, a, ro, sug){ if (ro) return;
    $$("[data-pk]", el).forEach(b => b.onchange = async () => { const k = b.dataset.pk;
      if (b.checked){ const x = sug.find(y => y.tag === k); if (!x) return; const ts = (x.tags || [x.tag]).filter((t, i, A) => A.indexOf(t) === i && !list(a).some(y => y.tag === t));   /* (a group, such as 15 cyclone valves, adds every one of them) */
        Store.mutate("a:" + a._p, () => { ts.forEach(t => { const e = x.tags ? Equip.get(t) || Equip.get(String(t).toUpperCase()) : null; list(a).push({ id: uid(), tag: t, name: (e ? e.n : x.name) || "", note: "", sug: 1 }); }); Store.touch(a); }); Store.log("Added " + (ts.length > 1 ? ts.length + " suggested isolations" : "a suggested isolation") + " to " + Store.actId(a)); return; }
      const it = list(a).find(y => y.id === k); if (!it) return;
      const back = it.sug || sug.some(y => y.tag === it.tag) || (Array.isArray(a.f.equipment) && a.f.equipment.includes(it.tag));
      if (it.note || !back){ b.checked = true; if (!await confirmBox("Take " + (it.tag || it.name || "this isolation") + " off the list" + (it.note ? " and lose its note?" : "?"), "Take it off", true)) return; }
      Store.mutate("a:" + a._p, () => { const i = list(a).indexOf(it); if (i >= 0) list(a).splice(i, 1); Store.touch(a); }); Store.log("Took an isolation off " + Store.actId(a)); }); }
  const cell = (r, c, v, ro, ph) => '<td' + (c !== "note" ? ' class="is-cb"' : "") + '><input class="in pt-in" autocomplete="off" data-r="' + r + '" data-c="' + c + '" value="' + esc(v || "") + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : "") + (ro ? " readonly" : "") + '></td>';
  /* write one or both of a row's values; a blank row becomes a new isolation */
  /* (a note typed here is marked as the user's own (nu), so the exports show it; notes the app wrote in itself are left out of them) */
  function put(a, r, vals){ const key = "a:" + a._p, items = list(a); if ("note" in vals) vals = Object.assign({}, vals, { nu: vals.note ? 1 : 0 });
    if (String(r).startsWith("new")){ if (!Object.values(vals).some(Boolean)) return; const it = Object.assign({ id: uid() }, vals); created.set(r, it.id); Store.mutate(key, () => { items.push(it); Store.touch(a); }); Store.log("Added an isolation to " + Store.actId(a)); return; }
    const it = items.find(x => x.id === r); if (!it || Object.keys(vals).every(k => (it[k] || (k === "nu" ? 0 : "")) === vals[k])) return; Store.mutate(key, () => { Object.assign(it, vals); Store.touch(a); }); Store.log("Edited an isolation on " + Store.actId(a)); }
  function wire(el, a, ro){
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
  return { renderFor, ready: () => !!index };
})();
