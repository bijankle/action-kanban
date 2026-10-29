/* How an action moves through the stages. The step ticks in the Actions list are the master record and the
   Organizer is a view of them: an action sits in the first step that's neither done nor marked not needed (each
   stage's step is the field linked to it: the Category choice, then the PCCR, MTO, spares, RFQ, PO and contractor
   ticks). Ticking a box moves the card straight away. Dragging a card asks first, listing exactly which steps will
   change, so moving cards about never ticks or unticks anything by itself. On Hold and Done sit outside this:
   coming back from either, the action goes to the step its ticks say. Each tick keeps who set it and when. */
"use strict";
const Flow = (() => {
  const NA = "N/A";
  const open = () => Store.stages().filter(s => s.kind === "open");
  const stepOf = s => Store.fields().find(f => f.stage === s.id && (f.type === "check" || f.type === "choice"));
  const state = (a, f) => { const v = a.f[f.id]; return v === NA ? "na" : (f.type === "choice" ? !!v : v === true) ? "done" : "open"; };
  const ok = (a, f) => state(a, f) !== "open";
  /* the stage its ticks put it in (when every step is done, the last one: it never goes into Done by itself) */
  function where(a){ const ss = open(); for (const s of ss){ const f = stepOf(s); if (f && !ok(a, f)) return s; }
    const ho = Store.field("handover"); if (ho && ho.stage && a.f.handover === true){ const h = ss.find(s => s.id === ho.stage); if (h) return h; }   // (handed over: it waits in Hand Over until someone ticks Complete)
    return ss[ss.length - 1]; }
  /* record who set a step, and when (shown when you point at the tick) */
  function mark(a, f, v){ a.f[f.id] = v; const w = a.tkw = a.tkw || {}; if (v === false || v === "" || v == null) delete w[f.id]; else w[f.id] = { by: Profile.name() || "", at: now() }; }
  const who = (a, f) => { const w = (a.tkw || {})[f.id]; if (!w) return ""; return (a.f[f.id] === NA ? "Marked not needed" : f.type === "choice" ? "Set" : "Ticked") + (w.by ? " by " + w.by : "") + ", " + fmtDate((d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") + "T" + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"))(new Date(w.at))); };   // (local time, 24 hour)
  /* after a tick changed: the card goes where the ticks say (inside a Store.mutate) */
  function sync(a){ const k = Store.stage(a.stage).kind; if (k === "hold" || k === "done") return; const s = where(a); if (s && s.id !== a.stage){ Store.place(a, s.id); Store.log("Moved " + Store.actId(a) + " to " + Store.todo(s)); } }
  /* what has to change for the action to sit in stage st: the steps before it still to do get done or marked not
     needed, its own step is reopened if it's done; later steps done ahead of time can be reopened too, if wanted */
  function plan(a, st){ const ss = open(), i = ss.findIndex(s => s.id === st); if (i < 0) return null;
    const close = ss.slice(0, i).map(stepOf).filter(f => f && !ok(a, f)), own = stepOf(ss[i]), reopen = own && ok(a, own) ? [own] : [], later = ss.slice(i + 1).map(stepOf).filter(f => f && ok(a, f));
    return { close, reopen, later }; }
  /* a card dragged to stage st (or the stage picked in Details), at position index in that column */
  async function moveTo(a, st, index){ const to = Store.stage(st), from = Store.stage(a.stage), key = "a:" + a._p;
    if (to.kind !== "open" || (a.stage === st)){ Store.mutate(key, () => { leave(a, from, to); Store.place(a, st, index); if (a.stage !== st || from.id !== st) Store.log("Moved " + Store.actId(a) + " to " + to.name); }); return; }
    const p = plan(a, st); if (!p) return;
    if (!p.close.length && !p.reopen.length && !p.later.length){ Store.mutate(key, () => { leave(a, from, to); Store.place(a, st, index); Store.log("Moved " + Store.actId(a) + " to " + Store.todo(to)); }); return; }
    const r = await ask(a, to, p); if (!r) return App.render();
    Store.mutate(key, () => { leave(a, from, to);
      p.close.forEach(f => mark(a, f, r.close[f.id] === "na" ? NA : f.type === "choice" ? r.close[f.id] : true));
      p.reopen.concat(p.later.filter(f => r.later[f.id])).forEach(f => mark(a, f, f.type === "choice" ? "" : false));
      Store.place(a, st, index); Store.log("Moved " + Store.actId(a) + " to " + Store.todo(to)); }); }
  /* leaving On Hold or Done for a step: the hold and complete ticks follow */
  function leave(a, from, to){ if (from.kind === to.kind) return;
    if (from.kind === "hold" && to.kind !== "hold"){ const f = Store.field("onhold"); if (f) a.f.onhold = false; a.prevHold = null; }
    if (from.kind === "done" && to.kind !== "done"){ const f = Store.fields().find(x => x.type === "complete"); if (f) a.f[f.id] = false; }
    if (to.kind === "done"){ const f = Store.fields().find(x => x.type === "complete"); if (f) a.f[f.id] = true; }
    if (to.kind === "hold"){ const f = Store.field("onhold"); if (f) a.f.onhold = true; } }
  /* the confirm box: each step it passes, Done or Not needed (the category picks its value); the steps it reopens */
  function ask(a, to, p){ return new Promise(res => {
    const row = f => f.type === "choice" ? '<select class="in sm" data-c="' + esc(f.id) + '">' + (f.options || []).filter(o => !o.del).map(o => '<option>' + esc(o.label) + '</option>').join("") + '<option value="na">Not needed</option></select>'
        : '<div class="seg fl-seg" data-c="' + esc(f.id) + '"><button type="button" data-v="done"' + (pref("passDefault") !== "na" ? ' class="on"' : "") + '>Done</button><button type="button" data-v="na"' + (pref("passDefault") === "na" ? ' class="on"' : "") + '>Not needed</button></div>';
    const m = modal('<h3>Move ' + esc(Store.actId(a)) + ' to ' + esc(Store.todo(to)) + '</h3><p class="dim">Moving it changes these steps in the Actions list. Nothing else changes.</p>'
      + (p.close.length ? '<div class="fw-h">Steps it moves past</div>' + p.close.map(f => '<div class="fw-r"><span>' + esc(f.label) + '</span>' + row(f) + '</div>').join("") : "")
      + (p.reopen.length ? '<div class="fw-h">Reopened, to sit in ' + esc(Store.todo(to)) + '</div>' + p.reopen.map(f => '<div class="fw-r"><span>' + esc(f.label) + '</span><span class="dim">' + (f.type === "choice" ? "cleared (the ID goes back to " + esc(((Store.project(a._p) || {}).prefix || "ACT")) + ")" : state(a, f) === "na" ? "not needed, cleared" : "unticked") + '</span></div>').join("") : "")
      + (p.later.length ? '<div class="fw-h">Already done further on <span class="dim">tick any to reopen</span></div>' + p.later.map(f => '<label class="tp-o fw-r"><input type="checkbox" data-l="' + esc(f.id) + '"><span>' + esc(f.label) + ' <span class="dim">' + (state(a, f) === "na" ? "not needed" : "done") + '</span></span></label>').join("") : "")
      + '<div class="yn-btns"><button class="yn-no" type="button">Cancel</button><button class="yn-yes" type="button">Move it</button></div>', { cls: "fw-win" });
    $$(".fl-seg", m).forEach(g => $$("button", g).forEach(b => b.onclick = () => $$("button", g).forEach(x => x.classList.toggle("on", x === b))));
    $(".yn-no", m).onclick = () => { m.close(); res(null); };
    $(".yn-yes", m).onclick = () => { const r = { close: {}, later: {} };
      $$("[data-c]", m).forEach(x => r.close[x.dataset.c] = x.tagName === "SELECT" ? x.value : ($(".on", x) || {}).dataset.v);
      $$("[data-l]", m).forEach(x => r.later[x.dataset.l] = x.checked); m.close(); res(r); }; }); }
  /* deleting an action: it goes to the Deleted pill, off hold and out of complete (to the step its ticks say), so
     bringing it back carries on from there */
  function remove(a){ Store.mutate("a:" + a._p, () => { const k = Store.stage(a.stage).kind; if (k === "hold" || k === "done"){ const to = where(a); leave(a, Store.stage(a.stage), to); Store.place(a, to.id); } a.del = true; Store.touch(a); }); Store.log("Deleted " + Store.actId(a)); }
  /* every tick column is a step: one with no stage yet gets one (the admin is asked first, with exactly what changes) */
  const loose = () => Store.fields().filter(f => f.type === "check" && f.table && !f.stage && f.id !== "onhold");
  const TODO = f => { const l = f.label.trim(), m = l.match(/^(.*?)\s+(sent|arrived|received|created|done|engaged|secured|issued|approved)$/i), V = { sent: "Send", arrived: "Receive", received: "Receive", created: "Create", done: "Do", engaged: "Engage", secured: "Secure", issued: "Issue", approved: "Approve" };
    const t = m ? V[m[2].toLowerCase()] + " " + m[1] : l; return t.replace(/\b\w/g, c => c.toUpperCase()); };
  async function linkAll(){ const fs = loose(); if (!fs.length || !App.isAdmin()) return;
    const plan = fs.map(f => ({ f, id: "st" + uid(), name: TODO(f) }));
    /* who moves: worked out with the new steps in place, then put back */
    plan.forEach(p => { Store.S.config.stages.push({ id: p.id, name: p.name, todo: p.name, kind: "open", color: "#64748b" }); p.f.stage = p.id; });
    const moves = Store.all().filter(a => Store.stage(a.stage).kind === "open").map(a => ({ a, to: where(a) })).filter(m => m.to && m.to.id !== a0(m.a));
    plan.forEach(p => { delete p.f.stage; Store.S.config.stages.splice(Store.S.config.stages.findIndex(s => s.id === p.id), 1); });
    const ok = await new Promise(res => { const m = modal('<h3>Make every tick column a step</h3><p class="dim">Each tick column is a step, done in the order of the columns; a tick marked not needed is skipped. These ticks have no step yet:</p>'
      + plan.map(p => '<div class="fw-r"><span>' + esc(p.f.label) + '</span><span class="dim">new step: <b>' + esc(p.name) + '</b></span></div>').join("")
      + '<p class="dim">The Organizer gets a column for each, in the list\'s order.</p>'
      + (moves.length ? '<div class="fw-h">Actions that move to the step their ticks now say</div>' + moves.map(x => '<div class="fw-r"><span>' + esc(Store.actId(x.a)) + '</span><span class="dim">' + esc(Store.todo(Store.stage(x.a.stage))) + ' → ' + esc(x.to.name) + '</span></div>').join("") : '<p class="dim">No action changes step.</p>')
      + '<div class="yn-btns"><button class="yn-no" type="button">Not now</button><button class="yn-yes" type="button">Add the steps</button></div>', { cls: "fw-win", onClose: () => res(false) });
      $(".yn-no", m).onclick = () => m.close(); $(".yn-yes", m).onclick = () => { res(true); m.close(); }; });
    if (!ok) return;
    Store.mutate("config", () => { const A = Store.S.config.stages, at = A.findIndex(s => !s.del && s.kind !== "open"); plan.forEach(p => { A.splice(at < 0 ? A.length : at, 0, Store.touch({ id: p.id, name: p.name, todo: p.name, kind: "open", color: "#64748b" })); p.f.stage = p.id; Store.touch(p.f); }); Store.S.config.mod = now(); });
    Store.projects().forEach(pj => Store.mutate("a:" + pj.id, () => Store.actsOf(pj.id).forEach(a => { const s0 = a.stage; sync(a); if (a.stage !== s0) Store.touch(a); })));
    Store.log("Made every tick column a step: " + plan.map(p => p.name).join(", ")); App.render(); }
  const a0 = a => a.stage;
  /* once: the Handover tick column and its Hand Over step, before PCCR; the admin is asked first, with every action that changes:
     Commissioning jobs get Handover not needed, actions already handed over and closed get it ticked (the rest of their steps
     not needed), and open ones go to the step their ticks now say */
  async function handoverSetup(){ if (!App.isAdmin() || Store.field("handover")) return;
    const C = Store.S.config, pc = C.fields.findIndex(f => f.id === "pccr"), sp = C.stages.findIndex(s => s.id === (Store.field("pccr") || {}).stage);
    const F = { id: "handover", label: "Handed over", short: "Handover", type: "check", table: true, na: false, stage: "stH" + uid(), desc: "Handed over to whoever owns it (Defect, Punchlist, Operations or Maintenance): the correspondence sent. Ticking it marks the other steps not needed; tick Complete when the work is physically done. Commissioning jobs don't need it." };
    const S = { id: F.stage, name: "Hand Over", todo: "Hand Over", kind: "open", color: "#7C5CD6" };
    const acts = Store.all().filter(a => !a.del), com = acts.filter(a => a.f.category === "Commissioning"), gone = acts.filter(a => HO.includes(a.f.category) && Store.stage(a.stage).kind === "done");
    /* (who moves: worked out with the step in place, then put back) */
    C.fields.splice(pc < 0 ? C.fields.length : pc, 0, F); C.stages.splice(sp < 0 ? C.stages.length : sp, 0, S);
    const moves = acts.filter(a => Store.stage(a.stage).kind === "open" && a.f.category !== "Commissioning").map(a => ({ a, to: where(a) })).filter(m => m.to && m.to.id !== m.a.stage);
    C.fields.splice(C.fields.indexOf(F), 1); C.stages.splice(C.stages.indexOf(S), 1);
    const row = (a, what) => '<div class="fw-r"><span>' + esc(Store.actId(a)) + ' ' + esc((a.f.title || "").slice(0, 50)) + '</span><span class="dim">' + esc(what) + '</span></div>';
    const ok = await new Promise(res => { const m = modal('<h3>Add the Handover step</h3><p class="dim">A Handover tick column before PCCR, and a Hand Over step in the Organizer after Categorize Issue. Ticking Handover marks the other steps not needed; Complete stays yours to tick when the work is physically done. The Category only says what it is. Commissioning jobs don\'t need it.</p>'
      + (gone.length ? '<div class="fw-h">Already handed over and closed: Handover ticked, the rest of their steps not needed</div>' + gone.map(a => row(a, a.f.category)).join("") : "")
      + (com.length ? '<div class="fw-h">Commissioning jobs: Handover not needed</div>' + com.map(a => row(a, "stays at " + Store.todo(Store.stage(a.stage)))).join("") : "")
      + (moves.length ? '<div class="fw-h">Open actions that go to the step their ticks now say</div>' + moves.map(x => row(x.a, Store.todo(Store.stage(x.a.stage)) + " → " + x.to.name)).join("") : "")
      + '<div class="yn-btns"><button class="yn-no" type="button">Not now</button><button class="yn-yes" type="button">Add it</button></div>', { cls: "fw-win", onClose: () => res(false) });
      $(".yn-no", m).onclick = () => m.close(); $(".yn-yes", m).onclick = () => { res(true); m.close(); }; });
    if (!ok) return;
    Store.mutate("config", () => { const at = C.fields.findIndex(f => f.id === "pccr"), as = C.stages.findIndex(s => s.id === (Store.field("pccr") || {}).stage);
      C.fields.splice(at < 0 ? C.fields.length : at, 0, Store.touch(F)); C.stages.splice(as < 0 ? C.stages.length : as, 0, Store.touch(S)); C.mod = now(); });
    const ho = Store.field("handover");
    Store.projects().forEach(pj => Store.mutate("a:" + pj.id, () => Store.actsOf(pj.id).forEach(a => { if (a.del) return; const s0 = a.stage, f0 = JSON.stringify(a.f);
      if (gone.includes(a)){ mark(a, ho, true); handover(a, true); }
      else if (a.f.category === "Commissioning"){ mark(a, ho, NA); (a.auto = a.auto || {}).handover = true; }
      if (Store.stage(a.stage).kind === "open") sync(a);
      if (a.stage !== s0 || JSON.stringify(a.f) !== f0) Store.touch(a); })));
    Store.log("Added the Handover step: " + gone.length + " handed over, " + com.length + " Commissioning not needed, " + moves.length + " moved"); App.render(); }
  /* once: Handover used to complete the action; Complete is now ticked by hand, so the actions it closed are offered back,
     each ticked to reopen (untick any whose work is physically done); they go back to waiting in Hand Over */
  async function reopenHanded(){ const C = Store.S.config; if (!App.isAdmin() || C.hoReopen || !Store.field("handover")) return;
    const list = Store.all().filter(a => !a.del && a.f.handover === true && Store.stage(a.stage).kind === "done");
    const done = () => Store.mutate("config", () => { C.hoReopen = now(); C.mod = now(); });
    if (!list.length) return done();
    const keep = await new Promise(res => { const m = modal('<h3>Reopen the actions Handover closed</h3><p class="dim">Ticking Handover used to complete the action. Complete is now ticked by hand, when the work is physically done. These were closed by Handover; ticked ones reopen and wait in Hand Over. Untick any whose work is physically done.</p>'
      + list.map(a => '<label class="fw-r"><span><input type="checkbox" data-u="' + esc(a._p + ":" + a.u) + '" checked> ' + esc(Store.actId(a)) + ' ' + esc((a.f.title || "").slice(0, 60)) + '</span><span class="dim">' + esc(a.f.category || "") + '</span></label>').join("")
      + '<div class="yn-btns"><button class="yn-no" type="button">Not now</button><button class="yn-yes" type="button">Reopen the ticked ones</button></div>', { cls: "fw-win", onClose: () => res(null) });
      $(".yn-no", m).onclick = () => m.close(); $(".yn-yes", m).onclick = () => { res(new Set($$("input[data-u]:checked", m).map(x => x.dataset.u))); m.close(); }; });
    if (!keep) return;
    Store.projects().forEach(pj => Store.mutate("a:" + pj.id, () => Store.actsOf(pj.id).forEach(a => { if (!keep.has(a._p + ":" + a.u) || Store.stage(a.stage).kind !== "done") return; const to = where(a); if (to){ Store.place(a, to.id); Store.touch(a); Store.log("Reopened " + Store.actId(a) + ": waiting in " + to.name); } })));
    done(); App.render(); }
  /* the Handover tick (inside a Store.mutate): ticked, every step still to do is marked not needed (remembered in a.hoNA) and the
     action waits in Hand Over; ticked off again (or marked not needed), those steps come back. It never completes the action:
     Complete is always ticked by hand, when the work is physically done */
  function handover(a, v){ const steps = open().map(stepOf).filter(f => f && f.type === "check" && f.id !== "handover");
    if (v === true){ a.hoNA = a.hoNA || []; steps.forEach(f => { if (a.f[f.id] !== true && a.f[f.id] !== NA){ mark(a, f, NA); a.hoNA.push(f.id); } }); Store.log("Handed over " + Store.actId(a)); }
    else { (a.hoNA || []).forEach(id => { const f = Store.field(id); if (f && a.f[id] === NA) mark(a, f, ""); }); delete a.hoNA; }
    if (Store.stage(a.stage).kind === "open") sync(a); }
  /* the Category is the handover (Defect, Punchlist, Operations, Maintenance): once, the admin is asked to take the Defect tick
     column and its Send Defect Notice step out of the list and the Organizer, and to close the open actions already handed
     over, each listed with a tick to leave any open */
  const HO = ["Defect", "Punchlist", "Operations", "Maintenance"];
  async function handoverTidy(){ const df = Store.field("defect"); if (!App.isAdmin() || !df || (!df.table && !df.stage)) return;
    const st = df.stage && Store.stage(df.stage), fin = Store.stages().find(s => s.kind === "done");
    const open = Store.all().filter(a => !a.del && Store.stage(a.stage).kind !== "done" && HO.includes(a.f.category));
    const ok = await new Promise(res => { const m = modal('<h3>The Category is now the handover</h3><p class="dim">Defect, Punchlist, Operations and Maintenance are handed to another division: picking one closes the action (it asks first) and it stays on record under Done. Commissioning carries on as now.</p>'
      + '<div class="fw-h">The list and the Organizer</div><div class="fw-r"><span>The Defect tick column</span><span class="dim">taken out of the list (what was ticked is kept)</span></div>'
      + (st && !st.del ? '<div class="fw-r"><span>The ' + esc(st.name) + ' step</span><span class="dim">taken out of the Organizer; its actions move on</span></div>' : "")
      + (open.length ? '<div class="fw-h">Open actions already handed over, to close (untick any to leave open)</div>' + open.map(a => '<label class="fw-r"><span><input type="checkbox" data-u="' + esc(a._p + ":" + a.u) + '" checked> ' + esc(Store.actId(a)) + ' ' + esc((a.f.title || "").slice(0, 60)) + '</span><span class="dim">' + esc(a.f.category) + ', now ' + esc(Store.todo(Store.stage(a.stage))) + (a.f.category === "Defect" && a.f.defect !== true ? ', notice not sent' : "") + '</span></label>').join("") : '<p class="dim">No open action is categorised as a handover.</p>')
      + '<div class="yn-btns"><button class="yn-no" type="button">Not now</button><button class="yn-yes" type="button">Make the change</button></div>', { cls: "fw-win", onClose: () => res(null) });
      $(".yn-no", m).onclick = () => m.close(); $(".yn-yes", m).onclick = () => { res(new Set($$("input[data-u]:checked", m).map(x => x.dataset.u))); m.close(); }; });
    if (!ok) return;
    Store.mutate("config", () => { df.table = false; const was = df.stage; delete df.stage; Store.touch(df); if (was){ const s = Store.S.config.stages.find(x => x.id === was); if (s){ s.del = true; Store.touch(s); } } Store.S.config.mod = now(); });
    Store.projects().forEach(pj => Store.mutate("a:" + pj.id, () => Store.actsOf(pj.id).forEach(a => { if (a.del) return; const s0 = a.stage;
      if (ok.has(a._p + ":" + a.u) && fin){ Store.place(a, fin.id, 0); Store.log("Handed over and closed " + Store.actId(a)); }
      else if (st && a.stage === st.id) sync(a);
      if (a.stage !== s0) Store.touch(a); })));
    Store.log("The Category is now the handover: the Defect column and its step taken out, " + ok.size + " handed over action" + (ok.size === 1 ? "" : "s") + " closed"); App.render(); }
  return { reopenHanded, handoverSetup, handover, handoverTidy, NA, remove, linkAll, loose, where, sync, mark, who, moveTo, stepOf, state, leave };
})();
