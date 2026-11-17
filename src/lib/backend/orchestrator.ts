import { runSecurityPipeline } from './securityPipeline';
import { agentC4Architect, agentThreatModeling, agentCompliance, agentRepositoryAnalysis, agentMitigationStrategist,
  agentWebIntelligence, agentSummarizeDescription, agentDocumentDigest, fallbackDescriptionSummary } from './agents';
import { type ContextSection, type InputStatus, CONTEXT_BUDGET_CHARS, assembleContext, sanitiseSection } from './analysisContext';
import { prepareDocument } from './documentContext';
import { mapLimit } from './asyncUtils';
import { getErrorMessage, looksBinaryDocument } from './inputUtils';
import { analyseRepositories, getRepositoryUrls } from './repositoryInputs';
import { db, type ThreatModel } from '../db';
import type { AnalysisResult, DescriptionSummary, WebIntelligence } from './types';
import { snapshotModelInputs, type AnalysisPayload } from './modelInputs';

export type { AnalysisPayload, AnalysisDiagram } from './modelInputs';

const MITIGATION_CONTEXT_CHARS = 60_000;
const REPOSITORY_CONTEXT_CHARS = 60_000;

const summarizeDescription = async (text: string): Promise<DescriptionSummary> => {
  try {
    const { sanitisedInput } = runSecurityPipeline(text.slice(0, 100000));
    return await agentSummarizeDescription(sanitisedInput);
  } catch (error) {
    console.warn('Description summary failed, using extractive fallback.', error);
    return fallbackDescriptionSummary(text.slice(0, 4000));
  }
};

