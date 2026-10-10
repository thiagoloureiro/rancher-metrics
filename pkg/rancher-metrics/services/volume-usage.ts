import { isConfigured, useConnection } from './connection-settings';
import { fetchVolumeMetrics } from './metrics-client';
import { rollupVolumes, type VolumeRow } from './metrics';

export interface VolumeUsageLoad {
  rows: VolumeRow[];
  error: string;
}

const cache = new Map<string, VolumeUsageLoad>();
let pendingKey = '';
let pendingLoad: Promise<VolumeUsageLoad> | null = null;

export function loadVolumeUsage(clusterId: string): Promise<VolumeUsageLoad> {
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
  ].join('\n');
  const cached = cache.get(key);

  if (cached) {
    return Promise.resolve(cached);
  }

  if (pendingLoad && pendingKey === key) {
    return pendingLoad;
  }

  pendingKey = key;
  pendingLoad = fetchVolumeMetrics(connection)
    .then((samples) => {
      const result = { rows: rollupVolumes(samples), error: '' };

      cache.set(key, result);

      return result;
    })
    .catch((error: unknown) => ({
      rows:  [],
      error: error instanceof Error ? error.message : 'Could not load volume metrics.',
    }))
    .finally(() => {
      if (pendingKey === key) {
        pendingLoad = null;
        pendingKey = '';
      }
    });

  return pendingLoad;
}
