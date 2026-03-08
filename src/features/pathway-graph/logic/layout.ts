import { GraphDataset } from "../types";

const X_COLUMNS = {
  root: 160,
  club: 520,
  subprogram: 830,
  company: 1180,
};

/**
 * Group clubs by categoryTag, then distribute each group in a contiguous
 * band to keep related clubs near each other.  Uses smaller intra-group
 * gaps and larger inter-group spacing so the graph stays compact even when
 * there are many clubs.
 */
function distributeClubs(
  clubs: { id: string; categoryTag?: string }[],
  centerY: number,
) {
  const groups = new Map<string, typeof clubs>();

  for (const club of clubs) {
    const key = club.categoryTag ?? "__other__";
    const list = groups.get(key) ?? [];
    list.push(club);
    groups.set(key, list);
  }

  const sortedGroups = [...groups.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );

  const intraGap = 135;
  const interGap = 210;

  // Calculate total height
  let totalHeight = 0;
  for (let g = 0; g < sortedGroups.length; g++) {
    const [, members] = sortedGroups[g];
    totalHeight += (members.length - 1) * intraGap;
    if (g < sortedGroups.length - 1) {
      totalHeight += interGap;
    }
  }

  const positions = new Map<string, number>();
  let y = centerY - totalHeight / 2;

  for (let g = 0; g < sortedGroups.length; g++) {
    const [, members] = sortedGroups[g];

    for (let i = 0; i < members.length; i++) {
      positions.set(members[i].id, y);
      if (i < members.length - 1) {
        y += intraGap;
      }
    }

    if (g < sortedGroups.length - 1) {
      y += interGap;
    }
  }

  return positions;
}

export function buildNodePositions(graph: GraphDataset) {
  const positions = new Map<string, { x: number; y: number }>();

  const clubs = graph.nodes
    .filter((node) => node.type === "club")
    .sort((a, b) => {
      const categoryA = a.categoryTag ?? "";
      const categoryB = b.categoryTag ?? "";

      if (categoryA !== categoryB) {
        return categoryA.localeCompare(categoryB);
      }

      return a.label.localeCompare(b.label);
    });

  const centerY = 400;
  const clubYMap = distributeClubs(clubs, centerY);

  clubs.forEach((club) => {
    positions.set(club.id, {
      x: X_COLUMNS.club,
      y: clubYMap.get(club.id) ?? centerY,
    });
  });

  // Subprograms fan out from parent club position
  const subPrograms = graph.nodes.filter((node) => node.type === "subprogram");
  const clubSubCounter = new Map<string, number>();
  const clubSubTotal = new Map<string, number>();

  // First pass: count subs per parent
  subPrograms.forEach((sub) => {
    const pid = sub.parentClubId ?? "";
    clubSubTotal.set(pid, (clubSubTotal.get(pid) ?? 0) + 1);
  });

  subPrograms.forEach((subprogram) => {
    const parentId = subprogram.parentClubId;
    const parentPos = parentId ? positions.get(parentId) : undefined;
    const localIndex = clubSubCounter.get(parentId ?? "") ?? 0;
    const total = clubSubTotal.get(parentId ?? "") ?? 1;

    clubSubCounter.set(parentId ?? "", localIndex + 1);

    // Fan out ±55px from parent center
    const fanSpan = 55;
    const offset =
      total <= 1 ? 0 : -fanSpan + (localIndex / (total - 1)) * (2 * fanSpan);

    positions.set(subprogram.id, {
      x: X_COLUMNS.subprogram,
      y: (parentPos?.y ?? centerY) + offset,
    });
  });

  // Companies: distributed evenly across the Y range of connected clubs
  const companies = graph.nodes
    .filter((node) => node.type === "company")
    .sort((a, b) => a.label.localeCompare(b.label));

  // Find the full Y range from clubs
  const clubYValues = clubs.map(
    (club) => positions.get(club.id)?.y ?? centerY,
  );
  const minClubY =
    clubYValues.length > 0 ? Math.min(...clubYValues) : centerY - 200;
  const maxClubY =
    clubYValues.length > 0 ? Math.max(...clubYValues) : centerY + 200;

  companies.forEach((company, index) => {
    const range = maxClubY - minClubY;
    const gap =
      companies.length <= 1 ? 0 : range / (companies.length - 1);
    const y =
      companies.length <= 1
        ? centerY
        : minClubY + index * gap;

    positions.set(company.id, {
      x: X_COLUMNS.company,
      y,
    });
  });

  // Root at center of clubs
  const rootY =
    clubs.length > 0
      ? clubs.reduce(
          (sum, club) => sum + (positions.get(club.id)?.y ?? centerY),
          0,
        ) / clubs.length
      : centerY;

  const rootNode = graph.nodes.find((node) => node.type === "root");
  if (rootNode) {
    positions.set(rootNode.id, {
      x: X_COLUMNS.root,
      y: rootY,
    });
  }

  return positions;
}
