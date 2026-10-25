/* Start up, the header (menus, project box, tabs, save light), settings and keyboard shortcuts. */
"use strict";
const APP_VERSION = "1.10.26";
const LOGO = (s, c) => '<svg class="logo" width="' + s + '" height="' + s + '" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="18" fill="' + (c || "var(--thb)") + '"/><rect x="6" y="6" width="52" height="52" rx="13" fill="none" stroke="#fff" stroke-width="2.5"/><text x="29" y="46" text-anchor="middle" font-family="system-ui,Segoe UI,Arial,sans-serif" font-weight="800" font-size="38" fill="#fff">A</text><g transform="translate(46 19)" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><line x1="0" y1="-5.5" x2="0" y2="5.5"/><line x1="-4.8" y1="-2.75" x2="4.8" y2="2.75"/><line x1="-4.8" y1="2.75" x2="4.8" y2="-2.75"/></g></svg>';
/* fonts to pick from (View): the default, then web fonts loaded only when picked */
const FONTS = [["default", "Default", "'Aptos',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif"], ["inter", "Inter", "'Inter',system-ui,sans-serif", "Inter:wght@400;500;600;700;800"], ["roboto", "Roboto", "'Roboto',system-ui,sans-serif", "Roboto:wght@400;500;700;900"],
  ["plex", "IBM Plex Sans", "'IBM Plex Sans',system-ui,sans-serif", "IBM+Plex+Sans:wght@400;500;600;700"], ["atkinson", "Atkinson (easy read)", "'Atkinson Hyperlegible',system-ui,sans-serif", "Atkinson+Hyperlegible:wght@400;700"]];
const THEMES = [["slate", "Slate", "#475569"], ["graphite", "Graphite", "#52525b"], ["navy", "Navy", "#1E3A5F"], ["petrol", "Petrol", "#1F4F5A"], ["olive", "Olive", "#5A5A2E"], ["stone", "Stone", "#7A6A5D"], ["rust", "Rust", "#9A3412"], ["ink", "Ink", "#111827"]];

