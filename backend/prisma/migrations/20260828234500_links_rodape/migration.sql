-- Redes/links do rodape viram uma lista editavel, no lugar do campo unico de Instagram.
ALTER TABLE "Restaurante" ADD COLUMN "links" JSONB;

-- Nao perde o Instagram que ja estiver preenchido: vira o primeiro item da lista.
UPDATE "Restaurante"
SET "links" = jsonb_build_array(
  jsonb_build_object('tipo', 'instagram', 'valor', "instagram", 'rotulo', NULL)
)
WHERE "instagram" IS NOT NULL AND btrim("instagram") <> '';

ALTER TABLE "Restaurante" DROP COLUMN "instagram";
