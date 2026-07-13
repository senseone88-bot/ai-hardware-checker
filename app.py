"""AI 硬體檢測工具 — 桌面版啟動器"""
import os, sys, subprocess, threading, time, webbrowser, socket, mimetypes
from pathlib import Path

# ── 路徑 ──
if getattr(sys, 'frozen', False):
    BASE = Path(sys._MEIPASS)
    log_path = Path(sys.executable).parent / "AIHC_debug.log"
else:
    BASE = Path(__file__).parent.resolve()
    log_path = BASE / "AIHC_debug.log"

def log(msg):
    try:
        with open(str(log_path), "a", encoding="utf-8") as f:
            f.write(f"{time.strftime('%H:%M:%S')} {msg}\n")
    except Exception:
        pass

log(f"=== 啟動 BASE={BASE}")


def handle(conn):
    try:
        conn.settimeout(30)
        data = conn.recv(8192)
        if not data:
            return
        request = data.decode("utf-8", errors="replace")
        path = request.split(" ")[1] if len(request.split(" ")) > 1 else "/"
        path = path.split("?")[0]
        if path == "/":
            path = "/index.html"
        filename = path.lstrip("/").replace("\\", "/")
        filepath = BASE / filename
        if filepath.exists() and filepath.is_file():
            body = filepath.read_bytes()
            if body[:3] == b'\xef\xbb\xbf':
                body = body[3:]
            ctype, _ = mimetypes.guess_type(str(filepath))
            resp = (
                f"HTTP/1.1 200 OK\r\n"
                f"Content-Type: {ctype or 'application/octet-stream'}\r\n"
                f"Content-Length: {len(body)}\r\n"
                f"Connection: close\r\n\r\n"
            ).encode() + body
        else:
            resp = (
                f"HTTP/1.1 404 Not Found\r\n"
                f"Content-Type: text/plain\r\n"
                f"Content-Length: 9\r\n"
                f"Connection: close\r\n\r\n"
                f"404 Not Found"
            ).encode()
        conn.sendall(resp)
    except socket.timeout:
        pass
    except Exception as e:
        log(f"Handler 例外: {e}")
    finally:
        try:
            conn.close()
        except Exception:
            pass


def run_detection():
    ps = BASE / "detect-hardware.ps1"
    if not ps.exists():
        log("PS not found")
        return
    log("PS 開始...")
    try:
        r = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(ps)],
            cwd=str(BASE), timeout=120,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        log(f"PS 結束 code={r.returncode}")
    except Exception as e:
        log(f"PS 例外: {e}")


def main():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(("127.0.0.1", 8000))
        s.listen(5)
        log("HTTP server OK")
    except Exception as e:
        log(f"Server 失敗: {e}")
        return

    def acceptor():
        while True:
            try:
                conn, addr = s.accept()
                threading.Thread(target=handle, args=(conn,), daemon=True).start()
            except Exception:
                break

    threading.Thread(target=acceptor, daemon=True).start()
    threading.Thread(target=run_detection, daemon=True).start()
    time.sleep(0.3)
    webbrowser.open("http://127.0.0.1:8000")
    log("瀏覽器已開")

    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
