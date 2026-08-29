import "dotenv/config";
import express from "express";
import { prisma } from "./lib/prisma.ts";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "node:path";
import fs from "node:fs";
import multer from "multer";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = process.env.PORT || 3001;

// MVP de um único estabelecimento. Todo dado já tem `restauranteId`; quando
// existir login por estabelecimento, esta constante vira `req.admin.restauranteId`
// nas rotas autenticadas e um "resolver por subdomínio" nas públicas.
// Ver o roteiro em CLAUDE.md ("Login por estabelecimento").
const RESTAURANTE_ID = 1;

// O segredo dos tokens não tem fallback: sem um valor real no .env o
// servidor nem sobe. Um fallback fixo no código deixaria qualquer pessoa
// forjar um token de admin.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === "sua_chave_secreta_aqui" || JWT_SECRET.length < 24) {
  console.error(
    "\n  JWT_SECRET ausente ou fraco no .env.\n" +
    "  Gere um e cole no .env como JWT_SECRET=\"...\":\n" +
    "    node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"\n"
  );
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(cors());
app.use(express.json());

// cabeçalho barato que impede o navegador de "adivinhar" o tipo de um
// arquivo servido e tratá-lo como script
app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  next();
});

// serve o site (index.html, styles.css, app.js e as imagens do cardápio)
app.use(express.static(path.join(__dirname, "..", "frontend")));

// ============ AUTENTICAÇÃO ============

// protege as rotas de escrita: exige "Authorization: Bearer <token>"
function autenticar(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Token não enviado" });
  }
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }
}

// ============ UPLOAD DE IMAGENS ============

const PASTA_IMAGENS = path.join(__dirname, "..", "frontend", "images", "cardapio");
fs.mkdirSync(PASTA_IMAGENS, { recursive: true });

// heic/heif: o iPhone envia assim quando o navegador não converte. O frontend
// já reduz e converte para JPEG antes de enviar; isto é a rede de segurança.
const TIPOS_ACEITOS = new Set([
  "image/jpeg", "image/png", "image/webp", "image/avif", "image/heic", "image/heif",
]);
const EXTENSAO = {
  "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp",
  "image/avif": ".avif", "image/heic": ".heic", "image/heif": ".heif",
};

// Nome de arquivo seguro: sem acento, sem espaço, sem caminho.
// O multer entrega originalname em latin1; sem reconverter, "Café" vira "CafÃ©".
function nomeSeguro(original, mimetype) {
  const utf8 = Buffer.from(original, "latin1").toString("utf8");
  const semAcento = path
    .basename(utf8, path.extname(utf8))
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "");

  const base =
    semAcento
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60) || "imagem";

  return `${base}-${Date.now().toString(36)}${EXTENSAO[mimetype] || ".jpg"}`;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, arquivo, pronto) => pronto(null, PASTA_IMAGENS),
    filename: (req, arquivo, pronto) => pronto(null, nomeSeguro(arquivo.originalname, arquivo.mimetype)),
  }),
  limits: { fileSize: 6 * 1024 * 1024, files: 1 },
  fileFilter: (req, arquivo, pronto) => {
    if (!TIPOS_ACEITOS.has(arquivo.mimetype)) {
      return pronto(new Error("Formato de imagem não aceito. Tente outra foto."));
    }
    pronto(null, true);
  },
});

// admin envia uma foto e recebe o nome do arquivo para gravar no item
app.post("/upload", autenticar, (req, res) => {
  upload.single("imagem")(req, res, (erro) => {
    if (erro) {
      const mensagem =
        erro.code === "LIMIT_FILE_SIZE" ? "A imagem passa de 6 MB." : erro.message;
      return res.status(400).json({ error: mensagem });
    }
    if (!req.file) return res.status(400).json({ error: "Nenhuma imagem enviada" });
    res.status(201).json({ imagem: req.file.filename, tamanho: req.file.size });
  });
});

// lista o que já existe na pasta, para o admin escolher sem digitar
app.get("/imagens", autenticar, (req, res) => {
  try {
    const arquivos = fs
      .readdirSync(PASTA_IMAGENS)
      .filter((nome) => /\.(jpe?g|png|webp|avif|heic|heif)$/i.test(nome))
      .sort();
    res.json(arquivos);
  } catch {
    res.status(500).json({ error: "Erro ao listar imagens" });
  }
});

