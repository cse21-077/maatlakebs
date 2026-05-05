# student_worker.py
# MaatlaKebs — Per-Student MT5 Worker Process
# MaatlaKebs Copytrading - Production System v3.0 (Final)
# One instance of this runs per student account
# Started and managed by mt5_manager.py
# CRITICAL FIXES: MT5 lock, retry logic, deduplication, symbol cache, thread-safe
# POLISH: deque for dedupe, thread-safe set operations
# ============================================================

import MetaTrader5 as mt5
from flask import Flask, request, jsonify
import logging
import argparse
import time
import sys
import os
import threading
from queue import Queue
from collections import deque

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s][Worker-%(process)d] %(message)s",
    stream=sys.stdout,
    force=True
)
logger = logging.getLogger(__name__)

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(line_buffering=True)

app = Flask(__name__)

# ── State ─────────────────────────────────────────────────────
MAGIC_NUMBER   = 20260101
worker_login   = None
worker_pass    = None
worker_server  = None
worker_path    = None
connected      = False
trade_queue    = Queue(maxsize=100)
mt5_lock       = threading.Lock()
selected_symbols = set()
selected_symbols_lock = threading.Lock()  # 🔥 Thread-safe symbol cache

# 🔥 Use deque with maxlen for automatic FIFO eviction
MAX_PROCESSED_TICKETS = 1000
processed_tickets = deque(maxlen=MAX_PROCESSED_TICKETS)
processed_tickets_lock = threading.Lock()  # 🔥 Thread-safe dedupe

# Only SyntX symbols mentor actually trades
COMMON_SYMBOLS = [
    "FX Vol 20", "FX Vol 40", "FX Vol 60", "FX Vol 80", "FX Vol 99",
    "PainX 400", "PainX 600", "PainX 800", "PainX 999", "PainX 1200",
    "GainX 400", "GainX 600", "GainX 800", "GainX 999", "GainX 1200",
]

MIN_TRADE_INTERVAL = 0.05  # 50ms between trades


# ── MT5 Connection ────────────────────────────────────────────

def connect() -> bool:
    """Connect to MT5 — minimal startup, returns immediately."""
    global connected
    try:
        with mt5_lock:
            mt5.shutdown()
        time.sleep(0.3)
        
        init_kwargs = {
            "login":    int(worker_login),
            "password": str(worker_pass),
            "server":   str(worker_server),
            "timeout":  15000
        }
        
        if worker_path and os.path.exists(worker_path):
            terminal_exe = os.path.join(worker_path, "terminal64.exe")
            if os.path.exists(terminal_exe):
                init_kwargs["path"] = terminal_exe
        
        with mt5_lock:
            result = mt5.initialize(**init_kwargs)
        
        if result:
            with mt5_lock:
                info = mt5.account_info()
            if info:
                connected = True
                logger.info(f"✅ Connected | Login: {info.login} | Balance: {info.balance:.2f}")
                threading.Thread(target=preselect_symbols, daemon=True).start()
                return True
            else:
                logger.error("❌ MT5 initialized but cannot get account info")
        
        error = mt5.last_error()
        logger.error(f"❌ Connection failed: {error}")
        connected = False
        return False
        
    except Exception as e:
        logger.error(f"❌ Connect exception: {e}")
        connected = False
        return False


def preselect_symbols():
    """Pre-select symbols in background — thread-safe."""
    time.sleep(2)
    selected = 0
    for sym in COMMON_SYMBOLS:
        try:
            with mt5_lock:
                if mt5.symbol_select(sym, True):
                    mt5.symbol_info_tick(sym)
                    with selected_symbols_lock:
                        selected_symbols.add(sym)
                    selected += 1
        except:
            pass
    logger.info(f"📊 Pre-selected {selected}/{len(COMMON_SYMBOLS)} symbols")


def ensure_connected() -> bool:
    """Check connection and reconnect if needed."""
    global connected
    if connected:
        try:
            with mt5_lock:
                if mt5.account_info() is not None:
                    return True
        except Exception:
            pass
        connected = False
        logger.warning("Connection lost, reconnecting...")
    return connect()


def get_filling_mode(symbol: str) -> int:
    """Auto-detect supported filling mode."""
    with mt5_lock:
        info = mt5.symbol_info(symbol)
    if info is None:
        return mt5.ORDER_FILLING_FOK
    filling = info.filling_mode
    if filling & 1:
        return mt5.ORDER_FILLING_FOK
    elif filling & 2:
        return mt5.ORDER_FILLING_IOC
    else:
        return mt5.ORDER_FILLING_RETURN


