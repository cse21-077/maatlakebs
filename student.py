# student_worker.py
# MaatlaKebzCopier — Per-Student MT5 Worker Process
# One instance of this runs per student account
# Each process has exclusive MT5 access — no threading conflicts
# Started and managed by mt5_manager.py
# ============================================================

import MetaTrader5 as mt5
from flask import Flask, request, jsonify
import logging
import argparse
import time
import sys
import os

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s][Worker-%(process)d] %(message)s"
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# ── State ─────────────────────────────────────────────────────
MAGIC_NUMBER  = 20260101
worker_login  = None
worker_pass   = None
worker_server = None
worker_path   = None
connected     = False


# ── MT5 Connection ────────────────────────────────────────────

def connect() -> bool:
    global connected
    try:
        mt5.shutdown()
        
        init_kwargs = {
            "login":   int(worker_login),
            "password": str(worker_pass),
            "server":   str(worker_server),
            "timeout":  15000
        }
        
        # Use terminal path if available (preferred — dedicated terminal)
        if worker_path and os.path.exists(worker_path + "\\terminal64.exe"):
            init_kwargs["path"] = worker_path + "\\terminal64.exe"
            logger.info(f"Connecting via terminal path: {worker_path}")
        else:
            logger.info(f"Connecting directly via credentials (no terminal path)")

        result = mt5.initialize(**init_kwargs)
        
        if result:
            info = mt5.account_info()
            if info:
                connected = True
                logger.info(f"Connected | Login: {worker_login} | Balance: {info.balance} | Server: {info.server}")
                return True
        
        logger.error(f"Connection failed: {mt5.last_error()}")
        connected = False
        return False
        
    except Exception as e:
        logger.error(f"Connect exception: {e}")
        connected = False
        return False


def ensure_connected() -> bool:
    global connected
    if connected:
        try:
            info = mt5.account_info()
            if info is not None:
                return True
        except Exception:
            pass
        connected = False
        logger.warning("Connection lost, reconnecting...")
    return connect()





def get_filling_mode(symbol: str) -> int:
    """Auto-detect supported filling mode for this broker/symbol."""
    info = mt5.symbol_info(symbol)
    if info is None:
        return mt5.ORDER_FILLING_FOK

    filling = info.filling_mode
    if filling & 1:   # SYMBOL_FILLING_FOK = 1
        return mt5.ORDER_FILLING_FOK
    elif filling & 2: # SYMBOL_FILLING_IOC = 2
        return mt5.ORDER_FILLING_IOC
    else:
        return mt5.ORDER_FILLING_RETURN


# ── Flask Routes ──────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    is_connected = ensure_connected()
    balance = None
    if is_connected:
        info = mt5.account_info()
        if info:
            balance = info.balance
    return jsonify({
        "status":    "ok" if is_connected else "disconnected",
        "login":     worker_login,
        "server":    worker_server,
        "connected": is_connected,
        "balance":   balance
    })


@app.route("/trade", methods=["POST"])
def execute_trade():
    global connected
    data          = request.json
    symbol        = data.get("symbol")
    order_type    = data.get("order_type")
    volume        = float(data.get("volume", 0.01))
    mentor_ticket = data.get("mentor_ticket", "")

    if not ensure_connected():
        return jsonify({"status": "failed", "error": "Not connected to MT5"}), 500

    try:
        # Select symbol
        if not mt5.symbol_select(symbol, True):
            return jsonify({"status": "failed", "error": f"Symbol {symbol} not available"}), 400

        time.sleep(0.1)  # Allow symbol to load

        tick = mt5.symbol_info_tick(symbol)
        if not tick:
            return jsonify({"status": "failed", "error": f"No tick data for {symbol}"}), 400

        price      = tick.ask if order_type == "BUY" else tick.bid
        trade_type = mt5.ORDER_TYPE_BUY if order_type == "BUY" else mt5.ORDER_TYPE_SELL
        filling    = get_filling_mode(symbol)

        order = {
            "action":       mt5.TRADE_ACTION_DEAL,
            "symbol":       symbol,
            "volume":       volume,
            "type":         trade_type,
            "price":        price,
            "deviation":    20,
            "magic":        MAGIC_NUMBER,
            "comment":      f"MaatlaKebzCopier_{mentor_ticket}",
            "type_time":    mt5.ORDER_TIME_GTC,
            "type_filling": filling,
        }

        result = mt5.order_send(order)

        if result is None:
            connected = False
            return jsonify({"status": "failed", "error": "order_send returned None"}), 500

        if result.retcode != mt5.TRADE_RETCODE_DONE:
            return jsonify({
                "status":  "failed",
                "retcode": result.retcode,
                "error":   f"Trade failed: {result.retcode} — {result.comment}"
            }), 500

        logger.info(f"Trade executed: {symbol} {order_type} {volume} lots | ticket={result.order} | price={result.price}")
        return jsonify({
            "status": "success",
            "ticket": result.order,
            "price":  result.price,
            "login":  worker_login
        })

    except Exception as e:
        connected = False
        logger.error(f"Trade exception: {e}")
        return jsonify({"status": "failed", "error": str(e)}), 500


