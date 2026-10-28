/* The approved vendor list (data/vendors.json, imported from the Approved Vendor List spreadsheet) and the
   "Send RFQ to" box on an action's MTO tab. With a Gemini key the vendor category is picked from the MTO
   items; without one the category is picked by hand. Either way the vendor list then shows that category's
   vendors, most used first, and picking a vendor first fills in its category. */
"use strict";
const Vendors = (() => {
  const V = () => Store.vendors(), cats = () => V().categories || [], all = () => V().vendors || [];
  const inCat = c => all().filter(v => v.cat === c).sort((a, b) => (b.po || 0) - (a.po || 0) || a.name.localeCompare(b.name));
  const byName = n => all().find(v => v.name.toLowerCase() === String(n || "").toLowerCase());
  const asked = new Set();   // actions Gemini has already been asked about this session
  const hasKey = () => !!(lsGet("adGemKey", "") || "").trim();

  /* ---------- the box on the MTO tab ---------- */
  /* the RFQ's who: category and supplier, each label on the line with its box (the boxes line up); more rows can follow (the ETA).
     The suppliers picked show in the Supplier box itself, by name; its list has them ticked at the top, with their contact details */
  function box(a, ro, more){ const c = a.rfqCat || "", to = a.rfqTo || [];
    if (!all().length) return '<div class="vd-box"><div class="dim">No approved vendor list yet. Import it on the Data validation tab, Suppliers.</div></div>' + (more ? '<div class="pt-g">' + more + '</div>' : "");
    return '<div class="vd-box pt-g">'
      + '<label class="pt-lab" for="vdCat">Supplier category</label><select class="in" id="vdCat" data-k="cat"' + (ro ? " disabled" : "") + '><option value="">Pick a category</option>' + cats().map(x => '<option' + (x.name === c ? " selected" : "") + ' title="' + esc(x.look) + '">' + esc(x.name) + '</option>').join("") + '</select>'
      + '<label class="pt-lab" for="vdVen">Supplier</label><div class="combo"><input class="in" id="vdVen" data-k="ven" autocomplete="off" value="' + esc(to.join(", ")) + '" placeholder="' + (c ? "Pick from " + inCat(c).length + " approved suppliers" : "Search all approved suppliers") + '"' + (ro ? " readonly" : "") + ' title="' + esc(to.length ? to.join("\n") + "\nClick to add or remove, and for contact details" : "") + '"></div>'
      + (more || "") + '</div>'; }
  function wire(el, a, ro){ const b = $(".vd-box", el); if (!b || !all().length) return; const key = "a:" + a._p;
    $$("[data-vd]", b).forEach(x => x.onclick = () => details(x.dataset.vd, x)); if (ro) return;
    const set = (fn, msg) => { Store.mutate(key, () => { fn(); Store.touch(a); }); if (msg) Store.log(msg); };
    const sel = $("[data-k=cat]", b); if (sel) sel.onchange = () => set(() => { a.rfqCat = sel.value; a.rfqCatAI = false; a.rfqCatWhy = ""; }, "Set the vendor category of " + Store.actId(a));
    const sg = $("[data-k=sug]", b); if (sg) sg.onclick = () => suggest(a, true);
    $$("[data-x]", b).forEach(x => x.onclick = () => set(() => { a.rfqTo = (a.rfqTo || []).filter(n => n !== x.dataset.x); }));
    /* the vendor list: this category first (most used first), then the rest when you type */
    const i = $("[data-k=ven]", b); if (!i) return; let dd = null, hi = 0, res = [];
    const close = () => { dd && dd.remove(); dd = null; };
    const draw = () => { const q = i.value.trim().toLowerCase(), w = qWords(q), hit = v => smartHit(v.name + " " + v.ordered + " " + v.cat + " " + v.aka, w);
      const mine = a.rfqCat ? inCat(a.rfqCat).filter(hit) : [], rest = q || !a.rfqCat ? all().filter(v => v.cat !== a.rfqCat && hit(v)).sort((x, y) => (y.po || 0) - (x.po || 0)) : [];
      const on = (a.rfqTo || []).map(byName).filter(Boolean).filter(hit); res = on.concat(mine.concat(rest).filter(v => !(a.rfqTo || []).includes(v.name))).slice(0, 60); close(); if (!res.length) return; hi = Math.min(hi, res.length - 1);
      const picked = v => (a.rfqTo || []).includes(v.name), nOn = on.length, nMine = mine.filter(v => !picked(v)).length;
      dd = h('<div class="is-dd vd-dd">' + res.map((v, k) => (k === 0 && nOn ? '<div class="vd-sep">On the RFQ <span class="dim">click to take off</span></div>' : "") + (k === nOn && nOn && res.length > nOn ? '<div class="vd-sep">' + (nMine ? "Add" : "Other categories") + '</div>' : "") + (k === nOn + nMine && nMine && rest.length ? '<div class="vd-sep">Other categories</div>' : "")
        + '<button type="button" class="vd-o' + (k === hi ? " on" : "") + (picked(v) ? " vd-on" : "") + '" data-k="' + k + '"><b>' + (picked(v) ? "✓ " : "") + esc(v.name) + '</b><span>' + esc(v.ordered) + '</span><small>' + (picked(v) ? '<span class="vd-det' + (v.contact || v.email || v.phone ? "" : " bad") + '" data-vd="' + esc(v.name) + '">' + esc(v.contact || v.email || v.phone || "Add contact details") + '</span>' : esc(v.cat !== a.rfqCat ? v.cat : (v.po || 0) + " PO" + (v.po === 1 ? "" : "s"))) + '</small></button>').join("") + '</div>');
      document.body.appendChild(dd); const rc = i.getBoundingClientRect(); dd.style.left = Math.max(8, Math.min(rc.left, innerWidth - 620)) + "px"; dd.style.width = Math.max(rc.width, 600) + "px";
      const below = innerHeight - rc.bottom > 280; dd.style.top = (below ? rc.bottom + 3 : Math.max(8, rc.top - 283)) + "px";
      $$(".vd-o", dd).forEach(o => o.onmousedown = e => { e.preventDefault(); const d = e.target.closest("[data-vd]"); if (d){ close(); i.blur(); details(d.dataset.vd, i); return; } pick(res[+o.dataset.k]); }); };
    const pick = v => { close(); i.value = ""; if ((a.rfqTo || []).includes(v.name)){ set(() => { a.rfqTo = a.rfqTo.filter(n => n !== v.name); }, "Took " + v.name + " off the RFQ of " + Store.actId(a)); return; }
      set(() => { a.rfqTo = (a.rfqTo || []).concat(v.name); if (!a.rfqCat){ a.rfqCat = v.cat; a.rfqCatAI = false; } }, "Added " + v.name + " to the RFQ of " + Store.actId(a)); };
    /* (the box shows the names picked; clicking into it is for searching, and leaving it puts the names back) */
    i.onfocus = () => { i.value = ""; draw(); }; i.oninput = () => { hi = 0; draw(); }; i.onblur = () => setTimeout(() => { close(); if (document.activeElement !== i) i.value = (a.rfqTo || []).join(", "); }, 120);
    i.onkeydown = e => { if (dd && (e.key === "ArrowDown" || e.key === "ArrowUp")){ e.preventDefault(); hi = (hi + (e.key === "ArrowDown" ? 1 : -1) + res.length) % res.length; $$(".vd-o", dd).forEach((o, k) => o.classList.toggle("on", k === hi)); const o = $$(".vd-o", dd)[hi]; o && o.scrollIntoView({ block: "nearest" }); }
      else if (e.key === "Enter"){ e.preventDefault(); if (dd && res[hi]) pick(res[hi]); } else if (e.key === "Escape"){ e.stopPropagation(); close(); i.blur(); } };
    }

  /* Gemini picks the vendor category that fits the MTO items */
  async function suggest(a, loud){ asked.add(a.u); const items = (a.mto || []).map(it => [it.desc, it.part, it.qty && it.qty + " " + (it.unit || ""), it.notes].filter(Boolean).join(", ")).filter(Boolean);
    if (!items.length) return loud && note("Add the MTO items first, then Gemini can pick the category");
    if (loud) note("Asking Gemini for the vendor category…", 8000);
    try { const out = await Intake.ask("A maintenance team at a processing plant needs to send a request for quotation for these items:\n" + items.map(x => "- " + x).join("\n")
        + "\n\nAction: " + (a.f.title || "") + "\n\nPick the ONE vendor category that best fits the items, from this list (name: what it covers):\n" + cats().map(c => c.name + ": " + c.look).join("\n")
        + '\n\nReturn ONLY JSON: {"category": the category name exactly as written above, "reason": a short reason, under 15 words}.');
      const c = cats().find(x => x.name.toLowerCase() === String(out.category || "").trim().toLowerCase()); if (!c) throw new Error("Gemini's answer wasn't one of the categories");
      if (a.rfqCat === c.name && a.rfqCatAI) return loud && note("Gemini still suggests " + c.name);
      Store.mutate("a:" + a._p, () => { a.rfqCat = c.name; a.rfqCatAI = true; a.rfqCatWhy = String(out.reason || ""); Store.touch(a); }); Store.log("Gemini picked the vendor category of " + Store.actId(a));
      note("✨ Gemini picked “" + c.name + "”" + (out.reason ? ": " + out.reason : ""), 6000); }
    catch (e){ if (loud) alert("Gemini couldn't pick a category: " + e.message); else console.warn(e); } }

  /* ---------- the Vendors page on the Data validation tab ---------- */
  function page(body, ro){ const hit = v => smartHit(v.name + " " + v.cat + " " + v.ordered + " " + v.type, App.q);
    const list = Valid.pf("vendors", all().filter(hit)).sort((a, b) => a.cat.localeCompare(b.cat) || (b.po || 0) - (a.po || 0));
    /* (just the list: the import is the upload symbol in the toolbar above) */
    body.innerHTML = '<div class="tw-wrap"><table class="tbl ct vd-tbl"><thead><tr><th>Supplier</th><th>Category</th><th>Supply type</th><th>What we have ordered from them</th><th data-col="po">POs</th><th data-col="last">Last PO</th><th data-col="ct">Contact</th></tr></thead><tbody>'
      + list.slice(0, 600).map(v => '<tr><td><b>' + esc(v.name) + '</b></td><td>' + esc(v.cat) + '</td><td>' + esc(v.type) + '</td><td>' + esc(v.ordered) + '</td><td>' + (v.po || "") + '</td><td>' + esc(fmtDate(v.last)) + '</td><td><button type="button" class="link vd-det' + (v.contact || v.email || v.phone ? "" : " dim") + '" data-vd="' + esc(v.name) + '">' + esc([v.contact, v.phone, v.email].filter(Boolean).join(", ") || (ro ? "" : "Add")) + '</button></td></tr>').join("") + '</tbody></table></div>'; gridCols($(".vd-tbl", body), "vendors", { fixed: { po: 60, last: 110 }, max: 700 });
    $$("[data-vd]", body).forEach(x => x.onclick = () => details(x.dataset.vd, x)); }
  /* a vendor's contact details, which go on the RFQ: who to send it to, their phone, email and address */
  const DET = [["contact", "Contact person"], ["phone", "Phone"], ["email", "Email"], ["address", "Address"]];
  function details(name, anchor){ const v = byName(name); if (!v) return; Fields.closePop(); const ro = !Store.S.edit;
    const p = h('<div class="pop vd-pop"><b>' + esc(v.name) + '' + tipI("These go on the RFQ, under To. Everyone shares them.") + '</b>'
      + DET.map(([k, l]) => '<label class="fl">' + l + (k === "address" ? '<textarea class="in" rows="2" data-k="' + k + '"' + (ro ? " readonly" : "") + '>' + esc(v[k] || "") + '</textarea>' : '<input class="in" data-k="' + k + '" type="' + (k === "email" ? "email" : k === "phone" ? "tel" : "text") + '" value="' + esc(v[k] || "") + '"' + (ro ? " readonly" : "") + '>') + '</label>').join("")
      + (ro ? "" : '<div class="yn-btns"><button type="button" class="yn-yes" data-k="ok">Save</button></div>') + '</div>');
    document.body.appendChild(p); Fields.place(p, anchor); const r = p.getBoundingClientRect(); if (r.bottom > innerHeight - 8) p.style.top = Math.max(8, innerHeight - r.height - 8) + "px"; if (r.right > innerWidth - 8) p.style.left = Math.max(8, innerWidth - r.width - 8) + "px";
    const ok = $("[data-k=ok]", p); if (ok) ok.onclick = () => { const o = {}; DET.forEach(([k]) => o[k] = $('[data-k="' + k + '"]', p).value.trim());
      if (DET.some(([k]) => (v[k] || "") !== o[k])){ Store.mutate("vendors", () => { DET.forEach(([k]) => { if (o[k]) v[k] = o[k]; else delete v[k]; }); }); Store.log("Edited the contact details of " + v.name); }
      Fields.closePop(); };
    $$("input", p).forEach(i => i.onkeydown = e => { if (e.key === "Enter" && ok) ok.click(); if (e.key === "Escape") Fields.closePop(); });
    setTimeout(() => $("input", p).focus(), 0); }
  /* the To lines on the RFQ */
  const lines = name => { const v = byName(name) || { name }; return [v.name, v.contact && "Attn: " + v.contact, v.phone && "Phone " + v.phone, v.email, v.address].filter(Boolean); };
  async function importFile(file){ if (!file) return; if (!Store.S.edit) return App.viewOnly();
    try { const book = await Excel.read(file), sheets = Object.values(book);
      const find = (need) => { for (const rows of sheets){ const hi = rows.findIndex(r => r && need.every(n => r.some(c => String(c || "").trim().toUpperCase() === n))); if (hi >= 0) return { rows, hi, col: n => rows[hi].findIndex(c => String(c || "").trim().toUpperCase() === n) }; } return null; };
      const d = find(["CATEGORY", "VENDOR"]); if (!d) throw new Error("No sheet has CATEGORY and VENDOR columns.");
      const C = { cat: d.col("CATEGORY"), name: d.col("VENDOR"), type: d.col("SUPPLY TYPE"), ordered: d.col("WHAT WE HAVE ORDERED FROM THEM"), po: d.col("PO COUNT"), first: d.col("FIRST PO"), last: d.col("LAST PO"), aka: d.col("NAMES USED IN PO REGISTER"),
        contact: ["CONTACT", "CONTACT NAME", "CONTACT PERSON"].map(d.col).find(i => i >= 0) ?? -1, phone: ["PHONE", "MOBILE", "PHONE NUMBER"].map(d.col).find(i => i >= 0) ?? -1, email: ["EMAIL", "E-MAIL", "EMAIL ADDRESS"].map(d.col).find(i => i >= 0) ?? -1, address: ["ADDRESS"].map(d.col).find(i => i >= 0) ?? -1 };
      const g = (r, k) => C[k] >= 0 && r[C[k]] != null ? r[C[k]] : "";
      const vendors = d.rows.slice(d.hi + 1).filter(r => r && g(r, "name") && g(r, "cat")).map(r => ({ name: String(g(r, "name")).trim(), cat: String(g(r, "cat")).trim(), type: String(g(r, "type")).trim(), ordered: String(g(r, "ordered")).trim(), po: +g(r, "po") || 0, first: Excel.xlDate(g(r, "first")), last: Excel.xlDate(g(r, "last")), aka: String(g(r, "aka")).trim() }))
        .filter(v => !/non procurement/i.test(v.cat));
      /* contact details: from the sheet when it has them, else kept from the list being replaced */
      d.rows.slice(d.hi + 1).forEach(r => { const n = r && String(g(r, "name")).trim(), v = n && vendors.find(x => x.name === n); if (!v) return; const old = byName(n) || {};
        ["contact", "phone", "email", "address"].forEach(k => { const x = String(g(r, k) || "").trim() || old[k]; if (x) v[k] = x; }); });
      const qg = find(["CATEGORY", "LOOK HERE FOR"]), look = {}; if (qg) qg.rows.slice(qg.hi + 1).forEach(r => { if (r && r[qg.col("CATEGORY")]) look[String(r[qg.col("CATEGORY")]).trim()] = String(r[qg.col("LOOK HERE FOR")] || "").trim(); });
      const categories = [...new Set((qg ? Object.keys(look) : []).concat(vendors.map(v => v.cat)))].filter(c => vendors.some(v => v.cat === c)).map(name => ({ name, look: look[name] || "" }));
      if (!await confirmBox("Replace the approved vendor list with " + vendors.length + " vendors in " + categories.length + " categories from " + file.name + "?", "Replace")) return;
      Store.mutate("vendors", () => { Store.S.vendors = { v: 1, source: file.name, updated: new Date().toISOString().slice(0, 10), categories, vendors }; }); Store.log("Imported the approved vendor list " + file.name);
      note("Imported " + vendors.length + " approved vendors"); }
    catch (e){ console.error(e); alert("Couldn't import the vendor list: " + e.message); } }
  const pickImport = () => { if (!Store.S.edit) return App.viewOnly(); pickFile(".xlsx", false, importFile); };
  return { pickImport, box, wire, suggest, page, importFile, byName, lines, details, all };
})();
