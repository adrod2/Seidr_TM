import { hashInput, getCachedResult, setCachedResult } from './agentCache';
import { SystemRepresentationGraph, Threat, ComplianceGap } from './types';

// In a real environment, these functions would call OpenAI/Vertex AI via an edge function.
// Here we mock the LLM latency and return structured data based on the architecture.

export const agentNormalizer = async (sanitisedInput: string): Promise<SystemRepresentationGraph> => {
  const hash = await hashInput(sanitisedInput);
  const cached = await getCachedResult<SystemRepresentationGraph>('normalizer', hash);
  if (cached) return cached;

  // Simulate LLM Processing time
  await new Promise(r => setTimeout(r, 2000));

  const result: SystemRepresentationGraph = {
    components: [
      { id: 'c1', name: 'Web Client', type: 'ExternalEntity', description: 'User browser' },
      { id: 'c2', name: 'API Gateway', type: 'Process', description: 'Ingress routing' },
      { id: 'c3', name: 'Primary DB', type: 'DataStore', description: 'Main database' }
    ],
    edges: [
      { id: 'e1', sourceId: 'c1', targetId: 'c2', protocol: 'HTTPS' },
      { id: 'e2', sourceId: 'c2', targetId: 'c3', protocol: 'TCP/5432' }
    ],
    trustBoundaries: ['Internet Edge', 'VPC Private Subnet']
  };

  await setCachedResult('normalizer', hash, result);
  return result;
};

export const agentSTRIDE = async (srg: SystemRepresentationGraph): Promise<Threat[]> => {
  const hash = await hashInput(JSON.stringify(srg));
  const cached = await getCachedResult<Threat[]>('stride', hash);
  if (cached) return cached;

  await new Promise(r => setTimeout(r, 2500));

  const result: Threat[] = [
    {
      id: `T-${Math.floor(Math.random() * 1000)}`,
      title: 'Unauthenticated API Access',
      description: 'API Gateway may allow requests without proper JWT validation.',
      category: 'Spoofing',
      componentId: 'c2',
      cvssScore: 8.5,
      severity: 'High'
    },
    {
      id: `T-${Math.floor(Math.random() * 1000)}`,
      title: 'SQL Injection via Data Input',
      description: 'Primary DB could be vulnerable to injected payloads if queries are not parameterized.',
      category: 'Tampering',
      componentId: 'c3',
      cvssScore: 7.2,
      severity: 'High'
    }
  ];

  await setCachedResult('stride', hash, result);
  return result;
};

export const agentCompliance = async (threats: Threat[]): Promise<ComplianceGap[]> => {
  await new Promise(r => setTimeout(r, 1500));
  
  return [
    { controlId: 'AC-2', title: 'Account Management', status: 'Gap Identified', description: 'Missing robust JWT validation.' },
    { controlId: 'SC-8', title: 'Transmission Confidentiality', status: 'Met', description: 'HTTPS is enforced.' }
  ];
};