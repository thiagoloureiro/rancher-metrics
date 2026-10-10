export interface DashboardStore {
  dispatch(action: string, payload: { type: string }): Promise<unknown>;
  state: { activeNamespaceCache?: Record<string, boolean> };
  getters: { isAllNamespaces?: boolean } & Record<string, unknown>;
}

export function clusterIdFrom(routeCluster: unknown, getters: Record<string, unknown> | undefined): string {
  if (typeof routeCluster === 'string' && routeCluster) {
    return routeCluster;
  }

  if (!getters) {
    return '';
  }

  const direct = getters['clusterId'] || getters['cluster/clusterId'];

  if (typeof direct === 'string' && direct) {
    return direct;
  }

  const current = getters['currentCluster'] as { id?: string } | undefined;

  return current?.id || '';
}

export function clusterDisplayName(getters: Record<string, unknown> | undefined, clusterId: string): string {
  const current = getters?.['currentCluster'] as {
    id?: string;
    name?: string;
    nameDisplay?: string;
    spec?: { displayName?: string };
  } | undefined;
  const candidates = [
    current?.spec?.displayName,
    current?.nameDisplay,
    current?.name,
  ];

  return candidates.find((value) => typeof value === 'string' && value.trim() && value !== clusterId)?.trim() || '';
}

export function activeNamespaces(
  isAll: boolean | undefined,
  cache: Record<string, boolean> | undefined,
): string[] | null {
  if (isAll) {
    return null;
  }

  const names = Object.entries(cache || {})
    .filter(([, on]) => on)
    .map(([name]) => name);

  if (!names.length) {
    return null;
  }

  return names;
}
