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
  function box(a, ro){ const c = a.rfqCat || "", to = a.rfqTo || [];
    if (!all().length) return '<div class="pt-box vd-box"><div class="pt-bh"><b>Send RFQ to</b></div><div class="dim">No approved vendor list yet. Import it on the Data validation tab, Vendors.</div></div>';
    return '<div class="pt-box vd-box"><div class="pt-bh"><b>Send RFQ to</b><span class="grow"></span>' + (a.rfqCatAI ? '<span class="vd-ai" title="' + esc(a.rfqCatWhy || "") + '">✨ Category picked by Gemini from the MTO</span>' : "") + '</div>'
      + '<div class="vd-row"><label class="fl vd-cat">Vendor category<select class="in" data-k="cat"' + (ro ? " disabled" : "") + '><option value="">' + (hasKey() ? "Pick, or let Gemini suggest" : "Pick a category") + '</option>' + cats().map(x => '<option' + (x.name === c ? " selected" : "") + ' title="' + esc(x.look) + '">' + esc(x.name) + '</option>').join("") + '</select></label>'
      + (ro || !hasKey() ? "" : '<button type="button" class="btn ghost sm vd-sug" data-k="sug" title="Ask Gemini which category fits the MTO">✨ Suggest</button>')
      + '<label class="fl vd-pick">Vendor<div class="combo"><input class="in" data-k="ven" autocomplete="off" placeholder="' + (c ? "Pick from " + inCat(c).length + " approved vendors" : "Search all approved vendors") + '"' + (ro ? " readonly" : "") + '></div></label></div>'
      + (c ? '<div class="dim vd-look">' + esc((cats().find(x => x.name === c) || {}).look || "") + '</div>' : "")
      + '<div class="vd-to">' + (to.length ? to.map(n => { const v = byName(n) || {}; return '<span class="vd-chip" title="' + esc([v.cat, v.ordered, v.po ? v.po + " POs, last " + fmtDate(v.last) : ""].filter(Boolean).join("\n")) + '"><b>' + esc(n) + '</b>' + (v.type ? '<i>' + esc(v.type) + '</i>' : "") + (ro ? "" : '<button type="button" data-x="' + esc(n) + '" title="Remove">✕</button>') + '</span>'; }).join("") : '<span class="dim">No vendors picked yet.</span>') + '</div></div>'; }
  function wire(el, a, ro){ const b = $(".vd-box", el); if (!b || ro || !all().length) return; const key = "a:" + a._p;
    const set = (fn, msg) => { Store.mutate(key, () => { fn(); Store.touch(a); }); if (msg) Store.log(msg); };
    const sel = $("[data-k=cat]", b); if (sel) sel.onchange = () => set(() => { a.rfqCat = sel.value; a.rfqCatAI = false; a.rfqCatWhy = ""; }, "Set the vendor category of " + Store.actId(a));
    const sg = $("[data-k=sug]", b); if (sg) sg.onclick = () => suggest(a, true);
    $$("[data-x]", b).forEach(x => x.onclick = () => set(() => { a.rfqTo = (a.rfqTo || []).filter(n => n !== x.dataset.x); }));
    /* the vendor list: this category first (most used first), then the rest when you type */
    const i = $("[data-k=ven]", b); if (!i) return; let dd = null, hi = 0, res = [];
    const close = () => { dd && dd.remove(); dd = null; };
    const draw = () => { const q = i.value.trim().toLowerCase(), w = q.split(/\s+/).filter(Boolean), hit = v => w.every(x => (v.name + " " + v.ordered + " " + v.cat + " " + v.aka).toLowerCase().includes(x));
      const mine = a.rfqCat ? inCat(a.rfqCat).filter(hit) : [], rest = q || !a.rfqCat ? all().filter(v => v.cat !== a.rfqCat && hit(v)).sort((x, y) => (y.po || 0) - (x.po || 0)) : [];
      res = mine.concat(rest).filter(v => !(a.rfqTo || []).includes(v.name)).slice(0, 60); close(); if (!res.length) return; hi = Math.min(hi, res.length - 1);
      dd = h('<div class="is-dd vd-dd">' + res.map((v, k) => (k === mine.length && mine.length && rest.length ? '<div class="vd-sep">Other categories</div>' : "") + '<button type="button" class="vd-o' + (k === hi ? " on" : "") + '" data-k="' + k + '"><b>' + esc(v.name) + '</b><span>' + esc(v.ordered) + '</span><small>' + esc(v.cat !== a.rfqCat ? v.cat : (v.po || 0) + " PO" + (v.po === 1 ? "" : "s")) + '</small></button>').join("") + '</div>');
      document.body.appendChild(dd); const rc = i.getBoundingClientRect(); dd.style.left = Math.max(8, Math.min(rc.left, innerWidth - 620)) + "px"; dd.style.width = Math.max(rc.width, 600) + "px";
      const below = innerHeight - rc.bottom > 280; dd.style.top = (below ? rc.bottom + 3 : Math.max(8, rc.top - 283)) + "px";
      $$(".vd-o", dd).forEach(o => o.onmousedown = e => { e.preventDefault(); pick(res[+o.dataset.k]); }); };
    const pick = v => { close(); i.value = ""; set(() => { a.rfqTo = (a.rfqTo || []).concat(v.name); if (!a.rfqCat){ a.rfqCat = v.cat; a.rfqCatAI = false; } }, "Added " + v.name + " to the RFQ of " + Store.actId(a)); };
    i.onfocus = () => draw(); i.oninput = () => { hi = 0; draw(); }; i.onblur = () => setTimeout(close, 120);
    i.onkeydown = e => { if (dd && (e.key === "ArrowDown" || e.key === "ArrowUp")){ e.preventDefault(); hi = (hi + (e.key === "ArrowDown" ? 1 : -1) + res.length) % res.length; $$(".vd-o", dd).forEach((o, k) => o.classList.toggle("on", k === hi)); const o = $$(".vd-o", dd)[hi]; o && o.scrollIntoView({ block: "nearest" }); }
      else if (e.key === "Enter"){ e.preventDefault(); if (dd && res[hi]) pick(res[hi]); } else if (e.key === "Escape"){ e.stopPropagation(); close(); i.blur(); } };
    /* first time the MTO is opened with items and no category: let Gemini pick one */
    if (hasKey() && !a.rfqCat && (a.mto || []).length && !asked.has(a.u)) suggest(a, false); }

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
  function page(body, ro){ const q = (App.q || "").toLowerCase().split(/\s+/).filter(Boolean), hit = v => q.every(x => (v.name + " " + v.cat + " " + v.ordered + " " + v.type).toLowerCase().includes(x));
    const list = all().filter(hit).sort((a, b) => a.cat.localeCompare(b.cat) || (b.po || 0) - (a.po || 0));
    body.innerHTML = '<div class="dv-h">Approved vendors <span class="dim">' + all().length + ' vendors in ' + cats().length + ' categories' + (V().source ? ", from " + esc(V().source) : "") + (V().updated ? ", " + esc(fmtDate(V().updated)) : "") + '</span></div>'
      + '<p class="dim">These are the vendors offered on an action\'s MTO tab. To update them, import the latest Approved Vendor List spreadsheet: it replaces the list for everyone.</p>'
      + (ro ? "" : '<button type="button" class="btn ghost sm" data-k="imp">Import approved vendor list (Excel)…</button>')
      + '<table class="tbl ct vd-tbl"><thead><tr><th>Vendor</th><th>Category</th><th>Supply type</th><th>What we have ordered from them</th><th>POs</th><th>Last PO</th></tr></thead><tbody>'
      + list.slice(0, 600).map(v => '<tr><td><b>' + esc(v.name) + '</b></td><td>' + esc(v.cat) + '</td><td>' + esc(v.type) + '</td><td>' + esc(v.ordered) + '</td><td>' + (v.po || "") + '</td><td>' + esc(fmtDate(v.last)) + '</td></tr>').join("") + '</tbody></table>';
    const b = $("[data-k=imp]", body); if (b) b.onclick = () => pickFile(".xlsx", false, importFile); }
  async function importFile(file){ if (!file) return; if (!Store.S.edit) return App.viewOnly();
    try { const book = await Excel.read(file), sheets = Object.values(book);
      const find = (need) => { for (const rows of sheets){ const hi = rows.findIndex(r => r && need.every(n => r.some(c => String(c || "").trim().toUpperCase() === n))); if (hi >= 0) return { rows, hi, col: n => rows[hi].findIndex(c => String(c || "").trim().toUpperCase() === n) }; } return null; };
      const d = find(["CATEGORY", "VENDOR"]); if (!d) throw new Error("No sheet has CATEGORY and VENDOR columns.");
      const C = { cat: d.col("CATEGORY"), name: d.col("VENDOR"), type: d.col("SUPPLY TYPE"), ordered: d.col("WHAT WE HAVE ORDERED FROM THEM"), po: d.col("PO COUNT"), first: d.col("FIRST PO"), last: d.col("LAST PO"), aka: d.col("NAMES USED IN PO REGISTER") };
      const g = (r, k) => C[k] >= 0 && r[C[k]] != null ? r[C[k]] : "";
      const vendors = d.rows.slice(d.hi + 1).filter(r => r && g(r, "name") && g(r, "cat")).map(r => ({ name: String(g(r, "name")).trim(), cat: String(g(r, "cat")).trim(), type: String(g(r, "type")).trim(), ordered: String(g(r, "ordered")).trim(), po: +g(r, "po") || 0, first: Excel.xlDate(g(r, "first")), last: Excel.xlDate(g(r, "last")), aka: String(g(r, "aka")).trim() }))
        .filter(v => !/non procurement/i.test(v.cat));
      const qg = find(["CATEGORY", "LOOK HERE FOR"]), look = {}; if (qg) qg.rows.slice(qg.hi + 1).forEach(r => { if (r && r[qg.col("CATEGORY")]) look[String(r[qg.col("CATEGORY")]).trim()] = String(r[qg.col("LOOK HERE FOR")] || "").trim(); });
      const categories = [...new Set((qg ? Object.keys(look) : []).concat(vendors.map(v => v.cat)))].filter(c => vendors.some(v => v.cat === c)).map(name => ({ name, look: look[name] || "" }));
      if (!await confirmBox("Replace the approved vendor list with " + vendors.length + " vendors in " + categories.length + " categories from " + file.name + "?", "Replace")) return;
      Store.mutate("vendors", () => { Store.S.vendors = { v: 1, source: file.name, updated: new Date().toISOString().slice(0, 10), categories, vendors }; }); Store.log("Imported the approved vendor list " + file.name);
      note("Imported " + vendors.length + " approved vendors"); }
    catch (e){ console.error(e); alert("Couldn't import the vendor list: " + e.message); } }
  return { box, wire, suggest, page, importFile, byName };
})();
