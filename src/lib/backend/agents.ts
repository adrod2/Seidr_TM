import { hashInput, getCachedResult, setCachedResult } from './agentCache';
import { SystemRepresentationGraph, Threat, ComplianceGap } from './types';

export const agentNormalizer = async (sanitisedInput: string): Promise<SystemRepresentationGraph> => {
  const hash = await hashInput(sanitisedInput);
  const cached = await getCachedResult<SystemRepresentationGraph>('normalizer', hash);
  if (cached) return cached;

  await new Promise(r => setTimeout(r, 2000));

  const inputLower = sanitisedInput.toLowerCase();
  
  const components: any[] = [
    { id: 'c1', name: 'External User', type: 'ExternalEntity', description: 'End user or client accessing the system' }
  ];
  const edges: any[] = [];
  const trustBoundaries: string[] = ['Public Internet'];

  let lastId = 'c1';
  let nextIdNum = 2;

  // 1. Deployment / Cloud logic
  if (inputLower.includes('aws')) {
     trustBoundaries.push('AWS VPC');
     components.push({ id: `c${nextIdNum}`, name: 'AWS API Gateway', type: 'Process', description: 'Managed ingress' });
     edges.push({ id: `e${nextIdNum}`, sourceId: lastId, targetId: `c${nextIdNum}`, protocol: 'HTTPS' });
     lastId = `c${nextIdNum}`;
     nextIdNum++;
  } else if (inputLower.includes('azure')) {
     trustBoundaries.push('Azure VNet');
  } else if (inputLower.includes('gcp')) {
     trustBoundaries.push('GCP VPC');
  }

  // 2. Compute / Application logic
  if (inputLower.includes('react') || inputLower.includes('spa')) {
    components.push({ id: `c${nextIdNum}`, name: 'Web Client App', type: 'Process', description: 'Frontend Application' });
    edges.push({ id: `e${nextIdNum}`, sourceId: lastId, targetId: `c${nextIdNum}`, protocol: 'HTTPS' });
    lastId = `c${nextIdNum}`;
    nextIdNum++;
  }

  if (inputLower.includes('node') || inputLower.includes('api')) {
     components.push({ id: `c${nextIdNum}`, name: 'Backend API Service', type: 'Process', description: 'Core application logic' });
     edges.push({ id: `e${nextIdNum}`, sourceId: lastId, targetId: `c${nextIdNum}`, protocol: 'HTTPS/REST' });
     lastId = `c${nextIdNum}`;
     nextIdNum++;
  }

  // 3. Database / Storage logic
  if (inputLower.includes('postgres') || inputLower.includes('sql') || inputLower.includes('database')) {
     components.push({ id: `c${nextIdNum}`, name: 'Primary Relational DB', type: 'DataStore', description: 'Persistent storage' });
     edges.push({ id: `e${nextIdNum}`, sourceId: lastId, targetId: `c${nextIdNum}`, protocol: 'TCP/TLS' });
     lastId = `c${nextIdNum}`;
     nextIdNum++;
  }

  // Fallbacks if input was entirely empty or didn't match keywords
  if (components.length === 1) {
     components.push(
       { id: 'c2', name: 'Web Application', type: 'Process', description: 'Main App Server' },
       { id: 'c3', name: 'Database', type: 'DataStore', description: 'System Database' }
     );
     edges.push(
       { id: 'e1', sourceId: 'c1', targetId: 'c2', protocol: 'HTTPS' },
       { id: 'e2', sourceId: 'c2', targetId: 'c3', protocol: 'Internal TCP' }
     );
  }

  const result: SystemRepresentationGraph = { components, edges, trustBoundaries };

  await setCachedResult('normalizer', hash, result);
  return result;
};

export const agentSTRIDE = async (srg: SystemRepresentationGraph): Promise<Threat[]> => {
  const hash = await hashInput(JSON.stringify(srg));
  const cached = await getCachedResult<Threat[]>('stride', hash);
  if (cached) return cached;

  await new Promise(r => setTimeout(r, 2500));

  const threats: Threat[] = [];
  let threatCount = 1;

  const hasDB = srg.components.some(c => c.type === 'DataStore');
  const apiComponent = srg.components.find(c => c.name.toLowerCase().includes('api') || c.type === 'Process');

  if (apiComponent) {
    threats.push({
      id: `T-${Math.floor(Math.random() * 1000)}`,
      title: 'Unauthenticated API Access',
      description: 'API endpoints may allow requests without proper validation if controls are misconfigured.',
      category: 'Spoofing',
      componentId: apiComponent.name,
      cvssScore: 8.5,
      severity: 'High'
    });
    threats.push({
      id: `T-${Math.floor(Math.random() * 1000)}`,
      title: 'API Rate Limit Exhaustion',
      description: 'An attacker could flood the API causing denial of service (DoS).',
      category: 'Denial of Service',
      componentId: apiComponent.name,
      cvssScore: 6.5,
      severity: 'Medium'
    });
  }

  if (hasDB) {
    const dbName = srg.components.find(c => c.type === 'DataStore')?.name || 'Database';
    threats.push({
      id: `T-${Math.floor(Math.random() * 1000)}`,
      title: 'SQL Injection in Data Input',
      description: 'Database could be vulnerable to injected payloads if queries are not parameterized.',
      category: 'Tampering',
      componentId: dbName,
      cvssScore: 7.2,
      severity: 'High'
    });
    threats.push({
      id: `T-${Math.floor(Math.random() * 1000)}`,
      title: 'Data Exfiltration via DB Dump',
      description: 'Information disclosure if internal database access controls are compromised.',
      category: 'Information Disclosure',
      componentId: dbName,
      cvssScore: 9.1,
      severity: 'Critical'
    });
  }

  if (threats.length === 0) {
     threats.push({
      id: `T-${Math.floor(Math.random() * 1000)}`,
      title: 'Generic Component Compromise',
      description: 'Lack of strict boundaries may allow lateral movement.',
      category: 'Elevation of Privilege',
      componentId: 'System Core',
      cvssScore: 5.5,
      severity: 'Medium'
    });
  }

  await setCachedResult('stride', hash, threats);
  return threats;
};

export const agentCompliance = async (threats: Threat[]): Promise<ComplianceGap[]> => {
  await new Promise(r => setTimeout(r, 1500));
  
  const gaps: ComplianceGap[] = [
    { controlId: 'SC-8', title: 'Transmission Confidentiality', status: 'Met', description: 'HTTPS is enforced across boundaries.' }
  ];

  const hasSpoofing = threats.some(t => t.category === 'Spoofing');
  if (hasSpoofing) {
    gaps.push({ controlId: 'AC-2', title: 'Account Management', status: 'Gap Identified', description: 'Missing robust authentication validation.' });
  } else {
    gaps.push({ controlId: 'AC-2', title: 'Account Management', status: 'Met', description: 'Authentication controls appear sufficient.' });
  }

  const hasTampering = threats.some(t => t.category === 'Tampering');
  if (hasTampering) {
    gaps.push({ controlId: 'SI-10', title: 'Information Input Validation', status: 'Gap Identified', description: 'Potential injection vulnerabilities exist.' });
  }

  return gaps;
};