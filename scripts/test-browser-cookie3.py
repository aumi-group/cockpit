"""
Caminho C: testa browser-cookie3 para extrair auth_token e ct0 do x.com via Chrome.
Se ABE bloquear, imprime o erro exato e sai com código 1.
"""
import sys, json, datetime

try:
    import browser_cookie3
except ImportError:
    print("ERROR: browser-cookie3 não instalado")
    sys.exit(1)

try:
    cj = browser_cookie3.chrome(domain_name='x.com')
    results = {}
    for c in cj:
        if c.name in ('auth_token', 'ct0'):
            results[c.name] = c.value

    if 'auth_token' in results and 'ct0' in results:
        out = {
            "AUTH_TOKEN": results['auth_token'],
            "CT0": results['ct0'],
            "extracted_at": datetime.datetime.utcnow().isoformat() + "Z"
        }
        with open(r'D:\aumi-cockpit\.cookies-extracted.json', 'w') as f:
            json.dump(out, f, indent=2)
        print("SUCCESS")
        print(f"auth_token[:6]={results['auth_token'][:6]}")
        print(f"ct0[:6]={results['ct0'][:6]}")
        print("Salvo em .cookies-extracted.json")
    else:
        print(f"PARTIAL: encontrou apenas {list(results.keys())}")
        sys.exit(2)

except Exception as e:
    print(f"ERROR: {type(e).__name__}: {e}")
    sys.exit(1)