// ============ CONFIGURAÇÃO DO SITE ============

// Campos de texto que o dono edita no painel (aba "Informações" + "Localização").
const CAMPOS_CONFIG = [
  "instagram", "endereco", "telefone", "email", "sobre", "introCardapio",
];

// O que o site lê (inclui nome/descrição, usados no título e rodapé, e os horários).
const SELECT_CONFIG = {
  nome: true, descricao: true,
  instagram: true, endereco: true, telefone: true, email: true,
  sobre: true, introCardapio: true, horarios: true,
};

const DIAS_SEMANA = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];

// Normaliza o array de horários vindo do painel. Fora do formato → null.
function normalizarHorarios(entrada) {
  if (!Array.isArray(entrada)) return null;
  const limpo = entrada
    .filter((h) => h && DIAS_SEMANA.includes(h.dia))
    .map((h) => ({
      dia: h.dia,
      abre: typeof h.abre === "string" ? h.abre.slice(0, 5) : "",
      fecha: typeof h.fecha === "string" ? h.fecha.slice(0, 5) : "",
      fechado: Boolean(h.fechado),
    }));
  return limpo.length ? limpo : null;
}

// pública: o site lê daqui o contato do rodapé, a seção "Visite" e os horários
app.get("/config", async (req, res) => {
  try {
    const restaurante = await prisma.restaurante.findUnique({
      where: { id: RESTAURANTE_ID },
      select: SELECT_CONFIG,
    });
    if (!restaurante) return res.status(404).json({ error: "Restaurante não encontrado" });
    res.json(restaurante);
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar configuração" });
  }
});

// protegida: o dono edita as informações do estabelecimento
app.put("/config", autenticar, async (req, res) => {
  try {
    const dados = {};
    for (const campo of CAMPOS_CONFIG) {
      if (req.body[campo] === undefined) continue;
      // campo apagado no painel (null ou "") grava NULL — sem isso um null
      // virava a string "null" e o site exibia isso.
      const bruto = req.body[campo];
      const texto = bruto === null ? "" : String(bruto).trim();
      dados[campo] = texto === "" ? null : texto;
    }
    if ("horarios" in req.body) {
      dados.horarios = normalizarHorarios(req.body.horarios);
    }

    const atualizado = await prisma.restaurante.update({
      where: { id: RESTAURANTE_ID },
      data: dados,
      select: SELECT_CONFIG,
    });
    res.json(atualizado);
  } catch (error) {
    res.status(400).json({ error: "Erro ao salvar configuração" });
  }
});

// ============ CATEGORIAS ============

// pública: o site monta os filtros e a ordem dos blocos a partir daqui
app.get("/categorias", async (req, res) => {
  try {
    const cats = await prisma.categoria.findMany({
      where: { restauranteId: RESTAURANTE_ID },
      orderBy: { ordem: "asc" },
      select: { id: true, nome: true, ordem: true },
    });
    res.json(cats);
  } catch {
    res.status(500).json({ error: "Erro ao buscar categorias" });
  }
});

app.post("/categorias", autenticar, async (req, res) => {
  const nome = String(req.body.nome || "").trim();
  if (!nome) return res.status(400).json({ error: "Informe o nome da categoria." });
  try {
    const max = await prisma.categoria.aggregate({
      where: { restauranteId: RESTAURANTE_ID },
      _max: { ordem: true },
    });
    const cat = await prisma.categoria.create({
      data: { nome, ordem: (max._max.ordem ?? -1) + 1, restauranteId: RESTAURANTE_ID },
      select: { id: true, nome: true, ordem: true },
    });
    res.status(201).json(cat);
  } catch (e) {
    if (e.code === "P2002") return res.status(409).json({ error: "Já existe uma categoria com esse nome." });
    res.status(400).json({ error: "Erro ao criar categoria." });
  }
});

