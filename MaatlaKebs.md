# MaatlaKebs Copy Trading System

## Overview

MaatlaKebs is a copy trading platform that replicates trades from a Mentor MT5 account to multiple Student MT5 accounts in real-time. The system runs across two VPS servers with Supabase (PostgreSQL) as the backend database.

## Architecture

```
┌──────────────────┐     ┌─────────────────────┐     ┌──────────────────────────┐
│  Mentor MT5      │────▶│  Hetzner FastAPI    │────▶│  Contabo Windows VPS     │
│  (Maatla Kebs    │     │  + Celery + Redis   │     │  MT5 Terminals + Manager │
│   Mentor EA)     │     │                     │     │                          │
└──────────────────┘     └─────────────────────┘     └──────────────────────────┘
         │                        │                            │
         │                        ▼                            ▼
         │               ┌─────────────────┐          ┌─────────────────┐
         │               │  Supabase       │          │  Signal Files   │
         │               │  PostgreSQL     │◀─────────│  results\       │
         │               │                 │          │  signals\       │
         │               └─────────────────┘          └─────────────────┘
         │                        ▲                            │
         │                        │                            ▼
         │               ┌─────────────────┐          ┌─────────────────┐
         └──────────────▶│  Student PWA    │          │  EA Slaves      │
                         │  (React/Next)   │          │  (MQL5 inside   │
                         └─────────────────┘          │   each MT5)     │
                                                      └─────────────────┘
```

## Servers

| Server | Role | OS | Location |
|--------|------|----|----------|
| Hetzner | FastAPI bridge, Celery workers, Redis | Linux | Germany |
| Contabo | MT5 Manager, MT5 Terminals, EA Slaves | Windows | Germany |

## Key Technologies

- **Backend**: Supabase (PostgreSQL + REST API + Realtime)
- **Bridge**: FastAPI (Python 3.12) on Hetzner
- **Queue**: Celery + Redis on Hetzner
- **Execution**: MQL5 EAs inside MT5 terminals on Contabo
- **Frontend**: React/Next.js PWA (separate repo)

## File Locations

### Hetzner (`/app/`)
| File | Purpose |
|------|---------|
| `main.py` | FastAPI app entry point |
| `config.py` | Environment settings (pydantic) |
| `routers/webhooks.py` | Receives Mentor EA signals |
| `routers/admin.py` | Admin endpoints |
| `routers/health.py` | Health checks |
| `services/trade_executor.py` | Dispatches signals to Contabo |
| `services/celery_app.py` | Celery task definitions |
| `services/supabase_service.py` | Supabase DB operations |
| `services/security.py` | HMAC webhook validation |
| `models/payloads.py` | Pydantic request/response models |

### Contabo (`C:\`)
| Path | Purpose |
|------|---------|
| `C:\LeanBridge\mt5_manager.py` | Signal writer + result collector |
| `C:\LeanBridge\student.py` | **DEPRECATED** — Python workers |
| `C:\MaatlaKebs\signals\` | Signal files (Python writes, EA reads) |
| `C:\MaatlaKebs\results\` | Result files (EA writes, Python reads) |
| `C:\MT5Terminals\Student001\` | MT5 terminal #1 |
| `C:\MT5Terminals\Student002\` | MT5 terminal #2 |
| ... | ... |
| `C:\MT5Terminals\Student053\` | MT5 terminal #53 |

## Signal Flow (End-to-End)

### 1. Mentor Opens a Trade
```
Mentor EA (MQL5) detects DEAL_ENTRY_IN
  → Builds JSON payload with HMAC signature
  → POST https://hetzner-ip/webhook/signal
```

### 2. Hetzner Receives Signal
```
FastAPI /webhook/signal
  → Validates HMAC signature
  → Fetches active students for this trader_id
  → Chunks students into batches
  → Dispatches Celery tasks: execute_trade_batch.delay()
  → Returns 200 immediately (fire-and-forget)
```

### 3. Celery Processes Batch
```
Celery Worker
  → Calls trade_executor.execute_batch_broadcast()
  → POST http://contabo-ip:5000/signal
  → Payload: {action, symbol, order_type, volume, mentor_ticket, trader_id, sl, tp}
```

### 4. Contabo Manager Writes Files
```
mt5_manager.py /signal
  → Fetches active students matching trader_id
  → Writes ONE file per student: C:\MaatlaKebs\signals\{mt5_login}.json
  → Returns: {"status": "written", "files_written": N}
```

### 5. EA Slave Executes Trade
```
MaatlaKebs_Slave_v2.mq5 (inside each MT5 terminal)
  → OnTick() checks every ~100ms for signal file
  → Reads C:\MaatlaKebs\signals\{AccountLogin}.json
  → Parses signal, calculates scaled volume via OrderCalcMargin()
  → Executes OrderSend() directly inside MT5
  → Writes result to C:\MaatlaKebs\results\{login}_result.json
  → Deletes signal file