# ── Trade Execution (Thread-Safe) ─────────────────────────────

def _is_ticket_processed(mentor_ticket: str) -> bool:
    """Thread-safe check if ticket already processed."""
    if not mentor_ticket:
        return False
    with processed_tickets_lock:
        return mentor_ticket in processed_tickets


def _mark_ticket_processed(mentor_ticket: str):
    """Thread-safe mark ticket as processed."""
    if not mentor_ticket:
        return
    with processed_tickets_lock:
        processed_tickets.append(mentor_ticket)


def _execute_trade_sync(symbol: str, order_type: str, volume: float, mentor_ticket: str = "") -> dict:
    """Synchronous trade execution — THREAD-SAFE with retry logic."""
    global connected
    
    # 🔥 Deduplication using deque
    if _is_ticket_processed(mentor_ticket):
        logger.info(f"⏭️ Trade {mentor_ticket} already processed — skipping")
        return {"status": "skipped", "reason": "already_processed"}
    
    try:
        if not ensure_connected():
            return {"status": "failed", "error": "Not connected to MT5"}
        
        # 🔥 Thread-safe symbol cache
        with selected_symbols_lock:
            symbol_cached = symbol in selected_symbols
        
        if not symbol_cached:
            with mt5_lock:
                if mt5.symbol_select(symbol, True):
                    with selected_symbols_lock:
                        selected_symbols.add(symbol)
        
        with mt5_lock:
            tick = mt5.symbol_info_tick(symbol)
        
        if not tick:
            return {"status": "failed", "error": f"No tick data for {symbol}"}
        
        price = tick.ask if order_type == "BUY" else tick.bid
        trade_type = mt5.ORDER_TYPE_BUY if order_type == "BUY" else mt5.ORDER_TYPE_SELL
        filling = get_filling_mode(symbol)
        
        order = {
            "action":       mt5.TRADE_ACTION_DEAL,
            "symbol":       symbol,
            "volume":       volume,
            "type":         trade_type,
            "price":        price,
            "deviation":    20,
            "magic":        MAGIC_NUMBER,
            "comment":      f"MaatlaKebs_{mentor_ticket}",
            "type_time":    mt5.ORDER_TIME_GTC,
            "type_filling": filling,
        }
        
        # 🔥 Retry logic (up to 2 attempts)
        for attempt in range(2):
            with mt5_lock:
                result = mt5.order_send(order)
            
            if result and result.retcode == mt5.TRADE_RETCODE_DONE:
                _mark_ticket_processed(mentor_ticket)
                logger.info(f"✅ Trade executed: {symbol} {order_type} {volume} lots | ticket={result.order}")
                return {"status": "success", "ticket": result.order, "price": result.price}
            
            if attempt == 0:
                time.sleep(0.1)
        
        error_msg = f"Trade failed: retcode={result.retcode if result else 'None'}"
        logger.error(f"❌ {error_msg}")
        return {"status": "failed", "retcode": result.retcode if result else None, "error": error_msg}
        
    except Exception as e:
        logger.error(f"❌ Trade exception: {e}")
        return {"status": "failed", "error": str(e)}


def trade_worker_loop():
    """Background thread that processes trades from the queue."""
    logger.info("🔄 Trade worker started")
    
    while True:
        try:
            trade_data = trade_queue.get()
            if trade_data is None:
                break
            
            qsize = trade_queue.qsize()
            if qsize > 70:
                logger.warning(f"⚠️ Queue high: {qsize}/100")
            
            logger.info(f"⚙️ Processing: {trade_data['symbol']} {trade_data['order_type']} {trade_data['volume']}")
            result = _execute_trade_sync(
                trade_data["symbol"],
                trade_data["order_type"],
                trade_data["volume"],
                trade_data["mentor_ticket"]
            )
            
            if result.get("status") != "success":
                logger.error(f"❌ Trade failed: {result.get('error')}")
            
        except Exception as e:
            logger.error(f"❌ Trade worker error: {e}")
        finally:
            trade_queue.task_done()


# ── Flask Routes ──────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    """Health check — NEVER blocks, NEVER calls MT5."""
    return jsonify({
        "status":       "ok" if connected else "disconnected",
        "login":        worker_login,
        "connected":    connected,
        "queue_size":   trade_queue.qsize(),
        "queue_full":   trade_queue.full(),
        "timestamp":    time.time()
    })


