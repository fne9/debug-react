import type { AiProvider } from "../shared/protocol";

const ENDPOINTS = {
  anthropic: "https://api.anthropic.com",
  google: "https://generativelanguage.googleapis.com",
  openai: "https://api.openai.com",
} as const;

const MAX_TOKENS = 8192;

const LIST_TIMEOUT_MS = 15000;

async function errorText(resp: Response): Promise<string> {
  let detail = "";
  try {
    const body = (await resp.json()) as Record<string, unknown>;
    const err = body.error as Record<string, unknown> | undefined;
    detail = String(err?.message ?? body.message ?? "");
  } catch {

  }
  return `HTTP ${resp.status}${detail ? ` — ${detail.slice(0, 300)}` : ""}`;
}

async function readSse(resp: Response, onData: (data: string) => void): Promise<void> {
  if (!resp.body) throw new Error("resposta sem corpo (streaming indisponível)");
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        if (line.startsWith("data:")) onData(line.slice(5).trim());
      }
    }

    buffer += decoder.decode();
    const last = buffer.replace(/\r$/, "");
    if (last.startsWith("data:")) onData(last.slice(5).trim());
  } finally {

    try {
      await reader.cancel();
    } catch {

    }
  }
}

export async function listModels(provider: AiProvider, key: string): Promise<string[]> {
  if (provider === "anthropic") {
    const resp = await fetch(`${ENDPOINTS.anthropic}/v1/models?limit=100`, {
      signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
    });
    if (!resp.ok) throw new Error(await errorText(resp));
    const body = (await resp.json()) as { data: { id: string }[] };
    return body.data.map((m) => m.id);
  }

  if (provider === "openai") {
    const resp = await fetch(`${ENDPOINTS.openai}/v1/models`, {
      signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!resp.ok) throw new Error(await errorText(resp));
    const body = (await resp.json()) as { data: { id: string }[] };
    return body.data
      .map((m) => m.id)
      .filter((id) => /^(gpt-|o\d|chatgpt)/.test(id) && !/(embedding|audio|tts|whisper|image|dall-e|realtime|transcribe|moderation)/.test(id))
      .sort();
  }

  const resp = await fetch(`${ENDPOINTS.google}/v1beta/models?pageSize=200`, {
    signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
    headers: { "x-goog-api-key": key },
  });
  if (!resp.ok) throw new Error(await errorText(resp));
  const body = (await resp.json()) as {
    models?: { name: string; supportedGenerationMethods?: string[] }[];
  };
  return (body.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent") ?? true)
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((name) => name.startsWith("gemini"))
    .sort();
}

export interface StreamOptions {
  provider: AiProvider;
  key: string;
  model: string;
  system: string;
  prompt: string;
  signal: AbortSignal;
  onChunk: (text: string) => void;
}

export async function streamCompletion(opts: StreamOptions): Promise<void> {
  const { provider, key, model, system, prompt, signal, onChunk } = opts;

  if (provider === "anthropic") {
    const resp = await fetch(`${ENDPOINTS.anthropic}/v1/messages`, {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        stream: true,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!resp.ok) throw new Error(await errorText(resp));
    await readSse(resp, (data) => {
      if (!data || data === "[DONE]") return;
      let event: {
        type: string;
        delta?: { type: string; text?: string };
        error?: { message?: string };
      };
      try {
        event = JSON.parse(data) as typeof event;
      } catch {
        return;
      }
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        onChunk(event.delta.text ?? "");
      } else if (event.type === "error") {
        throw new Error(event.error?.message ?? "erro do provedor durante o streaming");
      }
    });
    return;
  }

  if (provider === "openai") {
    const resp = await fetch(`${ENDPOINTS.openai}/v1/chat/completions`, {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!resp.ok) throw new Error(await errorText(resp));
    await readSse(resp, (data) => {
      if (!data || data === "[DONE]") return;
      let event: { choices?: { delta?: { content?: string } }[] };
      try {
        event = JSON.parse(data) as typeof event;
      } catch {
        return;
      }
      const text = event.choices?.[0]?.delta?.content;
      if (text) onChunk(text);
    });
    return;
  }

  const resp = await fetch(
    `${ENDPOINTS.google}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: MAX_TOKENS },
      }),
    },
  );
  if (!resp.ok) throw new Error(await errorText(resp));
  await readSse(resp, (data) => {
    if (!data) return;
    let event: { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    try {
      event = JSON.parse(data) as typeof event;
    } catch {
      return;
    }
    for (const part of event.candidates?.[0]?.content?.parts ?? []) {
      if (part.text) onChunk(part.text);
    }
  });
}
