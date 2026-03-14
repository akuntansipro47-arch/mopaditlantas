import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export interface User {
  id: string;
  username: string;
  full_name: string;
  role: string;
  allowed_menus: string[];
}

export interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  loading: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('app_user');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        setUser(parsed);
      } catch {
        localStorage.removeItem('app_user');
      }
    }
    setLoading(false);
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc('login_user', {
        p_username: username,
        p_password: password
      });

      if (error) {
        toast.error('Login failed: ' + error.message);
        return false;
      }

      if (data && data.length > 0) {
        const result = data[0];

        if (result.success) {
          const loggedInUser: User = {
            id: result.id,
            username: result.username,
            full_name: result.full_name,
            role: result.role,
            allowed_menus: result.allowed_menus || []
          };

          setUser(loggedInUser);
          localStorage.setItem('app_user', JSON.stringify(loggedInUser));
          toast.success(`Welcome back, ${loggedInUser.full_name}!`);
          return true;
        }

        toast.error(result.message || 'Login failed');
        return false;
      }

      toast.error('Username atau Password salah');
      return false;
    } catch (err: any) {
      toast.error('Login error: ' + err.message);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('app_user');
    toast.info('Logged out successfully');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

