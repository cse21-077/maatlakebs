# mt5_manager.py
# MaatlaKebzCopier — MT5 Manager (Main Process)
# Coordinates all student worker processes
# Fetches students from Supabase
# Starts/stops worker processes automatically
# Forwards trade requests to correct worker
# Provisions new students with MT5 terminal slots
# ============================================================

from flask import Flask, request, jsonify
import subprocess
import requests as http_requests
import logging
import threading
import time
import os
import sys
import signal
from datetime import datetime, timezone

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s][Manager] %(message)s"
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# ── Config ────────────────────────────────────────────────────
SUPABASE_URL        = os.environ.get("SUPABASE_URL", "https://yrnjemftbqwvbvknlxol.supabase.co")
SUPABASE_KEY        = os.environ.get("SUPABASE_SERVICE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlybmplbWZ0YnF3dmJ2a25seG9sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTk1ODMyMSwiZXhwIjoyMDg3NTM0MzIxfQ.3Mh_msfKAq0gwVyad6A-VqvTEIfYzi9LYjVKrtO8g0g")
PROVISION_SECRET    = os.environ.get("PROVISION_SECRET", "9ecf9109adf78a9bdda26cfae02227d7")        # Shared secret for /provision
SYNC_INTERVAL       = 60          # seconds between Supabase syncs
BASE_PORT           = 5100        # worker ports start here
WORKER_TIMEOUT      = 10          # seconds to wait for worker to start
PYTHON_EXECUTABLE   = sys.executable
WORKER_SCRIPT       = os.path.join(os.path.dirname(__file__), "student_worker.py")
TERMINAL_BASE       = "C:\\MT5Terminals"
GHOST_SLOTS         = {"Student001", "Student002", "Student003"}  # Reserved for ghost accounts
MAX_SLOT            = 53          # Student004 to Student053 = 50 real slots


# ── Worker Registry ───────────────────────────────────────────
# { user_id: { "process": Popen, "port": int, "login": int } }
workers = {}
workers_lock = threading.Lock()
next_port = BASE_PORT


def get_next_port() -> int:
    global next_port
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
            f"&is_ghost=eq.false"
            f"&select=user_id,mt5_login,encrypted_password,mt5_server,folder_path"
        )
        resp = http_requests.get(url, headers=supabase_headers(), timeout=10)
        if resp.status_code == 200:
            return resp.json()
        logger.error(f"Supabase fetch error: {resp.status_code} {resp.text}")
        return []
    except Exception as e:
        logger.error(f"Failed to fetch students: {e}")
        return []


def update_connection_status(user_id: str, status: str, error_message: str = None):
    """
    Upsert connection status for a student in Supabase.
    status: CONNECTED | DISCONNECTED | ERROR | UNKNOWN
    Called after worker starts, stops, or health check fails.
    """
    try:
        payload = {
            "user_id":       user_id,
            "mt5_status":    status,
            "last_checked":  datetime.now(timezone.utc).isoformat(),
            "error_message": error_message,
            "updated_at":    datetime.now(timezone.utc).isoformat()
        }
        
        # 1. Try to UPDATE the existing record first
        patch_url = f"{SUPABASE_URL}/rest/v1/connection_status?user_id=eq.{user_id}"
        resp = http_requests.patch(patch_url, json=payload, headers=supabase_headers(), timeout=5)
        
        # 2. If 404 (doesn't exist) or 204 (no content - success), we check if we need to insert
        # Most of the time 204 means success. If 404, we insert.
        if resp.status_code == 404:
            url = f"{SUPABASE_URL}/rest/v1/connection_status"
            headers = {**supabase_headers(), "Prefer": "return=minimal"}
            resp = http_requests.post(url, json=payload, headers=headers, timeout=5)
            
        if resp.status_code not in (200, 201, 204):
            logger.error(f"Failed to update connection_status for {user_id}: {resp.status_code} {resp.text}")
    except Exception as e:
        logger.error(f"connection_status upsert error for {user_id}: {e}")


