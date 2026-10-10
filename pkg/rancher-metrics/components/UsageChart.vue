<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import {
  CHART_HEIGHT,
  CHART_WIDTH,
  buildUsageChart,
  seriesStats,
  type ChartSample,
} from '../services/chart';
import { formatBytes, formatCpu, type UsagePoint } from '../services/metrics';

export default defineComponent({
  name: 'UsageChart',

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
    capacity: {
      default: null as number | null,
    },
    capacityLabel: {
      type:    String,
      default: 'Capacity',
    },
  },

  data() {
    return {
      hoverIndex: null as number | null,
      width:      CHART_WIDTH,
      height:     CHART_HEIGHT,
    };
  },

  computed: {
    chart() {
      return buildUsageChart(this.points, this.capacityNumber, (value) => this.formatValue(value));
    },

    stats() {
      return seriesStats(this.points);
    },

    capacityNumber(): number | null {
      return typeof this.capacity === 'number' && Number.isFinite(this.capacity) ? this.capacity : null;
    },

    hover(): (ChartSample & { percent: string; align: string }) | null {
      if (this.hoverIndex == null || !this.chart) {
        return null;
      }

      const sample = this.chart.samples[this.hoverIndex];

      if (!sample) {
        return null;
      }

      const ratio = sample.x / CHART_WIDTH;

      return {
        ...sample,
        percent: `${ ratio * 100 }%`,
        align:   ratio > 0.72 ? 'is-end' : ratio < 0.18 ? 'is-start' : '',
      };
    },
  },

  watch: {
    points() {
      this.hoverIndex = null;
    },
  },

  methods: {
    formatValue(value: number): string {
      return this.mode === 'bytes' ? formatBytes(value) : formatCpu(value);
    },

    formatClock(time: number): string {
      return new Date(time).toLocaleString([], {
        month:  'short',
        day:    'numeric',
        hour:   '2-digit',
        minute: '2-digit',
      });
    },

    move(event: PointerEvent) {
      if (!this.chart || this.chart.samples.length === 0) {
        return;
      }

      const svg = event.currentTarget as SVGSVGElement;
      const rect = svg.getBoundingClientRect();

      if (rect.width <= 0) {
        return;
      }

      const x = ((event.clientX - rect.left) / rect.width) * CHART_WIDTH;
      let nearest = 0;
      let distance = Infinity;

      this.chart.samples.forEach((sample, index) => {
        const gap = Math.abs(sample.x - x);

        if (gap < distance) {
          distance = gap;
          nearest = index;
        }
      });

      this.hoverIndex = nearest;
    },

    leave() {
      this.hoverIndex = null;
    },
  },
});
</script>

<template>
  <figure :class="['metrics-chart', mode === 'bytes' ? 'is-bytes' : 'is-cpu']">
    <header class="metrics-chart-head">
      <figcaption>{{ label }}</figcaption>
      <p v-if="stats">
        <span>Latest {{ formatValue(stats.latest) }}</span>
        <span>Avg {{ formatValue(stats.avg) }}</span>
        <span>Peak {{ formatValue(stats.max) }}</span>
        <span v-if="capacityNumber != null && capacityNumber > 0">
          {{ capacityLabel }} {{ formatValue(capacityNumber) }}
        </span>
      </p>
    </header>

    <p
      v-if="!chart"
      class="metrics-muted"
    >
      Not enough samples for a trend.
    </p>

    <div
      v-else
      class="metrics-chart-plot"
    >
      <svg
        :viewBox="`0 0 ${ width } ${ height }`"
        role="img"
        :aria-label="label"
        @pointermove="move"
        @pointerleave="leave"
      >
        <rect
          class="metrics-chart-plot-bg"
          :x="chart.left"
          :y="chart.top"
          :width="chart.right - chart.left"
          :height="chart.bottom - chart.top"
        />
        <g class="metrics-chart-grid">
          <line
            v-for="tick in chart.ticks"
            :key="`grid-${ tick.value }`"
            :x1="chart.left"
            :x2="chart.right"
            :y1="tick.y"
            :y2="tick.y"
          />
        </g>
        <g class="metrics-chart-axis">
          <text
            v-for="tick in chart.ticks"
            :key="`label-${ tick.value }`"
            :x="chart.left - 8"
            :y="tick.y + 4"
            text-anchor="end"
          >
            {{ tick.label }}
          </text>
          <text
            v-for="(stamp, index) in chart.times"
            :key="`time-${ index }`"
            :x="stamp.x"
            :y="chart.bottom + 22"
            :text-anchor="stamp.anchor"
          >
            {{ stamp.label }}
          </text>
        </g>
        <polyline
          v-if="chart.area"
          class="metrics-chart-area"
          :points="chart.area"
        />
        <line
          v-if="chart.capacityY != null"
          class="metrics-chart-capacity"
          :x1="chart.left"
          :x2="chart.right"
          :y1="chart.capacityY"
          :y2="chart.capacityY"
        />
        <polyline
          v-if="chart.samples.length > 1"
          class="metrics-chart-line"
          :points="chart.line"
        />
        <circle
          v-else
          class="metrics-chart-dot"
          :cx="chart.samples[0].x"
          :cy="chart.samples[0].y"
          r="4"
        />
        <g v-if="hover">
          <line
            class="metrics-chart-cursor"
            :x1="hover.x"
            :x2="hover.x"
            :y1="chart.top"
            :y2="chart.bottom"
          />
          <circle
            class="metrics-chart-dot"
            :cx="hover.x"
            :cy="hover.y"
            r="4"
          />
        </g>
      </svg>
      <div
        v-if="hover"
        :class="['metrics-chart-tip', hover.align]"
        :style="{ left: hover.percent }"
      >
        <strong>{{ formatClock(hover.time) }}</strong>
        <span>{{ formatValue(hover.value) }}</span>
      </div>
    </div>
  </figure>
</template>
