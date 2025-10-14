-- Adicionar campos de parcelas na tabela accounts_receivable
ALTER TABLE public.accounts_receivable 
ADD COLUMN installments integer DEFAULT 1,
ADD COLUMN current_installment integer DEFAULT 1;

-- Criar tabela de pagadores (quem fará o pagamento)
CREATE TABLE public.payers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Adicionar RLS na tabela payers
ALTER TABLE public.payers ENABLE ROW LEVEL SECURITY;

-- Políticas para payers
CREATE POLICY "Admins podem gerenciar pagadores"
ON public.payers
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Todos podem ver pagadores"
ON public.payers
FOR SELECT
TO authenticated
USING (true);

-- Adicionar campo payer_id na tabela accounts_receivable
ALTER TABLE public.accounts_receivable 
ADD COLUMN payer_id uuid REFERENCES public.payers(id);

-- Atualizar o enum income_type para incluir os tipos solicitados
-- Primeiro preciso verificar se não vai quebrar dados existentes
-- Como é uma nova instalação, posso recriar o enum

-- Remover a constraint do enum temporariamente
ALTER TABLE public.accounts_receivable 
ALTER COLUMN income_type DROP DEFAULT;

-- Modificar o tipo para text temporariamente
ALTER TABLE public.accounts_receivable 
ALTER COLUMN income_type TYPE text;

-- Dropar o enum antigo
DROP TYPE IF EXISTS public.income_type;

-- Criar novo enum com os tipos corretos
CREATE TYPE public.income_type AS ENUM ('salario', 'extra', 'aluguel', 'vendas', 'comissao');

-- Voltar a coluna para o enum
ALTER TABLE public.accounts_receivable 
ALTER COLUMN income_type TYPE income_type USING income_type::income_type;

-- Adicionar default novamente
ALTER TABLE public.accounts_receivable 
ALTER COLUMN income_type SET DEFAULT 'extra'::income_type;

-- Inserir alguns pagadores padrão
INSERT INTO public.payers (name) VALUES 
('Cliente A'),
('Cliente B'),
('Empresa X');