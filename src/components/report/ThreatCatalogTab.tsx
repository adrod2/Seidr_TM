import React, { useState, useMemo } from 'react';
import { Filter, AlertTriangle, Server, CheckCircle2, ShieldAlert, ChevronDown, ChevronUp, Search, X, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';

const defaultThreats = [
  { 
    id: 'T-001', 
    title: 'Unauthenticated API Access', 
    category: 'Spoofing', 
    componentId: 'API Gateway', 
    severity: 'Critical', 
    cvssScore: 9.2,
    description: 'The API Gateway is exposed to the public internet without proper enforcement of JWT validation on all endpoints, allowing attackers to bypass authentication.',
    evidence: 'The C4 diagram shows an inbound data flow from "Internet User" to "API Gateway" labeled "HTTPS" but missing trust boundary enforcement and authentication tags.',
    reasoning: '1. An attacker scans the public IP of the API Gateway.\n2. The attacker crafts direct requests to downstream microservice routes.\n3. Because the gateway does not enforce the auth policy globally, the request is forwarded to the internal subnet, granting unauthorized data access.'
  }
];

export const ThreatCatalogTab = ({ threats, framework = 'STRIDE', selectedThreatId }: { threats?: any[], framework?: string, selectedThreatId?: string | null }) => {
  const displayThreats = threats && threats.length > 0 ? threats : defaultThreats;
  
  const [expandedThreats, setExpandedThreats] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [selectedSeverity, setSelectedSeverity] = useState('All Severities');

  // Extract unique categories directly from the threats to perfectly align with the methodology
  const categories = useMemo(() => {
    const cats = new Set(displayThreats.map(t => t.category));
    return Array.from(cats).sort();
  }, [displayThreats]);

  // Apply filters
  const filteredThreats = useMemo(() => {
    return displayThreats.filter(t => {
      const matchesSearch = !searchQuery || 
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.componentId.toLowerCase().includes(searchQuery.toLowerCase());
        
      const matchesCategory = selectedCategory === 'All Categories' || t.category === selectedCategory;
      const matchesSeverity = selectedSeverity === 'All Severities' || t.severity === selectedSeverity;
      
      return matchesSearch && matchesCategory && matchesSeverity;
    });
  }, [displayThreats, searchQuery, selectedCategory, selectedSeverity]);

  const toggleExpand = (id: string) => {
    const newSet = new Set(expandedThreats);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedThreats(newSet);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('All Categories');
    setSelectedSeverity('All Severities');
  };

  const hasActiveFilters = searchQuery !== '' || selectedCategory !== 'All Categories' || selectedSeverity !== 'All Severities';

  React.useEffect(() => {
    if (selectedThreatId) {
        const element = document.getElementById(`threat-${selectedThreatId}`);
        if (element) {
            // Ensure the threat is visible by clearing filters that might hide it
            clearFilters();
            // Expand the threat details
            setExpandedThreats(prev => new Set(prev).add(selectedThreatId));

            setTimeout(() => {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                element.classList.add('ring-2', 'ring-primary', 'ring-offset-2', 'ring-offset-background');
                setTimeout(() => {
                    element.classList.remove('ring-2', 'ring-primary', 'ring-offset-2', 'ring-offset-background');
                }, 2500);
            }, 100); // Short delay to allow render after clearing filters
        }
    }
  }, [selectedThreatId]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-secondary/10 h-full">
      <div className="p-5 border-b border-border/50 bg-card shadow-sm z-10 flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" />
            Threats identified using {framework}
          </h3>
          <div className="text-sm font-medium text-muted-foreground bg-secondary/50 px-3 py-1 rounded-full border border-border/50">
            Showing {filteredThreats.length} of {displayThreats.length}
          </div>
        </div>
        
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ID, title, component..."
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
              <option value="All Categories">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <select 
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
            className="bg-background border border-border/50 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 shadow-sm font-medium appearance-none cursor-pointer hover:border-primary/50 transition-colors"
          >
            <option value="All Severities">All Severities</option>
            <option value="Critical">Critical Severity</option>
            <option value="High">High Severity</option>
            <option value="Medium">Medium Severity</option>
            <option value="Low">Low Severity</option>
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
      
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {filteredThreats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center border-2 border-dashed border-border/50 rounded-3xl bg-card/50">
            <Filter className="h-10 w-10 text-muted-foreground mb-3" />
            <h4 className="font-bold text-lg mb-1">No threats found</h4>
            <p className="text-muted-foreground text-sm max-w-md">
              We couldn't find any threats matching your current filter criteria. Try adjusting your search or clearing the filters.
            </p>
            <button 
              onClick={clearFilters}
              className="mt-4 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium shadow-sm hover:bg-primary/90 transition-colors"
            >
              Clear All Filters
            </button>
          </div>
        ) : (
          filteredThreats.map(threat => {
            const isExpanded = expandedThreats.has(threat.id);
            
            return (
              <div key={threat.id} id={`threat-${threat.id}`} className="border border-border/50 rounded-2xl p-5 hover:border-primary/50 transition-colors flex flex-col group bg-card shadow-sm hover:shadow-md">
                <div className="flex gap-4">
                  <div className={`mt-1 flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${
                    threat.severity === 'Critical' ? 'bg-destructive/10 text-destructive' : 
                    threat.severity === 'High' ? 'bg-orange-500/10 text-orange-500' :
                    'bg-amber-500/10 text-amber-500'
                  }`}>
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1 gap-4">
                      <h4 className="font-bold text-base text-foreground truncate">{threat.title}</h4>
                      <span className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-1 rounded-md border border-border/50 flex-shrink-0">{threat.id}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mb-3">
                      <span className="bg-secondary px-2 py-0.5 rounded-md text-xs font-medium text-foreground border border-border/50">{threat.category}</span>
                      <span className="flex items-center gap-1.5"><Server className="h-3.5 w-3.5"/> {threat.componentId}</span>
                      <span>•</span>
                      <span>CVSS: <span className="font-bold text-foreground">{threat.cvssScore}</span></span>
                    </div>
                    
                    <p className="text-sm text-foreground leading-relaxed mb-2 font-medium">
                      {threat.description}
                    </p>

                    {/* Expanded Details Section */}
                    {(threat.evidence || threat.reasoning) && (
                      <div className="mt-3">
                        <button 
                          onClick={() => toggleExpand(threat.id)}
                          className="text-xs font-bold text-primary flex items-center gap-1 hover:underline mb-2"
                        >
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          {isExpanded ? 'Hide Analysis Details' : 'View Architecture Evidence & Reasoning'}
                        </button>
                        
                        {isExpanded && (
                          <div className="bg-secondary/30 border border-border/50 rounded-xl p-4 space-y-4 mt-2">
                            {threat.evidence && (
                              <div>
                                <h5 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                                  <Search className="h-3 w-3" /> Evidence in SRG
                                </h5>
                                <p className="text-sm text-muted-foreground whitespace-pre-line">{threat.evidence}</p>
                              </div>
                            )}
                            {threat.reasoning && (
                              <div>
                                <h5 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                                  <AlertTriangle className="h-3 w-3" /> Exploitation Path
                                </h5>
                                <p className="text-sm text-muted-foreground whitespace-pre-line">{threat.reasoning}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex justify-end gap-2 border-t border-border/50 pt-4 mt-4">
                  <button 
                    onClick={() => toast.success('Risk formally accepted. Added to risk register.')}
                    className="text-xs font-medium px-4 py-2 rounded-xl border border-border/50 hover:bg-secondary/50 flex items-center gap-1.5 transition-colors text-muted-foreground hover:text-foreground shadow-sm"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Accept Risk
                  </button>
                  <button 
                    onClick={() => toast.success('New mitigation action created!')}
                    className="text-xs font-medium px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <ShieldAlert className="h-3.5 w-3.5" /> Create Mitigation
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};