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
const JWT_SECRET = process.env.JWT_SECRET || "sua_chave_secreta_aqui";
const RESTAURANTE_ID = 1;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(cors());
app.use(express.json());

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

const TIPOS_ACEITOS = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const EXTENSAO = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/avif": ".avif" };

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
      return pronto(new Error("Formato não aceito. Use JPG, PNG, WebP ou AVIF."));
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
      .filter((nome) => /\.(jpe?g|png|webp|avif)$/i.test(nome))
      .sort();
    res.json(arquivos);
  } catch {
    res.status(500).json({ error: "Erro ao listar imagens" });
  }
});

// ============ CONFIGURAÇÃO DO SITE ============

// Campos que o admin pode editar pelo painel.
const CAMPOS_CONFIG = [
  "nome", "descricao", "linkPedido", "textoBotao",
  "instagram", "endereco", "telefone", "email", "horario",
];

// pública: o site lê daqui o link do botão "Pedir" e os dados do rodapé
app.get("/config", async (req, res) => {
  try {
    const restaurante = await prisma.restaurante.findUnique({
      where: { id: RESTAURANTE_ID },
      select: Object.fromEntries(CAMPOS_CONFIG.map((campo) => [campo, true])),
    });
    if (!restaurante) return res.status(404).json({ error: "Restaurante não encontrado" });
    res.json(restaurante);
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar configuração" });
  }
});

// protegida: o admin escolhe para onde o botão leva (iFood, Instagram, WhatsApp...)
app.put("/config", autenticar, async (req, res) => {
  try {
    const dados = {};
    for (const campo of CAMPOS_CONFIG) {
      if (req.body[campo] !== undefined) {
        dados[campo] = String(req.body[campo]).trim();
      }
    }
    if (dados.nome === "") delete dados.nome;
    if (dados.descricao === "") delete dados.descricao;
    if (dados.textoBotao === "") dados.textoBotao = "Pedir";

    const atualizado = await prisma.restaurante.update({
      where: { id: RESTAURANTE_ID },
      data: dados,
      select: Object.fromEntries(CAMPOS_CONFIG.map((campo) => [campo, true])),
    });
    res.json(atualizado);
  } catch (error) {
    res.status(400).json({ error: "Erro ao salvar configuração" });
  }
});

// ============ ROTAS DE MENU ============

app.get("/menu", async (req, res) => {
  try {
    const itens = await prisma.menuItem.findMany({
      where: { restauranteId: RESTAURANTE_ID },
      orderBy: [{ categoria: "asc" }, { nome: "asc" }]
    });
    res.json(itens);
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar menu" });
  }
});

app.get("/menu/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const item = await prisma.menuItem.findUnique({
      where: { id }
    });
    if (!item) return res.status(404).json({ error: "Item não encontrado" });
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar item" });
  }
});

app.post("/menu", autenticar, async (req, res) => {
  const { nome, descricao, preco, categoria, imagem, destaque, carrossel } = req.body;
  try {
    if (!nome || preco === undefined || preco === "" || !categoria || !descricao) {
      return res.status(400).json({ error: "Nome, descrição, preço e categoria são obrigatórios" });
    }
    if (Number.isNaN(Number(preco))) {
      return res.status(400).json({ error: "Preço precisa ser um número" });
    }
    const novoItem = await prisma.menuItem.create({
      data: {
        nome,
        descricao,
        preco: Number(preco),
        categoria,
        imagem: imagem || null,
        destaque: Boolean(destaque),
        carrossel: Boolean(carrossel),
        restauranteId: RESTAURANTE_ID
      }
    });
    res.status(201).json(novoItem);
  } catch (error) {
    res.status(400).json({ error: "Erro ao criar item" });
  }
});

app.put("/menu/:id", autenticar, async (req, res) => {
  const { id } = req.params;
  const { nome, descricao, preco, categoria, imagem, destaque, carrossel } = req.body;
  try {
    if (preco !== undefined && preco !== "" && Number.isNaN(Number(preco))) {
      return res.status(400).json({ error: "Preço precisa ser um número" });
    }
    const atualizado = await prisma.menuItem.update({
      where: { id: Number(id) },
      data: {
        nome: nome || undefined,
        descricao: descricao || undefined,
        preco: preco === undefined || preco === "" ? undefined : Number(preco),
        categoria: categoria || undefined,
        // imagem vazia limpa o campo; ausente mantém o valor atual
        imagem: imagem === undefined ? undefined : imagem || null,
        destaque: destaque === undefined ? undefined : Boolean(destaque),
        carrossel: carrossel === undefined ? undefined : Boolean(carrossel)
      }
    });
    res.json(atualizado);
  } catch (error) {
    res.status(404).json({ error: "Item não encontrado" });
  }
});

app.delete("/menu/:id", autenticar, async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.menuItem.delete({
      where: { id: Number(id) }
    });
    res.status(204).send();
  } catch (error) {
    res.status(404).json({ error: "Item não encontrado" });
  }
});

// ============ ROTAS DE ADMIN ============

app.post("/admin/login", async (req, res) => {
  const { email, senha } = req.body;
  try {
    if (!email || !senha) {
      return res.status(400).json({ error: "Email e senha são obrigatórios" });
    }
    const admin = await prisma.admin.findUnique({
      where: { email }
    });
    if (!admin) {
      return res.status(401).json({ error: "Email ou senha incorretos" });
    }
    const senhaValida = await bcrypt.compare(senha, admin.senhaHash);
    if (!senhaValida) {
      return res.status(401).json({ error: "Email ou senha incorretos" });
    }
    const token = jwt.sign(
      { id: admin.id, email: admin.email, restauranteId: admin.restauranteId },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({ token, admin: { id: admin.id, email: admin.email } });
  } catch (error) {
    res.status(500).json({ error: "Erro ao fazer login" });
  }
});

app.post("/admin/register", async (req, res) => {
  const { email, senha, restauranteId } = req.body;
  try {
    if (!email || !senha || !restauranteId) {
      return res.status(400).json({ error: "Email, senha e restauranteId são obrigatórios" });
    }
    const adminExistente = await prisma.admin.findUnique({
      where: { email }
    });
    if (adminExistente) {
      return res.status(400).json({ error: "Email já cadastrado" });
    }
    const senhaHash = await bcrypt.hash(senha, 10);
    const novoAdmin = await prisma.admin.create({
      data: {
        email,
        senhaHash,
        restauranteId
      }
    });
    res.status(201).json({
      message: "Admin criado com sucesso",
      admin: { id: novoAdmin.id, email: novoAdmin.email }
    });
  } catch (error) {
    res.status(400).json({ error: "Erro ao registrar admin" });
  }
});

// ============ INICIAR SERVIDOR ============

app.listen(PORT, () => {
  console.log(`Caffè 54 rodando em: http://localhost:${PORT}`);
});
