import { hashInput, getCachedResult, setCachedResult } from './agentCache';
import { SystemRepresentationGraph, Threat, ComplianceGap } from './types';
import { callLLM } from './llmClient';

/**
 * C4 Architecture Agent: Converts raw system descriptions into a highly structured C4 System Representation Graph (SRG).
 */
export const agentC4Architect = async (sanitisedInput: string): Promise<SystemRepresentationGraph> => {
  const hash = await hashInput(sanitisedInput);
  const cached = await getCachedResult<SystemRepresentationGraph>('c4Architect', hash);
  if (cached) return cached;

  const systemPrompt = `You are an expert software architect specializing in the C4 model. 
Given the comprehensive system context, identify the architectural components and data flows to build Level 1 (System Context) and Level 2 (Container) diagrams.
- Level 1 (L1) should include external users (Person), external systems, and the main system itself.
- Level 2 (L2) should break down the main system into internal containers (Web App, API, Database, etc.) and include the external users/systems interacting with them.

Return ONLY a valid JSON object with this EXACT structure:
{
  "components": [ 
    { 
      "id": "c1", 
      "name": "string", 
      "type": "Process" | "DataStore" | "ExternalEntity" | "DataFlow",
      "c4Type": "Person" | "System" | "Container" | "Database",
      "c4Level": "L1" | "L2" | "Both",
      "description": "string" 
    } 
  ],
  "edges": [ 
    { "id": "e1", "sourceId": "c1", "targetId": "c2", "protocol": "HTTPS", "label": "description of the action (e.g., 'Sends data to')" } 
  ],
  "trustBoundaries": [ "Internet", "VPC" ]
}`;

  const result = await callLLM(systemPrompt, `System Context:\n${sanitisedInput}`);
  
  await setCachedResult('c4Architect', hash, result);
  return result as SystemRepresentationGraph;
};

/**
 * Threat Modeling Agent: Analyzes the SRG to identify threats based on the selected framework.
 */
export const agentThreatModeling = async (srg: SystemRepresentationGraph, framework: string): Promise<Threat[]> => {
  const hash = await hashInput(`${framework}_${JSON.stringify(srg)}`);
  const cached = await getCachedResult<Threat[]>('threatModeling', hash);
  if (cached) return cached;

  const systemPrompt = `You are an expert threat modeler using the ${framework} framework. Analyze this System Representation Graph (SRG) JSON and identify potential threats. 
Return ONLY a valid JSON array of objects with this EXACT structure:
[
  { 
    "id": "T-001", 
    "title": "string", 
    "description": "string", 
    "category": "string (the threat category according to the ${framework} framework)", 
    "componentId": "string (name of the vulnerable component)", 
    "cvssScore": 8.5, 
    "severity": "Critical" | "High" | "Medium" | "Low" 
  }
]`;

  const threatsData = await callLLM(systemPrompt, `SRG Data:\n${JSON.stringify(srg, null, 2)}`);
  
  const threats = (threatsData as Threat[]).sort((a, b) => b.cvssScore - a.cvssScore);
  
  await setCachedResult('threatModeling', hash, threats);
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