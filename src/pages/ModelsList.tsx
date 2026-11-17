import React from 'react';
import { Link } from 'react-router-dom';
import { Calendar, ShieldAlert, ArrowRight, Activity, Clock, Loader2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { assessmentSummary } from '@/lib/backend/assessmentQuality';

export const ModelsList = () => {
  const models = useLiveQuery(() => db.threatModels.orderBy('date').reverse().toArray());

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

      {models === undefined ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : models.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-3xl p-12 text-center shadow-sm">
          <ShieldAlert className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-bold mb-2">No Threat Models Found</h3>
          <p className="text-muted-foreground mb-6">You haven't generated any threat models yet.</p>
          <Link to="/models/new" className="bg-primary text-primary-foreground px-6 py-3 rounded-xl font-medium inline-block hover:bg-primary/90 transition-all">
            Generate Your First Model
          </Link>
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
                    'bg-secondary text-muted-foreground'
                  }`}>
                    {model.quality ? `Current risk: ${assessmentSummary(model.quality).highest}` : `Legacy score (unverified): ${model.riskScore}`}
                  </div>
                </div>
                
                <h3 className="text-lg font-bold mb-1 truncate">{model.name}</h3>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-6">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{new Date(model.date).toISOString().split('T')[0]}</span>
                  </div>
                  <span className="px-1">•</span>
                  <span className="font-mono text-[10px] bg-secondary/50 px-1.5 py-0.5 rounded border border-border/50">
                    {model.id}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-secondary/30 rounded-2xl p-3">
                    <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <Activity className="h-3 w-3" /> Threats
                    </div>
                    <div className="font-semibold">{model.threats?.length || 0} Identified</div>
                  </div>
                  <div className="bg-secondary/30 rounded-2xl p-3">
                    <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Framework
                    </div>
                    <div className="font-semibold text-xs mt-1">{model.framework || 'STRIDE'}</div>
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