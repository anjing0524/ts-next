'use client';

import { ReactFlow, Background, Controls, MiniMap, Node, MarkerType, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useState, useCallback, useMemo } from 'react';
import { nodeTypes } from './customer-node';
import { useFlowStore, FlowStage } from '@/app/(dashboard)/flow/store/flow-store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useShallow } from 'zustand/react/shallow';

/**
 * 计算节点的垂直布局
 * 使用拓扑排序算法将节点按层级布局
 * @param nodes 节点数组
 * @param edges 边数组
 * @returns 带有位置信息的节点数组
 */
const calculateNodePositions = (nodes: Node[], edges: Edge[]) => {
  // 创建依赖关系图和入度记录
  const dependencyGraph: Record<string, string[]> = {};
  const incomingEdges: Record<string, number> = {};

  // 初始化图结构
  nodes.forEach((node) => {
    dependencyGraph[node.id] = [];
    incomingEdges[node.id] = 0;
  });

  // 构建依赖关系和计算入度
  edges.forEach((edge) => {
    if (edge.source && edge.target) {
      // 确保节点存在于依赖图中
      if (!dependencyGraph[edge.source]) {
        dependencyGraph[edge.source] = [];
      }

      dependencyGraph[edge.source].push(edge.target);

      // 确保目标节点存在于入度记录中
      if (incomingEdges[edge.target] === undefined) {
        incomingEdges[edge.target] = 0;
      }

      incomingEdges[edge.target]++;
    }
  });

  // 找出所有没有入边的节点（起始节点）
  const startNodes = Object.keys(incomingEdges).filter((id) => incomingEdges[id] === 0);

  // 按层级分组节点（拓扑排序）
  const layers: string[][] = [];
  let currentLayer = [...startNodes];

  while (currentLayer.length > 0) {
    layers.push(currentLayer);

    const nextLayer: string[] = [];
    currentLayer.forEach((nodeId) => {
      // 遍历当前节点的所有目标节点
      dependencyGraph[nodeId]?.forEach((targetId) => {
        incomingEdges[targetId]--;
        // 当目标节点的入度为0时，将其加入下一层
        if (incomingEdges[targetId] === 0) {
          nextLayer.push(targetId);
        }
      });
    });

    currentLayer = nextLayer;
  }

  // 计算每个节点的位置
  const nodePositions: Record<string, { x: number; y: number }> = {};

  // 水平间距和垂直间距（可根据节点大小调整）
  const horizontalGap = 250; // 增加水平间距，避免节点重叠
  const verticalGap = 150; // 增加垂直间距，提高可读性

  // 为每一层的节点分配位置
  layers.forEach((layer, layerIndex) => {
    // 计算当前层的总宽度
    const layerWidth = layer.length * horizontalGap;
    // 计算起始X坐标，使当前层居中
    const startX = -layerWidth / 2 + horizontalGap / 2;

    // 为当前层的每个节点分配位置
    layer.forEach((nodeId, nodeIndex) => {
      nodePositions[nodeId] = {
        x: startX + nodeIndex * horizontalGap,
        y: layerIndex * verticalGap,
      };
    });
  });

  // 更新节点位置并返回
  return nodes.map((node) => ({
    ...node,
    position: nodePositions[node.id] || { x: 0, y: 0 },
  }));
};

/**
 * DAG流程图组件
 * 展示工作流的有向无环图(DAG)
 */
