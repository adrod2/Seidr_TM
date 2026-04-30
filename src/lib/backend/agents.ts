import { hashInput, getCachedResult, setCachedResult } from './agentCache';
import { SystemRepresentationGraph, Threat, ComplianceGap } from './types';
import { callLLM, callVisionLLM } from './llmClient';
import { parseGitHubUrl, scanGitHubRepository } from './githubScanner';

/**
 * Diagram Analysis Agent: Uses Vision LLMs to extract dense textual architecture details from an image.
 */
export const agentAnalyzeDiagram = async (base64DataUrl: string): Promise<string> => {
  const hash = await hashInput(base64DataUrl.substring(0, 500)); 
  const cached = await getCachedResult<string>('diagramAnalysis', hash);
  if (cached) return cached;

  const systemPrompt = `You are an expert cloud architect and security engineer. Analyze the provided architecture diagram in extensive technical detail. Identify all components, data flows, trust boundaries, network zones, and technologies depicted. Focus strictly on facts visible in the diagram and infer their security implications based on standard architecture patterns.`;
  
  const userPrompt = "Describe this architecture diagram in extensive technical detail so it can be used for threat modeling. List components, data flows, and boundaries.";

  const result = await callVisionLLM(systemPrompt, userPrompt, base64DataUrl);
  
  await setCachedResult('diagramAnalysis', hash, result);
  return result;
};

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
 * Repository Analysis Agent: SAST and dependency heuristic scan via GitHub APIs
 */
export const agentRepositoryAnalysis = async (repositoryUrl: string, context: string): Promise<{ inferredPurpose: string, inherentVulnerabilities: Threat[], scannedFiles: { path: string, size: number }[] }> => {
  const hash = await hashInput(`${repositoryUrl}_${context}`);
  const cached = await getCachedResult<any>('repoAnalysis', hash);
  if (cached) return cached;

  let repoContext = `Repository URL: ${repositoryUrl}\nContext: ${context}`;
  let scannedFiles: { path: string, size: number }[] = [];

  // If it's a GitHub URL, parse it and fetch real file trees/manifests
  const githubInfo = parseGitHubUrl(repositoryUrl);
  if (githubInfo) {
    const scanData = await scanGitHubRepository(githubInfo.owner, githubInfo.repo);
    repoContext += `\n\n${scanData.contextString}`;
    scannedFiles = scanData.scannedFiles;
  }

  const systemPrompt = `You are an expert static application security testing (SAST), Software Composition Analysis (SCA), and repository analysis agent.
Given the provided system context, repository metadata, file tree, and selected critical file contents, perform a deep architectural and security analysis.
Infer the repository's precise purpose, architecture, and technology stack based on the actual files and manifests provided.
Identify 1-3 inherent code-level vulnerabilities, misconfigurations, or supply-chain risks present in this codebase.

CRITICAL INSTRUCTIONS:
- Base your findings ON THE ACTUAL DATA provided (dependencies in package.json, exposed ports in Dockerfile, specific routing files, etc.).
- Your "evidence" field MUST quote or specifically reference file paths, lines, or configurations directly from the provided file tree and contents.
- If no critical files were successfully fetched, rely on the file tree structure to infer architecture and likely risks.

Return ONLY a valid JSON object with this EXACT structure:
{
  "inferredPurpose": "A detailed explanation of what this repository does, its architecture, and tech stack based on actual files.",
  "inherentVulnerabilities": [
    {
      "id": "SAST-001",
      "title": "string",
      "description": "string (specific code-level vulnerability or misconfiguration)",
      "evidence": "string (MUST reference specific files, e.g., 'Found in /backend/Dockerfile exposing port 80 without TLS' or 'package.json includes vulnerable lib')",
      "reasoning": "string (explain step-by-step how an attacker might exploit this)",
      "category": "Code Vulnerability",
      "componentId": "Repository Codebase",
      "cvssScore": 7.5,
      "severity": "High" | "Medium" | "Low"
    }
  ]
}`;

  const result = await callLLM(systemPrompt, repoContext);
  
  const finalResult = { ...(result as any), scannedFiles };
  await setCachedResult('repoAnalysis', hash, finalResult);
  return finalResult;
};

/**
 * Threat Modeling Agent: Analyzes the SRG alongside the full system context to identify threats.
 */
