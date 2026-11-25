"""Rank Hardware's procurement suggestions against a verified project's budget."""

from decimal import Decimal, ROUND_HALF_UP
from statistics import median

from hardware import client as hardware_client
from hardware import hardware_pb2 as hardware_messages
from projects import client as projects
from users import client as users
from users.vendor_directory import vendor_name_key

_CENT = Decimal("0.01")
# Procurement values outside the exact whole-cent range are not meaningful estimates.
_MAX_DOLLARS = Decimal(2**53 - 1) / 100

# Hardware's purchasing records use commodity names in place of model names.
# These aliases match a product category and do not identify a specific SKU.
_COMMODITIES_BY_MODEL = {
    "thinksystem st250 v3 tower server": {"servers file microcomputer"},
}


def _commodity_key(value):
    return " ".join("".join(
        char if char.isalnum() else " " for char in value.casefold()
    ).split())


# Hardware expresses these tags as trailing commodity qualifiers.
_PROCUREMENT_TAGS = ("Environmentally certified", "Environmentally friendly")


def _commodity_details(value):
    key = _commodity_key(value)
    for tag in _PROCUREMENT_TAGS:
        base, suffix, trailing = key.rpartition(" " + tag.lower())
        if base and suffix and not trailing:
            return base, tag
    return key, None


def _price(value):
    price = Decimal(str(value))
    if price.is_finite() and 0 < price <= _MAX_DOLLARS:
        return price
    return None


def _money(value):
    return str(value.quantize(_CENT, rounding=ROUND_HALF_UP))


def _benchmark(agency, budget, name, quantity):
    try:
        _, context = projects.get_budget_context({
            "orgId": agency,
            "budget": budget,
            "items": [{"description": name, "quantity": quantity}],
        })
    except projects.ProjectsServiceError:
        return {"status": "unavailable"}

    items = context["items"]
    if (context["orgId"] != agency or len(items) != 1
            or items[0]["description"] != name or items[0]["quantity"] != quantity):
        return {"status": "unavailable"}
    item = items[0]
    if not item["priced"]:
        return {"status": "unpriced"}

    estimate = {key: Decimal(str(item["estimatedCost"][key])) for key in ("low", "typical", "high")}
    low, typical, high = estimate.values()
    if (not all(value.is_finite() and 0 <= value <= _MAX_DOLLARS for value in estimate.values())
            or not low <= typical <= high):
        return {"status": "unavailable"}
    return {
        "status": "priced",
        "matchedCategory": item["matchedCategory"],
        "estimate": {key: _money(value) for key, value in estimate.items()},
    }


def _matching_records(alternatives, hardware_name, benchmark):
    model_key = _commodity_key(hardware_name)
    category_keys = set(_COMMODITIES_BY_MODEL.get(model_key, ()))
    matched_category, _ = _commodity_details(benchmark.get("matchedCategory", ""))
    if matched_category:
        category_keys.add(matched_category)

    matches = []
    excluded = 0
    for alternative in alternatives:
        vendor = " ".join(alternative.vendor.split())
        if not vendor:
            continue
        commodity, tag = _commodity_details(alternative.commodity)
        if commodity == model_key:
            basis = "model"
        elif commodity in category_keys:
            basis = "category"
        else:
            excluded += 1
            continue
        price = _price(alternative.unit_price) if alternative.HasField("unit_price") else None
        matches.append((vendor, basis, price, alternative.commodity.strip(), tag))
    return matches, excluded


