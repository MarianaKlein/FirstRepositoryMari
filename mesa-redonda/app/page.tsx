"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_ROLES,
  buildPrompt,
  buildSteps,
  buildSystem,
  toMarkdown,
  type Config,
  type Message,
  type Mode,
  type Step,
} from "@/lib/orchestrate";
import { ERROR_MARK, NAMES, type Provider } from "@/lib/types";

const SETTINGS_KEY = "mesa-redonda:settings:v1";
const PASSWORD_KEY = "mesa-redonda:password";

const MODE_HELP: Record<Mode, string> = {
  debate: "Um propõe, o outro critica e melhora, por N rodadas.",
  revezamento: "Um escreve a primeira versão, o outro revisa e entrega a final.",
  paralelo: "Os dois respondem sozinhos ao briefing, sem ver um ao outro.",
};

const DEFAULT_CONFIG: Config = {
  mode: "debate",
  first: "gpt",
  rounds: 2,
  consolidate: true,
  consolidator: "claude",
  roles: DEFAULT_ROLES,
};

function safeGet(storage: "local" | "session", key: string): string | null {
  try {
    return (storage === "local" ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: "local" | "session", key: string, value: string | null) {
  try {
    const s = storage === "local" ? localStorage : sessionStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    /* storage unavailable: app still works for this session */
  }
}

export default function Home() {
  const [password, setPassword] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPassword(safeGet("session", PASSWORD_KEY));
    setReady(true);
  }, []);

  const logout = useCallback(() => {
    safeSet("session", PASSWORD_KEY, null);
    setPassword(null);
  }, []);

  if (!ready) return null;
  if (!password) {
    return (
      <Login
        onSuccess={(pw) => {
          safeSet("session", PASSWORD_KEY, pw);
          setPassword(pw);
        }}
      />
    );
  }
  return <Table password={password} onLogout={logout} />;
}

