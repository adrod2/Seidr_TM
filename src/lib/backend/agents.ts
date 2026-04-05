import { hashInput, getCachedResult, setCachedResult } from './agentCache';
import { SystemRepresentationGraph, Threat, ComplianceGap } from './types';

// In a real GCP environment, this would point to your API Gateway or Cloud Run endpoint
const API_BASE_URL = import.meta.env.VITE_SEIDR_API_URL || '';
const USE_MOCK_FALLBACK = !API_BASE_URL;

/**
 * Normalizer Agent: Converts raw system descriptions into a C4 System Representation Graph (SRG).
 * GCP Architecture: Calls Vertex AI / LLM to extract components and data flows.
 */
export const agentNormalizer = async (sanitisedInput: string): Promise<SystemRepresentationGraph> => {
  const hash = await hashInput(sanitisedInput);
  const cached = await getCachedResult<SystemRepresentationGraph>('normalizer', hash);
  if (cached) return cached;

  let result: SystemRepresentationGraph;

  if (!USE_MOCK_FALLBACK) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/agents/normalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: sanitisedInput })
      });
      if (!response.ok) throw new Error('API Error');
      result = await response.json();
    } catch (e) {
      console.warn("GCP API unreachable, falling back to local heuristic engine.");
      result = runHeuristicNormalizer(sanitisedInput);
    }
  } else {
    // Simulate network delay for realistic UX
    await new Promise(r => setTimeout(r, 1800));
    result = runHeuristicNormalizer(sanitisedInput);
  }

  await setCachedResult('normalizer', hash, result);
  return result;
};

/**
 * STRIDE Agent: Analyzes the SRG to identify threats based on the STRIDE framework.
 */
export const agentSTRIDE = async (srg: SystemRepresentationGraph): Promise<Threat[]> => {
  const hash = await hashInput(JSON.stringify(srg));
  const cached = await getCachedResult<Threat[]>('stride', hash);
  if (cached) return cached;

  let threats: Threat[];

  if (!USE_MOCK_FALLBACK) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/agents/stride`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ srg })
      });
      if (!response.ok) throw new Error('API Error');
      threats = await response.json();
    } catch (e) {
      threats = runHeuristicSTRIDE(srg);
    }
  } else {
    await new Promise(r => setTimeout(r, 2200));
    threats = runHeuristicSTRIDE(srg);
  }

  // Sort by highest risk first
  threats.sort((a, b) => b.cvssScore - a.cvssScore);

  await setCachedResult('stride', hash, threats);
  return threats;
};

/**
 * Compliance Agent: Maps identified threats to compliance gaps (NIST SP 800-53).
 */
export const agentCompliance = async (threats: Threat[]): Promise<ComplianceGap[]> => {
  await new Promise(r => setTimeout(r, 1200)); // Compliance is usually faster
  
  if (!USE_MOCK_FALLBACK) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/agents/compliance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threats })
      });
      if (response.ok) return await response.json();
    } catch (e) {
      // Fallback below
    }
  }

  return runHeuristicCompliance(threats);
};


// ============================================================================
// HEURISTIC ENGINES (Local Fallback simulating Vertex AI logic)
// ============================================================================

const runHeuristicNormalizer = (input: string): SystemRepresentationGraph => {
  const text = input.toLowerCase();
  const components: any[] = [{ id: 'c-user', name: 'External Client / User', type: 'ExternalEntity', description: 'Origin of requests' }];
  const edges: any[] = [];
  const trustBoundaries: string[] = ['Public Internet'];
  
  let currentId = 1;
  let lastId = 'c-user';

  // 1. Determine Cloud Provider / Boundaries
  if (text.includes('gcp') || text.includes('google cloud')) trustBoundaries.push('GCP VPC');
  if (text.includes('aws') || text.includes('amazon')) trustBoundaries.push('AWS VPC');
  if (text.includes('azure')) trustBoundaries.push('Azure VNet');

  // 2. Extract Frontend
  if (text.includes('react') || text.includes('spa') || text.includes('frontend') || text.includes('web')) {
    const id = `c-${currentId++}`;
    components.push({ id, name: 'Web Frontend', type: 'Process', description: 'Client-side application' });
    edges.push({ id: `e-${currentId}`, sourceId: lastId, targetId: id, protocol: 'HTTPS' });
    lastId = id;
  } else if (text.includes('mobile') || text.includes('ios') || text.includes('android')) {
    const id = `c-${currentId++}`;
    components.push({ id, name: 'Mobile Application', type: 'Process', description: 'Native mobile app' });
    edges.push({ id: `e-${currentId}`, sourceId: lastId, targetId: id, protocol: 'HTTPS' });
    lastId = id;
  }

  // 3. Extract API / Middleware
  if (text.includes('api') || text.includes('node') || text.includes('backend') || text.includes('gateway')) {
    const id = `c-${currentId++}`;
    components.push({ id, name: 'API Gateway / Service', type: 'Process', description: 'Backend application logic' });
    edges.push({ id: `e-${currentId}`, sourceId: lastId, targetId: id, protocol: 'HTTPS/REST' });
    lastId = id;
  }

  // 4. Extract Databases
  if (text.includes('postgres') || text.includes('sql') || text.includes('database') || text.includes('mongo')) {
    const id = `c-${currentId++}`;
    components.push({ id, name: 'Primary Database', type: 'DataStore', description: 'Persistent data storage' });
    edges.push({ id: `e-${currentId}`, sourceId: lastId, targetId: id, protocol: 'TCP/TLS' });
  }

  // 5. Extract Caches/Queues
  if (text.includes('redis') || text.includes('cache')) {
    components.push({ id: `c-${currentId++}`, name: 'Redis Cache', type: 'DataStore', description: 'In-memory cache' });
    edges.push({ id: `e-${currentId}`, sourceId: lastId, targetId: `c-${currentId - 1}`, protocol: 'TCP' });
  }

  // Fallback if nothing was detected
  if (components.length === 1) {
    components.push(
      { id: 'c-app', name: 'Application Server', type: 'Process', description: 'Main application logic' },
      { id: 'c-db', name: 'Database', type: 'DataStore', description: 'System database' }
    );
    edges.push(
      { id: 'e-1', sourceId: 'c-user', targetId: 'c-app', protocol: 'HTTPS' },
      { id: 'e-2', sourceId: 'c-app', targetId: 'c-db', protocol: 'Internal TCP' }
    );
  }

  return { components, edges, trustBoundaries };
};

const runHeuristicSTRIDE = (srg: SystemRepresentationGraph): Threat[] => {
  const threats: Threat[] = [];
  let tId = 1;

  srg.components.forEach(comp => {
    const name = comp.name.toLowerCase();

    // Database Threats
    if (comp.type === 'DataStore') {
      threats.push({
        id: `T-${tId++ * 102}`,
        title: 'SQL Injection / Query Tampering',
        description: `Attacker may inject malicious payloads into ${comp.name} if inputs are not sanitized.`,
        category: 'Tampering',
        componentId: comp.name,
        cvssScore: 8.5,
        severity: 'High'
      });
      threats.push({
        id: `T-${tId++ * 102}`,
        title: 'Data Exfiltration',
        description: `Unauthorized access to ${comp.name} leading to sensitive data leakage.`,
        category: 'Information Disclosure',
        componentId: comp.name,
        cvssScore: 9.2,
        severity: 'Critical'
      });
    }

    // API / Process Threats
    if (comp.type === 'Process' && (name.includes('api') || name.includes('backend'))) {
      threats.push({
        id: `T-${tId++ * 102}`,
        title: 'Broken Object Level Authorization (BOLA)',
        description: `Users may access objects belonging to other users via ${comp.name} endpoints.`,
        category: 'Elevation of Privilege',
        componentId: comp.name,
        cvssScore: 8.8,
        severity: 'High'
      });
      threats.push({
        id: `T-${tId++ * 102}`,
        title: 'API Rate Limit Exhaustion',
        description: `Lack of rate limiting on ${comp.name} could lead to application downtime.`,
        category: 'Denial of Service',
        componentId: comp.name,
        cvssScore: 6.5,
        severity: 'Medium'
      });
      threats.push({
        id: `T-${tId++ * 102}`,
        title: 'Token Hijacking / Spoofing',
        description: `Attacker intercepts or forges auth tokens to impersonate legitimate users on ${comp.name}.`,
        category: 'Spoofing',
        componentId: comp.name,
        cvssScore: 7.8,
        severity: 'High'
      });
    }

    // Frontend Threats
    if (comp.type === 'Process' && (name.includes('web') || name.includes('front'))) {
      threats.push({
        id: `T-${tId++ * 102}`,
        title: 'Cross-Site Scripting (XSS)',
        description: `Malicious scripts executed in the victim's browser via ${comp.name}.`,
        category: 'Tampering',
        componentId: comp.name,
        cvssScore: 7.2,
        severity: 'High'
      });
    }
  });

  return threats;
};

