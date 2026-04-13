import { hashInput, getCachedResult, setCachedResult } from './agentCache';
import { SystemRepresentationGraph, Threat, ComplianceGap } from './types';
import { callLLM } from './llmClient';
import { tavily } from '@tavily/core';

// Note: Ensure TAVILY_API_KEY is available in your environment variables
const tvly = tavily({ apiKey: import.meta.env.VITE_TAVILY_API_KEY || 'tvly-mock-key' });

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
 * Repository Analysis Agent: SAST and dependency heuristic scan
 */
export const agentRepositoryAnalysis = async (repositoryUrl: string, context: string): Promise<{ inferredPurpose: string, inherentVulnerabilities: Threat[] }> => {
  const hash = await hashInput(`${repositoryUrl}_${context}`);
  const cached = await getCachedResult<any>('repoAnalysis', hash);
  if (cached) return cached;

  const systemPrompt = `You are an expert static application security testing (SAST) and repository analysis agent.
Given a repository URL and system context, perform a heuristic analysis to infer the repository's likely purpose, architecture, and technology stack.
Identify 1-3 typical inherent code-level vulnerabilities (e.g., injection flaws, hardcoded secrets, insecure deserialization) that are statistically likely in this type of codebase based on standard patterns.

Return ONLY a valid JSON object with this EXACT structure:
{
  "inferredPurpose": "A detailed explanation of what this repository likely does, its architecture, and tech stack.",
  "inherentVulnerabilities": [
    {
      "id": "SAST-001",
      "title": "string",
      "description": "string (specific code-level vulnerability)",
      "evidence": "string (explain why this codebase architecture is susceptible to this)",
      "reasoning": "string (explain step-by-step how an attacker might exploit this)",
      "category": "Code Vulnerability",
      "componentId": "Repository Codebase",
      "cvssScore": 7.5,
      "severity": "High" | "Medium" | "Low"
    }
  ]
}`;

  const result = await callLLM(systemPrompt, `Repository URL: ${repositoryUrl}\nContext: ${context}`);
  
  await setCachedResult('repoAnalysis', hash, result);
  return result as { inferredPurpose: string, inherentVulnerabilities: Threat[] };
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
 * Mitigation Agent: Searches the web and system context to generate tailored mitigation strategies for specific threats.
 */
export const agentMitigationStrategist = async (threat: Threat, systemContext: string): Promise<string> => {
  const hash = await hashInput(`mitigation_${threat.id}_${systemContext}`);
  const cached = await getCachedResult<string>('mitigationStrategy', hash);
  if (cached) return cached;

  let searchContext = '';
  try {
    // Perform a targeted web search for mitigation strategies based on the threat title and category
    const searchResponse = await tvly.search(`How to mitigate ${threat.title} vulnerability ${threat.category} best practices technical implementation`);
    searchContext = searchResponse.results.map(r => r.content).join('\n');
  } catch (error) {
    console.warn('Tavily search failed, falling back to LLM knowledge:', error);
  }

  const systemPrompt = `You are an expert Application Security Engineer specializing in actionable threat mitigation.
Given a specific threat from a threat model and the broader system context, provide a highly tailored, step-by-step mitigation strategy.

Context Rules:
1. Ground your advice in the provided System Context (technologies, frameworks).
2. Incorporate modern best practices, drawing from the provided Web Search Context if available.
3. Be specific. Do not say "implement secure logging". Instead say "Configure your Node.js backend to use Winston for structured JSON logging, sending logs to AWS CloudWatch via an IAM role with restricted put-only permissions."

Return ONLY a raw string (no markdown formatting, no JSON, just the text) containing the tailored mitigation plan. Keep it between 3 and 5 sentences.`;

  const promptInput = `
Threat Title: ${threat.title}
Threat Category: ${threat.category}
Component Affected: ${threat.componentId}
Threat Description: ${threat.description}

System Architecture Context:
${systemContext}

Recent Web Research on Mitigation:
${searchContext}
  `;

  const result = await callLLM(systemPrompt, promptInput);
  
  // Clean up any potential JSON quotes if the LLM hallucinated them
  const cleanedResult = typeof result === 'string' ? result.replace(/^["']|["']$/g, '') : JSON.stringify(result);
  
  await setCachedResult('mitigationStrategy', hash, cleanedResult);
  return cleanedResult;
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