# -*- coding: utf-8 -*-
"""Extrai imagens e dados do PDF do cardapio do Caffe 54.

Uso: python scripts/extrair-pdf.py "caminho/do/Caffe54_imagens_bios_e_precos.pdf"

Gera:
  frontend/images/cardapio/cardapio_<categoria>_<nome-item>.jpg  (1 por pagina)
  cardapio-dados.json                                          (referencia p/ o seed)
"""
import io
import json
import os
import re
import sys
import unicodedata

import pymupdf
from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST_IMG = os.path.join(RAIZ, "frontend", "images", "cardapio")
DEST_JSON = os.path.join(RAIZ, "backend", "prisma", "cardapio-dados.json")
LARGURA_MAX = 900

# numero da pagina (1-based) -> categoria
CATEGORIAS = {
    2: "Breakfast", 3: "Breakfast", 4: "Breakfast", 5: "Breakfast",
    6: "Breakfast", 10: "Breakfast", 11: "Breakfast", 12: "Breakfast",
    7: "Sanduíches", 8: "Sanduíches", 9: "Sanduíches", 21: "Sanduíches",
    13: "Doces", 14: "Doces", 15: "Doces", 16: "Doces", 18: "Doces", 22: "Doces",
    1: "Vitrine", 17: "Vitrine", 19: "Vitrine", 20: "Vitrine", 35: "Vitrine",
    23: "Caffès Quentes", 24: "Caffès Quentes", 25: "Caffès Quentes",
    26: "Caffès Quentes", 27: "Caffès Quentes", 28: "Caffès Quentes",
    29: "Caffès Gelados", 30: "Caffès Gelados", 31: "Caffès Gelados", 32: "Caffès Gelados",
    33: "Bebidas Especiais", 34: "Bebidas Especiais",
}

# categoria -> slug usado no nome do arquivo
SLUG_CATEGORIA = {
    "Breakfast": "breakfast",
    "Sanduiches": "sandwiches",
    "Doces": "doces",
    "Vitrine": "vitrine",
    "Caffes Quentes": "caffes-quentes",
    "Caffes Gelados": "caffes-gelados",
    "Bebidas Especiais": "bebidas-especiais",
}

DESTAQUES = {2, 6, 8, 16, 26, 29, 33}


def slug(texto):
    t = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    t = re.sub(r"[^a-zA-Z0-9]+", "-", t).strip("-").lower()
    return t


def slug_ascii(texto):
    """'Caffes Quentes' a partir de 'Caffes Quentes' com acento."""
    return unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()


def parse_preco(bruto):
    """'R$ 38 (R$ 24 + R$ 14)' -> 38.0 ; 'Sem preco unico' -> 0.0"""
    m = re.search(r"R\$\s*([\d]+(?:[.,]\d{1,2})?)", bruto)
    if not m:
        return 0.0
    return float(m.group(1).replace(",", "."))


def ler_pagina(pagina):
    linhas = [l.strip() for l in pagina.get_text().split("\n") if l.strip()]
    linhas = [l for l in linhas if not l.startswith("Valores conforme")
              and not l.startswith("único, isso")]
    titulo = re.sub(r"^\d+\.\s*", "", linhas[0])
    preco_bruto = next((l for l in linhas if l.startswith("Preço:")), "")
    descricao = " ".join(l for l in linhas[1:] if not l.startswith("Preço:"))
    return titulo, preco_bruto.replace("Preço:", "").strip(), descricao


def salvar_imagem(doc, pagina, caminho):
    """Salva a maior imagem da pagina como JPEG redimensionado."""
    refs = pagina.get_images(full=True)
    if not refs:
        return False
    xref = max(refs, key=lambda r: r[2] * r[3])[0]
    bruto = doc.extract_image(xref)
    img = Image.open(io.BytesIO(bruto["image"]))
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    if img.width > LARGURA_MAX:
        altura = round(img.height * LARGURA_MAX / img.width)
        img = img.resize((LARGURA_MAX, altura), Image.LANCZOS)
    img.save(caminho, "JPEG", quality=78, optimize=True, progressive=True)
    return True


def main():
    pdf = sys.argv[1] if len(sys.argv) > 1 else os.path.join(RAIZ, "Caffe54_imagens_bios_e_precos.pdf")
    if not os.path.exists(pdf):
        sys.exit("PDF nao encontrado: %s" % pdf)

    os.makedirs(DEST_IMG, exist_ok=True)
    doc = pymupdf.open(pdf)
    itens = []

    for i, pagina in enumerate(doc):
        n = i + 1
        titulo, preco_bruto, descricao = ler_pagina(pagina)
        categoria = CATEGORIAS.get(n, "Vitrine")
        arquivo = "cardapio_%s_%s.jpg" % (SLUG_CATEGORIA[slug_ascii(categoria)], slug(titulo))

        if not salvar_imagem(doc, pagina, os.path.join(DEST_IMG, arquivo)):
            print("  ! sem imagem na pagina %d" % n)
            arquivo = ""

        itens.append({
            "nome": titulo,
            "categoria": categoria,
            "preco": parse_preco(preco_bruto),
            "precoTexto": preco_bruto,
            "descricao": descricao,
            "imagem": arquivo,
            "destaque": n in DESTAQUES,
        })
        print("%02d  %-34.34s %-18s R$ %6.2f  %s" % (n, titulo, categoria, itens[-1]["preco"], arquivo))

    with io.open(DEST_JSON, "w", encoding="utf-8") as f:
        json.dump(itens, f, ensure_ascii=False, indent=2)

    print("\n%d itens -> backend/prisma/cardapio-dados.json" % len(itens))
    print("%d imagens -> frontend/images/cardapio/" % len([i for i in itens if i["imagem"]]))


if __name__ == "__main__":
    main()
