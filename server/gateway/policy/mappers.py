"""Field allow-lists: what the UI keeps vs. what is dropped. One source for code AND the slide table."""

# version is KEPT: set_allocation needs it for optimistic locking.
HARDWARE_ITEM_KEEP = ("_id", "id", "name", "category", "description", "asset_tag", "serial", "status",
                      "total", "reserved", "out", "available", "unallocated", "version", "warning")
ALLOCATION_KEEP = ("id", "hardware_id", "project_id", "quantity", "out", "version", "warning")
PROJECT_KEEP = ("orgId", "projectId", "projectName", "projectDesc", "creatorId", "budget",
                "hardwareList", "joined_users")
PROJECT_SUMMARY_KEEP = ("projectId", "projectName", "orgId")

ALLOW_LISTS = {
    "hardware.item": HARDWARE_ITEM_KEEP,
    "hardware.allocation": ALLOCATION_KEEP,
    "projects.project": PROJECT_KEEP,
    "projects.summary": PROJECT_SUMMARY_KEEP,
}


def pick(record, keep):
    return {k: record[k] for k in keep if k in record}


def map_page(keep):
    def mapper(payload):
        out = dict(payload)
        out["items"] = [pick(i, keep) for i in payload.get("items", [])]
        return out
    return mapper


def map_project_info(payload):
    return {"projectInfo": pick(payload.get("projectInfo", {}), PROJECT_KEEP)}


def map_project_list(payload):
    return {"projectList": [pick(p, PROJECT_SUMMARY_KEEP) for p in payload.get("projectList", [])]}


def allow_list_markdown():
    """Generate the 'fields kept' slide table from the code so slide and code cannot drift."""
    rows = ["| Source | Kept for UI |", "|---|---|"]
    rows += [f"| {name} | {', '.join(f'`{f}`' for f in keep)} |" for name, keep in ALLOW_LISTS.items()]
    return "\n".join(rows)


if __name__ == "__main__":
    print(allow_list_markdown())
