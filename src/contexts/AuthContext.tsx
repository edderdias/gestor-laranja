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
  const navigate = useNavigate();
  const location = useLocation();

  const fetchFamilyMembers = async (userId: string) => {
    try {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, invited_by_user_id")
        .eq("id", userId)
        .maybeSingle();

      if (profileError || !profile) {
        setFamilyMemberIds([userId]);
        return;
      }

      const rootId = profile.invited_by_user_id || profile.id;

      const { data: members, error: membersError } = await supabase
        .from("profiles")
        .select("id")
        .or(`id.eq.${rootId},invited_by_user_id.eq.${rootId}`);

      if (membersError) {
        setFamilyMemberIds([userId]);
        return;
      }

      const ids = members.map(m => m.id);
      setFamilyMemberIds(ids.length > 0 ? ids : [userId]);
    } catch (error) {
      console.error("Erro ao buscar membros da família:", error);
      setFamilyMemberIds([userId]);
    }
  };

  useEffect(() => {
    // Inicializa a sessão
    const initSession = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        setSession(initialSession);
        const currentUser = initialSession?.user ?? null;
        setUser(currentUser);
        
        if (currentUser) {
          // Busca membros da família em segundo plano para não travar o loading
          fetchFamilyMembers(currentUser.id);
        }
      } catch (error) {
        console.error("Erro ao inicializar sessão:", error);
      } finally {
        setLoading(false);
      }
    };

    initSession();

    // Escuta mudanças na autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        setSession(currentSession);
        const currentUser = currentSession?.user ?? null;
        setUser(currentUser);
        
        if (currentUser) {
          fetchFamilyMembers(currentUser.id);
        } else {
          setFamilyMemberIds([]);
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
    <AuthContext.Provider value={{ user, session, loading, familyMemberIds, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}