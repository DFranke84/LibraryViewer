"""Build the tablet web viewer's data from the Research library (read-only - nothing in the library is changed).

Writes, inside the LibraryViewer folder:
  data/items.json        every item the Library Manager shows (same list, titles, groups, Cooking School modules)
  data/course.json       the Traditional Cooking School in course order (same rules as Library Manager's CoursePage)
  data/search/*.json     full-text search index, split into small files by the first letters of each word
  data/thumbs/<h>.jpg    card pictures (made once; reruns only make the missing ones)
  data/pc_favorites.json the PC's favorites, used to start the tablet's favorites on first launch
  data/info.json         build date + counts

Run with the library's Python (it reuses the Library Manager's own code):
  E:\\Research\\_scripts\\.venv\\Scripts\\python.exe build_viewer.py [--library E:\\Research] [--no-thumbs]
or just double-click "Build viewer data.bat" in the LibraryViewer folder.
"""
import argparse, hashlib, json, math, os, re, sys, time, unicodedata
from collections import defaultdict
from multiprocessing import Pool

VIEWER = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(VIEWER, "data")
TW, TH = 320, 208          # card picture size
STOP = sorted(set("""a an and are as at be but by for from has have he her his i if in into is it its me my not of on or our
she so than that the their them then there these they this to us was we were what when which who will with you your
s t can do does did been being also any all about after before more most other some such only own same very just""".split()))


def log(*a):
    print(*a, flush=True)


def lib_setup(library):
    sys.path.insert(0, os.path.join(library, "_scripts"))
    import library_viewer as lv   # noqa: E402  (tkinter is imported but no window is opened)
    return lv


# ======================================================================= the item list (same as Library Manager)
def load_items(lv, library):
    rows = json.load(open(os.path.join(library, "CATALOG.json"), encoding="utf-8"))
    items = []
    for r in rows:
        if r.get("source_type") in lv.INDEX_TYPES:
            continue
        items.append({"file": r["file"], "path": r["file"], "title": r.get("title") or os.path.basename(r["file"]),
                      "category": r.get("category"), "type": r.get("source_type") or "", "publisher": r.get("publisher") or "",
                      "original": r.get("original_file") or "", "source_url": r.get("source_url") or "",
                      "words": r.get("words") or 0, "images": r.get("images") or 0, "date": r.get("date_added") or "",
                      "ltype": r.get("group") or ""})
    items += lv.extra_items()
    mods = {it["path"].split("/")[2]: lv.COURSE_TAIL.sub("", it["title"]) for it in items
            if it["path"].startswith(lv.WARDEE + "/") and it["type"] == "course-module"}
    for it in items:
        it["title"] = lv.COURSE_TAIL.sub("", lv.pretty_title(it["title"])) or it["title"]
        if it["path"].startswith(lv.WARDEE + "/") and it["path"].count("/") >= 3:
            it["module"] = mods.get(it["path"].split("/")[2], it["path"].split("/")[2])
        it["key"] = (it["title"] or "").lower()
        if it["category"] == "recipes":
            it["group"] = lv.recipe_group(it)
    items.sort(key=lambda i: i["key"])
    return items


def rel(lv, p):
    return os.path.relpath(p, lv.RESEARCH).replace(os.sep, "/") if p else ""


