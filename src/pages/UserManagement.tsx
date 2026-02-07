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
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Trash2, UserPlus, UserCheck } from "lucide-react";
import { Tables } from "@/integrations/supabase/types";

type Profile = Tables<'profiles'> & {
  email?: string;
};

const inviteSchema = z.object({
  email: z.string().email("Email inválido"),
  fullName: z.string().min(1, "Nome completo é obrigatório"),
  isFamilyMember: z.boolean().default(false),
});

const createSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
  fullName: z.string().min(1, "Nome completo é obrigatório"),
  isFamilyMember: z.boolean().default(false),
});

const editUserSchema = z.object({
  id: z.string(),
  fullName: z.string().min(1, "Nome completo é obrigatório"),
  isFamilyMember: z.boolean(),
});

type InviteFormData = z.infer<typeof inviteSchema>;
type CreateFormData = z.infer<typeof createSchema>;
type EditUserFormData = z.infer<typeof editUserSchema>;

export default function UserManagement() {
  const { user: currentUser, session } = useAuth();
  const queryClient = useQueryClient();
  const [isInviteFormOpen, setIsInviteFormOpen] = useState(false);
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);

  const inviteForm = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", fullName: "", isFamilyMember: false },
  });

  const createForm = useForm<CreateFormData>({
    resolver: zodResolver(createSchema),
    defaultValues: { email: "", password: "", fullName: "", isFamilyMember: false },
  });

  const editForm = useForm<EditUserFormData>({
    resolver: zodResolver(editUserSchema),
    defaultValues: { id: "", fullName: "", isFamilyMember: false },
  });

  const { data: users, isLoading: isLoadingUsers } = useQuery({
    queryKey: ["users", currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return [];
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, is_family_member, invited_by_user_id");

      if (profilesError) throw profilesError;

      return profilesData as Profile[];
    },
    enabled: !!currentUser?.id,
  });

  const inviteUserMutation = useMutation({
    mutationFn: async (data: InviteFormData) => {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao convidar usuário");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Convite enviado com sucesso!");
      setIsInviteFormOpen(false);
      inviteForm.reset();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: CreateFormData) => {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao cadastrar usuário");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Usuário cadastrado com sucesso!");
      setIsCreateFormOpen(false);
      createForm.reset();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const updateUserMutation = useMutation({
    mutationFn: async (data: EditUserFormData) => {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: data.fullName, is_family_member: data.isFamilyMember })
        .eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Usuário atualizado!");
      setIsEditFormOpen(false);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("profiles").delete().eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Usuário removido!");
    },
    onError: (error: any) => toast.error(error.message),
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <h1 className="text-3xl font-bold">Gerenciamento de Usuários</h1>
          <div className="flex gap-2">
            <Dialog open={isCreateFormOpen} onOpenChange={setIsCreateFormOpen}>
              <DialogTrigger asChild>
                <Button variant="default">
                  <UserCheck className="mr-2 h-4 w-4" /> Cadastrar Usuário
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Cadastrar Novo Usuário</DialogTitle>
                  <DialogDescription>Crie um usuário diretamente com e-mail e senha.</DialogDescription>
                </DialogHeader>
                <Form {...createForm}>
                  <form onSubmit={createForm.handleSubmit((data) => createUserMutation.mutate(data))} className="space-y-4">
                    <FormField control={createForm.control} name="fullName" render={({ field }) => (
                      <FormItem><FormLabel>Nome Completo</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={createForm.control} name="email" render={({ field }) => (
                      <FormItem><FormLabel>Email</FormLabel><FormControl><Input {...field} type="email" /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={createForm.control} name="password" render={({ field }) => (
                      <FormItem><FormLabel>Senha</FormLabel><FormControl><Input {...field} type="password" /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={createForm.control} name="isFamilyMember" render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5"><FormLabel>Membro da Família</FormLabel></div>
                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      </FormItem>
                    )} />
                    <DialogFooter>
                      <Button type="submit" disabled={createUserMutation.isPending}>{createUserMutation.isPending ? "Cadastrando..." : "Cadastrar"}</Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>

            <Dialog open={isInviteFormOpen} onOpenChange={setIsInviteFormOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <UserPlus className="mr-2 h-4 w-4" /> Convidar
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Convidar Usuário</DialogTitle>
                  <DialogDescription>Envie um convite por e-mail.</DialogDescription>
                </DialogHeader>
                <Form {...inviteForm}>
                  <form onSubmit={inviteForm.handleSubmit((data) => inviteUserMutation.mutate(data))} className="space-y-4">
                    <FormField control={inviteForm.control} name="fullName" render={({ field }) => (
                      <FormItem><FormLabel>Nome Completo</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={inviteForm.control} name="email" render={({ field }) => (
                      <FormItem><FormLabel>Email</FormLabel><FormControl><Input {...field} type="email" /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={inviteForm.control} name="isFamilyMember" render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5"><FormLabel>Membro da Família</FormLabel></div>
                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      </FormItem>
                    )} />
                    <DialogFooter>
                      <Button type="submit" disabled={inviteUserMutation.isPending}>{inviteUserMutation.isPending ? "Enviando..." : "Enviar Convite"}</Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle>Usuários</CardTitle></CardHeader>
          <CardContent>
            {isLoadingUsers ? <p>Carregando...</p> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Membro da Família</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users?.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>{user.full_name}</TableCell>
                      <TableCell>{user.is_family_member ? "Sim" : "Não"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => {
                            setEditingUser(user);
                            editForm.reset({ id: user.id, fullName: user.full_name || "", isFamilyMember: user.is_family_member || false });
                            setIsEditFormOpen(true);
                          }}><Pencil className="h-4 w-4" /></Button>
                          {user.id !== currentUser?.id && (
                            <Button variant="ghost" size="icon" onClick={() => confirm("Excluir usuário?") && deleteUserMutation.mutate(user.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={isEditFormOpen} onOpenChange={setIsEditFormOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Editar Usuário</DialogTitle></DialogHeader>
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit((data) => updateUserMutation.mutate(data))} className="space-y-4">
                <FormField control={editForm.control} name="fullName" render={({ field }) => (
                  <FormItem><FormLabel>Nome Completo</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editForm.control} name="isFamilyMember" render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5"><FormLabel>Membro da Família</FormLabel></div>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />
                <DialogFooter>
                  <Button type="submit" disabled={updateUserMutation.isPending}>Salvar</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}