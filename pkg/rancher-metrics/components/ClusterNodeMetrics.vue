<script lang="ts">
import { defineComponent } from 'vue';
import NodeMetrics from '../pages/NodeMetrics.vue';

type VueHost = {
  useHash?: boolean;
  tabs?: unknown[];
  $parent?: VueHost;
  $options?: { name?: string };
};

export default defineComponent({
  name: 'ClusterNodeMetrics',

  components: { NodeMetrics },

  inject: ['removeTab'],

  data() {
    return { shown: true };
  },

  created() {
    const tabbed = this.host((current) => Array.isArray(current.tabs) && typeof current.useHash === 'boolean');

    // The cluster page has a second tab set for Grafana. That set does not use the URL hash.
    if (tabbed && tabbed.useHash === false) {
      this.shown = false;
    }
  },

  mounted() {
    if (this.shown) {
      return;
    }

    this.$nextTick(() => {
      const tab = this.host((current) => current.$options?.name === 'Tab');
      const remove = (this as unknown as { removeTab?: (tab: VueHost) => void }).removeTab;

      if (tab && remove) {
        remove(tab);
      }
    });
  },

  methods: {
    host(match: (current: VueHost) => boolean): VueHost | null {
      let current = (this as unknown as { $parent?: VueHost }).$parent;

      while (current) {
        if (match(current)) {
          return current;
        }

        current = current.$parent;
      }

      return null;
    },
  },
});
</script>

<template>
  <div
    v-if="shown"
    class="metrics-cluster-nodes"
  >
    <NodeMetrics />
  </div>
</template>
