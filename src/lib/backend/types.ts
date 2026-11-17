export interface SRGComponent {
  id: string;
  name: string;
  type: 'Process' | 'DataStore' | 'ExternalEntity' | 'DataFlow';
  c4Type?: 'Person' | 'System' | 'Container' | 'Database' | 'Component';
  c4Level?: 'L1' | 'L2' | 'L3' | 'Global';
  description: string;
  technology?: string;
  external?: boolean;
  metadata?: {
    [key: string]: unknown;
    technology?: string;
    position?: { x: number; y: number };
    positions?: Record<string, { x: number; y: number }>;
  };
}

export interface SRGEdge {
  id: string;
  sourceId: string;
  targetId: string;
  protocol?: string;
  label?: string;
  dataClassification?: string;
}

export interface SystemRepresentationGraph {
  components: SRGComponent[];
  edges: SRGEdge[];
  trustBoundaries: string[];
}

export interface Threat {
  id: string;
  title: string;
  description: string;
  category: string;
  componentId: string;
  affectedComponentIds?: string[];
  affectedFlowIds?: string[];
  cvssScore: number;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  mitigations?: string[];
  mitigation?: string;
  evidence?: string;
  reasoning?: string;
  exploitationRisk?: string;
  dread?: {
    damage: number;
    reproducibility: number;
    exploitability: number;
    affectedUsers: number;
    discoverability: number;
  };
  status?: string;
  justification?: string;
  qualityProposal?: import('./assessmentQuality').RiskProposal;
  analysisOrigin?: 'Architecture' | 'Repository' | 'Specialist';
  cvssVersion?: string;
  cvssVector?: string;
  cvssRationale?: string;
}

export interface ComplianceGap {
  controlId: string;
  title: string;
  status: 'Met' | 'Partially Met' | 'Gap Identified';
  description: string;
}

export interface ScannedFile {
  path: string;
  size: number;
  repositoryUrl?: string;
  kind?: 'code' | 'documentation';
}

export interface RepositorySource {
  kind: 'metadata' | 'documentation' | 'code';
  name: string;
  url: string;
  text: string;
  originalText?: string;
  revision?: string;
  collectedAt?: string;
  sourceChars?: number;
  status?: 'included' | 'digested' | 'truncated' | 'excluded' | 'failed' | 'empty';
  note?: string;
}

export interface RepositoryAnalysis {
  inferredPurpose: string;
  inherentVulnerabilities: Threat[];
  scannedFiles: ScannedFile[];
  contextSources?: RepositorySource[];
  collectionNotes?: string[];
  codeAnalysisError?: string;
}

export interface WebIntelligence {
  sourceUrl: string;
  summary: string;
  pages: { url: string; title: string; text?: string }[];
  collectedAt?: string;
  skippedPages: number;
}

export interface DescriptionSummary {
  summary: string;
  highlights: string[];
}

export type AnalysisResult =
  | { success: true; modelId: string }
  | { success: false; error: string; modelId?: string };