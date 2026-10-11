<script lang="ts">
import { defineComponent } from 'vue';
import MetricsFrame from '../components/MetricsFrame.vue';
import UsageChart from '../components/UsageChart.vue';
import UsageMeter from '../components/UsageMeter.vue';
import { isConfigured, loadConnection, useConnection, type MetricsConnection } from '../services/connection-settings';
import { fetchPodMetrics } from '../services/metrics-client';
import {
  formatCpuPair,
  formatBytesPair,
  formatTimestamp,
  rollupApplications,
  showsClusterColumn,
  stateTone,
  type AppKind,
  type AppRow,
  type WorkloadResource,
} from '../services/metrics';
import {
  activeNamespaces,
  clusterIdFrom,
  type DashboardStore,
} from '../services/rancher-context';
import { loadWorkloadResources } from '../services/workloads';

type SortDir = 'asc' | 'desc';

const KIND_LABELS: Record<string, string> = {
  Deployment:  'Deployments',
  StatefulSet: 'StatefulSets',
  DaemonSet:   'DaemonSets',
  Pod:         'Pods',
};

export default defineComponent({
  name: 'ApplicationMetrics',

  components: { MetricsFrame, UsageChart, UsageMeter },

  data() {
    return {
      rows:        [] as AppRow[],
      error:       '',
      loading:     false,
      refreshing:  false,
      requestId:   0,
      query:       '',
      kind:        'All',
      sortKey:     'cpu',
      sortDir:     'desc' as SortDir,
      selectedKey: '',
    };
  },

  computed: {
    store(): DashboardStore {
      return (this as unknown as { $store: DashboardStore }).$store;
    },

    clusterId(): string {
      const route = (this as unknown as { $route?: { params?: { cluster?: unknown } } }).$route;

      return clusterIdFrom(route?.params?.cluster, this.store?.getters);
    },

    connection(): MetricsConnection {
      return useConnection(this.clusterId);
    },

    configured(): boolean {
      return isConfigured(this.connection);
    },

    namespaces(): string[] | null {
      return activeNamespaces(this.store?.getters?.isAllNamespaces, this.store?.state?.activeNamespaceCache);
    },

    namespaceKey(): string {
      return this.namespaces ? this.namespaces.slice().sort().join(',') : '*';
    },

    scoped(): AppRow[] {
      if (!this.namespaces) {
        return this.rows;
      }

      const allowed = new Set(this.namespaces);

      return this.rows.filter((row) => allowed.has(row.namespace));
    },

    showNamespace(): boolean {
      return !this.namespaces || this.namespaces.length !== 1;
    },

    showCluster(): boolean {
      return showsClusterColumn(this.scoped.map((row) => row.clusterName));
    },

    chips(): { id: string; label: string; count: number }[] {
      const counts = new Map<string, number>();

      this.scoped.forEach((row) => {
        counts.set(row.kind, (counts.get(row.kind) || 0) + 1);
      });

      const chips = [{ id: 'All', label: 'All', count: this.scoped.length }];

      (['Deployment', 'StatefulSet', 'DaemonSet', 'Pod'] as AppKind[]).forEach((kind) => {
        if (!counts.has(kind)) {
          return;
        }

        chips.push({
          id:    kind,
          label: KIND_LABELS[kind],
          count: counts.get(kind) || 0,
        });
      });

      return chips;
    },

    visible(): AppRow[] {
      const query = this.query.trim().toLowerCase();
      const rows = this.scoped.filter((row) => {
        if (this.kind !== 'All' && row.kind !== this.kind) {
          return false;
        }

        if (!query) {
          return true;
        }

        return [row.name, row.namespace, row.kind, row.clusterName]
          .join(' ')
          .toLowerCase()
          .includes(query);
      });

      return rows.sort((left, right) => this.compare(left, right));
    },

    columnCount(): number {
      return 7 + (this.showNamespace ? 1 : 0) + (this.showCluster ? 1 : 0);
    },

    podCount(): number {
      return this.visible.reduce((total, row) => total + row.pods.length, 0);
    },

    restartCount(): number {
      return this.visible.reduce((total, row) => total + row.restarts, 0);
    },
  },

  watch: {
    clusterId() {
      this.load();
    },

    namespaceKey() {
      this.load();
    },
  },

  mounted() {
    this.load();
  },

  methods: {
    formatTimestamp,
    formatCpuPair,
    formatBytesPair,
    stateTone,

    async load() {
      const requestId = ++this.requestId;
      const clusterId = this.clusterId;

      this.error = '';
      this.refreshing = this.rows.length > 0;
      this.loading = this.rows.length === 0;
      await loadConnection(clusterId, this.store?.dispatch?.bind(this.store));

      if (requestId !== this.requestId || this.clusterId !== clusterId) {
        return;
      }

      if (!this.configured) {
        this.rows = [];
        this.loading = false;
        this.refreshing = false;

        return;
      }

      const namespace = this.namespaces && this.namespaces.length === 1 ? this.namespaces[0] : undefined;

      try {
        const samples = await fetchPodMetrics(this.connection, namespace);
        let resources: WorkloadResource[] = [];

        if (this.store?.dispatch) {
          try {
            resources = await loadWorkloadResources(this.store.dispatch.bind(this.store));
          } catch {
            // Owner lookups are optional. Metrics still render as pods.
            resources = [];
          }
        }

        if (requestId !== this.requestId) {
          return;
        }

        this.rows = rollupApplications(samples, resources);
      } catch (error) {
        if (requestId !== this.requestId) {
          return;
        }

        this.error = error instanceof Error ? error.message : 'Could not load application metrics.';
      } finally {
        if (requestId === this.requestId) {
          this.loading = false;
          this.refreshing = false;
        }
      }
    },

    rowKey(row: AppRow): string {
      return `${ row.clusterName }/${ row.namespace }/${ row.kind }/${ row.name }`;
    },

    toggle(row: AppRow) {
      const key = this.rowKey(row);

      this.selectedKey = this.selectedKey === key ? '' : key;
    },

    chooseKind(kind: string) {
      this.kind = kind;
    },

    sortBy(key: string) {
      if (this.sortKey === key) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';

        return;
      }

      this.sortKey = key;
      this.sortDir = key === 'name' || key === 'namespace' ? 'asc' : 'desc';
    },

    compare(left: AppRow, right: AppRow): number {
      const direction = this.sortDir === 'asc' ? 1 : -1;
      const a = this.sortValue(left);
      const b = this.sortValue(right);

      if (typeof a === 'number' && typeof b === 'number') {
        return (a - b) * direction;
      }

      return String(a).localeCompare(String(b)) * direction;
    },

    sortValue(row: AppRow): string | number {
      if (this.sortKey === 'name') {
        return row.name;
      }

      if (this.sortKey === 'namespace') {
        return row.namespace;
      }

      if (this.sortKey === 'memory') {
        return row.memoryUsageBytes;
      }

      if (this.sortKey === 'restarts') {
        return row.restarts;
      }

      if (this.sortKey === 'updated') {
        return Date.parse(row.updatedAt) || 0;
      }

      return row.cpuUsageCores;
    },
  },
});
</script>

