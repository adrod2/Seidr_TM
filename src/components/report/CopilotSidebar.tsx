import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Sparkles, Terminal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CopilotSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  modelData: any;
}

export const CopilotSidebar = ({ isOpen, onClose, modelData }: CopilotSidebarProps) => {
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (modelData && messages.length === 0) {
      setMessages([
        { 
          id: 1, 
          role: 'ai', 
          content: `Hi there! I analyzed **${modelData.name || 'this architecture'}** and found ${modelData.threats?.length || 0} potential threats. Would you like me to explain the top risk or draft a Jira ticket for mitigation?` 
        }
      ]);
    }
  }, [modelData, messages.length]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    
    const userText = chatInput.trim();
    const newMsg = { id: Date.now(), role: 'user', content: userText };
    setMessages(prev => [...prev, newMsg]);
    setChatInput('');
    setIsTyping(true);
    
    // Simulate AI Contextual Response
    setTimeout(() => {
      setIsTyping(false);
      
      let aiResponse = "";
      const lowerInput = userText.toLowerCase();
      const topThreat = modelData?.threats?.[0] || { id: 'T-001', title: 'Generic Vulnerability', componentId: 'System' };
      
      if (lowerInput.includes('jira') || lowerInput.includes('ticket')) {
        aiResponse = `**Drafted Jira Ticket:**\n\n**Title:** [Security] Remediate ${topThreat.title} in ${topThreat.componentId}\n**Description:** Our automated STRIDE analysis identified a vulnerability where ${topThreat.description || 'controls are insufficient'}.\n**Acceptance Criteria:**\n- Mitigating controls implemented.\n- Verification tests pass.`;
      } else if (lowerInput.includes('explain') || lowerInput.includes('detail')) {
        aiResponse = `Let's look at **${topThreat.id}: ${topThreat.title}**. \n\nThis occurs in the **${topThreat.componentId}** component. Because it handles sensitive data without strict trust boundaries, an attacker could exploit this to compromise the system. To fix this, you should implement the mitigations listed in the Action Plan tab.`;
      } else if (lowerInput.includes('fix') || lowerInput.includes('mitigate')) {
        aiResponse = `To fix the vulnerabilities in ${topThreat.componentId}, I recommend standardizing your input validation and ensuring mutual TLS (mTLS) is enforced between internal components. Would you like me to generate a Terraform snippet for the mTLS policy?`;
      } else {
        aiResponse = `Based on the system context provided, I recommend prioritizing the Critical and High severity threats first. The risk score is currently ${modelData?.riskScore || 0}. Is there a specific component you are concerned about?`;
      }

      setMessages(prev => [...prev, { 
        id: Date.now() + 1, 
        role: 'ai', 
        content: aiResponse 
      }]);
    }, 1800);
  };

  const renderMessageContent = (content: string) => {
    // Simple markdown-lite rendering for bolding and line breaks
    return content.split('\n').map((line, i) => {
      const parts = line.split(/(\*\*.*?\*\*)/g);
      return (
        <React.Fragment key={i}>
          {parts.map((part, j) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={j} className="font-bold">{part.slice(2, -2)}</strong>;
            }
            return part;
          })}
          {i < content.split('\n').length - 1 && <br />}
        </React.Fragment>
      );
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 400, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="border-l border-border/50 bg-secondary/10 flex flex-col z-20 shrink-0 overflow-hidden shadow-2xl h-full"
        >
          <div className="h-16 border-b border-border/50 flex items-center justify-between px-5 bg-card shadow-sm z-10 shrink-0">
            <div className="flex items-center gap-2 text-accent font-bold text-base">
              <div className="bg-accent/10 p-1.5 rounded-lg">
                <Sparkles className="h-5 w-5" />
              </div>
              Seidr Copilot
            </div>
            <button 
              onClick={onClose}
              className="p-2 text-muted-foreground hover:bg-secondary hover:text-foreground rounded-full transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-6 scroll-smooth">
            {messages.map(msg => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={msg.id} 
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'ai' && (
                  <div className="h-8 w-8 rounded-full bg-accent/20 flex items-center justify-center text-accent mr-2 flex-shrink-0 mt-auto mb-1 border border-accent/20">
                    <Terminal className="h-4 w-4" />
                  </div>
                )}
                <div className={`max-w-[85%] rounded-2xl p-4 text-sm shadow-sm leading-relaxed ${
                  msg.role === 'user' 
                    ? 'bg-primary text-primary-foreground rounded-br-sm' 
                    : 'bg-card border border-border/50 rounded-bl-sm text-foreground'
                }`}>
                  {renderMessageContent(msg.content)}
                </div>
              </motion.div>
            ))}
            {isTyping && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                 <div className="h-8 w-8 rounded-full bg-accent/20 flex items-center justify-center text-accent mr-2 flex-shrink-0 mt-auto mb-1 border border-accent/20">
                    <Terminal className="h-4 w-4" />
                  </div>
                <div className="bg-card border border-border/50 rounded-2xl rounded-bl-sm p-4 shadow-sm flex gap-1.5 items-center">
                  <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </motion.div>
            )}
          </div>

          <div className="p-4 bg-card border-t border-border/50 z-10 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] shrink-0">
            <div className="flex gap-2 mb-3 overflow-x-auto pb-2 scrollbar-none px-1">
              {['Draft Jira Ticket', 'Explain highest risk', 'Suggest fixes'].map(suggestion => (
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
  );
};