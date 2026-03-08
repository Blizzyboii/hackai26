from backend.graph_builder import build_graph_dataset


def _find_node(dataset, node_type, label):
    return next((node for node in dataset["nodes"] if node["type"] == node_type and node["label"] == label), None)


def _find_edge(dataset, source, target, edge_kind):
    return next(
        (
            edge
            for edge in dataset["edges"]
            if edge["source"] == source and edge["target"] == target and edge["edgeKind"] == edge_kind
        ),
        None,
    )


def test_unique_officer_weight_for_club_company_edges():
    clubs = [
        {
            "id": "acm-1",
            "name": "Association for Computing Machinery",
            "description": "ACM desc",
            "tags": ["Technology"],
            "officers": [
                {
                    "name": "Jane Doe",
                    "position": "President",
                    "experience": [
                        {"company": "JPMorgan"},
                        {"company": "JPMorgan"},
                    ],
                },
                {
                    "name": "John Smith",
                    "position": "Officer",
                    "experience": [{"company": "JPMorgan"}],
                },
            ],
        }
    ]

    dataset = build_graph_dataset(clubs)
    acm = _find_node(dataset, "club", "Association for Computing Machinery")
    jpm = _find_node(dataset, "company", "JPMorgan")

    assert acm is not None
    assert jpm is not None

    edge = _find_edge(dataset, acm["id"], jpm["id"], "club_to_company")
    assert edge is not None
    assert edge["weight"] == 2


def test_shared_officers_create_cross_club_bridge():
    clubs = [
        {
            "id": "acm-1",
            "name": "Association for Computing Machinery",
            "tags": ["Technology"],
            "officers": [
                {
                    "name": "Shared Person",
                    "position": "Member",
                    "experience": [{"company": "Apple"}],
                }
            ],
        },
        {
            "id": "ais-1",
            "name": "Artificial Intelligence Society",
            "tags": ["Technology"],
            "officers": [
                {
                    "name": "Shared Person",
                    "position": "Member",
                    "experience": [{"company": "Apple"}],
                }
            ],
        },
    ]

    dataset = build_graph_dataset(clubs)
    acm = _find_node(dataset, "club", "Association for Computing Machinery")
    ais = _find_node(dataset, "club", "Artificial Intelligence Society")

    assert acm is not None
    assert ais is not None

    bridge_edge = _find_edge(dataset, acm["id"], ais["id"], "cross_club") or _find_edge(
        dataset, ais["id"], acm["id"], "cross_club"
    )
    assert bridge_edge is not None
    assert bridge_edge["weight"] == 1
    assert bridge_edge["bidirectional"] is True


def test_subclubs_only_attach_when_parent_alias_is_found():
    clubs = [
        {
            "id": "ais-1",
            "name": "Artificial Intelligence Society",
            "tags": ["Technology"],
            "officers": [
                {
                    "name": "Person One",
                    "position": "Chair",
                    "experience": [{"company": "Apple"}],
                }
            ],
        }
    ]

    dataset = build_graph_dataset(clubs)
    sub_nodes = [node for node in dataset["nodes"] if node["type"] == "subprogram"]
    labels = {node["label"] for node in sub_nodes}

    assert "AIS Mentorship" in labels
    assert "ACM Projects" not in labels
    assert "ACM Research" not in labels


def test_handles_null_officers_and_missing_experience():
    clubs = [
        {
            "id": "club-1",
            "name": "No Officers Club",
            "tags": ["Educational"],
            "officers": None,
        },
        {
            "id": "club-2",
            "name": "Sparse Officers Club",
            "tags": ["Educational"],
            "officers": [{"name": "No Experience User", "position": "Member", "experience": None}],
        },
    ]

    dataset = build_graph_dataset(clubs)
    assert dataset["rootNodeId"] == "root"
    assert any(node["label"] == "No Officers Club" for node in dataset["nodes"])
    assert any(node["label"] == "Sparse Officers Club" for node in dataset["nodes"])
