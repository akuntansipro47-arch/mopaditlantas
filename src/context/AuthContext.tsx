import { createContext, useContext, useEffect, useState } from 'react';
import { SUPABASE_URL, supabase } from '@/lib/supabase';
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

const DEMO_USERNAME = 'demo';
const DEMO_PASSWORD = 'demo123';

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
        if (String(parsed.role || '').toUpperCase() === 'DEMO') {
          localStorage.setItem('demo_mode', '1');
        }
      } catch {
        localStorage.removeItem('app_user');
      }
    }
    setLoading(false);
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      if (String(username || '').trim().toLowerCase() === DEMO_USERNAME && String(password || '') === DEMO_PASSWORD) {
        const loggedInUser: User = {
          id: 'demo',
          username: DEMO_USERNAME,
          full_name: 'Demo',
          role: 'DEMO',
          allowed_menus: ['*'],
        };
        setUser(loggedInUser);
        localStorage.setItem('app_user', JSON.stringify(loggedInUser));
        localStorage.setItem('demo_mode', '1');
        toast.success('Masuk Demo Mode');
        return true;
      }

      const isNetworkMsg = (msg: string) => {
        const m = String(msg || '').toLowerCase();
        return m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed');
      };

      let result: { data: any; error: any } | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        // eslint-disable-next-line no-await-in-loop
        result = await supabase.rpc('login_user', {
          p_username: username,
          p_password: password,
        });
        if (!result?.error) break;
        if (!isNetworkMsg(result.error?.message)) break;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }

      const { data, error } = result || { data: null, error: null };

      if (error) {
        void logActivity({
          user_id: null,
          username,
          role: null,
          action: 'LOGIN_FAILED',
          module: 'AUTH',
          details: error.message,
        });
        if (isNetworkMsg(error.message)) {
          console.error('Login network error:', error);
          toast.error(`Login gagal: tidak bisa terhubung ke server. Cek koneksi internet / URL Supabase (${SUPABASE_URL}).`);
        } else {
          toast.error('Login failed: ' + error.message);
        }
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
      const msg = String(err?.message || err);
      if (msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('networkerror') || msg.toLowerCase().includes('load failed')) {
        console.error('Login network error:', err);
        toast.error(`Login gagal: tidak bisa terhubung ke server. Cek koneksi internet / URL Supabase (${SUPABASE_URL}).`);
      } else {
        toast.error('Login error: ' + msg);
      }
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
    localStorage.removeItem('demo_mode');
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
