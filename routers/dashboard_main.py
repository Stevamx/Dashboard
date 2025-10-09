# /routers/dashboard_main.py
from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timedelta, date
from dateutil.relativedelta import relativedelta
import calendar
from typing import List, Optional

from dependencies import get_company_fk, EmpresaInfo, verificar_empresa
from main_api import execute_query_via_agent
from routers.metas_panel import criar_tabela_metas_se_nao_existir_async

router = APIRouter(
    prefix="/dashboard",
    tags=["Dashboard Principal"]
)

@router.get("/validate-connection")
def validate_dashboard_connection(empresa_info: EmpresaInfo = Depends(verificar_empresa)):
    return {"status": "ok", "message": "A conexão com a empresa foi validada com sucesso."}

@router.get("/kpis")
async def get_dashboard_kpis(empresa_info: EmpresaInfo = Depends(verificar_empresa), id_empresa: str = Depends(get_company_fk)):
    try:
        company_cnpj = empresa_info.company_id
        hoje, ontem = date.today(), date.today() - timedelta(days=1)
        mes_atual, mes_passado = datetime.now(), datetime.now() - relativedelta(months=1)

        data = {
            "vendas_hoje": 0.0, "vendas_ontem": 0.0,
            "pedidos_hoje": 0, "pedidos_ontem": 0,
            "receita_mensal_atual": 0.0, "receita_mensal_passado": 0.0,
            "lucro_hoje": 0.0, "lucro_ontem": 0.0,
            "devolucoes_hoje": 0.0, "devolucoes_ontem": 0.0
        }

        base_query = "FROM TVENPEDIDO WHERE DATAEFE = ? AND STATUS = 'EFE' AND TIPOVENDA = ? AND EMPRESA = ?"
        
        vendas_hoje_res = await execute_query_via_agent(company_cnpj, f"SELECT SUM(CAST(VALORLIQUIDO AS DOUBLE PRECISION)), COUNT(*) {base_query}", [hoje, 'NM', id_empresa])
        if vendas_hoje_res:
            data['vendas_hoje'] = float(vendas_hoje_res[0]['SUM'] or 0.0)
            data['pedidos_hoje'] = int(vendas_hoje_res[0]['COUNT'] or 0)

        vendas_ontem_res = await execute_query_via_agent(company_cnpj, f"SELECT SUM(CAST(VALORLIQUIDO AS DOUBLE PRECISION)), COUNT(*) {base_query}", [ontem, 'NM', id_empresa])
        if vendas_ontem_res:
            data['vendas_ontem'] = float(vendas_ontem_res[0]['SUM'] or 0.0)
            data['pedidos_ontem'] = int(vendas_ontem_res[0]['COUNT'] or 0)

        sql_receita_mes = "SELECT SUM(CAST(VALORLIQUIDO AS DOUBLE PRECISION)) FROM TVENPEDIDO WHERE EXTRACT(YEAR FROM DATAEFE) = ? AND EXTRACT(MONTH FROM DATAEFE) = ? AND STATUS = 'EFE' AND TIPOVENDA = 'NM' AND EMPRESA = ?"
        receita_atual_res = await execute_query_via_agent(company_cnpj, sql_receita_mes, [mes_atual.year, mes_atual.month, id_empresa])
        if receita_atual_res: data['receita_mensal_atual'] = float(receita_atual_res[0]['SUM'] or 0.0)
        
        receita_passado_res = await execute_query_via_agent(company_cnpj, sql_receita_mes, [mes_passado.year, mes_passado.month, id_empresa])
        if receita_passado_res: data['receita_mensal_passado'] = float(receita_passado_res[0]['SUM'] or 0.0)

        devolucoes_hoje_res = await execute_query_via_agent(company_cnpj, f"SELECT SUM(CAST(VALORLIQUIDO AS DOUBLE PRECISION)) {base_query}", [hoje, 'DV', id_empresa])
        if devolucoes_hoje_res: data['devolucoes_hoje'] = float(devolucoes_hoje_res[0]['SUM'] or 0.0)
        
        devolucoes_ontem_res = await execute_query_via_agent(company_cnpj, f"SELECT SUM(CAST(VALORLIQUIDO AS DOUBLE PRECISION)) {base_query}", [ontem, 'DV', id_empresa])
        if devolucoes_ontem_res: data['devolucoes_ontem'] = float(devolucoes_ontem_res[0]['SUM'] or 0.0)

        sql_lucro_dia = """
            SELECT SUM(CASE 
                         WHEN p.TIPOVENDA = 'NM' THEN (CAST(i.VLRLIQUIDO AS DOUBLE PRECISION) - (CAST(i.QTDE AS DOUBLE PRECISION) * CAST(i.CUSTOFINAL AS DOUBLE PRECISION))) 
                         WHEN p.TIPOVENDA = 'DV' THEN -(CAST(i.VLRLIQUIDO AS DOUBLE PRECISION) - (CAST(i.QTDE AS DOUBLE PRECISION) * CAST(i.CUSTOFINAL AS DOUBLE PRECISION))) 
                         ELSE 0 
                       END)
            FROM TVENPEDIDO p JOIN TVENPRODUTO i ON p.CODIGO = i.PEDIDO AND p.EMPRESA = i.EMPRESA
            WHERE p.DATAEFE = ? AND p.STATUS = 'EFE' AND p.TIPOVENDA IN ('NM', 'DV') AND p.EMPRESA = ?
        """
        lucro_hoje_res = await execute_query_via_agent(company_cnpj, sql_lucro_dia, [hoje, id_empresa])
        if lucro_hoje_res: data['lucro_hoje'] = float(lucro_hoje_res[0]['SUM'] or 0.0)
        
        lucro_ontem_res = await execute_query_via_agent(company_cnpj, sql_lucro_dia, [ontem, id_empresa])
        if lucro_ontem_res: data['lucro_ontem'] = float(lucro_ontem_res[0]['SUM'] or 0.0)
        
        return data
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/daily-sales")
async def get_daily_sales(days: int = 7, empresa_info: EmpresaInfo = Depends(verificar_empresa), id_empresa: str = Depends(get_company_fk)):
    try:
        today = date.today()
        sales_by_day = {today - timedelta(days=i): 0.0 for i in range(days)}
        start_date = today - timedelta(days=days - 1)
        sql = "SELECT DATAEFE, SUM(CAST(VALORLIQUIDO AS DOUBLE PRECISION)) AS TOTAL FROM TVENPEDIDO WHERE STATUS = 'EFE' AND TIPOVENDA = 'NM' AND DATAEFE >= ? AND EMPRESA = ? GROUP BY DATAEFE"
        
        results = await execute_query_via_agent(empresa_info.company_id, sql, [start_date, id_empresa])

        for row in results:
            sale_date = datetime.strptime(row['DATAEFE'], '%Y-%m-%d').date()
            if sale_date in sales_by_day:
                sales_by_day[sale_date] = float(row['TOTAL'] or 0.0)
        
        sorted_dates = sorted(sales_by_day.keys())
        return {"dates": [d.strftime('%Y-%m-%d') for d in sorted_dates], "sales": [sales_by_day[d] for d in sorted_dates]}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/monthly-performance")
