# mt5_manager.py
# MaatlaKebs — MT5 Manager (Main Process)
# Version 4.7 — Production Final (Pending Set Fix)
# ============================================================

from flask import Flask, request, jsonify
import subprocess
import requests as http_requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import logging
import threading
import time
import os
import sys
import signal
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError, as_completed

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s][Manager] %(message)s",
    stream=sys.stdout,
    force=True
)
logger = logging.getLogger(__name__)

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(line_buffering=True)

app = Flask(__name__)

# ── Config ────────────────────────────────────────────────────
SUPABASE_URL        = os.environ.get("SUPABASE_URL", "https://yrnjemftbqwvbvknlxol.supabase.co")
SUPABASE_KEY        = os.environ.get("SUPABASE_SERVICE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlybmplbWZ0YnF3dmJ2a25seG9sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTk1ODMyMSwiZXhwIjoyMDg3NTM0MzIxfQ.3Mh_msfKAq0gwVyad6A-VqvTEIfYzi9LYjVKrtO8g0g")
PROVISION_SECRET    = os.environ.get("PROVISION_SECRET", "9ecf9109adf78a9bdda26cfae02227d7")
SYNC_INTERVAL       = 60
BASE_PORT           = 5100
WORKER_TIMEOUT      = 30
TRADE_TIMEOUT       = 5
PYTHON_EXECUTABLE   = sys.executable
WORKER_SCRIPT       = os.path.join(os.path.dirname(__file__), "student_worker.py")
TERMINAL_BASE       = "C:\\MT5Terminals"
GHOST_SLOTS         = {"Student001", "Student002", "Student003"}
MAX_SLOT            = 53

trade_executor = ThreadPoolExecutor(max_workers=5, thread_name_prefix="TradeForwarder")
broadcast_semaphore = threading.Semaphore(5)

session = http_requests.Session()
retry_strategy = Retry(total=1, backoff_factor=0.1)
adapter = HTTPAdapter(max_retries=retry_strategy, pool_connections=20, pool_maxsize=20)
session.mount("http://", adapter)


# ── Worker Registry ───────────────────────────────────────────
workers = {}
workers_lock = threading.Lock()
workers_pending = set()  # 🔥 Prevent duplicate spawning
workers_pending_lock = threading.Lock()
worker_failures = {}
worker_restart_backoff = {}
next_port = BASE_PORT
port_lock = threading.Lock()


def get_next_port() -> int:
    global next_port
    with port_lock:
        port = next_port
        next_port += 1
    return port


# ── Supabase Helpers ──────────────────────────────────────────

def supabase_headers() -> dict:
    return {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        "return=minimal"
    }


def fetch_students() -> list[dict]:
    try:
        url = (
            f"{SUPABASE_URL}/rest/v1/student_accounts"
            f"?is_active=eq.true"
            f"&select=user_id,mt5_login,encrypted_password,mt5_server,folder_path,is_ghost"
        )
        resp = http_requests.get(url, headers=supabase_headers(), timeout=10)
        if resp.status_code == 200:
            return resp.json()
        return []
    except Exception as e:
        logger.error(f"Failed to fetch students: {e}")
        return []


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
        resp = http_requests.patch(patch_url, json=payload, headers=supabase_headers(), timeout=5)
        if resp.status_code == 404:
            url = f"{SUPABASE_URL}/rest/v1/connection_status"
            headers = {**supabase_headers(), "Prefer": "return=minimal"}
            http_requests.post(url, json=payload, headers=headers, timeout=5)
    except Exception:
        pass


def fetch_assigned_folder_paths() -> set[str]:
    try:
        url = f"{SUPABASE_URL}/rest/v1/student_accounts?select=folder_path&folder_path=not.is.null"
        resp = http_requests.get(url, headers=supabase_headers(), timeout=10)
        if resp.status_code == 200:
            assigned = set()
            for row in resp.json():
                fp = row.get("folder_path", "")
                if fp:
                    name = fp.replace("/", "\\").rstrip("\\").split("\\")[-1]
                    assigned.add(name)
            return assigned
        return set()
    except:
        return set()


