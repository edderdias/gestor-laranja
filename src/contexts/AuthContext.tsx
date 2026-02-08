import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useLocation } from "react-router-dom";

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

  const fetchFamilyData = useCallback(async (userId: string) => {
    if (!userId) return;
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, family_id")
        .eq("id", userId)
        .maybeSingle();

      if (!profile?.family_id) {
        setFamilyMemberIds([userId]);
        setFamilyData({ id: null, name: null, ownerId: null, code: null });
        return;
      }

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

        // Tenta buscar membros. Se falhar por RLS, ao menos o próprio usuário é incluído.
        const { data: members } = await supabase
          .from("profiles")
          .select("id")
          .eq("family_id", family.id);

        if (members && members.length > 0) {
          setFamilyMemberIds(members.map(m => m.id));
        } else {
          setFamilyMemberIds([userId]);
        }
      } else {
        setFamilyMemberIds([userId]);
      }
    } catch (error) {
      console.error("Erro ao buscar dados da família:", error);
      setFamilyMemberIds([userId]);
    }
  }, []);

  const refreshFamily = useCallback(async () => {
    if (user) await fetchFamilyData(user.id);
  }, [user, fetchFamilyData]);

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        if (!mounted) return;

        if (initialSession) {
          setSession(initialSession);
          setUser(initialSession.user);
          fetchFamilyData(initialSession.user.id);
          if (location.pathname === '/auth' || location.pathname === '/') {
            navigate('/dashboard', { replace: true });
          }
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initialize();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!mounted) return;
      const currentUser = currentSession?.user ?? null;
      setSession(currentSession);
      setUser(currentUser);

      if (currentUser) {
        fetchFamilyData(currentUser.id);
        if (location.pathname === '/auth') {
          navigate('/dashboard', { replace: true });
        }
      } else {
        setFamilyMemberIds([]);
        setFamilyData({ id: null, name: null, ownerId: null, code: null });
        if (location.pathname !== '/auth') {
          navigate('/auth', { replace: true });
        }
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchFamilyData]);

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
  };

  const signOut = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
    } finally {
      setLoading(false);
      navigate('/auth', { replace: true });
    }
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