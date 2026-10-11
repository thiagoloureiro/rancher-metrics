# Cluster Metrics for Rancher

[![version](https://img.shields.io/github/package-json/v/thiagoloureiro/rancher-metrics?filename=pkg%2Francher-metrics%2Fpackage.json&label=version)](https://github.com/thiagoloureiro/rancher-metrics/releases)
[![charts](https://img.shields.io/github/actions/workflow/status/thiagoloureiro/rancher-metrics/build-extension-charts.yml?event=release&label=charts)](https://github.com/thiagoloureiro/rancher-metrics/actions/workflows/build-extension-charts.yml)
[![catalog](https://img.shields.io/github/actions/workflow/status/thiagoloureiro/rancher-metrics/build-extension-catalog.yml?event=release&label=catalog)](https://github.com/thiagoloureiro/rancher-metrics/actions/workflows/build-extension-catalog.yml)

Rancher UI extension that shows [AlertHawk](https://github.com/thiagoloureiro/AlertHawk) node, application, and volume metrics inside Cluster Explorer. It targets Rancher 2.10 or newer.

## Where it appears

After the extension is installed, open a cluster and use **Cluster Explorer → Metrics**:

- **Nodes** — CPU, memory, readiness, and pressure
- **Applications** — Deployments, StatefulSets, DaemonSets, and Pods, with pod samples rolled up to the owning workload
- **Volumes** — PVC used, available, and capacity
- **Settings** — AlertHawk URL, API key, and cluster name, stored once for the cluster

The pages follow the namespace filter already selected in Explorer. Node metrics stay cluster-wide.

## AlertHawk API key

The extension calls the metrics read API with an `X-Api-Key` header. On the AlertHawk Metrics API, set one key. Existing JWT and Azure AD sign-in still works. The key is accepted only on the read endpoints the extension uses (nodes, pods, PVCs, cluster names, and namespace names). Cleanup, log reads, and metric writes are unchanged.

```bash
ApiKey=<long-random-key>
```

The browser calls AlertHawk directly, so the API must allow the Rancher origin. `Cors:Origins` defaults to `*`. Restrict it with:

```bash
CORS_ORIGINS=https://rancher.example.com
```

In the extension settings, set the AlertHawk URL to the server origin, for example `https://metrics.example.com`. Requests are sent to `/metrics/api/metrics/...`. The cluster name must match the name the collector writes. **Test connection** loads the names AlertHawk already has.

**Save** writes the URL, API key, and cluster name to the `rancher-metrics` secret in the `alerthawk` namespace on the cluster you are viewing. Save creates that namespace if it is missing. Everyone who can read the secret then uses the same connection, so the cluster only needs to be configured once. The time range on each metrics page stays in the browser.

The user who saves needs permission to create or update that secret. Everyone who opens Metrics needs permission to get it. The extension runs in the browser, so anyone who can read the secret can also see the API key.

A connection saved by an older version of the extension stays in that browser until you open Settings and save it into the cluster.

## Install the extension

1. In Rancher, open **Extensions**.
2. Open the menu at the top right and choose **Manage Repositories**.
3. Add a repository with this Helm index URL:

   ```text
   https://thiagoloureiro.github.io/rancher-security-chart/
   ```

4. Open the **Available** tab and install **Cluster Metrics**.
5. Reload the browser.

**Cluster Explorer → Metrics** then lists Nodes, Applications, Volumes, and Settings.

## Develop

```bash
npm install
npm test
npm run dev
```

Node 24 or newer is required, matching the Rancher shell used by this extension.