def waypoints_data(library, ids):
    """data/waypoints.json: the PC's waypoints (_work/waypoints.json) + for every Local Area map its bounds and a 5x5 grid of
    where those lat/longs fall on the page (fractions of the page width / height), so the tablet can place markers without
    reading the GeoPDF itself.  Grids are cached in _build/map_grids.json by PDF date (reading 467 GeoPDFs takes ~2 min cold)."""
    import waypoints as wpt
    cache_f = os.path.join(os.path.dirname(os.path.abspath(__file__)), "map_grids.json")
    try:
        cache = json.load(open(cache_f, encoding="utf-8"))
    except (OSError, ValueError):
        cache = {}
    maps, N = [], 4
    for m in wpt.index(refresh=True):
        p = os.path.relpath(m["md"], library).replace(os.sep, "/")
        if p not in ids:
            continue
        key = f"{os.path.relpath(m['pdf'], library)}|{int(os.path.getmtime(m['pdf']))}"
        if key not in cache:
            g = wpt.georef_for_map(m)
            if not g:
                continue
            cache[key] = [[[round(v, 5) for v in (lambda xy: (xy[0] / g.width, xy[1] / g.height))(
                g.forward(m["s"] + (m["n"] - m["s"]) * i / N, m["w"] + (m["e"] - m["w"]) * j / N))]
                for j in range(N + 1)] for i in range(N + 1)]
        e = {"id": ids[p], "set": m["set"], "s": m["s"], "n": m["n"], "w": m["w"], "e": m["e"], "g": cache[key]}
        img = os.path.join(DATA, "maps", map_image_name(m, library))
        if os.path.exists(img):
            e["img"] = "data/maps/" + os.path.basename(img)
        maps.append(e)
    json.dump(cache, open(cache_f, "w", encoding="utf-8"))
    return {"waypoints": wpt.load(), "maps": maps}


MAP_PIXELS = 14e6   # a whole map as one JPEG: sharp at 1:24,000 when zoomed in, still within what a tablet browser draws


def map_image_name(m, library):
    return re.sub(r"[^\w.-]+", "_", os.path.splitext(os.path.relpath(m["pdf"], os.path.join(library, "local-area", "maps")))[0]) + ".jpg"


def _render_map(job):
    pdf, out = job
    try:
        import pymupdf
        with pymupdf.open(pdf) as d:
            pg = d[0]
            z = min(2.0, math.sqrt(MAP_PIXELS / (pg.rect.width * pg.rect.height)))
            pix = pg.get_pixmap(matrix=pymupdf.Matrix(z, z), alpha=False)
            pix.save(out + ".tmp.jpg", jpg_quality=78)
        os.replace(out + ".tmp.jpg", out)
        return None
    except Exception as ex:
        return f"{os.path.basename(pdf)}: {ex}"


def make_map_images(library):
    """data/maps/*.jpg: every Local Area topo map pre-drawn once (pdf.js needs many seconds per view for these GeoPDFs on a
    tablet).  Only new / changed maps are drawn again."""
    import waypoints as wpt
    os.makedirs(os.path.join(DATA, "maps"), exist_ok=True)
    jobs = []
    for m in wpt.index(refresh=True):
        out = os.path.join(DATA, "maps", map_image_name(m, library))
        if not os.path.exists(out) or os.path.getmtime(out) < os.path.getmtime(m["pdf"]):
            jobs.append((m["pdf"], out))
    if not jobs:
        return
    log(f"  drawing {len(jobs)} map pictures (first time ~15-30 min) ...")
    t0, done = time.time(), 0
    with Pool(max(1, min(4, (os.cpu_count() or 2) - 1))) as pool:
        for err in pool.imap_unordered(_render_map, jobs):
            done += 1
            if err:
                log("   could not draw", err)
            if done % 25 == 0:
                log(f"    maps {done}/{len(jobs)}  ({time.time() - t0:.0f}s)")


