/* GitHub storage. The actions, settings and compressed photos are files under data/ in their own repo
   (bijankle/action-kanban-data), kept apart from the app so saving never rebuilds the website. Viewers read
   the files straight from GitHub (no key needed while the data repo is public); anyone with a GitHub key that
   can write to it saves through the GitHub API, every save as one commit. With the save relay (relay/worker.js, a
   small Cloudflare Worker holding one key) set, everyone signed in reads and saves through it instead, no key of
   their own, and the data repo can be private. The relay also holds the accounts (email and password): signing in
   gives a token (adSess, 90 days) that saving needs. */
"use strict";
const GH = (() => {
  const RELAY = "";   // the save relay's address, once it's set up (Settings can also set one)
  const relay = () => (lsGet("adRelay", "") || RELAY).trim().replace(/\/+$/, "");
  const API = () => relay() || lsGet("adApiBase", "") || "https://api.github.com";   // (tests point this at a local mock)
  const pagesRepo = () => { const m = location.hostname.match(/^([^.]+)\.github\.io$/i); const seg = location.pathname.split("/").filter(Boolean)[0];
    return m && seg ? m[1] + "/" + seg : ""; };
  const DATA_REPO = "bijankle/action-kanban-data", APP_URL = "https://bijankle.github.io/action-kanban/";
  const cfg = () => ({ token: (lsGet("adGhKey", "") || "").trim(), repo: (lsGet("adRepo2", "") || DATA_REPO).trim() });
  const onPages = () => pagesRepo().toLowerCase() === cfg().repo.toLowerCase();
  const hd = t => relay() ? { Accept: "application/vnd.github+json", "X-Session": lsGet("adSess", "") || "", "X-User": encodeURIComponent(Profile.name() || "") }
    : Object.assign({ Accept: "application/vnd.github+json" }, t ? { Authorization: "Bearer " + t } : {});
  let branchP = null, editP = null;
  async function api(path, opts){ const c = cfg(); opts = opts || {};
    const r = await fetch(API() + "/repos/" + c.repo + path, { method: opts.method || "GET", cache: "no-store", headers: Object.assign(hd(c.token), opts.headers || {}, opts.body ? { "Content-Type": "application/json" } : {}), body: opts.body ? JSON.stringify(opts.body) : undefined });
    if (!r.ok){ const e = new Error("GitHub " + r.status + " on " + path); e.status = r.status; try { e.detail = (await r.json()).message; } catch (x) {} throw e; }
    return opts.raw ? r.text() : r.json(); }
  async function branch(){ if (!branchP) branchP = api("").then(j => j.default_branch || "main").catch(e => { branchP = null; throw e; }); return branchP; }
  /* can we save? Through the relay: when signed in (a token it accepts). Else: does this key write to the repo?
     (asked once; a key change or a sign in asks again) */
  let needSign = false;
  function canEdit(){ const c = cfg(); if (!c.token && !relay()) return Promise.resolve(false);
    if (!editP) editP = api("").then(j => { if (j.relay){ needSign = !j.relay.signedIn; return !!j.relay.signedIn; } return !!(j.permissions && (j.permissions.push || j.permissions.admin)); })
      .catch(e => { editP = null; return e.status === 401 || e.status === 403 || e.status === 404 ? false : null; });
    return editP; }
  function reset(){ branchP = null; editP = null; }
  /* read a JSON file: through the API when there's a key (always the latest), else straight from GitHub */
  /* the latest commit on the data branch: a save reads every file at this commit and commits on top of it, so
     anyone else's commit in between makes the save fail and merge again instead of overwriting them */
  async function head(){ const b = await branch(); return (await api("/git/ref/heads/" + encodeURIComponent(b) + "?t=" + Date.now())).object.sha; }
  async function readJson(path, at){ const c = cfg();
    if (c.token || relay()){ try { const b = at || await branch(); const t = await api("/contents/" + path + "?ref=" + encodeURIComponent(b) + "&t=" + Date.now(), { raw: true, headers: { Accept: "application/vnd.github.raw+json" } }); return JSON.parse(t); }
      catch (e){ if (e.status === 404) return null; if (e.status !== 401 && e.status !== 403) throw e; } }
    const r = await fetch(fileUrl(path) + (fileUrl(path).includes("?") ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" });
    if (r.status === 404) return null; if (!r.ok) throw new Error("Couldn't read " + path + " (" + r.status + ")"); return r.json(); }
  /* where a stored file can be loaded from by an img tag or a link */
  function fileUrl(path){ if (relay()) return relay() + "/raw/" + path.split("/").map(encodeURIComponent).join("/");
    if (onPages()) return new URL(path, location.href.replace(/[?#].*$/, "").replace(/[^/]*$/, "")).href;
    const base = lsGet("adRawBase", ""); if (base) return base + path;
    return "https://raw.githubusercontent.com/" + cfg().repo + "/HEAD/" + path; }
  /* the public web address of the app, for share links and the Excel photo links */
  function appUrl(){ if (/github\.io$/i.test(location.hostname) || /^https?:\/\/(localhost|127\.)/.test(location.href)) return location.href.replace(/[?#].*$/, ""); return APP_URL; }
  /* can people without a key see the data? (a private data repo answers 404 to anyone without a key) */
  async function isPublic(){ try { const r = await fetch("https://api.github.com/repos/" + cfg().repo, { cache: "no-store" }); return r.ok ? !(await r.json()).private : r.status === 404 ? false : null; } catch (e){ return null; } }
  async function blob(b64){ const j = await api("/git/blobs", { method: "POST", body: { content: b64, encoding: "base64" } }); return j.sha; }
  /* one commit holding every changed file; entries are {path, sha} (an uploaded blob) or {path, content} (text) or {path, del:true} */
  async function commit(entries, message, parent){ const b = await branch();
    const head = parent || (await api("/git/ref/heads/" + encodeURIComponent(b))).object.sha;
    const hc = await api("/git/commits/" + head);
    const tree = await api("/git/trees", { method: "POST", body: { base_tree: hc.tree.sha, tree: entries.map(e => e.del ? { path: e.path, mode: "100644", type: "blob", sha: null } : e.sha ? { path: e.path, mode: "100644", type: "blob", sha: e.sha } : { path: e.path, mode: "100644", type: "blob", content: e.content }) } });
    const c = await api("/git/commits", { method: "POST", body: { message, tree: tree.sha, parents: [head] } });
    try { await api("/git/refs/heads/" + encodeURIComponent(b), { method: "PATCH", body: { sha: c.sha, force: false } }); }
    catch (e){ if (e.status === 422 || e.status === 409){ e.conflict = true; } throw e; }
    return c.sha; }
  /* accounts on the relay: check (is there a password for this email?), register, login; a token comes back */
  async function auth(kind, body){ const r = await fetch(relay() + "/auth/" + kind, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); if (!r.ok){ const e = new Error(j.message || "Couldn't sign in (" + r.status + ")"); e.status = r.status; throw e; }
    if (j.token){ lsSet("adSess", j.token); reset(); } return j; }
  return { relay, auth, needSign: () => needSign, cfg, head, canEdit, reset, readJson, fileUrl, appUrl, blob, commit, branch, onPages, pagesRepo, isPublic, DATA_REPO };
})();
