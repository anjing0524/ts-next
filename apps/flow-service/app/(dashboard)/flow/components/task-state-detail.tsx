'use client';
import React, { useEffect, useState } from 'react';

import { Loader2 } from 'lucide-react';

import { getTaskInfo } from '@/app/actions/flow-actions';
import {
  Badge,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Separator,
} from '@repo/ui';

import { TASK_STATE_MAP } from '../cons';
import { TaskStateDetailType } from '../types/type';

interface TaskDetailProps {
  isOpen: boolean;
  onClose: () => void;
  taskPk: string | number | null;
  redate: string | null;
}

export function TaskStateDetail({ isOpen, onClose, taskPk, redate }: TaskDetailProps) {
  const [taskDetail, setTaskDetail] = useState<TaskStateDetailType | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    async function fetchTaskDetail() {
      if (!taskPk || !redate) return;
      try {
        setLoading(true);
        const detail = await getTaskInfo(taskPk, redate);
        setTaskDetail(detail);
      } catch (error) {
        console.error('获取任务详情失败:', error);
      } finally {
        setLoading(false);
      }
    }

    if (isOpen && taskPk) {
      fetchTaskDetail();
    }
  }, [isOpen, taskPk, redate]);

  // 定义详情项
  const detailItems = taskDetail
    ? [
        { label: '任务ID', value: taskDetail.task_id, className: 'col-span-2 break-all' },
        { label: '计划ID', value: taskDetail.plan_id },
        { label: '执行ID', value: taskDetail.exe_id },
        {
          label: '任务状态',
          value: taskDetail.task_state,
          render: (value: string) => {
            const stateInfo = TASK_STATE_MAP[value] || { label: value, variant: 'default' };
            return <Badge variant={stateInfo.variant}>{stateInfo.label || value}</Badge>;
          },
        },
        { label: '调度日期', value: taskDetail.redateFormatted },
        { label: '开始时间', value: taskDetail.startTimeFormatted },
        { label: '结束时间', value: taskDetail.endTimeFormatted },
        { label: '耗时(秒)', value: taskDetail.cost_time },
        {
          label: '执行命令',
          value: taskDetail.exec_cmd,
          className: 'col-span-2 break-all',
        },
        {
          label: '执行信息',
          value: taskDetail.exec_desc,
          className: 'col-span-2 break-all',
        },
        { label: '返回值', value: taskDetail.ret_value },
      ]
    : [];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>任务详细信息</DialogTitle>
          <DialogDescription>任务编号: {taskPk}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !taskDetail ? (
          <div className="text-center py-12 text-muted-foreground">未找到任务详情</div>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 gap-4">
                {detailItems.map((item, index) => (
                  <div key={index} className={`flex flex-col space-y-1 ${item.className || ''}`}>
                    <div className="text-sm font-medium text-muted-foreground">{item.label}</div>
                    <div className="text-sm">
                      {item.render ? item.render(`${item.value}`) : item.value || '-'}
                    </div>
                    {index < detailItems.length - 1 && <Separator className="mt-2" />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </DialogContent>
    </Dialog>
  );
}
