# SkuD Turbo MT5 Bridge

This deployment has three distinct parts:

- **Mentor EA:** runs on the mentor's laptop (or on a bridge-provisioned mentor
   terminal on the VPS) and publishes that account's trade events to the HTTPS
   bridge.
- **Python bridge:** runs on the VPS, receives events, manages portable student
   (and optionally mentor) terminals, and queues events for each student account.
- **Student EA:** runs inside every VPS student terminal and executes queued
   events on that logged-in student account.

There is no separate "Bridge EA." The EA deployed to each VPS student profile is
`SkuDTurboStudentEA`. MT5 passwords are currently stored unencrypted in the
bridge SQLite database and terminal startup files. Use demo accounts on a
controlled VPS only.

## VPS layout

- Bridge files and scripts: `C:\skud\final`
- Master MT5 template: `C:\skud\mt5-master`
- Student portable terminals: `C:\skud\terminals\SlotNNN`
- Bridge database: `C:\skud\final\data\skud.sqlite3`
- Persistent DPAPI bridge key: `C:\ProgramData\SkuD\bridge-key.dpapi`
- Public bridge URL: `https://<SKUD_BRIDGE_HOST>` (default `skud.toporapula.dev`)
- Website: `https://skudturbo.vercel.app`

`start-bridge.ps1` and `start-all.ps1` use these paths by default. Optional
`SKUD_TERMINAL_MASTER`, `SKUD_TERMINALS_DIR`, `SKUD_EA_SOURCE`, and
`SKUD_CHART_TEMPLATE` environment variables override them — but all four EA and
chart variables are **auto-discovered** when unset (or when they point at a
missing file): the bridge finds `SkuDTurboStudentEA.ex5` /
`SkuDTurboMentorEA.ex5` in the master terminal's `MQL5\Experts` and locates the
saved chart profiles by scanning `MQL5\Profiles\Charts` for the chart that has
each EA attached. It prints what it found at startup. Set the variables only to
override the discovery. Mentor-hosted terminals use three additional optional
variables: `SKUD_MENTOR_EA_SOURCE` (compiled `SkuDTurboMentorEA.ex5`) and
`SKUD_MENTOR_CHART_TEMPLATE` (a chart profile with the Mentor EA attached).
Managed mentor terminals receive `SKUD_BRIDGE_KEY` in the EA's `BridgeKey`
input. A manually managed Mentor EA uses the same platform key; there is no
separate mentor token.

The public hostname is controlled by the `SKUD_BRIDGE_HOST` environment
variable (Caddyfile; falls back to `skud.toporapula.dev`). The app never talks
to an IP directly — it uses `SKUD_BRIDGE_URL` on Vercel — so moving servers is
a DNS change, not a code change.

## 0. Moving to a new VPS (or changing the bridge IP / hostname)

The only things that tie this system to a server are the DNS A record and the
files on the machine. To move (e.g. old VPS → new VPS):

1. **New VPS**: upload this folder, then run
   `powershell -ExecutionPolicy Bypass -File .\setup-new-vps.ps1 -BridgeHost <hostname>`.
   It creates the layout, checks Python, downloads Caddy, opens firewall 80/443,
   persists `SKUD_BRIDGE_HOST`, and prints a fresh **bridge key**.
2. **DNS**: point the A record for `<hostname>` at the new VPS public IP
   (or pick a new hostname for a new project — `setup-new-vps.ps1` takes any).
   Wait for propagation.
3. **Vercel**: set `SKUD_BRIDGE_URL=https://<hostname>` and `SKUD_BRIDGE_KEY`
   to the new key; redeploy. Nothing else in the app changes.
4. **EAs**: the new bridge has a new key — recompile `SkuDTurboStudentEA.mq5`
   with the new `EaToken`, and re-register mentors (old tokens are hashed in
   the old database and are invalid here). Optionally copy `data\skud.sqlite3`
   from the old VPS to keep enrolled accounts.
5. Follow sections 1-6 below for the MT5 master terminal, EA compile, and
   mentor/student verification, then cut over by pointing DNS.

For a completely fresh project on a different IP: same steps — the hostname
and key are the only variables; the repo needs no edits.

## 1. Prepare the master MT5 terminal

Copy the installed MT5 terminal into the SkuD master directory once:

```powershell
New-Item -ItemType Directory -Force C:\skud\mt5-master | Out-Null
robocopy "C:\Program Files\MetaTrader 5" "C:\skud\mt5-master" /E
```

Open it in portable mode:

```powershell
& C:\skud\mt5-master\terminal64.exe /portable
```

Log in to a Deriv demo account to cache the server, then log out. Keep this
master terminal separate from student terminals. Do not place it under the
student slots directory.

## 2. Initialize the key, then prepare the Student EA template

