import React, { useState } from 'react';
import { Search, Mail, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';

export const UserManagementTab = () => {
  const users = useLiveQuery(() => db.users.toArray());
  const [isInviting, setIsInviting] = useState(false);

  const handleInviteUser = async () => {
    setIsInviting(true);
    toast.info('Sending invitation...');
    
    setTimeout(async () => {
      await db.users.add({
        id: Date.now(),
        name: 'New User',
        email: `new.user${users?.length || 0}@example.com`,
        role: 'Viewer',
        status: 'Pending',
        lastActive: 'Never'
      });
      setIsInviting(false);
      toast.success('Invitation sent successfully!');
    }, 1000);
  };

  const removeUser = async (id: number) => {
    await db.users.delete(id);
    toast.success('User removed from organization.');
  };

  if (users === undefined) return <div className="p-4 flex justify-center"><Loader2 className="animate-spin h-6 w-6 text-primary" /></div>;

  return (
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
          disabled={isInviting}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-primary/90 transition-all shadow-sm disabled:opacity-50"
        >
          {isInviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} 
          Invite User
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
  );
};