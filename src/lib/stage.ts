import type { Stage } from './types';
import { TokenStatus } from './abi/portal';

export const SEED_MAX_PROGRESS = 0.02;
export const ABOUT_TO_GRADUATE = 0.7;

export function stageOf(status: number | null | undefined, progress: number | null | undefined): Stage {
  if (status === TokenStatus.DEX) return 'grove';
  if ((progress ?? 0) < SEED_MAX_PROGRESS) return 'seed';
  return 'shoot';
}

export const isAboutToGraduate = (status: number | undefined, progress: number | undefined) =>
  status === TokenStatus.Tradable && (progress ?? 0) >= ABOUT_TO_GRADUATE;
