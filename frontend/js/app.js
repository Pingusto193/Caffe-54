/* ===================================================================
   Caffè 54 — site e painel administrativo
   JavaScript puro, sem dependências.
   =================================================================== */

const CATEGORIAS = [
  "Breakfast",
  "Sanduíches",
  "Doces",
  "Vitrine",
  "Caffès Quentes",
  "Caffès Gelados",
  "Bebidas Especiais",
];

const IMAGEM_RESERVA =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
       <rect width="400" height="300" fill="#E8EBE3"/>
       <text x="200" y="170" text-anchor="middle" fill="#8B9D83"
             font-family="Georgia, serif" font-size="88">C</text>
     </svg>`
  );

let pratos = [];
let config = {};
let filtroAtivo = "Todos";
let editandoId = null;
let termoBusca = "";

const $ = (seletor) => document.querySelector(seletor);
const $$ = (seletor) => document.querySelectorAll(seletor);

/* ===================================================================
   Utilidades
   =================================================================== */

function escapar(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (caractere) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[caractere]);
}

function formatarPreco(preco) {
  const valor = Number(preco);
  if (!valor || valor <= 0) return "Consultar";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function inicial(nome) {
  return escapar(String(nome).trim().charAt(0).toUpperCase() || "C");
}

function notificar(mensagem, tipo = "sucesso") {
  const aviso = document.createElement("div");
  aviso.className = `notificacao ${tipo}`;
  aviso.textContent = mensagem;
  $("#notificacoes").append(aviso);
  setTimeout(() => aviso.remove(), 3600);
}

const pegarToken = () => localStorage.getItem(CONFIG.chaveToken);

/* ---------- chamadas à API ---------- */

async function api(caminho, opcoes = {}) {
  const cabecalhos = { ...(opcoes.headers || {}) };
  if (opcoes.body) cabecalhos["Content-Type"] = "application/json";

  const token = pegarToken();
  if (token) cabecalhos.Authorization = `Bearer ${token}`;

  const resposta = await fetch(CONFIG.api + caminho, { ...opcoes, headers: cabecalhos });

  if (resposta.status === 401 && token) {
    sair();
    throw new Error("Sua sessão expirou. Entre novamente.");
  }
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}));
    throw new Error(corpo.error || `Erro ${resposta.status}`);
  }
  return resposta.status === 204 ? null : resposta.json();
}

/* ===================================================================
   Configuração do site (link do botão, contato, textos)
   =================================================================== */

// Para onde o botão "Pedir" leva. Quem define é o admin, em /config.
// Enquanto não houver link cadastrado, o botão simplesmente não aparece.
function destinoDoPedido() {
  return config.linkPedido || "";
}

function aplicarConfig() {
  const destino = destinoDoPedido();
  const rotulo = config.textoBotao || "Pedir";

  $$("[data-link-pedido]").forEach((elemento) => {
    if (destino) {
      elemento.href = destino;
      elemento.hidden = false;
    } else {
      elemento.hidden = true;
    }
  });

  $$("[data-texto-botao]").forEach((elemento) => { elemento.textContent = rotulo; });
  $$("[data-nome-cafe]").forEach((elemento) => { elemento.textContent = config.nome || "Caffè 54"; });
  $$("[data-descricao-cafe]").forEach((elemento) => {
    elemento.textContent = config.descricao || "Sofisticação Italiana";
  });

  // rodapé
  $$("[data-horario]").forEach((el) => { el.textContent = config.horario || ""; });
  $$("[data-endereco]").forEach((el) => { el.textContent = config.endereco || ""; });

  $$("[data-telefone]").forEach((elemento) => {
    elemento.textContent = config.telefone || "";
    elemento.href = config.telefone ? `tel:+55${config.telefone.replace(/\D/g, "")}` : "#";
    elemento.hidden = !config.telefone;
  });

  $$("[data-email]").forEach((elemento) => {
    elemento.textContent = config.email || "";
    elemento.href = config.email ? `mailto:${config.email}` : "#";
    elemento.hidden = !config.email;
  });

  const perfil = config.instagram
    ? { url: `https://instagram.com/${config.instagram}`, arroba: `@${config.instagram}` }
    : null;

  $$("[data-instagram]").forEach((elemento) => {
    elemento.href = perfil ? perfil.url : "#";
    elemento.hidden = !perfil;
  });
  $$("[data-instagram-usuario]").forEach((elemento) => {
    elemento.textContent = perfil ? perfil.arroba : "";
  });

  $$("[data-nota-pedido]").forEach((elemento) => {
    elemento.textContent = destino ? `Pedidos pelo botão "${rotulo}".` : "";
  });
  const faixa = document.querySelector(".rodape-base");
  if (faixa) faixa.hidden = !destino;

  // sem nenhum dado de contato o rodapé vira só a assinatura, centralizada
  const semContato = !(config.endereco || config.telefone || config.email ||
                       config.instagram || config.horario);
  document.querySelector(".rodape").classList.toggle("rodape-so-marca", semContato);

  // esconde os blocos do rodapé que não têm conteúdo
  const preenchido = {
    endereco: Boolean(config.endereco),
    contato: Boolean(config.telefone || config.email),
    instagram: Boolean(config.instagram),
  };
  for (const [bloco, tem] of Object.entries(preenchido)) {
    const alvo = document.querySelector(`[data-bloco="${bloco}"]`);
    if (alvo) alvo.hidden = !tem;
  }

  // preenche o formulário de configuração do painel
  const formulario = $("#formulario-config");
  for (const campo of ["linkPedido", "textoBotao", "nome", "descricao",
                       "instagram", "endereco", "telefone", "email", "horario"]) {
    if (formulario.elements[campo]) formulario.elements[campo].value = config[campo] || "";
  }
}

