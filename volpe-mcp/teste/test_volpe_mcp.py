"""Testes do protótipo do servidor MCP do Volpe.

Cobrem o que importa para um servidor de leitura sobre dados de clientes:
1. nada além dos campos permitidos sai (sem fone, e-mail, vendedor ou R$);
2. o mês é validado e nenhuma entrada vira consulta;
3. o resumo fecha com a lista, no mesmo espírito do confere.py do relatório;
4. a ordem é a do arquivo do consultor.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import consultas  # noqa: E402
from repositorio import CAMPOS_PERMITIDOS, MesInvalido, RepositorioFicticio, RepositorioVolpe  # noqa: E402

PROIBIDOS = ("fone", "telefone", "email", "e-mail", "vendedor", "valor", "r$", "preco", "cnpj", "cpf")


@pytest.fixture
def repo():
    return RepositorioFicticio()


# --- privacidade ---------------------------------------------------------------------

def test_cada_cliente_tem_exatamente_os_campos_permitidos(repo):
    r = consultas.clientes_transitions(repo, "2026-08", limite=500)
    for c in r["clientes"]:
        assert set(c) == set(CAMPOS_PERMITIDOS)


def test_nenhum_campo_de_contato_ou_valor_na_resposta(repo):
    textos = [str(consultas.resumo_transitions(repo, "2026-08")).lower(),
              str(consultas.clientes_transitions(repo, "2026-08", limite=500)).lower()]
    for t in textos:
        for p in PROIBIDOS:
            assert p not in t, f"'{p}' apareceu na resposta"


def test_repositorio_que_devolve_campo_extra_e_barrado():
    class Vazador:
        fonte = "TESTE"

        def clientes_transitions(self, mes):
            return [{"cliente": "X", "cidade": "Y", "uf": "ES", "lentes_transitions": 1,
                     "lentes_totais": 2, "telefone": "27 99999-9999"}]

    # O campo extra é descartado na montagem: o telefone não passa.
    r = consultas.clientes_transitions(Vazador(), "2026-08")
    assert "telefone" not in r["clientes"][0]


# --- entrada ----------------------------------------------------------------------------

@pytest.mark.parametrize("mes", ["agosto", "2026-13", "2026-00", "26-08", "2026/08", "2026-08 ",
                                 "2026-08'; DROP TABLE clientes;--", "", "2026-8"])
def test_mes_invalido_e_recusado(repo, mes):
    with pytest.raises(MesInvalido):
        consultas.resumo_transitions(repo, mes)
    with pytest.raises(MesInvalido):
        consultas.clientes_transitions(repo, mes)


@pytest.mark.parametrize("limite", [0, -1, 501, 10_000])
def test_limite_fora_da_faixa_e_recusado(repo, limite):
    with pytest.raises(ValueError):
        consultas.clientes_transitions(repo, "2026-08", limite=limite)


def test_offset_negativo_e_recusado(repo):
    with pytest.raises(ValueError):
        consultas.clientes_transitions(repo, "2026-08", offset=-5)


def test_acesso_real_ainda_nao_existe_e_avisa_com_clareza():
    with pytest.raises(NotImplementedError, match="não foi implementado"):
        RepositorioVolpe().clientes_transitions("2026-08")


# --- o resumo fecha com a lista ---------------------------------------------------------

def test_resumo_fecha_com_a_lista(repo):
    resumo = consultas.resumo_transitions(repo, "2026-08")
    lista = consultas.clientes_transitions(repo, "2026-08", limite=500)["clientes"]
    com = [c for c in lista if c["lentes_transitions"] > 0]
    sem = [c for c in lista if c["lentes_transitions"] == 0]
    assert resumo["lentes_transitions"] == sum(c["lentes_transitions"] for c in lista)
    assert resumo["clientes_compraram"] == len(com)
    assert resumo["clientes_nao_levaram"] == len(sem)
    assert resumo["clientes_compraram"] + resumo["clientes_nao_levaram"] == len(lista)
    assert resumo["potencial_lentes"] == sum(c["lentes_totais"] for c in sem)


def test_ninguem_nos_dois_lados(repo):
    resumo = consultas.resumo_transitions(repo, "2026-08")
    assert not set(resumo["top3_compradores"]) & set(resumo["top3_sem_transitions"])


# --- ordem e cálculo ------------------------------------------------------------------

def test_ordem_maior_para_menor_com_zeros_no_fim(repo):
    lista = consultas.clientes_transitions(repo, "2026-08", limite=500)["clientes"]
    valores = [c["lentes_transitions"] for c in lista]
    assert valores == sorted(valores, reverse=True)
    primeiro_zero = valores.index(0)
    assert all(v == 0 for v in valores[primeiro_zero:])


def test_percentual_confere_com_a_conta(repo):
    for c in consultas.clientes_transitions(repo, "2026-08", limite=500)["clientes"]:
        esperado = round(100 * c["lentes_transitions"] / c["lentes_totais"], 1)
        assert c["pct_transitions"] == esperado


def test_percentual_com_total_zero_nao_quebra():
    class Zero:
        fonte = "TESTE"

        def clientes_transitions(self, mes):
            return [{"cliente": "A", "cidade": "B", "uf": "ES", "lentes_transitions": 0, "lentes_totais": 0}]

    assert consultas.clientes_transitions(Zero(), "2026-08")["clientes"][0]["pct_transitions"] == 0.0


def test_paginacao_junta_tudo_sem_repetir(repo):
    todos = consultas.clientes_transitions(repo, "2026-08", limite=500)["clientes"]
    p1 = consultas.clientes_transitions(repo, "2026-08", limite=25, offset=0)["clientes"]
    p2 = consultas.clientes_transitions(repo, "2026-08", limite=25, offset=25)["clientes"]
    p3 = consultas.clientes_transitions(repo, "2026-08", limite=25, offset=50)["clientes"]
    assert p1 + p2 + p3 == todos


def test_resposta_diz_que_os_dados_sao_ficticios(repo):
    assert consultas.resumo_transitions(repo, "2026-08")["fonte"] == "FICTICIO"