def archives(library):
    """The offline archives (.zim) - copied to the card's Kiwix folder by 'Copy to SD card.bat', opened in the Kiwix app."""
    d = os.path.join(library, "_sources", "zim")
    out = []
    if os.path.isdir(d):
        for f in sorted(os.listdir(d)):
            if f.endswith(".zim"):
                base = re.sub(r"_(\d{4}-\d{2}[a-z]?)\.zim$", "", f)
                date = re.search(r"_(\d{4}-\d{2})[a-z]?\.zim$", f)
                name = re.sub(r"_en(_all)?(_maxi|_nopic)?$", "", base).replace(".stackexchange.com", " (Stack Exchange)")
                name = name.replace("zimgit-", "").replace("_", " ").replace("-", " ").strip()
                name = {"gutenberg en lcc pr": "Project Gutenberg - English Literature",
                        "gutenberg en lcc ps": "Project Gutenberg - American Literature", "ifixit": "iFixit",
                        "diy (stack exchange)": "DIY (Stack Exchange)", "nhs.uk en medicines": "NHS Medicines"}.get(name.lower(),
                                                                                                    name[:1].upper() + name[1:])
                out.append({"f": f, "n": name, "gb": round(os.path.getsize(os.path.join(d, f)) / 1024 ** 3, 1),
                            "d": date.group(1) if date else ""})
    return out


def tile_sections(library, lv):
    """Library Manager's topic tiles for each tile section: {section: (base filter, [(name, icon, blurb, filter, [(sub, filter)])])}.
    Same definitions as the app (library_manager.pyw), so the tablet groups items exactly like the PC."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("library_manager", os.path.join(library, "_scripts", "library_manager.pyw"))
    lm = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(lm)   # defines the window class but opens nothing
    return {"recipes": (lambda i: i["category"] == "recipes" and i.get("group") != "course", lm.RECIPE_TOPICS),
            "docs": (lambda i: i["type"] in lv.DOC_TYPES and not lv.is_course(i), lm.DOC_TOPICS),
            "library": (lambda i: not lv.is_course(i), lm.LIB_TOPICS),
            "local": (lambda i: i["category"] == "local-area", lm.LOCAL_TOPICS)}


def topic_marks(topics, it):
    """-> (topic indexes, ['topic.sub' ...]) this Local Area item belongs to, using the app's own filters."""
    lt, ls = [], []
    for ti, (name, icon, blurb, flt, subs) in enumerate(topics):
        try:
            if not flt(it):
                continue
        except Exception:
            continue
        lt.append(ti)
        for si, (sname, sf) in enumerate(subs):
            try:
                if sf(it):
                    ls.append(f"{ti}.{si}")
            except Exception:
                pass
    return lt, ls


def thumb_name(path):
    return hashlib.md5(f"{path}|{TW}x{TH}".encode()).hexdigest()


def describe(lv, it, k):
    """One item as the viewer needs it (short keys keep items.json small)."""
    from common import note_path
    orig = lv.abspath(it.get("original"))
    md = lv.abspath(it.get("file"))
    pdf = orig if orig.lower().endswith(".pdf") else (md[:-3] + ".pdf" if md and os.path.exists(md[:-3] + ".pdf") else "")
    aud = orig if orig.lower().endswith(lv.AUD_EXT) else ""
    vid = orig if orig.lower().endswith(lv.VID_EXT) else (md[:-3] + "-video.mp4" if md and os.path.exists(md[:-3] + "-video.mp4") else "")
    d = {"id": k, "p": it["path"], "t": it["title"], "c": it.get("category") or "", "ty": it["type"]}
    for key, val in (("f", 1 if it.get("file") else 0), ("pub", it.get("publisher")), ("o", it.get("original") if orig and os.path.exists(orig) else ""),
                     ("u", it.get("source_url")), ("w", it.get("words")), ("im", it.get("images")), ("d", it.get("date")),
                     ("g", it.get("group")), ("m", it.get("module")), ("pdf", rel(lv, pdf)), ("vid", rel(lv, vid)), ("aud", rel(lv, aud)),
                     ("text", it.get("text"))):
        if val:
            d[key] = val
    try:
        d["s"] = lv.snippet(it, 150)
    except Exception:
        d["s"] = ""
    try:
        d["mt"] = int(os.path.getmtime(lv.abspath(it["path"])))
    except OSError:
        d["mt"] = 0
    # pictures that are not inline in the page: a photo saved beside it (shown first) and its _images folder (shown last)
    try:
        gal = lv.gallery_images(it)
    except Exception:
        gal = []
    if gal:
        inline = set()
        if it.get("file"):
            body = lv.FM.sub("", lv.read_md(it), 1)
            for m in re.finditer(r"!\[([^\]]*)\]\(<?([^)>]+?)>?\)", body):
                if not m[2].startswith("http"):
                    inline.add(os.path.normcase(os.path.normpath(os.path.join(os.path.dirname(md), lv.unquote(m[2])))))
        base = os.path.normcase(md[:-3]) if md else None
        pre, post = [], []
        for p, cap in gal:
            n = os.path.normcase(os.path.normpath(p))
            if n in inline:
                continue
            entry = [rel(lv, p), cap] if cap else [rel(lv, p)]
            (pre if base and os.path.splitext(n)[0] == base else post).append(entry)
        if it["type"] == "recipe-card":
            pre, post = [[rel(lv, gal[0][0])]], []
        if pre:
            d["gp"] = pre
        if post:
            d["gx"] = post
    note = note_path(lv.abspath(it.get("file") or it["path"]), orig or None)
    if os.path.isfile(note):
        d["n"] = rel(lv, note)
    return d


