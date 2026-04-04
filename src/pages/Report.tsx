import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { 
  ShieldAlert, 
  GitMerge, 
  CheckSquare, 
  FileCheck,
  AlertTriangle,
  Download,
  Share2,
  Filter
} from 'lucide-react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const initialNodes = [
  { id: '1', position: { x: 250, y: 50 }, data: { label: 'User (Browser)' }, style: { background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px' } },
  { id: '2', position: { x: 250, y: 150 }, data: { label: 'Web App (Next.js)' }, style: { background: '#f8fafc', border: '2px solid #3b82f6', borderRadius: '8px', padding: '10px' } },
  { id: '3', position: { x: 100, y: 250 }, data: { label: 'API Gateway' }, style: { background: '#fef2f2', border: '2px solid #ef4444', borderRadius: '8px', padding: '10px' } },
  { id: '4', position: { x: 400, y: 250 }, data: { label: 'Auth Service' }, style: { background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px' } },
  { id: '5', position: { x: 100, y: 350 }, data: { label: 'Primary DB (PostgreSQL)' }, style: { background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px' } },
];
const initialEdges = [
  { id: 'e1-2', source: '1', target: '2', label: 'HTTPS' },
  { id: 'e2-3', source: '2', target: '3', label: 'REST', animated: true, style: { stroke: '#ef4444' } },
  { id: 'e2-4', source: '2', target: '4', label: 'OIDC' },
  { id: 'e3-5', source: '3', target: '5', label: 'TCP/5432' },
];

const TabButton = ({ active, icon: Icon, label, onClick }: any) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
      active 
        ? 'bg-primary text-primary-foreground shadow-md' 
        : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground'
    }`}
  >
    <Icon className="h-4 w-4" />
    {label}
  </button>
);

export const Report = () => {
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState('threats');
  
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-2xl font-bold">Core Payments API</h2>
            <span className="bg-destructive/10 text-destructive text-xs font-bold px-2.5 py-1 rounded-full">
              Risk: High (78)
            </span>
          </div>
          <p className="text-muted-foreground text-sm flex items-center gap-2">
            Model ID: {id} <span className="px-1">•</span> Generated: April 12, 2026
          </p>
        </div>
        <div className="flex gap-3">
          <button className="bg-secondary/50 text-foreground px-4 py-2 rounded-xl font-medium text-sm flex items-center gap-2 hover:bg-secondary transition-all">
            <Share2 className="h-4 w-4" />
            Share
          </button>
          <button className="bg-primary text-primary-foreground px-4 py-2 rounded-xl font-medium text-sm flex items-center gap-2 hover:bg-primary/90 transition-all shadow-sm">
            <Download className="h-4 w-4" />
            Export PDF
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none shrink-0">
        <TabButton active={activeTab === 'threats'} onClick={() => setActiveTab('threats')} icon={ShieldAlert} label="Threat Catalog" />
        <TabButton active={activeTab === 'c4'} onClick={() => setActiveTab('c4')} icon={GitMerge} label="C4 Architecture" />
        <TabButton active={activeTab === 'mitigations'} onClick={() => setActiveTab('mitigations')} icon={CheckSquare} label="Mitigation Plan" />
        <TabButton active={activeTab === 'compliance'} onClick={() => setActiveTab('compliance')} icon={FileCheck} label="Compliance" />
      </div>

      <div className="bg-card border border-border/50 rounded-3xl shadow-sm flex-1 mt-4 overflow-hidden flex flex-col">
        {activeTab === 'threats' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-border/50 flex justify-between items-center bg-secondary/20">
              <div className="flex gap-2">
                <select className="bg-background border border-border/50 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option>All Categories</option>
                  <option>Spoofing</option>
                  <option>Tampering</option>
                  <option>Information Disclosure</option>
                </select>
                <select className="bg-background border border-border/50 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option>All Severities</option>
                  <option>Critical</option>
                  <option>High</option>
                  <option>Medium</option>
                </select>
              </div>
              <button className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm">
                <Filter className="h-4 w-4" /> Filter
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {[
                { id: 'T-001', title: 'Unauthenticated API Access to Payment Gateway', category: 'Spoofing', component: 'API Gateway', severity: 'Critical', score: 9.2 },
                { id: 'T-002', title: 'SQL Injection in Transaction Query', category: 'Tampering', component: 'Primary DB', severity: 'High', score: 8.5 },
                { id: 'T-003', title: 'Cleartext Transmission of PII Data', category: 'Info Disclosure', component: 'Internal Network', severity: 'High', score: 7.8 },
                { id: 'T-004', title: 'Lack of Rate Limiting on Login', category: 'DoS', component: 'Auth Service', severity: 'Medium', score: 5.4 },
              ].map(threat => (
                <div key={threat.id} className="border border-border/50 rounded-2xl p-4 hover:border-primary/50 transition-colors cursor-pointer flex gap-4">
                  <div className={`mt-1 flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${
                    threat.severity === 'Critical' ? 'bg-destructive/10 text-destructive' : 
                    threat.severity === 'High' ? 'bg-orange-500/10 text-orange-500' :
                    'bg-amber-500/10 text-amber-500'
                  }`}>
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="font-bold text-base">{threat.title}</h4>
                      <span className="text-sm font-mono text-muted-foreground">{threat.id}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mb-3">
                      <span className="bg-secondary px-2 py-0.5 rounded-md text-xs font-medium text-foreground">{threat.category}</span>
                      <span>Component: {threat.component}</span>
                      <span>Score: {threat.score}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      An attacker could bypass authentication checks on the /process-payment endpoint due to missing JWT validation in the API Gateway middleware...
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'c4' && (
          <div className="flex-1 relative bg-secondary/10">
            <div className="absolute top-4 left-4 z-10 flex gap-2">
              <button className="bg-background border border-border/50 shadow-sm px-3 py-1.5 rounded-lg text-sm font-medium">L1 Context</button>
              <button className="bg-primary text-primary-foreground shadow-sm px-3 py-1.5 rounded-lg text-sm font-medium">L2 Container</button>
              <button className="bg-background border border-border/50 shadow-sm px-3 py-1.5 rounded-lg text-sm font-medium">L3 Component</button>
            </div>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              fitView
              attributionPosition="bottom-right"
            >
              <Background color="#ccc" gap={16} />
              <MiniMap style={{ borderRadius: '8px', border: '1px solid #cbd5e1' }} />
              <Controls style={{ borderRadius: '8px', border: '1px solid #cbd5e1', overflow: 'hidden' }} />
            </ReactFlow>
          </div>
        )}

        {activeTab === 'mitigations' && (
          <div className="flex-1 overflow-y-auto p-6">
            <h3 className="text-lg font-bold mb-6">Mitigation Action Plan</h3>
            <div className="space-y-6">
              {[
                { id: 'ACT-001', threatId: 'T-001', title: 'Implement JWT Validation Middleware', effort: 'Medium', status: 'Open', controls: ['AC-2', 'IA-2'] },
                { id: 'ACT-002', threatId: 'T-002', title: 'Migrate to Parameterized Queries ORM', effort: 'High', status: 'In Progress', controls: ['SI-10'] },
                { id: 'ACT-003', threatId: 'T-003', title: 'Enforce TLS 1.3 for Internal Traffic', effort: 'Low', status: 'Done', controls: ['SC-8'] },
              ].map(action => (
                <div key={action.id} className="border border-border/50 rounded-2xl p-5">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-bold text-base flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-1 rounded-md">{action.id}</span>
                      {action.title}
                    </h4>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                      action.status === 'Done' ? 'bg-emerald-500/10 text-emerald-500' :
                      action.status === 'In Progress' ? 'bg-primary/10 text-primary' :
                      'bg-secondary text-foreground'
                    }`}>
                      {action.status}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">Addresses threat {action.threatId}</p>
                  
                  <div className="flex gap-6 text-sm">
                    <div>
                      <span className="text-muted-foreground block mb-1 text-xs">Effort Estimate</span>
                      <span className="font-medium">{action.effort}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-1 text-xs">NIST Controls</span>
                      <div className="flex gap-1">
                        {action.controls.map(c => (
                          <span key={c} className="bg-secondary/50 border border-border/50 px-1.5 py-0.5 rounded text-xs">{c}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'compliance' && (
          <div className="flex-1 overflow-y-auto p-6">
             <div className="grid grid-cols-3 gap-6 mb-8">
              <div className="bg-secondary/30 p-5 rounded-2xl border border-border/50 text-center">
                <div className="text-4xl font-bold text-primary mb-2">92%</div>
                <div className="text-sm font-medium">Overall Compliance Score</div>
              </div>
              <div className="bg-secondary/30 p-5 rounded-2xl border border-border/50 text-center">
                <div className="text-4xl font-bold text-emerald-500 mb-2">45/50</div>
                <div className="text-sm font-medium">Mandatory Controls Met</div>
              </div>
              <div className="bg-secondary/30 p-5 rounded-2xl border border-border/50 text-center">
                <div className="text-4xl font-bold text-destructive mb-2">3</div>
                <div className="text-sm font-medium">Critical Gaps</div>
              </div>
             </div>

             <h3 className="text-lg font-bold mb-4">Control Status (NIST SP 800-53)</h3>
             <div className="border border-border/50 rounded-2xl overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                    <tr>
                      <th className="px-6 py-3">Control ID</th>
                      <th className="px-6 py-3">Title</th>
                      <th className="px-6 py-3">Category</th>
                      <th className="px-6 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    <tr className="bg-card">
                      <td className="px-6 py-4 font-mono font-medium">AC-2</td>
                      <td className="px-6 py-4">Account Management</td>
                      <td className="px-6 py-4">Access Control</td>
                      <td className="px-6 py-4"><span className="text-destructive font-semibold bg-destructive/10 px-2 py-1 rounded text-xs">Gap</span></td>
                    </tr>
                    <tr className="bg-card">
                      <td className="px-6 py-4 font-mono font-medium">IA-2</td>
                      <td className="px-6 py-4">Identification and Authentication</td>
                      <td className="px-6 py-4">Access Control</td>
                      <td className="px-6 py-4"><span className="text-emerald-500 font-semibold bg-emerald-500/10 px-2 py-1 rounded text-xs">Met</span></td>
                    </tr>
                    <tr className="bg-card">
                      <td className="px-6 py-4 font-mono font-medium">SC-8</td>
                      <td className="px-6 py-4">Transmission Confidentiality</td>
                      <td className="px-6 py-4">System & Comm Protection</td>
                      <td className="px-6 py-4"><span className="text-amber-500 font-semibold bg-amber-500/10 px-2 py-1 rounded text-xs">Partial</span></td>
                    </tr>
                  </tbody>
                </table>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};
