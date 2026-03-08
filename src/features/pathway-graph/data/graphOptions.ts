import { GraphDataset } from "../types";

export interface GraphDerivedOptions {
  tags: string[];
  companies: Array<{ id: string; label: string }>;
  clubs: Array<{ id: string; label: string }>;
  activities: Array<{ id: string; label: string; type: "club" | "subprogram" }>;
}

export function deriveGraphOptions(graph: GraphDataset): GraphDerivedOptions {
  const tags = Array.from(new Set(graph.nodes.flatMap((node) => node.tags))).sort((a, b) => a.localeCompare(b));

  const companies = graph.nodes
    .filter((node) => node.type === "company")
    .map((node) => ({ id: node.id, label: node.label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const clubs = graph.nodes
    .filter((node) => node.type === "club")
    .map((node) => ({ id: node.id, label: node.label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const activities: GraphDerivedOptions["activities"] = graph.nodes
    .filter((node) => node.type === "club" || node.type === "subprogram")
    .map<GraphDerivedOptions["activities"][number]>((node) => ({
      id: node.id,
      label: node.label,
      type: node.type === "club" ? "club" : "subprogram",
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    tags,
    companies,
    clubs,
    activities,
  };
}
