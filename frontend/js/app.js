/* ===================================================================
   Caffè 54 — site e painel administrativo
   JavaScript puro, sem dependências.
   =================================================================== */

const IMAGEM_RESERVA =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
       <rect width="400" height="300" fill="#E8EBE3"/>
       <text x="200" y="170" text-anchor="middle" fill="#8B9D83"
             font-family="Georgia, serif" font-size="88">C</text>
     </svg>`
  );

// Estado
let pratos = [];        // logado: todos os itens (/menu/admin); visitante: só ativos
let categorias = [];    // [{ id, nome, ordem }] — vem do painel, define a ordem no site
let config = {};
let filtroAtivo = "Todos";
let editandoId = null;
let termoBusca = "";
let secaoAtiva = "cardapio";

const $ = (seletor) => document.querySelector(seletor);
const $$ = (seletor) => document.querySelectorAll(seletor);

const NOME_PADRAO = "Caffè 54";

const DIAS = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
const DIAS_LONGO = {
  seg: "Segunda", ter: "Terça", qua: "Quarta", qui: "Quinta",
  sex: "Sexta", sab: "Sábado", dom: "Domingo",
};
const DIAS_CURTO = {
  seg: "Seg", ter: "Ter", qua: "Qua", qui: "Qui", sex: "Sex", sab: "Sáb", dom: "Dom",
};

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

// Junta os 7 dias em linhas curtas, agrupando dias seguidos com o mesmo horário.
// Ex.: "Seg a Sex: 08:00–18:00 \n Sáb: 09:00–13:00 \n Dom: fechado"
function formatarHorarios(lista) {
  if (!Array.isArray(lista) || !lista.length) return "";
  const mapa = {};
  lista.forEach((h) => { if (h && DIAS.includes(h.dia)) mapa[h.dia] = h; });

  const textoDe = (h) =>
    !h || h.fechado || !h.abre || !h.fecha ? "fechado" : `${h.abre}–${h.fecha}`;

  const grupos = [];
  for (const dia of DIAS) {
    const t = textoDe(mapa[dia]);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.texto === t) ultimo.fim = dia;
    else grupos.push({ ini: dia, fim: dia, texto: t });
  }
  if (grupos.every((g) => g.texto === "fechado")) return "";

  return grupos
    .map((g) => {
      const dias = g.ini === g.fim
        ? DIAS_CURTO[g.ini]
        : `${DIAS_CURTO[g.ini]} a ${DIAS_CURTO[g.fim]}`;
      return `${dias}: ${g.texto === "fechado" ? "fechado" : g.texto}`;
    })
    .join("\n");
}

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
   Configuração do site (nome, contato, sobre, horários)
   =================================================================== */

function aplicarConfig() {
  $$("[data-nome-cafe]").forEach((el) => { el.textContent = config.nome || NOME_PADRAO; });
  $$("[data-ano]").forEach((el) => { el.textContent = new Date().getFullYear(); });

  const horarioTexto = formatarHorarios(config.horarios);
  $$("[data-horario]").forEach((el) => { el.textContent = horarioTexto; });
  $$("[data-endereco]").forEach((el) => { el.textContent = config.endereco || ""; });

  $$("[data-telefone]").forEach((el) => {
    el.textContent = config.telefone || "";
    el.href = config.telefone ? `tel:+55${config.telefone.replace(/\D/g, "")}` : "#";
    el.hidden = !config.telefone;
  });

  $$("[data-email]").forEach((el) => {
    el.textContent = config.email || "";
    el.href = config.email ? `mailto:${config.email}` : "#";
    el.hidden = !config.email;
  });

  const links = montarLinksRodape();

  // sem nenhum dado de contato, o rodapé vira só a assinatura, centralizada
  const semContato = !(config.endereco || config.telefone || config.email ||
                       links || horarioTexto);
  document.querySelector(".rodape").classList.toggle("rodape-so-marca", semContato);

  const preenchido = {
    endereco: Boolean(config.endereco),
    contato: Boolean(config.telefone || config.email),
    links: Boolean(links),
  };
  for (const [bloco, tem] of Object.entries(preenchido)) {
    const alvo = document.querySelector(`[data-bloco="${bloco}"]`);
    if (alvo) alvo.hidden = !tem;
  }

  aplicarSobre();
  aplicarIntroCardapio();
  aplicarVisite(horarioTexto);
  preencherFormulariosConfig();
}

/* ---------- redes e links do rodapé ---------- */

// Cada tipo sabe virar URL e virar texto. O dono digita só o usuário/telefone;
// se colar um link completo, ele é usado como está.
const TIPOS_LINK = {
  instagram: {
    nome: "Instagram", dica: "só o usuário, sem @", exemplo: "caffe54floripa",
    url: (v) => `https://instagram.com/${v.replace(/^@/, "")}`,
    texto: (v) => `@${v.replace(/^@/, "")}`,
  },
  whatsapp: {
    nome: "WhatsApp", dica: "com DDD", exemplo: "48 99999-0000",
    url: (v) => `https://wa.me/${comDDI(v)}`,
    texto: (v) => v,
  },
  facebook: {
    nome: "Facebook", dica: "usuário ou nome da página", exemplo: "caffe54",
    url: (v) => `https://facebook.com/${v.replace(/^@/, "")}`,
    texto: (v) => v.replace(/^@/, ""),
  },
  tiktok: {
    nome: "TikTok", dica: "só o usuário, sem @", exemplo: "caffe54",
    url: (v) => `https://tiktok.com/@${v.replace(/^@/, "")}`,
    texto: (v) => `@${v.replace(/^@/, "")}`,
  },
  twitter: {
    nome: "X / Twitter", dica: "só o usuário, sem @", exemplo: "caffe54",
    url: (v) => `https://x.com/${v.replace(/^@/, "")}`,
    texto: (v) => `@${v.replace(/^@/, "")}`,
  },
  youtube: {
    nome: "YouTube", dica: "o @ do canal ou o link", exemplo: "@caffe54",
    url: (v) => `https://youtube.com/${v.startsWith("@") ? v : "@" + v}`,
    texto: (v) => (v.startsWith("@") ? v : `@${v}`),
  },
  site: {
    nome: "Site", dica: "o endereço completo", exemplo: "caffe54.com.br",
    url: (v) => v,
    texto: (v) => v.replace(/^https?:\/\//, "").replace(/\/$/, ""),
  },
  outro: {
    nome: "Outro", dica: "o link completo", exemplo: "https://…",
    url: (v) => v,
    texto: (v) => v.replace(/^https?:\/\//, "").replace(/\/$/, ""),
  },
};

// telefone brasileiro → formato do wa.me (55 + dígitos)
function comDDI(valor) {
  const digitos = valor.replace(/\D/g, "");
  return digitos.startsWith("55") ? digitos : `55${digitos}`;
}

// Monta o href e o texto de um link salvo. Link completo colado vence o tipo.
function lerLink(link) {
  const tipo = TIPOS_LINK[link.tipo] || TIPOS_LINK.outro;
  const valor = (link.valor || "").trim();
  if (!valor) return null;

  const colouLink = /^https?:\/\//i.test(valor);
  const url = colouLink ? valor : tipo.url(valor);
  const rotulo = link.tipo === "outro" && link.rotulo ? link.rotulo : tipo.nome;

  return {
    url: /^https?:\/\//i.test(url) ? url : `https://${url}`,
    rotulo,
    texto: colouLink ? TIPOS_LINK.outro.texto(valor) : tipo.texto(valor),
  };
}

// Desenha a lista do rodapé. Devolve quantos links entraram (0 = bloco escondido).
function montarLinksRodape() {
  const lista = $("#rodape-links");
  if (!lista) return 0;

  const links = (Array.isArray(config.links) ? config.links : [])
    .map(lerLink)
    .filter(Boolean);

  lista.innerHTML = links
    .map(
      (l) => `
      <li>
        <a class="rodape-link" href="${escapar(l.url)}" target="_blank" rel="noopener">
          <span class="rodape-link-rotulo">${escapar(l.rotulo)}</span>
          <span class="rodape-link-valor">${escapar(l.texto)}</span>
        </a>
      </li>`
    )
    .join("");

  return links.length;
}

/* ---------- lista de links no painel ---------- */

const MAX_LINKS = 10;

// Rascunho editado no painel; só vira `config.links` ao salvar o formulário.
// `chave` é um id local estável — a animação de reordenar (animarReordenacao)
// casa as linhas por `dataset.id`, e o índice muda ao mover.
let linksRascunho = [];
let proximaChaveLink = 1;

function montarLinksAdmin() {
  const lista = $("#links-lista");
  if (!lista) return;

  linksRascunho = (Array.isArray(config.links) ? config.links : []).map((l) => ({
    chave: proximaChaveLink++,
    tipo: l.tipo || "instagram",
    valor: l.valor || "",
    rotulo: l.rotulo || "",
  }));

  desenharLinksAdmin();
}

function desenharLinksAdmin() {
  const lista = $("#links-lista");
  if (!lista) return;

  const opcoes = (escolhido) =>
    Object.entries(TIPOS_LINK)
      .map(([chave, t]) =>
        `<option value="${chave}"${chave === escolhido ? " selected" : ""}>${escapar(t.nome)}</option>`)
      .join("");

  lista.innerHTML = linksRascunho
    .map((link, i) => {
      const tipo = TIPOS_LINK[link.tipo] || TIPOS_LINK.outro;
      return `
      <li class="link-linha" data-id="${link.chave}">
        <select class="link-tipo" data-campo="tipo" aria-label="Tipo do link ${i + 1}">
          ${opcoes(link.tipo)}
        </select>
        ${link.tipo === "outro"
          ? `<input type="text" class="link-rotulo" data-campo="rotulo"
                    value="${escapar(link.rotulo)}" placeholder="Nome"
                    aria-label="Nome que aparece no site">`
          : ""}
        <input type="text" class="link-valor" data-campo="valor"
               value="${escapar(link.valor)}" placeholder="${escapar(tipo.exemplo)}"
               aria-label="Endereço do link ${i + 1}">
        <button type="button" class="mini-btn link-subir" data-mover="-1"
                aria-label="Subir" ${i === 0 ? "disabled" : ""}>&#9650;</button>
        <button type="button" class="mini-btn link-descer" data-mover="1"
                aria-label="Descer" ${i === linksRascunho.length - 1 ? "disabled" : ""}>&#9660;</button>
        <button type="button" class="mini-acao" data-remover-link aria-label="Remover">Remover</button>
        <small class="dica link-dica">${escapar(tipo.dica)}</small>
      </li>`;
    })
    .join("");

  const botao = $("#link-adicionar");
  if (botao) botao.disabled = linksRascunho.length >= MAX_LINKS;
}

// "Sobre o estabelecimento" — logo depois da capa. Vazio = seção escondida.
function aplicarSobre() {
  const sobre = (config.sobre || "").trim();
  $$("[data-sobre]").forEach((el) => { el.textContent = sobre; });
  const secao = $("#sobre");
  if (secao) secao.hidden = !sobre;
}

// Frase de abertura do cardápio. Vazia = só o rótulo "O cardápio" aparece.
function aplicarIntroCardapio() {
  const texto = (config.introCardapio || "").trim();
  $$("[data-intro-cardapio]").forEach((el) => {
    el.textContent = texto;
    el.hidden = !texto;
  });
}

// Faixa compacta de localização + horário, logo depois da capa. Cada parte
// só aparece se o dono preencheu; vazia = faixa escondida.
function aplicarVisite(horarioTexto) {
  const secao = $("#visite");
  if (!secao) return;

  const endereco = (config.endereco || "").trim();

  secao.querySelector('[data-dado="endereco"]').hidden = !endereco;
  secao.querySelector('[data-dado="horario"]').hidden = !horarioTexto;

  const mapaLink = secao.querySelector("[data-mapa-link]");
  if (endereco) {
    mapaLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`;
  }

  secao.hidden = !(endereco || horarioTexto);
}

// Espelha os valores salvos nos formulários do painel.
function preencherFormulariosConfig() {
  const info = $("#formulario-info");
  if (info) {
    for (const campo of ["sobre", "introCardapio", "telefone", "email"]) {
      if (info.elements[campo]) info.elements[campo].value = config[campo] || "";
    }
  }
  montarLinksAdmin();
  const local = $("#formulario-local");
  if (local && local.elements.endereco) local.elements.endereco.value = config.endereco || "";

  atualizarPreviaMapa();
  montarHorarios();
}

async function carregarConfig() {
  try {
    config = await api("/config");
  } catch {
    config = {};
  }
  aplicarConfig();
}

async function carregarCategorias() {
  try {
    categorias = await api("/categorias");
  } catch {
    categorias = [];
  }
}

/* ===================================================================
   Cardápio (site público)
   =================================================================== */

// Ordena na sequência das categorias do painel, com os destaques no topo
// de cada categoria (fotos boas primeiro).
function ordenarPratos(lista) {
  return [...lista].sort(
    (a, b) =>
      (a.categoriaOrdem ?? 999) - (b.categoriaOrdem ?? 999) ||
      Number(b.destaque) - Number(a.destaque) ||
      a.nome.localeCompare(b.nome, "pt-BR")
  );
}

async function carregarCardapio() {
  if (!pratos.length) esqueleto();
  try {
    const rota = pegarToken() ? "/menu/admin" : "/menu";
    pratos = ordenarPratos(await api(rota));
    $("#aviso").hidden = true;
    montarFiltros();
    montarGrade();
    montarCapa();
    if (pegarToken()) atualizarPainel();
  } catch (erro) {
    $("#aviso").hidden = false;
    $("#aviso").textContent =
      "Não foi possível carregar o cardápio. Verifique se o servidor está rodando.";
  }
}

// itens que aparecem no site (o painel enxerga os inativos também)
const pratosVisiveis = () => pratos.filter((p) => p.ativo !== false);

let primeiraMontagem = true;

function montarFiltros() {
  const presentes = new Set(pratosVisiveis().map((p) => p.categoria));
  const lista = ["Todos", ...categorias.filter((c) => presentes.has(c.nome)).map((c) => c.nome)];

  if (!lista.includes(filtroAtivo)) filtroAtivo = "Todos";

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
  const base = pratosVisiveis();
  const visiveis =
    filtroAtivo === "Todos" ? base : base.filter((p) => p.categoria === filtroAtivo);

  if (!visiveis.length) {
    $("#grade").innerHTML = "";
    $("#aviso").hidden = false;
    $("#aviso").textContent = "Nenhum item nesta categoria por enquanto.";
    return;
  }
  $("#aviso").hidden = true;

  if (filtroAtivo !== "Todos") {
    $("#grade").innerHTML = `<div class="grade">${visiveis.map(cartaoHTML).join("")}</div>`;
    revelarNovos();
    return;
  }

  const grupos = categorias
    .map((c) => [c.nome, visiveis.filter((p) => p.categoria === c.nome)])
    .filter(([, itens]) => itens.length);

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

  const figura = prato.imagem
    ? `<img src="${CONFIG.pastaImagens}${escapar(prato.imagem)}"
            alt="${escapar(prato.nome)}" loading="lazy" decoding="async"
            onerror="this.onerror=null;this.src='${IMAGEM_RESERVA}'">`
    : `<div class="cartao-vazio">${inicial(prato.nome)}</div>`;

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
        <span class="cartao-categoria">${escapar(prato.categoria || "")}</span>
        <h3 class="cartao-nome">${escapar(prato.nome)}</h3>
        <p class="cartao-descricao">${escapar(prato.descricao || "")}</p>
        <p class="cartao-preco ${semPreco ? "consulta" : ""}">${formatarPreco(prato.preco)}</p>
      </div>
    </article>`;
}

/* ---------- foto ampliada ---------- */

const VOO_MS = 520;   // duração do voo da foto

let origemDaLupa = null;   // elemento que abriu a lupa (para o voo de volta)
let vooAtual = null;

// De onde a foto sai. O bloco de texto do destaque (#hero-prato) não tem foto
// dentro: aí a origem é a foto que está visível na capa — a emoldurada no
// desktop, o fundo no celular (onde a .hero-vitrine é display:none).
function fotoDeOrigem(elemento) {
  if (!elemento) return null;

  let alvo = elemento.querySelector("img");

  if (!alvo && elemento.id === "hero-prato") {
    const emoldurada = $(".hero-foto.ativo .hero-foto-botao img");
    // offsetParent null = escondido (no celular a vitrine some)
    alvo = emoldurada && emoldurada.offsetParent !== null
      ? emoldurada
      // o <img> do fundo tem transform: scale(), que entraria no rect —
      // por isso medimos o contêiner do slide
      : $(".hero-slide.ativo");
  }

  if (!alvo) return null;

  const foto = alvo.tagName === "IMG" ? alvo : alvo.querySelector("img");
  const src = foto && (foto.currentSrc || foto.src);
  if (!src) return null;

  const rect = alvo.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return null;

  return { rect, src };
}

function porRect(elemento, rect) {
  elemento.style.left = `${rect.left}px`;
  elemento.style.top = `${rect.top}px`;
  elemento.style.width = `${rect.width}px`;
  elemento.style.height = `${rect.height}px`;
}

// FLIP: o clone sai do rect da foto clicada e chega no rect da foto grande.
function voar(deRect, paraRect, src, aoTerminar) {
  const clone = $("#lupa-voo");
  if (vooAtual) vooAtual.cancel();

  clone.src = src;
  clone.hidden = false;
  porRect(clone, deRect);

  const quadros = [
    { left: `${deRect.left}px`, top: `${deRect.top}px`,
      width: `${deRect.width}px`, height: `${deRect.height}px` },
    { left: `${paraRect.left}px`, top: `${paraRect.top}px`,
      width: `${paraRect.width}px`, height: `${paraRect.height}px` },
  ];

  vooAtual = clone.animate(quadros, {
    duration: VOO_MS,
    easing: "cubic-bezier(0.22, 1, 0.36, 1)",   // = var(--mola)
    fill: "forwards",
  });

  vooAtual.addEventListener("finish", () => {
    clone.hidden = true;
    clone.removeAttribute("src");
    vooAtual = null;
    aoTerminar();
  }, { once: true });
}

// Fallback: a caixa cresce a partir do ponto clicado.
function zoomAncorado(lupa, evento, elemento) {
  const d = lupa.getBoundingClientRect();
  let x = evento && evento.clientX;
  let y = evento && evento.clientY;

  // ativação por teclado não traz coordenadas — usa o centro do elemento
  if (!x && !y && elemento) {
    const r = elemento.getBoundingClientRect();
    x = r.left + r.width / 2;
    y = r.top + r.height / 2;
  }

  if (!x && !y) {
    lupa.style.setProperty("--lx", "50%");
    lupa.style.setProperty("--ly", "50%");
    return;
  }

  // preso às bordas da lupa: a direção continua certa e a caixa não dispara
  lupa.style.setProperty("--lx", `${Math.min(Math.max(x - d.left, 0), d.width)}px`);
  lupa.style.setProperty("--ly", `${Math.min(Math.max(y - d.top, 0), d.height)}px`);
}

function abrirLupa(id, origem, evento) {
  const prato = pratos.find((item) => item.id === Number(id));
  if (!prato) return;

  const lupa = $("#lupa");
  if (lupa.open) return;

  const imagem = $("#lupa-imagem");
  if (prato.imagem) {
    imagem.src = CONFIG.pastaImagens + prato.imagem;
    imagem.alt = prato.nome;
    imagem.hidden = false;
  } else {
    imagem.removeAttribute("src");
    imagem.hidden = true;
  }

  $("#lupa-categoria").textContent = prato.categoria || "";
  $("#lupa-nome").textContent = prato.nome;
  $("#lupa-descricao").textContent = prato.descricao || "";
  $("#lupa-preco").textContent = formatarPreco(prato.preco);

  origemDaLupa = origem || null;
  lupa.classList.remove("zoom", "voando", "saindo");

  const partida = semMovimento || !prato.imagem ? null : fotoDeOrigem(origem);

  if (!partida) {
    if (!semMovimento) {
      lupa.showModal();
      zoomAncorado(lupa, evento, origem);
      lupa.classList.add("zoom");
    } else {
      lupa.showModal();
    }
    return;
  }

  lupa.classList.add("voando");
  lupa.showModal();

  // o destino só existe depois de o diálogo estar na tela
  const destino = imagem.getBoundingClientRect();
  zoomAncorado(lupa, evento, origem);   // guarda a origem para a saída

  voar(partida.rect, destino, partida.src, () => {
    lupa.classList.remove("voando");
  });

  // Solta o conteúdo real antes de o voo acabar: o texto entra por cima do
  // fim do voo (não fica sequencial) e a foto grande termina de aparecer
  // exatamente quando o clone some — a troca fica invisível.
  setTimeout(() => lupa.classList.remove("voando"), VOO_MS - 200);
}

function fecharLupa() {
  const lupa = $("#lupa");
  if (!lupa.open) return;

  if (semMovimento) {
    lupa.close();
    return;
  }

  const volta = fotoDeOrigem(origemDaLupa);
  const imagem = $("#lupa-imagem");

  // só voa de volta se a origem ainda estiver na tela (o dono pode ter
  // trocado de filtro ou o carrossel pode ter girado)
  if (volta && !imagem.hidden) {
    const daLupa = imagem.getBoundingClientRect();
    lupa.classList.add("voando", "saindo");
    voar(daLupa, volta.rect, imagem.currentSrc || imagem.src, () => {
      lupa.classList.remove("voando", "saindo", "zoom");
      lupa.close();
    });
    return;
  }

  lupa.classList.add("saindo");
  lupa.addEventListener("animationend", () => {
    lupa.classList.remove("saindo", "zoom", "voando");
    lupa.close();
  }, { once: true });
}

/* ===================================================================
   Painel administrativo
   =================================================================== */

function estaLogado() {
  return Boolean(pegarToken());
}

let fechandoPainel = null;

// põe a origem do círculo (--ox/--oy) no centro de um elemento
function origemDoCirculo(elemento) {
  const admin = $("#admin");
  const r = elemento.getBoundingClientRect();
  admin.style.setProperty("--ox", `${r.left + r.width / 2}px`);
  admin.style.setProperty("--oy", `${r.top + r.height / 2}px`);
}

// O painel abre como uma "outra página": um círculo cresce a partir do
// botão da engrenagem e toma a tela toda. Ao fechar, o círculo recolhe
// para dentro do "x".
// Trava/destrava a rolagem do fundo por classe no <html> (não por style inline
// no body — esse ficava preso quando o painel fechava por um caminho atípico
// ou quando a página voltava do cache do navegador).
function travarFundo(sim) {
  document.documentElement.classList.toggle("fundo-travado", sim);
}

// Rede de segurança: se a página some e volta (voltar/avançar, cache), garante
// que a rolagem não ficou travada de uma sessão anterior.
window.addEventListener("pageshow", () => {
  if ($("#admin").hidden) travarFundo(false);
});

function abrirPainel() {
  const admin = $("#admin");
  clearTimeout(fechandoPainel);
  admin.classList.remove("painel-saindo");

  origemDoCirculo($("#gatilho-admin"));

  admin.hidden = false;
  travarFundo(true);
  admin.classList.remove("painel-entrando");
  void admin.offsetWidth;
  admin.classList.add("painel-entrando");

  mostrarPainel(estaLogado());
  // Move o foco para dentro do painel (acessibilidade), mas NUNCA para um
  // campo de texto: no celular isso abre o teclado sozinho. Sem login, foca
  // o "x"; a pessoa toca no campo "Usuário" quando quiser escrever.
  const alvoFoco = estaLogado()
    ? $(`.admin-nav-item[data-secao="${secaoAtiva}"]`)
    : $("#admin-fechar");
  if (alvoFoco) alvoFoco.focus({ preventScroll: true });
}

function fecharPainel() {
  const admin = $("#admin");
  origemDoCirculo($("#admin-fechar"));   // recolhe para o "x"
  admin.classList.remove("painel-entrando");
  admin.classList.add("painel-saindo");
  travarFundo(false);
  $("#gatilho-admin").focus();
  clearTimeout(fechandoPainel);
  fechandoPainel = setTimeout(() => {
    admin.hidden = true;
    admin.classList.remove("painel-saindo");
  }, semMovimento ? 0 : 800);
}

function mostrarPainel(logado) {
  $("#formulario-login").hidden = logado;
  $("#dashboard").hidden = !logado;
  $("#admin-titulo").textContent = logado ? "Painel" : "Acesso restrito";
  if (logado) {
    $("#conta-email").textContent = localStorage.getItem(CONFIG.chaveUsuario) || "";
    trocarSecao(secaoAtiva);
    atualizarPainel();
  }
}

function trocarSecao(nome) {
  secaoAtiva = nome;
  $$(".admin-nav-item").forEach((b) =>
    b.setAttribute("aria-current", b.dataset.secao === nome ? "page" : "false"));
  $$(".painel-secao").forEach((s) => { s.hidden = s.dataset.secao !== nome; });
  const conteudo = $(".admin-conteudo");
  if (conteudo) conteudo.scrollTop = 0;
}

// repovoa todas as seções do painel a partir do estado atual
function atualizarPainel() {
  montarSeletores();
  montarListaAdmin();
  montarListaImagens();
  montarCategoriasAdmin();
  montarDestaques();
  montarHorarios();
  atualizarPreviaMapa();
}

function sair() {
  localStorage.removeItem(CONFIG.chaveToken);
  localStorage.removeItem(CONFIG.chaveUsuario);
  editandoId = null;
  mostrarPainel(false);
}

/* ---------- categorias ---------- */

function montarSeletores() {
  const opcoes = categorias
    .map((c) => `<option value="${c.id}">${escapar(c.nome)}</option>`)
    .join("");

  $$(".seletor-categoria").forEach((seletor) => {
    const atual = seletor.dataset.valor || "";
    seletor.innerHTML =
      `<option value="" disabled ${atual ? "" : "selected"}>Selecione</option>${opcoes}`;
    if (atual) seletor.value = atual;
  });
}

function montarCategoriasAdmin() {
  const lista = $("#lista-categorias");
  if (!lista) return;

  const contagem = {};
  pratos.forEach((p) => { contagem[p.categoria] = (contagem[p.categoria] || 0) + 1; });

  lista.innerHTML = categorias
    .map((c, i) => {
      const n = contagem[c.nome] || 0;
      return `
      <li class="categoria-linha" data-id="${c.id}">
        <div class="categoria-mover">
          <button type="button" class="mini-btn" data-mover="cima" aria-label="Subir"
                  ${i === 0 ? "disabled" : ""}>↑</button>
          <button type="button" class="mini-btn" data-mover="baixo" aria-label="Descer"
                  ${i === categorias.length - 1 ? "disabled" : ""}>↓</button>
        </div>
        <input type="text" class="categoria-nome" value="${escapar(c.nome)}" maxlength="40"
               aria-label="Nome da categoria">
        <span class="categoria-contagem">${n} ${n === 1 ? "item" : "itens"}</span>
        <button type="button" class="acao acao-remover" data-excluir="${c.id}"
                ${n > 0 ? 'disabled title="Mova os itens desta categoria antes de excluir"' : ""}>
          Excluir
        </button>
      </li>`;
    })
    .join("");
}

async function salvarNomeCategoria(id, nome) {
  nome = nome.trim();
  const atual = categorias.find((c) => c.id === Number(id));
  if (!nome || !atual || nome === atual.nome) {
    montarCategoriasAdmin();
    return;
  }
  try {
    await api(`/categorias/${id}`, { method: "PUT", body: JSON.stringify({ nome }) });
    await carregarCategorias();
    await carregarCardapio();
    notificar("Categoria renomeada.");
  } catch (erro) {
    notificar(erro.message, "erro");
    montarCategoriasAdmin();
  }
}

// Re-renderiza uma lista animando cada linha da posição antiga para a nova
// (técnica FLIP). `mutar()` troca os dados e chama o montar*.
function animarReordenacao(container, mutar, idDestaque) {
  if (semMovimento || !container) { mutar(); return; }

  const antes = new Map(
    [...container.children].map((el) => [el.dataset.id, el.getBoundingClientRect().top])
  );
  mutar();

  for (const el of container.children) {
    const y0 = antes.get(el.dataset.id);
    if (y0 == null) continue;
    const dy = y0 - el.getBoundingClientRect().top;
    if (el.dataset.id === String(idDestaque)) el.classList.add("linha-movida");
    if (!dy) continue;
    el.style.transform = `translateY(${dy}px)`;
    el.style.transition = "none";
    requestAnimationFrame(() => {
      el.style.transition = "transform 280ms var(--mola)";
      el.style.transform = "";
      el.addEventListener("transitionend", () => {
        el.style.transition = "";
        el.classList.remove("linha-movida");
      }, { once: true });
    });
  }
}

async function moverCategoria(id, direcao) {
  const i = categorias.findIndex((c) => c.id === Number(id));
  const j = direcao === "cima" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= categorias.length) return;

  animarReordenacao($("#lista-categorias"), () => {
    const nova = [...categorias];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    categorias = nova;
    montarCategoriasAdmin();
  }, id);

  // ajusta o estado local para o site refletir a nova ordem
  categorias.forEach((c, k) => { c.ordem = k; });
  pratos.forEach((p) => {
    const c = categorias.find((x) => x.nome === p.categoria);
    if (c) p.categoriaOrdem = c.ordem;
  });
  montarGrade();

  try {
    await api("/categorias/ordenar", {
      method: "PUT",
      body: JSON.stringify({ ids: categorias.map((c) => c.id) }),
    });
  } catch (erro) {
    notificar(erro.message, "erro");
    await carregarCategorias();
    await carregarCardapio();
  }
}

async function excluirCategoria(id) {
  const cat = categorias.find((c) => c.id === Number(id));
  if (!cat || !confirm(`Excluir a categoria "${cat.nome}"?`)) return;
  try {
    await api(`/categorias/${id}`, { method: "DELETE" });
    await carregarCategorias();
    await carregarCardapio();
    notificar("Categoria excluída.");
  } catch (erro) {
    notificar(erro.message, "erro");
  }
}

/* ---------- destaques ---------- */

function montarDestaques() {
  const lista = $("#lista-destaques");
  if (!lista) return;

  const ordenados = [...pratos].sort(
    (a, b) =>
      (a.categoriaOrdem ?? 999) - (b.categoriaOrdem ?? 999) ||
      a.nome.localeCompare(b.nome, "pt-BR")
  );

  lista.innerHTML = ordenados
    .map((p) => {
      const thumb = p.imagem
        ? `<img class="destaque-thumb" src="${CONFIG.pastaImagens}${escapar(p.imagem)}" alt=""
               onerror="this.onerror=null;this.src='${IMAGEM_RESERVA}'">`
        : `<span class="destaque-thumb destaque-thumb-vazia">${inicial(p.nome)}</span>`;
      return `
      <li class="destaque-item">
        <label class="destaque-rotulo">
          <input type="checkbox" data-destaque="${p.id}" ${p.destaque ? "checked" : ""}>
          ${thumb}
          <span class="destaque-info">
            <strong>${escapar(p.nome)}</strong>
            <small>${escapar(p.categoria || "")}${p.ativo === false ? " · inativo" : ""}</small>
          </span>
        </label>
      </li>`;
    })
    .join("");
}

async function alternarDestaque(id, valor) {
  try {
    await api(`/menu/${id}`, { method: "PUT", body: JSON.stringify({ destaque: valor }) });
    const p = pratos.find((x) => x.id === Number(id));
    if (p) p.destaque = valor;
    montarGrade();
    montarCapa();
  } catch (erro) {
    notificar(erro.message, "erro");
    montarDestaques();
  }
}

/* ---------- horários ---------- */

function montarHorarios() {
  const grade = $("#horarios-grade");
  if (!grade) return;

  const salvos = {};
  (Array.isArray(config.horarios) ? config.horarios : []).forEach((h) => {
    if (h && DIAS.includes(h.dia)) salvos[h.dia] = h;
  });

  grade.innerHTML = DIAS.map((dia) => {
    const h = salvos[dia] || {};
    const fechado = Boolean(h.fechado);
    return `
      <div class="horario-linha ${fechado ? "fechado" : ""}" data-dia="${dia}">
        <span class="horario-dia">${DIAS_LONGO[dia]}</span>
        <span class="horario-campos">
          <input type="time" data-campo="abre" aria-label="Abre" value="${escapar(h.abre || "")}" ${fechado ? "disabled" : ""}>
          <span class="horario-ate">até</span>
          <input type="time" data-campo="fecha" aria-label="Fecha" value="${escapar(h.fecha || "")}" ${fechado ? "disabled" : ""}>
        </span>
        <span class="horario-fechado-txt">Fechado neste dia</span>
        <label class="horario-fechado">
          <input type="checkbox" data-campo="fechado" ${fechado ? "checked" : ""}> Fechado
        </label>
      </div>`;
  }).join("");
}

function lerHorarios() {
  return [...$$("#horarios-grade .horario-linha")].map((linha) => ({
    dia: linha.dataset.dia,
    abre: linha.querySelector('[data-campo="abre"]').value,
    fecha: linha.querySelector('[data-campo="fecha"]').value,
    fechado: linha.querySelector('[data-campo="fechado"]').checked,
  }));
}

// copia o horário de segunda-feira para os outros seis dias
function replicarSegunda() {
  const linhas = [...$$("#horarios-grade .horario-linha")];
  const base = linhas[0];
  if (!base) return;
  const abre = base.querySelector('[data-campo="abre"]').value;
  const fecha = base.querySelector('[data-campo="fecha"]').value;
  const fechado = base.querySelector('[data-campo="fechado"]').checked;

  linhas.slice(1).forEach((linha) => {
    linha.querySelector('[data-campo="abre"]').value = abre;
    linha.querySelector('[data-campo="fecha"]').value = fecha;
    const chk = linha.querySelector('[data-campo="fechado"]');
    chk.checked = fechado;
    linha.classList.toggle("fechado", fechado);
    linha.querySelectorAll('[data-campo="abre"], [data-campo="fecha"]').forEach((i) => { i.disabled = fechado; });
  });
  notificar("Segunda-feira aplicada aos outros dias. Ajuste o que precisar e salve.");
}

/* ---------- lista de imagens ---------- */

async function montarListaImagens() {
  let nomes = [...new Set(pratos.map((p) => p.imagem).filter(Boolean))];
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

/* ---------- lista de itens ---------- */

function montarListaAdmin() {
  const termo = termoBusca.trim().toLowerCase();
  const visiveis = termo
    ? pratos.filter(
        (p) =>
          p.nome.toLowerCase().includes(termo) ||
          (p.categoria || "").toLowerCase().includes(termo)
      )
    : pratos;

  $("#contagem").textContent = termo
    ? `${visiveis.length} de ${pratos.length}`
    : `${pratos.length} ${pratos.length === 1 ? "item" : "itens"}`;

  $("#lista").innerHTML = visiveis.map(itemAdminHTML).join("");
  $("#lista-vazia").hidden = visiveis.length > 0;
  montarSeletores();
}

function itemAdminHTML(prato) {
  const inativo = prato.ativo === false;
  const miniatura = prato.imagem
    ? `<img src="${CONFIG.pastaImagens}${escapar(prato.imagem)}" alt=""
            class="item-miniatura" loading="lazy"
            onerror="this.onerror=null;this.src='${IMAGEM_RESERVA}'">`
    : `<div class="item-miniatura miniatura-vazia">${inicial(prato.nome)}</div>`;

  return `
    <li class="item ${inativo ? "item--inativo" : ""}" data-id="${prato.id}">
      <div class="item-linha">
        ${miniatura}
        <div class="item-info">
          <span class="item-nome">
            ${escapar(prato.nome)}
            ${prato.destaque ? ` <span class="item-estrela" title="Destaque">&#9733;</span>` : ""}
            ${inativo ? ` <span class="item-tag">inativo</span>` : ""}
          </span>
          <span class="item-detalhe">${escapar(prato.categoria || "sem categoria")} · ${formatarPreco(prato.preco)}</span>
        </div>
        <div class="item-acoes">
          <button type="button" class="acao acao-ativo" data-ativo="${prato.id}">
            ${inativo ? "Ativar" : "Desativar"}
          </button>
          <button type="button" class="acao acao-editar" data-id="${prato.id}">Editar</button>
          <button type="button" class="acao acao-remover" data-remover="${prato.id}">Excluir</button>
        </div>
      </div>
      ${editandoId === prato.id ? editorHTML(prato) : ""}
    </li>`;
}

function editorHTML(prato) {
  return `
    <form class="editor" data-id="${prato.id}" novalidate>
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
          <select name="categoriaId" class="seletor-categoria"
                  data-valor="${prato.categoriaId || ""}" required></select>
        </label>
      </div>
      <div class="campo-imagem">
        <span class="campo-rotulo-solo">Foto do item</span>
        <input type="hidden" name="imagem" value="${escapar(prato.imagem || "")}">
        <figure class="previa" data-previa ${prato.imagem ? "" : "hidden"}>
          <img alt="" src="${prato.imagem ? CONFIG.pastaImagens + escapar(prato.imagem) : ""}"
               onerror="this.onerror=null;this.src='${IMAGEM_RESERVA}'">
        </figure>
        <div class="envio">
          <label class="botao botao-contorno botao-pequeno rotulo-arquivo">
            Tirar foto ou enviar imagem
            <input type="file" data-upload accept="image/*" hidden>
          </label>
          <button type="button" class="mini-acao" data-remover-foto ${prato.imagem ? "" : "hidden"}>Remover</button>
        </div>
        <span class="envio-aviso" data-envio-aviso></span>
      </div>
      <label class="marcador">
        <input type="checkbox" name="destaque" ${prato.destaque ? "checked" : ""}>
        <span>Marcar como destaque</span>
      </label>
      <label class="marcador">
        <input type="checkbox" name="ativo" ${prato.ativo === false ? "" : "checked"}>
        <span>Ativo <small>(aparece no site)</small></span>
      </label>

      <div class="editor-acoes">
        <button type="submit" class="botao botao-ouro">Salvar</button>
        <button type="button" class="botao botao-contorno acao-cancelar">Cancelar</button>
      </div>
    </form>`;
}

/* ---------- validação ---------- */

function validarItem(dados) {
  if (!dados.nome.trim()) return "Informe o nome do item.";
  if (!dados.descricao.trim()) return "Informe a descrição do item.";
  if (dados.preco === "" || Number.isNaN(Number(dados.preco))) return "Informe um preço válido.";
  if (Number(dados.preco) < 0) return "O preço não pode ser negativo.";
  if (!dados.categoriaId) return "Escolha uma categoria.";
  return null;
}

/* ===================================================================
   Carrossel da capa — usa os itens marcados como destaque
   =================================================================== */

const SEGUNDOS_CAPA = 5.5;

let slides = [];
let slideAtual = 0;
let relogioCapa = null;

function pratosDaCapa() {
  return pratosVisiveis().filter((p) => p.destaque && p.imagem);
}

function montarCapa() {
  slides = pratosDaCapa();
  const caixa = $("#hero-fotos");

  if (slides.length < 1) {
    $("#hero-prato").hidden = true;
    $("#hero-controles").hidden = true;
    $("#hero-vitrine").hidden = true;
    desligarRelogio();
    return;
  }

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
        <button type="button" class="hero-foto-botao" data-prato="${prato.id}"
                aria-label="Ver detalhes de ${escapar(prato.nome)}">
          <img alt="${escapar(prato.nome)}" data-foto="${CONFIG.pastaImagens}${escapar(prato.imagem)}">
        </button>
      </figure>`
    )
    .join("");

  $("#hero-vitrine").hidden = false;

  $("#hero-pontos").style.setProperty("--cap-dur", SEGUNDOS_CAPA + "s");
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
  // o id vai junto: clicar no bloco abre a explicação desse prato
  caixa.dataset.prato = prato.id;
  caixa.setAttribute("aria-label", `Ver detalhes de ${prato.nome}`);
  setTimeout(() => {
    $("#hero-prato-categoria").textContent = prato.categoria || "";
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

// reinicia a animação da barrinha do zero, para ela ficar em sincronia
// com o timer que acabou de ser (re)ligado
function reiniciarProgresso() {
  const ativo = $('.hero-ponto[aria-selected="true"]');
  if (!ativo) return;
  ativo.setAttribute("aria-selected", "false");
  void ativo.offsetWidth;
  ativo.setAttribute("aria-selected", "true");
}

function ligarRelogio() {
  desligarRelogio();
  if (semMovimento) return;
  const pontos = $("#hero-pontos");
  if (pontos) pontos.classList.remove("pausado");
  reiniciarProgresso();
  relogioCapa = setInterval(() => irParaSlide(slideAtual + 1), SEGUNDOS_CAPA * 1000);
}

function desligarRelogio() {
  if (relogioCapa) clearInterval(relogioCapa);
  relogioCapa = null;
  const pontos = $("#hero-pontos");
  if (pontos) pontos.classList.add("pausado");   // congela a barrinha
}

/* ===================================================================
   Animação: abertura, entrada e revelação ao rolar
   =================================================================== */

const semMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let observador = null;

// Abertura: as duas metades do nome se encontram no meio enquanto um anel
// dourado se desenha ao redor; depois o círculo "se abre" (máscara radial)
// e revela o site. Uma vez por sessão.
function iniciarAbertura() {
  const abertura = $("#abertura");
  const raiz = document.documentElement;

  if (semMovimento || raiz.classList.contains("sem-abertura") || !abertura) {
    if (abertura) abertura.remove();
    raiz.classList.remove("abertura-ativa");
    liberarEntrada();
    return;
  }

  const ENTRADA = 1500;   // duração da entrada antes de a íris abrir
  const SAIDA = 850;      // duração da íris/dissolvição

  // Espera a fonte do nome (Playfair) para o texto não "pular" no meio da
  // animação — mas com teto curto, senão trava em conexão ruim. A entrada
  // e a saída partem do MESMO instante (o .tocar), então o timing não
  // depende de quando o CSS/fonte terminou de carregar.
  const pronto = Promise.race([
    document.fonts ? document.fonts.ready : Promise.resolve(),
    new Promise((r) => setTimeout(r, 900)),
  ]);

  pronto.then(() => {
    if (!abertura.isConnected) { liberarEntrada(); return; }
    requestAnimationFrame(() => {
      abertura.classList.add("tocar");
      setTimeout(() => {
        abertura.classList.add("saindo");
        raiz.classList.remove("abertura-ativa");
        try { sessionStorage.setItem("caffe54:abertura", "1"); } catch {}
        liberarEntrada();
        setTimeout(() => abertura.remove(), SAIDA);
      }, ENTRADA);
    });
  });
}

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

  alvos.forEach((alvo) => {
    const irmaos = alvo.parentElement ? [...alvo.parentElement.children] : [];
    const posicao = irmaos.indexOf(alvo);
    alvo.style.setProperty("--atraso", `${Math.min(Math.max(posicao, 0), 5) * 70}ms`);
    observador.observe(alvo);
  });
}

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
   =================================================================== */

const LIMITE_MB = 6;
const LADO_MAXIMO = 1600;   // px — suficiente para os cards e a lupa

// Foto de celular vem enorme (12 MP, 4–8 MB) e, no iPhone, muitas vezes em
// HEIC — que o servidor não aceita. Reduzimos e convertemos para JPEG aqui no
// navegador antes de enviar. Assim qualquer foto do celular passa.
async function prepararFoto(arquivo) {
  let fonte;
  try {
    // imageOrientation respeita o EXIF: foto na vertical não chega deitada.
    fonte = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
  } catch {
    return null;   // formato que o navegador não decodifica — envia como veio
  }

  const escala = Math.min(1, LADO_MAXIMO / Math.max(fonte.width, fonte.height));
  const largura = Math.round(fonte.width * escala);
  const altura = Math.round(fonte.height * escala);

  const tela = document.createElement("canvas");
  tela.width = largura;
  tela.height = altura;
  tela.getContext("2d").drawImage(fonte, 0, 0, largura, altura);
  fonte.close?.();

  const bolha = await new Promise((ok) => tela.toBlob(ok, "image/jpeg", 0.86));
  if (!bolha) return null;

  const nome = arquivo.name.replace(/\.[^.]+$/, "") || "foto";
  return new File([bolha], `${nome}.jpg`, { type: "image/jpeg" });
}

async function enviarImagem(entrada) {
  const escolhido = entrada.files && entrada.files[0];
  if (!escolhido) return;

  const bloco = entrada.closest(".campo-imagem");
  const aviso = bloco.querySelector("[data-envio-aviso]");
  const campo = bloco.querySelector('input[name="imagem"]');
  const previa = bloco.querySelector("[data-previa]");
  const remover = bloco.querySelector("[data-remover-foto]");

  const dizer = (texto, tipo = "") => {
    aviso.textContent = texto;
    aviso.className = `envio-aviso ${tipo}`;
  };

  dizer("Preparando a foto…");
  const arquivo = (await prepararFoto(escolhido)) || escolhido;

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
      body: pacote,
    });

    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(corpo.error || `Erro ${resposta.status}`);

    campo.value = corpo.imagem;
    previa.hidden = false;
    previa.querySelector("img").src = CONFIG.pastaImagens + corpo.imagem;
    if (remover) remover.hidden = false;
    dizer("Foto selecionada ✓", "ok");
    montarListaImagens();
  } catch (erro) {
    dizer(erro.message, "erro");
  } finally {
    entrada.value = "";
  }
}

