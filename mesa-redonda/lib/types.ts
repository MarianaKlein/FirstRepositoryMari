export type Provider = "claude" | "gpt";
export type Speaker = Provider | "humano";

export const ERROR_MARK = "\u0000ERRO:";

export const NAMES: Record<Speaker, string> = {
  claude: "Claude",
  gpt: "GPT",
  humano: "Você",
};
