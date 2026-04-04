import React, { useState } from 'react';
import { X, Send, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const CopilotSidebar = ({ isOpen, onClose, modelName }: any) => {
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([
    { id: 1, role: 'ai', content: 'Hi there! I generated this threat model. How can I help?' }
  ]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', content: chatInput }]);
    setChatInput('');
    setTimeout(() => {
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'ai', content: `Here is information on ${modelName}.` }]);
    }, 1000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 400, opacity: 1 }} exit={{ width: 0, opacity: 0 }} className="border-l border-border/50 bg-secondary/10 flex flex-col z-20 shrink-0 overflow-hidden shadow-2xl h-full">
          <div className="h-16 border-b border-border/50 flex items-center justify-between px-5 bg-card shadow-sm z-10 shrink-0">
            <div className="flex items-center gap-2 text-accent font-bold text-base"><Sparkles className="h-5 w-5" /> Copilot</div>
            <button onClick={onClose} className="p-2 text-muted-foreground hover:bg-secondary hover:text-foreground rounded-full transition-colors"><X className="h-5 w-5" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl p-4 text-sm shadow-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card border'}`}>{msg.content}</div>
              </div>
            ))}
          </div>
          <div className="p-4 bg-card border-t border-border/50 z-10 shrink-0">
            <form onSubmit={handleSendMessage} className="relative">
              <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Ask about this model..." className="w-full bg-secondary/30 border rounded-2xl pl-4 pr-12 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50" />
              <button type="submit" disabled={!chatInput.trim()} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-primary text-primary-foreground rounded-xl disabled:opacity-50 hover:bg-primary/90"><Send className="h-4 w-4" /></button>
            </form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};