// Botão "Remover" da foto: limpa o valor e volta ao estado sem foto.
function removerFoto(botao) {
  const bloco = botao.closest(".campo-imagem");
  if (!bloco) return;
  bloco.querySelector('input[name="imagem"]').value = "";
  const previa = bloco.querySelector("[data-previa]");
  previa.hidden = true;
  previa.querySelector("img").src = "";
  botao.hidden = true;
  const aviso = bloco.querySelector("[data-envio-aviso]");
  if (aviso) { aviso.textContent = ""; aviso.className = "envio-aviso"; }
}

/* ---------- prévia do mapa no painel ---------- */

function atualizarPreviaMapa() {
  const previa = $("#local-previa");
  if (!previa) return;
  const endereco = (config.endereco || "").trim();
  const frame = previa.querySelector("iframe");
  if (endereco) {
    const q = encodeURIComponent(endereco);
    if (frame.dataset.q !== q) {
      frame.src = `https://www.google.com/maps?q=${q}&z=16&output=embed`;
      frame.dataset.q = q;
    }
    previa.hidden = false;
  } else {
    previa.hidden = true;
    frame.removeAttribute("src");
    delete frame.dataset.q;
  }
}

/* ===================================================================
   Eventos
   =================================================================== */

/* ---------- filtros ---------- */

