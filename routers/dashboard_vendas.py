# /routers/dashboard_vendas.py
from fastapi import APIRouter, HTTPException, Query, Depends
from datetime import date, datetime
from typing import List, Optional
from collections import defaultdict

from dependencies import get_company_fk, EmpresaInfo, verificar_empresa
from main_api import execute_query_via_agent

router = APIRouter(
    prefix="/vendas",
    tags=["Dashboard de Vendas"]
)

@router.get("/summary")
async def get_sales_summary(
    start_date: date, 
    end_date: date, 
    empresa_info: EmpresaInfo = Depends(verificar_empresa),
    id_empresa: str = Depends(get_company_fk),
    selected_vendors: List[str] = Query(None, alias="selected_vendors[]")
):
    try:
        company_cnpj = empresa_info.company_id
        params = [start_date, end_date, id_empresa]
        # Cláusulas base (sem TIPOVENDA para ser reutilizável)
        base_where_clauses = ["p.STATUS = 'EFE'", "p.GERAFINANCEIRO = 'S'", "p.DATAEFE BETWEEN ? AND ?", "p.EMPRESA = ?"]
        join_vendor_str = ""

        if selected_vendors:
            join_vendor_str = "LEFT JOIN TVENVENDEDOR v ON p.VENDEDOR = v.CODIGO AND p.EMPRESA = v.EMPRESA"
            placeholders = ','.join(['?'] * len(selected_vendors))
            base_where_clauses.append(f"v.NOME IN ({placeholders})")
            params.extend(selected_vendors)
        
        # Cria as cláusulas WHERE específicas para vendas (NM) e devoluções (DV)
        main_where = " AND ".join(base_where_clauses + ["p.TIPOVENDA = 'NM'"])
        returns_where = " AND ".join(base_where_clauses + ["p.TIPOVENDA = 'DV'"])

        revenue_sql = f"SELECT SUM(CAST(p.VALORLIQUIDO AS DOUBLE PRECISION)) AS TOTAL, COUNT(p.CODIGO) AS QTD FROM TVENPEDIDO p {join_vendor_str} WHERE {main_where}"
        revenue_res = await execute_query_via_agent(company_cnpj, revenue_sql, params)
        total_revenue = float(revenue_res[0]['TOTAL'] or 0.0) if revenue_res else 0.0
        total_orders = int(revenue_res[0]['QTD'] or 0) if revenue_res else 0
        
        profit_sql = f"SELECT SUM(CAST(i.VLRLIQUIDO AS DOUBLE PRECISION) - (CAST(i.QTDE AS DOUBLE PRECISION) * CAST(i.CUSTOFINAL AS DOUBLE PRECISION))) AS TOTAL FROM TVENPEDIDO p {join_vendor_str} JOIN TVENPRODUTO i ON p.CODIGO = i.PEDIDO AND p.EMPRESA = i.EMPRESA WHERE {main_where}"
        profit_res = await execute_query_via_agent(company_cnpj, profit_sql, params)
        net_profit = float(profit_res[0]['TOTAL'] or 0.0) if profit_res else 0.0
        avg_ticket = total_revenue / total_orders if total_orders > 0 else 0.0

        # ### ADICIONADO AQUI: Cálculo de Devoluções ###
        returns_sql = f"SELECT SUM(CAST(p.VALORLIQUIDO AS DOUBLE PRECISION)) AS TOTAL FROM TVENPEDIDO p {join_vendor_str} WHERE {returns_where}"
        returns_res = await execute_query_via_agent(company_cnpj, returns_sql, params)
        total_returns = float(returns_res[0]['TOTAL'] or 0.0) if returns_res else 0.0

        peak_where = " AND ".join(base_where_clauses + ["p.TIPOVENDA = 'NM'", "p.HORAEFE IS NOT NULL"])
        peak_sql = f"SELECT EXTRACT(HOUR FROM p.HORAEFE) AS HORA, SUM(CAST(p.VALORLIQUIDO AS DOUBLE PRECISION)) AS TOTAL FROM TVENPEDIDO p {join_vendor_str} WHERE {peak_where} GROUP BY 1"
        peak_res = await execute_query_via_agent(company_cnpj, peak_sql, params)
        peak_hours_sales = [0.0] * 24
        for row in peak_res:
            hour, sales = int(row['HORA']), float(row['TOTAL'] or 0.0)
            if 0 <= hour < 24: peak_hours_sales[hour] = sales
        
        payment_map = {1: "Dinheiro", 4: "Cartão de Crédito", 5: "Crediário", 15: "Cartão de Débito"}
        pay_where = " AND ".join(base_where_clauses + ["r.TIPOREGISTRO = 1"])
        pay_sql = f"SELECT r.TIPOVALOR, SUM(CAST(r.VALOR AS DOUBLE PRECISION)) AS TOTAL FROM TVENREGISTROFORMA r JOIN TVENPEDIDO p ON r.IDENTIFICADOR = p.CODIGO {join_vendor_str} WHERE {pay_where} GROUP BY r.TIPOVALOR"
        pay_res = await execute_query_via_agent(company_cnpj, pay_sql, params)
        payment_methods_data = {}
        for row in pay_res:
            code, total = row['TIPOVALOR'], float(row['TOTAL'] or 0.0)
            if total > 0:
                label = payment_map.get(code, "Outros")
                payment_methods_data[label] = payment_methods_data.get(label, 0) + total

        top_prod_sql = f"SELECT FIRST 10 COALESCE(g.DESCRICAOREDUZIDA, g.DESCRICAO) AS NOME, SUM(CAST(i.VLRLIQUIDO AS DOUBLE PRECISION)) AS TOTAL FROM TVENPEDIDO p JOIN TVENPRODUTO i ON p.CODIGO = i.PEDIDO AND p.EMPRESA = i.EMPRESA JOIN TESTPRODUTOGERAL g ON i.PRODUTO = g.CODIGO {join_vendor_str} WHERE {main_where} GROUP BY 1 ORDER BY TOTAL DESC"
        top_prod_res = await execute_query_via_agent(company_cnpj, top_prod_sql, params)
        top_products_data = {"labels": [r['NOME'] for r in top_prod_res], "data": [float(r['TOTAL'] or 0.0) for r in top_prod_res]}
        
        top_profit_sql = f"SELECT FIRST 10 COALESCE(g.DESCRICAOREDUZIDA, g.DESCRICAO) AS NOME, SUM(CAST(i.VLRLIQUIDO AS DOUBLE PRECISION) - (CAST(i.QTDE AS DOUBLE PRECISION) * CAST(i.CUSTOFINAL AS DOUBLE PRECISION))) AS TOTAL FROM TVENPEDIDO p JOIN TVENPRODUTO i ON p.CODIGO = i.PEDIDO AND p.EMPRESA = i.EMPRESA JOIN TESTPRODUTOGERAL g ON i.PRODUTO = g.CODIGO {join_vendor_str} WHERE {main_where} GROUP BY 1 HAVING SUM(i.VLRLIQUIDO - (i.QTDE * i.CUSTOFINAL)) > 0 ORDER BY TOTAL DESC"
        top_profit_res = await execute_query_via_agent(company_cnpj, top_profit_sql, params)
        top_products_profit_data = {"labels": [r['NOME'] for r in top_profit_res], "data": [float(r['TOTAL'] or 0.0) for r in top_profit_res]}

        sales_group_sql = f"SELECT COALESCE(grp.DESCRICAO, 'Sem Grupo') AS NOME, SUM(CAST(p.VALORLIQUIDO AS DOUBLE PRECISION)) AS TOTAL FROM TVENPEDIDO p LEFT JOIN TVENPRODUTO i ON p.CODIGO = i.PEDIDO AND p.EMPRESA = i.EMPRESA JOIN TESTPRODUTO est ON i.PRODUTO = est.PRODUTO AND p.EMPRESA = est.EMPRESA LEFT JOIN TESTGRUPO grp ON est.GRUPO = grp.CODIGO {join_vendor_str} WHERE {main_where} GROUP BY 1 HAVING SUM(p.VALORLIQUIDO) > 0 ORDER BY TOTAL DESC"
        sales_group_res = await execute_query_via_agent(company_cnpj, sales_group_sql, params)
        sales_by_group_data = {"labels": [r['NOME'] for r in sales_group_res], "data": [float(r['TOTAL'] or 0.0) for r in sales_group_res]}

        return { 
            "summary": {
                "total_revenue": total_revenue, "total_orders": total_orders, 
                "avg_ticket": avg_ticket, "net_profit": net_profit,
                "total_returns": total_returns # ### VALOR ADICIONADO NA RESPOSTA ###
            }, 
            "peak_hours_data": {"sales": peak_hours_sales}, 
            "payment_methods_data": dict(sorted(payment_methods_data.items(), key=lambda item: item[1], reverse=True)), 
            "top_products_data": top_products_data, "top_products_profit_data": top_products_profit_data,
            "sales_by_group_data": sales_by_group_data
        }
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Erro ao buscar resumo de vendas: {e}")

