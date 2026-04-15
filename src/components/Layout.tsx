"use client";

import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { 
  ShieldAlert, 
  LayoutDashboard, 
  PlusCircle, 
  List, 
  Settings,
  Menu,
  Bell,
  Search,
  BookOpen
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

const Sidebar = () => {
  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: BookOpen, label: 'Instructions', path: '/instructions' },
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
                isActive 
                  ? 'bg-primary/10 text-primary font-medium' 
                  : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
              }`
            }
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
  
  const getTitle = () => {
    const path = location.pathname;
    if (path === '/') return 'Executive Dashboard';
    if (path === '/instructions') return 'Instructions & Guide';
    if (path.startsWith('/models/new')) return 'New Threat Model';
    if (path.startsWith('/models/') && path !== '/models') return 'Threat Report';
    if (path === '/models') return 'Threat Models';
    if (path === '/admin') return 'Administration';
    return 'Seidr';
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
        <div className="relative hidden md:block">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search models..."
            className="h-9 pl-9 pr-4 rounded-full bg-secondary/50 border-none text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all w-64"
          />
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