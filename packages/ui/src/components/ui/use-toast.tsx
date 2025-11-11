'use client';

import { toast as reactToastify } from 'react-toastify';

type ToastProps = {
  title?: string;
  description?: string;
  variant?:
    | 'success'
    | 'error'
    | 'destructive'
    | 'default'
    | 'info'
    | 'warning'
    | 'loading'
    | 'custom'
    | undefined;
};

export const toast = (props: ToastProps) => {
  const { title, description, variant } = props;
  const message = title ? (description ? `${title}: ${description}` : title) : description;

  if (variant === 'error') {
    return reactToastify.error(message);
  }
  if (variant === 'success') {
    return reactToastify.success(message);
  }
  return reactToastify.info(message);
};

// 为了兼容性，添加这些方法
toast.success = (props: ToastProps) => {
  const { title, description } = props;
  const message = title ? (description ? `${title}: ${description}` : title) : description;
  return reactToastify.success(message);
};

toast.error = (props: ToastProps) => {
  const { title, description } = props;
  const message = title ? (description ? `${title}: ${description}` : title) : description;
  return reactToastify.error(message);
};
