/* New action window. Type it in, or paste a dump of text (an email, a message) and Google Gemini splits it
   into the fields. Anything the text doesn't say is left empty. Check it over, then Create. */
"use strict";
const Intake = (() => {
  const BASE = "https://generativelanguage.googleapis.com/v1beta";
  async function model(key){ const c = lsGet("adGemModel", null); if (c && c.k === key.slice(-6) && now() - c.t < 7 * 864e5) return c.m;
    const r = await fetch(BASE + "/models?pageSize=200&key=" + encodeURIComponent(key)); if (!r.ok) throw new Error(r.status === 400 || r.status === 403 ? "Gemini refused the key. Check it in File, Settings (make one free at aistudio.google.com)." : "Gemini error " + r.status);
    const names = ((await r.json()).models || []).filter(m => (m.supportedGenerationMethods || []).includes("generateContent")).map(m => m.name.replace(/^models\//, ""));
    const ver = n => { const m = n.match(/^gemini-(\d+(?:\.\d+)?)-/); return m ? parseFloat(m[1]) : 0; };
    const best = names.filter(n => /^gemini-\d+(\.\d+)?-flash$/.test(n)).sort((a, b) => ver(b) - ver(a))[0] || (names.includes("gemini-flash-latest") ? "gemini-flash-latest" : names.find(n => /flash/.test(n))) || names[0];
    if (!best) throw new Error("This Gemini key has no models available."); lsSet("adGemModel", { k: key.slice(-6), m: best, t: now() }); return best; }
  const SKIP = new Set(["status", "priority", "mto", "sparelist"]);
  async function split(text){ const key = (lsGet("adGemKey", "") || "").trim(); if (!key) throw new Error("Add your Gemini key in File, Settings first (it's free from aistudio.google.com).");
    const fs = Store.fields().filter(f => !SKIP.has(f.id));
    const desc = fs.map(f => { let d = '"' + f.id + '": ' + f.label + " (" + (TYPES[f.type] || f.type) + ")";
      if (f.type === "choice") d += ", one of: " + Fields.optLabels(f).concat(f.tbc ? ["TBC"] : [], f.na ? ["N/A"] : []).join(" | ");
      if (f.type === "multi") d += ", a JSON array of strings" + (Fields.optLabels(f).length ? "; reuse these existing values where they match: " + Fields.optLabels(f).slice(0, 300).join(" | ") : "");
      if (f.type === "check") d += ", true or false"; if (f.type === "date") d += ", as YYYY-MM-DD";
      if (f.type === "contact") d += Store.contacts().length ? "; if it's one of these known people use the name exactly: " + Store.contacts().map(c => c.name + (c.company ? " (" + c.company + ")" : "")).slice(0, 300).join(" | ") : "";
      return d; }).join("\n");
    const prompt = "You turn a pasted email or note into one maintenance action for an action tracker at a processing plant.\n"
      + "Return ONLY a JSON object with these keys:\n" + desc + '\n"stage": the best matching stage, one of: ' + Store.stages().map(s => s.name).join(" | ")
      + "\n\nRules: \"title\" is a short summary of the problem and the fix, under 12 words. \"problem\" describes what is wrong. \"solution\" describes what will be done or was proposed."
      + " If the text doesn't give a value, use an empty string (or false, or an empty array). Do not guess. Only use \"TBC\" where the text itself says it is to be confirmed. Keep the writer's technical terms and equipment tag numbers exactly."
      + "\n\nTEXT:\n" + text;
    return ask(prompt); }
  /* send a prompt to Gemini, get JSON back */
  async function ask(prompt){ const key = (lsGet("adGemKey", "") || "").trim(); if (!key) throw new Error("Add your Gemini key in File, Settings first (it's free from aistudio.google.com).");
    const m = await model(key);
    const r = await fetch(BASE + "/models/" + m + ":generateContent?key=" + encodeURIComponent(key), { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.2 } }) });
    if (!r.ok){ let msg = "Gemini error " + r.status; try { msg += ": " + (await r.json()).error.message; } catch (e) {} if (r.status === 404) lsSet("adGemModel", null); throw new Error(msg); }
    const j = await r.json(); const t = (((j.candidates || [])[0] || {}).content || {}).parts; const s = t && t.map(p => p.text || "").join("");
    try { return JSON.parse(String(s).replace(/^```(json)?|```$/g, "").trim()); } catch (e){ throw new Error("Gemini's answer couldn't be read, try again."); } }
  /* tidy what came back: only allowed values, empty where unknown */
  function clean(o){ const v = {}; Store.fields().filter(f => !SKIP.has(f.id)).forEach(f => { let x = o[f.id];
      if (x == null || x === "") return;
      if (f.type === "check"){ v[f.id] = x === true || /^(yes|true|y)$/i.test(String(x)); return; }
      if (f.type === "multi"){ x = Array.isArray(x) ? x : String(x).split(/[,;]\s*/); x = x.map(s => String(s).trim()).filter(Boolean); if (!x.length) return;
        const ex = Fields.optLabels(f); v[f.id] = x.map(s => ex.find(e => e.toLowerCase() === s.toLowerCase()) || s); return; }
      x = String(x).trim(); if (!x) return;
      if (f.type === "choice"){ const ok = Fields.optLabels(f).concat(f.tbc ? ["TBC"] : [], f.na ? ["N/A"] : []); const m = ok.find(e => e.toLowerCase() === x.toLowerCase()); if (m) v[f.id] = m; return; }
      if (f.type === "date" && !/^\d{4}-\d\d-\d\d$/.test(x) && x !== "TBC" && x !== "N/A") return;
      v[f.id] = x; });
    const st = Store.stages().find(s => s.name.toLowerCase() === String(o.stage || "").toLowerCase()); return { vals: v, stage: st && st.id }; }

  function open(stageId, startText){ if (!Store.S.edit) return App.viewOnly();
    const ps = Store.projects(); if (!ps.length){ alert("Make a project first: the project box, then All projects, then New project."); return; }
    const sel = Store.selected(), last = lsGet("adLastProj", sel[0]), pid0 = sel.includes(last) ? last : sel[0];
    const m = modal('<h3>New action</h3><div class="nw-tabs"><button type="button" class="on" data-t="type">Type it</button><button type="button" data-t="paste">Paste text, Gemini fills it in</button></div>'
      + '<div class="nw-paste" hidden><textarea class="in ta" rows="9" placeholder="Paste an email or note here…"></textarea><div class="nw-pb"><button type="button" class="btn" data-k="gem">Split into fields</button><span class="dim nw-msg"></span></div></div>'
      + '<div class="nw-form"></div><div class="yn-btns"><label class="fl in-row">Project <select class="in sm" data-k="proj">' + ps.map(p => '<option value="' + p.id + '"' + (p.id === pid0 ? " selected" : "") + '>' + esc(p.name) + '</option>').join("") + '</select></label><span class="grow"></span><button class="yn-no" type="button">Cancel</button><button class="yn-yes" type="button">Create</button></div>', { cls: "nw-win", sticky: true });
    let vals = {}, stage = stageId || Store.stages()[0].id;
    const form = $(".nw-form", m), draw = full => { const fs = Store.fields().filter(f => !SKIP.has(f.id) && (full || ["title", "problem", "solution"].includes(f.id)));
      form.innerHTML = '<label class="fl">Stage <select class="in" data-k="stage">' + Store.stages().map(s => '<option value="' + s.id + '"' + (s.id === stage ? " selected" : "") + '>' + esc(s.name) + '</option>').join("") + '</select></label>'
        + fs.map(f => { const v = vals[f.id]; let i;
          if (f.type === "longtext") i = '<textarea class="in ta" rows="3" data-f="' + f.id + '">' + esc(v || "") + '</textarea>';
          else if (f.type === "choice") i = '<select class="in' + (v === "TBC" ? " tbc" : "") + '" data-f="' + f.id + '"><option></option>' + Fields.optLabels(f).concat(f.tbc ? ["TBC"] : [], f.na ? ["N/A"] : []).map(o => '<option' + (o === v ? " selected" : "") + '>' + esc(o) + '</option>').join("") + '</select>';
          else if (f.type === "check") i = '<input type="checkbox" data-f="' + f.id + '"' + (v ? " checked" : "") + '>';
          else i = '<input class="in' + (v === "TBC" ? " tbc" : "") + '" data-f="' + f.id + '" type="' + (f.type === "date" && (!v || /^\d{4}-/.test(v)) ? "date" : "text") + '" value="' + esc(Array.isArray(v) ? v.join(", ") : v || "") + '"' + (f.type === "multi" ? ' placeholder="Separate with commas"' : "") + '>';
          return '<label class="fl' + (f.type === "check" ? " in-row" : "") + '">' + esc(f.label) + i + '</label>'; }).join("") + (full ? "" : '<button type="button" class="link" data-k="more">Show all fields</button>');
      const mo = $("[data-k=more]", form); if (mo) mo.onclick = () => { read(); draw(true); };
      $$("textarea", form).forEach(t => { Fields.grow(t); t.oninput = () => Fields.grow(t); }); const t = $("[data-f=title]", form); t && !full && t.focus(); };
    const read = () => { const s = $("[data-k=stage]", form); if (s) stage = s.value; $$("[data-f]", form).forEach(i => { const f = Store.field(i.dataset.f); let v = i.type === "checkbox" ? i.checked : i.value.trim();
        if (f.type === "multi") v = v ? v.split(/\s*,\s*/).filter(Boolean) : []; if (v === "" || (Array.isArray(v) && !v.length) || v === false) delete vals[f.id]; else vals[f.id] = v; }); };
    draw(false);
    $$(".nw-tabs button", m).forEach(b => b.onclick = () => { $$(".nw-tabs button", m).forEach(x => x.classList.toggle("on", x === b)); $(".nw-paste", m).hidden = b.dataset.t !== "paste"; if (b.dataset.t === "paste") $(".nw-paste textarea", m).focus(); });
    $("[data-k=gem]", m).onclick = async () => { const tx = $(".nw-paste textarea", m).value.trim(), msg = $(".nw-msg", m); if (!tx) return; const b = $("[data-k=gem]", m); b.disabled = true; msg.textContent = "Asking Gemini…";
      try { const r = clean(await split(tx)); vals = r.vals; if (r.stage) stage = r.stage; draw(true); msg.textContent = "Done. Check the fields below, then Create."; }
      catch (e){ msg.textContent = e.message; } finally { b.disabled = false; } };
    if (startText){ $$(".nw-tabs button", m)[1].click(); $(".nw-paste textarea", m).value = startText; }
    $(".yn-no", m).onclick = () => m.close();
    $(".yn-yes", m).onclick = () => { read(); const pid = $("[data-k=proj]", m).value; lsSet("adLastProj", pid);
      if (!Store.selected().includes(pid)) Store.setSelected(Store.selected().concat(pid));
      let a; Store.mutate("a:" + pid, () => { a = Store.newAction(pid, vals, stage); }); Store.log("Created " + Store.actId(a)); m.close(); App.select(pid + ":" + a.u); }; }
  return { open, split, clean, ask };
})();
