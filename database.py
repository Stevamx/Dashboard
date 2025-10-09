# database.py
import fdb
import configparser
import sys
import os

def connect():
    """
    Estabelece e retorna uma conexão com o banco de dados Firebird,
    lendo as configurações do arquivo 'config.ini'.
    """
    config = configparser.ConfigParser()
    
    if not os.path.exists('config.ini'):
        print("ERRO CRÍTICO: O arquivo 'config.ini' não foi encontrado.", file=sys.stderr)
        return None

    try:
        config.read('config.ini')
        db_config = config['FIREBIRD']
    except KeyError:
        print("ERRO CRÍTICO: A seção [FIREBIRD] não foi encontrada no arquivo 'config.ini'.", file=sys.stderr)
        return None

    try:
        # print("Tentando conectar ao banco de dados (usando config.ini)...")
        conn = fdb.connect(
            host=db_config.get('host', 'localhost'),
            port=db_config.getint('port', 3050),
            database=db_config.get('database'),
            user=db_config.get('user', 'SYSDBA'),
            password=db_config.get('password', ''),
            charset=db_config.get('charset', 'WIN1252')
        )
        # print("Conexão com o Firebird estabelecida com sucesso!")
        return conn
    except fdb.Error as e:
        print(f"Erro ao conectar ao Firebird: {e}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"Ocorreu um erro inesperado ao ler as configurações ou conectar: {e}", file=sys.stderr)
        return None

def get_company_id_by_cnpj(cnpj: str) -> int | None:
    """
    Busca o CODIGO (chave primária/estrangeira) no banco de dados
    a partir de um CNPJ/CPF. Retorna o ID ou None se não encontrado.
    """
    cnpj_limpo = ''.join(filter(str.isdigit, str(cnpj).strip()))
    if not cnpj_limpo:
        return None

    conn = connect()
    if conn is None:
        raise ConnectionError("Não foi possível conectar ao banco de dados Firebird para validar a empresa.")
    
    try:
        cur = conn.cursor()
        # --- CORREÇÃO APLICADA AQUI ---
        # Trocado 'ID_EMPRESA' por 'CODIGO', que é o nome mais provável da coluna.
        cur.execute("SELECT CODIGO FROM TGEREMPRESA WHERE CPFCNPJ = ?", (cnpj_limpo,))
        row = cur.fetchone()
        
        conn.close()

        if row:
            return row[0]
        return None
    except fdb.Error as e:
        print(f"Erro de banco de dados ao buscar ID da empresa: {e}", file=sys.stderr)
        conn.close()
        # Retorna None para que a dependência possa tratar como empresa não encontrada.
        return None