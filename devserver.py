"""Local dev server for V-Lo: like `python -m http.server 8080`, but tells the
browser not to cache, so a normal reload always picks up edited JS/CSS.
Run: python devserver.py   (then open http://localhost:8080/vlo.html)"""
import http.server
import socketserver


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", 8080), NoCacheHandler) as httpd:
    print("Serving V-Lo on http://localhost:8080/vlo.html")
    httpd.serve_forever()
