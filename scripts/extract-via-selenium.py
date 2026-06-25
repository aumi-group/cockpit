"""
Extrai auth_token + ct0 de x.com via Selenium.

Estratégia:
1. Abre Chrome controlado pelo Selenium em um perfil temporário
2. Navega pra x.com — se não estiver logado, pausa pra usuário logar manualmente
3. Lê os cookies via driver.get_cookies()
4. Salva em .cookies-extracted.json

Como Selenium controla o Chrome direto, não depende de CDP do user profile
nem de policy corporativa.
"""
import json
import os
import sys
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service

PROJECT_DIR = Path(__file__).parent.parent
PROFILE_DIR = Path(os.environ.get("TEMP", "C:/tmp")) / "aumi-selenium-profile"
OUT_FILE = PROJECT_DIR / ".cookies-extracted.json"

def main():
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)

    options = Options()
    options.add_argument(f"--user-data-dir={PROFILE_DIR}")
    options.add_argument("--no-first-run")
    options.add_argument("--no-default-browser-check")
    options.add_argument("--disable-blink-features=AutomationControlled")
    # Esconder bandeira de "Chrome controlado por software automatizado"
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)

    print(f"→ profile: {PROFILE_DIR}", flush=True)
    print(f"→ iniciando Chrome via Selenium…", flush=True)

    driver = webdriver.Chrome(options=options)
    driver.maximize_window()
    try:
        driver.execute_cdp_cmd(
            "Page.addScriptToEvaluateOnNewDocument",
            {"source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"},
        )

        print("→ abrindo https://x.com/home …", flush=True)
        driver.get("https://x.com/home")
        time.sleep(3)

        cookies = driver.get_cookies()
        auth = next((c for c in cookies if c["name"] == "auth_token"), None)
        ct0 = next((c for c in cookies if c["name"] == "ct0"), None)

        if not auth or not ct0:
            print("⚠ não logado no x.com nesse perfil. Faça login na janela aberta.", flush=True)
            print("→ aguardando login (até 5 min). Quando logar, este script captura automático.", flush=True)
            print("→ Eu vou notificar via Telegram que você precisa logar.", flush=True)
            try:
                import urllib.request, urllib.parse
                token = '8878073526:AAECfTHdQzOfIpLIQ9q370Mogjrw73IPrJo'
                chat = '5166650114'
                msg = "JANELA SELENIUM ABERTA — clica no novo Chrome e loga no x.com com @blzzjao. Capturo automatico"
                urllib.request.urlopen(
                    f"https://api.telegram.org/bot{token}/sendMessage",
                    data=urllib.parse.urlencode({'chat_id': chat, 'text': msg}).encode()
                )
            except Exception as e:
                print(f"  (telegram falhou: {e})", flush=True)

            for i in range(240):  # 240 × 5s = 20 min
                time.sleep(5)
                cookies = driver.get_cookies()
                auth = next((c for c in cookies if c["name"] == "auth_token"), None)
                ct0 = next((c for c in cookies if c["name"] == "ct0"), None)
                if auth and ct0:
                    print(f"  ✓ login detectado em {(i+1)*5}s", flush=True)
                    break
                if i % 12 == 0:
                    print(f"  …aguardando login ({(i+1)*5}s / 1200s) — URL atual: {driver.current_url[:80]}", flush=True)

        if not auth or not ct0:
            print("✗ login não detectado em 20 min. Saindo.", flush=True)
            sys.exit(2)

        out = {
            "AUTH_TOKEN": auth["value"],
            "CT0": ct0["value"],
            "extracted_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        OUT_FILE.write_text(json.dumps(out, indent=2))

        print(f"\n=== EXTRACTED ===")
        print(f"AUTH_TOKEN={auth['value']}")
        print(f"CT0={ct0['value']}")
        print(f"\nauth_token: {len(auth['value'])}b, ct0: {len(ct0['value'])}b")
        print(f"saved: {OUT_FILE}")
    finally:
        driver.quit()

if __name__ == "__main__":
    main()
