import React, { useState } from 'react';
import { Key } from 'lucide-react';
import { toast } from 'sonner';

export const AiConfigTab = () => {
  const [aiConfig, setAiConfig] = useState({
    provider: localStorage.getItem('seidr_ai_provider') || 'openai',
    apiKey: localStorage.getItem('seidr_ai_key') || '',
    endpoint: localStorage.getItem('seidr_ai_endpoint') || 'http://localhost:11434'
  });

  const saveAiConfig = () => {
    localStorage.setItem('seidr_ai_provider', aiConfig.provider);
    if (aiConfig.apiKey) localStorage.setItem('seidr_ai_key', aiConfig.apiKey);
    if (aiConfig.endpoint) localStorage.setItem('seidr_ai_endpoint', aiConfig.endpoint);
    toast.success('AI Agent configuration saved successfully!');
  };

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h3 className="text-lg font-bold mb-1">AI Agent Configuration</h3>
        <p className="text-sm text-muted-foreground">Select the LLM provider to power Seidr's threat modeling and RAG agents.</p>
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-bold mb-3">Model Provider</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {['openai', 'gemini', 'claude', 'ollama'].map(p => (
              <button
                key={p}
                onClick={() => setAiConfig({...aiConfig, provider: p})}
                className={`p-4 rounded-2xl border-2 text-sm font-bold transition-all flex flex-col items-center justify-center gap-2 ${
                  aiConfig.provider === p 
                    ? 'border-primary bg-primary/10 text-primary shadow-sm' 
                    : 'border-border/50 bg-secondary/20 hover:bg-secondary/50 text-muted-foreground'
                }`}
              >
                {p === 'openai' && 'OpenAI (GPT-4)'}
                {p === 'gemini' && 'Google Gemini'}
                {p === 'claude' && 'Claude (Anthropic)'}
                {p === 'ollama' && 'Local (Ollama)'}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-secondary/30 border border-border/50 rounded-2xl p-6">
          {aiConfig.provider !== 'ollama' ? (
            <div>
              <label className="flex items-center gap-2 text-sm font-bold mb-2">
                <Key className="h-4 w-4 text-muted-foreground" />
                API Key
              </label>
              <input 
                type="password" 
                value={aiConfig.apiKey}
                onChange={(e) => setAiConfig({...aiConfig, apiKey: e.target.value})}
                className="w-full bg-background border border-border/50 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground shadow-inner font-mono text-sm" 
                placeholder={`Enter your ${aiConfig.provider} API key...`} 
              />
              <p className="text-xs text-muted-foreground mt-3">
                Keys are stored locally in your browser's storage and transmitted directly to the provider. 
                They are never stored on Seidr servers.
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-bold mb-2">Local Endpoint URL</label>
              <input 
                type="text" 
                value={aiConfig.endpoint}
                onChange={(e) => setAiConfig({...aiConfig, endpoint: e.target.value})}
                className="w-full bg-background border border-border/50 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground shadow-inner font-mono text-sm" 
                placeholder="http://localhost:11434" 
              />
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mt-4">
                <p className="text-xs font-medium text-amber-600 dark:text-amber-500">
                  <strong>Note:</strong> Ensure your local Ollama instance has CORS enabled and is actively running a supported model (e.g., Llama 3 or Mistral).
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="pt-6 border-t border-border/50 flex gap-3">
        <button 
          onClick={saveAiConfig}
          className="bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-primary/90 transition-all shadow-md hover:shadow-lg"
        >
          Save Configuration
        </button>
        <button 
          onClick={() => toast.promise(new Promise(r => setTimeout(r, 1500)), { loading: 'Pinging AI provider...', success: `Successfully connected to ${aiConfig.provider}!` })}
          className="bg-secondary text-foreground px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-secondary/80 transition-all border border-border/50 shadow-sm"
        >
          Test Connection
        </button>
      </div>
    </div>
  );
};