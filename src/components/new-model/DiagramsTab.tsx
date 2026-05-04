import React, { useRef } from 'react';
import { Upload, Loader2, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { UploadedDiagram } from './types';

interface DiagramsTabProps {
  uploadedDiagrams: UploadedDiagram[];
  onAddDiagrams: (files: File[]) => void;
  onRemoveDiagram: (index: number) => void;
}

export const DiagramsTab = ({ uploadedDiagrams, onAddDiagrams, onRemoveDiagram }: DiagramsTabProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddDiagrams(Array.from(e.target.files));
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
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
                      <p className="text-xs text-muted-foreground">
                        {diag.isAnalyzing ? 'Extracting architecture details via Vision...' : diag.error ? 'Analysis failed' : 'Architecture extracted successfully'}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => onRemoveDiagram(idx)}
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
  );
};