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
from fastapi_websocket_pubsub import PubSubClient
import redis.asyncio as redis
from typing import Dict

# --- CONFIGURAÇÃO ---
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost")

tasks: Dict[str, asyncio.Future] = {}
pubsub_client: PubSubClient = None

# --- LÓGICA DA APLICAÇÃO ---
def json_converter(o):
    if isinstance(o, (datetime, date)):
        return o.isoformat()

async def execute_query_via_agent(company_cnpj: str, sql: str, params: list = []):
    """
    *** FUNÇÃO AJUSTADA PARA MAIOR ROBUSTEZ ***
    Envia uma consulta para o agente local através do Redis Pub/Sub
    e aguarda a resposta.
    """
    task_id = str(uuid.uuid4())
    loop = asyncio.get_running_loop()
    future = loop.create_future()
    tasks[task_id] = future

    payload = {"id_tarefa": task_id, "acao": "query", "parametros": {"sql": sql, "params": params}}

    try:
        # Verificação simples para garantir que o cliente foi instanciado no startup.
        if pubsub_client is None:
            raise ConnectionError("O serviço de mensagens (PubSub) não foi inicializado.")

        await pubsub_client.publish([f"agent:{company_cnpj}"], data=json.dumps(payload, default=json_converter))
        result = await asyncio.wait_for(future, timeout=20.0)

        if result.get("status") == "erro":
            error_message = str(result.get('mensagem', 'Erro desconhecido.'))
            simple_error = error_message.split('\n')[0]
            raise HTTPException(status_code=400, detail=f"Erro no agente local: {simple_error}")

        return result.get("dados", [])

    except asyncio.TimeoutError:
        raise HTTPException(status_code=408, detail="O agente local demorou muito para responder (timeout).")
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    finally:
        tasks.pop(task_id, None)

# --- IMPORTAÇÃO DOS ROTEADORES ---
from routers import (
    dashboard_main, dashboard_vendas, dashboard_estoque, luca_ai,
    user_data, settings_panel, admin_tools, metas_panel,
    company_data
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    *** FUNÇÃO LIFESPAN COM A SOLUÇÃO DEFINITIVA ***
    Gerencia o ciclo de vida da aplicação, verificando a conexão com o Redis
    antes de inicializar os componentes dependentes.
    """
    global pubsub_client
    
    redis_connection = redis.from_url(REDIS_URL, decode_responses=True)
    listener_task = None
    
    try:
        # 1. *** SOLUÇÃO ROBUSTA ***
        # Força a conexão e verifica se está ativa com um comando PING.
        # Isso garante que a conexão com o Redis está 100% pronta.
        await redis_connection.ping()
        print("Conexão com Redis estabelecida e verificada com sucesso.")

        # 2. Instancia o cliente PubSub APÓS a conexão ser verificada
        pubsub_client = PubSubClient(broadcaster=redis_connection)
    
        # 3. Inicia o "ouvinte" como tarefa de fundo
        listener_task = asyncio.create_task(pubsub_client.listen())
        print("Listener do PubSub iniciado em segundo plano.")
        
        # Inicializa o Firebase
        cred = credentials.Certificate("firebase-service-account.json")
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred, {
                'databaseURL': 'https://dashboard-e66b8-default-rtdb.firebaseio.com/'
            })
            print("Firebase Admin SDK inicializado com sucesso.")
        
        # A aplicação roda aqui
        yield
        
    finally:
        print("Encerrando a aplicação...")
        if listener_task and not listener_task.done():
            listener_task.cancel()
        
        if redis_connection:
            await redis_connection.close()
            print("Conexão com Redis fechada.")

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
    await websocket.accept()
    await pubsub_client.subscribe(websocket, [f"agent:{company_id}"])
    try:
        print(f"INFO: Agente da empresa '{company_id}' conectou e se inscreveu no canal.")
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            task_id = message.get("id_tarefa")
            if task_id and task_id in tasks:
                future = tasks.pop(task_id)
                future.set_result(message)
                
    except WebSocketDisconnect:
        print(f"INFO: Agente da empresa '{company_id}' desconectou.")
    except Exception as e:
        print(f"ERRO no endpoint websocket para '{company_id}': {e}")
    finally:
        await pubsub_client.unsubscribe(websocket)
        print(f"INFO: Agente '{company_id}' removido da inscrição.")