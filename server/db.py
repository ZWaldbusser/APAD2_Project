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
if not MONGO_URI:
    raise RuntimeError(
        "MONGO_URI is not set. Create a .env file in the project root "
    )

# serverSelectionTimeoutMS makes a bad connection fail fast (5s) instead of
# hanging for the default 30s on the first query.
client = MongoClient(
    MONGO_URI,
    serverSelectionTimeoutMS=5000,
    tlsCAFile=certifi.where()
)

# NOTE: database names in MongoDB are case-sensitive. This must exactly match
# the database shown in Atlas / Compass ("Haas_db")
db = client["Haas_db"]


def ping():
    """Raise if the database is unreachable; return True on success."""
    client.admin.command("ping")
    return True