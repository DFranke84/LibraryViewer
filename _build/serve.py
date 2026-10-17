"""Try the viewer on the PC: serves ONLY the LibraryViewer folder and the library folder next to it, on this computer only.
Supports byte ranges (so videos can be skipped through, like the tablet's web-server app).

  python serve.py [--port 8080] [--library E:\\Research]      then open http://localhost:8080/LibraryViewer/
"""
import argparse, http.server, os, posixpath, re, sys, urllib.parse

VIEWER = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HIDDEN = {"_sources", "_work", "_scripts", "_build"}


class Handler(http.server.SimpleHTTPRequestHandler):
    roots = {}

    def translate_path(self, path):
        path = urllib.parse.unquote(urllib.parse.urlsplit(path).path)
        parts = [p for p in posixpath.normpath(path).split("/") if p and p not in (".", "..")]
        if not parts or parts[0] not in self.roots or any(p in HIDDEN for p in parts[1:2]):
            return os.path.join(VIEWER, "__nothing__")
        return os.path.join(self.roots[parts[0]], *parts[1:])

    def send_head(self):
        rng = self.headers.get("Range")
        path = self.translate_path(self.path)
        if not rng or not os.path.isfile(path):
            return super().send_head()
        m = re.match(r"bytes=(\d*)-(\d*)", rng)
        size = os.path.getsize(path)
        start = int(m[1]) if m and m[1] else max(0, size - int(m[2] or 0)) if m else 0
        end = int(m[2]) if m and m[1] and m[2] else size - 1
        end = min(end, size - 1)
        if start > end:
            self.send_error(416); return None
        f = open(path, "rb"); f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        self._left = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        left = getattr(self, "_left", None)
        if left is None:
            return super().copyfile(source, outputfile)
        while left > 0:
            buf = source.read(min(1 << 20, left))
            if not buf:
                break
            outputfile.write(buf); left -= len(buf)

    def end_headers(self):
        if not self.headers.get("Range"):
            self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def log_message(self, *a):
        pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--library", default=os.path.join(os.path.dirname(VIEWER), "Research"))
    ap.add_argument("--open", action="store_true", help="open the viewer in the browser")
    a = ap.parse_args()
    lib = os.path.abspath(a.library)
    Handler.roots = {os.path.basename(VIEWER): VIEWER, os.path.basename(lib): lib}
    Handler.extensions_map.update({".md": "text/markdown; charset=utf-8", ".json": "application/json", ".webp": "image/webp",
                                   ".txt": "text/plain; charset=utf-8", ".mp4": "video/mp4", ".svg": "image/svg+xml"})
    srv = None
    for port in [a.port] + list(range(8765, 8785)):   # the port may already be taken by another program (e.g. SABnzbd uses 8080)
        try:
            srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
            break
        except OSError:
            continue
    if not srv:
        sys.exit("No free port found - close other local servers and try again.")
    url = f"http://localhost:{port}/{os.path.basename(VIEWER)}/"
    print(f"Viewer: {url}   (close this window or press Ctrl+C to stop)", flush=True)
    if a.open:
        import webbrowser
        webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    sys.exit(main())
