# React Debug — Especificação do Produto e Arquitetura

> Extensão Chrome (DevTools) de depuração e otimização de performance para aplicações React.
> Posicionamento: **"te digo o que está errado e como consertar"** — unifica React DevTools,
> aba Performance, Redux DevTools, React-Scan e why-did-you-render em uma única aba,
> com **zero alterações de código no app** (funciona em dev/staging sem instrumentação;
> em produção, subconjunto baseado em APIs do browser).

---

## 1. Painéis (visão consolidada)

| Painel | Badge | O que faz | Requer build dev? |
|---|---|---|---|
| **Painel (Dashboard)** | TRAÇO | Health Score de abertura, KPIs de gravidade, sparkline de pressão de render, principais infratores, Web Vitals da página. Primeira coisa vista ao abrir. | Parcial |
| **Linha do tempo** | — | Hub de eventos: cada render, action, efeito, shift e erro. Clicável → abre a tab especializada filtrada naquele instante (correlação causal: "action X → re-render Y → CLS 0.12"). | Sim (renders); Não (CLS/erros) |
| **Perfilador & Paradas** | PERF | Gráficos heap-over-time e distribuição de render com ChartCanvas próprio (sem lib de gráficos). Contagens e razões de render (props/estado/contexto). | Sim |
| **Diagnóstico (Detectores)** | 8X | Chaves instáveis de lista / `key={index}`, mutação direta de estado, hydration mismatch, cascatas de contexto e suspense, stale closure (sync e async), custo de handler inline, ref-mutação durante render. | Sim |
| **Efeitos (useEffect)** | FX | Auditor de `useEffect`: cleanups faltando, arrays de dependência ruins/instáveis, efeitos em loop, fetch sem abort. | Sim |
| **Estado** | RDX | Árvore de estado Redux, histórico de actions, dispatch manual, diff/time-travel, detector de selectors instáveis (`useSelector` retornando referência nova). Roadmap: Zustand, Jotai, TanStack Query. | Sim |
| **Memória** | — | Sparkline de heap, alertas de taxa de crescimento, heurísticas de vazamento (fraseado como "crescimento suspeito" + "force GC e meça de novo"). | Não |
| **CLS / Web Vitals** | — | CLS em tempo real com **atribuição por elemento e por componente React**; LCP e INP com atribuição de handler ("380ms: 200ms no onClick do `<CartButton>`"). | Não (CLS); Sim (atribuição React) |
| **Análise de IA** | IA | Análise LLM de segurança, performance e risco de falha sobre snapshot da sessão. 3 grátis/dia (via backend) ou ilimitado com BYOK/assinatura. | — |
| **Configurações** | CONJUNTO | BYOK por provedor, telemetria anônima (opt-in, desligada por padrão), thresholds/ignore lists, preferências. | — |

### Regras de UX transversais
- **Detecção de ambiente**: banner "build de produção detectado — tabs X, Y indisponíveis; veja como rodar em dev" em vez de tabs vazias.
- **Controle de ruído**: thresholds configuráveis, ignore list de componentes, agrupamento (`<List> renderizou 300x` = 1 linha).
- **Auto-benchmark**: rodapé com "overhead da extensão: X ms/frame".
- **Fix sugerido**: cada detecção traz snippet corrigido (template, sem IA) + botão copiar + jump-to-source (`vscode://` + source maps).
- **Snapshot exportável**: botão "exportar reprodução" → JSON com timeline + actions + renders para anexar em ticket.

---

## 2. Fases de entrega

### MVP (v1.0) — o "triplo bloqueio"
1. **Infraestrutura de eventos + Linha do tempo** (esqueleto que alimenta tudo)
2. **Perfilador de renders** (contagem, razão, componentes sem memo, props inline)
3. **Auditor de useEffect**
4. **CLS com atribuição por elemento/componente**
5. Dashboard com Health Score + detecção de ambiente
6. Controle de ruído + buffer circular (sobrevivência em app grande)

### v1.1
- Estado (Redux completo: árvore, actions, dispatch, diff, selectors instáveis)
- Memória
- Detector de hydration mismatch (público Next.js)
- Atribuição de INP
- Snapshot exportável + jump-to-source

### v1.2
- Análise de IA (BYOK primeiro; camada gratuita via backend depois)
- 8 detectores restantes (cascatas de contexto/suspense, ref-mutação, etc.)
- Modo antes/depois (baseline vs. pós-fix: "renders 47→3, CLS 0.12→0.01")
- Leitura básica de Zustand/Jotai/TanStack Query
- Demo embutida (página de exemplo com problemas plantados)

---

## 3. Arquitetura da extensão (Manifest V3)

```
┌─────────────────────────────────────────────────────────────┐
│ Página do usuário                                           │
│  ┌────────────────────────┐                                 │
│  │ agent.js (MAIN world)  │  ← acessa __REACT_DEVTOOLS_     │
│  │ hook React/Fiber,      │    GLOBAL_HOOK__, Fiber tree,   │
│  │ Redux store, PerfObs   │    store Redux, PerformanceObs. │
│  └──────────┬─────────────┘                                 │
│             │ window.postMessage (batched, ring buffer)     │
│  ┌──────────▼─────────────┐                                 │
│  │ content-script.js      │  ← ISOLATED world, relay        │
│  └──────────┬─────────────┘                                 │
└─────────────┼───────────────────────────────────────────────┘
              │ chrome.runtime Port
┌─────────────▼─────────────┐     ┌───────────────────────────┐
│ service worker (bg)       │◄───►│ DevTools panel (React UI) │
│ roteia por tabId; chamadas│     │ tabs, ChartCanvas, timeline│
│ LLM (BYOK) saem daqui     │     └───────────────────────────┘
└───────────────────────────┘
```

