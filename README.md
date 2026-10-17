# LibraryViewer

Your Research library on an **Android tablet**, with no internet and no PC: browse by topic, search every word,
read pages, PDFs and pictures, play videos, keep favorites and notes. It runs in Chrome straight from an SD card.

It is a **read-only** copy of Library Manager's browse-and-read side. Adding and deleting things still happens
in Library Manager on the PC; the viewer is refreshed from it with one double-click.

---

## How the apps fit together

There are four separate downloads. They work on their own, and better together when they sit side by side in
one folder.

| App | What it is | Do you need it? |
|---|---|---|
| **AIPortable** | Offline AI chat with your library, Wikipedia viewer and offline maps | Pick **one** of the two AI apps |
| **AIPortable-JustAI** | The same AI chat without the maps and Wikipedia viewer (smaller) | Pick **one** of the two AI apps |
| **Research** | The library itself and Library Manager, the window for building it | **Needed** by this viewer |
| **LibraryViewer** (this one) | A read-only copy of the Research library for an Android tablet | Optional |

Most people use **either** AIPortable **or** JustAI, not both. This viewer needs the **Research** library; the
AI apps are not needed for it.

Put the ones you use in **one folder**, side by side:

```
AI-Research\
    Research\            the library (needed)
    LibraryViewer\       this viewer
    AIPortable\          optional (or AIPortable-JustAI\)
```

---

## Setting up from scratch

**You need:** the Research library set up on a Windows PC (its `Setup.bat` - see the Research README) with
something in it, an Android tablet with Chrome, and a microSD card big enough for your library (the copy step
tells you how much it needs).

1. **Get the folder.** Download this repository (green **Code** button → *Download ZIP*, then unzip), or with git:
   `git clone https://github.com/DFranke84/LibraryViewer`. Put it next to the `Research` folder.
2. **Double-click `Build viewer data.bat`.** It makes the viewer's item list, search index and card pictures from
   the library (using the library's own Python, so nothing else to install). Run it again whenever you change the
   library.
3. **Try it on the PC:** `Preview on PC.bat` opens the viewer in this PC's browser.
4. **Put it on the tablet:** `Copy to SD card.bat` copies the library and the viewer to the card, then a free
   "web server" app on the tablet shows it in Chrome. Step by step:
   **[README - Tablet Viewer.md](README%20-%20Tablet%20Viewer.md)**.

---

## What you can do on the tablet

- **Browse** Recipes, Documents & Books and the Whole Library on the same topic tiles as Library Manager.
- **Search** every word of every page, as you type.
- **Read** each item: the page, its pictures, the original PDF, and videos or audio right in the page; change the
  text size; light or dark.
- **Favorites and notes**, saved on the tablet. Notes typed on the tablet can be brought back into the library on
  the PC (`Import tablet notes.bat`).
- **Offline archives** (Wikipedia, iFixit and other `.zim` files from the library) can go on the card too and
  are read with the free Kiwix app.

## Parts built for one person's setup

The **Local Area** and **Waypoints** sections mirror the Library Manager sections of the same names. They were
built for the first owner's home area (Kalispell, Montana: plants, wildlife, topographic maps and a North America
road map); the viewer only shows them when the library has something for them.

---

## What's in this folder

| | |
|---|---|
| `index.html`, `app.js`, `app.css`, `config.js`, `icon.svg`, `vendor\` | the viewer itself |
| `Build viewer data.bat` | rebuilds `data\` from the library |
| `Preview on PC.bat` | opens the viewer in this PC's browser (only this computer can see it) |
| `Copy to SD card.bat` | copies the library and the viewer (and optionally the archives) to the SD card |
| `Import tablet notes.bat` | brings notes typed on the tablet into the library's notes |
| `_build\` | the build, preview and copy helpers (not copied to the card) |
| `data\` | made by the build from your library - not part of the download |

The viewer never changes anything in the Research folder.

**Full tablet guide** - the web-server app, keeping the tablet up to date, notes, maps, offline archives and
troubleshooting: [README - Tablet Viewer.md](README%20-%20Tablet%20Viewer.md).
