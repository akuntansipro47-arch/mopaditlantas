import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export interface User {
  id: string;
  username: string;
  full_name: string;
  role: string;
  allowed_menus: string[];
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check local storage for persistent login
    const storedUser = localStorage.getItem('app_user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
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
        console.error('Login RPC Error:', error);
        toast.error('Login failed: ' + error.message);
        return false;
      }

      // data is returned as an array of rows
      if (data && data.length > 0 && data[0].success) {
         const userData = data[0];
         const loggedInUser: User = {
           id: userData.id,
           username: userData.username,
           full_name: userData.full_name,
           role: userData.role,
           allowed_menus: userData.allowed_menus || []
         };
         
         setUser(loggedInUser);
         localStorage.setItem('app_user', JSON.stringify(loggedInUser));
         toast.success(`Welcome back, ${loggedInUser.full_name}!`);
         return true;
      } else {
         toast.error('Username atau Password salah');
         return false;
      }

    } catch (error: any) {
      toast.error(error.message);
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
