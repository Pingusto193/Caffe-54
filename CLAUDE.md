# Caffè 54

Site de cardápio de um café italiano em Florianópolis. O site **não processa pedidos**:
ele mostra as fotos e o cardápio, e o botão de pedido leva para fora (iFood, Instagram,
WhatsApp — quem escolhe o destino é o admin, pelo painel do próprio site).

## Comandos

```bash
npm run dev              # nodemon, sobe em http://localhost:3001
npm start                # sem reload
npm run db:migrate       # prisma migrate dev
npm run db:seed          # recria cardápio + admin (APAGA e recria os itens)
npm run db:studio        # prisma studio
npm run extrair-pdf -- <caminho.pdf>   # reextrai imagens e dados do PDF

python scripts/olhar-site.py [pasta]   # screenshots desktop/tablet/mobile + console
```

Login do painel: `admin@caffe54.com` / `caffe54` (definido em `.env`, criado pelo seed).

## Arquitetura

- **Backend**: Express 5 + Prisma 7 (PostgreSQL), ESM puro, sem TypeScript no servidor.
  `src/server.js` serve a API **e** o conteúdo estático de `frontend/`, tudo na porta 3001.
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
scripts/           extrair-pdf.py, olhar-site.py
.claude/skills/    33 skills do awesome-claude-skills
```

Todo comando do Prisma passa `--config backend/prisma.config.ts` (já está nos
scripts do `package.json`). Sem isso o CLI procura o config na raiz e não acha.

### Rotas

| Rota | Auth | O quê |
|---|---|---|
| `GET /config` | não | link do botão, textos e contato do rodapé |
| `PUT /config` | JWT | admin edita o acima |
| `GET /menu` | não | todos os itens |
| `GET /menu/:id` | não | um item |
| `POST /menu` | JWT | cria |
| `PUT /menu/:id` | JWT | edita |
| `DELETE /menu/:id` | JWT | remove |
| `POST /admin/login` | não | devolve o token JWT |
| `POST /upload` | JWT | envia uma foto, devolve o nome do arquivo |
| `GET /imagens` | JWT | lista os arquivos de `frontend/images/cardapio/` |

### Modelos

`Restaurante` guarda a configuração do site (`linkPedido`, `textoBotao`, `instagram`,
`endereco`, `telefone`, `email`, `horario`). `MenuItem` tem `destaque` e `carrossel`
além dos campos óbvios. `Admin` tem `senhaHash` (bcrypt). Tudo pendurado em `restauranteId = 1`.

## Armadilhas conhecidas

**Prisma 7 não aceita `url` no `schema.prisma`.** A connection string fica em
`prisma.config.ts` (para o Migrate) e no adapter `@prisma/adapter-pg` (para o client,
em `src/lib/prisma.ts`). O `datasource` do schema só declara o provider.

**A extensão Prisma do VS Code tem `prisma.pinToPrisma6`.** Se ligada, ela valida o
schema com as regras da v6 e sublinha o arquivo inteiro de vermelho. O erro é só do
editor. Já está desligada nas settings do usuário.

**Imports ESM precisam da extensão.** `import { prisma } from "./lib/prisma.ts"` — sem
o `.ts` dá `ERR_MODULE_NOT_FOUND`. O Node 25 faz type-stripping nativo do arquivo `.ts`.

**`[hidden]` perde para `display: flex/grid/inline-flex`.** Por isso existe
`[hidden] { display: none !important; }` no topo do `styles.css`. Sem isso, elementos
escondidos por JS continuam aparecendo.

**`npm run db:seed` apaga o cardápio e sobrescreve a configuração do site** com os
valores de `CONFIG_INICIAL` em `prisma/seed.js`. Não rode em produção sem pensar.

## Design

Paleta e tipografia foram especificadas pelo dono do projeto — não trocar sem pedir:

```
#2C3E2D  verde escuro     #F9F7F2  creme (fundo)
#8B9D83  sage             #1A1A1A  texto
#D4A574  dourado          #E8EBE3  borda
#A8763F  dourado escuro (usado onde o claro não tem contraste)
```

Playfair Display (display) · Lora (corpo) · Inter (interface), via Google Fonts.

Grid 4 colunas no desktop (padding 40px), 3 no tablet (24px), 1 no mobile (16px).
Header 80px sticky, hero 400px.

Os cards são ordenados pela sequência das categorias do menu (Breakfast primeiro),
com os destaques no topo de cada uma — a ordem alfabética do banco colocava fotos
ruins na frente.

Em "Todos", o cardápio é dividido em blocos por categoria, cada um com título em
Playfair e a contagem de itens. Filtrando uma categoria só, o título some (seria
redundante com a pill ativa).

A capa é um carrossel dos itens marcados com `carrossel` no painel. Sem nenhum
marcado, usa os `destaque`; sem destaques, fica a foto fixa `images/hero.jpg`.

**As fotos do cardápio são retrato.** Numa faixa de 400px elas viram um close
irreconhecível — foi o primeiro erro deste hero. Por isso, no desktop, a foto vai
**emoldurada** (272x344) à direita e o **fundo é ela mesma desfocada** (blur 44px,
brightness 0.85), só para dar cor. No celular não cabe moldura: ali a foto vira o
fundo sem desfoque, porque 375x320 é um recorte aceitável para retrato.

O texto fica à esquerda sobre um gradiente direcional — centralizar sobre foto de
comida clara sempre gera uma mancha escura no meio.

Cada foto só recebe `src` quando chega a vez dela (`carregarFoto` cuida da atual e
da próxima). Sem isso, 7 imagens carregariam de uma vez na primeira pintura.
O giro para com o mouse em cima e com a aba em segundo plano.

Clicar na foto do card abre uma lupa (`<dialog>`) com a imagem grande, descrição e
preço. É o momento em que a pessoa decide pedir.

O botão de pedido do card usa `botao-ouro-leve` (contorno), não o dourado cheio: o
mesmo link se repete em 35 cards e viraria uma parede de blocos. O botão cheio fica
só no cabeçalho e na lupa.

## Animação

A linguagem veio do portfólio do dono (`github.com/Pingusto193/Portifolio`), na
paleta do café. Easings: `--mola: cubic-bezier(0.22, 1, 0.36, 1)` para entradas,
`--saida: cubic-bezier(0.65, 0, 0.35, 1)` para saídas.

**Abertura** (`.abertura`): duas cortinas verdes que se abrem (`scaleY` 1 para 0),
nome letra a letra com `--i` escalonando o `animation-delay`, filete em gradiente
dourado e barra de carregamento. Sai aos 2000 ms.

Três cuidados que não podem ser removidos:

1. Um script **inline no `<head>`** decide antes da primeira pintura se a cortina
   aparece. Sem ele, quem já a viu enxerga um flash verde.
2. A cortina roda **uma vez por sessão** (`sessionStorage: caffe54:abertura`).
3. O mesmo script inline tem um `setTimeout` de 3200 ms que destrava o scroll.
   O travamento não pode depender do `app.js` ter carregado.

As letras usam `NOME_PADRAO`, não `config.nome`: o filete começa a animar no
primeiro quadro e esperar o `GET /config` dessincroniza a escada.

**Entrada** (`[data-entrada]`) sobe título, subtítulo e pills quando a cortina sai.
**Revelação** (`[data-revelar]`) traz cartões e títulos de categoria conforme
entram na tela, via `IntersectionObserver`, com `--atraso` limitado a 5 posições.

**Troca de categoria**: `#grade.trocando` esmaece por 200 ms, remonta e revela de novo.

