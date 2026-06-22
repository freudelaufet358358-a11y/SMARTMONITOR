#!/usr/bin/env python3
"""SmartMonitor 配信サーバ (Home Assistant 不要)。

www/ を静的配信しつつ、ダッシュボードの設定UIからの保存を受け付ける小さなサーバ。
標準の `python3 -m http.server` を置き換える。Python 標準ライブラリのみ・pip 依存なし。

  GET  /api/config  -> config.json をそのまま返す
  POST /api/config  -> 受信した JSON で config.json を更新し、天気/RSS を即時取得

  WWW  は環境変数 SMARTMONITOR_WWW、無ければスクリプト隣の www/。
  HOST/PORT は SMARTMONITOR_HOST / SMARTMONITOR_PORT で上書き可 (既定 127.0.0.1:8080)。
"""
import json
import os
import subprocess
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WWW = os.environ.get("SMARTMONITOR_WWW") or os.path.join(SCRIPT_DIR, "www")
CONFIG = os.path.join(WWW, "config.json")
FETCH = os.path.join(SCRIPT_DIR, "fetch_data.py")
HOST = os.environ.get("SMARTMONITOR_HOST", "127.0.0.1")
PORT = int(os.environ.get("SMARTMONITOR_PORT", "8080"))

MAX_BODY = 256 * 1024  # 設定 JSON の最大サイズ
# 設定UIから書き込みを許可するトップレベルキー（未知キーは無視して保護）
ALLOWED_TOP = {"title", "weather", "feeds", "news_max",
               "timetable", "calendar_embed_url"}


def run_fetch():
    """設定変更後に天気/RSS を取り直す（応答をブロックしないよう別スレッドで）。"""
    if not os.path.exists(FETCH):
        return
    try:
        env = dict(os.environ, SMARTMONITOR_WWW=WWW)
        subprocess.run([sys.executable, FETCH], env=env,
                       timeout=60, capture_output=True)
    except Exception as e:  # noqa: BLE001 - 取得失敗は致命ではない
        print(f"fetch after save failed: {e}", file=sys.stderr)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WWW, **kwargs)

    def _send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?", 1)[0] == "/api/config":
            try:
                with open(CONFIG, encoding="utf-8") as f:
                    self._send_json(200, json.load(f))
            except FileNotFoundError:
                self._send_json(404, {"error": "config not found"})
            except Exception as e:  # noqa: BLE001
                self._send_json(500, {"error": str(e)})
            return
        super().do_GET()

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/api/config":
            self._send_json(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length <= 0 or length > MAX_BODY:
                self._send_json(413, {"error": "invalid body length"})
                return
            incoming = json.loads(self.rfile.read(length))
            if not isinstance(incoming, dict):
                raise ValueError("config must be a JSON object")

            try:
                with open(CONFIG, encoding="utf-8") as f:
                    cfg = json.load(f)
            except Exception:  # noqa: BLE001 - 無ければ新規作成
                cfg = {}
            for key in ALLOWED_TOP:
                if key in incoming:
                    cfg[key] = incoming[key]

            tmp = CONFIG + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(cfg, f, ensure_ascii=False, indent=2)
            os.replace(tmp, CONFIG)  # 原子的に差し替え
        except Exception as e:  # noqa: BLE001
            self._send_json(400, {"error": str(e)})
            return

        threading.Thread(target=run_fetch, daemon=True).start()
        self._send_json(200, {"ok": True})

    def log_message(self, *args):
        pass  # systemd journal を汚さないよう既定のアクセスログは抑制


def main():
    os.makedirs(WWW, exist_ok=True)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"serving {WWW} on http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
