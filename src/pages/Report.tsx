import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ShieldAlert, GitMerge, CheckSquare, FileCheck, Download, Share2, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';

import { ThreatCatalogTab } from '@/components/report/ThreatCatalogTab';
import { C4ArchitectureTab } from '@/components/report/C4ArchitectureTab';
import { MitigationsTab } from '@/components/report/MitigationsTab';
import { ComplianceTab } from '@/components/report/ComplianceTab';
import { CopilotSidebar } from '@/components/report/CopilotSidebar';

const TabButton = ({ active, icon: Icon, label, onClick }: any) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
      active 
        ? 'bg-primary text-primary-foreground shadow-md' 
        : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground'
    }`}
  >
    <Icon className="h-4 w-4" />
    {label}
  </button>
);

export const Report = () => {
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState('threats');
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);

  // Fetch from Dexie Local DB
  const modelData = useLiveQuery(() => id ? db.threatModels.get(id) : undefined, [id]);

  if (modelData === undefined) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)]">
        <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
        <h2 className="text-xl font-bold">Loading Threat Model...</h2>
        <p className="text-muted-foreground">Fetching analysis results from database</p>
      </div>
    );
  }

  if (modelData === null) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)]">
        <ShieldAlert className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-bold">Model Not Found</h2>
        <p className="text-muted-foreground">The threat model you are looking for does not exist in the database.</p>
      </div>
    );
  }

  const getRiskLevel = (score: number) => {
    if (score >= 80) return { label: 'Critical', color: 'text-destructive bg-destructive/10 border-destructive/20' };
    if (score >= 60) return { label: 'High', color: 'text-orange-500 bg-orange-500/10 border-orange-500/20' };
    if (score >= 40) return { label: 'Medium', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' };
    return { label: 'Low', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' };
  };

  const riskBadge = getRiskLevel(modelData.riskScore);
  const formattedDate = new Date(modelData.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] relative">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-2xl font-bold">{modelData.name}</h2>
            <span className={`${riskBadge.color} text-xs font-bold px-2.5 py-1 rounded-full border`}>
              Risk: {riskBadge.label} ({modelData.riskScore})
            </span>
          </div>
          <p className="text-muted-foreground text-sm flex items-center gap-2">
            Model ID: <span className="font-mono text-xs bg-secondary/50 px-1.5 py-0.5 rounded border border-border/50">{modelData.id}</span>
            <span className="px-1">•</span> Generated: {formattedDate}
          </p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsCopilotOpen(true)}
            className="bg-accent/10 text-accent px-4 py-2 rounded-xl font-medium text-sm flex items-center gap-2 hover:bg-accent/20 transition-all border border-accent/20 shadow-sm"
          >
            <Sparkles className="h-4 w-4" />
            AI Copilot
          </button>
          <button 
            onClick={() => toast.success('Report link copied to clipboard')}
            className="bg-secondary/50 text-foreground px-4 py-2 rounded-xl font-medium text-sm flex items-center gap-2 hover:bg-secondary transition-all"
          >
            <Share2 className="h-4 w-4" />
            Share
          </button>
          <button 
            onClick={() => toast.promise(new Promise(r => setTimeout(r, 2000)), { loading: 'Generating PDF...', success: 'Report exported successfully!' })}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-xl font-medium text-sm flex items-center gap-2 hover:bg-primary/90 transition-all shadow-sm"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none shrink-0">
        <TabButton active={activeTab === 'threats'} onClick={() => setActiveTab('threats')} icon={ShieldAlert} label="Threat Catalog" />
        <TabButton active={activeTab === 'c4'} onClick={() => setActiveTab('c4')} icon={GitMerge} label="C4 Architecture" />
        <TabButton active={activeTab === 'mitigations'} onClick={() => setActiveTab('mitigations')} icon={CheckSquare} label="Mitigation Plan" />
        <TabButton active={activeTab === 'compliance'} onClick={() => setActiveTab('compliance')} icon={FileCheck} label="Compliance" />
      </div>

      <div className="bg-card border border-border/50 rounded-3xl shadow-sm flex-1 mt-4 overflow-hidden flex">
        <div className="flex-1 flex flex-col min-w-0">
          {activeTab === 'threats' && <ThreatCatalogTab threats={modelData.threats} framework={modelData.framework} />}
          {activeTab === 'c4' && <C4ArchitectureTab srg={modelData.srg} modelId={modelData.id} />}
          {activeTab === 'mitigations' && <MitigationsTab threats={modelData.threats} />}
          {activeTab === 'compliance' && <ComplianceTab gaps={modelData.complianceGaps} />}
        </div>

        <CopilotSidebar 
          isOpen={isCopilotOpen} 
          onClose={() => setIsCopilotOpen(false)} 
          modelData={modelData} 
        />
      </div>
    </div>
  );
};