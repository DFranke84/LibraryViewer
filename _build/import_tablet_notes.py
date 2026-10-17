"""Copy notes typed on the tablet into the library's own notes (the .txt beside each item that Library Manager shows).

  import_tablet_notes.py [file.json] [--check]

file.json = the file saved on the tablet with Favorites -> "Save favorites & notes to a file". Without a file name, a
window asks for it. --check only shows what would happen.

Rules (nothing is ever overwritten or deleted):
  - item has no note yet            -> the tablet note becomes its note
  - item's note already has the text -> skipped
  - item already has another note    -> the tablet text is added at the end under a "From the tablet" line
Afterwards the viewer's item list is refreshed (quick build, no new pictures/search index) so the tablet shows the
notes as PC notes after the next "Copy to SD card".
"""
import argparse, json, os, subprocess, sys

VIEWER = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def pick_file():
    import tkinter as tk
    from tkinter import filedialog
    root = tk.Tk(); root.withdraw()
    p = filedialog.askopenfilename(title="Choose the favorites & notes file saved on the tablet",
                                   initialdir=os.path.join(os.path.expanduser("~"), "Downloads"),
                                   filetypes=[("Tablet favorites & notes", "*.json"), ("All files", "*.*")])
    root.destroy()
    return p


def norm(s):
    return "\n".join(l.rstrip() for l in s.replace("\r\n", "\n").replace("\r", "\n").strip().split("\n"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file", nargs="?")
    ap.add_argument("--library", default=os.path.join(os.path.dirname(VIEWER), "Research"))
    ap.add_argument("--check", action="store_true", help="only show what would happen")
    a = ap.parse_args()
    library = os.path.abspath(a.library)
    sys.path.insert(0, os.path.join(library, "_scripts"))
    from common import note_path

    f = a.file or pick_file()
    if not f:
        print("No file chosen."); return 1
    try:
        data = json.load(open(f, encoding="utf-8-sig"))
    except Exception as e:
        print(f"Could not read {f}: {e}"); return 1
    notes = data.get("notes") if isinstance(data, dict) else None
    if not notes:
        print("That file has no tablet notes in it (it may be an older favorites-only file)."); return 1

    items = {it["p"]: it for it in json.load(open(os.path.join(VIEWER, "data", "items.json"), encoding="utf-8"))}
    lib = lambda rel: os.path.join(library, rel.replace("/", os.sep)) if rel else ""
    counts = {"new": 0, "added": 0, "same": 0, "missing": 0}
    print(f"Tablet file: {f}  (saved {data.get('saved', '?')})")
    print(f"{len(notes)} tablet note(s)" + ("  -  CHECK ONLY, nothing is changed" if a.check else "") + "\n")
    for path, v in sorted(notes.items()):
        text = norm((v or {}).get("text", ""))
        if not text:
            continue
        it = items.get(path)
        target = lib(it["p"]) if it else ""
        if not it or not os.path.exists(target):
            counts["missing"] += 1
            print(f"  NOT IN LIBRARY  {path}")
            continue
        np_ = note_path(target, lib(it.get("o")) or None)
        title = it["t"][:70]
        old = ""
        if os.path.exists(np_):
            old = norm(open(np_, encoding="utf-8-sig", errors="replace").read())
        if text in old:
            counts["same"] += 1
            print(f"  already there   {title}")
            continue
        if old:
            new = old + f"\n\n--- From the tablet ({v.get('updated') or data.get('saved', '')}) ---\n" + text
            counts["added"] += 1
            print(f"  added to note   {title}")
        else:
            new = text
            counts["new"] += 1
            print(f"  new note        {title}")
        if not a.check:
            with open(np_, "w", encoding="utf-8", newline="\r\n") as fh:   # Notepad-friendly, like Library Manager
                fh.write(new.rstrip() + "\n")
    print(f"\nNew notes: {counts['new']}   Added to existing notes: {counts['added']}   Already there: {counts['same']}"
          f"   Not in the library: {counts['missing']}")
    if not a.check and (counts["new"] or counts["added"]):
        print("\nRefreshing the viewer's item list...")
        subprocess.run([sys.executable, os.path.join(VIEWER, "_build", "build_viewer.py"), "--library", library,
                        "--no-thumbs", "--no-index"])
        print("\nDone. The notes now show in Library Manager. Run \"Copy to SD card.bat\" so the tablet shows them as PC notes;"
              "\nthen each tablet note offers \"Remove the tablet copy\".")
    return 0


if __name__ == "__main__":
    sys.exit(main())
