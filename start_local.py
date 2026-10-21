#!/usr/bin/env python3
"""Serve this booth only to this computer. Python 3, no extra packages needed."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import webbrowser

ROOT = Path(__file__).resolve().parent

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

if __name__ == '__main__':
    for port in range(8765, 8775):
        try:
            server = ThreadingHTTPServer(('127.0.0.1', port), partial(Handler, directory=str(ROOT)))
            break
        except OSError:
            continue
    else:
        raise SystemExit('Ports 8765-8774 are already in use. Close another local server and retry.')
    url = f'http://localhost:{port}/index.html'
    print(f'Photo booth: {url}\nKeep this window open. Press Ctrl+C to stop.')
    threading.Timer(1, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