async function carregarConfig() {
  try {
    config = await api("/config");
  } catch {
    config = {};
  }
  aplicarConfig();
}

/* ===================================================================
   Cardápio
   =================================================================== */

// Ordena na sequência das categorias do menu (Breakfast primeiro),
// com os destaques no topo de cada categoria.
function ordenarPratos(lista) {
  const posicao = (categoria) => {
    const indice = CATEGORIAS.indexOf(categoria);
    return indice === -1 ? CATEGORIAS.length : indice;
  };
  return [...lista].sort(
    (a, b) =>
      posicao(a.categoria) - posicao(b.categoria) ||
      Number(b.destaque) - Number(a.destaque) ||
      a.nome.localeCompare(b.nome, "pt-BR")
  );
}

async function carregarCardapio() {
  if (!pratos.length) esqueleto();
  try {
    pratos = ordenarPratos(await api("/menu"));
    $("#aviso").hidden = true;
    montarFiltros();
    montarGrade();
    montarListaImagens();
    montarCapa();
    if (pegarToken()) montarListaAdmin();
  } catch (erro) {
    $("#aviso").hidden = false;
    $("#aviso").textContent =
      "Não foi possível carregar o cardápio. Verifique se o servidor está rodando.";
  }
}

const NOME_PADRAO = "Caffè 54";
let primeiraMontagem = true;

function montarFiltros() {
  const presentes = new Set(pratos.map((prato) => prato.categoria));
  const lista = ["Todos", ...CATEGORIAS.filter((categoria) => presentes.has(categoria))];

  $("#filtros").innerHTML = lista
    .map(
      (categoria, indice) => `
      <button type="button" role="tab" class="filtro${primeiraMontagem ? "" : " entrou"}"
              ${primeiraMontagem ? `data-entrada style="--atraso: ${360 + indice * 55}ms"` : ""}
              aria-selected="${categoria === filtroAtivo}"
              data-categoria="${escapar(categoria)}">${escapar(categoria)}</button>`
    )
    .join("");

  if (primeiraMontagem) {
    primeiraMontagem = false;
    liberarEntrada();
  }
}

function montarGrade() {
  const visiveis =
    filtroAtivo === "Todos"
      ? pratos
      : pratos.filter((prato) => prato.categoria === filtroAtivo);

  if (!visiveis.length) {
    $("#grade").innerHTML = "";
    $("#aviso").hidden = false;
    $("#aviso").textContent = "Nenhum item nesta categoria por enquanto.";
    return;
  }

  $("#aviso").hidden = true;

  // Em "Todos" o cardápio é dividido por categoria, com título em cada bloco.
  // Filtrando uma categoria só, o título seria redundante com a pill ativa.
  if (filtroAtivo !== "Todos") {
    $("#grade").innerHTML = `<div class="grade">${visiveis.map(cartaoHTML).join("")}</div>`;
    revelarNovos();
    return;
  }

  const grupos = CATEGORIAS.map((categoria) => [
    categoria,
    visiveis.filter((prato) => prato.categoria === categoria),
  ]).filter(([, itens]) => itens.length);

  $("#grade").innerHTML = grupos
    .map(
      ([categoria, itens]) => `
      <section class="grupo">
        <header class="grupo-cabecalho" data-revelar>
          <h2 class="grupo-titulo">${escapar(categoria)}</h2>
          <span class="grupo-contagem">${itens.length} ${itens.length === 1 ? "item" : "itens"}</span>
        </header>
        <div class="grade">${itens.map(cartaoHTML).join("")}</div>
      </section>`
    )
    .join("");

  revelarNovos();
}