$("#filtros").addEventListener("click", (evento) => {
  const botao = evento.target.closest(".filtro");
  if (!botao) return;
  trocarCategoria(botao.dataset.categoria);
  const barra = $(".barra-filtros");
  if (barra.getBoundingClientRect().top < 0) {
    barra.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

/* ---------- carrossel ---------- */

$("#hero-anterior").addEventListener("click", () => { irParaSlide(slideAtual - 1); ligarRelogio(); });
$("#hero-proximo").addEventListener("click", () => { irParaSlide(slideAtual + 1); ligarRelogio(); });
$("#hero-pontos").addEventListener("click", (evento) => {
  const ponto = evento.target.closest(".hero-ponto");
  if (!ponto) return;
  irParaSlide(Number(ponto.dataset.ir));
  ligarRelogio();
});
$("#hero").addEventListener("mouseenter", desligarRelogio);
$("#hero").addEventListener("mouseleave", () => { if (slides.length > 1) ligarRelogio(); });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) desligarRelogio();
  else if (slides.length > 1) ligarRelogio();
});

/* ---------- foto ampliada ---------- */

$("#grade").addEventListener("click", (evento) => {
  const foto = evento.target.closest(".cartao-foto");
  if (foto) abrirLupa(foto.dataset.id, foto, evento);
});

