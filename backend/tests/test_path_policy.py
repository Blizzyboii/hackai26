from __future__ import annotations

import pickle
import zipfile
from pathlib import Path

from backend.rl.path_policy import (
    FEATURE_NAMES,
    PolicyBundle,
    build_recommendation,
    build_traversable_graph,
    compute_action_reward,
    load_policy_bundle,
    recommend_paths_payload,
    save_policy_checkpoint,
    shortest_hop_distances,
)


def sample_graph():
    return {
        "rootNodeId": "root",
        "nodes": [
            {"id": "root", "type": "root", "label": "You", "tags": ["student", "start"], "size": "lg", "people": []},
            {"id": "club-acm", "type": "club", "label": "ACM", "tags": ["technology"], "size": "lg", "people": []},
            {"id": "club-ais", "type": "club", "label": "AIS", "tags": ["business"], "size": "lg", "people": []},
            {"id": "club-fintech", "type": "club", "label": "FinTech", "tags": ["finance"], "size": "lg", "people": []},
            {
                "id": "company-jpmorgan",
                "type": "company",
                "label": "JPMorgan",
                "tags": ["finance", "career"],
                "size": "md",
                "people": [],
            },
        ],
        "edges": [
            {
                "id": "e-root-acm",
                "source": "root",
                "target": "club-acm",
                "type": "hierarchy",
                "edgeKind": "root_to_club",
                "weight": 5,
                "people": [],
            },
            {
                "id": "e-root-ais",
                "source": "root",
                "target": "club-ais",
                "type": "hierarchy",
                "edgeKind": "root_to_club",
                "weight": 4,
                "people": [],
            },
            {
                "id": "e-root-fintech",
                "source": "root",
                "target": "club-fintech",
                "type": "hierarchy",
                "edgeKind": "root_to_club",
                "weight": 3,
                "people": [],
            },
            {
                "id": "e-acm-jp",
                "source": "club-acm",
                "target": "company-jpmorgan",
                "type": "career",
                "edgeKind": "club_to_company",
                "weight": 2,
                "people": [],
            },
            {
                "id": "e-ais-jp",
                "source": "club-ais",
                "target": "company-jpmorgan",
                "type": "career",
                "edgeKind": "club_to_company",
                "weight": 1,
                "people": [],
            },
            {
                "id": "e-fintech-jp",
                "source": "club-fintech",
                "target": "company-jpmorgan",
                "type": "career",
                "edgeKind": "club_to_company",
                "weight": 1,
                "people": [],
            },
            {
                "id": "e-bridge-ais-acm",
                "source": "club-ais",
                "target": "club-acm",
                "type": "club_bridge",
                "edgeKind": "cross_club",
                "weight": 1,
                "bidirectional": True,
                "people": [],
            },
        ],
    }


def default_filters():
    return {
        "targetCompany": "company-jpmorgan",
        "includeTags": [],
        "excludeTags": [],
        "eliminatedClubIds": [],
        "focusMode": True,
        "showFullTree": False,
        "includeClubBridges": True,
    }


def default_profile():
    return {
        "targetCompanies": ["company-jpmorgan"],
        "activeTargetCompany": "company-jpmorgan",
        "graduationTerm": "Spring",
        "graduationYear": 2027,
        "semestersRemaining": 4,
        "completedNodeIds": ["club-acm"],
        "completedCourseCount": 8,
        "completedResearchCount": 1,
        "completedExtracurricularCount": 2,
        "riskTolerance": "medium",
    }


def test_build_traversable_graph_matches_tag_filter_behavior():
    graph = sample_graph()
    filters = {**default_filters(), "includeTags": ["finance"]}

    traversable = build_traversable_graph(graph, filters)

    assert "club-fintech" in traversable.traversable_node_ids
    assert "club-acm" not in traversable.traversable_node_ids
    assert "company-jpmorgan" in traversable.traversable_node_ids