// precisa vir ANTES de "/categorias/:id" para o Express não casar id = "ordenar"
app.put("/categorias/ordenar", autenticar, async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number) : [];
  try {
    await prisma.$transaction(
      ids.map((id, i) =>
        prisma.categoria.updateMany({
          where: { id, restauranteId: RESTAURANTE_ID },
          data: { ordem: i },
        })
      )
    );
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: "Erro ao reordenar categorias." });
  }
});

app.put("/categorias/:id", autenticar, async (req, res) => {
  const id = Number(req.params.id);
  const nome = String(req.body.nome || "").trim();
  if (!nome) return res.status(400).json({ error: "Informe o nome da categoria." });
  try {
    const r = await prisma.categoria.updateMany({
      where: { id, restauranteId: RESTAURANTE_ID },
      data: { nome },
    });
    if (!r.count) return res.status(404).json({ error: "Categoria não encontrada." });
    res.json({ id, nome });
  } catch (e) {
    if (e.code === "P2002") return res.status(409).json({ error: "Já existe uma categoria com esse nome." });
    res.status(400).json({ error: "Erro ao renomear categoria." });
  }
});

app.delete("/categorias/:id", autenticar, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const cat = await prisma.categoria.findFirst({
      where: { id, restauranteId: RESTAURANTE_ID },
    });
    if (!cat) return res.status(404).json({ error: "Categoria não encontrada." });

    const n = await prisma.menuItem.count({ where: { categoriaId: id } });
    if (n > 0) {
      return res.status(409).json({
        error: `Esta categoria tem ${n} ${n === 1 ? "item" : "itens"}. Mova ou exclua os itens antes.`,
      });
    }
    await prisma.categoria.delete({ where: { id } });
    res.status(204).send();
  } catch {
    res.status(400).json({ error: "Erro ao excluir categoria." });
  }
});

// ============ ROTAS DE MENU ============

const INCLUDE_CAT = { categoria: { select: { nome: true, ordem: true } } };

// achata a relação: o front continua lendo `item.categoria` como string
function achatar(item) {
  const { categoria, ...resto } = item;
  return { ...resto, categoria: categoria?.nome ?? null, categoriaOrdem: categoria?.ordem ?? 999 };
}

// pública: só os itens ativos, na ordem das categorias
app.get("/menu", async (req, res) => {
  try {
    const itens = await prisma.menuItem.findMany({
      where: { restauranteId: RESTAURANTE_ID, ativo: true },
      include: INCLUDE_CAT,
      orderBy: [{ categoria: { ordem: "asc" } }, { nome: "asc" }],
    });
    res.json(itens.map(achatar));
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar menu" });
  }
});

// painel: todos os itens, inclusive os inativos (precisa vir antes de "/menu/:id")
app.get("/menu/admin", autenticar, async (req, res) => {
  try {
    const itens = await prisma.menuItem.findMany({
      where: { restauranteId: RESTAURANTE_ID },
      include: INCLUDE_CAT,
      orderBy: [{ categoria: { ordem: "asc" } }, { nome: "asc" }],
    });
    res.json(itens.map(achatar));
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar menu" });
  }
});

app.get("/menu/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const item = await prisma.menuItem.findUnique({ where: { id }, include: INCLUDE_CAT });
    if (!item) return res.status(404).json({ error: "Item não encontrado" });
    res.json(achatar(item));
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar item" });
  }
});

app.post("/menu", autenticar, async (req, res) => {
  const { nome, descricao, preco, categoriaId, imagem, destaque, ativo } = req.body;
  try {
    if (!nome || !descricao || preco === undefined || preco === "" || !categoriaId) {
      return res.status(400).json({ error: "Nome, descrição, preço e categoria são obrigatórios" });
    }
    if (Number.isNaN(Number(preco))) {
      return res.status(400).json({ error: "Preço precisa ser um número" });
    }
    const cat = await prisma.categoria.findFirst({
      where: { id: Number(categoriaId), restauranteId: RESTAURANTE_ID },
    });
    if (!cat) return res.status(400).json({ error: "Categoria inválida" });

    const novoItem = await prisma.menuItem.create({
      data: {
        nome,
        descricao,
        preco: Number(preco),
        categoriaId: cat.id,
        imagem: imagem || null,
        destaque: Boolean(destaque),
        ativo: ativo === undefined ? true : Boolean(ativo),
        restauranteId: RESTAURANTE_ID,
      },
      include: INCLUDE_CAT,
    });
    res.status(201).json(achatar(novoItem));
  } catch (error) {
    res.status(400).json({ error: "Erro ao criar item" });
  }
});

