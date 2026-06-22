#!/usr/bin/env python3
"""SmartMonitor Webhook サーバ。

POST/GET /update (または /hook) を受けると update.sh を実行し、
サイトを git pull + 再配置 + version.txt 更新する。
ダッシュボード側 (app.js) が version.txt の変化を検知して強制再読込する。

認証:
  - SMARTMONITOR_HOOK_SECRET が空      → 127.0.0.1 のみ待受 (ローカル専用・認証なし)
  - SMARTMONITOR_HOOK_SECRET が設定済み → 0.0.0.0 待受。次のいずれかが必要:
      * GitHub の X-Hub-Signature-256 (HMAC-SHA256, secret で検証)
      * ヘッダ  X-Hook-Token: <secret>
      * クエリ  ?token=<secret>

環境変数:
  SMARTMONITOR_REPO / SMARTMONITOR_WWW / SMARTMONITOR_UPDATE / SMARTMONITOR_BRANCH
  SMARTMONITOR_HOOK_PORT (既定 8765) / SMARTMONITOR_HOOK_BIND / SMARTMONITOR_HOOK_SECRET
"""
import hashlib
import hmac
import os
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.environ.get("SMARTMONITOR_REPO") or os.path.expanduser("~/smartmonitor")
WWW = os.environ.get("SMARTMONITOR_WWW") or os.path.expanduser("~/smartmonitor-dashboard/www")
UPDATE = os.environ.get("SMARTMONITOR_UPDATE") or os.path.join(HERE, "update.sh")
SECRET = os.environ.get("SMARTMONITOR_HOOK_SECRET", "")
PORT = int(os.environ.get("SMARTMONITOR_HOOK_PORT", "8765"))
BIND = os.environ.get("SMARTMONITOR_HOOK_BIND") or ("0.0.0.0" if SECRET else "127.0.0.1")


def run_update():
    env = dict(os.environ, SMARTMONITOR_REPO=REPO, SMARTMONITOR_WWW=WWW)
    try:
        p = subprocess.run(["bash", UPDATE], env=env, capture_output=True,
                           text=True, timeout=180)
        return p.returncode, (p.stdout + p.stderr)
    except Exception as e:  # noqa
        return 1, f"update error: {e}\n"


def authorized(handler, body):
    if not SECRET:
        return True  # ローカル専用待受
    sig = handler.headers.get("X-Hub-Signature-256", "")
    if sig.startswith("sha256="):
        mac = hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
        if hmac.compare_digest("sha256=" + mac, sig):
            return True
    if handler.headers.get("X-Hook-Token", "") == SECRET:
        return True
    q = parse_qs(urlparse(handler.path).query)
    if q.get("token", [""])[0] == SECRET:
        return True
    return False


class Handler(BaseHTTPRequestHandler):
    def _reply(self, code, text):
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write(text.encode())

    def _handle(self):
        path = urlparse(self.path).path
        if path not in ("/update", "/hook"):
            return self._reply(404, "not found")
        length = int(self.headers.get("Content-Length", 0) or 0)
        body = self.rfile.read(length) if length else b""
        if not authorized(self, body):
            return self._reply(403, "forbidden")
        code, out = run_update()
        self._reply(200 if code == 0 else 500, out or "done")

    def do_POST(self):
        self._handle()

    def do_GET(self):
        if urlparse(self.path).path in ("/update", "/hook"):
            self._handle()
        else:
            self._reply(200, "smartmonitor update server\n")

    def log_message(self, *a):  # ログ抑制
        pass


if __name__ == "__main__":
    print(f"[update-server] listening on {BIND}:{PORT} "
          f"(auth={'token/HMAC' if SECRET else 'localhost-only'})")
    ThreadingHTTPServer((BIND, PORT), Handler).serve_forever()
