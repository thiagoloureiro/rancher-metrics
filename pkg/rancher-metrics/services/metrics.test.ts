import assert from 'node:assert/strict';
import {
  apiRoot,
  deploymentNameFromReplicaSet,
  formatBytes,
  formatCpu,
  latestNodeRows,
  metricsErrorMessage,
  metricsUrl,
  normalizeMinutes,
  parseNodeSamples,
  rollupApplications,
  rollupVolumes,
  showsClusterColumn,
  volumeForClaim,
  usagePercent,
  usageTone,
  validateBaseUrl,
  workloadResourceFrom,
  type PodSample,
  type VolumeSample,
  type WorkloadResource,
} from './metrics.ts';

const deployment = workloadResourceFrom({
  kind:     'ReplicaSet',
  metadata: {
    name:            'web-7f8a9b0c',
    namespace:       'shop',
    ownerReferences: [{ kind: 'Deployment', name: 'web' }],
  },
});

const webPod = workloadResourceFrom({
  kind:     'Pod',
  metadata: {
    name:            'web-7f8a9b0c-abcde',
    namespace:       'shop',
    ownerReferences: [{ kind: 'ReplicaSet', name: 'web-7f8a9b0c' }],
  },
});

const dbPod = workloadResourceFrom({
  kind:     'Pod',
  metadata: {
    name:            'db-0',
    namespace:       'shop',
    ownerReferences: [{ kind: 'StatefulSet', name: 'db' }],
  },
});

const resources = [deployment, webPod, dbPod].filter((item): item is WorkloadResource => !!item);

function pod(overrides: Partial<PodSample>): PodSample {
  return {
    timestamp:         '2026-10-10T12:02:00.000Z',
    clusterName:       'prod',
    namespace:         'shop',
    pod:               'web-7f8a9b0c-abcde',
    container:         'app',
    cpuUsageCores:     0.2,
    cpuLimitCores:     1,
    memoryUsageBytes:  200,
    memoryLimitBytes:  400,
    nodeName:          'node-a',
    podState:          'Running',
    restartCount:      4,
    ...overrides,
  };
}

function volume(overrides: Partial<VolumeSample>): VolumeSample {
  return {
    timestamp:       '2026-10-10T12:02:00.000Z',
    clusterName:     'prod',
    namespace:       'shop',
    pod:             'db-0',
    pvcNamespace:    'shop',
    pvcName:         'data',
    volumeName:      'pvc-1',
    usedBytes:       600,
    availableBytes:  400,
    capacityBytes:   1000,
    ...overrides,
  };
}

const nodes = latestNodeRows(parseNodeSamples([
  {
    timestamp:           '2026-10-10T12:00:00.000Z',
    clusterName:         'prod',
    nodeName:            'node-a',
    cpuUsageCores:       0.5,
    cpuCapacityCores:    4,
    memoryUsageBytes:    100,
    memoryCapacityBytes: 1000,
    isReady:             true,
  },
  {
    timestamp:           '2026-10-10T12:02:00.000Z',
    clusterName:         'prod',
    nodeName:            'node-a',
    cpuUsageCores:       1.5,
    cpuCapacityCores:    4,
    memoryUsageBytes:    250,
    memoryCapacityBytes: 1000,
    isReady:             false,
    hasMemoryPressure:   true,
    instanceType:        'Standard_D4s_v5',
  },
]));

assert.equal(nodes.length, 1);
assert.equal(nodes[0].cpuUsageCores, 1.5);
assert.equal(nodes[0].ready, false);
assert.equal(nodes[0].memoryPressure, true);
assert.equal(nodes[0].instanceType, 'Standard_D4s_v5');
assert.equal(nodes[0].cpuSeries.length, 2);

