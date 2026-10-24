# 🏥 Baari (बारी) — Hospital OPD Queue Management System

> **"Come at your time, not at 4 AM."**
>
> Built for **Hacktoberfest '26 Hack Day** — Track 1: Best Open-Source AI Project
>
> [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![Python 3.11+](https://img.shields.io/badge/Python-3.11%2B-green.svg)](https://www.python.org/) [![Tests: 21 passed](https://img.shields.io/badge/tests-21%20passed-brightgreen.svg)](#-running-tests)

---

## 📌 The Problem

At government hospitals across India (AIIMS, Safdarjung, KEM, Civil Hospitals), thousands of patients arrive between **3 AM and 5 AM** to stand in pre-dawn queues just to get an Out-Patient Department (OPD) token.

Existing apps and QR systems exclude:
- People without smartphones or internet access
- Illiterate or semi-literate rural patients
- Patients who speak regional languages (Hindi, Marathi)

Result: **4–6 hours of exhausting waits** in packed halls, severe crowd hazards, and high cross-infection risk.

---

## 💡 The Solution

**Baari** ("turn/बारी" in Hindi/Marathi) is a lightweight, accessible OPD queue system:

1. **Multi-lingual voice + kiosk** — patients get a token by speaking in Hindi, Marathi, or English, or by typing. No smartphone app required.
2. **Predicted arrival windows** — each patient gets a personalized "arrive by" time (e.g. *10:15 AM*) based on real-time queue depth and EMA-updated doctor consultation times.
3. **Offline AI core** — voice recognition (faster-whisper) and TTS (edge-tts) run fully locally; no audio ever leaves the server.
4. **OPD simulation** — integrated discrete-event model proves Baari cuts waiting-hall congestion by **>70%**.
5. **Live QR poster generator** — hospitals print counter QR codes; patients scan to register from home.

---

## 🏗️ Tech Stack

### Backend

| Component | Technology |
|---|---|
| Framework | [FastAPI](https://fastapi.tiangolo.com/) (Python 3.11+) |
| Database | SQLite with WAL mode via [SQLAlchemy 2.x](https://www.sqlalchemy.org/) |
| Migrations | [Alembic](https://alembic.sqlalchemy.org/) |
| Password hashing | [argon2-cffi](https://argon2-cffi.readthedocs.io/) (Argon2id) |
| Session security | CSRF double-submit tokens, HttpOnly session cookies |
| Voice STT | [faster-whisper](https://github.com/SYSTRAN/faster-whisper) (`small` model, CTranslate2 int8) with browser Web Speech API fallback |
| Voice TTS | [edge-tts](https://github.com/rany2/edge-tts) (`hi-IN-SwaraNeural`, `mr-IN-AarohiNeural`, `en-IN-NeerjaNeural`) with browser SpeechSynthesis fallback |
| Intent parsing | Deterministic multilingual keyword regex (Hindi / Marathi / English) |
| Server | [Uvicorn](https://www.uvicorn.org/) ASGI |

### Frontend

| Component | Technology |
|---|---|
| UI | Zero-build HTML5 + Vanilla JS + CSS3 (no build step) |
| Design system | Custom glassmorphism design, dark/light/high-contrast themes |
| Charts | [Chart.js 4.4](https://www.chartjs.org/) (vendored locally) |
| QR generation | [qrcode.js](https://davidshimjs.github.io/qrcodejs/) (vendored) |
| QR scanning | [jsQR](https://github.com/cozmo/jsQR) (vendored) |
| i18n | Custom EN / हिंदी / मराठी translation layer |

---

## 📁 Folder Structure

```
baari/
├── app/                    # FastAPI application
│   ├── main.py             # App entry point, middleware, SPA fallback
│   ├── models.py           # SQLAlchemy ORM (8 tables)
│   ├── schemas.py          # Pydantic request/response schemas
│   ├── config.py           # Settings via pydantic-settings + .env
│   ├── database.py         # Engine, session factory
│   ├── dependencies.py     # Auth, CSRF, role enforcement
│   ├── security.py         # Argon2id, PIN, session, CSRF tokens
│   ├── audit.py            # Immutable audit log writer
│   ├── queue_logic.py      # EMA, wait estimate, capacity recs
│   ├── simulation.py       # Discrete-event OPD crowd simulator
│   ├── routers/
│   │   ├── auth.py         # Login, logout, /me, change-password
│   │   ├── patient.py      # Token request, lookup, TTS, STT
│   │   ├── staff.py        # Queue board, call-next, done, no-show
│   │   ├── admin.py        # Users, departments, doctors, audit, KPIs
│   │   └── simulation.py   # Simulation API endpoint
│   └── voice/
│       ├── stt.py          # faster-whisper transcription
│       ├── tts.py          # edge-tts speech synthesis + cache
│       └── intent.py       # Multilingual intent & entity parser
├── static/
│   ├── index.html          # Single-page application shell (all 6 views)
│   ├── css/
│   │   └── style.css       # Full design system (dark/light/HC themes)
│   └── js/
│       ├── app.js          # Router, auth, audio, theme, live clock
│       ├── patient.js      # Kiosk, QR scanner, token tracker
│       ├── staff.js        # Queue board, call-next, doctor toggles
│       ├── display.js      # Waiting hall TV display board
│       ├── qrhub.js        # QR poster generator & printer
│       ├── simulation.js   # Simulation UI + Chart.js rendering
│       ├── admin.js        # Admin KPIs, users, audit log
│       ├── i18n.js         # EN / हिंदी / मराठी translations
│       ├── chart.min.js    # Chart.js (vendored)
│       ├── qrcode.min.js   # QRCode.js (vendored)
│       └── jsqr.min.js     # jsQR (vendored)
├── scripts/
│   ├── seed.py             # Seed departments, doctors, staff accounts
│   └── backup.py           # Atomic SQLite snapshot to backups/
├── tests/
│   ├── conftest.py         # In-memory test DB fixtures
│   ├── test_auth.py        # Login, lockout, CSRF, role isolation
│   ├── test_tokens.py      # Token request, PIN, sequential numbers
│   ├── test_queue.py       # Wait estimates, EMA, capacity recs
│   ├── test_priority.py    # Priority ordering, emergency triage
│   ├── test_simulation.py  # Sim reproducibility, crowd reduction
│   └── test_voice.py       # TTS endpoint, email+priority flow
├── alembic/                # DB migration scripts
├── models/                 # AI model weights directory (gitignored)
├── backups/                # Timestamped DB backups (gitignored)
├── .env.example            # Environment variable template
├── requirements.txt        # Pinned Python dependencies
├── alembic.ini             # Alembic configuration
└── LICENSE                 # MIT License
```

---

## 🚀 Quick Start

### Prerequisites
- Python 3.11 or newer
- `pip` / virtual environment tool

### 1. Clone & install

```bash
git clone https://github.com/your-username/baari.git
cd baari

python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

pip install -r requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env if needed — defaults work for local development
```

### 3. Initialize database

```bash
# Apply schema migrations
alembic upgrade head

# Seed 4 departments, 8 doctors, 5 staff accounts
python3 -m scripts.seed
```

### 4. Run

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Open **http://localhost:8000** in your browser.

---

## 🔑 Demo Accounts

| Role | Username | Password | Scope |
|---|---|---|---|
| Administrator | `admin` | `BaariAdmin@2024` | Full control — KPIs, users, audit log |
| Staff — General Medicine | `staff_g` | `StaffPass@2024` | General Medicine queue only |
| Staff — Orthopedics | `staff_o` | `StaffPass@2024` | Orthopedics queue only |
| Staff — Gynecology | `staff_y` | `StaffPass@2024` | Gynecology queue only |
| Staff — Pediatrics | `staff_p` | `StaffPass@2024` | Pediatrics queue only |

> Tokens each get a **random 4-digit PIN** shown once at generation. Use it on the "Track Your Turn" tab to check live queue status.

The quick-login pills at the top of the page let you sign in with one click.

---

## ✨ Features

### Patient Kiosk & QR
- 🎤 Voice token request in Hindi, Marathi, or English (browser Web Speech + faster-whisper fallback)
- 📝 Manual form with priority triage (Normal / Priority / Emergency)
- 📱 Live camera QR scanner + image upload for hospital counter QR codes
- 🗺️ Travel-time slider — adjusts "arrive by" time to your commute distance
- 📍 Live turn tracker — pin + token lookup, real-time queue position & wait estimate

### Staff Console
- 📋 Live queue board with priority badges and wait estimates
- 📢 "Call Next" with automatic hospital chime and service timer
- ➕ Walk-in token issuance with priority override
- 🩺 Doctor availability toggle (active/away) — instantly recalculates all wait estimates
- ⚠️ Capacity warning when queue load exceeds 6 patients per active doctor

### Waiting Hall TV Display
- 📺 Large-format board showing currently-called tokens and next-up queue
- 🔊 Automatic voice announcements via neural TTS

### Hospital QR Poster Hub
- 🖨️ Generates A4-printable OPD registration QR posters
- Configurable per counter (hospital name, facility code, department routing)
- Download PNG or copy scan URL

### OPD Simulation
- 📊 Discrete-event simulation: baseline 4 AM rush vs. Baari staggered arrival
- Adjustable sliders: patients/day (20–300), doctor counters (1–8), adherence (10%–100%)
- Reproducible (seed=42), Gaussian consultation times (μ=8 min, σ=2.5 min)

### Admin Control Center
- 📈 Daily KPIs: patients served, average & longest wait, peak hour, no-show rate
- 👥 Staff account management: create, toggle, reset password
- 🛡️ Immutable security audit log (all actions logged with actor, role, timestamp)
- 🔄 Queue reset for demo/testing

---

## 🔒 Security

- **Argon2id** for all passwords and PINs
- **CSRF double-submit** on all state-changing endpoints
- **Account lockout** after 5 failed logins (10 min)
- **Generic error messages** — no username enumeration
- **HttpOnly session cookies** — no token in JS
- **Security headers** — CSP, X-Frame-Options, HSTS-ready
- **Department isolation** — staff can only see/act on their own queue

---

## 🧪 Running Tests

```bash
pytest -v
```

21 tests across 6 modules — all should pass in under 2 seconds:

```
tests/test_auth.py       — login, lockout, CSRF, role isolation     (6 tests)
tests/test_tokens.py     — token request, PIN, sequential numbers    (3 tests)
tests/test_queue.py      — wait estimates, EMA, capacity recs        (5 tests)
tests/test_priority.py   — priority ordering, emergency first        (2 tests)
tests/test_simulation.py — reproducibility, crowd reduction          (2 tests)
tests/test_voice.py      — TTS endpoint, email + priority flow       (3 tests)
```

---

## ⚙️ Configuration

All settings are in `.env` (see `.env.example` for the full list):

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./baari.db` | SQLite path (or PostgreSQL URL) |
| `SECRET_KEY` | `CHANGE-ME-IN-PRODUCTION` | Session & CSRF signing key |
| `PORT` | `8000` | Server port |
| `ARRIVAL_BUFFER_MINUTES` | `15` | Buffer before patient's estimated turn |
| `MAX_FAILED_LOGINS` | `5` | Attempts before account lockout |
| `LOCKOUT_MINUTES` | `10` | Duration of lockout |
| `SESSION_EXPIRY_HOURS` | `8` | Staff session lifetime |
| `WHISPER_MODEL_SIZE` | `small` | faster-whisper model size |

---

## 💾 Database Backup

```bash
python3 -m scripts.backup
```

Creates a timestamped atomic snapshot in `backups/` (e.g. `baari_20261024_094500.db`).

---

## 🤝 Contributing

1. Fork the repo and create a feature branch
2. Run `pytest -v` — all 21 tests must pass
3. Follow the existing code style (type hints, docstrings on all public functions)
4. Open a pull request with a clear description

---

## 📄 License

MIT License — Copyright (c) 2026 Baari Contributors. See [LICENSE](LICENSE) for details.
