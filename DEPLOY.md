# Colocar o Caffè 54 no ar (Render)

> [!CAUTION]
> **O plano gratuito não serve para produção.** No free do Render:
> - o **Postgres expira 30 dias depois de criado e é apagado** — cardápio, fotos
>   cadastradas, horários, tudo. Não tem prorrogação;
> - **não há backup** (nem point-in-time, nem snapshot);
> - **disco persistente não existe em plano free** — sem ele, toda foto que o dono
>   enviar pelo painel some no próximo deploy;
> - o serviço web dorme depois de 15 min sem acesso e demora ~1 min para acordar.
>
> Use o free só para testar você mesmo. **Antes de entregar ao cliente, suba para
> Starter (serviço web) + Postgres Basic.**

## Como funciona (o modelo)

Nada de "mandar o banco". São **três coisas** que ficam na hospedagem:

| O quê | Onde vive | Some quando? |
|---|---|---|
| **Código** (backend + frontend + as 35 fotos que já estão no repo) | vem do GitHub | nunca (está no repo) |
| **Banco PostgreSQL** (cardápio, categorias, config, admin) | um Postgres do Render, separado do app | nunca — é o que guarda tudo que o dono muda no painel |
| **Fotos enviadas pelo painel** depois do deploy | **disco persistente** montado em `/var/data` | nunca, **desde que** o disco exista e `PASTA_IMAGENS` aponte para ele |

O filesystem do container é **efêmero**: a cada deploy o Render recria a máquina a
partir do Git. Sem disco, as fotos enviadas pelo painel somem, mas o banco continua
guardando o nome do arquivo (`MenuItem.imagem`) — resultado: imagens quebradas no
cardápio. Por isso existe a variável `PASTA_IMAGENS`.

- **Sem `PASTA_IMAGENS`** (seu computador): as fotos vão para `frontend/images/cardapio/`,
  como sempre foi.
- **Com `PASTA_IMAGENS=/var/data/cardapio`** (Render): o upload grava no disco e o
  servidor serve `/images/cardapio/<arquivo>` de lá. No primeiro boot, se o disco
  estiver vazio, o servidor copia para ele as fotos que vieram no repositório — assim
  o seletor "escolher foto existente" do painel já nasce cheio. É uma vez só: no boot
  seguinte a pasta não está mais vazia e nada é sobrescrito.

O fluxo do primeiro deploy:

1. Sobe o código.
2. O Render cria um Postgres **vazio** e te dá a `DATABASE_URL`.
3. O Start Command roda `prisma migrate deploy` antes de subir o servidor → cria as tabelas.
4. **Uma única vez**, você roda `npm run db:seed` da sua máquina → carrega as 6
   categorias + 28 itens + o admin.
5. A partir daí, tudo que o dono mexe no painel é gravado nesse Postgres e **fica**.
   Deploys de código novo rodam só `migrate deploy` (que é aditivo) — **nunca**
   re-rodam o seed.

## Passo a passo (Render)

1. **GitHub**: crie um repositório **privado** e suba o projeto.
   ```bash
   git add -A && git commit -m "deploy inicial"
   git branch -M main && git remote add origin <url-do-repo> && git push -u origin main
   ```
   O `.env` **não vai** — está no `.gitignore`. O `.env.example` **vai**, e é a lista
   de variáveis que você vai cadastrar no painel.

2. **Postgres primeiro**: Render → **New → Postgres**. Nome `caffe-54-db`, região
   **Oregon** (ou a que preferir — mas anote, o serviço web tem que ficar na **mesma**).
   Plano **Basic** (não free — ver o aviso no topo). Guarde as duas URLs que ele mostra:
   - **Internal Database URL** — só funciona de dentro do Render, sem SSL. É a que o app usa.
   - **External Database URL** — funciona da sua máquina, exige SSL.

3. **Serviço web**: **New → Web Service** → conecte o repositório.
   - **Region**: a mesma do banco.
   - **Runtime**: Node
   - **Build Command**:
     ```
     npm install --include=dev
     ```
     O `--include=dev` é obrigatório: o Render põe `NODE_ENV=production`, e sem ele o
     npm pula as devDependencies — o CLI do `prisma` e o `typescript` ficariam de fora,
     e o `postinstall` (`prisma generate`) quebraria o build.
   - **Start Command**:
     ```
     npm run db:deploy && npm start
     ```
     As migrações rodam no **start**, não no build: o build nem sempre roda dentro da
     rede privada do serviço, e lá a Internal Database URL pode não responder. No start
     o container já está na rede privada. `prisma migrate deploy` é idempotente — a cada
     boot ele confere o que já foi aplicado e não faz nada de novo.
   - **Plano**: Starter (o free dorme e não aceita disco).

