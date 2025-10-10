# main_api.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import firebase_admin
from firebase_admin import credentials
import json
import os
import asyncio
import uuid
from datetime import date, datetime
from contextlib import asynccontextmanager
# ### REMOVIDO ### - Não vamos mais usar a biblioteca do Redis
# import redis.asyncio as redis 
from typing import Dict

# --- CONFIGURAÇÃO ---
# ### REMOVIDO ### - A URL do Redis não é mais necessária
# REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost")

tasks: Dict[str, asyncio.Future] = {}

# ### NOVO ### 
# Dicionário para manter as conexões WebSocket ativas em memória.
# A chave será o CNPJ da empresa e o valor será o objeto WebSocket da conexão.
active_connections: Dict[str, WebSocket] = {}

# --- LÓGICA DA APLICAÇÃO ---
def json_converter(o):
    if isinstance(o, (datetime, date)):
        return o.isoformat()

# ### ALTERADO ### 
# A função agora envia a ordem diretamente para o WebSocket do agente conectado,
# em vez de colocar na fila do Redis.
async def execute_query_via_agent(company_cnpj: str, sql: str, params: list = []):
    # Verifica se o agente da empresa solicitada está online
    if company_cnpj not in active_connections:
        raise HTTPException(status_code=503, detail=f"O agente local para a empresa {company_cnpj} não está conectado ao servidor.")

    task_id = str(uuid.uuid4())
    loop = asyncio.get_running_loop()
    future = loop.create_future()
    tasks[task_id] = future

    payload = {"id_tarefa": task_id, "acao": "query", "parametros": {"sql": sql, "params": params}}
    payload_str = json.dumps(payload, default=json_converter)

    try:
        # Pega a conexão do agente que está na memória
        websocket = active_connections[company_cnpj]
        
        # Envia a ordem diretamente pela conexão WebSocket
        await websocket.send_text(payload_str)
        
        # O resto da lógica (esperar a resposta) permanece igual
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
    # ### REMOVIDO ### - Toda a lógica de conexão com o Redis foi removida.
    # global redis_connection
    # redis_connection = redis.from_url(REDIS_URL, decode_responses=True)
    
    try:
        # await redis_connection.ping()
        # print("INFO: Conexão com Redis estabelecida e verificada com sucesso.")
            
        cred = credentials.Certificate("firebase-service-account.json")
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred, {
                'databaseURL': 'https://dashboard-e66b8-default-rtdb.firebaseio.com/'
            })
            print("INFO: Firebase Admin SDK inicializado com sucesso.")
        
        print("INFO: Aplicação iniciada e pronta para receber conexões.")
        yield
        
    finally:
        print("INFO: Encerrando a aplicação...")
        # if redis_connection:
        #     await redis_connection.close()
        #     print("INFO: Conexão com Redis fechada.")

app = FastAPI(title="Dashboard de Vendas API", lifespan=lifespan)

# --- ENDPOINT DE HEALTH CHECK ---
@app.get("/health", include_in_schema=False)
async def health_check():
    return JSONResponse(content={"status": "ok"})

# ### REMOVIDO ### 
# O listener do Redis não é mais necessário, pois a comunicação agora é direta.
# async def redis_listener(websocket: WebSocket, company_id: str): ...


# ### ALTERADO ###
# O WebSocket agora gerencia o dicionário de conexões ativas.
@app.websocket("/ws/{company_id}")
async def websocket_endpoint(websocket: WebSocket, company_id: str):
    await websocket.accept()
    
    # Adiciona a nova conexão ao nosso dicionário na memória
    active_connections[company_id] = websocket
    print(f"INFO: Agente da empresa '{company_id}' conectou. Total de agentes online: {len(active_connections)}")
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            task_id = message.get("id_tarefa")
            if task_id and task_id in tasks:
                future = tasks.pop(task_id)
                future.set_result(message)
                
    except WebSocketDisconnect:
        print(f"INFO: Agente da empresa '{company_id}' desconectou.")
    finally:
        # Remove a conexão do dicionário quando o agente se desconectar
        if company_id in active_connections:
            del active_connections[company_id]
        print(f"INFO: Conexão de '{company_id}' removida. Total de agentes online: {len(active_connections)}")

# O restante do arquivo permanece igual
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