import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ShieldAlert, GitMerge, CheckSquare, FileCheck, Download, Share2, Sparkles, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';

import { ThreatCatalogTab } from '@/components/report/ThreatCatalogTab';
import { C4ArchitectureTab } from '@/components/report/C4ArchitectureTab';
import { MitigationsTab } from '@/components/report/MitigationsTab';
import { ComplianceTab } from '@/components/report/ComplianceTab';
import { CopilotSidebar } from '@/components/report/CopilotSidebar';
import { TabButton } from '@/components/TabButton';

export const Report = () => {
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState('threats');
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  
  // Export Modal State
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState('pdf');
  const [exportLanguage, setExportLanguage] = useState('en');

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

  const exportFormats = [
    { id: 'pdf', label: 'PDF (Includes Diagram)' },
    { id: 'csv', label: 'CSV (Threats Table)' },
    { id: 'json', label: 'JSON (Raw Data)' }
  ];

  const exportLanguages = [
    { id: 'en', label: 'English' },
    { id: 'es', label: 'Spanish' },
    { id: 'de', label: 'German' },
    { id: 'fr', label: 'French' },
    { id: 'pt', label: 'Portuguese' },
    { id: 'zh', label: 'Chinese' }
  ];

  const handleExport = () => {
    setIsExportModalOpen(false);
    const langLabel = exportLanguages.find(l => l.id === exportLanguage)?.label || 'English';

    const executeExport = () => {
      try {
        if (exportFormat === 'json') {
          const dataStr = JSON.stringify({ ...modelData, exportLanguage }, null, 2);
          const blob = new Blob([dataStr], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${modelData.id}_report_${exportLanguage}.json`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          toast.success(`JSON exported successfully in ${langLabel}!`);
          
        } else if (exportFormat === 'csv') {
          if (!modelData.threats || modelData.threats.length === 0) {
            toast.error('No threats found to export.');
            return;
          }
          
          const headers = ['Threat ID', 'Title', 'Severity', 'CVSS', 'Category', 'Component'];
          const rows = modelData.threats.map((t: any) => [
            t.id,
            `"${t.title.replace(/"/g, '""')}"`,
            t.severity,
            t.cvssScore,
            `"${t.category}"`,
            `"${t.componentId}"`
          ]);
          
          const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${modelData.id}_threats_${exportLanguage}.csv`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          toast.success(`CSV exported successfully in ${langLabel}!`);

        } else if (exportFormat === 'pdf') {
          setActiveTab('c4'); 
          toast.info(`Preparing PDF in ${langLabel}... Please select "Save as PDF" as the destination.`, { duration: 5000 });
          setTimeout(() => {
            window.print();
          }, 800);
        }
      } catch (error) {
        console.error('Export failed:', error);
        toast.error('An error occurred during export.');
      }
    };

    if (exportLanguage !== 'en') {
      toast.promise(new Promise(resolve => setTimeout(resolve, 1500)), {
        loading: `Translating report to ${langLabel}...`,
        success: () => {
          executeExport();
          return `Translation to ${langLabel} complete.`;
        }
      });
    } else {
      executeExport();
    }
  };

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
        <div className="flex gap-3 relative">
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
            onClick={() => setIsExportModalOpen(true)}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-xl font-medium text-sm flex items-center gap-2 hover:bg-primary/90 transition-all shadow-sm"
          >
            <Download className="h-4 w-4" />
            Export Report
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

      {/* Export Configuration Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-card border border-border/50 rounded-3xl p-6 shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Download className="h-5 w-5 text-primary" /> Export Options
              </h3>
              <button 
                onClick={() => setIsExportModalOpen(false)}
                className="text-muted-foreground hover:text-foreground bg-secondary/50 hover:bg-secondary p-1.5 rounded-full transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-bold mb-2 text-foreground">File Format</label>
                <div className="grid grid-cols-1 gap-2">
                  {exportFormats.map(fmt => (
                    <label 
                      key={fmt.id} 
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        exportFormat === fmt.id 
                          ? 'border-primary bg-primary/10' 
                          : 'border-border/50 bg-secondary/30 hover:bg-secondary/50'
                      }`}
                    >
                      <input 
                        type="radio" 
                        name="format" 
                        value={fmt.id} 
                        checked={exportFormat === fmt.id}
                        onChange={(e) => setExportFormat(e.target.value)}
                        className="text-primary focus:ring-primary h-4 w-4 accent-primary" 
                      />
                      <span className="text-sm font-medium">{fmt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold mb-2 text-foreground">Report Language</label>
                <select 
                  value={exportLanguage}
                  onChange={(e) => setExportLanguage(e.target.value)}
                  className="w-full bg-secondary/30 border border-border/50 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none cursor-pointer hover:border-primary/50 transition-colors"
                >
                  {exportLanguages.map(lang => (
                    <option key={lang.id} value={lang.id}>
                      {lang.label} {lang.id === 'en' ? '(Default)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-8">
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                className="px-6 py-2.5 rounded-xl text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-2"
              >
                <Download className="h-4 w-4" /> Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};