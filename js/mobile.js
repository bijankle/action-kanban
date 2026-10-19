/* Phone view: look only. Filter pills by stage, a search box, a card per action; tap one for its problem,
   solution, photos (tap for full screen, swipe between them) and details. */
"use strict";
const Mobile = (() => {
  let open = null;
  function render(root){ const a = open && App.act(open);
    if (a) return detail(root, a);
    const q = (App.q || "").trim().toLowerCase(), fs = Store.fields(), pills = App.pills, all = Store.visible();
    const list = Table.rows();
    const sy = $(".m-list", root) ? $(".m-list", root).scrollTop : 0;
    root.innerHTML = '<div class="m-top">' + LOGO(34) + '<div class="m-pj"></div><input class="in m-q" type="search" placeholder="Search" value="' + esc(App.q || "") + '"></div>'
      + '<div class="m-pills"><button type="button" class="pill' + (!pills.size ? " on" : "") + '" data-s="">All <b>' + all.length + '</b></button>' + Store.stages().map(s => '<button type="button" class="pill' + (pills.has(s.id) ? " on" : "") + '" data-s="' + s.id + '" style="--c:' + esc(s.color) + '"><i class="dot"></i>' + esc(s.name) + ' <b>' + all.filter(a => a.stage === s.id).length + '</b></button>').join("") + '</div>'
      + '<div class="m-list">' + (list.length ? list.map(a => { const s = Store.stage(a.stage), p = Store.project(a._p) || {};
        return '<button type="button" class="m-card" data-ref="' + a._p + ":" + a.u + '" style="--c:' + esc(s.color) + '">' + (a.photos[0] ? '<img alt="" loading="lazy" src="' + esc(Media.src(a, a.photos[0], true)) + '">' : "")
          + '<span class="m-c1"><span class="aid">' + esc(Store.actId(a)) + '</span><span class="stg">' + esc(s.name) + '</span></span><span class="m-t">' + esc(a.f.title || "") + '</span><span class="m-c2">' + (Store.selected().length > 1 ? esc(p.name) + " · " : "") + (a.photos.length ? "📷 " + a.photos.length : "") + (a.f.eta ? '  <span class="' + (a.f.eta === "TBC" ? "tbc" : "") + '">ETA ' + esc(fmtDate(a.f.eta)) + '</span>' : "") + '</span></button>'; }).join("") : '<div class="empty">No actions match.</div>') + '</div>';
    $(".m-list", root).scrollTop = sy;
    $(".m-top .logo", root).onclick = () => { App.q = ""; pills.clear(); render(root); $(".m-list", root).scrollTop = 0; };   // the logo goes home: every action, from the top
    App.projBox($(".m-pj", root));
    const qi = $(".m-q", root); qi.oninput = debounce(() => { App.q = qi.value; render(root); const n = $(".m-q", root); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250);
    $$(".pill", root).forEach(b => b.onclick = () => { const s = b.dataset.s; if (!s) pills.clear(); else if (pills.has(s)) pills.delete(s); else { pills.clear(); pills.add(s); } render(root); });
    $$(".m-card", root).forEach(c => c.onclick = () => { open = c.dataset.ref; history.pushState({ m: 1 }, ""); render(root); }); }
  function detail(root, a){ const s = Store.stage(a.stage), p = Store.project(a._p) || {}, skip = new Set(["title", "problem", "solution", "notes"]);
    root.innerHTML = '<div class="m-top"><button type="button" class="ic-b m-back" aria-label="Back">‹</button><span class="aid big">' + esc(Store.actId(a)) + '</span><span class="stg" style="--c:' + esc(s.color) + '">' + esc(s.name) + '</span></div>'
      + '<div class="m-det"><h2>' + esc(a.f.title || "") + '</h2><div class="dim">' + esc(p.name || "") + '</div><h4>Problem</h4><p>' + (esc(a.f.problem) || '<span class="dim">–</span>') + '</p><h4>Solution</h4><p>' + (esc(a.f.solution) || '<span class="dim">–</span>') + '</p>'
      + '<h4>Photos <span class="cnt">' + (a.photos.length || "") + '</span></h4><div class="m-ph">' + (a.photos.map((ph, i) => '<img alt="" loading="lazy" data-i="' + i + '" src="' + esc(Media.src(a, ph, true)) + '">').join("") || '<span class="dim">None</span>') + '</div>'
      + (a.f.notes ? '<h4>Notes</h4><p>' + esc(a.f.notes) + '</p>' : "")
      + (a.files.length ? '<h4>Attachments</h4>' + a.files.map((f, i) => '<button type="button" class="link m-f" data-i="' + i + '">📎 ' + esc(f.name) + '</button>').join("") : "")
      + '<h4>Details</h4><dl>' + Store.fields().filter(f => !skip.has(f.id)).map(f => '<dt>' + esc(f.label) + '</dt><dd>' + (Fields.show(a, f) || '<span class="dim">–</span>') + '</dd>').join("") + '</dl></div>';
    $(".m-back", root).onclick = () => history.back();
    $$(".m-ph img", root).forEach(im => im.onclick = () => { history.pushState({ m: 2 }, ""); Media.view(a, +im.dataset.i); });
    $$(".m-f", root).forEach(b => b.onclick = () => Media.openFile(a, a.files[+b.dataset.i])); root.scrollTop = 0; }
  addEventListener("popstate", () => { if (Media.open){ Media.close(); return; } if (open){ open = null; App.render(); } });
  return { render, show: ref => { open = ref; history.pushState({ m: 1 }, ""); } };
})();
