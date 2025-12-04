'use server';
import { AuditLogTable } from './AuditLogTable';

export async function AuditLogListContainer({ page, limit }: { page: number; limit: number }) {
  try {
    return <AuditLogTable logs={[]} total={0} page={page} limit={limit} />;
  } catch (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4"><p className="text-red-800">加载列表时出错</p></div>;
  }
}