function esqueleto() {
  const bloco = `
    <div class="cartao cartao-esqueleto">
      <div class="esq-figura"></div>
      <div class="cartao-corpo">
        <div class="esq-linha esq-curta"></div>
        <div class="esq-linha esq-titulo"></div>
        <div class="esq-linha"></div>
        <div class="esq-linha esq-media"></div>
      </div>
    </div>`;
  $("#grade").innerHTML = `<div class="grade">${bloco.repeat(8)}</div>`;
}

function cartaoHTML(prato) {
  const semPreco = !prato.preco || Number(prato.preco) <= 0;
  const destino = destinoDoPedido();
  const rotulo = escapar(config.textoBotao || "Pedir");

  const figura = prato.imagem
    ? `<img src="${CONFIG.pastaImagens}${escapar(prato.imagem)}"
            alt="${escapar(prato.nome)}" loading="lazy" decoding="async"
            onerror="this.onerror=null;this.src='${IMAGEM_RESERVA}'">`
    : `<div class="cartao-vazio">${inicial(prato.nome)}</div>`;

  const botao = destino
    ? `<a class="botao botao-ouro-leve botao-largo" href="${escapar(destino)}"
           target="_blank" rel="noopener">${rotulo}</a>`
    : "";

  return `
    <article class="cartao" data-revelar>
      <button type="button" class="cartao-foto" data-id="${prato.id}"
              aria-label="Ver a foto de ${escapar(prato.nome)}">
        ${figura}
        ${prato.destaque ? `<span class="selo">Destaque</span>` : ""}
        <span class="cartao-ampliar" aria-hidden="true">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M15.8 15.8L20 20"/></svg>
        </span>
      </button>
      <div class="cartao-corpo">
        <span class="cartao-categoria">${escapar(prato.categoria)}</span>
        <h3 class="cartao-nome">${escapar(prato.nome)}</h3>
        <p class="cartao-descricao">${escapar(prato.descricao || "")}</p>
        <p class="cartao-preco ${semPreco ? "consulta" : ""}">${formatarPreco(prato.preco)}</p>
        ${botao}
      </div>
    </article>`;
}

/* ---------- foto ampliada ---------- */

function abrirLupa(id) {
  const prato = pratos.find((item) => item.id === Number(id));
  if (!prato) return;

  const imagem = $("#lupa-imagem");
  if (prato.imagem) {
    imagem.src = CONFIG.pastaImagens + prato.imagem;
    imagem.alt = prato.nome;
    imagem.hidden = false;
  } else {
    imagem.removeAttribute("src");
    imagem.hidden = true;
  }

  $("#lupa-categoria").textContent = prato.categoria;
  $("#lupa-nome").textContent = prato.nome;
  $("#lupa-descricao").textContent = prato.descricao || "";
  $("#lupa-preco").textContent = formatarPreco(prato.preco);
  $("#lupa-pedir").hidden = !destinoDoPedido();

  $("#lupa").showModal();
}

/* ===================================================================
   Painel administrativo
   =================================================================== */

function estaLogado() {
  return Boolean(pegarToken());
}

function abrirPainel() {
  $("#sobreposicao").hidden = false;
  $("#admin").hidden = false;
  document.body.style.overflow = "hidden";
  mostrarPainel(estaLogado());
  (estaLogado() ? $("#busca") : $("#login-email")).focus();
}

function fecharPainel() {
  $("#sobreposicao").hidden = true;
  $("#admin").hidden = true;
  document.body.style.overflow = "";
  $("#gatilho-admin").focus();
}

function mostrarPainel(logado) {
  $("#formulario-login").hidden = logado;
  $("#dashboard").hidden = !logado;
  $("#admin-titulo").textContent = logado ? "Painel" : "Acesso restrito";
  if (logado) montarListaAdmin();
}

function sair() {
  localStorage.removeItem(CONFIG.chaveToken);
  localStorage.removeItem(CONFIG.chaveEmail);
  editandoId = null;
  mostrarPainel(false);
}

function montarSeletores() {
  const opcoes = CATEGORIAS.map(
    (categoria) => `<option value="${escapar(categoria)}">${escapar(categoria)}</option>`
  ).join("");

  $$(".seletor-categoria").forEach((seletor) => {
    const atual = seletor.dataset.valor || "";
    seletor.innerHTML =
      `<option value="" disabled ${atual ? "" : "selected"}>Selecione</option>${opcoes}`;
    if (atual) seletor.value = atual;
  });
}

