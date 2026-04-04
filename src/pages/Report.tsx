import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ShieldAlert, GitMerge, CheckSquare, FileCheck, Download, Share2, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

// Updated: Relative imports pointing to the root components folder
import { ThreatCatalogTab } from '../components/ThreatCatalogTab';
import { C4ArchitectureTab } from '../components/C4ArchitectureTab';
import { MitigationsTab } from '../components/MitigationsTab';
import { ComplianceTab } from '../components/ComplianceTab';
import { CopilotSidebar } from '../components/CopilotSidebar';

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
  const [isLoading, setIsLoading] = useState(true);
  const [modelData, setModelData] = useState<any>(null);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);

  useEffect(() => {
    const fetchModel = async () => {
      if (!id) return;
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('threat_models')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;
        
        if (data) {
          setModelData({
            name: data.name,
            description: data.description,
            riskScore: data.risk_score || 0,
            date: new Date(data.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          });
        }
      } catch (err) {
        console.warn("Failed to fetch model, using fallback UI data", err);
        setModelData({
          name: 'Core Payments API (Mock)',
          description: 'This is a fallback description since the model could not be loaded from the database.',
          riskScore: 78,
          date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchModel();
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)]">
        <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
        <h2 className="text-xl font-bold">Loading Threat Model...</h2>
        <p className="text-muted-foreground">Fetching analysis results from Seidr AI</p>
      </div>
    );
  }

  const getRiskLevel = (score: number) => {
    if (score >= 80) return { label: 'Critical', color: 'text-destructive bg-destructive/10 border-destructive/20' };
    if (score >= 60) return { label: 'High', color: 'text-orange-500 bg-orange-500/10 border-orange-500/20' };
    if (score >= 40) return { label: 'Medium', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' };
    return { label: 'Low', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' };
  };

  const riskBadge = getRiskLevel(modelData?.riskScore || 0);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] relative">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-2xl font-bold">{modelData?.name}</h2>
            <span className={`${riskBadge.color} text-xs font-bold px-2.5 py-1 rounded-full border`}>
              Risk: {riskBadge.label} ({modelData?.riskScore})
            </span>
          </div>
          <p className="text-muted-foreground text-sm flex items-center gap-2">
            Model ID: {id?.split('-')[0] || 'Unknown'} <span className="px-1">•</span> Generated: {modelData?.date}
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
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {activeTab === 'threats' && <ThreatCatalogTab />}
          {activeTab === 'c4' && <C4ArchitectureTab />}
          {activeTab === 'mitigations' && <MitigationsTab />}
          {activeTab === 'compliance' && <ComplianceTab />}
        </div>

        {/* AI Copilot Slide-over Panel */}
        <CopilotSidebar 
          isOpen={isCopilotOpen} 
          onClose={() => setIsCopilotOpen(false)} 
          modelName={modelData?.name} 
        />
      </div>
    </div>
  );
};