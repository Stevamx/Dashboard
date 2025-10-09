# dependencies.py
from fastapi import HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import firebase_admin
from firebase_admin import auth, db

security = HTTPBearer()

class EmpresaInfo:
    def __init__(self, uid: str, company_id: str):
        self.uid = uid
        self.company_id = company_id # company_id aqui é o CNPJ

async def verificar_token_simples(token: HTTPAuthorizationCredentials = Depends(security)):
    try:
        decoded_token = auth.verify_id_token(token.credentials)
        return decoded_token['uid']
    except firebase_admin.auth.InvalidIdTokenError:
        raise HTTPException(status_code=401, detail="Token de autenticação inválido ou expirado.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro interno na verificação do token: {str(e)}")

async def verificar_empresa(request: Request, token: HTTPAuthorizationCredentials = Depends(security)):
    try:
        decoded_token = auth.verify_id_token(token.credentials)
        uid = decoded_token['uid']
        user_ref = db.reference(f'usuarios/{uid}').get()
        if not user_ref:
            raise HTTPException(status_code=403, detail="Usuário não encontrado na base de dados.")

        is_superadmin = user_ref.get('superadmin', False)
        target_company_cnpj = ""
        header_cnpj_raw = request.headers.get('X-Company-ID')

        if is_superadmin:
            if not header_cnpj_raw:
                raise HTTPException(status_code=400, detail="Para administradores de suporte, o cabeçalho 'X-Company-ID' é obrigatório.")
            target_company_cnpj = ''.join(filter(str.isdigit, str(header_cnpj_raw).strip()))
        else:
            user_empresas = user_ref.get('empresas', {})
            if not user_empresas:
                raise HTTPException(status_code=403, detail="Permissão negada. Nenhuma empresa associada ao usuário.")

            if len(user_empresas) == 1:
                target_company_cnpj_bruto = list(user_empresas.keys())[0]
                target_company_cnpj = ''.join(filter(str.isdigit, str(target_company_cnpj_bruto).strip()))
            else:
                if not header_cnpj_raw:
                    raise HTTPException(status_code=400, detail="Múltiplas empresas encontradas. A seleção de uma empresa é obrigatória.")
                
                clean_header_cnpj = ''.join(filter(str.isdigit, str(header_cnpj_raw).strip()))
                
                user_has_access = any(
                    ''.join(filter(str.isdigit, str(cnpj_bruto))) == clean_header_cnpj 
                    for cnpj_bruto in user_empresas.keys()
                )

                if not user_has_access:
                    raise HTTPException(status_code=403, detail="Acesso negado à empresa especificada no cabeçalho X-Company-ID.")
                
                target_company_cnpj = clean_header_cnpj
        
        if not target_company_cnpj:
            raise HTTPException(status_code=400, detail="Não foi possível determinar a empresa alvo.")
        
        return EmpresaInfo(uid=uid, company_id=target_company_cnpj)

    except firebase_admin.auth.InvalidIdTokenError:
        raise HTTPException(status_code=401, detail="Token de autenticação inválido ou expirado.")
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Erro interno no servidor durante a verificação: {str(e)}")

async def get_company_fk(empresa: EmpresaInfo = Depends(verificar_empresa)) -> str: # Alterado para -> str
    """
    *** FUNÇÃO CORRIGIDA ***
    Obtém o ID (como STRING) da empresa a partir dos dados
    armazenados no Firebase Realtime Database.
    """
    try:
        user_ref = db.reference(f'usuarios/{empresa.uid}').get()
        user_empresas = user_ref.get('empresas', {})

        for cnpj_key, detalhes in user_empresas.items():
            if ''.join(filter(str.isdigit, cnpj_key)) == empresa.company_id:
                id_empresa_db = detalhes.get('idEmpresaDb')
                if id_empresa_db is not None:
                    # --- CORREÇÃO PRINCIPAL APLICADA AQUI ---
                    # Retorna o ID como string para corresponder ao tipo VARCHAR do banco.
                    return str(id_empresa_db)
        
        raise HTTPException(status_code=404, detail="O ID da empresa (idEmpresaDb) não foi encontrado no perfil do usuário no Firebase.")

    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Erro ao buscar a FK da empresa no Firebase: {e}")

async def verificar_admin_realtime_db(decoded_token: EmpresaInfo = Depends(verificar_empresa)):
    # ... (código sem alterações)
    uid = decoded_token.uid
    if not uid:
        raise HTTPException(status_code=400, detail="UID não encontrado no token.")

    try:
        user_ref = db.reference(f'usuarios/{uid}').get()
        if user_ref.get('superadmin', False):
            return decoded_token

        company_id_cnpj = decoded_token.company_id
        user_empresas = user_ref.get('empresas', {})
        user_role = None
        
        for key, value in user_empresas.items():
            if ''.join(filter(str.isdigit, key)) == company_id_cnpj:
                user_role = value.get('papel')
                break

        if not user_role or user_role.lower() != 'admin':
            raise HTTPException(status_code=403, detail="Acesso negado. Esta área é restrita a administradores.")

        return decoded_token

    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Erro interno ao verificar permissões: {e}")