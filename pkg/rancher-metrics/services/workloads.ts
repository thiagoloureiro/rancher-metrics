import { workloadResourceFrom, type WorkloadResource } from './metrics';

const WORKLOAD_TYPES = [
  'pod',
  'apps.deployment',
  'apps.replicaset',
  'apps.statefulset',
  'apps.daemonset',
];

export async function loadWorkloadResources(
  dispatch: (action: string, payload: { type: string }) => Promise<unknown>,
): Promise<WorkloadResource[]> {
  const collected = await Promise.all(WORKLOAD_TYPES.map(async(type) => {
    try {
      const rows = await dispatch('cluster/findAll', { type });

      if (!Array.isArray(rows)) {
        return [];
      }

      return rows
        .map((row) => workloadResourceFrom(row))
        .filter((row): row is WorkloadResource => !!row);
    } catch {
      return [];
    }
  }));

  return collected.flat();
}
