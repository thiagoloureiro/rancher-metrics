export const SETTINGS_NAMESPACE = 'alerthawk';
export const SETTINGS_SECRET = 'rancher-metrics';

const SECRET_ID = `${ SETTINGS_NAMESPACE }/${ SETTINGS_SECRET }`;
const KEY_URL = 'base-url';
const KEY_API = 'api-key';
const KEY_CLUSTER = 'cluster-name';

export type StoreDispatch = (action: string, payload?: unknown) => Promise<unknown>;

export interface SharedSettings {
  baseUrl: string;
  apiKey: string;
  clusterName: string;
}

export interface SharedSettingsResult extends SharedSettings {
  found: boolean;
}

interface ClusterResource {
  data?: Record<string, string>;
  save?: () => Promise<unknown>;
}

export function encodeSecretValue(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

export function decodeSecretValue(value: string): string {
  if (!value) {
    return '';
  }

  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

export function hasSharedSettings(settings: SharedSettings): boolean {
  return Boolean(settings.baseUrl.trim() || settings.apiKey.trim() || settings.clusterName.trim());
}

export function settingsFromData(data: Record<string, string> | undefined): SharedSettings {
  return {
    baseUrl:     decodeSecretValue(data?.[KEY_URL] || ''),
    apiKey:      decodeSecretValue(data?.[KEY_API] || ''),
    clusterName: decodeSecretValue(data?.[KEY_CLUSTER] || ''),
  };
}

export function dataFromSettings(settings: SharedSettings): Record<string, string> {
  return {
    [KEY_URL]:     encodeSecretValue(settings.baseUrl),
    [KEY_API]:     encodeSecretValue(settings.apiKey),
    [KEY_CLUSTER]: encodeSecretValue(settings.clusterName),
  };
}

export function statusOf(error: unknown): number {
  if (!error || typeof error !== 'object') {
    return 0;
  }

  const record = error as Record<string, unknown>;
  const candidates = [record.status, record._status, record.statusCode];

  for (const candidate of candidates) {
    if (typeof candidate === 'number') {
      return candidate;
    }
  }

  return 0;
}

export function isStatus(error: unknown, status: number): boolean {
  if (statusOf(error) === status) {
    return true;
  }

  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = (error as { code?: unknown }).code;

  if (status === 404 && (code === 'NotFound' || code === 404)) {
    return true;
  }

  if (status === 409 && (code === 'Conflict' || code === 'AlreadyExists' || code === 409)) {
    return true;
  }

  if (status === 403 && (code === 'Forbidden' || code === 403)) {
    return true;
  }

  return false;
}

export function messageOf(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;

    if (typeof message === 'string' && message) {
      return message;
    }
  }

  return fallback;
}

export async function readSharedSettings(dispatch: StoreDispatch, force = false): Promise<SharedSettingsResult> {
  const payload: { type: string; id: string; opt?: { force: boolean } } = {
    type: 'secret',
    id:   SECRET_ID,
  };

  if (force) {
    payload.opt = { force: true };
  }

  try {
    const secret = asResource(await dispatch('cluster/find', payload));

    return {
      ...settingsFromData(secret.data),
      found: true,
    };
  } catch (error) {
    if (isStatus(error, 404)) {
      return {
        baseUrl:     '',
        apiKey:      '',
        clusterName: '',
        found:       false,
      };
    }

    throw error;
  }
}

export async function writeSharedSettings(dispatch: StoreDispatch, settings: SharedSettings): Promise<void> {
  const encoded = dataFromSettings(settings);

  try {
    const existing = asResource(await dispatch('cluster/find', {
      type: 'secret',
      id:   SECRET_ID,
      opt:  { force: true },
    }));

    existing.data = {
      ...(existing.data || {}),
      ...encoded,
    };
    await persist(existing);

    return;
  } catch (error) {
    if (!isStatus(error, 404)) {
      throw friendlyWriteError(error);
    }
  }

  try {
    await ensureNamespace(dispatch);
  } catch (error) {
    throw friendlyWriteError(error);
  }

  try {
    const created = asResource(await dispatch('cluster/create', {
      type:     'secret',
      metadata: {
        name:      SETTINGS_SECRET,
        namespace: SETTINGS_NAMESPACE,
        labels:    {
          'app.kubernetes.io/name':      'rancher-metrics',
          'app.kubernetes.io/component': 'settings',
        },
      },
      data: encoded,
    }));

    await persist(created);
  } catch (error) {
    if (!isStatus(error, 409)) {
      throw friendlyWriteError(error);
    }

    const existing = asResource(await dispatch('cluster/find', {
      type: 'secret',
      id:   SECRET_ID,
      opt:  { force: true },
    }));

    existing.data = {
      ...(existing.data || {}),
      ...encoded,
    };
    await persist(existing);
  }
}

async function ensureNamespace(dispatch: StoreDispatch): Promise<void> {
  try {
    await dispatch('cluster/find', {
      type: 'namespace',
      id:   SETTINGS_NAMESPACE,
    });

    return;
  } catch (error) {
    if (!isStatus(error, 404)) {
      return;
    }
  }

  const created = asResource(await dispatch('cluster/create', {
    type:     'namespace',
    metadata: { name: SETTINGS_NAMESPACE },
  }));

  try {
    await persist(created);
  } catch (error) {
    if (isStatus(error, 409)) {
      return;
    }

    throw error;
  }
}

function friendlyWriteError(error: unknown): Error {
  if (isStatus(error, 403)) {
    return new Error(`You need permission to manage the ${ SETTINGS_SECRET } secret in the ${ SETTINGS_NAMESPACE } namespace.`);
  }

  return new Error(messageOf(error, 'Could not save settings.'));
}

function asResource(value: unknown): ClusterResource {
  if (!value || typeof value !== 'object') {
    throw new Error('Cluster API returned an unexpected response.');
  }

  return value as ClusterResource;
}

async function persist(resource: ClusterResource): Promise<void> {
  if (typeof resource.save !== 'function') {
    throw new Error('Cluster API did not return a resource that can be saved.');
  }

  await resource.save();
}
