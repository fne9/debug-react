# React Debug — Ponte MCP (`react-debug-bridge`)

A ponte conecta os diagnósticos de runtime da extensão a agentes de código
(Claude Code, Cursor, etc.) via **MCP**. O agente passa a responder perguntas
como *"quais componentes re-renderizam demais e por quê?"* com dados **reais**
da sessão que está rodando no seu Chrome — e pode corrigir o código com base neles.

```
Chrome (extensão) ──WebSocket 127.0.0.1:7823──▶ react-debug-bridge ──MCP/stdio──▶ Claude Code / Cursor
```

Requisitos: Node 18+. Zero dependências (o bridge usa só a biblioteca padrão).

## Como funciona

1. A extensão empurra, a cada segundo, um snapshot por aba (perfilador,
   detectores, Web Vitals, Redux, memória) para a ponte via WebSocket local.
2. A ponte guarda o último snapshot de cada aba e expõe tools MCP via stdio.
3. Se a ponte não estiver rodando, a extensão apenas tenta reconectar em
   silêncio — nada quebra.

O painel DevTools **não** precisa estar aberto: basta a página estar carregada
com a extensão ativa.

## Configurar no Claude Code

```sh
claude mcp add react-debug -- node "C:/Users/ANGELO/Desktop/extension react debugger/bridge/react-debug-bridge.mjs"
```

(ajuste o caminho se o projeto mudar de pasta; em macOS/Linux o formato é o mesmo)

## Configurar no Cursor (ou outro cliente MCP por JSON)

`.cursor/mcp.json` no projeto (ou o arquivo global de MCP do cliente):

```json
{
  "mcpServers": {
    "react-debug": {
      "command": "node",
      "args": ["C:/Users/ANGELO/Desktop/extension react debugger/bridge/react-debug-bridge.mjs"]
    }
  }
}
```

## Rodar manualmente (diagnóstico)

```sh
npm run bridge
```

Com a ponte rodando, `http://127.0.0.1:7823/` mostra um JSON de status
(conexões da extensão e abas monitoradas). Porta configurável com a variável
de ambiente `REACT_DEBUG_BRIDGE_PORT` (padrão 7823).

## Tools MCP expostas

| Tool | O que retorna |
|---|---|
| `list_tabs` | Abas monitoradas (id, URL, versão do React, última atualização) |
| `get_render_report` | Renders por componente: contagens, desnecessários, tempo, causa do último render |
| `get_effect_issues` | Problemas dos detectores (useEffect sem cleanup, deps instáveis, key=index...) com evidência e fix |
| `get_vitals` | CLS/LCP/INP/FCP/TTFB com atribuição por componente React |
| `get_state_snapshot` | Árvore de estado Redux, últimas actions e resumo de memória |

Todas aceitam `tabId` opcional; sem ele, usam a aba com dados mais recentes.

## Exemplo de uso no Claude Code

> "Use as tools do react-debug para descobrir quais componentes re-renderizam
> desnecessariamente nesta sessão e corrija o código do meu projeto."

## Segurança

- A ponte escuta apenas em `127.0.0.1` (nunca exposta na rede).
- Fluxo somente leitura: a ponte não envia comandos para a página.
- Os snapshots contêm dados do app inspecionado (estado Redux etc.) — rode a
  ponte apenas em máquinas suas.
