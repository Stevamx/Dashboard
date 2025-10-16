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
import redis.asyncio as redis # Importa a biblioteca do Redis
from typing import Dict, Any

# --- CONFIGURAÇÃO ---
# Pega a URL do Redis a partir das variáveis de ambiente do Render
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost")

tasks: Dict[str, asyncio.Future] = {}
redis_connection: redis.Redis = None

# --- LÓGICA DA APLICAÇÃO ---
def json_converter(o):
    if isinstance(o, (datetime, date)):
        return o.isoformat()

# Função send_command_to_agent atualizada para usar Redis
async def send_command_to_agent(company_cnpj: str, acao: str, parametros: Dict[str, Any]):
    task_id = str(uuid.uuid4())
    loop = asyncio.get_running_loop()
    future = loop.create_future()
    tasks[task_id] = future

    payload = {"id_tarefa": task_id, "acao": acao, "parametros": parametros}
    payload_str = json.dumps(payload, default=json_converter)

    try:
        if redis_connection is None:
            raise ConnectionError("A conexão com o Redis não foi inicializada.")

        # Em vez de enviar para um WebSocket, empurra a mensagem para a fila do Redis
        await redis_connection.rpush(f"queue:{company_cnpj}", payload_str)
        
        # Aumenta o timeout para acomodar consultas mais longas
        result = await asyncio.wait_for(future, timeout=60.0)

        if result.get("status") == "erro":
            error_message = str(result.get('mensagem', 'Erro desconhecido no agente.'))
            raise HTTPException(status_code=400, detail=f"Erro no agente local: {error_message}")

        return result.get("dados", [])

    except asyncio.TimeoutError:
        raise HTTPException(status_code=408, detail="O agente local demorou para responder (timeout).")
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    finally:
        tasks.pop(task_id, None)

# A função execute_query_via_agent continua usando send_command_to_agent
async def execute_query_via_agent(company_cnpj: str, sql: str, params: list = []):
    parametros = {"sql": sql, "params": params}
    return await send_command_to_agent(company_cnpj, "query", parametros)


# --- IMPORTAÇÃO DOS ROTEADORES ---
from routers import (
    dashboard_main, dashboard_vendas, dashboard_estoque, luca_ai,
    user_data, settings_panel, admin_tools, metas_panel,
    company_data,
    proactive_alerts,
    text_to_speech  # Garante que o router de tts seja incluído
)

# Lifespan atualizado para gerenciar a conexão com o Redis
@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_connection
    
    redis_connection = redis.from_url(REDIS_URL, decode_responses=True)
    
    try:
        await redis_connection.ping()
        print("INFO: Conexão com Redis estabelecida e verificada com sucesso.")
            
        cred = credentials.Certificate("firebase-service-account.json")
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred, {
                'databaseURL': 'https://dashboard-e66b8-default-rtdb.firebaseio.com/'
                # O storageBucket não é necessário na versão do Render
            })
            print("INFO: Firebase Admin SDK inicializado com sucesso.")
        
        print("INFO: Aplicação iniciada e pronta para receber conexões.")
        yield
        
    finally:
        print("INFO: Encerrando a aplicação...")
        if redis_connection:
            await redis_connection.close()
            print("INFO: Conexão com Redis fechada.")

app = FastAPI(title="Dashboard API", lifespan=lifespan)

# --- WebSocket Endpoint atualizado para usar o listener do Redis ---

async def redis_listener(websocket: WebSocket, company_id: str):
    """Uma tarefa de fundo que escuta a fila do Redis e envia para o agente."""
    print(f"INFO: Listener da fila 'queue:{company_id}' iniciado.")
    
    while True:
        try:
            # blpop espera uma mensagem na fila de forma eficiente
            message = await redis_connection.blpop(f"queue:{company_id}", timeout=240)
            if message:
                await websocket.send_text(message[1])
        except asyncio.CancelledError:
            break
        except redis.exceptions.ConnectionError as e:
            print(f"AVISO: Conexão do listener com Redis perdida: {e}. Tentando reconectar...")
            await asyncio.sleep(5)
        except Exception as e:
            print(f"ERRO CRÍTICO no listener do Redis para '{company_id}': {e}. Tentando reconectar...")
            await asyncio.sleep(5)

@app.websocket("/ws/{company_id}")
async def websocket_endpoint(websocket: WebSocket, company_id: str):
    await websocket.accept()
    print(f"INFO: Agente da empresa '{company_id}' conectou.")
    
    # Inicia a tarefa que escuta o Redis
    listener_task = asyncio.create_task(redis_listener(websocket, company_id))
    
    try:
        # Loop principal para receber as respostas do agente
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            task_id = message.get("id_tarefa")
            if task_id and task_id in tasks:
                future = tasks.pop(task_id)
                if not future.done():
                    future.set_result(message)
                else:
                    print(f"AVISO: Resultado para tarefa '{task_id}' chegou atrasado (após timeout).")
            else:
                print(f"AVISO: Recebida resposta para tarefa desconhecida ou expirada: '{task_id}'.")
                
    except WebSocketDisconnect:
        print(f"INFO: Agente da empresa '{company_id}' desconectou.")
    finally:
        # Cancela a tarefa do listener quando o agente desconecta
        listener_task.cancel()
        print(f"INFO: Listener da fila para '{company_id}' finalizado.")

# O restante do arquivo permanece igual
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# Inclui todos os routers da sua versão local
app.include_router(dashboard_main.router)
app.include_router(dashboard_vendas.router)
app.include_router(dashboard_estoque.router)
app.include_router(luca_ai.router)
app.include_router(user_data.router)
app.include_router(settings_panel.router)
app.include_router(admin_tools.router)
app.include_router(metas_panel.router)
app.include_router(company_data.router)
app.include_router(proactive_alerts.router)
app.include_router(text_to_speech.router)

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", response_class=FileResponse, include_in_schema=False)
async def read_root(): return "static/login.html"

@app.get("/login", response_class=FileResponse, include_in_schema=False)
async def read_login(): return "static/login.html"

@app.get("/dashboard-web", response_class=FileResponse, include_in_schema=False)
async def read_dashboard_web(): return "static/dashboard.html"

@app.get("/tv", response_class=FileResponse, include_in_schema=False)
async def read_tv_page(): return "static/tv.html"