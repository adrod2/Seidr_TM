import { runSecurityPipeline } from './securityPipeline';
import { agentC4Architect, agentThreatModeling, agentRepositoryAnalysis, agentMitigationStrategist } from './agents';
import { db } from '../db';
import { Threat } from './types';

export interface AnalysisPayload {
  name: string;
  description: string;
  frameworks: string[];
  questionnaire?: {
    deployment: string[];
    authMethods: string[];
    dataClassification: string;
  };
  repositoryUrl?: string;
  documentation?: {
    title: string;
    content: string;
  };
  diagramsCount?: number;
  localDocuments?: string[];
}

export const startAnalysisPipeline = async (payload: AnalysisPayload, onProgress: (step: number) => void) => {
  try {
    // 1. Fetch global system context documents (Organizational Knowledge)
    const globalDocs = await db.documents.toArray();
    let globalContextStr = "";
    if (globalDocs.length > 0) {
      globalContextStr = "\n\n--- GLOBAL SYSTEM CONTEXT (ORGANIZATIONAL KNOWLEDGE) ---\n" + 
        globalDocs.map(d => `Document: ${d.name}\n${d.content}`).join('\n\n');
    }

    // 2. Isolate User-Provided Context (Architecture specifics)
    const userContextStr = `
      System Description: ${payload.description || 'Not provided'}
      Deployment Model: ${payload.questionnaire?.deployment.join(', ') || 'Unknown'}
      Authentication: ${payload.questionnaire?.authMethods.join(', ') || 'Unknown'}
      Data Classification: ${payload.questionnaire?.dataClassification || 'Unknown'}
      Repository: ${payload.repositoryUrl || 'None'}
      Additional Docs [${payload.documentation?.title || 'Untitled'}]: ${payload.documentation?.content || 'None'}
    `.trim();

    onProgress(0);
    // Sanitize ONLY the user inputs
    const { sanitisedInput, piiRedactedCount } = runSecurityPipeline(userContextStr);

    if (piiRedactedCount > 0) {
      console.log(`[Audit] Redacted ${piiRedactedCount} PII elements from input`);
    }

    onProgress(1);
    let c4Context = sanitisedInput; // C4 Agent will only see User Inputs
    let repoThreats: Threat[] = [];
    let repoScannedFiles: { path: string, size: number }[] = [];
    
    if (payload.repositoryUrl) {
      try {
        const repoAnalysis = await agentRepositoryAnalysis(payload.repositoryUrl, sanitisedInput);
        c4Context += `\n\nRepository Inferred Purpose:\n${repoAnalysis.inferredPurpose}`;
        repoThreats = repoAnalysis.inherentVulnerabilities || [];
        repoScannedFiles = repoAnalysis.scannedFiles || [];
      } catch (e) {
        console.warn("Repository analysis failed, skipping repo specific threats.", e);
      }
    } else {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    onProgress(2);
    // Generate C4 strictly from user context
    const srg = await agentC4Architect(c4Context);

    onProgress(3);
    await new Promise(resolve => setTimeout(resolve, 800)); // Visual buffer for Identifying trust boundaries

    onProgress(4);
    const framework = payload.frameworks[0] || 'STRIDE';
    
    // Threat modeling utilizes BOTH user architecture context AND global organizational policies
    const fullContextForThreats = c4Context + globalContextStr;
    const archThreats = await agentThreatModeling(srg, framework, fullContextForThreats);
    
    // Combine architecture threats and SAST repo threats
    let allThreats = [...archThreats, ...repoThreats].sort((a, b) => b.cvssScore - a.cvssScore);

    onProgress(5);
    
    // Generate tailored mitigations for the top threats
    const topThreatsToMitigate = allThreats.slice(0, 10);
    const mitigationPromises = topThreatsToMitigate.map(threat => 
      agentMitigationStrategist(threat, fullContextForThreats)
        .then(strategy => { threat.mitigation = strategy; })
        .catch(err => { console.warn(`Failed to generate mitigation for ${threat.id}`, err); })
    );
    await Promise.all(mitigationPromises);

    onProgress(6);
    
    const avgScore = allThreats.length > 0 ? allThreats.reduce((acc, t) => acc + t.cvssScore, 0) / allThreats.length : 0;
    
    let riskMultiplier = 1.0;
    if (payload.questionnaire?.dataClassification.includes('Highly Restricted')) riskMultiplier += 0.2;
    if (payload.questionnaire?.authMethods?.length === 0) riskMultiplier += 0.3;
    
    const riskScore = Math.min(100, Math.round(avgScore * 10 * riskMultiplier));

    const timestampStr = Date.now().toString(36).toUpperCase();
    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
    const newModelId = `TM-${timestampStr}-${randomStr}`;

    await db.threatModels.put({
      id: newModelId,
      name: payload.name || 'Untitled Threat Model',
      description: fullContextForThreats, // Save full context for the report
      riskScore: riskScore,
      date: new Date().toISOString(),
      status: 'Completed',
      srg,
      threats: allThreats,
      complianceGaps: [], // Set to empty to satisfy interface schema
      framework,
      assessmentMeta: {
        diagramsCount: payload.diagramsCount || 0,
        repositoryUrl: payload.repositoryUrl,
        localDocuments: payload.localDocuments || [],
        globalDocuments: globalDocs.map(d => d.name),
        scannedFiles: repoScannedFiles
      }
    });

    return { success: true, modelId: newModelId };
  } catch (error: any) {
    console.error('Pipeline Error:', error);
    return { success: false, error: error.message };
  }
};