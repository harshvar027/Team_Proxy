# 🏥 Baari (बारी) — Hospital OPD Queue Management System

> **Tagline:** *"Come at your time, not at 4 AM."*  
> **Event:** Hacktoberfest '26 Hack Day — Track 1: Best Open-Source AI Project  
> **License:** [MIT](LICENSE)

---

## 📌 The Problem

At government hospitals across India (AIIMS, Safdarjung, KEM, Civil Hospitals, etc.), thousands of patients arrive between **3:00 AM and 5:00 AM** to stand in pre-dawn queues just to secure an Out-Patient Department (OPD) consultation token. 

Existing smartphone apps and QR-code systems exclude:
- People without smartphones or internet connectivity.
- Illiterate or semi-literate rural patients.
- Patients who speak regional languages (Hindi, Marathi, etc.).

As a result, patients endure **4 to 6 hours of exhausting waiting in packed halls**, creating severe crowd hazards and high cross-infection risks.

---

## 💡 The Solution

**Baari** ("turn" in Hindi) is a lightweight, accessible OPD queue management system:
1. **Multi-Lingual Voice & Kiosk Interface:** Patients obtain an OPD token simply by speaking in **Hindi (हिंदी)**, **Marathi (मराठी)**, or **English**, or by typing.
2. **Predicted Arrival Windows:** Instead of forcing everyone into the hospital at 5 AM, Baari gives each patient a deterministic predicted arrival window (e.g. *10:15 AM - 10:35 AM*) based on dynamic Exponential Moving Average (EMA) doctor consultation times and active counters.
3. **No App or Smartphone Required:** Works on kiosk browser screens, feature phones via SMS-ready architecture, or unauthenticated web browsers.
4. **Offline Local AI Core:** Voice recognition and text-to-speech run 100% on local hardware without sending patient audio to third-party clouds.
5. **Interactive OPD Simulation:** An integrated discrete-event simulation model proving how staggered arrival windows slash waiting hall congestion by **>70%**.

---

## 🏗️ Architecture & Open-Source AI Stack

| Component | Technology | License |
|---|---|---|
| **Backend Framework** | [FastAPI](https://fastapi.tiangolo.com/) (Python 3.11+) | MIT |
| **Database** | SQLite with WAL mode & foreign keys via [SQLAlchemy 2.x](https://www.sqlalchemy.org/) | MIT |
| **Migrations** | [Alembic](https://alembic.sqlalchemy.org/) | MIT |
| **Password & PIN Hashing** | [Argon2id](https://github.com/hynek/argon2-cffi) | MIT / Apache-2.0 |
| **Local Speech-to-Text (STT)** | `faster-whisper` (`Systran/faster-whisper-small`) on CTranslate2 with browser Web Speech API fallback | MIT |
| **Local Text-to-Speech (TTS)** | `piper-tts` with browser Web Speech synthesis fallback | MIT |
| **Intent & Entity Parsing** | Deterministic rule-based multi-lingual keyword parser (Hindi, Marathi, English) | MIT |
| **Frontend UI** | Zero-build HTML5, Vanilla JavaScript, CSS3 Design System | MIT |
| **Visual Charts** | [Chart.js 4.4](https://www.chartjs.org/) (vendored locally for offline use) | MIT |

---

## 🚀 Quick Start & Installation

### 1. Prerequisites
- Python 3.11+
- Virtual environment tool

### 2. Setup
```bash
git clone https://github.com/your-username/baari.git
cd baari

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Initialize & Seed Database
```bash
# Copy sample configuration if needed
cp .env.example .env

# Apply migrations
alembic stamp head

# Seed departments, doctors, demo staff, and realistic sample tokens
python3 -m scripts.seed
```

### 4. Run Development Server
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
Open **[http://localhost:8000](http://localhost:8000)** in your browser.

---

## 🔑 Demo Credentials

The seed script creates the following ready-to-test accounts:

| Role | Username | Password | Notes |
|---|---|---|---|
| **Administrator** | `admin` | `BaariAdmin@2024` | Full hospital control, audit log, KPI reports |
| **Staff (General Medicine)** | `staff_g` | `StaffPass@2024` | Locked to General Medicine OPD queue |
| **Staff (Orthopedics)** | `staff_o` | `StaffPass@2024` | Locked to Orthopedics OPD queue |
| **Staff (Gynecology)** | `staff_y` | `StaffPass@2024` | Locked to Gynecology OPD queue |
| **Staff (Pediatrics)** | `staff_p` | `StaffPass@2024` | Locked to Pediatrics OPD queue |
| **Patient Demo PIN** | *Token e.g.* `G-04` | `1234` | Enter token & PIN in live tracker |

> ⚡ **Tip:** You can also click the quick-login pills at the top of the webpage for instant 1-click evaluation!

---

## 🧪 Running Automated Tests

Run the complete 18-test pytest suite:
```bash
pytest -v
```

All tests pass including:
- Queue ordering & deterministic priority sorting (Emergency > Priority > Normal)
- Wait time estimation & "Come now" thresholds
- Exponential Moving Average (EMA) consultation duration updates
- Argon2id password security, account lockout, and CSRF enforcement
- Discrete-event simulation reproducibility and crowd reduction verification

---

## 💾 Database Backup & Maintenance

Create an atomic, timestamped snapshot of the live SQLite database:
```bash
python3 -m scripts.backup
```
Backups are placed in the `backups/` directory.

---

## 📜 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
