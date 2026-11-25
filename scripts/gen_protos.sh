#!/usr/bin/env bash
# Regenerate committed Python bindings from the checked-in team contracts.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
"${PYTHON:-python}" -m grpc_tools.protoc \
  -I server --python_out=server --grpc_python_out=server \
  server/users/users.proto \
  server/projects/projects.proto \
  server/hardware/hardware.proto
