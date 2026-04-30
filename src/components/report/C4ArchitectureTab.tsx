import React, { useMemo, useEffect, useState, useCallback } from 'react';
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

const C4ArchitectureContent = ({ srg, modelId }: { srg?: any, modelId?: string }) => {
  const nodeTypes = useMemo(() => ({ c4Node: C4Node }), []);
  const { fitView } = useReactFlow();
  
  const [draftSrg, setDraftSrg] = useState(srg || { components: [], edges: [] });
  const [nodes, setNodes] = useNodesState([]);
  const [edges, setEdges] = useEdgesState([]);
  const [activeLevel, setActiveLevel] = useState<'L1' | 'L2' | 'L3'>('L2');
  
  // Editor State
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '' });

  // Sync draftSrg into ReactFlow Nodes & Edges whenever activeLevel or draftSrg structural additions happen
  useEffect(() => {
    if (!draftSrg || !draftSrg.components) return;

    // Filter components based on C4 Level Toggle
    const filteredComponents = draftSrg.components.filter((c: any) => 
      c.c4Level === activeLevel || c.c4Level === 'Global' ||
      (activeLevel === 'L2' && c.c4Level === 'L1') || // Show L1 Context in L2
      (activeLevel === 'L3' && (c.c4Level === 'L2' || c.c4Level === 'Global')) // Show L2 in L3
    );

    const positionCounters: Record<string, number> = { Person: 0, System: 0, Container: 0, Component: 0, Database: 0 };

    const newNodes = filteredComponents.map((c: any) => {
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
      } else { // Component
        nodeData.icon = Component;
        nodeData.containerStyle = 'bg-card border-border text-card-foreground';
        nodeData.iconBg = 'bg-secondary';
        nodeData.iconColor = 'text-foreground';
        nodeData.descBg = 'bg-secondary/50';
        nodeData.descText = 'text-muted-foreground';
        nodeData.typeText = 'text-muted-foreground';
      }

      // Restore position or auto-layout
      let pos = c.metadata?.position;
      if (!pos) {
        const layerIdx = positionCounters[c4Type] || 0;
        let y = 250;
        if (c4Type === 'Person') y = 50;
        else if (c4Type === 'Database') y = 500;
        else if (c4Type === 'Component') y = 380;

        pos = { x: 100 + (layerIdx * 320), y };
        positionCounters[c4Type] = layerIdx + 1;
      }

      return {
        id: c.id,
        type: 'c4Node',
        position: pos,
        data: nodeData
      };
    });

    const nodeIds = new Set(newNodes.map((n: any) => n.id));
    const newEdges = (draftSrg.edges || [])
      .filter((e: any) => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId))
      .map((e: any) => ({
        id: e.id,
        source: e.sourceId,
        target: e.targetId,
        label: e.label || e.protocol || 'Data Flow',
        type: 'smoothstep',
        animated: true,
        style: { stroke: 'hsl(var(--muted-foreground))', strokeWidth: 2 },
        labelStyle: { fill: 'hsl(var(--foreground))', fontWeight: 600, fontSize: 11 },
        labelBgStyle: { fill: 'hsl(var(--card))', fillOpacity: 0.9 },
        markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--muted-foreground))' }
      }));

    setNodes(newNodes);
    setEdges(newEdges);

    // Ensure we trigger fitView after nodes are processed and rendered
    setTimeout(() => {
      fitView({ padding: 0.3, duration: 800 });
    }, 100);

  }, [draftSrg, activeLevel, setNodes, setEdges, fitView]);

  // Handle Dragging (sync back to draftSrg)
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
      metadata: { position: { x: 250, y: 150 } }
    };
    setDraftSrg((prev: any) => ({ ...prev, components: [...prev.components, newNode] }));
    toast.success('Node added to diagram');
  };

  const handleAutoLayout = () => {
    const typeGroups: Record<string, any[]> = {
      Person: [],
      App: [],
      Database: []
    };

    // Group current visible nodes into tiers
    nodes.forEach(node => {
      const type = node.data.type;
      if (type === 'Person') typeGroups.Person.push(node);
      else if (type === 'Database') typeGroups.Database.push(node);
      else typeGroups.App.push(node);
    });

    setNodes(currentNodes => {
      const updatedNodes = [...currentNodes];
      
      const applyTierPositions = (group: any[], startY: number) => {
        if (group.length === 0) return startY;
        const spacingX = 320;
        const spacingY = 220;
        const maxCols = 4; // Max nodes per row to prevent excessive width

        group.forEach((node, index) => {
          const row = Math.floor(index / maxCols);
          const col = index % maxCols;
          
          // Calculate items in the specific row to center it
          const itemsInRow = Math.min(maxCols, group.length - row * maxCols);
          const startX = -((itemsInRow - 1) * spacingX) / 2;
          
          const newPos = { x: startX + col * spacingX, y: startY + row * spacingY };
          
          // Update React Flow Node
          const nodeIndex = updatedNodes.findIndex(n => n.id === node.id);
          if (nodeIndex > -1) {
            updatedNodes[nodeIndex] = { ...updatedNodes[nodeIndex], position: newPos };
          }
          
          // Sync draftSrg
          setDraftSrg(prev => {
            const next = { ...prev };
            const compIndex = next.components.findIndex((c: any) => c.id === node.id);
            if (compIndex > -1) {
              next.components[compIndex] = {
                ...next.components[compIndex],
                metadata: { ...next.components[compIndex].metadata, position: newPos }
              };
            }
            return next;
          });
        });

        const rows = Math.ceil(group.length / maxCols);
        return startY + (rows * spacingY); // Return the next available Y coordinate
      };

      let nextY = 0;
      nextY = applyTierPositions(typeGroups.Person, nextY) + 50;
      nextY = applyTierPositions(typeGroups.App, nextY) + 50;
      applyTierPositions(typeGroups.Database, nextY);

      return updatedNodes;
    });

    toast.success('Grid auto-layout applied!');
    
    // Fit view slightly after layout update
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
            onClick={handleAutoLayout}
            className="bg-card border border-border/50 text-foreground px-4 py-2 rounded-xl text-sm font-medium hover:bg-secondary transition-colors shadow-sm flex items-center gap-2"
          >
            <LayoutTemplate className="h-4 w-4" /> Auto Layout
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

// Wrap with ReactFlowProvider to enable useReactFlow hook (for fitView)
export const C4ArchitectureTab = (props: any) => (
  <ReactFlowProvider>
    <C4ArchitectureContent {...props} />
  </ReactFlowProvider>
);