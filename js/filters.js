/* The Filters panel on the left of the Actions and Organizer tabs: the search box, then pills for the things many
   actions share (Status, Action owner, WBS code), each with a live count; a pill with no actions isn't
   shown. Status is one stage at a time; in the other groups pills add together (Jack or Bijan), and groups narrow
   each other (Jack's, in F12). The stage pills are App.pills. When the
   panel is hidden, what's filtering shows as removable chips above the list. */
"use strict";
const Filters = (() => {
  const NS = "Not set";
  const saved = lsGet("adF", {}), sel = { ow: new Set(saved.ow || []), wbs: new Set(saved.wbs || []) };
  const all = () => Object.assign({ st: App.pills }, sel);
  const keep = () => lsSet("adF", { ow: [...sel.ow], wbs: [...sel.wbs] });
  /* the date filter at the top left, for every list: by the date created or modified, from and to (either can be blank) */
  const D = Object.assign({ by: "created", from: "", to: "", last: "" }, lsGet("adDate", {}));
  const day = t => { const d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const dateOk = a => { if (!D.from && !D.to) return true; const t = D.by === "modified" ? a.mod || a.created : a.created; if (!t) return false; const d = day(t); return (!D.from || d >= D.from) && (!D.to || d <= D.to); };
  /* an action's value in each group */
  function val(a, k){ if (k === "st") return a.del ? "_del" : a.stage;
    if (k === "ow") return Store.owner(a).n || NS;
    if (k === "wbs"){ const m = String(a.f.location || "").trim().match(/^([A-Z]\d{2,3})\b/i); return m ? m[1].toUpperCase() : NS; } }
  /* does it pass every group (but skip, so a group's own counts show what picking another pill there would add) */
  function match(a, skip, noStage){ const q = (App.q || "").trim(); if (q && !Store.matches(a, q)) return false; if (!dateOk(a)) return false;
    const S = all();
    /* with no Status pill picked, the list is the open actions: done and deleted ones show only when their pill is picked */
    if (!noStage && skip !== "st" && !S.st.size && (a.del || Store.stage(a.stage).kind === "done")) return false;
    for (const k in S){ if (k === skip || (noStage && k === "st") || !S[k].size) continue; if (!S[k].has(val(a, k))) return false; } return true; }
  const apply = (list, noStage) => list.filter(a => match(a, null, noStage));
  const active = () => Object.values(all()).some(s => s.size) || !!(App.q || "").trim();
  const count = () => Object.values(all()).reduce((t, s) => t + s.size, 0) + ((App.q || "").trim() ? 1 : 0);
  function groups(){ const list = Store.visible();
    const vals = k => [...new Set(list.map(a => val(a, k)))].sort((x, y) => x === NS ? 1 : y === NS ? -1 : x.localeCompare(y));
    return [["st", "Status", Store.stages().map(s => ({ v: s.id, t: s.name, c: s.color })).concat({ v: "_del", t: "Deleted", c: "#9aa3ad" })],
      ["ow", "Action owner", vals("ow").map(v => ({ v, t: v }))],
      ["wbs", "WBS code", vals("wbs").map(v => ({ v, t: v }))]]; }
  /* the panel's body (the search box is moved in by the app, so it keeps its focus and value) */
  function render(el){ const list = Store.visible().concat(Store.deleted()), S = all();
    if (S.st.size > 1){ const one = [...S.st].pop(); S.st.clear(); S.st.add(one); }   // (from before Status was one at a time)
    const html = groups().map(([k, name, items]) => '<div class="fg2" data-k="' + k + '"><div class="fgh"><span>' + name + '</span>' + (S[k].size ? '<button type="button" class="link fclr">Clear</button>' : "") + '</div>'
      + items.map(it => { const n = list.filter(a => val(a, k) === it.v && match(a, k)).length, on = S[k].has(it.v);
        if (!n && !on) return "";   // (a pill with nothing behind it isn't shown)
        return '<button type="button" class="pill fpill' + (on ? " on" : "") + (n ? "" : " zero") + (it.v === NS ? " ns" : "") + '" data-v="' + esc(it.v) + '" aria-pressed="' + on + '"' + (it.c ? ' style="' + esc(stageVars(it.c)) + '"' : "") + '>' + (it.c ? '<i class="dot"></i>' : "") + esc(it.t) + ' <b>' + n + '</b></button>'; }).join("") + '</div>').join("")
      + '<p class="dim fshown">' + apply(list).length + " of " + Store.visible().length + " actions shown" + (active() ? ' <button type="button" class="link fall">Clear all</button>' : "") + '</p>';
    let body = $(".fp-groups", el); if (!body){ body = document.createElement("div"); body.className = "fp-groups"; el.appendChild(body); } body.innerHTML = html;
    $$(".fg2", body).forEach(g => { const k = g.dataset.k; g.onclick = e => { const b = e.target.closest(".fpill"); if (b){ const v = b.dataset.v, had = S[k].has(v); if (k === "st") S[k].clear(); had ? S[k].delete(v) : S[k].add(v); changed(); }   // (Status is one at a time: a click picks it, a second click clears it)
      if (e.target.closest(".fclr")){ S[k].clear(); changed(); } }; });
    const fa = $(".fall", body); if (fa) fa.onclick = clear; }
  /* what's filtering, as chips for the list's header row */
  function chips(){ const S = all(), out = [], stName = id => id === "_del" ? "Deleted" : (Store.stage(id) || {}).name || id;
    if ((App.q || "").trim()) out.push(['q', "", '"' + App.q.trim() + '"']);
    for (const k in S) S[k].forEach(v => out.push([k, v, k === "st" ? stName(v) : v]));
    return out; }
  function chipsHtml(shown, total){ const c = chips();
    return (c.length ? '<span class="dim">Filtered by</span>' + c.map(([k, v, t]) => '<button type="button" class="fchip" data-k="' + k + '" data-v="' + esc(v) + '" title="Remove this filter">' + esc(t) + ' ✕</button>').join("") + '<button type="button" class="link fchip-all">Clear all</button>'
      : ''); }
  function wireChips(el){ el.onclick = e => { const b = e.target.closest(".fchip"); if (b){ const k = b.dataset.k; if (k === "q"){ App.q = ""; } else all()[k].delete(b.dataset.v); changed(); }
      if (e.target.closest(".fchip-all")) clear(); }; }
  function clear(){ App.q = ""; for (const k in all()) all()[k].clear(); changed(); }
  function changed(){ keep(); App.render(); }
  /* the date bar: Date created or Date modified, from, to, then 1 day, 1 week, 1 month or All time. A length counts
     on from the From date when that was set last, back from the To date when that was, or back from today */
  const SPANS = [["1d", "1 day", 1], ["1w", "1 week", 7], ["1m", "1 month", 0], ["all", "All time", -1]];
  function dateBar(el){ const draw = () => { el.innerHTML = '<select class="in sm gd-by" aria-label="Which date"><option value="created"' + (D.by === "created" ? " selected" : "") + '>Date created</option><option value="modified"' + (D.by === "modified" ? " selected" : "") + '>Date modified</option></select>'
        + '<i class="gd-slot"></i>'
        + '<div class="gd-sp" role="group" aria-label="How long">' + SPANS.map(([k, n]) => '<button type="button" class="btn ghost sm" data-sp="' + k + '">' + n + '</button>').join("") + '</div>';
      $(".gd-by", el).onchange = e => { D.by = e.target.value; save(); };
      /* one box for the range (TOUCH: the phone's own two date pickers) */
      $$(".gd-slot", el).forEach(x => { if (TOUCH){ const w = h('<span class="gd-two"></span>'); ["from", "to"].forEach((k, n) => { const i = dateBox(D[k], { ph: n ? "To" : "From", cls: "gd-d" }); i.addEventListener("change", () => { D[k] = i.value; D.last = i.value ? k : ""; save(); }); w.appendChild(i); }); x.replaceWith(w); return; }
        const r = rangeBox(D.from, D.to, { label: "Date range", cls: "gd-d" }); x.replaceWith(r); r.addEventListener("change", () => { D.from = r.from; D.to = r.to; D.last = r.to ? "to" : ""; save(); }); });
      $$("[data-sp]", el).forEach(b => b.onclick = () => { const sp = SPANS.find(x => x[0] === b.dataset.sp);
        if (sp[2] < 0){ D.from = D.to = D.last = ""; return save(true); }
        const move = (iso, sign) => { const d = new Date(iso + "T12:00:00"); if (sp[2]) d.setDate(d.getDate() + sign * sp[2]); else d.setMonth(d.getMonth() + sign); return day(d); };
        if (D.last === "from" && D.from) D.to = move(D.from, 1); else if (D.last === "to" && D.to) D.from = move(D.to, -1); else { D.to = day(now()); D.from = move(D.to, -1); D.last = ""; }
        save(true); }); };
    const save = redraw => { lsSet("adDate", D); if (redraw) draw(); App.render(); }; draw(); }
  const dateOn = () => !!(D.from || D.to);
  return { render, apply, match, active, count, chipsHtml, wireChips, clear, val, dateBar, dateOn };
})();
