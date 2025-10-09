# /routers/dashboard_estoque.py
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timedelta, date
from dateutil.relativedelta import relativedelta

from dependencies import get_company_fk, EmpresaInfo, verificar_empresa
from main_api import execute_query_via_agent

router = APIRouter(
    prefix="/estoque",
    tags=["Dashboard de Estoque"]
)

async def get_historical_stock_value(company_cnpj: str, id_empresa: str, target_date: date):
    target_datetime_str = datetime.combine(target_date, datetime.max.time()).strftime('%Y-%m-%d %H:%M:%S')
    sql = """
        SELECT
            (SELECT SUM(CAST(p.CUSTOFINAL AS DOUBLE PRECISION) * CAST(p.ESTDISPONIVEL AS DOUBLE PRECISION)) FROM TESTPRODUTO p WHERE p.ATIVO = 'S' AND p.ESTDISPONIVEL > 0 AND p.EMPRESA = ?) -
            COALESCE((SELECT SUM(CAST(ext.VALOR AS DOUBLE PRECISION)) FROM TESTEXTRATO ext WHERE ext.ENTRADASAIDA = 'E' AND ext.DATAHORA > ? AND ext.EMPRESA = ?), 0) +
            COALESCE((SELECT SUM(CAST(ext.VALOR AS DOUBLE PRECISION)) FROM TESTEXTRATO ext WHERE ext.ENTRADASAIDA = 'S' AND ext.DATAHORA > ? AND ext.EMPRESA = ?), 0)
        AS TOTAL FROM RDB$DATABASE
    """
    params = [id_empresa, target_datetime_str, id_empresa, target_datetime_str, id_empresa]
    result = await execute_query_via_agent(company_cnpj, sql, params)
    return float(result[0]['TOTAL'] or 0.0) if result else 0.0

@router.get("/kpis")
async def get_stock_kpis(empresa_info: EmpresaInfo = Depends(verificar_empresa), id_empresa: str = Depends(get_company_fk), end_date: date = None):
    try:
        target_date = end_date if end_date else date.today()
        total_value = await get_historical_stock_value(empresa_info.company_id, id_empresa, target_date)
        return {"total_value": total_value}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Erro ao buscar KPIs de estoque: {e}")

@router.get("/top-products-by-value")
async def get_top_products_by_value(empresa_info: EmpresaInfo = Depends(verificar_empresa), id_empresa: str = Depends(get_company_fk)):
    try:
        sql = """
            SELECT FIRST 10 g.DESCRICAO, (CAST(p.CUSTOFINAL AS DOUBLE PRECISION) * CAST(p.ESTDISPONIVEL AS DOUBLE PRECISION)) AS VALOR_TOTAL
            FROM TESTPRODUTO p JOIN TESTPRODUTOGERAL g ON p.PRODUTO = g.CODIGO
            WHERE p.ATIVO = 'S' AND p.ESTDISPONIVEL > 0 AND p.CUSTOFINAL > 0 AND p.EMPRESA = ?
            ORDER BY VALOR_TOTAL DESC
        """
        results = await execute_query_via_agent(empresa_info.company_id, sql, [id_empresa])
        labels = [row['DESCRICAO'] for row in results]
        values = [float(row['VALOR_TOTAL'] or 0.0) for row in results]
        return {"labels": labels, "values": values}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Erro ao buscar top produtos: {e}")

@router.get("/value-history")
async def get_stock_value_history(empresa_info: EmpresaInfo = Depends(verificar_empresa), id_empresa: str = Depends(get_company_fk), year: int = None):
    try:
        target_year = year if year else date.today().year
        labels, values = [], []
        for month in range(1, 13):
            last_day_of_month = datetime(target_year, month, 1) + relativedelta(months=1) - timedelta(days=1)
            labels.append(last_day_of_month.strftime("%b/%y"))
            historical_value = await get_historical_stock_value(empresa_info.company_id, id_empresa, last_day_of_month.date())
            values.append(historical_value)
        return {"labels": labels, "values": values}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Erro ao gerar histórico de estoque: {e}")

