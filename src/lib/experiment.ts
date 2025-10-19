// deterministic bucketing: tag_id + anonId => A/B
export function getAnonId(): string {
  try {
    const k = "omni_anon_id";
    let id = localStorage.getItem(k);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(k, id); }
    return id;
  } catch { return "anon"; }
}

// Simple FNV-1a hash for deterministic variant selection
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return (h >>> 0);
}

export function assignVariant(experimentId: string, tagId: string, variants = ["A","B"] as const) {
  const anon = getAnonId();
  const idx = hash(`${experimentId}:${tagId}:${anon}`) % variants.length;
  return variants[idx];
}
