import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Users, Copy, Key } from "lucide-react";
import { Tables } from "@/integrations/supabase/types";

type Profile = Tables<'profiles'>;

const editProfileSchema = z.object({
  fullName: z.string().min(1, "Nome é obrigatório"),
});

const changePasswordSchema = z.object({
  password: z.string().min(6, "Mínimo 6 caracteres"),
});

export default function UserManagement() {
  const { user: currentUser, familyData, refreshFamily } = useAuth();
  const queryClient = useQueryClient();
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);

  const editForm = useForm<z.infer<typeof editProfileSchema>>({
    resolver: zodResolver(editProfileSchema),
    defaultValues: { fullName: "" },
  });

  const passwordForm = useForm<z.infer<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { password: "" },
  });

  const { data: users, isLoading: isLoadingUsers } = useQuery({
    queryKey: ["users", familyData.id],
    queryFn: async () => {
      if (!familyData.id) {
        const { data } = await supabase.from("profiles").select("*").eq("id", currentUser?.id);
        return data as Profile[];
      }
      const { data, error } = await supabase.from("profiles").select("*").eq("family_id", familyData.id);
      if (error) throw error;
      return data as Profile[];
    },
    enabled: !!currentUser?.id,
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: z.infer<typeof editProfileSchema>) => {
      if (!editingUser) return;
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: data.fullName })
        .eq("id", editingUser.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Perfil atualizado!");
      setEditingUser(null);
      queryClient.invalidateQueries({ queryKey: ["users"] });
      refreshFamily();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: z.infer<typeof changePasswordSchema>) => {
      const { error } = await supabase.auth.updateUser({ password: data.password });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Senha alterada com sucesso!");
      setIsPasswordDialogOpen(false);
      passwordForm.reset();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const isOwner = currentUser?.id === familyData.ownerId;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Users className="h-8 w-8" /> Gestão de Usuários
          </h1>
          <Button variant="outline" onClick={() => setIsPasswordDialogOpen(true)}>
            <Key className="mr-2 h-4 w-4" /> Alterar Minha Senha
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2 mb-8">
          <Card>
            <CardHeader><CardTitle>Minha Família: {familyData.name || "Individual"}</CardTitle></CardHeader>
            <CardContent>
              {familyData.code && (
                <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                  <span className="text-sm font-mono">Código: {familyData.code}</span>
                  <Button variant="ghost" size="icon" onClick={() => {
                    navigator.clipboard.writeText(familyData.code!);
                    toast.success("Código copiado!");
                  }}><Copy className="h-4 w-4" /></Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Membros</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>{u.full_name}</TableCell>
                    <TableCell>{u.id === familyData.ownerId ? "Dono" : "Membro"}</TableCell>
                    <TableCell className="text-right">
                      {(isOwner || u.id === currentUser?.id) && (
                        <Button variant="ghost" size="icon" onClick={() => {
                          setEditingUser(u);
                          editForm.reset({ fullName: u.full_name || "" });
                        }}><Pencil className="h-4 w-4" /></Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Dialog de Edição de Perfil */}
      <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Perfil</DialogTitle></DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit((data) => updateProfileMutation.mutate(data))} className="space-y-4">
              <FormField control={editForm.control} name="fullName" render={({ field }) => (
                <FormItem><FormLabel>Nome Completo</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Dialog de Alteração de Senha */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Senha</DialogTitle>
            <DialogDescription>Digite sua nova senha de acesso.</DialogDescription>
          </DialogHeader>
          <Form {...passwordForm}>
            <form onSubmit={passwordForm.handleSubmit((data) => changePasswordMutation.mutate(data))} className="space-y-4">
              <FormField control={passwordForm.control} name="password" render={({ field }) => (
                <FormItem><FormLabel>Nova Senha</FormLabel><FormControl><Input {...field} type="password" /></FormControl><FormMessage /></FormItem>
              )} />
              <DialogFooter><Button type="submit">Atualizar Senha</Button></DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}