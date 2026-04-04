import React from 'react';
import { toast } from 'sonner';

export const MitigationsTab = () => {
  return (
    <div className="flex-1 overflow-y-auto p-6 bg-secondary/10 h-full">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-bold">Mitigation Action Plan</h3>
        <button onClick={() => toast.success('Tickets synced')} className="text-sm font-medium bg-secondary border px-4 py-2 rounded-xl hover:bg-secondary/80">
          Sync to Jira
        </button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100%-4rem)] min-h-[400px]">
        {['Open', 'In Progress', 'Done'].map(status => (
          <div key={status} className="flex flex-col bg-card/50 border border-border/50 rounded-3xl p-4">
            <h4 className="font-bold text-sm mb-4 text-muted-foreground uppercase tracking-wider px-2">{status}</h4>
            <div className="flex-1 space-y-4">
              {[
                { id: 'ACT-001', threatId: 'T-001', title: 'Implement JWT Validation', effort: 'Medium', status: 'Open', controls: ['AC-2'] },
                { id: 'ACT-002', threatId: 'T-002', title: 'Migrate to Parameterized Queries', effort: 'High', status: 'In Progress', controls: ['SI-10'] },
              ].filter(a => a.status === status).map(action => (
                <div key={action.id} className="bg-background border border-border/50 rounded-2xl p-4 shadow-sm cursor-grab">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md">{action.id}</span>
                  </div>
                  <h5 className="font-bold text-sm mb-2">{action.title}</h5>
                  <p className="text-xs text-muted-foreground mb-4">Fixes {action.threatId}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};