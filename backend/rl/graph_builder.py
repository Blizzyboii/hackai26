from __future__ import annotations

import hashlib
import itertools
import re
from collections import defaultdict
from typing import Any, Iterable


ROOT_NODE_ID = "root"

SUBCLUB_PARENT_ALIASES: dict[str, list[str]] = {
    "acm": ["acm", "association for computing machinery"],
    "ais": ["ais", "artificial intelligence society"],
    "fintech": ["fintech utd", "fintech", "financial technology"],
    "wicys": ["wicys", "women in cybersecurity"],
}

SUBCLUB_TEMPLATES: list[dict[str, Any]] = [
    {
        "id_base": "sub-acm-projects",
        "label": "ACM Projects",
        "logo": "PRJ",
        "tags": ["technology", "build", "educational"],
        "parent_alias_key": "acm",
    },
    {
        "id_base": "sub-acm-research",
        "label": "ACM Research",
        "logo": "R&D",
        "tags": ["technology", "academic interest", "educational"],
        "parent_alias_key": "acm",
    },
    {
        "id_base": "sub-ais-mentorship",
        "label": "AIS Mentorship",
        "logo": "MEN",
        "tags": ["professional development", "business", "educational"],
        "parent_alias_key": "ais",
    },
    {
        "id_base": "sub-fintech-labs",
        "label": "FinTech Labs",
        "logo": "LAB",
        "tags": ["finance", "technology", "build"],
        "parent_alias_key": "fintech",
    },
]


def normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def normalize_key(value: str) -> str:
    return normalize_whitespace(value).lower()


def slugify(value: str, fallback: str = "item") -> str:
    normalized = normalize_key(value)
    slug = re.sub(r"[^a-z0-9]+", "-", normalized).strip("-")
    return slug or fallback


def normalize_tag(tag: Any) -> str | None:
    if not isinstance(tag, str):
        return None
    normalized = normalize_key(tag)
    return normalized or None


def make_logo(label: str, max_len: int = 4) -> str:
    compact = re.sub(r"[^A-Za-z0-9 ]+", "", label).strip()
    if not compact:
        return "NODE"

    words = compact.split()
    if len(words) >= 2:
        initials = "".join(word[0].upper() for word in words if word)
        return initials[:max_len] or compact[:max_len].upper()

    return compact[:max_len].upper()


def deterministic_avatar(person_id: str) -> str:
    hash_value = hashlib.sha1(person_id.encode("utf-8")).hexdigest()
    avatar_index = (int(hash_value[:8], 16) % 70) + 1
    return f"https://i.pravatar.cc/80?img={avatar_index}"


def ensure_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def unique_id(base_id: str, used: set[str]) -> str:
    if base_id not in used:
        used.add(base_id)
        return base_id

    suffix = 2
    while True:
        candidate = f"{base_id}-{suffix}"
        if candidate not in used:
            used.add(candidate)
            return candidate
        suffix += 1


def extract_company_map(officer: dict[str, Any]) -> dict[str, str]:
    companies: dict[str, str] = {}

    for experience in ensure_list(officer.get("experience")):
        if not isinstance(experience, dict):
            continue
        company_raw = experience.get("company")
        if not isinstance(company_raw, str):
            continue
        company_name = normalize_whitespace(company_raw)
        if not company_name:
            continue
        company_key = normalize_key(company_name)
        companies.setdefault(company_key, company_name)

    return companies


def make_person(officer: dict[str, Any], company: str) -> dict[str, Any] | None:
    raw_name = officer.get("name")
    if not isinstance(raw_name, str):
        return None

    name = normalize_whitespace(raw_name)
    if not name:
        return None

    person_key = slugify(name, fallback="unknown-person")
    person_id = f"person-{person_key}"

    position = officer.get("position")
    role = normalize_whitespace(position) if isinstance(position, str) and position.strip() else None

    person: dict[str, Any] = {
        "id": person_id,
        "name": name,
        "avatarUrl": deterministic_avatar(person_id),
        "company": company or "Unknown",
    }

    if role:
        person["role"] = role

    return person


def choose_primary_company(company_map: dict[str, str]) -> str:
    if not company_map:
        return "Unknown"

    first_key = sorted(company_map.keys())[0]
    return company_map[first_key]