# ... (o resto do arquivo dashboard_vendas.py continua igual)
@router.get("/annual-summary")
async def get_annual_summary(
    empresa_info: EmpresaInfo = Depends(verificar_empresa),
    id_empresa: str = Depends(get_company_fk),
    year1: Optional[int] = None, year2: Optional[int] = None
):
    try:
        current_year = year1 if year1 else datetime.now().year
        previous_year = year2 if year2 else current_year - 1

        sql = """
            SELECT EXTRACT(YEAR FROM p.DATAEFE) as ANO, EXTRACT(MONTH FROM p.DATAEFE) as MES,
                   SUM(CAST(i.VLRLIQUIDO AS DOUBLE PRECISION)) as FATURAMENTO, 
                   SUM(CAST(i.VLRLIQUIDO AS DOUBLE PRECISION) - (CAST(i.QTDE AS DOUBLE PRECISION) * CAST(i.CUSTOFINAL AS DOUBLE PRECISION))) as LUCRO
            FROM TVENPEDIDO p JOIN TVENPRODUTO i ON p.CODIGO = i.PEDIDO AND p.EMPRESA = i.EMPRESA
            WHERE p.STATUS = 'EFE' AND p.TIPOVENDA = 'NM' AND p.GERAFINANCEIRO = 'S' AND p.EMPRESA = ? AND EXTRACT(YEAR FROM p.DATAEFE) IN (?, ?)
            GROUP BY 1, 2
        """
        results_raw = await execute_query_via_agent(empresa_info.company_id, sql, [id_empresa, current_year, previous_year])
        
        results = { current_year: [{"revenue": 0, "margin": 0} for _ in range(12)], previous_year: [{"revenue": 0, "margin": 0} for _ in range(12)] }
        for row in results_raw:
            year, month, revenue, profit = int(row['ANO']), int(row['MES']), float(row['FATURAMENTO'] or 0.0), float(row['LUCRO'] or 0.0)
            if year in results:
                margin = (profit / revenue) * 100 if revenue > 0 else 0.0
                results[year][month-1] = {"revenue": revenue, "margin": round(margin, 2)}
        
        return { "year1": current_year, "year2": previous_year, "data_year1": results[current_year], "data_year2": results[previous_year] }
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Erro ao buscar resumo anual: {e}")

