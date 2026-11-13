import { runSecurityPipeline } from './securityPipeline';
import { agentC4Architect, agentThreatModeling, agentCompliance, agentRepositoryAnalysis, agentMitigationStrategist,
  agentWebIntelligence, agentSummarizeDescription, agentDocumentDigest, fallbackDescriptionSummary, WebIntelligence, DescriptionSummary } from './agents';
import { ContextSection, InputStatus, CONTEXT_BUDGET_CHARS, INLINE_DOCUMENT_CHARS, assembleContext, sanitiseSection } from './analysisContext';
import type { ExtractedDocument } from './documentExtractor';
import { db } from '../db';
import { Threat } from './types';

export interface AnalysisDiagram {
  name: string;
  description?: string;
  error?: string;
}

export interface AnalysisPayload {
  name: string;
  /** The system description typed by the user (or the default description when no input was given). */
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
  /** Text extracted from each attached supporting document. */
  documents?: ExtractedDocument[];
  /** Vision analyses of each uploaded architecture diagram. */
  diagrams?: AnalysisDiagram[];
  /** The text the user typed in the System Description field. */
  userDescription?: string;
  /** Optional public URL to spider for security, privacy and architecture documentation. */
  sourceUrl?: string;
  /** Pre-computed crawl result (e.g. from the New Model preview) to avoid crawling twice. */
  webIntelligence?: WebIntelligence;
  usedDefaultDescription?: boolean;
}

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

// eslint-disable-next-line no-control-regex
const looksBinary = (text: string) => /^\s*(%PDF-|PK\x03\x04|PK)/.test(text) || /\b(endobj|endstream|FlateDecode)\b/.test(text.slice(0, 5000));

const methodLabel: Record<string, string> = {
  pdf: 'PDF', 'pdf-ocr': 'scanned PDF, OCR', docx: 'Word', spreadsheet: 'spreadsheet', 'legacy-binary': 'legacy .doc',
  'image-ocr': 'image, OCR', text: 'text', unsupported: 'unsupported',
};

/** Runs up to `limit` async jobs at once, preserving result order. */
const mapLimit = async <T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  }));
  return results;
};

export const startAnalysisPipeline = async (payload: AnalysisPayload, onProgress: (step: number) => void) => {
  try {
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
      payload.repositoryUrl && `Repository: ${payload.repositoryUrl}`,
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
    const docResults = await mapLimit(payload.documents || [], 3, async (doc) => {
      const base = { kind: 'document' as const, name: doc.name, method: methodLabel[doc.method] || doc.method, sourceChars: doc.text.length };
      if (doc.status === 'failed' || !doc.text.trim()) {
        return { status: { ...base, status: doc.status === 'failed' ? 'failed' : 'empty', chars: 0, note: doc.note || 'No readable text found.' } as InputStatus };
      }
      const clean = sanitiseSection(doc.text);
      if (!clean.passed) return { status: { ...base, status: 'excluded', chars: 0, note: `Excluded by the prompt-injection gate: ${clean.reason}` } as InputStatus };
      const detail = [methodLabel[doc.method], doc.pages ? `${doc.pages} ${doc.method === 'spreadsheet' ? 'sheet(s)' : 'page(s)'}` : ''].filter(Boolean).join(', ');
      if (clean.text.length <= INLINE_DOCUMENT_CHARS) {
        return { section: { kind: 'document', name: `Document: ${doc.name}`, detail, text: clean.text } as ContextSection,
          status: { ...base, status: doc.status === 'partial' ? 'truncated' : 'included', chars: 0, note: doc.note } as InputStatus };
      }
      try {
        const digest = await agentDocumentDigest(doc.name, clean.text);
        const digestClean = sanitiseSection(digest);
        if (!digestClean.passed) throw new Error('digest failed the prompt-injection gate');
        return { section: { kind: 'document', name: `Document: ${doc.name}`, detail: `${detail}, security digest of ${clean.text.length.toLocaleString()} characters`, text: digestClean.text } as ContextSection,
          status: { ...base, status: 'digested', chars: 0, note: [doc.note, `Condensed by the document digest agent from ${clean.text.length.toLocaleString()} characters.`].filter(Boolean).join(' ') } as InputStatus };
      } catch (error: any) {
        console.warn(`Digest failed for ${doc.name}; including the beginning verbatim.`, error);
        return { section: { kind: 'document', name: `Document: ${doc.name}`, detail, text: clean.text.slice(0, INLINE_DOCUMENT_CHARS) } as ContextSection,
          status: { ...base, status: 'truncated', chars: 0, note: `Digest failed (${error?.message || error}); first ${INLINE_DOCUMENT_CHARS.toLocaleString()} characters used.` } as InputStatus };
      }
    });
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
      } catch (e: any) {
        webIntelligenceError = e?.message || 'Crawl failed';
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
    let repoThreats: Threat[] = [];
    let repoScannedFiles: { path: string, size: number }[] = [];
    if (payload.repositoryUrl) {
      try {
        const repoAnalysis = await agentRepositoryAnalysis(payload.repositoryUrl, assembleContext(sections, REPOSITORY_CONTEXT_CHARS).text);
        repoThreats = repoAnalysis.inherentVulnerabilities || [];
        repoScannedFiles = repoAnalysis.scannedFiles || [];
        const findings = repoThreats.map((t) => `- ${t.title} (${t.severity}): ${t.evidence || t.description}`).join('\n');
        const clean = sanitiseSection(`Inferred purpose and architecture:\n${repoAnalysis.inferredPurpose}${findings ? `\n\nCode-level findings:\n${findings}` : ''}`);
        if (clean.passed) {
          addSection({ kind: 'repository', name: `Repository: ${payload.repositoryUrl}`, detail: `${repoScannedFiles.length} file(s) scanned`, text: clean.text },
            { kind: 'repository', name: payload.repositoryUrl, status: 'included', chars: 0, sourceChars: clean.text.length, method: `${repoScannedFiles.length} files` });
        }
      } catch (e: any) {
        console.warn('Repository analysis failed, skipping repo specific threats.', e);
        inputs.push({ kind: 'repository', name: payload.repositoryUrl, status: 'failed', chars: 0, note: e?.message || 'Repository analysis failed.' });
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
      if (looksBinary(content)) {
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
    const architectureSections = sections.map((s, i) => ({ s, i })).filter(({ s }) => s.kind !== 'knowledge');
    const c4Context = assembleContext(architectureSections.map(({ s }) => s), CONTEXT_BUDGET_CHARS).text;
    const srg = await agentC4Architect(c4Context);

    onProgress(4);
    const threatContext = assembleContext(sections, CONTEXT_BUDGET_CHARS);
    threatContext.kept.forEach((kept, sectionIndex) => {
      const status = inputs[sectionInput[sectionIndex]];
      status.chars = kept;
      if (kept < sections[sectionIndex].text.trim().length && status.status === 'included') {
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

    await db.threatModels.put({
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
        repositoryUrl: payload.repositoryUrl,
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
      }
    });

    return { success: true, modelId: newModelId };
  } catch (error: any) {
    console.error('Pipeline Error:', error);
    return { success: false, error: error.message };
  }
};
