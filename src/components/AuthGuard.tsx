'use client';

import { useState, useEffect, FormEvent } from 'react';

const AUTH_KEY = 'formforge_auth';
const VALID_USER = 'admin';
const VALID_PASS = 'televole';

export const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const auth = localStorage.getItem(AUTH_KEY);
    setIsAuthenticated(auth === 'true');
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (username === VALID_USER && password === VALID_PASS) {
      localStorage.setItem(AUTH_KEY, 'true');
      setIsAuthenticated(true);
      setError('');
    } else {
      setError('Invalid credentials');
    }
  };

  if (isAuthenticated === null) {
    return null;
  }

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/95 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 p-8 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
        <h2 className="text-2xl font-bold text-white mb-6 text-center">Access Required</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-2">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500 transition-colors"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button
            type="submit"
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors"
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
};
