export const API_PREFIX = '/metrics/api/metrics';
export const API_KEY_HEADER = 'X-Api-Key';

export const TIME_RANGES: { minutes: number; label: string }[] = [
  { minutes: 15, label: '15 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 360, label: '6 hours' },
  { minutes: 1440, label: '24 hours' },
  { minutes: 10080, label: '7 days' },
];

// Drop nodes last seen 5 minutes ago or earlier. Those machines are shutdown or replaced.
export const FRESH_NODE_MS = 5 * 60 * 1000;

// AlertHawk returns raw timestamps only through 6 hours. A 24-hour query is
// grouped into 5-minute buckets, and a 7-day query into 15-minute buckets.
// The bucket stamp is the start of that interval, so a live node can look
// more than 5 minutes old. Freshness has to come from a raw window.
export const RAW_METRICS_MINUTES = 360;
export const FRESH_NODE_LOOKBACK_MINUTES = 15;

const ALLOWED_MINUTES = new Set(TIME_RANGES.map((range) => range.minutes));
const TRAILING_HASH = /-([a-z0-9]{5,16})$/;
const BUCKET_MS = 60_000;

const KIND_NAMES: Record<string, string> = {
  deployment:              'Deployment',
  'apps.deployment':       'Deployment',
  replicaset:              'ReplicaSet',
  'apps.replicaset':       'ReplicaSet',
  statefulset:             'StatefulSet',
  'apps.statefulset':      'StatefulSet',
  daemonset:               'DaemonSet',
  'apps.daemonset':        'DaemonSet',
  pod:                     'Pod',
};

export type AppKind = 'Deployment' | 'StatefulSet' | 'DaemonSet' | 'Pod';
export type UsageTone = 'ok' | 'warn' | 'critical' | 'unknown';

export interface UsagePoint {
  time: number;
  value: number;
}

export interface NodeSample {
  timestamp: string;
  clusterName: string;
  clusterEnvironment: string;
  nodeName: string;
  cpuUsageCores: number;
  cpuCapacityCores: number;
  memoryUsageBytes: number;
  memoryCapacityBytes: number;
  kubernetesVersion: string;
  cloudProvider: string;
  ready: boolean | null;
  memoryPressure: boolean | null;
  diskPressure: boolean | null;
  pidPressure: boolean | null;
  architecture: string;
  operatingSystem: string;
  region: string;
  instanceType: string;
}

export interface PodSample {
  timestamp: string;
  clusterName: string;
  namespace: string;
  pod: string;
  container: string;
  cpuUsageCores: number;
  cpuLimitCores: number | null;
  memoryUsageBytes: number;
  memoryLimitBytes: number | null;
  nodeName: string;
  podState: string;
  restartCount: number;
}

export interface VolumeSample {
  timestamp: string;
  clusterName: string;
  namespace: string;
  pod: string;
  pvcNamespace: string;
  pvcName: string;
  volumeName: string;
  usedBytes: number;
  availableBytes: number;
  capacityBytes: number;
}

export interface OwnerRef {
  kind: string;
  name: string;
}

export interface WorkloadResource {
  kind: string;
  name: string;
  namespace: string;
  owners: OwnerRef[];
}

export interface NodeRow {
  name: string;
  clusterName: string;
  cpuUsageCores: number;
  cpuCapacityCores: number;
  memoryUsageBytes: number;
  memoryCapacityBytes: number;
  ready: boolean | null;
  memoryPressure: boolean | null;
  diskPressure: boolean | null;
  pidPressure: boolean | null;
  kubernetesVersion: string;
  cloudProvider: string;
  architecture: string;
  operatingSystem: string;
  region: string;
  instanceType: string;
  environment: string;
  updatedAt: string;
  cpuSeries: UsagePoint[];
  memorySeries: UsagePoint[];
}

export interface ContainerRollup {
  name: string;
  cpuUsageCores: number;
  cpuLimitCores: number | null;
  memoryUsageBytes: number;
  memoryLimitBytes: number | null;
}

export interface PodRollup {
  name: string;
  namespace: string;
  nodeName: string;
  state: string;
  restarts: number;
  cpuUsageCores: number;
  cpuLimitCores: number | null;
  memoryUsageBytes: number;
  memoryLimitBytes: number | null;
  containers: ContainerRollup[];
  updatedAt: string;
}

export interface AppRow {
  kind: AppKind;
  name: string;
  namespace: string;
  clusterName: string;
  pods: PodRollup[];
  cpuUsageCores: number;
  cpuLimitCores: number | null;
  memoryUsageBytes: number;
  memoryLimitBytes: number | null;
  restarts: number;
  runningPods: number;
  updatedAt: string;
  cpuSeries: UsagePoint[];
  memorySeries: UsagePoint[];
}

export interface VolumeRow {
  name: string;
  namespace: string;
  clusterName: string;
  volumeName: string;
  usedBytes: number;
  availableBytes: number;
  capacityBytes: number;
  pods: string[];
  updatedAt: string;
  usedSeries: UsagePoint[];
}

export function normalizeMinutes(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (ALLOWED_MINUTES.has(parsed)) {
    return parsed;
  }

  return 60;
}

export function validateBaseUrl(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return 'AlertHawk URL is required.';
  }

  try {
    const url = new URL(trimmed);

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return 'Use an http or https URL.';
    }
  } catch {
    return 'Enter a full URL, including https://.';
  }

  return '';
}

