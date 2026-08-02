# React Debug — Planejamento de Execução por Etapas

> Complementa o `SPEC.md`. Cada etapa tem objetivo, tarefas e critério de "pronto".
> Marcamos `[x]` conforme concluímos. Uma etapa só começa quando a anterior está verificada.

---

## Visão em uma linha

Extensão DevTools que unifica depuração React (renders, efeitos, estado, memória, Web Vitals)
com zero instrumentação, diz **o que está errado e como consertar**, e se conecta a
agentes de código via **MCP** — o diferencial que nenhum concorrente tem.

## Ideias inovadoras incorporadas ao roadmap

| # | Ideia | Onde entra |
|---|---|---|
| 1 | **Ponte MCP local** — agentes de código (Claude Code, Cursor) leem os diagnósticos de runtime e corrigem o código com dados reais | Etapa 8 |
| 2 | **Perf budgets por componente** — limites declarados, alertas ao estourar | Etapa 8 |
| 3 | **Heatmap de render na página + scrubber temporal** — overlay colorido por severidade, arrastável no tempo | Etapa 9 (evolução do overlay da Etapa 3) |
| 4 | **Auto-fix com patch aplicável** — IA gera diff (.patch) validado pelo modo antes/depois | Etapa 7 |
| 5 | **Modo CI headless** (`react-debug-ci` via Playwright, falha PR por regressão) | v2.0 — fora do escopo atual; núcleo do agent já nasce desacoplado para viabilizar |

---

## Etapa 0 — Fundação do projeto

**Objetivo:** projeto compila, extensão carrega no Chrome, painel "React Debug" aparece no DevTools.

- [x] Inicializar projeto (esbuild + TypeScript; React 19 na UI do painel)
- [x] `manifest.json` MV3: `devtools_page`, service worker, content script (ISOLATED), agent registrado no MAIN world com `run_at: document_start`
- [x] Painel DevTools criado com as tabs vazias (Painel, Linha do tempo, Perf, Diagnóstico, Efeitos, Estado, Memória, Web Vitals, IA, Config)
- [x] Tema dark/light básico seguindo o tema do DevTools
- [x] Página `demo/` com 4 bugs plantados (props inline, effect sem cleanup, key=index, CLS) + servidor local (`npm run demo`)
- [x] Verificação manual no Chrome/Brave (extensão carregada; usuário seguiu para a Etapa 1)

**Pronto quando:** `chrome://extensions` → carregar sem erros → abrir DevTools em qualquer página → tab "React Debug" com as 10 abas navegáveis.

---

## Etapa 1 — Pipeline de eventos (a espinha dorsal)

**Objetivo:** eventos fluem página → agent → content → service worker → painel, com performance controlada.

- [x] Protocolo de mensagens tipado em `src/shared/` (DebugEvent `{id, kind, ts, label, detail, payload}`, versionado)
- [x] `agent.js` no MAIN world com ring buffer (cap 2000) + handshake com o content script
- [x] Batching por frame (flush a cada 16ms) no `window.postMessage`
- [x] Content script relay → `chrome.runtime.Port` por tabId (só frame principal)
- [x] Service worker com buffer de histórico por aba (painel aberto depois recebe o que passou)
- [x] Painel: store de eventos + tab Linha do tempo com chips de filtro por tipo, busca, contadores, linhas expansíveis (payload JSON) e botão Limpar — visual baseado na referência (header + Gravando + toggle ON/OFF)
- [x] Captura de erros reais da página (`error`, `unhandledrejection`, falha de recurso)
- [x] Medidor de overhead (ms/frame) e eventos/s exibidos no rodapé
- [x] Verificação manual: demo gera eventos (200 sintéticos + erros) e eles aparecem na timeline em tempo real

**Pronto quando:** demo gera eventos sintéticos e eles aparecem na Linha do tempo em tempo real; overhead visível.

---

## Etapa 2 — React adapter + Perfilador de renders

**Objetivo:** enxergar o React de verdade: árvore, renders, razões.

