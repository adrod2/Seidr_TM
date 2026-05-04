import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Loader2, Sparkles } from 'lucide-react';

const analysisSteps = [
  "Ingesting system context and user inputs...",
  "Analyzing repository code and dependencies...",
  "Parsing architecture diagrams and data flows...",
  "Identifying trust boundaries and components...",
  "Applying threat framework heuristic rules...",
  "Synthesizing tailored mitigations via web search...",
  "Generating final threat model report..."
];

export const AnalysisProgress = ({ currentStep }: { currentStep: number }) => {
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
        Seidr AI is building your threat model using the Hybrid Methodology. Security gates and agents are running.
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
};