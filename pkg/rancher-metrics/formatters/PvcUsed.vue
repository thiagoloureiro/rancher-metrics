<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import UsageMeter from '../components/UsageMeter.vue';
import { isConfigured, loadConnection, useConnection } from '../services/connection-settings';
import { volumeForClaim, type VolumeRow } from '../services/metrics';
import { clusterIdFrom, type DashboardStore } from '../services/rancher-context';
import { loadVolumeUsage } from '../services/volume-usage';

export default defineComponent({
  name: 'PvcUsed',

  components: { UsageMeter },

  props: {
    row: {
      type:     Object as PropType<Record<string, unknown>>,
      required: true,
    },
  },

  data() {
    return {
      rows:    [] as VolumeRow[],
      error:   '',
      loading: true,
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

    configured(): boolean {
      return isConfigured(useConnection(this.clusterId));
    },

    reloadKey(): string {
      const connection = useConnection(this.clusterId);

      return [
        this.clusterId,
        connection.baseUrl,
        connection.clusterName,
        String(connection.minutes),
        connection.apiKey,
      ].join('\n');
    },

    identity(): { name: string; namespace: string } {
      const metadata = this.row.metadata as { name?: string; namespace?: string } | undefined;

      return {
        name:      metadata?.name || String(this.row.name || ''),
        namespace: metadata?.namespace || String(this.row.namespace || ''),
      };
    },

    volume(): VolumeRow | undefined {
      return volumeForClaim(this.rows, this.identity.namespace, this.identity.name);
    },

    hint(): string {
      const connection = useConnection(this.clusterId);

      if (!this.configured) {
        return connection.error || 'Configure AlertHawk in Metrics settings.';
      }

      if (this.error) {
        return this.error;
      }

      return 'No usage sample for this volume.';
    },
  },

  watch: {
    reloadKey: {
      immediate: true,
      handler() {
        this.load();
      },
    },
  },

  methods: {
    async load() {
      const clusterId = this.clusterId;

      if (!clusterId) {
        this.rows = [];
        this.error = '';
        this.loading = false;

        return;
      }

      this.loading = this.rows.length === 0;
      await loadConnection(clusterId, this.store?.dispatch?.bind(this.store));

      if (this.clusterId !== clusterId) {
        return;
      }

      if (!this.configured) {
        this.rows = [];
        this.error = '';
        this.loading = false;

        return;
      }

      try {
        const result = await loadVolumeUsage(clusterId);

        if (this.clusterId !== clusterId) {
          return;
        }

        this.rows = result.rows;
        this.error = result.error;
      } finally {
        if (this.clusterId === clusterId) {
          this.loading = false;
        }
      }
    },
  },
});
</script>

<template>
  <div class="metrics-pvc-used">
    <span
      v-if="loading"
      class="metrics-muted"
    >…</span>
    <UsageMeter
      v-else-if="volume"
      :used="volume.usedBytes"
      :capacity="volume.capacityBytes"
    />
    <span
      v-else
      class="metrics-muted"
      :title="hint"
    >—</span>
  </div>
</template>