@router.get("/sales-margin-evolution")
async def get_sales_margin_evolution(
    start_date: date, end_date: date, 
    empresa_info: EmpresaInfo = Depends(verificar_empresa), id_empresa: str = Depends(get_company_fk),
    selected_vendors: List[str] = Query(None, alias="selected_vendors[]")
):
    try:
        where_clauses = ["p.STATUS = 'EFE'", "p.TIPOVENDA = 'NM'", "p.GERAFINANCEIRO = 'S'", "p.DATAEFE BETWEEN ? AND ?", "p.EMPRESA = ?"]
        params = [start_date, end_date, id_empresa]
        join_vendor_str = ""

        if selected_vendors:
            join_vendor_str = "LEFT JOIN TVENVENDEDOR v ON p.VENDEDOR = v.CODIGO AND p.EMPRESA = v.EMPRESA"
            placeholders = ','.join(['?'] * len(selected_vendors))
            where_clauses.append(f"v.NOME IN ({placeholders})")
            params.extend(selected_vendors)
        
        sql = f"""
            SELECT p.DATAEFE, 
                   SUM(CAST(i.VLRLIQUIDO AS DOUBLE PRECISION)) AS FATURAMENTO, 
                   SUM(CAST(i.VLRLIQUIDO AS DOUBLE PRECISION) - (CAST(i.QTDE AS DOUBLE PRECISION) * CAST(i.CUSTOFINAL AS DOUBLE PRECISION))) AS LUCRO
            FROM TVENPEDIDO p JOIN TVENPRODUTO i ON p.CODIGO = i.PEDIDO AND p.EMPRESA = i.EMPRESA {join_vendor_str}
            WHERE {" AND ".join(where_clauses)} GROUP BY 1 ORDER BY 1 ASC
        """
        results = await execute_query_via_agent(empresa_info.company_id, sql, params)
        
        evolution_data = {"dates": [], "margins": []}
        for row in results:
            revenue = float(row['FATURAMENTO'] or 0.0)
            profit = float(row['LUCRO'] or 0.0)
            margin = (profit / revenue) * 100 if revenue > 0 else 0.0
            evolution_data["dates"].append(datetime.strptime(row['DATAEFE'], '%Y-%m-%d').strftime('%Y-%m-%d'))
            evolution_data["margins"].append(round(margin, 2))
        return evolution_data
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Erro ao buscar evolução da margem: {e}")

