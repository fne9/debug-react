# React Debug — Material da Chrome Web Store

> Textos prontos para colar no painel do desenvolvedor (https://chrome.google.com/webstore/devconsole).
> Idioma principal da listagem: **português (Brasil)**.

## Nome

React Debug — depuração e performance para React

## Resumo curto (máx. 132 caracteres)

Descubra o que está errado no seu app React e como consertar: renders, useEffect, estado, memória e Web Vitals em uma só aba.

## Descrição longa

React Debug unifica em uma única aba do DevTools o que hoje exige quatro ferramentas
(React DevTools, aba Performance, Redux DevTools e utilitários como why-did-you-render) —
e vai além: em vez de só mostrar dados, **diz o que está errado e como consertar**, com
snippet de correção pronto para copiar. Zero alteração de código no seu app.

O QUE VOCÊ VÊ AO ABRIR:

⚛ Painel — Health Score 0–100 da página, KPIs de gravidade, principais infratores e alertas de perf budget.

⏱ Linha do tempo — cada render, action, efeito, shift de layout e erro em ordem cronológica, com correlação causal ("action cart/add → 12 renders").

📊 Perfilador — contagem e RAZÃO de cada render (props? estado? pai?), detector de render desnecessário (props inline), perf budgets por componente e jump-to-source.

🔬 Diagnóstico — key={index} em listas, cascatas de contexto, cascatas de Suspense, hydration mismatch (Next.js) e custo de handler inline.

🪝 Efeitos — auditor de useEffect: cleanup faltando, efeito sem array de deps, deps instáveis, efeito em loop e fetch sem AbortController.

🗃 Estado — árvore Redux ao vivo, histórico de actions, dispatch manual — sem instalar nada no app. Leitura básica de Zustand, Jotai e TanStack Query.

🧠 Memória — heap ao longo do tempo com alerta honesto de "crescimento suspeito".

📐 Web Vitals — CLS, LCP e INP em tempo real com atribuição por COMPONENTE React ("o shift veio do <ProductCard>").

🤖 Análise de IA (opcional, BYOK) — análise de desempenho, risco de falha e segurança usando a SUA chave de API (Anthropic, Google ou OpenAI), com anonimização dos dados antes do envio e preview do payload.

🔥 Extras — overlay de renders na página, heatmap com scrubber temporal, snapshot exportável para anexar em tickets, modo antes/depois para provar a melhoria, e ponte MCP local para agentes de código (Claude Code, Cursor) lerem os diagnósticos e corrigirem seu código com dados reais de runtime.

REQUISITOS:
• Para dados completos (renders, efeitos, estado), o app precisa rodar em build de desenvolvimento do React 17, 18 ou 19.
• Em builds de produção, os recursos baseados em APIs do navegador continuam funcionando (Web Vitals, memória, erros).
• Não sabe por onde começar? A extensão traz uma demo embutida com bugs plantados.

PRIVACIDADE:
• Nenhum dado sai da sua máquina, exceto quando VOCÊ pede uma análise de IA — e aí os dados vão direto do seu navegador para o provedor da SUA chave, após anonimização.
• Sem telemetria por padrão. Sem contas, sem cadastro.

## Categoria

Ferramentas do desenvolvedor (Developer Tools)

## Justificativas de permissões (formulário de privacidade da Web Store)

| Permissão | Justificativa |
|---|---|
| `storage` | Guardar preferências do usuário (thresholds, ignore list, budgets, baseline) e as chaves de API BYOK — somente em `chrome.storage.local`, nunca sincronizadas. |
| `clipboardWrite` | Botão "copiar fix" — copia o snippet de correção sugerido para a área de transferência. |
| `host_permissions` (api.anthropic.com, generativelanguage.googleapis.com, api.openai.com) | Chamadas de análise de IA saem do service worker direto para o provedor escolhido pelo usuário, usando a chave do próprio usuário (BYOK). Nada é enviado sem ação explícita. |
| Content scripts em `<all_urls>` | A extensão é uma ferramenta de DevTools: o agente precisa estar presente na página inspecionada (antes do React carregar) para ler renders, efeitos e Web Vitals de qualquer app que o desenvolvedor abrir. Não coleta nem transmite dados de navegação. |

Uso de código remoto: **não** (todo o código vai empacotado; a análise de IA envia texto, não executa código remoto).

## Checklist de screenshots (1280×800, PNG)

Capturar na demo embutida (`chrome-extension://<id>/demo/index.html`) com tema escuro do DevTools:

1. **Painel** com Health Score baixo, penalidades e top infratores com fix sugerido.
2. **Perfilador** com ranking, "⚠ desnecessário — props: onBuy, style" e budgets.
3. **Efeitos** com os 4 problemas de useEffect detectados (cleanup, deps, instável, fetch).
4. **Web Vitals** com CLS atribuído a um componente React.
5. **Linha do tempo** com renders + "· após cart/add" (correlação com Redux).
6. Página da demo com o **heatmap** ligado (caixas coloridas + scrubber no painel).

Tile pequeno (440×280) e marquee (1400×560): logo (icons/icon128.png ampliado) + tagline
"Te digo o que está errado e como consertar".

## Publicação — passo a passo

1. `npm run build` → conferir `dist/` completo (manifest com ícones).
2. Zipar o CONTEÚDO de `dist/` (o manifest.json na raiz do zip): `Compress-Archive -Path dist\* -DestinationPath react-debug-v0.1.0.zip`.
3. Console do desenvolvedor → New item → subir o zip.
4. Preencher listagem com os textos acima + screenshots.
5. Privacidade: single purpose = "ferramenta de depuração React no DevTools"; justificativas da tabela acima; link da política de privacidade (hospedar `store/politica-de-privacidade.md` — ex.: GitHub Pages).
6. Enviar para revisão (extensões DevTools com `<all_urls>` costumam demorar alguns dias).