4. **Environment** (Settings → Environment → Add Environment Variable). Use o
   `.env.example` como checklist:

   | Chave | Valor |
   |---|---|
   | `DATABASE_URL` | a **Internal** Database URL do passo 2 |
   | `JWT_SECRET` | valor longo e aleatório — `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
   | `ADMIN_USUARIO` | o usuário que você escolher para o painel |
   | `ADMIN_SENHA` | a senha que você escolher (guarde num gerenciador) |
   | `NODE_VERSION` | `22.18.0` |
   | `PASTA_IMAGENS` | `/var/data/cardapio` |

   **Não** cadastre `PORT` — o Render injeta a dele, e o servidor já usa `process.env.PORT`.

   `NODE_VERSION` não é opcional: o servidor importa `.ts` direto (`lib/prisma.ts` e o
   client gerado do Prisma) e depende do *type stripping* nativo do Node, que só existe
   a partir do **22.18**.

5. **Disco** (Settings → Disks → Add Disk) — sem isto as fotos somem:
   - **Name**: `fotos`
   - **Mount Path**: `/var/data`
   - **Size**: `1 GB`

   O servidor cria o subdiretório `cardapio` sozinho no primeiro boot e copia para ele
   as fotos do repositório. No log você vê a linha
   `Disco vazio: 35 fotos copiadas do repositório para /var/data/cardapio`.

6. **Primeiro seed — só uma vez, da sua máquina.** Rode local apontando para a
   **External** URL:
   ```bash
   DATABASE_URL="<External Database URL>?sslmode=require" npm run db:seed
   ```
   Deve imprimir `Categorias: 6` e `Cardápio: 28 itens`.

   > [!WARNING]
   > **`npm run db:seed` APAGA todos os dados.** Ele derruba categorias e cardápio,
   > recria os 28 itens iniciais e zera a configuração do site (endereço, horários,
   > "sobre", links). Rode **uma única vez, manualmente, antes da entrega**.
   > **Nunca** ponha `db:seed` no Build nem no Start Command — cada deploy apagaria o
   > trabalho do dono.

7. **URL pública**: o Render dá `https://caffe-54.onrender.com` (ou o nome que você
   escolheu).
   - Site: essa URL.
   - Painel: mesma URL, **engrenagem** no canto inferior direito, com o usuário e a
     senha que você cadastrou no passo 4.
   - Coloque a URL na bio do Instagram da casa.

8. **Domínio próprio** (opcional): Settings → Custom Domains, e aponte o DNS conforme
   as instruções do Render.

## Depois que está no ar

- O dono edita cardápio, fotos, horário, endereço, "sobre" pelo painel → grava no
  Postgres + no disco de produção → **persiste**.
- Você manda código novo com `git push` → o Render faz redeploy → roda
  `npm install --include=dev` no build e `npm run db:deploy && npm start` no start →
  **os dados do dono continuam intactos**.
- Precisou de mudança no banco (nova coluna)? Cria a migração local (ver `README.md`),
  commita, `git push`. O `migrate deploy` aplica no próximo boot, sem apagar nada.
- Serviço com disco **não faz deploy sem downtime** e **não escala para 2 instâncias** —
  para este site, tanto faz.

## SSL do banco

Não há nada para mudar no código ao trocar de ambiente: quem decide é a própria
`DATABASE_URL`.

- **Internal URL** (sem `sslmode`): conexão pela rede privada do Render, sem SSL.
- **External URL** com `?sslmode=require`: conexão cifrada. O `backend/lib/prisma.ts`
  acrescenta `uselibpqcompat=true` sozinho, para o driver `pg` ler `sslmode` com a
  mesma semântica do `psql`.
- Quer verificação completa do certificado? Use `?sslmode=verify-full`.

## As credenciais estão seguras?

- O `.env` nunca vai pro git (confirmado no `.gitignore`). As variáveis ficam só no
  painel do Render. O `.env.example` vai para o git **sem valor nenhum**.
- A senha é guardada **com hash bcrypt** no banco — nem no banco ela aparece em texto puro.
- O Render serve tudo por **HTTPS**, então a senha não trafega aberta.
- O `JWT_SECRET` é aleatório e longo — sem ele ninguém forja um token, e o servidor
  nem sobe se ele faltar.

**Guarde a senha** num gerenciador — ela não é recuperável (só dá pra trocar mudando
`ADMIN_SENHA` e rodando o seed de novo, o que apaga o cardápio; melhor, no futuro,
uma tela de "trocar senha").

## Backup

Uma vez por mês, da sua máquina:

```bash
pg_dump -Fc "<EXTERNAL_URL>?sslmode=require" -f caffe-$(date +%Y%m%d).dump
```

`-Fc` gera o formato *custom* (comprimido) do Postgres, que é o que o `pg_restore` lê.

Para restaurar num banco vazio — por exemplo um Postgres novo depois de um desastre:

```bash
pg_restore -d "<EXTERNAL_URL_DO_BANCO_NOVO>?sslmode=require" --no-owner caffe-20260901.dump
```

Se o banco de destino já tiver as tabelas e você quiser sobrescrevê-las, acrescente
`--clean --if-exists` (ele derruba os objetos antes de recriar — confira duas vezes
qual URL está na linha de comando).

> [!IMPORTANT]
> **Guarde o `.dump` fora do Render** — no seu computador, num HD externo, no Drive.
> O backup automático do Render vive na mesma conta e no mesmo provedor do banco: ele
> cobre "o banco corrompeu", mas **não** cobre conta suspensa, cobrança recusada, ou
> alguém apagando o recurso por engano. Backup que mora junto do original não é backup.

As fotos do disco não entram nesse dump. Se quiser cópia delas, baixe-as pelo seletor
de imagens do painel.
