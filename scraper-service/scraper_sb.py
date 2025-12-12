import sys
import json
import random
import time
import re
from seleniumbase import SB

# --- CONFIGURAÇÃO DE PROXY (WEBSHARE BR) ---
def get_proxy_string():
    # Sorteia um dos 250 proxies residenciais
    random_index = random.randint(1, 250)
    username = f"xtweuspr-BR-{random_index}"
    password = "5so72ui3knmj"
    server = "p.webshare.io"
    port = "80"
    # Formato aceito pelo SeleniumBase: USER:PASS@SERVER:PORT
    return f"{username}:{password}@{server}:{port}"

def scrape_gol(pnr, lastname, origin):
    # headless=False para você ver o processo (mude para True no servidor)
    # proxy=... define o proxy rotativo para essa sessão
    proxy_auth = get_proxy_string()
    
    with SB(uc=True, headless=False, proxy=proxy_auth) as sb:
        try:
            # 1. Navegar para a Home de Busca
            url = "https://b2c.voegol.com.br/minhas-viagens/encontrar-viagem"
            # sb.activate_cdp_mode(url) # Opcional, ajuda contra detecção pesada
            sb.open(url)
            
            # Espera o formulário carregar
            sb.assert_element('#input-reservation-ticket', timeout=30)

            # 2. Preenchimento Manual (Simulação Humana)
            # PNR
            sb.type("#input-reservation-ticket", pnr)
            sb.sleep(0.5) # Pequena pausa humana
            
            # Origem (Dropdown)
            sb.type("#input-departure", origin)
            sb.sleep(2) # Espera as sugestões aparecerem
            sb.press_keys("#input-departure", "\n") # Pressiona ENTER para selecionar a primeira opção
            sb.sleep(0.5)

            # Sobrenome
            sb.type("#input-last-name", lastname)
            sb.sleep(0.5)

            # 3. Clicar em Continuar
            # Procura o botão pelo ID ou texto
            if sb.is_element_visible("#submit-button"):
                sb.click("#submit-button")
            else:
                # Fallback se o ID mudar
                sb.click('button:contains("Continuar")')

            # 4. Espera Inteligente (Loading...)
            # Espera até achar dados ou erro
            found = False
            for _ in range(60): # 60 segundos de tolerância
                # Sinais de Sucesso
                if sb.is_text_visible("Meu voo") or sb.is_text_visible("Detalhes da viagem") or sb.is_element_visible(".pnr-info"):
                    found = True
                    break
                
                # Sinais de Erro/Bloqueio
                if sb.is_text_visible("Houve um erro") or sb.is_text_visible("Access Denied"):
                    raise Exception("GOL bloqueou ou deu erro na busca.")
                
                sb.sleep(1)

            if not found:
                sb.save_screenshot("debug_gol_timeout.png")
                raise Exception("Timeout: Dados da reserva não apareceram após clicar.")

            # 5. Extração de Dados
            # Pega o texto visível da página para buscar via Regex
            page_text = sb.get_text("body")
            
            # Voo (Ex: G3 1234)
            flight_number = "---"
            match_flight = re.search(r'(G3\s?\d{3,4})', page_text)
            if match_flight:
                flight_number = match_flight.group(1).replace(" ", "")
            
            # Data (Ex: 20/12/2024)
            departure_date = None
            match_date = re.search(r'(\d{2}/\d{2}/\d{4})', page_text)
            if match_date:
                parts = match_date.group(1).split('/')
                # Formato ISO: YYYY-MM-DD
                departure_date = f"{parts[2]}-{parts[1]}-{parts[0]}T12:00:00.000Z"

            # Retorno JSON para o Node
            result = {
                "flightNumber": flight_number,
                "departureDate": departure_date,
                "origin": origin,
                "status": "Sucesso (Formulário)"
            }
            
            print(json.dumps(result))
            
        except Exception as e:
            # Retorna erro formatado em JSON
            error_json = {"error": str(e)}
            print(json.dumps(error_json))
            sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Argumentos insuficientes"}))
        sys.exit(1)
    scrape_gol(sys.argv[1], sys.argv[2], sys.argv[3])