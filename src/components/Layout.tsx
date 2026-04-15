"use client";

import React, { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { 
  ShieldAlert, 
  PlusCircle, 
  List, 
  Settings,
  Menu,
  Bell,
  Search,
  BookOpen,
  Check,
  CheckCircle2,
  AlertTriangle,
  Info
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';

const Sidebar = () => {
  const navItems = [
    { icon: BookOpen, label: 'Instructions', path: '/' },
    { icon: PlusCircle, label: 'New Model', path: '/models/new' },
    { icon: List, label: 'Threat Models', path: '/models' },
    { icon: Settings, label: 'Administration', path: '/admin' },
  ];

  return (
    <div className="w-64 bg-card border-r flex flex-col h-full shadow-sm">
      <div className="h-16 flex items-center px-6 border-b border-border/50">
        <ShieldAlert className="h-8 w-8 text-primary mr-3" />
        <span className="font-bold text-xl tracking-tight">Seidr</span>
      </div>
      
      <div className="flex-1 py-6 flex flex-col gap-2 px-4">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 ${
                isActive && (item.path === '/' ? location.pathname === '/' : true)
                  ? 'bg-primary/10 text-primary font-medium' 
                  : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
              }`
            }
            end={item.path === '/'}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}
      </div>
      
      <div className="p-4 border-t border-border/50">
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-secondary/30">
          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
            JD
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium">Jane Doe</span>
            <span className="text-xs text-muted-foreground">Org Admin</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Notifications State
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  
  const [notifications, setNotifications] = useState([
    { id: 1, title: 'Analysis Complete', message: 'Threat model generation for Payment Gateway API finished successfully.', time: '5m ago', unread: true, type: 'success' },
    { id: 2, title: 'Jira Sync Successful', message: '12 mitigation tasks have been pushed to Jira.', time: '1h ago', unread: true, type: 'info' },
    { id: 3, title: 'High Risk Alert', message: 'A Critical severity threat was found in Core Database.', time: '2h ago', unread: false, type: 'warning' }
  ]);

  const unreadCount = notifications.filter(n => n.unread).length;

  // Handle clicking outside of dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Query database dynamically based on search input
  const searchResults = useLiveQuery(
    () => {
      if (!searchQuery.trim()) return [];
      const query = searchQuery.toLowerCase();
      return db.threatModels
        .filter(m => m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query))
        .limit(5)
        .toArray();
    },
    [searchQuery]
  );
  
  const getTitle = () => {
    const path = location.pathname;
    if (path === '/') return 'Instructions & Guide';
    if (path.startsWith('/models/new')) return 'New Threat Model';
    if (path.startsWith('/models/') && path !== '/models') return 'Threat Report';
    if (path === '/models') return 'Threat Models';
    if (path === '/admin') return 'Administration';
    return 'Seidr';
  };

  const handleSelectResult = (id: string) => {
    setIsSearchOpen(false);
    setSearchQuery('');
    navigate(`/models/${id}`);
  };

  const markAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, unread: false })));
  };

  return (
    <header className="h-16 bg-background/80 backdrop-blur-md border-b flex items-center justify-between px-8 sticky top-0 z-10">
      <div className="flex items-center gap-4">
        <button className="md:hidden p-2 text-muted-foreground hover:text-foreground">
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-semibold">{getTitle()}</h1>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="relative hidden md:block" ref={searchRef}>
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsSearchOpen(true);
            }}
            onFocus={() => setIsSearchOpen(true)}
            placeholder="Search models..."
            className="h-9 pl-9 pr-4 rounded-full bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all w-64 shadow-inner"
          />
          
          {/* Search Results Dropdown */}
          {isSearchOpen && searchQuery.trim() && (
            <div className="absolute top-full mt-2 w-full bg-card border border-border/50 rounded-2xl shadow-xl overflow-hidden z-50">
              {searchResults === undefined ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Searching...</div>
              ) : searchResults.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">No models found.</div>
              ) : (
                <div className="flex flex-col max-h-72 overflow-y-auto">
                  {searchResults.map(model => (
                    <button
                      key={model.id}
                      onClick={() => handleSelectResult(model.id)}
                      className="text-left px-4 py-3 hover:bg-secondary/50 transition-colors border-b border-border/50 last:border-0 flex flex-col group"
                    >
                      <span className="font-bold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                        {model.name}
                      </span>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded border border-border/50">
                          {model.id}
                        </span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          model.riskScore >= 80 ? 'text-destructive bg-destructive/10' :
                          model.riskScore >= 50 ? 'text-amber-500 bg-amber-500/10' :
                          'text-emerald-500 bg-emerald-500/10'
                        }`}>
                          Risk: {model.riskScore}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        
        <ThemeToggle />
        
        <div className="relative" ref={notifRef}>
          <button 
            onClick={() => setIsNotifOpen(!isNotifOpen)}
            className={`p-2 rounded-full transition-colors relative ${isNotifOpen ? 'bg-secondary/80 text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-destructive"></span>
            )}
          </button>

          {isNotifOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border/50 rounded-3xl shadow-xl overflow-hidden z-50">
              <div className="p-4 border-b border-border/50 flex justify-between items-center bg-secondary/30">
                <h3 className="font-bold text-sm">Notifications <span className="ml-1 text-xs text-muted-foreground font-normal">({unreadCount} unread)</span></h3>
                {unreadCount > 0 && (
                  <button onClick={markAllAsRead} className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                    <Check className="h-3.5 w-3.5" /> Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">You're all caught up!</div>
                ) : (
                  <div className="flex flex-col">
                    {notifications.map(n => (
                      <div 
                        key={n.id} 
                        className={`p-4 border-b border-border/50 last:border-0 hover:bg-secondary/20 transition-colors flex gap-3 ${n.unread ? 'bg-primary/5' : ''}`}
                      >
                        <div className="mt-0.5 flex-shrink-0">
                          {n.type === 'success' && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                          {n.type === 'warning' && <AlertTriangle className="h-5 w-5 text-amber-500" />}
                          {n.type === 'info' && <Info className="h-5 w-5 text-blue-500" />}
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between items-start gap-2">
                            <h4 className={`text-sm font-bold mb-0.5 ${n.unread ? 'text-foreground' : 'text-muted-foreground'}`}>{n.title}</h4>
                            {n.unread && <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1"></span>}
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{n.message}</p>
                          <span className="text-[10px] font-medium text-muted-foreground mt-2 block">{n.time}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-2 bg-secondary/30 border-t border-border/50 text-center">
                <button className="text-xs font-bold text-muted-foreground hover:text-foreground p-2 w-full rounded-xl transition-colors">
                  View full history
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export const Layout = () => {
  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden print:h-auto print:overflow-visible print:bg-white">
      <div className="print:hidden flex-shrink-0">
        <Sidebar />
      </div>
      <div className="flex-1 flex flex-col h-full overflow-hidden print:overflow-visible">
        <div className="print:hidden">
          <Header />
        </div>
        <main className="flex-1 overflow-y-auto p-8 print:p-0 print:overflow-visible print:bg-white">
          <div className="max-w-7xl mx-auto h-full print:h-auto print:max-w-none print:w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};