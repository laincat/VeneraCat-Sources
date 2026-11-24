// Draft ABI only. Current clients do not load this service extension yet.
// TypeScript authors should publish a browser-target ESM bundle, not node_modules.
export function createService(host) {
  return {
    async account() {
      // Implement with a tested upstream/generated client and host-scoped fetch.
      // This error prevents a template from impersonating a working provider.
      throw new Error("Service adapter not implemented");
    },
    dispose() { host.jobs.cancelOwned(); }
  };
}
