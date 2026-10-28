'use client';

import { useQuery } from '@tanstack/react-query';
import type { CoinsResponse, ConfigResponse, LedgerResponse, StatsResponse, TokenResponse, TradesResponse } from './types';

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: 'no-store' });
  return (await r.json()) as T;
}

export const useCoins = () =>
  useQuery({ queryKey: ['coins'], queryFn: () => getJson<CoinsResponse>('/api/coins'), refetchInterval: 20_000 });

export const useStats = () =>
  useQuery({ queryKey: ['stats'], queryFn: () => getJson<StatsResponse>('/api/stats'), refetchInterval: 30_000 });

export const useTrades = (token?: string, enabled = true) =>
  useQuery({
    queryKey: ['trades', token?.toLowerCase() ?? 'all'],
    queryFn: () => getJson<TradesResponse>(token ? `/api/trades?token=${token}` : '/api/trades'),
    refetchInterval: 15_000,
    enabled,
  });

export const useLedger = () =>
  useQuery({ queryKey: ['nodes'], queryFn: () => getJson<LedgerResponse>('/api/nodes'), refetchInterval: 45_000 });

export const useToken = (address?: string) =>
  useQuery({
    queryKey: ['token', address?.toLowerCase()],
    queryFn: () => getJson<TokenResponse>(`/api/token/${address}`),
    enabled: Boolean(address),
    refetchInterval: 15_000,
  });

export const useSiteConfig = () =>
  useQuery({ queryKey: ['config'], queryFn: () => getJson<ConfigResponse>('/api/config'), staleTime: 60_000 });
