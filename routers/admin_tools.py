# /routers/admin_tools.py
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Dict, Optional
from firebase_admin import auth, db

# ### ALTERAÇÃO APLICADA AQUI ###
# Adicionada a dependência 'get_company_fk' para obter o ID da empresa no banco.
from dependencies import verificar_admin_realtime_db, EmpresaInfo, get_company_fk
from main_api import execute_query_via_agent


router = APIRouter(
    prefix="/admin",
    tags=["Admin Tools"],
    dependencies=[Depends(verificar_admin_realtime_db)]
)

class UserData(BaseModel):
    username: str
    papel: str
    acessos: Optional[Dict[str, bool]] = None

class CreateUserRequest(UserData):
    email: str
    password: str

class AISettings(BaseModel):
    prompt: Optional[str] = ""
    api_key: Optional[str] = Field(None, alias="apiKey")


# ### ALTERAÇÃO APLICADA AQUI ###
# A função foi reescrita para criar a nova tabela 'DBCONFIG' com a estrutura correta.
async def create_dbconfig_if_not_exists(company_cnpj: str):
    """Verifica se a tabela DBCONFIG existe e, se não, a cria."""
    try:
        check_sql = "SELECT 1 FROM RDB$RELATIONS WHERE RDB$RELATION_NAME = 'DBCONFIG'"
        table_exists = await execute_query_via_agent(company_cnpj, check_sql)

        if not table_exists:
            # A nova tabela agora inclui ID_EMPRESA e tem uma chave primária composta.
            create_table_sql = """
            CREATE TABLE DBCONFIG (
                ID_EMPRESA VARCHAR(11) NOT NULL,
                CHAVE VARCHAR(50) NOT NULL,
                VALOR BLOB SUB_TYPE TEXT,
                PRIMARY KEY (ID_EMPRESA, CHAVE)
            );
            """
            await execute_query_via_agent(company_cnpj, create_table_sql)
            print(f"INFO: Tabela 'DBCONFIG' criada para a empresa {company_cnpj}.")

    except Exception as e:
        print(f"AVISO: Erro ao tentar verificar/criar a tabela DBCONFIG para {company_cnpj}: {e}")


@router.get("/users")
async def list_users(empresa_info: EmpresaInfo = Depends(verificar_admin_realtime_db)):
    """ Lista todos os usuários associados à empresa. """
    try:
        company_id = empresa_info.company_id
        
        users_ref = db.reference(f'/empresas/{company_id}/usuarios').get()
        if not users_ref:
            return []

        user_list = []
        for uid in users_ref.keys():
            user_details_ref = db.reference(f'/usuarios/{uid}').get()
            if user_details_ref:
                user_company_role = user_details_ref.get('empresas', {}).get(company_id, {}).get('papel', 'usuário')
                user_list.append({
                    "uid": uid,
                    "email": user_details_ref.get('email', 'N/A'),
                    "username": user_details_ref.get('username', 'N/A'),
                    "papel": user_company_role
                })
        return user_list
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao listar usuários: {e}")


@router.post("/users")
async def create_user(request: CreateUserRequest, empresa_info: EmpresaInfo = Depends(verificar_admin_realtime_db)):
    """ Cria um novo usuário na Autenticação do Firebase e no Realtime Database. """
    try:
        new_user = auth.create_user(
            email=request.email,
            password=request.password,
            display_name=request.username
        )
        uid = new_user.uid
        company_id = empresa_info.company_id
        
        user_company_data = {"papel": request.papel, "acessos": request.acessos or {}}
        user_data_to_save = {
            "email": request.email,
            "username": request.username,
            "empresas": { company_id: user_company_data }
        }
        db.reference(f'usuarios/{uid}').set(user_data_to_save)
        db.reference(f'empresas/{company_id}/usuarios/{uid}').set(True)

        return {"status": "success", "message": f"Usuário {request.email} criado com sucesso.", "uid": uid}

    except auth.EmailAlreadyExistsError:
        raise HTTPException(status_code=400, detail="O e-mail fornecido já está em uso.")
    except Exception as e:
        if 'uid' in locals():
            auth.delete_user(uid)
        raise HTTPException(status_code=500, detail=f"Erro ao criar usuário: {e}")


