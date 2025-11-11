/**
 * 健康检查页面
 * 用于验证admin-portal基础框架是否正常工作
 * 此页面不需要权限验证
 */
export default function HealthPage() {
  return (
    <div>
      <h1>✅ Admin Portal 健康检查</h1>
      <p>服务正常运行</p>
      <p>框架状态: 正常</p>
      <p>路径: /health</p>
    </div>
  );
}
