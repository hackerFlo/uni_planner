import { useMemo } from 'react';
import { usePlannerResource } from './usePlannerResource';
import { toDividerItem } from '../utils/plannerItems';
export function useDividers({ autoLoad = true } = {}) {
  const resource = usePlannerResource('/api/day-dividers', 'dividers', { autoLoad });
  const dividers = useMemo(() => (resource.data ?? []).map(toDividerItem), [resource.data]);
  return { dividers, fetchDividers: resource.refresh, version: resource.version, readSnapshotVersion: resource.readSnapshotVersion, captureVersion: resource.captureVersion };
}
