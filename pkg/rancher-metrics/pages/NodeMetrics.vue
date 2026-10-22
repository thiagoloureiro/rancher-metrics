<script lang="ts">
import { defineComponent } from 'vue';
import MetricsFrame from '../components/MetricsFrame.vue';
import UsageChart from '../components/UsageChart.vue';
import UsageMeter from '../components/UsageMeter.vue';
import { isConfigured, loadConnection, useConnection, type MetricsConnection } from '../services/connection-settings';
import { fetchNodeMetrics } from '../services/metrics-client';
import {
  FRESH_NODE_MS,
  formatTimestamp,
  latestNodeRows,
  nodeStatus,
  showsClusterColumn,
  updatedWithin,
  type NodeRow,
} from '../services/metrics';
import { clusterIdFrom, type DashboardStore } from '../services/rancher-context';

type SortDir = 'asc' | 'desc';

export default defineComponent({
  name: 'NodeMetrics',

  components: { MetricsFrame, UsageChart, UsageMeter },

  data() {
    return {
      rows:        [] as NodeRow[],
      error:       '',
      loading:     false,
      refreshing:  false,
      requestId:   0,
      query:       '',
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

    showCluster(): boolean {
      return showsClusterColumn(this.visible.map((row) => row.clusterName));
    },

    visible(): NodeRow[] {
      const query = this.query.trim().toLowerCase();
      const now = Date.now();
      const rows = this.rows.filter((row) => {
        if (!updatedWithin(row.updatedAt, FRESH_NODE_MS, now)) {
          return false;
        }

        if (!query) {
          return true;
        }

        return [row.name, row.clusterName, row.instanceType, row.region, row.kubernetesVersion]
          .join(' ')
          .toLowerCase()
          .includes(query);
      });

      return rows.sort((left, right) => this.compare(left, right));
    },

    emptyMessage(): string {
      if (!this.query.trim() && this.rows.length && !this.visible.length) {
        return 'No nodes updated in the last 5 minutes.';
      }

      return 'No node metrics in this time range.';
    },

    selected(): NodeRow | null {
      return this.visible.find((row) => this.rowKey(row) === this.selectedKey) || null;
    },

    readyCount(): number {
      return this.visible.filter((row) => nodeStatus(row).label === 'Ready').length;
    },

    columnCount(): number {
      return this.showCluster ? 7 : 6;
    },
  },

  watch: {
    clusterId() {
      this.load();
    },
  },

  mounted() {
    this.load();
  },

  methods: {
    formatTimestamp,
    nodeStatus,

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

      try {
        const samples = await fetchNodeMetrics(this.connection);

        if (requestId !== this.requestId) {
          return;
        }

        this.rows = latestNodeRows(samples);
      } catch (error) {
        if (requestId !== this.requestId) {
          return;
        }

        this.error = error instanceof Error ? error.message : 'Could not load node metrics.';
      } finally {
        if (requestId === this.requestId) {
          this.loading = false;
          this.refreshing = false;
        }
      }
    },

    rowKey(row: NodeRow): string {
      return `${ row.clusterName }/${ row.name }`;
    },

    toggle(row: NodeRow) {
      const key = this.rowKey(row);

      this.selectedKey = this.selectedKey === key ? '' : key;
    },

    sortBy(key: string) {
      if (this.sortKey === key) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';

        return;
      }

      this.sortKey = key;
      this.sortDir = key === 'name' ? 'asc' : 'desc';
    },

    compare(left: NodeRow, right: NodeRow): number {
      const direction = this.sortDir === 'asc' ? 1 : -1;
      const a = this.sortValue(left);
      const b = this.sortValue(right);

      if (typeof a === 'number' && typeof b === 'number') {
        return (a - b) * direction;
      }

      return String(a).localeCompare(String(b)) * direction;
    },

    sortValue(row: NodeRow): string | number {
      if (this.sortKey === 'name') {
        return row.name;
      }

      if (this.sortKey === 'memory') {
        return row.memoryUsageBytes;
      }

      if (this.sortKey === 'updated') {
        return Date.parse(row.updatedAt) || 0;
      }

      return row.cpuUsageCores;
    },

    pressure(row: NodeRow): string {
      const labels = [
        row.memoryPressure ? 'Memory' : '',
        row.diskPressure ? 'Disk' : '',
        row.pidPressure ? 'PID' : '',
      ].filter(Boolean);

      return labels.length ? labels.join(', ') : 'None';
    },
  },
});
</script>

<template>
  <MetricsFrame
    title="Nodes"
    description="CPU, memory, and pressure reported by AlertHawk for the nodes in this cluster."
    :cluster-id="clusterId"
    :loading="loading"
    :refreshing="refreshing"
    :error="error"
    :configured="configured"
    @refresh="load"
  >
    <div class="metrics-cards">
      <article class="metrics-card">
        <span>Nodes</span>
        <strong>{{ visible.length }}</strong>
      </article>
      <article class="metrics-card">
        <span>Ready</span>
        <strong>{{ readyCount }}</strong>
      </article>
    </div>

    <div class="metrics-toolbar">
      <input
        v-model="query"
        class="metrics-input"
        type="search"
        placeholder="Filter nodes"
        aria-label="Filter nodes"
      >
      <span class="metrics-muted">{{ visible.length }} shown</span>
    </div>

    <p
      v-if="!visible.length"
      class="metrics-empty"
    >
      {{ emptyMessage }}
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
              Node
            </button>
          </th>
          <th v-if="showCluster">
            Cluster
          </th>
          <th>Status</th>
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
          <th>Instance</th>
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
            <td v-if="showCluster">
              {{ row.clusterName }}
            </td>
            <td>
              <span :class="['metrics-pill', `is-${ nodeStatus(row).tone }`]">
                {{ nodeStatus(row).label }}
              </span>
            </td>
            <td>
              <UsageMeter
                mode="cpu"
                :used="row.cpuUsageCores"
                :capacity="row.cpuCapacityCores"
              />
            </td>
            <td>
              <UsageMeter
                :used="row.memoryUsageBytes"
                :capacity="row.memoryCapacityBytes"
              />
            </td>
            <td>{{ row.instanceType || '—' }}</td>
            <td>{{ formatTimestamp(row.updatedAt) }}</td>
          </tr>
          <tr v-if="selectedKey === rowKey(row)">
            <td :colspan="columnCount">
              <div class="metrics-detail">
                <dl>
                  <div>
                    <dt>Kubernetes</dt>
                    <dd>{{ row.kubernetesVersion || '—' }}</dd>
                  </div>
                  <div>
                    <dt>OS</dt>
                    <dd>{{ row.operatingSystem || '—' }} · {{ row.architecture || '—' }}</dd>
                  </div>
                  <div>
                    <dt>Region</dt>
                    <dd>{{ row.region || '—' }}</dd>
                  </div>
                  <div>
                    <dt>Provider</dt>
                    <dd>{{ row.cloudProvider || '—' }}</dd>
                  </div>
                  <div>
                    <dt>Environment</dt>
                    <dd>{{ row.environment || '—' }}</dd>
                  </div>
                  <div>
                    <dt>Pressure</dt>
                    <dd>{{ pressure(row) }}</dd>
                  </div>
                </dl>
                <div class="metrics-detail-grid">
                  <UsageChart
                    label="CPU"
                    mode="cpu"
                    :points="row.cpuSeries"
                    :capacity="row.cpuCapacityCores"
                  />
                  <UsageChart
                    label="Memory"
                    mode="bytes"
                    :points="row.memorySeries"
                    :capacity="row.memoryCapacityBytes"
                  />
                </div>
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </MetricsFrame>
</template>
