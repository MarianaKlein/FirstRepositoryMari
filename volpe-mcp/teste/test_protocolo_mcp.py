"""Fala com o servidor pelo protocolo MCP de verdade (stdio), como o Claude faria."""
import asyncio
import json
import sys
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

SERVIDOR = str(Path(__file__).resolve().parent.parent / "server.py")


def _com_sessao(coro):
    async def principal():
        params = StdioServerParameters(command=sys.executable, args=[SERVIDOR], env={"VOLPE_MODO": "ficticio"})
        async with stdio_client(params) as (leitura, escrita):
            async with ClientSession(leitura, escrita) as sessao:
                await sessao.initialize()
                return await coro(sessao)
    return asyncio.run(asyncio.wait_for(principal(), timeout=30))


def test_expoe_so_duas_ferramentas_e_ambas_somente_leitura():
    async def passo(s):
        return (await s.list_tools()).tools
    tools = _com_sessao(passo)
    assert {t.name for t in tools} == {"resumo_transitions", "clientes_transitions"}
    for t in tools:
        assert t.annotations.readOnlyHint is True
        assert t.annotations.destructiveHint is False


def test_nenhuma_ferramenta_aceita_sql_ou_nome_de_coluna():
    async def passo(s):
        return (await s.list_tools()).tools
    for t in _com_sessao(passo):
        campos = set(t.inputSchema["properties"])
        assert campos <= {"mes", "limite", "offset"}, f"{t.name} aceita {campos}"


def test_chamada_real_devolve_o_resumo():
    async def passo(s):
        return await s.call_tool("resumo_transitions", {"mes": "2026-08"})
    r = _com_sessao(passo)
    assert not r.isError
    dados = json.loads(r.content[0].text)
    assert dados["mes"] == "2026-08" and dados["fonte"] == "FICTICIO"


def test_mes_invalido_volta_como_erro_e_sem_vazar_detalhes():
    async def passo(s):
        return await s.call_tool("clientes_transitions", {"mes": "2026-08'; DROP TABLE x;--"})
    r = _com_sessao(passo)
    assert r.isError
    assert "AAAA-MM" in r.content[0].text
    assert "Traceback" not in r.content[0].text
