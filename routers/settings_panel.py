# /routers/settings_panel.py
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from dependencies import verificar_admin_realtime_db

router = APIRouter(
    prefix="/settings", 
    tags=["Settings"],
    dependencies=[Depends(verificar_admin_realtime_db)] 
)

class SystemSettings(BaseModel):
    setting_name: str
    setting_value: bool

@router.get("/")
def get_admin_settings():
    return {"message": "Bem-vindo ao painel de Configurações!"}

@router.post("/")
def update_admin_settings(settings: SystemSettings):
    print(f"Configuração '{settings.setting_name}' atualizada para '{settings.setting_value}'.")
    return {"status": "success", "updated_setting": settings}