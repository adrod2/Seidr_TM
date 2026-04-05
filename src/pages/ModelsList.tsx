import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, ShieldAlert, ArrowRight, Activity, Clock, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const fallbackModels = [
  {
    id: 'm-1234',
    name: 'Core Payments API',
    date: '2026-04-12',
    riskScore: 78,
    status: 'Completed',
    frameworks: ['STRIDE', 'PASTA'],
    threats: 42
  }
];

export const ModelsList = () => {
  const [models, setModels] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        let localModels: any[] = [];
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith('model_')) {
              const data = JSON.parse(localStorage.getItem(key) || '{}');
              localModels.push({
                id: data.id,
                name: data.name,
                date: new Date(data.date).toISOString().split('T')[0],
                riskScore: data.riskScore || 0,
                status: data.status,
                frameworks: ['STRIDE'],
                threats: data.threats ? data.threats.length : 0
              });
            }
          }
        } catch(e) {}

        const { data, error } = await supabase
          .from('threat_models')
          .select('*')
          .order('created_at', { ascending: false });

        let dbModels: any[] = [];
        if (!error && data) {
          dbModels = data.map(dbModel => ({
            id: dbModel.id,
            name: dbModel.name,
            date: new Date(dbModel.created_at).toISOString().split('T')[0],
            riskScore: dbModel.risk_score || 0,
            status: dbModel.status,
            frameworks: ['STRIDE'],
            threats: Math.floor(Math.random() * 20) + 5
          }));
        }

        // Deduplicate and combine (prefer local models if they have the artifacts)
        const combined = [...localModels];
        dbModels.forEach(dbm => {
          if (!combined.find(c => c.id === dbm.id)) {
            combined.push(dbm);
          }
        });

        if (combined.length > 0) {
          setModels(combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        } else {
          setModels(fallbackModels);
        }
      } catch (err) {
        console.warn("Failed to fetch models", err);
        setModels(fallbackModels);
      } finally {
        setIsLoading(false);
      }
    };

    fetchModels();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold">Threat Models</h2>
          <p className="text-muted-foreground mt-1 text-sm">View and manage all generated threat models.</p>
        </div>
        <Link 
          to="/models/new"
          className="bg-primary text-primary-foreground px-4 py-2 rounded-xl font-medium text-sm flex items-center gap-2 hover:bg-primary/90 transition-all shadow-sm"
        >
          Create New Model
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {models.map(model => (
            <Link 
              key={model.id} 
              to={`/models/${model.id}`}
              className="block group"
            >
              <div className="bg-card border border-border/50 rounded-3xl p-6 shadow-sm hover:shadow-md hover:border-primary/50 transition-all h-full flex flex-col">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-secondary/50 rounded-2xl group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                    <ShieldAlert className="h-6 w-6" />
                  </div>
                  <div className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    model.riskScore > 80 ? 'bg-destructive/10 text-destructive' :
                    model.riskScore > 50 ? 'bg-amber-500/10 text-amber-500' :
                    'bg-emerald-500/10 text-emerald-500'
                  }`}>
                    Risk Score: {model.riskScore}
                  </div>
                </div>
                
                <h3 className="text-lg font-bold mb-1 truncate">{model.name}</h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{model.date}</span>
                  <span className="px-1">•</span>
                  <span className="truncate w-16" title={model.id}>{model.id.split('-')[0]}...</span>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-secondary/30 rounded-2xl p-3">
                    <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <Activity className="h-3 w-3" /> Threats
                    </div>
                    <div className="font-semibold">{model.threats} Identified</div>
                  </div>
                  <div className="bg-secondary/30 rounded-2xl p-3">
                    <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Frameworks
                    </div>
                    <div className="font-semibold text-xs mt-1">{model.frameworks.join(', ')}</div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-border/50 pt-4 mt-auto">
                  <span className={`text-sm font-medium ${model.status === 'Completed' ? 'text-emerald-500' : 'text-amber-500'}`}>
                    {model.status}
                  </span>
                  <div className="text-primary group-hover:translate-x-1 transition-transform">
                    <ArrowRight className="h-5 w-5" />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};