async def get_monthly_performance(empresa_info: EmpresaInfo = Depends(verificar_empresa), id_empresa: str = Depends(get_company_fk)):
    try:
        today = date.today()
        current_month_start = today.replace(day=1)
        prev_month_start = (current_month_start - timedelta(days=1)).replace(day=1)
        days_in_current_month = calendar.monthrange(today.year, today.month)[1]
        
        sql = "SELECT EXTRACT(DAY FROM DATAEFE) AS DIA, SUM(CAST(VALORLIQUIDO AS DOUBLE PRECISION)) AS TOTAL FROM TVENPEDIDO WHERE STATUS = 'EFE' AND TIPOVENDA = 'NM' AND DATAEFE >= ? AND DATAEFE < ? AND EMPRESA = ? GROUP BY 1"
        
        current_month_res = await execute_query_via_agent(empresa_info.company_id, sql, [current_month_start, current_month_start + relativedelta(months=1), id_empresa])
        current_month_data = {row['DIA']: (row['TOTAL'] or 0.0) for row in current_month_res}

        prev_month_res = await execute_query_via_agent(empresa_info.company_id, sql, [prev_month_start, prev_month_start + relativedelta(months=1), id_empresa])
        prev_month_data = {row['DIA']: (row['TOTAL'] or 0.0) for row in prev_month_res}
        
        current_month_cumulative = [sum(current_month_data.get(d, 0.0) for d in range(1, day + 1)) for day in range(1, days_in_current_month + 1)]
        prev_month_cumulative = [sum(prev_month_data.get(d, 0.0) for d in range(1, day + 1)) for day in range(1, days_in_current_month + 1)]

        return {"labels": list(range(1, days_in_current_month + 1)), "current_month_sales": current_month_cumulative, "previous_month_sales": prev_month_cumulative}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/top-vendors-month")
