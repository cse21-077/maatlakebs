"""SkuD MT5 command bridge. Uses only the Python standard library.

A single static bridge key (SKUD_BRIDGE_KEY) protects every endpoint; the same
key is baked into the private PWA build, so clients never authenticate by hand.
MT5 accounts are registered over HTTPS; the bridge stores credentials in the local
SQLite database, launches portable MT5 terminals with startup.ini auto-login, and
queues orders and close requests per account. The SkuD EA inside each terminal polls locally,
claims its account's commands, and executes them in MT5.
"""

from __future__ import annotations

import hmac
import hashlib
import json
import math
import os
import re
import sqlite3
import subprocess
import threading
import time
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

import terminal_manager as tm

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("SKUD_DB_PATH", ROOT / "data" / "skud.sqlite3"))
BRIDGE_KEY = os.environ.get("SKUD_BRIDGE_KEY", "")
EA_TOKEN = os.environ.get("SKUD_EA_TOKEN", "")
ALLOWED_ORIGIN = os.environ.get("SKUD_ALLOWED_ORIGIN", "http://localhost:3000")
MAX_BATCH_SIZE = 100
MAX_TICK_BATCH_SIZE = 200
ORDER_TYPES = {
    "MARKET_BUY", "MARKET_SELL", "BUY_LIMIT", "SELL_LIMIT", "BUY_STOP", "SELL_STOP"
}
SYMBOL_RE = re.compile(r"^[A-Za-z0-9._ ()-]{1,64}$")
LOGIN_RE = re.compile(r"^\d{4,20}$")
MENTOR_ID_RE = re.compile(r"^[A-Za-z0-9_-]{3,64}$")
HEARTBEAT_STALE_SEC = 30
CLOSE_STATUSES = {"closed", "failed"}


def connect_db(path: Path | None = None) -> sqlite3.Connection:
    path = path or DB_PATH
    connection = sqlite3.connect(path, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute(
        """CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            login TEXT NOT NULL,
            symbol TEXT NOT NULL,
            order_type TEXT NOT NULL,
            volume REAL NOT NULL,
            entry_price REAL NOT NULL,
            tp_enabled INTEGER NOT NULL,
            tp_distance REAL NOT NULL,
            status TEXT NOT NULL,
            ticket TEXT,
            result_message TEXT,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL
        )"""
    )
    order_columns = {row[1] for row in connection.execute("PRAGMA table_info(orders)")}
    if "login" not in order_columns:
        connection.execute("ALTER TABLE orders ADD COLUMN login TEXT NOT NULL DEFAULT ''")
    if "sl_enabled" not in order_columns:
        connection.execute("ALTER TABLE orders ADD COLUMN sl_enabled INTEGER NOT NULL DEFAULT 0")
    if "sl_distance" not in order_columns:
        connection.execute("ALTER TABLE orders ADD COLUMN sl_distance REAL NOT NULL DEFAULT 0")
    for name, definition in (
        ("mentor_id", "TEXT NOT NULL DEFAULT ''"),
        ("mentor_name", "TEXT NOT NULL DEFAULT ''"),
        ("source_event_id", "TEXT NOT NULL DEFAULT ''"),
        ("source_position_id", "TEXT NOT NULL DEFAULT ''"),
    ):
        if name not in order_columns:
            connection.execute(f"ALTER TABLE orders ADD COLUMN {name} {definition}")
    connection.execute(
        """CREATE TABLE IF NOT EXISTS batches (
            idempotency_key TEXT PRIMARY KEY,
            request_hash TEXT NOT NULL,
            response_json TEXT NOT NULL,
            created_at REAL NOT NULL
        )"""
    )
    connection.execute(
        """CREATE TABLE IF NOT EXISTS terminal_status (
            login TEXT PRIMARY KEY,
            connected INTEGER NOT NULL,
            last_seen REAL NOT NULL,
            message TEXT NOT NULL DEFAULT '',
            server TEXT NOT NULL DEFAULT '',
            balance REAL NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT ''
        )"""
    )
    status_columns = {row[1] for row in connection.execute("PRAGMA table_info(terminal_status)")}
    if "server" not in status_columns:
        connection.execute("ALTER TABLE terminal_status ADD COLUMN server TEXT NOT NULL DEFAULT ''")
    if "balance" not in status_columns:
        connection.execute("ALTER TABLE terminal_status ADD COLUMN balance REAL NOT NULL DEFAULT 0")
    if "currency" not in status_columns:
        connection.execute("ALTER TABLE terminal_status ADD COLUMN currency TEXT NOT NULL DEFAULT ''")
    connection.execute(
        """CREATE TABLE IF NOT EXISTS prices (
            login TEXT NOT NULL,
            symbol TEXT NOT NULL,
            bid REAL NOT NULL,
            ask REAL NOT NULL,
            volume_min REAL NOT NULL DEFAULT 0.01,
            volume_max REAL NOT NULL DEFAULT 100,
            volume_step REAL NOT NULL DEFAULT 0.01,
            volume_limits_known INTEGER NOT NULL DEFAULT 0,
            updated_at REAL NOT NULL,
            PRIMARY KEY(login, symbol)
        )"""
    )
    price_columns = {row[1] for row in connection.execute("PRAGMA table_info(prices)")}
    for name, default in (("volume_min", "0.01"), ("volume_max", "100"), ("volume_step", "0.01"),
                          ("volume_limits_known", "0")):
        if name not in price_columns:
            connection.execute(f"ALTER TABLE prices ADD COLUMN {name} REAL NOT NULL DEFAULT {default}")
    connection.execute(
        """CREATE TABLE IF NOT EXISTS closes (
            id TEXT PRIMARY KEY,
            login TEXT NOT NULL DEFAULT '',
            ticket TEXT NOT NULL,
            status TEXT NOT NULL,
            result_message TEXT,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL
        )"""
    )
    close_columns = {row[1] for row in connection.execute("PRAGMA table_info(closes)")}
    if "login" not in close_columns:
        connection.execute("ALTER TABLE closes ADD COLUMN login TEXT NOT NULL DEFAULT ''")
    if "action" not in close_columns:
        connection.execute("ALTER TABLE closes ADD COLUMN action TEXT NOT NULL DEFAULT 'close'")
    for name, definition in (
        ("mentor_id", "TEXT NOT NULL DEFAULT ''"),
        ("source_position_id", "TEXT NOT NULL DEFAULT ''"),
    ):
        if name not in close_columns:
            connection.execute(f"ALTER TABLE closes ADD COLUMN {name} {definition}")
    connection.execute(
        """CREATE TABLE IF NOT EXISTS positions (
            login TEXT NOT NULL,
            ticket TEXT NOT NULL,
            symbol TEXT NOT NULL,
            pos_type TEXT NOT NULL,
            volume REAL NOT NULL,
            updated_at REAL NOT NULL,
            PRIMARY KEY(login, ticket)
        )"""
    )
    connection.execute(
        """CREATE TABLE IF NOT EXISTS accounts (
            login TEXT PRIMARY KEY,
            password TEXT NOT NULL,
            server TEXT NOT NULL,
            folder_path TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL
        )"""
    )
    account_columns = {row[1] for row in connection.execute("PRAGMA table_info(accounts)")}
    if "mentor_id" not in account_columns:
        connection.execute("ALTER TABLE accounts ADD COLUMN mentor_id TEXT NOT NULL DEFAULT ''")
    if "volume_multiplier" not in account_columns:
        connection.execute("ALTER TABLE accounts ADD COLUMN volume_multiplier REAL NOT NULL DEFAULT 1")
    if "role" not in account_columns:
        connection.execute("ALTER TABLE accounts ADD COLUMN role TEXT NOT NULL DEFAULT 'student'")
    connection.execute(
        """CREATE TABLE IF NOT EXISTS mentors (
            mentor_id TEXT PRIMARY KEY,
            mentor_name TEXT NOT NULL,
            login TEXT NOT NULL,
            server TEXT NOT NULL,
            token_hash TEXT NOT NULL DEFAULT '',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL
        )"""
    )
    mentor_columns = {row[1] for row in connection.execute("PRAGMA table_info(mentors)")}
    if "token_hash" not in mentor_columns:
        connection.execute("ALTER TABLE mentors ADD COLUMN token_hash TEXT NOT NULL DEFAULT ''")
    connection.execute(
        """CREATE TABLE IF NOT EXISTS trade_events (
            mentor_id TEXT NOT NULL,
            event_id TEXT NOT NULL,
            position_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            login TEXT NOT NULL,
            symbol TEXT NOT NULL,
            side TEXT NOT NULL,
            volume REAL NOT NULL,
            created_at REAL NOT NULL,
            PRIMARY KEY(mentor_id, event_id)
        )"""
    )
    connection.execute(
        """CREATE TABLE IF NOT EXISTS copied_positions (
            mentor_id TEXT NOT NULL,
            source_position_id TEXT NOT NULL,
            follower_login TEXT NOT NULL,
            follower_ticket TEXT NOT NULL,
            updated_at REAL NOT NULL,
            PRIMARY KEY(mentor_id, source_position_id, follower_login, follower_ticket)
        )"""
    )
    copied_position_info = list(connection.execute("PRAGMA table_info(copied_positions)"))
    copied_position_pk = [row[1] for row in sorted(copied_position_info, key=lambda row: row[5]) if row[5]]
    expected_copied_position_pk = ["mentor_id", "source_position_id", "follower_login", "follower_ticket"]
    if copied_position_pk != expected_copied_position_pk:
        connection.execute(
            "CREATE TABLE copied_positions_migrated ("
            "mentor_id TEXT NOT NULL,source_position_id TEXT NOT NULL,follower_login TEXT NOT NULL,"
            "follower_ticket TEXT NOT NULL,updated_at REAL NOT NULL,"
            "PRIMARY KEY(mentor_id,source_position_id,follower_login,follower_ticket))"
        )
        connection.execute(
            "INSERT OR IGNORE INTO copied_positions_migrated "
            "SELECT mentor_id,source_position_id,follower_login,follower_ticket,updated_at FROM copied_positions"
        )
        connection.execute("DROP TABLE copied_positions")
        connection.execute("ALTER TABLE copied_positions_migrated RENAME TO copied_positions")
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_accounts_mentor_active ON accounts(mentor_id,is_active)"
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_copied_positions_mentor_source ON copied_positions(mentor_id,source_position_id)"
    )
    return connection


