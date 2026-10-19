/* Photos and attachments: the full quality original goes to the local folder, a compressed copy and a
   thumbnail go online. Also the full screen photo viewer. */
"use strict";
const QUALITY = { low: [1024, 0.72], medium: [1600, 0.8] };
const Media = (() => {
  const mem = new Map();   // photos added this session, shown at once while they upload
  async function compress(blob, maxW, q){ const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
    const k = Math.min(1, maxW / Math.max(bmp.width, bmp.height)); const w = Math.round(bmp.width * k), hh = Math.round(bmp.height * k);
    const c = document.createElement("canvas"); c.width = w; c.height = hh; const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, w, hh); g.drawImage(bmp, 0, 0, w, hh);
    const out = await new Promise(r => c.toBlob(r, "image/jpeg", q)); return { blob: out, w: bmp.width, h: bmp.height }; }
  const isImg = f => /^image\/(jpeg|png|gif|webp|bmp|heic|heif)/i.test(f.type) || /\.(jpe?g|png|gif|webp|bmp)$/i.test(f.name || "");
  async function addFiles(a, files){ files = Array.from(files || []); if (!files.length || !a) return;
    if (!Store.S.edit) return App.viewOnly();
    const imgs = files.filter(isImg), docs = files.filter(f => !isImg(f));
    const big = docs.filter(f => f.size > 50 * 1048576); if (big.length){ alert(big.map(f => f.name).join(", ") + " is over 50 MB, too large to store online. It's saved to your local folder only."); }
    note("Adding " + files.length + " file" + (files.length > 1 ? "s" : "") + " to " + Store.actId(a) + "…", 6000);
    const qual = QUALITY[Store.S.config.quality || "medium"] || QUALITY.medium;
    for (const f of imgs){ try { const buf = await f.arrayBuffer(); const hh = await sha1(buf);
        if (a.photos.some(p => p.h === hh)) continue;
        const name = f.name && !/^image\.\w+$/.test(f.name) ? f.name : "Pasted " + new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-") + ".png";
        const main = await compress(f, qual[0], qual[1]), th = await compress(f, 420, 0.7);
        mem.set(hh, { main: URL.createObjectURL(main.blob), thumb: URL.createObjectURL(th.blob), orig: f });
        Store.mutate("a:" + a._p, () => { a.photos.push({ h: hh, name, w: main.w, ht: main.h, added: now() }); Store.touch(a); }); Store.log("Added a photo to " + Store.actId(a));
        Local.saveOriginal(a, name, f);
        await Store.addBlob(pImg(a._p, hh), bufToB64(await main.blob.arrayBuffer())); await Store.addBlob(pThumb(a._p, hh), bufToB64(await th.blob.arrayBuffer()));
      } catch (e){ console.error(e); alert("Couldn't add " + f.name + ": " + e.message); } }
    for (const f of docs){ try { const buf = await f.arrayBuffer(); const hh = (await sha1(buf)).slice(0, 12);
        Local.saveOriginal(a, f.name, f);
        if (f.size <= 50 * 1048576) await Store.addBlob(pFile(a._p, hh, f.name), bufToB64(buf));
        mem.set("f" + hh, URL.createObjectURL(f));
        Store.mutate("a:" + a._p, () => { a.files.push({ h: hh, name: f.name, size: f.size, type: f.type, added: now(), local: f.size > 50 * 1048576 }); Store.touch(a); }); Store.log("Attached " + f.name + " to " + Store.actId(a));
      } catch (e){ console.error(e); alert("Couldn't attach " + f.name + ": " + e.message); } }
    note("Added to " + Store.actId(a) + ", saving online…"); }
  const src = (a, p, thumb) => { const m = mem.get(p.h); if (m) return thumb ? m.thumb : m.main; return GH.fileUrl(thumb ? pThumb(a._p, p.h) : pImg(a._p, p.h)); };
  const fileSrc = (a, f) => mem.get("f" + f.h) || GH.fileUrl(pFile(a._p, f.h, f.name));
  const fileUrlOnline = (a, f) => GH.fileUrl(pFile(a._p, f.h, f.name));
  async function openFile(a, f){ const loc = Local.ok && await Local.original(a, f.name); if (loc){ window.open(URL.createObjectURL(loc), "_blank"); return; }
    if (f.local){ alert(f.name + " is only in the local folder of the computer that added it."); return; } window.open(fileSrc(a, f), "_blank"); }

  /* ---------- full screen viewer: double click a photo or press its ⛶ button; Esc closes, arrows step ---------- */
  let V = null;
  function view(a, i){ close(); if (!a || !a.photos.length) return; i = Math.max(0, Math.min(i || 0, a.photos.length - 1));
    V = h('<div class="viewer" tabindex="-1"><div class="vw-top"><span class="vw-t"></span><span class="vw-n"></span><button class="vw-b vw-x" type="button" title="Close (Esc)">✕</button></div><div class="vw-stage"><button class="vw-b vw-prev" type="button" aria-label="Previous">‹</button><img alt=""><button class="vw-b vw-next" type="button" aria-label="Next">›</button></div></div>');
    document.body.appendChild(V); V.focus(); let cur = i;
    const img = $("img", V), show = async k => { cur = (k + a.photos.length) % a.photos.length; const p = a.photos[cur];
      $(".vw-t", V).textContent = Store.actId(a) + "  " + (a.f.title || ""); $(".vw-n", V).textContent = (cur + 1) + " / " + a.photos.length + "  " + (p.name || "");
      img.src = src(a, p); const m = mem.get(p.h); const loc = m && m.orig ? m.orig : Local.ok ? await Local.original(a, p.name) : null; if (loc && a.photos[cur] === p) img.src = URL.createObjectURL(loc); };
    show(cur);
    $(".vw-x", V).onclick = close; $(".vw-prev", V).onclick = () => show(cur - 1); $(".vw-next", V).onclick = () => show(cur + 1);
    $(".vw-prev", V).hidden = $(".vw-next", V).hidden = a.photos.length < 2;
    V.addEventListener("click", e => { if (e.target.classList.contains("vw-stage")) close(); });
    V.addEventListener("keydown", e => { if (e.key === "Escape"){ e.stopPropagation(); close(); } else if (e.key === "ArrowLeft") show(cur - 1); else if (e.key === "ArrowRight") show(cur + 1); });
    let x0 = null; V.addEventListener("touchstart", e => x0 = e.touches[0].clientX, { passive: true });
    V.addEventListener("touchend", e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1)); x0 = null; });
    try { V.requestFullscreen && matchMedia("(pointer: fine)").matches && V.requestFullscreen().catch(() => {}); } catch (e) {} }
  function close(){ if (!V) return; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); V.remove(); V = null; }
  document.addEventListener("fullscreenchange", () => { if (V && !document.fullscreenElement){ /* Esc in browser full screen leaves full screen first; close the viewer with it */ close(); } });
  return { addFiles, src, fileSrc, fileUrlOnline, openFile, view, close, isImg, compress, mem, get open(){ return !!V; } };
})();
