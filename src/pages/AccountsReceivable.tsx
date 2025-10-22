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
import { Constants } from "@/integrations/supabase/types"; // Importar Constants para os enums

const formSchema = z.object({
  description: z.string().min(1, "Descrição é obrigatória"),
  income_type: z.enum(["salario", "extra", "aluguel", "vendas", "comissao"], { required_error: "Tipo de recebimento é obrigatório" }),
  receive_date: z.string().min(1, "Data do recebimento é obrigatória"),
  installments: z.string().optional(), // Tornar opcional para lidar com conta fixa
  amount: z.string().min(1, "Valor é obrigatório"),
  source_id: z.string().min(1, "Fonte de receita é obrigatória"),
  payer_id: z.string().optional(),
  new_payer_name: z.string().optional(),
  is_fixed: z.boolean().default(false), // Novo campo
  responsible_person: z.enum(Constants.public.Enums.responsible_person_enum).optional(), // Novo campo
}).superRefine((data, ctx) => {
  // Validação condicional para payer_id e new_payer_name
  if (data.payer_id === "new-payer" && !data.new_payer_name) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Nome do novo pagador é obrigatório",
      path: ["new_payer_name"],
    });
  } else if (!data.payer_id && data.payer_id !== "new-payer") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Pagador é obrigatório",
      path: ["payer_id"],
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

export default function AccountsReceivable() {
  const { user } = useAuth();
  const [isFormOpen, setIsFormOpen] = useState(false);
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
      source_id: "",
      payer_id: "",
      new_payer_name: "",
      is_fixed: false, // Valor padrão inicial
      responsible_person: undefined, // Valor padrão para o novo campo
    },
  });

  const selectedPayerId = form.watch("payer_id");
  const isFixed = form.watch("is_fixed"); // Observar o estado do switch

  useEffect(() => {
    if (isFormOpen && editingAccount) {
      form.reset({
        description: editingAccount.description,
        income_type: editingAccount.income_type || "extra",
        receive_date: editingAccount.receive_date,
        installments: editingAccount.installments?.toString() || (editingAccount.is_fixed ? "" : "1"), // Ajuste para conta fixa
        amount: editingAccount.amount.toString(),
        source_id: editingAccount.source_id || "",
        payer_id: editingAccount.payer_id || "",
        new_payer_name: "",
        is_fixed: editingAccount.is_fixed || false, // Carrega o valor existente
        responsible_person: editingAccount.responsible_person || undefined, // Carrega o valor existente
      });
    } else if (!isFormOpen) {
      form.reset({
        description: "",
        income_type: "extra",
        receive_date: format(new Date(), "yyyy-MM-dd"),
        installments: "1",
        amount: "",
        source_id: "",
        payer_id: "",
        new_payer_name: "",
        is_fixed: false,
        responsible_person: undefined,
      });
    }
  }, [isFormOpen, editingAccount, form]);

  // Buscar contas a receber
  const { data: accounts, isLoading: loadingAccounts } = useQuery({
    queryKey: ["accounts-receivable"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts_receivable")
        .select("*, income_sources(id, name), payers(name)")
        .order("receive_date", { ascending: true });
      
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

  // Buscar pagadores
  const { data: payers, isLoading: isLoadingPayers } = useQuery({
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

  // Criar/Atualizar conta
  const saveMutation = useMutation({
    mutationFn: async (values: FormData) => {
      let finalPayerId = values.payer_id;

      // Se "Novo Pagador" foi selecionado e um nome foi fornecido
      if (values.payer_id === "new-payer" && values.new_payer_name) {
        const { data: newPayer, error: newPayerError } = await supabase
          .from("payers")
          .insert({ name: values.new_payer_name })
          .select("id")
          .single();

        if (newPayerError) throw newPayerError;
        finalPayerId = newPayer.id;
        queryClient.invalidateQueries({ queryKey: ["payers"] });
      }

      const accountData = {
        description: values.description,
        income_type: values.income_type,
        receive_date: values.receive_date,
        installments: values.is_fixed ? 1 : parseInt(values.installments || "1"), // Ajuste para conta fixa
        amount: parseFloat(values.amount),
        source_id: values.source_id,
        payer_id: finalPayerId,
        created_by: user?.id,
        is_fixed: values.is_fixed, // Salva o novo campo
        responsible_person: values.responsible_person || null, // Salva o novo campo
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="income_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tipo de Recebimento</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
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
                              <SelectItem value="comissão">Comissão</SelectItem>
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
                            <FormLabel className="text-base">Receita Fixa</FormLabel>
                            <FormDescription>
                              Marque se esta receita se repete todos os meses.
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="receive_date"
                      render={({ field }) => (
                        <FormItem className={cn(isFixed && "col-span-2")}>
                          <FormLabel>Data do Recebimento</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {!isFixed && ( // Oculta o campo de parcelas se for conta fixa
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

                  {isFixed && ( // Exibe apenas o valor da parcela para contas fixas
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

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="source_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fonte de Receita</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
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
                        Valor Total: R$ {(parseFloat(form.watch("amount") || "0") * (isFixed ? 1 : parseInt(form.watch("installments") || "1"))).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <FormField
                    control={form.control}
                    name="payer_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pagador</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o pagador" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {isLoadingPayers ? (
                              <SelectItem value="loading" disabled>Carregando...</SelectItem>
                            ) : (
                              <>
                                {payers?.map((payer) => (
                                  <SelectItem key={payer.id} value={payer.id}>
                                    {payer.name}
                                  </SelectItem>
                                ))}
                                <SelectItem value="new-payer">
                                  + Novo Pagador
                                </SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {selectedPayerId === "new-payer" && (
                    <FormField
                      control={form.control}
                      name="new_payer_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome do Novo Pagador</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Nome do novo pagador" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {/* Novo campo para Responsible Person */}
                  <FormField
                    control={form.control}
                    name="responsible_person"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Recebedor</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o recebedor" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Constants.public.Enums.responsible_person_enum.map((person) => (
                              <SelectItem key={person} value={person}>
                                {person}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

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
                        {!account.is_fixed && ( // Oculta parcelas se for conta fixa
                          <div>
                            <span className="font-medium">Parcelas:</span> {account.installments || 1}x
                          </div>
                        )}
                        <div>
                          <span className="font-medium">Valor da Parcela:</span> R$ {account.amount.toFixed(2)}
                        </div>
                        <div>
                          <span className="font-medium">Valor Total:</span>{" "}
                          <span className="text-income font-semibold">
                            R$ {(account.amount * (account.installments || 1)).toFixed(2)}
                          </span>
                        </div>
                        {account.income_sources && (
                          <div>
                            <span className="font-medium">Fonte:</span> {account.income_sources.name}
                          </div>
                        )}
                        {account.payers && (
                          <div>
                            <span className="font-medium">Pagador:</span> {account.payers.name}
                          </div>
                        )}
                        {account.responsible_person && ( // Exibe o recebedor
                          <div>
                            <span className="font-medium">Recebedor:</span> {account.responsible_person}
                          </div>
                        )}
                        {account.is_fixed && ( // Exibe "Receita Fixa"
                          <div className="col-span-2">
                            <span className="font-medium text-income">Receita Fixa</span>
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