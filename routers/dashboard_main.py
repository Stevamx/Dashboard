# /routers/dashboard_main.py
from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timedelta, date
from dateutil.relativedelta import relativedelta
import calendar
from typing import List, Optional
import asyncio

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
        hoje = date.today()
        ontem = hoje - timedelta(days=1)
        mes_atual = datetime.now()
        mes_passado = mes_atual - relativedelta(months=1)

        # Consulta principal para a maioria dos KPIs (Vendas, Pedidos, Devoluções, Receita Mensal)
        sql_principal = """
            SELECT
                SUM(CASE WHEN p.DATAEFE = ? AND p.TIPOVENDA = 'NM' THEN p.VALORLIQUIDO ELSE 0 END) as VENDAS_HOJE,
                SUM(CASE WHEN p.DATAEFE = ? AND p.TIPOVENDA = 'NM' THEN p.VALORLIQUIDO ELSE 0 END) as VENDAS_ONTEM,
                COUNT(CASE WHEN p.DATAEFE = ? AND p.TIPOVENDA = 'NM' THEN p.CODIGO END) as PEDIDOS_HOJE,
                COUNT(CASE WHEN p.DATAEFE = ? AND p.TIPOVENDA = 'NM' THEN p.CODIGO END) as PEDIDOS_ONTEM,
                SUM(CASE WHEN p.DATAEFE = ? AND p.TIPOVENDA = 'DV' THEN p.VALORLIQUIDO ELSE 0 END) as DEVOLUCOES_HOJE,
                SUM(CASE WHEN p.DATAEFE = ? AND p.TIPOVENDA = 'DV' THEN p.VALORLIQUIDO ELSE 0 END) as DEVOLUCOES_ONTEM,
                SUM(CASE WHEN EXTRACT(YEAR FROM p.DATAEFE) = ? AND EXTRACT(MONTH FROM p.DATAEFE) = ? AND p.TIPOVENDA = 'NM' THEN p.VALORLIQUIDO ELSE 0 END) as RECEITA_MES_ATUAL,
                SUM(CASE WHEN EXTRACT(YEAR FROM p.DATAEFE) = ? AND EXTRACT(MONTH FROM p.DATAEFE) = ? AND p.TIPOVENDA = 'NM' THEN p.VALORLIQUIDO ELSE 0 END) as RECEITA_MES_PASSADO
            FROM
                TVENPEDIDO p
            WHERE
                p.EMPRESA = ? AND p.STATUS = 'EFE'
                AND (
                    p.DATAEFE IN (?, ?) OR
                    (EXTRACT(YEAR FROM p.DATAEFE) = ? AND EXTRACT(MONTH FROM p.DATAEFE) = ?) OR
                    (EXTRACT(YEAR FROM p.DATAEFE) = ? AND EXTRACT(MONTH FROM p.DATAEFE) = ?)
                )
        """
        params_principal = [
            hoje, ontem, hoje, ontem, hoje, ontem,
            mes_atual.year, mes_atual.month, mes_passado.year, mes_passado.month,
            id_empresa,
            hoje, ontem,
            mes_atual.year, mes_atual.month,
            mes_passado.year, mes_passado.month
        ]

        # Consulta separada para o Lucro, que requer um JOIN
        sql_lucro = """
            SELECT
                SUM(CASE 
                    WHEN p.DATAEFE = ? THEN
                        CASE 
                            WHEN p.TIPOVENDA = 'NM' THEN (CAST(i.VLRLIQUIDO AS DOUBLE PRECISION) - (CAST(i.QTDE AS DOUBLE PRECISION) * CAST(i.CUSTOFINAL AS DOUBLE PRECISION)))
                            WHEN p.TIPOVENDA = 'DV' THEN -(CAST(i.VLRLIQUIDO AS DOUBLE PRECISION) - (CAST(i.QTDE AS DOUBLE PRECISION) * CAST(i.CUSTOFINAL AS DOUBLE PRECISION)))
                            ELSE 0
                        END
                    ELSE 0
                END) as LUCRO_HOJE,
                SUM(CASE 
                    WHEN p.DATAEFE = ? THEN
                        CASE 
                            WHEN p.TIPOVENDA = 'NM' THEN (CAST(i.VLRLIQUIDO AS DOUBLE PRECISION) - (CAST(i.QTDE AS DOUBLE PRECISION) * CAST(i.CUSTOFINAL AS DOUBLE PRECISION)))
                            WHEN p.TIPOVENDA = 'DV' THEN -(CAST(i.VLRLIQUIDO AS DOUBLE PRECISION) - (CAST(i.QTDE AS DOUBLE PRECISION) * CAST(i.CUSTOFINAL AS DOUBLE PRECISION)))
                            ELSE 0
                        END
                    ELSE 0
                END) as LUCRO_ONTEM
            FROM TVENPEDIDO p
            JOIN TVENPRODUTO i ON p.CODIGO = i.PEDIDO AND p.EMPRESA = i.EMPRESA
            WHERE p.DATAEFE IN (?, ?) AND p.STATUS = 'EFE' AND p.TIPOVENDA IN ('NM', 'DV') AND p.EMPRESA = ?
        """
        params_lucro = [hoje, ontem, hoje, ontem, id_empresa]
        
        # Executa as duas consultas otimizadas em paralelo
        kpi_res_task = execute_query_via_agent(company_cnpj, sql_principal, params_principal)
        lucro_res_task = execute_query_via_agent(company_cnpj, sql_lucro, params_lucro)
        
        kpi_res, lucro_res = await asyncio.gather(kpi_res_task, lucro_res_task)

        # Verifica se as consultas retornaram resultados antes de acessá-los
        if not kpi_res or not lucro_res:
            raise HTTPException(status_code=500, detail="A consulta de KPIs não retornou dados.")

        data = {
            "vendas_hoje": float(kpi_res[0].get('VENDAS_HOJE') or 0.0),
            "vendas_ontem": float(kpi_res[0].get('VENDAS_ONTEM') or 0.0),
            "pedidos_hoje": int(kpi_res[0].get('PEDIDOS_HOJE') or 0),
            "pedidos_ontem": int(kpi_res[0].get('PEDIDOS_ONTEM') or 0),
            "receita_mensal_atual": float(kpi_res[0].get('RECEITA_MES_ATUAL') or 0.0),
            "receita_mensal_passado": float(kpi_res[0].get('RECEITA_MES_PASSADO') or 0.0),
            "devolucoes_hoje": float(kpi_res[0].get('DEVOLUCOES_HOJE') or 0.0),
            "devolucoes_ontem": float(kpi_res[0].get('DEVOLUCOES_ONTEM') or 0.0),
            "lucro_hoje": float(lucro_res[0].get('LUCRO_HOJE') or 0.0),
            "lucro_ontem": float(lucro_res[0].get('LUCRO_ONTEM') or 0.0)
        }

        return data
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Erro ao buscar KPIs do dashboard: {e}")

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