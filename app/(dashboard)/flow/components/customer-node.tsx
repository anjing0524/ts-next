'use client';
import { useState, useCallback } from 'react';
import { Handle, NodeProps, Position } from '@xyflow/react';
import {
  CheckCircle,
  XCircle,
  Clock,
  Play,
  RefreshCw,
  AlertCircle,
  Info,
  StopCircle,
} from 'lucide-react';
import { PlanStateWithStatus } from '../types/type';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { useFlowStore } from '../store/flow-store';
import { useShallow } from 'zustand/react/shallow';
import { rerunPlan, rerunFailedTasks, stopPlan, handleSearch } from '@/app/actions/flow-actions';
import { format } from 'date-fns';
import { toast } from '@/components/ui/use-toast';

export const CustomNode = ({ data, isConnectable }: NodeProps) => {
  // 获取 openTaskDetail 方法和 refreshData 方法
  const { openTaskDetail, date, projects, setStages } = useFlowStore(
    useShallow((state) => ({
      openTaskDetail: state.openTaskDetail,
      projects: state.projects,
      date: state.dateTimestamp,
      setStages: state.setStages,
    }))
  );
  // 刷新函数
  const refresh = useCallback(() => {
    if (date) {
      setImmediate(async () => {
        const result = await handleSearch(new Date(date), projects);
        if (result) {
          setStages(result);
        }
      });
    }
  }, [date, projects]);

  // 在需要打开任务详情对话框的地方
  const [loading, setLoading] = useState<string | null>(null);
  // 从data中获取更多信息
  const { plan_id, plan_desc, progress, cost_time, redate, exe_id, status, pid } =
    data as any as PlanStateWithStatus;

  // 使用 useCallback 优化函数，依赖项包括 plan_id, plan_desc, redate, exe_id 和 openTaskDetail
  const handleViewDetails = useCallback(() => {
    if (plan_id && redate && exe_id) {
      openTaskDetail(plan_id as string, plan_desc, redate as Date, exe_id as number);
    }
  }, [plan_id, plan_desc, redate, exe_id, openTaskDetail]);

  const handleButtonClick = useCallback((e: React.MouseEvent, callback: () => void) => {
    e.stopPropagation();
    callback();
  }, []);

  // 处理重跑计划
  const handleRerun = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!plan_id || !redate) return;
      try {
        setLoading('rerun');
        const formattedDate = format(new Date(redate), 'yyyy-MM-dd');
        const result = await rerunPlan(plan_id as string, formattedDate);
        if (result.success) {
          toast({
            title: '操作成功',
            description: result.message,
            variant: 'success',
          });
        } else {
          toast({
            title: '操作失败',
            description: result.message,
            variant: 'error',
          });
        }
      } catch (error) {
        toast({
          title: '操作异常',
          description: error instanceof Error ? error.message : '未知错误',
          variant: 'error',
        });
      } finally {
        refresh();
        setLoading(null);
      }
    },
    [plan_id, redate]
  );

  // 处理重跑失败任务
  const handleRerunFailed = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!plan_id || !redate || !exe_id) return;

      try {
        setLoading('rerunFailed');
        const formattedDate = format(new Date(redate), 'yyyy-MM-dd');
        const result = await rerunFailedTasks(plan_id as string, formattedDate, exe_id as number);

        if (result.success) {
          toast({
            title: '操作成功',
            description: result.message,
            variant: 'success',
          });
        } else {
          toast({
            title: '操作失败',
            description: result.message,
            variant: 'error',
          });
        }
      } catch (error) {
        toast({
          title: '操作异常',
          description: error instanceof Error ? error.message : '未知错误',
          variant: 'error',
        });
      } finally {
        refresh();
        setLoading(null);
      }
    },
    [plan_id, redate, exe_id]
  );

  // 处理停止计划
  const handleStop = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!plan_id || !redate || !pid) return;

      try {
        setLoading('stop');
        const formattedDate = format(new Date(redate), 'yyyy-MM-dd');
        const result = await stopPlan(plan_id as string, formattedDate, pid);
        if (result.success) {
          toast({
            title: '操作成功',
            description: result.message,
            variant: 'success',
          });
        } else {
          toast({
            title: '操作失败',
            description: result.message,
            variant: 'error',
          });
        }
      } catch (error) {
        toast({
          title: '操作异常',
          description: error instanceof Error ? error.message : '未知错误',
          variant: 'error',
        });
      } finally {
        refresh();
        setLoading(null);
      }
    },
    [plan_id, redate, pid]
  );

  // 状态配置映射表 - 直接使用 status 字段
  const statusConfig = {
    success: {
      icon: CheckCircle,
      statusText: '成功',
      statusColor: 'text-green-500',
      bgColor: 'bg-green-500',
    },
    error: {
      icon: XCircle,
      statusText: '失败',
      statusColor: 'text-red-500',
      bgColor: 'bg-red-500',
    },
    running: {
      icon: Play,
      statusText: '运行中',
      statusColor: 'text-blue-500',
      bgColor: 'bg-blue-500',
    },
    waiting: {
      icon: Clock,
      statusText: '等待中',
      statusColor: 'text-yellow-500',
      bgColor: 'bg-yellow-500',
    },
  };

  // 直接使用 status 字段，如果没有则默认为 waiting
  const nodeStatus = status || 'waiting';
  const config = statusConfig[nodeStatus as keyof typeof statusConfig] || statusConfig.waiting;
  const StatusIcon = config.icon;

  // 根据 plan_id 长度动态调整节点宽度
  const getNodeWidth = () => {
    if (!plan_id) return 'w-[220px]';
    if (plan_id.length > 20) return 'w-[280px]';
    if (plan_id.length > 15) return 'w-[250px]';
    return 'w-[220px]';
  };

  // 根据状态渲染不同的操作按钮
  const renderActionButtons = () => {
    // 根据 nodeStatus 显示不同的按钮
    switch (nodeStatus) {
      case 'success':
        return (
          <div className="flex gap-1 mt-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs flex items-center gap-1"
              disabled={loading !== null}
              onClick={(e) => handleButtonClick(e, handleViewDetails)}
            >
              <Info className="h-3 w-3" />
              详情
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs flex items-center gap-1 text-blue-600"
              onClick={handleRerun}
              disabled={loading !== null}
            >
              {loading === 'rerun' ? (
                <Clock className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              重跑
            </Button>
          </div>
        );
      case 'error':
        return (
          <div className="flex gap-1 mt-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs flex items-center gap-1"
              onClick={(e) => handleButtonClick(e, handleViewDetails)}
              disabled={loading !== null}
            >
              <Info className="h-3 w-3" />
              详情
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs flex items-center gap-1 text-blue-600"
              onClick={handleRerun}
              disabled={loading !== null}
            >
              {loading === 'rerun' ? (
                <Clock className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              重跑
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs flex items-center gap-1 text-yellow-600"
              onClick={handleRerunFailed}
              disabled={loading !== null}
            >
              {loading === 'rerunFailed' ? (
                <Clock className="h-3 w-3 animate-spin" />
              ) : (
                <AlertCircle className="h-3 w-3" />
              )}
              重跑失败
            </Button>
          </div>
        );
      case 'running':
        return (
          <div className="flex gap-1 mt-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs flex items-center gap-1"
              onClick={(e) => handleButtonClick(e, handleViewDetails)}
              disabled={loading !== null}
            >
              <Info className="h-3 w-3" />
              详情
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs flex items-center gap-1 text-red-600"
              onClick={handleStop}
              disabled={loading !== null}
            >
              {loading === 'stop' ? (
                <Clock className="h-3 w-3 animate-spin" />
              ) : (
                <StopCircle className="h-3 w-3" />
              )}
              停止
            </Button>
          </div>
        );
      default: // 其他状态
        return (
          <div className="flex gap-1 mt-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs flex items-center gap-1"
              onClick={(e) => handleButtonClick(e, handleViewDetails)}
              disabled={loading !== null}
            >
              <Info className="h-3 w-3" />
              详情
            </Button>
          </div>
        );
    }
  };

  return (
    <>
      <div
        className={cn(
          'relative bg-white rounded-md p-3',
          getNodeWidth(),
          'border border-gray-200',
          'transition-all duration-150 ease-in-out hover:shadow-md'
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
                <span>{progress}%</span>
                {cost_time && <span>{cost_time}秒</span>}
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          {renderActionButtons()}
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
    </>
  );
};

export const nodeTypes = {
  custom: CustomNode,
};
