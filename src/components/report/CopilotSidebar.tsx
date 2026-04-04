import React, { useState } from 'react';
import { X, Send, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CopilotSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  modelName: string;
}

export const CopilotSidebar = ({ isOpen, onClose, modelName }: CopilotSidebarProps) => {
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState([
    { id: 1, role: 'ai', content: 'Hi there! I generated this threat model. Would you like me to explain any specific threat or draft a Jira ticket for mitigation?' }
  ]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    
    const newMsg = { id: Date.now(), role: 'user', content: chatInput };
    setMessages(prev => [...prev, newMsg]);
    setChatInput('');
    setIsTyping(true);
    
    setTimeout(() => {
      setIsTyping(false);
      setMessages(prev => [...prev, { 
        id: Date.now() + 1, 
        role: 'ai', 
        content: `Based on my analysis of ${modelName || 'this architecture'}, the unauthenticated access vulnerability (T-001) occurs because the Kong API Gateway is not enforcing the JWT validation plugin on the protected routes. I recommend updating the Gateway declarative config.` 
      }]);
    }, 2000);
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
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                <div className="bg-card border border-border/50 rounded-2xl rounded-tl-sm p-4 shadow-sm flex gap-1.5 items-center">
                  <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </motion.div>
            )}
          </div>

          <div className="p-4 bg-card border-t border-border/50 z-10 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] shrink-0">
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
  );
};