@router.get("/ranking-vendedores")
async def get_vendor_ranking(
    start_date: date, end_date: date, 
    empresa_info: EmpresaInfo = Depends(verificar_empresa), id_empresa: str = Depends(get_company_fk),
    selected_vendors: List[str] = Query(None, alias="selected_vendors[]")
):
    try:
        params = [start_date, end_date, id_empresa]
        where_clauses = ["p.STATUS = 'EFE'", "p.TIPOVENDA = 'NM'", "p.GERAFINANCEIRO = 'S'", "p.DATAEFE BETWEEN ? AND ?", "p.EMPRESA = ?"]
        join_vendor_str = ""

        if selected_vendors:
            join_vendor_str = "LEFT JOIN TVENVENDEDOR v ON p.VENDEDOR = v.CODIGO AND p.EMPRESA = v.EMPRESA"
            placeholders = ','.join(['?'] * len(selected_vendors))
            where_clauses.append(f"v.NOME IN ({placeholders})")
            params.extend(selected_vendors)
        
        where_clause = " AND ".join(where_clauses)
        
        sql_revenue = f"SELECT p.VENDEDOR, SUM(CAST(p.VALORLIQUIDO AS DOUBLE PRECISION)) AS FT, COUNT(p.CODIGO) AS TP, SUM(CAST(p.VALORDESCONTO AS DOUBLE PRECISION)) AS TD, SUM(CAST(p.VALORBRUTO AS DOUBLE PRECISION)) AS FB FROM TVENPEDIDO p {join_vendor_str} WHERE {where_clause} GROUP BY p.VENDEDOR"
        revenue_results = await execute_query_via_agent(empresa_info.company_id, sql_revenue, params)
        
        ranking_data = defaultdict(lambda: defaultdict(float))
        for row in revenue_results:
            ranking_data[row['VENDEDOR']]['faturamento_total'] = float(row['FT'] or 0.0)
            ranking_data[row['VENDEDOR']]['total_pedidos'] = int(row['TP'] or 0)
            ranking_data[row['VENDEDOR']]['total_desconto'] = float(row['TD'] or 0.0)
            ranking_data[row['VENDEDOR']]['faturamento_bruto'] = float(row['FB'] or 0.0)

        sql_profit = f"SELECT p.VENDEDOR, SUM(CAST(i.VLRLIQUIDO AS DOUBLE PRECISION) - (CAST(i.QTDE AS DOUBLE PRECISION) * CAST(i.CUSTOFINAL AS DOUBLE PRECISION))) AS LG, SUM(CAST(i.QTDE AS DOUBLE PRECISION)) AS TPROD FROM TVENPEDIDO p JOIN TVENPRODUTO i ON p.CODIGO = i.PEDIDO AND p.EMPRESA = i.EMPRESA {join_vendor_str} WHERE {where_clause} GROUP BY p.VENDEDOR"
        profit_results = await execute_query_via_agent(empresa_info.company_id, sql_profit, params)

        for row in profit_results:
            ranking_data[row['VENDEDOR']]['lucro_gerado'] = float(row['LG'] or 0.0)
            ranking_data[row['VENDEDOR']]['total_produtos'] = float(row['TPROD'] or 0.0)
            
        vendor_ids = [k for k in ranking_data.keys() if k is not None]
        vendor_names = {None: "NÃO IDENTIFICADO"}
        if vendor_ids:
            placeholders = ','.join(['?'] * len(vendor_ids))
            name_results = await execute_query_via_agent(empresa_info.company_id, f"SELECT CODIGO, NOME FROM TVENVENDEDOR WHERE EMPRESA = ? AND CODIGO IN ({placeholders})", [id_empresa] + vendor_ids)
            for row in name_results:
                vendor_names[row['CODIGO']] = row['NOME'].strip()

        ranking = []
        for v_id, data in ranking_data.items():
            ranking.append({
                "vendedor": vendor_names.get(v_id, 'NÃO IDENTIFICADO'), "faturamento_total": data['faturamento_total'], "lucro_gerado": data['lucro_gerado'],
                "ticket_medio": data['faturamento_total'] / data['total_pedidos'] if data['total_pedidos'] > 0 else 0.0,
                "produtos_por_pedido": data['total_produtos'] / data['total_pedidos'] if data['total_pedidos'] > 0 else 0.0,
                "desconto_medio_percent": (data['total_desconto'] / data['faturamento_bruto'] * 100) if data['faturamento_bruto'] > 0 else 0.0
            })
        
        return sorted(ranking, key=lambda x: x['faturamento_total'], reverse=True)
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Erro ao gerar ranking de vendedores: {e}")

