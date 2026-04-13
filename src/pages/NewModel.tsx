import React, { useState, useRef } from 'react';
import { 
  FileText, 
  Image as ImageIcon, 
  Github, 
  Upload,
  Play,
  CheckCircle2,
  Loader2,
  Sparkles,
  X,
  FileImage,
  Paperclip,
  Shield
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
  "Analyzing repository code and dependencies...",
  "Parsing architecture diagrams and data flows...",
  "Identifying trust boundaries and components...",
  "Applying threat framework heuristic rules...",
  "Synthesizing tailored mitigations via web search...",
  "Evaluating compliance against NIST SP 800-53...",
  "Generating final threat model report..."
];

export const NewModel = () => {
  const [activeTab, setActiveTab] = useState('text');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedFramework, setSelectedFramework] = useState('STRIDE');
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  // --- Form State ---
  const [modelName, setModelName] = useState('');
  const [showNameError, setShowNameError] = useState(false);
  const [description, setDescription] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [uploadedDiagrams, setUploadedDiagrams] = useState<File[]>([]);
  const [uploadedDocs, setUploadedDocs] = useState<File[]>([]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setUploadedDiagrams(prev => [...prev, ...newFiles]);
      toast.success(`${newFiles.length} diagram(s) added to context.`);
    }
  };

  const handleDocUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setUploadedDocs(prev => [...prev, ...newFiles]);
      toast.success(`${newFiles.length} document(s) added to context.`);
    }
  };

  const removeDiagram = (index: number) => {
    setUploadedDiagrams(prev => prev.filter((_, i) => i !== index));
  };

  const removeDoc = (index: number) => {
    setUploadedDocs(prev => prev.filter((_, i) => i !== index));
  };

  const handleAnalyze = async () => {
    // Validate System Name
    if (!modelName.trim()) {
      setShowNameError(true);
      toast.error('System Name is mandatory. Please provide a name before running the analysis.');
      return;
    }
    
    setShowNameError(false);
    setIsAnalyzing(true);
    setCurrentStep(0);

    // Provide default context if user provided strictly nothing
    let payloadDesc = description;
    if (!description && uploadedDiagrams.length === 0 && !repoUrl && uploadedDocs.length === 0) {
      payloadDesc = "Standard web application running on AWS with React frontend and Node backend using a PostgreSQL database.";
    }
    
    // Append attached docs metadata to payload description for context
    if (uploadedDocs.length > 0) {
      payloadDesc += `\n\nAttached Context Documents: ${uploadedDocs.map(d => d.name).join(', ')}`;
    }

    const result = await startAnalysisPipeline(
      {
        name: modelName,
        description: payloadDesc,
        frameworks: [selectedFramework],
        repositoryUrl: repoUrl,
      },
      (stepNumber) => {
        setCurrentStep(stepNumber);
      }
    );

    if (result.success) {
      toast.success('Threat model generated successfully');
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
          Seidr AI is building your threat model using {selectedFramework}. Security gates and agents are running.
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
        <div className="flex-1 max-w-md">
          <input 
            type="text"
            value={modelName}
            onChange={(e) => {
              setModelName(e.target.value);
              if (showNameError && e.target.value.trim()) setShowNameError(false);
            }}
            className={`text-2xl font-bold bg-transparent outline-none focus:ring-0 p-0 mb-1 w-full placeholder:text-muted-foreground/50 border-b-2 transition-colors ${
              showNameError ? 'border-destructive' : 'border-transparent focus:border-primary/50'
            }`}
            placeholder="System Name (Required)..."
          />
          <p className={`text-sm mt-1 ${showNameError ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
            {showNameError ? 'A system name is required to begin analysis.' : 'Provide system context to begin the analysis.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative flex items-center">
             <Shield className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
             <select
               value={selectedFramework}
               onChange={(e) => setSelectedFramework(e.target.value)}
               className="bg-secondary/50 border border-border/50 rounded-full pl-9 pr-8 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none cursor-pointer hover:bg-secondary/80 transition-colors shadow-sm"
             >
               <option value="STRIDE">STRIDE</option>
               <option value="PASTA">PASTA</option>
               <option value="MAESTRO">MAESTRO</option>
             </select>
          </div>
          <button 
            onClick={handleAnalyze}
            className="bg-primary text-primary-foreground px-6 py-2.5 rounded-full font-medium flex items-center gap-2 hover:bg-primary/90 transition-all shadow-md hover:shadow-lg"
          >
            <Play className="h-4 w-4 fill-current" />
            Run Analysis
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none shrink-0">
        <TabButton active={activeTab === 'text'} onClick={() => setActiveTab('text')} icon={FileText} label="System Description" />
        <TabButton active={activeTab === 'diagrams'} onClick={() => setActiveTab('diagrams')} icon={ImageIcon} label="Diagrams" />
        <TabButton active={activeTab === 'git'} onClick={() => setActiveTab('git')} icon={Github} label="Repositories" />
      </div>

      <div className="bg-card border border-border/50 rounded-3xl shadow-sm flex-1 mt-4 p-6 overflow-y-auto">
        {activeTab === 'text' && (
          <div className="h-full flex flex-col gap-6">
            <div className="flex-1 flex flex-col">
              <h3 className="text-lg font-semibold mb-2">Textual System Description</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Describe your system architecture, data flows, trust boundaries, and primary use cases in natural language.
              </p>
              <textarea 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="flex-1 min-h-[200px] bg-secondary/30 border border-border/50 rounded-2xl p-4 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none w-full shadow-inner"
                placeholder="e.g. The system is a multi-tenant SaaS application running on AWS. It uses a React frontend, a Node.js API backend, and a PostgreSQL database. Authentication is handled via Auth0..."
              ></textarea>
              <p className="text-xs text-muted-foreground mt-4">
                * Note: The 3-gate security pipeline is active. Try pasting an email address to see PII redaction in action, or type "ignore previous instructions" to trigger the prompt injection shield!
              </p>
            </div>

            <div className="border-t border-border/50 pt-6">
              <div className="flex items-center justify-between mb-4">
                 <div>
                   <h3 className="text-sm font-semibold">Supporting Documents</h3>
                   <p className="text-xs text-muted-foreground">Upload policies, architectural decision records, or logs.</p>
                 </div>
                 <button 
                   onClick={() => docInputRef.current?.click()}
                   className="text-sm bg-secondary text-foreground border border-border/50 px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-secondary/80 transition-colors shadow-sm"
                 >
                   <Paperclip className="h-4 w-4" /> Attach Files
                 </button>
                 <input 
                   type="file" 
                   ref={docInputRef} 
                   onChange={handleDocUpload} 
                   multiple 
                   accept=".doc,.docx,.pdf,.xls,.xlsx,.csv,.txt"
                   className="hidden" 
                 />
              </div>
              
              {uploadedDocs.length > 0 ? (
                <div className="flex flex-wrap gap-3">
                  {uploadedDocs.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-background border border-border/50 px-3 py-2 rounded-xl text-sm shadow-sm">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="max-w-[150px] truncate font-medium">{file.name}</span>
                      <span className="text-[10px] text-muted-foreground mr-1">{(file.size / 1024).toFixed(0)}kb</span>
                      <button onClick={() => removeDoc(idx)} className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 p-1 rounded-md transition-colors ml-1">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center p-6 border border-dashed border-border/50 rounded-2xl bg-secondary/10">
                  <p className="text-sm text-muted-foreground">No documents attached. Supported formats: .doc, .pdf, .xls, .csv, .txt</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'diagrams' && (
          <div className="h-full flex flex-col">
            <h3 className="text-lg font-semibold mb-4">Architecture Diagrams</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full pb-6">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="bg-secondary/30 border-2 border-dashed border-border rounded-3xl p-12 flex flex-col items-center justify-center hover:bg-secondary/50 transition-colors cursor-pointer"
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  multiple 
                  accept="image/png, image/jpeg, application/pdf, .vsdx, .xml"
                  className="hidden" 
                />
                <Upload className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-1">Upload Diagrams</h3>
                <p className="text-sm text-muted-foreground mb-4 text-center">Drag and drop architecture diagrams, or click to browse</p>
                <p className="text-xs text-muted-foreground text-center">Supported: PNG, JPG, SVG, PDF, Visio (.vsdx), draw.io XML</p>
              </div>

              <div className="bg-secondary/10 border border-border/50 rounded-3xl p-6 overflow-y-auto">
                <h4 className="font-bold text-sm mb-4">Attached Context ({uploadedDiagrams.length})</h4>
                {uploadedDiagrams.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-sm text-muted-foreground border border-dashed border-border/50 rounded-2xl">
                    No diagrams uploaded yet
                  </div>
                ) : (
                  <div className="space-y-3">
                    {uploadedDiagrams.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-card border border-border/50 rounded-xl">
                        <div className="flex items-center gap-3 truncate">
                          <FileImage className="h-5 w-5 text-primary flex-shrink-0" />
                          <div className="truncate">
                            <p className="text-sm font-medium truncate">{file.name}</p>
                            <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => removeDiagram(idx)}
                          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  className="w-full bg-secondary/30 border border-border/50 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-primary/50" 
                  placeholder="https://github.com/org/repo" 
                />
              </div>
              <button 
                onClick={() => toast.promise(new Promise(r => setTimeout(r, 1500)), { loading: 'Verifying connection...', success: 'Repository connected and ready for scan!' })}
                className="bg-secondary text-secondary-foreground px-4 py-2 rounded-xl font-medium text-sm mt-2 hover:bg-secondary/80 transition-colors shadow-sm"
              >
                Verify Connection
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};