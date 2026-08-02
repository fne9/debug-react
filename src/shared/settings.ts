import type { AiProvider } from "./protocol";

export interface AiSettings {
  keys: Partial<Record<AiProvider, string>>;
  provider: AiProvider;
  model: string;
  telemetry: boolean;
}

const STORAGE_KEY = "rd:settings";

export const DEFAULT_SETTINGS: AiSettings = {
  keys: {},
  provider: "anthropic",
  model: "",
  telemetry: false,
};

const VALID_PROVIDERS: readonly AiProvider[] = ["anthropic", "google", "openai"];

export async function loadSettings(): Promise<AiSettings> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const value = stored[STORAGE_KEY] as Partial<AiSettings> | undefined;
    return {
      ...DEFAULT_SETTINGS,
      ...value,

      provider: VALID_PROVIDERS.includes(value?.provider as AiProvider)
        ? (value!.provider as AiProvider)
        : DEFAULT_SETTINGS.provider,
      keys: { ...(value?.keys ?? {}) },
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: AiSettings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: "Anthropic (Claude)",
  google: "Google (Gemini)",
  openai: "OpenAI (GPT)",
};
