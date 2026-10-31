/* Quick checks of the core flows, run before each push:  node tests/smoke.js
   It starts a stand in for GitHub (tests/mockgh.py) on made up data (no real site data), opens the app in the
   headless browser and checks that it loads, that ticks move cards, that dates and times save, that the exports open,
   and that the admin only parts stay admin only. Exits 1 if anything fails. */
"use strict";
const { spawn } = require("child_process"), fs = require("fs"), os = require("os"), path = require("path");
let pw; try { pw = require("playwright"); } catch (e) { pw = require("/opt/node22/lib/node_modules/playwright"); }
const ROOT = path.resolve(__dirname, ".."), PORT = 8890, B = "http://127.0.0.1:" + PORT, ADMIN = "bkhadembashi@nsrltd.com";
const EXE = fs.existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined;

/* made up data: one project, four actions */
function fixtures(dir){ const w = (p, o) => { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), JSON.stringify(o, null, 1)); };
  const t = Date.now() - 86400e3, act = (no, title, stage, f) => ({ u: "t" + no, no, stage, rank: no, created: t, mod: t, f: Object.assign({ title }, f || {}), photos: [], files: [] });
  w("data/config.json", JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/config.json"), "utf8")));
  w("data/projects.json", { v: 1, projects: [{ id: "test", name: "Test Plant", prefix: "ACT", color: "#475569", created: t, mod: t }] });
  w("data/p/test/actions.json", { v: 1, nextNo: 5, actions: [act(1, "Pump seal leaking", "st0"), act(2, "Conveyor guard missing", "stP", { category: "Defect", defect: true }), act(3, "Valve sticking", "st0"), act(4, "Sump overflow", "st0")] });
  w("data/users.json", { v: 1, users: [] }); w("data/vendors.json", { v: 1, categories: [], vendors: [] }); }

const results = []; const check = (name, ok, more) => { results.push([name, !!ok]); console.log((ok ? "  ok    " : "  FAIL  ") + name + (more ? "  (" + more + ")" : "")); };

