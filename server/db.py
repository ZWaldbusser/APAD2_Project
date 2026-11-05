"""
db.py

Single source of truth for the MongoDB connection.

The connection string lives in the .env file (see .env.example) under the
key MONGO_URI. Every *Database.py module imports `db` from here instead of
creating its own client, so the connection is configured in exactly one place.
"""

from pymongo import MongoClient
from dotenv import load_dotenv
from pathlib import Path
import certifi
import os

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

MONGO_URI = os.getenv("MONGO_URI")


class _UnavailableCollection:
    def __getattr__(self, name):
        raise RuntimeError(
            "MongoDB is not configured. Set MONGO_URI to use users and projects."
        )


class _UnavailableDatabase:
    name = "unavailable"

    def __getitem__(self, name):
        return _UnavailableCollection()


if not MONGO_URI:
    client = None
    db = _UnavailableDatabase()
else:
   # serverSelectionTimeoutMS makes a bad connection fail fast (5s) instead of
   # hanging for the default 30s on the first query.
    client = MongoClient(
        MONGO_URI,
        serverSelectionTimeoutMS=5000,
        tlsCAFile=certifi.where()
    )

   # NOTE: database names in MongoDB are case-sensitive. This must exactly
   # match the database shown in Atlas / Compass ("Haas_db").
    db = client["Haas_db"]


def ping():
    """Raise if the database is unreachable; return True on success."""
    if client is None:
        raise RuntimeError(
            "MongoDB is not configured. Set MONGO_URI to use users and projects."
        )
    client.admin.command("ping")
    return True