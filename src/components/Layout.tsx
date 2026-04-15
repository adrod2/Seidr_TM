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
  BookOpen
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

  // Close search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
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
        <button className="p-2 text-muted-foreground hover:bg-secondary/50 rounded-full transition-colors relative">
          <Bell className="h-5 w-5" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full border-2 border-background bg-destructive"></span>
        </button>
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