# Caffè 54

Site institucional + cardápio de um café italiano em Florianópolis. **MVP**: o site
**não processa pedidos** — mostra fotos, cardápio, informações do estabelecimento,
endereço, horário e mapa. A pessoa chega pelo Instagram da casa, abre o link e vê
tudo. Sem delivery, iFood, WhatsApp, reservas ou pagamento — isso fica para depois.

## Comandos

```bash
npm run dev              # nodemon, sobe em http://localhost:3001
npm start                # sem reload
npm run db:migrate       # prisma migrate dev  (--create-only em ambiente não-interativo)
npm run db:seed          # recria categorias + cardápio + admin (APAGA e recria)
npm run db:studio        # prisma studio
npm run db:generate      # regenera o client
npm run extrair-pdf -- <caminho.pdf>   # reextrai imagens e dados do PDF (precisa de Python)
```

Login do painel: **usuário** `admin.kf54` + senha (ambos em `.env` como
`ADMIN_USUARIO` / `ADMIN_SENHA`, criados pelo seed). É usuário, não e-mail — a coluna
`Admin.usuario` (era `email`).

## Arquitetura

- **Backend**: Express 5 + Prisma 7 (PostgreSQL), ESM puro, sem TypeScript no servidor.
  `backend/server.js` serve a API **e** o conteúdo estático de `frontend/`, porta 3001.
- **Frontend**: HTML + CSS + JavaScript puro em `frontend/`. Sem build, sem framework.
- **Banco**: PostgreSQL local, base `caffe-54`.

```
backend/           server.js
  lib/             prisma.ts
  prisma/          schema.prisma, seed.js, migrations/, cardapio-dados.json
  prisma.config.ts
  generated/       client do Prisma (ignorado no git)
frontend/          index.html, css/styles.css, js/app.js, js/config.js
                   images/hero.jpg (reserva), images/cardapio/ (fotos + uploads)
scripts/           extrair-pdf.py, olhar-site.py  (precisam de Python — ver abaixo)
```

Todo comando do Prisma passa `--config backend/prisma.config.ts` (já está nos
scripts do `package.json`).

### Rotas

| Rota | Auth | O quê |
|---|---|---|
| `GET /config` | não | nome, descrição, contato, `sobre`, `horarios` |
| `PUT /config` | JWT | dono edita `instagram/endereco/telefone/email/sobre` + `horarios` |
| `GET /categorias` | não | categorias ordenadas por `ordem` |
| `POST /categorias` | JWT | cria |
| `PUT /categorias/ordenar` | JWT | reordena — body `{ ids: [...] }` (vem **antes** de `/:id`) |
| `PUT /categorias/:id` | JWT | renomeia |
| `DELETE /categorias/:id` | JWT | exclui; **409** se tiver itens |
| `GET /menu` | não | só itens **ativos**, com `categoria`/`categoriaOrdem` achatados |
| `GET /menu/admin` | JWT | todos os itens, inclusive inativos (lista do painel) |
| `GET /menu/:id` | não | um item |
| `POST /menu` | JWT | cria (`categoriaId`, `ativo`, `destaque`) |
| `PUT /menu/:id` | JWT | edita (envie só os campos que mudam) |
| `DELETE /menu/:id` | JWT | remove |
| `POST /admin/login` | não | devolve o token JWT |
| `POST /admin/register` | JWT | cria outro admin (protegido) |
| `POST /upload` | JWT | envia uma foto, devolve o nome do arquivo |
| `GET /imagens` | JWT | lista os arquivos de `frontend/images/cardapio/` |

### Modelos

- **`Restaurante`**: `nome`, `descricao` (usados no site, **sem UI no painel** — o dono
  não renomeia o café por enquanto), `linkPedido`/`textoBotao` (guardados, sem UI —
  prontos para um botão de pedido futuro), `instagram`, `endereco`, `telefone`,
  `email`, `sobre`, `horarios` (JSON `[{dia,abre,fecha,fechado}]`, 7 dias).
- **`Categoria`**: `nome`, `ordem`, `@@unique([restauranteId, nome])`. Gerenciada pelo
  painel (criar/renomear/reordenar/excluir). A `ordem` define a ordem dos blocos no site.
- **`MenuItem`**: `nome`, `descricao`, `preco`, `imagem`, `destaque`, `ativo`,
  `categoriaId` (FK, `onDelete: Restrict`). **Não tem mais `categoria` string nem `carrossel`.**