def _rank(matches, benchmark, budget, quantity):
    vendors = {}
    for vendor, basis, price, commodity, _ in matches:
        _, observations = vendors.setdefault(vendor.casefold(), (vendor, {"model": [], "category": []}))
        if price is not None:
            observations[basis].append((price, commodity))

    priced = []
    unpriced = []
    for name, observations in vendors.values():
        basis = "model" if observations["model"] else "category"
        records = observations[basis]
        if not records:
            unpriced.append(name)
            continue

        unit_price = median(price for price, _ in records)
        estimated_total = (unit_price * quantity).quantize(_CENT, rounding=ROUND_HALF_UP)
        priced.append((estimated_total, name, unit_price, basis, records))

    ranked = []
    typical = Decimal(benchmark["estimate"]["typical"]) if benchmark["status"] == "priced" else None
    priced.sort(key=lambda vendor: (vendor[0], vendor[1].casefold()))
    for position, (total, name, unit_price, basis, records) in enumerate(priced):
        within_budget = total <= budget
        ranked.append({
            "vendor": name,
            "unitPrice": str(unit_price),
            "priceBasis": basis,
            "commodities": sorted({commodity for _, commodity in records}, key=str.casefold),
            "priceRecordCount": len(records),
            "estimatedTotal": _money(total),
            "withinBudget": within_budget,
            "overBudgetBy": _money(max(total - budget, Decimal(0))),
            "differenceFromTypical": _money(total - typical) if typical is not None else None,
            "recommended": position == 0 and within_budget,
        })
    return {"rankedVendors": ranked, "unpricedVendors": sorted(unpriced, key=str.casefold)}


def _saved_vendors(access_token, agency, display_names):
    if not display_names:
        return [], False
    try:
        watchlist = users.list_watchlist(access_token, agency)
    except users.UsersServiceError:
        return [], True

    # Hardware sends names only. An exact normalized name must identify one
    # opaque Users vendor ID before it can affect the ranking.
    saved_ids = {}
    for item in watchlist:
        key = vendor_name_key(item.vendor_name)
        if key in display_names and item.vendor_id:
            saved_ids.setdefault(key, set()).add(item.vendor_id)
    return [display_names[key] for key, ids in saved_ids.items() if len(ids) == 1], False


def get_vendor_rankings(project_id, agency, user_id, hardware_id, quantity, *, access_token):
    _, payload = projects.get_project(project_id, agency)
    project = payload["projectInfo"]
    if user_id not in project["joined_users"]:
        raise projects.ProjectsServiceError("Join this project to use its budget", 403)
    if project["budget"] < 0:
        raise projects.ProjectsServiceError("This project has no valid budget", 502)

    response = hardware_client.call("GetAvailability", hardware_messages.GetHardwareRequest(
        hardware_id=hardware_id,
    ))
    name = response.hardware.name.strip()
    if (response.hardware.id != hardware_id or not name
            or response.availability not in {"available", "unavailable"}):
        raise hardware_client.HardwareServiceError("Hardware availability could not be verified", 502)

    budget = Decimal(project["budget"])
    benchmark = _benchmark(agency, project["budget"], name, quantity)
    status = response.availability
    matches, excluded = [], 0
    if status == "unavailable":
        if response.alternative_lookup_status == "temporarily_unavailable":
            status = "temporarily_unavailable"
        else:
            matches, excluded = _matching_records(response.alternatives, name, benchmark)

    ranking = _rank(matches, benchmark, budget, quantity)
    vendor_names = [row["vendor"] for row in ranking["rankedVendors"]] + ranking["unpricedVendors"]
    display_names = {name.casefold(): name for name in vendor_names}
    saved_vendors, watchlist_unavailable = _saved_vendors(access_token, agency, display_names)
    tagged = {}
    for vendor_name, _, _, _, tag in matches:
        if tag:
            tagged.setdefault(tag, set()).add(display_names[vendor_name.casefold()])

    return {
        "projectName": project["projectName"],
        "projectBudget": _money(budget),
        "hardwareName": name,
        "quantity": quantity,
        "benchmark": benchmark,
        "availability": status,
        **ranking,
        "procurementTags": [
            {"tag": tag, "vendors": sorted(vendors, key=str.casefold)}
            for tag, vendors in sorted(tagged.items())
        ],
        "excludedRecordCount": excluded,
        "savedVendors": saved_vendors,
        "watchlistUnavailable": watchlist_unavailable,
    }