```

### 6. Result Collection
```
mt5_manager.py background thread (result_collector_loop)
  → Scans C:\MaatlaKebs\results\ every 5 seconds
  → Batches all new result files
  → INSERT into Supabase trade_logs
  → Deletes processed result files
```

## Supabase Schema (Key Tables)

### `student_accounts`
| Column | Type | Description |
|--------|------|-------------|
| `user_id` | uuid | Primary key, links to auth |
| `mt5_login` | bigint | MT5 account number |
| `mt5_server` | text | Broker server name |
| `encrypted_password` | text | Encrypted MT5 password |
| `folder_path` | text | Terminal folder on Contabo |
| `trader_id` | uuid | Foreign key to mentor user |
| `is_active` | boolean | Account enabled/disabled |
| `is_ghost` | boolean | Ghost account (no real MT5) |
| `created_at` | timestamp | Account creation date |

### `risk_profiles`
| Column | Type | Description |
|--------|------|-------------|
| `user_id` | uuid | Links to student_accounts |
| `aggressiveness` | float | Volume multiplier (0.1 - 5.0) |
| `max_lot` | float | Hard cap on lot size |
| `pause_copy` | boolean | Student paused copying |
| `advanced_options` | jsonb | {scale_in, hedge, overleverage} |

### `payment_status`
| Column | Type | Description |
|--------|------|-------------|
| `user_id` | uuid | Links to student_accounts |
| `subscription_status` | text | active / expired / cancelled |
| `expires_at` | timestamp | Subscription expiry |

### `trade_logs`
| Column | Type | Description |
|--------|------|-------------|
| `user_id` | uuid | Student who received trade |
| `mentor_ticket` | text | Mentor's position ticket |
| `student_ticket` | text | Student's executed ticket |
| `symbol` | text | Trading symbol |
| `order_type` | text | BUY or SELL |
| `volume` | float | Executed lot size |
| `entry_price` | float | Execution price |
| `status` | text | success / failed / queued / skipped |
| `strategy_type` | text | normal / scale_in / hedge / overleverage |
| `error_message` | text | Error details if failed |
| `executed_at` | timestamp | Execution timestamp |

### `connection_status`
| Column | Type | Description |
|--------|------|-------------|
| `user_id` | uuid | Student identifier |
| `mt5_status` | text | CONNECTED / DISCONNECTED / ERROR |
| `last_checked` | timestamp | Last health check |
| `error_message` | text | Error details |

### `mentor_heartbeat`
| Column | Type | Description |
|--------|------|-------------|
| `trader_id` | text | Mentor identifier |
| `last_seen` | timestamp | Last heartbeat received |
| `status` | text | ONLINE / WARNING / OFFLINE |
| `consecutive_misses` | int | Missed heartbeat count |

### `system_flags`
| Column | Type | Description |
|--------|------|-------------|
| `key` | text | Flag name |
| `value` | text | Flag value |
| `updated_at` | timestamp | Last change |
| `updated_by` | uuid | Admin who changed it |

**Important flags:**
- `emergency_close_all` — When "true", all trades are blocked
- `platform_paused` — When "true", signals are queued but not executed

## Configuration

### Hetzner Environment Variables (`.env`)
```
SUPABASE_URL=https://yrnjemftbqwvbvknlxol.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
WEBHOOK_SECRET=your_hmac_secret
ENCRYPTION_KEY=your_aes_key
REDIS_URL=redis://localhost:6379/0
MT5_SERVER_URL=http://contabo-ip:5000
BATCH_SIZE=10
MAX_RETRIES=3
```

### Contabo Environment Variables
```
SUPABASE_URL=https://yrnjemftbqwvbvknlxol.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
PROVISION_SECRET=9ecf9109adf78a9bdda26cfae02227d7
SIGNALS_FOLDER=C:\MaatlaKebs\signals
RESULTS_FOLDER=C:\MaatlaKebs\results
```

### Mentor EA Inputs
| Input | Description | Example |
|-------|-------------|---------|
| `BridgeURL` | Hetzner FastAPI URL | `https://your-domain.com` |
| `WebhookSecret` | HMAC secret (same as .env) | `your_secret_key` |
| `TraderID` | Mentor's UUID from Supabase | `aaaaaaa...` |
| `MentorMagicNumber` | Magic number for mentor trades | `20260101` |

### Slave EA Inputs
| Input | Description | Default |
|-------|-------------|---------|
| `SignalFolder` | Where to read signal files | `C:\MaatlaKebs\signals\` |
| `ResultFolder` | Where to write result files | `C:\MaatlaKebs\results\` |
| `MagicNumber` | Magic number (0 matches mentor) | `0` |
| `Slippage` | Max slippage in points | `20` |
| `SafetyBuffer` | Margin scaling buffer | `0.9` |
| `StaleSeconds` | Reject signals older than N sec | `30` |
| `UseEquityRatio` | Use equity ratio instead of margin | `false` |

## Volume Scaling Logic

The system uses **margin-based scaling** (not equity ratio):

```
1. Calculate margin required for mentor's lot size:
   margin_required = OrderCalcMargin(BUY, V75, 1.0 lot, price)

