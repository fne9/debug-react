const MAX_DEPTH = 4;
const MAX_ARRAY = 20;
const MAX_KEYS = 30;
const MAX_STRING = 200;

export function safeSerialize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;

  const t = typeof value;
  if (t === "string") {
    const s = value as string;
    return s.length > MAX_STRING ? `${s.slice(0, MAX_STRING)}… (+${s.length - MAX_STRING})` : s;
  }
  if (t === "number" || t === "boolean") return value;
  if (t === "bigint") return `${String(value)}n`;
  if (t === "function") return `ƒ ${(value as { name?: string }).name || "anonymous"}()`;
  if (t === "symbol") return String(value);

  if (depth >= MAX_DEPTH) return Array.isArray(value) ? `[Array(${value.length})]` : "{…}";

  try {
    if (Array.isArray(value)) {
      const out: unknown[] = value.slice(0, MAX_ARRAY).map((v) => safeSerialize(v, depth + 1));
      if (value.length > MAX_ARRAY) out.push(`… +${value.length - MAX_ARRAY} itens`);
      return out;
    }
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    if (value instanceof Map) return `Map(${value.size})`;
    if (value instanceof Set) return `Set(${value.size})`;
    if (value instanceof Element) return `<${value.tagName.toLowerCase()}>`;

    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    const out: Record<string, unknown> = {};
    for (const key of keys.slice(0, MAX_KEYS)) {
      out[key] = safeSerialize(obj[key], depth + 1);
    }
    if (keys.length > MAX_KEYS) out["…"] = `+${keys.length - MAX_KEYS} chaves`;
    return out;
  } catch {
    return "(não serializável)";
  }
}
