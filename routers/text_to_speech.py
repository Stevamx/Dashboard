# /routers/text_to_speech.py
import os
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from google.cloud import texttospeech
import base64

from dependencies import verificar_token_simples

# --- IMPORTANTE ---
# Certifique-se de que a biblioteca do Google Cloud seja instalada no seu ambiente:
# pip install google-cloud-text-to-speech

# Define o caminho para o arquivo de credenciais.
# O FastAPI irá procurar o arquivo a partir do diretório raiz onde a aplicação é executada.
credentials_path = "firebase-service-account.json"
if os.path.exists(credentials_path):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = credentials_path
else:
    # Este aviso é crucial para a depuração caso o arquivo não seja encontrado.
    print(f"AVISO CRÍTICO: O arquivo de credenciais '{credentials_path}' não foi encontrado. A API de Text-to-Speech não funcionará.")

router = APIRouter(
    prefix="/api/tts",
    tags=["Text-to-Speech"],
    dependencies=[Depends(verificar_token_simples)]
)

class TTSRequest(BaseModel):
    text: str

@router.post("/", summary="Converte texto em áudio MP3 (base64)")
async def synthesize_speech(request: TTSRequest):
    """
    Recebe um texto, utiliza a API Google Cloud Text-to-Speech para gerar o áudio
    com a voz masculina pt-BR-Standard-E e retorna o conteúdo de áudio em formato base64.
    """
    try:
        # Instancia um cliente da API.
        client = texttospeech.TextToSpeechClient()

        # Define o texto de entrada.
        synthesis_input = texttospeech.SynthesisInput(text=request.text)

        # Configura a voz desejada conforme solicitado.
        voice = texttospeech.VoiceSelectionParams(
            language_code="pt-BR",
            name="pt-BR-Standard-E",
            ssml_gender=texttospeech.SsmlVoiceGender.MALE
        )

        # Seleciona o tipo de áudio de retorno (MP3).
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3
        )

        # Realiza a requisição de síntese de texto para fala.
        response = client.synthesize_speech(
            input=synthesis_input, voice=voice, audio_config=audio_config
        )

        # A resposta 'audio_content' vem em bytes. Codificamos para base64 para enviar via JSON.
        audio_base64 = base64.b64encode(response.audio_content).decode('utf-8')

        return {"audioContent": audio_base64}

    except Exception as e:
        # Verifica se o erro está relacionado à autenticação, que é o mais comum.
        if "Could not automatically determine credentials" in str(e):
             raise HTTPException(
                status_code=500,
                detail="Erro de autenticação com a API do Google Cloud. Verifique se o arquivo 'firebase-service-account.json' está configurado corretamente no servidor."
             )
        print(f"ERRO na API Text-to-Speech: {e}")
        raise HTTPException(status_code=500, detail=f"Erro interno ao gerar áudio: {e}")