# Servidor MCP do Volpe (protótipo)

Servidor **somente leitura** que deixa o Claude consultar o relatório Transitions sem depender de uma
máquina específica nem de credencial dentro da sessão.

**Estado: protótipo com dados fictícios.** Não toca no Volpe. Cada resposta traz `"fonte": "FICTICIO"`.

## O que ele expõe
| Ferramenta | Devolve |
|---|---|
| `resumo_transitions(mes)` | total de lentes, quantos compraram, quantos não levaram, potencial de troca, top 3 de cada lado |
| `clientes_transitions(mes, limite, offset)` | lista do mês, do maior para o menor em Transitions, zeros no fim |

`mes` é sempre `AAAA-MM`. Campos devolvidos por cliente: `cliente`, `cidade`, `uf`, `lentes_transitions`,
`lentes_totais`, `pct_transitions`. É a mesma informação do arquivo compacto do consultor.

## Decisões de segurança (e como cada uma é garantida)
1. **Sem contato e sem valor.** Fone, e-mail, vendedor e R$ não existem na camada de dados
   (`CAMPOS_PERMITIDOS` em `repositorio.py`). Se alguém tentar devolvê-los, a montagem os descarta.
   Teste: `test_repositorio_que_devolve_campo_extra_e_barrado`.
2. **Sem SQL do usuário.** As ferramentas só aceitam `mes`, `limite` e `offset`. Teste:
   `test_nenhuma_ferramenta_aceita_sql_ou_nome_de_coluna`.
3. **Mês validado.** Só `AAAA-MM`; qualquer outra coisa é recusada antes de chegar perto de uma consulta.
4. **Limite de linhas.** No máximo 500 por chamada.
5. **Somente leitura declarado** no protocolo (`readOnlyHint`) e, no acesso real, por login `Read_Only`.
6. **Credencial só no servidor**, em variável de ambiente. Nunca em prompt, arquivo da skill ou chat.

## Rodar e testar
```bash
pip install -r requirements.txt
python -m pytest teste -q          # 29 testes, inclusive uma conversa real pelo protocolo MCP
python server.py                    # servidor stdio, dados fictícios
claude mcp add volpe-prototipo -- python /caminho/para/volpe-mcp/server.py
```

Como os testes foram validados: 6 mudanças de propósito no código (parar de filtrar campos, aceitar qualquer
mês, ordenar errado, somar o potencial errado, remover o limite, dividir por zero) e todas fizeram algum teste falhar.

## O que falta para o acesso real (não fazer sozinho)
| Passo | Quem decide |
|---|---|
| Implementar `RepositorioVolpe` com as consultas fixas do script oficial (`scripts/relatorio-transitions-mes.ps1`, no AI-Vixlens), selecionando só as colunas permitidas | quem mantém o script |
| Conferir: rodar o script e o servidor para o mesmo mês e comparar os números (mesma ideia do `confere.py`) | você |
| Onde o servidor roda. O banco só aceita IP liberado na PWI, e uma sessão em nuvem não tem IP fixo. Precisa ser um lugar que o IP liberado aceite | quem administra a rede |
| Transporte HTTP com autenticação, se for usado por mais de uma pessoa | quem administra a rede |
| Login `Read_Only` e onde guardar a senha no servidor | quem guarda a senha |
| Revisão de privacidade (LGPD): mesmo sem fone e e-mail, o nome do cliente e o volume de compra são dados de negócio | CEO e quem responde por dados |

## Arquivos
- `repositorio.py`: camada de dados (fictícia e esqueleto do Volpe)
- `consultas.py`: cálculo das respostas
- `server.py`: as duas ferramentas MCP
- `teste/`: testes
