import React, { useState } from 'react';
import { Loader2, Trash2, AlertTriangle, Calendar, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';

export const DataManagementTab = () => {
  const models = useLiveQuery(() => db.threatModels.orderBy('date').reverse().toArray());
  const [isClearing, setIsClearing] = useState(false);

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this threat model?')) {
      await db.threatModels.delete(id);
      toast.success('Threat model deleted successfully.');
    }
  };

  const handleDeleteOld = async () => {
    if (confirm('Are you sure you want to delete threat models older than 30 days?')) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const oldModels = models?.filter(m => new Date(m.date) < thirtyDaysAgo) || [];
      
      if (oldModels.length === 0) {
        toast.info('No models older than 30 days found.');
        return;
      }
      
      const ids = oldModels.map(m => m.id);
      await db.threatModels.bulkDelete(ids);
      toast.success(`Deleted ${ids.length} old threat models.`);
    }
  };

  const handleClearAll = async () => {
    if (confirm('Are you sure you want to delete ALL threat models? This action is irreversible.')) {
      setIsClearing(true);
      await db.threatModels.clear();
      setIsClearing(false);
      toast.success('All threat models cleared.');
    }
  };

  if (models === undefined) return <div className="p-4 flex justify-center"><Loader2 className="animate-spin h-6 w-6 text-primary" /></div>;

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-bold">Threat Models Data</h3>
            <p className="text-sm text-muted-foreground">Manage and delete stored threat models from the local database.</p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={handleDeleteOld}
              disabled={models.length === 0}
              className="bg-secondary text-foreground px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-secondary/80 transition-colors shadow-sm disabled:opacity-50"
            >
              <Clock className="h-4 w-4" />
              Delete >30 Days Old
            </button>
            <button 
              onClick={handleClearAll}
              disabled={isClearing || models.length === 0}
              className="bg-destructive text-destructive-foreground px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-destructive/90 transition-colors shadow-sm disabled:opacity-50"
            >
              {isClearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
              Delete All Models
            </button>
          </div>
        </div>
        
        <div className="border border-border/50 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-sm text-left">
            <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-6 py-4">Model Name / ID</th>
                <th className="px-6 py-4">Date Generated</th>
                <th className="px-6 py-4">Risk Score</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {models.map((model) => (
                <tr key={model.id} className="bg-card hover:bg-secondary/20 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-foreground">{model.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{model.id}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      {new Date(model.date).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      model.riskScore >= 80 ? 'bg-destructive/10 text-destructive' :
                      model.riskScore >= 50 ? 'bg-amber-500/10 text-amber-500' :
                      'bg-emerald-500/10 text-emerald-500'
                    }`}>
                      {model.riskScore}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => handleDelete(model.id)}
                      className="text-destructive hover:bg-destructive/10 p-2 rounded-lg transition-colors inline-flex"
                      title="Delete Model"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {models.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                    No threat models found in the database.
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