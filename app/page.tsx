'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { Shield, Key, Users, Lock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Check if user is already authenticated
    const token = sessionStorage.getItem('access_token');
    if (token) {
      // Redirect to dashboard if already authenticated
      router.push('/admin');
    }
  }, [router]);

  const handleLogin = () => {
    router.push('/login');
  };

  const handleRegister = () => {
    router.push('/register');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700">
      {/* Header */}
      <header className="bg-white/10 backdrop-blur-sm border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-2">
              <Shield className="h-8 w-8 text-white" />
              <h1 className="text-2xl font-bold text-white">OAuth 2.0 Admin Center</h1>
            </div>
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                onClick={handleLogin}
                className="text-white hover:bg-white/10"
              >
                Sign In
              </Button>
              <Button onClick={handleRegister} className="bg-indigo-600 hover:bg-indigo-700">
                Get Started
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h2 className="text-5xl font-bold text-white mb-6">
            Secure Authentication & Authorization
          </h2>
          <p className="text-xl text-gray-300 mb-8 max-w-3xl mx-auto">
            A comprehensive OAuth 2.0 and OpenID Connect authorization server with enterprise-grade
            security, user management, and client administration capabilities.
          </p>
          <div className="flex justify-center space-x-4">
            <Button size="lg" onClick={handleLogin} className="bg-indigo-600 hover:bg-indigo-700">
              Access Admin Center
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={handleRegister}
              className="text-white border-white hover:bg-white/10"
            >
              Create Account
            </Button>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          <Card className="bg-white/10 backdrop-blur-sm border-white/20 text-white">
            <CardHeader>
              <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center mb-4">
                <Users className="h-6 w-6 text-white" />
              </div>
              <CardTitle>User Management</CardTitle>
              <CardDescription className="text-gray-300">
                Comprehensive user account management with role-based access control and audit
                trails.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-white/10 backdrop-blur-sm border-white/20 text-white">
            <CardHeader>
              <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center mb-4">
                <Key className="h-6 w-6 text-white" />
              </div>
              <CardTitle>OAuth 2.0 Clients</CardTitle>
              <CardDescription className="text-gray-300">
                Register and manage OAuth 2.0 client applications with PKCE, scopes, and security
                policies.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-white/10 backdrop-blur-sm border-white/20 text-white">
            <CardHeader>
              <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center mb-4">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <CardTitle>Permission Control</CardTitle>
              <CardDescription className="text-gray-300">
                Fine-grained permission management with resource-based access control and scope
                validation.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Features List */}
        <div className="bg-white/5 backdrop-blur-sm rounded-xl p-8 mb-16">
          <h3 className="text-2xl font-bold text-white mb-6 text-center">
            Enterprise-Grade Security Features
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-gray-300">OAuth 2.0 & OpenID Connect compliant</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-gray-300">PKCE (Proof Key for Code Exchange) support</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-gray-300">JWT-based client authentication</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-gray-300">Rate limiting and brute force protection</span>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-gray-300">Comprehensive audit logging</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-gray-300">Token revocation (RFC 7009)</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-gray-300">Session management with security</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-gray-300">Fine-grained scope and permission control</span>
              </div>
            </div>
          </div>
        </div>

        {/* API Endpoints */}
        <div className="bg-white/5 backdrop-blur-sm rounded-xl p-8">
          <h3 className="text-2xl font-bold text-white mb-6 text-center">OAuth 2.0 Endpoints</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div>
              <h4 className="font-semibold text-white mb-3">Core OAuth 2.0</h4>
              <div className="space-y-2 text-gray-300 font-mono">
                <div>GET /api/oauth/authorize</div>
                <div>POST /api/oauth/token</div>
                <div>POST /api/oauth/revoke</div>
                <div>GET /api/oauth/userinfo</div>
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-3">Discovery & JWKS</h4>
              <div className="space-y-2 text-gray-300 font-mono">
                <div>GET /.well-known/openid-configuration</div>
                <div>GET /.well-known/jwks.json</div>
                <div>POST /api/clients/register</div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white/5 backdrop-blur-sm border-t border-white/20 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-gray-400">
            <p>&copy; 2024 OAuth 2.0 Admin Center. Built with security and compliance in mind.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
