# Política de Privacidade — React Debug

_Última atualização: 25 de julho de 2026_

## Resumo

O React Debug é uma ferramenta de depuração que roda inteiramente no seu navegador.
**Não coletamos, armazenamos nem transmitimos seus dados.** Não há servidores nossos,
contas, cadastro ou telemetria ativada por padrão.

## Quais dados a extensão processa

Para funcionar, a extensão lê — **localmente, dentro do seu navegador** — informações
da página que você está inspecionando com o DevTools aberto:

- estrutura de componentes React, contagens e razões de render;
- execuções de `useEffect` e padrões problemáticos no código dos efeitos;
- estado e actions de stores (Redux, Zustand, Jotai, TanStack Query) quando presentes;
- métricas do navegador: Web Vitals (CLS/LCP/INP), uso de memória, erros de página.

Esses dados ficam na memória da extensão e são descartados ao fechar a aba ou o DevTools.

## O que é salvo no seu computador

Em `chrome.storage.local` (somente na sua máquina, nunca sincronizado):

- preferências (thresholds, ignore list, perf budgets, baseline antes/depois);
- chaves de API que **você** cadastrar para a análise de IA (BYOK).

Você pode apagar tudo removendo a extensão ou limpando os dados dela em
`chrome://extensions`.

## Análise de IA (opcional)

Se — e somente se — você cadastrar uma chave de API e clicar em "Analisar", um resumo
técnico da sessão de depuração é enviado **diretamente do seu navegador para o provedor
da sua chave** (Anthropic, Google ou OpenAI). Antes do envio:

- valores de estado/props passam por anonimização automática (e-mails, tokens e
  documentos são substituídos por placeholders);
- a extensão mostra exatamente o payload que será enviado, para sua revisão.

Nós não intermediamos, não vemos e não armazenamos essas requisições. O tratamento dos
dados pelo provedor segue a política de privacidade do provedor escolhido.

## Telemetria

Desligada por padrão. Se um dia existir telemetria opcional, será anônima, opt-in
explícito e descrita nesta política antes de entrar em vigor.

## Permissões usadas

- `storage` — preferências e chaves BYOK locais;
- `clipboardWrite` — botão "copiar fix";
- acesso às páginas (`<all_urls>`) — o agente de depuração precisa rodar na página
  inspecionada; ele não lê histórico de navegação nem envia dados a terceiros;
- `host_permissions` para api.anthropic.com, generativelanguage.googleapis.com e
  api.openai.com — exclusivamente para a análise de IA com a sua chave.

## Contato

Dúvidas ou solicitações: **marcio.manincor@gmail.com**

## Alterações

Mudanças nesta política serão publicadas neste mesmo endereço, com a data de
atualização revisada no topo.
