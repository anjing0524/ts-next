'use client';

import { ReactFlow, Background, Controls, MiniMap, Node, MarkerType } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useState, useCallback, useMemo } from 'react';
import { nodeTypes } from './customer-node';
import { initialEdges, initialNodes } from '../data/flow-data';

export function DagFlow() {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // 性能优化：使用 useCallback 包装节点点击处理函数
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    // 设置选中的节点
    setSelectedNode(node.id);
    event.stopPropagation();
  }, []);

  // 点击画布空白处取消选中
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // 更新节点，添加选中状态
  const nodesWithSelection = useMemo(() => {
    return nodes.map((node) => ({
      ...node,
      selected: node.id === selectedNode,
    }));
  }, [nodes, selectedNode]);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <div className="p-4 flex gap-4">
        <h1 className="text-2xl font-bold">DAG 流程图</h1>
      </div>
      <div
        className="flex-1 bg-white rounded-lg mx-4 mb-4 shadow-sm"
        style={{ height: 'calc(100vh - 100px)' }}
      >
        <ReactFlow
          nodes={nodesWithSelection}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          defaultEdgeOptions={{
            type: 'smoothstep',
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: '#ccc',
            },
          }}
          // 性能优化设置
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          minZoom={0.5}
          maxZoom={2}
          snapToGrid={true}
          snapGrid={[15, 15]}
        >
          <Background color="#f8f8f8" gap={16} />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
    </div>
  );
}
