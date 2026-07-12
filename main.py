from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import uvicorn
import json
import atexit
import logging

logger = logging.getLogger("ai-hw-checker")
BASE_DIR = Path(__file__).parent.resolve()
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000", "http://127.0.0.1:8000"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

_monitor = None

def get_monitor():
    global _monitor
    if _monitor is None:
        from hardware_monitor import get_monitor as _get_monitor
        _monitor = _get_monitor()
    return _monitor

def _shutdown_monitor():
    global _monitor
    if _monitor is not None:
        try:
            _monitor.close()
        except Exception:
            pass
        _monitor = None
        import hardware_monitor
        hardware_monitor._singleton = None

atexit.register(_shutdown_monitor)


@app.get("/api/hardware")
async def get_hardware():
    try:
        monitor = get_monitor()
        all_hw, summary = monitor.get_hardware_and_summary()
        return JSONResponse({"status": "success", "summary": summary, "hardware": all_hw})
    except Exception as e:
        logger.exception("Failed to get hardware info")
        return JSONResponse({"status": "error", "message": "硬體偵測失敗"}, status_code=500)


@app.get("/api/hardware/raw")
async def get_hardware_raw():
    try:
        monitor = get_monitor()
        all_hw = monitor.get_all_hardware()
        return JSONResponse({"status": "success", "hardware": all_hw})
    except Exception as e:
        logger.exception("Failed to get raw hardware info")
        return JSONResponse({"status": "error", "message": "硬體偵測失敗"}, status_code=500)


@app.post("/api/report")
async def receive_report(request: Request):
    try:
        data = await request.json()
        safe_log = {k: str(v)[:200] for k, v in data.items()} if isinstance(data, dict) else "non-dict"
        logger.info("[客服小幫手] 收到報告: %s", json.dumps(safe_log, ensure_ascii=False))
        return JSONResponse({"status": "success", "message": "已收到"})
    except Exception:
        logger.exception("Failed to receive report")
        return JSONResponse({"status": "error", "message": "解析失敗"}, status_code=400)


@app.get("/", response_class=HTMLResponse)
async def root():
    return FileResponse(BASE_DIR / "ai-hardware-checker.html")


@app.get("/ai-hardware-checker.html", response_class=HTMLResponse)
async def main_page():
    return FileResponse(BASE_DIR / "ai-hardware-checker.html")


ALLOWED_EXTS = {".html", ".css", ".js", ".json", ".png", ".jpg", ".svg", ".ico", ".bat", ".ps1", ".txt", ".md"}

@app.get("/{file_path:path}")
async def serve_static(file_path: str):
    try:
        full = (BASE_DIR / file_path).resolve()
    except (ValueError, OSError):
        return JSONResponse({"error": "invalid path"}, status_code=400)
    if not full.is_relative_to(BASE_DIR):
        return JSONResponse({"error": "forbidden"}, status_code=403)
    if full.is_file():
        if full.suffix.lower() not in ALLOWED_EXTS:
            return JSONResponse({"error": "forbidden"}, status_code=403)
        return FileResponse(full)
    return JSONResponse({"error": "not found"}, status_code=404)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
    host = "127.0.0.1"
    port = 8000
    print("=" * 60)
    print("  本地端運行AI 模型硬體適配檢測器")
    print(f"  http://{host}:{port}")
    print(f"  硬體 API: http://{host}:{port}/api/hardware")
    print("=" * 60)
    uvicorn.run(app, host=host, port=port)
