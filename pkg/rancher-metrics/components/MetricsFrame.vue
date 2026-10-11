<script lang="ts">
import { defineComponent } from 'vue';
import { setMinutes, useConnection } from '../services/connection-settings';
import { TIME_RANGES } from '../services/metrics';

export default defineComponent({
  name: 'MetricsFrame',

  props: {
    title: {
      type:     String,
      required: true,
    },
    description: {
      type:     String,
      required: true,
    },
    clusterId: {
      type:     String,
      required: true,
    },
    loading: {
      type:    Boolean,
      default: false,
    },
    refreshing: {
      type:    Boolean,
      default: false,
    },
    error: {
      type:    String,
      default: '',
    },
    configured: {
      type:    Boolean,
      default: false,
    },
  },

  emits: ['refresh'],

  computed: {
    ranges() {
      return TIME_RANGES;
    },

    minutes(): number {
      return useConnection(this.clusterId).minutes;
    },

    clusterName(): string {
      return useConnection(this.clusterId).clusterName;
    },

    settingsPending(): boolean {
      if (this.configured) {
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

    settingsTo(): { name: string; params: { cluster: string } } {
      return {
        name:   'c-cluster-explorer-metrics-settings',
        params: { cluster: this.clusterId },
      };
    },
  },

  methods: {
    changeMinutes(event: Event) {
      setMinutes(this.clusterId, Number((event.target as HTMLSelectElement).value));
      this.$emit('refresh');
    },

    refresh() {
      this.$emit('refresh');
    },
  },
});
</script>

<template>
  <div class="metrics-page">
    <header class="metrics-header">
      <div>
        <p class="metrics-kicker">
          Metrics
        </p>
        <h1>{{ title }}</h1>
        <p>
          {{ description }}
          Connection details are in
          <router-link :to="settingsTo">
            Settings
          </router-link>.
        </p>
        <p
          v-if="configured"
          class="metrics-muted"
        >
          {{ clusterName ? `AlertHawk cluster ${ clusterName }` : 'No AlertHawk cluster filter' }}
        </p>
      </div>
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
          :disabled="loading"
          @click="refresh"
        >
          {{ refreshing ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>
    </header>

    <section
      v-if="settingsPending"
      class="metrics-empty"
    >
      <p>Loading settings…</p>
    </section>

    <section
      v-else-if="!configured"
      class="metrics-empty"
    >
      <h2>Connect AlertHawk</h2>
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

    <section
      v-else-if="loading"
      class="metrics-empty"
    >
      <p>Loading metrics…</p>
    </section>

    <section
      v-else-if="error"
      class="metrics-error"
    >
      <p>{{ error }}</p>
      <button
        type="button"
        class="metrics-button"
        @click="refresh"
      >
        Try again
      </button>
    </section>

    <slot v-else />
  </div>
</template>