app.put("/menu/:id", autenticar, async (req, res) => {
  const id = Number(req.params.id);
  const { nome, descricao, preco, categoriaId, imagem, destaque, ativo } = req.body;
  try {
    if (preco !== undefined && preco !== "" && Number.isNaN(Number(preco))) {
      return res.status(400).json({ error: "Preço precisa ser um número" });
    }
    let catId;
    if (categoriaId !== undefined) {
      const cat = await prisma.categoria.findFirst({
        where: { id: Number(categoriaId), restauranteId: RESTAURANTE_ID },
      });
      if (!cat) return res.status(400).json({ error: "Categoria inválida" });
      catId = cat.id;
    }
    const atualizado = await prisma.menuItem.update({
      where: { id },
      data: {
        nome: nome || undefined,
        descricao: descricao || undefined,
        preco: preco === undefined || preco === "" ? undefined : Number(preco),
        categoriaId: catId,
        // imagem vazia limpa o campo; ausente mantém o valor atual
        imagem: imagem === undefined ? undefined : imagem || null,
        destaque: destaque === undefined ? undefined : Boolean(destaque),
        ativo: ativo === undefined ? undefined : Boolean(ativo),
      },
      include: INCLUDE_CAT,
    });
    res.json(achatar(atualizado));
  } catch (error) {
    res.status(404).json({ error: "Item não encontrado" });
  }
});

app.delete("/menu/:id", autenticar, async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.menuItem.delete({ where: { id: Number(id) } });
    res.status(204).send();
  } catch (error) {
    res.status(404).json({ error: "Item não encontrado" });
  }
});

// ============ ROTAS DE ADMIN ============

app.post("/admin/login", async (req, res) => {
  // aceita { usuario } (novo) ou { email } (compatibilidade)
  const usuario = req.body.usuario ?? req.body.email;
  const { senha } = req.body;
  try {
    if (!usuario || !senha) {
      return res.status(400).json({ error: "Usuário e senha são obrigatórios" });
    }
    const admin = await prisma.admin.findUnique({ where: { usuario } });
    if (!admin || !(await bcrypt.compare(senha, admin.senhaHash))) {
      return res.status(401).json({ error: "Usuário ou senha incorretos" });
    }
    const token = jwt.sign(
      { id: admin.id, usuario: admin.usuario, restauranteId: admin.restauranteId },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({ token, admin: { id: admin.id, usuario: admin.usuario } });
  } catch (error) {
    res.status(500).json({ error: "Erro ao fazer login" });
  }
});

// Criar outro admin só faz sentido para quem já entrou. Sem o autenticar
// aqui, qualquer pessoa na internet poderia criar a própria conta de admin.
app.post("/admin/register", autenticar, async (req, res) => {
  const usuario = req.body.usuario ?? req.body.email;
  const { senha, restauranteId } = req.body;
  try {
    if (!usuario || !senha || !restauranteId) {
      return res.status(400).json({ error: "Usuário, senha e restauranteId são obrigatórios" });
    }
    if (await prisma.admin.findUnique({ where: { usuario } })) {
      return res.status(400).json({ error: "Usuário já cadastrado" });
    }
    const novoAdmin = await prisma.admin.create({
      data: { usuario, senhaHash: await bcrypt.hash(senha, 10), restauranteId },
    });
    res.status(201).json({
      message: "Admin criado com sucesso",
      admin: { id: novoAdmin.id, usuario: novoAdmin.usuario },
    });
  } catch (error) {
    res.status(400).json({ error: "Erro ao registrar admin" });
  }
});

// ============ INICIAR SERVIDOR ============

app.listen(PORT, () => {
  console.log(`Caffè 54 rodando em: http://localhost:${PORT}`);
});
