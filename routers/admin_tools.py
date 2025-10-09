# /routers/admin_tools.py
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Dict, Optional
from firebase_admin import auth, db

from dependencies import verificar_admin_realtime_db, EmpresaInfo
from database import connect

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
    api_key: Optional[str] = Field("", alias="apiKey")


@router.get("/users")
async def list_users(empresa_info: EmpresaInfo = Depends(verificar_admin_realtime_db)):
    """ Lista todos os usuários associados à empresa. """
    try:
        # CORREÇÃO: Usa o company_id que já foi verificado pela dependência.
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
        
        # CORREÇÃO: Usa o company_id da dependência.
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
        # Se der erro, tenta deletar o usuário criado no Auth para não deixar lixo
        if 'uid' in locals():
            auth.delete_user(uid)
        raise HTTPException(status_code=500, detail=f"Erro ao criar usuário: {e}")


@router.get("/users/{uid}")
async def get_user_details(uid: str, empresa_info: EmpresaInfo = Depends(verificar_admin_realtime_db)):
    """ Busca os detalhes de um usuário específico. """
    try:
        # CORREÇÃO: Usa o company_id da dependência.
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
        
        # CORREÇÃO: Usa o company_id da dependência.
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
        # CORREÇÃO: Usa o company_id da dependência.
        company_id = empresa_info.company_id

        auth.delete_user(uid)
        
        db.reference(f'usuarios/{uid}').delete()
        db.reference(f'empresas/{company_id}/usuarios/{uid}').delete()
        
        return {"status": "success", "message": "Usuário deletado com sucesso."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao deletar usuário: {e}")


# --- ENDPOINTS PARA CONFIGURAÇÃO DA IA ---
@router.get("/settings/ai", response_model=AISettings)
async def get_ai_settings():
    """ Busca as configurações da IA no Firebird. """
    settings = {"prompt": "", "apiKey": ""}
    try:
        conn = connect()
        if not conn: raise HTTPException(status_code=500, detail="Falha na conexão com o Firebird.")
        
        cur = conn.cursor()
        cur.execute("SELECT CHAVE, VALOR FROM TGERCONFIG WHERE CHAVE IN ('AI_PROMPT', 'GEMINI_API_KEY')")
        for chave, valor in cur.fetchall():
            if chave == 'AI_PROMPT':
                settings["prompt"] = valor
            elif chave == 'GEMINI_API_KEY':
                settings["apiKey"] = valor
        conn.close()
        return AISettings(**settings)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar configurações da IA: {e}")

@router.put("/settings/ai")
async def update_ai_settings(settings: AISettings):
    """ Salva as configurações da IA no Firebird. """
    try:
        conn = connect()
        if not conn: raise HTTPException(status_code=500, detail="Falha na conexão com o Firebird.")
        
        cur = conn.cursor()
        cur.execute("UPDATE OR INSERT INTO TGERCONFIG (CHAVE, VALOR) VALUES (?, ?) MATCHING (CHAVE)", ('AI_PROMPT', settings.prompt))
        cur.execute("UPDATE OR INSERT INTO TGERCONFIG (CHAVE, VALOR) VALUES (?, ?) MATCHING (CHAVE)", ('GEMINI_API_KEY', settings.api_key))
        
        conn.commit()
        conn.close()
        return {"status": "success", "message": "Configurações da IA salvas com sucesso."}
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao salvar configurações da IA: {e}")