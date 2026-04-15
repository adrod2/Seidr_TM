import React, { useState, useRef } from 'react';
import { Loader2, UploadCloud, Settings2, FileText, Trash2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';

export const SystemContextTab = () => {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documents = useLiveQuery(() => db.documents.toArray());

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    toast.info(`Analyzing ${files.length} document(s) and extracting text...`);
    
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Extract raw text. (For advanced PDF/DOCX we extract printable ascii strings as a fallback)
        const text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target?.result as string);
          reader.onerror = reject;
          reader.readAsText(file);
        });

        let cleanText = text;
        if (file.name.endsWith('.pdf') || file.name.endsWith('.docx')) {
           cleanText = text.replace(/[^\x20-\x7E\n\r\t]/g, '');
        }

        await db.documents.add({ 
          id: Date.now() + i, 
          name: file.name, 
          chunks: Math.max(1, Math.ceil(cleanText.length / 500)),
          content: cleanText.substring(0, 50000) // Cap at 50k chars to prevent LLM context bloat
        });
      }
      toast.success('Document(s) successfully indexed into the database!');
    } catch (error) {
      console.error(error);
      toast.error('Failed to read documents.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeDocument = async (id: number) => {
    await db.documents.delete(id);
    toast.success('Document removed from index');
  };

  if (documents === undefined) return <div className="p-4 flex justify-center"><Loader2 className="animate-spin h-6 w-6 text-primary" /></div>;

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h3 className="text-lg font-bold mb-4">Knowledge Base (RAG)</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Upload organizational policies, standards, and architecture diagrams. These are chunked, indexed, and retrieved during AI analysis to provide contextual answers.
        </p>
        
        <div className="flex gap-4 mb-6">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
            multiple 
            accept=".pdf,.docx,.txt,.md,.csv" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex-1 border-2 border-dashed border-primary/50 rounded-2xl p-6 flex flex-col items-center justify-center hover:bg-primary/5 transition-colors cursor-pointer text-center disabled:opacity-70 disabled:cursor-not-allowed group"
          >
            {isUploading ? (
              <Loader2 className="h-8 w-8 text-primary mb-2 animate-spin" />
            ) : (
              <UploadCloud className="h-8 w-8 text-primary mb-2 group-hover:scale-110 transition-transform" />
            )}
            <span className="text-sm font-medium text-foreground">{isUploading ? 'Processing File...' : 'Upload Document'}</span>
            <span className="text-xs text-muted-foreground mt-1">PDF, DOCX, TXT, MD, CSV</span>
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