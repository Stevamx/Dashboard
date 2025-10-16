# routers/user_data.py
from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import db
from pydantic import BaseModel
from typing import Optional, Dict, List

# A dependência 'verificar_empresa' ainda é necessária para a segurança dos outros endpoints
from dependencies import verificar_empresa, EmpresaInfo, verificar_token_simples
# A importação do 'connect' foi REMOVIDA
# from database import connect

router = APIRouter()

class UserAccessInfo(BaseModel):
    displayName: Optional[str] = None
    email: Optional[str] = None
    access: Optional[Dict[str, bool]] = None
    is_superadmin: bool = False
    company_name: Optional[str] = None
    company_cnpj: Optional[str] = None
    total_companies: int = 1

class CompanyInfoForSelection(BaseModel):
    cnpj: str
    nome_fantasia: str

class UserCompaniesResponse(BaseModel):
    is_superadmin: bool
    companies: List[CompanyInfoForSelection]

@router.get("/api/users/my-companies", response_model=UserCompaniesResponse, summary="Obtém a lista de empresas de um usuário (do Firebase)")
async def get_my_companies(uid: str = Depends(verificar_token_simples)):
    """
    Retorna uma lista de empresas (CNPJ e Nome Fantasia) associadas
    a um usuário, buscando os dados DIRETAMENTE do Firebase Realtime Database.
    """
    user_data = db.reference(f'usuarios/{uid}').get()
    if not user_data:
        raise HTTPException(status_code=404, detail="Usuário não encontrado no Realtime Database.")

    is_superadmin = user_data.get('superadmin', False)
    company_list = []

    # Superadmins não têm empresas listadas, eles selecionam via input.
    if not is_superadmin:
        user_empresas = user_data.get('empresas', {})
        if not user_empresas:
             raise HTTPException(status_code=403, detail="Nenhuma empresa associada a este usuário.")

        for cnpj, detalhes in user_empresas.items():
            company_list.append(
                CompanyInfoForSelection(
                    cnpj=cnpj,
                    # Usa o nomeFantasia do Firebase, ou o CNPJ como fallback
                    nome_fantasia=detalhes.get("nomeFantasia", cnpj)
                )
            )

    return UserCompaniesResponse(is_superadmin=is_superadmin, companies=company_list)


@router.get("/api/users/me", response_model=UserAccessInfo, summary="Obtém os dados do usuário e da empresa logada")
async def get_current_user_info(empresa_info: EmpresaInfo = Depends(verificar_empresa)):
    """
    Retorna os dados do usuário e da empresa, lendo do Firebase.
    A dependência 'verificar_empresa' ainda valida a existência da empresa no Firebird por segurança.
    """
    try:
        uid = empresa_info.uid
        company_id_cnpj = empresa_info.company_id # CNPJ Limpo

        user_data = db.reference(f'usuarios/{uid}').get()
        if not user_data:
            raise HTTPException(status_code=404, detail="Usuário não encontrado no Realtime Database.")

        total_companies = len(user_data.get('empresas', {}))
        is_superadmin = user_data.get('superadmin', False)
        
        # Encontra os dados da empresa alvo dentro do registro do usuário no Firebase
        access_data = {}
        company_name = "Empresa de Suporte" # Nome padrão para superadmin
        
        user_empresas = user_data.get('empresas', {})
        
        # Para usuários normais, encontra a empresa correspondente no Firebase
        if not is_superadmin:
            found_company = False
            for key, value in user_empresas.items():
                if ''.join(filter(str.isdigit, key)) == company_id_cnpj:
                    access_data = value
                    company_name = value.get("nomeFantasia", key)
                    found_company = True
                    break
            if not found_company:
                 raise HTTPException(status_code=404, detail="Dados da empresa não encontrados no perfil do usuário no Firebase.")
        
        # ### ALTERAÇÃO APLICADA AQUI: Permissões padrão para superadmin atualizadas ###
        if is_superadmin:
            access_data['acessos'] = {
                "vendas": True, 
                "estoque": True, 
                "luca": True, 
                "configuracoes": True
            }
            # O nome da empresa do superadmin poderia ser obtido por outro meio, se necessário,
            # mas por agora, usaremos um nome genérico ou o CNPJ.
            company_name = f"Acesso: {company_id_cnpj}"


        return UserAccessInfo(
            displayName=user_data.get('username'),
            email=user_data.get('email'),
            access=access_data.get('acessos'),
            is_superadmin=is_superadmin,
            company_name=company_name,
            company_cnpj=company_id_cnpj,
            total_companies=total_companies
        )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Erro ao buscar dados do usuário: {e}")