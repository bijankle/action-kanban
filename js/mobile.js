/* Phone view: look only. A tab bar along the bottom: Actions (filter pills by stage, a search box, a card per
   action; the Organizer board is desktop only) and Settings (theme, dark mode, text size, font,
   how to use, about). Tap an action to see it laid out as its work pack (the PDF's sections, each a card;
   photos full screen, swipe between them), the real work pack PDF a tap away. */
"use strict";
const Mobile = (() => {
  let open = null, tab = ["actions", "settings"].includes(lsGet("adMTab", "actions")) ? lsGet("adMTab", "actions") : "actions", stab = lsGet("adMSt", "view");
  const svg = d => '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  const TABS = [["actions", "Actions", '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>'], ["settings", "Settings", '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>']];
  /* the bottom bar: the page above it is drawn into .m-pg */
  function shell(root){ if (!$(".m-bn", root)){ root.innerHTML = '<div class="m-pg"></div><nav class="m-bn">' + TABS.map(([k, n, d]) => '<button type="button" class="m-bt" data-mt="' + k + '"><i>' + svg(d) + '</i><span>' + n + '</span></button>').join("") + '</nav>';
      $$(".m-bt", root).forEach(b => b.onclick = () => { const k = b.dataset.mt; if (open){ open = null; history.back(); if (k === tab) return render(root); } if (k === tab){ scrollTo(0, 0); $$(".m-list", root).forEach(x => x.scrollTop = 0); return; } tab = k; lsSet("adMTab", k); render(root); scrollTo(0, 0); }); }
    $$(".m-bt", root).forEach(b => b.classList.toggle("on", b.dataset.mt === tab)); return $(".m-pg", root); }
  const top = () => '<div class="m-top">' + LOGO(34) + '<div class="m-pj"></div><input class="in m-q" type="search" placeholder="Search" value="' + esc(App.q || "") + '"></div>';
  function wireTop(pg, root){ App.projBox($(".m-pj", pg)); const qi = $(".m-q", pg);
    qi.oninput = debounce(() => { App.q = qi.value; render(root); const n = $(".m-q", root); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250);
    $(".m-top .logo", pg).onclick = () => { App.q = ""; App.pills.clear(); tab = "actions"; lsSet("adMTab", tab); render(root); scrollTo(0, 0); };   // the logo goes home: every action, from the top
  }
  const card = a => { const s = Store.stage(a.stage), p = Store.project(a._p) || {};
    return '<button type="button" class="m-card" data-ref="' + a._p + ":" + a.u + '" style="--c:' + esc(s.color) + '">' + (a.photos[0] ? '<img alt="" loading="lazy" src="' + esc(Media.src(a, a.photos[0], true)) + '">' : "")
      + '<span class="m-c1"><span class="aid">' + esc(Store.actId(a)) + '</span><span class="stg">' + esc(s.name) + '</span></span><span class="m-t">' + esc(a.f.title || "") + '</span><span class="m-c2">' + (Store.selected().length > 1 ? esc(p.name) + " · " : "") + (a.photos.length ? "📷 " + a.photos.length : "") + (Store.eta(a) ? '  <span class="' + (Store.eta(a) === "TBC" ? "tbc" : "") + '">ETA ' + esc(fmtDate(Store.eta(a))) + '</span>' : "") + '</span></button>'; };
  const wireCards = (pg, root) => $$(".m-card", pg).forEach(c => c.onclick = () => { open = c.dataset.ref; history.pushState({ m: 1 }, ""); render(root); });
  function render(root){ const a = open && App.act(open); if (open && !a) open = null;
    const pg = shell(root); root.classList.toggle("m-in", !!a); requestAnimationFrame(() => { const t = $(".m-top", root); if (t) root.style.setProperty("--mtop", t.offsetHeight + "px"); });   // what sticks under the top row sits just below it, whatever the sizes
    if (a) return detail(pg, a);
    if (tab === "settings") return settings(pg, root);
    const pills = App.pills, all = Store.visible(), list = pills.size ? all.filter(a => pills.has(a.stage)) : Table.rows(), sy = scrollY;   /* (a stage pill shows that stage's actions, the count it says) */
    pg.innerHTML = top()
      + '<div class="m-pills"><button type="button" class="pill' + (!pills.size ? " on" : "") + '" data-s="">All <b>' + all.length + '</b></button>' + Store.stages().map(s => '<button type="button" class="pill' + (pills.has(s.id) ? " on" : "") + '" data-s="' + s.id + '" style="--c:' + esc(s.color) + '"><i class="dot"></i>' + esc(s.name) + ' <b>' + all.filter(a => a.stage === s.id).length + '</b></button>').join("") + '</div>'
      + '<div class="m-list">' + (list.length ? list.map(card).join("") : '<div class="empty">No actions match.</div>') + '</div>';
    wireTop(pg, root); scrollTo(0, sy);
    $$(".pill", pg).forEach(b => b.onclick = () => { const s = b.dataset.s; if (!s) pills.clear(); else if (pills.has(s)) pills.delete(s); else { pills.clear(); pills.add(s); } render(root); });
    wireCards(pg, root); }
  /* Settings: View (dark mode, theme, text size, font), How to use, About */
  const STEPS = Array.from({ length: 15 }, (_, i) => +(0.8 + i * 0.05).toFixed(2));   // text and button sizes: 80% to 150% in 15 steps
  const near = x => STEPS.reduce((b, y, i) => Math.abs(y - x) < Math.abs(STEPS[b] - x) ? i : b, 0);
  function settings(pg, root){ const v = App.viewGet();
    const sub = [["view", "View"], ["help", "How to use"], ["about", "About"]];
    pg.innerHTML = '<div class="m-top m-sth">' + LOGO(34) + '<b>Settings</b></div><div class="m-stt" role="tablist">' + sub.map(([k, n]) => '<button type="button" role="tab" data-st="' + k + '"' + (stab === k ? ' class="on"' : "") + '>' + n + '</button>').join("") + '</div><div class="m-stb"></div>';
    $$("[data-st]", pg).forEach(b => b.onclick = () => { stab = b.dataset.st; lsSet("adMSt", stab); settings(pg, root); });
    $(".m-sth .logo", pg).onclick = () => { tab = "actions"; lsSet("adMTab", tab); render(root); };
    const body = $(".m-stb", pg);
    if (stab === "view"){ FONTS.forEach(f => { if (f[3] && !document.getElementById("wf-" + f[0])){ const l = document.createElement("link"); l.id = "wf-" + f[0]; l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=" + f[3] + "&display=swap"; document.head.appendChild(l); } });   // so each font button shows in its own face
      body.innerHTML = '<div class="ap"><label class="ap-r"><span>Dark mode</span><input type="checkbox" class="ap-sw"' + (v.dark ? " checked" : "") + ' aria-label="Dark mode"></label>'
        + '<div class="ap-r ap-th"><span>Theme</span><div class="ap-thw"><div class="ap-ths" role="radiogroup" aria-label="Theme">' + THEMES.map(([k, n, c]) => '<button type="button" role="radio" data-th="' + k + '" aria-label="' + n + '" style="--c:' + c + '"' + (v.theme === k ? ' class="on"' : "") + '></button>').join("")
        + '<label class="ap-cu' + (v.theme === "custom" ? " on" : "") + '" style="--c:' + esc(v.custom) + '" aria-label="Your own colour"><input type="color" value="' + esc(v.custom) + '"></label></div><div class="ap-thn">' + esc(v.theme === "custom" ? "Your own colour" : (THEMES.find(t => t[0] === v.theme) || THEMES[0])[1]) + '</div></div></div>'
        + [["text", "Text size"], ["btn", "Button size"]].map(([k, n]) => '<label class="ap-r ap-sz"><span>' + n + '</span><input type="range" data-sz="' + k + '" min="0" max="' + (STEPS.length - 1) + '" step="1" value="' + near(+v[k] || 1) + '" aria-label="' + n + '"><b class="ap-pc">' + Math.round((+v[k] || 1) * 100) + '%</b></label>').join("")
        + '<div class="ap-r ap-fo"><span>Font</span><div class="ap-fos">' + FONTS.map(([k, n, ff]) => '<button type="button" data-fo="' + k + '" style="font-family:' + esc(ff) + '"' + (v.font === k ? ' class="on"' : "") + '>' + esc(n) + '</button>').join("") + '</div></div></div>';
      const again = o => { App.viewSet(o); settings(pg, root); };
      $(".ap-sw", body).onchange = e => again({ dark: e.target.checked });
      $$("[data-th]", body).forEach(b => b.onclick = () => again({ theme: b.dataset.th }));
      const cu = $(".ap-cu input", body); cu.oninput = () => { App.viewSet({ theme: "custom", custom: cu.value }); $(".ap-cu", body).style.setProperty("--c", cu.value); }; cu.onchange = () => settings(pg, root);
      $$("[data-sz]", body).forEach(r => { const fill = () => { r.style.setProperty("--p", r.value / r.max * 100 + "%"); r.nextElementSibling.textContent = Math.round(STEPS[+r.value] * 100) + "%"; }; fill();
        r.oninput = fill; r.onchange = () => again({ [r.dataset.sz]: STEPS[+r.value] }); });
      $$("[data-fo]", body).forEach(b => b.onclick = () => again({ font: b.dataset.fo })); }
    if (stab === "help") body.innerHTML = '<div class="st-l">' + [["Finding an action", "Search finds any word in an action: its ID, title, problem, solution, equipment tags and the rest. The pills under the search show one stage at a time (the milestone each action has reached); All shows every stage. The Organizer board is on a computer. The A* logo clears both and goes back to the top."],
      ["Photos", "Open an action and tap a photo for full screen. Swipe left or right for the next one, drag down to close it."],
      ["Projects", "The box beside the logo picks which projects you see. Tick more than one to see them together."],
      ["Editing", "The phone is for looking only. Add and change actions on a computer; the changes show here the next time you open the app."]].map(([t, h]) => '<details class="st-h"><summary>' + t + '</summary><p>' + h + '</p></details>').join("") + '</div>';
    if (stab === "about"){ body.innerHTML = '<div class="ap"><div class="ap-r"><span>Version</span><b class="ap-v">' + APP_VERSION + '</b></div><div class="ap-r"><span>Actions</span><b class="ap-v">' + Store.visible().length + ' in ' + Store.selected().length + ' project' + (Store.selected().length === 1 ? "" : "s") + '</b></div>'
        + '<div class="ap-r"><span>App</span><button type="button" class="btn sm m-upd">Update app</button></div></div><p class="dim m-abt">Action Database tracks plant maintenance actions from the issue to the fix. View only on a phone.</p>';
      $(".m-upd", body).onclick = e => { e.target.disabled = true; e.target.textContent = "Updating…"; App.update(); }; } }
  /* an action, opened: laid out as its work pack (the PDF's band, contact box and sections in its order), each section a card; look only.
     The strip under the top row jumps to a section and follows the scroll; the red PDF page top right makes the real work pack */
  const PDF_I = '<svg viewBox="0 0 20 24" width="18" height="21" aria-hidden="true"><path d="M3 1h10l5 5v17H3z" fill="#fff" stroke="#c0392b" stroke-width="1.6"/><path d="M13 1v5h5" fill="none" stroke="#c0392b" stroke-width="1.6"/><path d="M10.5 9v7M7.5 13l3 3 3-3" fill="none" stroke="#c0392b" stroke-width="1.8" stroke-linecap="round"/><text x="10.5" y="21.3" font-size="5" font-weight="800" fill="#c0392b" text-anchor="middle" font-family="Arial">PDF</text></svg>';
  const tel = v => esc(v).replace(/(\+?\d[\d ]{7,}\d)/g, m => '<a href="tel:' + m.replace(/ /g, "") + '">' + m + '</a>');
  const grid = (hd, rows) => '<table class="wp-g"><thead><tr>' + hd.map(x => '<th>' + esc(x) + '</th>').join("") + '</tr></thead><tbody>' + rows.map(r => '<tr>' + r.map(c => '<td title="' + esc(c) + '">' + esc(c) + '</td>').join("") + '</tr>').join("") + '</tbody></table>';
  function detail(root, a){ const s = Store.stage(a.stage), W = typeof Workpack !== "undefined" ? Workpack : null, cn = W ? W.contact(a) : { cl: [] };
    const job = W ? W.jobRows(a) : [], txt = v => String(v || "").trim(), isol = a.isol || [], pip = typeof Piping !== "undefined" && Piping.hasIso(a);
    const parts = Mto.orderRows(a).map(it => [it.desc || "", String(Mto.ord(it) == null ? "" : Mto.ord(it)) + (it.unit && it.unit !== "ea" ? " " + it.unit : ""), "New"]).concat((a.spares || []).map(it => [it.desc || "", String(it.qty || "") + (it.unit && it.unit !== "ea" ? " " + it.unit : ""), "Site spares"]));
    const S = [["job", "Job", job.length ? '<table class="wp-kv">' + job.map(([k, v]) => '<tr><th>' + esc(k) + '</th><td>' + tel(v).replace(/\n/g, "<br>") + '</td></tr>').join("") + '</table>' : ""],
      ["map", "Photos", (a.photos.length ? '<div class="wp-mp" hidden></div><div class="wp-phs">' + a.photos.map((ph, i) => '<img alt="" loading="lazy" data-i="' + i + '" src="' + esc(Media.src(a, ph, true)) + '">').join("") + '</div>' : '<div class="wp-mp" hidden></div>'), true],
      ["prob", "Problem", txt(a.f.problem) && '<p>' + esc(a.f.problem) + '</p>'], ["work", "Work required", txt(a.f.solution) && '<p>' + esc(a.f.solution) + '</p>'], ["notes", "Notes", txt(a.f.notes) && '<p>' + esc(a.f.notes) + '</p>'],
      ["isol", "Isolations", isol.length && grid(["#", "Equipment", "Name", "Note"], isol.map((it, i) => [String(i + 1), it.tag || "", it.name || "", it.nu ? it.note || "" : ""]))],
      ["pip", "Piping", pip && '<div class="wp-iso">' + Piping.isoSvg(a) + '</div>' + grid(["#", "Item", "Size", "Length or qty"], Piping.listRows(a))],
      ["parts", "Parts", parts.length && grid(["#", "Description", "Qty", "From"], parts.map((r, i) => [String(i + 1)].concat(r)))],
      ["refs", "References", '', true],
      ["att", "Attachments", a.files.length && a.files.map((f, i) => '<button type="button" class="link m-f" data-i="' + i + '">📎 ' + esc(f.name) + '</button>').join("")]];
    const shown = S.filter(x => x[2] || x[3]);
    root.innerHTML = '<div class="m-top"><button type="button" class="ic-b m-back" aria-label="Back">‹</button><span class="aid big">' + esc(Store.actId(a)) + '</span><span class="stg" style="--c:' + esc(s.color) + '">' + esc(s.name) + '</span><span class="grow"></span><button type="button" class="ic-b wp-dl" title="Download the work pack PDF" aria-label="Download the work pack PDF">' + PDF_I + '</button></div>'
      + '<nav class="wp-strip">' + shown.map(([k, t, c]) => '<button type="button" data-go="' + k + '"' + (c ? "" : " hidden") + '>' + esc(k === "map" ? "Location" : t) + '</button>').join("") + '</nav>'
      + '<div class="wp"><div class="wp-c wp-cb"><div class="wp-band"><div><small>WORK PACK</small><h2>' + esc(a.f.title || "Work pack") + '</h2></div><div class="wp-ref"><small>Job ref</small><b>' + esc(Store.actId(a)) + '</b><small>' + esc(fmtDate(new Date().toISOString().slice(0, 10))) + '</small></div></div>'
      + (cn.who ? '<div class="wp-ct"><small>CONTACT FOR QUERIES</small><div>' + cn.cl.map((l, i) => i ? tel(l) : '<b>' + esc(l) + '</b>').join("<br>") + '</div></div>' : "") + '</div>'
      + shown.map(([k, t, c]) => '<section class="wp-c" id="wp-' + k + '"' + (c ? "" : " hidden") + '><h3>' + esc(t).toUpperCase() + '</h3><div class="wp-in">' + (c || "") + '</div></section>').join("") + '</div>';
    $(".m-back", root).onclick = () => history.back();
    $(".wp-dl", root).onclick = () => W && W.run(a);
    $$(".wp-phs img", root).forEach(im => im.onclick = () => { history.pushState({ m: 2 }, ""); Media.view(a, +im.dataset.i); });
    $$(".m-f", root).forEach(b => b.onclick = () => Media.openFile(a, a.files[+b.dataset.i]));
    $$(".wp-g td", root).forEach(td => td.onclick = () => { if (td.scrollWidth > td.clientWidth + 1) note(td.title, 6000); });   /* (a cell cut off for length shows in full) */
    const iso = $(".wp-iso svg", root); if (iso) requestAnimationFrame(() => { const vb = iso.getAttribute("viewBox").split(" ").map(Number); iso.style.setProperty("--k", Math.max(1, vb[2] / (iso.clientWidth || 340)).toFixed(3)); iso.parentElement.style.aspectRatio = vb[2] + " / " + vb[3]; });
    /* the strip: a tap jumps to the section; the section in view is the one lit */
    const strip = $(".wp-strip", root), lit = () => { const off = (parseFloat(getComputedStyle(document.body.querySelector("#mobile") || root).getPropertyValue("--mtop")) || 57) + strip.offsetHeight + 12; let cur = null;
      $$("section.wp-c:not([hidden])", root).forEach(x => { if (x.getBoundingClientRect().top <= off) cur = x.id.slice(3); }); cur = cur || ($("section.wp-c:not([hidden])", root) || { id: "wp-" }).id.slice(3);
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4){ const L = $$("section.wp-c:not([hidden])", root).pop(); if (L) cur = L.id.slice(3); }   /* (at the very end, the last section) */
      $$("[data-go]", strip).forEach(b => { const on = b.dataset.go === cur; if (on !== b.classList.contains("on")){ b.classList.toggle("on", on); if (on) b.scrollIntoView({ block: "nearest", inline: "nearest" }); } }); };
    $$("[data-go]", strip).forEach(b => b.onclick = () => { const x = $("#wp-" + b.dataset.go, root); if (x) x.scrollIntoView({ block: "start", behavior: "smooth" }); });
    if (window.__wpScroll) removeEventListener("scroll", window.__wpScroll); window.__wpScroll = () => { if (!root.isConnected || !$(".wp-strip", root)) return removeEventListener("scroll", window.__wpScroll); lit(); }; addEventListener("scroll", window.__wpScroll, { passive: true });
    /* behind it: the site map (the expected location) and the documents, shown when they come */
    const show = k => { const x = $("#wp-" + k, root), b = $('[data-go="' + k + '"]', strip); if (x) x.hidden = false; if (b) b.hidden = false; };
    if (typeof SiteMap !== "undefined") SiteMap.forAction(a, true).then(sm => { if (!sm || !root.isConnected) return; const m = $(".wp-mp", root); if (!m) return; m.innerHTML = '<img alt="Expected location" src="' + esc(sm.url) + '"><p class="wp-cap">' + esc(sm.note || "") + '</p>'; m.hidden = false; $("#wp-map h3", root).textContent = a.photos.length ? "LOCATION AND PHOTOS" : "LOCATION"; show("map"); }).catch(() => {});
    if (W) W.refList(a).then(L => { if (!L.length || !root.isConnected) return; const x = $("#wp-refs .wp-in", root); if (!x) return;
      x.innerHTML = '<table class="wp-g"><thead><tr><th>#</th><th>Document</th><th>Title</th></tr></thead><tbody>' + L.map((d, i) => '<tr><td>' + (i + 1) + '</td><td>' + (d.url ? '<a href="' + esc(d.url) + '" target="_blank" rel="noopener">' + esc(d.n) + '</a>' : esc(d.n)) + '</td><td title="' + esc(d.t) + '">' + esc(d.t) + '</td></tr>').join("") + '</tbody></table>'; show("refs"); }).catch(() => {});
    scrollTo(0, 0); requestAnimationFrame(lit); }
  addEventListener("popstate", () => { if (Media.open){ Media.close(); return; } if (open){ open = null; App.render(); } });
  return { render, show: ref => { open = ref; history.pushState({ m: 1 }, ""); } };
})();
