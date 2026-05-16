# mt5_manager.py
# MaatlaKebs — MT5 Manager v5.0 (EA Slave Architecture)
# ============================================================
# ARCHITECTURE CHANGE:
#   OLD: Python workers spawned per student, HTTP forwarding, IPC to MT5
#   NEW: Python writes signal files, EA reads and executes inside MT5
#
# WHY WE SWITCHED:
#   Python workers had fatal IPC timeouts (-10005) on cold MT5 terminals.
#   12 paying clients received ZERO trades on May 13, 2026.
#   Pre-warming, staggered startup, and 30s timeouts couldn't fix it.
#   EA runs INSIDE MT5 — no IPC needed. No workers to manage.
#
# HOW IT WORKS:
#   1. Receives HTTP POST from Hetzner Celery with signal data
#   2. Fetches active students from Supabase (filtered by trader_id)
#   3. Writes ONE file per student via FILE_COMMON path:
#      %APPDATA%\MetaQuotes\Terminal\Common\Files\MaatlaKebs\signals\{login}.json
#   4. Returns immediately — does NOT wait for execution
#   5. Background thread collects result files from Common\Files\MaatlaKebs\results\
#   6. Background thread monitors terminal health, updates connection_status
#
# PORTABLE MT5 NOTE:
#   All signal/result folders MUST point to MetaQuotes Common\Files directory.
#   This is the shared folder that MT5's FILE_COMMON flag resolves to,
#   regardless of which portable terminal instance is running.
# ============================================================

import json
import os
import glob
import time
import uuid
import threading
import logging
import sys
import subprocess
from datetime import datetime, timezone

import requests as http_requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from flask import Flask, request, jsonify

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s][Manager] %(message)s",
    stream=sys.stdout,
    force=True
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# ── Config ────────────────────────────────────────────────────
SUPABASE_URL     = os.environ.get("SUPABASE_URL", "https://yrnjemftbqwvbvknlxol.supabase.co")
SUPABASE_KEY     = os.environ.get("SUPABASE_SERVICE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlybmplbWZ0YnF3dmJ2a25seG9sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTk1ODMyMSwiZXhwIjoyMDg3NTM0MzIxfQ.3Mh_msfKAq0gwVyad6A-VqvTEIfYzi9LYjVKrtO8g0g")
PROVISION_SECRET = os.environ.get("PROVISION_SECRET", "9ecf9109adf78a9bdda26cfae02227d7")
# --- Common MetaQuotes shared folder (FILE_COMMON in MQL5 resolves here) ---
_COMMON_FILES = os.path.join(
    os.environ.get("APPDATA", r"C:\Users\Administrator\AppData\Roaming"),
    r"MetaQuotes\Terminal\Common\Files"
)
SIGNALS_FOLDER   = os.environ.get("SIGNALS_FOLDER",   os.path.join(_COMMON_FILES, "MaatlaKebs", "signals"))
RESULTS_FOLDER   = os.environ.get("RESULTS_FOLDER",   os.path.join(_COMMON_FILES, "MaatlaKebs", "results"))
RESULT_SCAN_INTERVAL = int(os.environ.get("RESULT_SCAN_INTERVAL", "5"))
STALE_SIGNAL_SECONDS = int(os.environ.get("STALE_SIGNAL_SECONDS", "60"))
STUDENT_CACHE_SECONDS = 30
CONNECTION_CHECK_INTERVAL = 30

session = http_requests.Session()
retry_strategy = Retry(total=2, backoff_factor=0.2)
adapter = HTTPAdapter(max_retries=retry_strategy, pool_connections=50, pool_maxsize=50)
session.mount("http://", adapter)
session.mount("https://", adapter)

os.makedirs(SIGNALS_FOLDER, exist_ok=True)
os.makedirs(RESULTS_FOLDER, exist_ok=True)

# ── Threading Locks ───────────────────────────────────────────
_signal_locks = {}
_locks_lock = threading.Lock()

def _get_lock(login: str) -> threading.Lock:
    with _locks_lock:
        if login not in _signal_locks:
            _signal_locks[login] = threading.Lock()
        return _signal_locks[login]

# ── Student Cache ─────────────────────────────────────────────
_students_cache = []
_students_cache_time = 0
_students_cache_lock = threading.Lock()

# ── Helpers ───────────────────────────────────────────────────
def supabase_headers():
    return {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        "return=minimal"
    }

