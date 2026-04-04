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
    // 1. Combine all context into a single structured string for the security pipeline and agents
    const fullContext = `
      System Description: ${payload.description || 'Not provided'}
      Deployment Model: ${payload.questionnaire?.deployment.join(', ') || 'Unknown'}
      Authentication: ${payload.questionnaire?.authMethods.join(', ') || 'Unknown'}
      Data Classification: ${payload.questionnaire?.dataClassification || 'Unknown'}
      Repository: ${payload.repositoryUrl || 'None'}
      Additional Docs [${payload.documentation?.title || 'Untitled'}]: ${payload.documentation?.content || 'None'}
    `.trim();

    // 2. Security Gates
    onProgress(1); // "Ingesting system context and user inputs..."
    const { sanitisedInput, piiRedactedCount } = runSecurityPipeline(fullContext);

    if (piiRedactedCount > 0) {
      console.log(`[Audit] Redacted ${piiRedactedCount} PII elements from input`);
    }

    // 3. Mock Parsing (Diagrams/Git)
    await new Promise(resolve => setTimeout(resolve, 1000));
    onProgress(2); // "Parsing architecture diagrams and data flows..."

    // 4. Agent 1: Normalizer (Creates System Representation Graph)
    onProgress(3); // "Identifying trust boundaries and components..."
    const srg = await agentNormalizer(sanitisedInput);

    // 5. Agent 2: STRIDE Analyzer
    onProgress(4); // "Applying STRIDE framework and heuristic rules..."
    const threats = await agentSTRIDE(srg);

    // 6. Agent 6: Compliance Mapper
    onProgress(5); // "Evaluating compliance against NIST SP 800-53..."
    const complianceGaps = await agentCompliance(threats);

    // 7. DB Storage & Finalization
    onProgress(6); // "Generating final threat model report..."
    
    // Calculate aggregate risk score
    const avgScore = threats.reduce((acc, t) => acc + t.cvssScore, 0) / (threats.length || 1);
    
    // Boost risk score slightly if highly classified data or no auth is selected in questionnaire
    let riskMultiplier = 1.0;
    if (payload.questionnaire?.dataClassification.includes('Highly Restricted')) riskMultiplier += 0.2;
    if (payload.questionnaire?.authMethods.length === 0) riskMultiplier += 0.3;
    
    const riskScore = Math.min(100, Math.round(avgScore * 10 * riskMultiplier));

    // Fallback ID if Supabase insert fails
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
      console.warn("Could not save to Supabase. Using mock ID.", dbErr);
    }

    return { success: true, modelId: newModelId };
  } catch (error: any) {
    console.error('Pipeline Error:', error);
    return { success: false, error: error.message };
  }
};