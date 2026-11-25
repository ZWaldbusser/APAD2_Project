"""MongoDB connection for gateway snapshots, never local accounts."""
import os

import certifi
from pymongo import MongoClient

import config  # Loads the project .env before reading connection settings.

uri = os.getenv("MONGO_URI", "").strip()
client = MongoClient(
    uri,
    serverSelectionTimeoutMS=5000,
    connectTimeoutMS=5000,
    socketTimeoutMS=5000,
    tlsCAFile=certifi.where(),
) if uri else None


def ping():
    if client is None:
        raise RuntimeError("MongoDB snapshots are not configured. Set MONGO_URI.")
    client.admin.command("ping")
    return True
