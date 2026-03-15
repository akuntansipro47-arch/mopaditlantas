import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import LogoMark from '@/components/brand/LogoMark';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const success = await login(username, password);
    setLoading(false);
    if (success) {
      navigate('/');
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-900 px-4">
      <Card className="w-full max-w-sm border-slate-800 bg-slate-950/50 text-slate-200">
        <CardHeader className="space-y-4 pt-8">
          <div className="flex flex-col items-center gap-1.5">
            <LogoMark className="h-16 w-16 text-white" />
            <div className="flex flex-col items-center -mt-1">
              <h1 className="text-5xl font-black tracking-tighter leading-none flex items-baseline">
                <span className="text-white italic">Oto</span>
                <span className="text-lime-500 italic">Smart</span>
              </h1>
              <p className="text-[10px] text-slate-400 font-medium tracking-[0.2em] uppercase mt-1">Complete Control Smart System</p>
            </div>
          </div>
          <CardTitle className="text-center text-slate-200 mt-6">Sign In</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-slate-300">Username</Label>
              <Input 
                id="username" 
                placeholder="admin26" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-600 focus:ring-lime-500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-300">Password</Label>
              <Input 
                id="password" 
                type="password" 
                placeholder="******" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-600 focus:ring-lime-500"
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full bg-lime-600 hover:bg-lime-700 text-white font-semibold" type="submit" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Sign In'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
