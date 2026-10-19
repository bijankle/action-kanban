/* The local folder chosen at setup (Chrome / Edge). Full quality photos and attachments are written to
   <folder>/<project>/<action ID>/, and a copy of the data to <folder>/_data/ after every save. */
"use strict";
const Local = (() => {
  let root = null, ok = false;
  const supported = "showDirectoryPicker" in window;
  async function init(){ if (!supported) return; root = await IDB.get("dir") || null; if (root) ok = (await root.queryPermission({ mode: "readwrite" })) === "granted"; }
  async function pick(){ if (!supported){ alert("Saving to a folder needs Chrome or Edge on a computer."); return false; }
    try { root = await showDirectoryPicker({ id: "actionDatabase", mode: "readwrite" }); await IDB.set("dir", root); ok = true; App.render(); return true; } catch (e){ return false; } }
  /* the browser asks again in each new session; this needs a click */
  async function reconnect(){ if (!root) return pick(); try { ok = (await root.requestPermission({ mode: "readwrite" })) === "granted"; } catch (e){ ok = false; } App.render(); return ok; }
  const name = () => root ? root.name : "";
  const state = () => !supported ? "unsupported" : !root ? "none" : ok ? "ok" : "locked";
  async function dir(parts){ let d = root; for (const p of parts) d = await d.getDirectoryHandle(safeName(p), { create: true }); return d; }
  const actDir = a => { const p = Store.project(a._p) || {}; return [p.name || a._p, Store.actId(a)]; };
  async function write(parts, fname, data){ if (!ok) return false; try { const d = await dir(parts); const fh = await d.getFileHandle(safeName(fname), { create: true }); const w = await fh.createWritable(); await w.write(data); await w.close(); return true; } catch (e){ console.warn(e); return false; } }
  async function read(parts, fname){ if (!ok) return null; try { let d = root; for (const p of parts) d = await d.getDirectoryHandle(safeName(p)); return await (await d.getFileHandle(safeName(fname))).getFile(); } catch (e){ return null; } }
  const saveOriginal = (a, fname, blob) => write(actDir(a), fname, blob);
  const original = (a, fname) => read(actDir(a), fname);
  async function backup(S){ if (!ok) return; const t = JSON.stringify; await write(["_data"], "config.json", t(S.config, null, 1)); await write(["_data"], "projects.json", t(S.projects, null, 1));
    for (const pid of Object.keys(S.acts)) await write(["_data"], pid + ".json", JSON.stringify(S.acts[pid], (k, v) => k === "_p" ? undefined : v, 1)); }
  return { init, pick, reconnect, name, state, saveOriginal, original, backup, supported, get ok(){ return ok; } };
})();
