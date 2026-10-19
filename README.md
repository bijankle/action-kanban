# Action Database

An action tracker for plant maintenance. It runs from GitHub Pages, so anyone with the link can view the actions and photos, and anyone with a GitHub key that can write to this repo can edit them.

## What it does

The search box sits in the same place on every tab and looks everywhere (every field, notes, MTO and spares rows, photo, file and quote names, contacts); every word typed has to match. On the Organizer board it filters each stage, and cards can still be dragged between stages while filtered. The Actions tab shows every action in the ticked projects, with stage pills, as a list or as tiles (the main photo fills the tile, with arrows to step through its photos and a Size callout for the tile size). Click an action to open it in the side panel, which shows the problem, the solution and a Photos button, followed by the attachments, notes and all other details. Drag the panel's edge to resize it.

The Organizer tab is kept minimal, with one column per stage. Click a card for a callout with its problem, solution and photos; editing is done on the Actions tab. Drag cards between columns and up or down inside a column, where higher means higher priority. You can add, rename, recolour, reorder and delete stages at any time, and mark a stage as on hold or completed.

The Data validation tab sets the type of every field (text, long text, number, date, tick box, choice, tags, contact, phone), its allowed values and colours, whether it offers TBC and N/A, and whether it shows as a table column. It also holds the stages and the contacts list. Picking a contact fills in their number, and a new name typed on an action is added to the contacts.

For photos and files, drop photos, PDFs or Excel files onto an action, or use its Upload button. A pasted screenshot waits in a tray at the bottom left until you drag it onto an action. The Photos button opens a big view with thumbnails of the photos before and after. The full quality original is saved in the local folder chosen at setup, and a compressed copy (Low 1024 px or Medium 1600 px) goes online. Double click a photo for full screen, and press Esc to leave.

The stages start as Issue Identified, Defect Notification Sent, Work Order Created, RFQ Sent, Parts Ordered, Parts Received, On Hold and Completed. A Spare parts available tick box and a Parts receival ETA sit with the other fields.

The workflow shows as steps under each action's title (Issue Identified, Defect Notification Sent, Work Order Created, RFQ Sent, PO Sent, Parts Received, Completed, with On Hold as a toggle): done steps carry the date reached, and clicking a step moves the action; on the Organizer the same stages are the work in progress columns. The MTO tab of each action lists its's material take off as a simple table (item, description, part or tag number, qty, unit, notes); an action with no MTO shows an empty table ready to fill in. The MTO column on the Actions tab says how many items each action has (for example 3 x items), as a link to that action's MTO. Quotes are uploaded at the top (several, for revised quotes) and can be downloaded any time. Each RFQ export to PDF takes the next rev letter (A, B, C…) and every rev is kept in RFQ revisions for download. The Spares tab works the same way for parts coming from site spares, and each row has a button to move it between the MTO and spares. Both export to Excel and PDF, and Paste text lets Gemini fill in the rows from an email or quote, which you check before adding.

The Isolations tab lists each action's isolation points. Pick the action from the drop down and its equipment tags show above the list (click one to add it as a row). Typing an equipment number or name suggests equipment from the plant equipment lists (mechanical and electrical equipment, control and manual valves, instruments, about 17,000 items) and the Equipment tags list; picking one fills in both, and they can still be edited without changing any list. Each row has a note. The isolations go into the workpack PDF and the print.

Each action's Overview and its workpack show a small site map of where its equipment is expected to be. Tags close together share one callout; sub equipment takes the position of the main equipment it belongs to. The location is auto generated, with a note saying how each tag was placed, so check it on site.

To make an action from text, use New action, then Paste text. Google Gemini splits an email into the fields. Anything it can't find is left empty, and any field set to TBC shows in red.

To print, choose which stages to print (Completed starts unticked). The board prints first on A4 landscape, then each action with its details, photos and attachment links. Every action also has a PDF button (on its row, its tile and in the side panel) that downloads a full workpack: details, problem, solution, notes, the MTO with its RFQ revisions and quotes, spares, attachment links and the photos. Export to Excel exports the table as filtered, with a Photos link that opens the app on that action's photos.

Undo and redo work with Ctrl+Z and Ctrl+Y. View settings cover the theme colour (the presets or a custom colour), dark mode and text size. On a phone the app is view only, with stage filter pills, search and full screen photos.

## Where the data lives

The data lives in its own repo, bijankle/action-kanban-data, so saving never rebuilds this website. `data/config.json` holds the fields, stages and contacts, `data/projects.json` the project list, `data/users.json` everyone who has signed in, and each project has `p/<project>/actions.json` with its `img/` and `thumb/` photos, `files/` attachments and quotes, and `rfq/` RFQ revisions. Each save is one commit. Before writing, the app re-reads the online copy and merges field by field, so two people editing different fields of one action both keep their changes; if they change the same field, the one who saves second is warned and told who else was editing. Actions record when they were created, last modified and completed, and when they entered each stage.

Everyone signs in with their email. A new email asks for first and last name, role and mobile, and the details go on edits, warnings, workpacks and RFQs. Signing in names people; saving still needs a GitHub key with write access to the data repo.

## Setup

In the repo Settings, under Pages, deploy from the branch that holds this code. Then open the site, sign in with your email (new people add their name, role and mobile), and enter a fine grained GitHub key with Contents read and write on bijankle/action-kanban-data, the local folder, and optionally a Gemini key from aistudio.google.com.
