-- Criar enum para roles de usuários
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Criar enum para tipo de despesa
CREATE TYPE public.expense_type AS ENUM ('fixa', 'variavel');

-- Criar enum para tipo de receita
CREATE TYPE public.income_type AS ENUM ('fixa', 'variavel');

-- Tabela de perfis de usuários
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de roles de usuários
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Função para verificar role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Tabela de categorias de despesas
CREATE TABLE public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de fontes de receita
CREATE TABLE public.income_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de responsáveis
CREATE TABLE public.responsible_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de cartões de crédito
CREATE TABLE public.credit_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  last_digits TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de contas a pagar
CREATE TABLE public.accounts_payable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  due_date DATE NOT NULL,
  expense_type expense_type NOT NULL DEFAULT 'variavel',
  category_id UUID NOT NULL REFERENCES public.expense_categories(id) ON DELETE RESTRICT,
  responsible_id UUID NOT NULL REFERENCES public.responsible_parties(id) ON DELETE RESTRICT,
  installments INTEGER DEFAULT 1,
  current_installment INTEGER DEFAULT 1,
  paid BOOLEAN DEFAULT false,
  paid_date DATE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de contas a receber
CREATE TABLE public.accounts_receivable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  receive_date DATE NOT NULL,
  income_type income_type NOT NULL DEFAULT 'variavel',
  source_id UUID NOT NULL REFERENCES public.income_sources(id) ON DELETE RESTRICT,
  received BOOLEAN DEFAULT false,
  received_date DATE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de transações de cartão de crédito
CREATE TABLE public.credit_card_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  purchase_date DATE NOT NULL,
  installments INTEGER DEFAULT 1,
  current_installment INTEGER DEFAULT 1,
  card_id UUID NOT NULL REFERENCES public.credit_cards(id) ON DELETE CASCADE,
  responsible_id UUID NOT NULL REFERENCES public.responsible_parties(id) ON DELETE RESTRICT,
  category_id UUID NOT NULL REFERENCES public.expense_categories(id) ON DELETE RESTRICT,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de logs de auditoria
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.income_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responsible_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts_receivable ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_card_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para profiles
CREATE POLICY "Usuários podem ver todos os perfis"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Usuários podem atualizar seu próprio perfil"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Profiles são criados via trigger"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Políticas RLS para user_roles
CREATE POLICY "Usuários podem ver suas próprias roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins podem gerenciar roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Políticas RLS para categorias
CREATE POLICY "Todos podem ver categorias"
  ON public.expense_categories FOR SELECT
  USING (true);

CREATE POLICY "Admins podem gerenciar categorias"
  ON public.expense_categories FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Políticas RLS para fontes de receita
CREATE POLICY "Todos podem ver fontes de receita"
  ON public.income_sources FOR SELECT
  USING (true);

CREATE POLICY "Admins podem gerenciar fontes"
  ON public.income_sources FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Políticas RLS para responsáveis
CREATE POLICY "Todos podem ver responsáveis"
  ON public.responsible_parties FOR SELECT
  USING (true);

CREATE POLICY "Admins podem gerenciar responsáveis"
  ON public.responsible_parties FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Políticas RLS para cartões
CREATE POLICY "Usuários podem ver todos os cartões"
  ON public.credit_cards FOR SELECT
  USING (true);

CREATE POLICY "Usuários autenticados podem criar cartões"
  ON public.credit_cards FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Usuários podem atualizar cartões que criaram"
  ON public.credit_cards FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Usuários podem deletar cartões que criaram"
  ON public.credit_cards FOR DELETE
  USING (auth.uid() = created_by);

-- Políticas RLS para contas a pagar
CREATE POLICY "Usuários podem ver todas as contas a pagar"
  ON public.accounts_payable FOR SELECT
  USING (true);

CREATE POLICY "Usuários autenticados podem criar contas a pagar"
  ON public.accounts_payable FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Usuários podem atualizar contas a pagar"
  ON public.accounts_payable FOR UPDATE
  USING (true);

CREATE POLICY "Usuários podem deletar contas a pagar"
  ON public.accounts_payable FOR DELETE
  USING (true);

-- Políticas RLS para contas a receber
CREATE POLICY "Usuários podem ver todas as contas a receber"
  ON public.accounts_receivable FOR SELECT
  USING (true);

CREATE POLICY "Usuários autenticados podem criar contas a receber"
  ON public.accounts_receivable FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Usuários podem atualizar contas a receber"
  ON public.accounts_receivable FOR UPDATE
  USING (true);

CREATE POLICY "Usuários podem deletar contas a receber"
  ON public.accounts_receivable FOR DELETE
  USING (true);

-- Políticas RLS para transações de cartão
CREATE POLICY "Usuários podem ver todas as transações"
  ON public.credit_card_transactions FOR SELECT
  USING (true);

CREATE POLICY "Usuários autenticados podem criar transações"
  ON public.credit_card_transactions FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Usuários podem atualizar transações"
  ON public.credit_card_transactions FOR UPDATE
  USING (true);

CREATE POLICY "Usuários podem deletar transações"
  ON public.credit_card_transactions FOR DELETE
  USING (true);

-- Políticas RLS para audit logs
CREATE POLICY "Usuários podem ver logs"
  ON public.audit_logs FOR SELECT
  USING (true);

CREATE POLICY "Sistema pode inserir logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (true);

-- Função para criar profile automaticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$$;

-- Trigger para criar profile
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Função para updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Triggers para updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.credit_cards
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.accounts_payable
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.accounts_receivable
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.credit_card_transactions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Função para log de auditoria em deleções
CREATE OR REPLACE FUNCTION public.log_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (table_name, record_id, action, user_id, old_data)
  VALUES (
    TG_TABLE_NAME,
    OLD.id,
    'DELETE',
    auth.uid(),
    row_to_json(OLD)
  );
  RETURN OLD;
END;
$$;

-- Triggers para log de deleções
CREATE TRIGGER log_accounts_payable_deletion
  BEFORE DELETE ON public.accounts_payable
  FOR EACH ROW EXECUTE FUNCTION public.log_deletion();

CREATE TRIGGER log_accounts_receivable_deletion
  BEFORE DELETE ON public.accounts_receivable
  FOR EACH ROW EXECUTE FUNCTION public.log_deletion();

CREATE TRIGGER log_credit_card_transactions_deletion
  BEFORE DELETE ON public.credit_card_transactions
  FOR EACH ROW EXECUTE FUNCTION public.log_deletion();

CREATE TRIGGER log_credit_cards_deletion
  BEFORE DELETE ON public.credit_cards
  FOR EACH ROW EXECUTE FUNCTION public.log_deletion();

-- Inserir categorias padrão
INSERT INTO public.expense_categories (name) VALUES
  ('Alimentação'),
  ('Vestuário'),
  ('Transporte'),
  ('Moradia'),
  ('Saúde'),
  ('Educação'),
  ('Lazer'),
  ('Outros');

-- Inserir fontes de receita padrão
INSERT INTO public.income_sources (name) VALUES
  ('Salário'),
  ('Extra'),
  ('Freelance'),
  ('Investimentos'),
  ('Outros');