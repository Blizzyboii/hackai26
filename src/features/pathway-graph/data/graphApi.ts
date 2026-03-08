import { GraphDataset } from "../types";
import { mockGraph } from "./mockGraph";

export interface GraphLoadResult {
  graph: GraphDataset;
  source: "api" | "mock";
  warning: string | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isValidPerson(value: unknown): boolean {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.avatarUrl === "string" &&
    typeof value.company === "string"
  );
}

function isValidNode(value: unknown): boolean {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.type === "string" &&
    typeof value.label === "string" &&
    isStringArray(value.tags) &&
    typeof value.size === "string" &&
    Array.isArray(value.people) &&
    value.people.every((person) => isValidPerson(person))
  );
}

function isValidEdge(value: unknown): boolean {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.source === "string" &&
    typeof value.target === "string" &&
    typeof value.type === "string" &&
    typeof value.edgeKind === "string" &&
    typeof value.weight === "number" &&
    Array.isArray(value.people) &&
    value.people.every((person) => isValidPerson(person))
  );
}

function parseGraphDataset(value: unknown): GraphDataset | null {
  if (!isObject(value)) {
    return null;
  }

  if (typeof value.rootNodeId !== "string") {
    return null;
  }

  if (!Array.isArray(value.nodes) || !value.nodes.every((node) => isValidNode(node))) {
    return null;
  }

  if (!Array.isArray(value.edges) || !value.edges.every((edge) => isValidEdge(edge))) {
    return null;
  }

  return {
    rootNodeId: value.rootNodeId,
    nodes: value.nodes as GraphDataset["nodes"],
    edges: value.edges as GraphDataset["edges"],
  };
}

export async function loadGraphDataset(signal?: AbortSignal): Promise<GraphLoadResult> {
  try {
    const response = await fetch("/api/proxy/graph", {
      cache: "no-store",
      signal,
    });

    if (!response.ok) {
      throw new Error(`Graph API request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as unknown;
    const parsed = parseGraphDataset(payload);
    if (!parsed) {
      throw new Error("Graph API returned an invalid dataset shape");
    }

    return {
      graph: parsed,
      source: "api",
      warning: null,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown graph load failure";
    return {
      graph: mockGraph,
      source: "mock",
      warning: ``,
    };
  }
}
