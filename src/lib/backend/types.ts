export interface SRGComponent {
  id: string;
  name: string;
  type: 'Process' | 'DataStore' | 'ExternalEntity' | 'DataFlow';
  description: string;
  metadata?: Record<string, any>;
}

export interface SRGEdge {
  id: string;
  sourceId: string;
  targetId: string;
  protocol?: string;
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
  category: 'Spoofing' | 'Tampering' | 'Repudiation' | 'Information Disclosure' | 'Denial of Service' | 'Elevation of Privilege';
  componentId: string;
  cvssScore: number;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  mitigations?: string[];
}

export interface ComplianceGap {
  controlId: string;
  title: string;
  status: 'Met' | 'Partially Met' | 'Gap Identified';
  description: string;
}