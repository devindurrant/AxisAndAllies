import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { register } from '../api/auth.ts'
import { useAuthStore } from '../store/authStore.ts'
import Button from '../components/ui/Button.tsx'

export default function RegisterPage() {
  const navigate = useNavigate()
  const setUser = useAuthStore((s) => s.setUser)

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const { mutate, isPending, error } = useMutation({
    mutationFn: () => register(username, email, password),
    onSuccess: (user) => {
      setUser(user)
      navigate('/lobby', { replace: true })
    },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) return
    mutate()
  }

  const passwordMismatch = confirm.length > 0 && password !== confirm

  const errorMessage =
    error instanceof Error ? error.message : error ? 'Registration failed. Please try again.' : null

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Axis &amp; Allies</h1>
          <p className="text-gray-400">1942 Second Edition — Online</p>
        </div>

        <div className="bg-[#16213e] rounded-xl shadow-2xl p-8 border border-gray-700">
          <h2 className="text-2xl font-semibold text-white mb-6">Create Account</h2>

          {errorMessage && (
            <div className="mb-4 p-3 rounded-lg bg-red-900/40 border border-red-700 text-red-300 text-sm">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-300 mb-1">
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-[#0f3460] border border-gray-600 text-white placeholder-gray-500 focus:outline-none focus:border-usa focus:ring-1 focus:ring-usa transition"
                placeholder="CommanderStalin"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-[#0f3460] border border-gray-600 text-white placeholder-gray-500 focus:outline-none focus:border-usa focus:ring-1 focus:ring-usa transition"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-[#0f3460] border border-gray-600 text-white placeholder-gray-500 focus:outline-none focus:border-usa focus:ring-1 focus:ring-usa transition"
                placeholder="Min. 8 characters"
              />
            </div>

            <div>
              <label htmlFor="confirm" className="block text-sm font-medium text-gray-300 mb-1">
                Confirm Password
              </label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={`w-full px-4 py-2.5 rounded-lg bg-[#0f3460] border text-white placeholder-gray-500 focus:outline-none transition ${
                  passwordMismatch
                    ? 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                    : 'border-gray-600 focus:border-usa focus:ring-1 focus:ring-usa'
                }`}
                placeholder="Re-enter password"
              />
              {passwordMismatch && (
                <p className="mt-1 text-xs text-red-400">Passwords do not match.</p>
              )}
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isPending}
              disabled={passwordMismatch}
              className="w-full"
            >
              Create Account
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-400">
            Already have an account?{' '}
            <Link to="/login" className="text-usa hover:text-blue-300 font-medium transition">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
