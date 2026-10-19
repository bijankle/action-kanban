/* The data: settings (fields, stages, contacts), the project list and each project's actions.
   Every change goes through Store.mutate, which keeps an undo snapshot, marks the file to save and
   saves a few seconds later. Saving re-reads the online copy first and merges item by item (the
   newer edit of each action wins), so two people editing different actions never overwrite each other. */
"use strict";
const P_CONFIG = "data/config.json", P_PROJECTS = "data/projects.json";
const pActs = pid => "data/p/" + pid + "/actions.json";
const pImg = (pid, h) => "data/p/" + pid + "/img/" + h + ".jpg";
const pThumb = (pid, h) => "data/p/" + pid + "/thumb/" + h + ".jpg";
const pFile = (pid, h, name) => "data/p/" + pid + "/files/" + h + "/" + safeName(name);

const YN = ["Yes", "No"];
function defaultConfig(){ const t = now(); const opt = (labels, colors) => labels.map((l, i) => ({ id: uid() + i, label: l, color: (colors || [])[i] || "" }));
  const F = (id, label, type, x) => Object.assign({ id, label, type, builtin: true, table: false, tbc: false, na: false, mod: t }, x || {});
  return { v: 1, mod: t,
    stages: [["Issue Identified", "#3B8FE0"], ["Defect Notification Sent", "#7C5CD6"], ["Work Order Created", "#0E9AA7"], ["Parts Procured", "#C07A12"], ["Work Scheduled", "#2F7FD1"], ["On Hold", "#F2B03D", "hold"], ["Completed", "#2FB463", "done"]]
      .map(([n, c, k], i) => ({ id: "st" + i, name: n, color: c, kind: k || "open", print: k !== "done", mod: t })),
    fields: [
      F("title", "Title", "text", { table: true, core: true }),
      F("status", "Status", "stage", { table: true, core: true }),
      F("priority", "Priority", "rank", { table: true, core: true }),
      F("problem", "Problem", "longtext", { core: true }),
      F("solution", "Solution", "longtext", { core: true }),
      F("location", "Location", "text", { table: true, suggest: true }),
      F("equipment", "Equipment tags", "multi", { table: true, options: [] }),
      F("procurement", "Procurement required", "check", { table: true }),
      F("defect", "Defect notice sent", "choice", { options: opt(YN), tbc: true, na: true }),
      F("scope", "Scope document sent", "choice", { options: opt(YN), tbc: true, na: true }),
      F("contractorAssigned", "Contractor assigned", "choice", { options: opt(YN), tbc: true, na: true }),
      F("contractor", "Contractor name", "contact", { tbc: true, na: true }),
      F("contractorPhone", "Contractor number", "phone", { link: "contractor" }),
      F("eta", "Goods receival ETA", "date", { table: true, tbc: true, na: true })
    ],
    contacts: [] }; }

