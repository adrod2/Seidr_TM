import { hashInput, getCachedResult, setCachedResult } from './agentCache';
import { SystemRepresentationGraph, Threat, ComplianceGap } from './types';
import { callLLM } from './llmClient';

/**
 * Normalizer Agent: Converts raw system descriptions into a C4 System Representation Graph (SRG).
 */
export const agentNormalizer = async (sanitisedInput: string): Promise<SystemRepresentationGraph> => {
  const hash = await hashInput(sanitisedInput);
  const cached = await getCachedResult<SystemRepresentationGraph>('normalizer', hash);
  if (cached) return cached;

  const systemPrompt = `You are an expert security architect. Given the system description, identify the architectural components, data flows, and trust boundaries. 
Return ONLY a valid JSON object with this EXACT structure:
{
  "components": [ { "id": "c1", "name": "string", "type": "Process" | "DataStore" | "ExternalEntity" | "DataFlow", "description": "string" } ],
  "edges": [ { "id": "e1", "sourceId": "c1", "targetId": "c2", "protocol": "HTTPS" } ],
  "trustBoundaries": [ "Internet", "VPC" ]
}`;

  const result = await callLLM(systemPrompt, `System Context:\n${sanitisedInput}`);
  
  await setCachedResult('normalizer', hash, result);
  return result as SystemRepresentationGraph;
};

/**
 * STRIDE Agent: Analyzes the SRG to identify threats based on the STRIDE framework.
 */
export const agentSTRIDE = async (srg: SystemRepresentationGraph): Promise<Threat[]> => {
  const hash = await hashInput(JSON.stringify(srg));
  const cached = await getCachedResult<Threat[]>('stride', hash);
  if (cached) return cached;

  const systemPrompt = `You are an expert threat modeler using the STRIDE framework. Analyze this System Representation Graph (SRG) JSON and identify potential threats. 
Return ONLY a valid JSON array of objects with this EXACT structure:
[
  { 
    "id": "T-001", 
    "title": "string", 
    "description": "string", 
    "category": "Spoofing" | "Tampering" | "Repudiation" | "Information Disclosure" | "Denial of Service" | "Elevation of Privilege", 
    "componentId": "string (name of the vulnerable component)", 
    "cvssScore": 8.5, 
    "severity": "Critical" | "High" | "Medium" | "Low" 
  }
]`;

  const threatsData = await callLLM(systemPrompt, `SRG Data:\n${JSON.stringify(srg, null, 2)}`);
  
  const threats = (threatsData as Threat[]).sort((a, b) => b.cvssScore - a.cvssScore);
  
  await setCachedResult('stride', hash, threats);
  return threats;
};

/**
 * Compliance Agent: Maps identified threats to compliance gaps (NIST SP 800-53).
 */
export const agentCompliance = async (threats: Threat[]): Promise<ComplianceGap[]> => {
  const systemPrompt = `You are a compliance expert. Given these identified threats, map them to missing NIST SP 800-53 controls. 
Return ONLY a valid JSON array of objects with this EXACT structure:
[
  { 
    "controlId": "AC-2", 
    "title": "Account Management", 
    "status": "Gap Identified" | "Partially Met", 
    "description": "Explain how the threat causes this control gap." 
  }
]`;

  const gapsData = await callLLM(systemPrompt, `Identified Threats:\n${JSON.stringify(threats.map(t => ({ id: t.id, title: t.title, component: t.componentId })), null, 2)}`);
  
  return gapsData as ComplianceGap[];
};