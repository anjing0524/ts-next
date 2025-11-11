'use client';

import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  toast,
} from '@repo/ui';
import { Eye, EyeOff, Copy } from 'lucide-react';

interface ClientSecretDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  clientName?: string;
  clientSecret: string | null;
}

export function ClientSecretDialog({
  isOpen,
  onOpenChange,
  clientName,
  clientSecret,
}: ClientSecretDialogProps) {
  const [showSecret, setShowSecret] = useState(false);

  const handleCopySecret = () => {
    if (clientSecret) {
      navigator.clipboard
        .writeText(clientSecret)
        .then(() => {
          toast({ title: '已复制', description: '客户端密钥已复制到剪贴板。' });
        })
        .catch((err) => {
          toast({
            variant: 'destructive',
            title: '复制失败',
            description: '无法复制密钥: ' + err.message,
          });
        });
    }
  };

  if (!clientSecret) return null; // Should not happen if dialog is opened with a secret

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>客户端密钥 - {clientName || '新客户端'}</DialogTitle>
          <DialogDescription>
            请立即复制并妥善保管此客户端密钥。
            <strong className="text-destructive">关闭此窗口后将无法再次查看。</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="my-4 p-3 bg-muted rounded-md font-mono text-sm break-all relative group">
          <span>
            {showSecret ? clientSecret : '••••••••••••••••••••••••••••••••••••••••••••••••••'}
          </span>
          <div className="absolute top-1 right-1 flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setShowSecret((s) => !s)}
              title={showSecret ? '隐藏密钥' : '显示密钥'}
            >
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleCopySecret}
              title="复制密钥"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="default" onClick={() => onOpenChange(false)}>
            我已保存密钥，关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