- **`Admin`**: `usuario` (@unique), `senhaHash` (bcrypt). `POST /admin/login` aceita
  `{usuario, senha}` (e `{email}` como alias legado).
- Tudo pendurado em `restauranteId = 1` (`RESTAURANTE_ID` no server.js). Ver
  "Login por estabelecimento" abaixo.

## Armadilhas conhecidas

**Prisma 7 não aceita `url` no `schema.prisma`.** A connection string fica em
`prisma.config.ts` (para o Migrate) e no adapter `@prisma/adapter-pg` (para o client,
em `backend/lib/prisma.ts`). O `datasource` do schema só declara o provider.

**`prisma migrate dev` é interativo e recusa rodar sem TTY** quando há warning de perda
de dados. Para criar uma migração aqui: `prisma migrate diff --from-config-datasource
--to-schema backend/prisma/schema.prisma --script` gera o SQL; salve num diretório novo
em `migrations/` e aplique com `prisma migrate deploy`. `prisma migrate reset` é
**bloqueado para agentes de IA** (guard do próprio Prisma) — precisa de consentimento
explícito do usuário.

**Imports ESM precisam da extensão.** `import { prisma } from "./lib/prisma.ts"` — sem
o `.ts` dá `ERR_MODULE_NOT_FOUND`. O Node faz type-stripping nativo do `.ts`.

**`[hidden]` perde para `display: flex/grid`.** Por isso existe
`[hidden] { display: none !important; }` no topo do `styles.css`. As seções do painel
(`.painel-secao`) dependem disso.

**`npm run db:seed` apaga categorias + cardápio e zera a config do site.** Não rode
em produção sem pensar.

**`overrides: { "deepmerge-ts": "^8" }` no package.json** resolve 3 vulns high herdadas
do `@prisma/config`. Não remover sem checar `npm audit`.

**Python não está instalado nesta máquina.** `olhar-site.py`, `extrair-pdf.py` e a skill
`webapp-testing` não rodam. Para screenshots: Chrome headless + DevTools Protocol
(Node tem `WebSocket` global). Scripts de exemplo no scratchpad da sessão.

## Design

Paleta e tipografia foram especificadas pelo dono — não trocar sem pedir:

```
#2C3E2D  verde escuro     #F9F7F2  creme (fundo)
#8B9D83  sage             #1A1A1A  texto
#D4A574  dourado          #E8EBE3  borda
#A8763F  dourado escuro (usado onde o claro não tem contraste)
```

Playfair Display (display) · Lora (corpo) · Inter (interface), via Google Fonts.

**Cabeçalho**: só a marca. Sem link "Cardápio" e sem botão de Instagram/pedido — quem
chega já vem do Instagram da casa.

Grid 4 colunas no desktop (padding 40px), 3 no tablet (24px), 1 no mobile (16px).

Os cards seguem a **ordem das categorias** (`Categoria.ordem`, definida no painel), com
os destaques no topo de cada uma. Em "Todos", o cardápio é dividido em blocos por
categoria com título em Playfair; filtrando uma categoria só, o título some.

A capa é um carrossel dos itens marcados como `destaque` no painel (aba "Destaques").
Sem destaques, fica a foto fixa `images/hero.jpg`.

**As fotos do cardápio são retrato.** No desktop a foto vai **emoldurada** (272x344) à
direita e o **fundo é ela mesma desfocada** (blur 44px). No celular a foto vira o fundo
sem desfoque. O texto fica à esquerda sobre um gradiente direcional.

Cada foto do carrossel só recebe `src` quando chega a vez dela. O giro para com o
mouse em cima e com a aba em segundo plano.

Clicar na foto do card abre uma lupa (`<dialog>`) com a imagem grande, descrição e
preço. Sem botão de pedido (MVP).

**Ordem da home**: capa → `#sobre` (apresentação, `config.sobre`) → `#visite` (faixa
fina de localização) → intro do cardápio → filtros → grade.

**Faixa `#visite`**: endereço + horário + link "Ver no mapa" (sem iframe — o mapa
embutido saía grande demais). Estilo discreto/opaco, alinhado à esquerda, borda
hairline. Cada parte só aparece se o dono preencheu; vazia = faixa escondida. A prévia
do mapa (iframe) vive só no painel, aba Localização (`#local-previa`).

**Horários**: `formatarHorarios()` agrupa dias seguidos com o mesmo horário
("Seg a Sex: 08:00–18:00"). Usado na faixa `#visite` e no rodapé.

