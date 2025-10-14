import { Button } from "@/components/ui/button";
import { ArrowLeft, CreditCard, Edit, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { z } from "zod";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog } from "@/components/ui/dialog"; // Manter Dialog para o formulário de edição
import { CreditCardForm } from "@/components/forms/CreditCardForm"; // Importar o formulário extraído

// Helper function for formatting currency for display
const formatCurrencyDisplay = (value: number | undefined): string => {
  if (value === undefined || value === null) return "";
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

// Helper function for parsing currency input string to number
const parseCurrencyInput = (input: string): number => {
  // Remove all non-digit characters except comma
  const cleanedInput = input.replace(/[^0-9,]/g, '');
  // Replace comma with dot for parseFloat
  const numericValue = parseFloat(cleanedInput.replace(',', '.')) || 0;
  return numericValue;
};

// O schema e o tipo CardFormData não são mais necessários aqui, pois estão no CreditCardForm.tsx
// const cardSchema = z.object({ ... });
// type CardFormData = z.infer<typeof cardSchema>;

export default function CreditCards() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isEditingFormOpen, setIsEditingFormOpen] = useState(false); // Estado para o modal de edição
  const [editingCard, setEditingCard] = useState<any>(null); // Estado para o cartão sendo editado

  // Buscar cartões
  const { data: cards, isLoading: isLoadingCards } = useQuery({
    queryKey: ["credit_cards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_cards")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Buscar total gasto por cartão
  const { data: cardExpenses } = useQuery({
    queryKey: ["card_expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts_payable")
        .select("card_id, amount, installments")
        .not("card_id", "is", null);
      if (error) throw error;
      
      // Agrupar por cartão e calcular total
      const totals = data.reduce((acc: any, expense: any) => {
        const cardId = expense.card_id;
        const total = expense.amount * (expense.installments || 1);
        acc[cardId] = (acc[cardId] || 0) + total;
        return acc;
      }, {});
      
      return totals;
    },
  });

  // Mutation para deletar
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("credit_cards")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit_cards"] });
      toast.success("Cartão excluído!");
    },
    onError: () => {
      toast.error("Erro ao excluir cartão");
    },
  });

  const handleEdit = (card: any) => {
    setEditingCard(card);
    setIsEditingFormOpen(true);
  };

  const getAvailableLimit = (cardId: string, creditLimit: number) => {
    const spent = cardExpenses?.[cardId] || 0;
    return creditLimit - spent;
  };

  const getBrandLabel = (brand: string) => {
    return brand === "visa" ? "Visa" : "Mastercard";
  };

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
              <h1 className="text-2xl font-bold">Cartões de Crédito</h1>
            </div>
            {/* Botão de Novo Cartão removido daqui */}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {isLoadingCards ? (
          <p className="text-muted-foreground">Carregando cartões...</p>
        ) : cards && cards.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {cards.map((card) => {
              const availableLimit = getAvailableLimit(card.id, card.credit_limit || 0);
              const usedPercentage = card.credit_limit 
                ? ((card.credit_limit - availableLimit) / card.credit_limit) * 100 
                : 0;

              return (
                <Card key={card.id} className="relative">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <CreditCard className="h-5 w-5" />
                          {card.name}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          {getBrandLabel(card.brand)} {card.last_digits && `•••• ${card.last_digits}`}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(card)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm("Tem certeza que deseja excluir este cartão?")) {
                              deleteMutation.mutate(card.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Dono:</span>
                        <span className="font-medium">{card.owner_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Vencimento:</span>
                        <span className="font-medium">Dia {card.due_date}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Melhor compra:</span>
                        <span className="font-medium">Dia {card.best_purchase_date}</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Limite Total:</span>
                        <span className="font-semibold">
                          R$ {(card.credit_limit || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Utilizado:</span>
                        <span className="font-semibold text-expense">
                          R$ {((card.credit_limit || 0) - availableLimit).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Disponível:</span>
                        <span className="font-bold text-income">
                          R$ {availableLimit.toFixed(2)}
                        </span>
                      </div>
                      
                      <div className="w-full bg-muted rounded-full h-2 mt-2">
                        <div
                          className="bg-expense h-2 rounded-full transition-all"
                          style={{ width: `${Math.min(usedPercentage, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-center text-muted-foreground">
                        {usedPercentage.toFixed(1)}% utilizado
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhum cartão cadastrado. Clique em "Novo Cartão" para começar.
            </CardContent>
          </Card>
        )}
      </main>

      {/* Modal de Edição */}
      <Dialog open={isEditingFormOpen} onOpenChange={setIsEditingFormOpen}>
        <CreditCardForm 
          isOpen={isEditingFormOpen} 
          onClose={() => setIsEditingFormOpen(false)} 
          editingCard={editingCard} 
        />
      </Dialog>
    </div>
  );
}