export function DagFlow() {
  // 使用 useShallow 优化状态选择，避免不必要的重渲染
  const { stages, currentStage } = useFlowStore(
    useShallow((state) => ({
      stages: state.stages,
      currentStage: state.currentStage,
    }))
  );

  // 记录每个阶段中选中的节点
  const [selectedNodes, setSelectedNodes] = useState<Record<string, string | null>>({});

  // 根据当前选中的阶段过滤要显示的数据
  const stagesToShow = useMemo(() => {
    if (!currentStage) {
      return stages; // 如果没有选中阶段，显示所有阶段
    }
    return stages.filter((stage) => stage.name === currentStage);
  }, [stages, currentStage]);

  // 处理节点点击事件
  const onNodeClick = useCallback(
    (stageId: string) => (event: React.MouseEvent, node: Node) => {
      setSelectedNodes((prev) => ({
        ...prev,
        [stageId]: node.id, // 记录当前阶段选中的节点
      }));
      event.stopPropagation(); // 阻止事件冒泡
    },
    []
  );

  // 处理画布点击事件（取消选中）
  const onPaneClick = useCallback(
    (stageId: string) => () => {
      setSelectedNodes((prev) => ({
        ...prev,
        [stageId]: null, // 清除当前阶段的选中状态
      }));
    },
    []
  );

  // 计算节点位置并添加选中状态
  const getNodesWithPositionAndSelection = useCallback(
    (stage: FlowStage) => {
      // 先计算节点位置
      const nodesWithPosition = calculateNodePositions(stage.nodes, stage.edges);

      // 再添加选中状态
      return nodesWithPosition.map((node) => ({
        ...node,
        selected: node.id === selectedNodes[stage.id],
        // 添加节点类型，确保使用自定义节点
        type: 'custom',
      }));
    },
    [selectedNodes]
  );

  // 当没有数据时显示提示信息
  if (stagesToShow.length === 0) {
    return (
      <div className="flex flex-col h-screen bg-gray-50 items-center justify-center">
        <p className="text-lg text-gray-500">暂无数据，请先进行查询</p>
      </div>
    );
  }

  // 渲染流程图
  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <ScrollArea className="flex-1">
        <div className="space-y-4 mx-4">
          {stagesToShow.map((stage) => (
            <div key={stage.id} className="bg-white rounded-lg shadow-sm overflow-hidden">
              {/* 阶段标题和统计信息 */}
              <div className="p-4 border-b">
                <h2 className="text-xl font-bold">{stage.name}</h2>
                <div className="text-sm text-gray-500 mt-1">
                  总任务: {stage.stats.total} | 成功: {stage.stats.success} | 失败:{' '}
                  {stage.stats.failed} | 运行中: {stage.stats.running} | 等待中:{' '}
                  {stage.stats.waiting}
                </div>
              </div>

              {/* 流程图容器 */}
              <div style={{ height: '500px' }}>
                <ReactFlow
                  nodes={getNodesWithPositionAndSelection(stage)}
                  edges={stage.edges}
                  nodeTypes={nodeTypes}
                  fitView
                  onNodeClick={onNodeClick(stage.id)}
                  onPaneClick={onPaneClick(stage.id)}
                  defaultEdgeOptions={{
                    type: 'smoothstep',
                    style: {
                      strokeWidth: 2, // 增加边的粗细
                      stroke: '#888', // 设置边的颜色
                      strokeDasharray: '', // 实线
                    },
                    animated: true, // 添加动画效果
                    markerEnd: {
                      type: MarkerType.ArrowClosed,
                      color: '#888', // 调整箭头颜色
                      width: 20, // 增加箭头宽度
                      height: 20, // 增加箭头高度
                    },
                  }}
                  // 视图设置
                  defaultViewport={{ x: 0, y: 0, zoom: 1 }}
                  minZoom={0.5}
                  maxZoom={2}
                  snapToGrid={true}
                  snapGrid={[15, 15]}
                  // 添加全局样式
                  className="react-flow-wrapper"
                  proOptions={{
                    hideAttribution: true,
                    account: 'paid-pro',
                  }}
                  // 提高性能的选项
                  elevateNodesOnSelect={true}
                  elementsSelectable={true}
                  zoomOnScroll={true}
                  panOnScroll={true}
                  panOnDrag={true}
                >
                  {/* 背景网格 */}
                  <Background color="#f8f8f8" gap={16} size={1} />
                  {/* 控制面板 */}
                  <Controls showInteractive={true} />
                  {/* 小地图 */}
                  <MiniMap nodeStrokeWidth={3} zoomable pannable />
                </ReactFlow>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