function Login({ onSuccess }: { onSuccess: (pw: string) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", { method: "POST", headers: { "x-app-password": value } });
      if (res.ok) return onSuccess(value);
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Não foi possível entrar.");
    } catch {
      setError("Sem conexão com o servidor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form onSubmit={submit} className="card login-card">
        <h1>Mesa-redonda</h1>
        <p className="muted">Claude e GPT trabalhando juntos no mesmo projeto.</p>
        <label>
          Senha do time
          <input type="password" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy || !value}>
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}

function Table({ password, onLogout }: { password: string; onLogout: () => void }) {
  const [briefing, setBriefing] = useState("");
  const [cfg, setCfg] = useState<Config>(DEFAULT_CONFIG);
  const [messages, setMessages] = useState<Message[]>([]);
  const [comment, setComment] = useState("");
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const saved = safeGet("local", SETTINGS_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      setCfg({ ...DEFAULT_CONFIG, ...parsed.cfg, roles: { ...DEFAULT_ROLES, ...parsed.cfg?.roles } });
      if (typeof parsed.briefing === "string") setBriefing(parsed.briefing);
    } catch {
      /* ignore corrupted settings */
    }
  }, []);

  useEffect(() => {
    safeSet("local", SETTINGS_KEY, JSON.stringify({ cfg, briefing }));
  }, [cfg, briefing]);

  useEffect(() => {
    if (running) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, running]);

  const patch = (changes: Partial<Config>) => setCfg((c) => ({ ...c, ...changes }));

  async function streamStep(step: Step, history: Message[], signal: AbortSignal, id: string) {
    const res = await fetch("/api/turn", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", "x-app-password": password },
      body: JSON.stringify({
        provider: step.provider,
        system: buildSystem(step.provider, cfg),
        prompt: buildPrompt(step.provider, step, briefing, history),
      }),
    });

    if (res.status === 401) {
      onLogout();
      throw new Error("Sessão expirada. Entre de novo.");
    }
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Falha ao falar com o servidor.");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let acc = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += decoder.decode(value, { stream: true });
      const cut = acc.indexOf(ERROR_MARK);
      const text = cut === -1 ? acc : acc.slice(0, cut);
      setMessages((all) => all.map((m) => (m.id === id ? { ...m, text } : m)));
    }
    const cut = acc.indexOf(ERROR_MARK);
    if (cut !== -1) {
      const reason = acc.slice(cut + ERROR_MARK.length);
      const text = acc.slice(0, cut);
      setMessages((all) =>
        all.map((m) => (m.id === id ? { ...m, text: text || reason, error: !text } : m)),
      );
      throw new Error(reason);
    }
    return acc;
  }

  async function runSteps(steps: Step[], base: Message[]) {
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setNotice("");
    let history = base;
    try {
      for (const step of steps) {
        const msg: Message = { id: crypto.randomUUID(), speaker: step.provider, text: "" };
        const before = history;
        history = [...history, msg];
        setMessages(history);
        const text = await streamStep(step, before, controller.signal, msg.id);
        history = history.map((m) => (m.id === msg.id ? { ...m, text } : m));
      }
    } catch (err) {
      if (controller.signal.aborted) setNotice("Interrompido.");
      else setNotice(err instanceof Error ? err.message : "Algo deu errado.");
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function start() {
    if (!briefing.trim() || running) return;
    const human: Message = { id: crypto.randomUUID(), speaker: "humano", text: briefing.trim() };
    setMessages([human]);
    void runSteps(buildSteps(cfg), [human]);
  }

  function continueWithComment() {
    const text = comment.trim();
    if (!text || running || messages.length === 0) return;
    const human: Message = { id: crypto.randomUUID(), speaker: "humano", text };
    const base = [...messages, human];
    setMessages(base);
    setComment("");
    const a = cfg.first;
    const b: Provider = a === "claude" ? "gpt" : "claude";
    const instruction = "Responda ao comentário mais recente da pessoa, considerando o que já foi dito.";
    void runSteps(
      [
        { provider: a, instruction },
        { provider: b, instruction },
      ],
      base,
    );
  }

  const copy = (text: string) => navigator.clipboard?.writeText(text).catch(() => {});

  function download() {
    const blob = new Blob([toMarkdown(briefing, messages)], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mesa-redonda.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  const providers: Provider[] = ["claude", "gpt"];

  return (
    <div className="shell">
      <aside className="side">
        <header className="side-head">
          <h1>Mesa-redonda</h1>
          <button className="link" onClick={onLogout}>
            Sair
          </button>
        </header>

        <label>
          Briefing
          <textarea
            rows={7}
            value={briefing}
            placeholder="O que vocês precisam criar? Cliente, objetivo, público, formato, restrições…"
            onChange={(e) => setBriefing(e.target.value)}
          />
        </label>

        <fieldset>
          <legend>Modo</legend>
          <div className="seg">
            {(["debate", "revezamento", "paralelo"] as Mode[]).map((m) => (
              <button key={m} className={cfg.mode === m ? "on" : ""} onClick={() => patch({ mode: m })}>
                {m[0].toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
          <p className="muted small">{MODE_HELP[cfg.mode]}</p>
        </fieldset>

        <div className="row">
          <label>
            Quem começa
            <select value={cfg.first} onChange={(e) => patch({ first: e.target.value as Provider })}>
              {providers.map((p) => (
                <option key={p} value={p}>
                  {NAMES[p]}
                </option>
              ))}
            </select>
          </label>
          {cfg.mode === "debate" && (
            <label>
              Rodadas
              <select value={cfg.rounds} onChange={(e) => patch({ rounds: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="row">
          <label className="check">
            <input
              type="checkbox"
              checked={cfg.consolidate}
              onChange={(e) => patch({ consolidate: e.target.checked })}
            />
            Gerar versão final
          </label>
          {cfg.consolidate && (
            <label>
              Quem fecha
              <select
                value={cfg.consolidator}
                onChange={(e) => patch({ consolidator: e.target.value as Provider })}
              >
                {providers.map((p) => (
                  <option key={p} value={p}>
                    {NAMES[p]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <details>
          <summary>Papéis de cada um</summary>
          {providers.map((p) => (
            <label key={p}>
              {NAMES[p]}
              <textarea
                rows={3}
                value={cfg.roles[p]}
                onChange={(e) => patch({ roles: { ...cfg.roles, [p]: e.target.value } })}
              />
            </label>
          ))}
        </details>

        {running ? (
          <button className="danger" onClick={() => abortRef.current?.abort()}>
            Parar
          </button>
        ) : (
          <button className="primary" onClick={start} disabled={!briefing.trim()}>
            {messages.length ? "Recomeçar" : "Começar a conversa"}
          </button>
        )}
      </aside>

      <main className="stage">
        {messages.length === 0 ? (
          <div className="empty">
            <h2>Escreva o briefing e comece.</h2>
            <p className="muted">
              Claude e GPT vão conversar entre si e com você. Você pode entrar na conversa a qualquer
              momento.
            </p>
          </div>
        ) : (
          <div className="thread">
            {messages.map((m) => (
              <article key={m.id} className={`bubble ${m.speaker}${m.error ? " err" : ""}`}>
                <header>
                  <strong>{NAMES[m.speaker]}</strong>
                  {m.text && !m.error && (
                    <button className="link" onClick={() => copy(m.text)}>
                      Copiar
                    </button>
                  )}
                </header>
                <div className="text">{m.text || (running ? "…" : "")}</div>
              </article>
            ))}
            <div ref={endRef} />
          </div>
        )}

        {notice && <p className="error notice">{notice}</p>}

        {messages.length > 0 && (
          <footer className="composer">
            <textarea
              rows={2}
              value={comment}
              disabled={running}
              placeholder="Entre na conversa: dê uma direção, corrija algo, peça outra abordagem…"
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="composer-actions">
              <button className="primary" onClick={continueWithComment} disabled={running || !comment.trim()}>
                Enviar e continuar
              </button>
              <button onClick={() => copy(toMarkdown(briefing, messages))} disabled={running}>
                Copiar tudo
              </button>
              <button onClick={download} disabled={running}>
                Baixar .md
              </button>
            </div>
          </footer>
        )}
      </main>
    </div>
  );
}