async function montarListaImagens() {
  // logado, pergunta a pasta inteira: assim as fotos recém-enviadas
  // aparecem mesmo antes de estarem ligadas a algum item
  let nomes = [...new Set(pratos.map((prato) => prato.imagem).filter(Boolean))];
  if (pegarToken()) {
    try {
      nomes = await api("/imagens");
    } catch {
      /* mantém a lista derivada do cardápio */
    }
  }
  $("#imagens-disponiveis").innerHTML = [...nomes]
    .sort()
    .map((nome) => `<option value="${escapar(nome)}"></option>`)
    .join("");
}

function montarListaAdmin() {
  const termo = termoBusca.trim().toLowerCase();
  const visiveis = termo
    ? pratos.filter(
        (prato) =>
          prato.nome.toLowerCase().includes(termo) ||
          prato.categoria.toLowerCase().includes(termo)
      )
    : pratos;

  $("#contagem").textContent = termo
    ? `${visiveis.length} de ${pratos.length}`
    : `${pratos.length} itens`;

  $("#lista").innerHTML = visiveis.map(itemAdminHTML).join("");
  $("#lista-vazia").hidden = visiveis.length > 0;
  montarSeletores();
}

function itemAdminHTML(prato) {
  const miniatura = prato.imagem
    ? `<img src="${CONFIG.pastaImagens}${escapar(prato.imagem)}" alt=""
            class="item-miniatura" loading="lazy"
            onerror="this.onerror=null;this.src='${IMAGEM_RESERVA}'">`
    : `<div class="item-miniatura miniatura-vazia">${inicial(prato.nome)}</div>`;

  return `
    <li class="item" data-id="${prato.id}">
      <div class="item-linha">
        ${miniatura}
        <div class="item-info">
          <span class="item-nome">
            ${escapar(prato.nome)}${prato.destaque ? ` <span class="item-estrela">&#9733;</span>` : ""}
          </span>
          <span class="item-detalhe">${escapar(prato.categoria)} · ${formatarPreco(prato.preco)}</span>
        </div>
        <div class="item-acoes">
          <button type="button" class="acao acao-editar" data-id="${prato.id}">Editar</button>
          <button type="button" class="acao acao-remover" data-id="${prato.id}">Deletar</button>
        </div>
      </div>
      ${editandoId === prato.id ? editorHTML(prato) : ""}
    </li>`;
}

function editorHTML(prato) {
  const previa = prato.imagem
    ? `<img src="${CONFIG.pastaImagens}${escapar(prato.imagem)}" alt=""
            onerror="this.onerror=null;this.src='${IMAGEM_RESERVA}'">`
    : `<div class="miniatura-vazia">${inicial(prato.nome)}</div>`;

  return `
    <form class="editor" data-id="${prato.id}" novalidate>
      <div class="editor-imagem">
        ${previa}
        <span class="editor-legenda">
          Imagem atual:<br>
          <strong>${escapar(prato.imagem || "Nenhuma imagem")}</strong><br>
          Apague o campo para remover a imagem.
        </span>
      </div>

      <label class="campo">
        <span>Nome <em>*</em></span>
        <input type="text" name="nome" value="${escapar(prato.nome)}" required>
      </label>
      <label class="campo">
        <span>Descrição <em>*</em></span>
        <textarea name="descricao" rows="3" required>${escapar(prato.descricao || "")}</textarea>
      </label>
      <div class="dupla">
        <label class="campo">
          <span>Preço (R$) <em>*</em></span>
          <input type="number" name="preco" step="0.01" min="0" value="${prato.preco}" required>
        </label>
        <label class="campo">
          <span>Categoria <em>*</em></span>
          <select name="categoria" class="seletor-categoria"
                  data-valor="${escapar(prato.categoria)}" required></select>
        </label>
      </div>
      <div class="campo-imagem">
        <label class="campo">
          <span>Imagem <small>(apague para remover)</small></span>
          <input type="text" name="imagem" list="imagens-disponiveis"
                 value="${escapar(prato.imagem || "")}" placeholder="Nenhuma imagem">
        </label>
        <div class="envio">
          <label class="botao botao-contorno botao-pequeno rotulo-arquivo">
            Enviar do computador
            <input type="file" data-upload accept="image/jpeg,image/png,image/webp,image/avif" hidden>
          </label>
          <span class="envio-aviso" data-envio-aviso></span>
        </div>
        <figure class="previa" data-previa ${prato.imagem ? "" : "hidden"}>
          <img alt="" src="${prato.imagem ? CONFIG.pastaImagens + escapar(prato.imagem) : ""}">
        </figure>
      </div>
      <label class="marcador">
        <input type="checkbox" name="destaque" ${prato.destaque ? "checked" : ""}>
        <span>Marcar como destaque</span>
      </label>
      <label class="marcador">
        <input type="checkbox" name="carrossel" ${prato.carrossel ? "checked" : ""}>
        <span>Mostrar no carrossel da capa</span>
      </label>

      <div class="editor-acoes">
        <button type="submit" class="botao botao-ouro">Salvar</button>
        <button type="button" class="botao botao-contorno acao-cancelar">Cancelar</button>
      </div>
    </form>`;
}

/* ---------- validação de formulário ---------- */

function validarItem(dados) {
  if (!dados.nome.trim()) return "Informe o nome do item.";
  if (!dados.descricao.trim()) return "Informe a descrição do item.";
  if (dados.preco === "" || Number.isNaN(Number(dados.preco))) return "Informe um preço válido.";
  if (Number(dados.preco) < 0) return "O preço não pode ser negativo.";
  if (!dados.categoria) return "Escolha uma categoria.";
  return null;
}

/* ===================================================================
   Carrossel da capa
   As fotos são as dos itens marcados no painel. Sem nenhum marcado,
   cai nos destaques; sem destaques, fica a foto fixa do hero.
   =================================================================== */

const SEGUNDOS_CAPA = 5.5;

let slides = [];
let slideAtual = 0;
let relogioCapa = null;

function pratosDaCapa() {
  const marcados = pratos.filter((prato) => prato.carrossel && prato.imagem);
  if (marcados.length) return marcados;
  return pratos.filter((prato) => prato.destaque && prato.imagem);
}

function montarCapa() {
  slides = pratosDaCapa();
  const caixa = $("#hero-fotos");

  if (slides.length < 1) {
    $("#hero-prato").hidden = true;
    $("#hero-controles").hidden = true;
    $("#hero-vitrine").hidden = true;
    return;
  }

  // a foto só recebe src quando chega a vez dela: 7 imagens de uma vez
  // atrasariam a primeira pintura sem necessidade
  caixa.innerHTML = slides
    .map(
      (prato, i) => `
      <div class="hero-slide${i === 0 ? " ativo" : ""}" data-slide="${i}">
        <img alt="${escapar(prato.nome)}" data-foto="${CONFIG.pastaImagens}${escapar(prato.imagem)}"
             ${i === 0 ? "fetchpriority=\"high\"" : ""}>
      </div>`
    )
    .join("");

  $("#hero-vitrine").innerHTML = slides
    .map(
      (prato, i) => `
      <figure class="hero-foto${i === 0 ? " ativo" : ""}" data-foto-slide="${i}">
        <img alt="${escapar(prato.nome)}" data-foto="${CONFIG.pastaImagens}${escapar(prato.imagem)}">
      </figure>`
    )
    .join("");

  $("#hero-vitrine").hidden = false;

  $("#hero-pontos").innerHTML = slides
    .map(
      (prato, i) => `
      <button type="button" role="tab" class="hero-ponto" data-ir="${i}"
              aria-selected="${i === 0}" aria-label="${escapar(prato.nome)}"></button>`
    )
    .join("");

  $("#hero-prato").hidden = false;
  $("#hero-controles").hidden = slides.length < 2;

  slideAtual = 0;
  carregarFoto(0);
  carregarFoto(1);
  escreverPrato(slides[0]);

  if (slides.length > 1) ligarRelogio();
}

function carregarFoto(indice) {
  const slide = slides[indice];
  if (!slide) return;
  document
    .querySelectorAll(`.hero-slide[data-slide="${indice}"] img, .hero-foto[data-foto-slide="${indice}"] img`)
    .forEach((img) => { if (!img.src) img.src = img.dataset.foto; });
}

function escreverPrato(prato) {
  const caixa = $("#hero-prato");
  caixa.classList.add("trocando");
  setTimeout(() => {
    $("#hero-prato-categoria").textContent = prato.categoria;
    $("#hero-prato-nome").textContent = prato.nome;
    $("#hero-prato-preco").textContent = formatarPreco(prato.preco);
    caixa.classList.remove("trocando");
  }, semMovimento ? 0 : 220);
}

function irParaSlide(indice) {
  if (!slides.length) return;
  const destino = (indice + slides.length) % slides.length;
  if (destino === slideAtual) return;

  carregarFoto(destino);
  carregarFoto((destino + 1) % slides.length);

  document.querySelectorAll(".hero-slide").forEach((slide, i) =>
    slide.classList.toggle("ativo", i === destino));
  document.querySelectorAll(".hero-foto").forEach((foto, i) =>
    foto.classList.toggle("ativo", i === destino));
  document.querySelectorAll(".hero-ponto").forEach((ponto, i) =>
    ponto.setAttribute("aria-selected", String(i === destino)));

  slideAtual = destino;
  escreverPrato(slides[destino]);
}

function ligarRelogio() {
  desligarRelogio();
  if (semMovimento) return;
  relogioCapa = setInterval(() => irParaSlide(slideAtual + 1), SEGUNDOS_CAPA * 1000);
}

function desligarRelogio() {
  if (relogioCapa) clearInterval(relogioCapa);
  relogioCapa = null;
}

/* ===================================================================
   Animação: abertura, entrada e revelação ao rolar
   =================================================================== */

const semMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let observador = null;

// A cortina fica em cena por ~2s e depois se abre. Uma vez por sessão:
// quem volta pela navegação não assiste de novo.
function iniciarAbertura() {
  const abertura = $("#abertura");
  const raiz = document.documentElement;

  if (semMovimento || raiz.classList.contains("sem-abertura")) {
    if (abertura) abertura.remove();
    liberarEntrada();
    return;
  }

  // nome letra a letra. Usa o padrão e não o /config: o filete já começou
  // a animar no primeiro quadro e esperar a API dessincroniza a escada.
  $("#abertura-nome").innerHTML = [...NOME_PADRAO]
    .map((letra, i) =>
      `<span style="--i: ${i}">${letra === " " ? "&nbsp;" : escapar(letra)}</span>`)
    .join("");

  setTimeout(() => {
    abertura.classList.add("saindo");
    raiz.classList.remove("abertura-ativa");
    try { sessionStorage.setItem("caffe54:abertura", "1"); } catch {}
    liberarEntrada();
    setTimeout(() => abertura.remove(), 950);
  }, 2000);
}

// dispara a subida do título, do subtítulo e das pills
function liberarEntrada() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      $$("[data-entrada]").forEach((elemento) => elemento.classList.add("entrou"));
    });
  });
}

function revelarNovos() {
  const alvos = document.querySelectorAll("[data-revelar]:not(.revelado)");

  if (semMovimento || !("IntersectionObserver" in window)) {
    alvos.forEach((alvo) => alvo.classList.add("revelado"));
    return;
  }

  if (!observador) {
    observador = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((entrada) => {
          if (!entrada.isIntersecting) return;
          entrada.target.classList.add("revelado");
          observador.unobserve(entrada.target);
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -6% 0px" }
    );
  }

  // escada de atraso dentro de cada grade, limitada para o fim não arrastar
  alvos.forEach((alvo) => {
    const irmaos = alvo.parentElement ? [...alvo.parentElement.children] : [];
    const posicao = irmaos.indexOf(alvo);
    alvo.style.setProperty("--atraso", `${Math.min(Math.max(posicao, 0), 5) * 70}ms`);
    observador.observe(alvo);
  });
}

// troca de categoria: some, remonta, volta com a escada
function trocarCategoria(categoria) {
  filtroAtivo = categoria;
  montarFiltros();

  const grade = $("#grade");
  if (semMovimento) {
    montarGrade();
    return;
  }

  grade.classList.add("trocando");
  setTimeout(() => {
    montarGrade();
    grade.classList.remove("trocando");
  }, 200);
}

/* ===================================================================
   Envio de imagem
   O admin escolhe um arquivo, ele sobe para frontend/images/cardapio/
   e o nome devolvido pela API preenche o campo de texto.
   =================================================================== */

const LIMITE_MB = 6;

async function enviarImagem(entrada) {
  const arquivo = entrada.files && entrada.files[0];
  if (!arquivo) return;

  const bloco = entrada.closest(".campo-imagem");
  const aviso = bloco.querySelector("[data-envio-aviso]");
  const campo = bloco.querySelector('input[name="imagem"]');
  const previa = bloco.querySelector("[data-previa]");

  const dizer = (texto, tipo = "") => {
    aviso.textContent = texto;
    aviso.className = `envio-aviso ${tipo}`;
  };

  if (arquivo.size > LIMITE_MB * 1024 * 1024) {
    dizer(`A imagem passa de ${LIMITE_MB} MB.`, "erro");
    entrada.value = "";
    return;
  }

  dizer("Enviando…");

  const pacote = new FormData();
  pacote.append("imagem", arquivo);

  try {
    const resposta = await fetch(`${CONFIG.api}/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${pegarToken()}` },
      body: pacote,   // sem Content-Type: o navegador põe o boundary
    });

    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(corpo.error || `Erro ${resposta.status}`);

    campo.value = corpo.imagem;
    previa.hidden = false;
    previa.querySelector("img").src = CONFIG.pastaImagens + corpo.imagem;
    dizer(`${Math.round(corpo.tamanho / 1024)} KB enviados`, "ok");
    montarListaImagens();
  } catch (erro) {
    dizer(erro.message, "erro");
  } finally {
    entrada.value = "";
  }
}

// a prévia acompanha o que for digitado ou escolhido na lista
function acompanharPrevia(campo) {
  const bloco = campo.closest(".campo-imagem");
  if (!bloco) return;
  const previa = bloco.querySelector("[data-previa]");
  const nome = campo.value.trim();
  previa.hidden = !nome;
  if (nome) previa.querySelector("img").src = CONFIG.pastaImagens + nome;
}

/* ===================================================================
   Eventos
   =================================================================== */

/* ---------- filtros e navegação ---------- */

$("#filtros").addEventListener("click", (evento) => {
  const botao = evento.target.closest(".filtro");
  if (!botao) return;

  trocarCategoria(botao.dataset.categoria);

  const barra = $(".barra-filtros");
  if (barra.getBoundingClientRect().top < 0) {
    barra.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

/* ---------- carrossel da capa ---------- */

$("#hero-anterior").addEventListener("click", () => { irParaSlide(slideAtual - 1); ligarRelogio(); });
$("#hero-proximo").addEventListener("click", () => { irParaSlide(slideAtual + 1); ligarRelogio(); });

$("#hero-pontos").addEventListener("click", (evento) => {
  const ponto = evento.target.closest(".hero-ponto");
  if (!ponto) return;
  irParaSlide(Number(ponto.dataset.ir));
  ligarRelogio();
});

// não gira enquanto a pessoa está lendo, nem com a aba em segundo plano
$("#hero").addEventListener("mouseenter", desligarRelogio);
$("#hero").addEventListener("mouseleave", () => { if (slides.length > 1) ligarRelogio(); });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) desligarRelogio();
  else if (slides.length > 1) ligarRelogio();
});

/* ---------- foto ampliada ---------- */

$("#grade").addEventListener("click", (evento) => {
  const foto = evento.target.closest(".cartao-foto");
  if (foto) abrirLupa(foto.dataset.id);
});

$("#lupa-fechar").addEventListener("click", () => $("#lupa").close());
$("#lupa").addEventListener("click", (evento) => {
  if (evento.target === $("#lupa")) $("#lupa").close();
});

/* ---------- abrir e fechar o painel ---------- */

$("#gatilho-admin").addEventListener("click", abrirPainel);
$("#admin-fechar").addEventListener("click", fecharPainel);
$("#sobreposicao").addEventListener("click", fecharPainel);

document.addEventListener("keydown", (evento) => {
  if (evento.key === "Escape" && !$("#admin").hidden) fecharPainel();
});

/* ---------- login e logout ---------- */

$("#formulario-login").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const email = $("#login-email").value.trim();
  const senha = $("#login-senha").value;

  if (!email || !senha) {
    notificar("Preencha e-mail e senha.", "erro");
    return;
  }

  try {
    const dados = await api("/admin/login", {
      method: "POST",
      body: JSON.stringify({ email, senha }),
    });
    localStorage.setItem(CONFIG.chaveToken, dados.token);
    localStorage.setItem(CONFIG.chaveEmail, dados.admin.email);
    $("#formulario-login").reset();
    mostrarPainel(true);
    notificar("Bem-vindo de volta.");
  } catch (erro) {
    notificar(erro.message, "erro");
  }
});

$("#botao-sair").addEventListener("click", () => {
  sair();
  notificar("Você saiu do painel.");
});

/* ---------- configuração do site ---------- */

$("#atalhos").addEventListener("click", (evento) => {
  const botao = evento.target.closest(".atalho");
  if (!botao) return;

  const formulario = $("#formulario-config");
  const usuario = formulario.elements.instagram.value.trim() || config.instagram || "";
  const telefone = (formulario.elements.telefone.value || "").replace(/\D/g, "");

  const destinos = {
    instagram: {
      link: usuario ? `https://instagram.com/${usuario}` : "",
      texto: "Pedir no Instagram",
      erro: "Preencha o campo Instagram primeiro.",
    },
    whatsapp: {
      link: telefone ? `https://wa.me/55${telefone}` : "",
      texto: "Pedir no WhatsApp",
      erro: "Preencha o campo Telefone primeiro.",
    },
    ifood: {
      link: "https://www.ifood.com.br/",
      texto: "Pedir no iFood",
    },
  };

  const escolha = destinos[botao.dataset.destino];
  if (!escolha.link) {
    notificar(escolha.erro, "erro");
    return;
  }

  formulario.elements.linkPedido.value = escolha.link;
  formulario.elements.textoBotao.value = escolha.texto;

  if (botao.dataset.destino === "ifood") {
    notificar("Cole o endereço da sua loja no iFood no campo do link.");
  }
});

