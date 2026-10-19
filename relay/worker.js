/* Save relay for the Action Database: a Cloudflare Worker that holds one GitHub key (a secret, never sent to the
   browser) and passes the app's reads and saves through to the data repository only. With it, anyone signed in to
   the app can edit without a GitHub key of their own, and the data repository can stay private.
   Accounts: email and password. Passwords are kept only as salted PBKDF2 hashes in data/auth.json in the data
   repository, which the relay never hands out. Signing in gives a token good for 90 days; saving needs one.
   To reset someone's password, delete their line from data/auth.json on GitHub and they set a new one.

   Secrets / variables (Workers > the worker > Settings > Variables and Secrets):
     GH_TOKEN   (secret)  fine-grained GitHub key: Contents read and write on the data repository only
     TEAM_CODE  (secret, optional)  a code needed to make an account (so only your team can sign up)
     REPO       (variable, optional) owner/name of the data repository, default bijankle/action-kanban-data

   Routes:
     GET  /repos/<REPO>                      the repository (its default branch)
     GET  /repos/<REPO>/contents/<path>      a file (JSON) at a ref
     GET  /repos/<REPO>/git/...              refs and commits
     POST /repos/<REPO>/git/blobs|trees|commits, PATCH /repos/<REPO>/git/refs/heads/<branch>   saving (signed in)
     POST /auth/check {email}  /auth/register {email, password, code}  /auth/login {email, password}
     GET  /raw/<path>                        a stored file for an img tag or a download (photos are cached) */