def fetch_assigned_folder_paths() -> set[str]:
    """Return all folder_path values currently assigned in student_accounts."""
    try:
        url = (
            f"{SUPABASE_URL}/rest/v1/student_accounts"
            f"?select=folder_path"
            f"&folder_path=not.is.null"
        )
        resp = http_requests.get(url, headers=supabase_headers(), timeout=10)
        if resp.status_code == 200:
            rows = resp.json()
            # Normalise to just the folder name e.g. "Student004"
            assigned = set()
            for row in rows:
                fp = row.get("folder_path", "")
                if fp:
                    # Extract last path component: C:\MT5Terminals\Student004 → Student004
                    name = fp.replace("/", "\\").rstrip("\\").split("\\")[-1]
                    assigned.add(name)
            return assigned
        logger.error(f"Failed to fetch folder paths: {resp.status_code}")
        return set()
    except Exception as e:
        logger.error(f"fetch_assigned_folder_paths error: {e}")
        return set()


def assign_folder_to_student(user_id: str, folder_path: str) -> bool:
    """Write the assigned folder_path back to student_accounts in Supabase."""
    try:
        url = (
            f"{SUPABASE_URL}/rest/v1/student_accounts"
            f"?user_id=eq.{user_id}"
        )
        resp = http_requests.patch(
            url,
            json={"folder_path": folder_path, "updated_at": datetime.now(timezone.utc).isoformat()},
            headers=supabase_headers(),
            timeout=10
        )
        return resp.status_code in (200, 204)
    except Exception as e:
        logger.error(f"assign_folder_to_student error: {e}")
        return False


# ── Worker Management ─────────────────────────────────────────

def start_worker(user_id: str, login: str, password: str, server: str, folder_path: str) -> bool:
    """Start a student_worker.py subprocess for this student."""
    port = get_next_port()

    cmd = [
        PYTHON_EXECUTABLE, WORKER_SCRIPT,
        "--login",    str(login),
        "--password", str(password),
        "--server",   str(server),
        "--path",     str(folder_path or ""),
        "--port",     str(port),
    ]

    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        )

        # Wait for worker to come online
        for attempt in range(WORKER_TIMEOUT * 2):
            time.sleep(0.5)
            try:
                resp = http_requests.get(f"http://127.0.0.1:{port}/health", timeout=2)
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
                                "started": datetime.now(timezone.utc).isoformat()
                            }
                        logger.info(f"Worker started | user={user_id} | login={login} | port={port}")
                        update_connection_status(user_id, "CONNECTED")
                        return True
            except Exception:
                pass

            if process.poll() is not None:
                out = process.stdout.read().decode(errors="replace")
                logger.error(f"Worker process died for {user_id}: {out}")
                update_connection_status(user_id, "ERROR", f"Worker process died: {out[:200]}")
                return False

        logger.error(f"Worker timed out starting for {user_id}")
        process.terminate()
        update_connection_status(user_id, "ERROR", "Worker timed out on startup")
        return False

    except Exception as e:
        logger.error(f"Failed to start worker for {user_id}: {e}")
        update_connection_status(user_id, "ERROR", str(e))
        return False


def stop_worker(user_id: str):
    """Stop a student worker process."""
    with workers_lock:
        worker = workers.pop(user_id, None)

    if worker:
        try:
            worker["process"].terminate()
            worker["process"].wait(timeout=5)
            logger.info(f"Worker stopped for user {user_id}")
        except Exception as e:
            logger.error(f"Error stopping worker {user_id}: {e}")

    # Always write DISCONNECTED back to Supabase when worker stops
    update_connection_status(user_id, "DISCONNECTED")


def is_worker_healthy(user_id: str) -> bool:
    """Check if a worker process is still running and connected."""
    with workers_lock:
        worker = workers.get(user_id)

    if not worker:
        return False

    if worker["process"].poll() is not None:
        logger.warning(f"Worker process for {user_id} has died")
        return False

    try:
        resp = http_requests.get(
            f"http://127.0.0.1:{worker['port']}/health",
            timeout=3
        )
        healthy = resp.status_code == 200 and resp.json().get("connected", False)
        if not healthy:
            update_connection_status(user_id, "ERROR", "Health check failed")
        return healthy
    except Exception:
        update_connection_status(user_id, "ERROR", "Health check unreachable")
        return False


def forward_request(user_id: str, endpoint: str, data: dict) -> dict:
    """Forward a trade/close request to the correct worker."""
    with workers_lock:
        worker = workers.get(user_id)

    if not worker:
        return {"status": "failed", "error": f"No worker for user {user_id}"}

    try:
        resp = http_requests.post(
            f"http://127.0.0.1:{worker['port']}{endpoint}",
            json=data,
            timeout=10 # Reduced from 30 to prevent manager freezing
        )
        return resp.json()
    except Exception as e:
        logger.error(f"Forward error to worker {user_id}: {e}")
        return {"status": "failed", "error": str(e)}


