import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { 
  ShieldAlert, 
  GitMerge, 
  CheckSquare, 
  FileCheck,
  AlertTriangle,
  Download,
  Share2,
  Filter,
  X,
  Send,
  Sparkles,
  CheckCircle2,
  ThumbsDown,
  Server,
  Database,
  Globe,
  Smartphone,
  Lock
} from 'lucide-react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';

// --- Custom C4 Node Component ---
const C4Node = ({ data }: any) => {
  const Icon = data.icon || Server;
  
  return (
    <div className={`px-4 py-3 shadow-lg rounded-2xl border-2 min-w-[180px] ${data.containerStyle}`}>
      <Handle type="target" position={Position.Top} className="w-2 h-2 bg-muted-foreground border-none" />
      <div className="flex flex-col items-center text-center">
        <div className={`p-2 rounded-xl mb-2 ${data.iconBg}`}>
          <Icon className={`h-6 w-6 ${data.iconColor}`} />
        </div>
        <h3 className="font-bold text-sm text-foreground">{data.label}</h3>
        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mt-1">[{data.type}]</p>
        <p className="text-xs text-muted-foreground mt-2 max-w-[160px] leading-tight">{data.description}</p>
      </div>
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 bg-muted-foreground border-none" />
    </div>
  );
};

// --- Initial Diagram Data ---
const initialNodes = [
  { 
    id: '1', 
    type: 'c4Node',
    position: { x: 250, y: 50 }, 
    data: { 
      label: 'Customer', 
      type: 'Person', 
      description: 'A customer of the platform.',
      icon: Smartphone,
      containerStyle: 'bg-card border-border',
      iconBg: 'bg-primary/10',
      iconColor: 'text-primary'
    } 
  },
  { 
    id: '2', 
    type: 'c4Node',
    position: { x: 250, y: 250 }, 
    data: { 
      label: 'Web Application', 
      type: 'Container: Next.js', 
      description: 'Delivers the SPA and handles SSR.',
      icon: Globe,
      containerStyle: 'bg-card border-primary/50',
      iconBg: 'bg-primary',
      iconColor: 'text-primary-foreground'
    } 
  },
  { 
    id: '3', 
    type: 'c4Node',
    position: { x: 50, y: 450 }, 
    data: { 
      label: 'API Gateway', 
      type: 'Container: Kong', 
      description: 'Routes traffic and enforces rate limits.',
      icon: Server,
      containerStyle: 'bg-destructive/5 border-destructive', // Highlighted as vulnerable
      iconBg: 'bg-destructive/20',
      iconColor: 'text-destructive'
    } 
  },
  { 
    id: '4', 
    type: 'c4Node',
    position: { x: 450, y: 450 }, 
    data: { 
      label: 'Auth Service', 
      type: 'Container: Node.js', 
      description: 'Issues JWTs and validates users.',
      icon: Lock,
      containerStyle: 'bg-card border-border',
      iconBg: 'bg-amber-500/20',
      iconColor: 'text-amber-500'
    } 
  },
  { 
    id: '5', 
    type: 'c4Node',
    position: { x: 50, y: 650 }, 
    data: { 
      label: 'Primary Database', 
      type: 'Container: PostgreSQL', 
      description: 'Stores user and transaction data.',
      icon: Database,
      containerStyle: 'bg-card border-border',
      iconBg: 'bg-emerald-500/20',
      iconColor: 'text-emerald-500'
    } 
  },
];

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2', label: 'Visits via HTTPS', type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e2-3', source: '2', target: '3', label: 'REST API Calls', animated: true, style: { stroke: '#ef4444', strokeWidth: 2 }, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed, color: '#ef4444' } },
  { id: 'e2-4', source: '2', target: '4', label: 'Authenticates via OIDC', type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e3-5', source: '3', target: '5', label: 'Reads/Writes TCP/5432', type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } },
];

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

