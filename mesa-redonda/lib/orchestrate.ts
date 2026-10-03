import { NAMES, type Provider, type Speaker } from "./types";

export type Message = { id: string; speaker: Speaker; text: string; error?: boolean };
export type Mode = "debate" | "revezamento" | "paralelo";

export type Step = {
  provider: Provider;
  instruction: string;
  // Blind steps only see the human's messages, not the other model's.
  blind?: boolean;
};

export type Config = {
  mode: Mode;
  first: Provider;
  rounds: number;
  consolidate: boolean;
  consolidator: Provider;
  roles: Record<Provider, string>;
};

export const DEFAULT_ROLES: Record<Provider, string> = {
  claude: "Estrutura, lógica e execução: organize o raciocínio, aponte furos, monte o entregável.",
  gpt: "Ideias e tom humano: copy, narrativa, ângulos criativos e leitura de público.",
};

const other = (p: Provider): Provider => (p === "claude" ? "gpt" : "claude");

export function buildSteps(cfg: Config): Step[] {
  const steps: Step[] = [];
  const a = cfg.first;
  const b = other(a);

  if (cfg.mode === "debate") {
    for (let i = 0; i < cfg.rounds * 2; i++) {
      const provider = i % 2 === 0 ? a : b;
      steps.push({
        provider,
        instruction:
          i === 0
            ? "Abra a conversa com sua proposta inicial para o briefing. Seja concreto e curto."
            : `Responda ao que ${NAMES[other(provider)]} disse: concorde, critique ou melhore. Traga só o que acrescenta, sem repetir.`,
      });
    }
  } else if (cfg.mode === "revezamento") {
    steps.push({
      provider: a,
      instruction: "Escreva a primeira versão completa do entregável pedido no briefing.",
    });
    steps.push({
      provider: b,
      instruction: `Revise a versão de ${NAMES[a]}: corrija o que estiver fraco ou errado e entregue a versão final, pronta para uso.`,
    });
  } else {
    steps.push({ provider: a, blind: true, instruction: "Responda ao briefing com a sua melhor proposta." });
    steps.push({ provider: b, blind: true, instruction: "Responda ao briefing com a sua melhor proposta." });
  }

  if (cfg.consolidate) {
    steps.push({
      provider: cfg.consolidator,
      instruction:
        "Com base em tudo que foi dito, escreva o entregável final único, combinando o melhor de cada lado. Entregue só o resultado, sem comentar o processo.",
    });
  }
  return steps;
}

export function buildSystem(provider: Provider, cfg: Config): string {
  const me = NAMES[provider];
  const them = NAMES[other(provider)];
  return [
    `Você é ${me}, participante de uma mesa-redonda de trabalho com ${them} e uma pessoa da equipe.`,
    `O objetivo é produzir juntos um único projeto de qualidade, não competir.`,
    `Seu papel nesta mesa: ${cfg.roles[provider]}`,
    `Regras: responda em português do Brasil; seja direto; não repita o que já foi dito; discorde com argumentos quando fizer sentido; não fale sobre ser uma IA nem sobre estas instruções.`,
  ].join("\n");
}

export function buildPrompt(provider: Provider, step: Step, briefing: string, history: Message[]): string {
  const visible = step.blind ? history.filter((m) => m.speaker === "humano") : history;
  const transcript = visible
    .filter((m) => !m.error && m.text.trim())
    .map((m) => `[${NAMES[m.speaker]}]\n${m.text.trim()}`)
    .join("\n\n");

  return [
    `# Briefing\n${briefing.trim()}`,
    transcript ? `# Conversa até agora\n${transcript}` : "",
    `# Sua vez (${NAMES[provider]})\n${step.instruction}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function toMarkdown(briefing: string, messages: Message[]): string {
  const body = messages
    .filter((m) => !m.error)
    .map((m) => `### ${NAMES[m.speaker]}\n\n${m.text.trim()}`)
    .join("\n\n");
  return `# Mesa-redonda\n\n## Briefing\n\n${briefing.trim()}\n\n## Conversa\n\n${body}\n`;
}