2. Compare to student's free margin:
   if margin_required <= free_margin:
       student_lot = mentor_lot
   else:
       ratio = free_margin / margin_required
       student_lot = mentor_lot * ratio * 0.9 (safety buffer)

3. Normalize to symbol's volume step
```

**Why margin-based?**
- Accounts for leverage (a $100 account with 1:500 leverage can trade more than a $100 account with 1:50)
- Accounts for open positions (free margin, not total equity)
- Safer than equity ratio during drawdowns

## Deployment Steps

### 1. Hetzner Deployment
```bash
# SSH into Hetzner
cd /app

# Update code
git pull

# Install/update dependencies
pip install -r requirements.txt

# Restart Celery workers
systemctl restart celery
celery -A app.services.celery_app beat --detach

# Restart FastAPI
systemctl restart fastapi
```

### 2. Contabo Deployment
```powershell
# 1. Stop old manager (if running)
# Ctrl+C in the manager window, or:
Get-Process python | Stop-Process -Force

# 2. Create directories
New-Item -ItemType Directory -Path "C:\MaatlaKebs\signals" -Force
New-Item -ItemType Directory -Path "C:\MaatlaKebs\results" -Force

# 3. Copy new manager
Copy-Item C:\LeanBridge\mt5_manager.py C:\LeanBridge\mt5_manager.py.backup
# (copy new file from deployment)

# 4. Run pre-warmer (launches only active terminals)
.\pre_warmer.ps1

# 5. Attach EA to each terminal chart
# Open chart → Navigator → Expert Advisors → MaatlaKebs_Slave_v2 → Attach

# 6. Start new manager
python C:\LeanBridge\mt5_manager.py
```

### 3. Mentor EA Deployment
```
1. Open MetaEditor
2. Open Maatla Kebs.mq5
3. Update inputs:
   - BridgeURL = https://your-hetzner-domain.com
   - WebhookSecret = your_hmac_secret
   - TraderID = your_supabase_user_id
4. Press F7 to compile
5. Attach to chart on Mentor MT5 terminal
```

## Troubleshooting

### "No signal file written"
- Check manager logs: does it fetch students for the trader_id?
- Check Supabase: does the student have matching trader_id and is_active=true?
- Check Hetzner logs: is trader_id being sent in the payload?

### "EA not executing trades"
- Check Experts tab: does EA show "Initialized" message?
- Check AutoTrading: is it enabled in terminal and EA properties?
- Check signal file: does `C:\MaatlaKebs\signals\{login}.json` exist?
- Check symbol: is the symbol available in Market Watch?

### "Stale signal rejected"
- EA rejects signals older than 30 seconds (configurable via `StaleSeconds`)
- Check clock sync between Hetzner and Contabo
- Reduce `StaleSeconds` to 60 if network latency is high

### "Volume scaled to zero"
- Student has insufficient free margin
- Check account equity and open positions
- EA logs will show: `free_margin=X, margin_required=Y`

### Connection Status Shows DISCONNECTED
- Terminal process not running
- Run pre_warmer.ps1 to restart terminals
- Check Windows Task Manager for terminal64.exe

## Migration Notes (v4.9 → v5.0)

| Old (v4.9) | New (v5.0) |
|------------|------------|
| Python workers per student | MQL5 EA inside each MT5 |
| HTTP forwarding (1-3s latency) | File-based (~100ms latency) |
| IPC timeouts (-10005) | Eliminated (EA runs inside MT5) |
| Manager launches workers | Pre-warmer launches terminals |
| `mt5.initialize()` in Python | `OrderSend()` in MQL5 |
| Port allocation per worker | No ports needed |
| Health check HTTP calls | Process monitoring + result files |

## Security

- **HMAC-SHA256**: Every webhook payload is signed with a shared secret
- **Timestamp tolerance**: Requests older than 30 seconds are rejected
- **Service role key**: Contabo and Hetzner use Supabase service_role key (bypasses RLS)
- **Provision secret**: `/provision` endpoint requires `X-Provision-Secret` header
- **Encryption**: MT5 passwords are encrypted at rest (AES-256)

## Contacts & Context

- **Broker**: Weltrade (synthetic indices via Deriv)
- **Max students**: 53 (Student001 → Student053, with 3 ghost slots reserved)
- **Current active**: ~14 students
- **Symbol format**: `Volatility 75 Index`, `Volatility 100 Index`, etc.
- **Filling mode**: FOK or IOC for synthetic indices
- **Magic number**: `20260101` (mentor), `0` (slave EA, filtered by comment)
