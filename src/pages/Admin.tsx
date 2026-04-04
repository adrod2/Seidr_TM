import React, { useState } from 'react';
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
  CheckCircle2
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
  const [activeTab, setActiveTab] = useState('risk');
  
  // Interactive State
  const [isUploading, setIsUploading] = useState(false);
  const [documents, setDocuments] = useState([
    { id: 1, name: 'Cloud Security Standard 2026.pdf', chunks: 142 }
  ]);
  const [integrations, setIntegrations] = useState({
    jira: true,
    linear: false,
    slack: false
  });

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

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Administration</h2>
        <p className="text-muted-foreground text-sm mt-1">Manage users, global risk context, and system configuration.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none shrink-0 mb-4">
        <TabButton active={activeTab === 'risk'} onClick={() => setActiveTab('risk')} icon={Shield} label="Risk Context" />
        <TabButton active={activeTab === 'system'} onClick={() => setActiveTab('system')} icon={Database} label="System Context" />
        <TabButton active={activeTab === 'users'} onClick={() => setActiveTab('users')} icon={Users} label="User Management" />
        <TabButton active={activeTab === 'integrations'} onClick={() => setActiveTab('integrations')} icon={Settings2} label="Integrations" />
      </div>

      <div className="bg-card border border-border/50 rounded-3xl shadow-sm flex-1 overflow-y-auto p-6">
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
                <button 
                  onClick={() => toast.info('Opening risk creation modal...')}
                  className="bg-secondary text-secondary-foreground px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1"
                >
                  <Plus className="h-4 w-4" /> Add Risk
                </button>
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
                    <tr className="bg-card">
                      <td className="px-4 py-3 font-mono">BR-01</td>
                      <td className="px-4 py-3">Ransomware attack causing {'>'}24h downtime</td>
                      <td className="px-4 py-3">Conservative</td>
                      <td className="px-4 py-3"><span className="text-destructive font-medium">Unmitigated</span></td>
                    </tr>
                    <tr className="bg-card">
                      <td className="px-4 py-3 font-mono">BR-02</td>
                      <td className="px-4 py-3">Customer PII breach via web interface</td>
                      <td className="px-4 py-3">Minimal</td>
                      <td className="px-4 py-3"><span className="text-emerald-500 font-medium">Mitigated</span></td>
                    </tr>
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
                    <div key={doc.id} className="flex items-center justify-between p-3 border border-border/50 rounded-xl bg-card hover:border-primary/50 transition-colors">
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
          <div>
            {/* ... Existing User Tab Code ... */}
            <div className="flex justify-between items-center mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input 
                  type="text" 
                  placeholder="Search users..." 
                  className="pl-9 pr-4 py-2 bg-secondary/30 border border-border/50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 w-64"
                />
              </div>
              <button 
                onClick={() => toast.success('Invitation link sent successfully!')}
                className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-primary/90 transition-all"
              >
                <Plus className="h-4 w-4" /> Invite User
              </button>
            </div>

            <div className="border border-border/50 rounded-2xl overflow-hidden">
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
                  <tr className="bg-card">
                    <td className="px-6 py-4">
                      <div className="font-medium text-foreground">Jane Doe</div>
                      <div className="text-xs text-muted-foreground">jane.doe@example.com</div>
                    </td>
                    <td className="px-6 py-4"><span className="bg-primary/10 text-primary px-2 py-1 rounded text-xs font-semibold">Org Admin</span></td>
                    <td className="px-6 py-4"><span className="text-emerald-500 font-medium">Active</span></td>
                    <td className="px-6 py-4 text-muted-foreground">Just now</td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => toast.info('Opening user settings...')} className="text-primary hover:underline text-xs font-medium">Edit</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'integrations' && (
          <div className="max-w-4xl space-y-6">
            <h3 className="text-lg font-bold mb-2">Connected Services</h3>
            
            <div className={`border rounded-2xl p-5 flex items-center justify-between transition-colors ${integrations.jira ? 'border-primary bg-primary/5' : 'border-border/50'}`}>
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">J</div>
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
                className={integrations.jira ? "bg-secondary text-secondary-foreground px-4 py-2 rounded-lg text-sm font-medium" : "text-primary font-medium text-sm hover:underline"}
              >
                {integrations.jira ? 'Configure' : 'Connect'}
              </button>
            </div>

            <div className={`border rounded-2xl p-5 flex items-center justify-between transition-colors ${integrations.linear ? 'border-primary bg-primary/5' : 'border-border/50'}`}>
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">L</div>
                <div>
                  <h4 className="font-bold text-base flex items-center gap-2">
                    Linear
                    {integrations.linear && <CheckCircle2 className="h-4 w-4 text-primary" />}
                  </h4>
                  <p className="text-sm text-muted-foreground">Create Linear issues for mitigation actions</p>
                </div>
              </div>
              <button 
                onClick={() => toggleIntegration('linear', 'Linear')} 
                className={integrations.linear ? "bg-secondary text-secondary-foreground px-4 py-2 rounded-lg text-sm font-medium" : "text-primary font-medium text-sm hover:underline"}
              >
                {integrations.linear ? 'Disconnect' : 'Connect'}
              </button>
            </div>

            <div className={`border rounded-2xl p-5 flex items-center justify-between transition-colors ${integrations.slack ? 'border-primary bg-primary/5' : 'border-border/50'}`}>
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-purple-600 rounded-lg flex items-center justify-center text-white font-bold">S</div>
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
                className={integrations.slack ? "bg-secondary text-secondary-foreground px-4 py-2 rounded-lg text-sm font-medium" : "text-primary font-medium text-sm hover:underline"}
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