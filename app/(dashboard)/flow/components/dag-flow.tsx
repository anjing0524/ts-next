'use client';

import { ReactFlow, Background, Controls, MiniMap, Node, MarkerType, Edge } from '@xyflow/react';

import '@xyflow/react/dist/style.css';
import { useCallback, useMemo } from 'react';

import { useShallow } from 'zustand/react/shallow';

import { useFlowStore, FlowStage } from '@/app/(dashboard)/flow/store/flow-store';
import { ScrollArea } from '@/components/ui/scroll-area';

import { nodeTypes } from './customer-node';


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

  // 增加间距以提高可读性
  const horizontalGap = 300; // 增加水平间距
  const verticalGap = 250; // 增加垂直间距

  // 为每一层的节点分配位置
  layers.forEach((layer, layerIndex) => {
    // 计算当前层的总宽度
    const layerWidth = (layer.length - 1) * horizontalGap;
    // 计算起始X坐标，使当前层居中
    const startX = -layerWidth / 2;

    // 为当前层的每个节点分配位置
    layer.forEach((nodeId, nodeIndex) => {
      // 计算基础位置
      const baseX = startX + nodeIndex * horizontalGap;
      const baseY = layerIndex * verticalGap;

      // 为节点添加一些随机偏移，避免边完全重叠
      const offsetX = (nodeIndex % 2 === 0 ? 1 : -1) * 20;

      nodePositions[nodeId] = {
        x: baseX + offsetX,
        y: baseY,
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

  // 根据当前选中的阶段过滤要显示的数据
  const stagesToShow = useMemo(() => {
    if (!currentStage) {
      return stages; // 如果没有选中阶段，显示所有阶段
    }
    return stages.filter((stage) => stage.name === currentStage);
  }, [stages, currentStage]);

  // 计算节点位置
  const getNodesWithPosition = useCallback((stage: FlowStage) => {
    // 计算节点位置
    const nodesWithPosition = calculateNodePositions(stage.nodes, stage.edges);

    // 添加节点类型，确保使用自定义节点
    return nodesWithPosition.map((node) => ({
      ...node,
      type: 'custom',
    }));
  }, []);

  // 计算流程图容器的动态高度
  const calculateFlowHeight = useCallback((stage: FlowStage) => {
    // 获取节点位置信息
    const nodesWithPosition = calculateNodePositions(stage.nodes, stage.edges);
    // 如果没有节点，返回默认高度
    if (nodesWithPosition.length === 0) return 600;
    // 找出最大的y坐标值
    const maxY = Math.max(...nodesWithPosition.map((node) => node.position.y));
    // 根据最大y值计算合适的高度，加上额外空间以确保底部节点完全显示
    // 假设每个节点高度约为100px，底部需要额外200px的空间
    const calculatedHeight = maxY + 300;
    // 设置最小高度为600px，确保即使节点很少也有足够的显示空间
    return Math.max(600, calculatedHeight);
  }, []);

  // 当没有数据时显示提示信息
  if (stagesToShow.length === 0) {
    return (
      <div className="flex flex-col h-16 bg-gray-50 items-center justify-center">
        <p className="text-lg text-gray-500">暂无数据，请先进行查询</p>
      </div>
    );
  }

  // 渲染流程图
  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 h-full">
        <div className="space-y-6 pb-8">
          {stagesToShow.map((stage) => (
            <div key={stage.id} className="bg-white rounded-lg shadow-sm overflow-hidden">
              {/* 阶段标题和统计信息 */}
              <div className="p-4 border-b border-border/30">
                <h2 className="text-xl font-bold">{stage.name}</h2>
                <div className="text-sm text-muted-foreground mt-1">
                  总任务: {stage.stats.total} | 成功: {stage.stats.success} | 失败:{' '}
                  {stage.stats.failed} | 运行中: {stage.stats.running} | 等待中:{' '}
                  {stage.stats.waiting}
                </div>
              </div>

              {/* 流程图容器 - 使用动态高度 */}
              <div style={{ height: `${calculateFlowHeight(stage)}px` }} className="relative">
                <ReactFlow
                  nodes={getNodesWithPosition(stage)}
                  edges={stage.edges}
                  nodeTypes={nodeTypes}
                  fitView
                  fitViewOptions={{
                    padding: 0.2, // 增加边距，确保所有节点可见
                    includeHiddenNodes: true,
                    duration: 800, // 平滑过渡动画
                  }}
                  defaultEdgeOptions={{
                    type: 'default',
                    style: {
                      strokeWidth: 2,
                      stroke: '#888',
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
                  minZoom={0.6} // 限制最小缩放比例，防止内容过小
                  maxZoom={1.5} // 限制最大缩放比例，防止内容过大
                  snapToGrid={true}
                  snapGrid={[15, 15]}
                  // 添加全局样式
                  className="react-flow-wrapper"
                  proOptions={{
                    hideAttribution: true,
                    account: 'paid-pro',
                  }}
                  // 提高性能的选项
                  elevateNodesOnSelect={false}
                  elementsSelectable={false}
                  zoomOnScroll={false} // 禁用滚轮缩放，避免意外操作
                  panOnScroll={false} // 禁用滚轮平移，避免意外操作
                  panOnDrag={true}
                  nodesConnectable={false}
                  preventScrolling={false} // 允许页面滚动
                >
                  {/* 背景网格 */}
                  <Background color="#f8f8f8" gap={16} size={1} />
                  {/* 控制面板 */}
                  <Controls
                    showInteractive={true}
                    position="bottom-right"
                    style={{
                      bottom: 10,
                      right: 10,
                      display: 'flex',
                      flexDirection: 'row',
                      gap: '5px',
                    }}
                  />
                  {/* 小地图 */}
                  <MiniMap
                    nodeStrokeWidth={3}
                    zoomable
                    pannable
                    position="top-right"
                    style={{
                      top: 10,
                      right: 10,
                      width: 150,
                      height: 100,
                    }}
                  />
                </ReactFlow>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
