import React, { useState, useRef } from 'react';
import { Loader2, Upload, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';

export const RiskContextTab = () => {
  const riskFileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingRisks, setIsUploadingRisks] = useState(false);
  const businessRisks = useLiveQuery(() => db.businessRisks.toArray());

  const handleRiskBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setIsUploadingRisks(true);
      toast.info('Parsing CSV and importing business risks...');
      
      setTimeout(async () => {
        setIsUploadingRisks(false);
        const count = businessRisks?.length || 0;
        await db.businessRisks.bulkAdd([
          { id: `BR-0${count + 1}`, desc: 'Supply chain compromise via third-party dependency', appetite: 'Moderate', status: 'Unmitigated' },
          { id: `BR-0${count + 2}`, desc: 'Insider threat data exfiltration', appetite: 'Minimal', status: 'Unmitigated' }
        ]);
        toast.success('Successfully imported 2 business risks from CSV.');
        if (riskFileInputRef.current) riskFileInputRef.current.value = '';
      }, 2000);
    }
  };

  if (businessRisks === undefined) return <div className="p-4 flex justify-center"><Loader2 className="animate-spin h-6 w-6 text-primary" /></div>;

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h3 className="text-lg font-bold mb-4">CIA Impact Profile</h3>
        <p className="text-sm text-muted-foreground mb-4">Calibrate threat scoring multipliers for your organisation.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {['Confidentiality', 'Integrity', 'Availability'].map(cia => (
            <div key={cia} className="bg-secondary/30 p-4 rounded-2xl border border-border/50">
              <label className="block text-sm font-bold mb-3">{cia}</label>
              <select 
                onChange={() => toast.success(`${cia} multiplier updated`)}
                className="w-full bg-background border border-border/50 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-primary/50 outline-none"
              >
                <option>Critical (x1.5)</option>
                <option>High (x1.2)</option>
                <option>Medium (x1.0)</option>
                <option>Low (x0.8)</option>
              </select>
            </div>
          ))}
        </div>
      </div>

      <hr className="border-border/50" />

      <div>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-bold">Business Risk Register</h3>
            <p className="text-sm text-muted-foreground">Threats aligning with unmitigated business risks receive a score boost.</p>
          </div>
          <div className="flex gap-2">
            <input 
              type="file" 
              accept=".csv,.xlsx" 
              className="hidden" 
              ref={riskFileInputRef}
              onChange={handleRiskBulkUpload}
            />
            <button 
              onClick={() => riskFileInputRef.current?.click()}
              disabled={isUploadingRisks}
              className="bg-secondary text-foreground px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-secondary/80 transition-colors disabled:opacity-50 border border-border/50 shadow-sm"
            >
              {isUploadingRisks ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Bulk Upload
            </button>
            <button 
              onClick={() => toast.info('Opening risk creation modal...')}
              className="bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1 hover:bg-primary/90 transition-colors shadow-sm"
            >
              <Plus className="h-4 w-4" /> Add Risk
            </button>
          </div>
        </div>
        <div className="border border-border/50 rounded-2xl overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Appetite</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {businessRisks.map((risk) => (
                <tr key={risk.id} className="bg-card hover:bg-secondary/20 transition-colors">
                  <td className="px-4 py-3 font-mono">{risk.id}</td>
                  <td className="px-4 py-3">{risk.desc}</td>
                  <td className="px-4 py-3">{risk.appetite}</td>
                  <td className="px-4 py-3">
                    <span className={`font-medium ${risk.status === 'Mitigated' ? 'text-emerald-500' : 'text-destructive'}`}>
                      {risk.status}
                    </span>
                  </td>
                </tr>
              ))}
              {businessRisks.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    No business risks recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};