def assign_folder_to_student(user_id: str, folder_path: str) -> bool:
    try:
        url = f"{SUPABASE_URL}/rest/v1/student_accounts?user_id=eq.{user_id}"
        resp = http_requests.patch(
            url,
            json={"folder_path": folder_path, "updated_at": datetime.now(timezone.utc).isoformat()},
            headers=supabase_headers(),
            timeout=10
        )
        return resp.status_code in (200, 204)
    except:
        return False


# ── Worker Management ─────────────────────────────────────────

def read_worker_output(process, user_id: str):
    try:
        for line in iter(process.stdout.readline, b''):
            if line:
                logger.info(f"[Worker-{user_id[:8]}] {line.decode(errors='replace').strip()}")
    except Exception:
        pass


def start_worker(user_id: str, login: str, password: str, server: str, folder_path: str, is_ghost: bool = False) -> bool:
    port = get_next_port()
    terminal_path = folder_path if folder_path else ""
    
    cmd = [
        PYTHON_EXECUTABLE, WORKER_SCRIPT,
        "--login",    str(login),
        "--password", str(password),
        "--server",   str(server),
        "--path",     str(terminal_path),
        "--port",     str(port),
    ]

    try:
        creationflags = 0
        if sys.platform == "win32":
            creationflags = subprocess.CREATE_NEW_PROCESS_GROUP
        
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            creationflags=creationflags,
            bufsize=0,
            universal_newlines=False
        )

        threading.Thread(target=read_worker_output, args=(process, user_id), daemon=True).start()

        logger.info(f"Waiting for worker {user_id[:8]} (login {login}) to start on port {port}...")
        for attempt in range(WORKER_TIMEOUT * 2):
            time.sleep(0.5)
            try:
                resp = http_requests.get(f"http://127.0.0.1:{port}/health", timeout=1)
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("connected"):
                        with workers_lock:
                            workers[user_id] = {
                                "process": process,
                                "port":    port,
                                "login":   int(login),
                                "server":  server,
                                "user_id": user_id,
                                "is_ghost": is_ghost,
                                "started": datetime.now(timezone.utc).isoformat()
                            }
                        logger.info(f"✓ Worker started | user={user_id[:8]} | login={login} | port={port}")
                        update_connection_status(user_id, "CONNECTED")
                        return True
            except:
                pass

            if process.poll() is not None:
                logger.error(f"Worker process for {user_id[:8]} died during startup")
                update_connection_status(user_id, "ERROR", f"Process died with code {process.poll()}")
                return False

        logger.error(f"Worker for {user_id[:8]} timed out starting after {WORKER_TIMEOUT}s")
        process.terminate()
        update_connection_status(user_id, "ERROR", "Worker timed out on startup")
        return False

    except Exception as e:
        logger.error(f"Failed to start worker for {user_id[:8]}: {e}")
        update_connection_status(user_id, "ERROR", str(e))
        return False


def stop_worker(user_id: str):
    with workers_lock:
        worker = workers.pop(user_id, None)

    if worker:
        try:
            worker["process"].terminate()
            worker["process"].wait(timeout=5)
        except:
            worker["process"].kill()
    update_connection_status(user_id, "DISCONNECTED")


def is_worker_healthy(user_id: str) -> bool:
    with workers_lock:
        worker = workers.get(user_id)

    if not worker:
        return False

    if worker["process"].poll() is not None:
        return False

    try:
        resp = session.get(f"http://127.0.0.1:{worker['port']}/health", timeout=1)
        return resp.status_code == 200
    except:
        return False


def forward_request_sync(user_id: str, endpoint: str, data: dict) -> dict:
    with workers_lock:
        worker = workers.get(user_id)

    if not worker:
        return {"status": "failed", "error": "No worker"}

    try:
        resp = session.post(
            f"http://127.0.0.1:{worker['port']}{endpoint}",
            json=data,
            timeout=TRADE_TIMEOUT
        )
        return resp.json()
    except:
        return {"status": "failed", "error": "Request failed"}


# ── Staggered Startup ─────────────────────────────────────────

