import "dotenv/config";
import { readFile } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.ts";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@caffe54.com";
const ADMIN_SENHA = process.env.ADMIN_SENHA || "caffe54";

const dados = JSON.parse(
  await readFile(new URL("./cardapio-dados.json", import.meta.url), "utf8")
);

// Valores iniciais do site. O admin troca tudo isso pelo painel;
// rodar o seed de novo restaura estes valores.
const CONFIG_INICIAL = {
  nome: "Caffè 54",
  descricao: "Sofisticação Italiana",
  logo: null,
  // Tudo abaixo é preenchido pelo admin no painel do site.
  // Enquanto estiver vazio, o botão "Pedir" não aparece e os blocos
  // do rodapé ficam escondidos.
  linkPedido: null,
  textoBotao: "Pedir",
  instagram: null,
  endereco: null,
  telefone: null,
  email: null,
  horario: null,
};

const restaurante = await prisma.restaurante.upsert({
  where: { id: 1 },
  update: CONFIG_INICIAL,
  create: { id: 1, ...CONFIG_INICIAL },
});

const admin = await prisma.admin.upsert({
  where: { email: ADMIN_EMAIL },
  update: { senhaHash: await bcrypt.hash(ADMIN_SENHA, 10) },
  create: {
    email: ADMIN_EMAIL,
    senhaHash: await bcrypt.hash(ADMIN_SENHA, 10),
    restauranteId: restaurante.id,
  },
});

// recria o cardápio a partir do JSON extraído do PDF
await prisma.menuItem.deleteMany({ where: { restauranteId: restaurante.id } });
await prisma.menuItem.createMany({
  data: dados.map((item) => ({
    nome: item.nome,
    descricao: item.descricao || null,
    preco: item.preco,
    categoria: item.categoria,
    imagem: item.imagem || null,
    destaque: Boolean(item.destaque),
    // a capa começa girando os destaques; o admin ajusta no painel
    carrossel: Boolean(item.destaque),
    restauranteId: restaurante.id,
  })),
});

const total = await prisma.menuItem.count({ where: { restauranteId: restaurante.id } });
const destaques = await prisma.menuItem.count({ where: { restauranteId: restaurante.id, destaque: true } });
const naCapa = await prisma.menuItem.count({ where: { restauranteId: restaurante.id, carrossel: true } });

console.log(`Restaurante: ${restaurante.nome} (id ${restaurante.id})`);
console.log(`Admin:       ${admin.email} / ${ADMIN_SENHA}`);
console.log(`Cardápio:    ${total} itens (${destaques} em destaque)`);
console.log(`Capa:        ${naCapa} fotos no carrossel`);
console.log(`Botão:       ${restaurante.linkPedido || "sem link — o admin define no painel"}`);

await prisma.$disconnect();
