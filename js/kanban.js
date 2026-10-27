/* The Organizer tab: one column per stage, like Trello, kept minimal. Drag cards between and within columns
   (cards keep the order they're dragged into). Click a card to open the action in the side panel;
   editing is done in the action itself. Double click a column name to rename it, drag its header to move it. */
"use strict";
const Kanban = (() => {
  /* On Hold and Done are rows across the top, their cards side by side (more… opens another row of them); the
     stages being worked through are the columns under them. Done always shows; deleted actions never do here */
  const ROWS = lsGet("adKbRows", {});
  /* (the stages themselves, their names, colours and order, are the admin's to change) */
  function render(el){ const ro = !Store.S.edit, adm = App.isAdmin(), q = (App.q || "").trim().toLowerCase(), multi = Store.selected().length > 1;
    const match = a => Filters.match(a), ss = Store.stages(), open = ss.filter(s => s.kind === "open"), top = ss.filter(s => s.kind === "hold").concat(ss.filter(s => s.kind === "done"));
    const cardsOf = s => Store.ranked(s.id).filter(a => s.kind === "done" ? Filters.match(a, "st") : match(a));
    const sx = $(".kb", el) ? $(".kb", el).scrollLeft : 0, sy = {}; $$(".kb-cards", el).forEach(c => sy[c.dataset.s] = c.scrollTop);
    const head = (s, cards, drag) => '<header class="kb-h" draggable="' + (adm && drag) + '"><i class="dot"></i><span class="kb-n" title="' + esc(adm ? "Double click to rename it" : Store.todo(s)) + '">' + esc(Store.todo(s)) + '</span><span class="kb-c">' + (q ? cards.length + " of " + Store.ranked(s.id).length : cards.length) + '</span>'
      + (s.kind === "hold" ? '<span class="kb-k">on hold</span>' : s.kind === "done" ? '<span class="kb-k">complete</span>' : "") + '<span class="grow"></span>'
      + (adm ? '<button type="button" class="ic-b sm kb-m" title="Stage options">⋯</button>' : "") + '</header>';
    el.innerHTML = '<div class="kbw"><div class="kb-rows">' + top.map(s => { const cards = cardsOf(s), n = Math.max(1, ROWS[s.id] || 1);
        return '<section class="kb-col kb-row" data-s="' + s.id + '" style="' + esc(stageVars(s.color)) + ';--rows:' + n + '">' + head(s, cards, false)
          + '<div class="kb-cards" data-s="' + s.id + '">' + cards.map(a => card(a, multi)).join("") + (cards.length ? "" : '<span class="dim kb-0">Nothing here</span>') + '</div>'
          + '<div class="kb-rb"><button type="button" class="link kb-more" hidden>more…</button>' + (n > 1 ? '<button type="button" class="link kb-less">less</button>' : "") + '</div></section>'; }).join("") + '</div>'
      + '<div class="kb">' + open.map(s => { const cards = cardsOf(s);
        return '<section class="kb-col" data-s="' + s.id + '" style="' + esc(stageVars(s.color)) + '">' + head(s, cards, true)
          + '<div class="kb-cards" data-s="' + s.id + '">' + cards.map(a => card(a, multi)).join("") + '</div></section>'; }).join("")
      + (adm ? '<button type="button" class="kb-new">+ Add a stage</button>' : "") + '</div></div>';
    $(".kb", el).scrollLeft = sx; $$(".kb-cards", el).forEach(c => c.scrollTop = sy[c.dataset.s] || 0);
    $$(".kc", el).forEach(c => { const a = App.act(c.dataset.ref); const im = $("img", c); if (im && a && a.photos[0]) im.src = Media.src(a, a.photos[0], true); });
    /* a row whose cards spill past its rows offers more… (another row each click) */
    $$(".kb-row", el).forEach(r => { const l = $(".kb-cards", r), m = $(".kb-more", r), id = r.dataset.s; m.hidden = l.scrollHeight <= l.clientHeight + 2;
      m.onclick = () => { ROWS[id] = (ROWS[id] || 1) + 1; lsSet("adKbRows", ROWS); App.render(); };
      const ls = $(".kb-less", r); if (ls) ls.onclick = () => { ROWS[id] = 1; lsSet("adKbRows", ROWS); App.render(); }; });
    moreFit(el); wire(el, ro); }
  /* a card: the ID and title, the main photo large on the right, the bin top right */
  function card(a, multi){ const p = Store.project(a._p) || {}, ref = a._p + ":" + a.u, id = Store.actId(a);
    return '<article class="kc' + (a.photos.length ? " kc-wp" : "") + (ref === App.selRef ? " on" : "") + '" draggable="' + Store.S.edit + '" data-ref="' + ref + '">'
      + '<div class="kc-b"><div class="kc-top"><span class="aid">' + esc(id) + '</span>' + (multi ? '<span class="ptag sm" style="--c:' + esc(p.color || "#64748b") + '">' + esc(p.name || "") + '</span>' : "") + Hold.btn(a) + '</div>'
      + '<div class="kc-t">' + (a.f.title ? moreCut(esc(a.f.title), id) : '<span class="dim">No title</span>') + '</div></div>'
      + (a.photos.length ? '<img alt="" loading="lazy">' : "")
      + (Store.S.edit ? '<button type="button" class="kc-del" data-rb="del" title="Delete ' + esc(id) + '" aria-label="Delete ' + esc(id) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/></svg></button>' : "") + '</article>'; }
  function wire(el, ro){ const kb = $(".kb", el);
    $(".kbw", el).onclick = e => { const c = e.target.closest(".kc"); if (c) App.select(c.dataset.ref); };   // (opens in the side panel, or the pop up)
    if (ro) return;
    let drag = null;
    $$(".kc", el).forEach(c => { c.ondragstart = e => { drag = c.dataset.ref; e.dataTransfer.setData("text/card", drag); e.dataTransfer.effectAllowed = "move"; setTimeout(() => c.classList.add("ghost"), 0); };
      c.ondragend = () => { c.classList.remove("ghost"); $$(".kb-ph").forEach(x => x.remove()); drag = null; }; });
    const indexAt = (list, y, x) => { const cs = $$(".kc:not(.ghost)", list); let i = 0; for (; i < cs.length; i++){ const r = cs[i].getBoundingClientRect(); if (y < r.top || (y <= r.bottom && x < r.left + r.width / 2)) break; } return { i, cs }; };   // (cards before the pointer: rows above it, or left of it in its row)
    $$(".kb-col", el).forEach(col => { const list = $(".kb-cards", col), st = col.dataset.s;
      col.ondragover = e => { const t = [...e.dataTransfer.types];
        if (t.includes("text/card")){ e.preventDefault(); const { i, cs } = indexAt(list, e.clientY, e.clientX); let ph = $(".kb-ph"); if (!ph) ph = h('<div class="kb-ph"></div>'); if (cs[i]) list.insertBefore(ph, cs[i]); else list.appendChild(ph); }
        else if (t.includes("text/stage")){ e.preventDefault(); col.classList.add("dover"); } };
      col.ondragleave = e => { if (!col.contains(e.relatedTarget)) col.classList.remove("dover"); };
      col.ondrop = e => { col.classList.remove("dover"); const ref = e.dataTransfer.getData("text/card"), sid = e.dataTransfer.getData("text/stage");
        if (ref){ e.preventDefault(); const a = App.act(ref); const { i } = indexAt(list, e.clientY, e.clientX); $$(".kb-ph").forEach(x => x.remove()); $$(".kb-0", list).forEach(x => x.remove()); if (!a) return;
          /* index among what's in the column overall (the search may hide some cards) */
          const shown = $$(".kc:not(.ghost)", list).map(c => App.act(c.dataset.ref)), before = shown[i - 1], full = Store.ranked(st).filter(x => x !== a);
          const at = before ? full.indexOf(before) + 1 : shown[i] ? full.indexOf(shown[i]) : full.length;
          Flow.moveTo(a, st, at); return; }   // (to another stage it asks which steps change; within its own it just reorders)
        if (sid && sid !== st){ e.preventDefault(); Store.mutate("config", () => { const ss = Store.S.config.stages, a = ss.findIndex(x => x.id === sid), b0 = ss.findIndex(x => x.id === st), m = ss.splice(a, 1)[0]; ss.splice(ss.findIndex(x => x.id === st) + (a < b0 ? 1 : 0), 0, m); Store.alignFields(); Store.S.config.mod = now(); Store.touch(m); }); } };
      const hd = $(".kb-h", col); hd.ondragstart = e => { if (e.target !== hd || col.classList.contains("kb-row")) return; e.dataTransfer.setData("text/stage", st); };
      $(".kb-n", col).ondblclick = () => { if (App.isAdmin()) rename(st); };
      const km = $(".kb-m", col); if (km) km.onclick = e => menu(e.currentTarget, st); });
    /* between columns, or past the last card: the nearest column takes it */
    const near = x => { let best = null, d = 1e9; $$(".kb .kb-col", el).forEach(c => { const r = c.getBoundingClientRect(), dd = x < r.left ? r.left - x : x > r.right ? x - r.right : 0; if (dd < d){ d = dd; best = c; } }); return best; };
    kb.ondragover = e => { if (e.target.closest(".kb-col")) return; const c = near(e.clientX); if (c) c.ondragover(e); };
    kb.ondrop = e => { if (e.target.closest(".kb-col")) return; const c = near(e.clientX); if (c) c.ondrop(e); else $$(".kb-ph").forEach(x => x.remove()); };
    const kn = $(".kb-new", el); if (kn) kn.onclick = async () => { const n = await promptBox("Name of the new stage", ""); if (!n || !n.trim()) return;
      Store.mutate("config", () => { const ss = Store.S.config.stages; const at = ss.findIndex(s => !s.del && s.kind !== "open"); const s = Store.touch({ id: "st" + uid(), name: n.trim(), color: "#64748b", kind: "open", print: true });
        if (at < 0) ss.push(s); else ss.splice(at, 0, s); Store.S.config.mod = now(); }); }; }
  /* (an open stage is named by the step still to do, the same on the column and on the action, so both change together) */
  async function rename(st){ const s = Store.stage(st), was = Store.todo(s); const n = await promptBox("Rename the stage", was); if (!n || !n.trim() || n.trim() === was) return; Store.mutate("config", () => { s.todo = n.trim(); if (s.kind === "open") s.name = n.trim(); Store.touch(s); }); }
  const COLORS = ["#3B8FE0", "#2F7FD1", "#7C5CD6", "#0E9AA7", "#2FB463", "#F2B03D", "#C07A12", "#E0453A", "#D6488A", "#64748b"];
  function menu(anchor, st){ Fields.closePop(); const s = Store.stage(st);
    const p = h('<div class="pop stpop"><div class="pop-h">' + esc(Store.todo(s)) + '</div><button type="button" class="mi" data-k="ren">Rename column…</button>'
      + '<div class="sw">' + COLORS.map(c => '<button type="button" style="--c:' + c + '" data-c="' + c + '"' + (c === s.color ? ' class="on"' : "") + '></button>').join("") + '<input type="color" value="' + esc(s.color) + '" title="Any colour"></div>'
      + '<div class="pop-h">Stage type</div>' + [["open", "Normal"], ["hold", "On hold"], ["done", "Completed"]].map(([k, n]) => '<label class="tp-o"><input type="radio" name="sk" value="' + k + '"' + (s.kind === k ? " checked" : "") + '><span>' + n + '</span></label>').join("")
      + '<label class="tp-o"><input type="checkbox" data-k="pr"' + (s.print ? " checked" : "") + '><span>Include when printing</span></label><div class="msep"></div><button type="button" class="mi danger" data-k="del">Delete stage…</button></div>');
    document.body.appendChild(p); Fields.place(p, anchor);
    const upd = fn => Store.mutate("config", () => { fn(); Store.touch(s); });
    $("[data-k=ren]", p).onclick = () => { Fields.closePop(); rename(st); };
    $$(".sw button", p).forEach(b => b.onclick = () => { upd(() => s.color = b.dataset.c); Fields.closePop(); });
    $(".sw input", p).onchange = e => upd(() => s.color = e.target.value);
    $$("input[name=sk]", p).forEach(r => r.onchange = () => upd(() => { s.kind = r.value; if (r.value === "done") s.print = false; }));
    $("[data-k=pr]", p).onchange = e => upd(() => s.print = e.target.checked);
    $("[data-k=del]", p).onclick = async () => { Fields.closePop(); const others = Store.stages().filter(x => x.id !== st); if (!others.length) return alert("There has to be at least one stage.");
      const n = Store.all().filter(a => a.stage === st).length;
      if (!await confirmBox("Delete the stage “" + s.name + "”?" + (n ? " Its " + n + " action" + (n > 1 ? "s move" : " moves") + " to “" + others[0].name + "”." : ""), "Delete", true)) return;
      const keys = ["config"].concat(Store.projects().map(x => "a:" + x.id));
      Store.mutate(keys, () => { Store.all().filter(a => a.stage === st).forEach(a => { a.stage = others[0].id; Store.touch(a); }); s.del = true; Store.touch(s); }); }; }
  return { render };
})();
