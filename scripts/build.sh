#!/bin/bash
set -euo pipefail

SERVICE_NAME="${1:-}"

if [[ -z "$SERVICE_NAME" ]]; then
  echo "Usage: $0 <service>"
  echo "Available services: get-car-function, init-db-function"
  exit 1
fi

docker-compose -p katamichi-go up -d --build "$SERVICE_NAME"