@app.route("/trade", methods=["POST"])
def execute_trade():
    """Accept trade instantly — PURE non-blocking."""
    data = request.json
    if not data:
        return jsonify({"status": "failed", "error": "Empty body"}), 400
    
    symbol = data.get("symbol")
    order_type = data.get("order_type")
    volume = float(data.get("volume", 0.01))
    mentor_ticket = data.get("mentor_ticket", "")
    
    if not symbol or not order_type:
        return jsonify({"status": "failed", "error": "symbol and order_type required"}), 400
    
    if trade_queue.full():
        logger.warning(f"⚠️ Queue full — rejecting trade")
        return jsonify({"status": "failed", "error": "Queue full"}), 503
    
    trade_queue.put_nowait({
        "symbol": symbol,
        "order_type": order_type,
        "volume": volume,
        "mentor_ticket": mentor_ticket
    })
    
    logger.info(f"📥 Trade queued: {symbol} {order_type} {volume} | Queue: {trade_queue.qsize()}")
    
    return jsonify({
        "status": "queued",
        "queue_size": trade_queue.qsize()
    }), 202


@app.route("/close", methods=["POST"])
def close_positions():
    """Close positions — thread-safe."""
    data = request.json
    if not data:
        return jsonify({"status": "failed", "error": "Empty body"}), 400
        
    symbol = data.get("symbol")
    if not symbol:
        return jsonify({"status": "failed", "error": "symbol required"}), 400
    
    def _close_task():
        try:
            if not ensure_connected():
                return
            
            with mt5_lock:
                positions = mt5.positions_get(symbol=symbol)
            
            if not positions:
                return
            
            for pos in positions:
                if pos.magic == MAGIC_NUMBER:
                    with mt5_lock:
                        tick = mt5.symbol_info_tick(symbol)
                    
                    if tick:
                        close_type = mt5.ORDER_TYPE_SELL if pos.type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY
                        price = tick.bid if pos.type == mt5.POSITION_TYPE_BUY else tick.ask
                        
                        order = {
                            "action": mt5.TRADE_ACTION_DEAL,
                            "symbol": symbol,
                            "volume": pos.volume,
                            "type": close_type,
                            "position": pos.ticket,
                            "price": price,
                            "deviation": 20,
                            "magic": MAGIC_NUMBER,
                            "comment": "MaatlaKebs_Close",
                            "type_time": mt5.ORDER_TIME_GTC,
                            "type_filling": get_filling_mode(symbol),
                        }
                        
                        with mt5_lock:
                            result = mt5.order_send(order)
                        
                        if result and result.retcode == mt5.TRADE_RETCODE_DONE:
                            logger.info(f"✅ Closed position {pos.ticket}")
        except Exception as e:
            logger.error(f"Close error: {e}")
    
    threading.Thread(target=_close_task, daemon=True).start()
    return jsonify({"status": "queued"}), 202


# ── Keepalive ─────────────────────────────────────────────────

def keepalive_loop():
    def _loop():
        while True:
            time.sleep(5)
            try:
                global connected
                if not connected:
                    connect()
                else:
                    with mt5_lock:
                        if mt5.account_info() is None:
                            connected = False
                            logger.warning("Keepalive: connection lost")
            except Exception as e:
                logger.error(f"Keepalive error: {e}")
                connected = False
    threading.Thread(target=_loop, daemon=True).start()


def shutdown():
    logger.info("Shutting down...")
    trade_queue.put(None)
    with mt5_lock:
        mt5.shutdown()


# ── Entry Point ───────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MaatlaKebs Student Worker v3.0")
    parser.add_argument("--login",   required=True)
    parser.add_argument("--password",required=True)
    parser.add_argument("--server",  required=True)
    parser.add_argument("--path",    default="")
    parser.add_argument("--port",    required=True, type=int)
    args = parser.parse_args()

    worker_login  = args.login
    worker_pass   = args.password
    worker_server = args.server
    worker_path   = args.path

    print("=" * 50, flush=True)
    logger.info(f"🚀 MaatlaKebs Worker v3.0 | Login: {worker_login} | Port: {args.port}")
    logger.info(f"📊 Queue max: 100 | Dedupe: deque({MAX_PROCESSED_TICKETS}) | Thread-safe: YES")
    print("=" * 50, flush=True)

    if not connect():
        logger.error(f"❌ Initial connection failed")
        sys.exit(1)

    threading.Thread(target=trade_worker_loop, daemon=True).start()
    keepalive_loop()

    import atexit
    atexit.register(shutdown)

    logger.info(f"✅ Worker ready on port {args.port}")
    
    try:
        from waitress import serve
        serve(app, host="127.0.0.1", port=args.port, threads=8)
    except ImportError:
        app.run(host="127.0.0.1", port=args.port, debug=False, threaded=True)