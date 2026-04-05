import React from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';

export const IntegrationsTab = () => {
  const integrations = useLiveQuery(() => db.integrations.toArray());

  const getStatus = (id: string) => {
    const item = integrations?.find(i => i.id === id);
    return item ? item.connected : false;
  };

  const toggleIntegration = async (id: string, name: string) => {
    const isConnecting = !getStatus(id);
    if (isConnecting) {
      toast.promise(new Promise(r => setTimeout(r, 1500)), {
        loading: `Authenticating with ${name}...`,
        success: () => {
          db.integrations.put({ id, connected: true });
          return `${name} connected successfully!`;
        }
      });
    } else {
      await db.integrations.put({ id, connected: false });
      toast.info(`${name} disconnected.`);
    }
  };

  if (integrations === undefined) return <div className="p-4 flex justify-center"><Loader2 className="animate-spin h-6 w-6 text-primary" /></div>;

  return (
    <div className="max-w-4xl space-y-6">
      <h3 className="text-lg font-bold mb-2">Connected Services</h3>
      
      <div className={`border rounded-2xl p-5 flex items-center justify-between transition-colors shadow-sm ${getStatus('jira') ? 'border-primary bg-primary/5' : 'border-border/50 bg-card'}`}>
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold shadow-inner">J</div>
          <div>
            <h4 className="font-bold text-base flex items-center gap-2">
              Jira Software
              {getStatus('jira') && <CheckCircle2 className="h-4 w-4 text-primary" />}
            </h4>
            <p className="text-sm text-muted-foreground">Sync unmitigated threats as Jira issues</p>
          </div>
        </div>
        <button 
          onClick={() => toggleIntegration('jira', 'Jira')} 
          className={getStatus('jira') ? "bg-secondary text-secondary-foreground px-4 py-2 rounded-lg text-sm font-medium shadow-sm hover:bg-secondary/80" : "bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium shadow-sm hover:bg-primary/90"}
        >
          {getStatus('jira') ? 'Configure' : 'Connect'}
        </button>
      </div>

      <div className={`border rounded-2xl p-5 flex items-center justify-between transition-colors shadow-sm ${getStatus('slack') ? 'border-primary bg-primary/5' : 'border-border/50 bg-card'}`}>
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 bg-purple-600 rounded-xl flex items-center justify-center text-white font-bold shadow-inner">S</div>
          <div>
            <h4 className="font-bold text-base flex items-center gap-2">
              Slack
              {getStatus('slack') && <CheckCircle2 className="h-4 w-4 text-primary" />}
            </h4>
            <p className="text-sm text-muted-foreground">Receive notifications on analysis completion</p>
          </div>
        </div>
        <button 
          onClick={() => toggleIntegration('slack', 'Slack')} 
          className={getStatus('slack') ? "bg-secondary text-secondary-foreground px-4 py-2 rounded-lg text-sm font-medium shadow-sm hover:bg-secondary/80" : "bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium shadow-sm hover:bg-primary/90"}
        >
          {getStatus('slack') ? 'Disconnect' : 'Connect'}
        </button>
      </div>
    </div>
  );
};