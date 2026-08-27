# -*- coding: utf-8 -*-
"""Tira screenshots do site em desktop, tablet e mobile.

Uso: python scripts/olhar-site.py [pasta-de-saida]
O servidor precisa estar rodando em http://localhost:3001
"""
import os
import sys

from playwright.sync_api import sync_playwright

URL = "http://localhost:3001"
SAIDA = sys.argv[1] if len(sys.argv) > 1 else "capturas"

TELAS = [
    ("desktop", 1440, 900, False),
    ("tablet", 768, 1024, False),
    ("mobile", 375, 812, True),
]

os.makedirs(SAIDA, exist_ok=True)

with sync_playwright() as p:
    navegador = p.chromium.launch(headless=True)
    erros = []

    for nome, largura, altura, movel in TELAS:
        contexto = navegador.new_context(
            viewport={"width": largura, "height": altura},
            device_scale_factor=2,
            is_mobile=movel,
            has_touch=movel,
        )
        pagina = contexto.new_page()
        pagina.on("console", lambda m: erros.append(f"[console:{m.type}] {m.text}")
                  if m.type in ("error", "warning") else None)
        pagina.on("pageerror", lambda e: erros.append(f"[pageerror] {e}"))

        pagina.goto(URL, wait_until="networkidle")
        pagina.wait_for_timeout(1200)  # fontes do Google

        # topo da página
        pagina.screenshot(path=f"{SAIDA}/{nome}-topo.png")
        # página inteira
        pagina.screenshot(path=f"{SAIDA}/{nome}-completo.png", full_page=True)

        print(f"{nome:8} {largura}x{altura}  ->  {SAIDA}/{nome}-topo.png")
        contexto.close()

    # painel administrativo aberto
    contexto = navegador.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
    pagina = contexto.new_page()
    pagina.goto(URL, wait_until="networkidle")
    pagina.click("#gatilho-admin")
    pagina.wait_for_timeout(600)
    pagina.screenshot(path=f"{SAIDA}/admin-login.png")
    print(f"admin    login       ->  {SAIDA}/admin-login.png")
    contexto.close()

    navegador.close()

if erros:
    print("\nProblemas no console:")
    for erro in dict.fromkeys(erros):
        print(" ", erro)
else:
    print("\nConsole limpo: nenhum erro.")