// Na capa: clicar no nome/preço do destaque ou na foto emoldurada abre a
// explicação do prato, igual ao card do cardápio.
$("#hero-prato").addEventListener("click", (evento) => {
  abrirLupa(evento.currentTarget.dataset.prato, evento.currentTarget, evento);
});
$("#hero-vitrine").addEventListener("click", (evento) => {
  const botao = evento.target.closest("[data-prato]");
  if (botao) abrirLupa(botao.dataset.prato, botao, evento);
});
$("#lupa-fechar").addEventListener("click", fecharLupa);
$("#lupa").addEventListener("click", (evento) => {
  if (evento.target === $("#lupa")) fecharLupa();
});
// ESC: o padrão fecha na hora — segura e deixa a animação de saída rodar
$("#lupa").addEventListener("cancel", (evento) => {
  evento.preventDefault();
  fecharLupa();
});

/* ---------- abrir / fechar o painel ---------- */

$("#gatilho-admin").addEventListener("click", abrirPainel);
$("#admin-fechar").addEventListener("click", fecharPainel);
document.addEventListener("keydown", (evento) => {
  if (evento.key === "Escape" && !$("#admin").hidden) fecharPainel();
});

/* ---------- navegação entre seções ---------- */

$("#admin-nav").addEventListener("click", (evento) => {
  const item = evento.target.closest(".admin-nav-item");
  if (item) trocarSecao(item.dataset.secao);
});

