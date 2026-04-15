import React, { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { Loader2, Briefcase, FileCheck, ShieldAlert } from 'lucide-react';

const defaultGaps = [
  { controlId: 'AC-2', title: 'Account Management', status: 'Gap Identified', description: 'Missing robust JWT validation.' },
];

export const ComplianceTab = ({ gaps }: { gaps?: any[] }) => {
  const displayGaps = gaps && gaps.length > 0 ? gaps : defaultGaps;
  
  const businessRisks = useLiveQuery(() => db.businessRisks.toArray());
  const documents = useLiveQuery(() => db.documents.toArray());

  // Calculate unique failing controls
  const uniqueFailingControlsCount = useMemo(() => {
    const failingGaps = displayGaps.filter(g => g.status === 'Gap Identified' || g.status === 'Partially Met');
    // Use a Set to ensure if the LLM returned multiple gaps for the same control, it only counts as 1 missed control
    const uniqueControlIds = new Set(failingGaps.map(g => g.controlId));
    return uniqueControlIds.size;
  }, [displayGaps]);

  // Dynamically calculate score based on the MMapp controls.csv file from the knowledge base
  const { totalMandatory, metControls, complianceScore } = useMemo(() => {
    let total = 50; // Fallback default if file is missing
    
    if (documents) {
      const mmappDoc = documents.find(d => d.name.toLowerCase().includes('mmapp controls.csv'));
      if (mmappDoc && mmappDoc.content) {
        // Split by lines (handling both \n and \r\n), remove empty ones
        const rows = mmappDoc.content.split(/\r?\n/).filter(line => line.trim().length > 0);
        if (rows.length > 1) {
          total = rows.length - 1; // Exclude the header row
        } else if (rows.length === 1) {
          total = 1;
        }
      }
    }
    
    // Met controls = total minus the unique controls that have gaps
    const met = Math.max(0, total - uniqueFailingControlsCount);
    const score = total > 0 ? Math.round((met / total) * 100) : 0;
    
    return { totalMandatory: total, metControls: met, complianceScore: score };
  }, [documents, uniqueFailingControlsCount]);

  return (
    <div className="flex-1 overflow-y-auto p-6 h-full bg-secondary/10">
      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="bg-card p-6 rounded-3xl border border-border/50 text-center shadow-sm">
          <div className="text-5xl font-bold text-primary mb-2">{complianceScore}%</div>
          <div className="text-sm font-medium text-muted-foreground">Overall Compliance Score</div>
        </div>
        <div className="bg-card p-6 rounded-3xl border border-border/50 text-center shadow-sm">
          <div className="text-5xl font-bold text-emerald-500 mb-2">{metControls}/{totalMandatory}</div>
          <div className="text-sm font-medium text-muted-foreground">Mandatory Controls Met</div>
        </div>
        <div className={`p-6 rounded-3xl border text-center shadow-sm ${uniqueFailingControlsCount > 0 ? 'bg-destructive/5 border-destructive/20' : 'bg-emerald-500/5 border-emerald-500/20'}`}>
          <div className={`text-5xl font-bold mb-2 ${uniqueFailingControlsCount > 0 ? 'text-destructive' : 'text-emerald-500'}`}>{uniqueFailingControlsCount}</div>
          <div className={`text-sm font-medium ${uniqueFailingControlsCount > 0 ? 'text-destructive/80' : 'text-emerald-500/80'}`}>Controls with Critical Gaps</div>
        </div>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <FileCheck className="h-5 w-5 text-primary" />
          Control Status (Mapped against Organizational Policies)
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
              {displayGaps.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                    No compliance gaps detected against the evaluated controls.
                  </td>
                </tr>
              )}
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
                const isExposed = uniqueFailingControlsCount > 0 && Math.random() > 0.5; // randomize exposure slightly for demo if there are gaps
                
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