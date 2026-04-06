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
Given the comprehensive system context, extract MAXIMUM details to build Level 1 (System Context), Level 2 (Container), and Level 3 (Component) diagrams.

- Level 1 (L1): External users (Person), external systems, and the main system itself.
- Level 2 (L2): Break down the main system into internal containers (Web App, API Gateway, Microservices, Databases).
- Level 3 (L3): Break down the containers into specific components (Controllers, Services, Repositories, Security Modules).

CRITICAL INSTRUCTION FOR DESCRIPTIONS:
The "description" field for EVERY component MUST contain actual, real data from the input. DO NOT use generic phrases like "A database" or "A frontend". 
Instead, specify exactly what it does, the precise technologies used (e.g., AWS, PostgreSQL, React, Auth0), and the specific data it processes based on the provided context. If a technology is not specified, infer its purpose precisely from the context.

Rules for 'c4Level': 
- Use 'Global' for Persons/External Systems that appear across all levels.
- Use 'L1', 'L2', or 'L3' appropriately for the systems, containers, and components.

Return ONLY a valid JSON object with this EXACT structure:
{
  "components": [ 
    { 
      "id": "c1", 
      "name": "string", 
      "type": "Process" | "DataStore" | "ExternalEntity" | "DataFlow",
      "c4Type": "Person" | "System" | "Container" | "Database" | "Component",
      "c4Level": "L1" | "L2" | "L3" | "Global",
      "description": "Specific real data from context: technology stack, exact purpose, and data handled." 
    } 
  ],
  "edges": [ 
    { "id": "e1", "sourceId": "c1", "targetId": "c2", "protocol": "HTTPS", "label": "description of the action" } 
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

  const systemPrompt = `You are an expert threat modeler using the ${framework} framework. Analyze this System Representation Graph (SRG) JSON and identify potential threats in deep detail. 
Return ONLY a valid JSON array of objects with this EXACT structure:
[
  { 
    "id": "T-001", 
    "title": "string", 
    "description": "string (a comprehensive summary of the threat)", 
    "evidence": "string (point out the exact components, missing boundaries, or data flows in the SRG that prove this threat exists)",
    "reasoning": "string (explain step-by-step how an attacker would exploit this vulnerability)",
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