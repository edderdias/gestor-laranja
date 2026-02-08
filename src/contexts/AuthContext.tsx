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
  familyData: { id: string | null; name: string | null; ownerId: string | null; code: string | null };
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
  const [familyData, setFamilyData] = useState<{ id: string | null; name: string | null; ownerId: string | null; code: string | null }>({ id: null, name: null, ownerId: null, code: null });
  const navigate = useNavigate();
  const location = useLocation();

  const fetchFamilyData = async (userId: string) => {
    if (!userId) return;
    try {
      // 1. Buscar o perfil do usuário para ver se ele tem um family_id
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, family_id")
        .eq("id", userId)
        .maybeSingle();

      if (!profile?.family_id) {
        // Se não tem família, ele vê apenas os próprios dados
        setFamilyMemberIds([userId]);
        setFamilyData({ id: null, name: null, ownerId: null, code: null });
        return;
      }

      // 2. Buscar dados da família
      const { data: family } = await supabase
        .from("families")
        .select("*")
        .eq("id", profile.family_id)
        .maybeSingle();

      if (family) {
        setFamilyData({
          id: family.id,
          name: family.name,
          ownerId: family.owner_id,
          code: family.code
        });

        // 3. Buscar todos os membros dessa família
        const { data: members } = await supabase
          .from("profiles")
          .select("id")
          .eq("family_id", family.id);

        if (members) {
          setFamilyMemberIds(members.map(m => m.id));
        }
      } else {
        setFamilyMemberIds([userId]);
      }
    } catch (error) {
      console.error("Erro ao buscar dados da família:", error);
      setFamilyMemberIds([userId]);
    }
  };

  const refreshFamily = async () => {
    if (user) await fetchFamilyData(user.id);
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        setSession(initialSession);
        const currentUser = initialSession?.user ?? null;
        setUser(currentUser);
        
        if (currentUser) {
          fetchFamilyData(currentUser.id);
        }
      } catch (e) {
        console.error("Erro auth:", e);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        setSession(currentSession);
        const currentUser = currentSession?.user ?? null;
        setUser(currentUser);
        
        if (currentUser) {
          fetchFamilyData(currentUser.id);
          if (location.pathname === '/auth') {
            navigate('/dashboard');
          }
        } else {
          setFamilyMemberIds([]);
          setFamilyData({ id: null, name: null, ownerId: null, code: null });
          if (location.pathname !== '/auth') {
            navigate('/auth');
          }
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

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