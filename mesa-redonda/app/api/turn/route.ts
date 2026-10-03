import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { checkPassword } from "@/lib/auth";
import { ERROR_MARK, type Provider } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";
const MAX_FIELD_CHARS = 60_000;

type TurnBody = { provider: Provider; system: string; prompt: string };

function parseBody(raw: unknown): TurnBody | null {
  if (!raw || typeof raw !== "object") return null;
  const { provider, system, prompt } = raw as Record<string, unknown>;
  if (provider !== "claude" && provider !== "gpt") return null;
  if (typeof system !== "string" || typeof prompt !== "string") return null;
  if (!prompt.trim() || system.length > MAX_FIELD_CHARS || prompt.length > MAX_FIELD_CHARS) return null;
  return { provider, system, prompt };
}

function friendlyError(err: unknown, provider: Provider): string {
  const who = provider === "claude" ? "Claude (Anthropic)" : "GPT (OpenAI)";
  const status =
    err instanceof Anthropic.APIError || err instanceof OpenAI.APIError ? err.status : undefined;
  if (status === 401) return `${who}: chave de API inválida ou ausente. Confira as variáveis de ambiente.`;
  if (status === 429) return `${who}: limite de uso atingido ou sem crédito. Tente de novo em instantes.`;
  if (status === 404) return `${who}: modelo não encontrado. Confira CLAUDE_MODEL / OPENAI_MODEL.`;
  if (status === 400) return `${who}: pedido recusado pela API (${(err as Error).message}).`;
  return `${who}: falha inesperada. Tente novamente.`;
}

async function streamClaude({ system, prompt }: TurnBody, signal: AbortSignal, write: (t: string) => void) {
  const client = new Anthropic();
  const stream = client.beta.messages.stream(
    {
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      system,
      messages: [{ role: "user", content: prompt }],
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      // Retry on another model if a safety classifier declines the request.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    },
    { signal },
  );
  stream.on("text", write);
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") {
    write("\n\n_(O modelo recusou continuar esta resposta.)_");
  } else if (final.stop_reason === "max_tokens") {
    write("\n\n_(Resposta cortada por tamanho.)_");
  }
}

async function streamGpt({ system, prompt }: TurnBody, signal: AbortSignal, write: (t: string) => void) {
  const client = new OpenAI();
  const stream = await client.chat.completions.create(
    {
      model: OPENAI_MODEL,
      stream: true,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    },
    { signal },
  );
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) write(delta);
  }
}

export async function POST(req: Request) {
  const auth = checkPassword(req.headers.get("x-app-password"));
  if (auth === "unauthorized") {
    return Response.json({ error: "Senha incorreta." }, { status: 401 });
  }

  const body = parseBody(await req.json().catch(() => null));
  if (!body) return Response.json({ error: "Pedido inválido." }, { status: 400 });

  const encoder = new TextEncoder();

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (text: string) => controller.enqueue(encoder.encode(text));
      try {
        if (body.provider === "claude") await streamClaude(body, req.signal, write);
        else await streamGpt(body, req.signal, write);
      } catch (err) {
        if (!req.signal.aborted) {
          console.error(`[turn:${body.provider}]`, err instanceof Error ? err.message : err);
          write(ERROR_MARK + friendlyError(err, body.provider));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
