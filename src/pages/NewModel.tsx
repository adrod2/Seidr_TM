import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Image as ImageIcon, Github, Play } from 'lucide-react';
import { toast } from 'sonner';
import { startAnalysisPipeline } from '@/lib/backend/orchestrator';
import { agentAnalyzeDiagram } from '@/lib/backend/agents';
import { TabButton } from '@/components/TabButton';

// Imported Refactored Components directly from src/components/
import { UploadedDiagram } from '@/components/NewModelTypes';
import { AnalysisProgress } from '@/components/AnalysisProgress';
import { TextContextTab } from '@/components/TextContextTab';
import { DiagramsTab } from '@/components/DiagramsTab';
import { RepositoryTab } from '@/components/RepositoryTab';

export const NewModel = () => {
  const navigate = useNavigate();
  
  // UI State
  const [activeTab, setActiveTab] = useState('text');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  // Form State
  const [modelName, setModelName] = useState('');
  const [showNameError, setShowNameError] = useState(false);
  const [description, setDescription] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [uploadedDiagrams, setUploadedDiagrams] = useState<UploadedDiagram[]>([]);
  const [uploadedDocs, setUploadedDocs] = useState<File[]>([]);

  const handleAddDocs = (files: File[]) => {
    setUploadedDocs(prev => [...prev, ...files]);
    toast.success(`${files.length} document(s) added to context.`);
  };

  const handleRemoveDoc = (index: number) => {
    setUploadedDocs(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddDiagrams = async (files: File[]) => {
    const newDiagrams: UploadedDiagram[] = files.map(f => ({ file: f, isAnalyzing: true }));
    setUploadedDiagrams(prev => [...prev, ...newDiagrams]);
    
    for (const newDiag of newDiagrams) {
      try {
        const base64DataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(newDiag.file);
        });
        
        const desc = await agentAnalyzeDiagram(base64DataUrl);
        
        setUploadedDiagrams(prev => prev.map(d => 
          d.file === newDiag.file ? { ...d, description: desc, isAnalyzing: false } : d
        ));
        toast.success(`Vision Analysis complete for ${newDiag.file.name}`);
      } catch (error: any) {
        setUploadedDiagrams(prev => prev.map(d => 
          d.file === newDiag.file ? { ...d, isAnalyzing: false, error: error.message } : d
        ));
        toast.error(`Failed to analyze ${newDiag.file.name}`);
      }
    }
  };

  const handleRemoveDiagram = (index: number) => {
    setUploadedDiagrams(prev => prev.filter((_, i) => i !== index));
  };

  const handleAnalyze = async () => {
    if (!modelName.trim()) {
      setShowNameError(true);
      toast.error('System Name is mandatory. Please provide a name before running the analysis.');
      return;
    }
    
    if (uploadedDiagrams.some(d => d.isAnalyzing)) {
      toast.error('Please wait for diagram analysis to finish before starting the pipeline.');
      return;
    }

    setShowNameError(false);
    setIsAnalyzing(true);
    setCurrentStep(0);

    let payloadDesc = description;
    if (!description && uploadedDiagrams.length === 0 && !repoUrl && uploadedDocs.length === 0) {
      payloadDesc = "Standard web application running on AWS with React frontend and Node backend using a PostgreSQL database.";
    }
    
    if (uploadedDocs.length > 0) {
      let localDocsText = "";
      for (const file of uploadedDocs) {
        try {
          const text = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve((e.target?.result as string) || '');
            reader.onerror = reject;
            reader.readAsText(file);
          });
          
          let cleanText = text;
          if (file.name.endsWith('.pdf') || file.name.endsWith('.docx')) {
             cleanText = text.replace(/[^\x20-\x7E\n\r\t]/g, '');
          }
          localDocsText += `\n\n--- Document: ${file.name} ---\n${cleanText.substring(0, 15000)}`;
        } catch (e) {
          console.warn(`Failed to read file ${file.name}`);
        }
      }
      if (localDocsText) {
        payloadDesc += `\n\nAttached Context Documents Content:${localDocsText}`;
      }
    }

    if (uploadedDiagrams.length > 0) {
      const diagramContext = uploadedDiagrams
        .filter(d => d.description)
        .map(d => `--- Diagram: ${d.file.name} ---\n${d.description}`)
        .join('\n\n');
        
      if (diagramContext) {
        payloadDesc += `\n\nArchitecture Diagram Analyses:\n${diagramContext}`;
      }
    }

    const result = await startAnalysisPipeline(
      {
        name: modelName,
        description: payloadDesc,
        frameworks: ['Hybrid TM'],
        repositoryUrl: repoUrl,
        diagramsCount: uploadedDiagrams.length,
        localDocuments: uploadedDocs.map(d => d.name)
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
    return <AnalysisProgress currentStep={currentStep} />;
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
          <TextContextTab 
            description={description} 
            setDescription={setDescription} 
            uploadedDocs={uploadedDocs} 
            onAddDocs={handleAddDocs} 
            onRemoveDoc={handleRemoveDoc} 
          />
        )}
        
        {activeTab === 'diagrams' && (
          <DiagramsTab 
            uploadedDiagrams={uploadedDiagrams} 
            onAddDiagrams={handleAddDiagrams} 
            onRemoveDiagram={handleRemoveDiagram} 
          />
        )}

        {activeTab === 'git' && (
          <RepositoryTab 
            repoUrl={repoUrl} 
            setRepoUrl={setRepoUrl} 
          />
        )}
      </div>
    </div>
  );
};