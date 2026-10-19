/* The Organizer tab: one column per stage, like Trello, kept minimal. Drag cards between and within columns
   (higher in a column = higher priority). Click a card for a callout with its problem, solution and photos;
   editing is done in the action itself. Double click a column name to rename it, drag its header to move it. */
"use strict";
const Kanban = (() => {
  function render(el){ const ro = !Store.S.edit, q = (App.q || "").trim().toLowerCase(), fs = Store.fields(), multi = Store.selected().length > 1;
    const match = a => Store.matches(a, q);
    const sx = $(".kb", el) ? $(".kb", el).scrollLeft : 0, sy = {}; $$(".kb-cards", el).forEach(c => sy[c.dataset.s] = c.scrollTop);
    el.innerHTML = '<div class="kb">' + Store.stages().map(s => { const cards = Store.ranked(s.id).filter(match);
        return '<section class="kb-col" data-s="' + s.id + '" style="--c:' + esc(s.color) + '"><header class="kb-h" draggable="' + !ro + '"><i class="dot"></i><span class="kb-n" title="' + esc("On the action this step reads " + s.name + ". Double click to rename the column") + '">' + esc(Store.todo(s)) + '</span><span class="kb-c">' + (q ? cards.length + " of " + Store.ranked(s.id).length : cards.length) + '</span>'
          + (s.kind === "hold" ? '<span class="kb-k">on hold</span>' : s.kind === "done" ? '<span class="kb-k">complete</span>' : "") + '<span class="grow"></span>'
          + (ro ? "" : '<button type="button" class="ic-b sm kb-m" title="Stage options">⋯</button>') + '</header>'
          + '<div class="kb-cards" data-s="' + s.id + '">' + cards.map(a => card(a, multi)).join("") + '</div></section>'; }).join("")
      + (ro ? "" : '<button type="button" class="kb-new">+ Add a stage</button>') + '</div>';
    $(".kb", el).scrollLeft = sx; $$(".kb-cards", el).forEach(c => c.scrollTop = sy[c.dataset.s] || 0);
    $$(".kc", el).forEach(c => { const a = App.act(c.dataset.ref); const im = $("img", c); if (im && a && a.photos[0]) im.src = Media.src(a, a.photos[0], true); });
    wire(el, ro); }
  function card(a, multi){ const p = Store.project(a._p) || {}, ref = a._p + ":" + a.u, n = Object.values(a.f || {}).filter(v => v === "TBC").length, eta = a.f.eta;
    return '<article class="kc' + (ref === App.selRef ? " on" : "") + '" draggable="' + Store.S.edit + '" data-ref="' + ref + '">' + (a.photos.length ? '<img alt="" loading="lazy">' : "")
      + '<div class="kc-top"><span class="aid">' + esc(Store.actId(a)) + '</span>' + (multi ? '<span class="ptag sm" style="--c:' + esc(p.color || "#64748b") + '">' + esc(p.name || "") + '</span>' : "") + '</div>'
      + '<div class="kc-t">' + (esc(a.f.title) || '<span class="dim">No title</span>') + '</div><div class="kc-m">'
      + (a.photos.length ? '<span>📷 ' + a.photos.length + '</span>' : "") + (a.files.length ? '<span>📎 ' + a.files.length + '</span>' : "")
      + (eta ? '<span class="' + (eta === "TBC" ? "tbc" : "") + '">ETA ' + esc(fmtDate(eta)) + '</span>' : "") + (a.f.spares ? '<span class="good">Spares ✓</span>' : "") + (n ? '<span class="tbc">' + n + ' TBC</span>' : "") + '</div></article>'; }
  function wire(el, ro){ const kb = $(".kb", el);
    kb.onclick = e => { const c = e.target.closest(".kc"); if (c) callout(c); };
    if (ro) return;
    let drag = null;
    $$(".kc", el).forEach(c => { c.ondragstart = e => { drag = c.dataset.ref; e.dataTransfer.setData("text/card", drag); e.dataTransfer.effectAllowed = "move"; setTimeout(() => c.classList.add("ghost"), 0); };
      c.ondragend = () => { c.classList.remove("ghost"); $$(".kb-ph").forEach(x => x.remove()); drag = null; }; });
    const indexAt = (list, y) => { const cs = $$(".kc:not(.ghost)", list); let i = 0; for (; i < cs.length; i++){ const r = cs[i].getBoundingClientRect(); if (y < r.top + r.height / 2) break; } return { i, cs }; };
    $$(".kb-col", el).forEach(col => { const list = $(".kb-cards", col), st = col.dataset.s;
      col.ondragover = e => { const t = [...e.dataTransfer.types];
        if (t.includes("text/card")){ e.preventDefault(); const { i, cs } = indexAt(list, e.clientY); let ph = $(".kb-ph"); if (!ph) ph = h('<div class="kb-ph"></div>'); if (cs[i]) list.insertBefore(ph, cs[i]); else list.appendChild(ph); }
        else if (t.includes("text/stage")){ e.preventDefault(); col.classList.add("dover"); } };
      col.ondragleave = e => { if (!col.contains(e.relatedTarget)) col.classList.remove("dover"); };
      col.ondrop = e => { col.classList.remove("dover"); const ref = e.dataTransfer.getData("text/card"), sid = e.dataTransfer.getData("text/stage");
        if (ref){ e.preventDefault(); const a = App.act(ref); const { i } = indexAt(list, e.clientY); $$(".kb-ph").forEach(x => x.remove()); if (!a) return;
          /* index among what's in the column overall (the search may hide some cards) */
          const shown = $$(".kc:not(.ghost)", list).map(c => App.act(c.dataset.ref)), before = shown[i - 1], full = Store.ranked(st).filter(x => x !== a);
          const at = before ? full.indexOf(before) + 1 : shown[i] ? full.indexOf(shown[i]) : full.length;
          Store.mutate("a:" + a._p, () => { const moved = a.stage !== st; Store.place(a, st, at); Store.log((moved ? "Moved " : "Reordered ") + Store.actId(a) + (moved ? " to " + Store.stage(st).name : "")); }); return; }
        if (sid && sid !== st){ e.preventDefault(); Store.mutate("config", () => { const ss = Store.S.config.stages, a = ss.findIndex(x => x.id === sid), b0 = ss.findIndex(x => x.id === st), m = ss.splice(a, 1)[0]; ss.splice(ss.findIndex(x => x.id === st) + (a < b0 ? 1 : 0), 0, m); Store.S.config.mod = now(); Store.touch(m); }); } };
      const hd = $(".kb-h", col); hd.ondragstart = e => { if (e.target !== hd) return; e.dataTransfer.setData("text/stage", st); };
      $(".kb-n", col).ondblclick = () => rename(st);
      $(".kb-m", col).onclick = e => menu(e.currentTarget, st); });
    $(".kb-new", el).onclick = async () => { const n = await promptBox("Name of the new stage", ""); if (!n || !n.trim()) return;
      Store.mutate("config", () => { const ss = Store.S.config.stages; const at = ss.findIndex(s => !s.del && s.kind !== "open"); const s = Store.touch({ id: "st" + uid(), name: n.trim(), color: "#64748b", kind: "open", print: true });
        if (at < 0) ss.push(s); else ss.splice(at, 0, s); Store.S.config.mod = now(); }); }; }
  /* the card callout: read only, beside the card */
  function callout(card){ Fields.closePop(); const a = App.act(card.dataset.ref); if (!a) return; const ed = Store.S.edit; const s = Store.stage(a.stage), p = Store.project(a._p) || {};
    const keys = ["eta", "spares", "contractor", "contractorPhone", "equipment", "location"].map(id => Store.field(id)).filter(f => f && Fields.text(a, f) && !(f.type === "check" && !Fields.val(a, f)));
    const c = h('<div class="pop kcall"><div class="kca-h"><span class="aid">' + esc(Store.actId(a)) + '</span><span class="stg" style="--c:' + esc(s.color) + '">' + esc(s.name) + '</span><span class="grow"></span><button type="button" class="ic-b sm" data-k="x" title="Close">✕</button></div>'
      + '<div class="kca-t">' + (esc(a.f.title) || '<span class="dim">No title</span>') + '</div>' + (Store.selected().length > 1 ? '<div class="dim">' + esc(p.name) + '</div>' : "")
      + '<h5>Problem</h5><div class="kca-x">' + (esc(a.f.problem) || '<span class="dim">–</span>') + '</div><h5>Solution</h5><div class="kca-x">' + (esc(a.f.solution) || '<span class="dim">–</span>') + '</div>'
      + (a.photos.length ? '<h5>Photos ' + a.photos.length + '</h5><div class="kca-ph">' + a.photos.slice(0, 8).map((ph, i) => '<img alt="" data-i="' + i + '" src="' + esc(Media.src(a, ph, true)) + '">').join("") + '</div>' : "")
      + (a.f.notes ? '<h5>Notes</h5><div class="kca-x">' + esc(a.f.notes) + '</div>' : "")
      + (keys.length ? '<dl>' + keys.map(f => '<dt>' + esc(f.label) + '</dt><dd>' + Fields.show(a, f) + '</dd>').join("") + '</dl>' : "")
      + '<div class="kca-b">' + (a.photos.length ? '<button type="button" class="btn ghost sm" data-k="ph">Photos</button>' : "")
      + '<button type="button" class="btn sm" data-k="open">Open action</button></div></div>');
    document.body.appendChild(c); const r = card.getBoundingClientRect(), w = c.offsetWidth || 360;
    c.style.left = (r.right + 10 + w < innerWidth ? r.right + 10 : Math.max(8, r.left - w - 10)) + "px"; c.style.top = Math.max(8, Math.min(r.top, innerHeight - c.offsetHeight - 8)) + "px";
    c.ondragover = e => { if (ed && Media.hasDrop(e)) e.preventDefault(); }; c.ondrop = e => { if (!ed || !Media.hasDrop(e)) return; e.preventDefault(); e.stopPropagation(); Fields.closePop(); Media.dropOn(a, e); };
    $$(".kca-ph img", c).forEach(im => im.onclick = () => { Fields.closePop(); Media.view(a, +im.dataset.i); });
    $$("[data-k]", c).forEach(b => b.onclick = () => { const k = b.dataset.k; Fields.closePop();
      if (k === "ph") Media.view(a, 0); else if (k === "open") App.select(card.dataset.ref); }); }
  /* the column name is the step being done ("Draft RFQ"); its name on the action ("RFQ Sent") is renamed in Data validation */
  async function rename(st){ const s = Store.stage(st), was = Store.todo(s); const n = await promptBox("Rename the column (on the action this step reads " + s.name + ")", was); if (!n || !n.trim() || n.trim() === was) return; Store.mutate("config", () => { s.todo = n.trim(); Store.touch(s); }); }
  const COLORS = ["#3B8FE0", "#2F7FD1", "#7C5CD6", "#0E9AA7", "#2FB463", "#F2B03D", "#C07A12", "#E0453A", "#D6488A", "#64748b"];
  function menu(anchor, st){ Fields.closePop(); const s = Store.stage(st);
    const p = h('<div class="pop stpop"><div class="pop-h">' + esc(Store.todo(s)) + '</div><div class="dim stpop-m">On the action: ' + esc(s.name) + '</div><button type="button" class="mi" data-k="ren">Rename column…</button>'
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
