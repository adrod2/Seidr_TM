import Dexie, { type EntityTable } from 'dexie';

export interface ThreatModel {
  id: string;
  name: string;
  description: string;
  date: string;
  riskScore: number;
  status: string;
  srg: any;
  threats: any[];
  complianceGaps: any[];
  framework?: string;
  assessmentMeta?: {
    diagramsCount: number;
    repositoryUrl?: string;
    localDocuments: string[];
    globalDocuments: string[];
    scannedFiles?: { path: string; size: number }[];
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

const db = new Dexie('SeidrLocalDB') as Dexie & {
  threatModels: EntityTable<ThreatModel, 'id'>;
  aiConfig: EntityTable<AiConfig, 'id'>;
  businessRisks: EntityTable<BusinessRisk, 'id'>;
  documents: EntityTable<Document, 'id'>;
  users: EntityTable<User, 'id'>;
  integrations: EntityTable<Integration, 'id'>;
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