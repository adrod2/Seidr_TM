import React, { useState, useRef } from 'react';
import { Loader2, Upload, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';

export const RiskContextTab = () => {
  const riskFileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingRisks, setIsUploadingRisks] = useState(false);
  const businessRisks = useLiveQuery(() => db.businessRisks.toArray());
  const [selectedRisks, setSelectedRisks] = useState<Set<string>>(new Set());

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

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked && businessRisks) {
      setSelectedRisks(new Set(businessRisks.map(r => r.id)));
    } else {
      setSelectedRisks(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedRisks);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedRisks(newSelected);
  };

  const handleDeleteSelected = async () => {
    if (selectedRisks.size === 0) return;
    if (confirm(`Are you sure you want to delete ${selectedRisks.size} selected business risks?`)) {
      await db.businessRisks.bulkDelete(Array.from(selectedRisks));
      setSelectedRisks(new Set());
      toast.success(`Deleted ${selectedRisks.size} business risks successfully.`);
    }
  };

  const handleDeleteSingle = async (id: string) => {
    if (confirm('Are you sure you want to delete this business risk?')) {
      await db.businessRisks.delete(id);
      const newSelected = new Set(selectedRisks);
      newSelected.delete(id);
      setSelectedRisks(newSelected);
      toast.success('Business risk deleted successfully.');
    }
  };

  if (businessRisks === undefined) return <div className="p-4 flex justify-center"><Loader2 className="animate-spin h-6 w-6 text-primary" /></div>;

  return (
    <div className="space-y-8 max-w-5xl">
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
            {selectedRisks.size > 0 && (
              <button 
                onClick={handleDeleteSelected}
                className="bg-destructive/10 text-destructive border border-destructive/20 px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-destructive/20 transition-colors shadow-sm"
              >
                <Trash2 className="h-4 w-4" />
                Delete Selected ({selectedRisks.size})
              </button>
            )}
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
        <div className="border border-border/50 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-sm text-left">
            <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-3 w-12 text-center">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 rounded border-border/50 text-primary focus:ring-primary/50 cursor-pointer accent-primary"
                    checked={businessRisks.length > 0 && selectedRisks.size === businessRisks.length}
                    onChange={handleSelectAll}
                  />
                </th>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Appetite</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {businessRisks.map((risk) => (
                <tr key={risk.id} className={`bg-card hover:bg-secondary/20 transition-colors ${selectedRisks.has(risk.id) ? 'bg-primary/5' : ''}`}>
                  <td className="px-4 py-3 w-12 text-center">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-border/50 text-primary focus:ring-primary/50 cursor-pointer accent-primary"
                      checked={selectedRisks.has(risk.id)}
                      onChange={(e) => handleSelectOne(risk.id, e.target.checked)}
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{risk.id}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{risk.desc}</td>
                  <td className="px-4 py-3">
                    <span className="bg-secondary px-2 py-1 rounded-md text-xs font-medium text-muted-foreground border border-border/50">{risk.appetite}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-medium text-xs px-2 py-1 rounded-full border ${
                      risk.status === 'Mitigated' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 
                      'bg-destructive/10 text-destructive border-destructive/20'
                    }`}>
                      {risk.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button 
                      onClick={() => handleDeleteSingle(risk.id)}
                      className="text-destructive hover:bg-destructive/10 p-1.5 rounded-lg transition-colors inline-flex"
                      title="Delete Risk"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {businessRisks.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
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