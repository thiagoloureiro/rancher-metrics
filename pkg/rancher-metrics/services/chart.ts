import type { UsagePoint } from './metrics';

export const CHART_WIDTH = 720;
export const CHART_HEIGHT = 220;

const PAD = {
  left:   72,
  right:  16,
  top:    16,
  bottom: 34,
};

export interface ChartTick {
  value: number;
  y: number;
  label: string;
}

export interface ChartSample {
  time: number;
  value: number;
  x: number;
  y: number;
}

export interface ChartTimeLabel {
  x: number;
  label: string;
  anchor: 'start' | 'middle' | 'end';
}

export interface UsageChartModel {
  samples: ChartSample[];
  line: string;
  area: string;
  ticks: ChartTick[];
  times: ChartTimeLabel[];
  capacityY: number | null;
  domain: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function niceCeiling(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  const fraction = value / base;
  let nice = 10;

  if (fraction <= 1) {
    nice = 1;
  } else if (fraction <= 2) {
    nice = 2;
  } else if (fraction <= 2.5) {
    nice = 2.5;
  } else if (fraction <= 5) {
    nice = 5;
  }

  return nice * base;
}

export function chartDomain(values: number[], capacity: number | null): number {
  const finite = values.filter((value) => Number.isFinite(value));
  const peak = Math.max(0, ...finite, capacity != null && capacity > 0 ? capacity : 0);

  return niceCeiling(peak || 1);
}

export function downsampleSeries(points: UsagePoint[], threshold: number): UsagePoint[] {
  if (points.length <= threshold || threshold < 3) {
    return points.slice();
  }

  const sampled: UsagePoint[] = [points[0]];
  const bucketSize = (points.length - 2) / (threshold - 2);
  let previous = 0;

  for (let index = 0; index < threshold - 2; index += 1) {
    const rangeStart = Math.floor(index * bucketSize) + 1;
    const rangeEnd = Math.min(points.length - 1, Math.floor((index + 1) * bucketSize) + 1);
    const nextStart = Math.floor((index + 1) * bucketSize) + 1;
    const nextEnd = Math.min(points.length - 1, Math.floor((index + 2) * bucketSize) + 1);
    let averageTime = 0;
    let averageValue = 0;
    const nextCount = Math.max(0, nextEnd - nextStart);

    for (let cursor = nextStart; cursor < nextEnd; cursor += 1) {
      averageTime += points[cursor].time;
      averageValue += points[cursor].value;
    }

    if (nextCount > 0) {
      averageTime /= nextCount;
      averageValue /= nextCount;
    }

    const anchor = points[previous];
    let bestArea = -1;
    let chosen = rangeStart;

    for (let cursor = rangeStart; cursor < rangeEnd; cursor += 1) {
      const area = Math.abs(
        ((anchor.time - averageTime) * (points[cursor].value - anchor.value))
        - ((anchor.time - points[cursor].time) * (averageValue - anchor.value)),
      );

      if (area > bestArea) {
        bestArea = area;
        chosen = cursor;
      }
    }

    if (chosen > 0 && chosen < points.length - 1) {
      sampled.push(points[chosen]);
      previous = chosen;
    }
  }

  sampled.push(points[points.length - 1]);

  return sampled;
}

export function formatChartTime(time: number, span: number): string {
  const date = new Date(time);
  const hours = span <= 36 * 60 * 60 * 1000;

  if (hours) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function buildUsageChart(
  points: UsagePoint[],
  capacity: number | null,
  formatValue: (value: number) => string,
): UsageChartModel | null {
  const finite = points
    .filter((point) => Number.isFinite(point.time) && point.time > 0 && Number.isFinite(point.value))
    .slice()
    .sort((left, right) => left.time - right.time);

  if (!finite.length) {
    return null;
  }

  const plotted = downsampleSeries(finite, 180);
  const domain = chartDomain(plotted.map((point) => point.value), capacity);
  const left = PAD.left;
  const right = CHART_WIDTH - PAD.right;
  const top = PAD.top;
  const bottom = CHART_HEIGHT - PAD.bottom;
  const width = right - left;
  const height = bottom - top;
  const first = plotted[0].time;
  const last = plotted[plotted.length - 1].time;
  const span = Math.max(0, last - first);

  const xFor = (time: number, index: number): number => {
    if (span === 0) {
      return plotted.length === 1 ? left + (width / 2) : left + (index / (plotted.length - 1)) * width;
    }

    return left + ((time - first) / span) * width;
  };

  const yFor = (value: number): number => bottom - (Math.max(0, value) / domain) * height;

  const samples = plotted.map((point, index) => ({
    time:  point.time,
    value: point.value,
    x:     xFor(point.time, index),
    y:     yFor(point.value),
  }));
  const line = samples.map((sample) => `${ sample.x.toFixed(1) },${ sample.y.toFixed(1) }`).join(' ');
  const area = samples.length > 1
    ? `${ line } ${ samples[samples.length - 1].x.toFixed(1) },${ bottom } ${ samples[0].x.toFixed(1) },${ bottom }`
    : '';
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => {
    const value = domain * fraction;

    return {
      value,
      y:     yFor(value),
      label: formatValue(value),
    };
  });
  const timeIndexes = samples.length === 1 ? [0] : [0, Math.round((samples.length - 1) / 2), samples.length - 1];
  const times = [...new Set(timeIndexes)].map((index, position, all) => ({
    x:      samples[index].x,
    label:  formatChartTime(samples[index].time, span),
    anchor: (position === 0 ? 'start' : position === all.length - 1 ? 'end' : 'middle') as ChartTimeLabel['anchor'],
  }));

  return {
    samples,
    line,
    area,
    ticks,
    times,
    capacityY: capacity != null && capacity > 0 ? yFor(capacity) : null,
    domain,
    left,
    right,
    top,
    bottom,
  };
}

export function seriesStats(points: UsagePoint[]): { min: number; avg: number; max: number; latest: number } | null {
  const values = points.map((point) => point.value).filter((value) => Number.isFinite(value));

  if (!values.length) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  const latestPoint = points.reduce((best, point) => (point.time >= best.time ? point : best));

  return {
    min:    Math.min(...values),
    avg:    total / values.length,
    max:    Math.max(...values),
    latest: latestPoint.value,
  };
}
