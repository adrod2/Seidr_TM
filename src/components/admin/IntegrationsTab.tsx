import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export const IntegrationsTab = () => {
  const [integrations, setIntegrations] = useState({
    jira: true,
    slack: false
  });

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
  );
};