import { z } from 'zod';
import type { ThreatModel, BusinessRisk, Document } from '../db.ts';
import type { AnalysisPayload, ModelInputs, StoredInputFile } from './modelInputs.ts';
import { graphSchema, makeEvidenceSource, qualitySchema, sourceSchema, threatSchema } from './assessmentQuality.ts';
import { hashBytes, hashInput } from './inputUtils.ts';
import { releaseDecisionIssues, reviewValidationIssues } from './assessmentWorkflow.ts';

export const MAX_BACKUP_BYTES = 256 * 1024 * 1024;
const str = z.string();
const fileSchema = z.object({ name: str, type: str, lastModified: z.number(), contents: z.object({
  encoding: z.literal('base64'), data: str.max(110_000_000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  sha256: str.regex(/^[a-f0-9]{64}$/),
}) });
type EncodedFile = z.infer<typeof fileSchema>;
interface EncodedInputs { modelId: string; version: 1; payload: Omit<AnalysisPayload, 'inputFiles'> & {
  inputFiles?: { documents: (EncodedFile | null)[]; diagrams: (EncodedFile | null)[] };
} }
const inputSchema = z.object({
  modelId: str.min(1), version: z.literal(1), payload: z.object({
    name: str, description: str, frameworks: z.array(str),
    systemId: str.optional(), parentAssessmentId: str.optional(), parentAssessmentRevision: z.number().int().min(0).optional(),
    environment: str.optional(), systemVersion: str.optional(), scope: str.optional(),
    repositoryUrl: str.optional(), repositoryUrls: z.array(str).optional(), userDescription: str.optional(), sourceUrl: str.optional(),
    questionnaire: z.object({ deployment: z.array(str), authMethods: z.array(str), dataClassification: str }).optional(),
    documentation: z.object({ title: str, content: str }).optional(), diagramsCount: z.number().optional(), localDocuments: z.array(str).optional(),
    usedDefaultDescription: z.boolean().optional(),
    documents: z.array(z.object({ name: str, size: z.number(), method: z.enum(['text', 'pdf', 'pdf-ocr', 'docx', 'spreadsheet', 'legacy-binary', 'image-ocr', 'unsupported']),
      status: z.enum(['ok', 'partial', 'empty', 'failed']), text: str, pages: z.number().optional(), note: str.optional() })).optional(),
    diagrams: z.array(z.object({ name: str, description: str.optional(), error: str.optional() })).optional(),
    webIntelligence: z.object({ sourceUrl: str, summary: str, pages: z.array(z.object({ url: str, title: str, text: str.optional() })),
      skippedPages: z.number(), collectedAt: str.optional() }).passthrough().optional(),
    inputFiles: z.object({ documents: z.array(fileSchema.nullable()), diagrams: z.array(fileSchema.nullable()) }).optional(),
  }).passthrough(),
});
const modelValidator = z.object({
  id: str.min(1), name: str, description: str, date: str, riskScore: z.number(), status: str, framework: str.optional(),
  srg: graphSchema, threats: z.array(threatSchema), complianceGaps: z.array(z.object({
    controlId: str, title: str, status: z.enum(['Met', 'Partially Met', 'Gap Identified']), description: str,
  })), quality: qualitySchema.optional(),
  assessmentMeta: z.object({
    diagramsCount: z.number(), repositoryUrl: str.optional(), repositoryUrls: z.array(str).optional(),
    localDocuments: z.array(str), globalDocuments: z.array(str), sourceUrl: str.optional(),
    scannedFiles: z.array(z.object({ path: str, size: z.number(), repositoryUrl: str.optional(), kind: z.enum(['code', 'documentation']).optional() })).optional(),
    descriptionSummary: str.optional(), descriptionHighlights: z.array(str).optional(), descriptionSource: z.enum(['user', 'derived', 'default']).optional(),
    crawledPages: z.array(z.object({ url: str, title: str })).optional(), webIntelligence: str.optional(), webIntelligenceError: str.optional(),
    contextChars: z.number().optional(), inputs: z.array(z.object({
      kind: z.enum(['description', 'diagram', 'document', 'website', 'repository', 'knowledge']), name: str,
      status: z.enum(['included', 'digested', 'truncated', 'excluded', 'failed', 'empty']), chars: z.number(),
      sourceChars: z.number().optional(), method: str.optional(), note: str.optional(),
    })).optional(),
  }).optional(),
});
const modelSchema = z.custom<ThreatModel>(value => modelValidator.safeParse(value).success, 'Invalid threat-model record.');
const businessValidator = z.object({ id: str, name: str, obligation: str, riskOf: str, dueTo: str, controls: str });
const documentValidator = z.object({ id: z.number(), name: str, chunks: z.number(), content: str.optional(),
  extraction: z.object({ method: str, status: str, pages: z.number().optional(), note: str.optional() }).optional() });
export const backupSchema = z.object({
  schemaVersion: z.literal('seidr-local-backup-v1'), exportedAt: str,
  models: z.array(modelSchema).max(5000), sources: z.array(sourceSchema).max(100000),
  inputs: z.array(z.custom<EncodedInputs>(value => inputSchema.safeParse(value).success, 'Invalid original-input snapshot.')),
  revisions: z.array(z.object({ id: str, modelId: str, revision: z.number().int().positive(), recordedAt: str, model: modelSchema })),
  businessRisks: z.array(z.custom<BusinessRisk>(value => businessValidator.safeParse(value).success)),
  documents: z.array(z.custom<Document>(value => documentValidator.safeParse(value).success)),
});
export type AssessmentBackup = z.infer<typeof backupSchema>;

const encodeFile = async (file: StoredInputFile | null): Promise<EncodedFile | null> => {
  if (!file) return null;
  const bytes = new Uint8Array(await file.contents.arrayBuffer());
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32768) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
  return { name: file.name, type: file.type, lastModified: file.lastModified, contents: { encoding: 'base64', data: btoa(chunks.join('')), sha256: await hashBytes(bytes.buffer) } };
};
export async function encodeModelInputs(input: ModelInputs): Promise<EncodedInputs> {
  const { inputFiles, ...payload } = input.payload;
  return { ...input, payload: { ...payload, ...(inputFiles ? { inputFiles: {
    documents: await Promise.all(inputFiles.documents.map(encodeFile)), diagrams: await Promise.all(inputFiles.diagrams.map(encodeFile)),
  } } : {}) } };
}
export function decodeModelInputs(input: EncodedInputs): ModelInputs {
  inputSchema.parse(input);
  const decodeFile = (file: EncodedFile | null): StoredInputFile | null => file ? {
    name: file.name, type: file.type, lastModified: file.lastModified,
    contents: new Blob([Uint8Array.from(atob(file.contents.data), character => character.charCodeAt(0))], { type: file.type }),
  } : null;
  const { inputFiles, ...payload } = input.payload;
  return { ...input, payload: { ...payload, ...(inputFiles ? { inputFiles: {
    documents: inputFiles.documents.map(decodeFile), diagrams: inputFiles.diagrams.map(decodeFile),
  } } : {}) } };
}

