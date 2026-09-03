import "dotenv/config";
import { readFile } from "node:fs/promises";
import { prisma } from "../lib/prisma.ts";

const dados = JSON.parse(
  await readFile(new URL("./cardapio-dados.json", import.meta.url), "utf8")
);

// Valores iniciais do site. O dono troca tudo isso pelo painel;
// rodar o seed de novo restaura estes valores.
const CONFIG_INICIAL = {
  nome: "Caffè 54",
  descricao: "Sofisticação Italiana",
  logo: null,
  // Guardados no banco, sem UI no painel (ver schema.prisma).
  linkPedido: null,
  textoBotao: "Pedir",
  // Preenchidos pelo dono no painel. Vazio = bloco escondido no site.
  links: null,
  endereco: null,
  telefone: null,
  email: null,
  horarios: null,
  sobre: null,
  introCardapio: null,
};

// Ordem inicial das categorias (o dono reordena/renomeia/cria no painel).
// É a ordem em que os blocos aparecem no cardápio do site.
const CATEGORIAS_INICIAIS = [
  "Breakfast",
  "Sanduíches",
  "Doces",
  "Caffès Quentes",
  "Caffès Gelados",
  "Bebidas Especiais",
];

const restaurante = await prisma.restaurante.upsert({
  where: { id: 1 },
  update: CONFIG_INICIAL,
  create: { id: 1, ...CONFIG_INICIAL },
});

// recria as categorias
await prisma.menuItem.deleteMany({ where: { restauranteId: restaurante.id } });
await prisma.categoria.deleteMany({ where: { restauranteId: restaurante.id } });

const categorias = {};
for (const [ordem, nome] of CATEGORIAS_INICIAIS.entries()) {
  const c = await prisma.categoria.create({
    data: { nome, ordem, restauranteId: restaurante.id },
  });
  categorias[nome] = c.id;
}

// qualquer categoria do JSON que não esteja na lista inicial entra no fim
for (const item of dados) {
  if (categorias[item.categoria] === undefined) {
    const c = await prisma.categoria.create({
      data: {
        nome: item.categoria,
        ordem: Object.keys(categorias).length,
        restauranteId: restaurante.id,
      },
    });
    categorias[item.categoria] = c.id;
  }
}

// recria o cardápio a partir do JSON
await prisma.menuItem.createMany({
  data: dados.map((item) => ({
    nome: item.nome,
    descricao: item.descricao || null,
    preco: item.preco,
    categoriaId: categorias[item.categoria],
    imagem: item.imagem || null,
    destaque: Boolean(item.destaque),
    ativo: true,
    restauranteId: restaurante.id,
  })),
});

const total = await prisma.menuItem.count({ where: { restauranteId: restaurante.id } });
const destaques = await prisma.menuItem.count({ where: { restauranteId: restaurante.id, destaque: true } });
const nCategorias = await prisma.categoria.count({ where: { restauranteId: restaurante.id } });

console.log(`Restaurante: ${restaurante.nome} (id ${restaurante.id})`);
console.log("Admin:       ADMIN_USUARIO / ADMIN_SENHA do ambiente (o seed não mexe no login)");
console.log(`Categorias:  ${nCategorias}`);
console.log(`Cardápio:    ${total} itens (${destaques} em destaque)`);

await prisma.$disconnect();