@contextmanager
def db_session():
    connection = connect_db()
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def auth_matches(header: str, expected: str) -> bool:
    if not expected or not header.startswith("Bearer "):
        return False
    return hmac.compare_digest(header[7:], expected)


def client_authed(header: str) -> bool:
    return auth_matches(header, BRIDGE_KEY)


def ea_authed(header: str) -> bool:
    return auth_matches(header, BRIDGE_KEY) or auth_matches(header, EA_TOKEN)


def validate_account(payload: object) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("Account must be an object.")
    login = str(payload.get("login", "")).strip()
    password = str(payload.get("password", ""))
    server = str(payload.get("server", "")).strip()
    mentor_id = str(payload.get("mentor_id", "")).strip()
    role = str(payload.get("role", "student") or "student").strip().lower()
    try:
        volume_multiplier = float(payload.get("volume_multiplier", 1))
    except (TypeError, ValueError):
        raise ValueError("volume_multiplier must be a number.") from None
    if not LOGIN_RE.fullmatch(login):
        raise ValueError("login must be 4-20 digits.")
    if not 1 <= len(password) <= 128:
        raise ValueError("password must be 1-128 characters.")
    if not 1 <= len(server) <= 128:
        raise ValueError("server must be 1-128 characters.")
    if mentor_id and not MENTOR_ID_RE.fullmatch(mentor_id):
        raise ValueError("mentor_id must contain 3-64 letters, digits, underscores, or hyphens.")
    if role not in {"student", "mentor"}:
        raise ValueError("role must be student or mentor.")
    if not math.isfinite(volume_multiplier) or not 0.01 <= volume_multiplier <= 100:
        raise ValueError("volume_multiplier must be between 0.01 and 100.")
    return {
        "login": login, "password": password, "server": server, "mentor_id": mentor_id,
        "role": role, "volume_multiplier": volume_multiplier,
    }


def validate_mentor(payload: object) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("Mentor must be an object.")
    mentor_id = str(payload.get("mentor_id", "")).strip()
    mentor_name = str(payload.get("mentor_name", "")).strip()
    login = str(payload.get("login", "")).strip()
    server = str(payload.get("server", "")).strip()
    password = str(payload.get("password", ""))
    if not MENTOR_ID_RE.fullmatch(mentor_id):
        raise ValueError("mentor_id must contain 3-64 letters, digits, underscores, or hyphens.")
    if not 1 <= len(mentor_name) <= 80 or any(char in mentor_name for char in "|\r\n"):
        raise ValueError("mentor_name must contain 1-80 characters and cannot contain pipes.")
    if not LOGIN_RE.fullmatch(login):
        raise ValueError("login must be 4-20 digits.")
    if not 1 <= len(server) <= 128 or any(char in server for char in "|\r\n"):
        raise ValueError("server must contain 1-128 characters and cannot contain pipes.")
    if password and not 6 <= len(password) <= 128:
        raise ValueError("password must be empty or 6-128 characters.")
    return {
        "mentor_id": mentor_id, "mentor_name": mentor_name, "login": login,
        "server": server, "password": password,
    }


def validate_order(item: object) -> dict:
    if not isinstance(item, dict):
        raise ValueError("Each order must be an object.")
    symbol = item.get("symbol")
    order_type = item.get("order_type")
    if not isinstance(symbol, str) or not SYMBOL_RE.fullmatch(symbol) or "|" in symbol:
        raise ValueError("Symbol must contain 1-64 letters, digits, spaces, dots, underscores, parentheses, or hyphens.")
    if order_type not in ORDER_TYPES:
        raise ValueError("Unsupported order_type.")
    try:
        volume = float(item.get("volume"))
        entry_price = float(item.get("entry_price", 0))
        tp_distance = float(item.get("tp_distance", 0))
        sl_distance = float(item.get("sl_distance", 0))
    except (TypeError, ValueError):
        raise ValueError("volume, entry_price, tp_distance, and sl_distance must be numbers.") from None
    if not all(math.isfinite(value) for value in (volume, entry_price, tp_distance, sl_distance)):
        raise ValueError("volume, entry_price, tp_distance, and sl_distance must be finite numbers.")
    if not 0 < volume <= 100:
        raise ValueError("volume must be greater than 0 and no more than 100 lots.")
    market = order_type.startswith("MARKET_")
    if not market and entry_price <= 0:
        raise ValueError("Pending orders require entry_price greater than zero.")
    if market and entry_price != 0:
        raise ValueError("Market orders must use entry_price 0.")
    tp_enabled = item.get("tp_enabled", False)
    if not isinstance(tp_enabled, bool):
        raise ValueError("tp_enabled must be a boolean.")
    if tp_distance < 0 or (tp_enabled and tp_distance <= 0):
        raise ValueError("Enabled TP requires tp_distance greater than zero.")
    sl_enabled = item.get("sl_enabled", False)
    if not isinstance(sl_enabled, bool):
        raise ValueError("sl_enabled must be a boolean.")
    if sl_distance < 0 or (sl_enabled and sl_distance <= 0):
        raise ValueError("Enabled SL requires sl_distance greater than zero.")
    return {
        "symbol": symbol,
        "order_type": order_type,
        "volume": volume,
        "entry_price": entry_price,
        "tp_enabled": tp_enabled,
        "tp_distance": tp_distance,
        "sl_enabled": sl_enabled,
        "sl_distance": sl_distance,
    }