/* ---------- login / logout ---------- */

$("#formulario-login").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const usuario = $("#login-usuario").value.trim();
  const senha = $("#login-senha").value;
  if (!usuario || !senha) {
    notificar("Preencha usuário e senha.", "erro");
    return;
  }
  try {
    const dados = await api("/admin/login", {
      method: "POST",
      body: JSON.stringify({ usuario, senha }),
    });
    localStorage.setItem(CONFIG.chaveToken, dados.token);
    localStorage.setItem(CONFIG.chaveUsuario, dados.admin.usuario);
    $("#formulario-login").reset();
    mostrarPainel(true);
    await carregarCardapio();
    notificar("Bem-vindo de volta.");
  } catch (erro) {
    notificar(erro.message, "erro");
  }
});

$("#botao-sair").addEventListener("click", () => {
  sair();
  carregarCardapio();
  notificar("Você saiu do painel.");
});

/* ---------- informações e localização ---------- */

async function salvarConfig(dados, mensagem) {
  try {
    config = await api("/config", { method: "PUT", body: JSON.stringify(dados) });
    aplicarConfig();
    montarGrade();
    notificar(mensagem);
  } catch (erro) {
    notificar(erro.message, "erro");
  }
}

$("#formulario-info").addEventListener("submit", (evento) => {
  evento.preventDefault();
  const d = Object.fromEntries(new FormData(evento.target));
  salvarConfig(
    {
      sobre: d.sobre, introCardapio: d.introCardapio,
      telefone: d.telefone, email: d.email,
      // a `chave` é só do painel — não vai para o banco
      links: linksRascunho
        .filter((l) => l.valor.trim())
        .map(({ tipo, valor, rotulo }) => ({ tipo, valor, rotulo })),
    },
    "Informações salvas."
  );
});

