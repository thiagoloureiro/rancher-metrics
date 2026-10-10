import type { MetricsConnection } from './connection-settings';
import {
  API_KEY_HEADER,
  UNREACHABLE,
  metricsErrorMessage,
  metricsUrl,
  normalizeMinutes,
  parseClusterNames,
  parseNodeSamples,
  parsePodSamples,
  parseVolumeSamples,
  validateBaseUrl,
  type NodeSample,
  type PodSample,
  type VolumeSample,
} from './metrics';

export async function fetchNodeMetrics(connection: MetricsConnection): Promise<NodeSample[]> {
  return request(connection, 'node', {}, parseNodeSamples);
}

export async function fetchPodMetrics(connection: MetricsConnection, namespace?: string): Promise<PodSample[]> {
  return request(connection, 'namespace', { namespace }, parsePodSamples);
}

export async function fetchVolumeMetrics(connection: MetricsConnection, namespace?: string): Promise<VolumeSample[]> {
  return request(connection, 'pvc', { namespace }, parseVolumeSamples);
}

export async function fetchClusterNames(connection: MetricsConnection): Promise<string[]> {
  return request(connection, 'clusters', {}, parseClusterNames);
}

async function request<T>(
  connection: MetricsConnection,
  path: string,
  extra: Record<string, string | undefined>,
  parse: (payload: unknown) => T,
): Promise<T> {
  const urlError = validateBaseUrl(connection.baseUrl);

  if (urlError) {
    throw new Error(urlError);
  }

  if (!connection.apiKey.trim()) {
    throw new Error('API key is required.');
  }

  let url = '';

  try {
    url = metricsUrl(connection.baseUrl, path, {
      minutes:     normalizeMinutes(connection.minutes),
      clusterName: connection.clusterName.trim() || undefined,
      ...extra,
    });
  } catch {
    throw new Error('Enter a full AlertHawk URL, including https://.');
  }

  let response: Response;

  try {
    response = await fetch(url, {
      method:  'GET',
      headers: {
        Accept:           'application/json',
        [API_KEY_HEADER]: connection.apiKey.trim(),
      },
      cache: 'no-store',
    });
  } catch {
    throw new Error(UNREACHABLE);
  }

  const body = await response.text();

  if (!response.ok) {
    throw new Error(metricsErrorMessage(response.status, body));
  }

  try {
    return parse(body ? JSON.parse(body) : []);
  } catch {
    throw new Error('AlertHawk returned a response that was not JSON.');
  }
}