export const startAnalysisPipeline = async (payload: AnalysisPayload, onProgress: (step: number) => void): Promise<AnalysisResult> => {
  try {
    const repositoryUrls = getRepositoryUrls(payload.repositoryUrls, payload.repositoryUrl);
    const userText = payload.userDescription?.trim();
    const inputs: InputStatus[] = [];
    const sections: ContextSection[] = [];
    /** For each section, the index of the input status it belongs to. */
    const sectionInput: number[] = [];
    const addSection = (section: ContextSection, status: InputStatus) => {
      sectionInput.push(inputs.length);
      sections.push(section);
      inputs.push(status);
    };

    onProgress(0);
    // The typed description and questionnaire go through the full 3-gate pipeline (and may fail the run, by design).
    const userContextStr = [
      payload.description || 'Not provided',
      payload.questionnaire && `Deployment Model: ${payload.questionnaire.deployment.join(', ') || 'Unknown'}`,
      payload.questionnaire && `Authentication: ${payload.questionnaire.authMethods.join(', ') || 'Unknown'}`,
      payload.questionnaire && `Data Classification: ${payload.questionnaire.dataClassification || 'Unknown'}`,
      repositoryUrls.length > 0 && `Repositories:\n${repositoryUrls.join('\n')}`,
      payload.documentation && `Additional Docs [${payload.documentation.title || 'Untitled'}]: ${payload.documentation.content}`,
    ].filter(Boolean).join('\n');
    const { sanitisedInput: sanitisedDescription, piiRedactedCount } = runSecurityPipeline(userContextStr);
    if (piiRedactedCount > 0) console.log(`[Audit] Redacted ${piiRedactedCount} PII elements from input`);
    addSection({ kind: 'description', name: 'System description', text: sanitisedDescription },
      { kind: 'description', name: payload.usedDefaultDescription ? 'Default description (no input provided)' : 'System description',
        status: 'included', chars: 0, sourceChars: sanitisedDescription.length });

    // Architecture diagrams (already analysed by the vision agent on upload).
    for (const diagram of payload.diagrams || []) {
      if (!diagram.description?.trim()) {
        inputs.push({ kind: 'diagram', name: diagram.name, status: 'failed', chars: 0, note: diagram.error || 'Vision analysis produced no output.' });
        continue;
      }
      const clean = sanitiseSection(diagram.description);
      if (!clean.passed) {
        inputs.push({ kind: 'diagram', name: diagram.name, status: 'excluded', chars: 0, note: clean.reason });
        continue;
      }
      addSection({ kind: 'diagram', name: `Diagram: ${diagram.name}`, text: clean.text },
        { kind: 'diagram', name: diagram.name, status: 'included', chars: 0, sourceChars: clean.text.length, method: 'vision' });
    }

    // Supporting documents: each is sanitised independently; long ones are condensed by the digest agent.
    const docResults = await mapLimit(payload.documents || [], 3, doc => prepareDocument(doc, agentDocumentDigest));
    for (const result of docResults) {
      if (result.section) addSection(result.section, result.status);
      else inputs.push(result.status);
    }

    onProgress(1);
    let webIntel: WebIntelligence | undefined = payload.webIntelligence;
    let webIntelligenceError: string | undefined;
    if (payload.sourceUrl && !webIntel) {
      try {
        webIntel = await agentWebIntelligence(payload.sourceUrl);
      } catch (e) {
        webIntelligenceError = getErrorMessage(e);
        console.warn('URL documentation crawl failed, continuing without it.', e);
      }
    }
    if (webIntel) {
      const clean = sanitiseSection(webIntel.summary);
      if (clean.passed) {
        addSection({ kind: 'website', name: `Website: ${webIntel.sourceUrl}`, detail: `${webIntel.pages.length} page(s) crawled`, text: clean.text },
          { kind: 'website', name: webIntel.sourceUrl, status: 'included', chars: 0, sourceChars: clean.text.length, method: `${webIntel.pages.length} pages` });
      } else {
        webIntelligenceError = 'Crawled documentation was excluded by the prompt-injection gate.';
      }
    }
    if (payload.sourceUrl && webIntelligenceError) {
      inputs.push({ kind: 'website', name: payload.sourceUrl, status: 'failed', chars: 0, note: webIntelligenceError });
    }

    // Everything the user supplied is now known, so the scope summary can run alongside the remaining agents.
    const userInputContext = assembleContext(sections, 100_000).text;
    const descriptionSource: 'user' | 'derived' | 'default' = payload.usedDefaultDescription ? 'default' : userText ? 'user' : 'derived';
    const descriptionSummaryPromise = summarizeDescription(userText || userInputContext);

    onProgress(2);
    const repositories = await analyseRepositories(
      repositoryUrls, assembleContext(sections, REPOSITORY_CONTEXT_CHARS).text, agentRepositoryAnalysis,
    );
    const repoThreats = repositories.flatMap(repo => repo.threats);
    const repoScannedFiles = repositories.flatMap(repo => repo.scannedFiles);
    for (const repo of repositories) {
      if (repo.section) addSection(repo.section, repo.status);
      else inputs.push(repo.status);
      for (const source of repo.sources) {
        if (source.section) addSection(source.section, source.status);
        else inputs.push(source.status);
      }
    }

    // Organizational knowledge base (global documents from Administration) informs threats, not the architecture.
    const globalDocs = await db.documents.toArray();
    for (const doc of globalDocs) {
      const content = doc.content || '';
      if (!content.trim()) {
        inputs.push({ kind: 'knowledge', name: doc.name, status: 'empty', chars: 0, note: 'No text stored for this document.' });
        continue;
      }
      if (looksBinaryDocument(content)) {
        inputs.push({ kind: 'knowledge', name: doc.name, status: 'failed', chars: 0, note: 'Stored without text extraction; re-upload it in Administration > System Context.' });
        continue;
      }
      const clean = sanitiseSection(content);
      if (!clean.passed) {
        inputs.push({ kind: 'knowledge', name: doc.name, status: 'excluded', chars: 0, note: clean.reason });
        continue;
      }
      addSection({ kind: 'knowledge', name: `Policy: ${doc.name}`, text: clean.text },
        { kind: 'knowledge', name: doc.name, status: 'included', chars: 0, sourceChars: clean.text.length, method: doc.extraction?.method });
    }

    onProgress(3);
    const architectureSections = sections.filter(s => s.kind !== 'knowledge');
    const c4Context = assembleContext(architectureSections, CONTEXT_BUDGET_CHARS).text;
    const srg = await agentC4Architect(c4Context);

    onProgress(4);
    const threatContext = assembleContext(sections, CONTEXT_BUDGET_CHARS);
    threatContext.kept.forEach((kept, sectionIndex) => {
      const status = inputs[sectionInput[sectionIndex]];
      status.chars = kept;
      if (kept < sections[sectionIndex].text.trim().length) {
        status.status = 'truncated';
        status.note = [status.note, 'Shortened to fit the analysis context budget.'].filter(Boolean).join(' ');
      }
    });
    const fullContextForThreats = threatContext.text;

    onProgress(5);
    const framework = payload.frameworks[0] || 'STRIDE';
    const archThreats = await agentThreatModeling(srg, framework, fullContextForThreats);
    const allThreats = [...archThreats, ...repoThreats].sort((a, b) => b.cvssScore - a.cvssScore);

    onProgress(6);
    const mitigationContext = assembleContext(sections, MITIGATION_CONTEXT_CHARS).text;
    await Promise.all(allThreats.slice(0, 10).map(threat =>
      agentMitigationStrategist(threat, mitigationContext)
        .then(strategy => { threat.mitigation = strategy; })
        .catch(err => { console.warn(`Failed to generate mitigation for ${threat.id}`, err); })
    ));

    onProgress(7);
    const mmappDoc = globalDocs.find(d => d.name.toLowerCase().includes('mmapp controls.csv'));
    const complianceGaps = await agentCompliance(allThreats, mmappDoc?.content || '');

    onProgress(8);
    const avgScore = allThreats.length > 0 ? allThreats.reduce((acc, t) => acc + t.cvssScore, 0) / allThreats.length : 0;
    let riskMultiplier = 1.0;
    if (payload.questionnaire?.dataClassification.includes('Highly Restricted')) riskMultiplier += 0.2;
    if (payload.questionnaire?.authMethods?.length === 0) riskMultiplier += 0.3;
    const riskScore = Math.min(100, Math.round(avgScore * 10 * riskMultiplier));

    const timestampStr = Date.now().toString(36).toUpperCase();
    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
    const newModelId = `TM-${timestampStr}-${randomStr}`;

    const descriptionSummary = await descriptionSummaryPromise;

    const model: ThreatModel = {
      id: newModelId,
      name: payload.name || 'Untitled Threat Model',
      description: fullContextForThreats, // Full analysed context, reused by the report and the AI Copilot chat
      riskScore,
      date: new Date().toISOString(),
      status: 'Completed',
      srg,
      threats: allThreats,
      complianceGaps,
      framework,
      assessmentMeta: {
        diagramsCount: payload.diagramsCount ?? payload.diagrams?.length ?? 0,
        repositoryUrl: repositoryUrls[0],
        repositoryUrls,
        localDocuments: payload.localDocuments || payload.documents?.map(d => d.name) || [],
        globalDocuments: globalDocs.map(d => d.name),
        scannedFiles: repoScannedFiles,
        descriptionSummary: descriptionSummary.summary,
        descriptionHighlights: descriptionSummary.highlights,
        descriptionSource,
        sourceUrl: payload.sourceUrl || undefined,
        crawledPages: webIntel?.pages,
        webIntelligence: webIntel?.summary,
        webIntelligenceError,
        inputs,
        contextChars: fullContextForThreats.length,
      },
    };
    await db.transaction('rw', db.threatModels, db.modelInputs, async () => {
      await db.modelInputs.put(snapshotModelInputs(newModelId, payload));
      await db.threatModels.put(model);
    });

    return { success: true, modelId: newModelId };
  } catch (error) {
    console.error('Pipeline Error:', error);
    return { success: false, error: getErrorMessage(error) };
  }
};