@app.route("/close", methods=["POST"])
def close_positions():
    data   = request.json
    symbol = data.get("symbol")

    if not ensure_connected():
        return jsonify({"status": "failed", "error": "Not connected to MT5"}), 500

    try:
        positions = mt5.positions_get(symbol=symbol)
        if not positions:
            return jsonify({"status": "skipped", "reason": "No positions found"})

        lb_positions = [p for p in positions if p.magic == MAGIC_NUMBER]
        if not lb_positions:
            return jsonify({"status": "skipped", "reason": "No MaatlaKebzCopier positions"})

        results  = []
        filling  = get_filling_mode(symbol)

        for pos in lb_positions:
            tick       = mt5.symbol_info_tick(symbol)
            close_type = mt5.ORDER_TYPE_SELL if pos.type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY
            price      = tick.bid if pos.type == mt5.POSITION_TYPE_BUY else tick.ask

            order = {
                "action":       mt5.TRADE_ACTION_DEAL,
                "symbol":       symbol,
                "volume":       pos.volume,
                "type":         close_type,
                "position":     pos.ticket,
                "price":        price,
                "deviation":    20,
                "magic":        MAGIC_NUMBER,
                "comment":      "MaatlaKebzCopier_Close",
                "type_time":    mt5.ORDER_TIME_GTC,
                "type_filling": filling,
            }

            result = mt5.order_send(order)
            status = "success" if result and result.retcode == mt5.TRADE_RETCODE_DONE else "failed"
            results.append({
                "ticket":  pos.ticket,
                "status":  status,
                "retcode": getattr(result, "retcode", None)
            })
            logger.info(f"Close {symbol} ticket={pos.ticket}: {status}")

        return jsonify({"status": "success", "results": results})

    except Exception as e:
        logger.error(f"Close exception: {e}")
        return jsonify({"status": "failed", "error": str(e)}), 500


# ── Keepalive Thread ──────────────────────────────────────────

def keepalive_loop():
    """Reconnect if connection drops. Runs in background thread."""
    import threading
    def _loop():
        while True:
            time.sleep(30)
            try:
                global connected
                if not connected:
                    logger.warning("Keepalive: reconnecting...")
                    connect()
                else:
                    info = mt5.account_info()
                    if info is None:
                        connected = False
                        logger.warning("Keepalive: connection lost, reconnecting...")
                        connect()
            except Exception as e:
                logger.error(f"Keepalive error: {e}")

    t = threading.Thread(target=_loop, daemon=True)
    t.start()


# ── Entry Point ───────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MaatlaKebzCopier Student Worker")
    parser.add_argument("--login",   required=True,  help="MT5 account login")
    parser.add_argument("--password",required=True,  help="MT5 account password")
    parser.add_argument("--server",  required=True,  help="MT5 broker server")
    parser.add_argument("--path",    default="",     help="MT5 terminal folder path")
    parser.add_argument("--port",    required=True,  type=int, help="HTTP port for this worker")
    args = parser.parse_args()

    worker_login  = args.login
    worker_pass   = args.password
    worker_server = args.server
    worker_path   = args.path

    logger.info(f"Starting worker | Login: {worker_login} | Port: {args.port}")

    # Initial connection
    if not connect():
        logger.error(f"Initial connection failed for login {worker_login}")
        sys.exit(1)

    # Start keepalive
    keepalive_loop()

    # Start Flask
    app.run(host="127.0.0.1", port=args.port, debug=False, threaded=True)