import { lazyDialog } from '../utils/lazyDialog';

// Dialogs that only render on demand live in their own chunks, keeping them out
// of the bundle the login and first paint have to download.
export const TodoForm = lazyDialog(() => import('./todos/TodoForm'));
export const ArchiveDrawer = lazyDialog(() => import('./todos/ArchiveDrawer'));
export const WhatsNewModal = lazyDialog(() => import('./layout/WhatsNewModal'));
export const ExamsModal = lazyDialog(() => import('./exams/ExamsModal'));
export const SettingsPanel = lazyDialog(() => import('./layout/SettingsPanel'));

export const ALL_DIALOGS = [TodoForm, ArchiveDrawer, WhatsNewModal, ExamsModal, SettingsPanel];