def staggered_start_all(students_to_start: list):
    total = len(students_to_start)
    for i, (user_id, login, password, server, folder, is_ghost) in enumerate(students_to_start):
        logger.info(f"🚀 Starting worker {i+1}/{total}: {user_id[:8]} (login: {login})")
        success = start_worker(user_id, login, password, server, folder, is_ghost)
        
        # 🔥 Remove from pending regardless of outcome
        with workers_pending_lock:
            workers_pending.discard(user_id)
        
        if not success:
            logger.error(f"❌ Worker {user_id[:8]} failed to start")
        
        if i < total - 1:
            logger.info(f"⏳ Waiting 8s before next worker...")
            time.sleep(8)


# ── Sync Loop ─────────────────────────────────────────────────

def sync_loop():
    logger.info("Sync thread started")
    
    while True:
        try:
            students = fetch_students()
            active_ids = set()
            ghost_count = 0
            live_count = 0
            
            new_students = []
            unhealthy_students = []

            for student in students:
                user_id  = student.get("user_id")
                login    = student.get("mt5_login")
                password = student.get("encrypted_password")
                server   = student.get("mt5_server", "")
                folder   = student.get("folder_path", "")
                is_ghost = student.get("is_ghost", False)

                if not all([user_id, login, password]):
                    continue

                if not is_ghost and not folder:
                    continue

                active_ids.add(user_id)
                
                if is_ghost:
                    ghost_count += 1
                else:
                    live_count += 1

                with workers_lock:
                    exists = user_id in workers

                if not exists:
                    # 🔥 Check pending set to avoid duplicate spawning
                    with workers_pending_lock:
                        already_pending = user_id in workers_pending
                    
                    if not already_pending:
                        new_students.append((user_id, login, password, server, folder, is_ghost))
                elif not is_worker_healthy(user_id):
                    worker_failures[user_id] = worker_failures.get(user_id, 0) + 1
                    if worker_failures[user_id] >= 3:
                        unhealthy_students.append((user_id, login, password, server, folder, is_ghost))
                        worker_failures[user_id] = 0
                else:
                    worker_failures[user_id] = 0
                    if user_id in worker_restart_backoff:
                        worker_restart_backoff[user_id] = 5

            # 🔥 Start new workers in background (with pending tracking)
            if new_students:
                with workers_pending_lock:
                    for uid, *_ in new_students:
                        workers_pending.add(uid)
                
                threading.Thread(
                    target=staggered_start_all,
                    args=(new_students,),
                    daemon=True
                ).start()

            # Restart unhealthy workers
            if unhealthy_students:
                logger.info(f"🔄 Restarting {len(unhealthy_students)} unhealthy workers...")
                for user_id, login, password, server, folder, is_ghost in unhealthy_students:
                    backoff = worker_restart_backoff.get(user_id, 5)
                    logger.warning(f"⚠️ Worker {user_id[:8]} unhealthy — restarting (backoff: {backoff}s)")
                    time.sleep(backoff)
                    stop_worker(user_id)
                    time.sleep(2)
                    if start_worker(user_id, login, password, server, folder, is_ghost):
                        worker_restart_backoff[user_id] = min(backoff * 2, 60)

            # Remove deactivated students
            with workers_lock:
                current_ids = list(workers.keys())

            for uid in current_ids:
                if uid not in active_ids:
                    logger.info(f"👋 Student {uid[:8]} deactivated — stopping worker...")
                    stop_worker(uid)

            with workers_lock:
                total_workers = len(workers)
            
            logger.info(f"✅ Sync complete: {total_workers} active workers ({ghost_count} ghost, {live_count} live)")

        except Exception as e:
            logger.error(f"Sync loop error: {e}")

        time.sleep(SYNC_INTERVAL)


# ── Flask Routes ──────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    with workers_lock:
        worker_info = {}
        for uid, w in workers.items():
            worker_info[uid[:8]] = {
                "port":    w["port"],
                "login":   w["login"],
                "alive":   w["process"].poll() is None
            }
    
    return jsonify({
        "status":  "ok",
        "workers": len(worker_info),
        "details": worker_info,
        "time":    datetime.now(timezone.utc).isoformat()
    })