def test_shortest_hop_distances_respect_bidirectional_bridges():
    graph = sample_graph()
    traversable = build_traversable_graph(graph, default_filters())

    distances = shortest_hop_distances(traversable, "company-jpmorgan")

    assert distances["company-jpmorgan"] == 0
    assert distances["club-acm"] == 1
    assert distances["club-ais"] == 1
    assert distances["root"] == 2


def test_reward_shaping_combines_penalties_and_bonuses():
    reward = compute_action_reward(
        feature_map={
            "include_tag_overlap": 1.0,
            "completed_node_hit": 1.0,
            "normalized_edge_weight": 0.5,
            "base_edge_confidence": 0.8,
        },
        edge={"edgeKind": "cross_club"},
        distance_now=2,
        distance_next=2,
        done=True,
        reached_target=False,
    )

    assert reward == -1.25


def test_checkpoint_round_trip_preserves_linear_weights(tmp_path: Path):
    checkpoint_path = tmp_path / "policy.pt"
    payload = {
        "feature_names": FEATURE_NAMES,
        "weights": [float(index) / 10 for index, _ in enumerate(FEATURE_NAMES)],
        "bias": 0.35,
    }

    save_policy_checkpoint(checkpoint_path, payload)
    loaded = load_policy_bundle(checkpoint_path)

    assert loaded is not None
    assert loaded.weights == payload["weights"]
    assert loaded.bias == payload["bias"]
    assert loaded.feature_names == FEATURE_NAMES


def test_load_policy_bundle_reads_torch_archive_without_torch(tmp_path: Path):
    checkpoint_path = tmp_path / "policy.pt"
    payload = {
        "feature_names": FEATURE_NAMES,
        "weights": [0.25 for _ in FEATURE_NAMES],
        "bias": 0.1,
    }

    with zipfile.ZipFile(checkpoint_path, "w") as archive:
        archive.writestr("policy/data.pkl", pickle.dumps(payload))

    loaded = load_policy_bundle(checkpoint_path)

    assert loaded is not None
    assert loaded.weights == payload["weights"]
    assert loaded.bias == payload["bias"]


def test_rl_beam_search_prefers_direct_stronger_acm_path():
    graph = sample_graph()
    filters = default_filters()
    profile = default_profile()

    weights = [0.0 for _ in FEATURE_NAMES]
    for index, name in enumerate(FEATURE_NAMES):
        if name == "normalized_edge_weight":
            weights[index] = 1.5
        elif name == "base_edge_confidence":
            weights[index] = 1.0
        elif name == "distance_improvement_norm":
            weights[index] = 0.8
        elif name == "destination_is_target":
            weights[index] = 2.0
        elif name == "shortest_hop_distance_norm":
            weights[index] = -1.0
        elif name == "edge_kind_cross_club":
            weights[index] = -1.2
        elif name == "cross_club_count_norm":
            weights[index] = -1.0
        elif name == "path_depth_norm":
            weights[index] = -0.5

    policy = PolicyBundle(
        feature_names=FEATURE_NAMES,
        weights=weights,
        bias=0.0,
        checkpoint_path=None,
        training_summary=None,
        manifest=None,
    )

    result = build_recommendation(graph, filters, profile, policy=policy)

    assert result["pathSet"]["primary"] is not None
    assert result["pathSet"]["primary"]["edgeIds"] == ["e-root-acm", "e-acm-jp"]


def test_recommend_paths_payload_uses_loaded_policy_archive(tmp_path: Path):
    checkpoint_path = tmp_path / "policy.pt"
    payload = {
        "feature_names": FEATURE_NAMES,
        "weights": [0.1 for _ in FEATURE_NAMES],
        "bias": 0.0,
    }

    with zipfile.ZipFile(checkpoint_path, "w") as archive:
        archive.writestr("policy/data.pkl", pickle.dumps(payload))

    result = recommend_paths_payload(
        graph=sample_graph(),
        filters=default_filters(),
        profile=default_profile(),
        checkpoint_path=str(checkpoint_path),
        feature_manifest_path=None,
        training_summary_path=None,
    )

    assert result["modelMeta"]["mode"] == "rl"
    assert result["modelMeta"]["policyLoaded"] is True
    assert result["pathSet"]["primary"] is not None