# ======================================================================= Cooking School order
def course_json(lv, items, ids):
    mods = lv.build_course(items)
    out = []
    for m in mods:
        out.append({"dir": m["dir"], "title": m["title"], "num": m["num"], "short": m["short"],
                    "page": ids[m["page"]["path"]] if m["page"] else None,
                    **{k: [ids[i["path"]] for i in m[k]] for k in ("materials", "start", "more", "audio", "qa", "other")},
                    "lessons": [{"num": ls["num"], "title": ls["title"], "parts": [ids[i["path"]] for i in ls["parts"]], "caps": ls["caps"]}
                                for ls in m["lessons"]]})
    return out


# ======================================================================= full-text search index
TOKEN = re.compile(r"[a-z0-9]+")
STRIP = [(re.compile(r"!\[[^\]]*\]\([^)]*\)"), " "), (re.compile(r"\]\([^)]*\)"), " "), (re.compile(r"<[^>]{0,400}>"), " "),
         (re.compile(r"https?://\S+"), " ")]
STOPSET = set(STOP)


def tokens(text):
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch)).lower()
    return [t for t in TOKEN.findall(text) if 1 < len(t) <= 24 and t not in STOPSET and not (t.isdigit() and len(t) > 6)]


def doc_text(lv, it, d):
    head = " ".join(filter(None, [it["title"], it.get("publisher"), it.get("module"), os.path.basename(it["path"])]))
    body = it.get("text") or ""
    if it.get("file"):
        body = lv.FM.sub("", lv.read_md(it), 1)
        for rx, rep in STRIP:
            body = rx.sub(rep, body)
    return head, body


def bucket(tf):
    return min(6, 1 + int(math.log2(tf)))


