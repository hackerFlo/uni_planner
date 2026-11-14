import { useEffect } from 'react';
import { applyBadge } from '../utils/appBadge.js';

export function useAttentionCount(count) {
  useEffect(() => { applyBadge(navigator, count); }, [count]);
  useEffect(() => () => { applyBadge(navigator, 0); }, []);
}
