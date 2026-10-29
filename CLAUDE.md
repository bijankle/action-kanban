# Working on Action Database

How the owner (Bijan) likes this app built. These come from many rounds of building it together; follow them unless he says otherwise in the moment.

## How to work with him

- Before any visual change, show previews first: an interactive artifact with the options side by side (usually 3, or 5 when asked), each at real size and in its real place in the app, light and dark. Build only the one he picks. Number the options so he can reply "option 2".
- Change only what he explicitly asks for. Many of his comments just confirm you understood; they are not change requests.
- When something is ambiguous, ask short questions with clear options and a recommended default (he often ends with "Qs?"). When he doesn't answer, go with the recommendation and say so.
- Explain things plainly, as to a mechanical engineer. Replies: bold capital headers, plain paragraphs, tables are fine, no dashes or hyphens in prose.
- Re-show pending choices with their preview links when he asks what's outstanding; he loses track of old previews.
- Before each push run the quick checks, `node tests/smoke.js` (made up data, no real site data; about a minute), and add a check when a core flow changes.
- After each change: bump the version (`sed -i 's/1\.10\.N/1.10.N+1/g' index.html version.json js/app.js`), commit, push, and report what was tested.

## Look and feel

- One look everywhere: when a style is picked (the (i) symbol, dropdowns, date boxes, buttons), apply it across the whole app, not just where it was asked about.
- Three type styles only: big header (`--fh`), small header (`--fs`: section and field names, column headings) and body (`--fb`: all other text, tables, boxes, pills). Never a font size in px; they all follow the text size setting.
- Every control is 28px high (boxes, buttons, tabs, chips); tick boxes 18px. Don't change heights when restyling. Inside tables it's different (below).
- Tables, every one the same (compact, like Outlook's compact view and Excel): 22px rows, 13px text, a faint line between every cell. Cells are square and edge to edge (no rounded boxes). Fills: filled in by hand (typed or picked) white; filled in by the app faint blue (white once typed over); needed and still empty faint orange (`--need`; only cells that are really needed: Category, Tags (– when there is no tag), steps still to tick; never Notes). No hint text in empty table cells. Buttons in a row (hold, done, delete, duplicate, ✕) are square cells of the grid with the symbol in the middle. Tick columns are one square cell each (the cell is the tick: green ✓ done, grey – not needed), headed by one word set on end with an (i) for the rest. The number column is always # and as narrow as its numbers. Nothing in a table ever wraps or makes a row taller: text that does not fit stays on one line and ends in "more…" (gridCols does this for every table). Dropdown cells are strict lists (only what's in the list), one click opens them, Excel style. Short lists (12 or fewer) number their choices [1] to [9] in the open list only, so the arrow then a number picks one. The selected action has no fill, just a 2px slate edge round the whole row (lighter slate in dark); a dropdown's arrow sits flush in its cell and an open dropdown gets no thick edge. A handed over, complete or deleted action has one line straight through its whole row. Use the `--row`, `--edf`, `--autof` tokens in css/app.css.
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
- Every table behaves like the Actions list, with no exceptions: click a heading to sort (again to reverse), columns fit their contents with no blank space, drag an edge to resize, double click it to fit, drag a heading to move the column. Use `gridCols(table, key, opts)` in util.js for any new table; it does all of this.
- Every Data validation tab has the Filters side bar on the left, with the search and pills that make sense for that list (Suppliers by category, Contacts by company).
- Columns fit their contents on open and as the contents change, except columns whose values come from a fixed list (the ID, Category, any dropdown): those are as wide as their widest possible value, so changing one never shifts the columns; long text columns (Title, Notes) share the spare width; a column the user drags keeps its width until the app is reopened. Everything (including ID and Title) can be dragged to reorder.
- Clicking beside a small control (a tick box) opens a short card about it with a link to where it's worked on; pointing at it can show the same card.
- Data stays trustworthy: one source of truth, nothing changes silently, and anything that changes other data asks first and lists exactly what will change. The Actions list ticks lead; the Organizer follows them.
- Steps have three states where it makes sense: done, not needed, not done yet.
- Handover is the tick for a handed over action (Defect, Punchlist, Operations, Maintenance): ticking it marks the other steps not needed and it waits in Hand Over; unticking brings them back. Complete is always ticked by hand, when the work is physically done; nothing completes an action by itself. The Category only sets what it is. Commissioning jobs get Handover not needed (if it was ticked, it comes off and the steps it marked not needed come back to do, with a note saying so). Every tick column has a pill in the Filters panel's Ticked group. A handed over action's Details shows Handover in place of Contractor: Handed to, Their mobile, Company (as on the On hold card, but its own), Date of handover (the day it's ticked) and Note; Contractor stays for the rest.
- Rules and presets live in File, Parameters, per person; the defaults are what he has tuned. Settings shared by everyone (photo quality) are admin only (bkhadembashi@nsrltd.com).
- One ETA for the whole order (set on the MTO tab), never line by line. The Parts ETA card is a snug summary: when it's due (or overdue by how many days), who from, and counts like 12 × piping items, 1 × structural item; every line one row high.
- All exports in File, Export (Excel, PDF, Word), with quick buttons above the list too.

- Details (Overview): left is Problem, Solution, Tags, Notes, Attachments (three to a row, Attach file one third wide), Contractor; right is Photos then Record (Action owner, dates, last change). No ticks, Category, Location or hold/complete/delete buttons there (they're in the list); the title sits right of the ID.

## More of the same spirit

- Nothing pops up or moves under the user: switching tabs never opens something on its own (the Organizer opens laid out in full), and background redraws wait while they're typing or picking.
- No flashing or noisy status: save state is a quiet dot on the save button, not a changing banner.
- Fast to open: show the copy kept on the computer at once, refresh from GitHub behind it.
- Infer the obvious (Defect emailed sets the Category, the equipment's WBS sets the Location, a quote ticks RFQ sent) but always let it be overridden, and make each such rule a switch in File, Parameters.
- Model the real workflow, not an idealised one: ask how the job is actually done on site (who ticks what, when the quote comes back, jobs handed to Ops or Maintenance) before designing the rule.
- Plain, active step names that say what's done next ("Send RFQ", not "Draft RFQ"; "Categorize Issue").
- Symbols over words where the meaning is obvious (a gear for mech equipment, a bolt for electrical), with the word in the tooltip.
- Pointing shows, clicking pins: hover cards can also be clicked to stay open, with a ✕.
- Uploads look the same everywhere: a slim dashed bar, one box high, that you can click or drop onto. Photos as even 4:3 tiles you can drag to reorder, with a bin on each; in Details they sit at the top of the right column, about 150px wide, with Record under them.
- Avoid accidental triggers: no single key shortcuts that create things; deletes ask first.
- Exports read well on paper: A4 portrait, blanks and unticked boxes left out, links that work without signing in, no browser header or footer.
- The app remembers where you were: the last action viewed, the tab inside it (next and previous keep the tab), panel widths and filters.
- He can't comment on preview pages from this session; he replies in chat, and loses track of old ones, so keep pending choices listed with their links.

## Technical notes

- Plain JS globals, no build step: App, Store, Fields, Flow, Table, Kanban, ActionView, Media, Print, Word, Parts, Vendors, Hold, Drawings, Equip.
- Data lives in the separate repo bijankle/action-kanban-data (data/config.json etc.); set `mod` on a changed stage or field and on the file.
- The live site is a Cloudflare worker (cloudflare/worker.js), pasted into the dashboard by hand; say when it needs re-pasting.
- Avoid the class name `ph` on anything new: `.ph` is the photo grid and its styles leak (it has bitten twice).
