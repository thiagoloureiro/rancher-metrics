<script lang="ts">
import { defineComponent } from 'vue';
import MetricsFrame from '../components/MetricsFrame.vue';
import UsageChart from '../components/UsageChart.vue';
import UsageMeter from '../components/UsageMeter.vue';
import { isConfigured, useConnection, type MetricsConnection } from '../services/connection-settings';
import { fetchVolumeMetrics } from '../services/metrics-client';
import {
  formatBytes,
  formatTimestamp,
  rollupVolumes,
  showsClusterColumn,
  usagePercent,
  type VolumeRow,
} from '../services/metrics';
import {
  activeNamespaces,
  clusterIdFrom,
  type DashboardStore,
} from '../services/rancher-context';

type SortDir = 'asc' | 'desc';

export default defineComponent({
  name: 'VolumeMetrics',

  components: { MetricsFrame, UsageChart, UsageMeter },

  data() {
    return {
      rows:        [] as VolumeRow[],
      error:       '',
      loading:     false,
      refreshing:  false,
      requestId:   0,
      query:       '',
      sortKey:     'used',
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

    scoped(): VolumeRow[] {
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

    visible(): VolumeRow[] {
      const query = this.query.trim().toLowerCase();
      const rows = this.scoped.filter((row) => {
        if (!query) {
          return true;
        }

        return [row.name, row.namespace, row.volumeName, row.pods.join(' ')]
          .join(' ')
          .toLowerCase()
          .includes(query);
      });

      return rows.sort((left, right) => this.compare(left, right));
    },

    columnCount(): number {
      return 4 + (this.showNamespace ? 1 : 0) + (this.showCluster ? 1 : 0);
    },

    highUsage(): number {
      return this.visible.filter((row) => {
        const percent = usagePercent(row.usedBytes, row.capacityBytes);

        return percent != null && percent >= 80;
      }).length;
    },

    totalUsed(): string {
      const used = this.visible.reduce((total, row) => total + row.usedBytes, 0);

      return formatBytes(used);
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
    formatBytes,
    formatTimestamp,

    async load() {
      if (!this.configured) {
        this.rows = [];
        this.error = '';
        this.loading = false;
        this.refreshing = false;

        return;
      }

      const requestId = ++this.requestId;

      this.error = '';
      this.refreshing = this.rows.length > 0;
      this.loading = this.rows.length === 0;

      try {
        const samples = await fetchVolumeMetrics(this.connection);

        if (requestId !== this.requestId) {
          return;
        }

        this.rows = rollupVolumes(samples);
      } catch (error) {
        if (requestId !== this.requestId) {
          return;
        }

        this.error = error instanceof Error ? error.message : 'Could not load volume metrics.';
      } finally {
        if (requestId === this.requestId) {
          this.loading = false;
          this.refreshing = false;
        }
      }
    },

    rowKey(row: VolumeRow): string {
      return `${ row.clusterName }/${ row.namespace }/${ row.name }`;
    },

    toggle(row: VolumeRow) {
      const key = this.rowKey(row);

      this.selectedKey = this.selectedKey === key ? '' : key;
    },

    sortBy(key: string) {
      if (this.sortKey === key) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';

        return;
      }

      this.sortKey = key;
      this.sortDir = key === 'name' || key === 'namespace' ? 'asc' : 'desc';
    },

    compare(left: VolumeRow, right: VolumeRow): number {
      const direction = this.sortDir === 'asc' ? 1 : -1;
      const a = this.sortValue(left);
      const b = this.sortValue(right);

      if (typeof a === 'number' && typeof b === 'number') {
        return (a - b) * direction;
      }

      return String(a).localeCompare(String(b)) * direction;
    },

    sortValue(row: VolumeRow): string | number {
      if (this.sortKey === 'name') {
        return row.name;
      }

      if (this.sortKey === 'namespace') {
        return row.namespace;
      }

      if (this.sortKey === 'updated') {
        return Date.parse(row.updatedAt) || 0;
      }

      return usagePercent(row.usedBytes, row.capacityBytes) || 0;
    },
  },
});
</script>

<template>
  <MetricsFrame
    title="Volumes"
    description="PVC capacity and bytes used, from the volumes mounted by pods in this cluster."
    :cluster-id="clusterId"
    :loading="loading"
    :refreshing="refreshing"
    :error="error"
    :configured="configured"
    @refresh="load"
  >
    <div class="metrics-cards">
      <article class="metrics-card">
        <span>Volumes</span>
        <strong>{{ visible.length }}</strong>
      </article>
      <article class="metrics-card">
        <span>Over 80% full</span>
        <strong>{{ highUsage }}</strong>
      </article>
      <article class="metrics-card">
        <span>Used</span>
        <strong>{{ totalUsed }}</strong>
      </article>
    </div>

    <div class="metrics-toolbar">
      <input
        v-model="query"
        class="metrics-input"
        type="search"
        placeholder="Filter volumes"
        aria-label="Filter volumes"
      >
      <span class="metrics-muted">{{ visible.length }} shown</span>
    </div>

    <p
      v-if="!visible.length"
      class="metrics-empty"
    >
      No volume metrics in this time range.
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
              Volume
            </button>
          </th>
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
          <th>
            <button
              type="button"
              class="metrics-sort"
              @click="sortBy('used')"
            >
              Used
            </button>
          </th>
          <th>Pods</th>
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
            <td v-if="showNamespace">
              {{ row.namespace }}
            </td>
            <td v-if="showCluster">
              {{ row.clusterName }}
            </td>
            <td>
              <UsageMeter
                :used="row.usedBytes"
                :capacity="row.capacityBytes"
              />
            </td>
            <td>{{ row.pods.length }}</td>
            <td>{{ formatTimestamp(row.updatedAt) }}</td>
          </tr>
          <tr v-if="selectedKey === rowKey(row)">
            <td :colspan="columnCount">
              <div class="metrics-detail">
                <dl>
                  <div>
                    <dt>Volume</dt>
                    <dd>{{ row.volumeName || '—' }}</dd>
                  </div>
                  <div>
                    <dt>Available</dt>
                    <dd>{{ formatBytes(row.availableBytes) }}</dd>
                  </div>
                  <div>
                    <dt>Pods</dt>
                    <dd>{{ row.pods.join(', ') || '—' }}</dd>
                  </div>
                </dl>
                <UsageChart
                  label="Used"
                  mode="bytes"
                  :points="row.usedSeries"
                  :capacity="row.capacityBytes"
                />
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </MetricsFrame>
</template>
