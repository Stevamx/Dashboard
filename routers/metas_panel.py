# /routers/metas_panel.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from dependencies import get_company_fk, EmpresaInfo, verificar_empresa
from main_api import execute_query_via_agent

router = APIRouter(
    prefix="/api/metas",
    tags=["Painel de Metas"]
)

class Meta(BaseModel):
    indicador: str; ano: int; mes: int; valor: float

class MetaDelete(BaseModel):
    indicador: str; ano: int; mes: int

async def criar_tabela_metas_se_nao_existir_async(company_cnpj: str, id_empresa: str):
    try:
        check_sql = "SELECT 1 FROM RDB$RELATIONS WHERE RDB$RELATION_NAME = 'DBMETAS'"
        table_exists = await execute_query_via_agent(company_cnpj, check_sql)

        if not table_exists:
            # ### CORREÇÃO APLICADA AQUI ###
            # Alterado o tipo da coluna ID_EMPRESA para VARCHAR(11) para corresponder
            # à estrutura da tabela de empresas principal do seu banco de dados.
            sql_create_table = """
            CREATE TABLE DBMETAS (
                ID_EMPRESA VARCHAR(11) NOT NULL, 
                INDICADOR VARCHAR(50) NOT NULL,
                ANO INTEGER NOT NULL, 
                MES SMALLINT NOT NULL, 
                VALOR NUMERIC(15, 2) NOT NULL,
                PRIMARY KEY (ID_EMPRESA, INDICADOR, ANO, MES)
            )"""
            await execute_query_via_agent(company_cnpj, sql_create_table)
            print(f"INFO: Tabela 'DBMETAS' criada para a empresa {id_empresa}.")

    except Exception as e:
        print(f"AVISO: Erro ao verificar/criar tabela de metas para empresa {id_empresa}: {e}")


@router.get("")
async def get_metas(empresa_info: EmpresaInfo = Depends(verificar_empresa), id_empresa: str = Depends(get_company_fk)):
    try:
        await criar_tabela_metas_se_nao_existir_async(empresa_info.company_id, id_empresa)
        sql = "SELECT INDICADOR, ANO, MES, VALOR FROM DBMETAS WHERE ID_EMPRESA = ? ORDER BY ANO, MES, INDICADOR"
        results = await execute_query_via_agent(empresa_info.company_id, sql, [id_empresa])
        return [{"indicador": r['INDICADOR'], "ano": r['ANO'], "mes": r['MES'], "valor": float(r['VALOR'] or 0.0)} for r in results]
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Erro ao buscar metas: {e}")

@router.post("")
async def set_meta(meta: Meta, empresa_info: EmpresaInfo = Depends(verificar_empresa), id_empresa: str = Depends(get_company_fk)):
    try:
        await criar_tabela_metas_se_nao_existir_async(empresa_info.company_id, id_empresa)
        
        # ### CORREÇÃO APLICADA AQUI ###
        # Alterado o CAST do ID_EMPRESA para VARCHAR(11) para corresponder à nova estrutura da tabela.
        sql = """
            MERGE INTO DBMETAS AS T
            USING (
                SELECT
                    CAST(? AS VARCHAR(11)) AS ID_EMPRESA,
                    CAST(? AS VARCHAR(50)) AS INDICADOR,
                    CAST(? AS INTEGER) AS ANO,
                    CAST(? AS SMALLINT) AS MES,
                    CAST(? AS NUMERIC(15, 2)) AS VALOR
                FROM RDB$DATABASE
            ) AS S
            ON (T.ID_EMPRESA = S.ID_EMPRESA AND T.INDICADOR = S.INDICADOR AND T.ANO = S.ANO AND T.MES = S.MES)
            WHEN MATCHED THEN
                UPDATE SET T.VALOR = S.VALOR
            WHEN NOT MATCHED THEN
                INSERT (ID_EMPRESA, INDICADOR, ANO, MES, VALOR)
                VALUES (S.ID_EMPRESA, S.INDICADOR, S.ANO, S.MES, S.VALOR)
        """
        params = [id_empresa, meta.indicador, meta.ano, meta.mes, meta.valor]
        
        await execute_query_via_agent(empresa_info.company_id, sql, params)
        return {"status": "sucesso", "mensagem": "Meta salva com sucesso!"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Erro ao salvar meta: {e}")

@router.delete("")
async def delete_meta(meta: MetaDelete, empresa_info: EmpresaInfo = Depends(verificar_empresa), id_empresa: str = Depends(get_company_fk)):
    try:
        await criar_tabela_metas_se_nao_existir_async(empresa_info.company_id, id_empresa)
        sql = "DELETE FROM DBMETAS WHERE ID_EMPRESA = ? AND INDICADOR = ? AND ANO = ? AND MES = ?"
        await execute_query_via_agent(empresa_info.company_id, sql, [id_empresa, meta.indicador, meta.ano, meta.mes])
        return {"status": "sucesso", "mensagem": "Meta removida com sucesso!"}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Erro ao remover meta: {e}")