import { importTypes } from '@rancher/auto-import';
import { IPlugin, TableColumnLocation } from '@shell/core/types';
import './assets/metrics.css';
import extensionRouting from './routing/extension-routing';

const PVC_RESOURCE = 'persistentvolumeclaim';

export default function(plugin: IPlugin): void {
  importTypes(plugin);

  plugin.metadata = require('./package.json');

  plugin.addProduct(require('./product'));
  plugin.addRoutes(extensionRouting);

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