@app.route("/provision", methods=["POST"])
def provision_student():
    secret = request.headers.get("X-Provision-Secret", "")
    if not PROVISION_SECRET or secret != PROVISION_SECRET:
        return jsonify({"status": "failed", "error": "Unauthorized"}), 401

    data = request.json or {}
    user_id = data.get("user_id", "").strip()

    if not user_id:
        return jsonify({"status": "failed", "error": "user_id is required"}), 400

    try:
        check_url = f"{SUPABASE_URL}/rest/v1/student_accounts?user_id=eq.{user_id}&select=user_id,folder_path,is_ghost"
        resp = http_requests.get(check_url, headers=supabase_headers(), timeout=10)
        if resp.status_code != 200 or not resp.json():
            return jsonify({"status": "failed", "error": "Student account not found"}), 404

        student = resp.json()[0]

        if student.get("is_ghost"):
            return jsonify({"status": "failed", "error": "Ghost accounts cannot be provisioned"}), 400

        if student.get("folder_path"):
            return jsonify({"status": "already_provisioned", "folder_path": student["folder_path"]}), 200

    except Exception as e:
        return jsonify({"status": "failed", "error": str(e)}), 500

    assigned = fetch_assigned_folder_paths()
    assigned_slot = None
    
    for i in range(4, MAX_SLOT + 1):
        slot_name = f"Student{i:03d}"
        if slot_name in GHOST_SLOTS:
            continue
        if slot_name not in assigned:
            folder_path = f"{TERMINAL_BASE}\\{slot_name}"
            if os.path.exists(os.path.join(folder_path, "terminal64.exe")):
                assigned_slot = slot_name
                break

    if not assigned_slot:
        return jsonify({"status": "failed", "error": "No terminal slots available"}), 503

    folder_path = f"{TERMINAL_BASE}\\{assigned_slot}"
    success = assign_folder_to_student(user_id, folder_path)

    if not success:
        return jsonify({"status": "failed", "error": "Failed to save slot assignment"}), 500

    logger.info(f"✅ Provisioned student {user_id[:8]} → {folder_path}")
    return jsonify({"status": "success", "folder_path": folder_path, "slot": assigned_slot})


@app.route("/trade", methods=["POST"], strict_slashes=False)
def execute_trade():
    data = request.json
    if not data:
        return jsonify({"status": "failed", "error": "Empty body"}), 400
        
    login = int(data.get("login", 0))
    if not login:
        return jsonify({"status": "failed", "error": "login required"}), 400

    user_id = None
    with workers_lock:
        for uid, w in workers.items():
            if w["login"] == login:
                user_id = uid
                break

    if not user_id:
        return jsonify({"status": "failed", "error": f"No worker for login {login}"}), 404

    result = forward_request_sync(user_id, "/trade", data)
    return jsonify(result), 200 if result.get("status") in ["success", "queued"] else 500