async def get_top_vendors_month(
    empresa_info: EmpresaInfo = Depends(verificar_empresa),
    id_empresa: str = Depends(get_company_fk),
    selected_vendors: Optional[List[str]] = Query(None, alias="selected_vendors[]")
):
    try:
        today = datetime.now()
        params = [today.year, today.month, id_empresa]
        
        query_body = """
            COALESCE(v.NOME, 'NÃO IDENTIFICADO') AS VENDEDOR, SUM(CAST(p.VALORLIQUIDO AS DOUBLE PRECISION)) AS TOTAL
            FROM TVENPEDIDO p 
            LEFT JOIN TVENVENDEDOR v ON p.VENDEDOR = v.CODIGO AND p.EMPRESA = v.EMPRESA
            WHERE p.STATUS = 'EFE' AND p.TIPOVENDA = 'NM' AND p.GERAFINANCEIRO = 'S'
              AND EXTRACT(YEAR FROM p.DATAEFE) = ? AND EXTRACT(MONTH FROM p.DATAEFE) = ? AND p.EMPRESA = ?
        """
        if selected_vendors:
            placeholders = ', '.join(['?'] * len(selected_vendors))
            filter_sql = f" AND v.NOME IN ({placeholders})"
            params.extend(selected_vendors)
            final_sql = "SELECT " + query_body + filter_sql + " GROUP BY 1 ORDER BY TOTAL DESC"
        else:
            final_sql = "SELECT FIRST 5 " + query_body + " GROUP BY 1 ORDER BY TOTAL DESC"
        
        results = await execute_query_via_agent(empresa_info.company_id, final_sql, params)
        ranking = [{"vendedor": row['VENDEDOR'].strip(), "total": float(row['TOTAL'] or 0.0)} for row in results]
        return ranking
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Erro ao gerar ranking de vendedores do mês: {e}")

@router.get("/metas-progress")
async def get_metas_progress(empresa_info: EmpresaInfo = Depends(verificar_empresa), id_empresa: str = Depends(get_company_fk)):
    try:
        await criar_tabela_metas_se_nao_existir_async(empresa_info.company_id, id_empresa)
        today = datetime.now()
        
        sql_metas = "SELECT INDICADOR, VALOR FROM DBMETAS WHERE ID_EMPRESA = ? AND ANO = ? AND MES = ?"
        metas_definidas = await execute_query_via_agent(empresa_info.company_id, sql_metas, [id_empresa, today.year, today.month])
        
        progress_data = []
        for meta in metas_definidas:
            indicador = meta['INDICADOR']
            valor_meta = float(meta['VALOR'] or 0.0)
            
            if indicador == "FATURAMENTO_MENSAL":
                sql_progresso = "SELECT SUM(CAST(VALORLIQUIDO AS DOUBLE PRECISION)) AS TOTAL FROM TVENPEDIDO WHERE STATUS = 'EFE' AND TIPOVENDA = 'NM' AND EXTRACT(YEAR FROM DATAEFE) = ? AND EXTRACT(MONTH FROM DATAEFE) = ? AND EMPRESA = ?"
                progresso_res = await execute_query_via_agent(empresa_info.company_id, sql_progresso, [today.year, today.month, id_empresa])
                
                progresso_atual = float(progresso_res[0]['TOTAL'] or 0.0) if progresso_res else 0.0
                progress_data.append({
                    "titulo": "Meta de Faturamento", "valor_atual": progresso_atual, "valor_meta": valor_meta,
                    "percentual": (progresso_atual / valor_meta) * 100 if valor_meta > 0 else 0
                })
        return progress_data
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Erro ao buscar progresso das metas: {e}")