# Windows equivalent of gen_protos.sh; uses the same checked-in contracts.
$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot '..')
try {
    python -m grpc_tools.protoc -I server --python_out=server --grpc_python_out=server server/users/users.proto server/projects/projects.proto server/hardware/hardware.proto
    if ($LASTEXITCODE -ne 0) { throw "Proto generation failed ($LASTEXITCODE)" }
} finally {
    Pop-Location
}
