-- Criar enum para tipo de pagamento
CREATE TYPE public.payment_type AS ENUM ('cartão', 'promissoria', 'boleto');

-- Adicionar campo de tipo de pagamento na tabela accounts_payable
ALTER TABLE public.accounts_payable 
ADD COLUMN payment_type payment_type DEFAULT 'boleto';

-- Adicionar campo opcional para vincular com cartão de crédito
ALTER TABLE public.accounts_payable 
ADD COLUMN card_id uuid REFERENCES public.credit_cards(id);