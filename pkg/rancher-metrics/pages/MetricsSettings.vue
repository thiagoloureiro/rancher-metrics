<script lang="ts">
import { defineComponent } from 'vue';
import {
  isConfigured,
  saveConnection,
  useConnection,
  type MetricsConnection,
} from '../services/connection-settings';
import { fetchClusterNames } from '../services/metrics-client';
import { API_KEY_HEADER, validateBaseUrl } from '../services/metrics';
import {
  clusterDisplayName,
  clusterIdFrom,
  type DashboardStore,
} from '../services/rancher-context';

function blank(): MetricsConnection {
  return {
    baseUrl:     '',
    apiKey:      '',
    clusterName: '',
    minutes:     60,
  };
}

export default defineComponent({
  name: 'MetricsSettings',

  data() {
    return {
      form:         blank(),
      clusters:     [] as string[],
      testing:      false,
      testMessage:  '',
      testOk:       false,
      saved:        false,
      showKey:      false,
      headerName:   API_KEY_HEADER,
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

    displayName(): string {
      return clusterDisplayName(this.store?.getters, this.clusterId);
    },

    connected(): boolean {
      return isConfigured(useConnection(this.clusterId));
    },

    nodesTo(): { name: string; params: { cluster: string } } {
      return {
        name:   'c-cluster-explorer-node-metrics',
        params: { cluster: this.clusterId },
      };
    },
  },

  watch: {
    clusterId: {
      immediate: true,
      handler() {
        this.loadForm();
      },
    },
  },

  methods: {
    loadForm() {
      const saved = useConnection(this.clusterId);

      this.form = {
        baseUrl:     saved.baseUrl,
        apiKey:      saved.apiKey,
        clusterName: saved.clusterName,
        minutes:     saved.minutes,
      };
      this.saved = false;
      this.testMessage = '';
      this.testOk = false;
    },

    useDisplayName() {
      this.form.clusterName = this.displayName;
      this.saved = false;
    },

    useCluster(name: string) {
      this.form.clusterName = name;
      this.saved = false;
    },

    save() {
      const urlError = validateBaseUrl(this.form.baseUrl);

      this.saved = false;
      this.testOk = false;

      if (urlError) {
        this.testMessage = urlError;

        return;
      }

      if (!this.form.apiKey.trim()) {
        this.testMessage = 'API key is required.';

        return;
      }

      saveConnection(this.clusterId, this.form);
      this.form.baseUrl = useConnection(this.clusterId).baseUrl;
      this.saved = true;
      this.testMessage = '';
    },

    async testConnection() {
      const urlError = validateBaseUrl(this.form.baseUrl);

      this.saved = false;
      this.testMessage = '';
      this.testOk = false;

      if (urlError) {
        this.testMessage = urlError;

        return;
      }

      if (!this.form.apiKey.trim()) {
        this.testMessage = 'API key is required.';

        return;
      }

      this.testing = true;

      try {
        const names = await fetchClusterNames({
          ...this.form,
          minutes: useConnection(this.clusterId).minutes,
        });

        this.clusters = names;
        this.testOk = true;
        this.testMessage = names.length
          ? `Connected. ${ names.length } cluster ${ names.length === 1 ? 'name' : 'names' } found. Save to keep this key in the browser.`
          : 'Connected. No cluster names are stored yet. Save to keep this key in the browser.';
      } catch (error) {
        this.testOk = false;
        this.testMessage = error instanceof Error ? error.message : 'Could not connect.';
      } finally {
        this.testing = false;
      }
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
        <h1>Settings</h1>
        <p>
          AlertHawk URL, API key, and the cluster name used to filter metrics.
          Values are stored in this browser for Rancher cluster {{ clusterId || 'this cluster' }}.
        </p>
      </div>
      <router-link
        class="metrics-button metrics-button-secondary"
        :to="nodesTo"
      >
        View nodes
      </router-link>
    </header>

    <section class="metrics-card metrics-form">
      <h2>Connection</h2>
      <label class="metrics-field">
        <span>AlertHawk URL</span>
        <input
          v-model="form.baseUrl"
          class="metrics-input"
          type="url"
          placeholder="https://metrics.example.com"
          autocomplete="off"
          spellcheck="false"
        >
      </label>
      <p class="metrics-muted">
        Server origin only. Requests go to <code>/metrics/api/metrics</code> with the <code>{{ headerName }}</code> header.
      </p>

      <label class="metrics-field">
        <span>API key</span>
        <span class="metrics-key">
          <input
            v-model="form.apiKey"
            class="metrics-input"
            :type="showKey ? 'text' : 'password'"
            autocomplete="off"
            spellcheck="false"
          >
          <button
            type="button"
            class="metrics-button metrics-button-secondary"
            @click="showKey = !showKey"
          >
            {{ showKey ? 'Hide' : 'Show' }}
          </button>
        </span>
      </label>

      <label class="metrics-field">
        <span>AlertHawk cluster name</span>
        <input
          v-model="form.clusterName"
          class="metrics-input"
          type="text"
          list="metrics-cluster-names"
          placeholder="prod-aks"
          autocomplete="off"
          spellcheck="false"
        >
      </label>
      <datalist id="metrics-cluster-names">
        <option
          v-for="name in clusters"
          :key="name"
          :value="name"
        />
      </datalist>
      <p class="metrics-muted">
        This must match the cluster name the collector writes. Leave it blank to use the API default.
      </p>
      <div class="metrics-chips">
        <button
          v-if="displayName"
          type="button"
          class="metrics-chip"
          @click="useDisplayName"
        >
          Use {{ displayName }}
        </button>
        <button
          v-for="name in clusters"
          :key="name"
          type="button"
          class="metrics-chip"
          @click="useCluster(name)"
        >
          {{ name }}
        </button>
      </div>

      <div class="metrics-actions">
        <button
          type="button"
          class="metrics-button"
          @click="save"
        >
          Save
        </button>
        <button
          type="button"
          class="metrics-button metrics-button-secondary"
          :disabled="testing"
          @click="testConnection"
        >
          {{ testing ? 'Testing…' : 'Test connection' }}
        </button>
        <span
          v-if="saved"
          class="metrics-success"
        >
          Saved for this cluster.
        </span>
        <span
          v-else-if="connected"
          class="metrics-muted"
        >
          A key is already saved.
        </span>
      </div>
      <p
        v-if="testMessage"
        :class="testOk ? 'metrics-success' : 'metrics-error-text'"
      >
        {{ testMessage }}
      </p>
    </section>
  </div>
</template>
