#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ARTIFACT_DIR="${BACKEND_DIR}/path_policy_artifacts"

python3 "${SCRIPT_DIR}/train_path_policy.py" \
  --graph "${ARTIFACT_DIR}/graph_snapshot.json" \
  --output-dir "${ARTIFACT_DIR}" \
  "$@"