@app.route("/trade/broadcast", methods=["POST"], strict_slashes=False)
def execute_trade_broadcast():
    logger.info(f"📡 Incoming /trade/broadcast request from {request.remote_addr}")
    
    data = request.json
    if not data:
        return jsonify({"status": "failed", "error": "Empty body"}), 400
    
    symbol = data.get("symbol")
    order_type = data.get("order_type")
    volume = data.get("volume")
    
    if not all([symbol, order_type, volume]):
        return jsonify({"status": "failed", "error": "symbol, order_type, and volume required"}), 400
    
    with workers_lock:
        all_workers = list(workers.items())
    
    logger.info(f"🚀 Broadcasting {symbol} {order_type} {volume} to {len(all_workers)} workers")
    
    if not broadcast_semaphore.acquire(timeout=2):
        logger.error("❌ Broadcast rejected — system overloaded")
        return jsonify({"status": "failed", "error": "System overloaded, retry later"}), 503
    
    try:
        results = []
        successes = 0
        failures = 0
        future_map = {}
        
        with ThreadPoolExecutor(max_workers=5) as executor:
            for i, (uid, w) in enumerate(all_workers):
                trade_data = {
                    "login": w["login"],
                    "symbol": symbol,
                    "order_type": order_type,
                    "volume": volume,
                    "mentor_ticket": data.get("mentor_ticket", "")
                }
                future = executor.submit(forward_request_sync, uid, "/trade", trade_data)
                future_map[future] = (uid, w["login"])
                
                if i % 5 == 4:
                    time.sleep(0.05)
            
            for future in as_completed(future_map, timeout=TRADE_TIMEOUT + 2):
                uid, login = future_map[future]
                try:
                    result = future.result(timeout=TRADE_TIMEOUT)
                    results.append({
                        "login": login,
                        "status": result.get("status"),
                        "ticket": result.get("ticket"),
                        "error": result.get("error")
                    })
                    if result.get("status") in ["success", "queued"]:
                        successes += 1
                        logger.info(f"  ✅ {login}: {result.get('status')}")
                    else:
                        failures += 1
                        logger.warning(f"  ❌ {login}: {result.get('error')}")
                except FuturesTimeoutError:
                    failures += 1
                    results.append({"login": login, "status": "failed", "error": "Timeout"})
                    logger.error(f"  ⏰ {login}: timed out")
                except Exception as e:
                    failures += 1
                    results.append({"login": login, "status": "failed", "error": str(e)})
                    logger.error(f"  ❌ {login}: {e}")
        
        logger.info(f"📊 Broadcast complete: {successes} success, {failures} failed")
        
        return jsonify({
            "status": "broadcast_complete",
            "total": len(results),
            "successes": successes,
            "failures": failures,
            "results": results
        })
    finally:
        broadcast_semaphore.release()


@app.route("/close", methods=["POST"])
def close_trade():
    data = request.json
    if not data:
        return jsonify({"status": "failed", "error": "Empty body"}), 400
        
    login = int(data.get("login", 0))
    if not login:
        return jsonify({"status": "failed", "error": "login required"}), 400

    user_id = None
    with workers_lock:
        for uid, w in workers.items():
            if w["login"] == login:
                user_id = uid
                break

    if not user_id:
        return jsonify({"status": "skipped", "reason": f"No worker for login {login}"}), 200

    result = forward_request_sync(user_id, "/close", data)
    return jsonify(result), 200


@app.route("/workers", methods=["GET"])
def list_workers():
    with workers_lock:
        worker_list = [
            {"login": w["login"], "port": w["port"], "alive": w["process"].poll() is None}
            for w in workers.values()
        ]
        return jsonify({"count": len(workers), "workers": worker_list})


# ── Graceful Shutdown ─────────────────────────────────────────

def shutdown_all():
    logger.info("🛑 Shutting down all workers...")
    with workers_lock:
        ids = list(workers.keys())
    for uid in ids:
        stop_worker(uid)
    trade_executor.shutdown(wait=True)
    session.close()
    logger.info("✅ All workers stopped.")


def handle_signal(signum, frame):
    shutdown_all()
    sys.exit(0)


# ── Entry Point ───────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60, flush=True)
    print("MaatlaKebs MT5 Manager v4.7 starting...", flush=True)
    print(f"Trade timeout: {TRADE_TIMEOUT}s | Worker timeout: {WORKER_TIMEOUT}s | Staggered: 8s gap", flush=True)
    print("=" * 60, flush=True)

    if not SUPABASE_KEY:
        logger.error("SUPABASE_SERVICE_KEY environment variable not set!")
        sys.exit(1)

    if not os.path.exists(WORKER_SCRIPT):
        logger.error(f"student_worker.py not found at {WORKER_SCRIPT}")
        sys.exit(1)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    def start_background_services():
        time.sleep(3)
        logger.info("Starting background sync loop...")
        sync_loop()
    
    threading.Thread(target=start_background_services, daemon=True).start()

    try:
        from waitress import serve
        logger.info("Starting Waitress production server on port 5000...")
        print("🚀 Manager is running with Waitress. Press Ctrl+C to stop.", flush=True)
        serve(app, host="0.0.0.0", port=5000, threads=32, connection_limit=200)
    except ImportError:
        logger.error("Waitress not installed! Run: pip install waitress")
        logger.warning("Falling back to Flask development server")
        print("⚠️ Using Flask dev server. Install waitress for production.", flush=True)
        app.run(host="0.0.0.0", port=5000, debug=False, threaded=True, use_reloader=False)