const API = "https://api.github.com";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Accept, X-Session, X-User", "Access-Control-Max-Age": "86400" };
const AUTH = "data/auth.json", enc = new TextEncoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))), b64u = s => s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
/* a password's hash: PBKDF2, SHA-256, 100 000 rounds, its own random salt */
async function hashPw(pw, salt){ const k = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  return b64(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 100000 }, k, 256)); }
/* sign-in tokens: the email and an expiry, signed with a key made from the relay's GitHub key */
async function hmac(env, msg){ const raw = await crypto.subtle.digest("SHA-256", enc.encode("session|" + env.GH_TOKEN)), k = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(b64(await crypto.subtle.sign("HMAC", k, enc.encode(msg)))); }
async function token(env, email){ const p = b64u(btoa(JSON.stringify({ e: email, x: Date.now() + 90 * 864e5 }))); return p + "." + await hmac(env, p); }
async function who(env, req){ const t = req.headers.get("X-Session") || "", [p, sig] = t.split("."); if (!p || !sig || await hmac(env, p) !== sig) return null;
  try { const o = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/"))); return o.x > Date.now() ? o.e : null; } catch (e){ return null; } }
const same = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
const out = (body, status, extra) => new Response(body, { status, headers: Object.assign({}, CORS, extra || {}) });
const json = (o, status) => out(JSON.stringify(o), status || 200, { "Content-Type": "application/json" });

export default {
  async fetch(req, env, ctx){
    if (req.method === "OPTIONS") return out(null, 204);
    if (!env.GH_TOKEN) return json({ message: "The relay has no GH_TOKEN secret yet" }, 500);
    const repo = env.REPO || "bijankle/action-kanban-data", url = new URL(req.url), p = url.pathname;
    const gh = (path, init) => fetch((env.API || API) + path, Object.assign({}, init, { headers: Object.assign({ Authorization: "Bearer " + env.GH_TOKEN, "User-Agent": "action-database-relay", "X-GitHub-Api-Version": "2022-11-28" }, (init || {}).headers || {}) }));

    /* accounts */
    if (p.startsWith("/auth/") && req.method === "POST"){
      let q = {}; try { q = await req.json(); } catch (e){}
      const email = String(q.email || "").trim().toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(email)) return json({ message: "Enter a valid email" }, 400);
      const path = "/repos/" + repo + "/contents/" + AUTH, read = async () => { const r = await gh(path); if (r.status === 404) return { sha: null, d: { v: 1, users: {} } }; if (!r.ok) throw new Error("auth " + r.status);
        const j = await r.json(); return { sha: j.sha, d: JSON.parse(decodeURIComponent(escape(atob(j.content.replace(/\n/g, ""))))) }; };
      const { sha, d } = await read(), u = d.users[email];
      if (p === "/auth/check") return json({ exists: !!u, teamCode: !!env.TEAM_CODE });
      if (p === "/auth/login"){ if (!u || !same(await hashPw(String(q.password || ""), u.s), u.h)) return json({ message: "That email and password don't match" }, 401); return json({ token: await token(env, email) }); }
      if (p === "/auth/register"){ if (u) return json({ message: "This email already has a password. Sign in instead." }, 409);
        if (env.TEAM_CODE && q.code !== env.TEAM_CODE) return json({ message: "That team code isn't right" }, 403);
        if (String(q.password || "").length < 8) return json({ message: "Use at least 8 characters for the password" }, 400);
        const salt = crypto.randomUUID(); d.users[email] = { s: salt, h: await hashPw(q.password, salt), t: Date.now() };
        const w = await gh(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "Account for " + email, content: btoa(unescape(encodeURIComponent(JSON.stringify(d, null, 1)))), sha: sha || undefined }) });
        if (!w.ok) return json({ message: "Couldn't save the account (" + w.status + "), try again" }, 502); return json({ token: await token(env, email) }); }
      return json({ message: "Unknown" }, 404); }

    /* stored files: photos, thumbnails, attachments; content addressed paths never change, so they're cached */
    if (p.startsWith("/raw/") && req.method === "GET"){
      const path = decodeURIComponent(p.slice(5)); if (!/^data\/[\w\-./ %()&+,']+$/.test(path) || path.includes("..") || path === AUTH) return json({ message: "Not a data file" }, 400);
      const fixed = /\/(img|thumb|files|rfq|quotes)\//.test(path), cache = caches.default, key = new Request(url.origin + "/raw/" + encodeURI(path));
      if (fixed){ const hit = await cache.match(key); if (hit) return hit; }
      const r = await gh("/repos/" + repo + "/contents/" + path.split("/").map(encodeURIComponent).join("/"), { headers: { Accept: "application/vnd.github.raw+json" } });
      if (!r.ok) return out(null, r.status);
      const type = /\.jpe?g$/i.test(path) ? "image/jpeg" : /\.png$/i.test(path) ? "image/png" : /\.pdf$/i.test(path) ? "application/pdf" : /\.json$/i.test(path) ? "application/json" : r.headers.get("Content-Type") || "application/octet-stream";
      const res = out(r.body, 200, { "Content-Type": type, "Cache-Control": fixed ? "public, max-age=31536000, immutable" : "no-store" });
      if (fixed) ctx.waitUntil(cache.put(key, res.clone())); return res; }

    /* the GitHub API, for this repository only, and only what reading and saving need */
    const base = "/repos/" + repo; if (p !== base && !p.startsWith(base + "/")) return json({ message: "Only the data repository" }, 403);
    const rest = p.slice(base.length), m = req.method;
    const ok = (m === "GET" && (rest === "" || (/^\/contents\//.test(rest) && !rest.startsWith("/contents/" + AUTH)) || /^\/git\/(ref|refs|commits)\//.test(rest)))
      || (m === "POST" && /^\/git\/(blobs|trees|commits)$/.test(rest)) || (m === "PATCH" && /^\/git\/refs\/heads\/[\w.\-/]+$/.test(rest));
    if (!ok) return json({ message: "Not allowed through the relay" }, 403);
    const me = await who(env, req); if (m !== "GET" && !me) return json({ message: "Sign in to save" }, 401);
    const r = await gh(p + url.search, { method: m, headers: { Accept: req.headers.get("Accept") || "application/vnd.github+json", "Content-Type": "application/json" }, body: m === "GET" ? undefined : await req.text() });
    let body = await r.text();
    /* the repository answer says the relay can save (and whether a team code is needed), so the app turns on editing */
    if (m === "GET" && rest === "" && r.ok){ try { const j = JSON.parse(body); j.permissions = Object.assign({}, j.permissions, { push: true }); j.relay = { signedIn: !!me, email: me || null }; body = JSON.stringify(j); } catch (e) {} }
    return out(body, r.status, { "Content-Type": r.headers.get("Content-Type") || "application/json", "Cache-Control": "no-store" });
  }
};
