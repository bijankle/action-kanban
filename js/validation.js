/* The Data validation tab: the allowable data for each column (its type and its list of choices),
   the Organizer stages, the equipment and vendor lists, and the contacts (people, their companies and what they have outstanding). */
"use strict";
const Valid = (() => {
  const TABS = [["contacts", "Contacts"], ["vendors", "Suppliers"], ["equip", "Assets"], ["other", "Other"]], OTHER = ["fields", "stages"];
  let sec = lsGet("adTab", "") === "contacts" ? "contacts" : ["fields", "stages", "equip", "vendors", "contacts"].includes(lsGet("adDvSec", "")) ? lsGet("adDvSec", "") : "contacts", cur = "title";
  function render(el){ const ro = !Store.S.edit;
    const ae = document.activeElement, row = ae && el.contains(ae) && ae.closest("[data-id], .ct-new, .dv-ed"), keep = row ? { id: row.dataset.id || (row.classList.contains("ct-new") ? "_new" : "_ed"), i: $$("input,select", row).indexOf(ae), s: ae.selectionStart, v: ae.value } : null;
    /* the sections are tabs in the strip over the page: Contacts, Suppliers, Assets, and Other (the Actions tab's columns and its status stages) */
    const top = OTHER.includes(sec) ? "other" : sec, dt = $("#dvT");
    if (dt){ dt.innerHTML = TABS.map(([k, n]) => '<button type="button" class="tab' + (k === top ? " on" : "") + '" data-s="' + k + '" role="tab" aria-selected="' + (k === top) + '">' + n + '</button>').join("");
      $$("button", dt).forEach(b => b.onclick = () => { const k = b.dataset.s; open(k === "other" ? (OTHER.includes(lsGet("adDvOther", "")) ? lsGet("adDvOther", "") : "fields") : k); App.render(); }); }
    el.innerHTML = '<div class="dv"><div class="dv-body' + (ro ? " ro" : "") + '"></div></div>';
    const body = $(".dv-body", el);     /* the fields and the stages are the admin's to change; anyone editing can keep the equipment and vendor lists */
    const lock = ro || ((sec === "fields" || sec === "stages") && !App.isAdmin());
    if (top === "other"){ body.insertAdjacentHTML("beforebegin", '<div class="av-sub dv-sub" role="tablist">' + [["fields", "Columns"], ["stages", "Status"]].map(([k, n]) => '<button type="button" data-o="' + k + '"' + (k === sec ? ' class="on"' : "") + '>' + n + '</button>').join("") + '</div>');
      $$(".dv-sub button", el).forEach(b => b.onclick = () => { open(b.dataset.o); App.render(); }); }
    if (sec === "contacts") return Contacts.render(body);   // (the contacts keep their own rules: anyone editing can change them)
    ({ fields, stages, equip: Assets.page, vendors: Vendors.page })[sec](body, lock);
    if (lock){ $$("input,select,button:not(.dv-f)", body).forEach(x => x.disabled = true); if (!ro) body.insertAdjacentHTML("afterbegin", '<p class="dim dv-lock">Only the admin changes the fields and stages.</p>'); }
    if (keep){ const r = keep.id === "_new" ? $(".ct-new", el) : keep.id === "_ed" ? $(".dv-ed", el) : $('[data-id="' + keep.id + '"]', el), t = r && $$("input,select", r)[keep.i];
      if (t){ if (t.tagName === "INPUT" && t.type !== "checkbox" && t.type !== "color" && t.value !== keep.v) t.value = keep.v; t.focus(); try { t.setSelectionRange(keep.s, keep.s); } catch (e) {} } } }
  const tname = x => x.type === "stage" ? "Stage" : x.type === "rank" ? "Organizer order" : x.type === "mto" ? "MTO count" : x.type === "sparelist" ? "Spares count" : x.type === "isollist" ? "Isolations count" : x.type === "meta" ? "Date, automatic" : x.type === "complete" ? "Tick box, moves the card" : TYPES[x.type] || x.type;
  /* the Filters side bar for each tab: the pills that make sense for its list */
  const KIND = { open: "Normal", hold: "On hold", done: "Completed" };
  const FG = {
    vendors: [{ k: "cat", name: "Category", of: v => v.cat, all: true }, { k: "type", name: "Supply type", of: v => v.type }],
    fields: [{ k: "type", name: "Type of data", of: f => tname(f) }, { k: "tbl", name: "On the Actions list", of: f => f.table ? "A column" : "Not a column" }],
    stages: [{ k: "kind", name: "Kind", of: s => KIND[s.kind] || s.kind, order: (a, b) => Object.values(KIND).indexOf(a) - Object.values(KIND).indexOf(b) }, { k: "print", name: "Print", of: s => s.print ? "Printed" : "Not printed" }] };
  const ITEMS = { vendors: () => Vendors.all(), fields: () => Store.fields(), stages: () => Store.stages() };
  const SRCH = { vendors: v => [v.name, v.cat, v.ordered, v.type], fields: f => [f.label, tname(f), (f.options || []).filter(o => !o.del).map(o => o.label).join(" ")], stages: s => [s.name, Store.todo(s)] };
  const pf = (k, items) => FG[k] ? PillF.apply(k, FG[k], items) : items;
  function filters(el){ if (sec === "contacts") return Contacts.filters(el); if (sec === "equip") return Assets.filters(el); let body = $(".fp-groups", el);
    if (!FG[sec]){ if (body) body.innerHTML = ""; return; } const all = ITEMS[sec](); PillF.render(el, sec, FG[sec], all.filter(x => smartHit(SRCH[sec](x).join(" "), App.q)), all); }
  const fcount = () => sec === "contacts" ? Contacts.fcount() : sec === "equip" ? Assets.fcount() : (FG[sec] ? PillF.count(sec, FG[sec]) : 0) + ((App.q || "").trim() ? 1 : 0);
  const PH = { contacts: "Search people, companies, numbers", vendors: "Search suppliers, categories, what we order", equip: "Search tags, lines, valves…", fields: "Search columns and their choices", stages: "Search the status steps" };
  const place = () => PH[sec] || "Search";
  const up = (o, fn) => Store.mutate("config", () => { fn(); Store.touch(o); });
  /* drag rows in a list to reorder the array behind them */
  function sortable(list, arr, sel){ $$(sel, list).forEach(r => { r.draggable = App.isAdmin();
      r.ondragstart = e => { if (e.target.closest("input,select")) return e.preventDefault(); e.dataTransfer.setData("text/row", r.dataset.id); };
      r.ondragover = e => { if ([...e.dataTransfer.types].includes("text/row")){ e.preventDefault(); r.classList.add("dover"); } };
      r.ondragleave = () => r.classList.remove("dover");
      r.ondrop = e => { r.classList.remove("dover"); const from = e.dataTransfer.getData("text/row"); if (!from || from === r.dataset.id) return; e.preventDefault();
        Store.mutate("config", () => { const A = arr(); const i = A.findIndex(x => x.id === from), b0 = A.findIndex(x => x.id === r.dataset.id), m = A.splice(i, 1)[0]; A.splice(A.findIndex(x => x.id === r.dataset.id) + (i < b0 ? 1 : 0), 0, m); if (A === Store.S.config.stages) Store.alignFields(); Store.touch(m); Store.S.config.mod = now(); }); }; }); }

  function fields(body){ const all = Store.fields(), hits = pf("fields", all.filter(f => hit(...SRCH.fields(f)))), fs = hits.length ? hits : all; if (!Store.field(cur)) cur = fs[0].id; const f = Store.field(cur);
    body.innerHTML = '<div class="dv-h">Fields</div><div class="dv-cols"><div class="dv-list">' + fs.map(x => '<button type="button" class="dv-f' + (x.id === cur ? " on" : "") + '" data-id="' + x.id + '"><span>' + esc(x.label) + '</span><small>' + esc(tname(x)) + '</small></button>').join("")
      + '<button type="button" class="btn ghost sm dv-addf">+ Add field</button></div><div class="dv-ed"></div></div>';
    $$(".dv-f", body).forEach(b => b.onclick = () => { cur = b.dataset.id; fields(body); });
    sortable($(".dv-list", body), () => Store.S.config.fields, ".dv-f");
    $(".dv-addf", body).onclick = async () => { const n = await promptBox("Name of the new field", ""); if (!n || !n.trim()) return; const id = "f" + uid();
      Store.mutate("config", () => Store.S.config.fields.push(Store.touch({ id, label: n.trim(), type: "text", table: false, tbc: true, na: true, options: [] }))); cur = id; };
    const ed = $(".dv-ed", body), special = ["stage", "rank", "mto", "sparelist", "isollist", "meta", "complete"].includes(f.type);
    ed.innerHTML = '<label class="fl">Name<input class="in" data-k="label" value="' + esc(f.label) + '"></label>'
      /* (a column the app fills in itself: its type, with what it does in the (i), so no row grows taller) */
      + (special ? '<div class="fl fl-v">Type of data<span class="fv">' + esc(tname(f)) + tipI((f.type === "meta" ? "Filled in automatically: " + ({ created: "when the action was made", modified: "every time it's changed", completed: "when it moves into a Completed stage (cleared if it moves out again)" })[f.id] + "." : f.type === "complete" ? "Ticking it moves the action to the Completed stage and records the date completed. Unticking moves it back to the stage it came from." : f.type === "mto" || f.type === "sparelist" || f.type === "isollist" ? "Shows how many " + (f.type === "isollist" ? "isolations" : "items") + " the action has on its " + ({ mto: "MTO", sparelist: "Spares", isollist: "Isolations" })[f.type] + " tab, as a link that opens it there." : f.type === "stage" ? "The status is the Organizer stage. Edit the stages on the Stages page or straight on the Organizer board." : "Priority is the order of the cards in each Organizer column. Drag a card up for higher priority, or pick a number in the table.")) + '</span></div>'
        : '<label class="fl">Type of data<select class="in" data-k="type"' + (f.core ? " disabled" : "") + '>' + Object.entries(TYPES).map(([k, n]) => '<option value="' + k + '"' + (k === f.type ? " selected" : "") + '>' + n + '</option>').join("") + '</select></label>')
      + '<label class="fl fl-ck">In the table<input type="checkbox" data-k="table"' + (f.table ? " checked" : "") + (f.id === "title" ? " disabled" : "") + ' title="Show as a column in the Actions list"></label>'
      + (["choice", "date", "contact", "text", "multi"].includes(f.type) && !f.core ? '<label class="fl fl-ck">Offer TBC<input type="checkbox" data-k="tbc"' + (f.tbc ? " checked" : "") + '></label><label class="fl fl-ck">Offer N/A<input type="checkbox" data-k="na"' + (f.na ? " checked" : "") + '></label>' : "")
      + (f.type === "text" && !f.core ? '<label class="fl fl-ck">Suggest<input type="checkbox" data-k="suggest"' + (f.suggest ? " checked" : "") + ' title="Suggest values used before"></label>' : "")
      + (f.type === "phone" ? '<label class="fl">Filled in from<select class="in" data-k="link"><option value="">Nothing</option>' + Store.fields().filter(x => x.type === "contact").map(x => '<option value="' + x.id + '"' + (x.id === f.link ? " selected" : "") + '>' + esc(x.label) + '</option>').join("") + '</select></label>' : "")
      + (f.type === "contact" ? '<div class="fl fl-v">Names<span class="fv">From Contacts' + tipI("Names come from the Contacts page. Typing a new name and number on an action adds it there, and picking a name fills in its number.") + '</span></div>' : "")
      + (f.type === "choice" || f.type === "multi" ? '<div class="dv-h">Allowed values' + tipI("Drag a row to reorder. Renaming a value updates every action that has it.") + '</div><div class="opts"></div><input class="in" data-k="newopt" placeholder="+ Add a value, then Enter">' : "")
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
      ol.innerHTML = opts.length ? opts.map(o => '<div class="opt" data-id="' + o.id + '"><span class="grip">⋮⋮</span><input type="color" value="' + esc(o.color || "#e5e7eb") + '" title="Colour"><input class="in" value="' + esc(o.label) + '"><span class="dim" title="Actions with this value">' + Store.all().filter(a => [].concat(a.f[f.id] || []).includes(o.label)).length + '</span><button type="button" class="ic-b sm" title="Remove">✕</button></div>').join("") : "";
      $$(".opt", ol).forEach(r => { const o = f.options.find(x => x.id === r.dataset.id);
        $("input[type=color]", r).onchange = e => up(f, () => o.color = e.target.value);
        $("input.in", r).onchange = e => { const v = e.target.value.trim(); if (!v || v === o.label) return; const old = o.label; Store.mutate(["config"].concat(Store.projects().map(p => "a:" + p.id)), () => { o.label = v; Store.touch(f); Store.renameOption(f, old, v); }); };
        $(".ic-b", r).onclick = () => up(f, () => o.del = true); });
      sortable(ol, () => f.options, ".opt"); } }

  function stages(body){ const ss = pf("stages", Store.stages().filter(s => hit(s.name, Store.todo(s))));
    body.innerHTML = '<div class="dv-h">Organizer stages' + tipI("Drag to reorder. Each stage has two names for the same step: as done, on the action (its steps, the status choices and exports, such as RFQ Sent), and as being done, on the Organizer column (such as Draft RFQ).") + '</div><div class="stl"><div class="str str-h"><span class="grip"></span><span class="swh"></span><span>On the action (done)</span><span>Organizer column (doing)</span><span class="str-k">Kind</span><span class="str-p">Print</span><span class="str-n">#</span><span class="str-x"></span></div>' + ss.map(s => '<div class="str" data-id="' + s.id + '"><span class="grip">⋮⋮</span><input type="color" value="' + esc(s.color) + '"><input class="in" data-n="name" value="' + esc(s.name) + '"><input class="in" data-n="todo" value="' + esc(Store.todo(s)) + '"><select class="in sm">' + [["open", "Normal"], ["hold", "On hold"], ["done", "Completed"]].map(([k, n]) => '<option value="' + k + '"' + (s.kind === k ? " selected" : "") + '>' + n + '</option>').join("") + '</select><label class="str-ck" title="Shown on prints"><input type="checkbox"' + (s.print ? " checked" : "") + ' aria-label="Print"></label><span class="dim">' + Store.all().filter(a => a.stage === s.id).length + '</span><button type="button" class="ic-b sm" title="Delete">✕</button></div>').join("") + '</div>'
      + '<input class="in" data-k="new" placeholder="+ Add a stage, then Enter">';
    $$(".str[data-id]", body).forEach(r => { const s = Store.stage(r.dataset.id);
      $("input[type=color]", r).onchange = e => up(s, () => s.color = e.target.value);
      $("[data-n=name]", r).onchange = e => e.target.value.trim() && up(s, () => s.name = e.target.value.trim());
      $("[data-n=todo]", r).onchange = e => e.target.value.trim() && up(s, () => s.todo = e.target.value.trim());
      $("select", r).onchange = e => up(s, () => s.kind = e.target.value);
      $("input[type=checkbox]", r).onchange = e => up(s, () => s.print = e.target.checked);
      $(".ic-b", r).onclick = async () => { const others = Store.stages().filter(x => x.id !== s.id); if (!others.length) return; const n = Store.all().filter(a => a.stage === s.id).length;
        if (!await confirmBox("Delete “" + s.name + "”?" + (n ? " Its " + n + " action(s) move to “" + others[0].name + "”." : ""), "Delete", true)) return;
        Store.mutate(["config"].concat(Store.projects().map(p => "a:" + p.id)), () => { Store.all().filter(a => a.stage === s.id).forEach(a => { a.stage = others[0].id; Store.touch(a); }); s.del = true; Store.touch(s); }); }; });
    sortable($(".stl", body), () => Store.S.config.stages, ".str[data-id]");
    $("[data-k=new]", body).onkeydown = e => { const v = e.target.value.trim(); if (e.key !== "Enter" || !v) return; Store.mutate("config", () => { const A = Store.S.config.stages, at = A.findIndex(x => !x.del && x.kind !== "open"), s = Store.touch({ id: "st" + uid(), name: v, color: "#64748b", kind: "open", print: true }); at < 0 ? A.push(s) : A.splice(at, 0, s); Store.S.config.mod = now(); }); }; }

  const hit = (...xs) => smartHit(xs.join(" "), App.q);
  const section = () => sec;
  const open = k => { sec = k; lsSet("adDvSec", k); if (OTHER.includes(k)) lsSet("adDvOther", k); };
  return { section, open, render, filters, fcount, place, pf };
})();
