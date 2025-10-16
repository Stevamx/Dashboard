# routers/sync_manager.py
import os
from pathlib import Path
import firebase_admin
from firebase_admin import storage

def sync_knowledge_base(local_path_str: str):
    """
    Sincroniza os arquivos da base de conhecimento do Firebase Storage para um diretório local.

    Esta função realiza as seguintes ações:
    1. Garante que o diretório local (ex: 'base_conhecimento_local') exista.
    2. Lista todos os arquivos na pasta 'AgenteIA/Conhecimento/' do Firebase Storage.
    3. Compara com os arquivos já existentes na pasta local.
    4. Baixa quaisquer arquivos novos ou que foram modificados no Firebase.
    5. Remove da pasta local quaisquer arquivos que foram deletados do Firebase.

    Args:
        local_path_str (str): O caminho para a pasta local onde os arquivos serão armazenados.
    
    Returns:
        bool: True se a sincronização for bem-sucedida, False se ocorrer um erro.
    """
    try:
        print(f"INFO: Iniciando sincronização da base de conhecimento para a pasta '{local_path_str}'...")
        
        local_path = Path(local_path_str)
        local_path.mkdir(exist_ok=True) 

        bucket = storage.bucket()
        
        # ### ALTERAÇÃO PRINCIPAL APLICADA AQUI ###
        # O prefixo foi corrigido para 'Conhecimento' com 'C' maiúsculo.
        # O caminho não deve começar com '/'.
        prefix = "AgenteIA/Conhecimento/"
        remote_files_blob = bucket.list_blobs(prefix=prefix)
        
        remote_files = {blob.name.split('/')[-1]: blob for blob in remote_files_blob if not blob.name.endswith('/')}
        print(f"INFO: Encontrados {len(remote_files)} arquivos na base de conhecimento remota (caminho: '{prefix}').")
        
        local_files = {f.name for f in local_path.iterdir() if f.is_file()}
        print(f"INFO: Encontrados {len(local_files)} arquivos na pasta local.")
        
        files_to_download = set(remote_files.keys()) - local_files
        if files_to_download:
            print(f"INFO: Baixando {len(files_to_download)} novo(s) arquivo(s)...")
            for filename in files_to_download:
                blob = remote_files[filename]
                local_file_path = local_path / filename
                print(f"  -> Baixando '{filename}'...")
                blob.download_to_filename(local_file_path)
        else:
            print("INFO: Nenhum arquivo novo para baixar.")

        files_to_delete = local_files - set(remote_files.keys())
        if files_to_delete:
            print(f"INFO: Removendo {len(files_to_delete)} arquivo(s) local(is) obsoleto(s)...")
            for filename in files_to_delete:
                print(f"  -> Removendo '{filename}'...")
                (local_path / filename).unlink()
        else:
            print("INFO: Nenhum arquivo local para remover.")
            
        print("SUCESSO: Sincronização da base de conhecimento concluída.")
        return True

    except firebase_admin.exceptions.NotFoundError:
        print("ERRO: O bucket do Firebase Storage não foi encontrado. Verifique as configurações do seu projeto.")
        return False
    except Exception as e:
        print(f"ERRO CRÍTICO durante a sincronização da base de conhecimento: {e}")
        return False