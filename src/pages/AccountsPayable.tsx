import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch"; // Importar o Switch
import { cn } from "@/lib/utils"; // Importar cn para classes condicionais

const formSchema = z.object({
  description: z.string().min(1, "Descrição é obrigatória"),
  payment_type: z.enum(["cartao", "promissoria", "boleto"]),
  card_id: z.string().optional(),
  purchase_date: z.string().optional(), // Tornar opcional inicialmente
  due_date: z.string().min(1, "Data de vencimento é obrigatória"),
  installments: z.string().optional(), // Tornar opcional para lidar com conta fixa
  amount: z.string().min(1, "Valor é obrigatório"),
  category_id: z.string().min(1, "Categoria é obrigatória"),
  is_fixed: z.boolean().default(false),
  responsible_person: z.enum(["Eder", "Monalisa", "Luiz", "Elizabeth", "Tosta"]).optional(), // Novo campo
}).superRefine((data, ctx) => {
  // Validação condicional para purchase_date
  if (!data.is_fixed && !data.purchase_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Data da compra é obrigatória para contas não fixas",
      path: ["purchase_date"],
    });
  }
  // Validação condicional para installments
  if (!data.is_fixed && (!data.installments || parseInt(data.installments) < 1)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Quantidade de parcelas é obrigatória para contas não fixas",
      path: ["installments"],
    });
  }
});

type FormData = z.infer<typeof formSchema>;

