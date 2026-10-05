"""Servidor MCP somente leitura do Volpe (PROTÓTIPO).

Hoje roda só com dados fictícios. Para o Claude Code:
    claude mcp add volpe-prototipo -- python /caminho/volpe-mcp/server.py
"""
import os

from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations

import consultas
from repositorio import MesInvalido, RepositorioFicticio, RepositorioVolpe

mcp = FastMCP("volpe-somente-leitura")

SOMENTE_LEITURA = ToolAnnotations(readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False)


def _repo():
    modo = os.environ.get("VOLPE_MODO", "ficticio").lower()
    if modo == "ficticio":
        return RepositorioFicticio()
    if modo == "real":
        return RepositorioVolpe()
    raise RuntimeError(f"VOLPE_MODO inválido: {modo!r}. Use 'ficticio' ou 'real'.")


@mcp.tool(annotations=SOMENTE_LEITURA)
def resumo_transitions(mes: str) -> dict:
    """Resumo do relatório Transitions de um mês (AAAA-MM): total de lentes, quantos clientes compraram e
    quantos não levaram, potencial de troca e os 3 maiores de cada lado. Sem dados de contato nem valores em R$."""
    try:
        return consultas.resumo_transitions(_repo(), mes)
    except MesInvalido as e:
        raise ValueError(str(e))


@mcp.tool(annotations=SOMENTE_LEITURA)
def clientes_transitions(mes: str, limite: int = 100, offset: int = 0) -> dict:
    """Lista de clientes do mês (AAAA-MM), do maior para o menor em lentes Transitions, com zeros no fim.
    Campos: cliente, cidade, uf, lentes_transitions, lentes_totais, pct_transitions. Sem fone, e-mail, vendedor ou R$."""
    try:
        return consultas.clientes_transitions(_repo(), mes, limite, offset)
    except MesInvalido as e:
        raise ValueError(str(e))


if __name__ == "__main__":
    mcp.run()
