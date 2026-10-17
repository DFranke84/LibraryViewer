# Research Library: tablet viewer

A read-only copy of Library Manager's **browse and read** side that runs in Chrome on an Android tablet (Samsung Galaxy Tab), straight from an SD card, with **no internet and no PC**.

What it does:
- **Sections:** Home, Favorites, Recipes, Cooking School (in course order), Local Area, Documents & Books, Whole Library. Recipes, Documents & Books, Whole Library and Local Area open on the **same topic tiles as Library Manager** (built from the app's own tile definitions, so they always match after "Build viewer data.bat"); ◀ All topics or Back returns to the tiles.
- **Full-text search:** every word of every page, not just titles. All the words you type must appear. The last word also finds longer words that start with it, so results show up as you type. Matching words are highlighted on the cards.
- **Reader tabs:** Read (the page), Pictures (swipe through the photos), Pages (the original PDF), and Note (the PC's note, plus a box for your own tablet note). Videos and audio play right in the page. A−/A+ changes the text size.
- **Favorites and tablet notes:** saved on the tablet. Favorites start with the PC's on first launch. *Favorites → 📝 Notes* lists all your notes. *Save favorites & notes to a file* makes a backup, and that file is also how notes get to the PC.
- **Cooking School:** Next/Previous walk the course in order, a ✓ marks what you've opened, and "Continue" takes you back to where you left off.
- **Back:** the tablet's Back button (or ← Back) returns to the list exactly where you were.
- **Light/dark:** ◐ switches between automatic, light and dark.

Adding and deleting still happens in **Library Manager on the PC**.

---

## What's in this folder

| | |
|---|---|
| `index.html`, `app.js`, `app.css`, `config.js`, `vendor/` | the viewer itself |
| `data/` | made by the build: item list, Cooking School order, search index (~36 MB), card pictures (~180 MB) |
| `Build viewer data.bat` | rebuilds `data/` from the library. Run it after you add or delete things in Library Manager |
| `Preview on PC.bat` | opens the viewer in this PC's browser so you can try it |
| `Import tablet notes.bat` | copies notes typed on the tablet into the library's notes (see below) |
| `Copy to SD card.bat` | copies the library and the viewer to the SD card (only changed files after the first time) |
| `_build/` | the build script and the PC preview server (not copied to the card) |

The viewer never changes anything in the Research folder.

---

## One-time setup

### 1. On the PC: copy to the SD card
1. Use a **microSD card of 128 GB or more**. Cards that size come formatted as exFAT, which is what you want.
2. Put it in the PC (card reader) and double-click **`Copy to SD card.bat`**. Type the card's drive letter and confirm.
3. The first copy is about 65 GB (roughly 107,000 files), so give it time. The card ends up with two folders side by side:

```
SD card
├── Research         (the library, without _sources/_work/_scripts)
└── LibraryViewer    (this viewer)
```

### 2. On the tablet: a small web-server app
Chrome on Android can't run this viewer straight from the card's files, so a free "web server" app hands the files to Chrome. Everything stays on the tablet and no internet is used.

1. Put the SD card in the Galaxy Tab.
2. From the Play Store, install a simple local web server, for example **"Simple HTTP Server"**. Any app that serves a folder over `http://localhost` works.
3. In the app, choose the **top folder of the SD card**: the one that holds *both* `Research` and `LibraryViewer`. If Android asks for permission to access files, allow it.
4. Start the server. Note the port it shows (often 8080).
5. In Chrome, open: **`http://localhost:8080/LibraryViewer/`** (use the app's port number).
6. In Chrome's ⋮ menu, choose **Add to Home screen** to get a one-tap icon.

Each time after that, start the server app, then tap the icon.

> **Keep the same port number.** Favorites and Cooking School progress are saved for that exact address. If the port changes, use *Save favorites to a file* / *Load favorites from a file* on the Favorites page to move them.

---

## Keeping the tablet up to date
1. Add or delete things in Library Manager as usual.
2. Double-click **`Build viewer data.bat`**. It takes about a minute, longer when there are new card pictures to make.
3. Put the SD card in the PC and run **`Copy to SD card.bat`**. Only changed files are copied, and items you deleted are removed from the card.

Your tablet favorites and notes are not affected by updates.

### Maps & waypoints
- **📍 Waypoints** in the menu lists the waypoints saved in Library Manager. Tap **Detailed map** or **Regional map** to
  open that map zoomed in on the red pin. A map's Pages tab has **− / + / Fit**; swipe to move around.
- **📍 Where am I?** (Waypoints page, or on any map) uses the tablet's GPS - no internet needed - and opens the map you are
  standing on with a blue *You are here* dot. The first time, Chrome asks to allow location for the page: allow it, and
  make sure Location is turned on. It needs the page opened through the web-server app (`http://localhost:…`), as usual.
- **🌎 North America map** (Waypoints page, or the map's page in Local Area › Maps) is an offline road map of the US,
  Canada and Mexico - every town and road to zoom 13, NW Montana in full street-and-trail detail. Search towns or positions,
  tap a spot for its position and nearest town, and **📍 Where am I?** follows your GPS on it. **← Library** returns here.
  When "Where am I?" finds you outside the topo maps, it opens this map instead. It needs the card formatted exFAT
  (the map is one 8.5 GB file) and a web-server app that supports byte ranges (the usual ones do).
- **📏 Measure** on any map (and on the North America map): tap points to see each leg's straight-line distance and
  the total; **↶ Undo last point**, **Clear**, **Done**.
- Waypoints are added and changed on the PC only. After adding some, run **`Build viewer data.bat`** (or, quicker,
  `_build\build_viewer.py --waypoints-only` with the library's Python) and copy to the SD card again.
- The build draws every topo map once as a picture in `data\maps` (about 1.5–2 GB; the first time takes 15–30 minutes,
  afterwards only new maps are drawn) - the GeoPDFs themselves are too slow for the tablet's browser to draw while you zoom.

---

## Tablet notes onto the PC
1. On the tablet: **Favorites → Save favorites & notes to a file**. Chrome saves it to the tablet's *Downloads*.
2. Get that file onto the PC with a USB cable, the SD card, or by emailing it to yourself.
3. On the PC, double-click **`Import tablet notes.bat`** and pick the file.
   - An item with no note gets the tablet note as its note.
   - An item that already has a note gets the tablet text **added at the end** under a "From the tablet (date)" line.
   - Text that's already in the note is skipped. **Nothing is ever overwritten or deleted.**
4. The notes now show in Library Manager. Run **`Copy to SD card.bat`** so the tablet shows them as PC notes. Each tablet note then offers **Remove the tablet copy**, so you don't keep two copies.

To preview without changing anything, run `_build\import_tablet_notes.py <file> --check` with the library's Python.

---

## If something doesn't work

| Problem | Fix |
|---|---|
| "The library data could not be loaded" | The page was opened from the file itself, or the `data` folder is missing. Open it through the server app's address. |
| "The library folder was not found" | The server app is pointed at the `LibraryViewer` folder instead of the card's top folder. Point it one level up. |
| Videos play but won't skip ahead | Some server apps don't support jumping around in files. Try a different server app. |
| A PDF won't show in the Pages tab | Use **Open in another app**. |
| Web page buttons or ↗ links do nothing | They need the internet. |

To try it on the PC: double-click **`Preview on PC.bat`**. It opens `http://localhost:8765/LibraryViewer/` (or the next free port), which only this computer can see.

---

## Technical notes
- `_build/build_viewer.py` runs with the library's own Python (`Research\_scripts\.venv`) and reuses Library Manager's code (`library_viewer.py`). Item titles, recipe groups, Cooking School order, pictures and notes therefore match the PC app.
- Card pictures are made once into `data/thumbs` (320×208). Reruns only make the missing ones. Items with no picture are listed in `_build/thumb_none.json`; delete that file to retry them.
- Search index: `data/search/*.json`, one small file per two- or three-letter word beginning. It loads only what each search needs.
- Favorites (`lv.favs`), tablet notes (`lv.notes`) and course progress (`lv.course`) are kept in Chrome's storage for the viewer's address.
- Offline libraries in `vendor/`: marked 12.0.2 (Markdown) and pdf.js 3.11.174 (PDF pages).

## Offline archives on the tablet (Kiwix)

The PC's **Offline Archives** (Wikipedia with pictures, Project Gutenberg, iFixit, MedlinePlus, WikEM, Wikibooks, Stack Exchange
and about 20 more - 31 files, about 164 GB) can go on the card too. The viewer itself cannot open them; the free **Kiwix** app
reads them fully offline, with search and pictures. The viewer's Home page lists which archives there are.

1. Use a **512 GB card formatted exFAT** (most 512 GB cards come that way). FAT32 cannot hold files over 4 GB, and
   Wikipedia is a single 119 GB file - "Copy to SD card.bat" checks this and stops if the card is FAT32.
2. Run **Copy to SD card.bat** and answer **Y** to "Also copy the offline archives". They go to the card's **Kiwix** folder
   (the first copy takes several hours; later runs copy only new or changed archives).
3. On the tablet, install **Kiwix** (Google Play). In the app, add the files from the card's **Kiwix** folder - use the
   option to open or add a ZIM file and browse to the SD card's Kiwix folder (the exact menu wording varies between Kiwix
   versions). If the Play Store version cannot see the card's files, the Kiwix website offers a version with full storage access.
4. Total on the card with the archives: about 255 GB (library ~87 GB + viewer + archives ~164 GB).
