"""Camada de dados do servidor MCP do Volpe.

Duas implementações atrás da mesma interface:
- RepositorioFicticio: dados sintéticos e determinísticos. É o que roda hoje.
- RepositorioVolpe: esqueleto do acesso real. Ainda não implementado de propósito.

Regra de desenho: o repositório só sabe devolver os campos de CAMPOS_PERMITIDOS.
Fone, e-mail, vendedor e valores em R$ não existem aqui, então nenhuma ferramenta
consegue vazá-los, mesmo com um erro de programação ou um pedido malicioso.
"""
import random
import re
from typing import Protocol

MES_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")

# Colunas do arquivo compacto do consultor (o "FABRICIO"): nada além disto sai do servidor.
CAMPOS_PERMITIDOS = (
    "cliente", "cidade", "uf", "lentes_transitions", "lentes_totais", "pct_transitions",
)


class MesInvalido(ValueError):
    pass


def validar_mes(mes: str) -> str:
    """Aceita só AAAA-MM. Nada do que o usuário digita chega perto de uma consulta."""
    if not isinstance(mes, str) or not MES_RE.fullmatch(mes):
        raise MesInvalido("Mês inválido. Use o formato AAAA-MM, por exemplo 2026-08.")
    return mes


class Repositorio(Protocol):
    fonte: str

    def clientes_transitions(self, mes: str) -> list[dict]:
        """Uma linha por cliente PJ (rede agrupada pela matriz), com as lentes Transitions e as totais do mês."""
        ...


class RepositorioFicticio:
    """Dados inventados. Os mesmos clientes todo mês, com números que mudam de forma estável por mês."""

    fonte = "FICTICIO"

    CIDADES = [("Vitória", "ES"), ("Vila Velha", "ES"), ("Serra", "ES"), ("Cariacica", "ES"),
               ("Linhares", "ES"), ("Colatina", "ES"), ("Campos dos Goytacazes", "RJ"),
               ("Belo Horizonte", "MG"), ("Governador Valadares", "MG"), ("Salvador", "BA")]

    def __init__(self, n_clientes: int = 60):
        self.n = n_clientes

    def clientes_transitions(self, mes: str) -> list[dict]:
        validar_mes(mes)
        rng = random.Random(f"ficticio-{mes}")
        linhas = []
        for i in range(1, self.n + 1):
            cidade, uf = self.CIDADES[i % len(self.CIDADES)]
            totais = rng.randint(4, 140)
            levou = rng.random() < 0.45
            trans = rng.randint(1, max(1, totais // 3)) if levou else 0
            linhas.append({
                "cliente": f"Ótica Fictícia {i:03d}", "cidade": cidade, "uf": uf,
                "lentes_transitions": trans, "lentes_totais": totais,
            })
        return linhas


class RepositorioVolpe:
    """Acesso real ao Volpe. NÃO IMPLEMENTADO de propósito.

    Quando for implementar, com quem administra o ERP e a rede:
    - login somente leitura (o Read_Only) e credencial só em variável de ambiente do servidor;
    - consultas FIXAS e parametrizadas, escritas aqui. Nunca aceitar SQL do usuário;
    - as regras do relatório vêm do script oficial (rodar o script contra o mesmo mês e comparar);
    - só PJ, rede agrupada pela matriz, fotossensível próprio fora, unidade = lente unitária;
    - selecionar apenas as colunas de CAMPOS_PERMITIDOS: nunca SELECT *.
    """

    fonte = "VOLPE"

    def clientes_transitions(self, mes: str) -> list[dict]:
        validar_mes(mes)
        raise NotImplementedError(
            "O acesso real ao Volpe ainda não foi implementado. Rode com VOLPE_MODO=ficticio."
        )
