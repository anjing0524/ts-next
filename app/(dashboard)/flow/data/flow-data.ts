import { Node, Edge } from '@xyflow/react';

// 初始节点数据
export const initialNodes: Node[] = [
  {
    id: '1',
    type: 'custom',
    position: { x: 250, y: 0 },
    data: { label: '读数据', status: 'success', showButton: false },
  },
  {
    id: '2',
    type: 'custom',
    position: { x: 250, y: 100 },
    data: { label: '逻辑回归', status: 'success', showButton: false },
  },
  {
    id: '3',
    type: 'custom',
    position: { x: 100, y: 200 },
    data: { label: '模型预测', status: 'success', showButton: false },
  },
  {
    id: '4',
    type: 'custom',
    position: { x: 400, y: 200 },
    data: { label: '读取参数', status: 'error', showButton: false },
  },
];

// 初始边数据
export const initialEdges: Edge[] = [
  {
    id: 'e1-2',
    source: '1',
    target: '2',
    type: 'smoothstep',
    style: { stroke: '#ccc' },
  },
  {
    id: 'e2-3',
    source: '2',
    target: '3',
    type: 'smoothstep',
    style: { stroke: '#ccc' },
  },
  {
    id: 'e2-4',
    source: '2',
    target: '4',
    type: 'smoothstep',
    style: { stroke: '#ccc' },
  },
];
