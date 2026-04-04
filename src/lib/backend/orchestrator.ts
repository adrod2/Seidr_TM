import { supabase } from '../supabase';
import { runSecurityPipeline } from './securityPipeline';
import { agentNormalizer, agentSTRIDE, agentCompliance } from './agents';

export interface AnalysisPayload {
  name: string;
  description: string;
  frameworks: string[];
}

export const startAnalysisPipeline = async (payload: AnalysisPayload, onProgress: (step: number) => void) => {
  try {
    // 1. Security Gates
    onProgress(1); // "Ingesting system context and user inputs..."
    const { sanitisedInput, piiRedactedCount } = runSecurityPipeline(payload.description);

    if (piiRedactedCount > 0) {
      console.log(`[Audit] Redacted ${piiRedactedCount} PII elements from input`);
      // In prod: await supabase.from('audit_log').insert({ action: 'PII_REDACTION', details: { count: piiRedactedCount } });
    }

    // 2. Mock Parsing (Diagrams/Git)
    await new Promise(resolve => setTimeout(resolve, 800));
    onProgress(2); // "Parsing architecture diagrams and data flows..."

    // 3. Agent 1: Normalizer (Creates System Representation Graph)
    onProgress(3); // "Identifying trust boundaries and components..."
    const srg = await agentNormalizer(sanitisedInput);

    // 4. Agent 2: STRIDE Analyzer
    onProgress(4); // "Applying STRIDE framework and heuristic rules..."
    const threats = await agentSTRIDE(srg);

    // 5. Agent 6: Compliance Mapper
    onProgress(5); // "Evaluating compliance against NIST SP 800-53..."
    const complianceGaps = await agentCompliance(threats);

    // 6. DB Storage & Finalization
    onProgress(6); // "Generating final threat model report..."
    
    // Calculate aggregate risk score
    const avgScore = threats.reduce((acc, t) => acc + t.cvssScore, 0) / (threats.length || 1);
    const riskScore = Math.min(100, Math.round(avgScore * 10));

    // Fallback ID if Supabase insert fails (e.g., table not created yet)
    let newModelId = `m-${Math.random().toString(36).substr(2, 6)}`;

    try {
      const { data, error } = await supabase.from('threat_models').insert({
        name: payload.name,
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