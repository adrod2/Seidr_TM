import React, { useState } from 'react';
import { Users, Database, Settings2, BrainCircuit, HardDrive, LayoutDashboard } from 'lucide-react';
import { AiConfigTab } from '../components/admin/AiConfigTab';
import { SystemContextTab } from '../components/admin/SystemContextTab';
import { UserManagementTab } from '../components/admin/UserManagementTab';
import { IntegrationsTab } from '../components/admin/IntegrationsTab';
import { DataManagementTab } from '../components/admin/DataManagementTab';
import { Dashboard } from './Dashboard';
import { TabButton } from '../components/TabButton';

export const Admin = () => {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Administration</h2>
        <p className="text-muted-foreground text-sm mt-1">Manage users, system context, and configuration.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none shrink-0 mb-4">
        <TabButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={LayoutDashboard} label="Dashboard" />
        <TabButton active={activeTab === 'ai-config'} onClick={() => setActiveTab('ai-config')} icon={BrainCircuit} label="AI Models" />
        <TabButton active={activeTab === 'system'} onClick={() => setActiveTab('system')} icon={Database} label="System Context" />
        <TabButton active={activeTab === 'users'} onClick={() => setActiveTab('users')} icon={Users} label="User Management" />
        <TabButton active={activeTab === 'integrations'} onClick={() => setActiveTab('integrations')} icon={Settings2} label="Integrations" />
        <TabButton active={activeTab === 'data'} onClick={() => setActiveTab('data')} icon={HardDrive} label="Data Management" />
      </div>

      <div className="bg-card border border-border/50 rounded-3xl shadow-sm flex-1 overflow-y-auto p-6">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'ai-config' && <AiConfigTab />}
        {activeTab === 'system' && <SystemContextTab />}
        {activeTab === 'users' && <UserManagementTab />}
        {activeTab === 'integrations' && <IntegrationsTab />}
        {activeTab === 'data' && <DataManagementTab />}
      </div>
    </div>
  );
};