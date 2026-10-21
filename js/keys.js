/* Passwords instead of GitHub keys. The one GitHub key that saves to the data repository is kept in it, in
   data/keys.json, only ever encrypted: once with the team code (so a new person can join) and once with each
   person's own password. Signing in with your email and password unlocks the key on this computer, so any
   device can save without anyone handing keys around.
     keys.json  { v: 1, team: { s, iv, ct }, users: { email: { s, iv, ct, t } } }
   Each is AES-GCM, with a key made from the password by PBKDF2 (SHA-256, 310 000 rounds, its own random salt).
   The file is public with the data, so passwords need to be 8 characters or more. To reset someone's password,
   delete their entry from keys.json on GitHub; they then join again with the team code. */
"use strict";
const Keys = (() => {
  const PATH = "data/keys.json", ROUNDS = 310000, te = new TextEncoder(), td = new TextDecoder();
  const b64 = b => btoa(String.fromCharCode(...new Uint8Array(b))), unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const norm = e => String(e || "").trim().toLowerCase();
  async function derive(pw, salt){ const k = await crypto.subtle.importKey("raw", te.encode(pw), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ROUNDS }, k, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); }
  /* a secret locked with a password, and opened again */
  async function lock(secret, pw){ const s = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    return { s: b64(s), iv: b64(iv), ct: b64(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await derive(pw, s), te.encode(secret))) }; }
  async function open(box, pw){ try { return td.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv) }, await derive(pw, unb64(box.s)), unb64(box.ct))); } catch (e){ return null; } }
  let data = null;
  const load = async () => (data = (await GH.readJson(PATH).catch(() => null)) || { v: 1, users: {} });
  const info = () => ({ ready: !!(data && data.team), has: e => !!(data && data.users && data.users[norm(e)]) });
  /* write keys.json with one change, on top of whatever is there now (a retry if someone saved at the same time) */
  async function write(change, msg){ for (let i = 0; i < 4; i++){ const at = await GH.head(), cur = (await GH.readJson(PATH, at)) || { v: 1, users: {} }; cur.users = cur.users || {}; change(cur);
      try { await GH.commit([{ path: PATH, content: JSON.stringify(cur, null, 1) }], msg, at); data = cur; return; } catch (e){ if (!e.conflict) throw e; } } throw new Error("Couldn't save, try again"); }
  /* the key works: keep it on this computer (it came from a password, so signing out removes it) */
  const use = key => { lsSet("adGhKey", key); lsSet("adKeyPw", 1); GH.reset(); };
  /* sign in: the password opens this person's copy of the key */
  async function unlock(email, pw){ await load(); const box = data.users[norm(email)]; if (!box) return false; const key = await open(box, pw); if (!key) return false; use(key); return true; }
  /* join: the team code opens the team copy; the key is then locked again with this person's own password */
  async function join(email, pw, code){ await load(); if (!data.team) throw new Error("Saving isn't set up yet. Whoever has the GitHub key signs in on their computer first and sets a team code.");
    const key = await open(data.team, code); if (!key) throw new Error("That team code isn't right"); use(key);
    const box = Object.assign(await lock(key, pw), { t: now() }); await write(d => { d.users[norm(email)] = box; }, "Password for " + norm(email)); }
  /* set up (on the computer that has the GitHub key): lock it with a team code and with this person's password */
  async function setup(email, pw, code){ const key = (lsGet("adGhKey", "") || "").trim(); if (!key) throw new Error("This computer has no GitHub key to share");
    const team = await lock(key, code), box = Object.assign(await lock(key, pw), { t: now() });
    await write(d => { d.team = team; d.users[norm(email)] = box; }, "Team code set, and a password for " + norm(email)); lsSet("adKeyPw", null); }
  /* a password for someone on a computer that already saves (their own key, or one unlocked another way) */
  async function addMe(email, pw){ const key = (lsGet("adGhKey", "") || "").trim(); if (!key) throw new Error("This computer can't save");
    const box = Object.assign(await lock(key, pw), { t: now() }); await write(d => { d.users[norm(email)] = box; }, "Password for " + norm(email)); }
  /* signing out forgets a key that came from a password (a key someone pasted in Settings stays) */
  const forget = () => { if (lsGet("adKeyPw", null)){ lsSet("adGhKey", ""); lsSet("adKeyPw", null); GH.reset(); } };
  return { load, info, unlock, join, setup, addMe, forget };
})();
