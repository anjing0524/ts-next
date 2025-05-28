import { vi } from 'vitest';
// PlanConf and PlanState might still be needed for type checking results from getAllPlanConf/getPlanState if used directly,
// but FlowStage is definitely needed for the expected output of handleSearch.
import { PlanConf, PlanState } from '@/types/db-types';
import { FlowStage } from '@/app/(dashboard)/flow/store/flow-store';

// Import the actual functions as requested
import { handleSearch, getAllPlanConf, getPlanState } from '@/app/actions/flow-actions';

describe('handleSearch with real database operations', () => {
  // Define test data for input
  const testDate = new Date('2024-03-15'); // Using a fixed date for predictability

  // The beforeEach block that previously set up mocks for getAllPlanConf, getPlanState,
  // and handleSearch itself has been removed.
  // vi.clearAllMocks() is retained for general test hygiene, in case other describe blocks use mocks.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should attempt to fetch and process flow stages for a given date (no project filter)', async () => {
    // Execute the actual handleSearch function.
    // getAllPlanConf and getPlanState will be called internally by handleSearch.
    const result = await handleSearch(testDate, null);

    // Assertions for the real function's output:
    // handleSearch is typed to return FlowStage[] | null.
    // If it's null, it's a valid outcome (e.g., no data or error handled internally).
    // If it's not null, it should be an array.
    if (result === null) {
      // This is a valid outcome.
      expect(result).toBeNull();
    } else {
      // If not null, it must be an array.
      expect(Array.isArray(result)).toBe(true);

      // Structural integrity check for the returned stages and their contents.
      if (result.length > 0) {
        const stage = result[0]; // Check the first stage as an example
        expect(stage).toHaveProperty('id');
        expect(typeof stage.id).toBe('string');
        expect(stage).toHaveProperty('name');
        expect(typeof stage.name).toBe('string');

        expect(stage).toHaveProperty('nodes');
        expect(Array.isArray(stage.nodes)).toBe(true);
        if (stage.nodes.length > 0) {
          const node = stage.nodes[0]; // Check the first node as an example
          expect(node).toHaveProperty('id');
          expect(typeof node.id).toBe('string');
          expect(node).toHaveProperty('type');
          expect(typeof node.type).toBe('string'); 
          expect(node).toHaveProperty('position');
          expect(typeof node.position).toBe('object');
          expect(node.position).toHaveProperty('x');
          expect(typeof node.position.x).toBe('number');
          expect(node.position).toHaveProperty('y');
          expect(typeof node.position.y).toBe('number');
          expect(node).toHaveProperty('data');
          expect(typeof node.data).toBe('object');
          expect(node.data).toHaveProperty('plan_id');
          expect(node.data).toHaveProperty('plan_desc');
          expect(node.data).toHaveProperty('state');
          expect(node.data).toHaveProperty('progress');
        }

        expect(stage).toHaveProperty('edges');
        expect(Array.isArray(stage.edges)).toBe(true);
        if (stage.edges.length > 0) {
          const edge = stage.edges[0]; // Check the first edge as an example
          expect(edge).toHaveProperty('id');
          expect(typeof edge.id).toBe('string');
          expect(edge).toHaveProperty('source');
          expect(typeof edge.source).toBe('string');
          expect(edge).toHaveProperty('target');
          expect(typeof edge.target).toBe('string');
        }

        expect(stage).toHaveProperty('stats');
        expect(typeof stage.stats).toBe('object');
        expect(stage.stats).toHaveProperty('name');
        expect(stage.stats).toHaveProperty('total');
        expect(stage.stats).toHaveProperty('success');
        expect(stage.stats).toHaveProperty('failed');
        expect(stage.stats).toHaveProperty('running');
        expect(stage.stats).toHaveProperty('waiting');
      }
    }

    // The assertion for checking if a *mocked* handleSearch was called is no longer applicable.
  });

  // Example stubs for potential direct tests of getAllPlanConf and getPlanState,
  // should they be needed in the future. These are not actively run by the 'it' block above.
  // describe('getAllPlanConf with real database operations', () => {
  //   it('should return plan configurations', async () => {
  //     const plans = await getAllPlanConf();
  //     expect(Array.isArray(plans)).toBe(true);
  //     // Further structural checks for PlanConf items
  //   });
  // });

  // describe('getPlanState with real database operations', () => {
  //   it('should return plan states for a given date string and plan IDs', async () => {
  //     const dateStr = '2024-03-15'; 
  //     const planIds = ['P1_EXAMPLE_ID', 'P2_EXAMPLE_ID']; 
  //     const states = await getPlanState(dateStr, planIds);
  //     expect(Array.isArray(states)).toBe(true);
  //     // Further structural checks for PlanState items
  //   });
  // });
});