/* ---------- lista de links (painel) ---------- */

// índice do link a partir da linha clicada (pela chave, não pela posição)
function indiceDoLink(linha) {
  return linksRascunho.findIndex((l) => String(l.chave) === linha.dataset.id);
}

$("#link-adicionar").addEventListener("click", () => {
  if (linksRascunho.length >= MAX_LINKS) return;
  linksRascunho.push({ chave: proximaChaveLink++, tipo: "instagram", valor: "", rotulo: "" });
  desenharLinksAdmin();
  // foca o campo do link recém-criado
  const ultimo = $("#links-lista").lastElementChild;
  if (ultimo) ultimo.querySelector(".link-valor").focus();
});

$("#links-lista").addEventListener("input", (evento) => {
  const linha = evento.target.closest(".link-linha");
  const campo = evento.target.dataset.campo;
  if (!linha || !campo) return;
  const i = indiceDoLink(linha);
  if (i >= 0) linksRascunho[i][campo] = evento.target.value;
});

// trocar o tipo muda a dica e o exemplo — e mostra/esconde o campo de nome
$("#links-lista").addEventListener("change", (evento) => {
  const linha = evento.target.closest(".link-linha");
  if (!linha || evento.target.dataset.campo !== "tipo") return;
  const i = indiceDoLink(linha);
  if (i < 0) return;
  linksRascunho[i].tipo = evento.target.value;
  desenharLinksAdmin();
});

