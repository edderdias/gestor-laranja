-- Criar enum para bandeira do cartão
CREATE TYPE public.card_brand AS ENUM ('visa', 'master');

-- Adicionar campos na tabela credit_cards
ALTER TABLE public.credit_cards
ADD COLUMN brand card_brand,
ADD COLUMN due_date integer,
ADD COLUMN best_purchase_date integer,
ADD COLUMN credit_limit numeric DEFAULT 0,
ADD COLUMN owner_id uuid REFERENCES public.responsible_parties(id);

-- Adicionar comentários para documentação
COMMENT ON COLUMN public.credit_cards.due_date IS 'Dia do mês do vencimento da fatura (1-31)';
COMMENT ON COLUMN public.credit_cards.best_purchase_date IS 'Melhor dia do mês para compra (1-31)';