# ── Sync Loop ─────────────────────────────────────────────────

def sync_loop():
    """
    Background thread — syncs workers with Supabase every SYNC_INTERVAL seconds.
    Starts workers for new active students, stops workers for deactivated students,
    restarts dead workers.
    """
    while True:
        try:
            students = fetch_students()
            active_ids = set()

            for student in students:
                user_id  = student.get("user_id")
                login    = student.get("mt5_login")
                password = student.get("encrypted_password")
                server   = student.get("mt5_server", "")
                folder   = student.get("folder_path", "")

                if not all([user_id, login, password]):
                    continue

                # Skip students with no folder assigned yet — provisioning pending
                if not folder:
                    logger.warning(f"Student {user_id} has no folder_path — skipping until provisioned")
                    continue

                active_ids.add(user_id)

                with workers_lock:
                    exists = user_id in workers

                if not exists:
                    logger.info(f"New student {user_id} — starting worker...")
                    start_worker(user_id, login, password, server, folder)
                elif not is_worker_healthy(user_id):
                    logger.warning(f"Worker for {user_id} is unhealthy — restarting...")
                    stop_worker(user_id)
                    start_worker(user_id, login, password, server, folder)

            # Stop workers for deactivated students
            with workers_lock:
                current_ids = list(workers.keys())

            for uid in current_ids:
                if uid not in active_ids:
                    logger.info(f"Student {uid} deactivated — stopping worker...")
                    stop_worker(uid)

            with workers_lock:
                count = len(workers)
            logger.info(f"Sync complete: {count} active workers")

        except Exception as e:
            logger.error(f"Sync loop error: {e}")

        time.sleep(SYNC_INTERVAL)


# ── Flask Routes ──────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    with workers_lock:
        worker_info = {
            uid: {
                "port":    w["port"],
                "login":   w["login"],
                "server":  w["server"],
                "started": w["started"],
                "alive":   w["process"].poll() is None
            }
            for uid, w in workers.items()
        }
    return jsonify({
        "status":  "ok",
        "workers": len(worker_info),
        "details": worker_info,
        "time":    datetime.now(timezone.utc).isoformat()
    })


@app.route("/provision", methods=["POST"])
def provision_student():
    """
    Assign the next available MT5 terminal slot to a student.
    Called by the PWA (via Supabase Edge Function) after payment confirms.

    Request body:  { "user_id": "<uuid>" }
    Request header: X-Provision-Secret: <PROVISION_SECRET>

    Returns: { "status": "success", "folder_path": "C:\\MT5Terminals\\Student004" }
    """
    # ── Auth check ──
    secret = request.headers.get("X-Provision-Secret", "")
    if not PROVISION_SECRET or secret != PROVISION_SECRET:
        logger.warning(f"Provision attempt with invalid secret from {request.remote_addr}")
        return jsonify({"status": "failed", "error": "Unauthorized"}), 401

    data    = request.json or {}
    user_id = data.get("user_id", "").strip()

    if not user_id:
        return jsonify({"status": "failed", "error": "user_id is required"}), 400

    # ── Check student exists and has no folder yet ──
    try:
        check_url = (
            f"{SUPABASE_URL}/rest/v1/student_accounts"
            f"?user_id=eq.{user_id}"
            f"&select=user_id,folder_path,is_ghost"
        )
        resp = http_requests.get(check_url, headers=supabase_headers(), timeout=10)
        if resp.status_code != 200 or not resp.json():
            return jsonify({"status": "failed", "error": "Student account not found"}), 404

        student = resp.json()[0]

        if student.get("is_ghost"):
            return jsonify({"status": "failed", "error": "Ghost accounts cannot be provisioned"}), 400

        # Note: Folder reuse is now handled by provision-terminal.js (API layer)
        # This endpoint ONLY assigns NEW folders for users with no folder yet

    except Exception as e:
        logger.error(f"Provision check error: {e}")
        return jsonify({"status": "failed", "error": "Database check failed"}), 500

    # ── Find next available slot ──
    assigned = fetch_assigned_folder_paths()

    assigned_slot = None
    for i in range(4, MAX_SLOT + 1):          # Student004 → Student053
        slot_name = f"Student{i:03d}"
        if slot_name in GHOST_SLOTS:
            continue
        if slot_name not in assigned:
            # Verify the folder actually exists on disk
            folder_path = f"{TERMINAL_BASE}\\{slot_name}"
            terminal_exe = os.path.join(folder_path, "terminal64.exe")
            if os.path.exists(terminal_exe):
                assigned_slot = slot_name
                break
            else:
                logger.warning(f"Slot {slot_name} not assigned but folder missing on disk — skipping")

    if not assigned_slot:
        logger.error("No available MT5 terminal slots — all 50 slots are taken")
        return jsonify({"status": "failed", "error": "No terminal slots available. Contact support."}), 503

    # ── Assign the slot ──
    folder_path = f"{TERMINAL_BASE}\\{assigned_slot}"
    success = assign_folder_to_student(user_id, folder_path)

    if not success:
        logger.error(f"Failed to write folder_path to Supabase for {user_id}")
        return jsonify({"status": "failed", "error": "Failed to save slot assignment"}), 500

    update_connection_status(user_id, "UNKNOWN")
    logger.info(f"Provisioned student {user_id} → {folder_path}")

    return jsonify({
        "status":      "success",
        "folder_path": folder_path,
        "slot":        assigned_slot
    })


