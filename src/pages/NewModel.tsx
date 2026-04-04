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
  Loader2,
  Sparkles
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { startAnalysisPipeline } from '@/lib/backend/orchestrator';

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

const analysisSteps = [
  "Ingesting system context and user inputs...",
  "Parsing architecture diagrams and data flows...",
  "Identifying trust boundaries and components...",
  "Applying STRIDE framework and heuristic rules...",
  "Evaluating compliance against NIST SP 800-53...",
  "Generating final threat model report..."
];

export const NewModel = () => {
  const [activeTab, setActiveTab] = useState('text');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [description, setDescription] = useState('');
  const navigate = useNavigate();

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setCurrentStep(0);

    const result = await startAnalysisPipeline(
      {
        name: "New System Analysis",
        description: description || "Generic system architecture",
        frameworks: ['STRIDE']
      },
      (stepNumber) => {
        setCurrentStep(stepNumber);
      }
    );

    if (result.success) {
      toast.success('Threat model generated successfully');
      // Adding a small delay for UI smoothness before redirecting
      setTimeout(() => navigate(`/models/${result.modelId}`), 800);
    } else {
      toast.error(`Analysis failed: ${result.error}`);
      setIsAnalyzing(false);
    }
  };

  if (isAnalyzing) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)] max-w-lg mx-auto">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative mb-8"
        >
          <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full"></div>
          <div className="bg-primary text-primary-foreground p-5 rounded-3xl relative shadow-xl">
            <Sparkles className="h-10 w-10 animate-pulse" />
          </div>
        </motion.div>
        
        <h2 className="text-2xl font-bold mb-2">Analyzing System Architecture</h2>
        <p className="text-muted-foreground text-center mb-10">
          Seidr AI is building your threat model. Security gates and agents are running.
        </p>

        <div className="w-full space-y-4">
          {analysisSteps.map((step, index) => {
            const isCompleted = index < currentStep;
            const isCurrent = index === currentStep;
            const isPending = index > currentStep;

            return (
              <motion.div 
                key={step}
                initial={{ opacity: 0, x: -20 }}
                animate={{ 
                  opacity: isPending ? 0.4 : 1, 
                  x: 0,
                  scale: isCurrent ? 1.02 : 1
                }}
                className={`flex items-center gap-4 p-4 rounded-2xl border transition-colors ${
                  isCurrent ? 'bg-card border-primary shadow-sm' : 'border-transparent'
                }`}
              >
                <div className="flex-shrink-0">
                  {isCompleted ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : isCurrent ? (
                    <Loader2 className="h-5 w-5 text-primary animate-spin" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-border" />
                  )}
                </div>
                <span className={`text-sm font-medium ${isCurrent ? 'text-primary' : isPending ? 'text-muted-foreground' : 'text-foreground'}`}>
                  {step}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>
    );
  }

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
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="flex-1 bg-secondary/30 border border-border/50 rounded-2xl p-4 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none w-full"
              placeholder="e.g. The system is a multi-tenant SaaS application running on AWS. It uses a React frontend, a Node.js API backend, and a PostgreSQL database. Authentication is handled via Auth0. Users upload PDF files which are processed by an async worker..."
            ></textarea>
            <p className="text-xs text-muted-foreground mt-4">
              * Note: The 3-gate security pipeline is active. Try pasting an email address to see PII redaction in action, or type "ignore previous instructions" to trigger the prompt injection shield!
            </p>
          </div>
        )}

        {/* ... The rest of the tabs remain exactly as they were */}
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
              <div 
                onClick={() => toast.info('File picker opened')}
                className="bg-secondary/30 border-2 border-dashed border-border rounded-3xl p-12 flex flex-col items-center justify-center hover:bg-secondary/50 transition-colors cursor-pointer"
              >
                <Upload className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-1">Upload Diagrams</h3>
                <p className="text-sm text-muted-foreground mb-4">Drag and drop architecture diagrams, or click to browse</p>
                <p className="text-xs text-muted-foreground">Supported: PNG, JPG, SVG, PDF, Visio (.vsdx), draw.io XML (Max 50MB)</p>
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
                <input type="text" className="w-full bg-secondary/30 border border-border/50 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="https://github.com/org/repo" />
              </div>
              <button 
                onClick={() => toast.promise(new Promise(r => setTimeout(r, 1500)), { loading: 'Verifying connection...', success: 'Repository connected successfully!' })}
                className="bg-secondary text-secondary-foreground px-4 py-2 rounded-xl font-medium text-sm mt-2 hover:bg-secondary/80 transition-colors"
              >
                Verify Connection
              </button>
            </div>
          </div>
        )}

        {activeTab === 'docs' && (
          <div className="h-full flex flex-col">
            <h3 className="text-lg font-semibold mb-4">Documentation Pastes</h3>
            <div className="flex gap-4 mb-4">
              <input type="text" className="flex-1 bg-secondary/30 border border-border/50 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="Document Title (e.g. ADR-001: Auth Strategy)" />
            </div>
            <textarea className="flex-1 bg-secondary/30 border border-border/50 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none w-full font-mono text-sm" placeholder="Paste document content here..."></textarea>
          </div>
        )}
      </div>
    </div>
  );
};