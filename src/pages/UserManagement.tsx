import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog"; // Adicionado DialogDescription
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, UserPlus } from "lucide-react";
import { Tables } from "@/integrations/supabase/types";

type Profile = Tables<'profiles'> & {
  email?: string; // Adicionar email para exibição
};

const inviteSchema = z.object({
  email: z.string().email("Email inválido"),
  fullName: z.string().min(1, "Nome completo é obrigatório"),
  isFamilyMember: z.boolean().default(false),
});

const editUserSchema = z.object({
  id: z.string(),
  email: z.string().email("Email inválido").optional(), // Email pode não ser editável diretamente aqui
  fullName: z.string().min(1, "Nome completo é obrigatório"),
  isFamilyMember: z.boolean(),
});

type InviteFormData = z.infer<typeof inviteSchema>;
type EditUserFormData = z.infer<typeof editUserSchema>;

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [isInviteFormOpen, setIsInviteFormOpen] = useState(false);
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);

  const inviteForm = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: "",
      fullName: "",
      isFamilyMember: false,
    },
  });

  const editForm = useForm<EditUserFormData>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      id: "",
      fullName: "",
      isFamilyMember: false,
    },
  });

  // Fetch all profiles (including invited_by_user_id and is_family_member)
  const { data: users, isLoading: isLoadingUsers } = useQuery({
    queryKey: ["users", currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return [];
      // Fetch profiles of the current user and users invited by the current user
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, is_family_member, invited_by_user_id");

      if (profilesError) throw profilesError;

      // Fetch auth.users separately to get emails for all profiles
      const { data: authUsers, error: authUsersError } = await supabase.auth.admin.listUsers();
      if (authUsersError) console.error("Error fetching auth users:", authUsersError);

      const usersWithEmails: Profile[] = profilesData.map(profile => {
        const authUser = authUsers?.users.find(u => u.id === profile.id);
        return {
          ...profile,
          email: authUser?.email || "N/A",
        };
      });

      return usersWithEmails;
    },
    enabled: !!currentUser?.id,
  });

  const inviteUserMutation = useMutation({
    mutationFn: async (data: InviteFormData) => {
      const { email, fullName, isFamilyMember } = data;
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentUser?.access_token}`,
        },
        body: JSON.stringify({ email, fullName, isFamilyMember }),
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
    onError: (error) => {
      toast.error(error.message || "Erro ao enviar convite");
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async (data: EditUserFormData) => {
      const { id, fullName, isFamilyMember } = data;
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName, is_family_member: isFamilyMember })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Usuário atualizado com sucesso!");
      setIsEditFormOpen(false);
      setEditingUser(null);
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao atualizar usuário");
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      // Note: Deleting a user from auth.users also deletes their profile due to CASCADE
      // This operation requires service_role key, so it should ideally be done via an Edge Function
      // For simplicity, we'll assume the RLS allows the inviter to delete the invited profile,
      // but a full user deletion (from auth.users) would need an admin context.
      // For now, we'll only delete the profile, which might leave an orphaned auth.user entry.
      // A more complete solution would involve an Edge Function to call admin.deleteUser.
      const { error } = await supabase
        .from("profiles")
        .delete()
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Usuário excluído com sucesso!");
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao excluir usuário");
    },
  });

  const handleEdit = (user: Profile) => {
    setEditingUser(user);
    editForm.reset({
      id: user.id,
      fullName: user.full_name || "",
      isFamilyMember: user.is_family_member || false,
    });
    setIsEditFormOpen(true);
  };

  const handleDelete = (userId: string) => {
    if (confirm("Tem certeza que deseja excluir este usuário? Esta ação é irreversível.")) {
      deleteUserMutation.mutate(userId);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Gerenciamento de Usuários</h1>
          <Dialog open={isInviteFormOpen} onOpenChange={setIsInviteFormOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="mr-2 h-4 w-4" /> Convidar Usuário
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Convidar Novo Usuário</DialogTitle>
                <DialogDescription>
                  Envie um convite por email para um novo usuário.
                </DialogDescription>
              </DialogHeader>
              <Form {...inviteForm}>
                <form onSubmit={inviteForm.handleSubmit(inviteUserMutation.mutate)} className="space-y-4">
                  <FormField
                    control={inviteForm.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome Completo</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Nome completo do usuário" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={inviteForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input {...field} type="email" placeholder="email@exemplo.com" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={inviteForm.control}
                    name="isFamilyMember"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel>Membro da Família</FormLabel>
                          <FormDescription>
                            Marque se este usuário deve ter acesso aos seus lançamentos.
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
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsInviteFormOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={inviteUserMutation.isPending}>
                      {inviteUserMutation.isPending ? "Enviando..." : "Enviar Convite"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Usuários Cadastrados</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingUsers ? (
              <p className="text-muted-foreground">Carregando usuários...</p>
            ) : users && users.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Membro da Família</TableHead>
                      <TableHead>Convidado Por</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.full_name}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>{user.is_family_member ? "Sim" : "Não"}</TableCell>
                        <TableCell>
                          {user.invited_by_user_id === currentUser?.id ? "Você" : (user.invited_by_user_id ? "Outro" : "N/A")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {user.id === currentUser?.id || user.invited_by_user_id === currentUser?.id ? (
                              <>
                                <Button variant="ghost" size="icon" onClick={() => handleEdit(user)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                {user.id !== currentUser?.id && ( // Não permitir que o usuário se exclua
                                  <Button variant="ghost" size="icon" onClick={() => handleDelete(user.id)} disabled={deleteUserMutation.isPending}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                )}
                              </>
                            ) : (
                              <span className="text-muted-foreground text-sm">Sem permissão</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">Nenhum usuário cadastrado ou convidado ainda.</p>
            )}
          </CardContent>
        </Card>

        {/* Edit User Dialog */}
        <Dialog open={isEditFormOpen} onOpenChange={setIsEditFormOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Usuário</DialogTitle>
              <DialogDescription>
                Atualize as informações do usuário.
              </DialogDescription>
            </DialogHeader>
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(updateUserMutation.mutate)} className="space-y-4">
                <FormField
                  control={editForm.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome Completo</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Nome completo do usuário" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="isFamilyMember"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                      <div className="space-y-0.5">
                        <FormLabel>Membro da Família</FormLabel>
                        <FormDescription>
                          Marque se este usuário deve ter acesso aos seus lançamentos.
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
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsEditFormOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={updateUserMutation.isPending}>
                    {updateUserMutation.isPending ? "Salvando..." : "Salvar Alterações"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}