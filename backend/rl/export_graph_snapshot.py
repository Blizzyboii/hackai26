from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from pymongo import MongoClient

from graph_builder import build_graph_dataset


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export the current Mongo-backed graph dataset to JSON.")
    parser.add_argument(
        "--output",
        default=str(Path(__file__).resolve().parent.parent / "path_policy_artifacts" / "graph_snapshot.json"),
        help="Output JSON path.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Optional club document limit for debugging. Zero exports all clubs.",
    )
    return parser.parse_args()


def load_collection() -> Any:
    backend_root = Path(__file__).resolve().parent.parent
    load_dotenv(backend_root / ".env")
    mongo_uri = os.getenv("MONGODB_URI")
    if not mongo_uri:
        raise RuntimeError("MONGODB_URI is not configured in backend/.env")

    client = MongoClient(mongo_uri)
    return client.clubs_data.clubs


def main() -> None:
    args = parse_args()
    collection = load_collection()
    cursor = collection.find(
        {},
        {
            "_id": 0,
            "id": 1,
            "name": 1,
            "description": 1,
            "tags": 1,
            "officers": 1,
        },
    )
    if args.limit > 0:
        cursor = cursor.limit(args.limit)

    graph = build_graph_dataset(list(cursor))
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(graph, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output_path), "nodes": len(graph["nodes"]), "edges": len(graph["edges"])}, indent=2))


if __name__ == "__main__":
    main()
