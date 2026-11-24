import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type NodeChangeset,
  type OnSelectionChangeParams,
  useReactFlow,
} from '@xyflow/react';
import { Copy, Play, Plus, Trash2, Zap } from 'lucide-react';
import type { ComponentType } from '@/engine/models/types';
import { useSimulationStore } from '@/store/simulationStore';
import {
  type CanvasFlowEdge,
  type CanvasFlowNode,
  useWorkspaceStore,
} from '@/store/workspaceStore';
import { SystemNode } from './SystemNode';
import { TrafficEdge } from './TrafficEdge';

// Module-level registration prevents React Flow from remounting custom nodes/edges
const NODE_TYPES = { systemNode: SystemNode };
const EDGE_TYPES = { trafficEdge: TrafficEdge };

interface ContextMenuState {
  nodeId: string;
  x: number;
  y: number;
}

export function ArchitectureCanvas() {
  const reactFlow = useReactFlow<CanvasFlowNode, CanvasFlowEdge>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const rfNodes = useWorkspaceStore((s) => s.rfNodes);
  const rfEdges = useWorkspaceStore((s) => s.rfEdges);
  const projectId = useWorkspaceStore((s) => s.project.id);
  const snapToGrid = useWorkspaceStore((s) => s.snapToGrid);
  const bottomDockSize = useWorkspaceStore((s) => s.bottomDockSize);
  const visMode = useWorkspaceStore((s) => s.visMode);
  const addNode = useWorkspaceStore((s) => s.addNode);
  const addEdge = useWorkspaceStore((s) => s.addEdge);
  const applyRfNodeChanges = useWorkspaceStore((s) => s.applyRfNodeChanges);
  const updateNodePositions = useWorkspaceStore((s) => s.updateNodePositions);
  const duplicateNode = useWorkspaceStore((s) => s.duplicateNode);
  const deleteNode = useWorkspaceStore((s) => s.deleteNode);
  const deleteEdge = useWorkspaceStore((s) => s.deleteEdge);
  const selectNode = useWorkspaceStore((s) => s.selectNode);
  const selectEdge = useWorkspaceStore((s) => s.selectEdge);
  const selectedNodeId = useWorkspaceStore((s) => s.selectedNodeId);
  const selectedEdgeId = useWorkspaceStore((s) => s.selectedEdgeId);
  const loadScenario = useWorkspaceStore((s) => s.loadScenario);
  const undo = useWorkspaceStore((s) => s.undo);
  const redo = useWorkspaceStore((s) => s.redo);

  const simStatus = useSimulationStore((s) => s.status);
  const injectLiveFault = useSimulationStore((s) => s.injectLiveFault);
  const run = useSimulationStore((s) => s.run);
  const pause = useSimulationStore((s) => s.pause);
  const resume = useSimulationStore((s) => s.resume);
  const locked = simStatus === 'running' || simStatus === 'paused';

  const onNodesChange = useCallback(
    (changes: NodeChangeset<CanvasFlowNode>) => {
      const list = changes.toArray();
      const posUpdates: Array<{ id: string; position: { x: number; y: number } }> = [];
      let dragFinished = false;
      let hasNonPositionChange = false;

      for (const ch of list) {
        if (ch.type === 'position' && ch.position) {
          posUpdates.push({ id: ch.id, position: ch.position });
          if (ch.dragging === false) dragFinished = true;
        } else if (ch.type === 'remove') {
          if (!locked) {
            deleteNode(ch.id);
          }
        } else {
          hasNonPositionChange = true;
        }
      }

      if (hasNonPositionChange) {
        applyRfNodeChanges(changes);
      }
      if (posUpdates.length > 0) {
        updateNodePositions(posUpdates, dragFinished);
      }
    },
    [applyRfNodeChanges, deleteNode, locked, updateNodePositions],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (locked) return;
      if (connection.source && connection.target) {
        addEdge(connection.source, connection.target);
      }
    },
    [addEdge, locked],
  );

  const onSelectionChange = useCallback(
    (params: OnSelectionChangeParams<CanvasFlowNode, CanvasFlowEdge>) => {
      if (params.nodes.length > 0) {
        selectNode(params.nodes[0]!.id);
      } else if (params.edges.length > 0) {
        selectEdge(params.edges[0]!.id);
      }
    },
    [selectEdge, selectNode],
  );

  const onDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (locked) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    },
    [locked],
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (locked) return;
      const nodeType = event.dataTransfer.getData(
        'application/systemlab-node-type',
      ) as ComponentType;
      if (!nodeType) return;
      const position = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      addNode(nodeType, position);
    },
    [addNode, locked, reactFlow],
  );

  useEffect(() => {
    const handleKeyDown = (ev: KeyboardEvent): void => {
      const target = ev.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
        return;
      }

      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z' && !ev.shiftKey) {
        if (!locked) {
          ev.preventDefault();
          undo();
        }
      } else if (
        (ev.ctrlKey || ev.metaKey) &&
        (ev.key.toLowerCase() === 'y' || (ev.shiftKey && ev.key.toLowerCase() === 'z'))
      ) {
        if (!locked) {
          ev.preventDefault();
          redo();
        }
      } else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'd') {
        if (!locked && selectedNodeId) {
          ev.preventDefault();
          duplicateNode(selectedNodeId);
        }
      } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
        if (!locked) {
          if (selectedNodeId) {
            ev.preventDefault();
            deleteNode(selectedNodeId);
          } else if (selectedEdgeId) {
            ev.preventDefault();
            deleteEdge(selectedEdgeId);
          }
        }
      } else if (ev.key === ' ') {
        ev.preventDefault();
        const ws = useWorkspaceStore.getState();
        const sim = useSimulationStore.getState();
        if (sim.status === 'running') {
          pause();
        } else if (sim.status === 'paused') {
          resume();
        } else if (ws.validation.valid) {
          run(ws.project, ws.visMode);
        }
      } else if (ev.key.toLowerCase() === 'f' && !ev.ctrlKey && !ev.metaKey) {
        reactFlow.fitView({ padding: 0.2, maxZoom: 1.15, duration: 200 });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    deleteEdge,
    deleteNode,
    duplicateNode,
    locked,
    pause,
    reactFlow,
    redo,
    resume,
    run,
    selectedEdgeId,
    selectedNodeId,
    undo,
  ]);

  // Refit canvas cleanly when switching projects or resizing bottom dock
  useEffect(() => {
    const timer = setTimeout(() => {
      reactFlow.fitView({ padding: 0.28, maxZoom: 1.15, duration: 150 });
    }, 60);
    return () => clearTimeout(timer);
  }, [bottomDockSize, projectId, reactFlow]);

  return (
    <div ref={containerRef} className="relative h-full w-full" onClick={() => setContextMenu(null)}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onPaneClick={() => {
          selectNode(null);
          setContextMenu(null);
        }}
        onNodeContextMenu={(ev, node) => {
          ev.preventDefault();
          selectNode(node.id);
          const rect = containerRef.current?.getBoundingClientRect();
          setContextMenu({
            nodeId: node.id,
            x: ev.clientX - (rect?.left ?? 0),
            y: ev.clientY - (rect?.top ?? 0),
          });
        }}
        snapToGrid={snapToGrid}
        snapGrid={[16, 16]}
        fitView
        fitViewOptions={{ padding: 0.28, maxZoom: 1.15 }}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.2}
          color="var(--sl-grid-dot)"
        />
        <Controls showInteractive={false} />
        {bottomDockSize !== 'expanded' && (
          <MiniMap
            className="hidden sm:block"
            pannable
            zoomable
            style={{ width: 128, height: 76 }}
            nodeColor={() => 'var(--sl-border-strong)'}
            maskColor="color-mix(in srgb, var(--sl-bg-canvas) 65%, transparent)"
          />
        )}
      </ReactFlow>

      {/* Sampled traffic visual disclosure badge */}
      {simStatus === 'running' && (
        <div
          className="pointer-events-none absolute top-3 left-12 z-10 rounded border px-2.5 py-1 text-[11px]"
          style={{
            backgroundColor: 'var(--sl-bg-surface)',
            borderColor: 'var(--sl-border-default)',
            color: 'var(--sl-text-secondary)',
          }}
        >
          {visMode === 'normal'
            ? 'Animated edge dots represent sampled engine traffic; telemetry tables show exact counts.'
            : `Visualization mode: ${visMode.replace('_', ' ')} (metrics remain exact).`}
        </div>
      )}

      {/* Empty Canvas Quick-Start Overlay */}
      {rfNodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
          <div
            className="pointer-events-auto max-w-md rounded-lg border p-6 text-center shadow-lg"
            style={{
              backgroundColor: 'var(--sl-bg-surface)',
              borderColor: 'var(--sl-border-default)',
            }}
          >
            <h3 className="text-base font-semibold" style={{ color: 'var(--sl-text-primary)' }}>
              Empty Architecture Canvas
            </h3>
            <p
              className="mt-1.5 text-xs leading-relaxed"
              style={{ color: 'var(--sl-text-secondary)' }}
            >
              Drag or click components from the left palette to assemble a topology, or open a
              verified built-in scenario to start experimenting immediately.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => loadScenario('scenario-01-hello-system-design')}
                className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-white"
                style={{
                  backgroundColor: 'var(--sl-btn-primary-bg)',
                }}
              >
                <Play className="h-3.5 w-3.5" />
                Load Hello System Design
              </button>
              <button
                type="button"
                onClick={() => addNode('client', { x: 100, y: 180 })}
                className="inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium"
                style={{
                  backgroundColor: 'var(--sl-bg-elevated)',
                  borderColor: 'var(--sl-border-default)',
                  color: 'var(--sl-text-primary)',
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Client Node
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Right-click Node Context Menu */}
      {contextMenu && (
        <div
          role="menu"
          className="absolute z-30 min-w-[180px] rounded-md border py-1 text-xs shadow-lg"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            backgroundColor: 'var(--sl-bg-surface)',
            borderColor: 'var(--sl-border-default)',
          }}
        >
          <button
            type="button"
            role="menuitem"
            disabled={locked}
            onClick={() => {
              duplicateNode(contextMenu.nodeId);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-black/10 disabled:opacity-40"
            style={{ color: 'var(--sl-text-primary)' }}
          >
            <Copy className="h-3.5 w-3.5" />
            Duplicate Node
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!locked}
            onClick={() => {
              injectLiveFault('node_failure', contextMenu.nodeId, 1, null, 'Manual Crash');
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-black/10 disabled:opacity-40"
            style={{ color: 'var(--sl-accent-danger)' }}
          >
            <Zap className="h-3.5 w-3.5" />
            Inject Node Failure
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={locked}
            onClick={() => {
              deleteNode(contextMenu.nodeId);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-black/10 disabled:opacity-40"
            style={{ color: 'var(--sl-accent-danger)' }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Node
          </button>
        </div>
      )}
    </div>
  );
}
