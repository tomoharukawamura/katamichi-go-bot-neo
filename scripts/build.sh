#!/bin/bash
set -euo pipefail

docker compose -p katamichi-go build "$@"