def build_index(lv, items, out_dir):
    postings = defaultdict(list)   # term -> [id*32 + score]
    t0 = time.time()
    for k, it in enumerate(items):
        head, body = doc_text(lv, it, None)
        tf = defaultdict(int)
        for t in tokens(body):
            tf[t] += 1
        title_terms = set(tokens(head))
        for t in title_terms:
            tf.setdefault(t, 0)
        for t, n in tf.items():
            s = (bucket(n) if n else 0) + (10 if t in title_terms else 0)
            postings[t].append(k * 32 + max(1, s))
        if k % 2000 == 0:
            log(f"  index {k:,}/{len(items):,}  ({time.time() - t0:.0f}s, {len(postings):,} words)")

    def b36(n):
        s = ""
        while True:
            n, r = divmod(n, 36)
            s = "0123456789abcdefghijklmnopqrstuvwxyz"[r] + s
            if not n:
                return s

    enc = {}
    for t, lst in postings.items():
        last, parts = 0, []
        for v in lst:
            i, s = divmod(v, 32)
            parts.append(b36(i - last) + b36(s))
            last = i
        enc[t] = ",".join(parts)
    del postings
    shards = defaultdict(dict)
    for t, e in enc.items():
        shards[t[:2]][t] = e
    split = []
    os.makedirs(out_dir, exist_ok=True)
    for f in os.listdir(out_dir):
        os.remove(os.path.join(out_dir, f))
    total = 0

    def write(name, d):
        nonlocal total
        p = os.path.join(out_dir, name + ".json")
        with open(p, "w", encoding="utf-8") as fh:
            json.dump(d, fh, separators=(",", ":"), ensure_ascii=False)
        total += os.path.getsize(p)
    for key, d in shards.items():
        size = sum(len(t) + len(e) + 6 for t, e in d.items())
        if size > 1_500_000:   # big groups ("co", "re", ...) are split again by their first three letters
            split.append(key)
            sub = defaultdict(dict)
            for t, e in d.items():
                sub[t[:3] if len(t) > 2 else key + "_"][t] = e
            for k2, d2 in sub.items():
                write(k2, d2)
        else:
            write(key, d)
    meta = {"docs": len(items), "split": sorted(split), "stop": STOP, "words": len(enc)}
    write("meta", meta)
    log(f"  search index: {len(enc):,} words, {total / 1e6:.0f} MB in {len(os.listdir(out_dir)):,} files")


# ======================================================================= thumbnails
_lv = None


def _init(library, tmp):
    global _lv
    _lv = lib_setup(library)
    _lv.THUMBS = tmp   # video frames are grabbed into a temp folder, not the library's _work
    os.makedirs(tmp, exist_ok=True)


def _thumb(job):
    it, dest = job
    try:
        im = _lv.make_picture(it, TW, TH)
    except Exception:
        im = None
    if im:
        im.save(dest, quality=80, optimize=True)
        return dest
    return None


def make_thumbs(library, items, thumbs_dir):
    os.makedirs(thumbs_dir, exist_ok=True)
    nonef = os.path.join(VIEWER, "_build", "thumb_none.json")
    none = set(json.load(open(nonef)) if os.path.exists(nonef) else [])
    have = set(f[:-4] for f in os.listdir(thumbs_dir) if f.endswith(".jpg"))
    jobs = []
    for it in items:
        h = thumb_name(it["path"])
        if h not in have and h not in none:
            jobs.append((it, os.path.join(thumbs_dir, h + ".jpg")))
    log(f"  thumbnails: {len(have):,} already made, {len(jobs):,} to try")
    if jobs:
        tmp = os.path.join(VIEWER, "_build", "_tmp")
        t0, made = time.time(), 0
        with Pool(max(2, (os.cpu_count() or 4) - 2), initializer=_init, initargs=(library, tmp)) as pool:
            for n, ((it, dest), res) in enumerate(zip(jobs, pool.imap(_thumb, jobs, chunksize=8))):
                if res:
                    made += 1
                else:
                    none.add(thumb_name(it["path"]))
                if n % 500 == 0:
                    log(f"  thumbnails {n:,}/{len(jobs):,}  ({made:,} made, {time.time() - t0:.0f}s)")
                    json.dump(sorted(none), open(nonef, "w"))
        json.dump(sorted(none), open(nonef, "w"))
        log(f"  thumbnails: made {made:,} new")
    # drop pictures of items that are no longer in the library
    keep = {thumb_name(it["path"]) for it in items}
    for f in os.listdir(thumbs_dir):
        if f.endswith(".jpg") and f[:-4] not in keep:
            os.remove(os.path.join(thumbs_dir, f))
    return set(f[:-4] for f in os.listdir(thumbs_dir) if f.endswith(".jpg"))


