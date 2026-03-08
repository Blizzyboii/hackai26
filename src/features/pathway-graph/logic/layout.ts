import { GraphDataset } from "../types";

const X_COLUMNS = {
  root: 120,
  club: 430,
  subprogram: 710,
  company: 1030,
};

function distributeY(index: number, total: number, center = 340, gap = 150) {
  if (total <= 1) {
    return center;
  }

  const start = center - ((total - 1) * gap) / 2;
  return start + index * gap;
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

  clubs.forEach((club, index) => {
    positions.set(club.id, {
      x: X_COLUMNS.club,
      y: distributeY(index, clubs.length),
    });
  });

  const subPrograms = graph.nodes.filter((node) => node.type === "subprogram");
  const clubSubCounter = new Map<string, number>();

  subPrograms.forEach((subprogram) => {
    const parentId = subprogram.parentClubId;
    const parentPos = parentId ? positions.get(parentId) : undefined;
    const localIndex = clubSubCounter.get(parentId ?? "") ?? 0;

    clubSubCounter.set(parentId ?? "", localIndex + 1);

    positions.set(subprogram.id, {
      x: X_COLUMNS.subprogram,
      y: (parentPos?.y ?? 340) + (localIndex * 70 - 35),
    });
  });

  const companies = graph.nodes
    .filter((node) => node.type === "company")
    .sort((a, b) => a.label.localeCompare(b.label));

  companies.forEach((company, index) => {
    positions.set(company.id, {
      x: X_COLUMNS.company,
      y: distributeY(index, companies.length),
    });
  });

  const rootY = clubs.length > 0 ? clubs.reduce((sum, club) => sum + (positions.get(club.id)?.y ?? 340), 0) / clubs.length : 340;

  const rootNode = graph.nodes.find((node) => node.type === "root");
  if (rootNode) {
    positions.set(rootNode.id, {
      x: X_COLUMNS.root,
      y: rootY,
    });
  }

  return positions;
}
