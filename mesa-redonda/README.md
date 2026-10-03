# Mesa-redonda

App web onde **Claude** e **GPT** conversam entre si e com você para construir um projeto único.

## Modos

- **Debate:** um propõe, o outro critica e melhora, por N rodadas.
- **Revezamento:** um escreve a primeira versão, o outro revisa e entrega a final.
- **Paralelo:** os dois respondem sozinhos ao briefing, sem ver um ao outro.

Em todos os modos dá para gerar uma **versão final** (escolha quem fecha), mudar o **papel** de cada modelo, entrar na conversa com comentários e copiar/baixar o resultado em Markdown.

## Como colocar no ar (Vercel)

1. **Chaves de API** (cobradas à parte das assinaturas de chat):
   - Anthropic: <https://console.anthropic.com> → API Keys → Create Key. Adicione crédito em Billing.
   - OpenAI: <https://platform.openai.com/api-keys> → Create new secret key. Adicione crédito em Billing.
2. Em <https://vercel.com/new>, importe este repositório e em **Root Directory** escolha `mesa-redonda`.
3. Em **Environment Variables**, cadastre:

   | Variável | Valor |
   |---|---|
   | `ANTHROPIC_API_KEY` | chave da Anthropic |
   | `OPENAI_API_KEY` | chave da OpenAI |
   | `APP_PASSWORD` | *(opcional)* se preenchida, o app pede essa senha ao abrir |

   Opcionais: `CLAUDE_MODEL` (padrão `claude-opus-5-5`) e `OPENAI_MODEL` (padrão `gpt-4o`).
4. **Deploy.** Compartilhe o endereço com o time.

> As chaves ficam só no servidor (nunca no navegador). **Sem login, qualquer pessoa com o endereço consegue usar o app e gastar o crédito das suas chaves.** Por isso: não divulgue o link fora do time, defina um limite de gasto mensal nos dois consoles e, se precisar, cadastre `APP_PASSWORD` a qualquer momento.

## Rodar localmente

```bash
cd mesa-redonda
cp .env.example .env.local   # preencha as variáveis
npm install
npm run dev                  # http://localhost:3000
```

## Como funciona

O navegador conduz as rodadas e chama `/api/turn` uma vez por fala. Cada chamada é curta e transmitida em streaming, então não estoura o tempo limite da Vercel, mesmo em debates longos. A rota monta o contexto (briefing + conversa até ali + instrução da vez) e chama a API do modelo da vez.

- `app/page.tsx`: interface e execução das rodadas
- `lib/orchestrate.ts`: modos, papéis e montagem dos prompts
- `app/api/turn/route.ts`: chamada em streaming a Claude e GPT
- `lib/auth.ts`: senha compartilhada (opcional)