export const agentThreatModeling = async (srg: SystemRepresentationGraph, framework: string, systemContext: string): Promise<Threat[]> => {
  const hash = await hashInput(`${framework}_${JSON.stringify(srg)}_${systemContext}`);
  const cached = await getCachedResult<Threat[]>('threatModeling', hash);
  if (cached) return cached;

  const systemPrompt = `You are an expert threat modeler using the ${framework} framework. 
Analyze the provided System Representation Graph (SRG) ALONG WITH the broader System Context (which includes textual descriptions, documents, diagrams, and repository analysis). 
Identify potential threats in deep detail by correlating the architecture with the provided context.

Return ONLY a valid JSON array of objects with this EXACT structure:
[
  { 
    "id": "T-001", 
    "title": "string", 
    "description": "string (a comprehensive summary of the threat)", 
    "evidence": "string (point out the exact components, missing boundaries in the SRG, OR specific clues from the System Context that prove this threat exists)",
    "reasoning": "string (explain step-by-step how an attacker would exploit this vulnerability)",
    "category": "string (the threat category according to the ${framework} framework)", 
    "componentId": "string (name of the vulnerable component)", 
    "cvssScore": 8.5, 
    "severity": "Critical" | "High" | "Medium" | "Low" 
  }
]`;

  const promptInput = `System Context:\n${systemContext}\n\nSRG Data:\n${JSON.stringify(srg, null, 2)}`;
  const threatsData = await callLLM(systemPrompt, promptInput);
  
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
    const apiKey = import.meta.env.VITE_TAVILY_API_KEY;
    if (apiKey) {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          query: `How to mitigate ${threat.title} vulnerability ${threat.category} best practices technical implementation`,
          search_depth: 'basic',
          include_answer: false,
          include_images: false,
          include_raw_content: false,
          max_results: 3
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        searchContext = data.results?.map((r: any) => r.content).join('\n') || '';
      } else {
        console.warn('Tavily API returned an error:', await response.text());
      }
    } else {
      console.warn('Tavily API key not found, skipping web search.');
    }
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
  
  const cleanedResult = typeof result === 'string' ? result.replace(/^["']|["']$/g, '') : JSON.stringify(result);
  
  await setCachedResult('mitigationStrategy', hash, cleanedResult);
  return cleanedResult;
};

/**
 * Compliance Agent: Maps identified threats to compliance gaps based on provided controls.
 */
export const agentCompliance = async (threats: Threat[], customControlsContext?: string): Promise<ComplianceGap[]> => {
  const systemPrompt = `You are a compliance expert. Given these identified threats, map them to missing or partially met security controls.
${customControlsContext 
  ? `CRITICAL INSTRUCTION: You MUST ONLY evaluate compliance against the following specific mandatory controls provided in the organizational context:\n\n${customControlsContext}\n\nDo NOT use any other controls outside of this list.` 
  : `Map them to missing NIST SP 800-53 controls.`}

Return ONLY a valid JSON array of objects with this EXACT structure:
[
  { 
    "controlId": "string (e.g., AC-2)", 
    "title": "string", 
    "status": "Gap Identified" | "Partially Met", 
    "description": "Explain how the specific threat causes this control gap." 
  }
]`;

  // Provide the LLM with the threat details to find the gaps
  const promptData = `Identified Threats:\n${JSON.stringify(threats.map(t => ({ id: t.id, title: t.title, component: t.componentId, description: t.description })), null, 2)}`;
  
  const gapsData = await callLLM(systemPrompt, promptData);
  return gapsData as ComplianceGap[];
};

/**
 * Translation Agent: Translates the threat report to a target language.
 */
export const agentTranslateReport = async (modelData: any, targetLanguage: string): Promise<any> => {
  const hash = await hashInput(`translate_${modelData.id}_${targetLanguage}`);
  const cached = await getCachedResult<any>('translation', hash);
  if (cached) return cached;

  const payload = {
    name: modelData.name,
    threats: modelData.threats?.map((t: any) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      category: t.category,
      reasoning: t.reasoning,
      mitigation: t.mitigation,
      severity: t.severity
    })),
    complianceGaps: modelData.complianceGaps?.map((c: any) => ({
      controlId: c.controlId,
      title: c.title,
      status: c.status,
      description: c.description
    })),
    uiStrings: {
      reportTitle: "Threat Model Report",
      systemName: "System Name",
      modelId: "Model ID",
      dateGenerated: "Date Generated",
      framework: "Framework",
      riskScore: "Risk Score",
      identifiedThreats: "Identified Threats & Mitigations",
      noThreats: "No threats identified.",
      description: "Description",
      exploitationPath: "Exploitation Path",
      suggestedMitigation: "Suggested Mitigation Action",
      noMitigation: "No specific mitigation provided.",
      complianceGaps: "Compliance Gaps (NIST SP 800-53)",
      noGaps: "No critical compliance gaps identified. All mapped controls are met.",
      controlId: "Control ID",
      title: "Title",
      status: "Status",
      details: "Details"
    }
  };

  const systemPrompt = `You are a professional cybersecurity translator. Translate ALL string values in the following JSON payload into ${targetLanguage}.
  CRITICAL INSTRUCTIONS:
  1. ONLY translate the string values (the right side of the key-value pairs).
  2. DO NOT change ANY JSON keys (e.g., keep "uiStrings", "description", "title", "id" exactly as they are).
  3. Keep cybersecurity technical terms accurate and natural in ${targetLanguage}.
  4. Return ONLY a valid JSON object matching the exact structure of the input.`;

  const result = await callLLM(systemPrompt, JSON.stringify(payload, null, 2));

  // Merge translations back to preserve non-translated fields (like raw numeric scores or original IDs)
  const translatedData = {
    ...modelData,
    name: result.name || modelData.name,
    uiStrings: result.uiStrings,
    threats: modelData.threats?.map((t: any) => {
      const trans = result.threats?.find((rt: any) => rt.id === t.id) || {};
      return { ...t, ...trans };
    }),
    complianceGaps: modelData.complianceGaps?.map((c: any) => {
      const trans = result.complianceGaps?.find((rc: any) => rc.controlId === c.controlId) || {};
      return { ...c, ...trans };
    })
  };

  await setCachedResult('translation', hash, translatedData);
  return translatedData;
};