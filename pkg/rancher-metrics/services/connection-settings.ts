import { reactive } from 'vue';
import { normalizeMinutes } from './metrics';
import {
  SETTINGS_NAMESPACE,
  SETTINGS_SECRET,
  hasSharedSettings,
  isStatus,
  messageOf,
  readSharedSettings,
  writeSharedSettings,
  type SharedSettings,
  type StoreDispatch,
} from './secret-settings';

export interface MetricsConnectionInput {
  baseUrl: string;
  apiKey: string;
  clusterName: string;
  minutes: number;
}

export type SettingsStatus = 'idle' | 'loading' | 'ready' | 'error';
export type SettingsOrigin = 'secret' | 'browser' | 'none';

export interface MetricsConnection extends MetricsConnectionInput {
  status: SettingsStatus;
  error:  string;
  origin: SettingsOrigin;
}

const connections = reactive<Record<string, MetricsConnection>>({});
const inflight = new Map<string, Promise<void>>();

export function useConnection(clusterId: string): MetricsConnection {
  const id = storageId(clusterId);

  if (!connections[id]) {
    connections[id] = {
      baseUrl:     '',
      apiKey:      '',
      clusterName: '',
      minutes:     normalizeMinutes(readValue(id, 'minutes')),
      status:      'idle',
      error:       '',
      origin:      'none',
    };
  }

  return connections[id];
}

export function loadConnection(clusterId: string, dispatch: StoreDispatch | undefined, refresh = false): Promise<void> {
  const id = storageId(clusterId);
  const current = useConnection(id);

  if (!dispatch) {
    if (current.status === 'idle') {
      applyBrowserIfPresent(current, id);
      current.status = 'ready';
    }

    return Promise.resolve();
  }

  const pending = inflight.get(id);

  if (pending) {
    return refresh ? pending.then(() => loadConnection(clusterId, dispatch, true)) : pending;
  }

  if (!refresh && current.status === 'ready') {
    return Promise.resolve();
  }

  current.status = 'loading';

  const task = applySecret(id, dispatch, refresh).catch((error: unknown) => {
    if (current.status === 'loading') {
      current.status = 'error';
      current.error = messageOf(error, 'Could not load shared settings.');
    }
  }).finally(() => {
    inflight.delete(id);
  });

  inflight.set(id, task);

  return task;
}

export async function saveConnection(clusterId: string, next: MetricsConnectionInput, dispatch: StoreDispatch): Promise<void> {
  const id = storageId(clusterId);
  const current = useConnection(id);
  const shared = {
    baseUrl:     next.baseUrl.trim().replace(/\/+$/, ''),
    apiKey:      next.apiKey.trim(),
    clusterName: next.clusterName.trim(),
  };

  await writeSharedSettings(dispatch, shared);
  current.baseUrl = shared.baseUrl;
  current.apiKey = shared.apiKey;
  current.clusterName = shared.clusterName;
  current.minutes = normalizeMinutes(next.minutes);
  current.status = 'ready';
  current.error = '';
  current.origin = 'secret';
  writeValue(id, 'minutes', String(current.minutes));
  forgetBrowserCopy(id);
}

export function setMinutes(clusterId: string, minutes: number): void {
  const id = storageId(clusterId);
  const current = useConnection(id);

  current.minutes = normalizeMinutes(minutes);
  writeValue(id, 'minutes', String(current.minutes));
}

export function isConfigured(value: MetricsConnectionInput): boolean {
  return Boolean(value.baseUrl.trim() && value.apiKey.trim());
}

async function applySecret(clusterId: string, dispatch: StoreDispatch, refresh: boolean): Promise<void> {
  const current = useConnection(clusterId);

  try {
    const shared = await readSharedSettings(dispatch, refresh);

    if (shared.found && hasSharedSettings(shared)) {
      current.baseUrl = shared.baseUrl.trim().replace(/\/+$/, '');
      current.apiKey = shared.apiKey.trim();
      current.clusterName = shared.clusterName.trim();
      current.origin = 'secret';
      current.error = '';
      current.status = 'ready';
      forgetBrowserCopy(clusterId);

      return;
    }
  } catch (error) {
    const denied = `Cannot read the ${ SETTINGS_SECRET } secret in the ${ SETTINGS_NAMESPACE } namespace. You need get permission on that secret.`;

    if (isConfigured(current) && current.origin === 'secret') {
      current.status = 'ready';
      current.error = isStatus(error, 403) ? denied : messageOf(error, 'Could not refresh shared settings.');

      return;
    }

    const browser = readBrowser(clusterId);

    if (browser.baseUrl || browser.apiKey || browser.clusterName) {
      applyBrowser(current, browser);
      current.error = isStatus(error, 403)
        ? 'Shared settings could not be read. Showing the copy saved in this browser.'
        : `${ messageOf(error, 'Shared settings could not be read.') } Showing the copy saved in this browser.`;
      current.status = 'ready';

      return;
    }

    current.baseUrl = '';
    current.apiKey = '';
    current.clusterName = '';
    current.origin = 'none';
    current.status = 'error';
    current.error = isStatus(error, 403) ? denied : messageOf(error, 'Could not load shared settings.');

    return;
  }

  if (applyBrowserIfPresent(current, clusterId)) {
    current.error = '';
    current.status = 'ready';

    return;
  }

  current.baseUrl = '';
  current.apiKey = '';
  current.clusterName = '';
  current.origin = 'none';
  current.error = '';
  current.status = 'ready';
}

function applyBrowserIfPresent(current: MetricsConnection, clusterId: string): boolean {
  const browser = readBrowser(clusterId);

  if (!browser.baseUrl && !browser.apiKey && !browser.clusterName) {
    return false;
  }

  applyBrowser(current, browser);

  return true;
}

function applyBrowser(current: MetricsConnection, browser: SharedSettings): void {
  current.baseUrl = browser.baseUrl.trim().replace(/\/+$/, '');
  current.apiKey = browser.apiKey.trim();
  current.clusterName = browser.clusterName.trim();
  current.origin = 'browser';
}

function readBrowser(clusterId: string): SharedSettings {
  return {
    baseUrl:     readValue(clusterId, 'base-url'),
    apiKey:      readValue(clusterId, 'api-key'),
    clusterName: readValue(clusterId, 'cluster-name'),
  };
}

function forgetBrowserCopy(clusterId: string): void {
  removeValue(clusterId, 'base-url');
  removeValue(clusterId, 'api-key');
  removeValue(clusterId, 'cluster-name');
}

function storageId(clusterId: string): string {
  return clusterId || 'local';
}

function readValue(clusterId: string, name: string): string {
  try {
    if (typeof localStorage === 'undefined') {
      return '';
    }

    return localStorage.getItem(storageKey(clusterId, name)) || '';
  } catch {
    return '';
  }
}

function writeValue(clusterId: string, name: string, value: string): void {
  try {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(storageKey(clusterId, name), value);
  } catch {
    // Private browsing can reject storage. The in-memory value still applies.
  }
}

function removeValue(clusterId: string, name: string): void {
  try {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.removeItem(storageKey(clusterId, name));
  } catch {
    // Ignore storage failures. The cluster secret is the source of truth.
  }
}

function storageKey(clusterId: string, name: string): string {
  return `rancher-metrics.${ clusterId }.${ name }`;
}
