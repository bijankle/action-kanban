/* Start up, the header (menus, project box, tabs, save light), settings and keyboard shortcuts. */
"use strict";
const APP_VERSION = "1.1.0";
const LOGO = (s, c) => '<svg class="logo" width="' + s + '" height="' + s + '" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="18" fill="' + (c || "var(--thb)") + '"/><rect x="6" y="6" width="52" height="52" rx="13" fill="none" stroke="#fff" stroke-width="2.5"/><text x="29" y="46" text-anchor="middle" font-family="system-ui,Segoe UI,Arial,sans-serif" font-weight="800" font-size="38" fill="#fff">A</text><g transform="translate(46 19)" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><line x1="0" y1="-5.5" x2="0" y2="5.5"/><line x1="-4.8" y1="-2.75" x2="4.8" y2="2.75"/><line x1="-4.8" y1="2.75" x2="4.8" y2="-2.75"/></g></svg>';
const THEMES = [["slate", "Slate", "#475569"], ["graphite", "Graphite", "#52525b"], ["navy", "Navy", "#1E3A5F"], ["petrol", "Petrol", "#1F4F5A"], ["olive", "Olive", "#5A5A2E"], ["stone", "Stone", "#7A6A5D"], ["rust", "Rust", "#9A3412"], ["ink", "Ink", "#111827"]];

