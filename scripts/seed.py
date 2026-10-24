#!/usr/bin/env python3
"""
Baari — scripts/seed.py
Seeds the database with:
- First Admin user from .env (admin / BaariAdmin@2024)
- 4 Hospital Departments (General Medicine, Orthopedics, Gynecology, Pediatrics)
- 8 Doctors (2 per department, active)
- 4 Demo Staff Accounts (staff_g, staff_o, staff_y, staff_p / StaffPass@2024)
- Realistic seed patients and tokens for today (waiting, called, done, priority)
- Initial settings and audit log entries
"""

import os
import sys
import datetime
from argon2 import PasswordHasher

# Allow running from root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from app.database import engine, SessionLocal, Base
from app.models import Department, Doctor, User, Patient, Token, ServiceLog, Setting, AuditLog
from app.security import hash_pin

ph = PasswordHasher()


def seed():
    admin_username = os.environ.get("ADMIN_USERNAME", "admin")
    admin_password = os.environ.get("ADMIN_PASSWORD", "BaariAdmin@2024")

    # Create tables
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # Check if already seeded
        existing_admin = db.query(User).filter(User.username == admin_username).first()
        if existing_admin:
            print(f"ℹ️  Admin user '{admin_username}' already exists. Skipping seed.")
            return

        print("🏥 Seeding Baari database...")

        # ── 1. Departments ──────────────────────────────────────────────────
        dept_specs = [
            {"name": "General Medicine", "code": "G", "avg_service_minutes": 8.0},
            {"name": "Orthopedics", "code": "O", "avg_service_minutes": 10.0},
            {"name": "Gynecology", "code": "Y", "avg_service_minutes": 12.0},
            {"name": "Pediatrics", "code": "P", "avg_service_minutes": 7.0},
        ]
        departments = {}
        for d in dept_specs:
            dept = Department(**d)
            db.add(dept)
            db.flush()
            departments[dept.code] = dept
            print(f"  ✓ Department: {dept.name} ({dept.code})")

        # ── 2. Doctors ──────────────────────────────────────────────────────
        doc_specs = {
            "G": ["Dr. Ananya Sharma", "Dr. Rajesh Patil"],
            "O": ["Dr. Vikram Verma", "Dr. Sunita Deshmukh"],
            "Y": ["Dr. Meera Gupta", "Dr. Pooja Joshi"],
            "P": ["Dr. Amit Singh", "Dr. Kavita Kulkarni"],
        }
        doctors = {}
        for code, doc_list in doc_specs.items():
            doctors[code] = []
            for doc_name in doc_list:
                doc = Doctor(name=doc_name, department_id=departments[code].id, active=True)
                db.add(doc)
                db.flush()
                doctors[code].append(doc)
                print(f"  ✓ Doctor: {doc.name} -> {departments[code].name}")

        # ── 3. Admin User ───────────────────────────────────────────────────
        admin = User(
            username=admin_username,
            password_hash=ph.hash(admin_password),
            role="admin",
            department_id=None,
            active=True,
            must_change_password=False,
            failed_logins=0,
            created_at=datetime.datetime.now(datetime.UTC),
        )
        db.add(admin)
        db.flush()
        print(f"\n  ✓ Admin created: username='{admin_username}', password='{admin_password}'")

        # ── 4. Staff Users ──────────────────────────────────────────────────
        staff_default_password = "StaffPass@2024"
        print(f"  ✓ Staff password for all demo accounts: '{staff_default_password}'")
        staff_users = {}
        for code, dept in departments.items():
            username = f"staff_{code.lower()}"
            staff = User(
                username=username,
                password_hash=ph.hash(staff_default_password),
                role="staff",
                department_id=dept.id,
                active=True,
                must_change_password=False,
                failed_logins=0,
                created_at=datetime.datetime.now(datetime.UTC),
            )
            db.add(staff)
            db.flush()
            staff_users[code] = staff
            print(f"    - {username:10s} -> {dept.name}")

        # ── 5. Settings ─────────────────────────────────────────────────────
        default_settings = [
            ("arrival_buffer_minutes", "15"),
            ("reminder_threshold_minutes", "20"),
            ("no_show_grace_minutes", "5"),
        ]
        for key, val in default_settings:
            db.add(Setting(key=key, value=val))

        # ── 6. Seed Realistic Tokens For Today ──────────────────────────────
        today = datetime.date.today()
        now_dt = datetime.datetime.now(datetime.UTC)

        sample_tokens = [
            # General Medicine (G)
            ("G", "Ramesh Kumar", "9876543210", "hi", "done", "normal", None, 95, 80, 72),
            ("G", "Sunita Devi", "9823456789", "hi", "done", "normal", None, 80, 65, 55),
            ("G", "Rahul Verma", "9911223344", "en", "called", "normal", None, 45, 10, None),
            ("G", "Gopal Das", "9123456780", "hi", "waiting", "priority", "Elderly citizen (76 yrs)", 35, None, None),
            ("G", "Pooja Patil", "9834567812", "mr", "waiting", "normal", None, 25, None, None),
            ("G", "Mohammad Arif", "9765432109", "hi", "waiting", "normal", None, 15, None, None),
            ("G", "Deepak Joshi", "9845123456", "en", "waiting", "normal", None, 5, None, None),

            # Orthopedics (O)
            ("O", "Suresh Yadav", "9898989898", "hi", "done", "normal", None, 70, 50, 40),
            ("O", "Anita Deshmukh", "9786543210", "mr", "called", "priority", "Acute joint dislocation", 40, 5, None),
            ("O", "Vikas Shinde", "9654321987", "mr", "waiting", "normal", None, 30, None, None),
            ("O", "Kiran More", "9543210987", "en", "waiting", "normal", None, 18, None, None),

            # Gynecology (Y)
            ("Y", "Priyanka Sharma", "9871234560", "hi", "done", "normal", None, 85, 60, 48),
            ("Y", "Kavita Gaikwad", "9819819819", "mr", "waiting", "priority", "Third trimester checkup", 35, None, None),
            ("Y", "Aarti Nair", "9730123456", "en", "waiting", "normal", None, 12, None, None),

            # Pediatrics (P)
            ("P", "Aarav Gupta (Baby)", "9867001122", "hi", "done", "normal", None, 60, 45, 38),
            ("P", "Isha Kulkarni (Infant)", "9922334455", "mr", "called", "emergency", "High fever & breathlessness", 25, 8, None),
            ("P", "Rohan Mane", "9811223344", "mr", "waiting", "normal", None, 14, None, None),
        ]

        token_seq_counters = {code: 1 for code in departments.keys()}

        for (code, p_name, phone, lang, status, p_class, p_reason, created_ago, called_ago, finished_ago) in sample_tokens:
            dept = departments[code]
            t_num = token_seq_counters[code]
            token_seq_counters[code] += 1

            p = Patient(name=p_name, phone=phone, language=lang)
            db.add(p)
            db.flush()

            created_time = now_dt - datetime.timedelta(minutes=created_ago)
            called_time = (now_dt - datetime.timedelta(minutes=called_ago)) if called_ago is not None else None
            finished_time = (now_dt - datetime.timedelta(minutes=finished_ago)) if finished_ago is not None else None

            # Deterministic demo pin: '1234'
            pin = "1234"
            pin_h = hash_pin(pin)

            tok = Token(
                number=t_num,
                service_date=today,
                department_id=dept.id,
                patient_id=p.id,
                priority_class=p_class,
                priority_reason=p_reason,
                status=status,
                pin_hash=pin_h,
                issued_by_user_id=staff_users[code].id if status == "waiting" and t_num % 2 == 0 else None,
                created_at=created_time,
                called_at=called_time,
                finished_at=finished_time,
            )
            db.add(tok)
            db.flush()

            # Add ServiceLog for called or done tokens
            if called_time and doctors[code]:
                assigned_doc = doctors[code][0]
                s_log = ServiceLog(
                    token_id=tok.id,
                    doctor_id=assigned_doc.id,
                    started_at=called_time,
                    ended_at=finished_time,
                )
                db.add(s_log)

        # ── 7. Audit Log Sample Entries ─────────────────────────────────────
        db.add(
            AuditLog(
                timestamp=now_dt - datetime.timedelta(hours=2),
                actor_user_id=admin.id,
                actor_role="admin",
                action="system_seed",
                details='{"event": "System initialized with seed data"}',
            )
        )

        db.commit()
        print("\n✅ Seed completed successfully with ready-to-test data!")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("🔑 TEST CREDENTIALS:")
        print(f"   • Admin: {admin_username} / {admin_password}")
        print(f"   • Staff: staff_g, staff_o, staff_y, staff_p / {staff_default_password}")
        print("   • Patient Token Lookup Demo PIN: 1234 (e.g. Token 'G-04', PIN '1234')")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")

    except Exception as e:
        db.rollback()
        print(f"❌ Seed failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    seed()
