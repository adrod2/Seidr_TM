import React from 'react';

export const ComplianceTab = () => {
  return (
    <div className="flex-1 overflow-y-auto p-6 h-full">
      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="bg-card p-6 rounded-3xl border border-border/50 text-center shadow-sm">
          <div className="text-5xl font-bold text-primary mb-2">92%</div>
          <div className="text-sm font-medium text-muted-foreground">Overall Compliance Score</div>
        </div>
        <div className="bg-card p-6 rounded-3xl border border-border/50 text-center shadow-sm">
          <div className="text-5xl font-bold text-emerald-500 mb-2">45/50</div>
          <div className="text-sm font-medium text-muted-foreground">Mandatory Controls Met</div>
        </div>
        <div className="bg-destructive/5 p-6 rounded-3xl border border-destructive/20 text-center shadow-sm">
          <div className="text-5xl font-bold text-destructive mb-2">3</div>
          <div className="text-sm font-medium text-destructive/80">Critical Gaps Remaining</div>
        </div>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold">Control Status (NIST SP 800-53)</h3>
        <button className="text-sm font-medium text-primary hover:underline">View All Controls</button>
      </div>
      <div className="border border-border/50 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-sm text-left">
            <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4 font-medium">Control ID</th>
                <th className="px-6 py-4 font-medium">Title</th>
                <th className="px-6 py-4 font-medium">Category</th>
                <th className="px-6 py-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              <tr className="bg-card hover:bg-secondary/20 transition-colors">
                <td className="px-6 py-4 font-mono font-bold text-foreground">AC-2</td>
                <td className="px-6 py-4">Account Management</td>
                <td className="px-6 py-4 text-muted-foreground">Access Control</td>
                <td className="px-6 py-4"><span className="text-destructive font-bold bg-destructive/10 px-2.5 py-1 rounded-full text-xs">Gap Identified</span></td>
              </tr>
              <tr className="bg-card hover:bg-secondary/20 transition-colors">
                <td className="px-6 py-4 font-mono font-bold text-foreground">IA-2</td>
                <td className="px-6 py-4">Identification and Authentication</td>
                <td className="px-6 py-4 text-muted-foreground">Access Control</td>
                <td className="px-6 py-4"><span className="text-emerald-500 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-full text-xs">Control Met</span></td>
              </tr>
              <tr className="bg-card hover:bg-secondary/20 transition-colors">
                <td className="px-6 py-4 font-mono font-bold text-foreground">SC-8</td>
                <td className="px-6 py-4">Transmission Confidentiality</td>
                <td className="px-6 py-4 text-muted-foreground">System & Comm Protection</td>
                <td className="px-6 py-4"><span className="text-amber-500 font-bold bg-amber-500/10 px-2.5 py-1 rounded-full text-xs">Partially Met</span></td>
              </tr>
            </tbody>
          </table>
      </div>
    </div>
  );
};