# routers/proactive_alerts.py
from fastapi import APIRouter, Depends, HTTPException
from datetime import date, timedelta, datetime
from dependencies import verificar_empresa, get_company_fk, EmpresaInfo
from main_api import execute_query_via_agent
import calendar

router = APIRouter(
    prefix="/alerts",
    tags=["Alertas Proativos"]
)

# Mapeia o dia da semana do Python (0=Segunda) para o do Firebird (1=Domingo)
def python_weekday_to_firebird(d):
    return (d.weekday() + 2) % 7 or 7


@router.get("/proactive")
async def get_proactive_alerts(empresa_info: EmpresaInfo = Depends(verificar_empresa), id_empresa: str = Depends(get_company_fk)):
    """
    Analisa os KPIs em tempo real e compara com médias históricas para gerar alertas proativos.
    """
    notifications = []
    today = date.today()

    try:
        # --- 1. ALERTA DE QUEDA NAS VENDAS DIÁRIAS ---
        sales_sql = """
            SELECT
                SUM(CASE WHEN p.DATAEFE = ? THEN CAST(p.VALORLIQUIDO AS DOUBLE PRECISION) ELSE 0 END) as VENDAS_HOJE,
                SUM(CASE WHEN EXTRACT(WEEKDAY FROM p.DATAEFE) = ? AND p.DATAEFE < ? AND p.DATAEFE >= ? THEN CAST(p.VALORLIQUIDO AS DOUBLE PRECISION) ELSE 0 END) as VENDAS_HISTORICO
            FROM TVENPEDIDO p
            WHERE p.EMPRESA = ? AND p.STATUS = 'EFE' AND p.TIPOVENDA = 'NM'
        """
        firebird_weekday = python_weekday_to_firebird(today)
        history_start_date_sales = today - timedelta(weeks=4)
        sales_res = await execute_query_via_agent(
            empresa_info.company_id, 
            sales_sql, 
            [today, firebird_weekday, today, history_start_date_sales, id_empresa]
        )
        if sales_res and sales_res[0]:
            sales_data = sales_res[0]
            vendas_hoje = float(sales_data.get('VENDAS_HOJE') or 0.0)
            vendas_historico_total = float(sales_data.get('VENDAS_HISTORICO') or 0.0)
            media_historica_vendas = vendas_historico_total / 4 if vendas_historico_total > 0 else 0
            threshold = 0.80 
            if media_historica_vendas > 100 and vendas_hoje < (media_historica_vendas * threshold):
                percent_drop = (1 - (vendas_hoje / media_historica_vendas)) * 100
                notifications.append({
                    "type": "warning",
                    "title": "Alerta de Vendas Baixas",
                    "message": f"As vendas de hoje estão <strong>{percent_drop:.0f}% abaixo</strong> da média para este dia da semana (R$ {vendas_hoje:,.2f} de R$ {media_historica_vendas:,.2f})."
                })

        # --- 2. ALERTA DE AUMENTO NAS DEVOLUÇÕES ---
        returns_sql = """
            SELECT
                SUM(CASE WHEN p.DATAEFE = ? THEN CAST(p.VALORLIQUIDO AS DOUBLE PRECISION) ELSE 0 END) as DEVOLUCOES_HOJE,
                SUM(CASE WHEN EXTRACT(WEEKDAY FROM p.DATAEFE) = ? AND p.DATAEFE < ? AND p.DATAEFE >= ? THEN CAST(p.VALORLIQUIDO AS DOUBLE PRECISION) ELSE 0 END) as DEVOLUCOES_HISTORICO
            FROM TVENPEDIDO p
            WHERE p.EMPRESA = ? AND p.STATUS = 'EFE' AND p.TIPOVENDA = 'DV'
        """
        returns_res = await execute_query_via_agent(
            empresa_info.company_id, 
            returns_sql, 
            [today, firebird_weekday, today, history_start_date_sales, id_empresa]
        )
        if returns_res and returns_res[0]:
            returns_data = returns_res[0]
            devolucoes_hoje = float(returns_data.get('DEVOLUCOES_HOJE') or 0.0)
            devolucoes_historico_total = float(returns_data.get('DEVOLUCOES_HISTORICO') or 0.0)
            media_historica_devolucoes = devolucoes_historico_total / 4 if devolucoes_historico_total > 0 else 0
            threshold_increase = 1.50
            if devolucoes_hoje > 50 and (media_historica_devolucoes == 0 or devolucoes_hoje > (media_historica_devolucoes * threshold_increase)):
                notifications.append({
                    "type": "danger",
                    "title": "Aumento Incomum de Devoluções",
                    "message": f"O valor de devoluções hoje (R$ {devolucoes_hoje:,.2f}) está significativamente acima da média histórica para este dia da semana."
                })

        # --- 3. ALERTA DE CLIENTES EM RISCO ---
        inactivity_threshold_days = 40
        valuable_client_period_days = 180
        min_valuable_amount = 1000.0

        risk_clients_sql = f"""
            SELECT FIRST 10 p.CLIENTENOME, SUM(CAST(p.VALORLIQUIDO AS DOUBLE PRECISION)) as TOTAL_VALOR, MAX(p.DATAEFE) as ULTIMA_COMPRA
            FROM TVENPEDIDO p WHERE p.EMPRESA = ? AND p.STATUS = 'EFE' AND p.TIPOVENDA = 'NM' AND p.DATAEFE >= ? AND p.CLIENTENOME IS NOT NULL AND p.CLIENTENOME <> ''
            GROUP BY 1 HAVING SUM(CAST(p.VALORLIQUIDO AS DOUBLE PRECISION)) > ? ORDER BY 2 DESC
        """
        history_start_date_clients = today - timedelta(days=valuable_client_period_days)
        risk_clients_res = await execute_query_via_agent(empresa_info.company_id, risk_clients_sql, [id_empresa, history_start_date_clients, min_valuable_amount])

        if risk_clients_res:
            for client in risk_clients_res:
                last_purchase_str = client.get('ULTIMA_COMPRA')
                if not last_purchase_str: continue
                last_purchase_date = datetime.strptime(last_purchase_str, '%Y-%m-%d').date()
                days_since_last_purchase = (today - last_purchase_date).days
                if days_since_last_purchase > inactivity_threshold_days:
                    client_name = client.get('CLIENTENOME').strip()
                    notifications.append({
                        "type": "info",
                        "title": "Oportunidade de Retenção",
                        "message": f"O cliente <strong>{client_name}</strong>, um dos seus mais valiosos, não faz um pedido há <strong>{days_since_last_purchase} dias</strong>. Sugerimos entrar em contato."
                    })
        return notifications
    except Exception as e:
        print(f"ERRO ao gerar alertas proativos: {e}")
        return []

