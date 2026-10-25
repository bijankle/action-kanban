/* The Action Database site: one Cloudflare Worker that puts a sign in in front of the whole app.
   Nobody sees an action, photo or setting until they have signed in, and nobody can sign in until the admin
   has approved them by email.

   New person: email, their details and a password, then "waiting for approval". The admin gets an email with
   Approve and Deny buttons. Once approved, they sign in with their email and password on any computer.
   Forgot password: they choose a new one, and it works once the admin approves it the same way.
   The admin (ADMIN_EMAIL) is approved without asking, and has an Accounts page (/admin) to remove people.

   The app itself is fetched from GitHub Pages (APP_ORIGIN) and passed through, so updating the app needs no
   change here. Reads and saves go through /api to the data repository with the one GitHub key, which never
   leaves this worker, so the data repository can be private.
   Passwords are kept only as salted PBKDF2 hashes in data/auth.json in the data repository; the worker never
   hands that file (or data/keys.json) out.

   Settings (Workers, the worker, Settings, Variables and Secrets):
     GH_TOKEN     secret    fine grained GitHub key: Contents read and write on the data repository only
     ADMIN_EMAIL  variable  who approves sign ins, e.g. bkhadembashi@nsrltd.com
     RESEND_KEY   secret    a Resend API key, for the approval emails (resend.com, free plan)
     MAIL_FROM    variable  optional sender, default "Action Database <onboarding@resend.dev>"
     REPO         variable  optional data repository, default bijankle/action-kanban-data
     APP_ORIGIN   variable  optional, where the app's files are, default https://bijankle.github.io/action-kanban */
const API = "https://api.github.com", AUTH = "data/auth.json", HIDDEN = new Set([AUTH, "data/keys.json"]);
const enc = new TextEncoder(), DAY = 864e5, SESSION_DAYS = 30;
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const b64u = s => s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), unb64u = s => atob(s.replace(/-/g, "+").replace(/_/g, "/"));
const toB64 = s => btoa(unescape(encodeURIComponent(s))), fromB64 = s => decodeURIComponent(escape(atob(s.replace(/\n/g, ""))));
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = e => String(e || "").trim().toLowerCase(), okEmail = e => /^\S+@\S+\.\S+$/.test(e);
const same = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

/* a password's hash: PBKDF2, SHA-256, 100 000 rounds (the most Workers allow), its own random salt */
async function hashPw(pw, salt){ const k = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  return b64(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 100000 }, k, 256)); }
async function newPw(pw){ const s = crypto.randomUUID(); return { s, h: await hashPw(pw, s) }; }
/* signed tokens (sign in cookies, approval links), with a key made from the GitHub key */
async function sign(env, msg){ const raw = await crypto.subtle.digest("SHA-256", enc.encode("ad-site|" + env.GH_TOKEN)), k = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(b64(await crypto.subtle.sign("HMAC", k, enc.encode(msg)))); }
async function seal(env, o){ const p = b64u(btoa(JSON.stringify(o))); return p + "." + await sign(env, p); }
async function unseal(env, t){ const [p, s] = String(t || "").split("."); if (!p || !s || !same(await sign(env, p), s)) return null;
  try { const o = JSON.parse(unb64u(p)); return o.x > Date.now() ? o : null; } catch (e){ return null; } }