- [x] `react-adapter/`: instala `__REACT_DEVTOOLS_GLOBAL_HOOK__` antes do React (ou envolve o do React DevTools); detecta versão e build (dev/prod) via bundleType
- [x] Leitura da Fiber tree: nomes de componentes (Function/Class/ForwardRef/Memo), travessia iterativa dos fibers que renderizaram (flag PerformedWork)
- [x] Razão do render: mount / props mudadas (com as keys) / estado (com índice do hook) / pai re-renderizou
- [x] Detector de render desnecessário: todas as props alteradas são funções recriadas ou objetos/arrays shallow-equal (inline) → "⚠ desnecessário"
- [x] Tab **Perfilador**: KPIs (componentes, renders, tempo médio, lentos >16ms), gráfico de barras em canvas próprio, ranking ordenável com badge do último gatilho
- [x] Timeline mostra renders nomeados com botão 🔎 → abre Perfilador filtrado no componente
- [x] Banner de ambiente (produção detectada / React não detectado) + versão do React no rodapé
- [x] Agregação no agent (resumo a cada 1s, top 100) — ranking não depende do ring buffer da timeline
- [x] Verificação manual: contador da demo popula ranking; ProductCard aparece com "⚠ desnecessário — props: onBuy, style" (confirmado por captura de tela em 2026-07-24)

**Pronto quando:** na demo, um componente com prop inline aparece no ranking com a causa correta ("re-renderizou porque `onClick` é função nova a cada render do pai").

---

## Etapa 3 — Dashboard (Health Score) + controle de ruído

**Objetivo:** o "primeiro minuto": abrir e ver valor em 60 segundos.

- [x] Health Score 0–100 (penalidades: % de renders desnecessários, erros, renders lentos) com nível Excelente/Bom/Atenção/Crítico e detalhamento das penalidades
- [x] KPIs de gravidade + sparkline de pressão de render (60s, canvas) + top 5 infratores
- [x] Controle de ruído: agrupamento de repetidos adjacentes ("LeakyClock ×60" = 1 linha com tooltip do período) + ignore list por componente (🚫 na linha, limpável na toolbar)
- [x] Overlay visual na página (bordas azul=render / âmbar=desnecessário com rótulo e fade; toggle no header; preferência sobrevive a recarregar a página; teto de 40 caixas/commit)
- [x] Fix sugerido por template nos infratores (snippet useCallback/useMemo/React.memo com nomes reais das props + botão copiar)
- [x] Verificação manual: Health Score 78 com penalidades corretas e infratores com fix na demo (confirmado por captura em 2026-07-24; sparkline redesenhado com escala fixa/grade após feedback)

**Pronto quando:** abrir o painel na demo mostra score e 3 problemas com fix sugerido, sem flood de eventos.

---

## Etapa 4 — Auditor de useEffect + detectores de código

**Objetivo:** o território vazio que nenhuma ferramenta cobre.

- [x] Rastreamento de hooks de efeito por Fiber: deps, execução por commit, cleanup (compatível React 18 `destroy` e React 19 `inst.destroy`)
- [x] Detectores de efeito: cleanup faltando (setInterval/addEventListener/subscribe/Observer, verificado após o efeito rodar), sem array de deps (>3 renders), deps instáveis (recriação inline, streak >=3), efeito em rajada/loop (>=5 execuções em 2s), fetch sem AbortController
- [x] Detector de Diagnóstico: `key={index}` (cadeia de filhos com keys sequenciais "0","1","2"...)
- [x] Tab **Efeitos** e tab **Diagnóstico** com severidade, contagem, evidência (código do efeito) e fix por template copiável; badges nas tabs; penalidade no Health Score
- [x] Demo ganhou 3 bugs novos: efeito sem deps, dependência instável e fetch sem abort (total: 4 bugs de useEffect + key=index)
- [ ] Adiado p/ v1.2: mutação direta de estado, stale closure e ref-mutação durante render (exigem instrumentação mais profunda)
- [x] Verificação manual: os 4 bugs de useEffect + key=index detectados com explicação e fix corretos

**Pronto quando:** demo com 4 bugs plantados de useEffect → os 4 detectados com explicação e fix corretos.

---

## Etapa 5 — Web Vitals com atribuição React (CLS + INP + LCP)

