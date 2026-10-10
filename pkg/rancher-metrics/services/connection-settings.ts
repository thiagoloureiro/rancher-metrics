import { reactive } from 'vue';
import { normalizeMinutes } from './metrics';

export interface MetricsConnection {
  baseUrl: string;
  apiKey: string;
  clusterName: string;
  minutes: number;
}

const connections = reactive<Record<string, MetricsConnection>>({});

export function useConnection(clusterId: string): MetricsConnection {
  const id = storageId(clusterId);

  if (!connections[id]) {
    connections[id] = readConnection(id);
  }

  return connections[id];
}

export function saveConnection(clusterId: string, next: MetricsConnection): void {
  const current = useConnection(clusterId);

  current.baseUrl = next.baseUrl.trim().replace(/\/+$/, '');
  current.apiKey = next.apiKey.trim();
  current.clusterName = next.clusterName.trim();
  current.minutes = normalizeMinutes(next.minutes);
  persist(storageId(clusterId), current);
}

export function setMinutes(clusterId: string, minutes: number): void {
  const current = useConnection(clusterId);

  current.minutes = normalizeMinutes(minutes);
  persist(storageId(clusterId), current);
}

export function isConfigured(value: MetricsConnection): boolean {
  return Boolean(value.baseUrl.trim() && value.apiKey.trim());
}

function storageId(clusterId: string): string {
  return clusterId || 'local';
}

function readConnection(clusterId: string): MetricsConnection {
  return {
    baseUrl:     readValue(clusterId, 'base-url'),
    apiKey:      readValue(clusterId, 'api-key'),
    clusterName: readValue(clusterId, 'cluster-name'),
    minutes:     normalizeMinutes(readValue(clusterId, 'minutes')),
  };
}

function persist(clusterId: string, value: MetricsConnection): void {
  writeValue(clusterId, 'base-url', value.baseUrl);
  writeValue(clusterId, 'api-key', value.apiKey);
  writeValue(clusterId, 'cluster-name', value.clusterName);
  writeValue(clusterId, 'minutes', String(value.minutes));
}

function readValue(clusterId: string, name: string): string {
  try {
    if (typeof localStorage === 'undefined') {
      return '';
    }

    return localStorage.getItem(storageKey(clusterId, name)) || '';
  } catch {
    return '';
  }
}

function writeValue(clusterId: string, name: string, value: string): void {
  try {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(storageKey(clusterId, name), value);
  } catch {
    // Private browsing can reject storage. The in-memory value still applies.
  }
}

function storageKey(clusterId: string, name: string): string {
  return `rancher-metrics.${ clusterId }.${ name }`;
}