const Store = (() => {
  const S = { config: null, projects: { v: 1, projects: [] }, acts: {}, dirty: new Set(), blobs: [], undo: [], redo: [], loaded: false, status: "", edit: false };
  const live = a => (a || []).filter(x => !x.del);

  /* ---------- reading ---------- */
  const stages = () => live(S.config.stages);
  const fields = () => live(S.config.fields);
  const field = id => S.config.fields.find(f => f.id === id && !f.del);
  const stage = id => S.config.stages.find(s => s.id === id && !s.del) || stages()[0];
  const contacts = () => live(S.config.contacts);
  const projects = () => live(S.projects.projects);
  const project = pid => S.projects.projects.find(p => p.id === pid);
  const selected = () => { const all = projects().map(p => p.id); let s = lsGet("adSel", null); s = [...new Set((s || all).filter(id => all.includes(id)))]; return s.length ? s : all; };
  const setSelected = ids => { lsSet("adSel", [...new Set(ids)]); };
  const actsOf = pid => live((S.acts[pid] || {}).actions);
  const all = () => projects().flatMap(p => actsOf(p.id).map(a => (a._p = p.id, a)));
  const visible = () => { const sel = selected(); return all().filter(a => sel.includes(a._p)); };
  const find = (pid, u) => ((S.acts[pid] || {}).actions || []).find(a => a.u === u);
  const findRef = ref => { const [pid, n] = String(ref || "").split(":"); const a = live((S.acts[pid] || {}).actions).find(x => String(x.no) === n || x.u === n); return a ? (a._p = pid, a) : null; };
  const actId = a => { const p = project(a._p) || {}; return (p.prefix || "ACT") + "-" + String(a.no).padStart(4, "0"); };
  /* priority: the action's place in its stage column, counted over the projects on show */
  const ranked = st => visible().filter(a => a.stage === st).sort((x, y) => (x.rank || 0) - (y.rank || 0) || x.no - y.no);
  const priority = a => ranked(a.stage).indexOf(a) + 1;

  /* ---------- changing ---------- */
  const snap = () => JSON.stringify({ c: S.config, p: S.projects, a: S.acts });
  function mutate(keys, fn, opts){ if (!S.edit && !(opts && opts.force)){ App.viewOnly(); return false; }
    S.undo.push(snap()); if (S.undo.length > 150) S.undo.shift(); S.redo = [];
    const r = fn(); [].concat(keys).forEach(k => S.dirty.add(k)); stash(); saveSoon(); App.render(); return r === undefined ? true : r; }
  const touch = o => { o.mod = now(); o.by = lsGet("adName", "") || "Someone"; return o; };
  /* undo / redo: put the old copy back and stamp what changed as new, so it also wins over the online copy */
  function restore(from, to){ const old = JSON.parse(from), cur = JSON.parse(snap());
    const relive = (oa, ca, key) => { const om = new Map((oa || []).map(x => [x[key], x])); (ca || []).forEach(x => { if (!om.has(x[key])) oa.push(Object.assign({}, x, { del: true })); });
      (oa || []).forEach(x => { const c = (ca || []).find(y => y[key] === x[key]); if (!c || JSON.stringify(c) !== JSON.stringify(x)) x.mod = now(); }); };
    ["stages", "fields", "contacts"].forEach(k => relive(old.c[k], cur.c[k], "id")); old.c.mod = now();
    relive(old.p.projects, cur.p.projects, "id");
    Object.keys(cur.a).forEach(pid => { if (!old.a[pid]) old.a[pid] = { nextNo: cur.a[pid].nextNo, actions: [] }; relive(old.a[pid].actions, cur.a[pid].actions, "u"); old.a[pid].nextNo = Math.max(old.a[pid].nextNo || 1, cur.a[pid].nextNo || 1); });
    S.config = old.c; S.projects = old.p; S.acts = old.a; S.undo.length > 150 && S.undo.shift(); to.push(snap());
    S.dirty.add("config"); S.dirty.add("projects"); Object.keys(S.acts).forEach(pid => S.dirty.add("a:" + pid)); stash(); saveSoon(); App.render(); }
  function undo(){ if (!S.edit) return App.viewOnly(); if (!S.undo.length) return note("Nothing to undo"); const s = S.undo.pop(); const cur = snap(); restore(s, []); S.redo.push(cur); note("Undone"); }
  function redo(){ if (!S.edit) return App.viewOnly(); if (!S.redo.length) return note("Nothing to redo"); const s = S.redo.pop(); const cur = snap(); restore(s, []); S.undo.push(cur); note("Redone"); }

  function newAction(pid, vals, stageId){ const pa = S.acts[pid] || (S.acts[pid] = { nextNo: 1, actions: [] });
    const st = stageId || stages()[0].id; const top = ranked(st)[0];
    const a = touch({ u: uid(), no: pa.nextNo++, stage: st, rank: top ? (top.rank || 0) - 1 : 0, created: now(), f: Object.assign({}, vals || {}), photos: [], files: [], steps: [] });
    pa.actions.push(a); a._p = pid; return a; }
  /* move an action to a stage, at a position in that column (index among what's on show) */
  function place(a, st, index){ const col = ranked(st).filter(x => x !== a); index = Math.max(0, Math.min(index == null ? col.length : index, col.length));
    const before = col[index - 1], after = col[index];
    a.rank = before && after ? ((before.rank || 0) + (after.rank || 0)) / 2 : before ? (before.rank || 0) + 1 : after ? (after.rank || 0) - 1 : 0;
    if (before && after && before.rank === after.rank){ col.forEach((x, i) => { x.rank = i * 2; touch(x); S.dirty.add("a:" + x._p); }); a.rank = index * 2 - 1; }
    a.stage = st; touch(a); }
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
  function mergeActs(loc, rem){ if (!rem) return loc; const actions = mergeById(loc.actions, rem.actions, "u");
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
    try { for (let tries = 0; ; tries++){ const keys = [...S.dirty], blobs = S.blobs.slice(), entries = [];
        for (const k of keys){
          if (k === "config"){ S.config = mergeConfig(S.config, await GH.readJson(P_CONFIG)); entries.push({ path: P_CONFIG, content: JSON.stringify(clean(S.config), null, 1) }); }
          else if (k === "projects"){ const r = await GH.readJson(P_PROJECTS); S.projects = { v: 1, projects: mergeById(S.projects.projects, r && r.projects) }; entries.push({ path: P_PROJECTS, content: JSON.stringify(S.projects, null, 1) }); }
          else { const pid = k.slice(2); S.acts[pid] = mergeActs(S.acts[pid], await GH.readJson(pActs(pid))); entries.push({ path: pActs(pid), content: JSON.stringify(clean(S.acts[pid]), null, 1) }); } }
        blobs.forEach(b => entries.push(b));
        try { await GH.commit(entries, commitMsg()); keys.forEach(k => S.dirty.delete(k)); S.blobs = S.blobs.filter(b => !blobs.includes(b)); break; }
        catch (e){ if (!e.conflict || tries > 3) throw e; } }
      lastMsgs = []; stash(); setStatus("saved"); Local.backup(S); App.render(); }
    catch (e){ console.error(e); setStatus("error", e.status === 401 || e.status === 403 ? "The GitHub key was refused" : navigator.onLine ? (e.detail || e.message) : "Offline"); retryT = setTimeout(save, 20000); }
    finally { saving = false; if (again){ again = false; saveSoon(); } } }
  let lastMsgs = []; const log = m => { if (lastMsgs[lastMsgs.length - 1] === m) return; lastMsgs.push(m); if (lastMsgs.length > 8) lastMsgs.shift(); };
  const commitMsg = () => (lastMsgs.length ? lastMsgs.join("; ") : "Update actions") + " (" + (lsGet("adName", "") || "Action Database") + ")";
  /* unsaved work is kept on this device until it's online, so closing the tab never loses it */
  const stash = debounce(() => IDB.set("state", { c: S.config, p: S.projects, a: clean(S.acts), dirty: [...S.dirty], blobs: S.blobs, at: now() }), 300);
  async function addBlob(path, b64){ const sha = await GH.blob(b64); S.blobs.push({ path, sha }); stash(); saveSoon(); }

  /* ---------- loading ---------- */
  async function load(){ const cached = await IDB.get("state");
    if (cached && cached.c){ S.config = cached.c; S.projects = cached.p; S.acts = cached.a || {}; (cached.dirty || []).forEach(k => S.dirty.add(k)); S.blobs = cached.blobs || []; S.loaded = true; App.render(); }
    try { await refresh(true); } catch (e){ console.error(e); if (!S.loaded) throw e; note("Couldn't reach GitHub, showing the copy saved on this device"); }
    if (!S.config){ S.config = defaultConfig(); S.dirty.add("config"); }
    S.loaded = true; App.render(); if (S.dirty.size || S.blobs.length) saveSoon(); }
  async function refresh(first){ if (saving || S.dirty.size && !first) return false;
    const [c, p] = await Promise.all([GH.readJson(P_CONFIG), GH.readJson(P_PROJECTS)]);
    const acts = {}; const list = (p && p.projects || []); await Promise.all(list.map(async x => { acts[x.id] = await GH.readJson(pActs(x.id)) || { v: 1, nextNo: 1, actions: [] }; }));
    if (saving || S.dirty.size && !first) return false;
    const before = snap();
    if (S.dirty.size){ S.config = c ? mergeConfig(S.config || c, c) : S.config; S.projects = { v: 1, projects: mergeById(S.projects.projects, list) }; list.forEach(x => S.acts[x.id] = mergeActs(S.acts[x.id] || acts[x.id], acts[x.id])); }
    else { S.config = c || S.config; S.projects = { v: 1, projects: list }; S.acts = acts; }
    if (S.config) fixConfig(S.config);
    if (snap() !== before){ stash(); return true; } return false; }
  /* older files may be missing settings added later */
  function fixConfig(c){ const d = defaultConfig(); ["stages", "fields", "contacts"].forEach(k => c[k] = c[k] || d[k]);
    d.fields.forEach(f => { if (f.core && !c.fields.some(x => x.id === f.id)) c.fields.push(f); }); }

  return { S, stages, fields, field, stage, contacts, projects, project, selected, setSelected, actsOf, all, visible, find, findRef, actId, ranked, priority,
    mutate, touch, undo, redo, newAction, place, renameOption, save, saveSoon, load, refresh, addBlob, log, live, mergeActs, mergeConfig };
})();