const App = (() => {
  const A = { q: "", pills: new Set(lsGet("adPills", [])), sort: null, selRef: null, tab: lsGet("adTab", "actions"), view: lsGet("adViewType", "list"), mobile: false };
  const act = ref => { if (!ref) return null; const [pid, u] = ref.split(":"); const a = Store.find(pid, u); if (!a || a.del) return null; a._p = pid; return a; };
  let raf = 0; const render = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
  function draw(){ if (!Store.S.config) return; document.body.classList.toggle("ro", !Store.S.edit);
    if (A.selRef && !act(A.selRef)) A.selRef = null;
    if (A.mobile){ Mobile.render($("#mobile")); return; }
    projBox($("#pjBox")); renderStatus(); $$(".tab").forEach(t => t.classList.toggle("on", t.dataset.t === A.tab));
    $("#tools").hidden = A.tab === "valid"; pills(); $("#undoB").disabled = !Store.S.undo.length; $("#redoB").disabled = !Store.S.redo.length;
    const v = $("#view"); v.dataset.tab = A.tab;
    if (A.tab === "kanban") Kanban.render(v); else if (A.tab === "valid") Valid.render(v); else Table.render(v);
    $$("#vt button").forEach(b => b.classList.toggle("on", b.dataset.v === A.view)); $("#sizeB").hidden = A.tab !== "actions" || A.view !== "tiles"; $("#vt").hidden = A.tab !== "actions"; $("#colB").hidden = A.tab !== "actions" || A.view !== "list";
    if (A.tab === "actions") Panel.render($("#side")); else { $("#side").classList.remove("open"); $("#side").innerHTML = ""; }
    lsSet("adPills", [...A.pills]); }
  function pills(){ const all = Store.visible(), el = $("#pills");
    el.innerHTML = '<button type="button" class="pill' + (!A.pills.size ? " on" : "") + '" data-s="">All <b>' + all.length + '</b></button>' + Store.stages().map(s => '<button type="button" class="pill' + (A.pills.has(s.id) ? " on" : "") + '" data-s="' + s.id + '" style="--c:' + esc(s.color) + '" title="Click to show only this stage, Ctrl+click to add it"><i class="dot"></i>' + esc(s.name) + ' <b>' + all.filter(a => a.stage === s.id).length + '</b></button>').join("");
    $$(".pill", el).forEach(b => b.onclick = e => { const s = b.dataset.s; if (!s) A.pills.clear(); else if (e.ctrlKey || e.metaKey){ A.pills.has(s) ? A.pills.delete(s) : A.pills.add(s); } else if (A.pills.size === 1 && A.pills.has(s)) A.pills.clear(); else { A.pills.clear(); A.pills.add(s); } render(); });
    el.classList.toggle("dim-pills", A.tab === "kanban"); }
  function renderStatus(){ const s = $("#status"); if (!s) return; const S = Store.S; let cls, t;
    if (!S.edit){ cls = "ro"; t = GH.cfg().token ? "View only (key can't write)" : "View only"; }
    else if (S.status === "saving") { cls = "busy"; t = "Saving…"; }
    else if (S.status === "error"){ cls = "bad"; t = "Not saved: " + (S.statusMsg || "retrying"); }
    else if (S.dirty.size || S.blobs.length){ cls = "busy"; t = "Unsaved changes"; }
    else { cls = "ok"; t = "Saved"; }
    s.className = "status " + cls; s.innerHTML = '<i></i><span>' + esc(t) + '</span>';
    const lf = Local.state(); $("#folderB").hidden = !(S.edit && (lf === "locked" || lf === "none")); $("#folderB").textContent = lf === "locked" ? "Reconnect folder" : "Choose local folder"; }
  const select = ref => { A.selRef = ref; if (ref) history.replaceState(null, "", "?a=" + encodeURIComponent(ref.split(":")[0] + ":" + (act(ref) || {}).no)); else history.replaceState(null, "", location.pathname); render(); };
  const viewOnly = () => note(GH.cfg().token ? "This GitHub key can't save to " + GH.cfg().repo + ". View only." : "View only. Add your GitHub key in File, Settings to make changes.", 4500);
  function newAction(stageId){ Intake.open(stageId); }

  /* ---------- project box (Project Library style): tick one or several projects ---------- */
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
  function editProject(p, after){ const isNew = !p; p = p || { name: "", prefix: "", color: ["#475569", "#9A3412", "#1F4F5A", "#5A5A2E", "#1E3A5F", "#7A6A5D"][Store.projects().length % 6] };
    const m = modal('<h3>' + (isNew ? "New project" : "Edit project") + '</h3><label class="fl">Name<input class="in" data-k="name" value="' + esc(p.name) + '"></label><label class="fl">ID prefix <span class="dim">the action IDs read PREFIX-0001</span><input class="in" data-k="prefix" maxlength="6" value="' + esc(p.prefix) + '"></label><label class="fl in-row">Colour <input type="color" data-k="color" value="' + esc(p.color) + '"></label>'
      + '<div class="yn-btns">' + (isNew ? "" : '<button class="yn-no danger-t" type="button" data-k="del">Delete</button><span class="grow"></span>') + '<button class="yn-no" type="button" data-k="x">Cancel</button><button class="yn-yes" type="button" data-k="ok">' + (isNew ? "Create" : "Save") + '</button></div>');
    const n = $("[data-k=name]", m), px = $("[data-k=prefix]", m); n.focus(); let auto = isNew; n.oninput = () => { if (auto) px.value = ImportAM.prefixOf(n.value); }; px.oninput = () => auto = false;
    $("[data-k=x]", m).onclick = () => m.close();
    $("[data-k=ok]", m).onclick = () => { const name = n.value.trim(); if (!name) return n.focus(); const pre = (px.value.trim() || ImportAM.prefixOf(name)).toUpperCase().replace(/[^A-Z0-9]/g, ""), col = $("[data-k=color]", m).value;
      if (isNew){ const id = slug(name) + "-" + uid().slice(-4); Store.mutate("projects", () => { Store.S.projects.projects.push(Store.touch({ id, name, prefix: pre, color: col, created: now() })); Store.S.acts[id] = { v: 1, nextNo: 1, actions: [] }; Store.S.dirty.add("a:" + id); Store.setSelected(Store.selected().concat(id)); }); Store.log("Created project " + name); }
      else Store.mutate("projects", () => { Object.assign(p, { name, prefix: pre, color: col }); Store.touch(p); });
      m.close(); after && after(); };
    const d = $("[data-k=del]", m); if (d) d.onclick = async () => { const c = Store.actsOf(p.id).length; if (!await confirmBox("Delete the project “" + p.name + "”" + (c ? " and its " + c + " actions" : "") + "? You can undo with Ctrl+Z.", "Delete", true)) return;
      Store.mutate("projects", () => { p.del = true; Store.touch(p); }); m.close(); after && after(); }; }

  /* ---------- settings and first time setup ---------- */
  function settings(first){ const c = GH.cfg(), lf = Local.state();
    const m = modal('<h3>' + (first ? "Welcome to Action Database" : "Settings") + '</h3>' + (first ? '<p class="dim">Set this computer up once. You can change any of it later in File, Settings.</p>' : "")
      + '<label class="fl">Your name <span class="dim">shown on your edits and prints</span><input class="in" data-k="name" value="' + esc(lsGet("adName", "")) + '"></label>'
      + '<label class="fl">GitHub key <span class="dim">needed to edit. Without it the app is view only.</span><input class="in secret" data-k="key" autocomplete="off" spellcheck="false" value="' + esc(c.token) + '" placeholder="github_pat_…"></label><div class="dim sm-t">Make one at <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com, Settings, Developer settings, Fine grained tokens</a>: Repository access “Only select repositories”, pick <b>' + esc(c.repo) + '</b>, then Permissions, Contents, Read and write. It stays on this computer only. <span class="ks"></span></div>'
      + '<label class="fl">Data repository<input class="in" data-k="repo" value="' + esc(c.repo) + '"></label>'
      + '<div class="fl">Local folder <span class="dim">full quality photos and a backup of the data are saved here</span><div class="in-row"><b class="lfn">' + esc(Local.name() || (lf === "unsupported" ? "Needs Chrome or Edge" : "Not chosen")) + '</b>' + (lf === "locked" ? ' <span class="dim">(click Reconnect)</span>' : "") + '<span class="grow"></span>' + (Local.supported ? '<button type="button" class="btn ghost sm" data-k="pick">' + (lf === "locked" ? "Reconnect" : "Choose folder…") + '</button>' : "") + '</div></div>'
      + '<label class="fl">Google Gemini key <span class="dim">optional, for turning pasted text into an action</span><input class="in secret" data-k="gem" autocomplete="off" spellcheck="false" value="' + esc(lsGet("adGemKey", "")) + '" placeholder="Free from aistudio.google.com"></label>'
      + '<div class="fl">Photo quality online <span class="dim">the original is always kept in the local folder</span><div class="seg" data-k="q">' + [["low", "Low, 1024 px"], ["medium", "Medium, 1600 px"]].map(([k, n]) => '<button type="button" data-v="' + k + '"' + ((Store.S.config && Store.S.config.quality || "medium") === k ? ' class="on"' : "") + '>' + n + '</button>').join("") + '</div></div>'
      + (first ? "" : '<div class="msep"></div><button type="button" class="btn ghost sm" data-k="am">Import from ActionMap…</button>')
      + '<div class="yn-btns">' + (first ? '<button class="yn-no" type="button" data-k="x">Skip for now</button>' : '<button class="yn-no" type="button" data-k="x">Cancel</button>') + '<button class="yn-yes" type="button" data-k="ok">' + (first ? "Finish" : "Save") + '</button></div>', { cls: "set-win", sticky: first });
    const ks = $(".ks", m); const check = async () => { const k = $("[data-k=key]", m).value.trim(); if (!k){ ks.textContent = ""; return; } ks.textContent = "Checking…";
      const old = lsGet("adGhKey", ""), oldR = lsGet("adRepo", ""); lsSet("adGhKey", k); lsSet("adRepo", $("[data-k=repo]", m).value.trim()); GH.reset(); const ok = await GH.canEdit(); lsSet("adGhKey", old); lsSet("adRepo", oldR); GH.reset();
      ks.innerHTML = ok ? '<b class="good">✓ This key can edit.</b>' : ok === null ? "Couldn't check (offline?)" : '<b class="bad">This key can\'t write to that repository.</b>'; };
    $("[data-k=key]", m).onchange = check; if (c.token) check();
    $$("[data-k=q] button", m).forEach(b => b.onclick = () => { $$("[data-k=q] button", m).forEach(x => x.classList.toggle("on", x === b)); });
    const pk = $("[data-k=pick]", m); if (pk) pk.onclick = async () => { if (await (Local.state() === "locked" ? Local.reconnect() : Local.pick())){ $(".lfn", m).textContent = Local.name(); pk.textContent = "Change folder…"; } };
    const am = $("[data-k=am]", m); if (am) am.onclick = () => { m.close(); ImportAM.open(); };
    $("[data-k=x]", m).onclick = () => { lsSet("adSetup", 1); m.close(); };
    $("[data-k=ok]", m).onclick = async () => { lsSet("adName", $("[data-k=name]", m).value.trim()); lsSet("adGhKey", $("[data-k=key]", m).value.trim()); lsSet("adRepo", $("[data-k=repo]", m).value.trim() === GH.pagesRepo() ? "" : $("[data-k=repo]", m).value.trim()); lsSet("adGemKey", $("[data-k=gem]", m).value.trim()); lsSet("adSetup", 1);
      const q = ($("[data-k=q] .on", m) || {}).dataset; m.close(); GH.reset(); await checkEdit();
      if (q && Store.S.config && q.v !== (Store.S.config.quality || "medium") && Store.S.edit) Store.mutate("config", () => { Store.S.config.quality = q.v; Store.S.config.mod = now(); });
      reload(); }; }
  async function checkEdit(){ const r = await GH.canEdit(); Store.S.edit = !A.mobile && (r === true || (r === null && !!GH.cfg().token)); render(); }
  async function reload(){ try { if (await Store.refresh(true)) render(); } catch (e){ note("Couldn't load: " + e.message); } render(); }

  /* ---------- view settings: theme colour (presets or any colour), dark mode, text size ---------- */
  function applyView(){ const v = Object.assign({ theme: "slate", custom: "#475569", dark: false, text: 1 }, lsGet("adView", {})), r = document.documentElement;
    r.dataset.theme = v.theme; r.classList.toggle("dark", !!v.dark); r.style.setProperty("--mt", v.text);
    if (v.theme === "custom"){ const c = v.custom; r.style.setProperty("--thb", c); r.style.setProperty("--thd", "color-mix(in srgb," + c + " 78%,#000)"); r.style.setProperty("--tht", "color-mix(in srgb," + c + " 10%,#fff)"); r.style.setProperty("--th-btn", "color-mix(in srgb," + c + " 85%,#fff)"); }
    else ["--thb", "--thd", "--tht", "--th-btn"].forEach(k => r.style.removeProperty(k));
    const fav = $('link[rel="icon"]'); if (fav){ const col = (getComputedStyle(r).getPropertyValue("--thb") || "#475569").trim(); fav.href = "data:image/svg+xml," + encodeURIComponent(LOGO(64, col.startsWith("color-mix") ? "#475569" : col).replace('class="logo" ', 'xmlns="http://www.w3.org/2000/svg" ')); } }
  function viewMenu(drop){ const v = Object.assign({ theme: "slate", custom: "#475569", dark: false, text: 1 }, lsGet("adView", {}));
    drop.innerHTML = '<div class="mi-sub">Theme colour</div><div class="thp">' + THEMES.map(([id, n, c]) => '<button type="button" data-th="' + id + '" title="' + n + '" style="--c:' + c + '"' + (v.theme === id ? ' class="on"' : "") + '></button>').join("") + '<label class="thp-c' + (v.theme === "custom" ? " on" : "") + '" title="Make your own colour"><input type="color" value="' + esc(v.custom) + '"><span>Custom</span></label></div>'
      + '<div class="mi-sub">Appearance</div><div class="mi-seg"><button type="button" data-d="0"' + (!v.dark ? ' class="on"' : "") + '>Light</button><button type="button" data-d="1"' + (v.dark ? ' class="on"' : "") + '>Dark</button></div>'
      + '<div class="mi-sub">Text size</div><div class="mi-seg">' + [[0.87, "Smaller"], [1, "Normal"], [1.13, "Larger"], [1.27, "Largest"]].map(([k, n]) => '<button type="button" data-z="' + k + '"' + (+v.text === k ? ' class="on"' : "") + '>' + n + '</button>').join("") + '</div>'
      + '<div class="msep"></div><button type="button" class="mi" data-k="cols">Table columns…</button><button type="button" class="mi" data-k="side">Reset side panel width</button>';
    const set = o => { lsSet("adView", Object.assign(v, o)); applyView(); viewMenu(drop); };
    $$("[data-th]", drop).forEach(b => b.onclick = e => { e.stopPropagation(); set({ theme: b.dataset.th }); });
    $(".thp-c input", drop).oninput = e => { lsSet("adView", Object.assign(v, { theme: "custom", custom: e.target.value })); applyView(); };
    $(".thp-c input", drop).onchange = () => viewMenu(drop);
    $$("[data-d]", drop).forEach(b => b.onclick = e => { e.stopPropagation(); set({ dark: b.dataset.d === "1" }); });
    $$("[data-z]", drop).forEach(b => b.onclick = e => { e.stopPropagation(); set({ text: +b.dataset.z }); });
    $("[data-k=cols]", drop).onclick = () => { closeMenus(); A.tab = "actions"; lsSet("adTab", "actions"); draw(); Table.columnsPop($("#colB")); };
    $("[data-k=side]", drop).onclick = () => { lsSet("adSideW", null); document.documentElement.style.removeProperty("--side-w"); closeMenus(); }; }

  /* ---------- menus ---------- */
  const MENUS = {
    File: [["New action", "N", () => newAction()], ["New action from pasted text…", "", () => Intake.open(null, "")], "-", ["Projects…", "", projectsWin], ["New project…", "", () => editProject(null)], "-", ["Print…", "Ctrl+P", () => Print.dialog()], ["Export to Excel", "", () => Excel.run()], "-", ["Import from ActionMap…", "", () => ImportAM.open()], ["Settings…", "", () => settings()]],
    Edit: [["Undo", "Ctrl+Z", () => Store.undo()], ["Redo", "Ctrl+Y", () => Store.redo()], "-", ["Delete selected action", "", () => { const a = act(A.selRef); if (a) $("#side [data-k=del]") && $("#side [data-k=del]").click(); }]],
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
      + sec("Actions", ["+ New action (or N) makes one. Type it, or paste an email into the Paste text tab and Gemini fills in the fields. Fields it can't find are left empty.", "Click a row to open it in the side panel on the right: the problem, the solution and the photos, then attachments, steps and details. Drag the panel's left edge to resize it.", "Any value set to TBC shows in red. The status and priority dropdowns in the table move the card on the Kanban board too."])
      + sec("Photos and files", ["Drop photos and files onto an action's row, tile or side panel, or use its Upload button. A pasted photo (Ctrl+V) waits at the bottom left until you drag it onto an action. PDFs, Excel files and anything else are kept as attachments.", "The Photos button opens a big view with thumbnails of the photos before and after. Arrows step through, ⛶ or a double click goes full screen, Esc closes.", "The ☰ and ▦ buttons switch the Actions tab between the list and tiles; Size sets the tile size.", "The full quality original goes to your local folder; a compressed copy goes online for everyone else."])
      + sec("Kanban", ["The board is kept simple: drag cards between stages, higher in a column means higher priority, and click a card for its problem, solution and photos. Edit on the Actions tab. Double click a stage name to rename it; drag a stage's header to move it; ⋯ for its colour, type (normal, on hold, completed) and whether it prints. + Add a stage at the end."])
      + sec("Data validation", ["Set the type of every field (text, choice, tags, date, tick box, contact…), its allowed values and colours, whether it offers TBC and N/A, and whether it's a table column. Contacts hold names, companies and mobiles; picking a name fills in the number."])
      + sec("Printing and Excel", ["File, Print: tick the stages to print (Completed starts unticked). The board prints first, then each action's details and photos. File, Export to Excel exports the table as filtered, with a Photos link that opens the photos online."])
      + '<div class="yn-btns"><button class="yn-yes" type="button">Close</button></div>', { cls: "guide-win" }); $(".yn-yes", m).onclick = () => m.close(); }
  function keys(){ const m = modal('<h3>Keyboard shortcuts</h3><table class="keys">' + [["Ctrl+Z", "Undo"], ["Ctrl+Y or Ctrl+Shift+Z", "Redo"], ["N", "New action"], ["Ctrl+V", "Paste a photo (it waits bottom left, drag it onto an action), or pasted text into a new action"], ["Ctrl+F or /", "Search"], ["Ctrl+P", "Print"], ["Esc", "Close full screen, menus or the side panel"], ["↑ ↓", "Previous or next action in the table"], ["1 2 3", "Actions, Kanban, Data validation tabs"]].map(([k, d]) => '<tr><td><kbd>' + k + '</kbd></td><td>' + d + '</td></tr>').join("") + '</table><div class="yn-btns"><button class="yn-yes" type="button">Close</button></div>');
    $(".yn-yes", m).onclick = () => m.close(); }
  function about(){ const c = GH.cfg(); const m = modal('<h3>About</h3><table class="keys"><tr><td>Version</td><td>' + APP_VERSION + '</td></tr><tr><td>Data</td><td>' + esc(c.repo) + ', data folder</td></tr><tr><td>Access</td><td>' + (Store.S.edit ? "Can edit" : "View only") + '</td></tr><tr><td>Local folder</td><td>' + esc(Local.name() || "None") + '</td></tr><tr><td>Projects</td><td>' + Store.projects().length + ', ' + Store.all().length + ' actions</td></tr></table><div class="yn-btns"><button class="yn-yes" type="button">Close</button></div>');
    $(".yn-yes", m).onclick = () => m.close(); }
  async function update(){ try { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(r => r.update())); } catch (e) {} location.reload(); }
  async function checkUpdate(){ try { const j = await (await fetch("version.json?t=" + now(), { cache: "no-store" })).json(); const n = j.v && j.v !== APP_VERSION; const b = $("#updB"); if (b){ b.classList.toggle("new", n); b.title = n ? "A new version is out. Click to update." : "Update app (up to date, " + APP_VERSION + ")"; } } catch (e) {} }

  /* ---------- keyboard, paste ---------- */
  const typing = () => { const e = document.activeElement; return e && (e.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName)) && !(e.type === "checkbox" || e.type === "radio"); };
  document.addEventListener("keydown", e => { if (A.mobile) return; const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if ($(".ynmodal") && k !== "escape") return;
    if (mod && k === "z" && !typing()){ e.preventDefault(); e.shiftKey ? Store.redo() : Store.undo(); return; }
    if (mod && k === "y" && !typing()){ e.preventDefault(); Store.redo(); return; }
    if (mod && k === "p"){ e.preventDefault(); Print.dialog(); return; }
    if ((mod && k === "f") || (k === "/" && !typing())){ e.preventDefault(); $("#q").focus(); $("#q").select(); return; }
    if (k === "escape"){ if (Media.open || $(".pop") || $(".mb.open")){ Fields.closePop(); closeMenus(); return; } if (typing()){ document.activeElement.blur(); return; } if (A.selRef) select(null); return; }
    if (typing() || mod || e.altKey) return;
    if (k === "n"){ e.preventDefault(); newAction(); }
    else if (k === "1" || k === "2" || k === "3"){ setTab(["actions", "kanban", "valid"][+k - 1]); }
    else if ((k === "arrowdown" || k === "arrowup") && A.tab === "actions"){ const rs = Table.rows(); if (!rs.length) return; e.preventDefault(); const i = rs.findIndex(a => a._p + ":" + a.u === A.selRef); const n = rs[Math.max(0, Math.min(rs.length - 1, i < 0 ? 0 : i + (k === "arrowdown" ? 1 : -1)))]; select(n._p + ":" + n.u); requestAnimationFrame(() => { const r = $("tr.on"); r && r.scrollIntoView({ block: "nearest" }); }); } });
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
    const sw = lsGet("adSideW", null); if (sw) document.documentElement.style.setProperty("--side-w", sw + "px");
    $("#brand").innerHTML = LOGO(34) + '<span class="bn">Action <b>Database</b></span>'; $("#boot .bl").innerHTML = LOGO(84);
    if (!A.mobile){ menus();
      $$(".tab").forEach(t => t.onclick = () => setTab(t.dataset.t));
      $("#q").oninput = debounce(() => { A.q = $("#q").value; render(); }, 150);
      $("#newB").onclick = () => newAction(); $("#pasteB").onclick = () => Intake.open(null, ""); $("#colB").onclick = e => { e.stopPropagation(); Table.columnsPop(e.currentTarget); };
      $$("#vt button").forEach(b => b.onclick = () => { A.view = b.dataset.v; lsSet("adViewType", A.view); render(); }); $("#sizeB").onclick = e => { e.stopPropagation(); Table.sizePop(e.currentTarget); };
      $("#printB").onclick = () => Print.dialog(); $("#xlsB").onclick = () => Excel.run();
      $("#undoB").onclick = () => Store.undo(); $("#redoB").onclick = () => Store.redo(); $("#updB").onclick = update;
      $("#status").onclick = () => { if (!Store.S.edit) settings(); else if (Store.S.status === "error") Store.save(); };
      $("#folderB").onclick = () => Local.state() === "locked" ? Local.reconnect() : Local.pick(); }
    await Local.init();
    const qs = new URLSearchParams(location.search);
    try { await Promise.all([Store.load(), checkEdit()]); } catch (e){ $("#boot .bt").textContent = "Couldn't load the actions: " + e.message; return; }
    if (qs.get("p") && Store.project(qs.get("p"))) Store.setSelected([qs.get("p")]);
    const ar = qs.get("a"); if (ar){ const a = Store.findRef(ar); if (a){ if (!Store.selected().includes(a._p)) Store.setSelected(Store.selected().concat(a._p)); A.selRef = a._p + ":" + a.u;
        if (A.mobile) Mobile.show(A.selRef); const ph = +qs.get("photo"); if (ph && a.photos.length) setTimeout(() => Media.view(a, ph - 1), 300); } }
    $("#boot").remove(); draw();
    if (!A.mobile && !lsGet("adSetup", 0)) settings(true);
    setInterval(async () => { if (document.hidden || $(".pop") || typing()) return; try { if (await Store.refresh()) render(); } catch (e) {} }, 45000);
    document.addEventListener("visibilitychange", async () => { if (!document.hidden) try { if (await Store.refresh()) render(); } catch (e) {} });
    addEventListener("beforeunload", e => { if (Store.S.dirty.size || Store.S.blobs.length){ Store.save(); e.preventDefault(); e.returnValue = ""; } });
    checkUpdate(); setInterval(checkUpdate, 30 * 60000);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {}); }
  return Object.assign(A, { act, render, renderStatus, select, viewOnly, newAction, projBox, boot, settings });
})();
document.addEventListener("DOMContentLoaded", App.boot);