export const Report = () => {
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState('threats');
  
  // AI Copilot State
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([
    { id: 1, role: 'ai', content: 'Hi there! I generated this threat model for the Core Payments API. Would you like me to explain any specific threat or draft a Jira ticket for mitigation?' }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  
  const nodeTypes = useMemo(() => ({ c4Node: C4Node }), []);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    
    const newMsg = { id: Date.now(), role: 'user', content: chatInput };
    setMessages(prev => [...prev, newMsg]);
    setChatInput('');
    setIsTyping(true);
    
    // Simulate smart AI response
    setTimeout(() => {
      setIsTyping(false);
      setMessages(prev => [...prev, { 
        id: Date.now() + 1, 
        role: 'ai', 
        content: `Based on my analysis of the architecture, the unauthenticated access vulnerability (T-001) occurs because the Kong API Gateway is not enforcing the JWT validation plugin on the \`/process-payment\` route. I recommend updating the Gateway declarative config and verifying the routing logic in the Next.js frontend.` 
      }]);
    }, 2000);
  };

  const threatCatalog = [
    { id: 'T-001', title: 'Unauthenticated API Access to Payment Gateway', category: 'Spoofing', component: 'API Gateway', severity: 'Critical', score: 9.2, expanded: true },
    { id: 'T-002', title: 'SQL Injection in Transaction Query', category: 'Tampering', component: 'Primary DB', severity: 'High', score: 8.5, expanded: false },
    { id: 'T-003', title: 'Cleartext Transmission of PII Data', category: 'Info Disclosure', component: 'Internal Network', severity: 'High', score: 7.8, expanded: false },
    { id: 'T-004', title: 'Lack of Rate Limiting on Login', category: 'DoS', component: 'Auth Service', severity: 'Medium', score: 5.4, expanded: false },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] relative">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-2xl font-bold">Core Payments API</h2>
            <span className="bg-destructive/10 text-destructive text-xs font-bold px-2.5 py-1 rounded-full border border-destructive/20">
              Risk: High (78)
            </span>
          </div>
          <p className="text-muted-foreground text-sm flex items-center gap-2">
            Model ID: {id} <span className="px-1">•</span> Generated: April 12, 2026
          </p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsCopilotOpen(true)}
            className="bg-accent/10 text-accent px-4 py-2 rounded-xl font-medium text-sm flex items-center gap-2 hover:bg-accent/20 transition-all border border-accent/20 shadow-sm"
          >
            <Sparkles className="h-4 w-4" />
            AI Copilot
          </button>
          <button className="bg-secondary/50 text-foreground px-4 py-2 rounded-xl font-medium text-sm flex items-center gap-2 hover:bg-secondary transition-all">
            <Share2 className="h-4 w-4" />
            Share
          </button>
          <button className="bg-primary text-primary-foreground px-4 py-2 rounded-xl font-medium text-sm flex items-center gap-2 hover:bg-primary/90 transition-all shadow-sm">
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none shrink-0">
        <TabButton active={activeTab === 'threats'} onClick={() => setActiveTab('threats')} icon={ShieldAlert} label="Threat Catalog" />
        <TabButton active={activeTab === 'c4'} onClick={() => setActiveTab('c4')} icon={GitMerge} label="C4 Architecture" />
        <TabButton active={activeTab === 'mitigations'} onClick={() => setActiveTab('mitigations')} icon={CheckSquare} label="Mitigation Plan" />
        <TabButton active={activeTab === 'compliance'} onClick={() => setActiveTab('compliance')} icon={FileCheck} label="Compliance" />
      </div>

      <div className="bg-card border border-border/50 rounded-3xl shadow-sm flex-1 mt-4 overflow-hidden flex">
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {activeTab === 'threats' && (
            <div className="flex-1 flex flex-col overflow-hidden bg-secondary/10">
              <div className="p-4 border-b border-border/50 flex justify-between items-center bg-card">
                <div className="flex gap-2">
                  <select className="bg-secondary/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                    <option>All Categories</option>
                    <option>Spoofing</option>
                    <option>Tampering</option>
                    <option>Information Disclosure</option>
                  </select>
                  <select className="bg-secondary/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                    <option>All Severities</option>
                    <option>Critical</option>
                    <option>High</option>
                    <option>Medium</option>
                  </select>
                </div>
                <button className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm bg-secondary/50 px-3 py-1.5 rounded-lg border border-border/50">
                  <Filter className="h-4 w-4" /> Filter
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {threatCatalog.map(threat => (
                  <div key={threat.id} className="border border-border/50 rounded-2xl p-5 hover:border-primary/50 transition-colors flex flex-col gap-4 group bg-card shadow-sm hover:shadow-md">
                    <div className="flex gap-4">
                      <div className={`mt-1 flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${
                        threat.severity === 'Critical' ? 'bg-destructive/10 text-destructive' : 
                        threat.severity === 'High' ? 'bg-orange-500/10 text-orange-500' :
                        'bg-amber-500/10 text-amber-500'
                      }`}>
                        <AlertTriangle className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start mb-1">
                          <h4 className="font-bold text-base">{threat.title}</h4>
                          <span className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-1 rounded-md border border-border/50">{threat.id}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground mb-3">
                          <span className="bg-secondary px-2 py-0.5 rounded-md text-xs font-medium text-foreground">{threat.category}</span>
                          <span className="flex items-center gap-1"><Server className="h-3.5 w-3.5"/> {threat.component}</span>
                          <span>CVSS Score: <span className="font-medium text-foreground">{threat.score}</span></span>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          An attacker could bypass authentication checks on the /process-payment endpoint due to missing JWT validation in the API Gateway middleware, leading to unauthorized transactions.
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex justify-end gap-2 border-t border-border/50 pt-4 mt-2">
                      <button className="text-xs font-medium px-4 py-2 rounded-xl border border-border/50 hover:bg-secondary/50 flex items-center gap-1.5 transition-colors text-muted-foreground hover:text-foreground">
                        <ThumbsDown className="h-3.5 w-3.5" /> False Positive
                      </button>
                      <button className="text-xs font-medium px-4 py-2 rounded-xl border border-border/50 hover:bg-secondary/50 flex items-center gap-1.5 transition-colors text-muted-foreground hover:text-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Accept Risk
                      </button>
                      <button className="text-xs font-medium px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 transition-colors shadow-sm">
                        <ShieldAlert className="h-3.5 w-3.5" /> Create Mitigation
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'c4' && (
            <div className="flex-1 relative bg-secondary/10">
              <div className="absolute top-4 left-4 z-10 flex gap-2">
                <button className="bg-card border border-border/50 shadow-sm px-4 py-2 rounded-xl text-sm font-medium hover:bg-secondary/50 transition-colors">L1 Context</button>
                <button className="bg-primary text-primary-foreground shadow-sm px-4 py-2 rounded-xl text-sm font-medium">L2 Container</button>
                <button className="bg-card border border-border/50 shadow-sm px-4 py-2 rounded-xl text-sm font-medium hover:bg-secondary/50 transition-colors">L3 Component</button>
              </div>
              <div className="absolute top-4 right-4 z-10">
                <div className="bg-card/80 backdrop-blur-md border border-border/50 shadow-sm p-3 rounded-xl text-xs flex flex-col gap-2">
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-destructive/80"></div> Vulnerability Found</div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-primary/80"></div> External Component</div>
                </div>
              </div>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                fitView
                attributionPosition="bottom-right"
              >
                <Background className="opacity-20" color="hsl(var(--muted-foreground))" gap={20} size={1} />
                <Controls className="bg-card border-border/50 fill-foreground shadow-md rounded-xl overflow-hidden" />
              </ReactFlow>
            </div>
          )}

          {activeTab === 'mitigations' && (
            <div className="flex-1 overflow-y-auto p-6 bg-secondary/10">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold">Mitigation Action Plan</h3>
                <button className="text-sm font-medium bg-secondary border border-border/50 px-4 py-2 rounded-xl hover:bg-secondary/80 transition-colors">
                  Sync to Jira
                </button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100%-4rem)]">
                {/* Kanban-style Columns */}
                {['Open', 'In Progress', 'Done'].map(status => (
                  <div key={status} className="flex flex-col bg-card/50 border border-border/50 rounded-3xl p-4">
                    <h4 className="font-bold text-sm mb-4 text-muted-foreground uppercase tracking-wider px-2">{status}</h4>
                    <div className="flex-1 space-y-4">
                      {[
                        { id: 'ACT-001', threatId: 'T-001', title: 'Implement JWT Validation Middleware', effort: 'Medium', status: 'Open', controls: ['AC-2', 'IA-2'] },
                        { id: 'ACT-002', threatId: 'T-002', title: 'Migrate to Parameterized Queries ORM', effort: 'High', status: 'In Progress', controls: ['SI-10'] },
                        { id: 'ACT-003', threatId: 'T-003', title: 'Enforce TLS 1.3 for Internal Traffic', effort: 'Low', status: 'Done', controls: ['SC-8'] },
                      ].filter(a => a.status === status).map(action => (
                        <div key={action.id} className="bg-background border border-border/50 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow cursor-grab">
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md">{action.id}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              action.effort === 'High' ? 'bg-destructive/10 text-destructive' :
                              action.effort === 'Medium' ? 'bg-amber-500/10 text-amber-500' :
                              'bg-emerald-500/10 text-emerald-500'
                            }`}>
                              {action.effort} Effort
                            </span>
                          </div>
                          <h5 className="font-bold text-sm mb-2">{action.title}</h5>
                          <p className="text-xs text-muted-foreground mb-4">Fixes {action.threatId}</p>
                          
                          <div className="flex gap-1 flex-wrap">
                            {action.controls.map(c => (
                              <span key={c} className="bg-secondary border border-border/50 px-1.5 py-0.5 rounded text-[10px] font-medium text-muted-foreground">{c}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'compliance' && (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-3 gap-6 mb-8">
                <div className="bg-card p-6 rounded-3xl border border-border/50 text-center shadow-sm">
                  <div className="text-5xl font-bold text-primary mb-2">92%</div>
                  <div className="text-sm font-medium text-muted-foreground">Overall Compliance Score</div>
                </div>
                <div className="bg-card p-6 rounded-3xl border border-border/50 text-center shadow-sm">
                  <div className="text-5xl font-bold text-emerald-500 mb-2">45/50</div>
                  <div className="text-sm font-medium text-muted-foreground">Mandatory Controls Met</div>
                </div>
                <div className="bg-destructive/5 p-6 rounded-3xl border border-destructive/20 text-center shadow-sm">
                  <div className="text-5xl font-bold text-destructive mb-2">3</div>
                  <div className="text-sm font-medium text-destructive/80">Critical Gaps Remaining</div>
                </div>
              </div>

              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold">Control Status (NIST SP 800-53)</h3>
                <button className="text-sm font-medium text-primary hover:underline">View All Controls</button>
              </div>
              <div className="border border-border/50 rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-4 font-medium">Control ID</th>
                        <th className="px-6 py-4 font-medium">Title</th>
                        <th className="px-6 py-4 font-medium">Category</th>
                        <th className="px-6 py-4 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      <tr className="bg-card hover:bg-secondary/20 transition-colors">
                        <td className="px-6 py-4 font-mono font-bold text-foreground">AC-2</td>
                        <td className="px-6 py-4">Account Management</td>
                        <td className="px-6 py-4 text-muted-foreground">Access Control</td>
                        <td className="px-6 py-4"><span className="text-destructive font-bold bg-destructive/10 px-2.5 py-1 rounded-full text-xs">Gap Identified</span></td>
                      </tr>
                      <tr className="bg-card hover:bg-secondary/20 transition-colors">
                        <td className="px-6 py-4 font-mono font-bold text-foreground">IA-2</td>
                        <td className="px-6 py-4">Identification and Authentication</td>
                        <td className="px-6 py-4 text-muted-foreground">Access Control</td>
                        <td className="px-6 py-4"><span className="text-emerald-500 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-full text-xs">Control Met</span></td>
                      </tr>
                      <tr className="bg-card hover:bg-secondary/20 transition-colors">
                        <td className="px-6 py-4 font-mono font-bold text-foreground">SC-8</td>
                        <td className="px-6 py-4">Transmission Confidentiality</td>
                        <td className="px-6 py-4 text-muted-foreground">System & Comm Protection</td>
                        <td className="px-6 py-4"><span className="text-amber-500 font-bold bg-amber-500/10 px-2.5 py-1 rounded-full text-xs">Partially Met</span></td>
                      </tr>
                    </tbody>
                  </table>
              </div>
            </div>
          )}
        </div>

        {/* AI Copilot Slide-over Panel */}
        <AnimatePresence>
          {isCopilotOpen && (
            <motion.div 
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 400, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="border-l border-border/50 bg-secondary/10 flex flex-col z-20 shrink-0 overflow-hidden shadow-2xl"
            >
              <div className="h-16 border-b border-border/50 flex items-center justify-between px-5 bg-card shadow-sm z-10">
                <div className="flex items-center gap-2 text-accent font-bold text-base">
                  <div className="bg-accent/10 p-1.5 rounded-lg">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  Seidr Copilot
                </div>
                <button 
                  onClick={() => setIsCopilotOpen(false)}
                  className="p-2 text-muted-foreground hover:bg-secondary hover:text-foreground rounded-full transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                {messages.map(msg => (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={msg.id} 
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] rounded-2xl p-4 text-sm shadow-sm leading-relaxed ${
                      msg.role === 'user' 
                        ? 'bg-primary text-primary-foreground rounded-tr-sm' 
                        : 'bg-card border border-border/50 rounded-tl-sm text-foreground'
                    }`}>
                      {msg.content}
                    </div>
                  </motion.div>
                ))}
                {isTyping && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex justify-start"
                  >
                    <div className="bg-card border border-border/50 rounded-2xl rounded-tl-sm p-4 shadow-sm flex gap-1.5 items-center">
                      <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </motion.div>
                )}
              </div>

              <div className="p-4 bg-card border-t border-border/50 z-10 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]">
                <div className="flex gap-2 mb-3 overflow-x-auto pb-2 scrollbar-none px-1">
                  {['Explain T-001', 'Draft Jira Ticket', 'Fix SC-8 Gap'].map(suggestion => (
                    <button 
                      key={suggestion}
                      type="button"
                      onClick={() => setChatInput(suggestion)}
                      className="whitespace-nowrap text-xs font-medium bg-background text-muted-foreground hover:text-foreground hover:bg-secondary/80 px-3.5 py-2 rounded-full border border-border/50 transition-colors shadow-sm"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
                <form onSubmit={handleSendMessage} className="relative">
                  <input 
                    type="text" 
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask about this model..." 
                    className="w-full bg-secondary/30 border border-border/50 rounded-2xl pl-4 pr-12 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 shadow-inner"
                  />
                  <button 
                    type="submit"
                    disabled={!chatInput.trim()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-primary text-primary-foreground rounded-xl disabled:opacity-50 transition-all hover:bg-primary/90 shadow-sm"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};