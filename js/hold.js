/* On Hold: who it's waiting on, their mobile and since when. An action on hold shows an i button beside its status
   (in the list, the Details panel and on the Organizer card); the button is red while the person, their mobile or the
   date is missing. Clicking it opens a small form. Whoever it waits on goes into the running contact list (Data
   validation, Contacts), so at handover anyone can find them and chase them up. Moving an action to On Hold starts a
   fresh record dated today and opens the form. */
"use strict";
const Hold = (() => {
  let pending = null;
  const on = a => Store.stage(a.stage).kind === "hold";
  const rec = a => a.hold || {};
  const missing = a => { const h = rec(a); return ["who", "mobile", "since"].filter(k => !String(h[k] || "").trim()); };
  const NAMES = { who: "who it's waiting on", mobile: "their mobile", since: "the date" };
  function btn(a){ if (!on(a)) return ""; const m = missing(a), h = rec(a), ref = a._p + ":" + a.u;
    const tip = m.length ? "On hold: add " + m.map(k => NAMES[k]).join(", ") : "On hold since " + fmtDate(h.since) + ", waiting on " + h.who + " (" + h.mobile + ")";
    return '<button type="button" class="hold-i' + (m.length ? " bad" : "") + '" data-hold="' + esc(ref) + '" title="' + esc(tip) + '" aria-label="' + esc(tip) + '">i</button>'; }
  /* moving to On Hold (Store.enter): a new record, and the form opens once the screen has redrawn */
  function entered(a){ a.hold = { since: new Date().toISOString().slice(0, 10) }; pending = a._p + ":" + a.u; }
  function after(){ if (!pending) return; const ref = pending; pending = null; setTimeout(() => { const b = $('[data-hold="' + CSS.escape(ref) + '"]'); if (b) open(ref, b); }, 60); }
  function open(ref, anchor){ const a = App.act(ref); if (!a) return; Fields.closePop(); const h = rec(a), ro = !Store.S.edit;
    const p = h_('<div class="pop holdpop"><b>On hold' + tipI("Who is it waiting on? They go into the contact list so whoever picks this up can chase them.") + '</b>'
      + '<label class="fl">Waiting on<input class="in" data-k="who" list="holdNames" autocomplete="off" value="' + esc(h.who || "") + '" placeholder="Name"' + (ro ? " readonly" : "") + '></label>'
      + '<datalist id="holdNames">' + Store.contacts().map(c => '<option value="' + esc(c.name) + '">' + esc([c.company, c.mobile].filter(Boolean).join(" · ")) + '</option>').join("") + '</datalist>'
      + '<label class="fl">Their mobile<input class="in" data-k="mobile" type="tel" value="' + esc(h.mobile || "") + '"' + (ro ? " readonly" : "") + '></label>'
      + '<label class="fl">Company <span class="dim">optional</span><input class="in" data-k="company" value="' + esc(h.company || "") + '"' + (ro ? " readonly" : "") + '></label>'
      + '<label class="fl">On hold since<input class="in" data-k="since" type="date" value="' + esc(h.since || "") + '"' + (ro ? " readonly" : "") + '></label>'
      + '<label class="fl">Due back' + tipI("When it should come back to us.") + '<input class="in" data-k="due" type="date" value="' + esc(h.due || "") + '"' + (ro ? " readonly" : "") + '></label>'
      + '<label class="fl">Note' + tipI("Why it's on hold.") + '<textarea class="in" data-k="why" rows="3" placeholder="e.g. waiting on the vendor\'s revised quote for the hoses"' + (ro ? " readonly" : "") + '>' + esc(h.why || "") + '</textarea></label>'
      + (ro ? "" : '<div class="yn-btns"><button type="button" class="yn-yes" data-k="ok">Save</button></div>') + '</div>');
    document.body.appendChild(p); Fields.place(p, anchor); const pr = p.getBoundingClientRect(); if (pr.bottom > innerHeight - 8) p.style.top = Math.max(8, innerHeight - pr.height - 8) + "px";
    const v = k => $('[data-k="' + k + '"]', p).value.trim(), who = $('[data-k="who"]', p);
    /* picking a known person fills in their mobile and company */
    who.oninput = () => { const c = Store.contacts().find(x => x.name.toLowerCase() === who.value.trim().toLowerCase()); if (c){ const m = $('[data-k="mobile"]', p), co = $('[data-k="company"]', p); if (!m.value) m.value = c.mobile || ""; if (!co.value) co.value = c.company || ""; } };
    const ok = $('[data-k="ok"]', p); if (ok) ok.onclick = () => { save(a, { who: v("who"), mobile: v("mobile"), company: v("company"), since: v("since"), due: v("due"), why: v("why") }); Fields.closePop(); };
    $$("input", p).forEach(i => i.onkeydown = e => { if (e.key === "Enter" && ok) ok.click(); if (e.key === "Escape") Fields.closePop(); });
    setTimeout(() => (who.value ? $('[data-k="' + (missing(a)[0] || "who") + '"]', p) : who).focus(), 0); }
  function save(a, h){ if (!Store.S.edit) return App.viewOnly();
    Store.mutate("a:" + a._p, () => { a.hold = h; Store.touch(a); Store.log("On hold details for " + Store.actId(a));
      /* into the running contact list: a new person, or a known one's missing mobile or company */
      if (h.who){ const list = Store.S.config.contacts, c = list.find(x => !x.del && x.name.toLowerCase() === h.who.toLowerCase());
        if (!c){ const [first, ...rest] = h.who.split(/\s+/); list.push(Store.touch({ id: uid(), name: h.who, first, last: rest.join(" "), company: h.company || "", mobile: h.mobile || "", email: "" })); Store.S.dirty.add("config"); }
        else if ((!c.mobile && h.mobile) || (!c.company && h.company)){ if (!c.mobile) c.mobile = h.mobile; if (!c.company) c.company = h.company; Store.touch(c); Store.S.dirty.add("config"); } } }); }
  const h_ = s => { const t = document.createElement("template"); t.innerHTML = s.trim(); return t.content.firstChild; };
  document.addEventListener("click", e => { const b = e.target.closest("[data-hold]"); if (!b) return; e.preventDefault(); e.stopPropagation(); open(b.dataset.hold, b); }, true);
  return { btn, entered, after, open, missing, on };
})();
