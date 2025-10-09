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
from contextlib import asynccontextmanager
# ### CORREÇÃO APLICADA AQUI (import correto) ###
from fastapi_websocket_pubsub import PubSubClient
import redis.asyncio as redis

# --- CONFIGURAÇÃO ---
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost")

# --- GERENCIAMENTO DE CONEXÕES COM REDIS (Pub/Sub) ---
pubsub_client: PubSubClient = None

async def is_agent_connected(company_id: str) -> bool:
    """Verifica se um agente está online publicando uma mensagem de 'ping'."""
    try:
        await pubsub_client.wait_for_response(
            pubsub_client.publish(f"agent:{company_id}", {"action": "ping"}),
            timeout=1.0
        )
        return True
    except asyncio.TimeoutError:
        return False

# --- LÓGICA DA APLICAÇÃO ---
def json_converter(o):
    if isinstance(o, (datetime, date)):
        return o.isoformat()

async def execute_query_via_agent(company_cnpj: str, sql: str, params: list = []):
    if not await is_agent_connected(company_cnpj):
        raise HTTPException(status_code=404, detail=f"O agente local para a empresa não está conectado. Verifique se o agente está em execução no servidor do cliente.")

    task_id = str(uuid.uuid4())
    payload = {"id_tarefa": task_id, "acao": "query", "parametros": {"sql": sql, "params": params}}
    
    try:
        result = await pubsub_client.wait_for_response(
            pubsub_client.publish(f"agent:{company_cnpj}", payload),
            timeout=20.0
        )
        
        if result.get("status") == "erro":
            error_message = str(result.get('mensagem', 'Erro desconhecido.'))
            simple_error = error_message.split('\n')[0]
            raise HTTPException(status_code=400, detail=f"Erro no agente local: {simple_error}")
        
        return result.get("dados", [])
        
    except asyncio.TimeoutError:
        raise HTTPException(status_code=408, detail="O agente local demorou muito para responder (timeout).")

# --- IMPORTAÇÃO DOS ROTEADORES ---
from routers import (
    dashboard_main, dashboard_vendas, dashboard_estoque, luca_ai, 
    user_data, settings_panel, admin_tools, metas_panel,
    company_data
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    global pubsub_client
    # --- INICIALIZAÇÃO ---
    redis_connection = redis.from_url(REDIS_URL, decode_responses=True)
    pubsub_client = PubSubClient(redis_connection)
    
    try:
        cred = credentials.Certificate("firebase-service-account.json")
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred, {
                'databaseURL': 'https://dashboard-e66b8-default-rtdb.firebaseio.com/'
            })
            print("Firebase Admin SDK inicializado com sucesso.")
    except Exception as e:
        print(f"ERRO CRÍTICO ao inicializar Firebase Admin SDK: {e}")
    
    yield
    
    # --- ENCERRAMENTO ---
    await redis_connection.close()
    print("Conexão com Redis fechada e aplicação encerrando.")

app = FastAPI(title="Dashboard de Vendas API", lifespan=lifespan)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
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

# Rotas de páginas HTML
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
    async with pubsub_client.tracker(f"agent:{company_id}", websocket) as tracker:
        print(f"INFO: Agente da empresa '{company_id}' conectou via PubSub.")
        try:
            async for message in tracker:
                if message.get("action") == "ping":
                    await tracker.websocket.send_text(
                        json.dumps({"id": message["id"], "response": "pong"})
                    )
                    continue
                
                if "id_tarefa" in message:
                    await pubsub_client.publish_response(tracker.id, message)

        except WebSocketDisconnect:
            print(f"INFO: Agente da empresa '{company_id}' desconectou do PubSub.")