export default function AccountsPayable() {
  const { user } = useAuth();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const queryClient = useQueryClient();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      description: "",
      payment_type: "boleto",
      purchase_date: format(new Date(), "yyyy-MM-dd"),
      due_date: format(new Date(), "yyyy-MM-dd"),
      installments: "1",
      amount: "",
      category_id: "",
      is_fixed: false,
      responsible_person: undefined, // Valor padrão para o novo campo
    },
  });

  const paymentType = form.watch("payment_type");
  const isFixed = form.watch("is_fixed"); // Observar o estado do switch

  useEffect(() => {
    if (isFormOpen && editingAccount) {
      form.reset({
        description: editingAccount.description,
        payment_type: editingAccount.payment_type || "boleto",
        card_id: editingAccount.card_id || "",
        purchase_date: editingAccount.purchase_date || format(new Date(), "yyyy-MM-dd"),
        due_date: editingAccount.due_date,
        installments: editingAccount.installments?.toString() || (editingAccount.is_fixed ? "" : "1"),
        amount: editingAccount.amount.toString(),
        category_id: editingAccount.category_id || "",
        is_fixed: editingAccount.is_fixed || false,
        responsible_person: editingAccount.responsible_person || undefined, // Carrega o valor existente
      });
    } else if (!isFormOpen) {
      form.reset({
        description: "",
        payment_type: "boleto",
        purchase_date: format(new Date(), "yyyy-MM-dd"),
        due_date: format(new Date(), "yyyy-MM-dd"),
        installments: "1",
        amount: "",
        category_id: "",
        is_fixed: false,
        responsible_person: undefined,
      });
    }
  }, [isFormOpen, editingAccount, form]);

  // Buscar contas a pagar
  const { data: accounts, isLoading: loadingAccounts } = useQuery({
    queryKey: ["accounts-payable"],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("accounts_payable")
        .select("*, expense_categories(name), credit_cards(name)")
        .eq("created_by", user.id)
        .order("due_date", { ascending: true });
      
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Buscar cartões
  const { data: cards } = useQuery({
    queryKey: ["credit-cards"],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("credit_cards")
        .select("*")
        .eq("created_by", user.id)
        .order("name");
      
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Buscar categorias
  const { data: categories } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_categories")
        .select("*")
        .order("name");
      
      if (error) throw error;
      return data;
    },
  });

  // Criar/Atualizar conta
  const saveMutation = useMutation({
    mutationFn: async (values: FormData) => {
      if (!user?.id) {
        toast.error("Usuário não autenticado. Não foi possível salvar conta.");
        throw new Error("User not authenticated.");
      }

      const accountData = {
        description: values.description,
        payment_type: values.payment_type,
        card_id: values.payment_type === "cartao" ? values.card_id : null,
        purchase_date: values.is_fixed ? null : values.purchase_date,
        due_date: values.due_date,
        installments: values.is_fixed ? 1 : parseInt(values.installments || "1"),
        amount: parseFloat(values.amount),
        category_id: values.category_id,
        expense_type: "variavel" as const,
        is_fixed: values.is_fixed,
        responsible_person: values.responsible_person || null, // Salva o novo campo
        created_by: user.id,
      };

      if (editingAccount) {
        const { error } = await supabase
          .from("accounts_payable")
          .update(accountData)
          .eq("id", editingAccount.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("accounts_payable")
          .insert(accountData);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts-payable"] });
      toast.success(editingAccount ? "Conta atualizada com sucesso!" : "Conta criada com sucesso!");
      setIsFormOpen(false);
      setEditingAccount(null);
      form.reset();
    },
    onError: (error) => {
      toast.error("Erro ao salvar conta: " + error.message);
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

  const onSubmit = (values: FormData) => {
    saveMutation.mutate(values);
  };

  const handleEdit = (account: any) => {
    setEditingAccount(account);
    setIsFormOpen(true);
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
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Contas a Pagar</h1>
          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditingAccount(null)}>
                <Plus className="mr-2 h-4 w-4" />
                Nova Conta
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingAccount ? "Editar Conta" : "Nova Conta a Pagar"}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Descrição</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Ex: Compra supermercado" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="payment_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tipo de Pagamento</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione o tipo" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="cartao">Cartão de Crédito</SelectItem>
                              <SelectItem value="promissoria">Promissória</SelectItem>
                              <SelectItem value="boleto">Boleto</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="is_fixed"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Conta Fixa</FormLabel>
                            <FormDescription>
                              Marque se esta conta se repete todos os meses.
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  {paymentType === "cartao" && (
                    <FormField
                      control={form.control}
                      name="card_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cartão de Crédito</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione o cartão" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {cards?.map((card) => (
                                <SelectItem key={card.id} value={card.id}>
                                  {card.name} {card.last_digits ? `(**** ${card.last_digits})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {!isFixed && (
                      <FormField
                        control={form.control}
                        name="purchase_date"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Data da Compra</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    <FormField
                      control={form.control}
                      name="due_date"
                      render={({ field }) => (
                        <FormItem className={cn(isFixed && "col-span-2")}>
                          <FormLabel>Data de Vencimento</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                    )}
                    />
                  </div>

                  {!isFixed && (
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="installments"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Quantidade de Parcelas</FormLabel>
                            <FormControl>
                              <Input type="number" min="1" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Valor da Parcela</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" placeholder="0.00" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {isFixed && (
                    <div className="grid grid-cols-1 gap-4">
                      <FormField
                        control={form.control}
                        name="amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Valor da Parcela</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" placeholder="0.00" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="category_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Categoria</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione a categoria" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {categories?.map((category) => (
                              <SelectItem key={category.id} value={category.id}>
                                {category.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Novo campo para Responsible Person */}
                  <FormField
                    control={form.control}
                    name="responsible_person"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Responsável</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o responsável" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Eder">Eder</SelectItem>
                            <SelectItem value="Monalisa">Monalisa</SelectItem>
                            <SelectItem value="Luiz">Luiz</SelectItem>
                            <SelectItem value="Elizabeth">Elizabeth</SelectItem>
                            <SelectItem value="Tosta">Tosta</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="bg-muted p-4 rounded-lg">
                    <p className="text-sm font-medium">
                      Valor Total: R$ {(parseFloat(form.watch("amount") || "0") * (isFixed ? 1 : parseInt(form.watch("installments") || "1"))).toFixed(2)}
                    </p>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={saveMutation.isPending}>
                      {saveMutation.isPending ? "Salvando..." : editingAccount ? "Atualizar" : "Criar"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

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
                        {!account.is_fixed && (
                          <div>
                            <span className="font-medium">Parcelas:</span> {account.installments}x
                          </div>
                        )}
                        <div>
                          <span className="font-medium">Valor da Parcela:</span> R$ {account.amount.toFixed(2)}
                        </div>
                        <div>
                          <span className="font-medium">Valor Total:</span>{" "}
                          <span className="text-expense font-semibold">
                            R$ {(account.amount * (account.installments || 1)).toFixed(2)}
                          </span>
                        </div>
                        {account.expense_categories && (
                          <div>
                            <span className="font-medium">Categoria:</span> {account.expense_categories.name}
                          </div>
                        )}
                        {account.responsible_person && ( // Exibe o responsável
                          <div>
                            <span className="font-medium">Responsável:</span> {account.responsible_person}
                          </div>
                        )}
                        {account.is_fixed && (
                          <div className="col-span-2">
                            <span className="font-medium text-primary">Conta Fixa</span>
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
    </div>
  );
}