@router.get("/abc-analysis")
async def get_abc_analysis(empresa_info: EmpresaInfo = Depends(verificar_empresa), id_empresa: str = Depends(get_company_fk)):
    try:
        sql = "SELECT (CAST(p.CUSTOFINAL AS DOUBLE PRECISION) * CAST(p.ESTDISPONIVEL AS DOUBLE PRECISION)) as VALOR_TOTAL FROM TESTPRODUTO p WHERE p.ATIVO = 'S' AND p.ESTDISPONIVEL > 0 AND p.CUSTOFINAL > 0 AND p.EMPRESA = ? ORDER BY VALOR_TOTAL DESC"
        results = await execute_query_via_agent(empresa_info.company_id, sql, [id_empresa])
        products = [float(row['VALOR_TOTAL']) for row in results]
        
        if not products: return {"curve_a_count": 0, "curve_b_count": 0, "curve_c_count": 0, "curve_a_percent": 0, "curve_b_percent": 0, "curve_c_percent": 0}
        total_stock_value = sum(products)
        curve_a_count, curve_b_count, curve_c_count = 0, 0, 0
        cumulative_value = 0.0
        for value in products:
            cumulative_value += value
            percentage = (cumulative_value / total_stock_value) * 100
            if percentage <= 80: curve_a_count += 1
            elif percentage <= 95: curve_b_count += 1
            else: curve_c_count += 1
        total_items = len(products)
        return {"curve_a_count": curve_a_count, "curve_b_count": curve_b_count, "curve_c_count": curve_c_count, "curve_a_percent": round((curve_a_count / total_items) * 100, 1), "curve_b_percent": round((curve_b_count / total_items) * 100, 1), "curve_c_percent": round((curve_c_count / total_items) * 100, 1)}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Erro na análise ABC: {e}")

@router.get("/low-stock-products")
async def get_low_stock_products(empresa_info: EmpresaInfo = Depends(verificar_empresa), id_empresa: str = Depends(get_company_fk)):
    try:
        sql = "SELECT g.DESCRICAO, p.ESTDISPONIVEL, p.ESTOQUEMINIMO FROM TESTPRODUTO p JOIN TESTPRODUTOGERAL g ON p.PRODUTO = g.CODIGO WHERE p.ATIVO = 'S' AND p.ESTOQUEMINIMO > 0 AND p.ESTDISPONIVEL < p.ESTOQUEMINIMO AND p.EMPRESA = ? ORDER BY g.DESCRICAO"
        results = await execute_query_via_agent(empresa_info.company_id, sql, [id_empresa])
        return [{"product_name": r['DESCRICAO'], "current_stock": float(r['ESTDISPONIVEL']), "min_stock": float(r['ESTOQUEMINIMO'])} for r in results]
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Erro ao buscar produtos com estoque baixo: {e}")

@router.get("/idle-products")
async def get_idle_products(empresa_info: EmpresaInfo = Depends(verificar_empresa), id_empresa: str = Depends(get_company_fk), days: int = 90):
    try:
        date_threshold = datetime.now() - timedelta(days=days)
        sql = "SELECT g.DESCRICAO, p.ESTDISPONIVEL FROM TESTPRODUTO p JOIN TESTPRODUTOGERAL g ON p.PRODUTO = g.CODIGO WHERE p.ATIVO = 'S' AND p.ESTDISPONIVEL > 0 AND p.EMPRESA = ? AND NOT EXISTS (SELECT 1 FROM TESTEXTRATO e WHERE e.PRODUTO = p.PRODUTO AND e.DATAHORA >= ? AND e.EMPRESA = ?) ORDER BY g.DESCRICAO"
        results = await execute_query_via_agent(empresa_info.company_id, sql, [id_empresa, date_threshold, id_empresa])
        return [{"product_name": r['DESCRICAO'], "current_stock": float(r['ESTDISPONIVEL'])} for r in results]
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Erro ao buscar produtos parados: {e}")