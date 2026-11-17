import React, { useEffect, useState, useRef } from 'react';
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
  Shield,
  AlertTriangle,
  Globe,
  Search,
  ExternalLink
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { startAnalysisPipeline } from '@/lib/backend/orchestrator';
import { agentAnalyzeDiagram, agentTranscribeImage, agentWebIntelligence } from '@/lib/backend/agents';
import type { WebIntelligence } from '@/lib/backend/types';
import { ExtractedDocument, SUPPORTED_DOCUMENT_ACCEPT, extractDocument } from '@/lib/backend/documentExtractor';
import { getErrorMessage, readAsDataUrl } from '@/lib/backend/inputUtils';
import { mapLimit } from '@/lib/backend/asyncUtils';
import { getRepositoryUrls } from '@/lib/backend/repositoryInputs';
import { TabButton } from '@/components/TabButton';
import { GitHubConnection } from '@/components/GitHubConnection';
import { db } from '@/lib/db';
import { getRedoInputs, restoreInputFile, storeInputFile, type AnalysisPayload } from '@/lib/backend/modelInputs';

const analysisSteps = [
  "Reading supporting documents, diagrams and system context...",
  "Spidering reference URL for security & privacy documentation...",
  "Analyzing repository code, metadata and documentation...",
  "Parsing architecture diagrams and data flows...",
  "Identifying trust boundaries and components...",
  "Applying threat framework heuristic rules...",
  "Synthesizing tailored mitigations via web search...",
  "Evaluating compliance against NIST SP 800-53...",
  "Generating final threat model report..."
];

interface UploadedDiagram {
  file: File;
  description?: string;
  isAnalyzing: boolean;
  error?: string;
  originalUnavailable?: boolean;
}

interface UploadedDoc {
  file: File;
  isExtracting: boolean;
  result?: ExtractedDocument;
  originalUnavailable?: boolean;
}

const describeExtraction = (doc: UploadedDoc) => {
  if (doc.isExtracting) return 'Reading…';
  const r = doc.result;
  if (!r) return '';
  if (r.status === 'failed') return r.note || 'Could not read';
  if (r.status === 'empty') return r.note || 'No text found';
  const unit = r.method === 'spreadsheet' ? 'sheet' : 'page';
  return [r.pages ? `${r.pages} ${unit}${r.pages === 1 ? '' : 's'}` : '', `${(r.text.length / 1000).toFixed(r.text.length < 10000 ? 1 : 0)}k chars`,
    r.method === 'pdf-ocr' || r.method === 'image-ocr' ? 'OCR' : ''].filter(Boolean).join(' · ');
};

