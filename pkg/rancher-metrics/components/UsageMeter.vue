<script lang="ts">
import { defineComponent } from 'vue';
import {
  formatBytesPair,
  formatCpuPair,
  formatPercent,
  usagePercent,
  usageTone,
} from '../services/metrics';

export default defineComponent({
  name: 'UsageMeter',

  props: {
    used: {
      type:     Number,
      required: true,
    },
    capacity: {
      default: null as number | null,
    },
    mode: {
      type:    String,
      default: 'bytes',
    },
  },

  computed: {
    percent(): number | null {
      return usagePercent(this.used, this.capacity);
    },

    tone(): string {
      return usageTone(this.percent);
    },

    label(): string {
      const pair = this.mode === 'cpu'
        ? formatCpuPair(this.used, this.capacity)
        : formatBytesPair(this.used, this.capacity);

      if (this.percent == null) {
        return pair;
      }

      return `${ pair } · ${ formatPercent(this.percent) }`;
    },

    width(): string {
      if (this.percent == null) {
        return '0%';
      }

      return `${ Math.min(100, Math.max(0, this.percent)) }%`;
    },
  },
});
</script>

<template>
  <div class="metrics-usage">
    <div
      class="metrics-usage-track"
      :title="label"
    >
      <div
        :class="['metrics-usage-fill', `is-${ tone }`]"
        :style="{ width }"
      />
    </div>
    <span>{{ label }}</span>
  </div>
</template>
