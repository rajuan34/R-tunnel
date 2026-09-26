import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { ContactModal } from './components/ContactModal';
import { HomePage } from './pages/HomePage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { DocsPage } from './pages/DocsPage';
import { SystemStats, AuthState } from './types';

export const App: React.FC = () => {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const p = window.location.pathname;
      return p === '/dashboard' || p === '/login' || p === '/docs' ? p : '/';
    }
    return '/';
  });

  const [isContactOpen, setIsContactOpen] = useState(false);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [auth, setAuth] = useState<AuthState>({
    authenticated: false,
    checked: false,
  });

  // Check auth
  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAuth({
          authenticated: data.authenticated,
          username: data.username,
          role: data.role,
          checked: true,
        });
      } else {
        setAuth({ authenticated: false, checked: true });
      }
    } catch (e) {
      setAuth({ authenticated: false, checked: true });
    }
  }, []);

  // Fetch initial stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/public-stats', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      // quiet error
    }
  }, []);

  useEffect(() => {
    checkAuth();
    fetchStats();

    const handlePopState = () => {
      const p = window.location.pathname;
      setCurrentPath(p === '/dashboard' || p === '/login' || p === '/docs' ? p : '/');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [checkAuth, fetchStats]);

  const handleNavigate = (path: string) => {
    if (path !== currentPath) {
      window.history.pushState({}, '', path);
      setCurrentPath(path);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      setAuth({ authenticated: false, checked: true });
      handleNavigate('/');
    } catch (e) {
      setAuth({ authenticated: false, checked: true });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#070b14] text-slate-100 font-sans antialiased selection:bg-indigo-500 selection:text-white">
      {/* Top Navbar */}
      <Navbar
        currentPath={currentPath}
        onNavigate={handleNavigate}
        onOpenContact={() => setIsContactOpen(true)}
        isAuthenticated={auth.authenticated}
        onLogout={handleLogout}
        activeTunnelCount={stats?.activeTunnels || 0}
      />

      {/* Main View Router */}
      <main className="flex-1 flex flex-col">
        {currentPath === '/' && (
          <HomePage
            onNavigate={handleNavigate}
            onOpenContact={() => setIsContactOpen(true)}
            stats={stats}
          />
        )}

        {currentPath === '/dashboard' && (
          <DashboardPage
            onNavigate={handleNavigate}
            onOpenContact={() => setIsContactOpen(true)}
            isAuthenticated={auth.authenticated}
          />
        )}

        {currentPath === '/login' && (
          <LoginPage
            onNavigate={handleNavigate}
            onOpenContact={() => setIsContactOpen(true)}
            onLoginSuccess={() => {
              checkAuth();
              handleNavigate('/dashboard');
            }}
          />
        )}

        {currentPath === '/docs' && (
          <DocsPage
            onNavigate={handleNavigate}
            onOpenContact={() => setIsContactOpen(true)}
          />
        )}
      </main>

      {/* Footer with Mandatory Copyright */}
      <Footer
        onNavigate={handleNavigate}
        onOpenContact={() => setIsContactOpen(true)}
      />

      {/* Contact Developer Modal */}
      <ContactModal
        isOpen={isContactOpen}
        onClose={() => setIsContactOpen(false)}
      />
    </div>
  );
};
