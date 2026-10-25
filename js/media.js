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
  /* a file name not yet used by this action's photos, attachments or quotes (the local folder keeps originals by name) */
  function uniq(a, name, hh){ const used = new Set([].concat(a.photos, a.files, a.quotes || []).map(x => (x.lname || x.name || "").toLowerCase())); if (!used.has(String(name).toLowerCase())) return name;
    return String(name).replace(/(\.[^.]*)?$/, m => " (" + hh.slice(0, 6) + ")" + m); }
  const isImg = f => /^image\/(jpeg|png|gif|webp|bmp|heic|heif)/i.test(f.type) || /\.(jpe?g|png|gif|webp|bmp)$/i.test(f.name || "");
  async function addFiles(a, files){ files = Array.from(files || []); if (!files.length || !a) return;
    if (!Store.S.edit) return App.viewOnly();
    const imgs = files.filter(isImg), docs = files.filter(f => !isImg(f));
    const big = docs.filter(f => f.size > 50 * 1048576); if (big.length){ alert(big.map(f => f.name).join(", ") + " is over 50 MB, too large to store online, so it's kept in your local folder only."); }
    note("Adding " + files.length + " file" + (files.length > 1 ? "s" : "") + " to " + Store.actId(a) + "…", 6000);
    const qual = QUALITY[Store.S.config.quality || "medium"] || QUALITY.medium;
    for (const f of imgs){ try { const buf = await f.arrayBuffer(); const hh = await sha1(buf);
        if (a.photos.some(p => p.h === hh)) continue;
        const name = uniq(a, f.name && !/^image\.\w+$/.test(f.name) ? f.name : "Pasted " + new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-") + ".png", hh);
        let main, th; try { main = await compress(f, qual[0], qual[1]); th = await compress(f, 420, 0.7); } catch (e){ docs.push(f); note(f.name + " can't be shown as a photo in this browser, so it's kept as an attachment", 5000); continue; }
        mem.set(hh, { main: URL.createObjectURL(main.blob), thumb: URL.createObjectURL(th.blob), orig: f });
        Local.saveOriginal(a, name, f);
        await Store.addBlob(pImg(a._p, hh), bufToB64(await main.blob.arrayBuffer())); await Store.addBlob(pThumb(a._p, hh), bufToB64(await th.blob.arrayBuffer()));
        Store.mutate("a:" + a._p, () => { a.photos.push({ h: hh, name, w: main.w, ht: main.h, added: now() }); Store.touch(a); }); Store.log("Added a photo to " + Store.actId(a));
      } catch (e){ console.error(e); alert("Couldn't add " + f.name + ": " + e.message); } }
    for (const f of docs){ try { const buf = await f.arrayBuffer(); const hh = (await sha1(buf)).slice(0, 12), big = f.size > 50 * 1048576, name = uniq(a, f.name, hh);
        const kept = await Local.saveOriginal(a, name, f);
        if (big && !kept){ alert(f.name + " is over 50 MB, too large to store online, and no local folder is connected, so it wasn't attached."); continue; }
        if (!big) await Store.addBlob(pFile(a._p, hh, name), bufToB64(buf));
        mem.set("f" + hh, URL.createObjectURL(f));
        Store.mutate("a:" + a._p, () => { a.files.push({ h: hh, name, size: f.size, type: f.type, added: now(), local: big }); Store.touch(a); }); Store.log("Attached " + name + " to " + Store.actId(a));
      } catch (e){ console.error(e); alert("Couldn't attach " + f.name + ": " + e.message); } }
    note("Added to " + Store.actId(a) + ", saving online…"); refresh(a); }
  const src = (a, p, thumb) => { const m = mem.get(p.h); if (m) return thumb ? m.thumb : m.main; return GH.fileUrl(thumb ? pThumb(a._p, p.h) : pImg(a._p, p.h)); };
  const fileSrc = (a, f) => mem.get("f" + f.h) || GH.fileUrl(pFile(a._p, f.h, f.name));
  const fileUrlOnline = (a, f) => GH.fileUrl(pFile(a._p, f.h, f.name));
  async function openFile(a, f){ const loc = Local.ok && await Local.original(a, f.lname || f.name); if (loc){ window.open(URL.createObjectURL(loc), "_blank"); return; }
    if (f.local){ alert(f.name + " is only in the local folder of the computer that added it."); return; } window.open(fileSrc(a, f), "_blank"); }

  /* ---------- photo gallery: a big popup over the page, the photo large with a strip of thumbnails below
     (the ones before and after). Arrows or the strip step through, ⛶ or a double click for full screen, Esc closes.
     On a touch screen the photo follows the finger with the ones either side peeking in, and glides on or back
     when let go; a drag down closes it. ---------- */
  let V = null;
  /* the viewer's line symbols, the same as the app's other buttons */
  const GI = Object.fromEntries(Object.entries({ bin: "M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3", fs: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5", x: "M6 6l12 12M18 6L6 18", l: "M15 5l-7 7 7 7", r: "M9 5l7 7-7 7" })
    .map(([k, d]) => [k, '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>']));
  function view(a, i){ close(); if (!a) return; i = Math.max(0, Math.min(i || 0, a.photos.length - 1)); const ro = !Store.S.edit;
    V = h('<div class="gal" tabindex="-1"><div class="gal-win"><div class="gal-top"><span class="idw"><span class="aid">' + esc(Store.actId(a)) + '</span></span><span class="gal-t">' + esc(a.f.title || "") + '</span><span class="gal-n"></span><span class="grow"></span>'
      + (ro ? "" : '<button class="btn ghost sm" type="button" data-k="add">+ Upload photos</button><button class="gal-b gal-del" type="button" data-k="del" title="Remove this photo" aria-label="Remove this photo">' + GI.bin + '</button>')
      + '<button class="gal-b" type="button" data-k="fs" title="Full screen (or double click the photo)" aria-label="Full screen">' + GI.fs + '</button><button class="gal-b" type="button" data-k="x" title="Close (Esc)" aria-label="Close">' + GI.x + '</button></div>'
      + '<div class="gal-stage"><button class="gal-arr gal-prev" type="button" aria-label="Previous">' + GI.l + '</button><div class="gal-vp"><div class="gal-track"><div class="gal-sl" style="--j:-1"><img alt=""></div><div class="gal-sl" style="--j:0"><img alt=""></div><div class="gal-sl" style="--j:1"><img alt=""></div></div></div><div class="gal-none">No photos yet.' + (ro ? "" : " Upload some, or drop them here.") + '</div><button class="gal-arr gal-next" type="button" aria-label="Next">' + GI.r + '</button></div>'
      + '<div class="gal-cap"></div><div class="gal-strip"></div></div></div>');
    document.body.appendChild(V); V.focus(); let cur = i;
    const vp = $(".gal-vp", V), track = $(".gal-track", V), [imP, img, imN] = $$(".gal-sl img", V), strip = $(".gal-strip", V), GAP = 24;
    const step = () => vp.clientWidth + GAP, move = (x, ms) => { track.style.transition = ms ? "transform " + ms + "ms cubic-bezier(.2,.8,.2,1)" : "none"; track.style.transform = "translateX(" + x + "px)"; };
    const drawStrip = () => { strip.innerHTML = a.photos.map((p, k) => '<button type="button" class="gal-th' + (k === cur ? " on" : "") + '" data-i="' + k + '"><img alt="" loading="lazy" src="' + esc(src(a, p, true)) + '"></button>').join("");
      $$(".gal-th", strip).forEach(b => b.onclick = () => show(+b.dataset.i)); };
    const show = async k => { const n = a.photos.length; $(".gal-none", V).hidden = !!n; vp.hidden = !n; move(0); $(".gal-n", V).textContent = n ? (cur + 1 > n ? n : cur + 1) + " of " + n : "";
      $$(".gal-arr", V).forEach(b => b.hidden = n < 2); if (!n){ strip.innerHTML = ""; $(".gal-cap", V).textContent = ""; return; }
      cur = (k + n) % n; const p = a.photos[cur]; $(".gal-n", V).textContent = (cur + 1) + " of " + n;
      $(".gal-cap", V).innerHTML = '<span class="gal-cn">' + (cur + 1) + " of " + n + '  ·  </span>' + esc((p.name || "") + (p.cap ? "  ·  " + p.cap : ""));   // (on a phone the count sits here, so the title has the top bar)
      if (strip.children.length !== n) drawStrip(); $$(".gal-th", strip).forEach((b, j) => b.classList.toggle("on", j === cur));
      const on = strip.children[cur]; on && on.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
      const side = (im, j) => { const q = a.photos[cur + j]; im.hidden = !q; if (q) im.src = src(a, q); }; side(imP, -1); side(imN, 1);   // the ones either side, for a swipe to peek at
      img.src = src(a, p); const m = mem.get(p.h); const loc = m && m.orig ? m.orig : Local.ok ? await Local.original(a, p.name) : null; if (loc && a.photos[cur] === p) img.src = URL.createObjectURL(loc); };
    /* slide to the next or previous photo (k one either side), or jump straight there */
    const go = k => { const n = a.photos.length; if (n < 2 || k === cur) return show(k); const d = k - cur; if (Math.abs(d) !== 1 || k < 0 || k >= n) return show(k);
      move(-d * step(), 260); setTimeout(() => show(k), 260); };
    show(cur); V._a = a; V._show = () => { drawStrip(); show(a.photos.length - 1); };
    const fs = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else $(".gal-win", V).requestFullscreen().catch(() => {}); };
    V.querySelectorAll("[data-k]").forEach(b => b.onclick = async () => { const k = b.dataset.k;
      if (k === "x") closeUi(); else if (k === "fs") fs();
      else if (k === "add") pickFiles(a);
      else if (k === "del" && a.photos.length && await confirmBox("Remove this photo from " + Store.actId(a) + "? You can undo with Ctrl+Z.", "Remove", true).then(ok => { V && V.focus(); return ok; })){
        const i0 = cur; Store.mutate("a:" + a._p, () => { a.photos.splice(i0, 1); Store.touch(a); }); Store.log("Removed a photo from " + Store.actId(a)); V && (V.focus(), drawStrip(), show(Math.min(i0, a.photos.length - 1))); } });
    img.ondblclick = fs;
    $(".gal-prev", V).onclick = () => go(cur - 1); $(".gal-next", V).onclick = () => go(cur + 1);
    V.addEventListener("mousedown", e => { if (e.target === V) close(); });
    V.addEventListener("keydown", e => { if (e.key === "Escape"){ e.stopPropagation(); if (!document.fullscreenElement) close(); } else if (e.key === "ArrowLeft") go(cur - 1); else if (e.key === "ArrowRight") go(cur + 1); });
    V.addEventListener("dragover", e => { if (!ro && hasDrop(e)) e.preventDefault(); });
    V.addEventListener("drop", e => { if (ro) return; e.preventDefault(); e.stopPropagation(); dropOn(a, e); });
    /* touch: the first few pixels decide sideways (swipe between photos) or down (close); a quick flick counts as much as a long drag */
    let t = null; const bg = V.style;
    vp.addEventListener("touchstart", e => { if (e.touches.length !== 1){ t = null; return; } const c = e.touches[0]; t = { x: c.clientX, y: c.clientY, ax: null, pts: [[c.clientX, c.clientY, e.timeStamp]] }; }, { passive: true });
    vp.addEventListener("touchmove", e => { if (!t || e.touches.length !== 1) return; const c = e.touches[0], dx = c.clientX - t.x, dy = c.clientY - t.y;
      if (!t.ax){ if (Math.hypot(dx, dy) < 8) return; t.ax = Math.abs(dx) > Math.abs(dy) ? "x" : dy > 0 ? "y" : "-"; }
      e.preventDefault(); t.pts.push([c.clientX, c.clientY, e.timeStamp]); if (t.pts.length > 5) t.pts.shift();
      if (t.ax === "x"){ const n = a.photos.length, edge = (dx > 0 && cur === 0) || (dx < 0 && cur === n - 1); move(edge ? dx / 3 : dx); }   // at the first or last photo it gives a little, then springs back
      else if (t.ax === "y"){ const y = Math.max(0, dy); track.style.transition = "none"; track.style.transform = "translateY(" + y + "px) scale(" + Math.max(0.85, 1 - y / 1500) + ")"; bg.background = "rgba(11,12,14," + Math.max(0.2, 0.8 - y / 500) + ")"; } }, { passive: false });
    const end = () => { if (!t || !t.ax) { t = null; return; } const f = t.pts[0], l = t.pts[t.pts.length - 1], dt = Math.max(1, l[2] - f[2]), vx = (l[0] - f[0]) / dt, vy = (l[1] - f[1]) / dt, dx = l[0] - t.x, dy = l[1] - t.y, ax = t.ax; t = null;
      if (ax === "x"){ const n = a.photos.length, w = step(), d = dx < -w * 0.25 || vx < -0.45 ? 1 : dx > w * 0.25 || vx > 0.45 ? -1 : 0, k = cur + d;
        if (d && k >= 0 && k < n){ move(-d * w, 240); setTimeout(() => show(k), 240); } else move(0, 220); }
      else if (ax === "y"){ if (dy > 110 || vy > 0.6){ track.style.transition = "transform 180ms ease-in, opacity 180ms"; track.style.transform = "translateY(" + (dy + 200) + "px) scale(.85)"; track.style.opacity = "0"; setTimeout(closeUi, 170); }
        else { bg.background = ""; track.style.transition = "transform 220ms cubic-bezier(.2,.8,.2,1)"; track.style.transform = ""; } } };
    vp.addEventListener("touchend", end); vp.addEventListener("touchcancel", end); }
  /* closing from the photo itself: on a phone the photo is a step in the back history, so step back out of it */
  const closeUi = () => { if (history.state && history.state.m === 2) history.back(); else close(); };
  function close(){ if (!V) return; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); V.remove(); V = null; }
  /* after photos are added to the action the gallery is showing, show the newest */
  const refresh = a => { if (V && V._a === a) V._show(); };
  function pickFiles(a, accept){ pickFile(accept, true, fs => addFiles(a, fs)); }

  /* ---------- the tray: pasted photos wait here until dragged onto an action ---------- */
  const tray = [];
  function toTray(files){ files.forEach(f => tray.push({ id: uid(), f, url: URL.createObjectURL(f) })); drawTray(); note("Pasted photo waiting at the bottom left. Drag it onto an action.", 4000); }
  function drawTray(){ let t = $("#tray"); if (!tray.length){ t && t.remove(); return; }
    if (!t){ t = h('<div id="tray"></div>'); document.body.appendChild(t); }
    t.innerHTML = '<div class="tr-h"><b>Pasted photos</b><span>Drag onto an action to attach</span><button type="button" class="ic-b sm" data-x="all" title="Discard all">✕</button></div><div class="tr-l">'
      + tray.map(x => '<div class="tr-i" draggable="true" data-id="' + x.id + '"><img alt="" src="' + x.url + '"><button type="button" class="tr-x" data-x="' + x.id + '" title="Discard">✕</button></div>').join("") + '</div>';
    $$(".tr-i", t).forEach(el => el.ondragstart = e => { e.dataTransfer.setData("text/tray", el.dataset.id); e.dataTransfer.effectAllowed = "copy"; });
    $$("[data-x]", t).forEach(b => b.onclick = () => { const id = b.dataset.x; tray.splice(0, tray.length, ...(id === "all" ? [] : tray.filter(x => x.id !== id))); drawTray(); }); }
  const hasDrop = e => { const t = [...e.dataTransfer.types]; return t.includes("Files") || t.includes("text/tray"); };
  /* a drop onto an action: files from the computer, or a photo from the tray */
  function dropOn(a, e){ if (!a) return; const id = e.dataTransfer.getData("text/tray");
    if (id){ const x = tray.find(y => y.id === id); if (!x) return; tray.splice(tray.indexOf(x), 1); drawTray(); return addFiles(a, [x.f]); }
    if (e.dataTransfer.files.length) addFiles(a, e.dataTransfer.files); }
  return { uniq, addFiles, src, fileSrc, fileUrlOnline, openFile, view, close, refresh, pickFiles, toTray, hasDrop, dropOn, isImg, compress, mem, get open(){ return !!V; } };
})();
