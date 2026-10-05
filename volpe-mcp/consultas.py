"""Ferramentas do servidor: transformam as linhas do repositório nas respostas que o Claude recebe.

Tudo aqui é cálculo sobre linhas já filtradas. Nenhuma função recebe SQL nem nome de coluna.
"""
from repositorio import CAMPOS_PERMITIDOS, Repositorio, validar_mes

LIMITE_MAXIMO = 500


def _montar(linhas: list[dict]) -> list[dict]:
    """Calcula o % e ordena como o arquivo do consultor: Transitions do maior para o menor, zeros no fim."""
    saida = []
    for r in linhas:
        tot = r["lentes_totais"]
        pct = round(100 * r["lentes_transitions"] / tot, 1) if tot else 0.0
        item = {**{k: r[k] for k in CAMPOS_PERMITIDOS if k in r}, "pct_transitions": pct}
        extras = set(item) - set(CAMPOS_PERMITIDOS)
        if extras:  # defesa: nunca devolver coluna fora da lista
            raise RuntimeError(f"Campo fora da lista permitida: {sorted(extras)}")
        saida.append(item)
    saida.sort(key=lambda x: (-x["lentes_transitions"], -x["lentes_totais"], x["cliente"]))
    return saida


def resumo_transitions(repo: Repositorio, mes: str) -> dict:
    mes = validar_mes(mes)
    linhas = _montar(repo.clientes_transitions(mes))
    compraram = [r for r in linhas if r["lentes_transitions"] > 0]
    nao = [r for r in linhas if r["lentes_transitions"] == 0]
    return {
        "mes": mes,
        "fonte": repo.fonte,
        "lentes_transitions": sum(r["lentes_transitions"] for r in linhas),
        "clientes_compraram": len(compraram),
        "clientes_nao_levaram": len(nao),
        "potencial_lentes": sum(r["lentes_totais"] for r in nao),
        "top3_compradores": [r["cliente"] for r in compraram[:3]],
        "top3_sem_transitions": [r["cliente"] for r in sorted(nao, key=lambda x: -x["lentes_totais"])[:3]],
    }


def clientes_transitions(repo: Repositorio, mes: str, limite: int = 100, offset: int = 0) -> dict:
    mes = validar_mes(mes)
    if not isinstance(limite, int) or not 1 <= limite <= LIMITE_MAXIMO:
        raise ValueError(f"limite deve ficar entre 1 e {LIMITE_MAXIMO}.")
    if not isinstance(offset, int) or offset < 0:
        raise ValueError("offset não pode ser negativo.")
    linhas = _montar(repo.clientes_transitions(mes))
    return {
        "mes": mes, "fonte": repo.fonte, "total_clientes": len(linhas),
        "offset": offset, "limite": limite, "clientes": linhas[offset: offset + limite],
    }
