import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config"
import {PrismaClient} from "../generated/prisma/client.ts"

// O SSL sai da própria DATABASE_URL — não há nada para editar aqui ao trocar de
// ambiente. Internal URL do Render (rede privada) vem sem `sslmode` e conecta em
// texto puro; a External vem com `?sslmode=require` e conecta cifrada.
//
// O `uselibpqcompat=true` faz o driver `pg` interpretar `sslmode` igual ao psql.
// Sem ele, `sslmode=require` passa a exigir certificado assinado por uma CA
// pública (o do Postgres do Render não é) e o pg ainda imprime um aviso de
// comportamento descontinuado. Com ele: `require` cifra sem verificar a cadeia,
// `verify-full` verifica tudo, `disable` desliga.
const url = `${process.env.DATABASE_URL}`;
const connectionString =
  /[?&]sslmode=/.test(url) && !/[?&]uselibpqcompat=/.test(url)
    ? `${url}&uselibpqcompat=true`
    : url;

const adapter = new PrismaPg({connectionString})
const prisma = new PrismaClient({adapter})

export {prisma};
