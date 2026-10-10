import { importTypes } from '@rancher/auto-import';
import { IPlugin, TabLocation, TableColumnLocation } from '@shell/core/types';
import './assets/metrics.css';
import extensionRouting from './routing/extension-routing';

const PVC_RESOURCE = 'persistentvolumeclaim';
const WORKLOAD_RESOURCES = ['apps.deployment', 'apps.statefulset', 'apps.daemonset'];

export default function(plugin: IPlugin): void {
  importTypes(plugin);

  plugin.metadata = require('./package.json');

  plugin.addProduct(require('./product'));
  plugin.addRoutes(extensionRouting);

  plugin.addTab(
    TabLocation.OTHER,
    {
      product: ['explorer'],
      path:    [{ urlPath: '/explorer', endsWith: true }],
    },
    {
      name:      'alerthawk-nodes',
      label:     'Node metrics',
      weight:    3,
      component: () => import('./components/ClusterNodeMetrics.vue'),
    }
  );

  plugin.addTab(
    TabLocation.RESOURCE_DETAIL,
    { resource: WORKLOAD_RESOURCES },
    {
      name:      'alerthawk-usage',
      label:     'Usage',
      weight:    4,
      component: () => import('./components/WorkloadUsage.vue'),
    }
  );

  plugin.addTableColumn(
    TableColumnLocation.RESOURCE,
    { resource: PVC_RESOURCE },
    {
      name:      'pvc-used',
      label:     'Used',
      formatter: 'PvcUsed',
      width:     220,
      search:    false,
      sort:      false,
    }
  );
}
