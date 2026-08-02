const SENSITIVE_KEY =
  /pass(word)?|senha|secret|token|api[_-]?key|authorization|auth|credential|bearer|cart(a|ã)o|credit|cvv|cpf|cnpj|rg\b|ssn|private/i;

interface Rule {
  pattern: RegExp;
  replacement: string;
}

const RULES: Rule[] = [

  { pattern: /[\w.+-]+@[\w-]+\.[\w.-]{2,}/g, replacement: "[email]" },

  {
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/g,
    replacement: "[jwt]",
  },

  {
    pattern:
      /\b(?:sk|pk|rk|ghp|gho|ghs|xox[abps])[-_][A-Za-z0-9_-]{12,}\b|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    replacement: "[token]",
  },
  { pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/g, replacement: "Bearer [token]" },

  { pattern: /\b[a-fA-F0-9]{32,}\b/g, replacement: "[hex]" },

  { pattern: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, replacement: "[cpf]" },
  { pattern: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, replacement: "[cnpj]" },

  { pattern: /\b\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{4}\b/g, replacement: "[cartão]" },

  { pattern: /(?:\+55\s?)?\(\d{2}\)\s?9?\d{4}[- ]?\d{4}\b/g, replacement: "[telefone]" },
];

export function redactString(value: string): string {
  let out = value;
  for (const rule of RULES) out = out.replace(rule.pattern, rule.replacement);
  return out;
}

export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[profundo]";
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? "[redigido]" : redactValue(v, depth + 1);
  }
  return out;
}
