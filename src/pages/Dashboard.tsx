import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  ArrowDownCircle, 
  ArrowUpCircle, 
  CreditCard, 
  LogOut, 
  Wallet,
  TrendingUp,
  TrendingDown
} from "lucide-react";
import { Link } from "react-router-dom";

export default function Dashboard() {
  const { signOut, user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary rounded-full p-2">
              <Wallet className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Controle Financeiro</h1>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Cards de Resumo */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card className="border-income/20 bg-income-light">
            <CardHeader className="pb-3">
              <CardDescription className="text-income">Receitas do Mês</CardDescription>
              <CardTitle className="text-3xl text-income">R$ 0,00</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-income">
                <TrendingUp className="h-4 w-4" />
                <span>0 recebimentos</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-expense/20 bg-expense-light">
            <CardHeader className="pb-3">
              <CardDescription className="text-expense">Despesas do Mês</CardDescription>
              <CardTitle className="text-3xl text-expense">R$ 0,00</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-expense">
                <TrendingDown className="h-4 w-4" />
                <span>0 pagamentos</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-neutral/20 bg-neutral-light">
            <CardHeader className="pb-3">
              <CardDescription>Saldo</CardDescription>
              <CardTitle className="text-3xl">R$ 0,00</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Wallet className="h-4 w-4" />
                <span>Disponível</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Cartões de Crédito</CardDescription>
              <CardTitle className="text-3xl">R$ 0,00</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CreditCard className="h-4 w-4" />
                <span>0 transações</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Menu de Navegação */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Link to="/accounts-payable">
            <Card className="hover:border-expense transition-colors cursor-pointer h-full">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="bg-expense/10 p-3 rounded-lg">
                    <ArrowDownCircle className="h-6 w-6 text-expense" />
                  </div>
                  <div>
                    <CardTitle>Contas a Pagar</CardTitle>
                    <CardDescription>Gerenciar despesas</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>

          <Link to="/accounts-receivable">
            <Card className="hover:border-income transition-colors cursor-pointer h-full">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="bg-income/10 p-3 rounded-lg">
                    <ArrowUpCircle className="h-6 w-6 text-income" />
                  </div>
                  <div>
                    <CardTitle>Contas a Receber</CardTitle>
                    <CardDescription>Gerenciar receitas</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>

          <Link to="/credit-cards">
            <Card className="hover:border-primary transition-colors cursor-pointer h-full">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 p-3 rounded-lg">
                    <CreditCard className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Cartões de Crédito</CardTitle>
                    <CardDescription>Transações de cartão</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>
        </div>
      </main>
    </div>
  );
}
