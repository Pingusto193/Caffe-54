# Colocar o Caffè 54 no ar

## Como funciona (o modelo)

Nada de "mandar o banco". São **três coisas** que ficam na hospedagem:

| O quê | Onde vive | Some quando? |
|---|---|---|
| **Código** (backend + frontend + as 35 fotos do cardápio) | vem do GitHub | nunca (está no repo) |
| **Banco PostgreSQL** (cardápio, categorias, config, admin) | um Postgres que a hospedagem cria, separado do app | nunca — é o que guarda tudo que o dono muda no painel |
| **Fotos enviadas pelo painel** depois do deploy | disco do servidor, em `frontend/images/cardapio/` | **some no redeploy** se não tiver um disco persistente (ver passo 5) |

O fluxo do primeiro deploy:

1. Sobe o código.
2. A hospedagem cria um Postgres **vazio** e te dá a `DATABASE_URL`.
3. `npm run build` roda `prisma migrate deploy` → cria as tabelas.
4. **Uma única vez**, você roda `npm run db:seed` → carrega as 6 categorias + 28 itens + o admin.
5. A partir daí, tudo que o dono mexe no painel é gravado nesse Postgres e **fica**. Deploys de código novo rodam só `migrate deploy` (que é aditivo) — **nunca** re-rodam o seed.

> ⚠️ `npm run db:seed` **APAGA e recria** o cardápio e zera a config. Rode **só no primeiro deploy**. Depois disso, nunca mais.

## Onde hospedar

Qualquer host de Node + Postgres serve. O mais direto para este projeto: **Railway** (railway.app) ou **Render** (render.com). Os dois: deploy a partir do GitHub, HTTPS de graça, Postgres gerenciado, disco persistente. Custo ~US$ 5/mês.

## Passo a passo (Railway)

1. **GitHub**: crie um repositório **privado** e suba o projeto.
   ```bash
   git add -A && git commit -m "deploy inicial"
   git branch -M main && git remote add origin <url-do-repo> && git push -u origin main
   ```
   (O `.env` **não vai** — está no `.gitignore`. É só isso que fica de fora.)

2. **Railway → New Project → Deploy from GitHub repo** → escolha o repo.

3. No projeto, **+ New → Database → PostgreSQL**. O Railway injeta a `DATABASE_URL` no serviço do app automaticamente.

4. **Variáveis do app** (aba Variables do serviço Node) — copie do seu `.env`, menos a `DATABASE_URL` (o Railway já pôs):
   - `JWT_SECRET` — o valor longo do seu `.env` (ou gere outro: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
   - `ADMIN_USUARIO` — `admin.kf54`
   - `ADMIN_SENHA` — a senha de 28 caracteres
   - `PORT` — deixe o Railway definir (ele passa sozinho)

   Build: `npm run build` · Start: `npm start` (o Railway detecta pelos scripts; se pedir, preencha assim).

5. **Disco para as fotos** (senão as fotos enviadas pelo painel somem no próximo deploy):
   serviço do app → **Settings → Volumes → Add Volume**, mount path
   `/app/frontend/images/cardapio`.

6. **Primeiro seed** (só uma vez): abra o shell do serviço (Railway: aba do serviço → `⋮` → Shell, ou `railway run`) e rode:
   ```bash
   npm run db:seed
   ```
   Deve imprimir `Categorias: 6` e `Cardápio: 28 itens`.

7. Pegue a URL pública (`Settings → Networking → Generate Domain`), ex.: `caffe54.up.railway.app`.
   - Site: essa URL.
   - Painel: mesma URL, clique na **engrenagem** no canto inferior direito, entre com `admin.kf54` + senha.
   - Coloque a URL na bio do Instagram da casa.

8. **Domínio próprio** (opcional): `Settings → Custom Domain`, aponta o DNS conforme as instruções.

## Depois que está no ar

- O dono edita cardápio, fotos, horário, endereço, "sobre" pelo painel → grava no Postgres de produção → **persiste**.
- Você manda código novo com `git push` → Railway faz redeploy → roda `npm run build` (`migrate deploy`) → **os dados do dono continuam intactos**.
- Precisou de mudança no banco (nova coluna)? Cria a migração local (ver `README.md`), commita, `git push`. O `migrate deploy` aplica em produção sem apagar nada.

## As credenciais estão seguras?

- O `.env` nunca vai pro git (confirmado no `.gitignore`). As variáveis ficam só no painel da hospedagem.
- A senha é guardada **com hash bcrypt** no banco — nem no banco ela aparece em texto puro.
- Os hosts recomendados servem tudo por **HTTPS**, então a senha não trafega aberta.
- O `JWT_SECRET` é aleatório e longo — sem ele ninguém forja um token, e o servidor nem sobe se ele faltar.
- A senha de 28 caracteres aleatórios é inviável de adivinhar por força bruta.

Para um MVP, está de bom tamanho. **Guarde a senha** num gerenciador — ela não é recuperável (só dá pra trocar mudando `ADMIN_SENHA` e rodando o seed de novo, o que apaga o cardápio; melhor, no futuro, uma tela de "trocar senha").

## Backup (recomendado)

O Railway/Render fazem snapshot do Postgres. Além disso, de vez em quando:
```bash
railway run pg_dump "$DATABASE_URL" > backup-$(date +%F).sql
```