export const NewModel = () => {
  const [activeTab, setActiveTab] = useState('text');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedFramework, setSelectedFramework] = useState('STRIDE');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redoId = searchParams.get('redo');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  // --- Form State ---
  const [modelName, setModelName] = useState('');
  const [showNameError, setShowNameError] = useState(false);
  const [description, setDescription] = useState('');
  const [repoUrls, setRepoUrls] = useState(['']);
  const [uploadedDiagrams, setUploadedDiagrams] = useState<UploadedDiagram[]>([]);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [sourceUrl, setSourceUrl] = useState('');
  const [webIntel, setWebIntel] = useState<WebIntelligence | null>(null);
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlError, setCrawlError] = useState('');
  const [loadingRedo, setLoadingRedo] = useState(Boolean(redoId));
  const [redoError, setRedoError] = useState('');
  const [redoWarnings, setRedoWarnings] = useState<string[]>([]);
  const [additionalInputs, setAdditionalInputs] = useState<Pick<AnalysisPayload, 'questionnaire' | 'documentation'>>({});

  useEffect(() => {
    let active = true;
    setLoadingRedo(Boolean(redoId));
    setRedoError('');
    setRedoWarnings([]);
    setModelName('');
    setDescription('');
    setSelectedFramework('STRIDE');
    setRepoUrls(['']);
    setUploadedDiagrams([]);
    setUploadedDocs([]);
    setSourceUrl('');
    setWebIntel(null);
    setCrawlError('');
    setAdditionalInputs({});
    setActiveTab('text');
    setShowNameError(false);
    if (!redoId) return () => { active = false; };
    const load = async () => {
      try {
        const [model, saved] = await Promise.all([db.threatModels.get(redoId), db.modelInputs.get(redoId)]);
        if (!model) throw new Error('The original threat model was not found.');
        const { payload, warnings } = getRedoInputs(model, saved);
        if (!active) return;
        setModelName(payload.name);
        setDescription(payload.userDescription ?? (payload.usedDefaultDescription ? '' : payload.description));
        setSelectedFramework(payload.frameworks[0] || 'STRIDE');
        setRepoUrls(payload.repositoryUrls?.length ? [...payload.repositoryUrls] : payload.repositoryUrl ? [payload.repositoryUrl] : ['']);
        setSourceUrl(payload.sourceUrl || '');
        setAdditionalInputs({ questionnaire: payload.questionnaire, documentation: payload.documentation });
        setUploadedDocs((payload.documents || []).map((doc, index) => ({
          ...restoreInputFile(payload.inputFiles?.documents[index], doc.name, doc.text), result: doc, isExtracting: false,
        })));
        setUploadedDiagrams((payload.diagrams || []).map((diagram, index) => ({
          ...restoreInputFile(payload.inputFiles?.diagrams[index], diagram.name),
          description: diagram.description, error: diagram.error, isAnalyzing: false,
        })));
        setRedoWarnings(warnings);
      } catch (error) {
        if (active) setRedoError(getErrorMessage(error));
      } finally {
        if (active) setLoadingRedo(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [redoId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      e.target.value = '';
      
      const newDiagrams: UploadedDiagram[] = newFiles.map(f => ({ file: f, isAnalyzing: true }));
      setUploadedDiagrams(prev => [...prev, ...newDiagrams]);
      
      await mapLimit(newDiagrams, 3, async (newDiag) => {
        try {
          const base64DataUrl = await readAsDataUrl(newDiag.file);
          
          const desc = await agentAnalyzeDiagram(base64DataUrl);
          
          setUploadedDiagrams(prev => prev.map(d => 
            d.file === newDiag.file ? { ...d, description: desc, isAnalyzing: false } : d
          ));
          toast.success(`Vision Analysis complete for ${newDiag.file.name}`);
        } catch (error) {
          setUploadedDiagrams(prev => prev.map(d => 
            d.file === newDiag.file ? { ...d, isAnalyzing: false, error: getErrorMessage(error) } : d
          ));
          toast.error(`Failed to analyze ${newDiag.file.name}`);
        }
      });
    }
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const newFiles = Array.from(e.target.files);
    e.target.value = '';
    setUploadedDocs(prev => [...prev, ...newFiles.map(file => ({ file, isExtracting: true }))]);
    await mapLimit(newFiles, 3, async (file) => {
      const result = await extractDocument(file, { ocr: agentTranscribeImage });
      setUploadedDocs(prev => prev.map(d => d.file === file ? { ...d, isExtracting: false, result } : d));
      if (result.status === 'failed' || result.status === 'empty') {
        toast.error(`${file.name}: ${result.note || 'no readable text found'}`);
      } else {
        toast.success(`${file.name}: ${result.text.length.toLocaleString()} characters extracted${result.status === 'partial' ? ' (partial)' : ''}.`);
      }
    });
  };

  const removeDiagram = (index: number) => {
    setUploadedDiagrams(prev => prev.filter((_, i) => i !== index));
  };

  const removeDoc = (index: number) => {
    setUploadedDocs(prev => prev.filter((_, i) => i !== index));
  };

  const normalizedSourceUrl = () => {
    const raw = sourceUrl.trim();
    if (!raw) return '';
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const url = new URL(withScheme);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  };

  const handleCrawl = async () => {
    const url = normalizedSourceUrl();
    if (!url) {
      toast.error('Enter a valid public http(s) URL to scan.');
      return;
    }
    setIsCrawling(true);
    setCrawlError('');
    setWebIntel(null);
    try {
      const result = await agentWebIntelligence(url);
      setWebIntel(result);
      toast.success(`Documentation agent analysed ${result.pages.length} page(s) from ${new URL(result.sourceUrl).hostname}`);
    } catch (error) {
      const message = getErrorMessage(error);
      setCrawlError(message);
      toast.error(`URL scan failed: ${message}`);
    } finally {
      setIsCrawling(false);
    }
  };

  const handleAnalyze = async () => {
    // Validate System Name
    if (!modelName.trim()) {
      setShowNameError(true);
      toast.error('System Name is mandatory. Please provide a name before running the analysis.');
      return;
    }
    
    // Check if diagrams are still processing
    if (uploadedDiagrams.some(d => d.isAnalyzing)) {
      toast.error('Please wait for diagram analysis to finish before starting the pipeline.');
      return;
    }

    if (isCrawling) {
      toast.error('Please wait for the URL documentation scan to finish.');
      return;
    }

    if (uploadedDocs.some(d => d.isExtracting)) {
      toast.error('Please wait for the supporting documents to finish reading.');
      return;
    }

    const crawlTarget = normalizedSourceUrl();
    if (crawlTarget === null) {
      toast.error('The reference URL is not a valid http(s) URL.');
      setActiveTab('text');
      return;
    }

    let repositoryUrls: string[];
    try {
      repositoryUrls = getRepositoryUrls(repoUrls);
    } catch (error) {
      toast.error(getErrorMessage(error));
      setActiveTab('git');
      return;
    }

    setShowNameError(false);
    setIsAnalyzing(true);
    setCurrentStep(0);

    // Give diagrams whose vision analysis failed one more attempt so no input is silently dropped.
    let diagrams = uploadedDiagrams;
    const failedDiagrams = uploadedDiagrams.filter(d => !d.description);
    if (failedDiagrams.length) {
      diagrams = await mapLimit(uploadedDiagrams, 3, async (d) => {
        if (d.description || d.originalUnavailable) return d;
        try {
          const dataUrl = await readAsDataUrl(d.file);
          return { ...d, description: await agentAnalyzeDiagram(dataUrl), error: undefined };
        } catch (error) {
          return { ...d, error: getErrorMessage(error) };
        }
      });
      setUploadedDiagrams(diagrams);
      const stillFailed = diagrams.filter(d => !d.description);
      if (stillFailed.length) toast.warning(`${stillFailed.length} diagram(s) could not be analysed and are listed as failed in the report.`);
    }

    const hasOtherInputs = diagrams.some(d => d.description) || repositoryUrls.length > 0 || uploadedDocs.some(d => d.result?.text) || !!crawlTarget;
    const usedDefaultDescription = !description.trim() && !hasOtherInputs;
    const payloadDesc = usedDefaultDescription
      ? "Standard web application running on AWS with React frontend and Node backend using a PostgreSQL database."
      : description.trim() || 'No textual description was provided; derive the system from the supporting documents, diagrams, website and repository sections.';

    const result = await startAnalysisPipeline(
      {
        ...additionalInputs,
        name: modelName,
        description: payloadDesc,
        frameworks: [selectedFramework],
        repositoryUrls,
        diagramsCount: diagrams.length,
        diagrams: diagrams.map(d => ({ name: d.file.name, description: d.description, error: d.error })),
        localDocuments: uploadedDocs.map(d => d.file.name),
        documents: uploadedDocs.map(d => d.result || { name: d.file.name, size: d.file.size, method: 'unsupported', status: 'failed', text: '', note: 'Not read.' }),
        userDescription: description,
        usedDefaultDescription,
        sourceUrl: crawlTarget || undefined,
        webIntelligence: webIntel && crawlTarget && webIntel.sourceUrl.replace(/\/$/, '') === crawlTarget.replace(/\/$/, '') ? webIntel : undefined,
        inputFiles: {
          documents: uploadedDocs.map(doc => doc.originalUnavailable ? null : storeInputFile(doc.file)),
          diagrams: diagrams.map(diagram => diagram.originalUnavailable ? null : storeInputFile(diagram.file)),
        },
      },
      (stepNumber) => {
        setCurrentStep(stepNumber);
      }
    );

    if (result.success === true) {
      toast.success('Threat model generated successfully');
      setTimeout(() => navigate(`/models/${result.modelId}`), 800);
    } else {
      toast.error(`Analysis failed: ${result.error}`);
      setIsAnalyzing(false);
    }
  };

  if (loadingRedo || redoError) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] gap-4">
        {loadingRedo ? <><Loader2 className="h-8 w-8 animate-spin text-primary" /><p>Loading original assessment inputs...</p></>
          : <><p role="alert" className="text-destructive">{redoError}</p><Link to="/models/new" className="text-primary underline">Start a blank threat model</Link></>}
      </div>
    );
  }

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
      {redoId && (
        <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm space-y-1">
          <p>Editing a copy. Change any inputs or methodology, then run a new analysis. The original model is unchanged; repository and website data will be fetched again.</p>
          {redoWarnings.map(warning => <p key={warning} className="text-amber-600 dark:text-amber-400">{warning}</p>)}
        </div>
      )}
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
            {showNameError ? 'A system name is required to begin analysis.'
              : selectedFramework === 'Hybrid TM'
                ? 'Hybrid combines security (STRIDE), privacy (LINDDUN), and business risk (PASTA).'
                : 'Provide system context to begin the analysis.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative flex items-center">
             <Shield className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
             <select
               value={selectedFramework}
               onChange={(e) => setSelectedFramework(e.target.value)}
               className="bg-secondary/50 border border-border/50 rounded-full pl-9 pr-8 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none cursor-pointer hover:bg-secondary/80 transition-colors shadow-sm"
               aria-label="Threat modeling methodology"
             >
               <option value="STRIDE">STRIDE</option>
               <option value="PASTA">PASTA</option>
               <option value="MAESTRO">MAESTRO</option>
               <option value="Hybrid TM">Hybrid TM</option>
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
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Globe className="h-4 w-4 text-primary" /> Reference URL <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    A documentation agent spiders this site (same domain, up to 25 pages) and extracts security, privacy, compliance and architecture details into the analysis context.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => {
                    setSourceUrl(e.target.value);
                    setWebIntel(null);
                    setCrawlError('');
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCrawl(); }}
                  className="flex-1 bg-secondary/30 border border-border/50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="https://docs.example.com or https://example.com/trust"
                  aria-label="Reference URL"
                />
                <button
                  onClick={handleCrawl}
                  disabled={isCrawling || !sourceUrl.trim()}
                  className="text-sm bg-secondary text-foreground border border-border/50 px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-secondary/80 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCrawling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  {isCrawling ? 'Scanning...' : 'Scan Now'}
                </button>
              </div>
              {isCrawling && (
                <p className="text-xs text-muted-foreground mt-2">Crawling pages and extracting threat-modeling evidence. This can take up to a minute.</p>
              )}
              {crawlError && !isCrawling && (
                <p className="text-xs text-destructive mt-2 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> {crawlError}</p>
              )}
              {!webIntel && !isCrawling && !crawlError && sourceUrl.trim() && (
                <p className="text-xs text-muted-foreground mt-2">Not scanned yet; the site will be crawled automatically when you run the analysis.</p>
              )}
              {webIntel && (
                <div className="mt-3 bg-secondary/10 border border-border/50 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-sm font-medium mb-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    {webIntel.pages.length} relevant page(s) added to context
                    {webIntel.skippedPages > 0 && <span className="text-xs text-amber-500">({webIntel.skippedPages} blocked by security gates)</span>}
                  </div>
                  <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto mb-3">
                    {webIntel.pages.map(page => (
                      <a key={page.url} href={page.url} target="_blank" rel="noopener noreferrer"
                        className="text-[11px] bg-background border border-border/50 px-2 py-1 rounded-lg flex items-center gap-1 hover:border-primary/50 max-w-[260px]" title={page.url}>
                        <ExternalLink className="h-3 w-3 flex-shrink-0" /> <span className="truncate">{page.title || page.url}</span>
                      </a>
                    ))}
                  </div>
                  <details>
                    <summary className="text-xs text-primary cursor-pointer">Preview extracted briefing</summary>
                    <pre className="mt-2 text-xs whitespace-pre-wrap max-h-64 overflow-y-auto bg-background border border-border/50 rounded-xl p-3 font-sans">{webIntel.summary}</pre>
                  </details>
                </div>
              )}
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
                   accept={SUPPORTED_DOCUMENT_ACCEPT}
                   className="hidden" 
                 />
              </div>
              
              {uploadedDocs.length > 0 ? (
                <div className="flex flex-wrap gap-3">
                  {uploadedDocs.map((doc, idx) => {
                    const failed = doc.result && (doc.result.status === 'failed' || doc.result.status === 'empty');
                    return (
                      <div key={idx} title={doc.result?.note || ''} className={`flex items-center gap-2 bg-background border px-3 py-2 rounded-xl text-sm shadow-sm ${failed ? 'border-destructive/50' : 'border-border/50'}`}>
                        {doc.isExtracting ? <Loader2 className="h-4 w-4 text-primary animate-spin" />
                          : failed ? <AlertTriangle className="h-4 w-4 text-destructive" />
                          : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                        <div className="flex flex-col min-w-0">
                          <span className="max-w-[220px] truncate font-medium">{doc.file.name}</span>
                          {doc.originalUnavailable && <span className="text-[10px] text-amber-600 dark:text-amber-400">Recovered text only; original file unavailable</span>}
                          <span className={`text-[10px] max-w-[220px] truncate ${failed ? 'text-destructive' : 'text-muted-foreground'}`}>
                            {(doc.file.size / 1024).toFixed(0)} KB · {describeExtraction(doc)}
                          </span>
                        </div>
                        <button onClick={() => removeDoc(idx)} className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 p-1 rounded-md transition-colors ml-1">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center p-6 border border-dashed border-border/50 rounded-2xl bg-secondary/10">
                  <p className="text-sm text-muted-foreground">No documents attached. Supported: PDF (incl. scanned), Word, Excel, CSV, text/Markdown, JSON/YAML/Terraform, and images.</p>
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
                  accept="image/png, image/jpeg, image/webp"
                  className="hidden" 
                />
                <Upload className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-1">Upload Diagrams</h3>
                <p className="text-sm text-muted-foreground mb-4 text-center">Drag and drop architecture diagrams, or click to browse</p>
                <p className="text-xs text-muted-foreground text-center">Supported: PNG, JPG, WEBP</p>
              </div>

              <div className="bg-secondary/10 border border-border/50 rounded-3xl p-6 overflow-y-auto">
                <h4 className="font-bold text-sm mb-4">Attached Context ({uploadedDiagrams.length})</h4>
                {uploadedDiagrams.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-sm text-muted-foreground border border-dashed border-border/50 rounded-2xl">
                    No diagrams uploaded yet
                  </div>
                ) : (
                  <div className="space-y-3">
                    {uploadedDiagrams.map((diag, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-card border border-border/50 rounded-xl">
                        <div className="flex items-center gap-3 truncate">
                          {diag.isAnalyzing ? (
                            <Loader2 className="h-5 w-5 text-primary flex-shrink-0 animate-spin" />
                          ) : diag.error ? (
                            <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
                          ) : (
                            <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                          )}
                          <div className="truncate">
                            <p className="text-sm font-medium truncate">{diag.file.name}</p>
                            {diag.originalUnavailable && <p className="text-xs text-amber-600 dark:text-amber-400">Original image unavailable; reattach to re-analyze</p>}
                            <p className="text-xs text-muted-foreground">
                              {diag.isAnalyzing ? 'Extracting architecture details via Vision...' : diag.error ? 'Analysis failed' : 'Architecture extracted successfully'}
                            </p>
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
              Add repositories to include in the same threat model. GitHub analysis covers two dimensions: static code and dependency review (SAST/SCA), plus repository metadata and documentation for architecture, security and privacy context. DAST (testing a running application) is not performed. Other providers supply URL-based context only.
            </p>
            <div className="space-y-4">
              <GitHubConnection selectedUrls={repoUrls} onAddRepository={url =>
                setRepoUrls(previous => [...previous.filter(value => value.trim()), url])
              } />
              {repoUrls.map((url, index) => (
                <div key={index}>
                  <label htmlFor={`repository-${index}`} className="block text-sm font-medium mb-2">Repository URL {index + 1}</label>
                  <div className="flex items-center gap-2">
                    <input
                      id={`repository-${index}`}
                      type="url"
                      value={url}
                      onChange={e => setRepoUrls(previous => previous.map((value, i) => i === index ? e.target.value : value))}
                      className="w-full min-w-0 bg-secondary/30 border border-border/50 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="https://github.com/org/repo"
                    />
                    <button
                      type="button"
                      aria-label={`Remove repository ${index + 1}`}
                      onClick={() => setRepoUrls(previous => previous.length === 1 ? [''] : previous.filter((_, i) => i !== index))}
                      className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setRepoUrls(previous => [...previous, ''])}
                className="bg-secondary text-secondary-foreground px-4 py-2 rounded-xl font-medium text-sm mt-2 hover:bg-secondary/80 transition-colors shadow-sm"
              >
                Add Repository
              </button>
              <p className="text-xs text-muted-foreground">Repositories are analyzed when you run the model. Blank rows and duplicate URLs are ignored; failures are listed individually in the report.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
