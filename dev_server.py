"""Localhost development server for RoadGuard AI (http://localhost:3000)."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import socket
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")

from server_logic import process_get, process_post  # noqa: E402


class LocalDevHandler(SimpleHTTPRequestHandler):
    """Serve static frontend files from public/ and handle /api/reports locally."""

    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".webmanifest": "application/manifest+json; charset=utf-8",
        ".svg": "image/svg+xml",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def _send_json(self, status: int, payload: dict) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path.startswith("/api/reports"):
            status, payload = process_get()
            self._send_json(status, payload)
            return
        if self.path == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/reports"):
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
            try:
                body = json.loads(raw)
            except json.JSONDecodeError:
                self._send_json(400, {"error": "Invalid JSON body"})
                return
            status, payload = process_post(body)
            self._send_json(status, payload)
            return
        self._send_json(404, {"error": "Not found"})


def _get_lan_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except OSError:
        return ""


if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "3000"))
    server = ThreadingHTTPServer((host, port), LocalDevHandler)
    print(f"RoadGuard AI running locally at http://localhost:{port}")
    lan_ip = _get_lan_ip()
    if host == "0.0.0.0" and lan_ip:
        print(f"Mobile / LAN access (same Wi-Fi): http://{lan_ip}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down RoadGuard AI server.")
        server.server_close()
