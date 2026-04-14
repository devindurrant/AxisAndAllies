import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMe } from '../api/auth.ts'
import { useAuthStore } from '../store/authStore.ts'
import type { User } from '../types.ts'

interface UseAuthReturn {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
}

export function useAuth(): UseAuthReturn {
  const { user, setUser, setLoading } = useAuthStore()

  const { data, isLoading: queryLoading, isError } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: getMe,
    retry: false,
    staleTime: 5 * 60_000,
  })

  useEffect(() => {
    setLoading(queryLoading)
  }, [queryLoading, setLoading])

  useEffect(() => {
    if (data) {
      setUser(data)
    } else if (isError) {
      setUser(null)
    }
  }, [data, isError, setUser])

  return {
    user,
    isLoading: queryLoading,
    isAuthenticated: user !== null,
  }
}
