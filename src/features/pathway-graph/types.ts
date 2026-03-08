export type NodeType = "root" | "club" | "subprogram" | "company";

export type EdgeType = "hierarchy" | "career" | "club_bridge";

export type EdgeKind =
  | "root_to_club"
  | "club_to_subprogram"
  | "club_to_company"
  | "cross_club";

export type NodeSize = "lg" | "md" | "sm";

export interface Person {
  id: string;
  name: string;
  avatarUrl: string;
  role?: string;
  gradYear?: number;
  company: string;
}

export interface GraphNodeData {
  [key: string]: unknown;
  id: string;
  type: NodeType;
  label: string;
  tags: string[];
  categoryTag?: string;
  memberCount?: number;
  logo?: string;
  size: NodeSize;
  position?: {
    x: number;
    y: number;
  };
  parentClubId?: string;
  people: Person[];
  meta?: Record<string, string | number | boolean>;
}

export interface GraphEdgeData {
  [key: string]: unknown;
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  edgeKind: EdgeKind;
  weight: number;
  confidence?: number;
  people: Person[];
  relationLabel?: string;
  bidirectional?: boolean;
}

export interface FilterState {
  targetCompany: string | null;
  includeTags: string[];
  excludeTags: string[];
  eliminatedClubIds: string[];
  focusMode: boolean;
  showFullTree: boolean;
  includeClubBridges: boolean;
}

export interface PathCandidate {
  id: string;
  nodeIds: string[];
  edgeIds: string[];
  alumniWeight: number;
  extraHops: number;
  score: number;
  confidence: number;
  rationale: string[];
}

export interface PathSet {
  primary: PathCandidate | null;
  secondary: PathCandidate[];
  all: PathCandidate[];
  reason?: string;
}

export interface GraphDataset {
  rootNodeId: string;
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
}

export interface NodeVisibility {
  isDimmed: boolean;
  isOnPrimary: boolean;
  isOnSecondary: boolean;
  isTarget: boolean;
  isEliminated: boolean;
}

export interface EdgeVisibility {
  isDimmed: boolean;
  isOnPrimary: boolean;
  isOnSecondary: boolean;
}

export interface GraphVisibilityState {
  nodeVisibility: Record<string, NodeVisibility>;
  edgeVisibility: Record<string, EdgeVisibility>;
  relevantNodeIds: Set<string>;
}

export type RiskTolerance = "low" | "medium" | "high";

export type GraduationTerm = "Spring" | "Summer" | "Fall";

export interface StudentProfile {
  targetCompanies: string[];
  activeTargetCompany: string | null;
  graduationTerm: GraduationTerm;
  graduationYear: number;
  semestersRemaining: number;
  completedNodeIds: string[];
  completedCourseCount: number;
  completedResearchCount: number;
  completedExtracurricularCount: number;
  riskTolerance: RiskTolerance;
}
