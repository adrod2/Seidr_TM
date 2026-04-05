import React, { useState } from 'react';
import { Loader2, UploadCloud, Settings2, FileText, Trash2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export const SystemContextTab = () => {
  const [isUploading, setIsUploading] = useState(false);
  const [documents, setDocuments] = useState([
    { id: 1, name: 'Cloud Security Standard 2026.pdf', chunks: 142 }
  ]);

  const handleFileUpload = () => {
    setIsUploading(true);
    toast.info('Analyzing document and generating embeddings...');
    
    setTimeout(() => {
      setIsUploading(false);
      setDocuments(prev => [...prev, { 
        id: Date.now(), 
        name: `Architecture_Guidelines_v${Math.floor(Math.random() * 10)}.pdf`, 
        chunks: Math.floor(Math.random() * 200) + 50 
      }]);
      toast.success('Document successfully indexed into vector database!');
    }, 2500);
  };

  const removeDocument = (id: number) => {
    setDocuments(prev => prev.filter(d => d.id !== id));
    toast.success('Document removed from index');
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h3 className="text-lg font-bold mb-4">Knowledge Base (RAG)</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Upload organizational policies, standards, and architecture diagrams. These are chunked, indexed, and retrieved during AI analysis to provide contextual answers.
        </p>
        
        <div className="flex gap-4 mb-6">
          <button 
            onClick={handleFileUpload}
            disabled={isUploading}
            className="flex-1 border-2 border-dashed border-primary/50 rounded-2xl p-6 flex flex-col items-center justify-center hover:bg-primary/5 transition-colors cursor-pointer text-center disabled:opacity-70 disabled:cursor-not-allowed group"
          >
            {isUploading ? (
              <Loader2 className="h-8 w-8 text-primary mb-2 animate-spin" />
            ) : (
              <UploadCloud className="h-8 w-8 text-primary mb-2 group-hover:scale-110 transition-transform" />
            )}
            <span className="text-sm font-medium text-foreground">{isUploading ? 'Processing File...' : 'Upload Document'}</span>
            <span className="text-xs text-muted-foreground mt-1">PDF, DOCX, TXT, MD</span>
          </button>
          <div 
            onClick={() => toast.info('Opening URL input dialog')}
            className="flex-1 border-2 border-dashed border-border rounded-2xl p-6 flex flex-col items-center justify-center hover:bg-secondary/30 transition-colors cursor-pointer text-center"
          >
            <Settings2 className="h-8 w-8 text-muted-foreground mb-2" />
            <span className="text-sm font-medium">Add Confluence/Notion URL</span>
            <span className="text-xs text-muted-foreground mt-1">Requires Integration setup</span>
          </div>
        </div>

        <div className="space-y-2">
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4 border border-border/50 rounded-xl border-dashed">No documents uploaded yet.</p>
          ) : (
            documents.map(doc => (
              <div key={doc.id} className="flex items-center justify-between p-3 border border-border/50 rounded-xl bg-card hover:border-primary/50 transition-colors shadow-sm">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">Indexed • {doc.chunks} chunks</p>
                  </div>
                </div>
                <button 
                  onClick={() => removeDocument(doc.id)}
                  className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <hr className="border-border/50" />

      <div>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-bold">Required Controls Register</h3>
            <p className="text-sm text-muted-foreground">The mandatory security controls against which compliance is measured.</p>
          </div>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 flex items-center gap-3 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-6 w-6" />
          <div>
            <h4 className="font-bold">NIST SP 800-53 rev 5 profile loaded</h4>
            <p className="text-sm opacity-90 mt-0.5">124 mandatory controls actively mapped in pipeline.</p>
          </div>
        </div>
      </div>
    </div>
  );
};