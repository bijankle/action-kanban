/* The data: settings (fields, stages, contacts), the project list and each project's actions.
   Every change goes through Store.mutate, which keeps an undo snapshot, marks the file to save and
   saves a few seconds later. Saving re-reads the online copy first and merges item by item (the
   newer edit of each action wins), so two people editing different actions never overwrite each other. */
"use strict";
const P_CONFIG = "data/config.json", P_PROJECTS = "data/projects.json", P_USERS = "data/users.json", P_VENDORS = "data/vendors.json";
const pActs = pid => "data/p/" + pid + "/actions.json";
const pImg = (pid, h) => "data/p/" + pid + "/img/" + h + ".jpg";
const pThumb = (pid, h) => "data/p/" + pid + "/thumb/" + h + ".jpg";
const pFile = (pid, h, name) => "data/p/" + pid + "/files/" + h + "/" + safeName(name);

const YN = ["Yes", "No"];
function defaultConfig(){ const t = now(); const opt = (labels, colors) => labels.map((l, i) => ({ id: uid() + i, label: l, color: (colors || [])[i] || "" }));
  const F = (id, label, type, x) => Object.assign({ id, label, type, builtin: true, table: false, tbc: false, na: false, mod: t }, x || {});
  return { v: 1, mod: t,
    stages: [["Identified", "Identify Issue", "#3B8FE0"], ["Notice Sent", "Draft Notice", "#7C5CD6"], ["WO Created", "Create WO", "#0E9AA7"], ["RFQ Sent", "Draft RFQ", "#C07A12"], ["PO Sent", "Raise PO", "#D6488A"], ["Received", "Await Parts", "#2F7FD1"], ["On Hold", "On Hold", "#F2B03D", "hold"], ["Done", "Done", "#2FB463", "done"]]
      .map(([n, td, c, k], i) => ({ id: "st" + i, name: n, todo: td, color: c, kind: k || "open", print: k !== "done", mod: t })),
    fields: [
      F("title", "Title", "text", { table: true, core: true }),
      F("status", "Status", "stage", { table: true, core: true }),
      F("problem", "Problem", "longtext", { core: true }),
      F("solution", "Solution", "longtext", { core: true }),
      F("notes", "Notes", "longtext", { core: true }),
      F("equipment", "Tags", "multi", { table: true, options: [] }),
      F("location", "Location", "text", { table: true, suggest: true }),
      F("procurement", "Procurement required", "check", { table: true }),
      F("spares", "Spares required", "check", { table: true }),
      F("defect", "Defect notice sent", "choice", { options: opt(YN), tbc: true, na: true, table: true }),
      F("scope", "Scope document sent", "choice", { options: opt(YN), tbc: true, na: true, table: true }),
      F("contractor", "Contractor company", "text", { suggest: true, tbc: true, na: true }),
      F("contractorDate", "Date and time on site", "date", { time: true }),
      F("contractorContact", "Contact name", "contact", { tbc: true, na: true }),
      F("contractorPhone", "Contact number", "phone", { link: "contractorContact" }),
      F("eta", "Parts ETA", "date", { table: true, tbc: true, na: true }),
      F("mto", "MTO", "mto", { table: true, core: true }),
      F("sparelist", "Spares list", "sparelist", { core: true }),
      F("isollist", "Isolations", "isollist", { core: true }),
      F("created", "Date created", "meta", { core: true }),
      F("modified", "Last modified", "meta", { core: true }),
      F("completed", "Date completed", "meta", { core: true }),
      F("complete", "Action complete", "complete", { table: true, core: true })
    ],
    contacts: [] }; }

