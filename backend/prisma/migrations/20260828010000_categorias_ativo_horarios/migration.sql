-- CreateTable
CREATE TABLE "Categoria" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "restauranteId" INTEGER NOT NULL,

    CONSTRAINT "Categoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Categoria_restauranteId_idx" ON "Categoria"("restauranteId");

-- CreateIndex
CREATE UNIQUE INDEX "Categoria_restauranteId_nome_key" ON "Categoria"("restauranteId", "nome");

-- AddForeignKey
ALTER TABLE "Categoria" ADD CONSTRAINT "Categoria_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Restaurante" DROP COLUMN "horario",
ADD COLUMN     "horarios" JSONB;

-- AlterTable
ALTER TABLE "MenuItem" DROP COLUMN "carrossel",
DROP COLUMN "categoria",
ADD COLUMN     "ativo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "categoriaId" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "MenuItem_categoriaId_idx" ON "MenuItem"("categoriaId");

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