$("#links-lista").addEventListener("click", (evento) => {
  const linha = evento.target.closest(".link-linha");
  if (!linha) return;
  const i = indiceDoLink(linha);
  if (i < 0) return;

  if (evento.target.matches("[data-remover-link]")) {
    linksRascunho.splice(i, 1);
    desenharLinksAdmin();
    return;
  }

  const mover = evento.target.closest("[data-mover]");
  if (!mover) return;
  const destino = i + Number(mover.dataset.mover);
  if (destino < 0 || destino >= linksRascunho.length) return;

  // mesma animação de deslizar das categorias
  animarReordenacao($("#links-lista"), () => {
    const [item] = linksRascunho.splice(i, 1);
    linksRascunho.splice(destino, 0, item);
    desenharLinksAdmin();
  }, linksRascunho[i].chave);
});

$("#formulario-local").addEventListener("submit", (evento) => {
  evento.preventDefault();
  const d = Object.fromEntries(new FormData(evento.target));
  salvarConfig({ endereco: d.endereco }, "Endereço salvo.");
});

$("#formulario-horarios").addEventListener("submit", (evento) => {
  evento.preventDefault();
  salvarConfig({ horarios: lerHorarios() }, "Horários salvos.");
});

// "Fechado" esconde os campos de hora do dia
$("#horarios-grade").addEventListener("change", (evento) => {
  if (!evento.target.matches('[data-campo="fechado"]')) return;
  const linha = evento.target.closest(".horario-linha");
  const fechado = evento.target.checked;
  linha.classList.toggle("fechado", fechado);
  linha.querySelectorAll('[data-campo="abre"], [data-campo="fecha"]').forEach((i) => {
    i.disabled = fechado;
  });
});

