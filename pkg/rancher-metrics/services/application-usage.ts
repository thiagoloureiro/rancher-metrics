import { isConfigured, useConnection } from './connection-settings';
import { fetchPodMetrics } from './metrics-client';
import { rollupApplications, type AppRow, type WorkloadResource } from './metrics';
import { loadWorkloadResources } from './workloads';

export interface ApplicationUsageLoad {
  rows: AppRow[];
  error: string;
}

type Dispatch = (action: string, payload: { type: string }) => Promise<unknown>;

const cache = new Map<string, ApplicationUsageLoad>();
const pending = new Map<string, Promise<ApplicationUsageLoad>>();

export function loadApplicationUsage(
  clusterId: string,
  namespace: string,
  dispatch: Dispatch | undefined,
  refresh = false,
): Promise<ApplicationUsageLoad> {
  const connection = useConnection(clusterId);

  if (!isConfigured(connection)) {
    return Promise.resolve({ rows: [], error: '' });
  }

  const key = [
    clusterId,
    connection.baseUrl,
    connection.clusterName,
    String(connection.minutes),
    connection.apiKey,
    namespace,
  ].join('\n');

  if (refresh) {
    cache.delete(key);
  }

  if (!refresh) {
    const cached = cache.get(key);

    if (cached) {
      return Promise.resolve(cached);
    }

    const inflight = pending.get(key);

    if (inflight) {
      return inflight;
    }
  }

  const slot: { current?: Promise<ApplicationUsageLoad> } = {};
  const load = fetchPodMetrics(connection, namespace || undefined)
    .then(async(samples) => {
      let resources: WorkloadResource[] = [];

      if (dispatch) {
        try {
          resources = await loadWorkloadResources(dispatch);
        } catch {
          resources = [];
        }
      }

      const result = { rows: rollupApplications(samples, resources), error: '' };

      cache.set(key, result);

      return result;
    })
    .catch((error: unknown) => ({
      rows:  [],
      error: error instanceof Error ? error.message : 'Could not load application metrics.',
    }))
    .finally(() => {
      if (pending.get(key) === slot.current) {
        pending.delete(key);
      }
    });

  slot.current = load;
  pending.set(key, load);

  return load;
}