def validate_ticks(payload: object) -> tuple[str, list[dict]]:
    if not isinstance(payload, dict):
        raise ValueError("Request body must be an object.")
    login = str(payload.get("login", "")).strip()
    if not LOGIN_RE.fullmatch(login):
        raise ValueError("login must be 4-20 digits.")
    ticks = payload.get("ticks")
    if not isinstance(ticks, list) or not 1 <= len(ticks) <= MAX_TICK_BATCH_SIZE:
        raise ValueError(f"ticks must contain 1-{MAX_TICK_BATCH_SIZE} ticks.")
    validated = []
    for tick in ticks:
        if not isinstance(tick, dict):
            raise ValueError("Each tick must be an object.")
        symbol = tick.get("symbol")
        if not isinstance(symbol, str) or not SYMBOL_RE.fullmatch(symbol) or "|" in symbol:
            raise ValueError("Symbol must contain 1-64 letters, digits, spaces, dots, underscores, parentheses, or hyphens.")
        has_volume_limits = all(name in tick for name in ("volume_min", "volume_max", "volume_step"))
        try:
            bid = float(tick.get("bid"))
            ask = float(tick.get("ask"))
            volume_min = float(tick.get("volume_min", 0.01))
            volume_max = float(tick.get("volume_max", 100))
            volume_step = float(tick.get("volume_step", 0.01))
        except (TypeError, ValueError):
            raise ValueError("bid, ask, and volume limits must be numbers.") from None
        if not all(math.isfinite(value) for value in (bid, ask, volume_min, volume_max, volume_step)):
            raise ValueError("bid, ask, and volume limits must be finite numbers.")
        if bid <= 0 or ask <= 0 or volume_min <= 0 or volume_max < volume_min or volume_step <= 0:
            raise ValueError("bid/ask and volume limits must be positive and consistent.")
        validated.append({"symbol": symbol, "bid": bid, "ask": ask,
                          "volume_min": volume_min, "volume_max": volume_max, "volume_step": volume_step,
                          "volume_limits_known": has_volume_limits})
    return login, validated


def validate_positions(payload: object) -> tuple[bool, list[dict]]:
    """Validate an optional open-position snapshot; presence means replace the stored snapshot."""
    if not isinstance(payload, dict) or "positions" not in payload:
        return False, []
    raw = payload["positions"]
    if raw is None:
        raise ValueError("positions must be a list when provided.")
    if not isinstance(raw, list) or len(raw) > MAX_TICK_BATCH_SIZE:
        raise ValueError(f"positions must contain 0-{MAX_TICK_BATCH_SIZE} entries.")
    validated = []
    for position in raw:
        if not isinstance(position, dict):
            raise ValueError("Each position must be an object.")
        ticket = str(position.get("ticket", "")).strip()
        symbol = position.get("symbol")
        pos_type = str(position.get("type", "")).strip().lower()
        if not ticket.isdigit() or not 1 <= len(ticket) <= 20:
            raise ValueError("Position ticket must be numeric.")
        if not isinstance(symbol, str) or not SYMBOL_RE.fullmatch(symbol) or "|" in symbol:
            raise ValueError("Position symbol is invalid.")
        if pos_type not in {"buy", "sell"}:
            raise ValueError("Position type must be buy or sell.")
        try:
            volume = float(position.get("volume"))
        except (TypeError, ValueError):
            raise ValueError("Position volume must be a number.") from None
        if not math.isfinite(volume) or volume <= 0:
            raise ValueError("Position volume must be a positive finite number.")
        validated.append({"ticket": ticket, "symbol": symbol, "type": pos_type, "volume": volume})
    return True, validated


def validate_mentor_event(payload: object) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("Trade event must be an object.")
    mentor_id = str(payload.get("mentor_id", "")).strip()
    mentor_name = str(payload.get("mentor_name", "")).strip()
    login = str(payload.get("login", "")).strip()
    server = str(payload.get("server", "")).strip()
    event_id = str(payload.get("event_id", "")).strip()
    position_id = str(payload.get("position_id", "")).strip()
    event_type = payload.get("event_type")
    symbol = payload.get("symbol")
    side = payload.get("side")
    if not MENTOR_ID_RE.fullmatch(mentor_id):
        raise ValueError("mentor_id must contain 3-64 letters, digits, underscores, or hyphens.")
    if not 1 <= len(mentor_name) <= 80 or any(char in mentor_name for char in "|\r\n"):
        raise ValueError("mentor_name must contain 1-80 printable characters and cannot contain pipes.")
    if not LOGIN_RE.fullmatch(login):
        raise ValueError("login must be 4-20 digits.")
    if not 1 <= len(server) <= 128 or any(char in server for char in "|\r\n"):
        raise ValueError("server must contain 1-128 characters and cannot contain pipes.")
    if not event_id.isdigit() or not 1 <= len(event_id) <= 20:
        raise ValueError("event_id must be a numeric MT5 deal ticket.")
    if not position_id.isdigit() or not 1 <= len(position_id) <= 20:
        raise ValueError("position_id must be a numeric MT5 position identifier.")
    if event_type not in {"open", "close"}:
        raise ValueError("event_type must be open or close.")
    if not isinstance(symbol, str) or not SYMBOL_RE.fullmatch(symbol) or "|" in symbol:
        raise ValueError("Trade event symbol is invalid.")
    if side not in {"buy", "sell"}:
        raise ValueError("Trade event side must be buy or sell.")
    try:
        volume = float(payload.get("volume"))
    except (TypeError, ValueError):
        raise ValueError("Trade event volume must be a number.") from None
    if not math.isfinite(volume) or volume <= 0 or volume > 100:
        raise ValueError("Trade event volume must be greater than zero and no more than 100 lots.")
    tp_enabled = payload.get("tp_enabled", False)
    if not isinstance(tp_enabled, bool):
        raise ValueError("tp_enabled must be a boolean.")
    try:
        tp_distance = float(payload.get("tp_distance", 0))
    except (TypeError, ValueError):
        raise ValueError("tp_distance must be a number.") from None
    if not math.isfinite(tp_distance) or tp_distance < 0 or (tp_enabled and tp_distance <= 0):
        raise ValueError("tp_distance must be a non-negative number and positive when tp_enabled is true.")
    sl_enabled = payload.get("sl_enabled", False)
    if not isinstance(sl_enabled, bool):
        raise ValueError("sl_enabled must be a boolean.")
    try:
        sl_distance = float(payload.get("sl_distance", 0))
    except (TypeError, ValueError):
        raise ValueError("sl_distance must be a number.") from None
    if not math.isfinite(sl_distance) or sl_distance < 0 or (sl_enabled and sl_distance <= 0):
        raise ValueError("sl_distance must be a non-negative number and positive when sl_enabled is true.")
    result = {
        "mentor_id": mentor_id,
        "mentor_name": mentor_name,
        "login": login,
        "server": server,
        "event_id": event_id,
        "position_id": position_id,
        "event_type": event_type,
        "symbol": symbol,
        "side": side,
        "volume": volume,
    }
    if "tp_enabled" in payload or "tp_distance" in payload:
        result["tp_enabled"] = tp_enabled
        result["tp_distance"] = tp_distance
    if "sl_enabled" in payload or "sl_distance" in payload:
        result["sl_enabled"] = sl_enabled
        result["sl_distance"] = sl_distance
    return result


def scale_follower_volume(db: sqlite3.Connection, follower: sqlite3.Row, symbol: str, event_volume: float) -> float:
    """Scale a mentor trade by the follower's volume_multiplier and clamp it to
    the broker volume limits that follower's terminal last reported (falling back
    to a sane [0.01, 100] window), rounding to the symbol's volume step."""
    scaled = event_volume * follower["volume_multiplier"]
    limits = db.execute(
        "SELECT volume_min,volume_max,volume_step FROM prices WHERE login=? AND symbol=?",
        (follower["login"], symbol),
    ).fetchone()
    if limits:
        volume_min, volume_max, volume_step = limits["volume_min"], limits["volume_max"], limits["volume_step"]
        scaled = min(max(scaled, volume_min), volume_max)
        if volume_step > 0:
            scaled = volume_min + round((scaled - volume_min) / volume_step) * volume_step
        scaled = min(max(scaled, volume_min), volume_max)
    else:
        scaled = min(max(scaled, 0.01), 100)
    return round(scaled, 8)


def reconcile_on_boot(force_refresh: bool = False) -> None:
    """Launch active accounts, optionally closing and refreshing managed terminals first."""
    if force_refresh:
        print("[reconcile] closing managed MT5 terminals before refreshing EA/profile files")
        tm.stop_managed_terminals()
    running = tm.running_logins(ttl=0)
    with db_session() as db:
        rows = db.execute("SELECT * FROM accounts WHERE is_active=1").fetchall()
    for row in rows:
        if row["login"] in running:
            print(f"[reconcile] {row['login']} already running")
            continue
        ok, message = tm.ensure_terminal(dict(row))
        state = "OK" if ok else "FAILED"
        print(f"[reconcile] {row['login']} -> {state}: {message}")


