-- Admin passa a logar por "usuario" em vez de "email" (renomeia a coluna e o índice).
ALTER TABLE "Admin" RENAME COLUMN "email" TO "usuario";
ALTER INDEX "Admin_email_key" RENAME TO "Admin_usuario_key";