const runHeuristicCompliance = (threats: Threat[]): ComplianceGap[] => {
  const gaps: ComplianceGap[] = [];
  const coveredControls = new Set<string>();

  // Baseline controls that are always met if HTTPS is assumed
  gaps.push({ controlId: 'SC-8', title: 'Transmission Confidentiality', status: 'Met', description: 'TLS 1.2+ is assumed for external connections.' });

  threats.forEach(t => {
    if (t.category === 'Spoofing' && !coveredControls.has('AC-2')) {
      gaps.push({ controlId: 'AC-2', title: 'Account Management', status: 'Gap Identified', description: `Authentication vulnerabilities identified (${t.title}).` });
      coveredControls.add('AC-2');
      gaps.push({ controlId: 'IA-2', title: 'Identification and Authentication', status: 'Gap Identified', description: `Need stronger MFA or token validation to mitigate ${t.id}.` });
      coveredControls.add('IA-2');
    }
    if (t.category === 'Tampering' && !coveredControls.has('SI-10')) {
      gaps.push({ controlId: 'SI-10', title: 'Information Input Validation', status: 'Gap Identified', description: `Injection/Tampering risks present (${t.title}). Require strict input sanitization.` });
      coveredControls.add('SI-10');
    }
    if (t.category === 'Information Disclosure' && !coveredControls.has('SC-28')) {
      gaps.push({ controlId: 'SC-28', title: 'Protection of Information at Rest', status: 'Gap Identified', description: `Data store vulnerabilities (${t.title}) require verified encryption at rest.` });
      coveredControls.add('SC-28');
    }
    if (t.category === 'Denial of Service' && !coveredControls.has('SC-5')) {
      gaps.push({ controlId: 'SC-5', title: 'Denial of Service Protection', status: 'Partially Met', description: `Rate limiting or WAF required to mitigate ${t.title}.` });
      coveredControls.add('SC-5');
    }
  });

  return gaps;
};