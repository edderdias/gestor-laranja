-- Adicionar campo de texto para nome do dono
ALTER TABLE public.credit_cards
ADD COLUMN owner_name text;

-- Remover a constraint NOT NULL do owner_id se existir
ALTER TABLE public.credit_cards
ALTER COLUMN owner_id DROP NOT NULL;