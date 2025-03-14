import { Handle, NodeProps, Position } from '@xyflow/react';
import { CheckCircle, XCircle, Clock, Play } from 'lucide-react';
import { PlanStateWithTimeStage } from '../types/type';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// 自定义节点组件
export const CustomNode = ({ data, isConnectable, selected }: NodeProps) => {
  // 从data中获取更多信息
  const { plan_id, plan_desc, plan_state, progress, cost_time } =
    data as unknown as PlanStateWithTimeStage;

  // 根据状态设置不同的样式和图标
  const statusConfig = {
    D: {
      icon: CheckCircle,
      borderClass: 'border-green-400 shadow-[0_0_0_1px_rgba(74,222,128,0.5)]',
      statusText: '成功',
      statusColor: 'text-green-500',
      bgColor: 'bg-green-500',
    },
    F: {
      icon: XCircle,
      borderClass: 'border-red-400 shadow-[0_0_0_1px_rgba(248,113,113,0.5)]',
      statusText: '失败',
      statusColor: 'text-red-500',
      bgColor: 'bg-red-500',
    },
    R: {
      icon: Play,
      borderClass: 'border-blue-400 shadow-[0_0_0_1px_rgba(59,130,246,0.5)]',
      statusText: '运行中',
      statusColor: 'text-blue-500',
      bgColor: 'bg-blue-500',
    },
    P: {
      icon: Clock,
      borderClass: 'border-yellow-400 shadow-[0_0_0_1px_rgba(250,204,21,0.5)]',
      statusText: '等待中',
      statusColor: 'text-yellow-500',
      bgColor: 'bg-yellow-500',
    },
    Z: {
      icon: Clock,
      borderClass: 'border-yellow-400 shadow-[0_0_0_1px_rgba(250,204,21,0.5)]',
      statusText: '等待中',
      statusColor: 'text-yellow-500',
      bgColor: 'bg-yellow-500',
    },
  };

  const config = statusConfig[plan_state as keyof typeof statusConfig] || statusConfig.P;
  const StatusIcon = config.icon;

  // 根据 plan_id 长度动态调整节点宽度
  const getNodeWidth = () => {
    if (!plan_id) return 'w-[220px]';
    if (plan_id.length > 20) return 'w-[280px]';
    if (plan_id.length > 15) return 'w-[250px]';
    return 'w-[220px]';
  };

  return (
    <div
      className={cn(
        'relative bg-white rounded-md p-3',
        getNodeWidth(),
        'border border-gray-200',
        'transition-all duration-150 ease-in-out hover:shadow-md',
        selected && config.borderClass
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        className="w-3 h-3 bg-gray-400"
      />

      {/* 计划ID和描述 */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="font-medium text-sm truncate max-w-[65%]" title={`${plan_id}`}>
                  {plan_id}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>{plan_id}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className={`text-xs ${config.statusColor}`}>{config.statusText}</span>
            <StatusIcon size={16} className={config.statusColor} />
          </div>
        </div>

        {plan_desc && (
          <div className="text-xs text-gray-600 truncate" title={plan_desc}>
            {plan_desc}
          </div>
        )}
        {progress !== undefined && (
          <div className="mt-2">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${config.bgColor}`}
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-xs mt-1 text-gray-600">
              <span>{progress}</span>
              {cost_time && <span>{cost_time}秒</span>}
            </div>
          </div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        className="w-3 h-3 bg-gray-400"
      />
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 w-1 rounded-tl-md rounded-bl-md',
          config.bgColor
        )}
      />
    </div>
  );
};

export const nodeTypes = {
  custom: CustomNode,
};