def fetch_active_students(trader_id: str = None, force_refresh: bool = False) -> list:
    global _students_cache, _students_cache_time
    
    with _students_cache_lock:
        if (not force_refresh and 
            time.time() - _students_cache_time < STUDENT_CACHE_SECONDS and 
            _students_cache):
            if trader_id:
                return [s for s in _students_cache if s.get("trader_id") == trader_id]
            return list(_students_cache)
    
    try:
        url = f"{SUPABASE_URL}/rest/v1/student_accounts?is_active=eq.true&select=user_id,mt5_login,trader_id,folder_path"
        if trader_id:
            url += f"&trader_id=eq.{trader_id}"
        
        resp = session.get(url, headers=supabase_headers(), timeout=10)
        if resp.status_code == 200:
            students = resp.json()
            with _students_cache_lock:
                _students_cache = students
                _students_cache_time = time.time()
            logger.info(f"Fetched {len(students)} active students" + (f" for trader={trader_id}" if trader_id else ""))
            return students
        else:
            logger.error(f"Supabase error {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        logger.error(f"Failed to fetch students: {e}")
    
    with _students_cache_lock:
        if _students_cache:
            logger.warning("Using stale student cache")
            if trader_id:
                return [s for s in _students_cache if s.get("trader_id") == trader_id]
            return list(_students_cache)
    return []

def push_results_to_supabase(results: list):
    if not results:
        return
    try:
        url = f"{SUPABASE_URL}/rest/v1/trade_logs"
        resp = session.post(
            url, 
            json=results,
            headers={**supabase_headers(), "Prefer": "return=representation"},
            timeout=15
        )
        if resp.status_code in (200, 201):
            logger.info(f"Pushed {len(results)} results to Supabase")
        else:
            logger.error(f"Supabase push {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        logger.error(f"Supabase push exception: {e}")

def update_connection_status(user_id: str, status: str, error_message: str = None):
    try:
        payload = {
            "user_id":       user_id,
            "mt5_status":    status,
            "last_checked":  datetime.now(timezone.utc).isoformat(),
            "error_message": error_message,
            "updated_at":    datetime.now(timezone.utc).isoformat()
        }
        patch_url = f"{SUPABASE_URL}/rest/v1/connection_status?user_id=eq.{user_id}"
        resp = session.patch(patch_url, json=payload, headers=supabase_headers(), timeout=5)
        if resp.status_code == 404:
            url = f"{SUPABASE_URL}/rest/v1/connection_status"
            session.post(url, json=payload, headers={**supabase_headers(), "Prefer": "return=minimal"}, timeout=5)
    except Exception as e:
        logger.error(f"Failed to update connection status for {user_id}: {e}")

def cleanup_stale_files():
    now = time.time()
    for f in glob.glob(os.path.join(SIGNALS_FOLDER, "*.json")):
        try:
            if now - os.path.getmtime(f) > STALE_SIGNAL_SECONDS:
                os.remove(f)
                logger.warning(f"Removed stale signal: {os.path.basename(f)}")
        except Exception:
            pass
    for f in glob.glob(os.path.join(RESULTS_FOLDER, "*_result.json")):
        try:
            if now - os.path.getmtime(f) > 300:
                os.remove(f)
        except Exception:
            pass

def get_running_terminal_paths() -> list:
    """Get list of running terminal64.exe executable paths via WMIC."""
    try:
        result = subprocess.run(
            ["wmic", "process", "where", "name=\"terminal64.exe\"", "get", "ExecutablePath", "/value"],
            capture_output=True, text=True, timeout=10
        )
        paths = []
        for line in result.stdout.split("\n"):
            line = line.strip()
            if line.startswith("ExecutablePath="):
                path = line.split("=", 1)[1].strip()
                if path:
                    paths.append(path.replace("/", "\\"))
        return paths
    except Exception as e:
        logger.error(f"Failed to query running terminals: {e}")
        return []

def write_signal_files(signal_data: dict, students: list) -> tuple:
    batch_id = str(uuid.uuid4())
    timestamp = int(time.time())
    written = 0
    failed = []
    
    for student in students:
        login = str(student.get("mt5_login", ""))
        if not login:
            continue
        
        payload = {
            "batch_id": batch_id,
            "timestamp": timestamp,
            "action": signal_data.get("action", "OPEN"),
            "symbol": signal_data.get("symbol", ""),
            "order_type": signal_data.get("order_type", ""),
            "volume": float(signal_data.get("volume", 0)),
            "mentor_ticket": str(signal_data.get("mentor_ticket", "")),
            "sl": float(signal_data.get("sl", 0)),
            "tp": float(signal_data.get("tp", 0)),
            "student_id": student.get("user_id", ""),
            "login": login
        }
        
        filepath = os.path.join(SIGNALS_FOLDER, f"{login}.json")
        tmppath = filepath + ".tmp"
        lock = _get_lock(login)
        
        acquired = lock.acquire(blocking=True, timeout=5.0)
        if not acquired:
            logger.error(f"Lock timeout for {login}")
            failed.append(login)
            continue
        
        try:
            with open(tmppath, "w") as f:
                json.dump(payload, f)
            os.replace(tmppath, filepath)
            written += 1
        except Exception as e:
            logger.error(f"Write failed for {login}: {e}")
            failed.append(login)
        finally:
            lock.release()
    
    logger.info(f"Wrote {written}/{len(students)} signals (batch={batch_id[:8]})")
    return written, failed

# ── Flask Routes ──────────────────────────────────────────────
@app.route("/health", methods=["GET"])
def health():
    try:
        signal_count = len(glob.glob(os.path.join(SIGNALS_FOLDER, "*.json")))
        result_count = len(glob.glob(os.path.join(RESULTS_FOLDER, "*_result.json")))
        with _students_cache_lock:
            cached = len(_students_cache)
        return jsonify({
            "status": "ok",
            "pending_signals": signal_count,
            "pending_results": result_count,
            "cached_students": cached,
            "time": datetime.now(timezone.utc).isoformat()
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/signal", methods=["POST"])
def receive_signal():
    try:
        data = request.json
        if not data:
            return jsonify({"status": "failed", "error": "Empty body"}), 400
        
        symbol = data.get("symbol")
        order_type = data.get("order_type")
        volume = data.get("volume")
        action = data.get("action", "OPEN")
        mentor_ticket = data.get("mentor_ticket", str(uuid.uuid4()))
        trader_id = data.get("trader_id", "")
        sl = data.get("stop_loss", 0)
        tp = data.get("take_profit", 0)
        
        if not symbol or not order_type or volume is None:
            return jsonify({"status": "failed", "error": "symbol, order_type, volume required"}), 400
        
        students = fetch_active_students(trader_id if trader_id else None)
        if not students:
            return jsonify({"status": "failed", "error": "No active students"}), 404
        
        signal_data = {
            "action": action,
            "symbol": symbol,
            "order_type": order_type,
            "volume": float(volume),
            "mentor_ticket": str(mentor_ticket),
            "sl": float(sl),
            "tp": float(tp),
        }
        
        written, failed = write_signal_files(signal_data, students)
        
        return jsonify({
            "status": "written",
            "batch_id": str(uuid.uuid4())[:8],
            "students_total": len(students),
            "files_written": written,
            "files_failed": len(failed),
            "failed_logins": failed,
        })
    except Exception as e:
        logger.error(f"Signal error: {e}")
        return jsonify({"status": "failed", "error": str(e)}), 500

@app.route("/refresh-students", methods=["POST"])
def refresh_students():
    try:
        body = request.json or {}
        trader_id = body.get("trader_id", "")
        students = fetch_active_students(trader_id if trader_id else None, force_refresh=True)
        return jsonify({
            "status": "refreshed",
            "count": len(students),
            "trader_id": trader_id or "all"
        })
    except Exception as e:
        return jsonify({"status": "failed", "error": str(e)}), 500

@app.route("/provision", methods=["POST"])
def provision_student():
    secret = request.headers.get("X-Provision-Secret", "")
    if not PROVISION_SECRET or secret != PROVISION_SECRET:
        return jsonify({"status": "failed", "error": "Unauthorized"}), 401
    
    data = request.json or {}
    user_id = data.get("user_id", "").strip()
    if not user_id:
        return jsonify({"status": "failed", "error": "user_id required"}), 400
    
    try:
        url = f"{SUPABASE_URL}/rest/v1/student_accounts?select=folder_path&folder_path=not.is.null"
        resp = session.get(url, headers=supabase_headers(), timeout=10)
        assigned = set()
        if resp.status_code == 200:
            for row in resp.json():
                fp = row.get("folder_path", "")
                if fp:
                    assigned.add(fp.replace("/", "\\").rstrip("\\").split("\\")[-1])
    except Exception:
        assigned = set()
    
    TERMINAL_BASE = r"C:\MT5Terminals"
    GHOST_SLOTS = {"Student001", "Student002", "Student003"}
    MAX_SLOT = 53
    
    for i in range(4, MAX_SLOT + 1):
        slot_name = f"Student{i:03d}"
        if slot_name in GHOST_SLOTS or slot_name in assigned:
            continue
        folder_path = os.path.join(TERMINAL_BASE, slot_name)
        if os.path.exists(os.path.join(folder_path, "terminal64.exe")):
            try:
                patch_url = f"{SUPABASE_URL}/rest/v1/student_accounts?user_id=eq.{user_id}"
                session.patch(patch_url, json={"folder_path": folder_path}, headers=supabase_headers(), timeout=10)
                logger.info(f"Provisioned {user_id[:8]} -> {slot_name}")
                return jsonify({"status": "success", "folder_path": folder_path, "slot": slot_name})
            except Exception:
                return jsonify({"status": "failed", "error": "DB update failed"}), 500
    
    return jsonify({"status": "failed", "error": "No slots available"}), 503

# ── Background Threads ────────────────────────────────────────
def result_collector_loop():
    logger.info("Result collector started")
    while True:
        try:
            files = glob.glob(os.path.join(RESULTS_FOLDER, "*_result.json"))
            if files:
                batch = []
                for fp in files:
                    try:
                        # utf-8-sig strips BOM if present; fallback to utf-16 for
                        # any files written before FILE_ANSI was added to the EA
                        try:
                            with open(fp, "r", encoding="utf-8-sig") as f:
                                batch.append(json.load(f))
                        except (UnicodeDecodeError, ValueError):
                            with open(fp, "r", encoding="utf-16") as f:
                                batch.append(json.load(f))
                        os.remove(fp)
                    except Exception as e:
                        logger.error(f"Bad result file {fp}: {e}")
                
                if batch:
                    push_results_to_supabase(batch)
                    logger.info(f"Collected {len(batch)} results")
            
            cleanup_stale_files()
        except Exception as e:
            logger.error(f"Collector error: {e}")
        time.sleep(RESULT_SCAN_INTERVAL)

def connection_monitor_loop():
    """Monitor running MT5 terminals and update connection_status in Supabase."""
    logger.info("Connection monitor started")
    while True:
        try:
            students = fetch_active_students(force_refresh=True)
            running_paths = get_running_terminal_paths()
            
            for student in students:
                user_id = student.get("user_id")
                folder = student.get("folder_path", "")
                login = str(student.get("mt5_login", ""))
                
                if not folder:
                    update_connection_status(user_id, "DISCONNECTED", "No folder_path assigned")
                    continue
                
                # Check if terminal process is running from this folder
                folder_normalized = folder.replace("/", "\\")
                is_running = any(folder_normalized in path for path in running_paths)
                
                # Also check for recent EA activity (result files)
                has_recent_activity = False
                if login:
                    result_file = os.path.join(RESULTS_FOLDER, f"{login}_result.json")
                    if os.path.exists(result_file):
                        if time.time() - os.path.getmtime(result_file) < 300:
                            has_recent_activity = True
                
                if is_running or has_recent_activity:
                    update_connection_status(user_id, "CONNECTED")
                else:
                    update_connection_status(user_id, "DISCONNECTED", "Terminal not running")
                    
        except Exception as e:
            logger.error(f"Connection monitor error: {e}")
        
        time.sleep(CONNECTION_CHECK_INTERVAL)

# ── Entry Point ───────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60, flush=True)
    print("MaatlaKebs MT5 Manager v5.0 — EA Slave Architecture", flush=True)
    print(f"Signals: {SIGNALS_FOLDER}", flush=True)
    print(f"Results: {RESULTS_FOLDER}", flush=True)
    print(f"Stale cleanup: {STALE_SIGNAL_SECONDS}s", flush=True)
    print("=" * 60, flush=True)
    
    threading.Thread(target=result_collector_loop, daemon=True).start()
    threading.Thread(target=connection_monitor_loop, daemon=True).start()
    
    try:
        from waitress import serve
        serve(app, host="0.0.0.0", port=5000, threads=32, connection_limit=200)
    except ImportError:
        logger.warning("waitress not found, using Flask dev server")
        app.run(host="0.0.0.0", port=5000, debug=False, threaded=True, use_reloader=False)