const cookie = (req, name) => { const m = (req.headers.get("Cookie") || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)")); return m ? m[1] : ""; };
const setCookie = (v, days) => "ads=" + v + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + Math.round(days * 86400);
const json = (o, status, extra) => new Response(JSON.stringify(o), { status: status || 200, headers: Object.assign({ "Content-Type": "application/json", "Cache-Control": "no-store" }, extra || {}) });
const html = (body, status, extra) => new Response(body, { status: status || 200, headers: Object.assign({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }, extra || {}) });

export default {
  async fetch(req, env, ctx){
    if (!env.GH_TOKEN) return html(page("Not set up yet", "<p>This site has no <b>GH_TOKEN</b> secret yet. See cloudflare/README.md.</p>"), 500);
    const repo = env.REPO || "bijankle/action-kanban-data", admin = norm(env.ADMIN_EMAIL), url = new URL(req.url), p = url.pathname, m = req.method;
    const gh = (path, init) => fetch((env.API || API) + path, Object.assign({}, init, { headers: Object.assign({ Authorization: "Bearer " + env.GH_TOKEN, "User-Agent": "action-database-site", "X-GitHub-Api-Version": "2022-11-28" }, (init || {}).headers || {}) }));
    const A = accounts(env, gh, repo);
    const me = async () => { const s = await unseal(env, cookie(req, "ads")); if (!s) return null; const u = (await A.read()).d.users[s.e]; return u && u.status === "active" && (u.sv || 0) === (s.v || 0) ? Object.assign({ email: s.e }, u) : null; };
    const mail = (subject, body) => sendMail(env, admin, subject, body);

    /* ---------- signing in ---------- */
    if (p === "/login") return html(loginPage(admin));
    if (p === "/auth/logout") return new Response(null, { status: 302, headers: { Location: "/login", "Set-Cookie": setCookie("", 0) } });
    if (p.startsWith("/auth/") && m === "POST"){
      let q = {}; try { q = await req.json(); } catch (e){}
      if (p === "/auth/decide") return decide(env, A, q, mail, url);
      const email = norm(q.email); if (!okEmail(email)) return json({ message: "Enter a valid email" }, 400);
      const { d } = await A.read(), u = d.users[email];
      if (p === "/auth/check") return json({ exists: !!u, status: u ? u.status : null });
      if (p === "/auth/login"){
        if (!u) return json({ message: "There's no account for this email yet." }, 404);
        if (u.status === "pending") return json({ message: "Your account is waiting for approval. You can sign in once it's approved.", pending: true }, 403);
        if (!same(await hashPw(String(q.password || ""), u.s), u.h)) return json({ message: "That password isn't right." }, 401);
        return json({ ok: true }, 200, { "Set-Cookie": setCookie(await seal(env, { e: email, v: u.sv || 0, x: Date.now() + SESSION_DAYS * DAY }), SESSION_DAYS) }); }
      if (p === "/auth/register"){
        if (u) return json({ message: u.status === "pending" ? "This email is already waiting for approval." : "This email already has an account. Sign in instead." }, 409);
        const pw = String(q.password || ""); if (pw.length < 8) return json({ message: "Use at least 8 characters for the password" }, 400);
        const first = String(q.first || "").trim().slice(0, 60); if (!first) return json({ message: "Add your first name" }, 400);
        const rec = Object.assign({ first, last: String(q.last || "").trim().slice(0, 60), role: String(q.role || "").trim().slice(0, 80), mobile: String(q.mobile || "").trim().slice(0, 30),
          status: email === admin ? "active" : "pending", t: Date.now(), sv: 0 }, await newPw(pw));
        await A.write(x => { if (!x.users[email]) x.users[email] = rec; }, "Account request: " + email);
        if (email === admin) return json({ ok: true, active: true }, 200, { "Set-Cookie": setCookie(await seal(env, { e: email, v: 0, x: Date.now() + SESSION_DAYS * DAY }), SESSION_DAYS) });
        const sent = await mail("Approve " + rec.first + " " + rec.last + " for Action Database", ask(await approveLink(env, url, email, "account"), "wants to sign in to Action Database", rec, email));
        return json({ ok: true, pending: true, mailed: sent }); }
      if (p === "/auth/forgot"){
        if (!u) return json({ message: "There's no account for this email yet." }, 404);
        if (email === admin) return json({ message: "As the admin, change your password by deleting your entry in data/auth.json on GitHub and making the account again." }, 400);
        const pw = String(q.password || ""); if (pw.length < 8) return json({ message: "Use at least 8 characters for the password" }, 400);
        const r = Object.assign({ t: Date.now() }, await newPw(pw)); await A.write(x => { if (x.users[email]) x.users[email].reset = r; }, "Password change request: " + email);
        const sent = await mail("Approve a new password for " + u.first + " " + u.last, ask(await approveLink(env, url, email, "reset"), "asked for a new password for Action Database", u, email));
        return json({ ok: true, mailed: sent }); }
      return json({ message: "Unknown" }, 404); }
    if (p === "/auth/approve") return approvePage(env, A, url);

    /* ---------- a shared file: a signed link from a PDF, so anyone it's sent to can open the attachment without signing
       in. The link names one file, can't be changed, and stops working after a year ---------- */
    if (p.startsWith("/share/") && m === "GET"){
      const o = await unseal(env, p.split("/")[2]); if (!o || !SHARE_OK.test(o.p || "") || o.p.includes("..")) return html(page("Link not valid", "<p>This file link has expired or isn't right. Ask whoever sent it for a new copy.</p>"), 404);
      const r = await gh("/repos/" + repo + "/contents/" + o.p.split("/").map(encodeURIComponent).join("/"), { headers: { Accept: "application/vnd.github.raw+json" } });
      if (!r.ok) return html(page("File not found", "<p>This file is no longer there.</p>"), 404);
      return new Response(r.body, { headers: fileHeaders(o.n || o.p.split("/").pop(), r, "private, max-age=86400") }); }

    /* ---------- everything else needs a sign in ---------- */
    const who = await me();
    if (!who){ if (p.startsWith("/api/")) return json({ message: "Sign in again" }, 401); return new Response(null, { status: 302, headers: { Location: "/login" + (p === "/" || p === "/index.html" ? "" : "?next=" + encodeURIComponent(p + url.search)) } }); }
    const isAdmin = who.email === admin;
    if (p === "/auth/me") return json(profile(who, isAdmin));
    if (p === "/admin") return isAdmin ? adminPage(await A.read()) : html(page("Accounts", "<p>Only the admin can see this page.</p>"), 403);
    if (p === "/admin/act" && m === "POST" && isAdmin){ let q = {}; try { q = await req.json(); } catch (e){}
      const e = norm(q.email); if (e === admin) return json({ message: "That's you" }, 400);
      await A.write(x => { const u = x.users[e]; if (!u) return; if (q.do === "remove") delete x.users[e]; else if (q.do === "approve"){ u.status = "active"; } else if (q.do === "signout") u.sv = (u.sv || 0) + 1; }, "Account " + q.do + ": " + e);
      return json({ ok: true }); }

    /* stored files (photos, thumbnails, attachments): content addressed paths never change, so they're cached */
    if (p.startsWith("/api/raw/") && m === "GET"){
      const path = decodeURIComponent(p.slice(9)); if (!/^data\/[\w\-./ %()&+,']+$/.test(path) || path.includes("..") || HIDDEN.has(path)) return json({ message: "Not a data file" }, 400);
      const fixed = /\/(img|thumb|files|rfq|quotes)\//.test(path), cache = caches.default, key = new Request(url.origin + "/__raw/" + encodeURI(path));
      if (fixed){ const hit = await cache.match(key); if (hit) return withHeaders(hit, { "Cache-Control": "private, max-age=31536000, immutable" }); }
      const r = await gh("/repos/" + repo + "/contents/" + path.split("/").map(encodeURIComponent).join("/"), { headers: { Accept: "application/vnd.github.raw+json" } });
      if (!r.ok) return new Response(null, { status: r.status });
      const res = new Response(r.body, { headers: fileHeaders(path.split("/").pop(), r, fixed ? "private, max-age=31536000, immutable" : "no-store") });
      if (fixed) ctx.waitUntil(cache.put(key, withHeaders(res.clone(), { "Cache-Control": "public, max-age=31536000, immutable" }))); return res; }

    /* links to attachments for a PDF: { items: [{ p: path, n: file name }] } gives { urls: [...] }, each good for a year */
    if (p === "/api/share" && m === "POST"){ let q = {}; try { q = await req.json(); } catch (e){}
      const items = (Array.isArray(q.items) ? q.items : []).slice(0, 500), x = Date.now() + 365 * DAY;
      const urls = await Promise.all(items.map(async it => SHARE_OK.test(String(it.p || "")) && !String(it.p).includes("..") ? url.origin + "/share/" + await seal(env, { p: String(it.p), n: String(it.n || "").slice(0, 200), x }) + "/" + encodeURIComponent(String(it.n || "file")) : null));
      return json({ urls }); }

    /* the GitHub API, for the data repository only, and only what reading and saving need */
    if (p.startsWith("/api/")){
      const gp = p.slice(4), base = "/repos/" + repo; if (gp !== base && !gp.startsWith(base + "/")) return json({ message: "Only the data repository" }, 403);
      const rest = gp.slice(base.length), cpath = rest.startsWith("/contents/") ? decodeURIComponent(rest.slice(10)) : "";
      const ok = (m === "GET" && (rest === "" || (cpath && !HIDDEN.has(cpath)) || /^\/git\/(ref|refs|commits)\//.test(rest)))
        || (m === "POST" && /^\/git\/(blobs|trees|commits)$/.test(rest)) || (m === "PATCH" && /^\/git\/refs\/heads\/[\w.\-/]+$/.test(rest));
      if (!ok) return json({ message: "Not allowed" }, 403);
      let body = m === "GET" ? undefined : await req.text();
      if (m === "POST" && rest === "/git/trees" && body && HIDDEN_IN(body)) return json({ message: "Not allowed" }, 403);
      if (m === "POST" && rest === "/git/commits" && body){ try { const c = JSON.parse(body); c.message = String(c.message || "") + "\n\nBy " + [who.first, who.last].join(" ").trim() + " <" + who.email + ">"; body = JSON.stringify(c); } catch (e){} }
      const r = await gh(gp + url.search, { method: m, headers: { Accept: req.headers.get("Accept") || "application/vnd.github+json", "Content-Type": "application/json" }, body });
      let out = await r.text();
      /* the repository answer says this person can save, so the app turns on editing */
      if (m === "GET" && rest === "" && r.ok){ try { const j = JSON.parse(out); j.permissions = Object.assign({}, j.permissions, { push: true }); j.relay = { signedIn: true, email: who.email }; out = JSON.stringify(j); } catch (e){} }
      return new Response(out, { status: r.status, headers: { "Content-Type": r.headers.get("Content-Type") || "application/json", "Cache-Control": "no-store" } }); }

    /* the app's own files, from GitHub Pages; the page gets who is signed in */
    const origin = (env.APP_ORIGIN || "https://bijankle.github.io/action-kanban").replace(/\/+$/, "");
    const r = await fetch(origin + (p === "/" ? "/index.html" : p) + url.search, { cf: { cacheTtl: 60 } });
    if (!r.ok) return new Response(r.body, { status: r.status, headers: { "Content-Type": r.headers.get("Content-Type") || "text/plain" } });
    const h = { "Content-Type": r.headers.get("Content-Type") || "application/octet-stream", "Cache-Control": "no-cache" };
    if (p === "/" || p === "/index.html"){ const t = (await r.text()).replace("<head>", '<head><script>window.AD_SITE=' + JSON.stringify(profile(who, isAdmin)).replace(/</g, "\\u003c") + ';</script>');
      return new Response(t, { headers: h }); }
    return new Response(r.body, { headers: h });
  }
};
const HIDDEN_IN = body => { try { return (JSON.parse(body).tree || []).some(e => HIDDEN.has(e.path)); } catch (e){ return true; } };
/* the files a share link may name: an action's attachments, photos, RFQs and quotes */
const SHARE_OK = /^data\/p\/[\w\-]+\/(files|img|thumb|rfq|quotes)\/[^\/]+(\/[^\/]+)?$/;
/* a file's type from its name, so a phone opens a Word or Excel file as itself (not as text), and its name for saving */
const TYPES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", pdf: "application/pdf", json: "application/json", txt: "text/plain; charset=utf-8", csv: "text/csv; charset=utf-8",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", dwg: "application/acad", dxf: "application/dxf", zip: "application/zip", msg: "application/vnd.ms-outlook", eml: "message/rfc822" };
function fileHeaders(name, r, cache){ const ext = String(name).split(".").pop().toLowerCase(), type = TYPES[ext] || "application/octet-stream", show = /^(image|application\/pdf|text\/plain|application\/json)/.test(type);
  const safe = String(name).replace(/["\\\r\n]/g, "_");
  return { "Content-Type": type, "Cache-Control": cache, "Content-Disposition": (show ? "inline" : "attachment") + '; filename="' + safe.replace(/[^\x20-\x7e]/g, "_") + '"; filename*=UTF-8\'\'' + encodeURIComponent(name), "X-Content-Type-Options": "nosniff" }; }
const withHeaders = (r, h) => { const n = new Response(r.body, r); Object.entries(h).forEach(([k, v]) => n.headers.set(k, v)); return n; };
const profile = (u, isAdmin) => ({ email: u.email, first: u.first || "", last: u.last || "", role: u.role || "", mobile: u.mobile || "", admin: !!isAdmin });

/* ---------- accounts: data/auth.json in the data repository, read through a 20 second memory ---------- */
let memo = null;
function accounts(env, gh, repo){
  const path = "/repos/" + repo + "/contents/" + AUTH;
  async function load(){ const r = await gh(path + "?t=" + Date.now()); if (r.status === 404) return { sha: null, d: { v: 1, users: {} } };
    if (!r.ok) throw new Error("accounts " + r.status); const j = await r.json(); const d = JSON.parse(fromB64(j.content)); d.users = d.users || {}; return { sha: j.sha, d }; }
  return {
    read: async () => { if (memo && memo.repo === repo && Date.now() - memo.t < 20000) return memo.v; const v = await load(); memo = { repo, t: Date.now(), v }; return v; },
    /* one change on top of the latest file; tries again if someone else wrote it at the same moment */
    write: async (change, message) => { for (let i = 0; i < 4; i++){ const { sha, d } = await load(); change(d);
        const w = await gh(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, content: toB64(JSON.stringify(d, null, 1)), sha: sha || undefined }) });
        if (w.ok){ memo = null; return d; } if (w.status !== 409 && w.status !== 422) throw new Error("Couldn't save the account (" + w.status + ")"); }
      throw new Error("Couldn't save the account, try again"); } }; }

/* ---------- approval ---------- */
async function approveLink(env, url, email, kind){ return url.origin + "/auth/approve?t=" + await seal(env, { e: email, k: kind, x: Date.now() + 14 * DAY }); }
/* the link only shows the buttons: mail scanners open links on their own, so approving needs the click */
async function approvePage(env, A, url){ const t = url.searchParams.get("t") || "", o = await unseal(env, t);
  if (!o) return html(page("Link expired", "<p>This approval link has expired or isn't valid. Ask them to request again.</p>"), 400);
  const u = (await A.read()).d.users[o.e];
  if (!u) return html(page("Nothing to approve", "<p>There's no account for <b>" + esc(o.e) + "</b> any more.</p>"));
  if (o.k === "account" && u.status === "active") return html(page("Already approved", "<p><b>" + esc(u.first + " " + u.last) + "</b> can already sign in.</p>"));
  if (o.k === "reset" && !u.reset) return html(page("Nothing to approve", "<p>There's no password change waiting for <b>" + esc(o.e) + "</b>.</p>"));
  return html(page(o.k === "reset" ? "Approve a new password" : "Approve a sign in",
    card(u, o.e) + "<p>" + (o.k === "reset" ? "They asked to change their password. Approve it only if you know they asked." : "They asked for an account. Once approved they can sign in from any computer.") + "</p>"
    + '<div class="row"><button class="go" data-ok="1">Approve</button><button class="no" data-ok="0">Deny</button></div><p class="msg"></p>'
    + "<script>document.querySelectorAll('[data-ok]').forEach(b=>b.onclick=async()=>{document.querySelectorAll('[data-ok]').forEach(x=>x.disabled=true);const r=await fetch('/auth/decide',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({t:" + JSON.stringify(t) + ",ok:b.dataset.ok==='1'})});const j=await r.json().catch(()=>({}));document.querySelector('.msg').textContent=j.message||'Done';});</script>"));
}
async function decide(env, A, q, mail, url){ const o = await unseal(env, q.t); if (!o) return json({ message: "This approval link has expired." }, 400);
  let msg = "";
  await A.write(x => { const u = x.users[o.e]; if (!u){ msg = "There's no account for " + o.e + " any more."; return; }
    if (o.k === "account"){ if (q.ok){ u.status = "active"; msg = "Approved. " + u.first + " can sign in now."; } else { delete x.users[o.e]; msg = "Denied. The request was removed."; } }
    else if (u.reset){ if (q.ok){ u.s = u.reset.s; u.h = u.reset.h; u.sv = (u.sv || 0) + 1; msg = "Approved. " + u.first + " can sign in with the new password, and is signed out everywhere else."; } else msg = "Denied. The old password still works."; delete u.reset; }
    else msg = "Nothing to approve."; }, (q.ok ? "Approved " : "Denied ") + o.k + ": " + o.e);
  return json({ message: msg }); }

/* ---------- email (Resend) ---------- */
async function sendMail(env, to, subject, body){ if (!env.RESEND_KEY || !to) return false;
  try { const r = await fetch(env.MAIL_API || "https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + env.RESEND_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.MAIL_FROM || "Action Database <onboarding@resend.dev>", to: [to], subject, html: body }) }); return r.ok; }
  catch (e){ return false; } }
const ask = (link, what, u, email) => '<div style="font:15px/1.5 Segoe UI,Arial,sans-serif;color:#1d2430;max-width:520px">'
  + "<p><b>" + esc([u.first, u.last].join(" ")) + "</b> " + what + ".</p>"
  + '<table style="font-size:14px;border-collapse:collapse;margin:0 0 16px"><tr><td style="color:#7a8591;padding:2px 14px 2px 0">Email</td><td>' + esc(email) + "</td></tr>"
  + (u.role ? '<tr><td style="color:#7a8591;padding:2px 14px 2px 0">Role</td><td>' + esc(u.role) + "</td></tr>" : "") + (u.mobile ? '<tr><td style="color:#7a8591;padding:2px 14px 2px 0">Mobile</td><td>' + esc(u.mobile) + "</td></tr>" : "") + "</table>"
  + '<p><a href="' + esc(link) + '" style="background:#475569;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;display:inline-block">Review and approve</a></p>'
  + '<p style="color:#7a8591;font-size:13px">If you don\'t know them, open the link and choose Deny. The link works for 14 days.</p></div>';

/* ---------- pages ---------- */
const STYLE = ":root{--bg:#eef0f3;--card:#fff;--line:#dde1e7;--ink:#1d2430;--muted:#5d6875;--th:#475569;--bad:#c0392b;--good:#1f8a58;color-scheme:light}"
  + "@media(prefers-color-scheme:dark){:root{--bg:#0b0c0e;--card:#17191c;--line:#2c3036;--ink:#e7e9ec;--muted:#a3abb5;--th:#64748b;--bad:#ff6b5b;--good:#3ccf8e;color-scheme:dark}}"
  + "*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:15px/1.5 Aptos,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px 16px}"
  + ".box{background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.08);padding:28px;width:min(440px,100%)}"
  + ".logo{width:46px;height:46px;border-radius:11px;background:var(--th);color:#fff;display:grid;place-items:center;font-weight:800;font-size:18px;margin-bottom:14px}"
  + "h1{font-size:20px;margin:0 0 6px}p{margin:0 0 14px;color:var(--muted)}label{display:block;font-size:13px;font-weight:600;color:var(--muted);margin:0 0 12px}"
  + "input{display:block;width:100%;margin-top:4px;padding:9px 11px;border:1.5px solid var(--line);border-radius:9px;background:var(--card);color:var(--ink);font:15px inherit;font-family:inherit}input:focus{outline:none;border-color:var(--th)}"
  + ".g2{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}"
  + "button{cursor:pointer;font:600 15px inherit;font-family:inherit;border-radius:9px;padding:9px 18px;border:1.5px solid var(--th)}.go{background:var(--th);color:#fff}.no{background:none;color:var(--bad);border-color:var(--line)}"
  + "button:disabled{opacity:.6;cursor:default}.link{border:0;background:none;color:var(--th);padding:0;font-size:14px;text-decoration:underline}.err{color:var(--bad);font-weight:600}.ok{color:var(--good);font-weight:600}"
  + ".card{border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin:0 0 14px}.card b{display:block}.card span{color:var(--muted);font-size:14px;display:block}"
  + "table{width:100%;border-collapse:collapse;font-size:14px}td,th{text-align:left;padding:8px 6px;border-bottom:1px solid var(--line)}th{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.4px}.wide{width:min(860px,100%)}"
  + ".pill{font-size:12px;font-weight:700;border-radius:999px;padding:2px 8px;border:1px solid var(--line)}.pend{color:#b7791f;border-color:#b7791f}";
const page = (title, body, wide) => '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + " · Action Database</title><style>" + STYLE + '</style></head><body><main class="box' + (wide ? " wide" : "") + '"><div class="logo">A*</div><h1>' + esc(title) + "</h1>" + body + "</main></body></html>";
const card = (u, email) => '<div class="card"><b>' + esc([u.first, u.last].join(" ")) + "</b><span>" + esc(u.role || "") + "</span><span>" + esc([email, u.mobile].filter(Boolean).join("   ")) + "</span></div>";

function loginPage(admin){ return page("Sign in to Action Database", '<p id="msg">Enter your email. You\'ll then be asked for your password.</p><form id="f" novalidate><div id="body"></div><p class="err" id="err" hidden></p><div class="row"><button class="go" id="go" type="submit">Next</button><span id="alt"></span></div></form>'
  + "<script>(()=>{const $=i=>document.getElementById(i),body=$('body'),err=$('err'),msg=$('msg'),go=$('go'),alt=$('alt');let step='email',email=localStorage.getItem('adLastEmail')||'';"
  + "const F=(k,l,t,ac,ph)=>'<label>'+l+'<input id=\"'+k+'\" type=\"'+(t||'text')+'\"'+(ac?' autocomplete=\"'+ac+'\"':'')+(ph?' placeholder=\"'+ph+'\"':'')+'></label>';"
  + "const user=()=>'<input type=\"email\" autocomplete=\"username\" value=\"'+email.replace(/\"/g,'')+'\" hidden>';"
  + "const back='<button type=\"button\" class=\"link\" id=\"bk\">Use another email</button>';"
  + "const draw=()=>{err.hidden=true;go.disabled=false;alt.innerHTML='';"
  + "if(step==='email'){msg.textContent='Enter your email. You\\'ll then be asked for your password.';body.innerHTML=F('email','Email','email','username','name@company.com');go.textContent='Next';$('email').value=email;}"
  + "else if(step==='pass'){msg.innerHTML='Welcome back, <b>'+email+'</b>.';body.innerHTML=user()+F('pw','Password','password','current-password');go.textContent='Sign in';alt.innerHTML='<button type=\"button\" class=\"link\" id=\"fg\">Forgot password</button> '+back;}"
  + "else if(step==='new'){msg.innerHTML='<b>'+email+'</b> is new here. Add your details and choose a password. The admin approves new accounts by email.';body.innerHTML=user()+'<div class=\"g2\">'+F('first','First name','text','given-name')+F('last','Last name','text','family-name')+'</div>'+F('role','Role','text','organization-title','e.g. Maintenance Engineer')+F('mobile','Mobile','tel','tel')+'<div class=\"g2\">'+F('pw','Password','password','new-password','8 characters or more')+F('pw2','Password again','password','new-password')+'</div>';go.textContent='Ask for access';alt.innerHTML=back;}"
  + "else if(step==='forgot'){msg.innerHTML='Choose a new password for <b>'+email+'</b>. It works once the admin approves it.';body.innerHTML=user()+'<div class=\"g2\">'+F('pw','New password','password','new-password','8 characters or more')+F('pw2','Again','password','new-password')+'</div>';go.textContent='Ask to change it';alt.innerHTML=back;}"
  + "else if(step==='wait'){msg.innerHTML='<span class=\"ok\">Sent.</span> The admin has been emailed to approve <b>'+email+'</b>. Once they do, sign in here with your email and password.';body.innerHTML='';go.textContent='Sign in';alt.innerHTML=back;}"
  + "const b=$('bk');if(b)b.onclick=()=>{step='email';draw();};const g=$('fg');if(g)g.onclick=()=>{step='forgot';draw();};const f=body.querySelector('input:not([hidden])');f&&f.focus();};"
  + "const fail=t=>{err.textContent=t;err.hidden=false;go.disabled=false;};const v=k=>($(k)||{}).value||'';"
  + "const post=async(u,o)=>{const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(o)});const j=await r.json().catch(()=>({}));return Object.assign(j,{status:r.status,ok2:r.ok});};"
  + "const into=()=>{const n=new URLSearchParams(location.search).get('next');location.replace(n&&n.startsWith('/')&&!n.startsWith('//')?n:'/');};"
  + "$('f').onsubmit=async e=>{e.preventDefault();go.disabled=true;try{"
  + "if(step==='email'){email=v('email').trim().toLowerCase();if(!/^\\S+@\\S+\\.\\S+$/.test(email))return fail('Enter a valid email');localStorage.setItem('adLastEmail',email);const j=await post('/auth/check',{email});"
  + "if(j.status===400)return fail(j.message);step=j.exists?(j.status==='pending'?'wait':'pass'):'new';if(step==='wait'){draw();msg.innerHTML='<b>'+email+'</b> is still waiting for the admin to approve it.';return;}return draw();}"
  + "if(step==='pass'||step==='wait'){if(step==='wait'){step='pass';return draw();}const j=await post('/auth/login',{email,password:v('pw')});if(j.ok2)return into();return fail(j.message||'Couldn\\'t sign in');}"
  + "if(v('pw').length<8)return fail('Use at least 8 characters for the password');if(v('pw')!==v('pw2'))return fail('The two passwords don\\'t match');"
  + "if(step==='new'){if(!v('first').trim())return fail('Add your first name');const j=await post('/auth/register',{email,password:v('pw'),first:v('first'),last:v('last'),role:v('role'),mobile:v('mobile')});if(!j.ok2)return fail(j.message||'Couldn\\'t send the request');if(j.active)return into();step='wait';draw();if(j.mailed===false)msg.innerHTML+=' <span class=\"err\">The email to the admin didn\\'t send, so let them know.</span>';return;}"
  + "if(step==='forgot'){const j=await post('/auth/forgot',{email,password:v('pw')});if(!j.ok2)return fail(j.message||'Couldn\\'t send the request');step='wait';draw();msg.innerHTML='<span class=\"ok\">Sent.</span> The admin has been emailed to approve the new password. Until then your old password still works.';return;}"
  + "}catch(x){fail('Couldn\\'t reach the site. Check your connection and try again.');}};"
  + "draw();})();</script>"); }

function adminPage({ d }){ const rows = Object.entries(d.users).sort((a, b) => (a[1].status === "pending" ? 0 : 1) - (b[1].status === "pending" ? 0 : 1) || a[0].localeCompare(b[0]));
  return html(page("Accounts", "<p>Everyone who can sign in. Remove someone and they're signed out within a minute. Sign out ends their sign in on every computer.</p><table><thead><tr><th>Name</th><th>Email</th><th>Status</th><th></th></tr></thead><tbody>"
    + rows.map(([e, u]) => "<tr><td>" + esc([u.first, u.last].join(" ")) + "<br><span style=\"color:var(--muted);font-size:13px\">" + esc(u.role || "") + "</span></td><td>" + esc(e) + "</td><td>" + (u.status === "pending" ? '<span class="pill pend">Waiting</span>' : '<span class="pill">Active</span>') + (u.reset ? ' <span class="pill pend">New password waiting</span>' : "") + '</td><td class="row" style="justify-content:flex-end">'
      + (u.status === "pending" ? '<button class="go" data-do="approve" data-e="' + esc(e) + '">Approve</button>' : '<button class="no" style="color:var(--ink)" data-do="signout" data-e="' + esc(e) + '">Sign out</button>') + '<button class="no" data-do="remove" data-e="' + esc(e) + '">Remove</button></td></tr>').join("")
    + '</tbody></table><p style="margin-top:14px"><a href="/" style="color:var(--th)">Back to the app</a></p>'
    + "<script>document.querySelectorAll('[data-do]').forEach(b=>b.onclick=async()=>{if(b.dataset.do==='remove'&&!confirm('Remove '+b.dataset.e+'? They will not be able to sign in.'))return;b.disabled=true;const r=await fetch('/admin/act',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:b.dataset.e,do:b.dataset.do})});if(r.ok)location.reload();else{b.disabled=false;alert((await r.json().catch(()=>({}))).message||'Couldn\\'t do that');}});</script>", true)); }
