import { Handle, NodeProps, Position } from '@xyflow/react';
import { CheckCircle, XCircle, Settings } from 'lucide-react';

// 自定义节点组件
export const CustomNode = ({ data, isConnectable, selected }: NodeProps) => {
  const { label, status } = data;
  // 根据状态设置不同的样式
  let StatusIcon = null;
  let borderClass = '';

  if (status === 'success') {
    StatusIcon = CheckCircle;
    borderClass = selected ? 'border-green-400 shadow-[0_0_0_1px_rgba(74,222,128,0.5)]' : '';
  } else if (status === 'error') {
    StatusIcon = XCircle;
    borderClass = selected ? 'border-red-400 shadow-[0_0_0_1px_rgba(248,113,113,0.5)]' : '';
  } else if (status === 'waiting') {
    borderClass = selected ? 'border-yellow-400 shadow-[0_0_0_1px_rgba(250,204,21,0.5)]' : '';
  }

  return (
    <div
      className={`
        relative bg-white rounded-md p-3 w-[180px]
        border ${selected ? borderClass : 'border-gray-200'}
        transition-shadow duration-150 ease-in-out
      `}
    >
      <Handle type="target" position={Position.Top} isConnectable={isConnectable} />
      <div className="flex items-center gap-2">
        <Settings size={16} className="text-gray-500" />
        <span>{label as string}</span>
        {StatusIcon && (
          <StatusIcon
            size={16}
            className={status === 'success' ? 'text-green-500' : 'text-red-500'}
          />
        )}
      </div>
      <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} />

      {/* 左侧绿色或红色指示条 */}
      <div
        className={`
          absolute left-0 top-0 bottom-0 w-1 rounded-tl-md rounded-bl-md
          ${status === 'error' ? 'bg-red-500' : 'bg-green-500'}
        `}
      />

      {selected && status === 'success' && (
        <div
          className="absolute inset-0 rounded-md border border-green-400 pointer-events-none"
          style={{ boxShadow: '0 0 0 1px rgba(74, 222, 128, 0.5)' }}
        />
      )}
      {selected && status === 'error' && (
        <div
          className="absolute inset-0 rounded-md border border-red-400 pointer-events-none"
          style={{ boxShadow: '0 0 0 1px rgba(248, 113, 113, 0.5)' }}
        />
      )}
    </div>
  );
};

export const nodeTypes = {
  custom: CustomNode,
};