$("#horarios-replicar").addEventListener("click", replicarSegunda);

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
        categoriaId: Number(dados.categoriaId),
        imagem: dados.imagem.trim(),
        destaque: formulario.destaque.checked,
        ativo: formulario.ativo.checked,
      }),
    });
    formulario.reset();
    const fotoBloco = formulario.querySelector(".campo-imagem");
    if (fotoBloco) {
      const b = fotoBloco.querySelector("[data-remover-foto]");
      if (b) removerFoto(b);
    }
    montarSeletores();
    await carregarCardapio();
    notificar("Item criado com sucesso!");
  } catch (erro) {
    notificar(erro.message, "erro");
  }
});

/* ---------- lista de itens: ativar, editar, cancelar, excluir ---------- */

$("#lista").addEventListener("click", async (evento) => {
  const editar = evento.target.closest(".acao-editar");
  const remover = evento.target.closest(".acao-remover");
  const cancelar = evento.target.closest(".acao-cancelar");
  const ativo = evento.target.closest(".acao-ativo");

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
  if (ativo) {
    const id = Number(ativo.dataset.ativo);
    const p = pratos.find((x) => x.id === id);
    if (!p) return;
    try {
      await api(`/menu/${id}`, { method: "PUT", body: JSON.stringify({ ativo: p.ativo === false }) });
      await carregarCardapio();
      notificar(p.ativo === false ? "Item ativado." : "Item desativado.");
    } catch (erro) {
      notificar(erro.message, "erro");
    }
    return;
  }
  if (remover) {
    const id = Number(remover.dataset.remover);
    const prato = pratos.find((item) => item.id === id);
    if (!confirm(`Excluir "${prato?.nome}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await api(`/menu/${id}`, { method: "DELETE" });
      editandoId = null;
      await carregarCardapio();
      notificar("Item excluído.");
    } catch (erro) {
      notificar(erro.message, "erro");
    }
  }
});

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
        categoriaId: Number(dados.categoriaId),
        imagem: dados.imagem.trim(),
        destaque: formulario.destaque.checked,
        ativo: formulario.ativo.checked,
      }),
    });
    editandoId = null;
    await carregarCardapio();
    notificar("Item atualizado.");
  } catch (erro) {
    notificar(erro.message, "erro");
  }
});

/* ---------- categorias ---------- */

$("#formulario-categoria").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const campo = evento.target.elements.nome;
  const nome = campo.value.trim();
  if (!nome) return;
  try {
    await api("/categorias", { method: "POST", body: JSON.stringify({ nome }) });
    campo.value = "";
    await carregarCategorias();
    atualizarPainel();
    notificar("Categoria criada.");
  } catch (erro) {
    notificar(erro.message, "erro");
  }
});

$("#lista-categorias").addEventListener("click", (evento) => {
  const mover = evento.target.closest("[data-mover]");
  const excluir = evento.target.closest("[data-excluir]");
  if (mover) {
    const id = mover.closest(".categoria-linha").dataset.id;
    moverCategoria(id, mover.dataset.mover);
  }
  if (excluir) excluirCategoria(excluir.dataset.excluir);
});

$("#lista-categorias").addEventListener("change", (evento) => {
  if (!evento.target.matches(".categoria-nome")) return;
  const id = evento.target.closest(".categoria-linha").dataset.id;
  salvarNomeCategoria(id, evento.target.value);
});

/* ---------- destaques ---------- */

$("#lista-destaques").addEventListener("change", (evento) => {
  const caixa = evento.target.closest("[data-destaque]");
  if (caixa) alternarDestaque(caixa.dataset.destaque, caixa.checked);
});

/* ---------- foto do item (formulário de criar + editores) ---------- */

$("#admin").addEventListener("change", (evento) => {
  if (evento.target.matches("input[type=file][data-upload]")) enviarImagem(evento.target);
});
$("#admin").addEventListener("click", (evento) => {
  if (evento.target.matches("[data-remover-foto]")) removerFoto(evento.target);
});

/* ---------- busca ---------- */

$("#busca").addEventListener("input", (evento) => {
  termoBusca = evento.target.value;
  montarListaAdmin();
});

/* ===================================================================
   Início
   =================================================================== */

mostrarPainel(estaLogado());
iniciarAbertura();
Promise.all([carregarConfig(), carregarCategorias()]).then(carregarCardapio);
