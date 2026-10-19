/* The Data validation tab: the allowable data for each column (its type and its list of choices),
   the Organizer stages, and the contacts used by the contractor fields. */
"use strict";
const Valid = (() => {
  let sec = "fields", cur = "title";
  function render(el){ const ro = !Store.S.edit;
    const ae = document.activeElement, row = ae && el.contains(ae) && ae.closest("[data-id], .ct-new, .dv-ed"), keep = row ? { id: row.dataset.id || (row.classList.contains("ct-new") ? "_new" : "_ed"), i: $$("input,select", row).indexOf(ae), s: ae.selectionStart, v: ae.value } : null;
    el.innerHTML = '<div class="dv"><nav class="dv-nav">' + [["fields", "Fields and choices"], ["stages", "Stages"], ["contacts", "Contacts"], ["equip", "Equipment"], ["vendors", "Vendors"]].map(([k, n]) => '<button type="button" data-s="' + k + '"' + (k === sec ? ' class="on"' : "") + '>' + n + '</button>').join("") + '</nav><div class="dv-body' + (ro ? " ro" : "") + '"></div></div>';
    $$(".dv-nav button", el).forEach(b => b.onclick = () => { sec = b.dataset.s; render(el); });
    const body = $(".dv-body", el); ({ fields, stages, contacts, equip, vendors: Vendors.page })[sec](body, ro);
    if (ro) $$("input,select,button:not(.dv-f)", body).forEach(x => x.disabled = true);
    if (keep){ const r = keep.id === "_new" ? $(".ct-new", el) : keep.id === "_ed" ? $(".dv-ed", el) : $('[data-id="' + keep.id + '"]', el), t = r && $$("input,select", r)[keep.i];
      if (t){ if (t.tagName === "INPUT" && t.type !== "checkbox" && t.type !== "color" && t.value !== keep.v) t.value = keep.v; t.focus(); try { t.setSelectionRange(keep.s, keep.s); } catch (e) {} } } }
  const up = (o, fn) => Store.mutate("config", () => { fn(); Store.touch(o); });
  /* drag rows in a list to reorder the array behind them */
  function sortable(list, arr, sel){ $$(sel, list).forEach(r => { r.draggable = Store.S.edit;
      r.ondragstart = e => { if (e.target.closest("input,select")) return e.preventDefault(); e.dataTransfer.setData("text/row", r.dataset.id); };
      r.ondragover = e => { if ([...e.dataTransfer.types].includes("text/row")){ e.preventDefault(); r.classList.add("dover"); } };
      r.ondragleave = () => r.classList.remove("dover");
      r.ondrop = e => { r.classList.remove("dover"); const from = e.dataTransfer.getData("text/row"); if (!from || from === r.dataset.id) return; e.preventDefault();
        Store.mutate("config", () => { const A = arr(); const i = A.findIndex(x => x.id === from), b0 = A.findIndex(x => x.id === r.dataset.id), m = A.splice(i, 1)[0]; A.splice(A.findIndex(x => x.id === r.dataset.id) + (i < b0 ? 1 : 0), 0, m); Store.touch(m); Store.S.config.mod = now(); }); }; }); }

  function fields(body){ const all = Store.fields(), hits = all.filter(f => hit(f.label, TYPES[f.type] || f.type, (f.options || []).filter(o => !o.del).map(o => o.label).join(" "))), fs = hits.length ? hits : all; if (!Store.field(cur)) cur = fs[0].id; const f = Store.field(cur);
    body.innerHTML = '<div class="dv-cols"><div class="dv-list"><div class="dv-h">Fields <span class="dim">drag to reorder</span></div>' + fs.map(x => '<button type="button" class="dv-f' + (x.id === cur ? " on" : "") + '" data-id="' + x.id + '"><span>' + esc(x.label) + '</span><small>' + esc(x.type === "stage" ? "Stage" : x.type === "rank" ? "Organizer order" : x.type === "mto" ? "MTO count" : x.type === "sparelist" ? "Spares count" : x.type === "isollist" ? "Isolations count" : x.type === "meta" ? "Date, automatic" : x.type === "complete" ? "Tick box, moves the card" : TYPES[x.type] || x.type) + '</small></button>').join("")
      + '<button type="button" class="btn ghost sm dv-addf">+ Add field</button></div><div class="dv-ed"></div></div>';
    $$(".dv-f", body).forEach(b => b.onclick = () => { cur = b.dataset.id; fields(body); });
    sortable($(".dv-list", body), () => Store.S.config.fields, ".dv-f");
    $(".dv-addf", body).onclick = async () => { const n = await promptBox("Name of the new field", ""); if (!n || !n.trim()) return; const id = "f" + uid();
      Store.mutate("config", () => Store.S.config.fields.push(Store.touch({ id, label: n.trim(), type: "text", table: false, tbc: true, na: true, options: [] }))); cur = id; };
    const ed = $(".dv-ed", body), special = ["stage", "rank", "mto", "sparelist", "isollist", "meta", "complete"].includes(f.type);
    ed.innerHTML = '<label class="fl">Name<input class="in" data-k="label" value="' + esc(f.label) + '"></label>'
      + (special ? '<p class="dim">' + (f.type === "meta" ? "Filled in automatically: " + ({ created: "when the action was made", modified: "every time it's changed", completed: "when it moves into a Completed stage (cleared if it moves out again)" })[f.id] + "." : f.type === "complete" ? "Ticking it moves the action to the Completed stage and records the date completed. Unticking moves it back to the stage it came from." : f.type === "mto" || f.type === "sparelist" || f.type === "isollist" ? "Shows how many " + (f.type === "isollist" ? "isolations" : "items") + " the action has on its " + ({ mto: "MTO", sparelist: "Spares", isollist: "Isolations" })[f.type] + " tab, as a link that opens it there." : f.type === "stage" ? "The status is the Organizer stage. Edit the stages on the Stages page or straight on the Organizer board." : "Priority is the order of the cards in each Organizer column. Drag a card up for higher priority, or pick a number in the table.") + '</p>'
        : '<label class="fl">Type of data<select class="in" data-k="type"' + (f.core ? " disabled" : "") + '>' + Object.entries(TYPES).map(([k, n]) => '<option value="' + k + '"' + (k === f.type ? " selected" : "") + '>' + n + '</option>').join("") + '</select></label>')
      + '<label class="tp-o"><input type="checkbox" data-k="table"' + (f.table ? " checked" : "") + (f.id === "title" ? " disabled" : "") + '><span>Show as a column in the table</span></label>'
      + (["choice", "date", "contact", "text", "multi"].includes(f.type) && !f.core ? '<label class="tp-o"><input type="checkbox" data-k="tbc"' + (f.tbc ? " checked" : "") + '><span>Offer <b class="tbc">TBC</b></span></label><label class="tp-o"><input type="checkbox" data-k="na"' + (f.na ? " checked" : "") + '><span>Offer N/A</span></label>' : "")
      + (f.type === "text" && !f.core ? '<label class="tp-o"><input type="checkbox" data-k="suggest"' + (f.suggest ? " checked" : "") + '><span>Suggest values used before</span></label>' : "")
      + (f.type === "phone" ? '<label class="fl">Filled in from<select class="in" data-k="link"><option value="">Nothing</option>' + Store.fields().filter(x => x.type === "contact").map(x => '<option value="' + x.id + '"' + (x.id === f.link ? " selected" : "") + '>' + esc(x.label) + '</option>').join("") + '</select></label>' : "")
      + (f.type === "contact" ? '<p class="dim">Names come from the Contacts page. Typing a new name and number on an action adds it there, and picking a name fills in its number.</p>' : "")
      + (f.type === "choice" || f.type === "multi" ? '<div class="dv-h">Allowed values <span class="dim">drag to reorder, renaming updates every action</span></div><div class="opts"></div><input class="in" data-k="newopt" placeholder="+ Add a value, then Enter">' : "")
      + (f.core ? "" : '<div class="msep"></div><button type="button" class="btn ghost sm danger" data-k="del">Delete this field</button>');
    $$("[data-k]", ed).forEach(i => { const k = i.dataset.k;
      if (k === "label") i.onchange = () => i.value.trim() && up(f, () => f.label = i.value.trim());
      else if (k === "type") i.onchange = () => up(f, () => { f.type = i.value; if ((f.type === "choice" || f.type === "multi") && !f.options) f.options = []; });
      else if (k === "link") i.onchange = () => up(f, () => f.link = i.value);
      else if (k === "newopt") i.onkeydown = e => { if (e.key === "Enter" && i.value.trim()){ const v = i.value.trim(); if ((f.options || []).some(o => !o.del && o.label.toLowerCase() === v.toLowerCase())) return note("That value is already there");
        up(f, () => { f.options = f.options || []; f.options.push({ id: uid(), label: v, color: "" }); }); setTimeout(() => { const n = $("[data-k=newopt]"); n && n.focus(); }, 30); } };
      else if (k === "del") i.onclick = async () => { if (await confirmBox("Delete the field “" + f.label + "”? Values already entered stay stored but are hidden.", "Delete", true)) up(f, () => f.del = true); };
      else i.onchange = () => up(f, () => f[k] = i.checked); });
    const ol = $(".opts", ed); if (ol){ const opts = (f.options || []).filter(o => !o.del);
      ol.innerHTML = opts.length ? opts.map(o => '<div class="opt" data-id="' + o.id + '"><span class="grip">⋮⋮</span><input type="color" value="' + esc(o.color || "#e5e7eb") + '" title="Colour"><input class="in" value="' + esc(o.label) + '"><span class="dim">' + Store.all().filter(a => [].concat(a.f[f.id] || []).includes(o.label)).length + ' used</span><button type="button" class="ic-b sm" title="Remove">✕</button></div>').join("") : '<div class="dim">No values yet.</div>';
      $$(".opt", ol).forEach(r => { const o = f.options.find(x => x.id === r.dataset.id);
        $("input[type=color]", r).onchange = e => up(f, () => o.color = e.target.value);
        $("input.in", r).onchange = e => { const v = e.target.value.trim(); if (!v || v === o.label) return; const old = o.label; Store.mutate(["config"].concat(Store.projects().map(p => "a:" + p.id)), () => { o.label = v; Store.touch(f); Store.renameOption(f, old, v); }); };
        $(".ic-b", r).onclick = () => up(f, () => o.del = true); });
      sortable(ol, () => f.options, ".opt"); } }

  function stages(body){ const ss = Store.stages().filter(s => hit(s.name));
    body.innerHTML = '<div class="dv-h">Organizer stages <span class="dim">drag to reorder. These are also the status choices, and you can edit them on the board too.</span></div><div class="stl">' + ss.map(s => '<div class="str" data-id="' + s.id + '"><span class="grip">⋮⋮</span><input type="color" value="' + esc(s.color) + '"><input class="in" value="' + esc(s.name) + '"><select class="in sm">' + [["open", "Normal"], ["hold", "On hold"], ["done", "Completed"]].map(([k, n]) => '<option value="' + k + '"' + (s.kind === k ? " selected" : "") + '>' + n + '</option>').join("") + '</select><label class="tp-o"><input type="checkbox"' + (s.print ? " checked" : "") + '><span>Print</span></label><span class="dim">' + Store.all().filter(a => a.stage === s.id).length + '</span><button type="button" class="ic-b sm" title="Delete">✕</button></div>').join("") + '</div>'
      + '<input class="in" data-k="new" placeholder="+ Add a stage, then Enter">';
    $$(".str", body).forEach(r => { const s = Store.stage(r.dataset.id);
      $("input[type=color]", r).onchange = e => up(s, () => s.color = e.target.value);
      $("input.in", r).onchange = e => e.target.value.trim() && up(s, () => s.name = e.target.value.trim());
      $("select", r).onchange = e => up(s, () => s.kind = e.target.value);
      $("input[type=checkbox]", r).onchange = e => up(s, () => s.print = e.target.checked);
      $(".ic-b", r).onclick = async () => { const others = Store.stages().filter(x => x.id !== s.id); if (!others.length) return; const n = Store.all().filter(a => a.stage === s.id).length;
        if (!await confirmBox("Delete “" + s.name + "”?" + (n ? " Its " + n + " action(s) move to “" + others[0].name + "”." : ""), "Delete", true)) return;
        Store.mutate(["config"].concat(Store.projects().map(p => "a:" + p.id)), () => { Store.all().filter(a => a.stage === s.id).forEach(a => { a.stage = others[0].id; Store.touch(a); }); s.del = true; Store.touch(s); }); }; });
    sortable($(".stl", body), () => Store.S.config.stages, ".str");
    $("[data-k=new]", body).onkeydown = e => { const v = e.target.value.trim(); if (e.key !== "Enter" || !v) return; Store.mutate("config", () => { const A = Store.S.config.stages, at = A.findIndex(x => !x.del && x.kind !== "open"), s = Store.touch({ id: "st" + uid(), name: v, color: "#64748b", kind: "open", print: true }); at < 0 ? A.push(s) : A.splice(at, 0, s); Store.S.config.mod = now(); }); }; }

  /* the equipment the app suggests: the Equipment tags list, plus everything in the Project Library lists */
  function equip(body, ro){ const f = Store.field("equipment"), tags = f ? Fields.optLabels(f) : [], q = (App.q || "").toLowerCase().split(/\s+/).filter(Boolean);
    const list = Equip.count ? Equip.find(q.join(" ") || "-", "t") : [];
    body.innerHTML = '<div class="dv-h">Equipment <span class="dim">suggested when typing equipment tags and isolations; anything can still be typed</span></div>'
      + '<div class="dv-h" style="margin-top:14px">Equipment tags list <span class="dim">' + tags.length + ' tags</span>' + (ro ? "" : '<button type="button" class="link" data-k="edtags">Edit the list</button>') + '</div><div class="eq-tags">' + (tags.length ? tags.map(t => Fields.chip(t)).join(" ") : '<span class="dim">None yet. Tags typed on actions are added here.</span>') + '</div>'
      + '<div class="dv-h" style="margin-top:18px">From Project Library <span class="dim">' + (Equip.count ? Equip.count.toLocaleString() + " items: mechanical and electrical equipment, valves, instruments" : "loading…") + '</span><button type="button" class="link" data-k="ref">Refresh</button></div>'
      + (q.length ? '<table class="tbl ct vd-tbl"><thead><tr><th>Tag</th><th>Name</th><th>List</th></tr></thead><tbody>' + list.map(x => '<tr><td><b>' + esc(x.t) + '</b></td><td>' + esc(x.n) + '</td><td>' + esc(x.k) + '</td></tr>').join("") + '</tbody></table>' + (list.length ? "" : '<div class="dim">Nothing matches.</div>') : '<div class="dim">Type in the search box above to look up equipment.</div>');
    const e = $("[data-k=edtags]", body); if (e) e.onclick = () => { sec = "fields"; cur = "equipment"; App.render(); };
    $("[data-k=ref]", body).onclick = () => Equip.load(true).then(() => App.render());
    if (!Equip.count) Equip.load().then(() => App.render()); }
  const hit = (...xs) => { const w = (App.q || "").toLowerCase().split(/\s+/).filter(Boolean); const t = xs.join(" ").toLowerCase(); return w.every(x => t.includes(x)); };
  function contacts(body){ const q = (App.q || "").toLowerCase(); const cs = Store.contacts().filter(c => hit(c.name, c.company, c.mobile, c.email)).sort((a, b) => a.name.localeCompare(b.name));
    body.innerHTML = '<div class="dv-h">Contacts <span class="dim">picking a name on an action fills in its number</span></div>'
      + '<table class="tbl ct"><thead><tr><th>Name</th><th>Company</th><th>Mobile</th><th>Email</th><th></th></tr></thead><tbody>' + cs.map(c => '<tr data-id="' + c.id + '">' + ["name", "company", "mobile", "email"].map(k => '<td><input class="in" data-k="' + k + '" value="' + esc(c[k] || "") + '"></td>').join("") + '<td><button type="button" class="ic-b sm" title="Delete">✕</button></td></tr>').join("")
      + '<tr class="ct-new"><td><input class="in" data-k="name" placeholder="+ New name"></td><td><input class="in" data-k="company" placeholder="Company"></td><td><input class="in" data-k="mobile" placeholder="Mobile"></td><td><input class="in" data-k="email" placeholder="Email"></td><td><button type="button" class="btn sm">Add</button></td></tr></tbody></table>';
    $$("tr[data-id]", body).forEach(r => { const c = Store.S.config.contacts.find(x => x.id === r.dataset.id);
      $$("input", r).forEach(i => i.onchange = () => up(c, () => c[i.dataset.k] = i.value.trim()));
      $(".ic-b", r).onclick = () => up(c, () => c.del = true); });
    const nr = $(".ct-new", body), add = () => { const v = k => $("[data-k=" + k + "]", nr).value.trim(); if (!v("name")) return;
      Store.mutate("config", () => Store.S.config.contacts.push(Store.touch({ id: uid(), name: v("name"), company: v("company"), mobile: v("mobile"), email: v("email") }))); };
    $("button", nr).onclick = add; $$("input", nr).forEach(i => i.onkeydown = e => e.key === "Enter" && add()); }
  return { render };
})();
