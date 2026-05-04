export interface UploadedDiagram {
  file: File;
  description?: string;
  isAnalyzing: boolean;
  error?: string;
}