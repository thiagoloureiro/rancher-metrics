import assert from 'node:assert/strict';
import {
  dataFromSettings,
  decodeSecretValue,
  encodeSecretValue,
  readSharedSettings,
  settingsFromData,
  writeSharedSettings,
  type StoreDispatch,
} from './secret-settings.ts';

function httpError(status: number, message: string): Error {
  const error = new Error(message) as Error & { status: number };

  error.status = status;

  return error;
}

interface Memory {
  namespace: boolean;
  secret?: Record<string, string>;
  conflictOnCreate: boolean;
}

function memoryDispatch(state: Memory): StoreDispatch {
  return async (action, payload) => {
    const body = (payload || {}) as {
      type?: string;
      data?: Record<string, string>;
      metadata?: { name?: string; namespace?: string };
    };

    if (action === 'cluster/find' && body.type === 'namespace') {
      if (!state.namespace) {
        throw httpError(404, 'namespace not found');
      }

      return { metadata: { name: 'alerthawk' } };
    }

    if (action === 'cluster/find' && body.type === 'secret') {
      if (!state.secret) {
        throw httpError(404, 'secret not found');
      }

      const resource = {
        data: { ...state.secret },
        save: async () => {
          state.secret = { ...(resource.data || {}) };
        },
      };

      return resource;
    }

    if (action === 'cluster/create' && body.type === 'namespace') {
      const resource = {
        metadata: body.metadata,
        save:     async () => {
          state.namespace = true;
        },
      };

      return resource;
    }

    if (action === 'cluster/create' && body.type === 'secret') {
      const resource = {
        data:     { ...(body.data || {}) },
        metadata: body.metadata,
        save:     async () => {
          if (state.conflictOnCreate || state.secret) {
            throw httpError(409, 'secret exists');
          }

          state.secret = { ...(resource.data || {}) };
        },
      };

      return resource;
    }

    throw new Error(`unexpected ${ action }`);
  };
}

const encoded = dataFromSettings({
  baseUrl:     'https://metrics.example.com/',
  apiKey:      'clé-secret',
  clusterName: 'prod-aks',
});

assert.equal(decodeSecretValue(encoded['base-url']), 'https://metrics.example.com/');
assert.equal(decodeSecretValue(encoded['api-key']), 'clé-secret');
assert.deepEqual(settingsFromData(encoded).clusterName, 'prod-aks');
assert.equal(decodeSecretValue('not base64!!!'), '');
assert.equal(encodeSecretValue(''), '');

const missing = await readSharedSettings(memoryDispatch({ namespace: true, conflictOnCreate: false }));

assert.equal(missing.found, false);

const present = {
  namespace:        true,
  secret:           encoded,
  conflictOnCreate: false,
};

assert.deepEqual(
  await readSharedSettings(memoryDispatch(present)),
  {
    baseUrl:     'https://metrics.example.com/',
    apiKey:      'clé-secret',
    clusterName: 'prod-aks',
    found:       true,
  },
);

const created = { namespace: false, conflictOnCreate: false };
const createdDispatch = memoryDispatch(created);

await writeSharedSettings(createdDispatch, {
  baseUrl:     'https://metrics.example.com',
  apiKey:      'key',
  clusterName: 'prod',
});
assert.equal(created.namespace, true);
assert.equal(decodeSecretValue(created.secret?.['api-key'] || ''), 'key');
assert.equal((await readSharedSettings(createdDispatch)).clusterName, 'prod');

const updated = {
  namespace:        true,
  secret:           dataFromSettings({ baseUrl: 'https://old.example.com', apiKey: 'old', clusterName: 'old' }),
  conflictOnCreate: false,
};

await writeSharedSettings(memoryDispatch(updated), {
  baseUrl:     'https://metrics.example.com',
  apiKey:      'new',
  clusterName: 'prod',
});
assert.equal(decodeSecretValue(updated.secret?.['api-key'] || ''), 'new');
assert.equal(decodeSecretValue(updated.secret?.['base-url'] || ''), 'https://metrics.example.com');

const raced = {
  namespace:        true,
  secret:           dataFromSettings({ baseUrl: 'https://old.example.com', apiKey: 'old', clusterName: 'old' }),
  conflictOnCreate: true,
};
const racedDispatch: StoreDispatch = async (action, payload) => {
  const body = (payload || {}) as { type?: string };

  if (action === 'cluster/find' && body.type === 'secret' && raced.conflictOnCreate) {
    raced.conflictOnCreate = false;

    throw httpError(404, 'secret not found');
  }

  return memoryDispatch(raced)(action, payload);
};

await writeSharedSettings(racedDispatch, {
  baseUrl:     'https://metrics.example.com',
  apiKey:      'raced',
  clusterName: 'prod',
});
assert.equal(decodeSecretValue(raced.secret?.['api-key'] || ''), 'raced');

const forbidden: StoreDispatch = async (action, payload) => {
  const body = (payload || {}) as { type?: string };

  if (action === 'cluster/find' && body.type === 'secret') {
    throw httpError(403, 'forbidden');
  }

  throw new Error(`unexpected ${ action }`);
};

await assert.rejects(() => readSharedSettings(forbidden), (error: unknown) => {
  return error instanceof Error && (error as { status?: number }).status === 403;
});
await assert.rejects(
  () => writeSharedSettings(forbidden, { baseUrl: 'https://metrics.example.com', apiKey: 'key', clusterName: 'prod' }),
  /permission to manage the rancher-metrics secret/,
);

console.log('secret settings tests passed');