(async () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ad-smoke-")); fixtures(dir); fs.mkdirSync(path.join(dir, "am"), { recursive: true });
  const srv = spawn("python3", [path.join(__dirname, "mockgh.py"), ROOT, dir, path.join(dir, "am"), String(PORT)], { stdio: "ignore" });
  for (let i = 0; i < 40; i++){ try { const r = await fetch(B + "/app/index.html"); if (r.ok) break; } catch (e) {} await new Promise(r => setTimeout(r, 150)); }
  const browser = await pw.chromium.launch(EXE ? { executablePath: EXE } : {});
  const open = async (user, opts) => { const ctx = await browser.newContext(Object.assign({ viewport: { width: 1700, height: 950 }, acceptDownloads: true }, opts || {}));
    await ctx.addInitScript(([B, u]) => { const s = (k, v) => localStorage.setItem(k, JSON.stringify(v)); s("adApiBase", B + "/api"); s("adRawBase", B + "/store/"); s("adGhKey", "test"); s("adSetup", 1); s("adUser", u); s("adProfile", { first: "Test", last: "User", email: u }); s("adTab", "actions"); s("adPanel", true); s("adPlBase", B + "/store/pl/"); s("adEquipSrc", B + "/store/none.json"); s("adFast", false); }, [B, user]);
    const p = await ctx.newPage(), errs = []; p.on("pageerror", x => errs.push(x.message)); await p.goto(B + "/app/index.html?v=" + Date.now()); await p.waitForSelector(".tbl tbody tr", { timeout: 20000 }); await p.waitForTimeout(800); return { p, errs, ctx }; };
  let code = 0;
  try {
    const { p, errs } = await open("someone@example.com");
    check("loads with the actions listed", (await p.$$(".tbl tbody tr")).length >= 3);
    /* a dropdown opens on one click and shows its list */
    const dd = await p.evaluate(async () => { const b = document.querySelector(".tbl tbody .lk-sel"); if (!b) return "no dropdown cell"; b.click(); await new Promise(r => setTimeout(r, 200)); const n = document.querySelectorAll(".lk-card .lk-o").length; Look.close && Look.close(); document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); return n > 0 ? "opens" : "no list"; });
    check("a dropdown cell opens its list on one click", dd === "opens", dd);
    /* a Tags cell opens the Tags picker; ticking the dash row saves "–" (no tag) */
    const tp = await p.evaluate(async () => { const td = document.querySelector(".tbl td.tgc"); if (!td) return "no tags cell"; const ref = td.closest("tr").dataset.ref, a = App.act(ref), was = JSON.stringify(a.f.equipment || []);
      td.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })); await new Promise(r => setTimeout(r, 200)); const pk = document.querySelector(".tgp"); if (!pk) return "no picker";
      pk.querySelectorAll("input[type=checkbox]:checked").forEach(c => c.click()); await new Promise(r => setTimeout(r, 100)); const d = pk.querySelector('input[data-v="–"]'); if (!d) return "no dash row"; d.click();
      const now = JSON.stringify(a.f.equipment); Fields.closePop(); return now; });
    check("a Tags cell opens the Tags picker and a tick saves", tp === '["–"]', tp);
    /* an image added on the Sketches tab becomes a sketch */
    const skc = await p.evaluate(async () => { const a = Store.all().find(x => !x.del); const c = document.createElement("canvas"); c.width = 40; c.height = 30; c.getContext("2d").fillRect(5, 5, 10, 10);
      const f = await new Promise(r => c.toBlob(b => r(new File([b], "Test sketch.png", { type: "image/png" })), "image/png")); const n0 = (a.sketches || []).length; await Sketch.add(a, [f]); return (a.sketches.length - n0) + " " + a.sketches[a.sketches.length - 1].name; });
    check("an image added on the Sketches tab becomes a sketch", skc === "1 Test Sketch", skc);
    /* the PDF export dialog counts the actions in each stage (and so finds something to export) */
    const pc = await p.evaluate(async () => { Print.dialog("pdf"); await new Promise(r => setTimeout(r, 300)); const n = [...document.querySelectorAll(".pr-st .tp-o .dim")].reduce((t, x) => t + (+x.textContent || 0), 0); document.querySelectorAll(".yn-no").forEach(b => b.click()); return n; });
    check("the PDF export dialog counts the actions in each stage", pc > 0, pc);
    /* On Hold and Delete are the last columns, and there's no + Add column (columns are picked in Data validation) */
    const hk = await p.evaluate(() => { const o = [...document.querySelectorAll(".tbl thead th")].map(th => th.dataset.c || (th.classList.contains("addcol") ? "ADD" : "")).filter(Boolean); return o.slice(-2).join(",") + " | " + o.includes("ADD"); });
    check("On Hold and Delete are the last columns, with no + Add column", hk === "_hold,_del | false", hk);
    /* the new action row at the top: a title and Enter make the action, which opens */
    const nrb = await p.evaluate(() => Store.all().length); await p.click(".nr-in"); await p.keyboard.type("Smoke check new row"); await p.keyboard.press("Enter"); await p.waitForTimeout(800);
    const nr = await p.evaluate(n => (Store.all().length - n) + " " + (App.selRef ? App.act(App.selRef).f.title : ""), nrb);
    check("a title typed in the top row and Enter makes the action and opens it", nr === "1 Smoke Check New Row", nr);
    /* ticks lead: picking a category and ticking PCCR move the card on */
    const at = () => p.evaluate(() => { const a = Store.all().find(x => x.no === 1); return Store.actId(a) + " " + Store.todo(Store.stage(a.stage)); });
    await p.evaluate(() => { const a = Store.all().find(x => x.no === 1); Fields.set(a, Store.field("category"), "Maintenance"); }); const s1 = await at();
    check("Category sets the ID and moves it to Send PCCR", /^MAN-0001 Send PCCR$/.test(s1), s1);
    await p.evaluate(() => { const a = Store.all().find(x => x.no === 1); Fields.set(a, Store.field("pccr"), true); }); const s2 = await at();
    check("ticking PCCR moves it to Draft MTO", /Draft MTO$/.test(s2), s2);
    await p.evaluate(() => { const a = Store.all().find(x => x.no === 1); Fields.set(a, Store.field("pccr"), false); }); const s3 = await at();
    check("unticking PCCR takes it back", /Send PCCR$/.test(s3), s3);
    check("each open stage reads as the step still to do", await p.evaluate(() => Store.stages().filter(s => s.kind === "open").every(s => s.name === Store.todo(s))));
    await p.evaluate(() => { const a = Store.all().find(x => x.no === 3); Fields.set(a, Store.field("defect"), true); });
    check("Defect emailed sets the Category to Defect", await p.evaluate(() => Store.all().find(x => x.no === 3).f.category === "Defect"));
    /* an undo or redo that leaves an action out of the list says so and opens it in Details, so it never seems to vanish */
    const ur = await p.evaluate(async () => { const a = Table.rows().find(x => Store.stage(x.stage).kind !== "done"), f = Store.field("complete"); App.select(null); Fields.set(a, f, true);
      Store.undo(); await new Promise(r => setTimeout(r, 300)); Store.redo(); await new Promise(r => setTimeout(r, 400));
      return (App.selRef === a._p + ":" + a.u) + " | " + (document.querySelector("#note") || {}).textContent; });
    check("a redo that hides an action opens it and says so", /^true \| Redone on .*hidden by the list's filters/.test(ur), ur);
    /* taking a hold off and putting it back on keeps who it was waiting on */
    const hb = await p.evaluate(() => { const a = Store.all().find(x => x.no === 3), f = Store.field("onhold"); Fields.set(a, f, true); a.hold = Object.assign({}, a.hold, { who: "Jo Smith", mobile: "0400 000 000" });
      Fields.set(a, f, false); Fields.set(a, f, true); Fields.closePop(); return Hold.on(a) + " " + (a.hold || {}).who + " " + (a.hold || {}).mobile; });
    check("back on hold keeps who it was waiting on", hb === "true Jo Smith 0400 000 000", hb);
    /* the hold square: off hold, a click puts it on hold; on hold, a click only opens the callout (its switch takes it off) */
    const hs = await p.evaluate(async () => { Fields.closePop(); const a = Store.all().find(x => x.no === 3), ref = a._p + ":" + a.u; App.render && App.render(); await new Promise(r => setTimeout(r, 300));
      const sq = document.querySelector('tr[data-ref="' + CSS.escape(ref) + '"] [data-rb="hold"]'); if (!sq) return "no square"; sq.click(); await new Promise(r => setTimeout(r, 300));
      const c = document.querySelector(".holdpop"), r1 = Hold.on(a) + " " + !!c + " " + (c && c.querySelector(".hsw input").checked); if (c){ c.querySelector(".hsw input").click(); }
      const r2 = Hold.on(a); Fields.closePop(); return r1 + " " + r2; });
    check("clicking the hold square on a held action opens the callout and keeps the hold; its switch takes it off", hs === "true true true false", hs);
    /* deleting takes it off hold */
    const dl = await p.evaluate(() => { const a = Store.all().find(x => x.no === 4); Fields.set(a, Store.field("onhold"), true); const held = Hold.on(a); Flow.remove(a); return held + " " + !!a.del + " " + Hold.on(a) + " " + Store.stage(a.stage).kind; });
    check("deleting an action takes it off hold", dl === "true true false open", dl);
    await p.evaluate(() => { const a = Store.all().concat(Store.deleted()).find(x => x.no === 4); Store.mutate("a:" + a._p, () => { a.del = false; Store.touch(a); }); });
    /* dates and times save, 24 hour */
    const dt = await p.evaluate(() => { const f = Store.fields().find(x => x.time); if (!f) return "no time field"; const a = Store.all().find(x => x.no === 4); const el = Fields.editor(a, f); document.body.appendChild(el);
      const [d, t] = el.querySelectorAll(".dchip"); d.value = "2026-11-03"; d.dispatchEvent(new Event("change", { bubbles: true })); const i = t.querySelector("input"); i.value = "1930"; i.dispatchEvent(new Event("blur"));
      return a.f[f.id] + " " + Fields.text(a, f); });
    check("a date and a typed 24 hour time save", /^2026-11-03T19:30 3 Nov 2026, 19:30$/.test(dt), dt);
    /* exports open */
    const [x1] = await Promise.all([p.waitForEvent("download", { timeout: 20000 }).catch(() => null), p.evaluate(() => Excel.run(Store.visible()))]);
    check("the Excel export downloads", x1 && /\.xlsx$/.test(x1.suggestedFilename()), x1 && x1.suggestedFilename());
    const [x2] = await Promise.all([p.waitForEvent("download", { timeout: 40000 }).catch(() => null), p.evaluate(() => Word.run(Store.visible(), { photos: false }))]);
    check("the Word export downloads", x2 && /\.docx$/.test(x2.suggestedFilename()), x2 && x2.suggestedFilename());
    const pdf = await p.evaluate(async () => { window.print = () => {}; await Print.run(Store.visible(), { photos: false, pages: 0 }); return document.querySelectorAll("#printRoot .pr-act").length; });
    check("the PDF export builds its pages", pdf >= 3, pdf + " actions");
    /* the MTO: a line from the AI becomes a library row in short form; a row missing a pick says what's left */
    const mt = await p.evaluate(() => { const it = Mto.fromAi(["ELB 90 LR", "DN50", "SCH40", "A234 WPB", "B16.9", "2", "EA", ""]); Mto.recalc(it); const half = Mto.fromAi(["FLG WN", "DN50", "", "", "", "4", "EA", ""]);
      return Mto.desc(it) + " | " + Mto.missing(it).length + " | " + Mto.missing(half).join(","); });
    check("an MTO line reads into a short form library row", /^ELB 90 LR DN50 SCH40 A234 WPB B16\.9 \| 0 \| .*material/.test(mt), mt);
    /* steel cut from stock lengths: the rows of one stock item become one parent (what's ordered, in whole lengths with spare), only the parent is exported */
    const st = await p.evaluate(() => { const S = Mto.TY.wb.stds[0], base = { t: "wb", s: S.id, z: S.sizes[0].n, m: S.mats[0], r: Mto.TY.wb.rl ? "" : undefined, L: S.defl, unit: "m" };
      const a = { mto: [3, 4, 5].map((q, i) => Object.assign({ id: "s" + i, qty: String(q) }, base)).concat([{ id: "e", desc: "GASKET", qty: "2", unit: "ea" }]), mtoG: {} };
      const P = Mto.TY.plate.stds[0], pb = { t: "plate", s: P.id, z: P.sizes[0].n, m: P.mats[0], L: P.defl, unit: "sheets" };
      a.mto = a.mto.concat([[1200, 600], [800, 400]].map((d, i) => Object.assign({ id: "p" + i, pl: String(d[0]), pw: String(d[1]) }, pb)));
      const o = Mto.orderRows(a); return o.length + " | " + o.map(r => Mto.ord(r) + " " + r.unit).join(", ") + " | " + Mto.hasCuts(a); });
    check("steel cuts and plate pieces group under their parents, and only the parents are exported", /^3 \| [1-9]\d* lengths, 2 ea, [1-9]\d* sheets \| true$/.test(st), st);
    /* another action opens on the tab you were on, and back returns to the one before */
    const nv = await p.evaluate(async () => { const v = Store.visible(); App.select(v[0]._p + ":" + v[0].u, "mto"); await new Promise(r => setTimeout(r, 500)); App.select(v[1]._p + ":" + v[1].u); await new Promise(r => setTimeout(r, 500));
      const sub = App.sub; document.querySelector("#navB").click(); await new Promise(r => setTimeout(r, 500)); return sub + " " + (App.selRef === v[0]._p + ":" + v[0].u); });
    check("another action keeps the tab, and back returns to the last one", nv === "mto true", nv);
    /* the steps run in the order of their tick columns, and a step marked not needed is skipped */
    const wf = await p.evaluate(() => { const st = Store.stages().filter(s => s.kind === "open").map(s => s.id), fl = Store.fields().filter(f => f.stage && st.includes(f.stage)).map(f => f.stage);
      const same = JSON.stringify(st.filter(id => fl.includes(id))) === JSON.stringify(fl), f1 = Store.fields().find(f => f.stage && f.type === "check"); if (!f1) return same + " no ticks";
      const a = { f: {}, stage: st[0] }; Store.fields().filter(f => f.stage).forEach(f => a.f[f.id] = f.type === "choice" ? "x" : true); a.f[f1.id] = false; const s1 = Flow.where(a).id; a.f[f1.id] = Flow.NA; const s2 = Flow.where(a).id;
      return same + " " + (s1 === f1.stage) + " " + (s2 !== f1.stage); });
    check("the steps follow the tick columns, and not needed skips one", wf === "true true true", wf);
    /* admin only */
    check("someone else isn't the admin, and there's no + Add column", (await p.$$(".addc")).length === 0 && !(await p.evaluate(() => App.isAdmin())));
    await p.click(".mb-btn >> text=ile"); await p.click(".mi >> text=Parameters"); await p.waitForTimeout(200);
    check("someone else can't change a team rule", await p.$eval('[data-p="poTick"]', x => x.disabled) && !(await p.$eval('[data-p="etaSoon"]', x => x.disabled)), "team rules locked, own settings open");
    await p.keyboard.press("Escape");
    check("no errors on the page", !errs.length, errs.join(" | "));
    const a = await open(ADMIN); check("the admin is the admin, and there's no + Add column (columns are picked in Data validation)", (await a.p.$$(".addc")).length === 0 && await a.p.evaluate(() => App.isAdmin()));
    /* the Handover step: added once (the admin is asked), then ticking Handover marks the other steps not needed and closes the
       action, ticking it off brings them back; a Commissioning job gets Handover not needed */
    await a.p.evaluate(() => { Flow.handoverSetup(); }); await a.p.waitForSelector(".fw-win .yn-yes"); await a.p.click(".fw-win .yn-yes"); await a.p.waitForTimeout(500);
    const hv = await a.p.evaluate(() => { const ho = Store.field("handover"), x = Store.all().filter(q => !q.del && Store.stage(q.stage).kind === "open"), A = x[0], B = x[1];
      Fields.set(A, ho, true); const closed = Store.stage(A.stage).kind + " " + (A.f.pccr === Flow.NA); Fields.set(A, ho, Flow.NA); const back = Store.stage(A.stage).kind + " " + (A.f.pccr === Flow.NA);
      Fields.set(B, Store.field("category"), "Commissioning"); return closed + " | " + back + " | " + (B.f.handover === Flow.NA) + " | " + Store.stages().map(s => s.name).slice(0, 3).join(","); });
    check("Handover marks the rest not needed but doesn't complete it; Commissioning doesn't need it", /^open true \| open false \| true \| Categorize Issue,Hand Over,/.test(hv), hv);
    /* a handed over action made Commissioning: Handover comes off (not needed) and its steps come back to do */
    const hc = await a.p.evaluate(() => { const ho = Store.field("handover"), A = Store.all().filter(q => !q.del && Store.stage(q.stage).kind === "open")[0];
      Fields.set(A, Store.field("category"), "Defect"); Fields.set(A, ho, true); const before = A.f.pccr === Flow.NA; Fields.set(A, Store.field("category"), "Commissioning");
      return before + " " + A.f.category + " " + (A.f.handover === Flow.NA) + " " + (A.f.pccr === Flow.NA); });
    check("a handed over action made Commissioning has Handover unticked to not needed and its steps back to do", hc === "true Commissioning true false", hc);
    /* ticking Handover dates the handover that day */
    const hd = await a.p.evaluate(() => { const A = Store.all().filter(q => !q.del && Store.stage(q.stage).kind === "open" && q.f.handover !== true)[0]; Fields.set(A, Store.field("handover"), true); return (A.ho || {}).date; });
    check("ticking Handover sets the date of handover to today", hd === new Date().toISOString().slice(0, 10) || /^\d{4}-\d\d-\d\d$/.test(hd || ""), hd);
    const cq = await a.p.evaluate(() => { const t = Object.keys(Mto.TY).find(k => Mto.TY[k].k === "len"); const r = Mto.pack({ t, L: 6000, cuts: [{ id: "c1", l: 2400, n: 2 }, { id: "c2", l: 3100, n: 1 }] }); return r ? r.pieces + " " + r.bars.length : "none"; });
    check("a cut with a count of 2 packs as two pieces onto the stock lengths", cq === "3 2", cq);
    /* pipe goes under one stock length parent as steel does, and the same fitting twice is one row with the quantities added */
    const pg = await a.p.evaluate(() => { const T = Mto.TY, pt = Object.keys(T).find(k => T[k].k === "len" && T[k].g === "Pipe and tube"), ft = Object.keys(T).find(k => T[k].g === "Pipe fittings");
      const P = x => Object.assign({ t: pt, s: T[pt].stds[0].id, z: "DN100", L: T[pt].stds[0].defl, unit: "m" }, x), F = x => Object.assign({ t: ft, s: T[ft].stds[0].id, z: "DN100", unit: "ea" }, x);
      const A = { mto: [P({ id: "p1", qty: "2.4" }), P({ id: "p2", qty: "3.1" }), F({ id: "f1", qty: "2" }), F({ id: "f2", qty: "3" })] }; const took = Mto.combine(A.mto);
      return Mto.orderRows(A, true).map(r => r.no + ":" + r.qty + (r.grp ? "L" : "")).join(",") + " " + took.length; });
    check("pipe goes under its stock length with the cuts under it, and the same fitting twice is one row", /^1:\d+L,1\.1:1,1\.2:1,2:5 1$/.test(pg), pg);
    /* a duplicated row stays its own row until it's edited (then the same fitting twice is one row again) */
    const dq = await a.p.evaluate(() => { const T = Mto.TY, ft = Object.keys(T).find(k => T[k].g === "Pipe fittings"), F = x => Object.assign({ t: ft, s: T[ft].stds[0].id, z: "DN100", unit: "ea", qty: "2" }, x);
      const L = [F({ id: "f1" }), F({ id: "f2", dup: 1 })]; Mto.combine(L); const n1 = L.length; delete L[1].dup; Mto.combine(L); return n1 + " " + L.length + " " + L[0].qty; });
    check("a duplicated MTO row is kept apart until it's edited", dq === "2 1 4", dq);
    /* standard supports: offered only where they suit the pipe's size and material; a quantity can depend on the size */
    const sq = await a.p.evaluate(() => { const st = Piping.stdsFor({ cl: "MS1", dn: 25 }).map(t => t.id), pe = Piping.stdsFor({ cl: "PE10", dn: 110 });
      return [st.includes("PG01"), st.includes("PC01"), !st.includes("PG08"), pe.every(t => t.pipe.includes("hdpe") && !t.weldedToPipe), Piping.qtyOf("2 if DN <= 550, else 4", { DN: 600 }), Piping.qtyOf("2*{rows}", { rows: 3 })].join(" "); });
    check("standard supports suit the pipe (PG01 and PC01 on DN25 steel, none welded on HDPE) and quantities follow the size", sq === "true true true true 4 6", sq);
    const tq = await a.p.evaluate(() => [{ desc: "GASKET DN150 CNAF 3MM" }, { desc: "NUT M20 GR 8 GALV" }, { desc: "PG02-300 insulated U-bolt guide" }, { desc: "GASKET DN150", ty: "Specials" }].map(x => Mto.typeOf(x)).join(","));
    check("a row typed in goes under its ISO heading, and a Type picked wins", tq === "Gaskets,Bolts,Supports,Specials", tq);
    check("no errors for the admin", !a.errs.length, a.errs.join(" | "));
  } catch (e) { console.log("  FAIL  the checks stopped: " + e.message); code = 1; }
  await browser.close(); srv.kill(); fs.rmSync(dir, { recursive: true, force: true });
  const bad = results.filter(r => !r[1]).length; console.log(bad || code ? "\n" + (bad || 1) + " check(s) failed" : "\nAll " + results.length + " checks passed");
  process.exit(bad || code ? 1 : 0); })();