Tudo desligado em `prefers-reduced-motion: reduce`.

## Upload de imagens

`POST /upload` usa multer, grava em `frontend/images/cardapio/`, aceita JPG, PNG,
WebP e AVIF até 6 MB, um arquivo por vez.

`nomeSeguro()` tira acento, espaço e qualquer caminho do nome original, e cola um
sufixo de timestamp em base36. `../../etc/passwd.png` vira `passwd-<hash>.jpg`.

**O multer entrega `originalname` em latin1.** Sem `Buffer.from(nome, "latin1")
.toString("utf8")`, "Café" vira "CafÃ©" e o nome sai mangled.

No `fetch` do upload **não** defina `Content-Type`: o navegador precisa pôr o
boundary do multipart sozinho.

## Como verificar mudanças visuais

Não confie em teste de API para julgar layout. Suba o servidor e rode:

```bash
python scripts/olhar-site.py C:/caminho/de/saida
```

Ele gera prints em 1440x900, 768x1024 e 375x812, mais o painel admin aberto, e
reporta erros de console. Leia os PNGs antes de dizer que está pronto.

## Estado atual

Funcionando: cardápio com 35 itens e fotos, filtros, CRUD completo no painel,
configuração do botão de pedido, responsivo nos três tamanhos, console limpo.

Pendente:
- Instagram, endereço, telefone, e-mail, horário e link do botão estão **vazios**
  de propósito — o dono preenche pelo painel. Não inventar valores.
- `npm audit` acusa 3 vulnerabilidades high. Não investigadas.
- O `JWT_SECRET` tem fallback no código (`"sua_chave_secreta_aqui"`). Já existe um
  segredo real no `.env`, mas o fallback deveria virar erro de inicialização.
