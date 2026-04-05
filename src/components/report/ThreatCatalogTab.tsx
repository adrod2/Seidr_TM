import React from 'react';
import { Filter, AlertTriangle, Server, ThumbsDown, CheckCircle2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

const defaultThreats = [
  { id: 'T-001', title: 'Unauthenticated API Access', category: 'Spoofing', componentId: 'API Gateway', severity: 'Critical', cvssScore: 9.2 }
];

export const ThreatCatalogTab = ({ threats }: { threats?: any[] }) => {
  const displayThreats = threats && threats.length > 0 ? threats : defaultThreats;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-secondary/10 h-full">
      <div className="p-4 border-b border-border/50 flex justify-between items-center bg-card">
        <div className="flex gap-2">
          <select className="bg-secondary/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
            <option>All Categories</option>
            <option>Spoofing</option>
            <option>Tampering</option>
            <option>Information Disclosure</option>
          </select>
        </div>
        <button className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm bg-secondary/50 px-3 py-1.5 rounded-lg border border-border/50">
          <Filter className="h-4 w-4" /> Filter
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {displayThreats.map(threat => (
          <div key={threat.id} className="border border-border/50 rounded-2xl p-5 hover:border-primary/50 transition-colors flex flex-col gap-4 group bg-card shadow-sm hover:shadow-md">
            <div className="flex gap-4">
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
                  <span className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-1 rounded-md border border-border/50">{threat.id}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground mb-3">
                  <span className="bg-secondary px-2 py-0.5 rounded-md text-xs font-medium text-foreground">{threat.category}</span>
                  <span className="flex items-center gap-1"><Server className="h-3.5 w-3.5"/> {threat.componentId}</span>
                  <span>CVSS Score: <span className="font-medium text-foreground">{threat.cvssScore}</span></span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {threat.description}
                </p>
              </div>
            </div>
            
            <div className="flex justify-end gap-2 border-t border-border/50 pt-4 mt-2">
              <button 
                onClick={() => toast.success('Risk formally accepted. Added to risk register.')}
                className="text-xs font-medium px-4 py-2 rounded-xl border border-border/50 hover:bg-secondary/50 flex items-center gap-1.5 transition-colors text-muted-foreground hover:text-foreground"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Accept Risk
              </button>
              <button 
                onClick={() => toast.success('New mitigation action created!')}
                className="text-xs font-medium px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <ShieldAlert className="h-3.5 w-3.5" /> Create Mitigation
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};