import React, { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Search, X, SlidersHorizontal, KanbanSquare, Filter, CheckCircle2, CircleDashed, ArrowRightCircle } from 'lucide-react';

export const MitigationsTab = ({ threats }: { threats?: any[] }) => {
  // Generate actions from threats, preserving category and severity for filtering
  const actions = useMemo(() => {
    return threats?.map((t, idx) => ({
      id: `ACT-${idx + 100}`,
      threatId: t.id,
      threatCategory: t.category || 'Uncategorized',
      threatSeverity: t.severity || 'Medium',
      title: `Remediate: ${t.title}`,
      effort: (t.severity === 'Critical' || t.severity === 'High') ? 'High' : t.severity === 'Medium' ? 'Medium' : 'Low',
      status: idx === 0 ? 'In Progress' : 'Open',
      controls: ['AC-1', 'SI-2']
    })) || [];
  }, [threats]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [selectedEffort, setSelectedEffort] = useState('All Efforts');

  // Dynamically extract categories to match the framework methodology
  const categories = useMemo(() => {
    const cats = new Set(actions.map(a => a.threatCategory));
    return Array.from(cats).sort();
  }, [actions]);

  // Apply filters
  const filteredActions = useMemo(() => {
    return actions.filter(a => {
      const matchesSearch = !searchQuery || 
        a.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        a.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.threatId.toLowerCase().includes(searchQuery.toLowerCase());
        
      const matchesCategory = selectedCategory === 'All Categories' || a.threatCategory === selectedCategory;
      const matchesEffort = selectedEffort === 'All Efforts' || a.effort === selectedEffort;
      
      return matchesSearch && matchesCategory && matchesEffort;
    });
  }, [actions, searchQuery, selectedCategory, selectedEffort]);

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('All Categories');
    setSelectedEffort('All Efforts');
  };

  const hasActiveFilters = searchQuery !== '' || selectedCategory !== 'All Categories' || selectedEffort !== 'All Efforts';

  const statuses = [
    { id: 'Open', label: 'To Do', icon: CircleDashed, color: 'text-muted-foreground' },
    { id: 'In Progress', label: 'In Progress', icon: ArrowRightCircle, color: 'text-blue-500' },
    { id: 'Done', label: 'Done', icon: CheckCircle2, color: 'text-emerald-500' }
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-secondary/10 h-full">
      {/* Filters Header (Consistent with Threat Catalog) */}
      <div className="p-5 border-b border-border/50 bg-card shadow-sm z-10 flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <KanbanSquare className="h-5 w-5 text-primary" />
            Mitigation Plan
          </h3>
          <div className="flex items-center gap-3">
            <div className="text-sm font-medium text-muted-foreground bg-secondary/50 px-3 py-1 rounded-full border border-border/50">
              Showing {filteredActions.length} of {actions.length}
            </div>
            <button 
              onClick={() => toast.promise(new Promise(r => setTimeout(r, 1500)), { loading: 'Syncing to Jira...', success: `${filteredActions.length} tickets successfully created or updated in Jira!` })}
              className="text-sm font-bold bg-primary text-primary-foreground px-4 py-2 rounded-xl hover:bg-primary/90 transition-colors shadow-sm"
            >
              Sync to Jira
            </button>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks, IDs..."
              className="pl-9 pr-8 py-2 bg-background border border-border/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 w-64 shadow-sm transition-all"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground bg-secondary/50 rounded-full p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          
          <div className="relative flex items-center">
            <SlidersHorizontal className="h-4 w-4 absolute left-3 text-muted-foreground pointer-events-none" />
            <select 
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-background border border-border/50 rounded-xl pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 shadow-sm font-medium appearance-none cursor-pointer hover:border-primary/50 transition-colors"
            >
              <option value="All Categories">All Threat Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <select 
            value={selectedEffort}
            onChange={(e) => setSelectedEffort(e.target.value)}
            className="bg-background border border-border/50 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 shadow-sm font-medium appearance-none cursor-pointer hover:border-primary/50 transition-colors"
          >
            <option value="All Efforts">All Effort Levels</option>
            <option value="High">High Effort</option>
            <option value="Medium">Medium Effort</option>
            <option value="Low">Low Effort</option>
          </select>

          {hasActiveFilters && (
            <button 
              onClick={clearFilters}
              className="text-xs font-bold text-destructive hover:text-destructive/80 px-2 py-1 transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Kanban Board Area */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
        {filteredActions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center border-2 border-dashed border-border/50 rounded-3xl bg-card/50 max-w-2xl mx-auto py-12">
            <Filter className="h-10 w-10 text-muted-foreground mb-3" />
            <h4 className="font-bold text-lg mb-1">No tasks found</h4>
            <p className="text-muted-foreground text-sm max-w-md">
              We couldn't find any mitigation tasks matching your current filter criteria.
            </p>
            <button 
              onClick={clearFilters}
              className="mt-4 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium shadow-sm hover:bg-primary/90 transition-colors"
            >
              Clear All Filters
            </button>
          </div>
        ) : (
          <div className="flex gap-6 h-full min-w-max pb-4">
            {statuses.map(statusObj => {
              const columnActions = filteredActions.filter(a => a.status === statusObj.id);
              const StatusIcon = statusObj.icon;
              
              return (
                <div key={statusObj.id} className="flex flex-col w-[350px] bg-card/40 border border-border/50 rounded-3xl overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-border/50 bg-card flex justify-between items-center">
                    <h4 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2">
                      <StatusIcon className={`h-4 w-4 ${statusObj.color}`} />
                      {statusObj.label}
                    </h4>
                    <span className="bg-secondary text-foreground text-xs font-bold px-2 py-0.5 rounded-full">
                      {columnActions.length}
                    </span>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {columnActions.map(action => (
                      <div key={action.id} className="bg-card border border-border/50 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-primary/50 transition-all cursor-grab active:cursor-grabbing group">
                        <div className="flex justify-between items-start mb-3">
                          <span className="text-[10px] font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20">{action.id}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            action.effort === 'High' ? 'bg-destructive/10 text-destructive border-destructive/20' :
                            action.effort === 'Medium' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                            'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                          }`}>
                            {action.effort} Effort
                          </span>
                        </div>
                        
                        <h5 className="font-bold text-sm mb-2 text-foreground leading-snug group-hover:text-primary transition-colors">{action.title}</h5>
                        
                        <div className="flex items-center gap-2 mb-4">
                          <span className="text-[10px] font-medium text-muted-foreground bg-secondary/50 px-2 py-1 rounded-md border border-border/50">
                            Fixes {action.threatId}
                          </span>
                          <span className="text-[10px] font-medium text-muted-foreground bg-secondary/50 px-2 py-1 rounded-md border border-border/50 truncate">
                            {action.threatCategory}
                          </span>
                        </div>
                        
                        <div className="flex justify-between items-center mt-4 pt-3 border-t border-border/50">
                          <div className="flex gap-1.5 flex-wrap">
                            {action.controls.map(c => (
                              <span key={c} className="bg-background border border-border/50 px-1.5 py-0.5 rounded text-[10px] font-bold text-muted-foreground">{c}</span>
                            ))}
                          </div>
                          
                          {/* Mock avatar for assignee */}
                          <div className="h-6 w-6 rounded-full bg-secondary border border-border flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                            AI
                          </div>
                        </div>
                      </div>
                    ))}
                    {columnActions.length === 0 && (
                      <div className="text-center p-6 border-2 border-dashed border-border/50 rounded-2xl text-xs text-muted-foreground bg-card/30">
                        Drop tasks here
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
