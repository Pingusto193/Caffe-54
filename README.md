# Caffè 54

Site institucional + cardápio de um café italiano em Florianópolis. **MVP**: o site
**não processa pedidos** — mostra fotos, cardápio, informações do estabelecimento,
endereço, horário e mapa. A pessoa chega pelo Instagram da casa e abre o link.

- **Backend**: Express 5 + Prisma 7 (PostgreSQL), ESM puro, sem TypeScript no servidor.
- **Frontend**: HTML + CSS + JS puro em `frontend/`, sem build.
- **Banco**: PostgreSQL local, base `caffe-54`.

## Instalação das dependências (em ordem)

```bash
# 1. Dependências Node (backend + tooling). Instala tudo do package.json.
#    Um bloco "overrides" força deepmerge-ts@8 (resolve 3 vulns do npm audit
#    herdadas do @prisma/config — sem baixar o Prisma para a v6).
npm install

# 2. Aprova os scripts de instalação do Prisma (baixam os engines)
npm approve-scripts @prisma/engines
npm approve-scripts prisma

# 3. Gera o Prisma Client
npm run db:generate

# 4. Cria o banco e aplica as migrations
npm run db:migrate

# 5. Popula categorias + cardápio + admin (APAGA e recria; zera a config do site)
npm run db:seed
```

Pré-requisito: PostgreSQL rodando em `localhost:5432` e um `.env` na raiz (ver abaixo).
O seed deixa **6 categorias e 28 itens** com foto.

Pacotes instalados pelo passo 1:

- **dependencies**: `@prisma/adapter-pg`, `@prisma/client`, `bcryptjs`, `cors`,
  `dotenv`, `express`, `jsonwebtoken`, `multer`, `pg`
- **devDependencies**: `@types/bcryptjs`, `@types/cors`, `@types/express`,
  `@types/jsonwebtoken`, `nodemon`, `prisma`, `typescript`

### Migrations num ambiente não-interativo

`prisma migrate dev` é interativo e recusa rodar sem TTY quando há perda de dados.
Para criar uma migração nesse caso:

```bash
npx prisma migrate diff --from-config-datasource \
  --to-schema backend/prisma/schema.prisma --script --config backend/prisma.config.ts
# salve o SQL em backend/prisma/migrations/<timestamp>_<nome>/migration.sql, depois:
npx prisma migrate deploy --config backend/prisma.config.ts
```

`prisma migrate reset` é bloqueado para agentes de IA (guard do próprio Prisma).

### Scripts Python (opcional — extração de PDF e screenshots)

```bash
# requer Python 3 no PATH
pip install playwright pdfplumber pymupdf pillow
python -m playwright install chromium
```

Sem Python, dá para tirar screenshots com o Chrome instalado + o protocolo DevTools
(Node tem `WebSocket` nativo): rodar o Chrome com `--remote-debugging-port=9222` e
falar CDP por WebSocket.

## Comandos

```bash
npm run dev              # nodemon, http://localhost:3001
npm start                # sem reload
npm run db:migrate       # prisma migrate dev
npm run db:seed          # recria categorias + cardápio + admin
npm run db:studio        # prisma studio
npm run db:generate      # regenera o Prisma Client
npm run extrair-pdf -- <caminho.pdf>   # precisa de Python
```

Login do painel: **usuário + senha** (não é e-mail), definidos em `.env` como
`ADMIN_USUARIO` / `ADMIN_SENHA` e criados pelo seed. O botão do painel é a engrenagem
discreta no canto inferior direito do site.

## Variáveis de ambiente (`.env`)

| Variável | O quê |
|---|---|
| `DATABASE_URL` | connection string do PostgreSQL (`postgresql://user:senha@localhost:5432/caffe-54`) |
| `JWT_SECRET` | segredo dos tokens — **obrigatório**, mínimo 24 caracteres, senão o servidor não sobe |
| `ADMIN_USUARIO`, `ADMIN_SENHA` | usuário e senha do painel que o seed cria (senha de 24+ caracteres) |
| `PORT` | opcional, padrão 3001 |

Gerar um `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Painel administrativo

Dividido em abas: **Cardápio · Categorias · Destaques · Estabelecimento ·
Localização · Horários · Conta**. Cada aba mostra só o seu conteúdo.

- **Cardápio**: criar/editar/excluir item, ativar/desativar (esconde do site sem
  apagar), trocar categoria, trocar imagem (upload), marcar destaque.
- **Categorias**: criar, renomear, reordenar (↑ ↓, com animação) e excluir. A ordem
  aqui é a ordem dos blocos no site. Só exclui categoria sem itens.
- **Destaques**: checklist dos itens que giram no carrossel da capa.
- **Estabelecimento**: apresentação da casa (aparece logo depois da capa do site),
  frase de abertura do cardápio, redes e links (Instagram, WhatsApp, TikTok, site…
  quantos quiser, na ordem que quiser), telefone e e-mail — tudo no rodapé.
- **Localização / Horários**: endereço + mapa e horário por dia. Vazios, somem do site.

## Seções do site

O cardápio é sempre visível. A apresentação do estabelecimento aparece logo depois da
capa; a seção **"Visite o Caffè 54"** (endereço + horário + mapa) e os blocos de
contato do rodapé só aparecem quando o dono preenche os campos no painel — vazios,
ficam escondidos. **Nada é inventado por padrão.**

## Login individual por estabelecimento (futuro)

A arquitetura já tem `restauranteId` em tudo e o JWT carrega o `restauranteId`. Falta,
para isolar de verdade: escopar as rotas autenticadas pelo token, checar posse em
editar/excluir, papéis (`dono`/`super`), área super-admin e onboarding. Detalhes em
`CLAUDE.md`.
