import apiClient from './client.ts'
import type { User } from '../types.ts'

export async function login(email: string, password: string): Promise<User> {
  const { data } = await apiClient.post<{ user: User }>('/auth/login', { email, password })
  return data.user
}

export async function register(
  username: string,
  email: string,
  password: string,
): Promise<User> {
  const { data } = await apiClient.post<{ user: User }>('/auth/register', {
    username,
    email,
    password,
  })
  return data.user
}

export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout')
}

export async function getMe(): Promise<User> {
  const { data } = await apiClient.get<{ user: User }>('/auth/me')
  return data.user
}

