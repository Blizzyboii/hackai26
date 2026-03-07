FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv git ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt

# Mount EDGE code and checkpoint file at runtime for reproducibility:
# -v /path/to/EDGE:/opt/EDGE
# -v /path/to/checkpoints:/opt/checkpoints
ENV EDGE_REPO_PATH=/opt/EDGE
ENV EDGE_CHECKPOINT_PATH=/opt/checkpoints
ENV EDGE_INFER_SCRIPT=/app/scripts/edge_adapter.py
ENV EDGE_REQUIRE_GPU=1

WORKDIR /app
COPY pyproject.toml /app/pyproject.toml
COPY app /app/app
COPY scripts /app/scripts

RUN python3 -m pip install --upgrade pip && \
    python3 -m pip install -e .

EXPOSE 8010
CMD ["python3", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8010"]
