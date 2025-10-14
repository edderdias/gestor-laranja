import { useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog } from "@/components/ui/dialog";
import { Plus, LogOut, Wallet } from "lucide-react";
import { AccountPayableForm } from "@/components/forms/AccountPayableForm";
import { AccountReceivableForm } from "@/components/forms/AccountReceivableForm";
import { CreditCardForm } from "@/components/forms/CreditCardForm";

export function MainLayout() {
  const { signOut, user } = useAuth();
  const [isPayableFormOpen, setIsPayableFormOpen] = useState(false);
  const [isReceivableFormOpen, setIsReceivableFormOpen] = useState(false);
  const [isCreditCardFormOpen, setIsCreditCardFormOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/dashboard" className="flex items-center gap-3">
              <div className="bg-primary rounded-full p-2">
                <Wallet className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Controle Financeiro</h1>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Criar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setIsPayableFormOpen(true)}>
                  Nova Conta a Pagar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsReceivableFormOpen(true)}>
                  Nova Conta a Receber
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsCreditCardFormOpen(true)}>
                  Novo Cartão de Crédito
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Modals for forms */}
      <Dialog open={isPayableFormOpen} onOpenChange={setIsPayableFormOpen}>
        <AccountPayableForm isOpen={isPayableFormOpen} onClose={() => setIsPayableFormOpen(false)} />
      </Dialog>

      <Dialog open={isReceivableFormOpen} onOpenChange={setIsReceivableFormOpen}>
        <AccountReceivableForm isOpen={isReceivableFormOpen} onClose={() => setIsReceivableFormOpen(false)} />
      </Dialog>

      <Dialog open={isCreditCardFormOpen} onOpenChange={setIsCreditCardFormOpen}>
        <CreditCardForm isOpen={isCreditCardFormOpen} onClose={() => setIsCreditCardFormOpen(false)} />
      </Dialog>
    </div>
  );
}