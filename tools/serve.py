#!/usr/bin/env python3
"""Static server for the concept mockups.

Plain http.server lets the browser cache aggressively, which means edits to a
shared file like touch-cursor.js silently keep showing the old version. Every
response here is marked no-store so a normal reload always picks up the change.
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_header(self, keyword, value):
        # drop the validators, otherwise the browser can still ask for a 304
        if keyword in ("Last-Modified", "ETag"):
            return
        super().send_header(keyword, value)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
    root = sys.argv[2] if len(sys.argv) > 2 else "."
    handler = partial(NoCacheHandler, directory=root)
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"serving {root} on http://127.0.0.1:{port} (no-store)")
    server.serve_forever()


if __name__ == "__main__":
    main()
