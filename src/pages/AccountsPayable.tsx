import { Button } from "@/components/ui/button";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog"; // Manter Dialog para o formulário de edição
import { AccountPayableForm } from "@/components/forms/AccountPayableForm"; // Importar o formulário extraído
import { format } from "date-fns";

export default function AccountsPayable() {
  const { user } = useAuth();
  const [isEditingFormOpen, setIsEditingFormOpen] = useState(false); // Estado para o modal de edição
  const [editingAccount, setEditingAccount] = useState<any>(null); // Estado para a conta sendo editada
  const queryClient = useQueryClient();

  // Buscar contas a pagar
  const { data: accounts, isLoading: loadingAccounts } = useQuery({
    queryKey: ["accounts-payable"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts_payable")
        .select("*, expense_categories(name), responsible_parties(name), credit_cards(name)")
        .order("due_date", { ascending: true });
      
      if (error) throw error;
      return data;
    },
  });

  // Deletar conta
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("accounts_payable")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts-payable"] });
      toast.success("Conta deletada com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao deletar conta: " + error.message);
    },
  });

  const handleEdit = (account: any) => {
    setEditingAccount(account);
    setIsEditingFormOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Tem certeza que deseja deletar esta conta?")) {
      deleteMutation.mutate(id);
    }
  };

  const totalAmount = accounts?.reduce((sum, account) => {
    return sum + (account.amount * (account.installments || 1));
  }, 0) || 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/dashboard">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <h1 className="text-2xl font-bold">Contas a Pagar</h1>
            </div>
            {/* Botão de Nova Conta removido daqui */}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Resumo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-expense">
              Total: R$ {totalAmount.toFixed(2)}
            </div>
          </CardContent>
        </Card>

        {loadingAccounts ? (
          <p className="text-muted-foreground">Carregando contas...</p>
        ) : accounts && accounts.length > 0 ? (
          <div className="grid gap-4">
            {accounts.map((account) => (
              <Card key={account.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-2">{account.description}</h3>
                      <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                        <div>
                          <span className="font-medium">Tipo:</span>{" "}
                          {account.payment_type === "cartao" ? "Cartão de Crédito" : 
                           account.payment_type === "promissoria" ? "Promissória" : "Boleto"}
                        </div>
                        {account.credit_cards && (
                          <div>
                            <span className="font-medium">Cartão:</span> {account.credit_cards.name}
                          </div>
                        )}
                        <div>
                          <span className="font-medium">Vencimento:</span>{" "}
                          {format(new Date(account.due_date), "dd/MM/yyyy")}
                        </div>
                        <div>
                          <span className="font-medium">Parcelas:</span> {account.installments}x
                        </div>
                        <div>
                          <span className="font-medium">Valor da Parcela:</span> R$ {account.amount.toFixed(2)}
                        </div>
                        <div>
                          <span className="font-medium">Valor Total:</span>{" "}
                          <span className="text-expense font-semibold">
                            R$ {(account.amount * (account.installments || 1)).toFixed(2)}
                          </span>
                        </div>
                        {account.responsible_parties && (
                          <div>
                            <span className="font-medium">Responsável:</span> {account.responsible_parties.name}
                          </div>
                        )}
                        {account.expense_categories && (
                          <div>
                            <span className="font-medium">Categoria:</span> {account.expense_categories.name}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(account)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleDelete(account.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhuma conta a pagar cadastrada ainda.
            </CardContent>
          </Card>
        )}
      </main>

      {/* Modal de Edição */}
      <Dialog open={isEditingFormOpen} onOpenChange={setIsEditingFormOpen}>
        <AccountPayableForm 
          isOpen={isEditingFormOpen} 
          onClose={() => setIsEditingFormOpen(false)} 
          editingAccount={editingAccount} 
        />
      </Dialog>
    </div>
  );
}