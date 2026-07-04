import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import LogoMark from '@/components/brand/LogoMark';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="flex h-screen w-full items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.24),transparent_28%),radial-gradient(circle_at_top_right,rgba(132,204,22,0.18),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(251,191,36,0.18),transparent_24%),linear-gradient(180deg,#081223_0%,#0f172a_55%,#111827_100%)] px-4">
      <Card className="w-full max-w-sm border-sky-100/10 bg-slate-950/60 text-slate-200 shadow-2xl backdrop-blur-sm">
        <CardHeader className="space-y-4 pt-8">
          <div className="flex flex-col items-center gap-1.5">
            <LogoMark className="h-16 w-16" />
            <div className="flex flex-col items-center">
              <h1 className="text-4xl font-semibold leading-none tracking-tight">
                <span className="text-white">Oto</span>
                <span className="bg-gradient-to-r from-sky-400 via-lime-400 to-amber-400 bg-clip-text text-transparent">Smart</span>
              </h1>
              <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.2em] text-slate-400">Workshop Control System</p>
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
                className="border-slate-700 bg-slate-900/80 text-slate-200 placeholder:text-slate-600 focus:ring-sky-400"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-300">Password</Label>
              <div className="relative">
                <Input 
                  id="password" 
                  type={showPassword ? 'text' : 'password'} 
                  placeholder="******" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="border-slate-700 bg-slate-900/80 text-slate-200 placeholder:text-slate-600 focus:ring-sky-400 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button className="w-full bg-gradient-to-r from-sky-500 via-cyan-500 to-lime-500 text-white font-semibold shadow-lg shadow-sky-950/30 hover:from-sky-600 hover:via-cyan-600 hover:to-lime-600" type="submit" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Sign In'}
            </Button>
            <div className="text-center text-xs text-slate-400">
              Built and developed by <span className="font-semibold text-slate-200">B.E.I Team+</span>{' '}
              <a
                href="https://bintangelanginovasi.tech"
                target="_blank"
                rel="noreferrer"
                className="text-sky-400 hover:text-cyan-300 underline underline-offset-2"
              >
                bintangelanginovasi.tech
              </a>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
