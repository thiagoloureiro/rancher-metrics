<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import UsageChart from './UsageChart.vue';
import UsageMeter from './UsageMeter.vue';
import { loadApplicationUsage } from '../services/application-usage';
import { isConfigured, loadConnection, setMinutes, useConnection } from '../services/connection-settings';
import {
  applicationForWorkload,
  canonicalKind,
  formatBytesPair,
  formatCpuPair,
  formatTimestamp,
  stateTone,
  TIME_RANGES,
  type AppRow,
} from '../services/metrics';
import { clusterIdFrom, type DashboardStore } from '../services/rancher-context';

const WORKLOAD_KINDS = new Set(['Deployment', 'StatefulSet', 'DaemonSet']);

export default defineComponent({
  name: 'WorkloadUsage',

  components: { UsageChart, UsageMeter },

  props: {
    resource: {
      type:    Object as PropType<Record<string, unknown>>,
      default: () => ({}),
    },
  },

  data() {
    return {
      rows:       [] as AppRow[],
      error:      '',
      loading:    false,
      refreshing: false,
    };
  },

  computed: {
    ranges() {
      return TIME_RANGES;
    },

    store(): DashboardStore {
      return (this as unknown as { $store: DashboardStore }).$store;
    },

    clusterId(): string {
      const route = (this as unknown as { $route?: { params?: { cluster?: unknown } } }).$route;

      return clusterIdFrom(route?.params?.cluster, this.store?.getters);
    },

    configured(): boolean {
      return isConfigured(useConnection(this.clusterId));
    },

    pending(): boolean {
      if (this.configured || !this.clusterId || !this.identity.kind) {
        return false;
      }

      const status = useConnection(this.clusterId).status;

      return status === 'idle' || status === 'loading';
    },

    settingsError(): string {
      if (this.configured) {
        return '';
      }

      return useConnection(this.clusterId).error;
    },

    minutes(): number {
      return useConnection(this.clusterId).minutes;
    },

    identity(): { namespace: string; kind: string; name: string } {
      const metadata = this.resource.metadata as { name?: string; namespace?: string } | undefined;
      const kind = canonicalKind(String(this.resource.kind || this.resource.type || ''));

      return {
        namespace: metadata?.namespace || '',
        kind:      WORKLOAD_KINDS.has(kind) ? kind : '',
        name:      metadata?.name || '',
      };
    },

    reloadKey(): string {
      const connection = useConnection(this.clusterId);
      const identity = this.identity;

      return [
        this.clusterId,
        connection.baseUrl,
        connection.clusterName,
        String(connection.minutes),
        connection.apiKey,
        identity.namespace,
        identity.kind,
        identity.name,
      ].join('\n');
    },

    application(): AppRow | undefined {
      const identity = this.identity;
      const connection = useConnection(this.clusterId);

      return applicationForWorkload(
        this.rows,
        identity.namespace,
        identity.kind,
        identity.name,
        connection.clusterName,
      );
    },

    settingsTo(): { name: string; params: { cluster: string } } {
      return {
        name:   'c-cluster-explorer-metrics-settings',
        params: { cluster: this.clusterId },
      };
    },
  },

  watch: {
    reloadKey: {
      immediate: true,
      handler() {
        this.load(false);
      },
    },
  },

  methods: {
    formatTimestamp,
    formatCpuPair,
    formatBytesPair,
    stateTone,

    changeMinutes(event: Event) {
      setMinutes(this.clusterId, Number((event.target as HTMLSelectElement).value));
    },

    async load(refresh: boolean) {
      const clusterId = this.clusterId;
      const identity = this.identity;

      if (!clusterId || !identity.kind || !identity.name) {
        this.rows = [];
        this.error = '';
        this.loading = false;
        this.refreshing = false;

        return;
      }

      await loadConnection(clusterId, this.store?.dispatch?.bind(this.store));

      if (this.clusterId !== clusterId || this.identity.name !== identity.name) {
        return;
      }

      if (!this.configured) {
        this.rows = [];
        this.error = '';
        this.loading = false;
        this.refreshing = false;

        return;
      }

      this.error = '';
      this.refreshing = refresh && this.rows.length > 0;
      this.loading = this.rows.length === 0;

      try {
        const result = await loadApplicationUsage(
          clusterId,
          identity.namespace,
          this.store?.dispatch?.bind(this.store),
          refresh,
        );

        if (this.clusterId !== clusterId || this.identity.name !== identity.name) {
          return;
        }

        this.rows = result.rows;
        this.error = result.error;
      } finally {
        if (this.clusterId === clusterId) {
          this.loading = false;
          this.refreshing = false;
        }
      }
    },
  },
});
</script>

<template>
  <div class="metrics-workload">
    <section
      v-if="pending"
      class="metrics-empty"
    >
      <p>Loading settings…</p>
    </section>

    <section
      v-else-if="!configured"
      class="metrics-empty"
    >
      <p v-if="settingsError">
        {{ settingsError }}
      </p>
      <p v-else>
        Add the AlertHawk URL and an API key in Settings. Everyone on this cluster shares that connection.
      </p>
      <router-link
        class="metrics-button"
        :to="settingsTo"
      >
        Open settings
      </router-link>
    </section>

    <template v-else>
      <div class="metrics-workload-head">
        <p class="metrics-muted">
          CPU and memory from AlertHawk for this workload and its pods.
        </p>
        <div class="metrics-header-actions">
          <label>
            <span class="metrics-muted">Range</span>
            <select
              class="metrics-select"
              :value="minutes"
              @change="changeMinutes"
            >
              <option
                v-for="range in ranges"
                :key="range.minutes"
                :value="range.minutes"
              >
                {{ range.label }}
              </option>
            </select>
          </label>
          <button
            type="button"
            class="metrics-button"
            :disabled="loading || refreshing"
            @click="load(true)"
          >
            {{ refreshing ? 'Refreshing…' : 'Refresh' }}
          </button>
        </div>
      </div>

      <p
        v-if="loading"
        class="metrics-muted"
      >
        Loading metrics…
      </p>
      <p
        v-else-if="error"
        class="metrics-error"
      >
        {{ error }}
      </p>
      <p
        v-else-if="!application"
        class="metrics-muted"
      >
        No usage sample for this workload.
      </p>

      <template v-else-if="application">
        <div class="metrics-workload-meters">
          <div>
            <p class="metrics-muted">
              CPU
            </p>
            <UsageMeter
              mode="cpu"
              :used="application.cpuUsageCores"
              :capacity="application.cpuLimitCores"
            />
          </div>
          <div>
            <p class="metrics-muted">
              Memory
            </p>
            <UsageMeter
              :used="application.memoryUsageBytes"
              :capacity="application.memoryLimitBytes"
            />
          </div>
        </div>

        <p class="metrics-muted">
          {{ application.runningPods }}/{{ application.pods.length }} pods running
          · {{ application.restarts }} restarts
          · updated {{ formatTimestamp(application.updatedAt) }}
        </p>

        <div class="metrics-detail-grid">
          <UsageChart
            label="CPU"
            mode="cpu"
            :points="application.cpuSeries"
            :capacity="application.cpuLimitCores"
            capacity-label="Limit"
          />
          <UsageChart
            label="Memory"
            mode="bytes"
            :points="application.memorySeries"
            :capacity="application.memoryLimitBytes"
            capacity-label="Limit"
          />
        </div>

        <table class="metrics-table">
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
              v-for="pod in application.pods"
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
      </template>
    </template>
  </div>
</template>
