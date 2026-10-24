#!/usr/bin/env python3
"""
Baari — scripts/backup.py
Copies the SQLite database file to backups/ with a timestamp.
Safe to run while the server is running (SQLite WAL mode handles this).

Run:  python -m scripts.backup
"""

import os
import sys
import shutil
import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings


def backup():
    # Extract the file path from the database URL
    db_url = settings.database_url
    if not db_url.startswith("sqlite"):
        print("Backup script only supports SQLite. For PostgreSQL, use pg_dump.")
        sys.exit(1)

    # sqlite:///./baari.db -> ./baari.db
    db_path = db_url.replace("sqlite:///", "")
    if not os.path.exists(db_path):
        print(f"ERROR: Database file not found: {db_path}")
        sys.exit(1)

    # Create backups directory
    backup_dir = os.path.join(os.path.dirname(db_path) or ".", "backups")
    os.makedirs(backup_dir, exist_ok=True)

    # Generate timestamped filename
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    db_name = os.path.basename(db_path).replace(".db", "")
    backup_path = os.path.join(backup_dir, f"{db_name}_{timestamp}.db")

    # Copy the database file
    shutil.copy2(db_path, backup_path)

    # Also copy WAL and SHM files if they exist (ensures consistent backup)
    for suffix in ["-wal", "-shm"]:
        wal_path = db_path + suffix
        if os.path.exists(wal_path):
            shutil.copy2(wal_path, backup_path + suffix)

    file_size = os.path.getsize(backup_path) / 1024  # KB
    print(f"Backup created: {backup_path} ({file_size:.1f} KB)")


if __name__ == "__main__":
    backup()
