import React, { useRef } from 'react';
import { FileText, Paperclip, X } from 'lucide-react';

interface TextContextTabProps {
  description: string;
  setDescription: (desc: string) => void;
  uploadedDocs: File[];
  onAddDocs: (files: File[]) => void;
  onRemoveDoc: (index: number) => void;
}

export const TextContextTab = ({
  description,
  setDescription,
  uploadedDocs,
  onAddDocs,
  onRemoveDoc
}: TextContextTabProps) => {
  const docInputRef = useRef<HTMLInputElement>(null);

  const handleDocUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddDocs(Array.from(e.target.files));
      if (docInputRef.current) docInputRef.current.value = '';
    }
  };

  return (
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
        />
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
             accept=".doc,.docx,.pdf,.xls,.xlsx,.csv,.txt,.md"
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
                <button onClick={() => onRemoveDoc(idx)} className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 p-1 rounded-md transition-colors ml-1">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center p-6 border border-dashed border-border/50 rounded-2xl bg-secondary/10">
            <p className="text-sm text-muted-foreground">No documents attached. Supported formats: .pdf, .docx, .txt, .csv, .md</p>
          </div>
        )}
      </div>
    </div>
  );
};