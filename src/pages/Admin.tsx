import React, { useState } from 'react';
import { Users, Shield, Database, Settings2, BrainCircuit } from 'lucide-react';
import { AiConfigTab } from '../components/admin/AiConfigTab';
import { RiskContextTab } from '../components/admin/RiskContextTab';
import { SystemContextTab } from '../components/admin/SystemContextTab';
import { UserManagementTab } from '../components/admin/UserManagementTab';
import { IntegrationsTab } from '../components/admin/IntegrationsTab';

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
        {activeTab === 'ai-config' && <AiConfigTab />}
        {activeTab === 'risk' && <RiskContextTab />}
        {activeTab === 'system' && <SystemContextTab />}
        {activeTab === 'users' && <UserManagementTab />}
        {activeTab === 'integrations' && <IntegrationsTab />}
      </div>
    </div>
  );
};