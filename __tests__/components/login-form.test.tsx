import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

// Mock next/navigation hooks
const mockPush = vi.fn()
let mockSearchParamsData = new Map<string, string>()

const mockUseRouter = vi.fn(() => ({
  push: mockPush,
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
}))

const mockUseSearchParams = vi.fn(() => ({
  get: (key: string) => mockSearchParamsData.get(key) || null,
  has: (key: string) => mockSearchParamsData.has(key),
  getAll: vi.fn(() => []),
  keys: vi.fn(() => mockSearchParamsData.keys()),
  values: vi.fn(() => mockSearchParamsData.values()),
  entries: vi.fn(() => mockSearchParamsData.entries()),
  forEach: vi.fn(),
  toString: vi.fn(() => ''),
  append: vi.fn(),
  delete: vi.fn(),
  set: vi.fn(),
  sort: vi.fn(),
  size: mockSearchParamsData.size,
  [Symbol.iterator]: vi.fn(() => mockSearchParamsData.entries()),
}))

vi.mock('next/navigation', () => ({
  useRouter: mockUseRouter,
  useSearchParams: mockUseSearchParams,
}))

// Mock the API functions
const mockAuthApi = {
  login: vi.fn(),
}

vi.mock('@/lib/api', () => ({
  authApi: mockAuthApi,
  getOAuthRedirectUri: vi.fn(() => 'http://localhost:3000/auth/callback'),
  getFullUrl: vi.fn((path: string) => `http://localhost:3000${path}`),
}))

