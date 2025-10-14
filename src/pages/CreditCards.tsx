import { Button } from "@/components/ui/button";
import { ArrowLeft, CreditCard, Edit, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { z } from "zod";

const cardSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  brand: z.enum(["visa", "master"], { required_error: "Selecione a bandeira" }),
  due_date: z.number().min(1).max(31),
  best_purchase_date: z.number().min(1).max(31),
  credit_limit: z.number().min(0, "Limite deve ser positivo"),
  owner_name: z.string().min(1, "Nome do dono é obrigatório"),
  last_digits: z.string().optional(),
});

type CardFormData = z.infer<typeof cardSchema>;

export default function CreditCards() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<any>(null);
  const [formData, setFormData] = useState<Partial<CardFormData>>({
    due_date: 10,
    best_purchase_date: 5,
    credit_limit: 0,
    owner_name: "",
  });

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

  // Mutation para salvar
  const saveMutation = useMutation({
    mutationFn: async (data: CardFormData) => {
      const cardData = {
        name: data.name,
        brand: data.brand,
        due_date: data.due_date,
        best_purchase_date: data.best_purchase_date,
        credit_limit: data.credit_limit,
        owner_name: data.owner_name,
        last_digits: data.last_digits || null,
        created_by: user?.id,
      };

      if (editingCard) {
        const { error } = await supabase
          .from("credit_cards")
          .update(cardData)
          .eq("id", editingCard.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("credit_cards")
          .insert([cardData]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit_cards"] });
      toast.success(editingCard ? "Cartão atualizado!" : "Cartão criado!");
      resetForm();
    },
    onError: (error) => {
      toast.error("Erro ao salvar cartão");
      console.error(error);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const validatedData = cardSchema.parse(formData);
      saveMutation.mutate(validatedData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        error.errors.forEach((err) => {
          toast.error(err.message);
        });
      }
    }
  };

  const resetForm = () => {
    setFormData({
      due_date: 10,
      best_purchase_date: 5,
      credit_limit: 0,
      owner_name: "",
    });
    setEditingCard(null);
    setIsFormOpen(false);
  };

  const handleEdit = (card: any) => {
    setEditingCard(card);
    setFormData({
      name: card.name,
      brand: card.brand,
      due_date: card.due_date,
      best_purchase_date: card.best_purchase_date,
      credit_limit: card.credit_limit,
      owner_name: card.owner_name || "",
      last_digits: card.last_digits || "",
    });
    setIsFormOpen(true);
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
            <Button onClick={() => setIsFormOpen(true)}>
              <CreditCard className="mr-2 h-4 w-4" />
              Novo Cartão
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {isFormOpen && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>{editingCard ? "Editar Cartão" : "Novo Cartão"}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Descrição do Cartão *</Label>
                    <Input
                      id="name"
                      value={formData.name || ""}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ex: Cartão principal"
                    />
                  </div>

                  <div>
                    <Label htmlFor="brand">Bandeira *</Label>
                    <Select
                      value={formData.brand}
                      onValueChange={(value: "visa" | "master") => 
                        setFormData({ ...formData, brand: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a bandeira" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="visa">Visa</SelectItem>
                        <SelectItem value="master">Mastercard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="last_digits">Últimos 4 dígitos</Label>
                    <Input
                      id="last_digits"
                      value={formData.last_digits || ""}
                      onChange={(e) => setFormData({ ...formData, last_digits: e.target.value })}
                      placeholder="1234"
                      maxLength={4}
                    />
                  </div>

                  <div>
                    <Label htmlFor="owner_name">Dono do Cartão *</Label>
                    <Input
                      id="owner_name"
                      value={formData.owner_name || ""}
                      onChange={(e) => setFormData({ ...formData, owner_name: e.target.value })}
                      placeholder="Ex: João Silva"
                    />
                  </div>

                  <div>
                    <Label htmlFor="due_date">Data de Vencimento (dia) *</Label>
                    <Input
                      id="due_date"
                      type="number"
                      min="1"
                      max="31"
                      value={formData.due_date || ""}
                      onChange={(e) => setFormData({ ...formData, due_date: parseInt(e.target.value) || 0 })}
                      placeholder="10"
                    />
                  </div>

                  <div>
                    <Label htmlFor="best_purchase_date">Melhor Data de Compra (dia) *</Label>
                    <Input
                      id="best_purchase_date"
                      type="number"
                      min="1"
                      max="31"
                      value={formData.best_purchase_date || ""}
                      onChange={(e) => setFormData({ ...formData, best_purchase_date: parseInt(e.target.value) || 0 })}
                      placeholder="5"
                    />
                  </div>

                  <div>
                    <Label htmlFor="credit_limit">Limite Total de Crédito *</Label>
                    <Input
                      id="credit_limit"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.credit_limit || ""}
                      onChange={(e) => setFormData({ ...formData, credit_limit: parseFloat(e.target.value) || 0 })}
                      placeholder="5000.00"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancelar
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

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
    </div>
  );
}
