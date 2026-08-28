/* ===================================================================
   Configuração técnica do frontend.

   Os dados do café (link do botão "Pedir", Instagram, endereço,
   telefone, e-mail e horário) NÃO ficam aqui: são editados pelo
   painel administrativo e carregados da API em GET /config.
   =================================================================== */

const CONFIG = {
  // Endereço da API. Vazio = o mesmo servidor que entrega o site.
  api: "",

  // Pasta onde ficam as fotos do cardápio.
  pastaImagens: "images/cardapio/",

  // Chaves usadas para guardar a sessão do admin no navegador.
  chaveToken: "adminToken",
  chaveUsuario: "adminUsuario",
};
