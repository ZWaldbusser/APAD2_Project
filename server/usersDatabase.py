#Handles the MongoDB connection and all operations related to the "users" collection

from db import db
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError
from bson import ObjectId

password_hasher = PasswordHasher()
users_collection = db["users"]


def create_user(userid, password):
    """Insert a new user document. Hashes password using Argon2.
    Returns the inserted id as a string."""
    existing = users_collection.find_one({"userid": userid})
    if existing:
        return None

    new_user = {
        "userid": userid,
        "password": password_hasher.hash(password)  # hash the password before storing
    }
    result = users_collection.insert_one(new_user)
    return str(result.inserted_id)


def find_user_by_userid(userid):
    """Return a single user document matching the userid, or None."""
    return users_collection.find_one({"userid": userid})


def verify_login(userid, password):
    """Returns the user's id as a string if valid, else None."""
    user = find_user_by_userid(userid)

    if not user:
        return None

    try:
        password_hasher.verify(user.get("password"), password)
        return str(user["_id"])
    except VerifyMismatchError:     # incorrect password
        return None
    except InvalidHashError:        # stored value is not a valid Argon2 hash, likely old plaintext user
        return None
    except VerificationError:       # Argon2 verification failed for another verification-related reason
        return None


def forgot_password(userid, password):
    """Update an existing user's password with a new Argon2 hash."""
    user = find_user_by_userid(userid)
    if not user:
        return False

    result = users_collection.update_one(
        {'userid': userid},
        {'$set': {'password': password_hasher.hash(password)}}
    )

    return result.modified_count > 0       # checks whether MongoDB actually changed a document


def get_all_users():
    """Return all users, excluding password field."""
    users = []
    for user in users_collection.find():
        users.append({
            "id": str(user["_id"]),
            "userid": user["userid"]
        })
    return users


def find_user_by_id(user_id):
    """Return a single user document matching the MongoDB _id, or None."""
    try:
        return users_collection.find_one({"_id": ObjectId(user_id)})
    except Exception:
        return None