@router.get("/users/{uid}")
async def get_user_details(uid: str, empresa_info: EmpresaInfo = Depends(verificar_admin_realtime_db)):
    """ Busca os detalhes de um usuário específico. """
    try:
        company_id = empresa_info.company_id
        
        user_ref = db.reference(f'/usuarios/{uid}').get()
        if not user_ref:
            raise HTTPException(status_code=404, detail="Usuário não encontrado.")
        
        user_company_data = user_ref.get('empresas', {}).get(company_id, {})
        
        return {
            "uid": uid,
            "username": user_ref.get('username', ''),
            "email": user_ref.get('email', ''),
            "papel": user_company_data.get('papel', 'usuario'),
            "acessos": user_company_data.get('acessos', {})
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/users/{uid}")
async def update_user(uid: str, request: UserData, empresa_info: EmpresaInfo = Depends(verificar_admin_realtime_db)):
    """ Atualiza os dados de um usuário. """
    try:
        auth.update_user(uid, display_name=request.username)
        company_id = empresa_info.company_id
        
        db.reference(f'usuarios/{uid}/username').set(request.username)
        db.reference(f'usuarios/{uid}/empresas/{company_id}/papel').set(request.papel)
        db.reference(f'usuarios/{uid}/empresas/{company_id}/acessos').set(request.acessos or {})
        
        return {"status": "success", "message": "Usuário atualizado com sucesso."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar usuário: {e}")

@router.delete("/users/{uid}")
async def delete_user(uid: str, empresa_info: EmpresaInfo = Depends(verificar_admin_realtime_db)):
    """ Deleta um usuário permanentemente. """
    try:
        company_id = empresa_info.company_id
        auth.delete_user(uid)
        db.reference(f'usuarios/{uid}').delete()
        db.reference(f'empresas/{company_id}/usuarios/{uid}').delete()
        
        return {"status": "success", "message": "Usuário deletado com sucesso."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao deletar usuário: {e}")


# --- ENDPOINTS PARA CONFIGURAÇÃO DA IA ---

# ### ALTERAÇÃO APLICADA AQUI ###
# O endpoint agora depende de 'id_empresa' e busca na tabela 'DBCONFIG'.
@router.get("/settings/ai", response_model=AISettings)
async def get_ai_settings(
    empresa_info: EmpresaInfo = Depends(verificar_admin_realtime_db),
    id_empresa: str = Depends(get_company_fk)
):
    """ Busca as configurações da IA para a empresa específica. """
    await create_dbconfig_if_not_exists(empresa_info.company_id)

    settings = {"prompt": "Você é um assistente prestativo."} # Valor padrão
    try:
        # A query agora filtra pela ID da empresa e pela chave.
        sql = "SELECT VALOR FROM DBCONFIG WHERE ID_EMPRESA = ? AND CHAVE = ?"
        params = [id_empresa, 'AI_PROMPT']
        results = await execute_query_via_agent(empresa_info.company_id, sql, params)
        
        if results and results[0].get('VALOR'):
            settings["prompt"] = results[0].get('VALOR')
        
        return AISettings(**settings)
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Erro ao buscar configurações da IA via agente: {e}")


# ### ALTERAÇÃO APLICADA AQUI ###
# O endpoint agora depende de 'id_empresa' e salva na tabela 'DBCONFIG'.
@router.put("/settings/ai")
async def update_ai_settings(
    settings: AISettings, 
    empresa_info: EmpresaInfo = Depends(verificar_admin_realtime_db),
    id_empresa: str = Depends(get_company_fk)
):
    """ Salva as configurações da IA no banco da empresa via agente. """
    try:
        await create_dbconfig_if_not_exists(empresa_info.company_id)

        # A query agora insere/atualiza o registro para a empresa específica.
        sql = "UPDATE OR INSERT INTO DBCONFIG (ID_EMPRESA, CHAVE, VALOR) VALUES (?, ?, ?) MATCHING (ID_EMPRESA, CHAVE)"
        params = [id_empresa, 'AI_PROMPT', settings.prompt]
        await execute_query_via_agent(empresa_info.company_id, sql, params)
        
        return {"status": "success", "message": "Configurações da IA salvas com sucesso."}
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Erro ao salvar configurações da IA via agente: {e}")