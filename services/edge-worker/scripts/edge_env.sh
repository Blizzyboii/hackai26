#!/usr/bin/env bash
# Source this file on the remote GPU host:
#   source ./scripts/edge_env.sh

export EDGE_REPO_PATH="/work/axa230262/000 me/EDGE"
export EDGE_INFER_SCRIPT="/work/axa230262/000 me/hackai26/services/edge-worker/scripts/edge_adapter.py"
export EDGE_CHECKPOINT_PATH="/work/axa230262/000 me/EDGE/checkpoint.pt"
export EDGE_PYTHON_BIN="/home/axa230262/work/envs/edge/bin/python"
export EDGE_REQUIRE_GPU=1

if [ ! -d "$EDGE_REPO_PATH" ]; then
  echo "EDGE_REPO_PATH missing: $EDGE_REPO_PATH"
fi
if [ ! -f "$EDGE_INFER_SCRIPT" ]; then
  echo "EDGE_INFER_SCRIPT missing: $EDGE_INFER_SCRIPT"
fi
if [ ! -f "$EDGE_CHECKPOINT_PATH" ]; then
  echo "EDGE_CHECKPOINT_PATH missing: $EDGE_CHECKPOINT_PATH"
fi
if [ ! -x "$EDGE_PYTHON_BIN" ]; then
  echo "EDGE_PYTHON_BIN missing or not executable: $EDGE_PYTHON_BIN"
fi