**Objetivo:** o diferencial sem concorrente: "qual componente causou o shift".

- [x] `PerformanceObserver` no agent: layout-shift (janela de sessão CWV), LCP, event timing (INP), paint (FCP), navigation (TTFB/load) — funciona em qualquer build
- [x] Atribuição CLS: elemento do shift → Fiber (`__reactFiber$`) → componente React (build dev)
- [x] Atribuição INP: interações com `interactionId`, pior duração + contagem de lentas (>=200ms) com componente do alvo
- [x] Tab **Web Vitals**: medidor de CLS com zonas/marcas 0.1 e 0.25, cards LCP/INP/FCP/TTFB/Load com thresholds coloridos, lista de shifts com componente, dicas de correção; badge de CLS na tab
- [x] Eventos "vital" na timeline (chip rosa) — shifts e interações lentas aparecem cronologicamente entre os renders (correlação visual)
- [x] Overlay pisca em vermelho o elemento que causou o shift (quando ligado)
- [x] Penalidades de CLS/LCP no Health Score
- [x] Demo determinística: banner atrasado local (sem rede) + botão com handler bloqueante de 300ms (INP)
- [x] Verificação manual: CLS 0.005 com shift atribuído (`<p>` em App), LCP atribuído, INP 320ms após clique no handler lento

**Pronto quando:** demo com imagem sem dimensão → CLS reportado apontando o `<ProductCard>` responsável.

---

## Etapa 6 — Estado (Redux) + Memória

**Objetivo:** substituir o Redux DevTools e cobrir memória.

- [x] Detecção do store Redux SEM mudança de código: emulação do hook `__REDUX_DEVTOOLS_EXTENSION__`/`_COMPOSE__` (o enhancer nosso envolve o dispatch); se o DevTools oficial estiver instalado, não interfere
- [x] Histórico de actions (últimas 50) com chaves de topo alteradas por action; árvore de estado ao vivo (JSON recolhível, serialização com limites)
- [x] Dispatch manual: form (type + payload JSON) no painel → agent → store.dispatch
- [x] Correlação action → renders na Linha do tempo: renders até 200ms após a action ganham "· após cart/add" (exclusivo nosso)
- [x] Tab **Memória**: cards used/total/limite/pico, barra de heap com marcas 70/90%, taxa de crescimento (janela 60s) com "crescimento suspeito" honesto, gráfico used/total em canvas
- [x] Demo: mini-store compatível com Redux (mesma API + contrato de enhancer) com carrinho e botões de dispatch
- [ ] Adiado p/ v1.2: time-travel, detector de selector instável, listeners órfãos/detached nodes
- [x] Verificação manual: carrinho da demo aparece na tab Estado; dispatch manual funciona (confirmado pelo usuário em 2026-07-24, após correção do dispatch manual passar pelos middlewares)

**Pronto quando:** na demo Redux, dispatch manual funciona e a timeline mostra "action X → 12 renders".

---

## Etapa 7 — Análise de IA (BYOK) + Configurações

**Objetivo:** camada de IA com privacidade e sem custo de servidor.

- [x] Tab **Configurações**: cadastro de chaves (Anthropic/Google/OpenAI) em `chrome.storage.local`, teste de chave, seleção de modelo (lista buscada dinamicamente da API do provedor)
- [x] Chamadas no service worker com `host_permissions` (sem CORS), streaming SSE → painel
- [x] Redação/anonimização no cliente + preview do payload antes do envio
- [x] Snapshot estruturado da sessão (detectores + infratores + vitals + actions redigidas) como contexto
- [x] 3 tipos de análise: desempenho, risco de falha, segurança
- [x] **Auto-fix**: resposta da IA em formato diff, exportável como `.patch` (diffs reconstruídos do snapshot — auto-fix com código real fica para a ponte MCP da Etapa 8)
- [x] Telemetria anônima opt-in (desligada por padrão; toggle salvo — envio não implementado nesta versão)
- [ ] Verificação manual: análise com chave Anthropic real retorna achados em streaming + export .patch

**Pronto quando:** com chave Anthropic válida (`claude-opus-4-8`), análise da demo retorna achados em streaming e um patch aplicável.

