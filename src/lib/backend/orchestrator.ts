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
import { createAssessmentQuality, makeEvidenceSource, primaryEvidenceExcerpts, qualitySchema, type EvidenceSource } from './assessmentQuality';

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
    const collectedAt = new Date().toISOString();
    const addSection = (section: ContextSection, status: InputStatus) => {
      sectionInput.push(inputs.length);
      sections.push(section);
      inputs.push(status);
    };

    onProgress(0);
    // The typed description and questionnaire go through the full 3-gate pipeline (and may fail the run, by design).
    const userContextStr = [
      payload.description || 'Not provided',
      payload.environment && `Assessed environment (user declaration): ${payload.environment}`,
      payload.systemVersion && `System/deployment version (user declaration): ${payload.systemVersion}`,
      payload.scope && `Scope and exclusions (user declaration): ${payload.scope}`,
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
    const businessRisks = await db.businessRisks.toArray();
    if (businessRisks.length) {
      const clean = sanitiseSection(JSON.stringify(businessRisks));
      if (clean.passed) addSection({ kind: 'knowledge', name: 'Recorded organizational business risks and obligations', text: clean.text },
        { kind: 'knowledge', name: 'Business risk register', status: 'included', chars: 0, sourceChars: clean.text.length });
      else inputs.push({ kind: 'knowledge', name: 'Business risk register', status: 'excluded', chars: 0, note: clean.reason });
    }

    const evidenceSources: EvidenceSource[] = [];
    const parents = new Map<ContextSection, string[]>();
    const fileSources = new Map<string, string>();
    for (const kind of ['documents', 'diagrams'] as const) {
      for (const [index, file] of (payload.inputFiles?.[kind] || []).entries()) {
        if (!file) continue;
        const digest = await crypto.subtle.digest('SHA-256', await file.contents.arrayBuffer());
        const fileHash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
        const source = await makeEvidenceSource({
          name: `Original attachment: ${file.name}`, kind: 'attachment-metadata', collectedAt,
          text: `Original file: ${file.name}\nMIME type: ${file.type}\nBytes: ${file.contents.size}\nOriginal bytes SHA-256: ${fileHash}`,
          version: `file-sha256:${fileHash}`, derived: false, status: 'Complete',
          note: 'This source describes retained original bytes, not extracted content or verified system behavior. Recover the file through Redo Threat Model.',
        });
        evidenceSources.push(source); fileSources.set(`${kind}:${index}`, source.id);
      }
    }
    for (const [index, document] of (payload.documents || []).entries()) {
      if (document.status === 'failed') continue;
      const clean = sanitiseSection(document.text);
      if (!clean.passed || !clean.text) continue;
      const fileId = fileSources.get(`documents:${index}`);
      const source = await makeEvidenceSource({
        name: `Original extracted document: ${document.name}`, kind: 'document', text: clean.text, collectedAt,
        version: `extraction-v1:${document.method}`, derived: document.method.includes('ocr'),
        status: document.status === 'partial' ? 'Partial' : 'Complete', parentSourceIds: fileId ? [fileId] : [],
        note: document.note || 'Sanitized extraction retained before AI digestion. OCR remains generated interpretation, not primary-source observation.',
      });
      evidenceSources.push(source);
      if (docResults[index].section) parents.set(docResults[index].section, [source.id]);
    }
    for (const repo of repositories) {
      const ids: string[] = [];
      for (const source of repo.evidenceSources) {
        const clean = sanitiseSection(source.originalText ?? source.text);
        const snapshot = await makeEvidenceSource({
          name: `${source.name}: ${source.url}`, kind: `repository-${source.kind}`, text: clean.passed ? clean.text : '',
          collectedAt: source.collectedAt || collectedAt, version: source.revision || 'collection-time metadata snapshot',
          derived: false, status: !clean.passed || ['failed', 'excluded', 'empty'].includes(source.status || '') ? 'Unavailable'
            : source.status === 'truncated' ? 'Partial' : 'Complete', note: source.note || '',
        });
        evidenceSources.push(snapshot); ids.push(snapshot.id);
        for (const prepared of repo.sources) if (prepared.section?.name.includes(source.url)) parents.set(prepared.section, [snapshot.id]);
      }
      if (repo.section) parents.set(repo.section, ids);
    }
    const pageIds: string[] = [];
    for (const page of webIntel?.pages || []) {
      if (!page.text) continue;
      const clean = sanitiseSection(page.text);
      if (!clean.passed) continue;
      const source = await makeEvidenceSource({
        name: page.url, kind: 'website-page', text: clean.text, collectedAt: webIntel?.collectedAt || collectedAt,
        version: 'sanitized-crawl-v1', derived: false, status: 'Partial',
        note: 'Retained crawl text; crawler page/size limits and later site changes may limit conclusions.',
      });
      evidenceSources.push(source); pageIds.push(source.id);
    }
    for (const [index, diagram] of (payload.diagrams || []).entries()) {
      const fileId = fileSources.get(`diagrams:${index}`);
      if (fileId) for (const section of sections) if (section.kind === 'diagram' && section.name === `Diagram: ${diagram.name}`) {
        parents.set(section, [...(parents.get(section) || []), fileId]);
      }
    }
    evidenceSources.push(...await mapLimit(sections, 3, async (section, index) => {
      const status = inputs[sectionInput[index]];
      const source = await makeEvidenceSource({
        name: section.name, kind: section.kind, text: section.text, collectedAt, version: 'sanitized-text-v1',
        derived: ['diagram', 'website'].includes(section.kind) || status.status === 'digested'
          || status.method === 'static code analysis' || /OCR/i.test(status.method || ''),
        status: ['truncated', 'digested'].includes(status.status) ? 'Partial' : 'Complete', note: status.note || '',
        parentSourceIds: section.kind === 'website' ? pageIds : parents.get(section) || [],
      });
      section.sourceId = source.id;
      return source;
    }));
    onProgress(3);
    const architectureSections = sections.filter(s => s.kind !== 'knowledge');
    const c4Context = assembleContext(architectureSections, CONTEXT_BUDGET_CHARS).text;
    const srg = await agentC4Architect(c4Context);

    onProgress(4);
    const excerpts = primaryEvidenceExcerpts(evidenceSources, srg.components.map(component => `${component.name} ${component.description}`).join('\n'));
    if (excerpts) addSection({ kind: 'knowledge', name: 'Located primary-source excerpts (quote without the L-number prefix)', text: excerpts },
      { kind: 'knowledge', name: 'Located primary-source excerpts', status: 'included', chars: 0, sourceChars: excerpts.length, method: 'deterministic text retrieval' });
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
    const frameworks = [...new Set(payload.frameworks.length ? payload.frameworks : ['STRIDE'])];
    const framework = frameworks.join(', ');
    const archThreats = (await mapLimit(frameworks, 2, lens => agentThreatModeling(srg, lens, fullContextForThreats))).flat();
    const { threats: allThreats, quality } = await createAssessmentQuality(
      [...archThreats, ...repoThreats].sort((a, b) => b.cvssScore - a.cvssScore), srg, evidenceSources, {
        systemId: payload.systemId || `SYS-${crypto.randomUUID()}`, parentAssessmentId: payload.parentAssessmentId,
        scope: payload.scope || 'Scope and exclusions require owner confirmation.', environment: payload.environment, systemVersion: payload.systemVersion,
        stageIssues: inputs.filter(input => ['truncated', 'excluded', 'failed', 'empty'].includes(input.status))
          .map(input => `${input.name}: ${input.status}. ${input.note || ''}`),
      },
    );

    onProgress(6);
    const mitigationContext = assembleContext(sections, MITIGATION_CONTEXT_CHARS).text;
    await mapLimit(allThreats, 2, async threat => {
      const risk = quality.risks.find(risk => risk.id === threat.id)!;
      try {
        const strategy = await agentMitigationStrategist(threat, mitigationContext);
        threat.mitigation = strategy.narrative;
        risk.actions = strategy.actions.map(action => ({
          ...action, id: `ACTION-${crypto.randomUUID()}`, owner: '', status: 'Open',
          verification: { result: 'Not run', artifactSourceIds: [], reviewer: '', at: '', environment: '' },
        }));
      } catch (error) {
        const issue = `Action generation failed for ${threat.id}: ${getErrorMessage(error)}. Retry or record treatment before a decision.`;
        console.warn(issue, error);
        quality.stageIssues.push(issue);
        risk.issues.push(issue);
      }
    });

    onProgress(7);
    const mmappDoc = globalDocs.find(d => d.name.toLowerCase().includes('mmapp controls.csv'));
    let complianceGaps: ThreatModel['complianceGaps'] = [];
    try { complianceGaps = await agentCompliance(allThreats, mmappDoc?.content || ''); } catch (error) {
      const issue = `Compliance mapping failed: ${getErrorMessage(error)}`;
      console.warn(issue, error);
      quality.stageIssues.push(issue);
    }

    onProgress(8);
    // Kept only for old storage readers; versioned assessments use separate 5x5 ratings, never this legacy number.
    const riskScore = 0;

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
      status: 'Review required',
      srg,
      threats: allThreats,
      complianceGaps,
      framework,
      quality: qualitySchema.parse(quality),
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
        crawledPages: webIntel?.pages.map(({ url, title }) => ({ url, title })),
        webIntelligence: webIntel?.summary,
        webIntelligenceError,
        inputs,
        contextChars: fullContextForThreats.length,
      },
    };
    await db.transaction('rw', [db.threatModels, db.modelInputs, db.evidenceSources, db.assessmentRevisions], async () => {
      await db.evidenceSources.bulkPut(evidenceSources);
      await db.modelInputs.put(snapshotModelInputs(newModelId, { ...payload, systemId: quality.systemId }));
      await db.threatModels.put(model);
      await db.assessmentRevisions.add({ id: `${newModelId}:1`, modelId: newModelId, revision: 1, recordedAt: model.date, model });
    });

    return { success: true, modelId: newModelId };
  } catch (error) {
    console.error('Pipeline Error:', error);
    return { success: false, error: getErrorMessage(error) };
  }
};
