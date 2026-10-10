<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import { formatBytes, formatCpu, type UsagePoint } from '../services/metrics';

export default defineComponent({
  name: 'Sparkline',

  props: {
    points: {
      type:     Array as PropType<UsagePoint[]>,
      required: true,
    },
    label: {
      type:     String,
      required: true,
    },
    mode: {
      type:    String,
      default: 'cpu',
    },
  },

  computed: {
    polyline(): string {
      if (this.points.length < 2) {
        return '';
      }

      const values = this.points.map((point) => point.value);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const span = max - min || 1;
      const width = 240;
      const height = 48;

      return this.points.map((point, index) => {
        const x = (index / (this.points.length - 1)) * width;
        const y = height - ((point.value - min) / span) * (height - 4) - 2;

        return `${ x.toFixed(1) },${ y.toFixed(1) }`;
      }).join(' ');
    },

    caption(): string {
      if (this.points.length < 2) {
        return 'Not enough samples for a trend.';
      }

      const last = this.points[this.points.length - 1];
      const value = this.mode === 'bytes' ? formatBytes(last.value) : formatCpu(last.value);

      return `${ this.points.length } samples · latest ${ value }`;
    },
  },
});
</script>

<template>
  <figure class="metrics-spark">
    <figcaption>{{ label }}</figcaption>
    <svg
      v-if="polyline"
      viewBox="0 0 240 48"
      role="img"
      :aria-label="label"
    >
      <polyline
        :points="polyline"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
    </svg>
    <p>{{ caption }}</p>
  </figure>
</template>
