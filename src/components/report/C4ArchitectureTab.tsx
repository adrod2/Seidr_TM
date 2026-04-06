import React, { useMemo, useEffect, useState } from 'react';
import { ReactFlow, Background, Controls, useNodesState, useEdgesState, MarkerType } from '@xyflow/react';
import { Server, Database, Globe, Smartphone, Lock, User } from 'lucide-react';
import { C4Node } from './C4Node';
import '@xyflow/react/dist/style.css';

export const C4ArchitectureTab = ({ srg }: { srg?: any }) => {
  const nodeTypes = useMemo(() => ({ c4Node: C4Node }), []);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [activeLevel, setActiveLevel] = useState<'L1' | 'L2'>('L2');

  useEffect(() => {
    if (srg && srg.components && srg.edges) {
      // Filter components based on C4 Level Toggle
      const filteredComponents = srg.components.filter((c: any) => 
        c.c4Level === activeLevel || c.c4Level === 'Both' || !c.c4Level
      );

      // Auto Layout counters
      const positionCounters: Record<string, number> = { Person: 0, System: 0, Container: 0, Database: 0, Default: 0 };

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
        }

        // Logical Placement (Users Top, Systems Middle, DBs Bottom)
        const layerIdx = positionCounters[c4Type] || 0;
        let y = 250;
        if (c4Type === 'Person') y = 50;
        else if (c4Type === 'Database') y = 450;

        let x = 100 + (layerIdx * 280);
        positionCounters[c4Type] = layerIdx + 1;

        return {
          id: c.id,
          type: 'c4Node',
          position: { x, y },
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

      // Filter edges that only exist between the visible nodes
      const nodeIds = new Set(newNodes.map((n: any) => n.id));
      const newEdges = srg.edges
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
    }
  }, [srg, activeLevel, setNodes, setEdges]);

  return (
    <div className="flex-1 relative bg-secondary/10 h-full min-h-[500px]">
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <button 
          onClick={() => setActiveLevel('L1')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            activeLevel === 'L1' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-card border border-border/50 hover:bg-secondary/50'
          }`}
        >
          L1 Context
        </button>
        <button 
          onClick={() => setActiveLevel('L2')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            activeLevel === 'L2' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-card border border-border/50 hover:bg-secondary/50'
          }`}
        >
          L2 Container
        </button>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        attributionPosition="bottom-right"
      >
        <Background className="opacity-20" color="hsl(var(--muted-foreground))" gap={20} size={1} />
        <Controls className="bg-card border-border/50 fill-foreground shadow-md rounded-xl overflow-hidden m-4" />
      </ReactFlow>
    </div>
  );
};