export async function validateAssessmentBackup(value: unknown): Promise<AssessmentBackup> {
  const backup = backupSchema.parse(value);
  for (const [label, ids] of [
    ['models', backup.models.map(model => model.id)], ['sources', backup.sources.map(source => source.id)],
    ['inputs', backup.inputs.map(input => input.modelId)], ['revisions', backup.revisions.map(revision => revision.id)],
    ['policies', backup.documents.map(document => document.id)], ['business risks', backup.businessRisks.map(risk => risk.id)],
  ] as const) if (new Set<string | number>(ids).size !== ids.length) throw new Error(`Backup contains duplicate ${label}.`);
  const sourceIds = new Set(backup.sources.map(source => source.id));
  for (const source of backup.sources) {
    const expected = await makeEvidenceSource(source);
    const legacyId = `SRC-${await hashInput(JSON.stringify([source.kind, source.name, source.version, source.derived, source.status, source.note, source.collectedAt, source.contentHash]))}`;
    if (expected.contentHash !== source.contentHash || (expected.id !== source.id && (source.parentSourceIds.length || source.id !== legacyId))) {
      throw new Error(`${source.name}: source content or identity does not match its fingerprint.`);
    }
    if (source.parentSourceIds.some(id => !sourceIds.has(id))) throw new Error('Backup source lineage is incomplete.');
  }
  for (const model of [...backup.models, ...backup.revisions.map(revision => revision.model)]) {
    if (!model.quality) continue;
    const quality = qualitySchema.parse(model.quality);
    if (quality.sourceIds.some(id => !sourceIds.has(id))) throw new Error(`${model.id}: backup is missing retained evidence.`);
    if (model.threats.length !== quality.risks.length || new Set(model.threats.map(threat => threat.id)).size !== model.threats.length
      || model.threats.some(threat => !quality.risks.some(risk => risk.id === threat.id))) throw new Error('Backup canonical findings disagree with its risk register.');
    const at = quality.history.at(-1)?.at || model.date;
    if (!Number.isFinite(Date.parse(at))) throw new Error('Backup revision has no valid recorded date.');
    const issues = [...reviewValidationIssues(quality, backup.sources, new Date(at)), ...releaseDecisionIssues(quality, new Date(at))];
    if (issues.length) throw new Error(`${model.id}: ${issues.join(' ')}`);
  }
  for (const revision of backup.revisions) {
    if (!backup.models.some(model => model.id === revision.modelId) || revision.model.id !== revision.modelId
      || revision.model.quality?.revision !== revision.revision || revision.id !== `${revision.modelId}:${revision.revision}`) throw new Error('Backup revision lineage is inconsistent.');
  }
  for (const input of backup.inputs) {
    if (!backup.models.some(model => model.id === input.modelId)) throw new Error('An input snapshot has no parent assessment.');
    const restored = decodeModelInputs(input);
    const model = backup.models.find(model => model.id === input.modelId)!;
    const encodedFiles = [...(input.payload.inputFiles?.documents || []), ...(input.payload.inputFiles?.diagrams || [])];
    for (const [index, file] of [...(restored.payload.inputFiles?.documents || []), ...(restored.payload.inputFiles?.diagrams || [])].entries()) {
      if (!file) continue;
      const metadata = backup.sources.filter(source => model.quality?.sourceIds.includes(source.id)
        && source.kind === 'attachment-metadata' && source.name === `Original attachment: ${file.name}` && source.version.startsWith('file-sha256:'));
      const checksum = await hashBytes(await file.contents.arrayBuffer());
      const version = `file-sha256:${checksum}`;
      if (checksum !== encodedFiles[index]?.contents.sha256 || (metadata.length && !metadata.some(source => source.version === version))) {
        throw new Error(`${file.name}: original attachment bytes do not match their retained fingerprint.`);
      }
    }
  }
  return backup;
}