export function apiRoot(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');

  if (base.toLowerCase().endsWith(API_PREFIX)) {
    return base;
  }

  return `${ base }${ API_PREFIX }`;
}

export function metricsUrl(
  baseUrl: string,
  path: string,
  query: Record<string, string | number | undefined>,
): string {
  const url = new URL(`${ apiRoot(baseUrl) }/${ path.replace(/^\/+/, '') }`);

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === '') {
      return;
    }

    url.searchParams.set(key, String(value));
  });

  return url.toString();
}

export function metricsErrorMessage(status: number, body: string): string {
  if (status === 401 || status === 403) {
    return 'AlertHawk rejected the API key.';
  }

  if (status === 404) {
    return 'The metrics API was not found at this URL. Use the AlertHawk server origin, for example https://metrics.example.com.';
  }

  const detail = errorDetail(body);

  if (detail) {
    return `AlertHawk returned ${ status }: ${ detail }`;
  }

  return `AlertHawk returned ${ status }.`;
}

export const UNREACHABLE = 'Could not reach AlertHawk. Check the URL, and that the API allows this Rancher origin in CORS.';

export function formatCpu(cores: number): string {
  if (!Number.isFinite(cores)) {
    return '—';
  }

  if (Math.abs(cores) < 1) {
    return `${ Math.round(cores * 1000) }m`;
  }

  return trimNumber(cores);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '—';
  }

  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  let size = bytes;
  let unit = 0;

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }

  const digits = unit === 0 ? 0 : 1;

  return `${ size.toFixed(digits) } ${ units[unit] }`;
}

export function formatCpuPair(used: number, limit: number | null): string {
  if (limit == null) {
    return formatCpu(used);
  }

  return `${ formatCpu(used) } / ${ formatCpu(limit) }`;
}

export function formatBytesPair(used: number, capacity: number | null): string {
  if (capacity == null) {
    return formatBytes(used);
  }

  return `${ formatBytes(used) } / ${ formatBytes(capacity) }`;
}

export function usagePercent(used: number, capacity: number | null): number | null {
  if (capacity == null || !Number.isFinite(capacity) || capacity <= 0 || !Number.isFinite(used)) {
    return null;
  }

  return (used / capacity) * 100;
}

export function usageTone(percent: number | null): UsageTone {
  if (percent == null) {
    return 'unknown';
  }

  if (percent >= 90) {
    return 'critical';
  }

  if (percent >= 70) {
    return 'warn';
  }

  return 'ok';
}

export function formatPercent(percent: number | null): string {
  if (percent == null) {
    return '—';
  }

  return `${ Math.round(percent) }%`;
}

export function updatedWithin(updatedAt: string, maxAgeMs: number, now = Date.now()): boolean {
  const updated = Date.parse(updatedAt);

  if (Number.isNaN(updated)) {
    return false;
  }

  return now - updated < maxAgeMs;
}

