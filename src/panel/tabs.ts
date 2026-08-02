export interface TabDef {
  id: string;
  label: string;
  title: string;
  description: string;
}

export const TABS: TabDef[] = [
  {
    id: "dashboard",
    label: "Painel",
    title: "Painel",
    description:
      "Health Score, KPIs de gravidade, principais infratores e sinais vitais da página. (Etapa 3)",
  },
  {
    id: "timeline",
    label: "Linha do tempo",
    title: "Linha do tempo",
    description:
      "Histórico visual de cada render, mudança de estado, efeito e erro — clique para investigar. (Etapa 1)",
  },
  {
    id: "profiler",
    label: "Perfilador",
    title: "Perfilador & Paradas",
    description:
      "Contagens e razões de render (props/estado/contexto), ranking de infratores e gráficos. (Etapa 2)",
  },
  {
    id: "diagnostics",
    label: "Diagnóstico",
    title: "Diagnóstico",
    description:
      "Detectores: key instável, mutação direta de estado, stale closures, hydration mismatch e mais. (Etapa 4)",
  },
  {
    id: "effects",
    label: "Efeitos",
    title: "useEffect Auditor",
    description:
      "Cleanups faltando, arrays de dependência ruins e efeitos em loop nos seus hooks. (Etapa 4)",
  },
  {
    id: "state",
    label: "Estado",
    title: "Estado (Redux)",
    description:
      "Árvore de estado, histórico de actions, dispatch manual e detector de selectors instáveis. (Etapa 6)",
  },
  {
    id: "memory",
    label: "Memória",
    title: "Memória",
    description:
      "Sparkline de heap, alertas de taxa de crescimento e heurísticas de vazamento. (Etapa 6)",
  },
  {
    id: "vitals",
    label: "Web Vitals",
    title: "Core Web Vitals",
    description:
      "CLS, LCP e INP em tempo real com atribuição por elemento e por componente React. (Etapa 5)",
  },
  {
    id: "ai",
    label: "IA",
    title: "Análise de IA",
    description:
      "Análise de segurança, desempenho e risco de falha com o seu provedor de IA (BYOK). (Etapa 7)",
  },
  {
    id: "settings",
    label: "Configurações",
    title: "Configurações",
    description:
      "Chaves de API (BYOK), servidor MCP, thresholds, ignore lists e telemetria (opt-in). (Etapa 7)",
  },
];