# ======================================================================= main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--library", default=os.path.join(os.path.dirname(VIEWER), "Research"))
    ap.add_argument("--no-thumbs", action="store_true", help="skip making new thumbnails")
    ap.add_argument("--no-index", action="store_true", help="skip rebuilding the search index")
    ap.add_argument("--no-maps", action="store_true", help="skip drawing new map pictures (data/maps)")
    ap.add_argument("--waypoints-only", action="store_true", help="only refresh data/waypoints.json (after adding waypoints)")
    a = ap.parse_args()
    library = os.path.abspath(a.library)
    if not os.path.exists(os.path.join(library, "CATALOG.json")):
        sys.exit(f"No CATALOG.json in {library} - pass --library <the Research folder>")
    lv = lib_setup(library)
    os.makedirs(DATA, exist_ok=True)
    log(f"Library: {library}")
    if a.waypoints_only:   # quick: the item list is already built
        ids = {d["p"]: d["id"] for d in json.load(open(os.path.join(DATA, "items.json"), encoding="utf-8"))}
        if not a.no_maps:
            make_map_images(library)
        wd = waypoints_data(library, ids)
        json.dump(wd, open(os.path.join(DATA, "waypoints.json"), "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
        return log(f"  waypoints.json: {len(wd['waypoints'])} waypoints, {len(wd['maps'])} maps. Done.")
    items = load_items(lv, library)
    log(f"  {len(items):,} items")
    ids = {it["path"]: k for k, it in enumerate(items)}

    thumbs = make_thumbs(library, items, os.path.join(DATA, "thumbs")) if not a.no_thumbs else \
        set(f[:-4] for f in os.listdir(os.path.join(DATA, "thumbs")) if f.endswith(".jpg")) if os.path.isdir(os.path.join(DATA, "thumbs")) else set()

    out = []
    t0 = time.time()
    sections = tile_sections(library, lv)
    for k, it in enumerate(items):
        d = describe(lv, it, k)
        tp = {}
        for sec, (base, topics) in sections.items():   # which tiles / buttons of each section this item is under
            try:
                if not base(it):
                    continue
            except Exception:
                continue
            lt, ls = topic_marks(topics, it)
            if lt:
                tp[sec] = [lt, ls] if ls else [lt]
        if tp:
            d["tp"] = tp
        if thumb_name(it["path"]) in thumbs:
            d["th"] = thumb_name(it["path"])
        out.append(d)
        if k % 3000 == 0:
            log(f"  items {k:,}/{len(items):,}  ({time.time() - t0:.0f}s)")
    lib_name = os.path.basename(library.rstrip("\\/"))
    json.dump(out, open(os.path.join(DATA, "items.json"), "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
    json.dump(course_json(lv, items, ids), open(os.path.join(DATA, "course.json"), "w", encoding="utf-8"), separators=(",", ":"),
              ensure_ascii=False)
    if not a.no_maps:
        make_map_images(library)
    wd = waypoints_data(library, ids)
    json.dump(wd, open(os.path.join(DATA, "waypoints.json"), "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
    log(f"  waypoints.json: {len(wd['waypoints'])} waypoints, {len(wd['maps'])} maps")
    favs = lv.load_json(os.path.join(library, "_work", "favorites.json"), {}).get("items", {})
    json.dump(favs, open(os.path.join(DATA, "pc_favorites.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    from lm_ui import nice, CATEGORIES
    json.dump({"built": time.strftime("%Y-%m-%d %H:%M"), "items": len(out), "library_folder": lib_name,
               "categories": {c: nice(c) for c in CATEGORIES},
               "topics": {sec: [{"n": n, "ic": ic, "b": b, "subs": [x[0] for x in subs]} for n, ic, b, f, subs in topics]
                          for sec, (base, topics) in sections.items()},
               "archives": archives(library)},
              open(os.path.join(DATA, "info.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    log(f"  items.json: {os.path.getsize(os.path.join(DATA, 'items.json')) / 1e6:.1f} MB")
    if not a.no_index:
        build_index(lv, items, os.path.join(DATA, "search"))
    log("Done.")


if __name__ == "__main__":
    main()
