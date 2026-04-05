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

// Seed default data if empty
db.on('populate', async () => {
  await db.users.bulkAdd([
    { id: 1, name: 'Jane Doe', email: 'jane.doe@example.com', role: 'Org Admin', status: 'Active', lastActive: 'Just now' },
    { id: 2, name: 'John Smith', email: 'john.smith@example.com', role: 'Security Engineer', status: 'Active', lastActive: '2 hrs ago' }
  ]);
  await db.businessRisks.bulkAdd([
    { id: 'BR-01', desc: 'Ransomware attack causing >24h downtime', appetite: 'Conservative', status: 'Unmitigated' },
    { id: 'BR-02', desc: 'Customer PII breach via web interface', appetite: 'Minimal', status: 'Mitigated' }
  ]);
  await db.aiConfig.add({
    id: 'default', provider: 'openai', apiKey: '', endpoint: 'http://localhost:11434'
  });
  await db.integrations.bulkAdd([
    { id: 'jira', connected: false },
    { id: 'slack', connected: false }
  ]);
});

export { db };