1. From `C:\skud\final`, initialize the persistent key without starting the
   bridge or requiring a compiled EA:

   ```powershell
   .\start-bridge.ps1 -InitializeKey
   ```

   Copy the printed key into Vercel as the server-only `SKUD_BRIDGE_KEY`. Never
   put it in a `NEXT_PUBLIC_` variable or source control. The key is saved under
   `C:\ProgramData\SkuD` for the current Windows account; keep using that same
   account to run the bridge. This is a one-time setup; normal bridge starts
   reuse the same saved key. Do not put `EaToken` in `.env.example`.
2. Copy `SkuDTurboStudentEA.mq5` and `SkuDTurboStudentCore.mqh` to
   `C:\skud\mt5-master\MQL5\Experts`. Open `SkuDTurboStudentEA.mq5` in
   MetaEditor, enter the bridge key in its `EaToken` input, and compile with
   **F7**. Confirm
   `C:\skud\mt5-master\MQL5\Experts\SkuDTurboStudentEA.ex5` exists.
3. Attach `SkuDTurboStudentEA` to a chart in the master template terminal. Set
   `BridgeUrl` to `http://127.0.0.1:8765`, enable Algo Trading, and allow
   WebRequest to `http://127.0.0.1:8765`.
4. Save the chart profile as `SkuD`, then close the master terminal. Confirm
   `C:\skud\mt5-master\MQL5\Profiles\Charts\SkuD\chart01.chr` exists.
5. Start the full bridge with `C:\skud\final\start-bridge.ps1` or start both
   Caddy and bridge with `C:\skud\final\start-all.ps1`. Normal startup now
   requires the compiled Student EA and saved chart to prevent starting empty
   student terminals.

The Python bridge copies the compiled Student EA and chart file into each newly
provisioned student terminal. Each slot receives its own `startup.ini` with that student's login,
password, and broker server. Do not add student credentials to the master
profile.

Chart profile convention: save the profile on the master terminal **once** with
all Deriv charts the Student EA should report (the EA covers 30 forex/metal
symbols plus 19 synthetic indices by their MT5 full names). The bridge copies
the chart into every slot under its own profile name (`Charts\SkuD` for
students, `Charts\Mentor` for the mentor account) and launches MT5 with
`/profile:<name>`, so each terminal deterministically opens the right chart —
MT5 never restores whatever profile was last active in the master. The bridge
rewrites `EaToken` / `BridgeKey` inside the copied `.chr` at launch, migrating
legacy `MentorToken` settings so the chart cannot retain stale credentials. Disconnecting an
account (bridge `…/deactivate`) stops the terminal **and** wipes the slot's
saved charts, so the next login starts from a fresh template chart.

## 3. DNS, Caddy, and firewall

The Caddyfile serves `{$SKUD_BRIDGE_HOST:skud.toporapula.dev}` and proxies to
`127.0.0.1:8765`. Its A record must point at the VPS public IP (see section 0
when moving servers). Keep the existing
JoeMoney hostname `bridge.toporapula.dev` unchanged. Allow inbound TCP 80 and
443 in Windows Firewall and the VPS provider firewall; do not expose port 8765.

The DNS zone must authorize Caddy's certificate issuer. Add
`CAA 0 issue "letsencrypt.org"` alongside existing CAA records if it is not
already allowed. Place `caddy.exe` in `C:\skud\final`, `C:\Caddy`, or on PATH.

Check the bridge after startup:

```powershell
Invoke-RestMethod https://skud.toporapula.dev/health
```

The unauthenticated account endpoint should return `Unauthorized` in a browser;
that is expected. The health endpoint should return `status: ok`.

## 4. Vercel server environment

Set these **server-only** variables on the `skudturbo.vercel.app` Vercel project,
then redeploy. Keep the bridge key and mentor setup code private.

```text
SKUD_BRIDGE_URL=https://skud.toporapula.dev
SKUD_BRIDGE_KEY=<same key used by bridge and EA>
SKUD_DEFAULT_MENTOR_ID=mentor-skud-01
SKUD_ALLOW_DEMO_STUDENT_ENROLLMENT=true
SKUD_ALLOW_LIVE_STUDENT_ACCOUNTS=false
SKUD_MENTOR_SETUP_CODE=<separate long random operator code>
```

Never enable live student accounts for this pilot. The bridge key is server-only;
student account submissions are controlled by the enrollment and live-account
flags above. Add user authentication and per-account approval before opening
enrollment to the public.

## 5. Start the SkuD services

Allow inbound HTTP and HTTPS in Windows Firewall if the VPS firewall does not
already allow them:

```powershell
New-NetFirewallRule -DisplayName "SkuD Caddy HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
New-NetFirewallRule -DisplayName "SkuD Caddy HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
```

Then start both services from the uploaded folder:

```powershell
Set-Location C:\skud\final
.\start-all.ps1
```

Keep the Caddy and bridge windows open. The master terminal is a template only;
leave it closed while student slots are operating. Do not run `start-all.ps1` a
second time while services are already running.

Run the read-only audit at any time:

