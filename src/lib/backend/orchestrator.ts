import { supabase } from '../supabase';
import { runSecurityPipeline } from './securityPipeline';
import { agentNormalizer, agentSTRIDE, agentCompliance } from './agents';

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

    onProgress(1);
    const { sanitisedInput, piiRedactedCount } = runSecurityPipeline(fullContext);

    if (piiRedactedCount > 0) {
      console.log(`[Audit] Redacted ${piiRedactedCount} PII elements from input`);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
    onProgress(2);

    onProgress(3);
    const srg = await agentNormalizer(sanitisedInput);

    onProgress(4);
    const threats = await agentSTRIDE(srg);

    onProgress(5);
    const complianceGaps = await agentCompliance(threats);

    onProgress(6);
    
    const avgScore = threats.reduce((acc, t) => acc + t.cvssScore, 0) / (threats.length || 1);
    
    let riskMultiplier = 1.0;
    if (payload.questionnaire?.dataClassification.includes('Highly Restricted')) riskMultiplier += 0.2;
    if (payload.questionnaire?.authMethods.length === 0) riskMultiplier += 0.3;
    
    const riskScore = Math.min(100, Math.round(avgScore * 10 * riskMultiplier));

    let newModelId = `m-${Math.random().toString(36).substr(2, 6)}`;

    try {
      const { data, error } = await supabase.from('threat_models').insert({
        name: payload.name || 'Untitled Threat Model',
        description: sanitisedInput,
        status: 'Completed',
        risk_score: riskScore
      }).select().single();
      
      if (!error && data) {
        newModelId = data.id;
      }
    } catch (dbErr) {
      console.warn("Could not save to Supabase. Using local storage fallback.");
    } finally {
      // Always cache to local storage to guarantee artifacts are available for the UI
      localStorage.setItem(`model_${newModelId}`, JSON.stringify({
        id: newModelId,
        name: payload.name || 'Untitled Threat Model',
        description: sanitisedInput,
        riskScore: riskScore,
        date: new Date().toISOString(),
        status: 'Completed',
        srg,
        threats,
        complianceGaps
      }));
    }

    return { success: true, modelId: newModelId };
  } catch (error: any) {
    console.error('Pipeline Error:', error);
    return { success: false, error: error.message };
  }
};