<template>
  <MetricsFrame
    title="Applications"
    description="CPU and memory for Deployments, StatefulSets, and Pods. Pod samples are rolled up to the workload that owns them."
    :cluster-id="clusterId"
    :loading="loading"
    :refreshing="refreshing"
    :error="error"
    :configured="configured"
    @refresh="load"
  >
    <div class="metrics-cards">
      <article class="metrics-card">
        <span>Workloads</span>
        <strong>{{ visible.length }}</strong>
      </article>
      <article class="metrics-card">
        <span>Pods</span>
        <strong>{{ podCount }}</strong>
      </article>
      <article class="metrics-card">
        <span>Restarts</span>
        <strong>{{ restartCount }}</strong>
      </article>
    </div>

    <div class="metrics-toolbar">
      <div
        class="metrics-chips"
        role="tablist"
        aria-label="Workload kind"
      >
        <button
          v-for="chip in chips"
          :key="chip.id"
          type="button"
          :class="['metrics-chip', { 'is-selected': kind === chip.id }]"
          @click="chooseKind(chip.id)"
        >
          {{ chip.label }}
          <span>{{ chip.count }}</span>
        </button>
      </div>
      <input
        v-model="query"
        class="metrics-input"
        type="search"
        placeholder="Filter workloads"
        aria-label="Filter workloads"
      >
    </div>

    <p
      v-if="!visible.length"
      class="metrics-empty"
    >
      No application metrics in this time range.
    </p>

    <table
      v-else
      class="metrics-table"
    >
      <thead>
        <tr>
          <th>
            <button
              type="button"
              class="metrics-sort"
              @click="sortBy('name')"
            >
              Name
            </button>
          </th>
          <th>Kind</th>
          <th v-if="showNamespace">
            <button
              type="button"
              class="metrics-sort"
              @click="sortBy('namespace')"
            >
              Namespace
            </button>
          </th>
          <th v-if="showCluster">
            Cluster
          </th>
          <th>Pods</th>
          <th>
            <button
              type="button"
              class="metrics-sort"
              @click="sortBy('cpu')"
            >
              CPU
            </button>
          </th>
          <th>
            <button
              type="button"
              class="metrics-sort"
              @click="sortBy('memory')"
            >
              Memory
            </button>
          </th>
          <th>
            <button
              type="button"
              class="metrics-sort"
              @click="sortBy('restarts')"
            >
              Restarts
            </button>
          </th>
          <th>
            <button
              type="button"
              class="metrics-sort"
              @click="sortBy('updated')"
            >
              Updated
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <template
          v-for="row in visible"
          :key="rowKey(row)"
        >
          <tr :class="{ 'is-selected': selectedKey === rowKey(row) }">
            <td>
              <button
                type="button"
                class="metrics-name"
                @click="toggle(row)"
              >
                {{ row.name }}
              </button>
            </td>
            <td>{{ row.kind }}</td>
            <td v-if="showNamespace">
              {{ row.namespace }}
            </td>
            <td v-if="showCluster">
              {{ row.clusterName }}
            </td>
            <td>{{ row.runningPods }}/{{ row.pods.length }}</td>
            <td>
              <UsageMeter
                mode="cpu"
                :used="row.cpuUsageCores"
                :capacity="row.cpuLimitCores"
              />
            </td>
            <td>
              <UsageMeter
                :used="row.memoryUsageBytes"
                :capacity="row.memoryLimitBytes"
              />
            </td>
            <td>{{ row.restarts }}</td>
            <td>{{ formatTimestamp(row.updatedAt) }}</td>
          </tr>
          <tr v-if="selectedKey === rowKey(row)">
            <td :colspan="columnCount">
              <div class="metrics-detail">
                <div class="metrics-detail-grid">
                  <UsageChart
                    label="CPU"
                    mode="cpu"
                    :points="row.cpuSeries"
                    :capacity="row.cpuLimitCores"
                    capacity-label="Limit"
                  />
                  <UsageChart
                    label="Memory"
                    mode="bytes"
                    :points="row.memorySeries"
                    :capacity="row.memoryLimitBytes"
                    capacity-label="Limit"
                  />
                </div>
                <table class="metrics-table metrics-nested">
                  <thead>
                    <tr>
                      <th>Pod</th>
                      <th>State</th>
                      <th>Node</th>
                      <th>CPU</th>
                      <th>Memory</th>
                      <th>Restarts</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="pod in row.pods"
                      :key="pod.name"
                    >
                      <td>
                        <div>{{ pod.name }}</div>
                        <div
                          v-for="container in pod.containers"
                          :key="container.name"
                          class="metrics-muted"
                        >
                          {{ container.name }}
                        </div>
                      </td>
                      <td>
                        <span :class="['metrics-pill', `is-${ stateTone(pod.state) }`]">
                          {{ pod.state || 'Unknown' }}
                        </span>
                      </td>
                      <td>{{ pod.nodeName || '—' }}</td>
                      <td>{{ formatCpuPair(pod.cpuUsageCores, pod.cpuLimitCores) }}</td>
                      <td>{{ formatBytesPair(pod.memoryUsageBytes, pod.memoryLimitBytes) }}</td>
                      <td>{{ pod.restarts }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </MetricsFrame>
</template>