- **`agent.js` injetado no MAIN world** (via `chrome.scripting.registerContentScripts` com `world: "MAIN"`) — único com acesso ao React da página. Deve instalar-se **antes** do React carregar (`run_at: document_start`) para registrar o hook.
- **Eventos em ring buffer** no agent (últimos N segundos em detalhe, resto agregado) + envio em lotes (~1 frame) para não virar gargalo.
- **Fiber internals mudam entre versões do React** (17/18/19+): camada `react-adapter` com detecção de versão e leitores por versão.
- **APIs do browser** (CLS/LCP/INP via `PerformanceObserver`, memória via `performance.memory`) rodam no agent e funcionam em qualquer build.

### Estrutura de pastas proposta

```
react-debug/
├── manifest.json
├── src/
│   ├── agent/            # MAIN world: hooks React/Fiber/Redux, PerformanceObserver
│   │   ├── react-adapter/  # leitores por versão do React
│   │   ├── detectors/      # cada detector = módulo isolado
│   │   └── ring-buffer.ts
│   ├── content/          # relay content script
│   ├── background/       # service worker: roteamento, chamadas LLM
│   ├── devtools/         # devtools_page + criação do painel
│   ├── panel/            # UI React do painel (tabs, ChartCanvas, timeline)
│   └── shared/           # tipos de eventos, protocolo de mensagens
└── demo/                 # página de demonstração com problemas plantados
```

---

## 4. Análise de IA — design

### Modos de operação
1. **BYOK (lançamento)** — usuário cola a própria chave (Anthropic, Google, OpenAI). Zero custo para nós; público dev aceita bem.
2. **Assinatura (depois)** — chave de assinatura validada em backend próprio que faz proxy para o LLM. **A chave do provedor nunca vai dentro da extensão.**
3. **Camada gratuita (depois)** — 3 análises/dia amarradas a ID de instalação, validadas no backend ("por sessão" é burlável; "por dia + backend" não).

### BYOK — regras técnicas
- **Chaves em `chrome.storage.local`** (nunca `storage.sync` — sincronizaria a chave entre máquinas; nunca hardcoded).
- **Chamadas saem do service worker** com `host_permissions` para os endpoints dos provedores (`https://api.anthropic.com/*`, `https://generativelanguage.googleapis.com/*`, `https://api.openai.com/*`) — host permission dispensa CORS.
- **Streaming SSE** via `fetch` + `ReadableStream` no service worker, repassado ao painel por Port (análises longas não podem travar a UI).
- **Redação no cliente antes do envio**: valores de estado/props passam por anonimização (emails, tokens, CPFs → placeholders) e a UI mostra exatamente o que será enviado. Dev é o público mais desconfiado que existe.
- **Teste de chave** no momento do cadastro (request mínima) com feedback imediato.

### Modelos (chips corrigidos — os do mockup estavam com nomes inexistentes)

| Provedor | Modelo (ID exato) | Papel |
|---|---|---|
| Anthropic | `claude-opus-4-8` | Padrão para análise profunda (falha/segurança) |
| Anthropic | `claude-sonnet-5` | Equilíbrio custo/qualidade |
| Anthropic | `claude-haiku-4-5` | Análises rápidas/baratas |
| Google | Gemini (Flash/Pro) | Conferir IDs atuais na doc do Google |
| OpenAI | GPT (série atual) | Conferir IDs atuais na doc da OpenAI |

> Chips do mockup como "Claude Soneto 4.6", "GPT-5" e "Códice GPT-5.1 Mini" não correspondem
> a IDs reais — usar a tabela acima para Anthropic e validar os demais nas docs oficiais.
> Exemplo de chamada Anthropic (Messages API): `POST https://api.anthropic.com/v1/messages`
> com headers `x-api-key`, `anthropic-version: 2023-06-01`; streaming com `"stream": true`.

### O que a análise recebe
Snapshot estruturado da sessão (não a página inteira): resumo dos detectores disparados,
top infratores de render, curva de memória, eventos de CLS/INP, últimas N actions (redigidas),
stack de erro se houver. Prompt por tipo de análise (segurança / desempenho / risco de falha).

---

## 5. Riscos e decisões registradas

| Risco | Mitigação |
|---|---|
| Fiber/hook é API não-oficial, muda por versão | `react-adapter` versionado + testes contra 17/18/19 |
| Prod minificado quebra promessa | Coluna "funciona em produção?" por tab + banner de ambiente |
| Profiler vira gargalo | Ring buffer, batching, sampling, auto-benchmark visível |
| Estado sensível indo para LLM | Redação no cliente + preview do payload + opt-in |
| Custo de tokens da camada grátis | BYOK primeiro; grátis só com backend + limite diário por instalação |
| 8 painéis medíocres < 3 excelentes | MVP = triplo bloqueio; resto em v1.1/v1.2 |
