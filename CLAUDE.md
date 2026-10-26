# Working on Action Database

How the owner (Bijan) likes this app built. These come from many rounds of building it together; follow them unless he says otherwise in the moment.

## How to work with him

- Before any visual change, show previews first: an interactive artifact with the options side by side (usually 3, or 5 when asked), each at real size and in its real place in the app, light and dark. Build only the one he picks. Number the options so he can reply "option 2".
- Change only what he explicitly asks for. Many of his comments just confirm you understood; they are not change requests.
- When something is ambiguous, ask short questions with clear options and a recommended default (he often ends with "Qs?"). When he doesn't answer, go with the recommendation and say so.
- Explain things plainly, as to a mechanical engineer. Replies: bold capital headers, plain paragraphs, tables are fine, no dashes or hyphens in prose.
- Re-show pending choices with their preview links when he asks what's outstanding; he loses track of old previews.
- After each change: bump the version (`sed -i 's/1\.10\.N/1.10.N+1/g' index.html version.json js/app.js`), commit, push, and report what was tested.

## Look and feel

- One look everywhere: when a style is picked (the (i) symbol, dropdowns, date boxes, buttons), apply it across the whole app, not just where it was asked about.
- Every control is 28px high (boxes, buttons, tabs, chips); tick boxes 18px. Don't change heights when restyling.
- Compact and tight: no redundant headings, labels, counts or "Empty"/"None yet" lines. Space goes to the content.
- Text cut off for length ends in "more…" (opens the full text). The (i) is only for explaining something, not for cut off text.
- Never the browser's own look: no autofill, no datalist, no native date or time pickers. Use the app's own dropdown card, calendar (Monday first, Clear and Today) and a 24 hour time.
- Classic but modern: groups get clear edges so they don't blend into the background (menu strip, tab boxes). Important controls should look important: bold, noticeable, self explanatory.
- Downloads show a page with a down arrow and the type in colour (PDF red, XLS green, DOC blue); uploads an up arrow.
- Status by colour on the thing itself: a small dot plus a faint tint (red overdue or problem, yellow soon, green on track, grey unknown).

## Behaviour

- Smooth and live: anything that depends on a size or a value updates while dragging or typing, never in a jump on release.
- Show the result straight away and finish the slow part behind it (a pasted photo lands in place at once with a progress bar).
- Opening something is for viewing: don't put the cursor in a box until the user clicks one. When they click into text, the cursor goes where they clicked.
- Columns fit their contents on open and as the contents change; long text columns (Title, Notes) share the spare width; a column the user drags keeps its width until the app is reopened. Everything (including ID and Title) can be dragged to reorder.
- Clicking beside a small control (a tick box) opens a short card about it with a link to where it's worked on; pointing at it can show the same card.
- Data stays trustworthy: one source of truth, nothing changes silently, and anything that changes other data asks first and lists exactly what will change. The Actions list ticks lead; the Organizer follows them.
- Steps have three states where it makes sense: done, not needed, not done yet.
- Rules and presets live in File, Parameters, per person; the defaults are what he has tuned. Settings shared by everyone (photo quality) are admin only (bkhadembashi@nsrltd.com).
- All exports in File, Export (Excel, PDF, Word), with quick buttons above the list too.

## Technical notes

- Plain JS globals, no build step: App, Store, Fields, Flow, Table, Kanban, ActionView, Media, Print, Word, Parts, Vendors, Hold, Drawings, Equip.
- Data lives in the separate repo bijankle/action-kanban-data (data/config.json etc.); set `mod` on a changed stage or field and on the file.
- The live site is a Cloudflare worker (cloudflare/worker.js), pasted into the dashboard by hand; say when it needs re-pasting.
- Avoid the class name `ph` on anything new: `.ph` is the photo grid and its styles leak (it has bitten twice).
