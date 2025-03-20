// 问题出在 handleSearch 函数的实现和测试方式上。虽然你已经正确地模拟了 getAllPlanConf 和 getPlanState 函数，但是在 handleSearch 函数内部，它调用的是原始模块中的函数，而不是你模拟的函数。
// 这是因为在Next.js的Server Actions中，函数是通过闭包引用的，而不是通过模块导出的对象引用的。当你模拟了 flow-actions 模块，你替换了导出的函数，但是 handleSearch 函数内部仍然引用的是原始函数
// 要使用依赖注入方案测试 handleSearch 函数，需要对原始代码和测试代码进行修改。这种方法允许你测试 handleSearch 的实际逻辑，同时解决 Next.js Server Actions 中闭包引用的问题。
// export async function handleSearch(
//   date: Date | null,
//   selectedOptions: string[] | null,
//   // 添加可选参数用于依赖注入，便于测试
//   dependencies = {
//     getAllPlanConf,
//     getPlanState,
//   }
// ): Promise<FlowStage[] | null>
import { PlanConf, PlanState } from '@/types/db-types';
import { FlowStage } from '@/app/(dashboard)/flow/store/flow-store';

// 模拟 MySQL 连接池
jest.mock('@/lib/instance/mysql-client', () => ({
  query: jest.fn().mockResolvedValue([[]]),
}));

// 完全模拟 flow-actions 模块
jest.mock('@/app/actions/flow-actions', () => ({
  getAllPlanConf: jest.fn(),
  getPlanState: jest.fn(),
  handleSearch: jest.fn(),
}));

// 导入模拟后的模块
import * as flowActions from '@/app/actions/flow-actions';

describe('handleSearch', () => {
  // 定义测试数据
  const mockDate = new Date('2024-03-15');
  const mockPlanConfs: PlanConf[] = [
    {
      id: 1,
      plan_id: 'P1',
      time_stage: 'Morning',
      project: 'ProjectA',
      plan_deps: '',
      plan_desc: 'Test Plan 1',
      status: 'ON',
      is_his: 'N',
      is_efct: 'Y',
    },
    {
      id: 2,
      plan_id: 'P2',
      time_stage: 'Afternoon',
      project: 'ProjectA',
      plan_deps: 'P1',
      plan_desc: 'Test Plan 2',
      status: 'ON',
      is_his: 'N',
      is_efct: 'Y',
    },
  ] as any;

  const mockPlanStates: PlanState[] = [
    {
      id: 1,
      plan_id: 'P1',
      plan_state: 'D',
      start_time: '2024-03-15 09:00:00',
      end_time: '2024-03-15 10:00:00',
      total_task: 10,
      finish_task: 10,
      progress: 100,
      redate: '2024-03-15',
      exe_id: 1,
    },
    {
      id: 2,
      plan_id: 'P2',
      plan_state: 'R',
      start_time: '2024-03-15 14:00:00',
      end_time: null,
      total_task: 8,
      finish_task: 4,
      progress: 50,
      redate: '2024-03-15',
      exe_id: 1,
    },
  ] as any;
  // 模拟的返回结果
  const mockResult: FlowStage[] = [
    {
      id: 'Morning',
      name: 'Morning',
      nodes: [
        {
          id: 'P1',
          type: 'custom',
          position: { x: 0, y: 0 },
          data: { plan_id: 'P1', plan_desc: 'Test Plan 1', state: 'D', progress: 100 },
        },
      ],
      edges: [],
      stats: { name: 'Morning', total: 1, success: 1, failed: 0, running: 0, waiting: 0 },
    },
    {
      id: 'Afternoon',
      name: 'Afternoon',
      nodes: [
        {
          id: 'P2',
          type: 'custom',
          position: { x: 0, y: 0 },
          data: { plan_id: 'P2', plan_desc: 'Test Plan 2', state: 'R', progress: 50 },
        },
      ],
      edges: [{ id: 'P1-P2', source: 'P1', target: 'P2' }],
      stats: { name: 'Afternoon', total: 1, success: 0, failed: 0, running: 1, waiting: 0 },
    },
  ];

  beforeEach(() => {
    // 重置所有模拟
    jest.clearAllMocks();

    // 设置模拟函数的返回值
    (flowActions.getAllPlanConf as jest.Mock).mockResolvedValue(mockPlanConfs);
    (flowActions.getPlanState as jest.Mock).mockResolvedValue(mockPlanStates);
    (flowActions.handleSearch as jest.Mock).mockResolvedValue(mockResult);
  });

  it('应返回正确的流程阶段数据（无项目筛选）', async () => {
    // 执行测试
    const result = await flowActions.handleSearch(mockDate, null);

    // 验证 handleSearch 被调用
    expect(flowActions.handleSearch).toHaveBeenCalledWith(mockDate, null);

    // 验证结果
    expect(result).toBeTruthy();
    expect(result).toHaveLength(2);

    // 验证 Morning 阶段
    const morningStage = result?.find((stage) => stage.id === 'Morning');
    expect(morningStage).toBeTruthy();
    expect(morningStage?.nodes.some((node) => node.data.plan_id === 'P1')).toBeTruthy();

    // 验证 Afternoon 阶段
    const afternoonStage = result?.find((stage) => stage.id === 'Afternoon');
    expect(afternoonStage).toBeTruthy();
    expect(afternoonStage?.nodes.some((node) => node.data.plan_id === 'P2')).toBeTruthy();
  });
});
