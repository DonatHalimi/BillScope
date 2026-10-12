import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { AuthLayout } from '../layouts/AuthLayout.jsx';
import { Button } from '../components/ui/button.jsx';
import { Input } from '../components/ui/input.jsx';

const initialForm = { firstName: '', lastName: '', email: '', phone: '', password: '' };

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function update(event) {
    setForm((previous) => ({ ...previous, [event.target.name]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await register({ ...form, firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim(), phone: form.phone.trim() });
      navigate('/app', { replace: true });
    } catch (submissionError) {
      setError(submissionError.message || 'Your account could not be created. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return <AuthLayout title="Create your account" subtitle="Start with a clear view of your everyday money.">
    <form onSubmit={submit} className="space-y-4">
      {error && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-3.5 py-3 text-sm text-destructive">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="field-label" htmlFor="firstName">First name</label><Input id="firstName" name="firstName" autoComplete="given-name" placeholder="Alex" value={form.firstName} onChange={update} required maxLength={60} /></div>
        <div><label className="field-label" htmlFor="lastName">Last name</label><Input id="lastName" name="lastName" autoComplete="family-name" placeholder="Morgan" value={form.lastName} onChange={update} required maxLength={60} /></div>
      </div>
      <div><label className="field-label" htmlFor="email">Email address</label><Input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={update} required maxLength={254} /></div>
      <div><label className="field-label" htmlFor="phone">Phone number</label><Input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="+383 44 123 456" value={form.phone} onChange={update} required minLength={7} maxLength={24} pattern="\+?[0-9][0-9() .-]{5,22}" title="Enter a valid phone number." /></div>
      <div>
        <label className="field-label" htmlFor="password">Password</label>
        <div className="relative"><Input className="pr-11" id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="At least 12 characters" value={form.password} onChange={update} required minLength={12} maxLength={128} /><button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-secondary-foreground" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
        <p className="mt-1.5 text-xs text-muted-foreground">Use a unique passphrase with at least 12 characters.</p>
      </div>
      <Button className="w-full" size="lg" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating account…' : 'Create account'}<ArrowRight size={16} /></Button>
      <p className="text-center text-sm text-muted-foreground">Already have an account? <Link className="font-semibold text-primary hover:underline" to="/login">Sign in</Link></p>
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck size={14} /> Your refresh session is held in a secure HttpOnly cookie</p>
    </form>
  </AuthLayout>;
}
