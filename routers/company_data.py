# /routers/company_data.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List
from firebase_admin import db

# A conexão direta com o banco de dados foi removida.
# from database import connect 
from dependencies import verificar_empresa, EmpresaInfo, verificar_token_simples

router = APIRouter(
    prefix="/api/company",
    tags=["Company Data"]
)

class CompanyDetails(BaseModel):
    nome_fantasia: str
    cnpj: str

class CompanyInfo(BaseModel):
    cnpj: str
    nome_fantasia: str

@router.get("/all", response_model=List[CompanyInfo], dependencies=[Depends(verificar_token_simples)])
def get_all_companies():
    """
    Busca uma lista de todas as empresas (CNPJ e Nome Fantasia)
    cadastradas no Firebase Realtime Database.
    """
    try:
        # Acessa o nó 'empresas' na raiz do seu Realtime Database.
        all_companies_ref = db.reference('/empresas').get()
        if not all_companies_ref:
            return []

        companies = []
        for cnpj_raw, details in all_companies_ref.items():
            # Garante que 'details' é um dicionário antes de tentar acessá-lo.
            if isinstance(details, dict):
                # Usa o 'nomeFantasia' salvo, ou o CNPJ como alternativa.
                nome_fantasia = details.get("nomeFantasia", cnpj_raw).strip()
            else:
                # Fallback caso a estrutura de dados seja inesperada.
                nome_fantasia = cnpj_raw
            
            companies.append(CompanyInfo(cnpj=cnpj_raw, nome_fantasia=nome_fantasia))

        # Ordena a lista em ordem alfabética pelo nome da empresa.
        companies.sort(key=lambda c: c.nome_fantasia)
        return companies

    except Exception as e:
        # Captura qualquer erro durante a comunicação com o Firebase.
        raise HTTPException(status_code=500, detail=f"Erro ao buscar lista de empresas no Firebase: {e}")


@router.get("/details", response_model=CompanyDetails)
def get_company_details(empresa_info: EmpresaInfo = Depends(verificar_empresa)):
    """
    Busca os detalhes (Nome Fantasia e CNPJ) da empresa
    a partir do Firebase Realtime Database.
    """
    company_cnpj_clean = empresa_info.company_id
    try:
        # Busca todas as empresas para encontrar a correspondente.
        all_companies_ref = db.reference('/empresas').get()
        if not all_companies_ref:
            raise HTTPException(status_code=404, detail="Nenhuma empresa encontrada no Firebase.")

        # Itera sobre as empresas cadastradas no Firebase.
        for cnpj_raw, details in all_companies_ref.items():
            # Compara o CNPJ limpo (sem formatação) com o CNPJ da requisição.
            if ''.join(filter(str.isdigit, cnpj_raw)) == company_cnpj_clean:
                if isinstance(details, dict):
                    nome_fantasia = details.get("nomeFantasia", cnpj_raw).strip()
                else:
                    nome_fantasia = cnpj_raw
                
                return CompanyDetails(nome_fantasia=nome_fantasia, cnpj=cnpj_raw)

        # Se o loop terminar sem encontrar a empresa, retorna um erro 404.
        raise HTTPException(status_code=404, detail="Dados da empresa especificada não foram encontrados no Firebase.")

    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Erro ao buscar detalhes da empresa no Firebase: {e}")