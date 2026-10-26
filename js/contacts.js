/* The Contacts section of the Data validation tab: everyone the team deals with (first name, last name, company, mobile, email), in the settings with
   the actions (config.contacts), so every computer has the same list. It grows by itself: a contractor contact or the
   person an action on hold is waiting on is added when they're first typed in. Click a person to see everything
   outstanding on them: the actions on hold waiting on them, with since when and when it's due, and the open actions
   they're the contractor contact for. Import fills the list from an Excel contact list (Name or First and Last name,
   Company, Mobile, Email); anyone already in the list by name or email is updated, not doubled. */
"use strict";
const Contacts = (() => {
  let sort = { k: "first", dir: 1 };
  /* the Filters panel on this tab: companies (pick one or more) and whether anything is outstanding on them */
  const F = (() => { const s = lsGet("adCtF", {}) || {}; return { co: new Set(s.co || []), ow: new Set(s.ow || []) }; })();
  const keepF = () => lsSet("adCtF", { co: [...F.co], ow: [...F.ow] }), NOCO = "No company";
  const coOf = c => String(c.company || "").trim() || NOCO, owOf = c => owed(c).n ? "Something outstanding" : "Nothing outstanding";
  const pass = (c, skip) => (skip === "co" || !F.co.size || F.co.has(coOf(c))) && (skip === "ow" || !F.ow.size || F.ow.has(owOf(c)));
  const searched = () => list().filter(c => smartHit([c.first, c.last, c.company, c.mobile, c.email].join(" "), App.q));
  const MINCO = 10; let allCo = false;
  function filters(el){ const base = searched(), cnt = (k, v) => base.filter(c => pass(c, k) && (k === "co" ? coOf(c) : owOf(c)) === v).length;
    /* only the companies with plenty of people (MINCO or more) get a pill; the rest wait behind more… (a picked one always shows) */
    const tot = new Map(); list().forEach(c => tot.set(coOf(c), (tot.get(coOf(c)) || 0) + 1));
    const all = [...tot.keys()].sort((a, b) => a === NOCO ? 1 : b === NOCO ? -1 : a.localeCompare(b)), few = all.filter(v => v !== NOCO && tot.get(v) < MINCO && !F.co.has(v));
    const cos = allCo ? all : all.filter(v => !few.includes(v));
    const grp = (k, name, vals) => '<div class="fg2" data-k="' + k + '"><div class="fgh"><span>' + name + '</span>' + (F[k].size ? '<button type="button" class="link fclr">Clear</button>' : "") + '</div>'
      + vals.map(v => { const n = cnt(k, v), on = F[k].has(v); if (!n && !on) return ""; return '<button type="button" class="pill fpill' + (on ? " on" : "") + (v === NOCO ? " ns" : "") + '" data-v="' + esc(v) + '" aria-pressed="' + on + '">' + esc(v) + ' <b>' + n + '</b></button>'; }).join("") + '</div>';
    let body = $(".fp-groups", el); if (!body){ body = document.createElement("div"); body.className = "fp-groups"; el.appendChild(body); }
    const shown = base.filter(c => pass(c)).length;
    body.innerHTML = grp("ow", "Outstanding", ["Something outstanding", "Nothing outstanding"]) + grp("co", "Company", cos).replace(/<\/div>$/, few.length ? '<button type="button" class="link fco-more">' + (allCo ? "fewer" : few.length + " more…") + '</button></div>' : "</div>") + '<p class="dim fshown">' + shown + " of " + list().length + " people shown" + (F.co.size || F.ow.size ? ' <button type="button" class="link fall">Clear all</button>' : "") + '</p>';
    $$(".fg2", body).forEach(g => { const k = g.dataset.k; g.onclick = e => { const b = e.target.closest(".fpill"); if (b){ const v = b.dataset.v; F[k].has(v) ? F[k].delete(v) : F[k].add(v); keepF(); App.render(); } if (e.target.closest(".fclr")){ F[k].clear(); keepF(); App.render(); } }; });
    const fm = $(".fco-more", body); if (fm) fm.onclick = () => { allCo = !allCo; App.render(); };
    const fa = $(".fall", body); if (fa) fa.onclick = () => { F.co.clear(); F.ow.clear(); keepF(); App.render(); }; }
  const fcount = () => F.co.size + F.ow.size + ((App.q || "").trim() ? 1 : 0);
  const split = n => { const p = String(n || "").trim().split(/\s+/); return { first: p.shift() || "", last: p.join(" ") }; };
  const full = c => [c.first, c.last].filter(Boolean).join(" ") || c.name || "";
  /* (contacts from before had one name; they show as first and last) */
  const norm = c => (c.first == null && c.last == null) ? Object.assign(c, split(c.name)) : c;
  const list = () => Store.contacts().map(norm);
  const same = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
  const today = () => new Date().toISOString().slice(0, 10);
  /* what's outstanding on a person */
  function owed(c){ const n = full(c), open = a => Store.stage(a.stage).kind !== "done";
    const hold = Store.visible().filter(a => Hold.on(a) && a.hold && same(a.hold.who, n));
    const con = Store.visible().filter(a => open(a) && !hold.includes(a) && same(a.f.contractorContact, n));
    return { hold, con, n: hold.length + con.length }; }
  function render(el){ const ro = !Store.S.edit;
    const all = list(), cs = searched().filter(c => pass(c))
      .sort((a, b) => String(a[sort.k] || "").localeCompare(String(b[sort.k] || ""), undefined, { sensitivity: "base", numeric: true }) * sort.dir || full(a).localeCompare(full(b)));
    const COLS = [["first", "First name"], ["last", "Last name"], ["company", "Company"], ["mobile", "Mobile"], ["email", "Email"]];
    el.innerHTML = '<div class="cts"><table class="tbl cts-t"><thead><tr>' + COLS.map(([k, n]) => '<th data-s="' + k + '" data-col="' + k + '"><span class="th-l">' + n + (sort.k === k ? (sort.dir > 0 ? " ▲" : " ▼") : "") + '</span></th>').join("") + '<th class="cts-o" data-col="ow"><span class="th-l">Outstanding</span></th><th class="cts-x" data-col="x"></th></tr></thead><tbody>'
      + (ro ? "" : '<tr class="ct-new">' + COLS.map(([k, n]) => '<td><input class="in" data-k="' + k + '" placeholder="' + (k === "first" ? "+ New person" : n) + '"></td>').join("") + '<td></td><td><button type="button" class="btn sm" data-k="add">Add</button></td></tr>')
      + cs.map(c => { const o = owed(c); return '<tr data-id="' + esc(c.id) + '">' + COLS.map(([k]) => '<td>' + (ro ? (k === "first" || k === "last" ? '<button type="button" class="link ct-who">' + esc(c[k] || "") + '</button>' : esc(c[k] || "")) : '<input class="in" data-k="' + k + '" value="' + esc(c[k] || "") + '">') + '</td>').join("")
        + '<td class="cts-o"><button type="button" class="ct-n' + (o.n ? " on" : "") + '" title="See what\'s outstanding on ' + esc(full(c)) + '">' + (o.n ? o.n + " action" + (o.n === 1 ? "" : "s") : "None") + '</button></td>'
        + '<td class="cts-x">' + (ro ? "" : '<button type="button" class="ic-b sm" data-k="del" title="Remove ' + esc(full(c)) + ' from the list">✕</button>') + '</td></tr>'; }).join("")
      + '</tbody></table>' + (cs.length ? "" : '<div class="empty">' + (all.length ? "No one matches the search." : "No contacts yet. Add someone above, or import a contact list.") + '</div>') + '</div>';
    gridCols($(".cts-t", el), "contacts", { fixed: { x: 52 } });   // (columns fill the width, drag or double click to size)
    $$("th[data-s]", el).forEach(th => th.onclick = () => { const k = th.dataset.s; sort = sort.k === k ? { k, dir: -sort.dir } : { k, dir: 1 }; render(el); });
    $$("tr[data-id]", el).forEach(r => { const c = Store.S.config.contacts.find(x => x.id === r.dataset.id); if (!c) return;
      $$("input", r).forEach(i => i.onchange = () => up(c, () => { c[i.dataset.k] = i.value.trim(); c.name = full(c); }));
      $(".ct-n", r).onclick = () => person(c); $$(".ct-who", r).forEach(b => b.onclick = () => person(c));
      $$("td:nth-child(1) input, td:nth-child(2) input", r).forEach(i => i.ondblclick = () => person(c));
      const d = $("[data-k=del]", r); if (d) d.onclick = async () => { if (!await confirmBox("Remove " + full(c) + " from the contact list? Actions that name them keep the name.", "Remove", true)) return; up(c, () => { c.del = true; }); }; });
    const nr = $(".ct-new", el); if (nr){ const add = () => { const v = k => $("[data-k=" + k + "]", nr).value.trim(); if (!v("first") && !v("last")) return;
        Store.mutate("config", () => { const c = { id: uid(), first: v("first"), last: v("last"), company: v("company"), mobile: v("mobile"), email: v("email") }; c.name = full(c); Store.S.config.contacts.push(Store.touch(c)); }); };
      $("[data-k=add]", nr).onclick = add; $$("input", nr).forEach(i => i.onkeydown = e => { if (e.key === "Enter") add(); }); }
    }
  const pickImport = () => { if (!Store.S.edit) return App.viewOnly(); pickFile(".xlsx", false, importFile); };
  const up = (c, fn) => { if (!Store.S.edit) return App.viewOnly(); Store.mutate("config", () => { fn(); Store.touch(c); }); };
  /* everything outstanding on one person */
  function person(c){ norm(c); const o = owed(c), due = d => d && d < today();
    const row = (a, extra) => '<tr data-ref="' + esc(a._p + ":" + a.u) + '"><td class="aid">' + esc(Store.actId(a)) + '</td><td>' + esc(a.f.title || "") + '</td><td><span class="ps" style="--c:' + esc(Store.stage(a.stage).color) + '">' + esc(Store.stage(a.stage).name) + '</span></td>' + extra + '</tr>';
    const m = modal('<h3>' + esc(full(c)) + '</h3><p class="dim">' + esc([c.company, c.mobile, c.email].filter(Boolean).join("   ·   ") || "No details yet") + '</p>'
      + (o.n ? "" : '<p>Nothing outstanding on them.</p>')
      + (o.hold.length ? '<div class="lbl">On hold, waiting on them</div><table class="tbl pp-t"><thead><tr><th>ID</th><th>Action</th><th>Status</th><th>Since</th><th>Due back</th><th>Note</th></tr></thead><tbody>'
        + o.hold.map(a => row(a, '<td>' + esc(fmtDate(a.hold.since) || "") + '</td><td class="' + (due(a.hold.due) ? "bad" : "") + '">' + (a.hold.due ? esc(fmtDate(a.hold.due)) + (due(a.hold.due) ? " (overdue)" : "") : '<span class="dim">Not set</span>') + '</td><td>' + esc(a.hold.why || "") + '</td>')).join("") + '</tbody></table>' : "")
      + (o.con.length ? '<div class="lbl">Contractor contact on</div><table class="tbl pp-t"><thead><tr><th>ID</th><th>Action</th><th>Status</th><th>Company</th><th>Date on site</th></tr></thead><tbody>'
        + o.con.map(a => row(a, '<td>' + esc(a.f.contractor || "") + '</td><td>' + esc(fmtDate(a.f.contractorDate) || a.f.contractorDate || "") + '</td>')).join("") + '</tbody></table>' : "")
      + '<div class="yn-btns"><button type="button" class="yn-yes" data-k="x">Close</button></div>', { cls: "pp-win" });
    $("[data-k=x]", m).onclick = () => m.close();
    $$("tr[data-ref]", m).forEach(r => r.onclick = () => { m.close(); App.tab = "actions"; lsSet("adTab", "actions"); App.select(r.dataset.ref); }); }
  /* the contact list from Excel */
  async function importFile(file){ if (!file) return; if (!Store.S.edit) return App.viewOnly();
    if (await GH.isPublic() === true && !await confirmBox("The data repository (" + GH.cfg().repo + ") is public, so anyone on the internet could read these phone numbers and emails. Make it private on GitHub first. Import anyway?", "Import anyway", true)) return;
    try { const book = await Excel.read(file); let hit = null;
      for (const rows of Object.values(book)){ const hi = rows.findIndex(r => r && r.some(c => /^(name|first name)$/i.test(String(c || "").trim()))); if (hi >= 0){ hit = { rows, hi }; break; } }
      if (!hit) throw new Error("No sheet has a Name (or First name) column.");
      const head = hit.rows[hit.hi].map(c => String(c || "").trim().toLowerCase()), col = (...ns) => head.findIndex(h => ns.includes(h)), g = (r, i) => i >= 0 && r[i] != null ? String(r[i]).trim() : "";
      const C = { name: col("name", "full name"), first: col("first name", "first"), last: col("last name", "surname", "last"), company: col("company", "organisation", "organization"), mobile: col("mobile", "phone", "mobile number"), email: col("email", "e-mail", "email address") };
      const rows = hit.rows.slice(hit.hi + 1).map(r => { const s = C.first >= 0 ? { first: g(r, C.first), last: g(r, C.last) } : split(g(r, C.name)); return Object.assign(s, { company: g(r, C.company), mobile: g(r, C.mobile), email: g(r, C.email) }); }).filter(r => r.first || r.last);
      let added = 0, updated = 0;
      Store.mutate("config", () => { const L = Store.S.config.contacts;
        rows.forEach(r => { r.name = full(r); const c = L.find(x => !x.del && ((r.email && same(x.email, r.email)) || same(x.name, r.name)));
          if (!c){ L.push(Store.touch(Object.assign({ id: uid() }, r))); added++; return; }
          let ch = false; norm(c); ["first", "last", "company", "mobile", "email"].forEach(k => { if (r[k] && !c[k]){ c[k] = r[k]; ch = true; } }); if (ch){ c.name = full(c); Store.touch(c); updated++; } });
        Store.log("Imported the contact list " + file.name); });
      note("Imported " + rows.length + " contacts: " + added + " new, " + updated + " filled in"); }
    catch (e){ console.error(e); alert("Couldn't import the contact list: " + e.message); } }
  return { render, person, importFile, full, owed, filters, fcount, pickImport };
})();
