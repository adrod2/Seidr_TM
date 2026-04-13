export interface SRGComponent {
  id: string;
  name: string;
  type: 'Process' | 'DataStore' | 'ExternalEntity' | 'DataFlow';
  c4Type?: 'Person' | 'System' | 'Container' | 'Database' | 'Component';
  c4Level?: 'L1' | 'L2' | 'L3' | 'Global';
  description: string;
  metadata?: Record<string, any>;
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
  cvssScore: number;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  mitigations?: string[];
  mitigation?: string;
  evidence?: string;
  reasoning?: string;
}

export interface ComplianceGap {
  controlId: string;
  title: string;
  status: 'Met' | 'Partially Met' | 'Gap Identified';
  description: string;
}