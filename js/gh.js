/* GitHub storage. The actions, settings and compressed photos are files under data/ in their own repo
   (bijankle/action-kanban-data), kept apart from the app so saving never rebuilds the website. Viewers read
   the files straight from GitHub (no key needed while the data repo is public); anyone with a GitHub key that
   can write to it saves through the GitHub API, every save as one commit. */
"use strict";
const GH = (() => {
  const API = () => lsGet("adApiBase", "") || "https://api.github.com";   // (tests point this at a local mock)
  const pagesRepo = () => { const m = location.hostname.match(/^([^.]+)\.github\.io$/i); const seg = location.pathname.split("/").filter(Boolean)[0];
    return m && seg ? m[1] + "/" + seg : ""; };
  const DATA_REPO = "bijankle/action-kanban-data", APP_URL = "https://bijankle.github.io/action-kanban/";
  const cfg = () => ({ token: (lsGet("adGhKey", "") || "").trim(), repo: (lsGet("adRepo2", "") || DATA_REPO).trim() });
  const onPages = () => pagesRepo().toLowerCase() === cfg().repo.toLowerCase();
  const hd = t => Object.assign({ Accept: "application/vnd.github+json" }, t ? { Authorization: "Bearer " + t } : {});
  let branchP = null, editP = null;
  async function api(path, opts){ const c = cfg(); opts = opts || {};
    const r = await fetch(API() + "/repos/" + c.repo + path, { method: opts.method || "GET", cache: "no-store", headers: Object.assign(hd(c.token), opts.headers || {}, opts.body ? { "Content-Type": "application/json" } : {}), body: opts.body ? JSON.stringify(opts.body) : undefined });
    if (!r.ok){ const e = new Error("GitHub " + r.status + " on " + path); e.status = r.status; try { e.detail = (await r.json()).message; } catch (x) {} throw e; }
    return opts.raw ? r.text() : r.json(); }
  async function branch(){ if (!branchP) branchP = api("").then(j => j.default_branch || "main").catch(e => { branchP = null; throw e; }); return branchP; }
  /* can this key write to the repo? (asked once; a key change asks again) */
  function canEdit(){ const c = cfg(); if (!c.token) return Promise.resolve(false);
    if (!editP) editP = api("").then(j => !!(j.permissions && (j.permissions.push || j.permissions.admin))).catch(e => { editP = null; return e.status === 401 || e.status === 403 || e.status === 404 ? false : null; });
    return editP; }
  function reset(){ branchP = null; editP = null; }
  /* read a JSON file: through the API when there's a key (always the latest), else straight from GitHub */
  async function readJson(path){ const c = cfg();
    if (c.token){ try { const b = await branch(); const t = await api("/contents/" + path + "?ref=" + encodeURIComponent(b) + "&t=" + Date.now(), { raw: true, headers: { Accept: "application/vnd.github.raw+json" } }); return JSON.parse(t); }
      catch (e){ if (e.status === 404) return null; if (e.status !== 401 && e.status !== 403) throw e; } }
    const r = await fetch(fileUrl(path) + (fileUrl(path).includes("?") ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" });
    if (r.status === 404) return null; if (!r.ok) throw new Error("Couldn't read " + path + " (" + r.status + ")"); return r.json(); }
  /* where a stored file can be loaded from by an img tag or a link */
  function fileUrl(path){ if (onPages()) return new URL(path, location.href.replace(/[?#].*$/, "").replace(/[^/]*$/, "")).href;
    const base = lsGet("adRawBase", ""); if (base) return base + path;
    return "https://raw.githubusercontent.com/" + cfg().repo + "/HEAD/" + path; }
  /* the public web address of the app, for share links and the Excel photo links */
  function appUrl(){ if (/github\.io$/i.test(location.hostname) || /^https?:\/\/(localhost|127\.)/.test(location.href)) return location.href.replace(/[?#].*$/, ""); return APP_URL; }
  /* can people without a key see the data? (a private data repo answers 404 to anyone without a key) */
  async function isPublic(){ try { const r = await fetch("https://api.github.com/repos/" + cfg().repo, { cache: "no-store" }); return r.ok ? !(await r.json()).private : r.status === 404 ? false : null; } catch (e){ return null; } }
  async function blob(b64){ const j = await api("/git/blobs", { method: "POST", body: { content: b64, encoding: "base64" } }); return j.sha; }
  /* one commit holding every changed file; entries are {path, sha} (an uploaded blob) or {path, content} (text) or {path, del:true} */
  async function commit(entries, message){ const b = await branch();
    const ref = await api("/git/ref/heads/" + encodeURIComponent(b)); const head = ref.object.sha;
    const hc = await api("/git/commits/" + head);
    const tree = await api("/git/trees", { method: "POST", body: { base_tree: hc.tree.sha, tree: entries.map(e => e.del ? { path: e.path, mode: "100644", type: "blob", sha: null } : e.sha ? { path: e.path, mode: "100644", type: "blob", sha: e.sha } : { path: e.path, mode: "100644", type: "blob", content: e.content }) } });
    const c = await api("/git/commits", { method: "POST", body: { message, tree: tree.sha, parents: [head] } });
    try { await api("/git/refs/heads/" + encodeURIComponent(b), { method: "PATCH", body: { sha: c.sha, force: false } }); }
    catch (e){ if (e.status === 422 || e.status === 409){ e.conflict = true; } throw e; }
    return c.sha; }
  return { cfg, canEdit, reset, readJson, fileUrl, appUrl, blob, commit, branch, onPages, pagesRepo, isPublic, DATA_REPO };
})();
