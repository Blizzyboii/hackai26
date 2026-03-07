# HackAI 2026: Just-Dance MVP

Monorepo with:

- `apps/web`: Next.js frontend (upload/generate, routine prep, webcam scoring HUD)
- `services/api`: FastAPI orchestration API (songs, routines, sessions, persistence)
- `services/edge-worker`: FastAPI worker for choreography frame generation

## Quick Start

1. Start the EDGE worker:

```bash
cd services/edge-worker
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8010
```

2. Start the API:

```bash
cd services/api
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

3. Start the web app:

```bash
cd apps/web
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment

### API (`services/api/.env`)

```bash
API_ALLOWED_ORIGINS=http://localhost:3000
EDGE_WORKER_URL=http://localhost:8010
API_DATA_DIR=./data
EDGE_CHECKPOINT_PATH=/absolute/path/to/checkpoint.pt
EDGE_CHUNK_SECONDS=24
EDGE_OVERLAP_SECONDS=4

# Lyria real integration (Vertex)
LYRIA_PROJECT=your-gcp-project
LYRIA_LOCATION=us-central1
LYRIA_MODEL=lyria-002

# Optional local fallback for demos when Vertex is unavailable
LYRIA_ENABLE_MOCK=0
```

If Lyria credentials are unavailable, `POST /api/songs/generate` returns `LYRIA_UNAVAILABLE`.

### EDGE worker runtime

The worker now requires real EDGE runtime inputs (no placeholder fallback):

```bash
EDGE_REPO_PATH=/absolute/path/to/EDGE
EDGE_INFER_SCRIPT=/absolute/path/to/edge_adapter.py
EDGE_CHECKPOINT_PATH=/absolute/path/to/checkpoint.pt
EDGE_REQUIRE_GPU=1
# Optional: python binary for EDGE runtime (e.g. conda env with EDGE deps)
EDGE_PYTHON_BIN=/absolute/path/to/python
```

The adapter script must print JSON to stdout in this shape:

```json
{ "frames_3d": [[[0.0, 0.0, 0.0], "... 17 joints ..."], "... frames ..."] }
```

The worker will project 3D frames to 2D for scoring and return both artifacts.

`EDGE_CHECKPOINT_PATH` may point to a checkpoint file or a directory containing checkpoint files (`*.pt`, `*.pth`, `*.ckpt`, `*.tar`). Set `EDGE_CHECKPOINT_NAME` to choose a specific filename from a directory.

Build dockerized worker:

```bash
cd services/edge-worker
docker build -f docker/Dockerfile -t dance-edge-worker:latest .
```

### Web (`apps/web/.env.local`)

```bash
# Optional override; default uses same-origin proxy to avoid browser CORS
NEXT_PUBLIC_API_BASE=/api/proxy

# Next.js server-side proxy target (recommended)
API_PROXY_TARGET=http://127.0.0.1:8000
```

## Troubleshooting

- `Load failed` in browser usually means frontend cannot reach API or CORS blocked the request.
- Confirm API health from the same machine:

```bash
curl http://localhost:8000/health
```

- Preferred setup is using web proxy (`/api/proxy`) so browser CORS is not involved.
- If calling API directly from browser, add your web origin to `API_ALLOWED_ORIGINS` in `services/api/.env`, then restart API.

## Notes

- Upload supports `mp3`, `wav`, `m4a` and enforces max duration `180s`.
- `ffmpeg` is required on the API host for upload transcoding.
- EDGE generation now fails fast when checkpoint/GPU/runtime is unavailable (`EDGE_UNAVAILABLE`).
