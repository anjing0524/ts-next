import '@xyflow/react/dist/style.css';
import { DagFlow } from './components/dag-flow';
import { Query } from './components/query';
import { getAllPlanConf, handleSearch } from '@/app/actions/flow-actions';
import { PlanConf } from '@/types/db-types';

export default async function Flow() {
  const planConfs: PlanConf[] = await getAllPlanConf();
  // 从 Map 中提取选项列表
  const options = Array.from(new Set(planConfs.map((planConf) => planConf.time_stage as string)));
  return (
    <>
      <Query options={options} onSearch={handleSearch} />
      <DagFlow />
    </>
  );
}