const apps = rollupApplications([
  pod({ timestamp: '2026-10-10T12:00:00.000Z', cpuUsageCores: 9 }),
  pod({ cpuUsageCores: 1 }),
  pod({ container: 'sidecar', cpuUsageCores: 2, cpuLimitCores: null, memoryLimitBytes: null, restartCount: 4 }),
  pod({ pod: 'db-0', container: 'postgres', cpuUsageCores: 0.4, cpuLimitCores: 2, memoryUsageBytes: 800, memoryLimitBytes: 1000, restartCount: 1 }),
  pod({
    pod: 'db-1', namespace: 'shop', container: 'postgres', cpuUsageCores: 0.1, restartCount: 2, podState: 'Pending',
  }),
], resources);

const web = apps.find((row) => row.kind === 'Deployment' && row.name === 'web');
const db = apps.find((row) => row.kind === 'StatefulSet' && row.name === 'db');

assert.ok(web);
assert.equal(web?.cpuUsageCores, 3);
assert.equal(web?.cpuLimitCores, null);
assert.equal(web?.restarts, 4);
assert.equal(web?.pods.length, 1);
assert.equal(web?.runningPods, 1);
assert.equal(web?.cpuSeries.length, 2);

assert.ok(db);
assert.equal(db?.pods.length, 1);
assert.equal(db?.restarts, 1);

const guessed = rollupApplications([
  pod({ pod: 'api-5f6e7d8c-zzzzz', container: 'api' }),
], [
  {
    kind:      'Pod',
    name:      'api-5f6e7d8c-zzzzz',
    namespace: 'shop',
    owners:    [{ kind: 'ReplicaSet', name: 'api-5f6e7d8c' }],
  },
]);

assert.equal(guessed[0].kind, 'Deployment');
assert.equal(guessed[0].name, 'api');

const alone = rollupApplications([
  pod({ pod: 'debugger', container: 'shell', namespace: 'ops' }),
], []);

assert.equal(alone[0].kind, 'Pod');
assert.equal(alone[0].name, 'debugger');

const volumes = rollupVolumes([
  volume({ timestamp: '2026-10-10T12:00:00.000Z', usedBytes: 100, pod: 'old' }),
  volume({ pod: 'db-0' }),
  volume({ pod: 'db-1', usedBytes: 600 }),
]);

assert.equal(volumes.length, 1);
assert.equal(volumes[0].usedBytes, 600);
assert.deepEqual(volumes[0].pods, ['db-0', 'db-1']);
assert.equal(volumes[0].usedSeries.length, 2);
assert.equal(volumeForClaim(volumes, 'shop', 'data')?.usedBytes, 600);
assert.equal(volumeForClaim(volumes, 'shop', 'other'), undefined);

assert.equal(formatCpu(0.25), '250m');
assert.equal(formatCpu(1.5), '1.5');
assert.equal(formatBytes(1536), '1.5 KiB');
assert.equal(usagePercent(90, 100), 90);
assert.equal(usageTone(90), 'critical');
assert.equal(usageTone(70), 'warn');
assert.equal(usageTone(69), 'ok');
assert.equal(usageTone(null), 'unknown');
assert.equal(normalizeMinutes(15), 15);
assert.equal(normalizeMinutes(7), 60);
assert.equal(validateBaseUrl('metrics.example.com'), 'Enter a full URL, including https://.');
assert.equal(validateBaseUrl('https://metrics.example.com'), '');
assert.equal(apiRoot('https://metrics.example.com/metrics/api/metrics'), 'https://metrics.example.com/metrics/api/metrics');
assert.equal(
  metricsUrl('https://metrics.example.com/', 'node', { minutes: 60, clusterName: 'prod', namespace: undefined }),
  'https://metrics.example.com/metrics/api/metrics/node?minutes=60&clusterName=prod',
);
assert.equal(metricsErrorMessage(401, ''), 'AlertHawk rejected the API key.');
assert.equal(deploymentNameFromReplicaSet('web-7f8a9b0c'), 'web');
assert.equal(deploymentNameFromReplicaSet('web'), '');
assert.equal(showsClusterColumn(['prod', 'prod']), false);
assert.equal(showsClusterColumn(['prod', 'dev']), true);

console.log('metrics tests passed');
