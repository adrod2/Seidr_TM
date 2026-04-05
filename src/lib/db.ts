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
}

export interface AiConfig {
  id: string;
  provider: string;
  apiKey: string;
  endpoint: string;
}

export interface BusinessRisk {
  id: string;
  desc: string;
  appetite: string;
  status: string;
}

export interface Document {
  id: number;
  name: string;
  chunks: number;
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

// Seed default config (empty state for clean agentic run)
db.on('populate', async () => {
  await db.aiConfig.add({
    id: 'default', provider: 'openai', apiKey: '', endpoint: 'http://localhost:11434'
  });
  await db.integrations.bulkAdd([
    { id: 'jira', connected: false },
    { id: 'slack', connected: false }
  ]);
});

export { db };