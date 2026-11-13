import React, { useState, useEffect } from 'react';
import { Key, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { callLLM } from '@/lib/backend/llmClient';
import { getCopilotModels, type CopilotModel } from '@/lib/backend/copilotClient';

export const AiConfigTab = () => {
  const configFromDb = useLiveQuery(async () => (await db.aiConfig.get('default')) ?? null);
  const [aiConfig, setAiConfig] = useState({
    provider: 'copilot', apiKey: '', endpoint: 'http://localhost:11434', copilotModel: ''
  });
  const [models, setModels] = useState<CopilotModel[]>([]);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (configFromDb) {
      setAiConfig({
        provider: configFromDb.provider,
        apiKey: configFromDb.apiKey,
        endpoint: configFromDb.endpoint,
        copilotModel: configFromDb.copilotModel || ''
      });
    }
  }, [configFromDb]);

  const saveAiConfig = async () => {
    try {
      await db.aiConfig.put({ id: 'default', ...aiConfig, copilotModel: aiConfig.copilotModel.trim() });
      toast.success('AI Agent configuration saved successfully!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save AI configuration.');
    }
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      if (aiConfig.provider === 'copilot') {
        const available = await getCopilotModels();
        setModels(available);
        if (!available.length) throw new Error('No Copilot models are available for this account.');
        if (aiConfig.copilotModel.trim() && !available.some(model => model.id === aiConfig.copilotModel.trim())) {
          throw new Error('The configured Copilot model is not available for this account.');
        }
        toast.success(`Connected to GitHub Copilot. ${available.length} models available.`);
      } else {
        await callLLM('You are a connection check. Reply briefly.', 'Reply with OK.', 'text', { id: 'default', ...aiConfig });
        toast.success(`Successfully connected to ${aiConfig.provider}!`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI connection failed.');
    } finally {
      setTesting(false);
    }
  };

  if (configFromDb === undefined) return <div className="p-4 flex justify-center"><Loader2 className="animate-spin h-6 w-6 text-primary" /></div>;

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h3 className="text-lg font-bold mb-1">AI Agent Configuration</h3>
        <p className="text-sm text-muted-foreground">Select the LLM provider to power Seidr's threat modeling and RAG agents.</p>
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-bold mb-3">Model Provider</label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {['copilot', 'openai', 'gemini', 'claude', 'ollama'].map(p => (
              <button
                key={p}
                onClick={() => setAiConfig({...aiConfig, provider: p})}
                className={`p-4 rounded-2xl border-2 text-sm font-bold transition-all flex flex-col items-center justify-center gap-2 ${
                  aiConfig.provider === p 
                    ? 'border-primary bg-primary/10 text-primary shadow-sm' 
                    : 'border-border/50 bg-secondary/20 hover:bg-secondary/50 text-muted-foreground'
                }`}
              >
                {p === 'copilot' && 'GitHub Copilot'}
                {p === 'openai' && 'OpenAI (GPT-4)'}
                {p === 'gemini' && 'Google Gemini'}
                {p === 'claude' && 'Claude (Anthropic)'}
                {p === 'ollama' && 'Local (Ollama)'}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-secondary/30 border border-border/50 rounded-2xl p-6">
          {aiConfig.provider === 'copilot' ? (
            <div className="space-y-3">
              <p className="text-sm">
                Uses your GitHub Copilot account through the local Copilot SDK service. No API key is stored in the browser.
              </p>
              <p className="text-xs text-muted-foreground">
                Sign in using <code>copilot login</code>, then run <code>pnpm copilot:server</code> in a separate terminal.
                Your account must have Copilot access. Organization model policies and usage limits apply.
              </p>
              <label htmlFor="copilot-model" className="block text-sm font-bold">Copilot Model (optional)</label>
              <input
                id="copilot-model"
                list="copilot-models"
                value={aiConfig.copilotModel}
                onChange={e => setAiConfig({ ...aiConfig, copilotModel: e.target.value })}
                placeholder="Leave blank to use the Copilot default"
                className="w-full bg-background border border-border/50 rounded-xl p-3 text-sm"
              />
              <datalist id="copilot-models">
                {models.map(model => (
                  <option key={model.id} value={model.id}>{model.name}{model.vision ? ' (vision)' : ''}</option>
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">
                Test Connection loads available model IDs without generating a response.
                For diagram uploads, choose a vision-capable model; when blank, the service selects one automatically.
              </p>
            </div>
          ) : aiConfig.provider !== 'ollama' ? (
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
                Keys are stored locally in your browser's database and transmitted directly to the provider.
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
                  <strong>Note:</strong> Ensure your local Ollama instance has CORS enabled and is actively running the <strong>qwen3.5</strong> model.
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
          onClick={testConnection}
          disabled={testing}
          className="bg-secondary text-foreground px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-secondary/80 transition-all border border-border/50 shadow-sm"
        >
          {testing ? 'Connecting...' : 'Test Connection'}
        </button>
      </div>
    </div>
  );
};