"""Client for the hardware microservice."""

from hardware import client as hardware_grpc
from hardware import hardware_pb2 as messages

def _hardware_to_dict(item):
    return {
        "_id": item.id,
        "id": item.id,
        "name": item.name,
        "category": item.category,
        "description": item.description,
        "asset_tag": item.asset_tag,
        "serial": item.serial,
        "status": item.status,
        "total": item.total,
        "reserved": item.reserved,
        "out": item.out,
        "version": item.version,
        "available": item.available,
        "unallocated": item.unallocated,
    }


def _allocation_to_dict(item):
    return {
        "id": item.id,
        "hardware_id": item.hardware_id,
        "project_id": item.project_id,
        "quantity": item.quantity,
        "out": item.out,
        "version": item.version,
    }


def _page_value(params, name, default):
    try:
        return int(params.get(name, default))
    except (TypeError, ValueError):
        return default


def get_all_hardware(params=None):
    """Return hardware pools from the gRPC ListHardware endpoint."""
    params = params or {}
    page = max(_page_value(params, "page", 1), 1)
    size = max(_page_value(params, "size", 100), 1)
    request = messages.ListHardwareRequest(page=page, size=size)
    for field in ("q", "status", "category"):
        value = params.get(field)
        if value:
            setattr(request, field, value)
    result = hardware_grpc.call("ListHardware", request)
    return {
        "items": [_hardware_to_dict(item) for item in result.items],
        "total": result.total,
        "page": result.page,
        "size": result.size,
    }


def get_allocations(params=None):
    """Return project allocations from the gRPC ListAllocations endpoint."""
    params = params or {}
    page = max(_page_value(params, "page", 1), 1)
    size = max(_page_value(params, "size", 100), 1)
    request = messages.ListAllocationsRequest(page=page, size=size)
    project_id = params.get("project_id", params.get("projectId"))
    hardware_id = params.get("hardware_id", params.get("hardwareId"))
    if project_id:
        request.project_id = project_id
    if hardware_id:
        request.hardware_id = hardware_id
    result = hardware_grpc.call("ListAllocations", request)
    return 200, {
        "items": [_allocation_to_dict(item) for item in result.items],
        "total": result.total,
        "page": result.page,
        "size": result.size,
    }


def get_outstanding_checkouts(project_id, user_id, params):
    """Read only the verified actor's quantity records for a validated project."""
    result = hardware_grpc.call("ListCheckouts", messages.ListCheckoutsRequest(
        project_id=project_id, user_id=str(user_id), outstanding=True,
        page=max(_page_value(params, "page", 1), 1),
        size=max(_page_value(params, "size", 100), 1),
    ))
    items = []
    for item in result.items:
        if (item.project_id != project_id or item.user_id != str(user_id)
                or not item.id or not item.hardware_id
                or not 0 <= item.returned <= item.quantity):
            raise hardware_grpc.HardwareServiceError("Checkout context could not be verified", 502)
        items.append({"id": item.id, "hardware_id": item.hardware_id,
                      "project_id": item.project_id, "quantity": item.quantity,
                      "returned": item.returned, "outstanding": item.quantity - item.returned,
                      "created_at": item.created_at.ToJsonString() if item.HasField("created_at") else None})
    return 200, {"items": items, "total": result.total, "page": result.page, "size": result.size}


def get_availability(hardware_id):
    """Expose the existing Hardware availability/vendor contract without ranking."""
    result = hardware_grpc.call("GetAvailability", messages.GetHardwareRequest(hardware_id=hardware_id))
    if result.hardware.id != hardware_id:
        raise hardware_grpc.HardwareServiceError("Hardware context could not be verified", 502)
    alternatives = []
    for item in result.alternatives:
        row = {key: getattr(item, key) for key in
               ("source_unit", "vendor", "commodity", "department", "business_line", "category")}
        for key in ("quantity", "unit_price", "payment_amount", "monthly_charges"):
            if item.HasField(key):
                row[key] = getattr(item, key)
        alternatives.append(row)
    return 200, {"hardware": _hardware_to_dict(result.hardware),
                 "availability": result.availability, "alternatives": alternatives,
                 "alternative_lookup_status": result.alternative_lookup_status or None}


def set_allocation(hardware_id, project_id, data):
    """Set a project's allocation through the gRPC AllocateHardware endpoint."""
    result = hardware_grpc.call("AllocateHardware", messages.AllocateHardwareRequest(
        hardware_id=hardware_id,
        project_id=project_id,
        expected_version=data["expected_version"],
        quantity=data["quantity"],
        reason=data["reason"],
    ))
    return 200, _hardware_to_dict(result)


def checkout_hardware(name, quantity, project_id, user_id, hardware_id=None):
    hardware = hardware_grpc.find_hardware(name) if not hardware_id else None
    if not hardware_id and not hardware:
        return False, "Hardware set not found"
    hardware_grpc.call("CreateCheckout", messages.CreateCheckoutRequest(
        hardware_id=hardware_id or hardware.id,
        project_id=project_id,
        user_id=str(user_id),
        quantity=quantity,
        reason=f"Project {project_id} checkout",
    ))
    return True, "Checkout successful"


def checkin_hardware(name, quantity, project_id, user_id, hardware_id=None):
    hardware = hardware_grpc.find_hardware(name) if not hardware_id else None
    if not hardware_id and not hardware:
        return False, "Hardware set not found"
    records = hardware_grpc.outstanding_checkouts(
        hardware_id or hardware.id, project_id, user_id,
    )
    # Reject an excessive return before mutating any checkout.
    if sum(record.quantity - record.returned for record in records) < quantity:
        return False, "Cannot return more than this project has checked out"
    remaining = quantity
    for record in records:
        outstanding = record.quantity - record.returned
        amount = min(remaining, outstanding)
        if amount <= 0:
            continue
        hardware_grpc.call("ReturnCheckout", messages.ReturnCheckoutRequest(
            checkout_id=record.id,
            expected_version=record.version,
            reason=f"Project {project_id} check-in",
            quantity=amount,
        ))
        remaining -= amount
        if remaining == 0:
            return True, "Check-in successful"
    return False, "Cannot return more than this project has checked out"
