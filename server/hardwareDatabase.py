# hardware operations handling

from db import db

hardware_collection = db["hardware"]


def get_all_hardware():
    """Return all hardware sets with capacity and availability."""
    hardware_list = []
    for hw in hardware_collection.find():
        hardware_list.append({
            "id": str(hw["_id"]),
            "name": hw["name"],
            "capacity": hw["capacity"],
            "available": hw["available"]
        })
    return hardware_list


def checkout_hardware(name, quantity):
    """Decrease available count for a hardware set by quantity, if enough is available."""
    hw = hardware_collection.find_one({"name": name})
    if not hw:
        return False, "Hardware set not found"

    if hw["available"] < quantity:
        return False, "Not enough available units"

    hardware_collection.update_one(
        {"name": name},
        {"$inc": {"available": -quantity}}
    )
    return True, "Checkout successful"


def checkin_hardware(name, quantity):
    """Increase available count for a hardware set by quantity, capped at capacity."""
    hw = hardware_collection.find_one({"name": name})
    if not hw:
        return False, "Hardware set not found"

    new_available = min(hw["capacity"], hw["available"] + quantity)

    hardware_collection.update_one(
        {"name": name},
        {"$set": {"available": new_available}}
    )
    return True, "Check-in successful"