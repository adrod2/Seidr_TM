import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  useNodesState, 
  useEdgesState, 
  MarkerType,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Connection,
  ReactFlowProvider,
  useReactFlow
} from '@xyflow/react';
import { Server, Database, Globe, User, Plus, Save, Component, X, LayoutTemplate } from 'lucide-react';
import { C4Node } from './C4Node';
import { db } from '@/lib/db';
import { toast } from 'sonner';
import '@xyflow/react/dist/style.css';

const calculateLayout = (mode: string, nodesToLayout: any[], currentEdges: any[]) => {
  const updatedNodes = [...nodesToLayout];

  if (mode === 'tree') {
    const tiers = { top: [] as any[], middle: [] as any[], bottom: [] as any[] };
    updatedNodes.forEach(n => {
      if (n.data.type === 'Person') tiers.top.push(n);
      else if (n.data.type === 'Database') tiers.bottom.push(n);
      else tiers.middle.push(n);
    });

    const applyTier = (tier: any[], yPos: number) => {
      const spacingX = 350;
      tier.forEach((n, idx) => {
        const xPos = (idx - (tier.length - 1) / 2) * spacingX;
        n.position = { x: xPos, y: yPos };
      });
    };
    
    // Top tier (Users/Actors)
    applyTier(tiers.top, -250);
    
    // Middle tier (Systems/Containers/Components) - arranged in a grid if numerous
    const middleSpacingX = 340;
    const middleSpacingY = 240;
    const maxCols = 4;
    tiers.middle.forEach((n, idx) => {
      const row = Math.floor(idx / maxCols);
      const col = idx % maxCols;
      const itemsInRow = Math.min(maxCols, tiers.middle.length - row * maxCols);
      const startX = -((itemsInRow - 1) * middleSpacingX) / 2;
      n.position = { x: startX + col * middleSpacingX, y: row * middleSpacingY };
    });

    // Bottom tier (Databases/Stores)
    const middleHeight = Math.ceil(tiers.middle.length / maxCols) * middleSpacingY;
    applyTier(tiers.bottom, middleHeight + 100);
  } 
  else if (mode === 'star') {
    const edgeCount: Record<string, number> = {};
    currentEdges.forEach(e => {
      const source = e.sourceId || e.source;
      const target = e.targetId || e.target;
      edgeCount[source] = (edgeCount[source] || 0) + 1;
      edgeCount[target] = (edgeCount[target] || 0) + 1;
    });
    
    let centerNodeId = updatedNodes[0]?.id;
    let maxEdges = -1;
    Object.entries(edgeCount).forEach(([id, count]) => {
      if (count > maxEdges) { maxEdges = count; centerNodeId = id; }
    });

    const centerNode = updatedNodes.find(n => n.id === centerNodeId);
    if (centerNode) centerNode.position = { x: 0, y: 0 };

    const otherNodes = updatedNodes.filter(n => n.id !== centerNodeId);
    const radius = Math.max(350, otherNodes.length * 65);
    otherNodes.forEach((n, idx) => {
      const angle = (idx / otherNodes.length) * 2 * Math.PI;
      n.position = {
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle)
      };
    });
  } 
  else if (mode === 'domain') {
    const domains = { External: [] as any[], Core: [] as any[], Data: [] as any[] };
    updatedNodes.forEach(n => {
      if (n.data.type === 'Person') domains.External.push(n);
      else if (n.data.type === 'Database') domains.Data.push(n);
      else domains.Core.push(n);
    });

    const applyCluster = (cluster: any[], startX: number, startY: number) => {
      const cols = Math.ceil(Math.sqrt(cluster.length || 1));
      const spacing = 340;
      cluster.forEach((n, idx) => {
        const row = Math.floor(idx / cols);
        const col = idx % cols;
        n.position = { 
          x: startX + col * spacing - ((cols-1)*spacing/2), 
          y: startY + row * spacing - ((cols-1)*spacing/2)
        };
      });
    };

    applyCluster(domains.External, -900, 0); // Far Left
    applyCluster(domains.Core, 0, 0);        // Center
    applyCluster(domains.Data, 900, 0);      // Far Right
  }

  return updatedNodes;
};