$("#formulario-config").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const dados = Object.fromEntries(new FormData(evento.target));

  if (dados.linkPedido && !/^https?:\/\//i.test(dados.linkPedido.trim())) {
    notificar("O link deve começar com http:// ou https://", "erro");
    return;
  }

  try {
    config = await api("/config", { method: "PUT", body: JSON.stringify(dados) });
    aplicarConfig();
    montarGrade();
    notificar("Configurações salvas.");
  } catch (erro) {
    notificar(erro.message, "erro");
  }
});

/* ---------- criar item ---------- */

$("#formulario-criar").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const formulario = evento.target;
  const dados = Object.fromEntries(new FormData(formulario));

  const problema = validarItem(dados);
  if (problema) {
    notificar(problema, "erro");
    return;
  }

  try {
    await api("/menu", {
      method: "POST",
      body: JSON.stringify({
        nome: dados.nome.trim(),
        descricao: dados.descricao.trim(),
        preco: dados.preco,
        categoria: dados.categoria,
        imagem: dados.imagem.trim(),
        destaque: formulario.destaque.checked,
        carrossel: formulario.carrossel.checked,
      }),
    });
    formulario.reset();
    montarSeletores();
    await carregarCardapio();
    notificar("Item criado com sucesso!");
  } catch (erro) {
    notificar(erro.message, "erro");
  }
});

