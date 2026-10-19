/* Import from ActionMap (the bijankle/Action-Map data repo). Each ActionMap project becomes a project here;
   the action text becomes the title and problem, Done and On hold map to those stages, the sub actions
   become steps and the photos come across in their order. ActionMap keeps 1280 px previews online, so those
   come across; the originals can be copied from the ActionMap photo folder into the local folder. */
"use strict";
const ImportAM = (() => {
  const RAW = lsGet("adAmRaw", "") || "https://raw.githubusercontent.com/bijankle/Action-Map/HEAD/";
  const prefixOf = n => (String(n).replace(/[^A-Za-z]/g, "").slice(0, 3) || "ACT").toUpperCase();
  const PCOL = ["#475569", "#9A3412", "#1F4F5A", "#5A5A2E", "#1E3A5F", "#7A6A5D"];
  async function open(){ if (!Store.S.edit) return App.viewOnly();
    const m = modal('<h3>Import from ActionMap</h3><div class="am-l"><div class="dim">Reading ActionMap…</div></div><p class="dim">ActionMap keeps 1280 px copies of the photos online (with your markups drawn on), and those come across. The full quality originals are in your ActionMap photo folder: pick it to copy them into this app\'s local folder too.</p><div class="in-row"><button type="button" class="btn ghost sm" data-k="src"' + (Local.ok ? "" : " disabled") + '>Pick ActionMap photo folder…</button><span class="dim am-src">' + (Local.ok ? "optional" : "connect the local folder in Settings first") + '</span></div><div class="am-msg dim"></div><div class="yn-btns"><button class="yn-no" type="button">Close</button><button class="yn-yes" type="button" disabled>Import</button></div>', { sticky: true });
    $(".yn-no", m).onclick = () => m.close();
    let srcIdx = null;
    $("[data-k=src]", m).onclick = async () => { try { const d = await showDirectoryPicker({ id: "actionMapPhotos" }); $(".am-src", m).textContent = "Reading " + d.name + "…"; srcIdx = await index(d); $(".am-src", m).textContent = d.name + ": " + srcIdx.size + " photos found"; } catch (e) {} };
    let list; try { list = (await (await fetch(RAW + "projects.json?t=" + now(), { cache: "no-store" })).json()).projects || []; } catch (e){ $(".am-l", m).innerHTML = '<div class="bad">Couldn\'t read ActionMap: ' + esc(e.message) + '</div>'; return; }
    const done = id => Store.projects().find(p => p.importedFrom === "actionmap:" + id);
    $(".am-l", m).innerHTML = list.map(p => '<label class="tp-o"><input type="checkbox" data-id="' + esc(p.id) + '" checked><span>' + esc(p.name) + '</span><span class="dim">' + (done(p.id) ? "already imported, copies originals only" : "") + '</span></label>').join("");
    const go = $(".yn-yes", m); go.disabled = false;
    go.onclick = async () => { go.disabled = true; const msg = $(".am-msg", m);
      try { for (const c of $$("[data-id]", m).filter(c => c.checked)){ const p = list.find(x => x.id === c.dataset.id); await one(p, done(p.id), srcIdx, t => msg.textContent = t); }
        msg.textContent = "Finished. Saving online…"; Store.saveSoon.flush(); }
      catch (e){ console.error(e); msg.textContent = "Stopped: " + e.message; } go.disabled = false; }; }
  /* every photo in the ActionMap folder (and below), by file name */
  async function index(dir, map, depth){ map = map || new Map(); depth = depth || 0; if (depth > 4) return map;
    for await (const [n, hd] of dir.entries()){ if (hd.kind === "file" && /\.(jpe?g|png|heic|webp)$/i.test(n)) map.set(n.toLowerCase(), hd); else if (hd.kind === "directory") await index(hd, map, depth + 1); } return map; }
  async function copyOrig(srcIdx, a, name){ const hd = srcIdx && srcIdx.get(String(name).toLowerCase()); if (!hd) return false; await Local.saveOriginal(a, name, await hd.getFile()); return true; }
  async function one(src, existing, srcIdx, say){ const pk = await (await fetch(RAW + "projects/" + src.id + "/pack.json?t=" + now(), { cache: "no-store" })).json();
    const getImg = async h => { const r = await fetch(RAW + "projects/" + src.id + "/img/" + h + ".jpg"); if (!r.ok) throw new Error("ActionMap photo " + h + " (" + r.status + ")"); return r.blob(); };
    if (existing){ if (!srcIdx) return; let n = 0; for (const a of Store.actsOf(existing.id)){ a._p = existing.id; for (const ph of a.photos.filter(x => x.am)) if (await copyOrig(srcIdx, a, ph.name)) say(src.name + ": copied original " + (++n)); } return; }
    let st = {}; try { st = await (await fetch(RAW + "projects/" + src.id + "/state.json?t=" + now(), { cache: "no-store" })).json(); } catch (e) {}
    const byNo = new Map((st.actions || []).map(x => [x.id, x]));
    const pid = slug(src.name) + "-" + uid().slice(-4), stages = Store.stages(), hold = stages.find(s => s.kind === "hold"), fin = stages.find(s => s.kind === "done");
    const proj = Store.touch({ id: pid, name: src.name, prefix: prefixOf(src.name), color: PCOL[Store.projects().length % PCOL.length], created: now(), importedFrom: "actionmap:" + src.id });
    const acts = [], blobs = [], list = pk.actions || []; let k = 0, copied = 0;
    for (const x of list){ k++; say(src.name + ": action " + k + " of " + list.length);
      const sx = byNo.get(x.id) || {}, stage = x.done ? fin : x.hold ? hold : stages[0];
      const a = { u: uid(), no: x.id, am: sx.u || String(x.id), stage: (stage || stages[0]).id, rank: k, created: x.created || now(), f: { title: x.text, problem: x.text }, photos: [], files: [], steps: (x.steps || []).map(s => ({ id: s.id || uid(), t: s.t, d: !!s.d })), _p: pid };
      if (x.loc) a.gps = { lat: x.loc.lat, lng: x.loc.lng }; if (x.doneAt) a.doneAt = x.doneAt;
      for (const ph of x.photos || []){ if (!ph.h) continue; const b = await getImg(ph.h); const buf = await b.arrayBuffer(), hh = await sha1(buf); const th = await Media.compress(b, 420, 0.7);
        if (await copyOrig(srcIdx, a, ph.name)) copied++;
        blobs.push({ path: pImg(pid, hh), sha: await GH.blob(bufToB64(buf)) }, { path: pThumb(pid, hh), sha: await GH.blob(bufToB64(await th.blob.arrayBuffer())) });
        a.photos.push(Object.assign({ h: hh, am: ph.f || ph.h, name: ph.name, w: th.w, ht: th.h, added: now() }, ph.note ? { cap: ph.note } : {})); }
      acts.push(Store.touch(a)); }
    Store.mutate(["projects", "a:" + pid], () => { Store.S.projects.projects.push(proj); Store.S.acts[pid] = { v: 1, nextNo: Math.max(st.nextNo || 1, ...acts.map(a => a.no + 1)), actions: acts }; Store.S.blobs.push(...blobs);
      Store.setSelected(Store.selected().concat(pid)); });
    Store.log("Imported " + src.name + " from ActionMap" + (copied ? ", " + copied + " originals copied" : "")); }
  return { open, prefixOf };
})();
