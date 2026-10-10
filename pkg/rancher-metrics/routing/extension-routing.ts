import NodeMetrics from '../pages/NodeMetrics.vue';
import ApplicationMetrics from '../pages/ApplicationMetrics.vue';
import VolumeMetrics from '../pages/VolumeMetrics.vue';
import MetricsSettings from '../pages/MetricsSettings.vue';

const routes = [
  {
    parent: 'default',
    route:  {
      name:      'c-cluster-explorer-node-metrics',
      path:      '/c/:cluster/explorer/node-metrics',
      component: NodeMetrics,
      meta:      { product: 'explorer' },
    },
  },
  {
    parent: 'default',
    route:  {
      name:      'c-cluster-explorer-application-metrics',
      path:      '/c/:cluster/explorer/application-metrics',
      component: ApplicationMetrics,
      meta:      { product: 'explorer' },
    },
  },
  {
    parent: 'default',
    route:  {
      name:      'c-cluster-explorer-volume-metrics',
      path:      '/c/:cluster/explorer/volume-metrics',
      component: VolumeMetrics,
      meta:      { product: 'explorer' },
    },
  },
  {
    parent: 'default',
    route:  {
      name:      'c-cluster-explorer-metrics-settings',
      path:      '/c/:cluster/explorer/metrics-settings',
      component: MetricsSettings,
      meta:      { product: 'explorer' },
    },
  },
];

export default routes;
