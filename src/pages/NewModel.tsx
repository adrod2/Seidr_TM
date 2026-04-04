import React, { useState } from 'react';
import { 
  FileText, 
  HelpCircle, 
  Image as ImageIcon, 
  Github, 
  Files,
  Upload,
  Play,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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

export const NewModel = () => {
  const [activeTab, setActiveTab] = useState('text');
  const navigate = useNavigate();

  const handleAnalyze = () => {
    // In a real app, we'd submit to the backend here.
    // For now, redirect to a "loading" or directly to the report page.
    navigate('/models/m-1234');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Create Threat Model</h2>
          <p className="text-muted-foreground text-sm mt-1">Provide system context to begin the analysis. All inputs are optional.</p>
        </div>
        <button 
          onClick={handleAnalyze}
          className="bg-primary text-primary-foreground px-6 py-2.5 rounded-full font-medium flex items-center gap-2 hover:bg-primary/90 transition-all shadow-md hover:shadow-lg"
        >
          <Play className="h-4 w-4 fill-current" />
          Run Analysis
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none shrink-0">
        <TabButton active={activeTab === 'text'} onClick={() => setActiveTab('text')} icon={FileText} label="System Description" />
        <TabButton active={activeTab === 'questionnaire'} onClick={() => setActiveTab('questionnaire')} icon={HelpCircle} label="Questionnaire" />
        <TabButton active={activeTab === 'diagrams'} onClick={() => setActiveTab('diagrams')} icon={ImageIcon} label="Diagrams" />
        <TabButton active={activeTab === 'git'} onClick={() => setActiveTab('git')} icon={Github} label="Repositories" />
        <TabButton active={activeTab === 'docs'} onClick={() => setActiveTab('docs')} icon={Files} label="Documentation" />
      </div>

      <div className="bg-card border border-border/50 rounded-3xl shadow-sm flex-1 mt-4 p-6 overflow-y-auto">
        {activeTab === 'text' && (
          <div className="h-full flex flex-col">
            <h3 className="text-lg font-semibold mb-4">Textual System Description</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Describe your system architecture, data flows, trust boundaries, and primary use cases in natural language.
            </p>
            <textarea 
              className="flex-1 bg-secondary/30 border border-border/50 rounded-2xl p-4 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none w-full"
              placeholder="e.g. The system is a multi-tenant SaaS application running on AWS. It uses a React frontend, a Node.js API backend, and a PostgreSQL database. Authentication is handled via Auth0. Users upload PDF files which are processed by an async worker..."
            ></textarea>
          </div>
        )}

        {activeTab === 'questionnaire' && (
          <div className="max-w-3xl space-y-8">
            <h3 className="text-lg font-semibold mb-2">Guided Questionnaire</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Deployment Model</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {['AWS', 'GCP', 'Azure', 'On-Premise', 'Hybrid'].map(opt => (
                    <div key={opt} className="border border-border/50 rounded-xl p-3 flex items-center gap-2 cursor-pointer hover:bg-secondary/50">
                      <input type="checkbox" className="rounded text-primary" />
                      <span className="text-sm">{opt}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Authentication Methods</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {['OIDC/OAuth2', 'SAML', 'JWT', 'Session', 'API Keys', 'MFA Enforced'].map(opt => (
                    <div key={opt} className="border border-border/50 rounded-xl p-3 flex items-center gap-2 cursor-pointer hover:bg-secondary/50">
                      <input type="checkbox" className="rounded text-primary" />
                      <span className="text-sm">{opt}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Data Classification</label>
                <select className="w-full bg-secondary/30 border border-border/50 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option>Select highest data classification level</option>
                  <option>Public / Unclassified</option>
                  <option>Internal / Confidential</option>
                  <option>PII / PHI / Regulated</option>
                  <option>Highly Restricted / Secrets</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'diagrams' && (
          <div className="h-full flex flex-col items-center justify-center">
            <div className="max-w-md w-full text-center">
              <div className="bg-secondary/30 border-2 border-dashed border-border rounded-3xl p-12 flex flex-col items-center justify-center hover:bg-secondary/50 transition-colors cursor-pointer">
                <Upload className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-1">Upload Diagrams</h3>
                <p className="text-sm text-muted-foreground mb-4">Drag and drop architecture diagrams, or click to browse</p>
                <p className="text-xs text-muted-foreground">Supported: PNG, JPG, SVG, PDF, Visio (.vsdx), draw.io XML (Max 50MB)</p>
              </div>
              
              <div className="mt-8 text-left">
                <div className="flex items-center gap-2 p-3 bg-card border border-border/50 rounded-xl shadow-sm">
                  <ImageIcon className="h-5 w-5 text-primary" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">network-architecture-v2.drawio</p>
                    <p className="text-xs text-muted-foreground">1.2 MB</p>
                  </div>
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'git' && (
          <div className="max-w-2xl">
            <h3 className="text-lg font-semibold mb-4">Connect Code Repositories</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Connect a GitHub, GitLab, or Bitbucket repository. The AI agent will perform a heuristic scan of configuration, dependencies, and code structure.
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Repository URL</label>
                <input 
                  type="text" 
                  className="w-full bg-secondary/30 border border-border/50 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="https://github.com/org/repo"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Branch (Optional)</label>
                <input 
                  type="text" 
                  className="w-full bg-secondary/30 border border-border/50 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="main"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Access Token (Private Repos)</label>
                <input 
                  type="password" 
                  className="w-full bg-secondary/30 border border-border/50 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="ghp_..."
                />
              </div>
              <button className="bg-secondary text-secondary-foreground px-4 py-2 rounded-xl font-medium text-sm mt-2 hover:bg-secondary/80 transition-colors">
                Verify Connection
              </button>
            </div>
          </div>
        )}

        {activeTab === 'docs' && (
          <div className="h-full flex flex-col">
            <h3 className="text-lg font-semibold mb-4">Documentation Pastes</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Paste contents of Architecture Decision Records (ADRs), API specs, or security requirements.
            </p>
            <div className="flex gap-4 mb-4">
              <input 
                type="text" 
                className="flex-1 bg-secondary/30 border border-border/50 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="Document Title (e.g. ADR-001: Auth Strategy)"
              />
              <select className="bg-secondary/30 border border-border/50 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option>Type: ADR</option>
                <option>Type: API Spec</option>
                <option>Type: Sec Requirements</option>
                <option>Type: Other</option>
              </select>
            </div>
            <textarea 
              className="flex-1 bg-secondary/30 border border-border/50 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none w-full font-mono text-sm"
              placeholder="Paste document content here..."
            ></textarea>
          </div>
        )}
      </div>
    </div>
  );
};