const C4ArchitectureContent = ({ srg, modelId }: { srg?: any, modelId?: string }) => {
  const nodeTypes = useMemo(() => ({ c4Node: C4Node }), []);
  const { fitView } = useReactFlow();
  
  const [draftSrg, setDraftSrg] = useState(srg || { components: [], edges: [] });
  const [nodes, setNodes] = useNodesState([]);
  const [edges, setEdges] = useEdgesState([]);
  const [activeLevel, setActiveLevel] = useState<'L1' | 'L2' | 'L3'>('L2');
  const [layoutMode, setLayoutMode] = useState<'tree' | 'star' | 'domain'>('tree');
  const initializedRef = useRef(false);
  
  // Editor State
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '' });

  // Sync draftSrg into ReactFlow Nodes & Edges
  useEffect(() => {
    if (!draftSrg || !draftSrg.components) return;

    // Filter components based on C4 Level Toggle
    const filteredComponents = draftSrg.components.filter((c: any) => 
      c.c4Level === activeLevel || c.c4Level === 'Global' ||
      (activeLevel === 'L2' && c.c4Level === 'L1') || 
      (activeLevel === 'L3' && (c.c4Level === 'L2' || c.c4Level === 'Global')) 
    );

    let needsLayout = false;

    let newNodes = filteredComponents.map((c: any) => {
      const c4Type = c.c4Type || (c.type === 'ExternalEntity' ? 'Person' : c.type === 'DataStore' ? 'Database' : 'Container');

      const nodeData = {
        id: c.id,
        label: c.name,
        type: c4Type,
        description: c.description,
        icon: Server,
        containerStyle: '',
        iconBg: '',
        iconColor: '',
        descBg: '',
        descText: '',
        typeText: ''
      };

      if (c4Type === 'Person') {
        nodeData.icon = User;
        nodeData.containerStyle = 'bg-card border-blue-500/40 text-card-foreground';
        nodeData.iconBg = 'bg-blue-500/10';
        nodeData.iconColor = 'text-blue-500';
        nodeData.descBg = 'bg-secondary/50';
        nodeData.descText = 'text-muted-foreground';
        nodeData.typeText = 'text-blue-500/80';
      } else if (c4Type === 'Database') {
        nodeData.icon = Database;
        nodeData.containerStyle = 'bg-emerald-600 dark:bg-emerald-700 border-emerald-800 dark:border-emerald-500 text-white';
        nodeData.iconBg = 'bg-white/20';
        nodeData.iconColor = 'text-white';
        nodeData.descBg = 'bg-black/20';
        nodeData.descText = 'text-emerald-50';
        nodeData.typeText = 'text-emerald-100/90';
      } else if (c4Type === 'Container' || c4Type === 'System') {
        nodeData.icon = Globe;
        nodeData.containerStyle = 'bg-blue-600 dark:bg-blue-700 border-blue-800 dark:border-blue-500 text-white';
        nodeData.iconBg = 'bg-white/20';
        nodeData.iconColor = 'text-white';
        nodeData.descBg = 'bg-black/20';
        nodeData.descText = 'text-blue-50';
        nodeData.typeText = 'text-blue-100/90';
      } else { 
        nodeData.icon = Component;
        nodeData.containerStyle = 'bg-card border-border text-card-foreground';
        nodeData.iconBg = 'bg-secondary';
        nodeData.iconColor = 'text-foreground';
        nodeData.descBg = 'bg-secondary/50';
        nodeData.descText = 'text-muted-foreground';
        nodeData.typeText = 'text-muted-foreground';
      }

      let pos = c.metadata?.position;
      if (!pos) {
        needsLayout = true;
        pos = { x: 0, y: 0 };
      }

      return {
        id: c.id,
        type: 'c4Node',
        position: pos,
        data: nodeData
      };
    });

    // Enforce default tree mode layout if positions are missing
    if (needsLayout || !initializedRef.current) {
      newNodes = calculateLayout(layoutMode, newNodes, draftSrg.edges || []);
      initializedRef.current = true;
      
      // Update draftSrg quietly to hold the calculated initial positions
      setDraftSrg((prev: any) => {
        const next = { ...prev };
        newNodes.forEach((un: any) => {
          const compIndex = next.components.findIndex((comp: any) => comp.id === un.id);
          if (compIndex > -1) {
            next.components[compIndex] = {
              ...next.components[compIndex],
              metadata: { ...next.components[compIndex].metadata, position: un.position }
            };
          }
        });
        return next;
      });
    }

    const nodeIds = new Set(newNodes.map((n: any) => n.id));
    
    // Edges with enhanced clear label styling (legends)
    const newEdges = (draftSrg.edges || [])
      .filter((e: any) => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId))
      .map((e: any) => ({
        id: e.id,
        source: e.sourceId,
        target: e.targetId,
        label: e.label || e.protocol || 'Data Flow',
        type: 'smoothstep',
        animated: true,
        style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
        labelStyle: { fill: 'hsl(var(--foreground))', fontWeight: 700, fontSize: 12 },
        labelBgStyle: { fill: 'hsl(var(--background))', fillOpacity: 1, stroke: 'hsl(var(--border))', strokeWidth: 1, rx: 6, ry: 6 },
        labelBgPadding: [12, 6],
        labelBgBorderRadius: 6,
        markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--primary))' }
      }));

    setNodes(newNodes);
    setEdges(newEdges);

    setTimeout(() => {
      fitView({ padding: 0.3, duration: 800 });
    }, 100);

  }, [draftSrg, activeLevel, setNodes, setEdges, fitView, layoutMode]);

  const onNodesChangeHandler = useCallback(
    (changes: any) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
      const positionChanges = changes.filter((c: any) => c.type === 'position' && c.position);
      if (positionChanges.length > 0) {
        setDraftSrg((prev: any) => {
          const next = { ...prev };
          positionChanges.forEach((change: any) => {
            const compIndex = next.components.findIndex((c: any) => c.id === change.id);
            if (compIndex > -1) {
              next.components[compIndex] = {
                ...next.components[compIndex],
                metadata: { ...next.components[compIndex].metadata, position: change.position }
              };
            }
          });
          return next;
        });
      }
    },
    [setNodes]
  );

  const onEdgesChangeHandler = useCallback(
    (changes: any) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge(params, eds));
      const newEdge = {
        id: `e-${Date.now()}`,
        sourceId: params.source,
        targetId: params.target,
        label: 'Communicates with'
      };
      setDraftSrg((prev: any) => ({ ...prev, edges: [...prev.edges, newEdge] }));
      toast.success('Connection added');
    },
    [setEdges]
  );

  const handleAddNode = () => {
    const newNode = {
      id: `c-${Date.now()}`,
      name: 'New Component',
      type: 'Process',
      c4Type: activeLevel === 'L3' ? 'Component' : activeLevel === 'L2' ? 'Container' : 'System',
      c4Level: activeLevel,
      description: 'Double click to edit',
      metadata: { position: { x: 0, y: 0 } }
    };
    setDraftSrg((prev: any) => ({ ...prev, components: [...prev.components, newNode] }));
    toast.success('Node added to diagram. Click Auto Layout to arrange.');
  };

  const handleAutoLayoutToggle = () => {
    const nextMode = layoutMode === 'tree' ? 'star' : layoutMode === 'star' ? 'domain' : 'tree';
    setLayoutMode(nextMode);

    setNodes(currentNodes => {
      const updated = calculateLayout(nextMode, currentNodes, edges);
      
      setDraftSrg(prev => {
        const next = { ...prev };
        updated.forEach((un: any) => {
          const compIndex = next.components.findIndex((c: any) => c.id === un.id);
          if (compIndex > -1) {
            next.components[compIndex] = {
              ...next.components[compIndex],
              metadata: { ...next.components[compIndex].metadata, position: un.position }
            };
          }
        });
        return next;
      });

      return updated;
    });

    toast.success(`Layout changed to ${nextMode === 'tree' ? 'Hierarchical Tree' : nextMode === 'star' ? 'Star Topology' : 'Domain Separated'}`);
    
    setTimeout(() => {
      fitView({ duration: 800, padding: 0.2 });
    }, 50);
  };

  const handleSaveToDB = async () => {
    if (!modelId) return;
    try {
      await db.threatModels.update(modelId, { srg: draftSrg });
      toast.success('Architecture changes saved to database!');
    } catch (err) {
      toast.error('Failed to save diagram');
    }
  };

  const onNodeDoubleClick = (event: React.MouseEvent, node: any) => {
    setSelectedNodeId(node.id);
    setEditForm({ name: node.data.label, description: node.data.description });
  };

  const saveNodeEdits = () => {
    if (!selectedNodeId) return;
    setDraftSrg((prev: any) => {
      const next = { ...prev };
      const compIndex = next.components.findIndex((c: any) => c.id === selectedNodeId);
      if (compIndex > -1) {
        next.components[compIndex].name = editForm.name;
        next.components[compIndex].description = editForm.description;
      }
      return next;
    });
    setSelectedNodeId(null);
    toast.success('Component updated');
  };

  return (
    <div className="flex-1 relative bg-secondary/10 h-full min-h-[500px]">
      {/* Top Bar Controls */}
      <div className="absolute top-4 left-4 right-4 z-10 flex justify-between items-center pointer-events-none">
        <div className="flex gap-2 pointer-events-auto bg-card/80 backdrop-blur-md p-1.5 rounded-2xl border border-border/50 shadow-sm">
          {['L1', 'L2', 'L3'].map((level) => (
            <button 
              key={level}
              onClick={() => setActiveLevel(level as any)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                activeLevel === level 
                  ? 'bg-primary text-primary-foreground shadow-md' 
                  : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {level === 'L1' ? 'L1 Context' : level === 'L2' ? 'L2 Container' : 'L3 Component'}
            </button>
          ))}
        </div>

        <div className="flex gap-2 pointer-events-auto">
          <button 
            onClick={handleAutoLayoutToggle}
            className="bg-card border border-border/50 text-foreground px-4 py-2 rounded-xl text-sm font-medium hover:bg-secondary transition-colors shadow-sm flex items-center gap-2 w-44 justify-center"
          >
            <LayoutTemplate className="h-4 w-4" /> 
            Layout: {layoutMode === 'tree' ? 'Tree' : layoutMode === 'star' ? 'Star' : 'Domain'}
          </button>
          <button 
            onClick={handleAddNode}
            className="bg-card border border-border/50 text-foreground px-4 py-2 rounded-xl text-sm font-medium hover:bg-secondary transition-colors shadow-sm flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> Add Element
          </button>
          <button 
            onClick={handleSaveToDB}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-2"
          >
            <Save className="h-4 w-4" /> Save Diagram
          </button>
        </div>
      </div>

      {/* Editor Sidebar/Modal Overlay */}
      {selectedNodeId && (
        <div className="absolute top-20 right-4 z-20 w-80 bg-card border border-border/50 rounded-3xl shadow-xl p-5 pointer-events-auto">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-bold">Edit Component</h4>
            <button onClick={() => setSelectedNodeId(null)} className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-secondary/50">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wider">Name</label>
              <input 
                type="text" 
                value={editForm.name}
                onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                className="w-full bg-secondary/50 border border-border/50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wider">Description</label>
              <textarea 
                value={editForm.description}
                onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                className="w-full bg-secondary/50 border border-border/50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[100px] resize-none"
              />
            </div>
            <button 
              onClick={saveNodeEdits}
              className="w-full bg-primary text-primary-foreground py-2.5 rounded-xl text-sm font-bold shadow-sm hover:bg-primary/90 transition-colors"
            >
              Apply Changes
            </button>
          </div>
        </div>
      )}

      {/* React Flow Canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChangeHandler}
        onEdgesChange={onEdgesChangeHandler}
        onConnect={onConnect}
        onNodeDoubleClick={onNodeDoubleClick}
        fitView
        attributionPosition="bottom-right"
      >
        <Background className="opacity-20" color="hsl(var(--muted-foreground))" gap={20} size={1} />
        <Controls className="bg-card border-border/50 fill-foreground shadow-md rounded-xl overflow-hidden m-4" />
      </ReactFlow>
    </div>
  );
};

export const C4ArchitectureTab = (props: any) => (
  <ReactFlowProvider>
    <C4ArchitectureContent {...props} />
  </ReactFlowProvider>
);