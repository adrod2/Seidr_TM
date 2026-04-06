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
  Edge
} from '@xyflow/react';
import { Server, Database, Globe, User, Plus, Save, Component, X } from 'lucide-react';
import { C4Node } from './C4Node';
import { db } from '@/lib/db';
import { toast } from 'sonner';
import '@xyflow/react/dist/style.css';

export const C4ArchitectureTab = ({ srg, modelId }: { srg?: any, modelId?: string }) => {
  const nodeTypes = useMemo(() => ({ c4Node: C4Node }), []);
  
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
      let icon = Server;
      let iconBg = 'bg-secondary';
      let iconColor = 'text-foreground';
      let style = 'bg-card border-border/50';

      const c4Type = c.c4Type || (c.type === 'ExternalEntity' ? 'Person' : c.type === 'DataStore' ? 'Database' : 'Container');

      if (c4Type === 'Person') {
        icon = User;
        iconBg = 'bg-primary/10';
        iconColor = 'text-primary';
        style = 'bg-card border-primary/30';
      } else if (c4Type === 'Database') {
        icon = Database;
        iconBg = 'bg-emerald-500/20';
        iconColor = 'text-emerald-500';
        style = 'bg-card border-emerald-500/30';
      } else if (c4Type === 'Container' || c4Type === 'System') {
        icon = Globe;
        style = 'bg-primary text-primary-foreground border-primary/50';
        iconBg = 'bg-primary-foreground/20';
        iconColor = 'text-primary-foreground';
      } else if (c4Type === 'Component') {
        icon = Component;
        style = 'bg-accent/10 text-accent-foreground border-accent/30';
        iconBg = 'bg-background';
        iconColor = 'text-accent';
      }

      // Restore position or auto-layout
      let pos = c.metadata?.position;
      if (!pos) {
        const layerIdx = positionCounters[c4Type] || 0;
        let y = 250;
        if (c4Type === 'Person') y = 50;
        else if (c4Type === 'Database') y = 450;
        else if (c4Type === 'Component') y = 350;

        pos = { x: 100 + (layerIdx * 280), y };
        positionCounters[c4Type] = layerIdx + 1;
      }

      return {
        id: c.id,
        type: 'c4Node',
        position: pos,
        data: {
          label: c.name,
          type: c4Type,
          description: c.description,
          icon: icon,
          containerStyle: style,
          iconBg: iconBg,
          iconColor: iconColor
        }
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
        style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
        labelStyle: { fill: 'hsl(var(--muted-foreground))', fontWeight: 600, fontSize: 11 },
        labelBgStyle: { fill: 'hsl(var(--background))', fillOpacity: 0.8 },
        markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--primary))' }
      }));

    setNodes(newNodes);
    setEdges(newEdges);
  }, [draftSrg, activeLevel, setNodes, setEdges]);

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