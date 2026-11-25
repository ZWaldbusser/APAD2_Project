from datetime import datetime, timezone

from flask import Blueprint, jsonify

import config
from edge import store as edge
from gateway.resilience import breaker_states
from observability import metrics


def create_blueprint():
    bp = Blueprint("health", __name__)

    @bp.route("/api/health", methods=["GET"])
    def health():
        st = edge.get_store()
        store_info = {"type": type(st).__name__ if st else "none", "ok": False}
        if st:
            try:
                store_info["ok"] = bool(st.ping())
            except Exception as error:  # noqa: BLE001
                store_info["error"] = type(error).__name__
        snap = metrics.snapshot()
        return jsonify({
            "status": "ok",
            "time": datetime.now(timezone.utc).isoformat(),
            "edgeStore": store_info,
            "circuits": breaker_states(),
            "upstreams": snap["services"],
            "payloadBytes": snap["payloadBytes"],
            "dataQuality": {"rejectionsByRule": snap["rejections"]},
            "snapshotTtlSeconds": config.SNAPSHOT_TTL,
        }), 200

    return bp
