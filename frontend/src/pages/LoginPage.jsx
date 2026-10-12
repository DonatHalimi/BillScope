import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { AuthLayout } from '../layouts/AuthLayout.jsx';
import { Button } from '../components/ui/button.jsx';
import { Input } from '../components/ui/input.jsx';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '', rememberMe: false });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function update(event) {
    const { name, value, checked, type } = event.target;
    setForm((previous) => ({ ...previous, [name]: type === 'checkbox' ? checked : value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await login({ email: form.email.trim(), password: form.password, rememberMe: form.rememberMe });
      navigate(location.state?.from || '/app', { replace: true });
    } catch (submissionError) {
      setError(submissionError.message || 'Sign in failed. Check your details and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return <AuthLayout title="Welcome back" subtitle="Sign in to see where your money stands.">
    <form onSubmit={submit} className="space-y-5">
      {error && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-3.5 py-3 text-sm text-destructive">{error}</div>}
      <div><label className="field-label" htmlFor="email">Email address</label><Input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={update} required /></div>
      <div>
        <div className="mb-1.5 flex items-center justify-between"><label className="field-label mb-0" htmlFor="password">Password</label><span className="text-xs text-muted-foreground">12+ characters recommended</span></div>
        <div className="relative"><Input className="pr-11" id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" value={form.password} onChange={update} required /><button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-secondary-foreground" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
      </div>
      <label className="flex cursor-pointer items-center gap-2.5 text-sm text-muted-foreground"><input type="checkbox" name="rememberMe" checked={form.rememberMe} onChange={update} className="size-4 rounded border-border accent-primary" />Keep me signed in for 30 days</label>
      <Button className="w-full" size="lg" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : 'Sign in'}<ArrowRight size={16} /></Button>
      <p className="text-center text-sm text-muted-foreground">New to BillScope? <Link className="font-semibold text-primary hover:underline" to="/register">Create an account</Link></p>
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck size={14} /> Protected session · Tokens are not stored in local storage</p>
    </form>
  </AuthLayout>;
}
