import Dexie, { type EntityTable } from 'dexie';
import type { ModelInputs } from './backend/modelInputs';
import type { AssessmentQuality, EvidenceSource } from './backend/assessmentQuality';
import type { ComplianceGap, SystemRepresentationGraph, Threat } from './backend/types';

export interface ThreatModel {
  id: string;
  name: string;
  description: string;
  date: string;
  riskScore: number;
  status: string;
  srg: SystemRepresentationGraph;
  threats: Threat[];
  complianceGaps: ComplianceGap[];
  framework?: string;
  quality?: AssessmentQuality;
  assessmentMeta?: {
    diagramsCount: number;
    repositoryUrl?: string;
    repositoryUrls?: string[];
    localDocuments: string[];
    globalDocuments: string[];
    scannedFiles?: import('./backend/types').ScannedFile[];
    descriptionSummary?: string;
    descriptionHighlights?: string[];
    descriptionSource?: 'user' | 'derived' | 'default';
    sourceUrl?: string;
    crawledPages?: { url: string; title: string }[];
    webIntelligence?: string;
    webIntelligenceError?: string;
    /** Per-input record of what was read and how much of it reached the threat-modeling context. */
    inputs?: import('./backend/analysisContext').InputStatus[];
    contextChars?: number;
  };
}

export interface AiConfig {
  id: string;
  provider: string;
  apiKey: string;
  endpoint: string;
  copilotModel?: string;
}

export interface BusinessRisk {
  id: string;
  name: string;
  obligation: string;
  riskOf: string;
  dueTo: string;
  controls: string;
}

export interface Document {
  id: number;
  name: string;
  chunks: number;
  content?: string;
  extraction?: { method: string; status: string; pages?: number; note?: string };
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  lastActive: string;
}

export interface Integration {
  id: string;
  connected: boolean;
}

export interface AgentResult {
  key: string;
  result: unknown;
  expiresAt: number;
}

const db = new Dexie('SeidrLocalDB') as Dexie & {
  threatModels: EntityTable<ThreatModel, 'id'>;
  aiConfig: EntityTable<AiConfig, 'id'>;
  businessRisks: EntityTable<BusinessRisk, 'id'>;
  documents: EntityTable<Document, 'id'>;
  users: EntityTable<User, 'id'>;
  integrations: EntityTable<Integration, 'id'>;
  modelInputs: EntityTable<ModelInputs, 'modelId'>;
  agentResults: EntityTable<AgentResult, 'key'>;
  evidenceSources: EntityTable<EvidenceSource, 'id'>;
  assessmentRevisions: EntityTable<{ id: string; modelId: string; revision: number; recordedAt: string; model: ThreatModel }, 'id'>;
};

// Define database schema
db.version(1).stores({
  threatModels: 'id, date, status',
  aiConfig: 'id',
  businessRisks: 'id',
  documents: 'id',
  users: 'id, email',
  integrations: 'id'
});

db.version(2).stores({}).upgrade(async (transaction) => {
  const configs = transaction.table<AiConfig>('aiConfig');
  const config = await configs.get('default');
  if (!config || (config.provider === 'openai' && !config.apiKey)) {
    await configs.put({
      id: 'default', provider: 'copilot', apiKey: '',
      endpoint: config?.endpoint || 'http://localhost:11434', copilotModel: '',
    });
  }
});

db.version(3).stores({ modelInputs: 'modelId' });
db.version(4).stores({ agentResults: 'key, expiresAt' });
db.version(5).stores({ evidenceSources: 'id, contentHash', assessmentRevisions: 'id, modelId, revision' });

// Seed default config (empty state for clean agentic run)
db.on('populate', async () => {
  await db.aiConfig.add({
    id: 'default', provider: 'copilot', apiKey: '', endpoint: 'http://localhost:11434', copilotModel: ''
  });
  await db.integrations.bulkAdd([
    { id: 'jira', connected: false },
    { id: 'slack', connected: false }
  ]);
});

export { db };

export const deleteThreatModels = (ids: string[]) => db.transaction('rw', db.threatModels, db.modelInputs, db.evidenceSources, db.assessmentRevisions, async () => {
  const removed = await db.threatModels.bulkGet(ids);
  await db.threatModels.bulkDelete(ids);
  await db.modelInputs.bulkDelete(ids);
  await db.assessmentRevisions.where('modelId').anyOf(ids).delete();
  const remaining = await db.threatModels.toArray();
  const retained = new Set(remaining.flatMap(model => model.quality?.sourceIds || []));
  const orphaned = [...new Set(removed.flatMap(model => model?.quality?.sourceIds || []))].filter(id => !retained.has(id));
  await db.evidenceSources.bulkDelete(orphaned);
});

export const clearThreatModels = () => db.transaction('rw', [db.threatModels, db.modelInputs, db.agentResults, db.evidenceSources, db.assessmentRevisions], async () => {
  await db.threatModels.clear();
  await db.modelInputs.clear();
  await db.agentResults.clear();
  await db.evidenceSources.clear();
  await db.assessmentRevisions.clear();
});