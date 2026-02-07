import { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  familyMemberIds: string[];
  isFamilySchemaReady: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [familyMemberIds, setFamilyMemberIds] = useState<string[]>([]);
  const [isFamilySchemaReady, setIsFamilySchemaReady] = useState(true);
  const navigate = useNavigate();

  const fetchFamilyMembers = async (userId: string) => {
    try {
      // Tentamos buscar o perfil. Se a coluna family_id não existir, o Supabase retornará erro 42703
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (profileError) {
        if (profileError.code === '42703') { // Coluna não existe
          setIsFamilySchemaReady(false);
        }
        throw profileError;
      }

      // Lógica de fallback: family_id -> invited_by_user_id -> id próprio
      const rootId = profile.family_id || profile.invited_by_user_id || profile.id;

      const { data: members, error: membersError } = await supabase
        .from("profiles")
        .select("id")
        .or(`family_id.eq.${rootId},id.eq.${rootId},invited_by_user_id.eq.${rootId}`);

      if (membersError) throw membersError;

      const ids = members.map(m => m.id);
      setFamilyMemberIds(ids.length > 0 ? ids : [userId]);
      setIsFamilySchemaReady(true);
    } catch (error) {
      console.error("Erro ao buscar membros da família:", error);
      setFamilyMemberIds([userId]);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          await fetchFamilyMembers(session.user.id);
        } else {
          setFamilyMemberIds([]);
        }

        if (event === 'SIGNED_IN') {
          navigate('/dashboard');
        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchFamilyMembers(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error(error.message || "Erro ao fazer login");
      } else {
        toast.success("Login realizado com sucesso!");
      }
    } catch (error: any) {
      toast.error(error.message || "Erro inesperado ao fazer login");
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName }
        }
      });

      if (error) {
        toast.error(error.message || "Erro ao criar conta");
      } else {
        toast.success("Cadastro realizado com sucesso!");
      }
    } catch (error: any) {
      toast.error(error.message || "Erro inesperado ao criar conta");
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error: any) {
      console.error("Logout error:", error);
    } finally {
      setSession(null);
      setUser(null);
      setFamilyMemberIds([]);
      navigate('/auth');
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, familyMemberIds, isFamilySchemaReady, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}