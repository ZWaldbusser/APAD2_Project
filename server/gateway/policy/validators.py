"""Validate stage. Each validator returns a cleaned payload and counts rejections per rule."""
from observability import metrics


def _reject(rule):
    metrics.record_rejection(rule)


def _nonneg_int(v):
    return isinstance(v, int) and not isinstance(v, bool) and v >= 0


def validate_hardware_page(payload):
    items = payload.get("items")
    if not isinstance(items, list):
        _reject("hardware.schema")
        raise ValueError("hardware payload has no items list")
    seen, clean = set(), []
    for it in items:
        hid = it.get("id") if isinstance(it, dict) else None
        if not hid:
            _reject("hardware.missing_id")
            continue
        if hid in seen:
            _reject("hardware.duplicate")
            continue
        if not all(_nonneg_int(it.get(f, 0)) for f in ("total", "reserved", "out", "available")):
            _reject("hardware.bad_quantity")
            continue
        seen.add(hid)
        it = dict(it, name=str(it.get("name", "")).strip())
        if it.get("out", 0) > it.get("total", 0):
            _reject("hardware.out_exceeds_total")
            it["warning"] = "out exceeds total"  # reconciliation flag: sources disagree
        clean.append(it)
    return dict(payload, items=clean)


def validate_allocation_page(project_id=None):
    def validator(payload):
        items = payload.get("items")
        if not isinstance(items, list):
            _reject("allocation.schema")
            raise ValueError("allocation payload has no items list")
        seen, clean = set(), []
        for it in items:
            key = it.get("id") if isinstance(it, dict) else None
            if not key or not it.get("hardware_id") or not it.get("project_id"):
                _reject("allocation.missing_field")
                continue
            if project_id and it["project_id"] != project_id:
                _reject("allocation.tenant_scope")
                continue
            if key in seen:
                _reject("allocation.duplicate")
                continue
            if not _nonneg_int(it.get("quantity")) or not _nonneg_int(it.get("out", 0)):
                _reject("allocation.bad_quantity")
                continue
            if it.get("out", 0) > it["quantity"]:
                _reject("allocation.out_exceeds_quantity")
                it = dict(it, warning="out exceeds quantity")
            seen.add(key)
            clean.append(it)
        return dict(payload, items=clean)
    return validator


def validate_project(org_id=None):
    def validator(payload):
        info = payload.get("projectInfo")
        if not isinstance(info, dict) or not info.get("projectId"):
            _reject("project.schema")
            raise ValueError("project payload missing projectId")
        if org_id and info.get("orgId") not in (None, "", org_id):
            _reject("project.tenant_scope")
            raise ValueError("project belongs to a different agency")
        if "budget" in info and (not isinstance(info["budget"], (int, float)) or info["budget"] < 0):
            _reject("project.bad_budget")
            raise ValueError("project budget invalid")
        return payload
    return validator


def validate_project_list(payload):
    lst = payload.get("projectList")
    if not isinstance(lst, list):
        _reject("project.schema")
        raise ValueError("project list missing")
    seen, clean = set(), []
    for p in lst:
        k = (p.get("orgId"), p.get("projectId")) if isinstance(p, dict) else None
        if not k or not k[1]:
            _reject("project.missing_id")
            continue
        if k in seen:
            _reject("project.duplicate")
            continue
        seen.add(k)
        clean.append(p)
    return dict(payload, projectList=clean)
