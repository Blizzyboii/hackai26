from __future__ import annotations

import json
import math
import pickle
import random
import zipfile
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence

try:
    import torch
    from torch import nn
except ModuleNotFoundError:  # pragma: no cover - exercised in runtime fallback paths.
    torch = None
    nn = None


MAX_PATH_DEPTH = 8
BASE_HOP_PENALTY = 0.65
CROSS_CLUB_HOP_PENALTY = 1.35
DEFAULT_TOP_K = 4
DEFAULT_BEAM_SIZE = 8
DEFAULT_POLICY_MODE = "rl"

FEATURE_NAMES = [
    "edge_kind_root_to_club",
    "edge_kind_club_to_subprogram",
    "edge_kind_club_to_company",
    "edge_kind_cross_club",
    "destination_type_root",
    "destination_type_club",
    "destination_type_subprogram",
    "destination_type_company",
    "normalized_edge_weight",
    "base_edge_confidence",
    "shortest_hop_distance_norm",
    "distance_improvement_norm",
    "include_tag_overlap",
    "completed_node_hit",
    "path_depth_norm",
    "cross_club_count_norm",
    "semesters_remaining_norm",
    "risk_low",
    "risk_medium",
    "risk_high",
    "destination_is_target",
]

DEFAULT_REWARD_CONFIG = {
    "step_penalty": -0.04,
    "cross_club_penalty": -0.20,
    "no_progress_penalty": -0.12,
    "include_tag_bonus": 0.06,
    "completed_node_bonus": 0.05,
    "terminal_success": 1.00,
    "terminal_weight_bonus": 0.20,
    "terminal_confidence_bonus": 0.15,
    "terminal_failure": -1.00,
}

DEFAULT_TRAINING_CONFIG = {
    "episodes": 50_000,
    "gamma": 0.95,
    "lr": 1e-3,
    "batch_size": 256,
    "replay_size": 50_000,
    "epsilon_start": 1.0,
    "epsilon_end": 0.05,
    "seed": 7,
}

DEFAULT_ARTIFACTS_DIR = Path(__file__).resolve().parent.parent / "path_policy_artifacts"


@dataclass(frozen=True)
class ScoringContext:
    completed_node_ids: set[str]
    semesters_remaining: int
    completed_course_count: int
    completed_research_count: int
    completed_extracurricular_count: int
    risk_tolerance: str


@dataclass(frozen=True)
class TraversableGraph:
    node_map: dict[str, dict[str, Any]]
    edge_map: dict[str, dict[str, Any]]
    adjacency: dict[str, list[dict[str, str]]]
    reverse_adjacency: dict[str, list[str]]
    traversable_node_ids: set[str]
    traversable_edge_ids: set[str]


@dataclass(frozen=True)
class PolicyBundle:
    feature_names: list[str]
    weights: list[float]
    bias: float
    checkpoint_path: str | None
    training_summary: dict[str, Any] | None
    manifest: dict[str, Any] | None


@dataclass(frozen=True)
class SearchState:
    node_id: str
    visited_node_ids: frozenset[str]
    node_ids: tuple[str, ...]
    edge_ids: tuple[str, ...]
    q_values: tuple[float, ...]
    feature_maps: tuple[dict[str, float], ...]
    cross_club_count: int


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def sigmoid(value: float) -> float:
    if value >= 0:
        exp_value = math.exp(-value)
        return 1 / (1 + exp_value)

    exp_value = math.exp(value)
    return exp_value / (1 + exp_value)


