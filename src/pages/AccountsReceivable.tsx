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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NewPayerForm } from "@/components/NewPayerForm"; // Importar o novo componente

const formSchema = z.object({
  description: z.string().min(1, "Descrição é obrigatória"),
  income_type: z.enum(["salario", "extra", "aluguel", "vendas", "comissao"]),
  receive_date: z.string().min(1, "Data do recebimento é obrigatória"),
  installments: z.string().min(1, "Quantidade de parcelas é obrigatória"),
  amount: z.string().min(1, "Valor é obrigatório"),
  payer_id: z.string().min(1, "Pagador é obrigatório"),
  source_id: z.string().min(1, "Fonte de receita é obrigatória"),
});

type FormData = z.infer<typeof formSchema>;

export default function AccountsReceivable() {
  const { user } = useAuth();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isNewPayerFormOpen, setIsNewPayerFormOpen] = useState(false); // Novo estado para o diálogo de novo pagador
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const queryClient = useQueryClient();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      description: "",
      income_type: "extra",
      receive_date: format(new Date(), "yyyy-MM-dd"),
      installments: "1",
      amount: "",
      payer_id: "", // Inicialmente vazio
      source_id: "",
    },
  });

  useEffect(() => {
    if (isFormOpen && editingAccount) {
      form.reset({
        description: editingAccount.description,
        income_type: editingAccount.income_type,
        receive_date: editingAccount.receive_date,
        installments: editingAccount.installments?.toString() || "1",
        amount: editingAccount.amount.toString(),
        payer_id: editingAccount.payers?.id || "",
        source_id: editingAccount.income_sources?.id || "",
      });
    } else if (!isFormOpen) {
      form.reset({
        description: "",
        income_type: "extra",
        receive_date: format(new Date(), "yyyy-MM-dd"),
        installments: "1",
        amount: "",
        payer_id: "", // Resetar para vazio
        source_id: "",
      });
    }
  }, [isFormOpen, editingAccount, form]);

  // Buscar contas a receber
  const { data: accounts, isLoading: loadingAccounts } = useQuery({
    queryKey: ["accounts-receivable"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts_receivable")
        .select("*, income_sources(id, name), payers(id, name)")
        .order("receive_date", { ascending: true });
      
      if (error) throw error;
      return data;
    },
  });

  // Buscar pagadores
  const { data: payers } = useQuery({
    queryKey: ["payers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payers")
        .select("*")
        .order("name");
      
      if (error) throw error;
      return data;
    },
  });

  // Buscar fontes de receita
  const { data: sources } = useQuery({
    queryKey: ["income-sources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("income_sources")
        .select("*")
        .order("name");
      
      if (error) throw error;
      return data;
    },
  });

  // Criar/Atualizar conta
  const saveMutation = useMutation({
    mutationFn: async (values: FormData) => {
      const accountData = {
        description: values.description,
        income_type: values.income_type,
        receive_date: values.receive_date,
        installments: parseInt(values.installments),
        amount: parseFloat(values.amount),
        payer_id: values.payer_id,
        source_id: values.source_id,
        created_by: user?.id,
      };

      if (editingAccount) {
        const { error } = await supabase
          .from("accounts_receivable")
          .update(accountData)
          .eq("id", editingAccount.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("accounts_receivable")
          .insert(accountData);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts-receivable"] });
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
        .from("accounts_receivable")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts-receivable"] });
      toast.success("Conta deletada com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao deletar conta: " + error.message);
    },
  });

  // Mutation para deletar pagador
  const deletePayerMutation = useMutation({
    mutationFn: async (payerId: string) => {
      // Verificar se o pagador tem contas a receber associadas
      const { count, error: countError } = await supabase
        .from("accounts_receivable")
        .select("id", { count: "exact" })
        .eq("payer_id", payerId);

      if (countError) throw countError;

      if (count && count > 0) {
        throw new Error("Não é possível excluir este pagador, pois ele possui contas a receber associadas.");
      }

      // Se não houver contas associadas, prosseguir com a exclusão
      const { error } = await supabase
        .from("payers")
        .delete()
        .eq("id", payerId);

      if (error) throw error;
    },
    onSuccess: (data, payerId) => {
      queryClient.invalidateQueries({ queryKey: ["payers"] });
      toast.success("Pagador excluído com sucesso!");
      // Se o pagador excluído era o selecionado no formulário, resetar o campo
      if (form.getValues("payer_id") === payerId) {
        form.setValue("payer_id", "");
      }
    },
    onError: (error) => {
      toast.error("Erro ao excluir pagador: " + error.message);
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

  const handlePayerSelectChange = (value: string) => {
    if (value === "new-payer") {
      setIsNewPayerFormOpen(true);
    } else {
      form.setValue("payer_id", value);
    }
  };

  const handleNewPayerCreated = (newPayerId: string) => {
    form.setValue("payer_id", newPayerId);
    setIsNewPayerFormOpen(false);
  };

  const handleDeletePayer = (payerId: string, payerName: string) => {
    if (confirm(`Tem certeza que deseja excluir o pagador "${payerName}"?`)) {
      deletePayerMutation.mutate(payerId);
    }
  };

  const totalAmount = accounts?.reduce((sum, account) => {
    return sum + (account.amount * (account.installments || 1));
  }, 0) || 0;

  const getIncomeTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      salario: "Salário",
      extra: "Extra",
      aluguel: "Aluguel",
      vendas: "Vendas",
      comissao: "Comissão",
    };
    return types[type] || type;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Contas a Receber</h1>
          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditingAccount(null)}>
                <Plus className="mr-2 h-4 w-4" />
                Nova Conta
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingAccount ? "Editar Conta" : "Nova Conta a Receber"}</DialogTitle>
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
                          <Input {...field} placeholder="Ex: Pagamento cliente X" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="income_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de Recebimento</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o tipo" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="salario">Salário</SelectItem>
                            <SelectItem value="extra">Extra</SelectItem>
                            <SelectItem value="aluguel">Aluguel</SelectItem>
                            <SelectItem value="vendas">Vendas</SelectItem>
                            <SelectItem value="comissao">Comissão</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="receive_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Data do Recebimento</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="payer_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Pagador</FormLabel>
                          <Select onValueChange={handlePayerSelectChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Quem vai pagar" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {payers?.map((payer) => (
                                <SelectItem key={payer.id} value={payer.id}>
                                  <div className="flex items-center justify-between w-full">
                                    <span>{payer.name}</span>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6"
                                      onClick={(e) => {
                                        e.stopPropagation(); // Evita que o SelectItem seja selecionado
                                        handleDeletePayer(payer.id, payer.name);
                                      }}
                                      disabled={deletePayerMutation.isPending}
                                    >
                                      <Trash2 className="h-3 w-3 text-destructive" />
                                    </Button>
                                  </div>
                                </SelectItem>
                              ))}
                              <SelectItem value="new-payer">
                                + Novo Pagador
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

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

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="source_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fonte de Receita</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione a fonte" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {sources?.map((source) => (
                                <SelectItem key={source.id} value={source.id}>
                                  {source.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="bg-muted p-4 rounded-lg flex items-center">
                      <p className="text-sm font-medium">
                        Valor Total: R$ {(parseFloat(form.watch("amount") || "0") * parseInt(form.watch("installments") || "1")).toFixed(2)}
                      </p>
                    </div>
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

      {/* Diálogo para Novo Pagador */}
      <Dialog open={isNewPayerFormOpen} onOpenChange={setIsNewPayerFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Pagador</DialogTitle>
          </DialogHeader>
          <NewPayerForm
            onPayerCreated={handleNewPayerCreated}
            onClose={() => setIsNewPayerFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <main className="container mx-auto px-4 py-8">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Resumo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-income">
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
                          {getIncomeTypeLabel(account.income_type)}
                        </div>
                        <div>
                          <span className="font-medium">Recebimento:</span>{" "}
                          {format(new Date(account.receive_date), "dd/MM/yyyy")}
                        </div>
                        <div>
                          <span className="font-medium">Parcelas:</span> {account.installments || 1}x
                        </div>
                        <div>
                          <span className="font-medium">Valor da Parcela:</span> R$ {account.amount.toFixed(2)}
                        </div>
                        <div>
                          <span className="font-medium">Valor Total:</span>{" "}
                          <span className="text-income font-semibold">
                            R$ {(account.amount * (account.installments || 1)).toFixed(2)}
                          </span>
                        </div>
                        {account.payers && (
                          <div>
                            <span className="font-medium">Pagador:</span> {account.payers.name}
                          </div>
                        )}
                        {account.income_sources && (
                          <div>
                            <span className="font-medium">Fonte:</span> {account.income_sources.name}
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
              Nenhuma conta a receber cadastrada ainda.
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}