# ### NOVA ROTA PARA O INSIGHT DO DIA ###
@router.get("/daily-insight")
async def get_daily_insight(empresa_info: EmpresaInfo = Depends(verificar_empresa), id_empresa: str = Depends(get_company_fk)):
    """
    Gera um insight rápido para a tela de boas-vindas do chat, comparando as vendas
    de ontem com a média histórica e encontrando o produto de destaque.
    """
    try:
        today = date.today()
        yesterday = today - timedelta(days=1)
        
        # 1. Comparar vendas de ontem com a média do mesmo dia da semana
        firebird_weekday = python_weekday_to_firebird(yesterday)
        history_start_date = yesterday - timedelta(weeks=5) # 4 semanas completas antes de ontem

        sales_sql = """
            SELECT
                SUM(CASE WHEN p.DATAEFE = ? THEN CAST(p.VALORLIQUIDO AS DOUBLE PRECISION) ELSE 0 END) as VENDAS_ONTEM,
                SUM(CASE WHEN EXTRACT(WEEKDAY FROM p.DATAEFE) = ? AND p.DATAEFE < ? AND p.DATAEFE >= ? THEN CAST(p.VALORLIQUIDO AS DOUBLE PRECISION) ELSE 0 END) as VENDAS_HISTORICO
            FROM TVENPEDIDO p
            WHERE p.EMPRESA = ? AND p.STATUS = 'EFE' AND p.TIPOVENDA = 'NM'
        """
        sales_res = await execute_query_via_agent(
            empresa_info.company_id, 
            sales_sql, 
            [yesterday, firebird_weekday, yesterday, history_start_date, id_empresa]
        )
        
        comparison_percent = 0
        if sales_res and sales_res[0]:
            sales_data = sales_res[0]
            vendas_ontem = float(sales_data.get('VENDAS_ONTEM') or 0.0)
            vendas_historico_total = float(sales_data.get('VENDAS_HISTORICO') or 0.0)
            
            media_historica_vendas = vendas_historico_total / 4 if vendas_historico_total > 0 else 0

            if media_historica_vendas > 0:
                comparison_percent = ((vendas_ontem - media_historica_vendas) / media_historica_vendas) * 100
        
        # 2. Encontrar o produto de maior destaque ontem
        top_product_sql = """
            SELECT FIRST 1 g.DESCRICAOREDUZIDA
            FROM TVENPEDIDO p
            JOIN TVENPRODUTO i ON p.CODIGO = i.PEDIDO AND p.EMPRESA = i.EMPRESA
            JOIN TESTPRODUTOGERAL g ON i.PRODUTO = g.CODIGO
            WHERE p.EMPRESA = ? AND p.STATUS = 'EFE' AND p.TIPOVENDA = 'NM' AND p.DATAEFE = ?
            GROUP BY 1 ORDER BY SUM(CAST(i.VLRLIQUIDO AS DOUBLE PRECISION)) DESC
        """
        top_product_res = await execute_query_via_agent(empresa_info.company_id, top_product_sql, [id_empresa, yesterday])

        top_product = None
        if top_product_res and top_product_res[0] and top_product_res[0].get('DESCRICAOREDUZIDA'):
            top_product = top_product_res[0]['DESCRICAOREDUZIDA'].strip()

        return {
            "comparison_percent": comparison_percent,
            "top_product": top_product
        }

    except Exception as e:
        print(f"ERRO ao gerar insight diário: {e}")
        return {}