@app.route("/trade", methods=["POST"], strict_slashes=False)
def execute_trade():
    logger.info(f"Incoming /trade request from {request.remote_addr}")
    data = request.json
    if not data:
        return jsonify({"status": "failed", "error": "Empty body"}), 400
        
    login_val = data.get("login")
    if not login_val:
        return jsonify({"status": "failed", "error": "login field required"}), 400
        
    try:
        login = int(login_val)
    except (ValueError, TypeError):
        return jsonify({"status": "failed", "error": "login must be an integer"}), 400

    logger.info(f"Target login for trade: {login}")

    user_id = None
    with workers_lock:
        for uid, w in workers.items():
            if w["login"] == login:
                user_id = uid
                break

    if not user_id:
        logger.error(f"No active worker found for login {login}")
        return jsonify({"status": "failed", "error": f"No worker for login {login}"}), 404

    # Check worker health (uses its own lock internally)
    if not is_worker_healthy(user_id):
        logger.error(f"Worker {user_id} (login {login}) is found but unhealthy")
        return jsonify({"status": "failed", "error": f"Worker unhealthy for {login}"}), 503

    result = forward_request(user_id, "/trade", data)
    code   = 200 if result.get("status") == "success" else 500
    return jsonify(result), code


@app.route("/close", methods=["POST"])
def close_trade():
    data  = request.json
    login = int(data.get("login", 0))

    user_id = None
    with workers_lock:
        for uid, w in workers.items():
            if w["login"] == login:
                user_id = uid
                break

    if not user_id:
        return jsonify({"status": "skipped", "reason": f"No worker for login {login}"}), 200

    result = forward_request(user_id, "/close", data)
    return jsonify(result), 200


@app.route("/workers", methods=["GET"])
def list_workers():
    with workers_lock:
        return jsonify({
            "count":  len(workers),
            "logins": [w["login"] for w in workers.values()]
        })


# ── Graceful Shutdown ─────────────────────────────────────────

def shutdown_all():
    logger.info("Shutting down all workers...")
    with workers_lock:
        ids = list(workers.keys())
    for uid in ids:
        stop_worker(uid)
    logger.info("All workers stopped.")


def handle_signal(signum, frame):
    shutdown_all()
    sys.exit(0)


# ── Entry Point ───────────────────────────────────────────────

if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("MaatlaKebzCopier MT5 Manager v2.0 starting...")
    logger.info(f"Supabase URL: {SUPABASE_URL}")
    logger.info(f"Worker script: {WORKER_SCRIPT}")
    logger.info(f"Python: {PYTHON_EXECUTABLE}")
    logger.info(f"Terminal base: {TERMINAL_BASE}")
    logger.info(f"Max slots: Student004 — Student{MAX_SLOT:03d}")
    logger.info("=" * 60)

    if not SUPABASE_KEY:
        logger.error("SUPABASE_SERVICE_KEY environment variable not set!")
        sys.exit(1)

    if not PROVISION_SECRET:
        logger.error("PROVISION_SECRET environment variable not set!")
        sys.exit(1)

    if not os.path.exists(WORKER_SCRIPT):
        logger.error(f"student_worker.py not found at {WORKER_SCRIPT}")
        sys.exit(1)

    signal.signal(signal.SIGINT,  handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    sync_thread = threading.Thread(target=sync_loop, daemon=True)
    sync_thread.start()
    logger.info("Sync thread started — waiting for initial student load...")
    time.sleep(8)

    logger.info("Manager ready on port 5000")
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