const Store = (() => {
  const S = { config: null, projects: { v: 1, projects: [] }, acts: {}, users: { v: 1, users: [] }, vendors: { v: 1, categories: [], vendors: [] }, base: {}, conflicts: [], dirty: new Set(), blobs: [], undo: [], redo: [], loaded: false, status: "", edit: false };
  const live = a => (a || []).filter(x => !x.del);

  /* ---------- reading ---------- */
  const stages = () => live(S.config.stages);
  const fields = () => live(S.config.fields).filter(f => f.id !== "priority");   // (no priority: the order in an Organizer column is just the order)
  const field = id => S.config.fields.find(f => f.id === id && !f.del);
  const stage = id => S.config.stages.find(s => s.id === id && !s.del) || stages()[0];
  /* a stage has two names for the same step: done, on the action (its steps row, the pills, exports: "RFQ Sent"), and
     being done, on the Organizer column ("Draft RFQ"); s.todo, else these defaults */
  const TODO = { "Identified": "Identify Issue", "Notice Sent": "Draft Notice", "WO Created": "Create WO", "RFQ Sent": "Draft RFQ", "PO Sent": "Raise PO", "Received": "Await Parts" };
  const todo = s => s ? (s.todo || TODO[s.name] || s.name) : "";
  const contacts = () => live(S.config.contacts);
  const projects = () => live(S.projects.projects);
  const project = pid => S.projects.projects.find(p => p.id === pid);
  const selected = () => { const all = projects().map(p => p.id); let s = lsGet("adSel", null); s = [...new Set((s || all).filter(id => all.includes(id)))]; return s.length ? s : all; };
  const setSelected = ids => { lsSet("adSel", [...new Set(ids)]); };
  const actsOf = pid => live((S.acts[pid] || {}).actions);
  const all = () => projects().flatMap(p => actsOf(p.id).map(a => (a._p = p.id, a)));
  const visible = () => { const sel = selected(); return all().filter(a => sel.includes(a._p)); };
  /* deleted actions are kept, marked, as an archive: the Deleted pill shows them and the bin brings one back */
  const deleted = () => { const sel = selected(); return projects().filter(p => sel.includes(p.id)).flatMap(p => ((S.acts[p.id] || {}).actions || []).filter(a => a && a.del).map(a => (a._p = p.id, a))); };
  const find = (pid, u) => ((S.acts[pid] || {}).actions || []).find(a => a.u === u);
  const findRef = ref => { const [pid, n] = String(ref || "").split(":"); const a = live((S.acts[pid] || {}).actions).find(x => String(x.no) === n || x.u === n); return a ? (a._p = pid, a) : null; };
  const actId = a => { const p = project(a._p) || {}; return (p.prefix || "ACT") + "-" + String(a.no).padStart(4, "0"); };
  /* priority: the action's place in its stage column, counted over the projects on show */
  const ranked = st => visible().filter(a => a.stage === st).sort((x, y) => (x.rank || 0) - (y.rank || 0) || x.no - y.no);
  const priority = a => ranked(a.stage).indexOf(a) + 1;
  /* the search: every word typed has to appear somewhere in the action (ID, project, every field, notes,
     MTO and spares rows, photo, file and quote names, the contractor's company and mobile) */
  const hayCache = new WeakMap();
  function hay(a){ const c = hayCache.get(a); if (c && c.mod === a.mod) return c.t;
    const p = project(a._p) || {}, ct = contacts().find(x => x.name && x.name === a.f.contractor) || {};
    const parts = r => (r || []).map(it => [it.desc, it.part, it.qty, it.unit, it.notes].join(" ")).join(" ");
    const t = [actId(a), a.oldId, (a.owner || {}).n, p.name, p.prefix, stage(a.stage).name, fields().map(f => Fields.text(a, f)).join(" "), a.f.notes, parts(a.mto), parts(a.spares), (a.rfqTo || []).join(" "), a.rfqCat, (a.isol || []).map(it => [it.tag, it.name, it.note].join(" ")).join(" "),
      a.photos.map(x => x.name + " " + (x.cap || "")).join(" "), a.files.map(x => x.name).join(" "), (a.quotes || []).map(x => x.name).join(" "), (a.rfq || []).map(x => x.name).join(" "),
      ct.company, ct.mobile, ct.email].join(" ").toLowerCase();
    hayCache.set(a, { mod: a.mod, t }); return t; }
  const matches = (a, q) => smartHit(hay(a), q);   // (CV 402 finds CV-402 and CV402)

  /* ---------- changing ---------- */
  const snap = () => JSON.stringify({ c: S.config, p: S.projects, a: S.acts, us: S.users });
  function mutate(keys, fn, opts){ if (!S.edit && !(opts && opts.force)){ App.viewOnly(); return false; }
    const pids = [].concat(keys).filter(k => String(k).startsWith("a:")).map(k => k.slice(2)), was = {};
    pids.forEach(pid => was[pid] = new Map(((S.acts[pid] || {}).actions || []).map(a => [a.u, JSON.stringify(clean(a))])));
    const pre = snap(); const r = fn(); pids.forEach(pid => logChanges(pid, was[pid])); S.undo.push({ pre, post: snap() }); if (S.undo.length > 150) S.undo.shift(); S.redo = [];
    [].concat(keys).forEach(k => S.dirty.add(k)); stash(); saveSoon(); App.render(); return r === undefined ? true : r; }
  const me = () => (Profile.get().email || "").toLowerCase();
  const touch = o => { o.mod = now(); o.by = Profile.name() || "Someone"; if (me()) o.byE = me(); else delete o.byE; return o; };
  const mine = o => o && (o.byE ? o.byE === me() : o.by === Profile.name());
  /* everyone who has signed in (data/users.json): name, role, mobile and email, so edits and warnings can name people */
  /* what the Materials tab says about an action: procurement needed (MTO rows), spares available (Spares rows), and
     the parts ETA (the latest ETA on its MTO rows; an older action's own ETA otherwise) */
  const rowsOf = l => (l || []).filter(it => it && (it.desc || it.part || it.qty));
  const procurement = a => rowsOf(a.mto).length > 0, sparesAvail = a => rowsOf(a.spares).length > 0;
  const eta = a => { const ds = rowsOf(a.mto).map(it => it.eta).filter(Boolean), d = ds.filter(x => /^\d{4}-\d\d-\d\d$/.test(x)).sort().pop(); return d || (ds.includes("TBC") ? "TBC" : "") || a.f.eta || ""; };
  const users = () => live(S.users.users);
  /* one entry per person: the same email (any capitals, spaces) is one account, the most recently changed copy kept */
  function oneEach(list){ const m = new Map(); (list || []).forEach(u => { const k = String(u.id || u.email || "").trim().toLowerCase(); if (!k) return; u.id = k; const o = m.get(k); if (!o || (u.mod || 0) >= (o.mod || 0)) m.set(k, o ? Object.assign({}, o, u) : u); }); return [...m.values()]; }
  /* the action's owner, with their details from the people who've signed in: { n, e, role, mobile } */
  const owner = a => { const o = a && a.owner || {}, u = (o.e && users().find(x => x.id === o.e)) || (o.n && users().find(x => [x.first, x.last].filter(Boolean).join(" ").toLowerCase() === String(o.n).toLowerCase()));
    return u ? { n: [u.first, u.last].filter(Boolean).join(" ") || o.n, e: u.email || u.id, role: u.role, mobile: u.mobile } : { n: o.n || "", e: o.e || "" }; };
  const user = email => users().find(u => u.id === String(email || "").toLowerCase());
  function saveUser(p, force){ const id = String(p.email || "").trim().toLowerCase(); if (!id) return; const cur = S.users.users.find(u => u.id === id), u = Object.assign({}, cur || { id, created: now() }, { first: p.first, last: p.last, mobile: p.mobile, email: p.email, role: p.role });
    if (!force && cur && ["first", "last", "mobile", "role"].every(k => (cur[k] || "") === (u[k] || ""))) return; u.mod = now();   // (force: held back until we could save, so save it now)
    if (cur) Object.assign(cur, u); else S.users.users.push(u);
    if (S.edit){ S.dirty.add("users"); stash(); saveSoon(); } else lsSet("adPendUser", p); }
  /* ---------- change history: who changed what on each action, and when (a.hist, newest last, the last 400) ---------- */
  const HSKIP = new Set(["mod", "by", "byE", "_p", "hist", "rank", "stageAt", "doneAt", "prevStage", "prevHold", "hold", "isolNo", "am", "u", "no", "created"]);
  const LIST = { isol: ["Isolations", x => x.tag || x.name], mto: ["MTO", x => x.desc || x.part], spares: ["Spares", x => x.desc || x.part], photos: ["Photos", x => x.name], files: ["Attachments", x => x.name],
    quotes: ["Quotes", x => x.name], rfq: ["RFQ revisions", x => x.name], dwgPick: ["Ticked drawings", x => x], rfqTo: ["Send RFQ to", x => x] };
  const short = v => { const t = v == null || v === "" ? "–" : typeof v === "boolean" ? (v ? "Yes" : "No") : Array.isArray(v) ? (v.join(", ") || "–") : typeof v === "object" ? (v.n || v.name || JSON.stringify(v)) : String(v); return t.length > 140 ? t.slice(0, 137) + "…" : t; };
  /* what changed between two copies of an action, as [what, from, to] lines */
  function diff(o, n){ const out = [];
    if (!o) return [["Created", "", ""]];
    if (!!o.del !== !!n.del) out.push([n.del ? "Deleted the action" : "Restored the action", "", ""]);
    if (o.stage !== n.stage) out.push(["Stage", stage(o.stage).name, stage(n.stage).name]);
    const of = o.f || {}, nf = n.f || {};
    new Set(Object.keys(of).concat(Object.keys(nf))).forEach(k => { if (eq(of[k], nf[k])) return; const fd = field(k); out.push([fd ? fd.label : k, short(fd && fd.type === "stage" ? stage(of[k]).name : of[k]), short(fd && fd.type === "stage" ? stage(nf[k]).name : nf[k])]); });
    new Set(Object.keys(o).concat(Object.keys(n))).forEach(k => { if (HSKIP.has(k) || k === "f" || k === "stage" || k === "del" || eq(o[k], n[k])) return;
      const L = LIST[k]; if (!L){ out.push([k === "owner" ? "Action owner" : k, short(o[k]), short(n[k])]); return; }
      const id = x => typeof x === "object" && x ? (x.id || x.h || L[1](x)) : x, om = new Map((o[k] || []).map(x => [id(x), x])), nm = new Map((n[k] || []).map(x => [id(x), x]));
      const add = [...nm.keys()].filter(x => !om.has(x)).map(x => L[1](nm.get(x)) || "a row"), rem = [...om.keys()].filter(x => !nm.has(x)).map(x => L[1](om.get(x)) || "a row"), chg = [...nm.keys()].filter(x => om.has(x) && !eq(om.get(x), nm.get(x))).map(x => L[1](nm.get(x)) || "a row");
      if (add.length) out.push([L[0], "", "added " + short(add)]); if (rem.length) out.push([L[0], "removed " + short(rem), ""]); if (chg.length) out.push([L[0], "", "changed " + short(chg)]);
      if (!add.length && !rem.length && !chg.length) out.push([L[0], "", "reordered"]); });
    return out; }
  const entry = (c, note) => ({ i: uid(), t: now(), by: Profile.name() || "Someone", e: me() || undefined, c, note });
  function logChanges(pid, was){ ((S.acts[pid] || {}).actions || []).forEach(a => { const o = was.get(a.u), cur = JSON.stringify(clean(a)); if (o === cur) return;
      const c = diff(o && JSON.parse(o), clean(a)); if (!c.length) return; (a.hist = a.hist || []).push(entry(c)); if (a.hist.length > 400) a.hist.splice(0, a.hist.length - 400); }); }
  /* two copies' histories together (each entry once, in time order) */
  const histUnion = (x, y) => { const m = new Map(); (x || []).concat(y || []).forEach(h => m.set(h.i, h)); return [...m.values()].sort((a, b) => a.t - b.t).slice(-400); };

  /* undo / redo: put back only the items that change touched (its copy from before, or after), each stamped as
     new so it also wins over the online copy; everything else, including other people's work, is left alone */
  function apply(fromS, toS){ const F = JSON.parse(fromS), T = JSON.parse(toS), t = now();
    const put = (cur, from, to, key, mark) => { let changed = false; const fm = new Map((from || []).map(x => [x[key], x])), tm = new Map((to || []).map(x => [x[key], x]));
      new Set([...fm.keys(), ...tm.keys()]).forEach(id => { const f = fm.get(id), n = tm.get(id); if (eq(f, n)) return; changed = true;
        const i = cur.findIndex(x => x[key] === id), nv = n ? Object.assign(clone(n), { mod: t }) : null;
        if (i >= 0){ const o = cur[i], keep = o.hist; if (nv){ Object.keys(o).forEach(k => { if (k !== "_p") delete o[k]; }); Object.assign(o, nv); } else { o.del = true; o.mod = t; }
          if (key === "u"){ o.hist = histUnion(keep, o.hist); const c = diff(f && clean(f), clean(o)); if (c.length) o.hist.push(entry(c, how)); } }
        else if (nv) cur.push(nv); });
      const fo = (from || []).map(x => x[key]).join("|"), to2 = (to || []).map(x => x[key]).join("|");
      if (fo !== to2 && key === "id"){ const ix = new Map((to || []).map((x, i) => [x.id, i])); cur.sort((a, b) => (ix.has(a.id) ? ix.get(a.id) : 1e9) - (ix.has(b.id) ? ix.get(b.id) : 1e9)); changed = true; }
      if (changed) mark(); };
    ["stages", "fields", "contacts"].forEach(k => put(S.config[k], F.c[k], T.c[k], "id", () => { S.config.mod = t; S.dirty.add("config"); }));
    Object.keys(T.c).forEach(k => { if (!["stages", "fields", "contacts", "mod"].includes(k) && !eq(F.c[k], T.c[k])){ S.config[k] = clone(T.c[k]); S.config.mod = t; S.dirty.add("config"); } });
    put(S.projects.projects, F.p.projects, T.p.projects, "id", () => S.dirty.add("projects"));
    new Set([...Object.keys(F.a), ...Object.keys(T.a)]).forEach(pid => { const pa = S.acts[pid] || (S.acts[pid] = { v: 1, nextNo: 1, actions: [] });
      put(pa.actions, (F.a[pid] || {}).actions, (T.a[pid] || {}).actions, "u", () => S.dirty.add("a:" + pid)); pa.nextNo = Math.max(pa.nextNo || 1, (T.a[pid] || {}).nextNo || 1, (F.a[pid] || {}).nextNo || 1); });
    stash(); saveSoon(); App.render(); }
  let how = "";
  function undo(){ if (!S.edit) return App.viewOnly(); const e = S.undo.pop(); if (!e) return note("Nothing to undo"); how = "Undo"; apply(e.post, e.pre); how = ""; S.redo.push(e); note("Undone"); }
  function redo(){ if (!S.edit) return App.viewOnly(); const e = S.redo.pop(); if (!e) return note("Nothing to redo"); how = "Redo"; apply(e.pre, e.post); how = ""; S.undo.push(e); note("Redone"); }

  function newAction(pid, vals, stageId){ const pa = S.acts[pid] || (S.acts[pid] = { nextNo: 1, actions: [] });
    const st = stageId || stages()[0].id; const top = ranked(st)[0];
    const a = touch({ u: uid(), no: pa.nextNo++, stage: st, stageAt: { [st]: now() }, rank: top ? (top.rank || 0) - 1 : 0, created: now(), f: Object.assign({}, vals || {}, vals && vals.title ? { title: properTitle(vals.title) } : {}), photos: [], files: [] });
    if (Profile.name()) a.owner = me() ? { n: Profile.name(), e: me() } : { n: Profile.name() };   // (the owner starts as whoever made it)
    pa.actions.push(a); a._p = pid; return a; }
  /* move an action to a stage, at a position in that column (index among what's on show) */
  function place(a, st, index){ const col = ranked(st).filter(x => x !== a); index = Math.max(0, Math.min(index == null ? col.length : index, col.length));
    const before = col[index - 1], after = col[index];
    a.rank = before && after ? ((before.rank || 0) + (after.rank || 0)) / 2 : before ? (before.rank || 0) + 1 : after ? (after.rank || 0) - 1 : 0;
    if (before && after && before.rank === after.rank){ col.forEach((x, i) => { x.rank = i * 2; touch(x); S.dirty.add("a:" + x._p); }); a.rank = index * 2 - 1; }
    if (a.stage !== st) enter(a, st); a.stage = st; touch(a); }
  /* the dates an action entered each stage, and when it was completed */
  function enter(a, st){ const was = stage(a.stage), to = stage(st); (a.stageAt = a.stageAt || {})[st] = now(); ticks(a, was, to);
    if (to.kind === "done" && was.kind !== "done"){ a.doneAt = now(); a.prevStage = a.stage; } else if (to.kind !== "done" && was.kind === "done") a.doneAt = null; }
  /* the stage tick boxes (a field with stage: its stage's id): leaving a stage for a later one ticks that stage's box
     only, so a skipped stage stays unticked; going back unticks that stage's box and every one after it. On Hold keeps
     the ticks and remembers where the action came from (prevHold), and leaving it counts from there. The boxes can also
     be ticked by hand. */
  function ticks(a, was, to){ if (to.kind === "hold"){ if (was.kind !== "hold"){ a.prevHold = was.id; if (typeof Hold !== "undefined") Hold.entered(a); } return; }
    if (was.kind === "hold"){ was = stage(a.prevHold) || stages()[0]; a.prevHold = null; }
    const order = stages().filter(s => s.kind !== "hold"), at = s => order.findIndex(x => x.id === s.id), i = at(was), j = at(to); if (i < 0 || j < 0 || i === j) return;
    const box = s => fields().find(f => f.stage === s.id && f.type === "check");
    if (j > i){ const b = box(was); if (b) a.f[b.id] = true; }
    else order.slice(j).forEach(s => { const b = box(s); if (b && a.f[b.id]) a.f[b.id] = false; }); }
  /* rename a choice option everywhere it's used */
  function renameOption(f, oldL, newL){ all().forEach(a => { const v = a.f[f.id]; if (v === oldL){ a.f[f.id] = newL; touch(a); S.dirty.add("a:" + a._p); }
    else if (Array.isArray(v) && v.includes(oldL)){ a.f[f.id] = v.map(x => x === oldL ? newL : x); touch(a); S.dirty.add("a:" + a._p); } }); }

  /* ---------- merging with the online copy ---------- */
  function mergeById(loc, rem, key){ key = key || "id"; const out = [], seen = new Map(); (rem || []).forEach(x => seen.set(x[key], x));
    (loc || []).forEach(x => { const r = seen.get(x[key]); out.push(r && (r.mod || 0) > (x.mod || 0) ? r : x); seen.delete(x[key]); });
    seen.forEach(x => out.push(x)); return out; }
  function mergeConfig(loc, rem){ if (!rem) return loc; const o = Object.assign({}, rem, loc);
    ["stages", "fields", "contacts"].forEach(k => { o[k] = mergeById(loc[k], rem[k]); if ((rem.mod || 0) > (loc.mod || 0)) o[k] = orderLike(o[k], rem[k]); });
    o.mod = Math.max(loc.mod || 0, rem.mod || 0); return o; }
  const orderLike = (arr, ref) => { const ix = new Map(ref.map((x, i) => [x.id, i])); return arr.slice().sort((a, b) => (ix.has(a.id) ? ix.get(a.id) : 1e9) - (ix.has(b.id) ? ix.get(b.id) : 1e9)); };
  /* take in a newer copy of a project's actions while keeping each action the same object, so an open side
     panel or Organizer callout keeps editing the live action rather than a stale copy */
  function adopt(pid, pa){ const old = new Map(((S.acts[pid] || {}).actions || []).map(a => [a.u, a]));
    pa.actions = (pa.actions || []).map(n => { const o = old.get(n.u); if (!o || o === n) return n; Object.keys(o).forEach(k => { if (k !== "_p") delete o[k]; }); Object.assign(o, n); return o; });
    S.acts[pid] = pa; }
  function adoptList(cur, next, key){ const old = new Map((cur || []).map(x => [x[key], x]));
    return (next || []).map(n => { const o = old.get(n[key]); if (!o || o === n) return n; Object.keys(o).forEach(k => delete o[k]); Object.assign(o, n); return o; }); }
  function adoptConfig(c){ if (!c) return; if (!S.config){ S.config = c; return; } ["stages", "fields", "contacts"].forEach(k => c[k] = adoptList(S.config[k], c[k], "id"));
    Object.keys(S.config).forEach(k => delete S.config[k]); Object.assign(S.config, c); }
  /* the copy of each action as last read from (or written to) GitHub: the common starting point for a merge */
  function setBase(pid, pa){ S.base[pid] = {}; ((pa || {}).actions || []).forEach(a => S.base[pid][a.u] = JSON.stringify(clean(a))); }
  const eq = (x, y) => JSON.stringify(x === undefined ? null : x) === JSON.stringify(y === undefined ? null : y);
  /* both sides changed one action: keep every field each side changed; where both changed the same field, ours
     wins and the other person is named in the warning */
  function merge3(b, l, r, pid){ const o = clean(r), clash = [];
    new Set(Object.keys(l).concat(Object.keys(r), Object.keys(b))).forEach(k => { if (k === "f" || k === "mod" || k === "by" || k === "byE" || k === "_p" || k === "hist") return;
      if (!eq(l[k], b[k])){ if (!eq(r[k], b[k]) && !eq(r[k], l[k])) clash.push(k); o[k] = clone(l[k]); } });
    const lf = l.f || {}, rf = r.f || {}, bf = b.f || {}; o.f = Object.assign({}, rf);
    new Set(Object.keys(lf).concat(Object.keys(rf), Object.keys(bf))).forEach(k => { if (!eq(lf[k], bf[k])){ if (!eq(rf[k], bf[k]) && !eq(rf[k], lf[k])) clash.push("f." + k); o.f[k] = clone(lf[k]); } });
    Object.assign(o, (l.mod || 0) >= (r.mod || 0) ? { mod: l.mod, by: l.by, byE: l.byE } : { mod: r.mod, by: r.by, byE: r.byE }); if (!o.byE) delete o.byE;
    o.hist = histUnion(l.hist, r.hist); if (!o.hist.length) delete o.hist;
    S.conflicts.push({ pid, u: l.u, by: r.by, byE: r.byE, at: r.mod, clash }); return o; }
  function mergeActs(loc, rem, pid){ if (!rem) return loc; const base = S.base[pid] || {}, rm = new Map((rem.actions || []).map(a => [a.u, a]));
    const actions = mergeById(loc.actions, rem.actions, "u").map(a => { const l = (loc.actions || []).find(x => x.u === a.u), r = rm.get(a.u), b = base[a.u] && JSON.parse(base[a.u]);
      if (!l || !r || !b) return a; const lc = !eq(clean(l), b), rc = !eq(clean(r), b);
      if (lc && rc && !eq(clean(l), clean(r))) return merge3(b, clean(l), r, pid); return lc ? l : r; });
    let next = Math.max(loc.nextNo || 1, rem.nextNo || 1); const remU = new Set((rem.actions || []).map(a => a.u)), used = new Map();
    actions.filter(a => remU.has(a.u)).forEach(a => used.set(a.no, a.u));
    actions.filter(a => !remU.has(a.u)).forEach(a => { if (used.has(a.no) && used.get(a.no) !== a.u){ a.no = next++; touch(a); } used.set(a.no, a.u); next = Math.max(next, a.no + 1); });
    return { v: 1, nextNo: next, actions }; }

  /* ---------- saving ---------- */
  let saving = false, again = false, retryT = 0;
  const saveSoon = debounce(() => save(), 2500);
  function setStatus(s, msg){ S.status = s; S.statusMsg = msg || ""; App.renderStatus && App.renderStatus(); }
  const clean = o => JSON.parse(JSON.stringify(o, (k, v) => k === "_p" ? undefined : v));
  async function save(){ if (!S.dirty.size && !S.blobs.length) return; if (!S.edit) return; if (saving){ again = true; return; }
    saving = true; setStatus("saving"); clearTimeout(retryT);
    try { for (let tries = 0; ; tries++){ const keys = [...S.dirty], blobs = S.blobs.slice(), entries = [], wrote = {}, at = await GH.head(), clashN = S.conflicts.length;
        for (const k of keys){
          if (k === "config"){ adoptConfig(mergeConfig(S.config, await GH.readJson(P_CONFIG, at))); wrote[k] = ser(k); entries.push({ path: P_CONFIG, content: wrote[k] }); }
          else if (k === "projects"){ const r = await GH.readJson(P_PROJECTS, at); S.projects.projects = adoptList(S.projects.projects, mergeById(S.projects.projects, r && r.projects), "id"); wrote[k] = ser(k); entries.push({ path: P_PROJECTS, content: wrote[k] }); }
          else if (k === "vendors"){ wrote[k] = ser(k); entries.push({ path: P_VENDORS, content: wrote[k] }); }
          else if (k === "users"){ const r = await GH.readJson(P_USERS, at); S.users = { v: 1, users: oneEach(mergeById(S.users.users, r && r.users)) }; wrote[k] = ser(k); entries.push({ path: P_USERS, content: wrote[k] }); }
          else { const pid = k.slice(2), pr = project(pid); if (!pr || pr.del){ S.dirty.delete(k); continue; } adopt(pid, mergeActs(S.acts[pid], await GH.readJson(pActs(pid), at), pid)); wrote[k] = ser(k); entries.push({ path: pActs(pid), content: wrote[k] }); } }
        blobs.forEach(b => entries.push(b));
        try { await GH.commit(entries, commitMsg(), at);
          keys.forEach(k => { if (ser(k) === wrote[k]) S.dirty.delete(k); if (k.startsWith("a:")) setBase(k.slice(2), JSON.parse(wrote[k])); }); S.blobs = S.blobs.filter(b => !blobs.includes(b)); break; }
        catch (e){ S.conflicts.length = clashN; if (!e.conflict || tries > 3) throw e; } }
      lastMsgs = []; stash(); setStatus("saved"); Local.backup(S); App.renderIdle();   // (not while a dropdown or box is in use)
      if (S.conflicts.length){ const c = S.conflicts.splice(0); App.clashes && App.clashes(c); } }
    catch (e){ console.error(e); setStatus("error", e.status === 401 || e.status === 403 ? "The GitHub key was refused" : navigator.onLine ? (e.detail || e.message) : "Offline"); retryT = setTimeout(save, 20000); }
    finally { saving = false; if (again){ again = false; saveSoon(); } } }
  /* a file's content as it's written to GitHub */
  const ser = k => k === "vendors" ? JSON.stringify(S.vendors, null, 1) : k === "config" ? JSON.stringify(clean(S.config), null, 1) : k === "projects" ? JSON.stringify(S.projects, null, 1) : k === "users" ? JSON.stringify(S.users, null, 1) : JSON.stringify(clean(S.acts[k.slice(2)]), null, 1);
  let lastMsgs = []; const log = m => { if (lastMsgs[lastMsgs.length - 1] === m) return; lastMsgs.push(m); if (lastMsgs.length > 8) lastMsgs.shift(); };
  const commitMsg = () => (lastMsgs.length ? lastMsgs.join("; ") : "Update actions") + " (" + (Profile.name() || "Action Database") + ")";
  /* unsaved work is kept on this device until it's online, so closing the tab never loses it */
  const stash = debounce(() => IDB.set("state", { c: S.config, p: S.projects, a: clean(S.acts), us: S.users, vd: S.vendors, base: S.base, dirty: [...S.dirty], blobs: S.blobs, at: now() }), 300);
  async function addBlob(path, b64){ const sha = await GH.blob(b64); S.blobs.push({ path, sha }); stash(); saveSoon(); }

  /* ---------- loading ---------- */
  async function load(){ const cached = await IDB.get("state");
    if (cached && cached.c){ S.config = cached.c; S.projects = cached.p; S.acts = cached.a || {}; S.users = cached.us || S.users; S.vendors = cached.vd || S.vendors; S.base = cached.base || {}; (cached.dirty || []).forEach(k => S.dirty.add(k)); S.blobs = cached.blobs || []; S.loaded = true; App.render(); }
    try { await refresh(true); } catch (e){ console.error(e); if (!S.loaded) throw e; note("Couldn't reach GitHub, showing the copy saved on this device"); }
    if (!S.config){ S.config = defaultConfig(); S.dirty.add("config"); }
    S.loaded = true; App.render(); if (S.dirty.size || S.blobs.length) saveSoon(); }
  async function refresh(first){ const held = () => S.edit && S.dirty.size && !first; if (saving || held()) return false;
    const [c, p, us, vd] = await Promise.all([GH.readJson(P_CONFIG), GH.readJson(P_PROJECTS), GH.readJson(P_USERS), GH.readJson(P_VENDORS)]);
    const allP = p && p.projects || [], acts = {}; const list = live(allP); await Promise.all(list.map(async x => { acts[x.id] = await GH.readJson(pActs(x.id)) || { v: 1, nextNo: 1, actions: [] }; }));
    if (saving || held()) return false;
    const before = snap(), prev = JSON.parse(JSON.stringify(S.acts, (k, v) => k === "_p" ? undefined : v));
    S.users = { v: 1, users: oneEach(mergeById(S.users.users, us && us.users)) }; if (vd && !S.dirty.has("vendors")) S.vendors = vd;
    const fresh = {}; list.forEach(x => fresh[x.id] = clone(acts[x.id])); carryOver(acts);   // (fresh: what's online, the base for the next merge)
    if (S.dirty.size){ if (c) adoptConfig(mergeConfig(S.config || c, c)); S.projects.projects = adoptList(S.projects.projects, mergeById(S.projects.projects, allP), "id"); list.forEach(x => { adopt(x.id, mergeActs(S.acts[x.id] || acts[x.id], fresh[x.id], x.id)); setBase(x.id, fresh[x.id]); }); }
    else { if (c) adoptConfig(c); S.projects.projects = adoptList(S.projects.projects, allP, "id"); list.forEach(x => { setBase(x.id, acts[x.id]); adopt(x.id, acts[x.id]); }); Object.keys(S.acts).forEach(pid => { if (!acts[pid]) delete S.acts[pid]; }); }
    /* someone else changed actions while we looked: tell the app which (it warns if one is open) */
    if (!first){ const ch = []; list.forEach(x => (S.acts[x.id].actions || []).forEach(a => { const o = ((prev[x.id] || {}).actions || []).find(y => y.u === a.u); if (o && (o.mod || 0) < (a.mod || 0) && !mine(a)) ch.push(x.id + ":" + a.u); })); if (ch.length && App.othersChanged) App.othersChanged(ch); }
    if (S.config) fixConfig(S.config);
    if (snap() !== before){ stash(); return true; } return false; }
  /* unsaved edits to a list that's since been merged away (the actions moved into another project): carry each edited
     action's changes over to where it now lives, by its id, and stop saving the old list (it would come back) */
  function carryOver(acts){ [...S.dirty].filter(k => k.startsWith("a:") && !acts[k.slice(2)]).forEach(k => { const pid = k.slice(2), base = S.base[pid] || {};
      ((S.acts[pid] || {}).actions || []).forEach(l => { const b = base[l.u] && JSON.parse(base[l.u]), lc = clean(l); if (b && eq(lc, b)) return;
        Object.keys(acts).forEach(np => { const r = (acts[np].actions || []).find(x => x.u === l.u); if (!r) return; const B = b || {};
          Object.keys(lc).forEach(f => { if (["f", "_p", "no", "mod", "by", "byE", "hist"].includes(f) || eq(lc[f], B[f])) return; r[f] = clone(lc[f]); });
          r.f = Object.assign({}, r.f); Object.keys(lc.f || {}).forEach(f => { if (!eq(lc.f[f], (B.f || {})[f])) r.f[f] = clone(lc.f[f]); });
          r.hist = histUnion(r.hist, lc.hist); r.mod = Math.max(r.mod || 0, lc.mod || 0); r.by = lc.by; S.dirty.add("a:" + np); }); });
      S.dirty.delete(k); delete S.acts[pid]; delete S.base[pid]; }); }
  /* older files may be missing settings added later */
  function fixConfig(c){ const d = defaultConfig(); ["stages", "fields", "contacts"].forEach(k => c[k] = c[k] || d[k]);
    d.fields.forEach(f => { if (f.core && !c.fields.some(x => x.id === f.id)) c.fields.push(f); });
    /* Action complete stays the very last field */
    const i = c.fields.findIndex(f => f.id === "complete"); if (i >= 0 && i !== c.fields.length - 1) c.fields.push(c.fields.splice(i, 1)[0]); }

  return { S, enter, stages, fields, field, stage, todo, contacts, projects, project, selected, setSelected, actsOf, all, visible, deleted, find, findRef, actId, ranked, priority,
    stashNow: () => stash.flush ? stash.flush() : stash(), vendors: () => S.vendors, owner, procurement, sparesAvail, eta, matches, mutate, touch, mine, users, user, saveUser, undo, redo, newAction, place, renameOption, save, saveSoon, load, refresh, addBlob, log, live, mergeActs, mergeConfig };
})();
