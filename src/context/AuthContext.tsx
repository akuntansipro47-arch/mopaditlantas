import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { logActivity } from '@/lib/activityLog';

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

function normalizeAllowedMenus(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((v) => String(v).trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('app_user');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        setUser({
          id: parsed.id,
          username: parsed.username,
          full_name: parsed.full_name,
          role: parsed.role,
          allowed_menus: normalizeAllowedMenus(parsed.allowed_menus),
        });
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
        void logActivity({
          user_id: null,
          username,
          role: null,
          action: 'LOGIN_FAILED',
          module: 'AUTH',
          details: error.message,
        });
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
            allowed_menus: normalizeAllowedMenus(result.allowed_menus)
          };

          setUser(loggedInUser);
          localStorage.setItem('app_user', JSON.stringify(loggedInUser));
          void logActivity({
            user_id: loggedInUser.id,
            username: loggedInUser.username,
            role: loggedInUser.role,
            action: 'LOGIN_SUCCESS',
            module: 'AUTH',
          });
          toast.success(`Welcome back, ${loggedInUser.full_name}!`);
          return true;
        }

        void logActivity({
          user_id: null,
          username,
          role: null,
          action: 'LOGIN_FAILED',
          module: 'AUTH',
          details: String(result.message || 'Login failed'),
        });
        toast.error(result.message || 'Login failed');
        return false;
      }

      void logActivity({
        user_id: null,
        username,
        role: null,
        action: 'LOGIN_FAILED',
        module: 'AUTH',
        details: 'Invalid response from server',
      });
      toast.error('Invalid response from server');
      return false;
    } catch (err: any) {
      void logActivity({
        user_id: null,
        username,
        role: null,
        action: 'LOGIN_FAILED',
        module: 'AUTH',
        details: String(err?.message || err),
      });
      toast.error('Login error: ' + err.message);
      return false;
    }
  };

  const logout = () => {
    if (user) {
      void logActivity({
        user_id: user.id,
        username: user.username,
        role: user.role,
        action: 'LOGOUT',
        module: 'AUTH',
      });
    }
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
