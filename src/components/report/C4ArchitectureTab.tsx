import React, { useMemo, useEffect } from 'react';
import { ReactFlow, Background, Controls, useNodesState, useEdgesState, MarkerType } from '@xyflow/react';
import { Server, Database, Globe, Smartphone, Lock } from 'lucide-react';
import { C4Node } from './C4Node';
import '@xyflow/react/dist/style.css';

const defaultNodes = [
  { id: '1', type: 'c4Node', position: { x: 250, y: 50 }, data: { label: 'Customer', type: 'Person', description: 'A customer of the platform.', icon: Smartphone, containerStyle: 'bg-card border-border', iconBg: 'bg-primary/10', iconColor: 'text-primary' } },
  { id: '2', type: 'c4Node', position: { x: 250, y: 250 }, data: { label: 'Web Application', type: 'Container: Next.js', description: 'Delivers the SPA and handles SSR.', icon: Globe, containerStyle: 'bg-card border-primary/50', iconBg: 'bg-primary', iconColor: 'text-primary-foreground' } },
];
const defaultEdges = [
  { id: 'e1-2', source: '1', target: '2', label: 'Visits', type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } },
];

export const C4ArchitectureTab = ({ srg }: { srg?: any }) => {
  const nodeTypes = useMemo(() => ({ c4Node: C4Node }), []);
  const [nodes, setNodes, onNodesChange] = useNodesState(defaultNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(defaultEdges);

  useEffect(() => {
    if (srg && srg.components && srg.edges) {
      const newNodes = srg.components.map((c: any, index: number) => {
        let icon = Server;
        let iconBg = 'bg-secondary';
        let iconColor = 'text-foreground';
        let style = 'bg-card border-border/50';

        if (c.type === 'ExternalEntity') {
          icon = Smartphone;
          iconBg = 'bg-primary/10';
          iconColor = 'text-primary';
        } else if (c.type === 'DataStore') {
          icon = Database;
          iconBg = 'bg-emerald-500/20';
          iconColor = 'text-emerald-500';
        } else if (c.name.toLowerCase().includes('web') || c.name.toLowerCase().includes('client')) {
          icon = Globe;
          style = 'bg-card border-primary/50';
          iconBg = 'bg-primary';
          iconColor = 'text-primary-foreground';
        } else if (c.name.toLowerCase().includes('api')) {
          iconBg = 'bg-amber-500/20';
          iconColor = 'text-amber-500';
        }

        return {
          id: c.id,
          type: 'c4Node',
          position: { x: 250 + (index % 2 === 0 ? 0 : 200), y: 50 + (index * 150) },
          data: {
            label: c.name,
            type: `Type: ${c.type}`,
            description: c.description,
            icon: icon,
            containerStyle: style,
            iconBg: iconBg,
            iconColor: iconColor
          }
        };
      });

      const newEdges = srg.edges.map((e: any) => ({
        id: e.id,
        source: e.sourceId,
        target: e.targetId,
        label: e.protocol || 'Data Flow',
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed }
      }));

      setNodes(newNodes);
      setEdges(newEdges);
    }
  }, [srg]);

  return (
    <div className="flex-1 relative bg-secondary/10 h-full min-h-[500px]">
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <button className="bg-card border border-border/50 shadow-sm px-4 py-2 rounded-xl text-sm font-medium hover:bg-secondary/50 transition-colors">L1 Context</button>
        <button className="bg-primary text-primary-foreground shadow-sm px-4 py-2 rounded-xl text-sm font-medium">L2 Container</button>
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
        <Controls className="bg-card border-border/50 fill-foreground shadow-md rounded-xl overflow-hidden" />
      </ReactFlow>
    </div>
  );
};