/* ---------- editar, cancelar e deletar ---------- */

$("#lista").addEventListener("click", async (evento) => {
  const editar = evento.target.closest(".acao-editar");
  const remover = evento.target.closest(".acao-remover");
  const cancelar = evento.target.closest(".acao-cancelar");

  if (editar) {
    const id = Number(editar.dataset.id);
    editandoId = editandoId === id ? null : id;
    montarListaAdmin();
    return;
  }

  if (cancelar) {
    editandoId = null;
    montarListaAdmin();
    return;
  }

  if (remover) {
    const id = Number(remover.dataset.id);
    const prato = pratos.find((item) => item.id === id);
    if (!confirm(`Tem certeza que deseja deletar "${prato?.nome}"?`)) return;

    try {
      await api(`/menu/${id}`, { method: "DELETE" });
      editandoId = null;
      await carregarCardapio();
      notificar("Item deletado com sucesso!");
    } catch (erro) {
      notificar(erro.message, "erro");
    }
  }
});

/* ---------- salvar edição ---------- */

$("#lista").addEventListener("submit", async (evento) => {
  const formulario = evento.target.closest(".editor");
  if (!formulario) return;
  evento.preventDefault();

  const id = Number(formulario.dataset.id);
  const dados = Object.fromEntries(new FormData(formulario));

  const problema = validarItem(dados);
  if (problema) {
    notificar(problema, "erro");
    return;
  }

  try {
    await api(`/menu/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        nome: dados.nome.trim(),
        descricao: dados.descricao.trim(),
        preco: dados.preco,
        categoria: dados.categoria,
        imagem: dados.imagem.trim(),   // vazio remove a imagem
        destaque: formulario.destaque.checked,
        carrossel: formulario.carrossel.checked,
      }),
    });
    editandoId = null;
    await carregarCardapio();
    notificar("Item atualizado com sucesso!");
  } catch (erro) {
    notificar(erro.message, "erro");
  }
});

/* ---------- envio de imagem ---------- */

$("#admin").addEventListener("change", (evento) => {
  if (evento.target.matches("input[type=file][data-upload]")) enviarImagem(evento.target);
});

$("#admin").addEventListener("input", (evento) => {
  if (evento.target.matches('input[name="imagem"]')) acompanharPrevia(evento.target);
});

/* ---------- busca ---------- */

$("#busca").addEventListener("input", (evento) => {
  termoBusca = evento.target.value;
  montarListaAdmin();
});

/* ===================================================================
   Início
   =================================================================== */

montarSeletores();
mostrarPainel(estaLogado());
iniciarAbertura();
carregarConfig().then(carregarCardapio);