@router.get("/top-products-vendedor")
async def get_top_products_by_vendor(start_date: date, end_date: date, vendedor_nome: str, empresa_info: EmpresaInfo = Depends(verificar_empresa), id_empresa: str = Depends(get_company_fk)):
    sql = "SELECT FIRST 10 COALESCE(g.DESCRICAOREDUZIDA, g.DESCRICAO) AS NOME, SUM(CAST(i.VLRLIQUIDO AS DOUBLE PRECISION)) as TOTAL FROM TVENPEDIDO p JOIN TVENPRODUTO i ON p.CODIGO = i.PEDIDO AND p.EMPRESA = i.EMPRESA JOIN TESTPRODUTOGERAL g ON i.PRODUTO = g.CODIGO JOIN TVENVENDEDOR v ON p.VENDEDOR = v.CODIGO AND p.EMPRESA = v.EMPRESA WHERE p.STATUS = 'EFE' AND p.TIPOVENDA = 'NM' AND p.GERAFINANCEIRO = 'S' AND p.DATAEFE BETWEEN ? AND ? AND v.NOME = ? AND p.EMPRESA = ? GROUP BY 1 ORDER BY TOTAL DESC"
    results = await execute_query_via_agent(empresa_info.company_id, sql, [start_date, end_date, vendedor_nome, id_empresa])
    return {"labels": [r['NOME'] for r in results], "data": [float(r['TOTAL']) for r in results]}

@router.get("/top-customers-vendedor")
async def get_top_customers_by_vendor(start_date: date, end_date: date, vendedor_nome: str, empresa_info: EmpresaInfo = Depends(verificar_empresa), id_empresa: str = Depends(get_company_fk)):
    sql = "SELECT FIRST 5 p.CLIENTENOME, SUM(CAST(p.VALORLIQUIDO AS DOUBLE PRECISION)) as TOTAL FROM TVENPEDIDO p JOIN TVENVENDEDOR v ON p.VENDEDOR = v.CODIGO AND p.EMPRESA = v.EMPRESA WHERE p.STATUS = 'EFE' AND p.TIPOVENDA = 'NM' AND p.GERAFINANCEIRO = 'S' AND p.DATAEFE BETWEEN ? AND ? AND v.NOME = ? AND p.EMPRESA = ? AND p.CLIENTENOME IS NOT NULL AND p.CLIENTENOME <> '' GROUP BY 1 HAVING SUM(p.VALORLIQUIDO) > 0 ORDER BY TOTAL DESC"
    results = await execute_query_via_agent(empresa_info.company_id, sql, [start_date, end_date, vendedor_nome, id_empresa])
    return [{"cliente": r['CLIENTENOME'], "valor": float(r['TOTAL'])} for r in results]

@router.get("/sales-evolution-vendedor")
async def get_sales_evolution_by_vendor(start_date: date, end_date: date, vendedor_nome: str, empresa_info: EmpresaInfo = Depends(verificar_empresa), id_empresa: str = Depends(get_company_fk)):
    sql = "SELECT p.DATAEFE, SUM(CAST(p.VALORLIQUIDO AS DOUBLE PRECISION)) AS TOTAL FROM TVENPEDIDO p JOIN TVENVENDEDOR v ON p.VENDEDOR = v.CODIGO AND p.EMPRESA = v.EMPRESA WHERE p.STATUS = 'EFE' AND p.TIPOVENDA = 'NM' AND p.GERAFINANCEIRO = 'S' AND p.DATAEFE BETWEEN ? AND ? AND v.NOME = ? AND p.EMPRESA = ? GROUP BY 1 ORDER BY 1 ASC"
    results = await execute_query_via_agent(empresa_info.company_id, sql, [start_date, end_date, vendedor_nome, id_empresa])
    return {"dates": [r['DATAEFE'] for r in results], "sales": [float(r['TOTAL']) for r in results]}
        
@router.get("/vendedores")
async def get_all_vendors(empresa_info: EmpresaInfo = Depends(verificar_empresa), id_empresa: str = Depends(get_company_fk)):
    sql = "SELECT NOME FROM TVENVENDEDOR WHERE ATIVO = 'S' AND EMPRESA = ? ORDER BY NOME"
    results = await execute_query_via_agent(empresa_info.company_id, sql, [id_empresa])
    return [row['NOME'].strip() for row in results]