class BridgeHandler(BaseHTTPRequestHandler):
    server_version = "SkuDBridge/2.2"

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"[{self.log_date_time_string()}] {fmt % args}")

    def _send(self, status: int, payload: object = None, content_type: str = "application/json") -> None:
        if payload is None:
            body = b""
        elif content_type == "text/plain; charset=utf-8":
            body = str(payload).encode("utf-8")
        else:
            body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        origin = self.headers.get("Origin")
        if origin and origin == ALLOWED_ORIGIN:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _read_json(self) -> object:
        length = int(self.headers.get("Content-Length", "0"))
        if length < 1 or length > 256_000:
            raise ValueError("Request body must be between 1 byte and 256 KB.")
        return json.loads(self.rfile.read(length))

    def _provision_mentor_terminal(self, mentor: dict, now: float) -> str | None:
        """Upsert the mentor's own MT5 account row and launch its terminal.

        Mirrors the /v1/accounts upsert: reuse the existing slot when the login is
        already registered, otherwise claim a free slot. Returns the terminal
        result message ("launched", warnings, or "failed: ..."), or None when no
        slot could be assigned.
        """
        with db_session() as db:
            existing = db.execute("SELECT * FROM accounts WHERE login=?", (mentor["login"],)).fetchone()
        if existing:
            credentials_changed = (
                existing["password"] != mentor["password"] or existing["server"] != mentor["server"]
            )
            if credentials_changed or not existing["is_active"]:
                try:
                    tm.stop_account_terminal(existing["folder_path"])
                except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
                    raise RuntimeError(
                        f"Could not stop the previous MT5 terminal before updating credentials: {error}"
                    ) from error
            folder_path = existing["folder_path"]
            with db_session() as db:
                db.execute(
                    "UPDATE accounts SET password=?,server=?,mentor_id=?,role='mentor',is_active=1,updated_at=? "
                    "WHERE login=?",
                    (mentor["password"], mentor["server"], mentor["mentor_id"], now, mentor["login"]),
                )
        else:
            with db_session() as db:
                used = {
                    row[0] for row in db.execute(
                        "SELECT folder_path FROM accounts WHERE folder_path IS NOT NULL AND folder_path != ''"
                    )
                }
                try:
                    slot = tm.assign_slot(used)
                except RuntimeError:
                    return None
                folder_path = str(slot)
                db.execute(
                    "INSERT INTO accounts(login,password,server,folder_path,mentor_id,role,is_active,created_at,updated_at) "
                    "VALUES(?,?,?,?,?,'mentor',1,?,?)",
                    (mentor["login"], mentor["password"], mentor["server"], folder_path,
                     mentor["mentor_id"], now, now),
                )
        try:
            launched, message = tm.ensure_terminal({
                "login": mentor["login"],
                "password": mentor["password"],
                "server": mentor["server"],
                "folder_path": folder_path,
                "role": "mentor",
                "mentor_meta": {"mentor_id": mentor["mentor_id"], "mentor_name": mentor["mentor_name"]},
            })
        except Exception as exc:
            return f"failed: {str(exc)[:200]}"
        return message if launched else f"failed: {message}"

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/client":
            body = (ROOT / "client.html").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        if parsed.path == "/health":
            return self._send(200, {"status": "ok", "service": "SkuD MT5 bridge"})
        if parsed.path == "/v1/status":
            if not client_authed(self.headers.get("Authorization", "")):
                return self._send(401, {"error": "Unauthorized"})
            login = parse_qs(parsed.query).get("login", [""])[0].strip()
            now = time.time()
            with db_session() as db:
                if login:
                    account = db.execute(
                        "SELECT server,is_active FROM accounts WHERE login=?", (login,)
                    ).fetchone()
                    if not account:
                        return self._send(404, {"error": "Unknown MT5 student account."})
                    row = db.execute(
                        "SELECT connected,last_seen,message,server,balance,currency FROM terminal_status WHERE login=?", (login,)
                    ).fetchone()
                    server_matches = bool(row and row["server"] == account["server"])
                    connected = bool(row and row["connected"] and server_matches and
                                     now - row["last_seen"] < HEARTBEAT_STALE_SEC)
                    if row and row["connected"] and not server_matches:
                        message = f"MT5 reports server {row['server'] or 'unknown'}; expected {account['server']}."
                    else:
                        message = row["message"] if row and row["message"] else \
                                  f"MT5 login not confirmed for {login}. Check the login, trading password, and server."
                    return self._send(200, {
                        "login": login,
                        "terminal_connected": connected,
                        "state": "connected" if connected else "not_confirmed",
                        "expected_server": account["server"],
                        "reported_server": row["server"] if row else "",
                        "last_seen": row["last_seen"] if row else None,
                        "message": message,
                        "balance": float(row["balance"]) if row else 0.0,
                        "currency": row["currency"] if row else "",
                    })
                count = db.execute("SELECT COUNT(*) AS c FROM accounts WHERE is_active=1").fetchone()["c"]
            return self._send(200, {"status": "ok", "service": "SkuD MT5 bridge", "active_accounts": count})
        if parsed.path == "/v1/accounts":
            if not client_authed(self.headers.get("Authorization", "")):
                return self._send(401, {"error": "Unauthorized"})
            running = tm.running_logins()
            now = time.time()
            with db_session() as db:
                rows = db.execute("SELECT * FROM accounts ORDER BY created_at").fetchall()
                accounts = []
                for row in rows:
                    heartbeat = db.execute(
                        "SELECT connected,last_seen,message FROM terminal_status WHERE login=?", (row["login"],)
                    ).fetchone()
                    accounts.append({
                        "login": row["login"],
                        "server": row["server"],
                        "folder_path": row["folder_path"],
                        "is_active": bool(row["is_active"]),
                        "mentor_id": row["mentor_id"],
                        "volume_multiplier": row["volume_multiplier"],
                        "role": row["role"],
                        "terminal_running": row["login"] in running,
                        "ea_connected": bool(
                            heartbeat and heartbeat["connected"] and now - heartbeat["last_seen"] < HEARTBEAT_STALE_SEC
                        ),
                        "last_seen": heartbeat["last_seen"] if heartbeat else None,
                        "message": heartbeat["message"] if heartbeat else "Waiting for the SkuD EA heartbeat.",
                    })
            return self._send(200, {"accounts": accounts})
        if parsed.path == "/v1/mentors":
            if not client_authed(self.headers.get("Authorization", "")):
                return self._send(401, {"error": "Unauthorized"})
            with db_session() as db:
                rows = db.execute(
                    "SELECT mentor_id,mentor_name,login,server,is_active,created_at,updated_at "
                    "FROM mentors ORDER BY created_at"
                ).fetchall()
                mentors = []
                for row in rows:
                    followers = db.execute(
                        "SELECT COUNT(*) AS c FROM accounts WHERE mentor_id=? AND is_active=1",
                        (row["mentor_id"],),
                    ).fetchone()["c"]
                    mentors.append({**dict(row), "is_active": bool(row["is_active"]),
                                    "active_followers": followers})
            return self._send(200, {"mentors": mentors})
        match = re.fullmatch(r"/v1/mentors/([A-Za-z0-9_-]{3,64})", parsed.path)
        if match:
            if not client_authed(self.headers.get("Authorization", "")):
                return self._send(401, {"error": "Unauthorized"})
            mentor_id = match.group(1)
            with db_session() as db:
                mentor = db.execute(
                    "SELECT mentor_id,mentor_name,login,server,is_active,created_at,updated_at "
                    "FROM mentors WHERE mentor_id=?",
                    (mentor_id,),
                ).fetchone()
                if not mentor:
                    return self._send(404, {"error": "Unknown mentor."})
                followers = db.execute(
                    "SELECT a.login,a.server,a.is_active,a.volume_multiplier,a.role,"
                    "ts.connected,ts.last_seen,ts.balance,ts.currency "
                    "FROM accounts a LEFT JOIN terminal_status ts ON ts.login=a.login "
                    "WHERE a.mentor_id=? ORDER BY a.created_at",
                    (mentor_id,),
                ).fetchall()
                events = db.execute(
                    "SELECT event_id,position_id,event_type,login,symbol,side,volume,created_at "
                    "FROM trade_events WHERE mentor_id=? ORDER BY created_at DESC LIMIT 50",
                    (mentor_id,),
                ).fetchall()
            return self._send(200, {
                "mentor": {**dict(mentor), "is_active": bool(mentor["is_active"])},
                "followers": [
                    {**dict(row), "is_active": bool(row["is_active"]),
                     "connected": bool(row["connected"] if row["connected"] is not None else 0)}
                    for row in followers
                ],
                "events": [dict(row) for row in events],
            })
        if parsed.path == "/v1/prices":
            if not client_authed(self.headers.get("Authorization", "")):
                return self._send(401, {"error": "Unauthorized"})
            params = parse_qs(parsed.query)
            login = params.get("login", [""])[0].strip()
            symbols_param = params.get("symbols", [""])[0]
            clauses = []
            arguments: list = []
            if login:
                if not LOGIN_RE.fullmatch(login):
                    return self._send(400, {"error": "login must be 4-20 digits."})
                clauses.append("login=?")
                arguments.append(login)
            else:
                clauses.append("login IN (SELECT login FROM accounts WHERE is_active=1)")
            if symbols_param.strip():
                symbols = [symbol.strip() for symbol in symbols_param.split(",") if symbol.strip()]
                if not symbols or any(not SYMBOL_RE.fullmatch(symbol) or "|" in symbol for symbol in symbols):
                    return self._send(400, {"error": "Invalid symbols filter."})
                clauses.append("symbol IN (%s)" % ",".join("?" * len(symbols)))
                arguments.extend(symbols)
            now = time.time()
            with db_session() as db:
                rows = db.execute(
                    "SELECT login,symbol,bid,ask,volume_min,volume_max,volume_step,volume_limits_known,updated_at FROM prices WHERE " + " AND ".join(clauses),
                    arguments,
                ).fetchall()
            prices = [
                {
                    "login": row["login"],
                    "symbol": row["symbol"],
                    "bid": row["bid"],
                    "ask": row["ask"],
                    "volume_min": row["volume_min"],
                    "volume_max": row["volume_max"],
                    "volume_step": row["volume_step"],
                    "volume_limits_known": bool(row["volume_limits_known"]),
                    "age_sec": round(now - row["updated_at"], 1),
                }
                for row in rows
            ]
            return self._send(200, {"prices": prices, "now": now})
        match = re.fullmatch(r"/v1/orders/([0-9a-f-]+)", parsed.path)
        if match:
            if not client_authed(self.headers.get("Authorization", "")):
                return self._send(401, {"error": "Unauthorized"})
            with db_session() as db:
                row = db.execute(
                    "SELECT id,status,ticket,result_message,created_at,updated_at FROM orders WHERE id=?",
                    (match.group(1),),
                ).fetchone()
            if not row:
                return self._send(404, {"error": "Unknown order."})
            return self._send(200, dict(row))
        if parsed.path == "/v1/commands/next":
            if not ea_authed(self.headers.get("Authorization", "")):
                return self._send(401, {"error": "Unauthorized"})
            login = parse_qs(parsed.query).get("login", [""])[0].strip()
            now = time.time()
            with db_session() as db:
                account = db.execute("SELECT is_active FROM accounts WHERE login=?", (login,)).fetchone()
                if not account:
                    return self._send(403, {"error": "EA login is not a registered SkuD account."})
                if not account["is_active"]:
                    return self._send(403, {"error": "MT5 account is deactivated."})
                db.execute("BEGIN IMMEDIATE")
                row = db.execute(
                    "SELECT * FROM orders WHERE status='queued' AND login=? ORDER BY created_at LIMIT 1", (login,)
                ).fetchone()
                if not row:
                    db.commit()
                    return self._send(204)
                db.execute("UPDATE orders SET status='claimed',updated_at=? WHERE id=? AND status='queued'", (now, row["id"]))
                db.commit()
            fields = [
                row["id"], row["symbol"], row["order_type"], f'{row["volume"]:.8f}',
                f'{row["entry_price"]:.10f}', "1" if row["tp_enabled"] else "0",
                f'{row["tp_distance"]:.10f}', "1" if row["sl_enabled"] else "0",
                f'{row["sl_distance"]:.10f}', row["mentor_name"],
            ]
            return self._send(200, "|".join(fields), "text/plain; charset=utf-8")
        if parsed.path == "/v1/closes/next":
            if not ea_authed(self.headers.get("Authorization", "")):
                return self._send(401, {"error": "Unauthorized"})
            login = parse_qs(parsed.query).get("login", [""])[0].strip()
            now = time.time()
            with db_session() as db:
                account = db.execute("SELECT is_active FROM accounts WHERE login=?", (login,)).fetchone()
                if not account:
                    return self._send(403, {"error": "EA login is not a registered SkuD account."})
                if not account["is_active"]:
                    return self._send(403, {"error": "MT5 account is deactivated."})
                db.execute("BEGIN IMMEDIATE")
                row = db.execute(
                    "SELECT * FROM closes WHERE status='queued' AND login=? ORDER BY created_at LIMIT 1", (login,)
                ).fetchone()
                if not row:
                    db.commit()
                    return self._send(204)
                db.execute("UPDATE closes SET status='claimed',updated_at=? WHERE id=? AND status='queued'", (now, row["id"]))
                db.commit()
            return self._send(200, row["id"] + "|" + row["ticket"] + "|" + row["action"], "text/plain; charset=utf-8")
        if parsed.path == "/v1/positions":
            if not client_authed(self.headers.get("Authorization", "")):
                return self._send(401, {"error": "Unauthorized"})
            login = parse_qs(parsed.query).get("login", [""])[0].strip()
            if not LOGIN_RE.fullmatch(login):
                return self._send(400, {"error": "login must be 4-20 digits."})
            with db_session() as db:
                rows = db.execute(
                    "SELECT ticket,symbol,pos_type,volume,updated_at FROM positions WHERE login=?", (login,)
                ).fetchall()
            return self._send(200, {"positions": [dict(row) for row in rows]})
        match = re.fullmatch(r"/v1/closes/([0-9a-f-]+)", parsed.path)
        if match:
            if not client_authed(self.headers.get("Authorization", "")):
                return self._send(401, {"error": "Unauthorized"})
            with db_session() as db:
                row = db.execute(
                    "SELECT id,status,ticket,result_message,created_at,updated_at FROM closes WHERE id=?",
                    (match.group(1),),
                ).fetchone()
            if not row:
                return self._send(404, {"error": "Unknown close request."})
            return self._send(200, dict(row))
        return self._send(404, {"error": "Not found"})

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/v1/mentors":
            if not client_authed(self.headers.get("Authorization", "")):
                return self._send(401, {"error": "Unauthorized"})
            try:
                mentor = validate_mentor(self._read_json())
            except (json.JSONDecodeError, ValueError, AttributeError) as error:
                return self._send(400, {"error": str(error)})
            now = time.time()
            with db_session() as db:
                conflict = db.execute(
                    "SELECT mentor_id FROM mentors WHERE login=? AND server=? AND mentor_id!=?",
                    (mentor["login"], mentor["server"], mentor["mentor_id"]),
                ).fetchone()
                if conflict:
                    return self._send(409, {"error": "This MT5 login/server is already registered to another mentor."})
                db.execute(
                    "INSERT INTO mentors(mentor_id,mentor_name,login,server,token_hash,is_active,created_at,updated_at) "
                    "VALUES(?,?,?,?,?,1,?,?) ON CONFLICT(mentor_id) DO UPDATE SET "
                    "mentor_name=excluded.mentor_name,login=excluded.login,server=excluded.server,"
                    "token_hash=excluded.token_hash,is_active=1,updated_at=excluded.updated_at",
                    (mentor["mentor_id"], mentor["mentor_name"], mentor["login"], mentor["server"], "", now, now),
                )
            response = {
                "mentor_id": mentor["mentor_id"], "mentor_name": mentor["mentor_name"],
            }
            if mentor["password"]:
                try:
                    terminal_message = self._provision_mentor_terminal(mentor, now)
                except RuntimeError as error:
                    return self._send(503, {"error": str(error)})
                if terminal_message is None:
                    return self._send(503, {"error": "No terminal slot available for the mentor account."})
                response["terminal"] = terminal_message
            return self._send(200, response)
        if parsed.path == "/v1/mentor/events":
            authorization = self.headers.get("Authorization", "")
            if not auth_matches(authorization, BRIDGE_KEY):
                return self._send(401, {"error": "Unauthorized"})
            try:
                event = validate_mentor_event(self._read_json())
            except (json.JSONDecodeError, ValueError, AttributeError) as error:
                return self._send(400, {"error": str(error)})
            now = time.time()
            with db_session() as db:
                db.execute("BEGIN IMMEDIATE")
                mentor = db.execute(
                    "SELECT mentor_name,login,server,is_active FROM mentors WHERE mentor_id=?",
                    (event["mentor_id"],),
                ).fetchone()
                # A bridge-key event may register the one configured platform mentor.
                supplied_is_bridge_key = auth_matches(authorization, BRIDGE_KEY)
                if not mentor and supplied_is_bridge_key:
                    db.execute(
                        "INSERT INTO mentors(mentor_id,mentor_name,login,server,token_hash,is_active,created_at,updated_at) "
                        "VALUES(?,?,?,?,'',1,?,?)",
                        (event["mentor_id"], event["mentor_name"], event["login"], event["server"], now, now),
                    )
                    mentor = db.execute(
                        "SELECT mentor_name,login,server,is_active FROM mentors WHERE mentor_id=?",
                        (event["mentor_id"],),
                    ).fetchone()
                if not mentor or not mentor["is_active"]:
                    return self._send(403, {"error": "Mentor is not registered or is inactive."})
                if (mentor["login"], mentor["server"]) != (event["login"], event["server"]):
                    return self._send(403, {"error": "Trade event account does not match the registered mentor."})
                if event["mentor_name"] != mentor["mentor_name"]:
                    return self._send(403, {"error": "Trade event name does not match the registered mentor."})
                existing = db.execute(
                    "SELECT 1 FROM trade_events WHERE mentor_id=? AND event_id=?",
                    (event["mentor_id"], event["event_id"]),
                ).fetchone()
                if existing:
                    return self._send(200, {"event_id": event["event_id"], "duplicate": True, "queued": 0})
                db.execute(
                    "INSERT INTO trade_events(mentor_id,event_id,position_id,event_type,login,symbol,side,volume,created_at) "
                    "VALUES(?,?,?,?,?,?,?,?,?)",
                    (event["mentor_id"], event["event_id"], event["position_id"], event["event_type"],
                     event["login"], event["symbol"], event["side"], event["volume"], now),
                )
                queued = 0
                if event["event_type"] == "open":
                    followers = db.execute(
                        "SELECT login,volume_multiplier FROM accounts WHERE mentor_id=? AND is_active=1 AND login!=?",
                        (event["mentor_id"], event["login"]),
                    ).fetchall()
                    for follower in followers:
                        volume = scale_follower_volume(db, follower, event["symbol"], event["volume"])
                        db.execute(
                            "INSERT INTO orders(id,login,symbol,order_type,volume,entry_price,tp_enabled,tp_distance,"
                            "sl_enabled,sl_distance,status,mentor_id,mentor_name,source_event_id,source_position_id,created_at,updated_at) "
                            "VALUES(?,?,?,?,?,0,?,?,?,?,'queued',?,?,?,?,?,?)",
                            (str(uuid4()), follower["login"], event["symbol"],
                             "MARKET_BUY" if event["side"] == "buy" else "MARKET_SELL", volume,
                             int(event.get("tp_enabled", False)), float(event.get("tp_distance", 0)),
                             int(event.get("sl_enabled", False)), float(event.get("sl_distance", 0)),
                             event["mentor_id"], mentor["mentor_name"], event["event_id"], event["position_id"], now, now),
                        )
                        queued += 1
                else:
                    copied = db.execute(
                        "SELECT follower_login,follower_ticket FROM copied_positions "
                        "WHERE mentor_id=? AND source_position_id=?",
                        (event["mentor_id"], event["position_id"]),
                    ).fetchall()
                    for position in copied:
                        db.execute(
                            "INSERT INTO closes(id,login,ticket,action,status,mentor_id,source_position_id,created_at,updated_at) "
                            "VALUES(?,?,?,'close','queued',?,?,?,?)",
                            (str(uuid4()), position["follower_login"], position["follower_ticket"],
                             event["mentor_id"], event["position_id"], now, now),
                        )
                        queued += 1
                    db.execute(
                        "DELETE FROM copied_positions WHERE mentor_id=? AND source_position_id=?",
                        (event["mentor_id"], event["position_id"]),
                    )
            return self._send(202, {"event_id": event["event_id"], "duplicate": False, "queued": queued})
        if parsed.path == "/v1/accounts":
            if not client_authed(self.headers.get("Authorization", "")):
                return self._send(401, {"error": "Unauthorized"})
            try:
                payload = self._read_json()
                if not isinstance(payload, dict):
                    raise ValueError("Account must be an object.")
                role_provided = bool(str(payload.get("role", "")).strip())
                account = validate_account(payload)
            except (json.JSONDecodeError, ValueError, AttributeError) as error:
                return self._send(400, {"error": str(error)})
            now = time.time()
            with db_session() as db:
                existing = db.execute("SELECT * FROM accounts WHERE login=?", (account["login"],)).fetchone()
            if existing:
                credentials_changed = (
                    existing["password"] != account["password"] or existing["server"] != account["server"]
                )
                must_restart = credentials_changed or not existing["is_active"]
                if must_restart:
                    try:
                        tm.stop_account_terminal(existing["folder_path"])
                    except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
                        return self._send(503, {"error": f"Could not stop the previous MT5 terminal before updating credentials: {error}"})
                folder_path = existing["folder_path"]
                # role keeps the existing value unless the request sets it explicitly,
                # so re-provisioning a mentor's login as a plain account never demotes it.
                role_value = account["role"] if role_provided else ""
                with db_session() as db:
                    db.execute(
                        "UPDATE accounts SET password=?,server=?,mentor_id=CASE WHEN ?='' THEN mentor_id ELSE ? END,"
                        "role=CASE WHEN ?='' THEN role ELSE ? END,volume_multiplier=?,"
                        "is_active=1,updated_at=? WHERE login=?",
                        (account["password"], account["server"], account["mentor_id"], account["mentor_id"],
                         role_value, role_value, account["volume_multiplier"], now, account["login"]),
                    )
            else:
                with db_session() as db:
                    used = {
                        row[0] for row in db.execute(
                            "SELECT folder_path FROM accounts WHERE folder_path IS NOT NULL AND folder_path != ''"
                        )
                    }
                    try:
                        slot = tm.assign_slot(used)
                    except RuntimeError as error:
                        return self._send(503, {"error": str(error)})
                    folder_path = str(slot)
                    db.execute(
                        "INSERT INTO accounts(login,password,server,folder_path,mentor_id,role,volume_multiplier,is_active,created_at,updated_at) "
                        "VALUES(?,?,?,?,?,?,?,1,?,?)",
                        (account["login"], account["password"], account["server"], folder_path,
                         account["mentor_id"], account["role"], account["volume_multiplier"], now, now),
                    )
            launch_account = {
                "login": account["login"],
                "password": account["password"],
                "server": account["server"],
                "folder_path": folder_path,
                "role": account["role"],
            }
            # Role defaults to "student" when the request omits it, but the stored
            # role may be "mentor" (the CASE-WHEN above keeps it). Launch with the
            # stored role so a mentor account always gets the Mentor EA/chart.
            with db_session() as db:
                stored = db.execute(
                    "SELECT role,mentor_id FROM accounts WHERE login=?", (account["login"],)
                ).fetchone()
            if stored:
                launch_account["role"] = stored["role"] or account["role"]
                if stored["mentor_id"]:
                    with db_session() as db:
                        mentor_row = db.execute(
                            "SELECT mentor_id,mentor_name FROM mentors WHERE mentor_id=?",
                            (stored["mentor_id"],),
                        ).fetchone()
                    if mentor_row:
                        launch_account["mentor_meta"] = {
                            "mentor_id": mentor_row["mentor_id"],
                            "mentor_name": mentor_row["mentor_name"],
                        }
            launched, message = tm.ensure_terminal(launch_account)
            return self._send(200, {
                "login": account["login"],
                "folder_path": folder_path,
                "launched": launched,
                "message": message,
            })
        match = re.fullmatch(r"/v1/accounts/(\d{4,20})/deactivate", parsed.path)
        if match:
            if not client_authed(self.headers.get("Authorization", "")):
                return self._send(401, {"error": "Unauthorized"})
            with db_session() as db:
                account = db.execute(
                    "SELECT folder_path,is_active FROM accounts WHERE login=?", (match.group(1),)
                ).fetchone()
            if not account:
                return self._send(404, {"error": "Unknown account."})
            try:
                tm.stop_account_terminal(account["folder_path"])
            except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
                return self._send(503, {"error": f"Could not stop this account's MT5 terminal: {error}"})
            tm.clear_account_charts(account["folder_path"])
            with db_session() as db:
                db.execute(
                    "UPDATE accounts SET is_active=0,updated_at=? WHERE login=?",
                    (time.time(), match.group(1)),
                )
            return self._send(200, {"status": "deactivated", "login": match.group(1), "terminal_stopped": True})
        match = re.fullmatch(r"/v1/accounts/(\d{4,20})/mentor", parsed.path)
        if match:
            if not client_authed(self.headers.get("Authorization", "")):
                return self._send(401, {"error": "Unauthorized"})
            login = match.group(1)
            try:
                payload = self._read_json()
                if not isinstance(payload, dict):
                    raise ValueError("Request body must be an object.")
                mentor_id = str(payload.get("mentor_id", "")).strip()
                if mentor_id and not MENTOR_ID_RE.fullmatch(mentor_id):
                    raise ValueError("mentor_id must contain 3-64 letters, digits, underscores, or hyphens.")
                multiplier = None
                if payload.get("volume_multiplier") is not None:
                    try:
                        multiplier = float(payload.get("volume_multiplier"))
                    except (TypeError, ValueError):
                        raise ValueError("volume_multiplier must be a number.") from None
                    if not math.isfinite(multiplier) or not 0.01 <= multiplier <= 100:
                        raise ValueError("volume_multiplier must be between 0.01 and 100.")
            except (json.JSONDecodeError, ValueError, AttributeError) as error:
                return self._send(400, {"error": str(error)})
            with db_session() as db:
                account = db.execute("SELECT login FROM accounts WHERE login=?", (login,)).fetchone()
                if not account:
                    return self._send(404, {"error": "Unknown account."})
                if mentor_id and not db.execute(
                    "SELECT 1 FROM mentors WHERE mentor_id=?", (mentor_id,)
                ).fetchone():
                    return self._send(404, {"error": "Unknown mentor."})
                if multiplier is not None:
                    db.execute(
                        "UPDATE accounts SET mentor_id=?,volume_multiplier=?,updated_at=? WHERE login=?",
                        (mentor_id, multiplier, time.time(), login),
                    )
                else:
                    db.execute(
                        "UPDATE accounts SET mentor_id=?,updated_at=? WHERE login=?",
                        (mentor_id, time.time(), login),
                    )
            return self._send(200, {
                "login": login, "mentor_id": mentor_id, "volume_multiplier": multiplier,
            })
        if parsed.path == "/v1/orders":
            if not client_authed(self.headers.get("Authorization", "")):
                return self._send(401, {"error": "Unauthorized"})
            try:
                payload = self._read_json()
                if not isinstance(payload, dict):
                    raise ValueError("Request body must be an object.")
                login = str(payload.get("login", "")).strip()
                orders = payload.get("orders")
                if not LOGIN_RE.fullmatch(login):
                    raise ValueError("Provide a numeric MT5 login for the orders.")
                if not isinstance(orders, list) or not 1 <= len(orders) <= MAX_BATCH_SIZE:
                    raise ValueError(f"orders must contain 1-{MAX_BATCH_SIZE} orders.")
                validated = [validate_order(order) for order in orders]
            except (json.JSONDecodeError, ValueError, AttributeError) as error:
                return self._send(400, {"error": str(error)})
            with db_session() as db:
                account = db.execute(
                    "SELECT * FROM accounts WHERE login=? AND is_active=1", (login,)
                ).fetchone()
                if not account:
                    return self._send(409, {"error": "Unknown or inactive MT5 account."})
            idempotency_key = self.headers.get("Idempotency-Key", "")
            if not re.fullmatch(r"[A-Za-z0-9._:-]{8,128}", idempotency_key):
                return self._send(400, {"error": "Provide an Idempotency-Key (8-128 safe characters)."})
            request_hash = hashlib.sha256(
                json.dumps({"login": login, "orders": validated}, sort_keys=True, separators=(",", ":")).encode()
            ).hexdigest()
            now = time.time()
            created = [{"id": str(uuid4()), "status": "queued"} for _ in validated]
            response_body = {"orders": created, "count": len(created), "replayed": False}
            with db_session() as db:
                db.execute("BEGIN IMMEDIATE")
                previous = db.execute(
                    "SELECT request_hash,response_json FROM batches WHERE idempotency_key=?", (idempotency_key,)
                ).fetchone()
                if previous:
                    db.commit()
                    if previous["request_hash"] != request_hash:
                        return self._send(409, {"error": "Idempotency-Key was already used for a different order batch."})
                    cached = json.loads(previous["response_json"])
                    cached["replayed"] = True
                    return self._send(200, cached)
                db.executemany(
                    "INSERT INTO orders(id,login,symbol,order_type,volume,entry_price,tp_enabled,tp_distance,sl_enabled,sl_distance,status,created_at,updated_at) "
                    "VALUES(?,?,?,?,?,?,?,?,?,?,'queued',?,?)",
                    [
                        (record["id"], login, order["symbol"], order["order_type"], order["volume"],
                         order["entry_price"], int(order["tp_enabled"]), order["tp_distance"],
                         int(order["sl_enabled"]), order["sl_distance"], now, now)
                        for record, order in zip(created, validated)
                    ],
                )
                db.execute(
                    "INSERT INTO batches(idempotency_key,request_hash,response_json,created_at) VALUES(?,?,?,?)",
                    (idempotency_key, request_hash, json.dumps(response_body), now),
                )
            if login not in tm.running_logins():
                threading.Thread(target=tm.ensure_terminal, args=(dict(account),), daemon=True).start()
            return self._send(202, response_body)
        if parsed.path == "/v1/positions/close":
            if not client_authed(self.headers.get("Authorization", "")):
                return self._send(401, {"error": "Unauthorized"})
            try:
                payload = self._read_json()
                if not isinstance(payload, dict):
                    raise ValueError("Request body must be an object.")
                login = str(payload.get("login", "")).strip()
                if not LOGIN_RE.fullmatch(login):
                    raise ValueError("Provide a numeric MT5 login for the close request.")
                tickets = payload.get("tickets")
                action = str(payload.get("action", "close")).strip().lower()
                if action not in {"close", "cancel"}:
                    raise ValueError("action must be close or cancel.")
                if tickets == "all":
                    normalized = ["0"]
                elif isinstance(tickets, list) and 1 <= len(tickets) <= MAX_BATCH_SIZE:
                    normalized = []
                    for ticket in tickets:
                        text = str(ticket).strip()
                        if not text.isdigit() or not 1 <= len(text) <= 20:
                            raise ValueError("Each ticket must be a numeric position ticket.")
                        normalized.append(text)
                else:
                    raise ValueError(f"tickets must be 'all' or a list of 1-{MAX_BATCH_SIZE} numeric tickets.")
            except (json.JSONDecodeError, ValueError, AttributeError) as error:
                return self._send(400, {"error": str(error)})
            with db_session() as db:
                account = db.execute(
                    "SELECT * FROM accounts WHERE login=? AND is_active=1", (login,)
                ).fetchone()
                if not account:
                    return self._send(409, {"error": "Unknown or inactive MT5 account."})
                now = time.time()
                created = [{"id": str(uuid4()), "status": "queued"} for _ in normalized]
                db.executemany(
                    "INSERT INTO closes(id,login,ticket,action,status,created_at,updated_at) VALUES(?,?,?,?,'queued',?,?)",
                    [(record["id"], login, ticket, action, now, now) for record, ticket in zip(created, normalized)],
                )
            if login not in tm.running_logins():
                threading.Thread(target=tm.ensure_terminal, args=(dict(account),), daemon=True).start()
            return self._send(202, {"closes": created, "count": len(created)})
        match = re.fullmatch(r"/v1/commands/([0-9a-f-]+)/result", parsed.path)
        if match:
            if not ea_authed(self.headers.get("Authorization", "")):
                return self._send(401, {"error": "Unauthorized"})
            try:
                result = self._read_json()
                if not isinstance(result, dict) or result.get("status") not in {"placed", "rejected"}:
                    raise ValueError("status must be placed or rejected.")
                message = str(result.get("message", ""))[:500]
                ticket = str(result.get("ticket", ""))[:40]
            except (json.JSONDecodeError, ValueError) as error:
                return self._send(400, {"error": str(error)})
            with db_session() as db:
                existing = db.execute(
                    "SELECT status,ticket,result_message,login,mentor_id,source_position_id FROM orders WHERE id=?",
                    (match.group(1),),
                ).fetchone()
                if not existing:
                    return self._send(404, {"error": "Unknown order."})
                if existing["status"] != "claimed":
                    if (existing["status"] == result["status"] and
                            (existing["ticket"] or "") == ticket and
                            (existing["result_message"] or "") == message):
                        return self._send(200, {"status": "recorded", "replayed": True})
                    return self._send(409, {"error": "Order already has a different final result."})
                updated = db.execute(
                    "UPDATE orders SET status=?,ticket=?,result_message=?,updated_at=? WHERE id=? AND status='claimed'",
                    (result["status"], ticket or None, message, time.time(), match.group(1)),
                ).rowcount
                if (updated and result["status"] == "placed" and existing["mentor_id"]
                        and existing["source_position_id"] and ticket.isdigit()):
                    db.execute(
                        "INSERT OR IGNORE INTO copied_positions(mentor_id,source_position_id,follower_login,follower_ticket,updated_at) "
                        "VALUES(?,?,?,?,?)",
                        (existing["mentor_id"], existing["source_position_id"], existing["login"], ticket, time.time()),
                    )
            if not updated:
                return self._send(404, {"error": "Unknown or already completed order."})
            return self._send(200, {"status": "recorded"})
        match = re.fullmatch(r"/v1/closes/([0-9a-f-]+)/result", parsed.path)
        if match:
            if not ea_authed(self.headers.get("Authorization", "")):
                return self._send(401, {"error": "Unauthorized"})
            try:
                result = self._read_json()
                if not isinstance(result, dict) or result.get("status") not in CLOSE_STATUSES:
                    raise ValueError("status must be closed or failed.")
                message = str(result.get("message", ""))[:500]
            except (json.JSONDecodeError, ValueError) as error:
                return self._send(400, {"error": str(error)})
            with db_session() as db:
                existing = db.execute(
                    "SELECT status,result_message,login,mentor_id,source_position_id,ticket FROM closes WHERE id=?",
                    (match.group(1),),
                ).fetchone()
                if not existing:
                    return self._send(404, {"error": "Unknown close request."})
                if existing["status"] != "claimed":
                    if existing["status"] == result["status"] and (existing["result_message"] or "") == message:
                        return self._send(200, {"status": "recorded", "replayed": True})
                    return self._send(409, {"error": "Close request already has a different final result."})
                updated = db.execute(
                    "UPDATE closes SET status=?,result_message=?,updated_at=? WHERE id=? AND status='claimed'",
                    (result["status"], message, time.time(), match.group(1)),
                ).rowcount
                if updated and result["status"] == "closed" and existing["mentor_id"]:
                    db.execute(
                        "DELETE FROM copied_positions WHERE mentor_id=? AND source_position_id=? "
                        "AND follower_login=? AND follower_ticket=?",
                        (existing["mentor_id"], existing["source_position_id"],
                         existing["login"], existing["ticket"]),
                    )
            if not updated:
                return self._send(404, {"error": "Unknown or already completed close request."})
            return self._send(200, {"status": "recorded"})
        if parsed.path == "/v1/prices":
            authorization = self.headers.get("Authorization", "")
            if not ea_authed(authorization):
                return self._send(401, {"error": "Unauthorized"})
            try:
                payload = self._read_json()
                login, ticks = validate_ticks(payload)
                has_positions, positions = validate_positions(payload)
            except (json.JSONDecodeError, ValueError, AttributeError) as error:
                return self._send(400, {"error": str(error)})
            with db_session() as db:
                account = db.execute("SELECT role FROM accounts WHERE login=?", (login,)).fetchone()
                mentor = db.execute(
                    "SELECT 1 FROM mentors WHERE login=? AND is_active=1", (login,)
                ).fetchone()
                is_mentor = bool(mentor or (account and account["role"] == "mentor"))
                if is_mentor and not auth_matches(authorization, BRIDGE_KEY):
                    return self._send(401, {"error": "Mentor price reports require the platform bridge key."})
                if not account and not mentor:
                    return self._send(403, {"error": "Price login is not a registered SkuD account."})
                now = time.time()
                db.executemany(
                                        "INSERT INTO prices(login,symbol,bid,ask,volume_min,volume_max,volume_step,volume_limits_known,updated_at) VALUES(?,?,?,?,?,?,?,?,?) "
                    "ON CONFLICT(login,symbol) DO UPDATE SET "
                                        "bid=excluded.bid,ask=excluded.ask,volume_min=excluded.volume_min,"
                                        "volume_max=excluded.volume_max,volume_step=excluded.volume_step,"
                                        "volume_limits_known=excluded.volume_limits_known,updated_at=excluded.updated_at",
                                        [(login, tick["symbol"], tick["bid"], tick["ask"], tick["volume_min"],
                                            tick["volume_max"], tick["volume_step"], int(tick["volume_limits_known"]), now) for tick in ticks],
                )
                if has_positions:
                    db.execute("DELETE FROM positions WHERE login=?", (login,))
                if positions:
                    db.executemany(
                        "INSERT INTO positions(login,ticket,symbol,pos_type,volume,updated_at) VALUES(?,?,?,?,?,?)",
                        [(login, pos["ticket"], pos["symbol"], pos["type"], pos["volume"], now) for pos in positions],
                    )
            return self._send(200, {"status": "recorded", "count": len(ticks), "positions": len(positions)})
        if parsed.path == "/v1/terminal/status":
            if not ea_authed(self.headers.get("Authorization", "")):
                return self._send(401, {"error": "Unauthorized"})
            try:
                status = self._read_json()
                login = str(status.get("login", ""))
                connected = bool(status.get("connected"))
                message = str(status.get("message", ""))[:200]
                server = str(status.get("server", ""))[:128]
                try:
                    balance = float(status.get("balance", 0))
                except (TypeError, ValueError):
                    return self._send(400, {"error": "balance must be a number."})
                currency = str(status.get("currency", ""))[:16]
            except (json.JSONDecodeError, ValueError, AttributeError) as error:
                return self._send(400, {"error": str(error)})
            with db_session() as db:
                known = db.execute("SELECT 1 FROM accounts WHERE login=?", (login,)).fetchone()
                if not known:
                    return self._send(403, {"error": "Heartbeat login is not a registered SkuD account."})
                db.execute(
                    "INSERT INTO terminal_status(login,connected,last_seen,message,server,balance,currency) VALUES(?,?,?,?,?,?,?) "
                    "ON CONFLICT(login) DO UPDATE SET connected=excluded.connected,last_seen=excluded.last_seen,"
                    "message=excluded.message,server=excluded.server,balance=excluded.balance,currency=excluded.currency",
                    (login, int(connected), time.time(), message, server, balance, currency),
                )
            return self._send(200, {"status": "recorded"})
        return self._send(404, {"error": "Not found"})


def main() -> None:
    if len(BRIDGE_KEY) < 32:
        raise SystemExit("Set SKUD_BRIDGE_KEY (32+ characters) before starting.")
    with db_session():
        pass
    if os.environ.get("SKUD_RECONCILE_ON_BOOT", "1") == "1":
        reconcile_on_boot()
    host = os.environ.get("SKUD_HOST", "127.0.0.1")
    port = int(os.environ.get("SKUD_PORT", "8765"))
    server = ThreadingHTTPServer((host, port), BridgeHandler)
    print("SkuD bridge listening at http://%s:%d" % (host, port))
    server.serve_forever()


if __name__ == "__main__":
    main()