---

## Etapa 8 — Inovações: ponte MCP + Perf budgets + Export

**Objetivo:** os diferenciais de categoria.

- [x] **Servidor MCP local**: CLI `bridge/react-debug-bridge.mjs` (Node puro, zero dependências) conectado à extensão via WebSocket localhost:7823; expõe tools MCP (`list_tabs`, `get_render_report`, `get_effect_issues`, `get_vitals`, `get_state_snapshot`) para Claude Code/Cursor; `npm run bridge`
- [x] Docs de configuração do MCP nos principais agentes (`bridge/MCP.md`)
- [x] **Perf budgets**: definição por componente (renders/10s, ms/render) + CLS da página, salvos por origem; editor na tab Perfilador, alertas no Painel ao estourar
- [x] **Snapshot exportável**: botão "⬇ Exportar" no header → JSON com timeline + achados
- [x] **Modo antes/depois**: seção no Painel — gravar baseline (por origem, sobrevive a reload) → aplicar fix → comparar score/CLS/renders por componente
- [ ] Verificação manual: Claude Code conectado ao bridge responde "quais componentes re-renderizam demais?" com dados reais; budget estourado gera alerta; export e antes/depois funcionam na demo

**Pronto quando:** Claude Code conectado ao bridge responde "quais componentes re-renderizam demais?" com dados reais da sessão.

---

## Etapa 9 — Polimento e publicação

**Objetivo:** pronto para a Chrome Web Store.

- [x] Heatmap de render com scrubber temporal (evolução do overlay): amostras {ts, rect, componente} no agent, agregação por região com cor por frequência (azul 1–2 / âmbar 3–7 / vermelho 8+), scrubber de 60s no header do painel
- [x] Detectores restantes do "8X": cascata de contexto (value do Provider recriado), cascata de suspense (boundaries resolvendo em série), hydration mismatch (intercepta console.error, cobre erros minificados 418/423/425 — Next.js), custo de handler inline (props on* recriadas) — todos com fix por template e bugs plantados na demo (bugs 9/10/11 + ProductCard)
- [x] Jump-to-source (`vscode://` + `_debugSource`): link "↗ arquivo" no ranking do Perfilador — disponível em React 17/18 dev com Babel; React 19 removeu o `_debugSource` (o link só aparece quando há dado)
- [x] Demo embutida linkada no onboarding ("▶ testar na demo embutida" no rodapé e no banner do Perfilador quando React não é detectado; abre `chrome-extension://…/demo/index.html` com agent+relay carregados na própria página)
- [x] Leitura básica de Zustand/Jotai/TanStack Query na tab Estado (Zustand/Jotai via `connect()` do hook devtools emulado; TanStack Query via `window.__TANSTACK_QUERY_CLIENT__`; seção "Outras stores")
- [x] Matrix de testes React 17/18 na demo (`demo/matrix.html?v=17|18` — UMD dev via CDN, mesmos bugs plantados em JS puro; React 19 coberto pela demo principal)
- [x] Ícones 16/32/48/128 gerados por `scripts/make-icons.mjs` (Node puro, sem dependências) e registrados no manifest
- [x] Textos de publicação em `store/`: descrição da Web Store, justificativas de permissões, checklist de screenshots e política de privacidade (pt-BR)
- [ ] Verificação manual: heatmap+scrubber na demo, 4 detectores novos disparando (bugs 9/10/11 + handler inline), demo embutida abrindo pelo painel, matrix 17/18 com versão correta no rodapé, outras stores na tab Estado
- [ ] Publicação na Web Store (ação do usuário): screenshots, hospedar a política de privacidade, zipar `dist/` e enviar para revisão — passo a passo em `store/descricao-web-store.md`

**Pronto quando:** extensão publicada e instalável pela Web Store.

---

## Regras de trabalho

1. Uma etapa por vez; verificação manual na demo antes de marcar concluída.
2. Todo detector novo nasce com: explicação em pt-BR, fix por template e caso plantado na demo.
3. Overhead da extensão medido em toda etapa — regressão de performance bloqueia a etapa.
4. Instalação de dependências novas sempre com autorização prévia (regra do ANGELO).