def unique_strings(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            ordered.append(value)
    return ordered


def has_tag_overlap(node: dict[str, Any], tags: Sequence[str]) -> bool:
    node_tags = node.get("tags", [])
    if not isinstance(node_tags, list):
        return False
    return any(tag in node_tags for tag in tags)


def risk_multiplier(risk_tolerance: str) -> float:
    if risk_tolerance == "low":
        return 1.2
    if risk_tolerance == "high":
        return 0.82
    return 1.0


def build_scoring_context(profile: dict[str, Any] | None) -> ScoringContext:
    if not profile:
        return ScoringContext(set(), 4, 0, 0, 0, "medium")

    completed_node_ids = profile.get("completedNodeIds", [])
    return ScoringContext(
        completed_node_ids=set(completed_node_ids) if isinstance(completed_node_ids, list) else set(),
        semesters_remaining=int(profile.get("semestersRemaining", 4) or 4),
        completed_course_count=int(profile.get("completedCourseCount", 0) or 0),
        completed_research_count=int(profile.get("completedResearchCount", 0) or 0),
        completed_extracurricular_count=int(profile.get("completedExtracurricularCount", 0) or 0),
        risk_tolerance=str(profile.get("riskTolerance", "medium") or "medium"),
    )


def dynamic_hop_penalty(context: ScoringContext) -> float:
    if context.semesters_remaining <= 2:
        timeline_factor = 1.3
    elif context.semesters_remaining <= 4:
        timeline_factor = 1.1
    else:
        timeline_factor = 1.0

    return BASE_HOP_PENALTY * risk_multiplier(context.risk_tolerance) * timeline_factor


def progress_signal(context: ScoringContext) -> float:
    weighted = (
        context.completed_course_count * 0.55
        + context.completed_research_count * 1.2
        + context.completed_extracurricular_count * 0.75
    )
    return clamp(weighted / 12, 0, 1)


def get_edge_base_confidence(edge: dict[str, Any]) -> float:
    explicit_confidence = edge.get("confidence")
    if isinstance(explicit_confidence, (float, int)):
        return clamp(float(explicit_confidence), 0.35, 0.95)

    weight = float(edge.get("weight", 1) or 1)
    edge_kind = edge.get("edgeKind")

    if edge_kind == "club_to_company":
        return clamp(0.52 + weight * 0.09, 0.45, 0.92)
    if edge_kind == "cross_club":
        return clamp(0.46 + weight * 0.07, 0.4, 0.78)
    if edge_kind == "club_to_subprogram":
        return clamp(0.6 + weight * 0.06, 0.5, 0.88)
    return clamp(0.62 + weight * 0.05, 0.5, 0.9)


def normalize_filters(filters: dict[str, Any] | None) -> dict[str, Any]:
    payload = filters or {}
    return {
        "targetCompany": payload.get("targetCompany"),
        "includeTags": payload.get("includeTags", []) if isinstance(payload.get("includeTags"), list) else [],
        "excludeTags": payload.get("excludeTags", []) if isinstance(payload.get("excludeTags"), list) else [],
        "eliminatedClubIds": payload.get("eliminatedClubIds", [])
        if isinstance(payload.get("eliminatedClubIds"), list)
        else [],
        "focusMode": bool(payload.get("focusMode", True)),
        "showFullTree": bool(payload.get("showFullTree", False)),
        "includeClubBridges": bool(payload.get("includeClubBridges", True)),
    }


def normalize_profile(profile: dict[str, Any] | None) -> dict[str, Any]:
    payload = profile or {}
    return {
        "targetCompanies": payload.get("targetCompanies", []) if isinstance(payload.get("targetCompanies"), list) else [],
        "activeTargetCompany": payload.get("activeTargetCompany"),
        "graduationTerm": payload.get("graduationTerm", "Spring"),
        "graduationYear": int(payload.get("graduationYear", 2027) or 2027),
        "semestersRemaining": int(payload.get("semestersRemaining", 4) or 4),
        "completedNodeIds": payload.get("completedNodeIds", [])
        if isinstance(payload.get("completedNodeIds"), list)
        else [],
        "completedCourseCount": int(payload.get("completedCourseCount", 0) or 0),
        "completedResearchCount": int(payload.get("completedResearchCount", 0) or 0),
        "completedExtracurricularCount": int(payload.get("completedExtracurricularCount", 0) or 0),
        "riskTolerance": str(payload.get("riskTolerance", "medium") or "medium"),
    }


def is_node_filtered_out(
    node: dict[str, Any],
    filters: dict[str, Any],
    node_map: dict[str, dict[str, Any]],
) -> bool:
    node_type = node.get("type")
    node_id = node.get("id")
    if node_type in {"root", "company"}:
        return False

    eliminated_club_ids = filters["eliminatedClubIds"]
    if node_type == "club" and node_id in eliminated_club_ids:
        return True

    if node_type == "subprogram":
        parent_club_id = node.get("parentClubId")
        if isinstance(parent_club_id, str) and parent_club_id in eliminated_club_ids:
            return True

    exclude_tags = filters["excludeTags"]
    if exclude_tags and has_tag_overlap(node, exclude_tags):
        return True

    include_tags = filters["includeTags"]
    if include_tags and not has_tag_overlap(node, include_tags):
        parent_club_id = node.get("parentClubId")
        parent = node_map.get(parent_club_id) if isinstance(parent_club_id, str) else None
        if parent and has_tag_overlap(parent, include_tags):
            return False
        return True

    return False


def build_traversable_graph(graph: dict[str, Any], filters: dict[str, Any]) -> TraversableGraph:
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    node_map = {node["id"]: node for node in nodes if isinstance(node, dict) and isinstance(node.get("id"), str)}
    edge_map = {edge["id"]: edge for edge in edges if isinstance(edge, dict) and isinstance(edge.get("id"), str)}

    traversable_node_ids: set[str] = set()
    for node in nodes:
        if isinstance(node, dict) and not is_node_filtered_out(node, filters, node_map):
            traversable_node_ids.add(node["id"])

    adjacency: dict[str, list[dict[str, str]]] = {}
    reverse_adjacency: dict[str, list[str]] = {}
    traversable_edge_ids: set[str] = set()

    for edge in edges:
        if not isinstance(edge, dict):
            continue
        if edge.get("edgeKind") == "cross_club" and not filters["includeClubBridges"]:
            continue

        source = edge.get("source")
        target = edge.get("target")
        edge_id = edge.get("id")
        if not isinstance(source, str) or not isinstance(target, str) or not isinstance(edge_id, str):
            continue
        if source not in traversable_node_ids or target not in traversable_node_ids:
            continue

        adjacency.setdefault(source, []).append({"to": target, "edgeId": edge_id})
        reverse_adjacency.setdefault(target, []).append(source)
        traversable_edge_ids.add(edge_id)

        if edge.get("bidirectional"):
            adjacency.setdefault(target, []).append({"to": source, "edgeId": edge_id})
            reverse_adjacency.setdefault(source, []).append(target)

    return TraversableGraph(
        node_map=node_map,
        edge_map=edge_map,
        adjacency=adjacency,
        reverse_adjacency=reverse_adjacency,
        traversable_node_ids=traversable_node_ids,
        traversable_edge_ids=traversable_edge_ids,
    )


def enumerate_simple_paths(
    start_node_id: str,
    target_node_id: str,
    adjacency: dict[str, list[dict[str, str]]],
) -> list[dict[str, list[str]]]:
    results: list[dict[str, list[str]]] = []

    def visit(
        current_node_id: str,
        visited_node_ids: set[str],
        path_node_ids: list[str],
        path_edge_ids: list[str],
    ) -> None:
        if len(path_edge_ids) > MAX_PATH_DEPTH:
            return

        if current_node_id == target_node_id:
            results.append({"nodeIds": [*path_node_ids], "edgeIds": [*path_edge_ids]})
            return

        for neighbor in adjacency.get(current_node_id, []):
            destination = neighbor["to"]
            if destination in visited_node_ids:
                continue

            visited_node_ids.add(destination)
            path_node_ids.append(destination)
            path_edge_ids.append(neighbor["edgeId"])
            visit(destination, visited_node_ids, path_node_ids, path_edge_ids)
            visited_node_ids.remove(destination)
            path_node_ids.pop()
            path_edge_ids.pop()

    visit(start_node_id, {start_node_id}, [start_node_id], [])
    return results


def path_confidence(
    path: dict[str, list[str]],
    edge_map: dict[str, dict[str, Any]],
    extra_hops: int,
    context: ScoringContext,
) -> float:
    valid_edges = [edge_map[edge_id] for edge_id in path["edgeIds"] if edge_id in edge_map]
    if valid_edges:
        average_edge_confidence = sum(get_edge_base_confidence(edge) for edge in valid_edges) / len(valid_edges)
    else:
        average_edge_confidence = 0.5

    inner_node_count = max(len(path["nodeIds"]) - 2, 1)
    completed_inner_nodes = len([node_id for node_id in path["nodeIds"] if node_id in context.completed_node_ids])
    completion_ratio = completed_inner_nodes / inner_node_count

    timeline_penalty = extra_hops * (0.07 if context.semesters_remaining <= 2 else 0.04)
    progress_boost = progress_signal(context) * 0.1 + completion_ratio * 0.12
    if context.risk_tolerance == "high":
        risk_nudge = 0.02
    elif context.risk_tolerance == "low":
        risk_nudge = -0.02
    else:
        risk_nudge = 0.0

    return clamp(average_edge_confidence + progress_boost + risk_nudge - timeline_penalty, 0.35, 0.97)


def score_paths(
    raw_paths: list[dict[str, list[str]]],
    edge_map: dict[str, dict[str, Any]],
    context: ScoringContext,
) -> list[dict[str, Any]]:
    if not raw_paths:
        return []

    baseline_edge_count = min(len(path["edgeIds"]) for path in raw_paths)
    hop_penalty = dynamic_hop_penalty(context)
    candidates: list[dict[str, Any]] = []

    for index, path in enumerate(raw_paths):
        career_edges = [
            edge_map[edge_id]
            for edge_id in path["edgeIds"]
            if edge_id in edge_map and edge_map[edge_id].get("edgeKind") == "club_to_company"
        ]
        alumni_weight = sum(float(edge.get("weight", 1) or 1) for edge in career_edges)
        effective_alumni_weight = alumni_weight if alumni_weight > 0 else 1
        extra_hops = max(len(path["edgeIds"]) - baseline_edge_count, 0)
        cross_club_hop_count = sum(
            1 for edge_id in path["edgeIds"] if edge_map.get(edge_id, {}).get("edgeKind") == "cross_club"
        )
        confidence = path_confidence(path, edge_map, extra_hops, context)
        completion_hits = len([node_id for node_id in path["nodeIds"] if node_id in context.completed_node_ids])
        completion_boost = 1 + completion_hits * 0.08
        score = (
            effective_alumni_weight
            * confidence
            * completion_boost
            / (1 + hop_penalty * extra_hops + CROSS_CLUB_HOP_PENALTY * cross_club_hop_count)
        )

        rationale = [
            f"Confidence {round(confidence * 100)}%",
            f"{effective_alumni_weight} alumni-weighted outcomes",
        ]
        if completion_hits > 0:
            rationale.append(f"{completion_hits} completed activities align with this route")
        if extra_hops > 0:
            rationale.append(f"{extra_hops} additional hops reduce certainty")
        if cross_club_hop_count > 0:
            rationale.append(f"{cross_club_hop_count} cross-club hops add transition risk")

        candidates.append(
            {
                "id": f"path-{index + 1}",
                "nodeIds": path["nodeIds"],
                "edgeIds": path["edgeIds"],
                "alumniWeight": effective_alumni_weight,
                "extraHops": extra_hops,
                "score": score,
                "confidence": confidence,
                "rationale": rationale,
            }
        )

    candidates.sort(key=lambda item: (-item["score"], len(item["edgeIds"])))
    return candidates


def build_heuristic_path_result(
    graph: dict[str, Any],
    filters: dict[str, Any],
    profile: dict[str, Any] | None,
    top_k: int = DEFAULT_TOP_K,
) -> dict[str, Any]:
    target_company = filters.get("targetCompany")
    if not isinstance(target_company, str) or not target_company:
        return {
            "pathSet": {"primary": None, "secondary": [], "all": [], "reason": "Select a target company to compute a path."},
            "traversableNodeIds": [],
            "traversableEdgeIds": [],
        }

    traversable = build_traversable_graph(graph, filters)
    context = build_scoring_context(profile)

    traversable_node_ids = set(traversable.traversable_node_ids)
    traversable_edge_ids = set(traversable.traversable_edge_ids)
    for source, neighbors in traversable.adjacency.items():
        if neighbors:
            traversable_node_ids.add(source)
        for neighbor in neighbors:
            traversable_node_ids.add(neighbor["to"])

    if target_company not in traversable_node_ids:
        return {
            "pathSet": {"primary": None, "secondary": [], "all": [], "reason": "Target company is filtered out by current constraints."},
            "traversableNodeIds": sorted(traversable_node_ids),
            "traversableEdgeIds": sorted(traversable_edge_ids),
        }

    raw_paths = enumerate_simple_paths(graph["rootNodeId"], target_company, traversable.adjacency)
    candidates = score_paths(raw_paths, traversable.edge_map, context)
    if not candidates:
        return {
            "pathSet": {"primary": None, "secondary": [], "all": [], "reason": "No route found for current filters."},
            "traversableNodeIds": sorted(traversable_node_ids),
            "traversableEdgeIds": sorted(traversable_edge_ids),
        }

    limited_candidates = candidates[: max(top_k, 1)]
    return {
        "pathSet": {
            "primary": limited_candidates[0],
            "secondary": limited_candidates[1:top_k],
            "all": limited_candidates,
        },
        "traversableNodeIds": sorted(traversable_node_ids),
        "traversableEdgeIds": sorted(traversable_edge_ids),
    }


def shortest_hop_distances(traversable: TraversableGraph, target_node_id: str) -> dict[str, int]:
    if target_node_id not in traversable.traversable_node_ids:
        return {}

    distances = {target_node_id: 0}
    queue: deque[str] = deque([target_node_id])
    while queue:
        current = queue.popleft()
        current_distance = distances[current]
        for previous in traversable.reverse_adjacency.get(current, []):
            if previous in distances:
                continue
            distances[previous] = current_distance + 1
            queue.append(previous)
    return distances


def risk_feature_values(risk_tolerance: str) -> tuple[float, float, float]:
    return (
        1.0 if risk_tolerance == "low" else 0.0,
        1.0 if risk_tolerance == "medium" else 0.0,
        1.0 if risk_tolerance == "high" else 0.0,
    )


def vector_to_feature_map(values: Sequence[float]) -> dict[str, float]:
    return {name: float(value) for name, value in zip(FEATURE_NAMES, values, strict=True)}


def feature_map_to_vector(feature_map: dict[str, float], feature_names: Sequence[str] = FEATURE_NAMES) -> list[float]:
    return [float(feature_map.get(name, 0.0)) for name in feature_names]


def current_distance(distances: dict[str, int], node_id: str) -> int:
    return distances.get(node_id, MAX_PATH_DEPTH + 1)


def build_action_feature_map(
    traversable: TraversableGraph,
    filters: dict[str, Any],
    profile: dict[str, Any],
    current_node_id: str,
    neighbor: dict[str, str],
    target_node_id: str,
    distances: dict[str, int],
    path_depth: int,
    cross_club_count: int,
) -> dict[str, float]:
    edge = traversable.edge_map[neighbor["edgeId"]]
    destination = traversable.node_map[neighbor["to"]]
    edge_kind = str(edge.get("edgeKind"))
    destination_type = str(destination.get("type"))

    max_edge_weight = max(
        [float(candidate.get("weight", 1) or 1) for candidate in traversable.edge_map.values()],
        default=1.0,
    )
    next_cross_club_count = cross_club_count + (1 if edge_kind == "cross_club" else 0)
    semesters_remaining = int(profile.get("semestersRemaining", 4) or 4)
    risk_low, risk_medium, risk_high = risk_feature_values(str(profile.get("riskTolerance", "medium") or "medium"))
    include_tags = filters.get("includeTags", [])
    completed_node_ids = set(profile.get("completedNodeIds", []))

    distance_now = current_distance(distances, current_node_id)
    distance_next = current_distance(distances, neighbor["to"])

    shortest_hop_distance_norm = clamp(distance_next / MAX_PATH_DEPTH, 0.0, 1.5)
    distance_improvement_norm = clamp((distance_now - distance_next) / MAX_PATH_DEPTH, -1.0, 1.0)

    feature_map = {
        "edge_kind_root_to_club": 1.0 if edge_kind == "root_to_club" else 0.0,
        "edge_kind_club_to_subprogram": 1.0 if edge_kind == "club_to_subprogram" else 0.0,
        "edge_kind_club_to_company": 1.0 if edge_kind == "club_to_company" else 0.0,
        "edge_kind_cross_club": 1.0 if edge_kind == "cross_club" else 0.0,
        "destination_type_root": 1.0 if destination_type == "root" else 0.0,
        "destination_type_club": 1.0 if destination_type == "club" else 0.0,
        "destination_type_subprogram": 1.0 if destination_type == "subprogram" else 0.0,
        "destination_type_company": 1.0 if destination_type == "company" else 0.0,
        "normalized_edge_weight": clamp(float(edge.get("weight", 1) or 1) / max_edge_weight, 0.0, 1.0),
        "base_edge_confidence": get_edge_base_confidence(edge),
        "shortest_hop_distance_norm": shortest_hop_distance_norm,
        "distance_improvement_norm": distance_improvement_norm,
        "include_tag_overlap": 1.0 if include_tags and has_tag_overlap(destination, include_tags) else 0.0,
        "completed_node_hit": 1.0 if neighbor["to"] in completed_node_ids else 0.0,
        "path_depth_norm": clamp((path_depth + 1) / MAX_PATH_DEPTH, 0.0, 1.0),
        "cross_club_count_norm": clamp(next_cross_club_count / MAX_PATH_DEPTH, 0.0, 1.0),
        "semesters_remaining_norm": clamp(semesters_remaining / 10, 0.0, 1.0),
        "risk_low": risk_low,
        "risk_medium": risk_medium,
        "risk_high": risk_high,
        "destination_is_target": 1.0 if neighbor["to"] == target_node_id else 0.0,
    }
    return feature_map


def compute_action_reward(
    feature_map: dict[str, float],
    edge: dict[str, Any],
    distance_now: int,
    distance_next: int,
    done: bool,
    reached_target: bool,
    reward_config: dict[str, float] | None = None,
) -> float:
    config = reward_config or DEFAULT_REWARD_CONFIG
    reward = float(config["step_penalty"])
    if edge.get("edgeKind") == "cross_club":
        reward += float(config["cross_club_penalty"])
    if distance_next >= distance_now:
        reward += float(config["no_progress_penalty"])
    if feature_map["include_tag_overlap"] > 0:
        reward += float(config["include_tag_bonus"])
    if feature_map["completed_node_hit"] > 0:
        reward += float(config["completed_node_bonus"])

    if reached_target:
        reward += (
            float(config["terminal_success"])
            + float(config["terminal_weight_bonus"]) * feature_map["normalized_edge_weight"]
            + float(config["terminal_confidence_bonus"]) * feature_map["base_edge_confidence"]
        )
    elif done:
        reward += float(config["terminal_failure"])

    return reward


def policy_score(policy: PolicyBundle, feature_vector: Sequence[float]) -> float:
    return float(sum(weight * value for weight, value in zip(policy.weights, feature_vector, strict=True)) + policy.bias)


def contribution_map(policy: PolicyBundle, feature_map: dict[str, float]) -> dict[str, float]:
    return {
        feature_name: feature_map.get(feature_name, 0.0) * policy.weights[index]
        for index, feature_name in enumerate(policy.feature_names)
    }


def legal_actions(
    traversable: TraversableGraph,
    current_node_id: str,
    visited_node_ids: frozenset[str] | set[str],
) -> list[dict[str, str]]:
    return [
        neighbor
        for neighbor in traversable.adjacency.get(current_node_id, [])
        if neighbor["to"] not in visited_node_ids
    ]


def explain_feature(feature_name: str, positive: bool) -> str:
    explanations = {
        "destination_is_target": ("directly reaches the target company", "does not reach the target yet"),
        "normalized_edge_weight": ("has stronger alumni weight", "has weaker alumni support"),
        "base_edge_confidence": ("rests on more reliable historical evidence", "rests on lower-confidence evidence"),
        "distance_improvement_norm": ("keeps reducing the remaining hop distance", "fails to move closer to the target"),
        "include_tag_overlap": ("matches the selected interest tags", "does not align with the selected tags"),
        "completed_node_hit": ("builds on activities already completed", "does not leverage completed activities"),
        "path_depth_norm": ("stays relatively short", "gets longer and harder to execute"),
        "cross_club_count_norm": ("avoids extra club transitions", "adds more club-to-club transitions"),
        "edge_kind_cross_club": ("uses a bridge only when it helps", "depends on a cross-club bridge"),
        "shortest_hop_distance_norm": ("keeps the target nearby", "leaves too much distance remaining"),
        "semesters_remaining_norm": ("fits the remaining timeline", "is tight for the remaining timeline"),
    }
    positive_text, negative_text = explanations.get(
        feature_name,
        (feature_name.replace("_", " "), feature_name.replace("_", " ")),
    )
    return positive_text if positive else negative_text


def build_rationale(
    policy: PolicyBundle,
    feature_maps: Sequence[dict[str, float]],
    confidence: float,
) -> list[str]:
    aggregate_contributions = {feature_name: 0.0 for feature_name in policy.feature_names}
    for feature_map in feature_maps:
        for feature_name, contribution in contribution_map(policy, feature_map).items():
            aggregate_contributions[feature_name] += contribution

    positive = sorted(
        [(name, value) for name, value in aggregate_contributions.items() if value > 0],
        key=lambda item: item[1],
        reverse=True,
    )
    negative = sorted(
        [(name, value) for name, value in aggregate_contributions.items() if value < 0],
        key=lambda item: item[1],
    )

    rationale = [f"Confidence {round(confidence * 100)}%"]
    if positive:
        rationale.append(f"Best signal: {explain_feature(positive[0][0], True)}")
    if len(positive) > 1:
        rationale.append(f"Also helps: {explain_feature(positive[1][0], True)}")
    if negative:
        rationale.append(f"Primary tradeoff: {explain_feature(negative[0][0], False)}")
    return rationale


def beam_search_paths(
    graph: dict[str, Any],
    traversable: TraversableGraph,
    filters: dict[str, Any],
    profile: dict[str, Any],
    policy: PolicyBundle,
    top_k: int,
    beam_size: int = DEFAULT_BEAM_SIZE,
) -> list[dict[str, Any]]:
    target_node_id = filters["targetCompany"]
    distances = shortest_hop_distances(traversable, target_node_id)
    if not distances:
        return []

    root_node_id = graph["rootNodeId"]
    active: list[SearchState] = [
        SearchState(
            node_id=root_node_id,
            visited_node_ids=frozenset({root_node_id}),
            node_ids=(root_node_id,),
            edge_ids=(),
            q_values=(),
            feature_maps=(),
            cross_club_count=0,
        )
    ]
    completed: list[SearchState] = []

    for _ in range(MAX_PATH_DEPTH + 1):
        expansions: list[tuple[float, float, SearchState]] = []
        for state in active:
            if state.node_id == target_node_id:
                completed.append(state)
                continue

            for neighbor in legal_actions(traversable, state.node_id, state.visited_node_ids):
                feature_map = build_action_feature_map(
                    traversable=traversable,
                    filters=filters,
                    profile=profile,
                    current_node_id=state.node_id,
                    neighbor=neighbor,
                    target_node_id=target_node_id,
                    distances=distances,
                    path_depth=len(state.edge_ids),
                    cross_club_count=state.cross_club_count,
                )
                feature_vector = feature_map_to_vector(feature_map, policy.feature_names)
                q_value = policy_score(policy, feature_vector)
                next_node_id = neighbor["to"]
                next_cross_club_count = state.cross_club_count + (
                    1 if traversable.edge_map[neighbor["edgeId"]].get("edgeKind") == "cross_club" else 0
                )
                next_state = SearchState(
                    node_id=next_node_id,
                    visited_node_ids=state.visited_node_ids | {next_node_id},
                    node_ids=(*state.node_ids, next_node_id),
                    edge_ids=(*state.edge_ids, neighbor["edgeId"]),
                    q_values=(*state.q_values, q_value),
                    feature_maps=(*state.feature_maps, feature_map),
                    cross_club_count=next_cross_club_count,
                )
                mean_q = sum(next_state.q_values) / len(next_state.q_values)
                expansions.append((mean_q, -len(next_state.edge_ids), next_state))

        if not expansions:
            break

        expansions.sort(key=lambda item: (item[0], item[1]), reverse=True)
        deduped: list[SearchState] = []
        seen_sequences: set[tuple[str, ...]] = set()
        for _, _, next_state in expansions:
            if next_state.edge_ids in seen_sequences:
                continue
            seen_sequences.add(next_state.edge_ids)
            deduped.append(next_state)
            if len(deduped) >= beam_size:
                break
        active = deduped

    for state in active:
        if state.node_id == target_node_id:
            completed.append(state)

    if not completed:
        return []

    baseline_edge_count = min(len(state.edge_ids) for state in completed)
    unique_completed: list[dict[str, Any]] = []
    seen_edge_sequences: set[tuple[str, ...]] = set()
    for state in sorted(
        completed,
        key=lambda entry: (-(sum(entry.q_values) / len(entry.q_values)), len(entry.edge_ids)),
    ):
        if state.edge_ids in seen_edge_sequences:
            continue
        seen_edge_sequences.add(state.edge_ids)

        career_edges = [
            traversable.edge_map[edge_id]
            for edge_id in state.edge_ids
            if traversable.edge_map[edge_id].get("edgeKind") == "club_to_company"
        ]
        alumni_weight = sum(float(edge.get("weight", 1) or 1) for edge in career_edges) or 1
        extra_hops = max(len(state.edge_ids) - baseline_edge_count, 0)
        mean_q = sum(state.q_values) / len(state.q_values)
        confidence = clamp(0.35 + 0.62 * sigmoid(mean_q), 0.35, 0.97)
        score = sigmoid(mean_q) * 100
        unique_completed.append(
            {
                "id": f"path-{len(unique_completed) + 1}",
                "nodeIds": list(state.node_ids),
                "edgeIds": list(state.edge_ids),
                "alumniWeight": alumni_weight,
                "extraHops": extra_hops,
                "score": score,
                "confidence": confidence,
                "rationale": build_rationale(policy, state.feature_maps, confidence),
            }
        )
        if len(unique_completed) >= max(top_k, 1):
            break

    return unique_completed


def default_artifact_paths(base_dir: Path | None = None) -> dict[str, Path]:
    root = base_dir or DEFAULT_ARTIFACTS_DIR
    return {
        "checkpoint": root / "policy.pt",
        "checkpoint_json": root / "policy.json",
        "manifest": root / "feature_manifest.json",
        "summary": root / "training_summary.json",
    }


def save_policy_checkpoint(checkpoint_path: Path, payload: dict[str, Any]) -> None:
    checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
    if torch is not None:
        torch.save(payload, checkpoint_path)
        return

    checkpoint_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def load_torch_archive_without_torch(checkpoint_path: Path) -> dict[str, Any] | None:
    try:
        with zipfile.ZipFile(checkpoint_path, "r") as archive:
            data_entry = next((name for name in archive.namelist() if name.endswith("data.pkl")), None)
            if not data_entry:
                return None
            payload = pickle.loads(archive.read(data_entry))
            if not isinstance(payload, dict):
                return None
            return payload
    except (zipfile.BadZipFile, pickle.UnpicklingError, EOFError, AttributeError, ValueError):
        return None


def load_policy_bundle(
    checkpoint_path: str | Path | None,
    feature_manifest_path: str | Path | None = None,
    training_summary_path: str | Path | None = None,
) -> PolicyBundle | None:
    if not checkpoint_path:
        return None

    resolved_checkpoint = Path(checkpoint_path)
    if not resolved_checkpoint.exists():
        return None

    manifest_data: dict[str, Any] | None = None
    summary_data: dict[str, Any] | None = None
    if feature_manifest_path:
        manifest_path = Path(feature_manifest_path)
        if manifest_path.exists():
            manifest_data = json.loads(manifest_path.read_text(encoding="utf-8"))
    if training_summary_path:
        summary_path = Path(training_summary_path)
        if summary_path.exists():
            summary_data = json.loads(summary_path.read_text(encoding="utf-8"))

    payload: dict[str, Any] | None = None
    if torch is not None:
        loaded = torch.load(resolved_checkpoint, map_location="cpu")
        if not isinstance(loaded, dict):
            return None
        payload = loaded
    else:
        try:
            payload = json.loads(resolved_checkpoint.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            payload = load_torch_archive_without_torch(resolved_checkpoint)
            if payload is None:
                fallback_json_path = resolved_checkpoint.with_suffix(".json")
                if not fallback_json_path.exists():
                    return None
                try:
                    payload = json.loads(fallback_json_path.read_text(encoding="utf-8"))
                except (json.JSONDecodeError, UnicodeDecodeError):
                    return None

    if payload is None:
        return None

    if "state_dict" in payload:
        state_dict = payload["state_dict"]
        if torch is None or not isinstance(state_dict, dict):
            return None
        weights_tensor = state_dict.get("weight")
        bias_tensor = state_dict.get("bias")
        if weights_tensor is None or bias_tensor is None:
            return None
        weights = [float(value) for value in weights_tensor.reshape(-1).tolist()]
        bias = float(bias_tensor.reshape(-1).tolist()[0])
    else:
        weights = [float(value) for value in payload.get("weights", [])]
        bias = float(payload.get("bias", 0.0))

    feature_names = payload.get("feature_names") or (manifest_data or {}).get("feature_names") or FEATURE_NAMES
    if not isinstance(feature_names, list) or len(feature_names) != len(weights):
        return None

    return PolicyBundle(
        feature_names=[str(name) for name in feature_names],
        weights=weights,
        bias=bias,
        checkpoint_path=str(resolved_checkpoint),
        training_summary=summary_data or payload.get("training_summary"),
        manifest=manifest_data or payload.get("manifest"),
    )


def synthetic_task(graph: dict[str, Any], randomizer: random.Random) -> tuple[dict[str, Any], dict[str, Any]]:
    companies = [node["id"] for node in graph.get("nodes", []) if node.get("type") == "company"]
    tags = unique_strings(
        tag
        for node in graph.get("nodes", [])
        if node.get("type") in {"club", "subprogram"}
        for tag in node.get("tags", [])
        if tag not in {"student", "start", "career"}
    )
    clubs = [node["id"] for node in graph.get("nodes", []) if node.get("type") == "club"]
    activities = [node["id"] for node in graph.get("nodes", []) if node.get("type") in {"club", "subprogram"}]

    target_company = randomizer.choice(companies) if companies else None
    include_tags = randomizer.sample(tags, k=min(len(tags), randomizer.randint(0, 2))) if tags else []
    excluded_pool = [tag for tag in tags if tag not in include_tags]
    exclude_tags = randomizer.sample(excluded_pool, k=min(len(excluded_pool), randomizer.randint(0, 1))) if excluded_pool else []
    eliminated = randomizer.sample(clubs, k=min(len(clubs), randomizer.randint(0, 1))) if clubs else []
    completed = randomizer.sample(activities, k=min(len(activities), randomizer.randint(0, 3))) if activities else []

    filters = {
        "targetCompany": target_company,
        "includeTags": include_tags,
        "excludeTags": exclude_tags,
        "eliminatedClubIds": eliminated,
        "focusMode": True,
        "showFullTree": False,
        "includeClubBridges": randomizer.random() > 0.2,
    }
    profile = {
        "targetCompanies": [target_company] if target_company else [],
        "activeTargetCompany": target_company,
        "graduationTerm": randomizer.choice(["Spring", "Summer", "Fall"]),
        "graduationYear": randomizer.randint(2026, 2032),
        "semestersRemaining": randomizer.randint(1, 8),
        "completedNodeIds": completed,
        "completedCourseCount": randomizer.randint(0, 12),
        "completedResearchCount": randomizer.randint(0, 3),
        "completedExtracurricularCount": randomizer.randint(0, 8),
        "riskTolerance": randomizer.choice(["low", "medium", "high"]),
    }
    return filters, profile


def train_linear_policy(
    graph: dict[str, Any],
    output_dir: str | Path,
    episodes: int = DEFAULT_TRAINING_CONFIG["episodes"],
    gamma: float = DEFAULT_TRAINING_CONFIG["gamma"],
    lr: float = DEFAULT_TRAINING_CONFIG["lr"],
    batch_size: int = DEFAULT_TRAINING_CONFIG["batch_size"],
    replay_size: int = DEFAULT_TRAINING_CONFIG["replay_size"],
    epsilon_start: float = DEFAULT_TRAINING_CONFIG["epsilon_start"],
    epsilon_end: float = DEFAULT_TRAINING_CONFIG["epsilon_end"],
    seed: int = DEFAULT_TRAINING_CONFIG["seed"],
) -> dict[str, Any]:
    if torch is None or nn is None:
        raise RuntimeError("PyTorch is required to train the linear Q policy.")

    randomizer = random.Random(seed)
    torch.manual_seed(seed)

    model = nn.Linear(len(FEATURE_NAMES), 1)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    loss_fn = nn.MSELoss()
    replay_buffer: deque[dict[str, Any]] = deque(maxlen=replay_size)

    episode_rewards: list[float] = []
    success_count = 0
    total_steps = 0

    for episode_index in range(episodes):
        filters, profile = synthetic_task(graph, randomizer)
        if not filters["targetCompany"]:
            continue

        traversable = build_traversable_graph(graph, filters)
        distances = shortest_hop_distances(traversable, filters["targetCompany"])
        if not distances:
            continue

        current_node_id = graph["rootNodeId"]
        visited_node_ids: set[str] = {current_node_id}
        depth = 0
        cross_club_count = 0
        episode_reward = 0.0

        while depth < MAX_PATH_DEPTH:
            actions = legal_actions(traversable, current_node_id, visited_node_ids)
            if not actions:
                episode_reward += DEFAULT_REWARD_CONFIG["terminal_failure"]
                break

            epsilon_progress = episode_index / max(episodes - 1, 1)
            epsilon = epsilon_start + (epsilon_end - epsilon_start) * epsilon_progress

            action_features: list[tuple[dict[str, str], dict[str, float], list[float], float]] = []
            for neighbor in actions:
                feature_map = build_action_feature_map(
                    traversable=traversable,
                    filters=filters,
                    profile=profile,
                    current_node_id=current_node_id,
                    neighbor=neighbor,
                    target_node_id=filters["targetCompany"],
                    distances=distances,
                    path_depth=depth,
                    cross_club_count=cross_club_count,
                )
                vector = feature_map_to_vector(feature_map)
                with torch.no_grad():
                    q_value = float(model(torch.tensor([vector], dtype=torch.float32)).item())
                action_features.append((neighbor, feature_map, vector, q_value))

            if randomizer.random() < epsilon:
                neighbor, feature_map, feature_vector, _ = randomizer.choice(action_features)
            else:
                neighbor, feature_map, feature_vector, _ = max(action_features, key=lambda item: item[3])

            next_node_id = neighbor["to"]
            edge = traversable.edge_map[neighbor["edgeId"]]
            next_depth = depth + 1
            next_cross_club_count = cross_club_count + (1 if edge.get("edgeKind") == "cross_club" else 0)
            reached_target = next_node_id == filters["targetCompany"]
            next_visited = visited_node_ids | {next_node_id}
            next_actions = [] if reached_target else legal_actions(traversable, next_node_id, next_visited)
            done = reached_target or next_depth >= MAX_PATH_DEPTH or not next_actions
            reward = compute_action_reward(
                feature_map=feature_map,
                edge=edge,
                distance_now=current_distance(distances, current_node_id),
                distance_next=current_distance(distances, next_node_id),
                done=done,
                reached_target=reached_target,
            )

            next_vectors: list[list[float]] = []
            if not done:
                for candidate in next_actions:
                    next_feature_map = build_action_feature_map(
                        traversable=traversable,
                        filters=filters,
                        profile=profile,
                        current_node_id=next_node_id,
                        neighbor=candidate,
                        target_node_id=filters["targetCompany"],
                        distances=distances,
                        path_depth=next_depth,
                        cross_club_count=next_cross_club_count,
                    )
                    next_vectors.append(feature_map_to_vector(next_feature_map))

            replay_buffer.append(
                {
                    "feature_vector": feature_vector,
                    "reward": reward,
                    "next_vectors": next_vectors,
                    "done": done,
                }
            )

            episode_reward += reward
            total_steps += 1

            if len(replay_buffer) >= batch_size:
                batch = randomizer.sample(list(replay_buffer), batch_size)
                feature_tensor = torch.tensor([item["feature_vector"] for item in batch], dtype=torch.float32)
                predicted = model(feature_tensor).reshape(-1)

                targets: list[float] = []
                with torch.no_grad():
                    for item in batch:
                        if item["done"] or not item["next_vectors"]:
                            targets.append(float(item["reward"]))
                            continue

                        next_tensor = torch.tensor(item["next_vectors"], dtype=torch.float32)
                        next_q = model(next_tensor).reshape(-1)
                        targets.append(float(item["reward"] + gamma * float(torch.max(next_q).item())))

                target_tensor = torch.tensor(targets, dtype=torch.float32)
                loss = loss_fn(predicted, target_tensor)
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()

            if done:
                if reached_target:
                    success_count += 1
                break

            current_node_id = next_node_id
            visited_node_ids = next_visited
            depth = next_depth
            cross_club_count = next_cross_club_count

        episode_rewards.append(episode_reward)

    output_root = Path(output_dir)
    output_root.mkdir(parents=True, exist_ok=True)
    checkpoint_path = output_root / "policy.pt"
    checkpoint_json_path = output_root / "policy.json"
    manifest_path = output_root / "feature_manifest.json"
    summary_path = output_root / "training_summary.json"

    serialized_payload = {
        "feature_names": FEATURE_NAMES,
        "weights": [float(value) for value in model.weight.detach().reshape(-1).tolist()],
        "bias": float(model.bias.detach().reshape(-1).tolist()[0]),
        "training_summary": {
            "episodes": episodes,
            "gamma": gamma,
            "lr": lr,
            "batch_size": batch_size,
            "replay_size": replay_size,
            "epsilon_start": epsilon_start,
            "epsilon_end": epsilon_end,
            "seed": seed,
        },
    }

    save_policy_checkpoint(
        checkpoint_path,
        serialized_payload,
    )
    checkpoint_json_path.write_text(json.dumps(serialized_payload, indent=2), encoding="utf-8")

    manifest = {
        "feature_names": FEATURE_NAMES,
        "reward_config": DEFAULT_REWARD_CONFIG,
        "max_path_depth": MAX_PATH_DEPTH,
        "beam_size": DEFAULT_BEAM_SIZE,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    average_reward = sum(episode_rewards) / len(episode_rewards) if episode_rewards else 0.0
    training_summary = {
        "status": "trained",
        "episodes": episodes,
        "successful_episodes": success_count,
        "success_rate": success_count / len(episode_rewards) if episode_rewards else 0.0,
        "average_reward": average_reward,
        "total_steps": total_steps,
        "checkpoint_path": str(checkpoint_path),
        "checkpoint_json_path": str(checkpoint_json_path),
        "feature_manifest_path": str(manifest_path),
        "seed": seed,
    }
    summary_path.write_text(json.dumps(training_summary, indent=2), encoding="utf-8")

    return {
        "checkpoint_path": str(checkpoint_path),
        "checkpoint_json_path": str(checkpoint_json_path),
        "feature_manifest_path": str(manifest_path),
        "training_summary_path": str(summary_path),
        "summary": training_summary,
    }


def company_targets(graph: dict[str, Any], filters: dict[str, Any], profile: dict[str, Any]) -> list[str]:
    company_ids = {
        node["id"]
        for node in graph.get("nodes", [])
        if isinstance(node, dict) and node.get("type") == "company" and isinstance(node.get("id"), str)
    }
    requested = unique_strings(
        company_id
        for company_id in [
            *(profile.get("targetCompanies", []) if isinstance(profile.get("targetCompanies"), list) else []),
            filters.get("targetCompany"),
        ]
        if isinstance(company_id, str) and company_id in company_ids
    )
    return requested


def label_for_node(graph: dict[str, Any], node_id: str) -> str:
    for node in graph.get("nodes", []):
        if node.get("id") == node_id:
            return str(node.get("label", node_id))
    return node_id


def build_company_outlook(
    graph: dict[str, Any],
    filters: dict[str, Any],
    profile: dict[str, Any],
    top_k: int,
    policy: PolicyBundle | None,
) -> list[dict[str, Any]]:
    outlook: list[dict[str, Any]] = []
    for company_id in company_targets(graph, filters, profile):
        company_filters = {**filters, "targetCompany": company_id}
        result = build_recommendation(graph, company_filters, profile, top_k=top_k, policy=policy)
        primary = result["pathSet"]["primary"]
        outlook.append(
            {
                "companyId": company_id,
                "label": label_for_node(graph, company_id),
                "confidence": primary["confidence"] if primary else None,
                "hasRoute": bool(primary),
            }
        )
    return outlook


def build_recommendation(
    graph: dict[str, Any],
    filters: dict[str, Any] | None,
    profile: dict[str, Any] | None,
    top_k: int = DEFAULT_TOP_K,
    policy: PolicyBundle | None = None,
) -> dict[str, Any]:
    normalized_filters = normalize_filters(filters)
    normalized_profile = normalize_profile(profile)

    if policy is None:
        return build_heuristic_path_result(graph, normalized_filters, normalized_profile, top_k=top_k)

    target_company = normalized_filters.get("targetCompany")
    if not isinstance(target_company, str) or not target_company:
        return build_heuristic_path_result(graph, normalized_filters, normalized_profile, top_k=top_k)

    traversable = build_traversable_graph(graph, normalized_filters)
    traversable_node_ids = sorted(traversable.traversable_node_ids)
    traversable_edge_ids = sorted(traversable.traversable_edge_ids)
    if target_company not in traversable.traversable_node_ids:
        return {
            "pathSet": {"primary": None, "secondary": [], "all": [], "reason": "Target company is filtered out by current constraints."},
            "traversableNodeIds": traversable_node_ids,
            "traversableEdgeIds": traversable_edge_ids,
        }

    candidates = beam_search_paths(
        graph=graph,
        traversable=traversable,
        filters=normalized_filters,
        profile=normalized_profile,
        policy=policy,
        top_k=top_k,
    )
    if not candidates:
        return build_heuristic_path_result(graph, normalized_filters, normalized_profile, top_k=top_k)

    return {
        "pathSet": {
            "primary": candidates[0],
            "secondary": candidates[1:top_k],
            "all": candidates[:top_k],
        },
        "traversableNodeIds": traversable_node_ids,
        "traversableEdgeIds": traversable_edge_ids,
    }


def recommend_paths_payload(
    graph: dict[str, Any],
    filters: dict[str, Any] | None,
    profile: dict[str, Any] | None,
    top_k: int = DEFAULT_TOP_K,
    mode: str = DEFAULT_POLICY_MODE,
    checkpoint_path: str | None = None,
    feature_manifest_path: str | None = None,
    training_summary_path: str | None = None,
) -> dict[str, Any]:
    normalized_filters = normalize_filters(filters)
    normalized_profile = normalize_profile(profile)
    artifact_paths = default_artifact_paths()

    resolved_checkpoint_path = checkpoint_path or str(artifact_paths["checkpoint"])
    resolved_manifest_path = feature_manifest_path or str(artifact_paths["manifest"])
    resolved_summary_path = training_summary_path or str(artifact_paths["summary"])

    policy: PolicyBundle | None = None
    active_mode = mode or DEFAULT_POLICY_MODE
    reason = None

    if active_mode != "heuristic":
        policy = load_policy_bundle(
            checkpoint_path=resolved_checkpoint_path,
            feature_manifest_path=resolved_manifest_path,
            training_summary_path=resolved_summary_path,
        )
        if policy is None:
            reason = "RL checkpoint unavailable. Falling back to heuristic recommendations."
            active_mode = "heuristic"
    else:
        reason = "Heuristic mode requested."

    recommendation = build_recommendation(
        graph=graph,
        filters=normalized_filters,
        profile=normalized_profile,
        top_k=top_k,
        policy=policy,
    )
    company_outlook = build_company_outlook(
        graph=graph,
        filters=normalized_filters,
        profile=normalized_profile,
        top_k=top_k,
        policy=policy if active_mode == "rl" else None,
    )

    return {
        **recommendation,
        "companyOutlook": company_outlook,
        "modelMeta": {
            "mode": active_mode,
            "policyLoaded": policy is not None,
            "checkpointPath": resolved_checkpoint_path,
            "checkpointJsonPath": str(artifact_paths["checkpoint_json"]),
            "featureManifestPath": resolved_manifest_path,
            "reason": reason,
            "featureNames": policy.feature_names if policy else FEATURE_NAMES,
        },
    }
