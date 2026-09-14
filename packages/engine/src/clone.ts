/** Deep-clone plain JSON data without relying on host globals (keeps the engine portable). */
export function cloneJson<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(cloneJson) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = cloneJson(v);
  return out as T;
}
