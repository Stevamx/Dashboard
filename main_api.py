# main_api.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import firebase_admin
from firebase_admin import credentials
import json
import os
import asyncio
import uuid
from datetime import date, datetime

# --- INICIALIZAÇÃO DO FIREBASE ---
try:
    CREDENTIALS_FILE = "firebase-service-account.json"
    if not os.path.exists(CREDENTIALS_FILE):
        raise FileNotFoundError(f"Arquivo de credenciais '{CREDENTIALS_FILE}' não encontrado.")
    
    cred = credentials.Certificate(CREDENTIALS_FILE)
    firebase_admin.initialize_app(cred, {
        'databaseURL': 'https://dashboard-e66b8-default-rtdb.firebaseio.com/'
    })
    print("Firebase Admin SDK inicializado com sucesso.")
except Exception as e:
    print(f"Erro ao inicializar Firebase Admin SDK: {e}")
    # Em um ambiente de produção, talvez você queira que a aplicação pare aqui.
    # exit()

task_results = {}

def json_converter(o):
    """Converte tipos de dados não serializáveis como data e hora para string."""
    if isinstance(o, (datetime, date)):
        return o.isoformat()

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, company_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[company_id] = websocket
        print(f"INFO: Agente da empresa '{company_id}' conectou.")

    def disconnect(self, company_id: str):
        if company_id in self.active_connections:
            del self.active_connections[company_id]
            print(f"INFO: Agente da empresa '{company_id}' desconectou.")

    async def send_message(self, company_id: str, message: str) -> bool:
        if company_id in self.active_connections:
            websocket = self.active_connections[company_id]
            try:
                await websocket.send_text(message)
                return True
            except Exception as e:
                print(f"ERRO ao enviar mensagem para o agente '{company_id}': {e}")
                self.disconnect(company_id)
                return False
        return False

    async def is_connected(self, company_id: str) -> bool:
        return company_id in self.active_connections

manager = ConnectionManager()

# ### FUNÇÃO ALTERADA ###
async def execute_query_via_agent(company_cnpj: str, sql: str, params: list = []):
    """
    Envia uma consulta SQL para o agente local e aguarda o resultado.
    Agora inclui uma breve espera para permitir a reconexão do agente.
    """
    # Tenta por até 3 segundos (30 * 0.1s) para encontrar um agente conectado.
    # Isso dá tempo para o agente reconectar caso a conexão tenha caído.
    for _ in range(30):
        if await manager.is_connected(company_cnpj):
            break
        await asyncio.sleep(0.1)
    else:
        # Se o loop terminar sem encontrar o agente, lança a exceção.
        raise HTTPException(status_code=404, detail=f"O agente local para a empresa não está conectado. Verifique se o agente está em execução no servidor do cliente.")

    task_id = str(uuid.uuid4())
    payload = {"id_tarefa": task_id, "acao": "query", "parametros": {"sql": sql, "params": params}}
    
    await manager.send_message(company_cnpj, json.dumps(payload, default=json_converter))

    # Aumentado o tempo de espera pela resposta para 20 segundos para acomodar latência da rede.
    for _ in range(200):
        if task_id in task_results:
            result = task_results.pop(task_id)
            if result.get("status") == "erro":
                error_message = str(result.get('mensagem', 'Erro desconhecido.'))
                simple_error = error_message.split('\n')[0]
                raise HTTPException(status_code=400, detail=f"Erro no agente local: {simple_error}")
            return result.get("dados", [])
        await asyncio.sleep(0.1)
    
    raise HTTPException(status_code=408, detail="O agente local demorou muito para responder (timeout).")


# --- IMPORTAÇÃO DOS ROTEADORES ---
from routers import (
    dashboard_main, dashboard_vendas, dashboard_estoque, luca_ai, 
    user_data, settings_panel, admin_tools, metas_panel,
    company_data
)

app = FastAPI(title="Dashboard de Vendas API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- REGISTRO DOS ROTEADORES ---
app.include_router(dashboard_main.router)
app.include_router(dashboard_vendas.router)
app.include_router(dashboard_estoque.router)
app.include_router(luca_ai.router)
app.include_router(user_data.router)
app.include_router(settings_panel.router)
app.include_router(admin_tools.router)
app.include_router(metas_panel.router)
app.include_router(company_data.router)

app.mount("/static", StaticFiles(directory="static"), name="static")

# --- ROTAS DE PÁGINAS HTML ---
@app.get("/", response_class=FileResponse, include_in_schema=False)
async def read_root(): return "static/login.html"

@app.get("/login", response_class=FileResponse, include_in_schema=False)
async def read_login(): return "static/login.html"

@app.get("/dashboard-web", response_class=FileResponse, include_in_schema=False)
async def read_dashboard_web(): return "static/dashboard.html"

@app.get("/chat", response_class=FileResponse, include_in_schema=False)
async def read_chat_page(): return "static/chat.html"

@app.get("/settings", response_class=FileResponse, include_in_schema=False)
async def read_settings_page(): return "static/configuracoes.html"

@app.get("/metas", response_class=FileResponse, include_in_schema=False)
async def read_metas_page(): return "static/metas.html"

@app.get("/tv", response_class=FileResponse, include_in_schema=False)
async def read_tv_page(): return "static/tv.html"

@app.websocket("/ws/{company_id}")
async def websocket_endpoint(websocket: WebSocket, company_id: str):
    await manager.connect(company_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                response = json.loads(data)
                task_id = response.get("id_tarefa")
                if task_id:
                    task_results[task_id] = response
            except json.JSONDecodeError:
                print(f"Aviso: Resposta do agente '{company_id}' não é um JSON válido.")
    except WebSocketDisconnect:
        manager.disconnect(company_id)