import { ConfigureVirtualTypeOptions, IPlugin } from '@shell/core/types';

export const NODE_PAGE = 'node-metrics';
export const APP_PAGE = 'application-metrics';
export const VOLUME_PAGE = 'volume-metrics';
export const SETTINGS_PAGE = 'metrics-settings';

export function init($extension: IPlugin, store: any) {
  const {
    virtualType,
    basicType,
    labelGroup,
    weightGroup,
  } = $extension.DSL(store, 'explorer');

  labelGroup('cluster-metrics', 'Metrics');
  weightGroup('cluster-metrics', 80, true);

  virtualType({
    label:      'Nodes',
    group:      'cluster-metrics',
    namespaced: true,
    name:       NODE_PAGE,
    weight:     100,
    icon:       'cluster',
    route:      {
      name:   'c-cluster-explorer-node-metrics',
      params: { product: 'explorer' },
    },
    exact: true,
  } as ConfigureVirtualTypeOptions);

  virtualType({
    label:      'Applications',
    group:      'cluster-metrics',
    namespaced: true,
    name:       APP_PAGE,
    weight:     90,
    icon:       'application',
    route:      {
      name:   'c-cluster-explorer-application-metrics',
      params: { product: 'explorer' },
    },
    exact: true,
  } as ConfigureVirtualTypeOptions);

  virtualType({
    label:      'Volumes',
    group:      'cluster-metrics',
    namespaced: true,
    name:       VOLUME_PAGE,
    weight:     80,
    icon:       'storage',
    route:      {
      name:   'c-cluster-explorer-volume-metrics',
      params: { product: 'explorer' },
    },
    exact: true,
  } as ConfigureVirtualTypeOptions);

  virtualType({
    label:      'Settings',
    group:      'cluster-metrics',
    namespaced: true,
    name:       SETTINGS_PAGE,
    weight:     70,
    icon:       'gear',
    route:      {
      name:   'c-cluster-explorer-metrics-settings',
      params: { product: 'explorer' },
    },
    exact: true,
  } as ConfigureVirtualTypeOptions);

  basicType([NODE_PAGE, APP_PAGE, VOLUME_PAGE, SETTINGS_PAGE], 'cluster-metrics');
}