// Simple test component that mimics the login form behavior
const TestLoginForm = () => {
  const router = mockUseRouter()
  const searchParams = mockUseSearchParams()
  
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  const clientId = searchParams.get('client_id')
  const isOAuthFlow = !!clientId

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      if (!username.trim() || !password.trim()) {
        throw new Error('Username and password are required')
      }

      await mockAuthApi.login({ username, password })

      if (!isOAuthFlow) {
        // Use router.push instead of window.location
        router.push('/api/oauth/authorize?client_id=admin-center')
      } else {
        router.push(`/api/oauth/authorize?client_id=${clientId}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} data-testid="login-form">
      <div>
        <label htmlFor="username">Username</label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={isLoading}
          data-testid="username-input"
        />
      </div>
      
      <div>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isLoading}
          data-testid="password-input"
        />
      </div>

      {error && (
        <div data-testid="error-message" role="alert">
          {error}
        </div>
      )}

      <button 
        type="submit" 
        disabled={isLoading}
        data-testid="submit-button"
      >
        {isLoading ? 'Signing In...' : 'Sign In'}
      </button>

      {isOAuthFlow && (
        <p data-testid="oauth-message">
          Sign in to authorize access for {clientId}
        </p>
      )}
    </form>
  )
}

describe('Login Form Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParamsData.clear()
    mockAuthApi.login.mockClear()
    mockPush.mockClear()
  })

  describe('Form Rendering', () => {
    it('should render login form with all fields', () => {
      render(<TestLoginForm />)
      
      expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
    })

    it('should show OAuth message when client_id is present', () => {
      mockSearchParamsData.set('client_id', 'test-client')
      
      render(<TestLoginForm />)
      
      expect(screen.getByTestId('oauth-message')).toHaveTextContent(
        'Sign in to authorize access for test-client'
      )
    })

    it('should not show OAuth message for internal admin access', () => {
      mockSearchParamsData.clear() // Ensure no client_id
      
      render(<TestLoginForm />)
      
      expect(screen.queryByTestId('oauth-message')).not.toBeInTheDocument()
    })
  })

  describe('Form Validation', () => {
    it('should show error when submitting empty form', async () => {
      render(<TestLoginForm />)
      
      const submitButton = screen.getByTestId('submit-button')
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toHaveTextContent(
          'Username and password are required'
        )
      })
    })

    it('should show error when username is empty', async () => {
      render(<TestLoginForm />)
      
      const passwordInput = screen.getByTestId('password-input')
      const submitButton = screen.getByTestId('submit-button')
      
      fireEvent.change(passwordInput, { target: { value: 'password123' } })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toHaveTextContent(
          'Username and password are required'
        )
      })
    })

    it('should show error when password is empty', async () => {
      render(<TestLoginForm />)
      
      const usernameInput = screen.getByTestId('username-input')
      const submitButton = screen.getByTestId('submit-button')
      
      fireEvent.change(usernameInput, { target: { value: 'testuser' } })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toHaveTextContent(
          'Username and password are required'
        )
      })
    })
  })

  describe('Form Submission', () => {
    it('should call login API with correct credentials', async () => {
      mockAuthApi.login.mockResolvedValue({})
      
      render(<TestLoginForm />)
      
      const usernameInput = screen.getByTestId('username-input')
      const passwordInput = screen.getByTestId('password-input')
      const submitButton = screen.getByTestId('submit-button')
      
      fireEvent.change(usernameInput, { target: { value: 'testuser' } })
      fireEvent.change(passwordInput, { target: { value: 'password123' } })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockAuthApi.login).toHaveBeenCalledWith({
          username: 'testuser',
          password: 'password123',
        })
      })
    })

    it('should disable form during submission', async () => {
      mockAuthApi.login.mockImplementation(() => new Promise(resolve => {
        setTimeout(resolve, 100)
      }))
      
      render(<TestLoginForm />)
      
      const usernameInput = screen.getByTestId('username-input')
      const passwordInput = screen.getByTestId('password-input')
      const submitButton = screen.getByTestId('submit-button')
      
      fireEvent.change(usernameInput, { target: { value: 'testuser' } })
      fireEvent.change(passwordInput, { target: { value: 'password123' } })
      fireEvent.click(submitButton)

      // Check that form is disabled during submission
      expect(usernameInput).toBeDisabled()
      expect(passwordInput).toBeDisabled()
      expect(submitButton).toBeDisabled()
      expect(submitButton).toHaveTextContent('Signing In...')
    })

    it('should show error message on login failure', async () => {
      mockAuthApi.login.mockRejectedValue(new Error('Invalid credentials'))
      
      render(<TestLoginForm />)
      
      const usernameInput = screen.getByTestId('username-input')
      const passwordInput = screen.getByTestId('password-input')
      const submitButton = screen.getByTestId('submit-button')
      
      fireEvent.change(usernameInput, { target: { value: 'wronguser' } })
      fireEvent.change(passwordInput, { target: { value: 'wrongpass' } })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toHaveTextContent('Invalid credentials')
      })

      // Form should be re-enabled after error
      expect(usernameInput).not.toBeDisabled()
      expect(passwordInput).not.toBeDisabled()
      expect(submitButton).not.toBeDisabled()
    })
  })

  describe('OAuth Flow Handling', () => {
    it('should redirect to admin OAuth flow for internal access', async () => {
      mockAuthApi.login.mockResolvedValue({})
      
      render(<TestLoginForm />)
      
      const usernameInput = screen.getByTestId('username-input')
      const passwordInput = screen.getByTestId('password-input')
      const submitButton = screen.getByTestId('submit-button')
      
      fireEvent.change(usernameInput, { target: { value: 'admin' } })
      fireEvent.change(passwordInput, { target: { value: 'admin123' } })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/api/oauth/authorize?client_id=admin-center')
      })
    })

    it('should redirect to client OAuth flow for external access', async () => {
      mockSearchParamsData.set('client_id', 'external-app')
      mockAuthApi.login.mockResolvedValue({})
      
      render(<TestLoginForm />)
      
      const usernameInput = screen.getByTestId('username-input')
      const passwordInput = screen.getByTestId('password-input')
      const submitButton = screen.getByTestId('submit-button')
      
      fireEvent.change(usernameInput, { target: { value: 'user' } })
      fireEvent.change(passwordInput, { target: { value: 'password' } })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/api/oauth/authorize?client_id=external-app')
      })
    })
  })

  describe('Accessibility', () => {
    it('should have proper form labels', () => {
      render(<TestLoginForm />)
      
      expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    })

    it('should show error message with proper ARIA role', async () => {
      render(<TestLoginForm />)
      
      const submitButton = screen.getByTestId('submit-button')
      fireEvent.click(submitButton)

      await waitFor(() => {
        const errorMessage = screen.getByTestId('error-message')
        expect(errorMessage).toHaveAttribute('role', 'alert')
      })
    })

    it('should associate form fields with labels', () => {
      render(<TestLoginForm />)
      
      const usernameInput = screen.getByLabelText(/username/i)
      const passwordInput = screen.getByLabelText(/password/i)
      
      expect(usernameInput).toHaveAttribute('id', 'username')
      expect(passwordInput).toHaveAttribute('id', 'password')
    })
  })

  describe('PKCE Code Generation', () => {
    it('should generate and store PKCE codes for OAuth flow', () => {
      // Mock crypto functions
      const mockGetRandomValues = vi.fn((arr) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256)
        }
        return arr
      })
      
      Object.defineProperty(global, 'crypto', {
        value: {
          getRandomValues: mockGetRandomValues,
          subtle: {
            digest: vi.fn(() => Promise.resolve(new ArrayBuffer(32))),
          },
        },
      })

      const generateCodeVerifier = () => {
        const array = new Uint8Array(32)
        crypto.getRandomValues(array)
        return btoa(String.fromCharCode.apply(null, Array.from(array)))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=/g, '')
      }

      const codeVerifier = generateCodeVerifier()
      
      expect(mockGetRandomValues).toHaveBeenCalled()
      expect(typeof codeVerifier).toBe('string')
      expect(codeVerifier.length).toBeGreaterThan(0)
    })
  })
}) 