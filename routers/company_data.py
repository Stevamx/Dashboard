# /routers/company_data.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List

from database import connect
from dependencies import verificar_empresa, EmpresaInfo, verificar_token_simples

router = APIRouter(
    prefix="/api/company",
    tags=["Company Data"]
)

class CompanyDetails(BaseModel):
    nome_fantasia: str
    cnpj: str

# NOVO MODELO DE DADOS
class CompanyInfo(BaseModel):
    cnpj: str
    nome_fantasia: str

# NOVO ENDPOINT
@router.get("/all", response_model=List[CompanyInfo], dependencies=[Depends(verificar_token_simples)])
def get_all_companies():
    """
    Busca uma lista de todas as empresas (CNPJ e Nome Fantasia)
    cadastradas na tabela TGEREMPRESA.
    """
    conn = None
    try:
        conn = connect()
        if conn is None:
            raise HTTPException(status_code=500, detail="A conexão com o banco de dados falhou.")
        
        cur = conn.cursor()
        cur.execute("SELECT CPFCNPJ, NOMEFANTASIA FROM TGEREMPRESA ORDER BY NOMEFANTASIA")
        rows = cur.fetchall()
        
        companies = [CompanyInfo(cnpj=row[0], nome_fantasia=row[1].strip()) for row in rows]
        return companies

    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Erro ao buscar lista de empresas: {e}")
    finally:
        if conn:
            conn.close()


@router.get("/details", response_model=CompanyDetails)
def get_company_details(empresa_info: EmpresaInfo = Depends(verificar_empresa)):
    """
    Busca os detalhes (Nome Fantasia e CNPJ) da empresa
    com base no token do usuário ou no cabeçalho X-Company-ID para superadmins.
    """
    company_id = empresa_info.company_id
    conn = None
    try:
        conn = connect()
        if conn is None:
            raise HTTPException(status_code=500, detail="A conexão com o banco de dados falhou.")
        
        cur = conn.cursor()
        # Busca pelo CNPJ limpo para garantir a correspondência
        cur.execute("SELECT NOMEFANTASIA, CPFCNPJ FROM TGEREMPRESA WHERE CPFCNPJ = ?", (company_id,))
        row = cur.fetchone()
        
        if not row:
            raise HTTPException(status_code=404, detail="Dados da empresa não encontrados no banco de dados Firebird.")

        return CompanyDetails(nome_fantasia=row[0].strip(), cnpj=row[1])

    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Erro ao buscar detalhes da empresa: {e}")
    finally:
        if conn:
            conn.close()