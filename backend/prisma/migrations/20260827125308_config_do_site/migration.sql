-- AlterTable
ALTER TABLE "Restaurante" ADD COLUMN     "email" TEXT,
ADD COLUMN     "endereco" TEXT,
ADD COLUMN     "horario" TEXT,
ADD COLUMN     "instagram" TEXT,
ADD COLUMN     "linkPedido" TEXT,
ADD COLUMN     "telefone" TEXT,
ADD COLUMN     "textoBotao" TEXT NOT NULL DEFAULT 'Pedir';
