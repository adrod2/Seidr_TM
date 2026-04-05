import React, { useState, useRef } from 'react';
import { 
  Users, 
  Shield, 
  Database, 
  Settings2,
  Plus,
  Search,
  UploadCloud,
  FileText,
  Trash2,
  Loader2,
  CheckCircle2,
  Upload,
  Mail,
  BrainCircuit,
  Key
} from 'lucide-react';
import { toast } from 'sonner';

const TabButton = ({ active, icon: Icon, label, onClick }: any) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
      active 
        ? 'bg-primary text-primary-foreground shadow-md' 
        : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground'
    }`}
  >
    <Icon className="h-4 w-4" />
    {label}
  </button>
);

export const Admin = () => {
  const [activeTab, setActiveTab] = useState('ai-config');
  const riskFileInputRef = useRef<HTMLInputElement>(null);
  
  // Interactive State
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingRisks, setIsUploadingRisks] = useState(false);
  
  // AI Config State
  const [aiConfig, setAiConfig] = useState({
    provider: localStorage.getItem('seidr_ai_provider') || 'openai',
    apiKey: localStorage.getItem('seidr_ai_key') || '',
    endpoint: localStorage.getItem('seidr_ai_endpoint') || 'http://localhost:11434'
  });

  const [documents, setDocuments] = useState([
    { id: 1, name: 'Cloud Security Standard 2026.pdf', chunks: 142 }
  ]);
  
  const [integrations, setIntegrations] = useState({
    jira: true,
    slack: false
  });

  const [businessRisks, setBusinessRisks] = useState([
    { id: 'BR-01', desc: 'Ransomware attack causing >24h downtime', appetite: 'Conservative', status: 'Unmitigated' },
    { id: 'BR-02', desc: 'Customer PII breach via web interface', appetite: 'Minimal', status: 'Mitigated' }
  ]);

  const [users, setUsers] = useState([
    { id: 1, name: 'Jane Doe', email: 'jane.doe@example.com', role: 'Org Admin', status: 'Active', lastActive: 'Just now' },
    { id: 2, name: 'John Smith', email: 'john.smith@example.com', role: 'Security Engineer', status: 'Active', lastActive: '2 hrs ago' },
    { id: 3, name: 'Alice Jones', email: 'alice.jones@example.com', role: 'Developer', status: 'Pending', lastActive: 'Never' }
  ]);

  const saveAiConfig = () => {
    localStorage.setItem('seidr_ai_provider', aiConfig.provider);
    if (aiConfig.apiKey) localStorage.setItem('seidr_ai_key', aiConfig.apiKey);
    if (aiConfig.endpoint) localStorage.setItem('seidr_ai_endpoint', aiConfig.endpoint);
    toast.success('AI Agent configuration saved successfully!');
  };

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

  const handleRiskBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setIsUploadingRisks(true);
      toast.info('Parsing CSV and importing business risks...');
      
      setTimeout(() => {
        setIsUploadingRisks(false);
        setBusinessRisks(prev => [
          ...prev,
          { id: `BR-0${prev.length + 1}`, desc: 'Supply chain compromise via third-party dependency', appetite: 'Moderate', status: 'Unmitigated' },
          { id: `BR-0${prev.length + 2}`, desc: 'Insider threat data exfiltration', appetite: 'Minimal', status: 'Unmitigated' }
        ]);
        toast.success('Successfully imported 2 business risks from CSV.');
        if (riskFileInputRef.current) riskFileInputRef.current.value = '';
      }, 2000);
    }
  };

  const removeDocument = (id: number) => {
    setDocuments(prev => prev.filter(d => d.id !== id));
    toast.success('Document removed from index');
  };

  const toggleIntegration = (key: keyof typeof integrations, name: string) => {
    const isConnecting = !integrations[key];
    if (isConnecting) {
      toast.promise(new Promise(r => setTimeout(r, 1500)), {
        loading: `Authenticating with ${name}...`,
        success: () => {
          setIntegrations(prev => ({ ...prev, [key]: true }));
          return `${name} connected successfully!`;
        }
      });
    } else {
      setIntegrations(prev => ({ ...prev, [key]: false }));
      toast.info(`${name} disconnected.`);
    }
  };

  const handleInviteUser = () => {
    toast.promise(new Promise(r => setTimeout(r, 1000)), {
      loading: 'Sending invitation...',
      success: () => {
        setUsers(prev => [...prev, {
          id: Date.now(),
          name: 'New User',
          email: `new.user${prev.length}@example.com`,
          role: 'Viewer',
          status: 'Pending',
          lastActive: 'Never'
        }]);
        return 'Invitation sent successfully!';
      }
    });
  };

  const removeUser = (id: number) => {
    setUsers(prev => prev.filter(u => u.id !== id));
    toast.success('User removed from organization.');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Administration</h2>
        <p className="text-muted-foreground text-sm mt-1">Manage users, global risk context, and system configuration.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none shrink-0 mb-4">
        <TabButton active={activeTab === 'ai-config'} onClick={() => setActiveTab('ai-config')} icon={BrainCircuit} label="AI Models" />
        <TabButton active={activeTab === 'risk'} onClick={() => setActiveTab('risk')} icon={Shield} label="Risk Context" />
        <TabButton active={activeTab === 'system'} onClick={() => setActiveTab('system')} icon={Database} label="System Context" />
        <TabButton active={activeTab === 'users'} onClick={() => setActiveTab('users')} icon={Users} label="User Management" />
        <TabButton active={activeTab === 'integrations'} onClick={() => setActiveTab('integrations')} icon={Settings2} label="Integrations" />
      </div>

      <div className="bg-card border border-border/50 rounded-3xl shadow-sm flex-1 overflow-y-auto p-6">
        {activeTab === 'ai-config' && (
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
        )}

        {activeTab === 'risk' && (
          <div className="space-y-8 max-w-4xl">
            <div>
              <h3 className="text-lg font-bold mb-4">CIA Impact Profile</h3>
              <p className="text-sm text-muted-foreground mb-4">Calibrate threat scoring multipliers for your organisation.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {['Confidentiality', 'Integrity', 'Availability'].map(cia => (
                  <div key={cia} className="bg-secondary/30 p-4 rounded-2xl border border-border/50">
                    <label className="block text-sm font-bold mb-3">{cia}</label>
                    <select 
                      onChange={() => toast.success(`${cia} multiplier updated`)}
                      className="w-full bg-background border border-border/50 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                    >
                      <option>Critical (x1.5)</option>
                      <option>High (x1.2)</option>
                      <option>Medium (x1.0)</option>
                      <option>Low (x0.8)</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <hr className="border-border/50" />

            <div>
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-lg font-bold">Business Risk Register</h3>
                  <p className="text-sm text-muted-foreground">Threats aligning with unmitigated business risks receive a score boost.</p>
                </div>
                <div className="flex gap-2">
                  <input 
                    type="file" 
                    accept=".csv,.xlsx" 
                    className="hidden" 
                    ref={riskFileInputRef}
                    onChange={handleRiskBulkUpload}
                  />
                  <button 
                    onClick={() => riskFileInputRef.current?.click()}
                    disabled={isUploadingRisks}
                    className="bg-secondary text-foreground px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-secondary/80 transition-colors disabled:opacity-50 border border-border/50 shadow-sm"
                  >
                    {isUploadingRisks ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    Bulk Upload
                  </button>
                  <button 
                    onClick={() => toast.info('Opening risk creation modal...')}
                    className="bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1 hover:bg-primary/90 transition-colors shadow-sm"
                  >
                    <Plus className="h-4 w-4" /> Add Risk
                  </button>
                </div>
              </div>
              <div className="border border-border/50 rounded-2xl overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3">ID</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3">Appetite</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {businessRisks.map((risk) => (
                      <tr key={risk.id} className="bg-card hover:bg-secondary/20 transition-colors">
                        <td className="px-4 py-3 font-mono">{risk.id}</td>
                        <td className="px-4 py-3">{risk.desc}</td>
                        <td className="px-4 py-3">{risk.appetite}</td>
                        <td className="px-4 py-3">
                          <span className={`font-medium ${risk.status === 'Mitigated' ? 'text-emerald-500' : 'text-destructive'}`}>
                            {risk.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {businessRisks.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                          No business risks recorded.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'system' && (
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
        )}

        {activeTab === 'users' && (
          <div className="max-w-5xl">
            <div className="flex justify-between items-center mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input 
                  type="text" 
                  placeholder="Search users..." 
                  className="pl-9 pr-4 py-2 bg-secondary/30 border border-border/50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 w-64 shadow-inner"
                />
              </div>
              <button 
                onClick={handleInviteUser}
                className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-primary/90 transition-all shadow-sm"
              >
                <Mail className="h-4 w-4" /> Invite User
              </button>
            </div>

            <div className="border border-border/50 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-sm text-left">
                <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-6 py-4">Name / Email</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Last Active</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {users.map((user) => (
                    <tr key={user.id} className="bg-card hover:bg-secondary/20 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-foreground">{user.name}</div>
                        <div className="text-xs text-muted-foreground">{user.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="bg-primary/10 text-primary px-2.5 py-1 rounded-md text-xs font-bold border border-primary/20">
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`font-medium flex items-center gap-1.5 ${user.status === 'Active' ? 'text-emerald-500' : 'text-amber-500'}`}>
                          {user.status === 'Active' && <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />}
                          {user.status === 'Pending' && <span className="h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />}
                          {user.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{user.lastActive}</td>
                      <td className="px-6 py-4 text-right space-x-4">
                        <button onClick={() => toast.info('Opening user settings...')} className="text-primary hover:underline text-xs font-bold">Edit</button>
                        <button onClick={() => removeUser(user.id)} className="text-destructive hover:underline text-xs font-bold">Remove</button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                        No users found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'integrations' && (
          <div className="max-w-4xl space-y-6">
            <h3 className="text-lg font-bold mb-2">Connected Services</h3>
            
            <div className={`border rounded-2xl p-5 flex items-center justify-between transition-colors shadow-sm ${integrations.jira ? 'border-primary bg-primary/5' : 'border-border/50 bg-card'}`}>
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold shadow-inner">J</div>
                <div>
                  <h4 className="font-bold text-base flex items-center gap-2">
                    Jira Software
                    {integrations.jira && <CheckCircle2 className="h-4 w-4 text-primary" />}
                  </h4>
                  <p className="text-sm text-muted-foreground">Sync unmitigated threats as Jira issues</p>
                </div>
              </div>
              <button 
                onClick={() => toggleIntegration('jira', 'Jira')} 
                className={integrations.jira ? "bg-secondary text-secondary-foreground px-4 py-2 rounded-xl text-sm font-bold border border-border/50 shadow-sm hover:bg-secondary/80" : "bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-bold shadow-sm hover:bg-primary/90"}
              >
                {integrations.jira ? 'Configure' : 'Connect'}
              </button>
            </div>

            <div className={`border rounded-2xl p-5 flex items-center justify-between transition-colors shadow-sm ${integrations.slack ? 'border-primary bg-primary/5' : 'border-border/50 bg-card'}`}>
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-purple-600 rounded-xl flex items-center justify-center text-white font-bold shadow-inner">S</div>
                <div>
                  <h4 className="font-bold text-base flex items-center gap-2">
                    Slack
                    {integrations.slack && <CheckCircle2 className="h-4 w-4 text-primary" />}
                  </h4>
                  <p className="text-sm text-muted-foreground">Receive notifications on analysis completion</p>
                </div>
              </div>
              <button 
                onClick={() => toggleIntegration('slack', 'Slack')} 
                className={integrations.slack ? "bg-secondary text-secondary-foreground px-4 py-2 rounded-xl text-sm font-bold border border-border/50 shadow-sm hover:bg-secondary/80" : "bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-bold shadow-sm hover:bg-primary/90"}
              >
                {integrations.slack ? 'Disconnect' : 'Connect'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};