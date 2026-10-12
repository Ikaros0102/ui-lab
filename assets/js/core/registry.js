// core/registry.js
// Handles fetching manifest and component code with caching and deduplication.

const codeCache = new Map();
const pendingRequests = new Map();

export async function loadManifest() {
  const res = await fetch("components/manifest.json");
  if (!res.ok) throw new Error(`Failed to load manifest: ${res.statusText}`);
  return await res.json();
}

export async function loadTaxonomy() {
  const res = await fetch("components/taxonomy.json");
  if (!res.ok) throw new Error(`Failed to load taxonomy: ${res.statusText}`);
  return await res.json();
}

export async function getComponentCode(path) {
  if (codeCache.has(path)) {
    return codeCache.get(path);
  }
  if (pendingRequests.has(path)) {
    return pendingRequests.get(path);
  }

  const promise = (async () => {
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`Failed to load component from ${path}`);
      const code = await res.text();
      codeCache.set(path, code);
      return code;
    } finally {
      pendingRequests.delete(path);
    }
  })();

  pendingRequests.set(path, promise);
  return promise;
}
