# AI Brief For Judges

## What the AI actually does
This is not a yes/no classifier. Our AI solves a sequential decision problem on a typed graph of `student -> club/subprogram -> company` pathways.

Given a target company, interests, excluded clubs, and a student profile, the system answers:
- Which routes are strongest?
- Why is one route stronger than another?
- What changes if a club is removed?
- Which edges are strong because of direct alumni evidence vs transferable overlap?

That is why we use a graph policy model plus an explainable reranker, not a binary classifier.

## Model architecture
We use a small, explainable linear Q-learning model as the candidate generator.

- Model: single linear layer, `Q(s,a) = w · phi(s,a) + b`
- State: current node, visited nodes, target company, filtered graph, semesters remaining, risk tolerance, completed nodes, path depth, cross-club count
- Action: any legal outgoing edge that survives filtering
- Episode ends: target reached, dead end, or max depth 8
- Inference: beam search over legal graph paths, ranked by learned Q values

This keeps the AI understandable, reproducible, and feasible to train quickly.

## Training setup
We train on synthetic episodes generated from the real exported graph snapshot.

- Episodes: `50,000`
- Discount factor: `0.95`
- Learning rate: `1e-3`
- Batch size: `256`
- Replay buffer: `50,000`
- Epsilon decay: `1.0 -> 0.05`
- Default seed: `7`

Reward shaping:
- `-0.04` per step
- `-0.20` for a cross-club bridge
- `-0.12` if the move does not reduce distance to the target
- `+0.06` for landing on an included-tag node
- `+0.05` for landing on a completed node
- terminal success: `+1.00 + 0.20 * normalized_edge_weight + 0.15 * base_edge_confidence`
- failure: `-1.00`

The RL model learns path sequencing. It does not generate final UI explanations by itself.

## Features used by the RL policy
We use 21 engineered features, all grounded in the graph and student profile:

- Edge type: `root_to_club`, `club_to_subprogram`, `club_to_company`, `cross_club`
- Destination node type: `root`, `club`, `subprogram`, `company`
- Normalized edge weight
- Base edge confidence
- Shortest-hop distance from the next node to the target
- Distance improvement from the current node
- Included-tag overlap
- Completed-node hit
- Path depth
- Cross-club count
- Semesters remaining
- Risk tolerance one-hot: `low`, `medium`, `high`
- Destination-is-target flag

Why this matters: every feature is interpretable and tied to a real product decision, so we can defend every input to judges and users.

## What the percentages mean in the UI
There are four main percentages:

### 1. Route confidence
This is the policy confidence for a full path, derived from the mean Q value along the path:

`confidence = clamp(0.35 + 0.62 * sigmoid(mean_q), 0.35, 0.97)`

This is a calibrated ranking confidence, not a literal probability of getting hired.

### 2. Direct evidence
This measures direct alumni proof from the route's originating club/program to the target company.

For a direct club-to-company edge:

`direct_edge_score = 0.72 * normalized_alumni_weight + 0.28 * edge_confidence`

For a path, direct evidence only counts the direct company outcome from the route's origin club, with a small penalty if the direct edge appears later in the path:

`directEvidence = clamp(direct_edge_score - 0.12 * edge_index, 0, 1)`

Design choice: this prevents a bridge-heavy path from stealing "direct evidence" credit that really belongs to another club.

### 3. Transferability
This measures how much the path is supported by overlap between adjacent clubs/programs.

Bridge score:

`bridge_edge_score = 0.55 * normalized_bridge_weight + 0.45 * edge_confidence`

Path transferability:

`transferability = clamp(0.45 * bridge_score + 0.25 * adjacent_direct_support - 0.14 * extra_hops - 0.08 * bridge_count, 0, 1)`

If the path has no actual bridge, we use the best adjacent-club support as a fallback backup signal.

Design choice: transferability is useful, but it is explicitly penalized for unnecessary detours.

### 4. Fit
This measures alignment with the student's selected interests and current profile.

`fit = 0.45 * tag_match + 0.35 * completion_signal + 0.20 * timeline_fit`

Where:
- `tag_match`: how much the path overlaps selected tags
- `completion_signal`: completed nodes plus overall profile progress
- `timeline_fit`: whether the path is realistic given semesters remaining and risk tolerance

Design choice: this makes the system personalized without inventing hidden user embeddings.

### 5. Overall path score
The final path ranking score shown in the UI is:

`overall = 0.5 * directEvidence + 0.2 * transferability + 0.3 * fit`

Design choice:
- `0.5` on direct evidence because real alumni outcomes are the strongest signal
- `0.2` on transferability because overlap matters, but should not dominate
- `0.3` on fit because a strong path still needs to match the student's interests and timeline

## Edge-level explanations
Every edge gets two scores:
- `directEvidence`
- `transferability`

If one beats the other by more than `0.08`, we label the edge with that dominant reason. Otherwise it is labeled `balanced`.

This is how the UI can say whether an edge is strong because of direct alumni proof or because it transfers well from adjacent clubs.

## Why we also use sentence stems
We do not use a generative LLM for explanations. We use deterministic sentence stems driven by the computed scores and graph facts.

Examples:
- "This path is strongest because ACM has direct alumni proof to JPMorgan, ..."
- "2 alumni went directly from ACM to JPMorgan."
- "AIS overlaps with ACM, which keeps this route viable even without direct alumni proof."

Design choice: this makes explanations reproducible, grounded, and safe from hallucination.

## Why this is a strong use of AI
The AI is doing real decision support, not decoration.

- It learns sequential path choice under changing constraints.
- It adapts when clubs are excluded or tags change.
- It produces backup routes and counterfactuals.
- It separates direct evidence from transferability instead of hiding everything in one black-box score.

In short: the AI is not just predicting an outcome. It is selecting, ranking, and explaining actionable pathways.

## Reproducibility and feasibility
This system is practical to reproduce:

1. Export the live graph:
   `python backend/rl/export_graph_snapshot.py --output backend/path_policy_artifacts/graph_snapshot.json`
2. Train:
   `python backend/rl/train_path_policy.py --graph backend/path_policy_artifacts/graph_snapshot.json --output-dir backend/path_policy_artifacts`
   or `bash backend/rl/train.sh`
3. Serve the weights through `/recommend-paths`

Artifacts are explicit:
- `policy.pt`
- `policy.json`
- `feature_manifest.json`
- `training_summary.json`

This is feasible for a hackathon because:
- the model is tiny
- training is fast
- features are hand-auditable
- inference is cheap
- the system still has a heuristic fallback if no checkpoint is present

## One-sentence judge pitch
We built an explainable RL path recommender over a real club-to-career graph, then decomposed its decisions into direct evidence, transferability, and fit so students can see not just the best route, but why it is best and how it changes under counterfactuals.
