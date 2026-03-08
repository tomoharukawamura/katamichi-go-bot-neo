#!/bin/bash
set -euo pipefail

SERVICE="${1:-}"

case "$SERVICE" in
  get-car-function)  PORT=9000 ;;
  init-db-function)  PORT=9001 ;;
  *)
    echo "Usage: $0 <service>"
    echo "Available services: get-car-function, init-db-function"
    exit 1
    ;;
esac

echo "Invoking ${SERVICE} on port ${PORT}..."
curl -s -XPOST "http://localhost:${PORT}/2015-03-31/functions/function/invocations" -d '{}' | jq .
