"""Resolve Hardware vendor names against the authenticated Users vendor directory."""

from functools import lru_cache
import logging
import os
from time import monotonic

import grpc

from users import client, vendors_pb2, vendors_pb2_grpc

DEFAULT_TARGET = "apad-vendors-grpc.bluedesert-b9b6bdd4.westus.azurecontainerapps.io:443"

logger = logging.getLogger(__name__)
_LOOKUP_ERRORS = {
    grpc.StatusCode.DEADLINE_EXCEEDED: "The vendor directory lookup timed out. Try again.",
    grpc.StatusCode.UNAUTHENTICATED: "The vendor directory rejected this session. Sign in again.",
    grpc.StatusCode.PERMISSION_DENIED: "The vendor directory denied this account’s access.",
    grpc.StatusCode.INVALID_ARGUMENT: "The vendor directory rejected the search.",
    grpc.StatusCode.RESOURCE_EXHAUSTED: "The vendor directory is busy. Try again shortly.",
}


def vendor_name_key(name):
    return " ".join(name.split()).casefold()


@lru_cache(maxsize=4)
def _stub(target, secure):
    channel = (grpc.secure_channel(target, grpc.ssl_channel_credentials())
               if secure else grpc.insecure_channel(target))
    return vendors_pb2_grpc.VendorDataServiceStub(channel)


def _lookup_page(lookup, access_token, query, page, deadline):
    # Leaving government unset lets the directory pick the verified token's agency.
    request = vendors_pb2.ListVendorsRequest(query=query, page=page, page_size=20)
    metadata = (("authorization", f"Bearer {access_token}"),)
    for attempt in range(2):
        remaining = deadline - monotonic()
        if remaining <= 0:
            raise client.UsersServiceError("The vendor directory lookup timed out. Try again.", 504)
        try:
            return lookup(request, metadata=metadata, timeout=remaining)
        except grpc.RpcError as error:
            code = error.code()
            if code == grpc.StatusCode.UNAVAILABLE and attempt == 0:
                continue
            logger.warning("Vendor directory lookup failed with gRPC status %s", code.name)
            message = _LOOKUP_ERRORS.get(code, "The vendor directory is temporarily unavailable. Try again.")
            raise client.UsersServiceError(message, client._HTTP_STATUS.get(code, 503)) from error


def save_vendor(access_token, agency, vendor_name):
    query = " ".join(vendor_name.split())
    name_key = vendor_name_key(query)
    target, secure = client._endpoint(
        os.getenv("VENDORS_GRPC_TARGET", DEFAULT_TARGET).strip(), setting="VENDORS_GRPC_TARGET",
    )
    lookup = _stub(target, secure).ListVendors
    deadline = monotonic() + 24
    vendor_ids = set()
    page = 1
    while True:
        result = _lookup_page(lookup, access_token, query, page, deadline)
        if (result.agency_code != agency or result.page != page
                or any(vendor.agency_code != agency for vendor in result.vendors)):
            raise client.UsersServiceError("Vendor directory results could not be verified", 502)
        vendor_ids.update(
            vendor.vendor_id for vendor in result.vendors
            if vendor.vendor_id and vendor_name_key(vendor.vendor_name) == name_key
        )
        if len(vendor_ids) > 1:
            raise client.UsersServiceError("More than one directory vendor matches this name", 409)
        if not result.has_next:
            break
        page += 1

    if not vendor_ids:
        raise client.UsersServiceError("This vendor was not found by name in your agency’s directory", 404)
    vendor_id, = vendor_ids
    saved = client.add_to_watchlist(access_token, vendor_id)
    if (saved.agency_code != agency or saved.vendor_id != vendor_id
            or vendor_name_key(saved.vendor_name) != name_key):
        raise client.UsersServiceError("The saved vendor could not be verified", 502)


def remove_saved_vendor(access_token, agency, vendor_name):
    name_key = vendor_name_key(vendor_name)
    items = client.list_watchlist(access_token, agency)
    vendor_ids = {
        item.vendor_id for item in items
        if item.vendor_id and vendor_name_key(item.vendor_name) == name_key
    }
    if len(vendor_ids) > 1:
        raise client.UsersServiceError("More than one saved vendor matches this name", 409)
    if vendor_ids:
        vendor_id, = vendor_ids
        try:
            client.remove_from_watchlist(access_token, vendor_id)
        except client.UsersServiceError as error:
            # Another request may have already removed the same entry.
            if error.status_code != 404:
                raise
