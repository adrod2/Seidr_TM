import React, { useState, useRef } from 'react';
import { Loader2, Upload, Plus, Trash2, X, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';

export const RiskContextTab = () => {
  const riskFileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingRisks, setIsUploadingRisks] = useState(false);
  const businessRisks = useLiveQuery(() => db.businessRisks.toArray());
  const [selectedRisks, setSelectedRisks] = useState<Set<string>>(new Set());

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newRisk, setNewRisk] = useState({
    name: '',
    obligation: '',
    riskOf: '',
    dueTo: '',
    controls: ''
  });

  const handleRiskBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingRisks(true);
    toast.info('Parsing file and importing business risks...');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        // Simple CSV parser: split by newlines, then by commas.
        // Assumes header: Name,Obligation,There is a risk of,Due to,Controls
        const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        
        if (lines.length <= 1) {
          toast.error('The file appears to be empty or missing data rows.');
          setIsUploadingRisks(false);
          return;
        }

        // Skip header (lines[0])
        const dataRows = lines.slice(1);
        const importedRisks = dataRows.map((row, index) => {
          // Simple split by comma (doesn't handle quotes perfectly, but good for basic text files)
          const cols = row.split(',').map(c => c.trim());
          return {
            id: `BR-${Date.now()}-${index}`,
            name: cols[0] || 'Unknown',
            obligation: cols[1] || 'Unknown',
            riskOf: cols[2] || 'Unknown',
            dueTo: cols[3] || 'Unknown',
            controls: cols[4] || 'Unknown'
          };
        });

        await db.businessRisks.bulkAdd(importedRisks);
        toast.success(`Successfully imported ${importedRisks.length} business risks.`);
      } catch (err) {
        console.error('Error parsing file:', err);
        toast.error('Failed to parse the uploaded file. Ensure it is a valid CSV format.');
      } finally {
        setIsUploadingRisks(false);
        if (riskFileInputRef.current) riskFileInputRef.current.value = '';
      }
    };
    reader.onerror = () => {
      toast.error('Failed to read the file.');
      setIsUploadingRisks(false);
    };
    
    reader.readAsText(file);
  };

  const handleAddRisk = async () => {
    if (!newRisk.name || !newRisk.riskOf || !newRisk.dueTo) {
      toast.error('Please fill out the mandatory fields (Name, Risk Of, Due To).');
      return;
    }

    const riskEntry = {
      id: `BR-${Date.now()}`,
      ...newRisk
    };

    await db.businessRisks.add(riskEntry);
    toast.success('Business risk added successfully.');
    setIsModalOpen(false);
    setNewRisk({ name: '', obligation: '', riskOf: '', dueTo: '', controls: '' });
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
    <div className="space-y-8 max-w-full">
      <div>
        <h3 className="text-lg font-bold mb-4">CIA Impact Profile</h3>
        <p className="text-sm text-muted-foreground mb-4">Calibrate threat scoring multipliers for your organisation.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl">
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

      <hr className="border-border/50 max-w-5xl" />

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
              accept=".csv,.txt" 
              className="hidden" 
              ref={riskFileInputRef}
              onChange={handleRiskBulkUpload}
            />
            <button 
              onClick={() => riskFileInputRef.current?.click()}
              disabled={isUploadingRisks}
              className="bg-secondary text-foreground px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-secondary/80 transition-colors disabled:opacity-50 border border-border/50 shadow-sm"
              title="Upload CSV with headers: Name,Obligation,There is a risk of,Due to,Controls"
            >
              {isUploadingRisks ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Upload CSV
            </button>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1 hover:bg-primary/90 transition-colors shadow-sm"
            >
              <Plus className="h-4 w-4" /> Add Risk
            </button>
          </div>
        </div>
        <div className="border border-border/50 rounded-2xl overflow-x-auto shadow-sm">
          <table className="w-full text-sm text-left whitespace-nowrap min-w-max">
            <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-3 w-12 text-center sticky left-0 bg-secondary/90 backdrop-blur z-10">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 rounded border-border/50 text-primary focus:ring-primary/50 cursor-pointer accent-primary"
                    checked={businessRisks.length > 0 && selectedRisks.size === businessRisks.length}
                    onChange={handleSelectAll}
                  />
                </th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Obligation</th>
                <th className="px-4 py-3">There is a risk of...</th>
                <th className="px-4 py-3">Due to...</th>
                <th className="px-4 py-3">Controls</th>
                <th className="px-4 py-3 text-right sticky right-0 bg-secondary/90 backdrop-blur z-10">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {businessRisks.map((risk) => (
                <tr key={risk.id} className={`bg-card hover:bg-secondary/20 transition-colors ${selectedRisks.has(risk.id) ? 'bg-primary/5' : ''}`}>
                  <td className="px-4 py-3 w-12 text-center sticky left-0 bg-card group-hover:bg-secondary/20 z-10">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-border/50 text-primary focus:ring-primary/50 cursor-pointer accent-primary"
                      checked={selectedRisks.has(risk.id)}
                      onChange={(e) => handleSelectOne(risk.id, e.target.checked)}
                    />
                  </td>
                  <td className="px-4 py-3 font-bold text-foreground">{risk.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{risk.obligation}</td>
                  <td className="px-4 py-3 font-medium">{risk.riskOf}</td>
                  <td className="px-4 py-3 font-medium">{risk.dueTo}</td>
                  <td className="px-4 py-3">
                    <span className="bg-secondary px-2 py-1 rounded-md text-xs font-medium text-muted-foreground border border-border/50 truncate max-w-[200px] inline-block">
                      {risk.controls || 'None'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right sticky right-0 bg-card group-hover:bg-secondary/20 z-10">
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
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No business risks recorded. Click "Add Risk" or upload a file.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Risk Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-card border border-border/50 rounded-3xl p-6 shadow-2xl w-full max-w-lg animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Add Business Risk</h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-muted-foreground hover:text-foreground bg-secondary/50 hover:bg-secondary p-1.5 rounded-full transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold mb-1.5">Name <span className="text-destructive">*</span></label>
                <input 
                  type="text" 
                  value={newRisk.name}
                  onChange={(e) => setNewRisk({...newRisk, name: e.target.value})}
                  className="w-full bg-secondary/30 border border-border/50 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="E.g., Insider Threat"
                />
              </div>
              
              <div>
                <label className="block text-sm font-bold mb-1.5">Obligation</label>
                <input 
                  type="text" 
                  value={newRisk.obligation}
                  onChange={(e) => setNewRisk({...newRisk, obligation: e.target.value})}
                  className="w-full bg-secondary/30 border border-border/50 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="E.g., HIPAA Compliance, Customer Trust"
                />
              </div>
              
              <div>
                <label className="block text-sm font-bold mb-1.5">There is a risk of... <span className="text-destructive">*</span></label>
                <textarea 
                  value={newRisk.riskOf}
                  onChange={(e) => setNewRisk({...newRisk, riskOf: e.target.value})}
                  className="w-full bg-secondary/30 border border-border/50 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none h-20"
                  placeholder="E.g., unauthorized data exfiltration"
                />
              </div>
              
              <div>
                <label className="block text-sm font-bold mb-1.5">Due to... <span className="text-destructive">*</span></label>
                <textarea 
                  value={newRisk.dueTo}
                  onChange={(e) => setNewRisk({...newRisk, dueTo: e.target.value})}
                  className="w-full bg-secondary/30 border border-border/50 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none h-20"
                  placeholder="E.g., lack of strict access controls and monitoring"
                />
              </div>
              
              <div>
                <label className="block text-sm font-bold mb-1.5">Controls</label>
                <input 
                  type="text" 
                  value={newRisk.controls}
                  onChange={(e) => setNewRisk({...newRisk, controls: e.target.value})}
                  className="w-full bg-secondary/30 border border-border/50 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="E.g., DLP, Role-based Access, Logging"
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-8">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddRisk}
                className="px-4 py-2.5 rounded-xl text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
              >
                Save Risk Entry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
