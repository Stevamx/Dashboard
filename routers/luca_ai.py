# /routers/luca_ai.py
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
import os
import configparser
import json
import re
from datetime import datetime
import asyncio
import requests

# ### CORREÇÃO APLICADA AQUI ###
# Remove a importação de 'manager' e 'task_results' e importa a nova função.
from main_api import execute_query_via_agent 
from dependencies import get_company_fk, EmpresaInfo, verificar_empresa
from database import connect


router = APIRouter()

class LucaRequest(BaseModel):
    prompt: str
    system_prompt: str
    schema_info: str

class ReportData(BaseModel):
    title: str
    summary: str
    table_headers: List[str]
    table_rows: List[dict]

class LucaResponse(BaseModel):
    answer: str
    report_data: Optional[ReportData] = None

def get_ai_settings():
    config = configparser.ConfigParser()
    config_path = 'config_ai.ini'
    if not os.path.exists(config_path):
        raise HTTPException(status_code=500, detail=f"Arquivo de configuração '{config_path}' não foi encontrado.")
    config.read(config_path, encoding='utf-8')
    try:
        ai_config = config['AIAgent']
        return {"api_key": ai_config.get('ApiKey'), "system_prompt": ai_config.get('Prompt', ''), "schema_info": ai_config.get('Schema', '')}
    except KeyError:
        raise HTTPException(status_code=500, detail="Seção [AIAgent] não foi encontrada no arquivo de configuração.")

def call_gemini_api(prompt: str, api_key: str):
    if not api_key:
        raise HTTPException(status_code=500, detail="A ApiKey do Google AI não foi encontrada.")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-latest:generateContent?key={api_key}"
    headers = {'Content-Type': 'application/json'}
    payload = {"contents": [{"parts": [{"text": prompt}]}], "safetySettings": [{"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"}, {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"}, {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"}, {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"}]}
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=90)
        response.raise_for_status()
        data = response.json()
        if not data.get('candidates'):
             raise HTTPException(status_code=500, detail="A resposta da IA foi bloqueada ou veio vazia.")
        return data['candidates'][0]['content']['parts'][0]['text']
    except requests.exceptions.HTTPError as http_err:
        raise HTTPException(status_code=response.status_code, detail=f"Erro na API do Google AI: {response.text}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ocorreu um erro inesperado: {e}")
        
@router.post("/luca/chat", response_model=LucaResponse)
async def handle_luca_chat(request: LucaRequest, empresa_info: EmpresaInfo = Depends(verificar_empresa), id_empresa: str = Depends(get_company_fk)):
    try:
        settings = get_ai_settings()
        api_key = settings["api_key"]

        full_prompt_for_sql = (
            f"{settings['system_prompt']}\n"
            f"Sua tarefa é analisar a pergunta do usuário e, se possível, convertê-la em uma consulta SQL para um banco Firebird.\n"
            f"Se a pergunta puder ser respondida com SQL, responda APENAS com o código SQL dentro de um bloco ```sql. Não inclua NENHUM outro texto.\n"
            f"Se a pergunta for uma saudação ou algo que não requer dados, responda de forma conversacional.\n"
            f"--- Esquema do Banco de Dados ---\n{settings['schema_info']}\n"
            f"--- Regras de SQL ---\n"
            f"1. Use o dialeto SQL do Firebird.\n"
            f"2. A data atual é {datetime.now().strftime('%Y-%m-%d')}.\n"
            f"3. CRÍTICO: TODA query que acessar tabelas como TVENPEDIDO, TESTPRODUTO, etc., DEVE OBRIGATORIAMENTE incluir um filtro pelo ID da empresa. Exemplo: 'WHERE ... AND EMPRESA = ''{id_empresa}'''.\n"
            f"--- Pergunta do Usuário ---\n"
            f'"{request.prompt}"'
        )
        
        generated_text = call_gemini_api(full_prompt_for_sql, api_key)

        sql_match = re.search(r"```(?:sql)?\s*(SELECT .*?)\s*```", generated_text, re.DOTALL | re.IGNORECASE)
        if not sql_match:
            return LucaResponse(answer=generated_text)

        generated_sql = sql_match.group(1).strip().split(';')[0]
        
        # Garante que o ID da empresa está na query
        if "EMPRESA" not in generated_sql.upper():
            if "WHERE" in generated_sql.upper():
                generated_sql = re.sub(r"(WHERE)", f"WHERE EMPRESA = '{id_empresa}' AND", generated_sql, flags=re.IGNORECASE, count=1)
            else:
                generated_sql += f" WHERE EMPRESA = '{id_empresa}'"
        
        # ### CORREÇÃO APLICADA AQUI ###
        # Substitui o antigo sistema de 'manager' e 'task_results'
        # pela nova função centralizada que usa Redis.
        query_result = await execute_query_via_agent(
            empresa_info.company_id, # CNPJ já validado
            generated_sql,
            [] # params
        )

        if not query_result:
            return LucaResponse(answer="A consulta foi executada, mas não encontrou nenhum dado.")

        prompt_for_summary = (
            f"Pergunta do usuário: \"{request.prompt}\"\n"
            f"Resultado da Consulta em JSON: `{json.dumps(query_result, indent=2, default=str)}`\n\n"
            f"Responda de forma amigável para o usuário, em português, com base nos dados. Seja direto e objetivo."
        )
        final_answer = call_gemini_api(prompt_for_summary, api_key)
        
        report_data = None
        if any(keyword in request.prompt.lower() for keyword in ["relatório", "pdf", "tabela"]):
            report_data = ReportData(
                title=f"Relatório para: {request.prompt}", summary=final_answer,
                table_headers=list(query_result[0].keys()) if query_result else [],
                table_rows=query_result
            )

        return LucaResponse(answer=final_answer, report_data=report_data)

    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Ocorreu um erro inesperado no servidor do LUCA: {e}")