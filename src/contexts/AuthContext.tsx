import { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  familyMemberIds: string[];
  familyData: { name: string | null; rootId: string | null };
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshFamily: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [familyMemberIds, setFamilyMemberIds] = useState<string[]>([]);
  const [familyData, setFamilyData] = useState<{ name: string | null; rootId: string | null }>({ name: null, rootId: null });
  const navigate = useNavigate();
  const location = useLocation();

  const fetchFamilyMembers = async (userId: string) => {
    try {
      // Busca o perfil do usuário atual
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, invited_by_user_id, is_family_member")
        .eq("id", userId)
        .maybeSingle();

      // Se não houver perfil ou erro, o usuário está sozinho
      if (profileError || !profile) {
        setFamilyMemberIds([userId]);
        setFamilyData({ name: null, rootId: userId });
        return;
      }

      // Define quem é o "dono" da família (o próprio ou quem o convidou)
      const rootId = profile.invited_by_user_id || profile.id;
      
      // Busca o nome da família no perfil do root
      const { data: rootProfile } = await supabase
        .from("profiles")
        .select("family_name")
        .eq("id", rootId)
        .maybeSingle();

      setFamilyData({ name: rootProfile?.family_name || null, rootId });

      // Se o usuário NÃO for membro da família (e não for o root), ele só vê os próprios dados
      if (!profile.is_family_member && profile.invited_by_user_id) {
        setFamilyMemberIds([userId]);
        return;
      }

      // Busca todos os membros vinculados ao root
      const { data: members, error: membersError } = await supabase
        .from("profiles")
        .select("id, is_family_member")
        .or(`id.eq.${rootId},invited_by_user_id.eq.${rootId}`);

      if (membersError || !members) {
        setFamilyMemberIds([userId]);
        return;
      }

      // Filtra IDs: inclui o root, o próprio usuário, e outros que aceitaram ser membros da família
      const ids = members
        .filter(m => m.id === rootId || m.id === userId || m.is_family_member)
        .map(m => m.id);

      setFamilyMemberIds(ids.length > 0 ? ids : [userId]);
    } catch (error) {
      console.error("Erro ao processar membros da família:", error);
      setFamilyMemberIds([userId]);
    }
  };

  const refreshFamily = async () => {
    if (user) await fetchFamilyMembers(user.id);
  };

  useEffect(() => {
    const initSession = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        setSession(initialSession);
        const currentUser = initialSession?.user ?? null;
        setUser(currentUser);
        
        if (currentUser) {
          await fetchFamilyMembers(currentUser.id);
        }
      } catch (error) {
        console.error("Erro na inicialização:", error);
      } finally {
        setLoading(false);
      }
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        setSession(currentSession);
        const currentUser = currentSession?.user ?? null;
        setUser(currentUser);
        
        if (currentUser) {
          await fetchFamilyMembers(currentUser.id);
        } else {
          setFamilyMemberIds([]);
          setFamilyData({ name: null, rootId: null });
        }

        if (event === 'SIGNED_IN' && location.pathname === '/auth') {
          navigate('/dashboard');
        }
        if (event === 'SIGNED_OUT') {
          navigate('/auth');
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate, location.pathname]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    });
    if (error) throw error;
    toast.success("Cadastro realizado! Verifique seu e-mail.");
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, familyMemberIds, familyData, signIn, signUp, signOut, refreshFamily }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}