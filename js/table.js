/* The Actions tab: one row per action, filtered by the search box and the stage pills.
   Click a row to open it in the side panel. Drag a header to reorder columns, drag its edge to resize. */
"use strict";
const Table = (() => {
  const W = { text: 200, longtext: 260, multi: 170, stage: 170, rank: 74, check: 90, choice: 120, date: 120, contact: 160, phone: 130, number: 90 };
  const widths = () => lsGet("adColW", {});
  function cols(){ const c = [{ id: "_id", label: "ID", type: "id" }]; if (Store.selected().length > 1) c.push({ id: "_proj", label: "Project", type: "proj" });
    return c.concat(Store.fields().filter(f => f.table)); }
  /* what's on show: the projects ticked, the stage pills, the search */
  function rows(){ const q = (App.q || "").trim().toLowerCase(), pills = App.pills; let list = Store.visible();
    if (pills.size) list = list.filter(a => pills.has(a.stage));
    if (q){ const fs = Store.fields(); list = list.filter(a => (Store.actId(a) + " " + fs.map(f => Fields.text(a, f)).join(" ")).toLowerCase().includes(q)); }
    const so = App.sort, ord = new Map(Store.stages().map((s, i) => [s.id, i]));
    const base = (x, y) => (ord.get(x.stage) - ord.get(y.stage)) || (x.rank || 0) - (y.rank || 0) || x.no - y.no;
    if (so && so.id){ const f = Store.field(so.id); const key = a => so.id === "_id" ? Store.actId(a) : so.id === "_proj" ? (Store.project(a._p) || {}).name : f ? (f.type === "rank" ? Fields.val(a, f) : f.type === "stage" ? ord.get(a.stage) : Fields.text(a, f).toLowerCase()) : "";
      list.sort((x, y) => { const kx = key(x), ky = key(y); const r = kx < ky ? -1 : kx > ky ? 1 : 0; return (r * so.dir) || base(x, y); }); }
    else list.sort(base);
    return list; }
  function render(el){ const cs = cols(), ws = widths(), list = rows(), sel = App.selRef;
    const th = cs.map(c => '<th data-c="' + c.id + '" draggable="' + (c.id[0] !== "_") + '" style="width:' + (ws[c.id] || (c.type === "id" ? 96 : c.type === "proj" ? 140 : W[c.type] || 140)) + 'px">'
      + '<span class="th-l">' + esc(c.label) + (App.sort && App.sort.id === c.id ? (App.sort.dir > 0 ? " ▲" : " ▼") : "") + '</span><i class="th-r"></i></th>').join("");
    el.innerHTML = '<div class="tbl-wrap"><table class="tbl"><colgroup></colgroup><thead><tr>' + th + '</tr></thead><tbody></tbody></table>'
      + (list.length ? "" : '<div class="empty">' + (Store.visible().length ? "No actions match the filter." : "No actions yet. Click <b>+ New action</b>, or <b>Paste text</b> to make one from an email.") + '</div>') + '</div>';
    const tb = $("tbody", el), frag = document.createDocumentFragment();
    list.forEach(a => { const ref = a._p + ":" + a.u; const tr = document.createElement("tr"); tr.dataset.ref = ref; if (ref === sel) tr.className = "on";
      cs.forEach(c => { const td = document.createElement("td");
        if (c.type === "id"){ td.innerHTML = '<span class="aid">' + esc(Store.actId(a)) + '</span>' + (a.photos.length ? '<span class="pc" title="' + a.photos.length + ' photos">📷' + a.photos.length + '</span>' : ""); }
        else if (c.type === "proj"){ const p = Store.project(a._p) || {}; td.innerHTML = '<span class="ptag" style="--c:' + esc(p.color || "#64748b") + '">' + esc(p.name || "") + '</span>'; }
        else if (Store.S.edit && ["stage", "rank", "choice", "check"].includes(c.type)){ td.className = "ed"; td.appendChild(Fields.editor(a, c)); }
        else { td.innerHTML = Fields.show(a, c); if (c.id === "title") td.className = "ttl"; }
        tr.appendChild(td); });
      frag.appendChild(tr); });
    tb.appendChild(frag);
    tb.onclick = e => { if (e.target.closest("select,input,label,button,a")) return; const tr = e.target.closest("tr"); if (tr) App.select(tr.dataset.ref); };
    /* files dropped on a row go to that action */
    tb.ondragover = e => { if (![...e.dataTransfer.types].includes("Files")) return; e.preventDefault(); const tr = e.target.closest("tr"); $$("tr.drop", tb).forEach(x => x !== tr && x.classList.remove("drop")); tr && tr.classList.add("drop"); };
    tb.ondragleave = e => { if (!tb.contains(e.relatedTarget)) $$("tr.drop", tb).forEach(x => x.classList.remove("drop")); };
    tb.ondrop = e => { const tr = e.target.closest("tr"); $$("tr.drop", tb).forEach(x => x.classList.remove("drop")); if (!tr || !e.dataTransfer.files.length) return; e.preventDefault(); e.stopPropagation(); const a = App.act(tr.dataset.ref); App.select(tr.dataset.ref); Media.addFiles(a, e.dataTransfer.files); };
    wireHead(el, cs); }
  function wireHead(el, cs){ $$("th", el).forEach(th => { const id = th.dataset.c;
      $(".th-l", th).onclick = () => { App.sort = App.sort && App.sort.id === id ? (App.sort.dir > 0 ? { id, dir: -1 } : null) : { id, dir: 1 }; App.render(); };
      /* resize */
      const r = $(".th-r", th); r.onclick = e => e.stopPropagation();
      r.onpointerdown = e => { e.preventDefault(); e.stopPropagation(); const x0 = e.clientX, w0 = th.offsetWidth; r.setPointerCapture(e.pointerId);
        r.onpointermove = ev => { th.style.width = Math.max(50, w0 + ev.clientX - x0) + "px"; };
        r.onpointerup = () => { r.onpointermove = null; const ws = widths(); ws[id] = th.offsetWidth; lsSet("adColW", ws); }; };
      /* reorder (the field order is shared, it's also the order in the side panel) */
      th.ondragstart = e => { if (id[0] === "_") return e.preventDefault(); e.dataTransfer.setData("text/col", id); th.classList.add("drag"); };
      th.ondragend = () => th.classList.remove("drag");
      th.ondragover = e => { if ([...e.dataTransfer.types].includes("text/col")){ e.preventDefault(); th.classList.add("dover"); } };
      th.ondragleave = () => th.classList.remove("dover");
      th.ondrop = e => { th.classList.remove("dover"); const from = e.dataTransfer.getData("text/col"); if (!from || from === id) return; e.preventDefault();
        Store.mutate("config", () => { const fs = Store.S.config.fields; const a = fs.findIndex(f => f.id === from); const item = fs.splice(a, 1)[0]; let b = fs.findIndex(f => f.id === id); if (b < 0) b = 0; fs.splice(b, 0, item); Store.S.config.mod = now(); Store.touch(item); }); }; }); }
  /* Columns button: which fields show as columns */
  function columnsPop(anchor){ Fields.closePop(); const p = h('<div class="pop colpop"><div class="pop-h">Columns in the table</div>' + Store.fields().filter(f => f.id !== "title").map(f => '<label class="tp-o"><input type="checkbox" data-f="' + f.id + '"' + (f.table ? " checked" : "") + '><span>' + esc(f.label) + '</span></label>').join("") + '<div class="pop-n">Drag the column headers to reorder them.</div></div>');
    document.body.appendChild(p); Fields.place(p, anchor);
    $$("input", p).forEach(c => c.onchange = () => Store.mutate("config", () => { const f = Store.field(c.dataset.f); f.table = c.checked; Store.touch(f); })); }
  return { render, rows, columnsPop };
})();
