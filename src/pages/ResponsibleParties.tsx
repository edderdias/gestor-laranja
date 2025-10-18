import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, User } from "lucide-react";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const formSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
});

type FormData = z.infer<typeof formSchema>;

export default function ResponsibleParties() {
  const { user } = useAuth();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingResponsible, setEditingResponsible] = useState<any>(null);
  const queryClient = useQueryClient();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
    },
  });

  useEffect(() => {
    if (isFormOpen && editingResponsible) {
      form.reset({
        name: editingResponsible.name,
      });
    } else if (!isFormOpen) {
      form.reset({
        name: "",
      });
    }
  }, [isFormOpen, editingResponsible, form]);

  // Buscar responsáveis
  const { data: responsibles, isLoading: isLoadingResponsibles } = useQuery({
    queryKey: ["responsible-parties"],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("responsible_parties")
        .select("*")
        .eq("user_id", user.id)
        .order("name");
      
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Criar/Atualizar responsável
  const saveMutation = useMutation({
    mutationFn: async (values: FormData) => {
      if (!user?.id) {
        toast.error("Usuário não autenticado. Não foi possível salvar responsável.");
        throw new Error("User not authenticated.");
      }

      const responsibleData = {
        name: values.name,
        user_id: user.id,
      };

      if (editingResponsible) {
        const { error } = await supabase
          .from("responsible_parties")
          .update(responsibleData)
          .eq("id", editingResponsible.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("responsible_parties")
          .insert(responsibleData);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["responsible-parties"] });
      toast.success(editingResponsible ? "Responsável atualizado!" : "Responsável criado!");
      setIsFormOpen(false);
      setEditingResponsible(null);
      form.reset();
    },
    onError: (error) => {
      toast.error("Erro ao salvar responsável: " + error.message);
    },
  });

  // Deletar responsável
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("responsible_parties")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["responsible-parties"] });
      toast.success("Responsável excluído!");
    },
    onError: (error) => {
      toast.error("Erro ao excluir responsável: " + error.message);
    },
  });

  const onSubmit = (values: FormData) => {
    saveMutation.mutate(values);
  };

  const handleEdit = (responsible: any) => {
    setEditingResponsible(responsible);
    setIsFormOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Tem certeza que deseja excluir este responsável?")) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Gerenciar Responsáveis</h1>
          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditingResponsible(null)}>
                <Plus className="mr-2 h-4 w-4" />
                Novo Responsável
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingResponsible ? "Editar Responsável" : "Novo Responsável"}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome do Responsável</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Ex: João Silva" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={saveMutation.isPending}>
                      {saveMutation.isPending ? "Salvando..." : "Salvar"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8">
        {isLoadingResponsibles ? (
          <p className="text-muted-foreground">Carregando responsáveis...</p>
        ) : responsibles && responsibles.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {responsibles.map((responsible) => (
              <Card key={responsible.id}>
                <CardContent className="pt-6 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <User className="h-5 w-5 text-muted-foreground" />
                    <h3 className="font-semibold text-lg">{responsible.name}</h3>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(responsible)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleDelete(responsible.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhum responsável cadastrado. Clique em "Novo Responsável" para começar.
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}