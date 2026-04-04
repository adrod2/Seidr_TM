import React from 'react';
import { Filter, AlertTriangle, Server, ThumbsDown, CheckCircle2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

const threatCatalog = [
  { id: 'T-001', title: 'Unauthenticated API Access to Payment Gateway', category: 'Spoofing', component: 'API Gateway', severity: 'Critical', score: 9.2 },
  { id: 'T-002', title: 'SQL Injection in Transaction Query', category: 'Tampering', component: 'Primary DB', severity: 'High', score: 8.5 },
  { id: 'T-003', title: 'Cleartext Transmission of PII Data', category: 'Info Disclosure', component: 'Internal Network', severity: 'High', score: 7.8 },
  { id: 'T-004', title: 'Lack of Rate Limiting on Login', category: 'DoS', component: 'Auth Service', severity: 'Medium', score: 5.4 },
];

export const ThreatCatalogTab = () => {
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-secondary/10 h-full">
      <div className="p-4 border-b border-border/50 flex justify-between items-center bg-card">
        <div className="flex gap-2">
          <select className="bg-secondary/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
            <option>All Categories</option>
          </select>
          <select className="bg-secondary/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
            <option>All Severities</option>
          </select>
        </div>
        <button className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm bg-secondary/50 px-3 py-1.5 rounded-lg border border-border/50">
          <Filter className="h-4 w-4" /> Filter
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {threatCatalog.map(threat => (
          <div key={threat.id} className="border border-border/50 rounded-2xl p-5 bg-card shadow-sm hover:shadow-md">
            <div className="flex gap-4">
              <div className="mt-1 flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center bg-destructive/10 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start mb-1">
                  <h4 className="font-bold text-base">{threat.title}</h4>
                  <span className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-1 rounded-md border">{threat.id}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground mb-3">
                  <span className="bg-secondary px-2 py-0.5 rounded-md text-xs font-medium text-foreground">{threat.category}</span>
                  <span className="flex items-center gap-1"><Server className="h-3.5 w-3.5"/> {threat.component}</span>
                  <span>CVSS Score: <span className="font-medium text-foreground">{threat.score}</span></span>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border/50 pt-4 mt-2">
              <button onClick={() => toast.success('Risk formally accepted.')} className="text-xs font-medium px-4 py-2 rounded-xl border border-border/50 flex items-center gap-1.5 hover:bg-secondary/50 text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" /> Accept Risk
              </button>
              <button onClick={() => toast.success('New mitigation action created!')} className="text-xs font-medium px-4 py-2 rounded-xl bg-primary text-primary-foreground flex items-center gap-1.5 hover:bg-primary/90 shadow-sm">
                <ShieldAlert className="h-3.5 w-3.5" /> Create Mitigation
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};