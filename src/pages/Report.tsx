"use client";

import React, { useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useParams } from 'react-router-dom';
import { ShieldAlert, GitMerge, CheckSquare, FileCheck, Download, Share2, Sparkles, Loader2, X, LayoutDashboard, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';

import { ThreatCatalogTab } from '@/components/report/ThreatCatalogTab';
import { C4ArchitectureTab } from '@/components/report/C4ArchitectureTab';
import { MitigationsTab } from '@/components/report/MitigationsTab';
import { ComplianceTab } from '@/components/report/ComplianceTab';
import { FindingsTab } from '@/components/report/FindingsTab';
import { CopilotSidebar } from '@/components/report/CopilotSidebar';
import { PrintReport } from '@/components/report/PrintReport';
import { TabButton } from '@/components/TabButton';
import { agentTranslateReport } from '@/lib/backend/agents';
import { buildFindingsCsv, prioritizeThreats, renderReportDiagram, type ExportReport } from '@/lib/reportExport';
import { getErrorMessage } from '@/lib/backend/inputUtils';

export const Report = () => {
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState('findings');
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [selectedThreatId, setSelectedThreatId] = useState<string | null>(null);
  
  // Export Modal State
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState('pdf');
  const [exportLanguage, setExportLanguage] = useState('en');
  
  const [isExporting, setIsExporting] = useState(false);
  const [preparedPrint, setPreparedPrint] = useState<{ data: ExportReport; diagramSvg: string } | null>(null);

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
    { id: 'pdf', label: 'Complete PDF Report (Summary, C4 & Findings)' },
    { id: 'csv', label: 'CSV (Complete Findings)' },
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

  const handleExport = async () => {
    if (isExporting) return;
    setIsExportModalOpen(false);
    setIsExporting(true);
    const langLabel = exportLanguages.find(l => l.id === exportLanguage)?.label || 'English';
    const progress = toast.loading(exportLanguage === 'en'
      ? 'Preparing complete report...'
      : `Translating report to ${langLabel}...`);
    try {
      const dataToExport = exportLanguage === 'en' ? modelData : await agentTranslateReport(modelData, langLabel);
      if (exportFormat === 'pdf') {
        const diagramSvg = await renderReportDiagram(dataToExport);
        flushSync(() => setPreparedPrint({ data: dataToExport, diagramSvg }));
        await document.fonts.ready;
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        toast.dismiss(progress);
        toast.info('Select "Save as PDF" in the print dialog. Disable browser headers and footers for the cleanest report.', { duration: 6000 });
        const originalTitle = document.title;
        try {
          document.title = `${modelData.id}_report_${exportLanguage}`;
          window.print();
        } finally {
          document.title = originalTitle;
        }
      } else {
        const content = exportFormat === 'csv' ? buildFindingsCsv(dataToExport)
          : JSON.stringify({ ...dataToExport, threats: prioritizeThreats(dataToExport.threats), exportLanguage }, null, 2);
        const blob = new Blob([content], { type: exportFormat === 'csv' ? 'text/csv;charset=utf-8;' : 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${modelData.id}_report_${exportLanguage}.${exportFormat}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast.success(`${exportFormat.toUpperCase()} exported in ${langLabel}.`);
      }
    } catch (error) {
      console.error('Export failed:', error);
      toast.error(`Report export failed: ${getErrorMessage(error)}`);
    } finally {
      toast.dismiss(progress);
      setIsExporting(false);
    }
  };
  
    const handleThreatSelect = (threatId: string) => {
      setActiveTab('threats');
      setSelectedThreatId(threatId);
      // We set a timeout to allow the tab to switch and the component to render
      // before we try to scroll to the element.
      setTimeout(() => {
          const element = document.getElementById(`threat-${threatId}`);
          if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
              // Highlight the element briefly
              element.classList.add('ring-2', 'ring-primary', 'ring-offset-2', 'ring-offset-background');
              setTimeout(() => {
                  element.classList.remove('ring-2', 'ring-primary', 'ring-offset-2', 'ring-offset-background');
              }, 2000);
          }
      }, 100);
    };

  return (
    <>
      <div className="flex flex-col h-[calc(100vh-8rem)] relative print:hidden">
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
          <div className="flex gap-3 relative flex-wrap justify-end">
            <Link to={`/models/new?redo=${encodeURIComponent(modelData.id)}`}
              className="bg-secondary/50 text-foreground px-4 py-2 rounded-xl font-medium text-sm flex items-center gap-2 hover:bg-secondary transition-all">
              <RotateCcw className="h-4 w-4" />
              Redo Threat Model
            </Link>
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
              disabled={isExporting}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-xl font-medium text-sm flex items-center gap-2 hover:bg-primary/90 transition-all shadow-sm disabled:opacity-50"
            >
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {isExporting ? 'Preparing Report...' : 'Export Report'}
            </button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none shrink-0">
          <TabButton active={activeTab === 'findings'} onClick={() => setActiveTab('findings')} icon={LayoutDashboard} label="Findings" />
          <TabButton active={activeTab === 'threats'} onClick={() => setActiveTab('threats')} icon={ShieldAlert} label="Threat Catalog" />
          <TabButton active={activeTab === 'c4'} onClick={() => setActiveTab('c4')} icon={GitMerge} label="C4 Architecture" />
          <TabButton active={activeTab === 'mitigations'} onClick={() => setActiveTab('mitigations')} icon={CheckSquare} label="Mitigation Plan" />
          <TabButton active={activeTab === 'compliance'} onClick={() => setActiveTab('compliance')} icon={FileCheck} label="Compliance" />
        </div>

        <div className="bg-card border border-border/50 rounded-3xl shadow-sm flex-1 mt-4 overflow-hidden flex">
          <div className="flex-1 flex flex-col min-w-0">
            {activeTab === 'findings' && <FindingsTab threats={modelData.threats} model={modelData} onThreatSelect={handleThreatSelect} />}
            {activeTab === 'threats' && <ThreatCatalogTab threats={modelData.threats} framework={modelData.framework} selectedThreatId={selectedThreatId} />}
            {activeTab === 'c4' && <C4ArchitectureTab srg={modelData.srg} modelId={modelData.id} />}
            {activeTab === 'mitigations' && <MitigationsTab threats={modelData.threats} modelId={modelData.id} />}
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
                  disabled={isExporting}
                  className="px-6 py-2.5 rounded-xl text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-2"
                >
                  <Download className="h-4 w-4" /> Download
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <PrintReport modelData={preparedPrint?.data.id === modelData.id ? preparedPrint.data : modelData}
        diagramSvg={preparedPrint?.data.id === modelData.id ? preparedPrint.diagramSvg : ''} />
    </>
  );
};