import { runSecurityPipeline } from './securityPipeline';
import { agentC4Architect, agentThreatModeling, agentCompliance, agentRepositoryAnalysis, agentMitigationStrategist } from './agents';
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
}

export const startAnalysisPipeline = async (payload: AnalysisPayload, onProgress: (step: number) => void) => {
  try {
    const fullContext = `
      System Description: ${payload.description || 'Not provided'}
      Deployment Model: ${payload.questionnaire?.deployment.join(', ') || 'Unknown'}
      Authentication: ${payload.questionnaire?.authMethods.join(', ') || 'Unknown'}
      Data Classification: ${payload.questionnaire?.dataClassification || 'Unknown'}
      Repository: ${payload.repositoryUrl || 'None'}
      Additional Docs [${payload.documentation?.title || 'Untitled'}]: ${payload.documentation?.content || 'None'}
    `.trim();

    onProgress(0);
    const { sanitisedInput, piiRedactedCount } = runSecurityPipeline(fullContext);

    if (piiRedactedCount > 0) {
      console.log(`[Audit] Redacted ${piiRedactedCount} PII elements from input`);
    }

    onProgress(1);
    let finalInput = sanitisedInput;
    let repoThreats: Threat[] = [];
    
    if (payload.repositoryUrl) {
      try {
        const repoAnalysis = await agentRepositoryAnalysis(payload.repositoryUrl, sanitisedInput);
        finalInput += `\n\nRepository Inferred Purpose:\n${repoAnalysis.inferredPurpose}`;
        repoThreats = repoAnalysis.inherentVulnerabilities || [];
      } catch (e) {
        console.warn("Repository analysis failed, skipping repo specific threats.", e);
      }
    } else {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    onProgress(2);
    const srg = await agentC4Architect(finalInput);

    onProgress(3);
    await new Promise(resolve => setTimeout(resolve, 800)); // Visual buffer for Identifying trust boundaries

    onProgress(4);
    const framework = payload.frameworks[0] || 'STRIDE';
    const archThreats = await agentThreatModeling(srg, framework);
    
    // Combine architecture threats and SAST repo threats
    let allThreats = [...archThreats, ...repoThreats].sort((a, b) => b.cvssScore - a.cvssScore);

    onProgress(5);
    
    // Generate tailored mitigations for the top threats (limit to top 10 to manage API latency/costs)
    const topThreatsToMitigate = allThreats.slice(0, 10);
    const mitigationPromises = topThreatsToMitigate.map(threat => 
      agentMitigationStrategist(threat, finalInput)
        .then(strategy => { threat.mitigation = strategy; })
        .catch(err => { console.warn(`Failed to generate mitigation for ${threat.id}`, err); })
    );
    await Promise.all(mitigationPromises);

    onProgress(6);
    const complianceGaps = await agentCompliance(allThreats);

    onProgress(7);
    
    const avgScore = allThreats.length > 0 ? allThreats.reduce((acc, t) => acc + t.cvssScore, 0) / allThreats.length : 0;
    
    let riskMultiplier = 1.0;
    if (payload.questionnaire?.dataClassification.includes('Highly Restricted')) riskMultiplier += 0.2;
    if (payload.questionnaire?.authMethods?.length === 0) riskMultiplier += 0.3;
    
    const riskScore = Math.min(100, Math.round(avgScore * 10 * riskMultiplier));

    // Generate a clear, unique Model ID (e.g., TM-LQYE10B-X4A1)
    const timestampStr = Date.now().toString(36).toUpperCase();
    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
    const newModelId = `TM-${timestampStr}-${randomStr}`;

    // Save to Local Dexie DB
    await db.threatModels.put({
      id: newModelId,
      name: payload.name || 'Untitled Threat Model',
      description: finalInput,
      riskScore: riskScore,
      date: new Date().toISOString(),
      status: 'Completed',
      srg,
      threats: allThreats,
      complianceGaps,
      framework
    });

    return { success: true, modelId: newModelId };
  } catch (error: any) {
    console.error('Pipeline Error:', error);
    return { success: false, error: error.message };
  }
};