```powershell
Set-Location C:\skud\final
.\audit-vps.ps1
```

## 6. Register the mentor and test a demo student

After the bridge health check succeeds, register the mentor through the
protected `POST /api/admin/mentors` route using `SKUD_MENTOR_SETUP_CODE`. The
The Mentor EA uses the platform `SKUD_BRIDGE_KEY`; managed terminals receive it
automatically. For a manually managed terminal, enter the same key in the EA's
`BridgeKey` input. Compile the Mentor EA and allow WebRequest to
`https://skud.toporapula.dev` in MT5.

Enable demo enrollment only after mentor registration and the student EA/chart
template are ready. Submit a Deriv demo login, trading password, and server from
the website. The dashboard should show the actual
login/server and wait for a matching EA heartbeat before reporting connected.
Verify the test account and copied trades in MT5 before inviting anyone else.

Run bridge regression tests from this folder:

```powershell
python -m unittest discover -s . -p test_bridge.py -v
```

## 7. Mentor-hosted terminal (optional)

Instead of running the Mentor EA on the mentor's laptop, the bridge can host the
mentor's MT5 account in its own provisioned terminal slot. Register (or update)
the mentor with a trading password:

```powershell
Invoke-RestMethod -Method Post https://skud.toporapula.dev/v1/mentors `
  -Headers @{ Authorization = "Bearer $key" } -ContentType "application/json" `
  -Body (@{
    mentor_id = "mentor-skud-01"; mentor_name = "SkudTurbo";
    login = "987654"; server = "OtherBroker-Demo"; password = "<mt5 password>"
  } | ConvertTo-Json)
```

When `password` is present (empty or 6-128 characters) the bridge:

1. Claims a terminal slot (`SKUD_TERMINAL_MASTER` clone or a free slot, exactly
   like student provisioning) and upserts an `accounts` row with
   `role='mentor'` and `mentor_id` pointing at the mentor.
2. Installs the Mentor EA (`SKUD_MENTOR_EA_SOURCE`) and the mentor chart
   template (`SKUD_MENTOR_CHART_TEMPLATE`), rewriting `BridgeKey=`
   (`SKUD_BRIDGE_KEY`), `MentorId=`,
   and `MentorName=` inside the copied `.chr` (UTF-16 aware, same as the
   student `EaToken` rewrite).
3. Launches the terminal with `startup.ini` auto-login and returns a
   `terminal` field (`"launched"`, warnings, or `"failed: ..."`) in the JSON
   response.

The mentor then trades on that VPS terminal; the Mentor EA publishes events as
usual and never copies to its own account (fan-out skips the source login).

## 8. Copy scaling and account management

Every follower account carries a `volume_multiplier` (0.01-100, default 1) and
a `role` (`student`, default, or `mentor`). When a mentor open event fans out,
each follower's order volume is `event volume x multiplier`, then clamped and
step-rounded using the volume_min/volume_max/volume_step that follower's
terminal last reported for the symbol (via `POST /v1/prices`); with no report
the volume is clamped to [0.01, 100].

Additional endpoints (all require the bridge key except where noted):

- `GET /v1/accounts` — every account now also returns `mentor_id`,
  `volume_multiplier`, and `role`.
- `POST /v1/accounts` — accepts optional `role` and `volume_multiplier`.
- `POST /v1/accounts/<login>/mentor` — body `{mentor_id, volume_multiplier?}`.
  Assigns the account to a mentor (404 on unknown account or mentor) or clears
  the assignment with `"mentor_id": ""`. `volume_multiplier` is updated only
  when provided.
- `GET /v1/mentors` — every mentor with an `active_followers` count, ordered by
  creation time.
- `GET /v1/mentors/<id>` — the mentor row (no `token_hash`), its follower list
  (`login`, `server`, `is_active`, `volume_multiplier`, `role`, plus terminal
  `connected`/`last_seen`/`balance`/`currency` via a LEFT JOIN on
  `terminal_status`), and the latest 50 `trade_events`.
- `GET /v1/prices?login=<login>` — price rows filtered to one account (exact
  match, same row shape as the unfiltered list).

## Security and limitations

- MT5 passwords are stored in plaintext in `data\skud.sqlite3` and slot
  `startup.ini` files. This is demo-only until encryption at rest, user
  authentication, rate limiting, and access controls are implemented.
- The bridge response means a command was accepted, not that a broker executed
  it. Confirm fills and account state in MT5.
- Copy support currently covers market opens and full closes, with per-follower
  lot scaling (`volume_multiplier`, clamped to the broker's reported
  volume_min/max/step). Symbol mapping, pending order changes, partial closes,
  and SL/TP modifications are not implemented.
- Student EA symbol coverage (build 8.10) is the full Deriv forex/metals list —
  30 symbols from EURUSD through XAGUSD. Deriv synthetic indices are still
  excluded from copy trading.
- Do not share bridge keys, mentor tokens, or MT5 passwords.