export function formatTimestamp(iso: string, now = Date.now()): string {
  const time = Date.parse(iso);

  if (Number.isNaN(time)) {
    return iso || '—';
  }

  const minutes = Math.round(Math.max(0, now - time) / 60000);

  if (minutes < 1) {
    return 'just now';
  }

  if (minutes < 60) {
    return `${ minutes }m ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 48) {
    return `${ hours }h ago`;
  }

  return `${ Math.round(hours / 24) }d ago`;
}

export function nodeStatus(row: Pick<NodeRow, 'ready' | 'memoryPressure' | 'diskPressure' | 'pidPressure'>): { label: string; tone: UsageTone } {
  if (row.ready === false) {
    return { label: 'Not ready', tone: 'critical' };
  }

  if (row.memoryPressure || row.diskPressure || row.pidPressure) {
    return { label: 'Pressure', tone: 'warn' };
  }

  if (row.ready) {
    return { label: 'Ready', tone: 'ok' };
  }

  return { label: 'Unknown', tone: 'unknown' };
}

export function stateTone(state: string): UsageTone {
  const normalized = state.trim().toLowerCase();

  if (normalized === 'running') {
    return 'ok';
  }

  if (!normalized || normalized === 'pending' || normalized === 'unknown' || normalized === 'succeeded') {
    return 'warn';
  }

  return 'critical';
}

export function showsClusterColumn(names: string[]): boolean {
  return new Set(names.filter(Boolean)).size > 1;
}

export function canonicalKind(value: string): string {
  const trimmed = value.trim();

  return KIND_NAMES[trimmed.toLowerCase()] || trimmed;
}

export function deploymentNameFromReplicaSet(replicaSetName: string): string {
  const match = replicaSetName.match(TRAILING_HASH);

  if (!match) {
    return '';
  }

  return replicaSetName.slice(0, -match[0].length);
}

export function workloadResourceFrom(resource: unknown): WorkloadResource | null {
  if (!isRecord(resource)) {
    return null;
  }

  const metadata = isRecord(resource.metadata) ? resource.metadata : {};
  const kind = canonicalKind(text(resource.kind) || text(resource.type));
  const name = text(metadata.name);
  const namespace = text(metadata.namespace);

  if (!kind || !name) {
    return null;
  }

  const owners = Array.isArray(metadata.ownerReferences)
    ? metadata.ownerReferences.filter(isRecord).map((owner) => ({
      kind: canonicalKind(text(owner.kind)),
      name: text(owner.name),
    })).filter((owner) => owner.kind && owner.name)
    : [];

  return {
    kind, name, namespace, owners
  };
}

export function parseNodeSamples(payload: unknown): NodeSample[] {
  return records(payload).map((row) => ({
    timestamp:             text(field(row, 'timestamp', 'Timestamp')),
    clusterName:           text(field(row, 'clusterName', 'ClusterName')),
    clusterEnvironment:    text(field(row, 'clusterEnvironment', 'ClusterEnvironment')),
    nodeName:              text(field(row, 'nodeName', 'NodeName')),
    cpuUsageCores:         numberOr(field(row, 'cpuUsageCores', 'CpuUsageCores')),
    cpuCapacityCores:      numberOr(field(row, 'cpuCapacityCores', 'CpuCapacityCores')),
    memoryUsageBytes:      numberOr(field(row, 'memoryUsageBytes', 'MemoryUsageBytes')),
    memoryCapacityBytes:   numberOr(field(row, 'memoryCapacityBytes', 'MemoryCapacityBytes')),
    kubernetesVersion:     text(field(row, 'kubernetesVersion', 'KubernetesVersion')),
    cloudProvider:         text(field(row, 'cloudProvider', 'CloudProvider')),
    ready:                 flag(field(row, 'isReady', 'IsReady')),
    memoryPressure:        flag(field(row, 'hasMemoryPressure', 'HasMemoryPressure')),
    diskPressure:          flag(field(row, 'hasDiskPressure', 'HasDiskPressure')),
    pidPressure:           flag(field(row, 'hasPidPressure', 'HasPidPressure')),
    architecture:          text(field(row, 'architecture', 'Architecture')),
    operatingSystem:       text(field(row, 'operatingSystem', 'OperatingSystem')),
    region:                text(field(row, 'region', 'Region')),
    instanceType:          text(field(row, 'instanceType', 'InstanceType')),
  })).filter((sample) => sample.nodeName);
}

export function parsePodSamples(payload: unknown): PodSample[] {
  return records(payload).map((row) => ({
    timestamp:          text(field(row, 'timestamp', 'Timestamp')),
    clusterName:        text(field(row, 'clusterName', 'ClusterName')),
    namespace:          text(field(row, 'namespace', 'Namespace')),
    pod:                text(field(row, 'pod', 'Pod')),
    container:          text(field(row, 'container', 'Container')) || 'container',
    cpuUsageCores:      numberOr(field(row, 'cpuUsageCores', 'CpuUsageCores')),
    cpuLimitCores:      numberOrNull(field(row, 'cpuLimitCores', 'CpuLimitCores')),
    memoryUsageBytes:   numberOr(field(row, 'memoryUsageBytes', 'MemoryUsageBytes')),
    memoryLimitBytes:   numberOrNull(field(row, 'memoryLimitBytes', 'MemoryLimitBytes')),
    nodeName:           text(field(row, 'nodeName', 'NodeName')),
    podState:           text(field(row, 'podState', 'PodState')),
    restartCount:       numberOr(field(row, 'restartCount', 'RestartCount')),
  })).filter((sample) => sample.namespace && sample.pod);
}

export function parseVolumeSamples(payload: unknown): VolumeSample[] {
  return records(payload).map((row) => ({
    timestamp:       text(field(row, 'timestamp', 'Timestamp')),
    clusterName:     text(field(row, 'clusterName', 'ClusterName')),
    namespace:       text(field(row, 'namespace', 'Namespace')),
    pod:             text(field(row, 'pod', 'Pod')),
    pvcNamespace:    text(field(row, 'pvcNamespace', 'PvcNamespace')) || text(field(row, 'namespace', 'Namespace')),
    pvcName:         text(field(row, 'pvcName', 'PvcName')),
    volumeName:      text(field(row, 'volumeName', 'VolumeName')),
    usedBytes:       numberOr(field(row, 'usedBytes', 'UsedBytes')),
    availableBytes:  numberOr(field(row, 'availableBytes', 'AvailableBytes')),
    capacityBytes:   numberOr(field(row, 'capacityBytes', 'CapacityBytes')),
  })).filter((sample) => sample.pvcName);
}

export function parseClusterNames(payload: unknown): string[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    .map((item) => item.trim())
    .sort((left, right) => left.localeCompare(right));
}

export function latestNodeRows(samples: NodeSample[]): NodeRow[] {
  const groups = new Map<string, NodeSample[]>();

  samples.forEach((sample) => {
    const key = `${ sample.clusterName }/${ sample.nodeName }`;
    const group = groups.get(key) || [];

    group.push(sample);
    groups.set(key, group);
  });

  return [...groups.values()].map((group) => {
    const latest = newest(group, (sample) => timeMs(sample.timestamp));

    return {
      name:                  latest.nodeName,
      clusterName:           latest.clusterName,
      cpuUsageCores:         latest.cpuUsageCores,
      cpuCapacityCores:      latest.cpuCapacityCores,
      memoryUsageBytes:      latest.memoryUsageBytes,
      memoryCapacityBytes:   latest.memoryCapacityBytes,
      ready:                 latest.ready,
      memoryPressure:        latest.memoryPressure,
      diskPressure:          latest.diskPressure,
      pidPressure:           latest.pidPressure,
      kubernetesVersion:     latest.kubernetesVersion,
      cloudProvider:         latest.cloudProvider,
      architecture:          latest.architecture,
      operatingSystem:       latest.operatingSystem,
      region:                latest.region,
      instanceType:          latest.instanceType,
      environment:           latest.clusterEnvironment,
      updatedAt:             latest.timestamp,
      cpuSeries:             bucketSeries(group.map((sample) => ({
        time:  timeMs(sample.timestamp),
        key:   sample.nodeName,
        value: sample.cpuUsageCores,
      }))),
      memorySeries: bucketSeries(group.map((sample) => ({
        time:  timeMs(sample.timestamp),
        key:   sample.nodeName,
        value: sample.memoryUsageBytes,
      }))),
    };
  }).sort((left, right) => left.name.localeCompare(right.name));
}

export function nodeRowsForRange(history: NodeRow[], recent: NodeRow[], now = Date.now()): NodeRow[] {
  const series = new Map(history.map((row) => [nodeKey(row), row]));

  return recent
    .filter((row) => updatedWithin(row.updatedAt, FRESH_NODE_MS, now))
    .map((row) => {
      const past = series.get(nodeKey(row));

      if (!past) {
        return row;
      }

      return {
        ...row,
        cpuSeries:    past.cpuSeries,
        memorySeries: past.memorySeries,
      };
    });
}

export function rollupApplications(samples: PodSample[], resources: WorkloadResource[]): AppRow[] {
  const index = indexWorkloads(resources);
  const latestContainers = latestBy(
    samples,
    (sample) => `${ sample.clusterName }/${ sample.namespace }/${ sample.pod }/${ sample.container }`,
    (sample) => timeMs(sample.timestamp),
  );
  const pods = new Map<string, PodBuilder>();

  latestContainers.forEach((container) => {
    const key = `${ container.clusterName }/${ container.namespace }/${ container.pod }`;
    const current = pods.get(key) || {
      name:              container.pod,
      namespace:         container.namespace,
      clusterName:       container.clusterName,
      nodeName:          container.nodeName,
      state:             container.podState,
      restarts:          container.restartCount,
      cpuUsageCores:     0,
      cpuLimits:         [],
      memoryUsageBytes:  0,
      memoryLimits:      [],
      containers:        [],
      updatedAt:         container.timestamp,
      updatedMs:         timeMs(container.timestamp),
    };

    current.cpuUsageCores += container.cpuUsageCores;
    current.memoryUsageBytes += container.memoryUsageBytes;
    current.cpuLimits.push(container.cpuLimitCores);
    current.memoryLimits.push(container.memoryLimitBytes);
    current.restarts = Math.max(current.restarts, container.restartCount);
    current.state = worseState(current.state, container.podState);
    current.containers.push({
      name:               container.container,
      cpuUsageCores:      container.cpuUsageCores,
      cpuLimitCores:      container.cpuLimitCores,
      memoryUsageBytes:   container.memoryUsageBytes,
      memoryLimitBytes:   container.memoryLimitBytes,
    });

    if (timeMs(container.timestamp) >= current.updatedMs) {
      current.updatedMs = timeMs(container.timestamp);
      current.updatedAt = container.timestamp;
      if (container.nodeName) {
        current.nodeName = container.nodeName;
      }
    }

    pods.set(key, current);
  });

  const groups = new Map<string, AppBuilder>();

  pods.forEach((pod) => {
    const owner = resolveOwner(pod.namespace, pod.name, index);
    const key = `${ pod.clusterName }/${ pod.namespace }/${ owner.kind }/${ owner.name }`;
    const group = groups.get(key) || {
      kind:         owner.kind,
      name:         owner.name,
      namespace:    pod.namespace,
      clusterName:  pod.clusterName,
      pods:         [],
      podKeys:      new Set<string>(),
    };
    const rolled = finishPod(pod);

    group.pods.push(rolled);
    group.podKeys.add(`${ pod.namespace }/${ pod.name }`);
    groups.set(key, group);
  });

  return [...groups.values()].map((group) => {
    const owned = samples.filter((sample) => (
      sample.clusterName === group.clusterName &&
      group.podKeys.has(`${ sample.namespace }/${ sample.pod }`)
    ));
    const updated = newest(group.pods, (pod) => timeMs(pod.updatedAt));

    return {
      kind:               group.kind,
      name:               group.name,
      namespace:          group.namespace,
      clusterName:        group.clusterName,
      pods:               group.pods.sort((left, right) => left.name.localeCompare(right.name)),
      cpuUsageCores:      sum(group.pods.map((pod) => pod.cpuUsageCores)),
      cpuLimitCores:      sumOptional(group.pods.map((pod) => pod.cpuLimitCores)),
      memoryUsageBytes:   sum(group.pods.map((pod) => pod.memoryUsageBytes)),
      memoryLimitBytes:   sumOptional(group.pods.map((pod) => pod.memoryLimitBytes)),
      restarts:           sum(group.pods.map((pod) => pod.restarts)),
      runningPods:        group.pods.filter((pod) => pod.state.toLowerCase() === 'running').length,
      updatedAt:          updated?.updatedAt || '',
      cpuSeries:          bucketSeries(owned.map((sample) => ({
        time:  timeMs(sample.timestamp),
        key:   `${ sample.namespace }/${ sample.pod }/${ sample.container }`,
        value: sample.cpuUsageCores,
      }))),
      memorySeries: bucketSeries(owned.map((sample) => ({
        time:  timeMs(sample.timestamp),
        key:   `${ sample.namespace }/${ sample.pod }/${ sample.container }`,
        value: sample.memoryUsageBytes,
      }))),
    };
  }).sort((left, right) => `${ left.namespace }/${ left.kind }/${ left.name }`.localeCompare(`${ right.namespace }/${ right.kind }/${ right.name }`));
}

export function volumeForClaim(rows: VolumeRow[], namespace: string, name: string): VolumeRow | undefined {
  return rows.find((row) => row.namespace === namespace && row.name === name);
}

export function applicationForWorkload(
  rows: AppRow[],
  namespace: string,
  kind: string,
  name: string,
  clusterName = '',
): AppRow | undefined {
  const wanted = canonicalKind(kind);
  const matches = rows.filter((row) => row.namespace === namespace && row.kind === wanted && row.name === name);

  if (clusterName) {
    return matches.find((row) => row.clusterName === clusterName) || matches[0];
  }

  return matches[0];
}

export function rollupVolumes(samples: VolumeSample[]): VolumeRow[] {
  const groups = new Map<string, VolumeSample[]>();

  samples.forEach((sample) => {
    const namespace = sample.pvcNamespace || sample.namespace;
    const key = `${ sample.clusterName }/${ namespace }/${ sample.pvcName }`;
    const group = groups.get(key) || [];

    group.push(sample);
    groups.set(key, group);
  });

  return [...groups.values()].map((group) => {
    const latest = newest(group, (sample) => timeMs(sample.timestamp));
    const latestMs = timeMs(latest.timestamp);
    const pods = unique(group
      .filter((sample) => Math.abs(timeMs(sample.timestamp) - latestMs) < BUCKET_MS)
      .map((sample) => sample.pod)
      .filter(Boolean))
      .sort((left, right) => left.localeCompare(right));

    return {
      name:            latest.pvcName,
      namespace:       latest.pvcNamespace || latest.namespace,
      clusterName:     latest.clusterName,
      volumeName:      latest.volumeName,
      usedBytes:       latest.usedBytes,
      availableBytes:  latest.availableBytes,
      capacityBytes:   latest.capacityBytes,
      pods,
      updatedAt:       latest.timestamp,
      usedSeries:      bucketSeries(group.map((sample) => ({
        time:  timeMs(sample.timestamp),
        key:   latest.pvcName,
        value: sample.usedBytes,
      }))),
    };
  }).sort((left, right) => `${ left.namespace }/${ left.name }`.localeCompare(`${ right.namespace }/${ right.name }`));
}

interface PodBuilder {
  name: string;
  namespace: string;
  clusterName: string;
  nodeName: string;
  state: string;
  restarts: number;
  cpuUsageCores: number;
  cpuLimits: (number | null)[];
  memoryUsageBytes: number;
  memoryLimits: (number | null)[];
  containers: ContainerRollup[];
  updatedAt: string;
  updatedMs: number;
}

interface AppBuilder {
  kind: AppKind;
  name: string;
  namespace: string;
  clusterName: string;
  pods: PodRollup[];
  podKeys: Set<string>;
}

interface WorkloadIndex {
  pods: Map<string, WorkloadResource>;
  replicaSets: Map<string, string>;
}

interface ResolvedOwner {
  kind: AppKind;
  name: string;
}

interface SeriesInput {
  time: number;
  key: string;
  value: number;
}

function indexWorkloads(resources: WorkloadResource[]): WorkloadIndex {
  const pods = new Map<string, WorkloadResource>();
  const replicaSets = new Map<string, string>();

  resources.forEach((resource) => {
    const kind = canonicalKind(resource.kind);

    if (kind === 'Pod') {
      pods.set(`${ resource.namespace }/${ resource.name }`, resource);
    }

    if (kind === 'ReplicaSet') {
      const owner = resource.owners.find((item) => canonicalKind(item.kind) === 'Deployment');

      if (owner) {
        replicaSets.set(`${ resource.namespace }/${ resource.name }`, owner.name);
      }
    }
  });

  return { pods, replicaSets };
}

function resolveOwner(namespace: string, podName: string, index: WorkloadIndex): ResolvedOwner {
  const pod = index.pods.get(`${ namespace }/${ podName }`);

  if (!pod) {
    return { kind: 'Pod', name: podName };
  }

  const stateful = pod.owners.find((owner) => canonicalKind(owner.kind) === 'StatefulSet');

  if (stateful) {
    return { kind: 'StatefulSet', name: stateful.name };
  }

  const daemon = pod.owners.find((owner) => canonicalKind(owner.kind) === 'DaemonSet');

  if (daemon) {
    return { kind: 'DaemonSet', name: daemon.name };
  }

  const replica = pod.owners.find((owner) => canonicalKind(owner.kind) === 'ReplicaSet');

  if (replica) {
    const deployment = index.replicaSets.get(`${ namespace }/${ replica.name }`) || deploymentNameFromReplicaSet(replica.name);

    if (deployment) {
      return { kind: 'Deployment', name: deployment };
    }
  }

  const deployment = pod.owners.find((owner) => canonicalKind(owner.kind) === 'Deployment');

  if (deployment) {
    return { kind: 'Deployment', name: deployment.name };
  }

  return { kind: 'Pod', name: podName };
}

function finishPod(pod: PodBuilder): PodRollup {
  return {
    name:               pod.name,
    namespace:          pod.namespace,
    nodeName:           pod.nodeName,
    state:              pod.state,
    restarts:           pod.restarts,
    cpuUsageCores:      pod.cpuUsageCores,
    cpuLimitCores:      sumOptional(pod.cpuLimits),
    memoryUsageBytes:   pod.memoryUsageBytes,
    memoryLimitBytes:   sumOptional(pod.memoryLimits),
    containers:         pod.containers.sort((left, right) => left.name.localeCompare(right.name)),
    updatedAt:          pod.updatedAt,
  };
}

function worseState(current: string, next: string): string {
  if (!current) {
    return next;
  }

  return stateRank(next) < stateRank(current) ? next : current;
}

function stateRank(state: string): number {
  const order = ['failed', 'crashloopbackoff', 'error', 'oomkilled', 'pending', 'unknown', 'succeeded', 'running'];
  const index = order.indexOf(state.trim().toLowerCase());

  return index === -1 ? order.indexOf('unknown') : index;
}

function bucketSeries(samples: SeriesInput[]): UsagePoint[] {
  const buckets = new Map<number, Map<string, number[]>>();

  samples.forEach((sample) => {
    if (!Number.isFinite(sample.time) || sample.time <= 0) {
      return;
    }

    const bucket = Math.floor(sample.time / BUCKET_MS) * BUCKET_MS;
    const group = buckets.get(bucket) || new Map<string, number[]>();
    const values = group.get(sample.key) || [];

    values.push(sample.value);
    group.set(sample.key, values);
    buckets.set(bucket, group);
  });

  return [...buckets.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([time, group]) => ({
      time,
      value: [...group.values()].reduce((total, values) => total + average(values), 0),
    }));
}

function latestBy<T>(items: T[], keyFn: (item: T) => string, timeFn: (item: T) => number): T[] {
  const best = new Map<string, T>();

  items.forEach((item) => {
    const key = keyFn(item);
    const current = best.get(key);

    if (!current || timeFn(item) >= timeFn(current)) {
      best.set(key, item);
    }
  });

  return [...best.values()];
}

function nodeKey(row: Pick<NodeRow, 'clusterName' | 'name'>): string {
  return `${ row.clusterName }/${ row.name }`;
}

function newest<T>(items: T[], timeFn: (item: T) => number): T {
  return items.reduce((best, item) => (timeFn(item) >= timeFn(best) ? item : best));
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function sumOptional(values: (number | null)[]): number | null {
  if (!values.length || values.some((value) => value == null)) {
    return null;
  }

  return values.reduce((total: number, value) => total + (value || 0), 0);
}

function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function timeMs(value: string): number {
  const parsed = Date.parse(value);

  return Number.isNaN(parsed) ? 0 : parsed;
}

function errorDetail(body: string): string {
  try {
    const payload = JSON.parse(body) as { error?: unknown; title?: unknown };

    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error.trim();
    }

    if (typeof payload.title === 'string' && payload.title.trim()) {
      return payload.title.trim();
    }
  } catch {
    // Response bodies are not always JSON.
  }

  const trimmed = body.trim();

  if (!trimmed || trimmed.length > 180) {
    return '';
  }

  return trimmed;
}

function trimNumber(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, '');
}

function records(payload: unknown): Record<string, unknown>[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.filter(isRecord);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function field(row: Record<string, unknown>, camel: string, pascal: string): unknown {
  if (row[camel] !== undefined && row[camel] !== null) {
    return row[camel];
  }

  return row[pascal];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberOr(value: unknown, fallback = 0): number {
  const parsed = numberOrNull(value);

  return parsed == null ? fallback : parsed;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function flag(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}
