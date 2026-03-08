from __future__ import annotations

import argparse
import json
from pathlib import Path

from backend.rl.path_policy import DEFAULT_TRAINING_CONFIG, train_linear_policy


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train the linear Q policy for path recommendations.")
    parser.add_argument("--graph", required=True, help="Path to a graph snapshot JSON file.")
    parser.add_argument(
        "--output-dir",
        default=str(Path(__file__).resolve().parent.parent / "path_policy_artifacts"),
        help="Directory where policy.pt and companion files should be written.",
    )
    parser.add_argument("--episodes", type=int, default=DEFAULT_TRAINING_CONFIG["episodes"])
    parser.add_argument("--gamma", type=float, default=DEFAULT_TRAINING_CONFIG["gamma"])
    parser.add_argument("--lr", type=float, default=DEFAULT_TRAINING_CONFIG["lr"])
    parser.add_argument("--batch-size", type=int, default=DEFAULT_TRAINING_CONFIG["batch_size"])
    parser.add_argument("--replay-size", type=int, default=DEFAULT_TRAINING_CONFIG["replay_size"])
    parser.add_argument("--epsilon-start", type=float, default=DEFAULT_TRAINING_CONFIG["epsilon_start"])
    parser.add_argument("--epsilon-end", type=float, default=DEFAULT_TRAINING_CONFIG["epsilon_end"])
    parser.add_argument("--seed", type=int, default=DEFAULT_TRAINING_CONFIG["seed"])
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    graph_path = Path(args.graph)
    graph = json.loads(graph_path.read_text(encoding="utf-8"))

    result = train_linear_policy(
        graph=graph,
        output_dir=args.output_dir,
        episodes=args.episodes,
        gamma=args.gamma,
        lr=args.lr,
        batch_size=args.batch_size,
        replay_size=args.replay_size,
        epsilon_start=args.epsilon_start,
        epsilon_end=args.epsilon_end,
        seed=args.seed,
    )

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

