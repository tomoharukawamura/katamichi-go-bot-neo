#!/bin/bash
set -euo pipefail

declare -A PORTS=(
  ["get-car-function"]=9000
  ["init-db-function"]=9001
)

SERVICE="${1:-}"

if [[ -z "$SERVICE" ]] || [[ -z "${PORTS[$SERVICE]+x}" ]]; then
  echo "Usage: $0 <service>"
  echo "Available services: ${!PORTS[*]}"
  exit 1
fi

PORT="${PORTS[$SERVICE]}"
echo "Invoking ${SERVICE} on port ${PORT}..."
curl -s -XPOST "http://localhost:${PORT}/2015-03-31/functions/function/invocations" -d '{}' | jq .
