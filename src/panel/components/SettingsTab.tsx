import { useEffect, useState } from "react";
import type { AiBackgroundMessage, AiProvider } from "../../shared/protocol";
import {
  DEFAULT_SETTINGS,
  PROVIDER_LABELS,
  loadSettings,
  saveSettings,
  type AiSettings,
} from "../../shared/settings";
import { useAiPort } from "../ai/useAiPort";

const PROVIDERS: AiProvider[] = ["anthropic", "google", "openai"];

const KEY_PLACEHOLDERS: Record<AiProvider, string> = {
  anthropic: "sk-ant-...",
  google: "AIza...",
  openai: "sk-...",
};

interface ProviderState {
  keyDraft: string;
  status: { ok: boolean; message: string } | null;
  models: string[];
  loadingModels: boolean;
  testing: boolean;
}

const EMPTY_PROVIDER_STATE: ProviderState = {
  keyDraft: "",
  status: null,
  models: [],
  loadingModels: false,
  testing: false,
};

export function SettingsTab() {
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [providerState, setProviderState] = useState<Record<AiProvider, ProviderState>>({
    anthropic: { ...EMPTY_PROVIDER_STATE },
    google: { ...EMPTY_PROVIDER_STATE },
    openai: { ...EMPTY_PROVIDER_STATE },
  });

  const patchProvider = (provider: AiProvider, patch: Partial<ProviderState>) => {
    setProviderState((prev) => ({ ...prev, [provider]: { ...prev[provider], ...patch } }));
  };

  const sendAi = useAiPort((msg: AiBackgroundMessage) => {
    if (msg.type === "ai:key-test") {
      patchProvider(msg.provider, {
        testing: false,
        status: { ok: msg.ok, message: msg.message },
      });
    } else if (msg.type === "ai:models") {
      patchProvider(msg.provider, {
        loadingModels: false,
        models: msg.models,
        status: msg.ok
          ? { ok: true, message: `${msg.models.length} modelo(s) carregados.` }
          : { ok: false, message: msg.message ?? "Falha ao listar modelos." },
      });
    }
  });

  useEffect(() => {
    void loadSettings().then((s) => {
      setSettings(s);
      setLoaded(true);
    });
  }, []);

  const update = (patch: Partial<AiSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      void saveSettings(next);
      return next;
    });
  };

  const saveKey = (provider: AiProvider) => {
    const draft = providerState[provider].keyDraft.trim();
    const keys = { ...settings.keys };
    if (draft) keys[provider] = draft;
    else delete keys[provider];
    update({ keys });
    patchProvider(provider, {
      keyDraft: "",
      status: draft
        ? { ok: true, message: "Chave salva em chrome.storage.local (só nesta máquina)." }
        : { ok: true, message: "Chave removida." },
    });
  };

  if (!loaded) return <div className="placeholder"><p>Carregando configurações…</p></div>;

  return (
    <div className="settings-tab">
      <div className="timeline-head">
        <h2>Configurações</h2>
      </div>

      <h3 className="section-title">Chaves de API (BYOK)</h3>
      <p className="settings-note">
        As chaves ficam apenas em <span className="mono">chrome.storage.local</span> desta
        máquina (nunca sincronizadas) e as chamadas saem do service worker direto para o
        endpoint oficial do provedor.
      </p>

      {PROVIDERS.map((provider) => {
        const st = providerState[provider];
        const hasKey = Boolean(settings.keys[provider]);
        return (
          <div key={provider} className="settings-provider">
            <div className="settings-provider-head">
              <label className="settings-radio">
                <input
                  type="radio"
                  name="active-provider"
                  checked={settings.provider === provider}
                  onChange={() => update({ provider, model: "" })}
                />
                <strong>{PROVIDER_LABELS[provider]}</strong>
              </label>
              <span className={`key-state ${hasKey ? "ok" : ""}`}>
                {hasKey ? "chave cadastrada" : "sem chave"}
              </span>
            </div>

            <div className="settings-key-row">
              <input
                type="password"
                className="search"
                placeholder={hasKey ? "•••••••• (digite para substituir)" : KEY_PLACEHOLDERS[provider]}
                value={st.keyDraft}
                onChange={(e) => patchProvider(provider, { keyDraft: e.target.value })}
              />
              <button className="btn-copy" onClick={() => saveKey(provider)}>
                {st.keyDraft.trim() ? "Salvar chave" : hasKey ? "Remover" : "Salvar chave"}
              </button>
              <button
                className="btn-copy"
                disabled={!hasKey || st.testing}
                onClick={() => {
                  patchProvider(provider, { testing: true, status: null });
                  sendAi({ type: "ai:test-key", provider });
                }}
              >
                {st.testing ? "Testando…" : "Testar chave"}
              </button>
            </div>

            {settings.provider === provider && (
              <div className="settings-key-row">
                <select
                  className="search settings-model"
                  value={settings.model}
                  onChange={(e) => update({ model: e.target.value })}
                >
                  <option value="">
                    {st.models.length > 0 ? "— escolha o modelo —" : "— busque os modelos —"}
                  </option>
                  {st.models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                  {settings.model && !st.models.includes(settings.model) && (
                    <option value={settings.model}>{settings.model}</option>
                  )}
                </select>
                <button
                  className="btn-copy"
                  disabled={!hasKey || st.loadingModels}
                  onClick={() => {
                    patchProvider(provider, { loadingModels: true, status: null });
                    sendAi({ type: "ai:list-models", provider });
                  }}
                >
                  {st.loadingModels ? "Buscando…" : "Buscar modelos"}
                </button>
              </div>
            )}

            {st.status && (
              <div className={`settings-status ${st.status.ok ? "ok" : "bad"}`}>
                {st.status.message}
              </div>
            )}
          </div>
        );
      })}

      <h3 className="section-title">Telemetria</h3>
      <label className="settings-check">
        <input
          type="checkbox"
          checked={settings.telemetry}
          onChange={(e) => update({ telemetry: e.target.checked })}
        />
        Permitir telemetria anônima de uso (opt-in)
      </label>
      <p className="settings-note">
        Desligada por padrão. Nesta versão nenhum dado é enviado mesmo com a opção ligada —
        a preferência fica registrada para quando a telemetria for implementada.
      </p>
    </div>
  );
}
