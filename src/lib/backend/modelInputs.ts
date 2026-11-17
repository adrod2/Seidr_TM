import type { ThreatModel } from '../db.ts';
import type { ExtractedDocument } from './documentExtractor.ts';
import type { WebIntelligence } from './types.ts';

export interface StoredInputFile {
  name: string;
  type: string;
  lastModified: number;
  contents: Blob;
}

export interface AnalysisDiagram {
  name: string;
  description?: string;
  error?: string;
}

export interface AnalysisPayload {
  name: string;
  systemId?: string;
  parentAssessmentId?: string;
  environment?: string;
  systemVersion?: string;
  scope?: string;
  /** The system description sent to the pipeline, including its fallback when no input was supplied. */
  description: string;
  frameworks: string[];
  questionnaire?: {
    deployment: string[];
    authMethods: string[];
    dataClassification: string;
  };
  repositoryUrl?: string;
  repositoryUrls?: string[];
  documentation?: {
    title: string;
    content: string;
  };
  diagramsCount?: number;
  localDocuments?: string[];
  documents?: ExtractedDocument[];
  diagrams?: AnalysisDiagram[];
  /** Original form text, preserved independently from the generated analysis context. */
  userDescription?: string;
  sourceUrl?: string;
  /** A preview crawl may be reused within one assessment, but not when redoing a model. */
  webIntelligence?: WebIntelligence;
  usedDefaultDescription?: boolean;
  /** Original attachments stay local and are never passed to agents as blobs. */
  inputFiles?: {
    documents: (StoredInputFile | null)[];
    diagrams: (StoredInputFile | null)[];
  };
}

export interface ModelInputs {
  modelId: string;
  version: 1;
  payload: AnalysisPayload;
}

export const storeInputFile = (file: File): StoredInputFile => ({
  name: file.name, type: file.type, lastModified: file.lastModified,
  contents: file.slice(0, file.size, file.type),
});

export const restoreInputFile = (stored: StoredInputFile | null | undefined, name: string, text = '') => ({
  file: stored
    ? new File([stored.contents], stored.name, { type: stored.type, lastModified: stored.lastModified })
    : new File([text], name, { type: 'text/plain' }),
  originalUnavailable: !stored,
});

export const snapshotModelInputs = (modelId: string, payload: AnalysisPayload): ModelInputs => ({
  modelId, version: 1, payload: structuredClone(payload),
});

const legacyGroups = (context: string) => {
  const parts = context.split(/^=== (.+) ===\r?\n/gm);
  const groups = new Map<string, string>();
  for (let i = 1; i < parts.length; i += 2) groups.set(parts[i], parts[i + 1]?.trim() || '');
  return groups;
};

const legacySources = (group: string, prefix: string) => {
  const parts = group.split(/^--- (.+) ---\r?\n/gm);
  const sources: { name: string; text: string }[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    if (!parts[i].startsWith(prefix)) continue;
    sources.push({
      name: parts[i].slice(prefix.length).replace(/ \([^)]*\)$/, ''),
      text: parts[i + 1]?.trim() || '',
    });
  }
  return sources;
};

/** Older reports contain analysed context, not the original files; never present it as a full recovery. */
export function getRedoInputs(model: ThreatModel, saved?: ModelInputs): { payload: AnalysisPayload; warnings: string[] } {
  if (saved) {
    if (saved.version !== 1 || saved.modelId !== model.id) throw new Error('Saved assessment inputs do not match this threat model.');
    const payload = structuredClone(saved.payload);
    payload.systemId = model.quality?.systemId || payload.systemId || `legacy:${model.id}`;
    payload.parentAssessmentId = model.id;
    payload.environment = model.quality?.environment ?? payload.environment;
    payload.systemVersion = model.quality?.systemVersion ?? payload.systemVersion;
    payload.scope = model.quality?.scope ?? payload.scope;
    // Re-fetch changeable external sources when the new assessment runs.
    delete payload.webIntelligence;
    const missingFiles = (payload.documents || []).some((_, i) => !payload.inputFiles?.documents[i])
      || (payload.diagrams || []).some((_, i) => !payload.inputFiles?.diagrams[i]);
    return {
      payload,
      warnings: missingFiles ? ['Some original files were not saved. Recovered text/diagram analyses remain available; reattach originals where needed.'] : [],
    };
  }
  const meta = model.assessmentMeta;
  const groups = legacyGroups(model.description);
  const repositories = meta?.repositoryUrls ?? (meta?.repositoryUrl ? [meta.repositoryUrl] : []);
  let description = meta?.descriptionSource === 'default' ? ''
    : groups.get('SYSTEM DESCRIPTION (provided by the user)') ?? (groups.size ? '' : model.description);
  const repositorySuffix = `\nRepositories:\n${repositories.join('\n')}`;
  if (repositories.length && description.endsWith(repositorySuffix)) description = description.slice(0, -repositorySuffix.length);
  const recoveredDocs = legacySources(groups.get('SUPPORTING DOCUMENTS (attached by the user)') || '', 'Document: ');
  const documentNames = meta?.localDocuments?.length ? meta.localDocuments : recoveredDocs.map(doc => doc.name);
  const documents: ExtractedDocument[] = documentNames.map(name => {
    const recovered = recoveredDocs.find(doc => doc.name === name);
    return {
      name, text: recovered?.text || '', size: recovered?.text.length || 0, method: 'text',
      status: recovered?.text ? 'partial' : 'failed',
      note: 'Recovered report text only; the original attachment was not stored. Reattach the original to restore full content.',
    };
  });
  const recoveredDiagrams = legacySources(groups.get('ARCHITECTURE DIAGRAM ANALYSES (vision model)') || '', 'Diagram: ');
  const diagramNames = meta?.inputs?.filter(input => input.kind === 'diagram').map(input => input.name) || [];
  if (!diagramNames.length) diagramNames.push(...recoveredDiagrams.map(diagram => diagram.name));
  while (diagramNames.length < (meta?.diagramsCount || 0)) diagramNames.push(`Diagram ${diagramNames.length + 1} (original unavailable)`);
  return {
    payload: {
      name: model.name, description, userDescription: description, frameworks: [model.framework || 'STRIDE'],
      systemId: model.quality?.systemId || `legacy:${model.id}`, parentAssessmentId: model.id,
      repositoryUrls: [...repositories], sourceUrl: meta?.sourceUrl,
      documents, localDocuments: [...documentNames],
      diagrams: diagramNames.map(name => {
        const description = recoveredDiagrams.find(diagram => diagram.name === name)?.text;
        return {
          name, description,
          error: description ? undefined : 'The original image was not stored. Reattach it to run vision analysis again.',
        };
      }),
      diagramsCount: diagramNames.length,
    },
    warnings: ['This older report did not save its original form or files. Available description, URLs and analysed text have been recovered, possibly shortened or redacted. Review them and reattach original files before running again.'],
  };
}
