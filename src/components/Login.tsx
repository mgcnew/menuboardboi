import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

export function Login() {
  const { signIn, signUp, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      if (isRegister) {
        await signUp(email, password);
        setError('Cadastro realizado. Aguarde aprovação ou verifique seu e-mail.');
      } else {
        await signIn(email, password);
      }
    } catch (err: any) {
      setError(err.message || 'Erro de autenticação');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Carregando sessão...</div>;

  return (
    <div className="shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="panel" style={{ maxWidth: '400px', width: '100%' }}>
        <header className="section-header" style={{ marginBottom: 'var(--space-4)' }}>
          <div>
            <h2>{isRegister ? 'Criar Conta' : 'Acesso Restrito'}</h2>
            <p>Faça login para gerenciar sua empresa.</p>
          </div>
        </header>

        <form onSubmit={handleSubmit} className="form-grid compact">
          <label>
            E-mail Corporativo
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              placeholder="admin@empresa.com.br"
            />
          </label>

          <label>
            Senha
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              placeholder="••••••••"
              minLength={6}
            />
          </label>

          {error && <div style={{ color: 'var(--text-danger)', fontSize: '0.85rem' }}>{error}</div>}

          <button type="submit" disabled={busy} style={{ marginTop: 'var(--space-2)' }}>
            {busy ? 'Aguarde...' : isRegister ? 'Registrar' : 'Entrar'}
          </button>
        </form>

        <div style={{ marginTop: 'var(--space-4)', textAlign: 'center', fontSize: '0.85rem' }}>
          <button 
            type="button" 
            className="secondary" 
            style={{ border: 'none', background: 'transparent', padding: 0 }}
            onClick={() => setIsRegister(!isRegister)}
          >
            {isRegister ? 'Já tenho uma conta' : 'Criar nova conta'}
          </button>
        </div>
      </div>
    </div>
  );
}
