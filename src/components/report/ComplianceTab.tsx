import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { Loader2, Briefcase, FileCheck, ShieldAlert } from 'lucide-react';

const defaultGaps = [
  { controlId: 'AC-2', title: 'Account Management', status: 'Gap Identified', description: 'Missing robust JWT validation.' },
];

export const ComplianceTab = ({ gaps }: { gaps?: any[] }) => {
  const displayGaps = gaps && gaps.length > 0 ? gaps : defaultGaps;
  const gapsCount = displayGaps.filter(g => g.status === 'Gap Identified').length;

  const businessRisks = useLiveQuery(() => db.businessRisks.toArray());

  return (
    <div className="flex-1 overflow-y-auto p-6 h-full bg-secondary/10">
      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="bg-card p-6 rounded-3xl border border-border/50 text-center shadow-sm">
          <div className="text-5xl font-bold text-primary mb-2">92%</div>
          <div className="text-sm font-medium text-muted-foreground">Overall Compliance Score</div>
        </div>
        <div className="bg-card p-6 rounded-3xl border border-border/50 text-center shadow-sm">
          <div className="text-5xl font-bold text-emerald-500 mb-2">45/50</div>
          <div className="text-sm font-medium text-muted-foreground">Mandatory Controls Met</div>
        </div>
        <div className={`p-6 rounded-3xl border text-center shadow-sm ${gapsCount > 0 ? 'bg-destructive/5 border-destructive/20' : 'bg-emerald-500/5 border-emerald-500/20'}`}>
          <div className={`text-5xl font-bold mb-2 ${gapsCount > 0 ? 'text-destructive' : 'text-emerald-500'}`}>{gapsCount}</div>
          <div className={`text-sm font-medium ${gapsCount > 0 ? 'text-destructive/80' : 'text-emerald-500/80'}`}>Critical Gaps Remaining</div>
        </div>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <FileCheck className="h-5 w-5 text-primary" />
          Control Status (NIST SP 800-53)
        </h3>
      </div>
      <div className="border border-border/50 rounded-2xl overflow-hidden shadow-sm bg-card mb-8">
          <table className="w-full text-sm text-left">
            <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4 font-medium">Control ID</th>
                <th className="px-6 py-4 font-medium">Title</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {displayGaps.map((gap, idx) => (
                <tr key={idx} className="hover:bg-secondary/20 transition-colors">
                  <td className="px-6 py-4 font-mono font-bold text-foreground">{gap.controlId}</td>
                  <td className="px-6 py-4 font-medium">{gap.title}</td>
                  <td className="px-6 py-4">
                    <span className={`font-bold px-2.5 py-1 rounded-full text-xs ${
                      gap.status === 'Gap Identified' ? 'text-destructive bg-destructive/10' :
                      gap.status === 'Met' ? 'text-emerald-500 bg-emerald-500/10' :
                      'text-amber-500 bg-amber-500/10'
                    }`}>
                      {gap.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{gap.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
      </div>

      {/* Business Risk Register Analysis */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-primary" />
          Business Risk Alignment
        </h3>
      </div>
      <div className="border border-border/50 rounded-2xl overflow-hidden shadow-sm bg-card mb-4">
        {businessRisks === undefined ? (
          <div className="p-8 flex justify-center"><Loader2 className="animate-spin h-6 w-6 text-primary" /></div>
        ) : businessRisks.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No business risks recorded in the global register. Add them in the Admin panel to see alignment.
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4 font-medium">Risk Name</th>
                <th className="px-6 py-4 font-medium">Obligation</th>
                <th className="px-6 py-4 font-medium">Impact Area</th>
                <th className="px-6 py-4 font-medium">Alignment Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {businessRisks.map((risk) => {
                // Mock alignment status based on if gaps exist
                const isExposed = gapsCount > 0 && Math.random() > 0.5; // randomize exposure slightly for demo if there are gaps
                
                return (
                  <tr key={risk.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-6 py-4 font-bold text-foreground">{risk.name}</td>
                    <td className="px-6 py-4 text-muted-foreground">{risk.obligation}</td>
                    <td className="px-6 py-4 font-medium">{risk.riskOf}</td>
                    <td className="px-6 py-4">
                      {isExposed ? (
                        <div className="flex items-center gap-2 text-destructive">
                          <ShieldAlert className="h-4 w-4" />
                          <span className="font-bold text-xs bg-destructive/10 px-2 py-1 rounded-full">Exposed by Current Gaps</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-emerald-500">
                          <FileCheck className="h-4 w-4" />
                          <span className="font-bold text-xs bg-emerald-500/10 px-2 py-1 rounded-full">Covered by Mitigations</span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};