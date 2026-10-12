import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';

export const queryKeys = {
  overview: ['dashboard', 'overview'],
  accounts: ['accounts'],
  transactions: ['transactions'],
  forecast: ['forecast'],
  incomes: ['forecast', 'income'],
  bills: ['bills'],
  budgets: ['budgets'],
  providerInstitutions: ['provider', 'institutions'],
  providerConnections: ['provider', 'connections'],
  adminOverview: ['admin', 'overview'],
  adminUsers: ['admin', 'users']
};

export function useOverview() {
  return useQuery({ queryKey: queryKeys.overview, queryFn: () => api.get('/dashboard/overview') });
}
export function useAccounts() {
  return useQuery({ queryKey: queryKeys.accounts, queryFn: () => api.get('/accounts') });
}
export function useTransactions(limit = 100) {
  return useQuery({ queryKey: [...queryKeys.transactions, limit], queryFn: () => api.get(`/transactions?limit=${limit}`) });
}
export function useForecast() {
  return useQuery({ queryKey: queryKeys.forecast, queryFn: () => api.get('/forecasting/summary') });
}
export function useScheduledIncome() {
  return useQuery({ queryKey: queryKeys.incomes, queryFn: () => api.get('/forecasting/income') });
}
export function useBills(from, to) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return useQuery({ queryKey: [...queryKeys.bills, from || 'all', to || 'all'], queryFn: () => api.get(`/bills${params.size ? `?${params.toString()}` : ''}`) });
}
export function useBudgets() {
  return useQuery({ queryKey: queryKeys.budgets, queryFn: () => api.get('/budgets') });
}
export function useProviderInstitutions() {
  return useQuery({ queryKey: queryKeys.providerInstitutions, queryFn: () => api.get('/provider/institutions') });
}
export function useProviderConnections() {
  return useQuery({
    queryKey: queryKeys.providerConnections,
    queryFn: () => api.get('/provider/connections'),
    refetchInterval: 60000
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.post('/transactions', payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.overview }),
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts }),
        queryClient.invalidateQueries({ queryKey: queryKeys.transactions }),
        queryClient.invalidateQueries({ queryKey: queryKeys.forecast }),
        queryClient.invalidateQueries({ queryKey: queryKeys.budgets })
      ]);
    }
  });
}

export function useCreateBill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.post('/bills', payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.bills })
  });
}

export function useCreateBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.post('/budgets', payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.budgets })
  });
}