const App = (() => {
  const A = { q: "", pills: new Set(lsGet("adPills", [])), sort: null, selRef: null, tab: ["actions", "kanban", "contacts", "valid"].includes(lsGet("adTab", "actions")) ? lsGet("adTab", "actions") : "actions", sub: "overview", view: lsGet("adViewType", "list"), mobile: false };
  /* (a deleted action is found too: it can be opened from the Deleted pill, and brought back) */
  const act = ref => { if (!ref) return null; const [pid, u] = ref.split(":"); const a = Store.find(pid, u); if (!a) return null; a._p = pid; return a; };
  let raf = 0; const render = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
  function draw(){ if (!Store.S.config) return; document.body.classList.toggle("ro", !Store.S.edit);
    if (A.selRef && !act(A.selRef)) A.selRef = null;
    if (A.mobile){ Mobile.render($("#mobile")); return; }
    projBox($("#pjBox")); renderStatus(); $$(".tab").forEach(t => t.classList.toggle("on", t.dataset.t === A.tab));
    /* the search box sits in the same place on every tab; the rest of the bar only where it applies */
    /* the list (Actions table or Organizer) stays on the left; the open action is in the panel on the right (or, with the
       panel switched off in View, in a pop up over the list) */
    const sideTab = A.tab === "actions" || A.tab === "kanban", panel = A.tab === "actions" && lsGet("adPanel", true),   /* (the Organizer has no Details panel: a card opens as a pop up) */ sel = sideTab && !!act(A.selRef), inAct = false, list = A.tab === "actions";
    $$("#xlsB,#printB,#pasteB").forEach(b => b.hidden = !(list || A.tab === "kanban")); $("#newB").hidden = A.tab === "valid" || A.tab === "contacts";
    $("#q").placeholder = inAct ? "Search actions (back to the list)" : { actions: "Search actions", kanban: "Search, filters every stage", contacts: "Search people, companies, numbers", valid: "Search fields and stages" }[A.tab] || "Search";
    if ($("#q").value !== A.q) $("#q").value = A.q; panels(sideTab, panel); $("#undoB").disabled = !Store.S.undo.length; $("#redoB").disabled = !Store.S.redo.length;
    const v = $("#view"); v.dataset.tab = A.tab;
    v.classList.toggle("in-act", inAct);
    if (A.tab !== "actions") Table.forget();
    if (A.tab === "kanban") Kanban.render(v); else if (A.tab === "contacts") Contacts.render(v); else if (A.tab === "valid") Valid.render(v); else Table.render(v);
    const side = $("#side"), sb = $("#sideBody"); side.hidden = $("#split").hidden = !panel;
    if (panel){ if (sel) ActionView.render(sb); else sb.innerHTML = '<div class="side-0"><b>No action open</b><span class="dim">Click an action ' + (A.tab === "kanban" ? "card" : "in the list") + ' to see it here.' + tipI("Drag the line on the left to make this panel wider or narrower.") + '</span></div>'; }
    popup(!panel && sel);
    $$("#vt button").forEach(b => b.classList.toggle("on", b.dataset.v === A.view)); $("#sizeB").hidden = !list || A.view !== "tiles"; $("#vt").hidden = !list; $("#colB").hidden = !list || A.view !== "list";
    lsSet("adPills", [...A.pills]); Hold.after(); }
  /* the Filters panel (left) and the Details panel (right): each one's header is its show and hide button; a hidden
     panel's header waits at its end of the list's header row, beside what's filtering. With Details hidden an action
     opens as a pop up. The search box sits in the Filters panel, or in the list's header row while that's hidden. */
  function panels(sideTab, panel){ const fopen = sideTab && lsGet("adFpanel", true), fp = $("#fpanel"), q = $(".hsearch");
    fp.hidden = $("#splitL").hidden = !fopen;
    const phL = $("#phL"), phR = $("#phR"), n = Filters.count();
    (fopen ? $("#hxL") : $("#slotL")).appendChild(phL); phL.hidden = !sideTab; phL.setAttribute("aria-expanded", fopen); $(".chev", phL).textContent = fopen ? "‹" : "›"; phL.title = fopen ? "Hide the filters" : "Show the filters";
    const c = $(".cnt", phL); c.textContent = n; c.hidden = !n;
    const qHome = fopen ? $("#fbody") : $("#slotL"); if (q.parentNode !== qHome){ const had = document.activeElement === $("#q"); qHome.insertBefore(q, qHome === $("#fbody") ? qHome.firstChild : null); if (had) $("#q").focus(); }
    (panel ? $("#hxR") : $("#slotR")).appendChild(phR); phR.hidden = A.tab !== "actions"; phR.setAttribute("aria-expanded", !!panel); $(".chev", phR).textContent = panel ? "›" : "‹"; phR.title = panel ? "Hide the details. Actions then open as a pop up" : "Show the details panel";
    if (fopen) Filters.render($("#fbody"));
    const ac = $("#achips"); ac.hidden = !sideTab; if (sideTab){ const all = Store.visible(); ac.innerHTML = Filters.chipsHtml(Filters.apply(all).length, all.length); Filters.wireChips(ac); } }
  function pills(){ const all = Store.visible(), el = $("#pills");
    el.innerHTML = '<button type="button" class="pill' + (!A.pills.size ? " on" : "") + '" data-s="">All <b>' + all.length + '</b></button>' + Store.stages().map(s => '<button type="button" class="pill' + (A.pills.has(s.id) ? " on" : "") + '" data-s="' + s.id + '" style="--c:' + esc(s.color) + '" title="Click to show only this stage, Ctrl+click to add it"><i class="dot"></i>' + esc(s.name) + ' <b>' + all.filter(a => a.stage === s.id).length + '</b></button>').join("");
    $$(".pill", el).forEach(b => b.onclick = e => { const s = b.dataset.s; if (!s) A.pills.clear(); else if (e.ctrlKey || e.metaKey){ A.pills.has(s) ? A.pills.delete(s) : A.pills.add(s); } else if (A.pills.size === 1 && A.pills.has(s)) A.pills.clear(); else { A.pills.clear(); A.pills.add(s); } render(); }); }
  function renderStatus(){ const s = $("#status"); if (!s) return; const S = Store.S; let cls, t;
    if (!S.edit){ cls = "ro"; t = GH.cfg().token ? "View only (key can't write)" : "View only"; }
    else if (S.status === "saving") { cls = "busy"; t = "Saving…"; }
    else if (S.status === "error"){ cls = "bad"; t = "Not saved: " + (S.statusMsg || "retrying"); }
    else if (S.dirty.size || S.blobs.length){ cls = "busy"; t = "Unsaved changes"; }
    else { cls = "ok"; t = "Saved"; }
    s.className = "status " + cls; s.innerHTML = '<i></i><span>' + esc(t) + '</span>';
    const lf = Local.state(); $("#folderB").hidden = !(S.edit && (lf === "locked" || lf === "none")); $("#folderB").textContent = lf === "locked" ? "Reconnect folder" : "Local folder"; }
  /* an action in a pop up over the list (when the side panel is switched off in View) */
  let popEl = null;
  function popup(on){ if (!on){ if (popEl){ popEl.remove(); popEl = null; } return; }
    if (!popEl){ popEl = h('<div class="apop"><div class="apop-w"></div></div>'); document.body.appendChild(popEl); popEl.addEventListener("mousedown", e => { if (e.target === popEl) select(null); }); }
    ActionView.render($(".apop-w", popEl)); }
  /* the side panel's width: drag the line between the list and the panel (kept on this computer) */
  function splitterL(){ const sp = $("#splitL"), m = $("#main"); const w0 = lsGet("adFpW", 0); if (w0) m.style.setProperty("--fp-w", w0 + "px");
    sp.onpointerdown = e => { e.preventDefault(); sp.setPointerCapture(e.pointerId); document.body.classList.add("resizing");
      sp.onpointermove = ev => { const r = m.getBoundingClientRect(), w = Math.max(170, Math.min(420, ev.clientX - r.left)); m.style.setProperty("--fp-w", w + "px"); };
      sp.onpointerup = () => { sp.onpointermove = null; document.body.classList.remove("resizing"); const w = parseFloat(getComputedStyle(m).getPropertyValue("--fp-w")); if (w) lsSet("adFpW", Math.round(w)); }; };
    sp.ondblclick = () => { lsSet("adFpW", null); m.style.removeProperty("--fp-w"); };
    $("#phL").onclick = () => { lsSet("adFpanel", !lsGet("adFpanel", true)); render(); };
    $("#phR").onclick = () => { const open = !lsGet("adPanel", true); lsSet("adPanel", open); if (!open) A.selRef = null; render(); };   // (hiding it closes the open action; the next one opens as a pop up)
    /* the list's height follows the toolbar's */
    if (window.ResizeObserver) new ResizeObserver(() => document.documentElement.style.setProperty("--tools-h", $("#tools").offsetHeight + "px")).observe($("#tools")); }
  function splitter(){ const sp = $("#split"), m = $("#main"); sp.onpointerdown = e => { e.preventDefault(); sp.setPointerCapture(e.pointerId); document.body.classList.add("resizing");
      sp.onpointermove = ev => { const r = m.getBoundingClientRect(), w = Math.max(360, Math.min(r.width - 320, r.right - ev.clientX)); m.style.setProperty("--side-w", w + "px"); };
      sp.onpointerup = () => { sp.onpointermove = null; document.body.classList.remove("resizing"); const w = parseFloat(getComputedStyle(m).getPropertyValue("--side-w")); if (w) lsSet("adSideW", Math.round(w)); }; };
    sp.ondblclick = () => { lsSet("adSideW", null); m.style.removeProperty("--side-w"); }; }
  /* open an action (in the side panel or pop up), or close it with null; the list and its tab stay as they are */
  const select = (ref, sub) => { if (ref !== A.selRef || sub) A.sub = sub || "overview"; if (ref){ if (A.tab !== "kanban" && A.tab !== "actions"){ A.tab = "actions"; lsSet("adTab", "actions"); } A.last = ref; } A.selRef = ref; if (ref) history.replaceState(null, "", "?a=" + encodeURIComponent(ref.split(":")[0] + ":" + (act(ref) || {}).no)); else history.replaceState(null, "", location.pathname); render(); };
  /* the MTO link in the table (or the action view or a callout): that action, on its MTO, Spares or Isolations tab */
  const openParts = (ref, kind) => select(ref, kind);
  document.addEventListener("click", e => { const l = e.target.closest(".av [data-parts], .kcall [data-parts]"); if (l){ e.preventDefault(); Fields.closePop(); openParts(l.dataset.ref, l.dataset.parts); } });
  const viewOnly = () => note(GH.cfg().token ? "This GitHub key can't save to " + GH.cfg().repo + ". View only." : "View only. Add your GitHub key in File, Settings to make changes.", 4500);
  function newAction(stageId){ Intake.open(stageId); }

  /* ---------- project box: tick one or several projects ---------- */
  const TICK = '<svg viewBox="1.4 2 9.2 8.2" width="12" height="12" aria-hidden="true"><path d="M2.4 6.3 5 8.8 9.8 3.4" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function projBox(el){ const ps = Store.projects(), sel = Store.selected();
    const label = !ps.length ? "No projects" : sel.length === ps.length && ps.length > 1 ? "All" : sel.length === 1 ? (Store.project(sel[0]) || {}).name : sel.length + " projects";
    el.innerHTML = '<div class="pj"><button type="button" class="pj-b" title="Projects on show"><svg class="pj-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/></svg><b class="pj-v">' + esc(label) + '</b><span class="car">▾</span></button></div>';
    $(".pj-b", el).onclick = e => { e.stopPropagation(); if ($(".pj-m")) return $(".pj-m").remove(); const m = h('<div class="pj-m pop"></div>'); document.body.appendChild(m); Fields.place(m, el); drawM(m); }; }
  function drawM(m){ const ps = Store.projects(), sel = Store.selected(), allOn = sel.length === ps.length;
    m.innerHTML = ps.map(p => '<button type="button" class="pj-o' + (sel.includes(p.id) ? " on" : "") + '" data-id="' + p.id + '"><i class="pdot" style="--c:' + esc(p.color || "#64748b") + '"></i><span>' + esc(p.name) + '</span><span class="dim">' + Store.actsOf(p.id).length + '</span><i class="tk">' + (sel.includes(p.id) ? TICK : "") + '</i></button>').join("")
      + (ps.length > 1 ? '<button type="button" class="pj-o pj-all' + (allOn ? " on" : "") + '" data-id="*"><span>All</span><i class="tk">' + (allOn ? TICK : "") + '</i></button>' : "")
      + '<button type="button" class="pj-o pj-more" data-id="+"><span>All projects…</span></button>';
    $$(".pj-o", m).forEach(o => o.onclick = e => { e.stopPropagation(); const id = o.dataset.id;
      if (id === "+"){ m.remove(); return projectsWin(); }
      let s = Store.selected(); if (id === "*") s = ps.map(p => p.id); else s = s.includes(id) ? s.filter(x => x !== id) : s.concat(id);
      if (!s.length){ o.classList.remove("shake"); void o.offsetWidth; o.classList.add("shake"); return; }   // one stays ticked
      Store.setSelected(s); drawM(m); render(); }); }
  function projectsWin(){ const edit = Store.S.edit;
    const m = modal('<h3>Projects</h3><div class="pj-list"></div><div class="yn-btns">' + (edit ? '<button class="yn-no" type="button" data-k="new">New project…</button>' : "") + '<button class="yn-yes" type="button" data-k="x">Close</button></div>', { cls: "pj-win" });
    const draw = () => { const ps = Store.projects(), sel = Store.selected();
      $(".pj-list", m).innerHTML = ps.length ? ps.map(p => '<div class="pj-row' + (sel.includes(p.id) ? " on" : "") + '" data-id="' + p.id + '"><i class="pdot" style="--c:' + esc(p.color || "#64748b") + '"></i><div class="pj-name">' + esc(p.name) + ' <span class="dim">' + esc(p.prefix) + ' · ' + Store.actsOf(p.id).length + ' actions</span></div>' + (edit ? '<button type="button" data-k="ren">Edit</button>' : "") + '<button type="button" data-k="link">Copy link</button></div>').join("") : '<div class="dim">No projects yet.' + (edit ? " Click New project." : "") + '</div>';
      $$(".pj-row", m).forEach(r => { const id = r.dataset.id;
        r.onclick = e => { if (e.target.closest("button")) return; Store.setSelected([id]); m.close(); render(); };
        $("[data-k=link]", r).onclick = () => { const l = GH.appUrl() + "?p=" + encodeURIComponent(id); navigator.clipboard.writeText(l).then(() => note("Link copied. Anyone with it can view this project."), () => prompt("Copy this link:", l)); };
        const rn = $("[data-k=ren]", r); if (rn) rn.onclick = () => editProject(Store.project(id), draw); }); };
    draw(); $("[data-k=x]", m).onclick = () => m.close(); const nb = $("[data-k=new]", m); if (nb) nb.onclick = () => editProject(null, draw); }
  const prefixOf = n => (String(n).replace(/[^A-Za-z]/g, "").slice(0, 3) || "ACT").toUpperCase();
  function editProject(p, after){ const isNew = !p; p = p || { name: "", prefix: "", color: ["#475569", "#9A3412", "#1F4F5A", "#5A5A2E", "#1E3A5F", "#7A6A5D"][Store.projects().length % 6] };
    const m = modal('<h3>' + (isNew ? "New project" : "Edit project") + '</h3><label class="fl">Name<input class="in" data-k="name" value="' + esc(p.name) + '"></label><label class="fl"><span class="fl-h">ID prefix' + tipI("The action IDs read PREFIX-0001.") + '</span>' + '<input class="in" data-k="prefix" maxlength="6" value="' + esc(p.prefix) + '"></label><label class="fl in-row">Colour <input type="color" data-k="color" value="' + esc(p.color) + '"></label>'
      + '<div class="yn-btns">' + (isNew ? "" : '<button class="yn-no danger-t" type="button" data-k="del">Delete</button><span class="grow"></span>') + '<button class="yn-no" type="button" data-k="x">Cancel</button><button class="yn-yes" type="button" data-k="ok">' + (isNew ? "Create" : "Save") + '</button></div>');
    const n = $("[data-k=name]", m), px = $("[data-k=prefix]", m); n.focus(); let auto = isNew; n.oninput = () => { if (auto) px.value = prefixOf(n.value); }; px.oninput = () => auto = false;
    $("[data-k=x]", m).onclick = () => m.close();
    $("[data-k=ok]", m).onclick = () => { const name = n.value.trim(); if (!name) return n.focus(); const pre = (px.value.trim() || prefixOf(name)).toUpperCase().replace(/[^A-Z0-9]/g, ""), col = $("[data-k=color]", m).value;
      if (isNew){ const id = slug(name) + "-" + uid().slice(-4); Store.mutate("projects", () => { Store.S.projects.projects.push(Store.touch({ id, name, prefix: pre, color: col, created: now() })); Store.S.acts[id] = { v: 1, nextNo: 1, actions: [] }; Store.S.dirty.add("a:" + id); Store.setSelected(Store.selected().concat(id)); }); Store.log("Created project " + name); }
      else Store.mutate("projects", () => { Object.assign(p, { name, prefix: pre, color: col }); Store.touch(p); });
      m.close(); after && after(); };
    const d = $("[data-k=del]", m); if (d) d.onclick = async () => { const c = Store.actsOf(p.id).length; if (!await confirmBox("Delete the project “" + p.name + "”" + (c ? " and its " + c + " actions" : "") + "? You can undo with Ctrl+Z.", "Delete", true)) return;
      Store.mutate("projects", () => { p.del = true; Store.touch(p); }); m.close(); after && after(); }; }

  /* ---------- settings and first time setup ---------- */
  function settings(first){ const c = GH.cfg(), lf = Local.state();
    const m = modal('<h3>' + (first ? "Welcome to Action Database" : "Settings") + '</h3>' + (first ? '<p class="dim">Set this computer up once.' + tipI("You can change any of it later in File, Settings.") + '</p>' : "")
      + '<div class="fl"><span class="fl-h">Your profile' + tipI("Signs your edits, prints, workpacks and RFQs.") + '</span>' + '<div class="in-row"><b class="pfn">' + esc(Profile.name() || "Not set") + '</b><span class="dim">' + esc(Profile.get().role) + '</span><span class="grow"></span><button type="button" class="btn ghost sm" data-k="prof">Edit profile…</button></div></div>'
      + (GH.relay() ? '<div class="fl"><span class="fl-h">Saving' + tipI("Through the team's save server: anyone signed in can edit, no GitHub key needed.") + '</span>' + '</div>' : "")
      + '<details class="fl adv"' + (GH.relay() ? "" : " open") + '><summary>' + (GH.relay() ? "Advanced: save server address, GitHub key" : "Save server or GitHub key") + '</summary>'
      + '<label class="fl"><span class="fl-h">Save server' + tipI("The team relay's address. With it nobody needs a GitHub key.") + '</span>' + '<input class="in" data-k="relay" autocomplete="off" spellcheck="false" value="' + esc(lsGet("adRelay", "")) + '" placeholder="' + esc(GH.relay() || "https://….workers.dev") + '"></label>'
      + '<label class="fl"><span class="fl-h">GitHub key' + tipI("Only without a save server: needed to edit, else the app is view only.") + '</span>' + '<input class="in secret" data-k="key" autocomplete="off" spellcheck="false" value="' + esc(c.token) + '" placeholder="github_pat_…"></label><div class="dim sm-t">Make one at <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com, Settings, Developer settings, Fine grained tokens</a>: Repository access “Only select repositories”, pick the data repository <b>' + esc(c.repo) + '</b>, then Permissions, Contents, Read and write. It stays on this computer only. <span class="ks"></span></div>'
      + '</details>'
      + '<label class="fl"><span class="fl-h">Data repository' + tipI("Where the actions and photos are saved.") + '</span>' + '<input class="in" data-k="repo" value="' + esc(c.repo) + '"></label>'
      + '<div class="fl"><span class="fl-h">Local folder' + tipI("Full quality photos and a backup of the data are saved here.") + '</span>' + '<div class="in-row"><b class="lfn">' + esc(Local.name() || (lf === "unsupported" ? "Needs Chrome or Edge" : "Not chosen")) + '</b>' + (lf === "locked" ? ' <span class="dim">(click Reconnect)</span>' : "") + '<span class="grow"></span>' + (Local.supported ? '<button type="button" class="btn ghost sm" data-k="pick">' + (lf === "locked" ? "Reconnect" : "Choose folder…") + '</button>' : "") + '</div></div>'
      + '<label class="fl"><span class="fl-h">Google Gemini key <span class="dim">optional</span>' + tipI("For turning pasted text into an action. Free from aistudio.google.com.") + '</span>' + '<input class="in secret" data-k="gem" autocomplete="off" spellcheck="false" value="' + esc(lsGet("adGemKey", "")) + '" placeholder="Free from aistudio.google.com"></label>'
      + '<div class="fl"><span class="fl-h">Photo quality online' + tipI("The original is always kept in the local folder.") + '</span>' + '<div class="seg" data-k="q">' + [["low", "Low, 1024 px"], ["medium", "Medium, 1600 px"]].map(([k, n]) => '<button type="button" data-v="' + k + '"' + ((Store.S.config && Store.S.config.quality || "medium") === k ? ' class="on"' : "") + '>' + n + '</button>').join("") + '</div></div>'
      + (first ? "" : '<div class="fl"><span class="fl-h">Cutting lists' + tipI("For the MTO pieces: the saw cut between pieces, and the shortest offcut worth keeping. The same for everyone.") + '</span>' + '<div class="in-row"><label class="dim">Saw cut <input class="in sm-n" data-k="kerf" inputmode="decimal" value="' + esc(((Store.S.config || {}).cut || {}).kerf ?? 3) + '"> mm</label><label class="dim">Keep offcuts from <input class="in sm-n" data-k="keep" inputmode="decimal" value="' + esc(((Store.S.config || {}).cut || {}).keep ?? 300) + '"> mm</label></div></div>')
      + '<div class="yn-btns">' + (first ? '<button class="yn-no" type="button" data-k="x">Skip for now</button>' : '<button class="yn-no" type="button" data-k="x">Cancel</button>') + '<button class="yn-yes" type="button" data-k="ok">' + (first ? "Finish" : "Save") + '</button></div>', { cls: "set-win", sticky: first });
    const ks = $(".ks", m); const check = async () => { const k = $("[data-k=key]", m).value.trim(); if (!k){ ks.textContent = ""; return; } ks.textContent = "Checking…";
      const old = lsGet("adGhKey", ""), oldR = lsGet("adRepo2", ""); lsSet("adGhKey", k); lsSet("adRepo2", $("[data-k=repo]", m).value.trim()); GH.reset(); const ok = await GH.canEdit(); lsSet("adGhKey", old); lsSet("adRepo2", oldR); GH.reset();
      ks.innerHTML = ok ? '<b class="good">✓ This key can edit.</b>' : ok === null ? "Couldn't check (offline?)" : '<b class="bad">This key can\'t write to that repository.</b>'; };
    $("[data-k=key]", m).onchange = check; if (c.token) check();
    $$("[data-k=q] button", m).forEach(b => b.onclick = () => { $$("[data-k=q] button", m).forEach(x => x.classList.toggle("on", x === b)); });
    const pk = $("[data-k=pick]", m); if (pk) pk.onclick = async () => { if (await (Local.state() === "locked" ? Local.reconnect() : Local.pick())){ $(".lfn", m).textContent = Local.name(); pk.textContent = "Change folder…"; } };
    $("[data-k=x]", m).onclick = () => { lsSet("adSetup", 1); m.close(); };
    $("[data-k=prof]", m).onclick = () => profile(() => { $(".pfn", m).textContent = Profile.name() || "Not set"; });
    $("[data-k=ok]", m).onclick = async () => { lsSet("adGhKey", $("[data-k=key]", m).value.trim()); lsSet("adRelay", $("[data-k=relay]", m).value.trim()); lsSet("adRepo2", $("[data-k=repo]", m).value.trim() === GH.DATA_REPO ? "" : $("[data-k=repo]", m).value.trim()); lsSet("adGemKey", $("[data-k=gem]", m).value.trim()); lsSet("adSetup", 1);
      const q = ($("[data-k=q] .on", m) || {}).dataset, kf = $("[data-k=kerf]", m), kp = $("[data-k=keep]", m), cut = kf && kf.value.trim() !== "" && +kf.value >= 0 && +kp.value >= 0 ? { kerf: +kf.value, keep: +kp.value } : null; m.close(); GH.reset(); await checkEdit();
      if (q && Store.S.config && q.v !== (Store.S.config.quality || "medium") && Store.S.edit) Store.mutate("config", () => { Store.S.config.quality = q.v; Store.S.config.mod = now(); });
      const ck = cut && Store.S.config && Store.S.edit && Object.assign({ kerf: 3, keep: 300 }, Store.S.config.cut || {}); if (ck && (cut.kerf !== ck.kerf || cut.keep !== ck.keep)) Store.mutate("config", () => { Store.S.config.cut = cut; Store.S.config.mod = now(); });
      reload(); }; }
  /* the profile window, from the round button top right */
  function profile(after){ const p = Profile.get(), F = (k, l, t, ph) => '<label class="fl">' + l + '<input class="in" data-k="' + k + '" type="' + (t || "text") + '" value="' + esc(p[k]) + '"' + (ph ? ' placeholder="' + ph + '"' : "") + '></label>';
    const m = modal('<h3>Your profile' + tipI("Goes on the workpacks and RFQs you export, so people know who to contact with any queries. Everyone signed in can see it.") + '</h3><div class="pf-g">' + F("first", "First name") + F("last", "Last name") + '</div>'
      + '<div class="pf-g">' + F("role", "Role", "text", "e.g. Maintenance Engineer") + F("company", "Company", "text", "e.g. KCGM") + '</div>' + '<div class="pf-g">' + F("mobile", "Mobile", "tel") + F("email", "Email", "email") + '</div><div class="yn-btns"><button class="yn-no" type="button">Cancel</button><button class="yn-yes" type="button">Save</button></div>', { cls: "pf-win" });
    $("[data-k=first]", m).focus(); $(".yn-no", m).onclick = () => m.close();
    $(".yn-yes", m).onclick = () => { const o = {}; $$("[data-k]", m).forEach(i => o[i.dataset.k] = i.value.trim());
      if (!o.first || !/^\S+@\S+\.\S+$/.test(o.email)) return note("First name and a valid email are needed");
      Profile.set(o); lsSet("adUser", o.email.toLowerCase()); Store.saveUser(o); m.close(); drawProf(); note("Profile saved"); after && after(); };
    $$("input", m).forEach(i => i.onkeydown = e => { if (e.key === "Enter") $(".yn-yes", m).click(); }); }
  /* sign in: your email finds your profile; a new email asks for your details and makes your account.
     (It names people on edits, warnings and exports. Saving still needs a GitHub key.) */
  /* sign in: email, then your password; the first time, your details and a password (and the team code). The account
     lives with the data (users.json, and keys.json for the passwords, Keys), or on the save server if there is one,
     so any computer remembers you. Signing in is also what lets this computer save. */
  function signIn(after){ if (GH.site()){ location.href = "/login"; return; } if ($(".si-win")) return; let step = "email", kind = "", known = null; const R = !!GH.relay();
    const m = modal('<div class="si-logo">' + LOGO(46) + '</div><h3>Sign in to Action Database</h3><p class="dim si-msg"></p><div class="si-body"></div><p class="bad si-err" hidden></p><div class="yn-btns"><button class="yn-yes" type="button">Next</button></div>', { cls: "si-win", sticky: true });
    const body = $(".si-body", m), go = $(".yn-yes", m), err = $(".si-err", m), msg = $(".si-msg", m);
    const F = (k, l, t, v, ph) => '<label class="fl">' + l + '<input class="in" data-k="' + k + '" type="' + (t || "text") + '" value="' + esc(v || "") + '"' + (ph ? ' placeholder="' + ph + '"' : "") + (t === "password" ? ' autocomplete="' + (step === "pass" ? "current-password" : "new-password") + '"' : "") + '></label>';
    let email = String(Profile.get().email || lsGet("adUser", "") || "").trim().toLowerCase();
    const card = u => '<div class="si-card"><b>' + esc([u.first, u.last].join(" ")) + '</b><span>' + esc(u.role || "") + '</span><span class="dim">' + esc([u.mobile, u.email].filter(Boolean).join("   ")) + '</span></div>';
    const user = () => '<input type="text" hidden autocomplete="username" value="' + esc(email) + '">';
    const back = '<button type="button" class="link si-back">Use another email</button>';
    const details = p => '<div class="pf-g">' + F("first", "First name", "text", p.first) + F("last", "Last name", "text", p.last) + '</div>' + F("role", "Role", "text", p.role, "e.g. Maintenance Engineer") + F("mobile", "Mobile", "tel", p.mobile);
    const pwBoth = '<div class="pf-g">' + F("pw", "Password", "password", "", "8 characters or more") + F("pw2", "Password again", "password") + '</div>';
    const draw = () => { err.hidden = true; const u = Store.user(email), p = u ? { first: u.first, last: u.last, role: u.role, mobile: u.mobile } : Profile.get();
      if (step === "email"){ msg.textContent = "Enter your email. You'll then be asked for your password."; body.innerHTML = F("email", "Email", "email", email, "name@company.com"); go.textContent = "Next"; }
      else if (step === "pass"){ msg.innerHTML = "Welcome back" + (u ? "" : ", <b>" + esc(email) + "</b>") + "."; body.innerHTML = (u ? card(u) : "") + user() + F("pw", "Password", "password") + back; go.textContent = "Sign in"; }
      else if (step === "details"){ msg.textContent = "Add your details: they go on your edits and work packs."; body.innerHTML = details(p); go.textContent = "Done"; }
      else { const head = kind === "first" ? "Saving isn't set up yet. You're the first: paste the GitHub key for the data (once only), then choose your password and a team code for everyone else to join with. The key is kept with the data, locked by them, so nobody else needs it."
          : kind === "setup" ? "Choose your password, and a team code for everyone else to join with. This computer's GitHub key is then kept with the data, locked by them."
          : u ? "Accounts now have passwords. Check your details and choose one." : "<b>" + esc(email) + "</b> is new here. Add your details and choose a password.";
        msg.innerHTML = head;
        body.innerHTML = user() + details(p) + (kind === "first" ? F("key", "GitHub key", "password", "", "github_pat_...") : "") + pwBoth
          + (kind === "setup" || kind === "first" ? F("code", "Team code (you choose it, and share it with your team)", "text", "", "6 characters or more") : kind === "join" ? F("code", "Team code", "text", "", "From whoever set up the app") : "")
          + (kind === "first" || kind === "join" ? '<button type="button" class="link si-view">Continue, view only</button>' : "") + back;
        go.textContent = u ? "Set password" : "Create account"; }
      const vo = $(".si-view", m); if (vo) vo.onclick = () => { const q = { email, first: val("first"), last: val("last"), role: val("role"), mobile: val("mobile") }; if (!q.first) return fail("Add your first name"); done(q); };
      const b = $(".si-back", m); if (b) b.onclick = () => { step = "email"; draw(); };
      const f = $("input:not([type=hidden]):not([hidden])", body); f && f.focus(); $$("input", body).forEach(i => i.onkeydown = e => { if (e.key === "Enter") go.click(); }); };
    const val = k => (($("[data-k=" + k + "]", body) || {}).value || "").trim(), raw = k => ($("[data-k=" + k + "]", body) || {}).value || "", fail = t => { err.textContent = t; err.hidden = false; go.disabled = false; };
    const done = async p => { Profile.set(p); lsSet("adUser", email); m.close(); drawProf(); GH.reset(); await checkEdit(); Store.saveUser(p, true);
      note(Store.S.edit ? "Signed in as " + Profile.name() : "Signed in as " + Profile.name() + ", view only (this computer can't save)", 5000); after && after(); };
    const fromReg = () => { const u = Store.user(email); return u && u.first ? { first: u.first || "", last: u.last || "", mobile: u.mobile || "", email: u.email || email, role: u.role || "" } : null; };
    draw();
    go.onclick = async () => { go.disabled = true;
      try {
        if (step === "email"){ email = val("email").toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(email)) return fail("Enter a valid email");
          await Store.refresh(true).catch(() => {});
          if (R){ known = await GH.auth("check", { email }); step = known.exists ? "pass" : "new"; kind = known.teamCode ? "join" : ""; }
          else { await Keys.load(); const ki = Keys.info(), mine = (lsGet("adGhKey", "") || "").trim() && !lsGet("adKeyPw", null);
            step = ki.has(email) ? "pass" : "new"; kind = mine ? (ki.ready ? "add" : "setup") : ki.ready ? "join" : "first"; }
          go.disabled = false; return draw(); }
        if (step === "pass"){ const pw = raw("pw");
          if (R) await GH.auth("login", { email, password: pw }); else if (!await Keys.unlock(email, pw)) return fail("That password isn't right.");
          await Store.refresh(true).catch(() => {}); const p = fromReg(); if (p) return done(p); step = "details"; go.disabled = false; return draw(); }
        const p = { email, first: val("first"), last: val("last"), role: val("role"), mobile: val("mobile") }; if (!p.first) return fail("Add your first name");
        if (step === "new"){ const pw = raw("pw"); if (pw.length < 8) return fail("Use at least 8 characters for the password"); if (pw !== raw("pw2")) return fail("The two passwords don't match");
          if (R) await GH.auth("register", { email, password: pw, code: val("code") });
          else if (kind === "setup" || kind === "first"){ if (kind === "first"){ const k = val("key"); if (!k) return fail("Paste the GitHub key");
              go.textContent = "Checking…"; lsSet("adGhKey", k); lsSet("adKeyPw", null); GH.reset(); if (await GH.canEdit() !== true){ lsSet("adGhKey", ""); GH.reset(); return fail("That GitHub key can't save to the data. It needs Contents read and write on " + GH.DATA_REPO + "."); } }
            if (val("code").length < 6) return fail("Use at least 6 characters for the team code"); go.textContent = "Saving…"; await Keys.setup(email, pw, val("code")); }
          else if (kind === "add"){ go.textContent = "Saving…"; await Keys.addMe(email, pw); }
          else { go.textContent = "Saving…"; await Keys.join(email, pw, val("code")); } }
        done(p); }
      catch (e){ go.textContent = step === "pass" ? "Sign in" : "Create account"; fail(e.status === 401 ? "That password isn't right." : e.message || "Couldn't sign in"); } }; }
  function profMenu(btn){ Fields.closePop(); const p = Profile.get();
    const pop = h('<div class="pop profpop"><div class="pp-h"><b>' + esc(Profile.name() || "Not signed in") + '</b><span class="dim">' + esc(p.role || "") + '</span><span class="dim">' + esc(p.email || "") + '</span></div><div class="msep"></div><button type="button" class="mi" data-k="ed">Edit profile…</button>' + (GH.site() && GH.site().admin ? '<button type="button" class="mi" data-k="acc">Accounts and approvals…</button>' : "") + '<button type="button" class="mi" data-k="out">Sign out</button></div>');
    document.body.appendChild(pop); const r = btn.getBoundingClientRect(); pop.style.top = (r.bottom + 6) + "px"; pop.style.left = Math.max(8, r.right - 260) + "px";
    $("[data-k=ed]", pop).onclick = () => { Fields.closePop(); profile(); };
    const acc = $("[data-k=acc]", pop); if (acc) acc.onclick = () => { Fields.closePop(); location.href = "/admin"; };
    $("[data-k=out]", pop).onclick = async () => { Fields.closePop(); if (!await confirmBox("Sign out of Action Database on this computer?", "Sign out")) return; if (GH.site()){ location.href = "/auth/logout"; return; } lsSet("adUser", null); lsSet("adSess", null); Keys.forget(); Profile.set({}); drawProf(); GH.reset(); Store.S.edit = false; render(); signIn(); }; }

  /* ---------- two people on one action ---------- */
  const who = a => { const u = a.byE && Store.user(a.byE); return u ? [u.first, u.last].filter(Boolean).join(" ") + (u.role ? " (" + u.role + ")" : "") : a.by || "Someone"; };
  const ago = t => { const m = Math.round((now() - t) / 60000); return m < 1 ? "just now" : m < 60 ? m + " min ago" : Math.round(m / 60) + " h ago"; };
  /* someone else saved changes to actions while we were looking */
  function othersChanged(refs){ if (A.selRef && refs.includes(A.selRef)){ const a = act(A.selRef); if (a) note("⚠ " + who(a) + " just changed " + Store.actId(a) + ", which you have open. You're seeing their change.", 7000); } }
  /* our save met someone else's changes to the same action */
  function clashes(list){ const rows = list.map(c => { const a = Store.find(c.pid, c.u); if (!a) return ""; a._p = c.pid;
      const nm = (c.byE && Store.user(c.byE)) ? [Store.user(c.byE).first, Store.user(c.byE).last].join(" ") : c.by || "Someone";
      const fl = c.clash.map(k => k.startsWith("f.") ? ((Store.field(k.slice(2)) || {}).label || k.slice(2)) : ({ stage: "Status", rank: "Order in its column", photos: "Photos", files: "Attachments", mto: "MTO", spares: "Spares", isol: "Isolations", quotes: "Quotes" })[k] || k);
      return '<div class="cl-r"><b>' + esc(Store.actId(a)) + '</b> ' + esc(a.f.title || "") + '<div><b>' + esc(nm) + '</b> was editing it at the same time (' + esc(ago(c.at || now())) + ').' + (fl.length ? ' You both changed <b>' + esc(fl.join(", ")) + '</b>: your version was kept, so check it with them.' : " Both sets of changes were kept.") + '</div></div>'; }).join("");
    if (!rows) return; const m = modal('<h3>⚠ Someone else was editing at the same time</h3>' + rows + '<div class="yn-btns"><button class="yn-yes" type="button">OK</button></div>', { cls: "cl-win" }); $(".yn-yes", m).onclick = () => m.close(); }
  function drawProf(){ const b = $("#profB"); if (!b) return; const ini = Profile.initials(); b.innerHTML = ini ? '<span>' + esc(ini) + '</span>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>';
    b.title = Profile.name() ? Profile.name() + (Profile.get().role ? ", " + Profile.get().role : "") + " (edit your profile)" : "Set up your profile"; b.classList.toggle("set", !!ini); }
  async function checkEdit(){ const r = await GH.canEdit(); Store.S.edit = !A.mobile && (r === true || (r === null && !!(GH.cfg().token || (GH.relay() && Profile.name()))));
    if (!A.mobile && GH.relay() && GH.needSign() && lsGet("adUser", null)) signIn();   // (signed in before, but not on the save server here, or it ran out: sign in again)
    const pu = lsGet("adPendUser", null); if (Store.S.edit && pu){ lsSet("adPendUser", null); Store.saveUser(pu, true); } render(); }
  async function reload(){ try { if (await Store.refresh(true)) render(); } catch (e){ note("Couldn't load: " + e.message); } render(); }

  /* ---------- view settings: theme colour (presets or any colour), dark mode, text size, font ---------- */
  const viewGet = () => Object.assign({ theme: "slate", custom: "#475569", dark: false, text: 1, font: "default", btn: 1 }, lsGet("adView", {}));
  const viewSet = o => { lsSet("adView", Object.assign(viewGet(), o)); applyView(); };
  function applyView(){ const v = viewGet(), r = document.documentElement;
    r.dataset.theme = v.theme; r.classList.toggle("dark", !!v.dark); r.style.setProperty("--mt", v.text); r.style.setProperty("--bz", v.btn || 1);
    const tc = $('meta[name="theme-color"]'); if (tc) tc.content = v.dark ? "#141414" : "#ffffff";   // the phone's status bar matches the page
    const fo = FONTS.find(f => f[0] === v.font) || FONTS[0]; r.style.setProperty("--font", fo[2]);
    if (fo[3] && !document.getElementById("wf-" + fo[0])){ const l = document.createElement("link"); l.id = "wf-" + fo[0]; l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=" + fo[3] + "&display=swap"; document.head.appendChild(l); }
    if (v.theme === "custom"){ const c = v.custom; r.style.setProperty("--thb", c); r.style.setProperty("--thd", "color-mix(in srgb," + c + " 78%,#000)"); r.style.setProperty("--tht", "color-mix(in srgb," + c + " 10%,#fff)"); r.style.setProperty("--th-btn", "color-mix(in srgb," + c + " 85%,#fff)"); }
    else ["--thb", "--thd", "--tht", "--th-btn"].forEach(k => r.style.removeProperty(k));
    const fav = $('link[rel="icon"]'); if (fav){ const col = (getComputedStyle(r).getPropertyValue("--thb") || "#475569").trim(); fav.href = "data:image/svg+xml," + encodeURIComponent(LOGO(64, col.startsWith("color-mix") ? "#475569" : col).replace('class="logo" ', 'xmlns="http://www.w3.org/2000/svg" ')); } }
  function viewMenu(drop){ const v = viewGet();
    drop.innerHTML = '<div class="mi-sub">Theme colour</div><div class="thp">' + THEMES.map(([id, n, c]) => '<button type="button" data-th="' + id + '" title="' + n + '" style="--c:' + c + '"' + (v.theme === id ? ' class="on"' : "") + '></button>').join("") + '<label class="thp-c' + (v.theme === "custom" ? " on" : "") + '" title="Make your own colour"><input type="color" value="' + esc(v.custom) + '"><span>Custom</span></label></div>'
      + '<div class="mi-sub">Appearance</div><div class="mi-seg"><button type="button" data-d="0"' + (!v.dark ? ' class="on"' : "") + '>Light</button><button type="button" data-d="1"' + (v.dark ? ' class="on"' : "") + '>Dark</button></div>'
      + '<div class="mi-sub">Text size</div><div class="mi-seg">' + [[0.87, "Smaller"], [1, "Normal"], [1.13, "Larger"], [1.27, "Largest"]].map(([k, n]) => '<button type="button" data-z="' + k + '"' + (+v.text === k ? ' class="on"' : "") + '>' + n + '</button>').join("") + '</div>'
      + '<div class="mi-sub">Font</div><div class="mi-fo">' + FONTS.map(([id, n, ff]) => '<button type="button" data-fo="' + id + '" style="font-family:' + esc(ff) + '"' + (v.font === id ? ' class="on"' : "") + '>' + esc(n) + '</button>').join("") + '</div>'
      + '<div class="mi-sub">Open actions in</div><div class="mi-seg"><button type="button" data-pn="1"' + (lsGet("adPanel", true) ? ' class="on"' : "") + '>Side panel</button><button type="button" data-pn="0"' + (!lsGet("adPanel", true) ? ' class="on"' : "") + '>Pop up</button></div>'
      + '<div class="msep"></div><button type="button" class="mi" data-k="cols">Table columns…</button><button type="button" class="mi" data-k="side">Reset side panel width</button>';
    const set = o => { lsSet("adView", Object.assign(v, o)); applyView(); viewMenu(drop); };
    $$("[data-th]", drop).forEach(b => b.onclick = e => { e.stopPropagation(); set({ theme: b.dataset.th }); });
    $(".thp-c input", drop).oninput = e => { lsSet("adView", Object.assign(v, { theme: "custom", custom: e.target.value })); applyView(); };
    $(".thp-c input", drop).onchange = () => viewMenu(drop);
    $$("[data-d]", drop).forEach(b => b.onclick = e => { e.stopPropagation(); set({ dark: b.dataset.d === "1" }); });
    $$("[data-z]", drop).forEach(b => b.onclick = e => { e.stopPropagation(); set({ text: +b.dataset.z }); });
    $$("[data-fo]", drop).forEach(b => b.onclick = e => { e.stopPropagation(); set({ font: b.dataset.fo }); });
    $("[data-k=cols]", drop).onclick = () => { closeMenus(); A.tab = "actions"; lsSet("adTab", "actions"); draw(); Table.columnsPop($("#colB")); };
    $("[data-k=side]", drop).onclick = () => { lsSet("adSideW", null); $("#main").style.removeProperty("--side-w"); closeMenus(); };
    $$("[data-pn]", drop).forEach(b => b.onclick = e => { e.stopPropagation(); lsSet("adPanel", b.dataset.pn === "1"); render(); viewMenu(drop); }); }

  /* ---------- menus ---------- */
  const MENUS = {
    File: [["New action", "N", () => newAction()], ["New action from pasted text…", "", () => Intake.open(null, "")], "-", ["Projects…", "", projectsWin], ["New project…", "", () => editProject(null)], "-", ["Export to PDF or print…", "Ctrl+P", () => Print.dialog()], ["Export to Excel…", "", () => Print.excelDialog()], "-", ["Your profile…", "", () => profile()], ["Settings…", "", () => settings()]],
    Edit: [["Undo", "Ctrl+Z", () => Store.undo()], ["Redo", "Ctrl+Y", () => Store.redo()], "-", ["Delete selected action", "", () => { const a = act(A.selRef); if (a) $(".av [data-k=del]") && $(".av [data-k=del]").click(); }]],
    View: null,
    Help: [["How to use", "", guide], ["Keyboard shortcuts", "", keys], "-", ["Update app", "", update], ["About", "", about]] };
  function menus(){ const bar = $("#menubar"); bar.innerHTML = Object.keys(MENUS).map(k => '<div class="mb"><button type="button" class="mb-btn">' + k + '</button><div class="mb-drop"></div></div>').join("");
    $$(".mb", bar).forEach((mb, i) => { const k = Object.keys(MENUS)[i], drop = $(".mb-drop", mb);
      const fill = () => { if (!MENUS[k]) return viewMenu(drop); drop.innerHTML = MENUS[k].map((x, j) => x === "-" ? '<div class="msep"></div>' : '<button type="button" class="mi" data-j="' + j + '">' + esc(x[0]) + (x[1] ? '<span class="mk">' + x[1] + '</span>' : "") + '</button>').join("");
        $$(".mi", drop).forEach(b => b.onclick = () => { closeMenus(); MENUS[k][+b.dataset.j][2](); }); };
      $(".mb-btn", mb).onclick = e => { e.stopPropagation(); const was = mb.classList.contains("open"); closeMenus(); if (!was){ fill(); mb.classList.add("open"); } };
      $(".mb-btn", mb).onmouseenter = () => { if ($(".mb.open") && !mb.classList.contains("open")){ closeMenus(); fill(); mb.classList.add("open"); } };
      drop.onclick = e => e.stopPropagation(); }); }
  const closeMenus = () => $$(".mb.open").forEach(m => m.classList.remove("open"));
  document.addEventListener("click", e => { if (!e.target.closest(".mb")) closeMenus(); if (!e.target.closest(".pj-m,.pj-b")) $$(".pj-m").forEach(m => m.remove()); });

  function guide(){ const sec = (t, x) => '<h4>' + t + '</h4><p>' + x.join("</p><p>") + '</p>';
    const m = modal('<h3>How to use Action Database</h3>'
      + sec("Getting started", ["File, Settings: enter your GitHub key once to edit (without it everything is view only), choose the local folder for full quality photos, and add a Gemini key if you want pasted text turned into actions.", "The project box at the top ticks which projects show. Tick several to see all their actions together. All projects… makes, edits and shares projects."])
      + sec("Actions", ["+ New action (or N) makes one. Type it, or paste an email into the Paste text tab and Gemini fills in the fields. Fields it can't find are left empty.", "Click an action to open it. Its header has everything for that action: back to the list (Esc), previous and next (or ↑ ↓), the stage, the priority, the workpack PDF and delete. Below are its tabs: Overview, MTO, Spares and Isolations.", "Any value set to TBC shows in red. The status and priority dropdowns in the table move the card on the Organizer board too."])
      + sec("Photos and files", ["Drop photos and files onto an action's row or tile, or anywhere on the open action, or use Upload photos on its Overview. A pasted photo (Ctrl+V) waits at the bottom left until you drag it onto an action. PDFs, Excel files and anything else are kept as attachments.", "The Photos button opens a big view with thumbnails of the photos before and after. Arrows step through, ⛶ or a double click goes full screen, Esc closes.", "The ☰ and ▦ buttons switch the list between rows and tiles; Size sets the tile size."])
      + sec("Organizer", ["The board is kept simple: drag cards between stages (and up or down within one), and click a card for its problem, solution and photos. Edit on the Actions tab. Double click a stage name to rename it; drag a stage's header to move it; ⋯ for its colour, type (normal, on hold, completed) and whether it prints. + Add a stage at the end."])
      + sec("MTO and spares", ["Open an action and pick its MTO tab. Choose a type for each row (pipe, plate, UB, SHS, flanges, bolts and so on), then its standard (Australian, Chinese or international), size, material and rating; Other is a free text row for motors, bearings and vendor parts. For lengths and plate, ▸ opens the pieces the job needs: the row's quantity becomes the stock lengths or sheets to buy, packed with a saw cut between pieces (File, Settings). The i button says how a total was worked out and holds longer notes. When anything needs more than one length or sheet, the RFQ export also downloads a cutting list for the trades, and Cut list downloads it any time.", "→ Spares moves a row to its Spares tab (and → MTO moves it back), so parts coming from site spares stay off the RFQ. The MTO column in the list says how many items each action has; click it to go straight there.", "Upload quotes at the top of the MTO (several, if they get revised) and download them any time. The PDF button there exports the RFQ: each export takes the next rev letter, A, B, C…, and every rev is kept in RFQ revisions for download. XLSX exports the list to Excel. Paste text lets Gemini fill in the rows from an email or quote; you check them before they're added."])
      + sec("Isolations", ["Open an action and pick its Isolations tab; its equipment tags show above the list (click one to add it). Type an equipment number or name and pick from the suggestions (the plant equipment, valves and instruments, plus the Equipment tags list): picking fills in both. You can still edit them, which doesn't change any list. Add a note on each row. The isolations go in the workpack PDF and the print."])
      + sec("Data validation", ["Set the type of every field (text, choice, tags, date, tick box, contact…), its allowed values and colours, whether it offers TBC and N/A, and whether it's a table column. Contacts hold names, companies and mobiles; picking a name fills in the number."])
      + sec("Printing and Excel", ["File, Print: tick the stages to print (Completed starts unticked). The board prints first, then each action's details and photos. File, Export to Excel exports the table as filtered, with a Photos link that opens the photos online."])
      + '<div class="yn-btns"><button class="yn-yes" type="button">Close</button></div>', { cls: "guide-win" }); $(".yn-yes", m).onclick = () => m.close(); }
  function keys(){ const m = modal('<h3>Keyboard shortcuts</h3><table class="keys">' + [["Ctrl+Z", "Undo"], ["Ctrl+Y or Ctrl+Shift+Z", "Redo"], ["N", "New action"], ["Ctrl+V", "Paste a photo (it waits bottom left, drag it onto an action), or pasted text into a new action"], ["Ctrl+F or /", "Search"], ["Ctrl+P", "Print"], ["Esc", "Close full screen or menus, or go back from an action to the list"], ["↑ ↓", "Previous or next action, in an open action"], ["1 2 3", "Actions, Organizer, Data validation tabs"]].map(([k, d]) => '<tr><td><kbd>' + k + '</kbd></td><td>' + d + '</td></tr>').join("") + '</table><div class="yn-btns"><button class="yn-yes" type="button">Close</button></div>');
    $(".yn-yes", m).onclick = () => m.close(); }
  function about(){ const c = GH.cfg(); const m = modal('<h3>About</h3><table class="keys"><tr><td>Version</td><td>' + APP_VERSION + '</td></tr><tr><td>Data</td><td>' + esc(c.repo) + ', data folder</td></tr><tr><td>Access</td><td>' + (Store.S.edit ? "Can edit" : "View only") + '</td></tr><tr><td>Local folder</td><td>' + esc(Local.name() || "None") + '</td></tr><tr><td>Projects</td><td>' + Store.projects().length + ', ' + Store.all().length + ' actions</td></tr></table><div class="yn-btns"><button class="yn-yes" type="button">Close</button></div>');
    $(".yn-yes", m).onclick = () => m.close(); }
  async function update(){ try { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(r => r.update())); } catch (e) {} location.reload(); }
  async function checkUpdate(){ try { const j = await (await fetch("version.json?t=" + now(), { cache: "no-store" })).json(); const n = j.v && j.v !== APP_VERSION; const b = $("#updB"); if (b){ b.classList.toggle("new", n); b.title = n ? "A new version is out. Click to update." : "Update app (up to date, " + APP_VERSION + ")"; } } catch (e) {} }

  /* ---------- keyboard, paste ---------- */
  const typing = () => { const e = document.activeElement; return e && (e.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName)) && !(e.type === "checkbox" || e.type === "radio"); };
  document.addEventListener("keydown", e => { if (A.mobile) return; const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if ($(".ynmodal") && k !== "escape") return;
    const typingText = () => typing() && document.activeElement.tagName !== "SELECT";
    if (mod && k === "z" && !typingText()){ e.preventDefault(); e.shiftKey ? Store.redo() : Store.undo(); return; }
    if (mod && k === "y" && !typingText()){ e.preventDefault(); Store.redo(); return; }
    if (mod && k === "p"){ e.preventDefault(); Print.dialog(); return; }
    if ((mod && k === "f") || (k === "/" && !typing())){ e.preventDefault(); $("#q").focus(); $("#q").select(); return; }
    if (k === "escape"){ if (Media.open || $(".pop") || $(".mb.open")){ Fields.closePop(); closeMenus(); return; } if (typing()){ document.activeElement.blur(); return; } if (A.selRef) select(null); return; }
    if (typing() || mod || e.altKey) return;
    if (k === "n"){ e.preventDefault(); newAction(); }
    else if (/^[1-4]$/.test(k)){ setTab(["actions", "kanban", "contacts", "valid"][+k - 1]); }
    else if ((k === "arrowdown" || k === "arrowup") && A.tab === "actions" && A.selRef){ const rs = Table.rows(), i = rs.findIndex(a => a._p + ":" + a.u === A.selRef), n = rs[i + (k === "arrowdown" ? 1 : -1)]; if (n){ e.preventDefault(); select(n._p + ":" + n.u); } } });
  /* pasted photos wait in the tray (bottom left) until dragged onto an action */
  document.addEventListener("paste", e => { if (A.mobile) return; const files = [...(e.clipboardData && e.clipboardData.files || [])];
    if (files.length){ e.preventDefault(); if (!Store.S.edit) return viewOnly(); Media.toTray(files); return; }
    if (typing() || $(".ynmodal")) return; const t = e.clipboardData.getData("text"); if (t && t.trim().length > 20 && Store.S.edit){ e.preventDefault(); Intake.open(null, t); } });
  /* files dropped anywhere but an action go to the tray too */
  document.addEventListener("dragover", e => { if ([...e.dataTransfer.types].includes("Files")) e.preventDefault(); });
  document.addEventListener("drop", e => { if (!e.dataTransfer.files.length) return; e.preventDefault(); if (!Store.S.edit) return viewOnly(); Media.toTray([...e.dataTransfer.files]); });
  function setTab(t){ A.tab = t; lsSet("adTab", t); render(); }

  /* ---------- start ---------- */
  async function boot(){ applyView();
    A.mobile = matchMedia("(max-width: 760px), (pointer: coarse) and (max-width: 1100px)").matches; document.body.classList.toggle("mobile", A.mobile);
    const sw = lsGet("adSideW", null); if (sw) $("#main").style.setProperty("--side-w", sw + "px"); splitter(); splitterL();
    $("#brand").innerHTML = LOGO(34); $("#brand").setAttribute("aria-label", "Action Database, home");   // (the project box sits where the name was) $("#boot .bl").innerHTML = LOGO(84);
    $("#brand").title = "Home"; $("#brand").onclick = () => { A.tab = "actions"; lsSet("adTab", "actions"); select(null); };   // the logo goes home: the Actions list
    if (!A.mobile){ menus();
      $$(".tab").forEach(t => t.onclick = () => setTab(t.dataset.t));
      $("#q").oninput = debounce(() => { A.q = $("#q").value; render(); }, 150);
      $("#newB").onclick = () => newAction(); $("#pasteB").onclick = () => Intake.open(null, ""); $("#colB").onclick = e => { e.stopPropagation(); Table.columnsPop(e.currentTarget); };
      $$("#vt button").forEach(b => b.onclick = () => { A.view = b.dataset.v; lsSet("adViewType", A.view); render(); }); $("#sizeB").onclick = e => { e.stopPropagation(); Table.sizePop(e.currentTarget); };
      $("#printB").onclick = () => Print.dialog(); $("#xlsB").onclick = () => Print.excelDialog();
      $("#undoB").onclick = () => Store.undo(); $("#redoB").onclick = () => Store.redo(); $("#updB").onclick = update;
      $("#status").onclick = () => { if (!Store.S.edit) settings(); else if (Store.S.status === "error") Store.save(); };
      $("#profB").onclick = e => { e.stopPropagation(); if ($(".profpop")) return Fields.closePop(); Profile.name() ? profMenu(e.currentTarget) : signIn(); }; drawProf();
      $("#folderB").onclick = () => Local.state() === "locked" ? Local.reconnect() : Local.pick(); }
    await Local.init();
    /* on the Cloudflare site, the site's sign in says who this is */
    const site = GH.site(); if (site){ const p = { first: site.first, last: site.last, role: site.role, mobile: site.mobile, email: site.email }, had = Profile.get();
      if (had.email !== site.email || !had.first) Profile.set(p); lsSet("adUser", site.email); lsSet("adSetup", 1); drawProf(); }
    const qs = new URLSearchParams(location.search);
    if (!A.mobile) Equip.load().then(() => render()).catch(() => {});   // (the plant tags and WBS areas, for picking equipment and locations)
    try { await Promise.all([Store.load(), checkEdit()]); } catch (e){ $("#boot .bt").textContent = "Couldn't load the actions: " + e.message; return; }
    if (qs.get("p") && Store.project(qs.get("p"))) Store.setSelected([qs.get("p")]);
    const ar = qs.get("a"); if (ar){ const a = Store.findRef(ar); if (a){ if (!Store.selected().includes(a._p)) Store.setSelected(Store.selected().concat(a._p)); A.selRef = a._p + ":" + a.u;
        if (A.mobile) Mobile.show(A.selRef); const ph = +qs.get("photo"); if (ph && a.photos.length) setTimeout(() => Media.view(a, ph - 1), 300); } }
    $("#boot").remove(); draw();
    if (site && Store.S.edit && !Store.user(site.email)) Store.saveUser(Profile.get(), true);   // (into the people list, for owners and edits)
    /* a private data repo can't be read without a key */
    if (!GH.cfg().token && !Store.projects().length) GH.isPublic().then(pub => { if (pub === false) note("The actions are in a private repository (" + GH.cfg().repo + "). Add a GitHub key in File, Settings to see them.", 12000); });
    const setup = () => { if (!lsGet("adSetup", 0)) settings(true); };
    if (!A.mobile && !lsGet("adUser", null)) signIn(setup); else if (!A.mobile) setup();
    /* look for other people's changes: every 20 s while an action is open, else every 45 s */
    let lastPoll = now(); setInterval(async () => { if (document.hidden || $(".pop") || typing() || now() - lastPoll < (A.selRef ? 20000 : 45000)) return; lastPoll = now(); try { if (await Store.refresh()) render(); } catch (e) {} }, 5000);
    document.addEventListener("visibilitychange", async () => { if (!document.hidden) try { if (await Store.refresh()) render(); } catch (e) {} });
    /* leaving: save now (anything not saved yet is kept on this computer and saves the next time the app opens, so no "Leave site?" question) */
    const flush = () => { if (Store.S.dirty.size || Store.S.blobs.length){ Store.stashNow(); Store.save(); } };
    addEventListener("pagehide", flush); document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
    checkUpdate(); setInterval(checkUpdate, 30 * 60000);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {}); }
  return Object.assign(A, { act, render, renderStatus, select, openParts, othersChanged, clashes, who, ago, viewOnly, newAction, projBox, boot, settings, viewGet, viewSet, update });
})();
document.addEventListener("DOMContentLoaded", App.boot);
