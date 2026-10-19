/* Phone view: look only. A tab bar along the bottom: Actions (filter pills by stage, a search box, a card per
   action; the Organizer board is desktop only) and Settings (theme, dark mode, text size, font,
   how to use, about). Tap an action for its problem, solution, photos (tap for full screen, swipe between them)
   and details. */
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
      + '<span class="m-c1"><span class="aid">' + esc(Store.actId(a)) + '</span><span class="stg">' + esc(s.name) + '</span></span><span class="m-t">' + esc(a.f.title || "") + '</span><span class="m-c2">' + (Store.selected().length > 1 ? esc(p.name) + " · " : "") + (a.photos.length ? "📷 " + a.photos.length : "") + (a.f.eta ? '  <span class="' + (a.f.eta === "TBC" ? "tbc" : "") + '">ETA ' + esc(fmtDate(a.f.eta)) + '</span>' : "") + '</span></button>'; };
  const wireCards = (pg, root) => $$(".m-card", pg).forEach(c => c.onclick = () => { open = c.dataset.ref; history.pushState({ m: 1 }, ""); render(root); });
  function render(root){ const a = open && App.act(open); if (open && !a) open = null;
    const pg = shell(root); root.classList.toggle("m-in", !!a); requestAnimationFrame(() => { const t = $(".m-top", root); if (t) root.style.setProperty("--mtop", t.offsetHeight + "px"); });   // what sticks under the top row sits just below it, whatever the sizes
    if (a) return detail(pg, a);
    if (tab === "settings") return settings(pg, root);
    const pills = App.pills, all = Store.visible(), list = Table.rows(), sy = scrollY;
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
  function detail(root, a){ const s = Store.stage(a.stage), p = Store.project(a._p) || {}, skip = new Set(["title", "problem", "solution", "notes"]);
    root.innerHTML = '<div class="m-top"><button type="button" class="ic-b m-back" aria-label="Back">‹</button><span class="aid big">' + esc(Store.actId(a)) + '</span><span class="stg" style="--c:' + esc(s.color) + '">' + esc(s.name) + '</span></div>'
      + '<div class="m-det"><h2>' + esc(a.f.title || "") + '</h2><div class="dim">' + esc(p.name || "") + '</div><h4>Problem</h4><p>' + (esc(a.f.problem) || '<span class="dim">–</span>') + '</p><h4>Solution</h4><p>' + (esc(a.f.solution) || '<span class="dim">–</span>') + '</p>'
      + '<h4>Photos <span class="cnt">' + (a.photos.length || "") + '</span></h4><div class="m-ph">' + (a.photos.map((ph, i) => '<img alt="" loading="lazy" data-i="' + i + '" src="' + esc(Media.src(a, ph, true)) + '">').join("") || '<span class="dim">None</span>') + '</div>'
      + (a.f.notes ? '<h4>Notes</h4><p>' + esc(a.f.notes) + '</p>' : "")
      + (a.files.length ? '<h4>Attachments</h4>' + a.files.map((f, i) => '<button type="button" class="link m-f" data-i="' + i + '">📎 ' + esc(f.name) + '</button>').join("") : "")
      + '<h4>Details</h4><dl>' + Store.fields().filter(f => !skip.has(f.id)).map(f => '<dt>' + esc(f.label) + '</dt><dd>' + (Fields.show(a, f) || '<span class="dim">–</span>') + '</dd>').join("") + '</dl></div>';
    $(".m-back", root).onclick = () => history.back();
    $$(".m-ph img", root).forEach(im => im.onclick = () => { history.pushState({ m: 2 }, ""); Media.view(a, +im.dataset.i); });
    $$(".m-f", root).forEach(b => b.onclick = () => Media.openFile(a, a.files[+b.dataset.i])); scrollTo(0, 0); }
  addEventListener("popstate", () => { if (Media.open){ Media.close(); return; } if (open){ open = null; App.render(); } });
  return { render, show: ref => { open = ref; history.pushState({ m: 1 }, ""); } };
})();