## Painel administrativo

`<aside class="admin">` = cabeçalho + (login **ou** dashboard). O dashboard é uma
**faixa de abas** (`.admin-nav`) + área de conteúdo; só a `.painel-secao` ativa aparece
(`secaoAtiva`, `trocarSecao()`). Abas: Cardápio · Categorias · Destaques ·
Estabelecimento · Localização · Horários · Conta.

Reordenar categorias no painel usa FLIP (`animarReordenacao()`) para as linhas
deslizarem até a nova posição.

`atualizarPainel()` repovoa todas as seções a partir de `pratos`/`categorias`/`config`.
Cada campo não-óbvio tem um `<small class="dica">`.

## Animação

Linguagem do portfólio do dono, na paleta do café. `--mola` para entradas, `--saida`
para saídas.

**Abertura** (`.abertura`): véu verde-escuro. As duas metades do nome (`.abertura-metade`,
mesmo texto clipado em `inset(0 0 50% 0)` e `inset(50% 0 0 0)`) deslizam para se
encontrar no centro enquanto um anel dourado se desenha em volta (SVG `circle` com
`pathLength="1"` + `stroke-dashoffset`). Aos 1900 ms entra `.saindo`: o palco recolhe
e um **buraco radial cresce** (`@property --ab-furo` numa `mask-image`), revelando o
site por dentro. `abertura.remove()` aos 2750 ms.

Três cuidados intocáveis: (1) script inline no `<head>` decide antes da primeira
pintura se a abertura aparece; (2) roda uma vez por sessão
(`sessionStorage: caffe54:abertura`); (3) `setTimeout` de 3200 ms destrava o scroll sem
depender do `app.js` (tem de ser ≥ o fim da animação).

O nome é estático no HTML ("Caffè 54"), não vem do `config`.

**Painel como página**: `.admin` ocupa `inset: 0` (tela toda) e abre com
`clip-path: circle()` crescendo a partir do botão da engrenagem — `abrirPainel()` põe
`--ox/--oy` com o `getBoundingClientRect()` do gatilho. `fecharPainel()` reverte e só
esconde (`hidden`) ao fim da animação. Não há mais `.sobreposicao`.

**Entrada** (`[data-entrada]`) e **Revelação** (`[data-revelar]` via `IntersectionObserver`).
Tudo desligado em `prefers-reduced-motion: reduce`.

## Upload de imagens

`POST /upload` usa multer, grava em `frontend/images/cardapio/`, aceita JPG/PNG/WebP/AVIF
até 6 MB. `nomeSeguro()` tira acento/espaço/caminho e cola timestamp base36.

**O multer entrega `originalname` em latin1** — `Buffer.from(nome,"latin1").toString("utf8")`.
No `fetch` do upload **não** defina `Content-Type` (o navegador põe o boundary).

## Login por estabelecimento (futuro — não implementado)

Já ajuda: `Restaurante`/`Admin`/`Categoria`/`MenuItem` têm `restauranteId`; o JWT
carrega `restauranteId` e `usuario`; a tela de login (usuário + senha) existe.

Falta: (1) trocar `RESTAURANTE_ID = 1` por `req.admin.restauranteId` nas rotas
autenticadas e resolver o restaurante das rotas públicas por subdomínio/slug;
(2) checagem de posse em `PUT/DELETE /menu/:id` e `/categorias/:id`;
(3) coluna `Admin.papel` (`"dono"` | `"super"`) + middleware `exigirSuper`;
(4) área super-admin (criar estabelecimento + login do dono, redefinir senha);
(5) onboarding e recuperação de senha.

## Estado atual

Funcionando: 6 categorias, 28 itens com foto, filtros dinâmicos, painel em 7 abas
(CRUD de item + ativar/desativar, CRUD + reorder de categoria, destaques, informações,
localização com mapa, horários por dia), carrossel dos destaques, seção "Visite",
responsivo, console limpo.

Pendente / de propósito:
- Instagram, endereço, telefone, e-mail, horários e "sobre" **vazios** — o dono
  preenche pelo painel. **Não inventar valores.**
- Fotos dos 7 itens removidos ainda estão em `images/cardapio/` (o dono pode
  reaproveitar Mesa/Experiência no hero/sobre).
- `extrair-pdf.py` escreve `categoria` como string por página — desatualizado em
  relação às categorias dinâmicas. O seed mapeia string → `categoriaId`; se re-rodar a
  extração, conferir os nomes.