def dedupe_people(people: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: dict[str, dict[str, Any]] = {}
    for person in people:
        person_id = person.get("id")
        if isinstance(person_id, str):
            deduped[person_id] = person
    return sorted(deduped.values(), key=lambda entry: entry["name"].lower())


def canonical_tags(raw_tags: Any) -> list[str]:
    tags = []
    seen: set[str] = set()
    for raw in ensure_list(raw_tags):
        tag = normalize_tag(raw)
        if not tag or tag in seen:
            continue
        seen.add(tag)
        tags.append(tag)
    return tags


def _match_parent_club_id(
    alias_key: str,
    club_name_lookup: list[tuple[str, str]],
) -> str | None:
    aliases = [normalize_key(alias) for alias in SUBCLUB_PARENT_ALIASES.get(alias_key, [])]
    if not aliases:
        return None

    # Prefer exact matches first.
    for club_id, club_name in club_name_lookup:
        for alias in aliases:
            if club_name == alias:
                return club_id

    # Then allow phrase inclusion for full organization names.
    for club_id, club_name in club_name_lookup:
        for alias in aliases:
            if alias in club_name:
                return club_id

    return None


def build_graph_dataset(clubs: Iterable[dict[str, Any]]) -> dict[str, Any]:
    used_node_ids: set[str] = {ROOT_NODE_ID}
    used_edge_ids: set[str] = set()

    nodes: list[dict[str, Any]] = [
        {
            "id": ROOT_NODE_ID,
            "type": "root",
            "label": "You",
            "tags": ["student", "start"],
            "categoryTag": "student",
            "logo": "YOU",
            "size": "lg",
            "people": [],
            "meta": {"campus": "UTD"},
        }
    ]
    edges: list[dict[str, Any]] = []

    clubs_sorted = sorted(
        list(clubs),
        key=lambda club: (
            normalize_key(str(club.get("name") or "")),
            normalize_key(str(club.get("id") or club.get("_id") or "")),
        ),
    )

    club_records: list[dict[str, Any]] = []
    company_people_global: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    company_display_name: dict[str, str] = {}
    officer_name_to_clubs: dict[str, set[str]] = defaultdict(set)
    club_pair_people_for_company: dict[tuple[str, str], dict[str, dict[str, Any]]] = defaultdict(dict)

    for club_doc in clubs_sorted:
        raw_name = club_doc.get("name")
        if not isinstance(raw_name, str):
            continue

        club_label = normalize_whitespace(raw_name)
        if not club_label:
            continue

        raw_id = club_doc.get("id") or club_doc.get("_id") or club_label
        club_base_slug = slugify(f"{club_label}-{raw_id}", fallback="club")
        club_node_id = unique_id(f"club-{club_base_slug}", used_node_ids)

        raw_officers = ensure_list(club_doc.get("officers"))
        tags = canonical_tags(club_doc.get("tags"))
        category_tag = tags[0] if tags else "general"

        officer_people_by_name: dict[str, dict[str, Any]] = {}
        club_people: dict[str, dict[str, Any]] = {}
        company_to_officers: dict[str, set[str]] = defaultdict(set)

        for raw_officer in raw_officers:
            if not isinstance(raw_officer, dict):
                continue

            raw_officer_name = raw_officer.get("name")
            if not isinstance(raw_officer_name, str):
                continue
            officer_name = normalize_whitespace(raw_officer_name)
            if not officer_name:
                continue

            officer_key = normalize_key(officer_name)
            companies = extract_company_map(raw_officer)
            primary_company = choose_primary_company(companies)

            person_for_club = make_person(raw_officer, primary_company)
            if person_for_club:
                officer_people_by_name[officer_key] = person_for_club
                club_people[person_for_club["id"]] = person_for_club

            officer_name_to_clubs[officer_key].add(club_node_id)

            for company_key, display_name in companies.items():
                company_display_name.setdefault(company_key, display_name)
                company_to_officers[company_key].add(officer_key)

                person_for_company = make_person(raw_officer, display_name)
                if person_for_company:
                    company_people_global[company_key][person_for_company["id"]] = person_for_company
                    club_pair_people_for_company[(club_node_id, company_key)][person_for_company["id"]] = person_for_company

        club_node = {
            "id": club_node_id,
            "type": "club",
            "label": club_label,
            "tags": tags or ["general"],
            "categoryTag": category_tag,
            "memberCount": len([entry for entry in raw_officers if isinstance(entry, dict)]),
            "logo": make_logo(club_label),
            "size": "lg",
            "people": dedupe_people(club_people.values()),
            "meta": {"description": normalize_whitespace(str(club_doc.get("description") or ""))},
        }
        nodes.append(club_node)

        root_edge_id = unique_id(f"e-root-{club_node_id}", used_edge_ids)
        edges.append(
            {
                "id": root_edge_id,
                "source": ROOT_NODE_ID,
                "target": club_node_id,
                "type": "hierarchy",
                "edgeKind": "root_to_club",
                "weight": max(1, min(8, max(club_node["memberCount"], 1))),
                "relationLabel": "Popular Entry",
                "people": club_node["people"][:5],
            }
        )

        club_records.append(
            {
                "node_id": club_node_id,
                "normalized_name": normalize_key(club_label),
                "people_by_name": officer_people_by_name,
                "company_to_officers": company_to_officers,
            }
        )

    # Preserve hardcoded subclubs, but only where parent club can be resolved.
    club_lookup = [(record["node_id"], record["normalized_name"]) for record in club_records]
    club_record_by_id = {record["node_id"]: record for record in club_records}

    for template in SUBCLUB_TEMPLATES:
        parent_id = _match_parent_club_id(template["parent_alias_key"], club_lookup)
        if not parent_id:
            continue

        sub_node_id = unique_id(template["id_base"], used_node_ids)
        parent_record = club_record_by_id[parent_id]
        parent_people = dedupe_people(parent_record["people_by_name"].values())
        sub_people = parent_people[: min(len(parent_people), 4)]

        nodes.append(
            {
                "id": sub_node_id,
                "type": "subprogram",
                "label": template["label"],
                "tags": template["tags"],
                "categoryTag": template["tags"][0],
                "parentClubId": parent_id,
                "logo": template["logo"],
                "size": "sm",
                "people": sub_people,
            }
        )

        edges.append(
            {
                "id": unique_id(f"e-{sub_node_id}", used_edge_ids),
                "source": parent_id,
                "target": sub_node_id,
                "type": "hierarchy",
                "edgeKind": "club_to_subprogram",
                "weight": max(1, len(sub_people)),
                "relationLabel": "Program",
                "people": sub_people,
            }
        )

    # Company nodes and club-to-company edges.
    company_node_id_by_key: dict[str, str] = {}

    for company_key in sorted(company_display_name.keys()):
        label = company_display_name[company_key]
        company_node_id = unique_id(f"company-{slugify(label, fallback='company')}", used_node_ids)
        company_node_id_by_key[company_key] = company_node_id

        nodes.append(
            {
                "id": company_node_id,
                "type": "company",
                "label": label,
                "tags": ["career"],
                "categoryTag": "career",
                "logo": make_logo(label),
                "size": "md",
                "people": dedupe_people(company_people_global[company_key].values()),
            }
        )

    for club_record in sorted(club_records, key=lambda record: record["node_id"]):
        club_id = club_record["node_id"]
        company_to_officers = club_record["company_to_officers"]

        for company_key in sorted(company_to_officers.keys()):
            company_id = company_node_id_by_key.get(company_key)
            if not company_id:
                continue

            officer_names = company_to_officers[company_key]
            if not officer_names:
                continue

            edge_people = dedupe_people(club_pair_people_for_company[(club_id, company_key)].values())
            edges.append(
                {
                    "id": unique_id(f"e-career-{club_id}-{company_id}", used_edge_ids),
                    "source": club_id,
                    "target": company_id,
                    "type": "career",
                    "edgeKind": "club_to_company",
                    "weight": len(officer_names),
                    "relationLabel": "Alumni Path",
                    "people": edge_people,
                }
            )

    # Cross-club bridges based on shared officers.
    pair_weights: dict[tuple[str, str], set[str]] = defaultdict(set)
    pair_people: dict[tuple[str, str], dict[str, dict[str, Any]]] = defaultdict(dict)

    for officer_key, clubs_for_officer in officer_name_to_clubs.items():
        if len(clubs_for_officer) < 2:
            continue

        for left, right in itertools.combinations(sorted(clubs_for_officer), 2):
            pair = (left, right)
            pair_weights[pair].add(officer_key)

            left_person = club_record_by_id[left]["people_by_name"].get(officer_key)
            right_person = club_record_by_id[right]["people_by_name"].get(officer_key)

            if left_person:
                pair_people[pair][left_person["id"]] = left_person
            if right_person:
                pair_people[pair][right_person["id"]] = right_person

    for (left, right), names in sorted(pair_weights.items(), key=lambda entry: entry[0]):
        if not names:
            continue

        bridge_people = dedupe_people(pair_people[(left, right)].values())
        edges.append(
            {
                "id": unique_id(f"e-bridge-{left}-{right}", used_edge_ids),
                "source": left,
                "target": right,
                "type": "club_bridge",
                "edgeKind": "cross_club",
                "weight": len(names),
                "relationLabel": "Shared Officers",
                "bidirectional": True,
                "people": bridge_people,
            }
        )

    type_order = {"root": 0, "club": 1, "subprogram": 2, "company": 3}
    nodes_sorted = sorted(
        nodes,
        key=lambda node: (type_order.get(node["type"], 99), normalize_key(str(node.get("label", ""))), node["id"]),
    )
    edges_sorted = sorted(edges, key=lambda edge: edge["id"])

    return {
        "rootNodeId": ROOT_NODE_ID,
        "nodes": nodes_sorted,
        "edges": edges_sorted,
    }

