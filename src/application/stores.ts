import { create } from 'zustand';
import type {
  PreparedDocumentDraft,
  UserPreferences,
} from '@/infrastructure/db/repositories';
import {
  DEFAULT_USER_PREFERENCES,
  loadUserPreferences,
  saveUserPreferences,
} from '@/infrastructure/db/repositories';

interface AppTransientStore {
  /** Identificador único desta aba/instância em memória para controle de lease. */
  tabOwnerId: string;
  /** Preferências carregadas do Dexie (sem duplicar em localStorage). */
  preferences: UserPreferences;
  preferencesLoaded: boolean;
  /** Rascunho transitório de importação de texto colado. */
  rawInputText: string;
  rawInputTitle: string;
  preparedDraft: PreparedDocumentDraft | null;
  isPreparingDraft: boolean;
  draftError: string | null;

  hydratePreferences: () => Promise<void>;
  updatePreferences: (partial: Partial<UserPreferences>) => Promise<void>;
  setRawInputText: (text: string) => void;
  setRawInputTitle: (title: string) => void;
  setPreparedDraft: (draft: PreparedDocumentDraft | null) => void;
  setIsPreparingDraft: (loading: boolean) => void;
  setDraftError: (error: string | null) => void;
  clearDraft: () => void;
}

function generateTabOwnerId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `tab-${crypto.randomUUID()}`;
  }
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const useAppStore = create<AppTransientStore>((set) => ({
  tabOwnerId: generateTabOwnerId(),
  preferences: { ...DEFAULT_USER_PREFERENCES },
  preferencesLoaded: false,
  rawInputText: '',
  rawInputTitle: '',
  preparedDraft: null,
  isPreparingDraft: false,
  draftError: null,

  hydratePreferences: async () => {
    const prefs = await loadUserPreferences();
    set({ preferences: prefs, preferencesLoaded: true });
  },

  updatePreferences: async (partial) => {
    const updated = await saveUserPreferences(partial);
    set({ preferences: updated, preferencesLoaded: true });
  },

  setRawInputText: (text) => set({ rawInputText: text, draftError: null }),
  setRawInputTitle: (title) => set({ rawInputTitle: title }),
  setPreparedDraft: (draft) => set({ preparedDraft: draft, draftError: null }),
  setIsPreparingDraft: (loading) => set({ isPreparingDraft: loading }),
  setDraftError: (error) => set({ draftError: error }),
  clearDraft: () =>
    set({
      rawInputText: '',
      rawInputTitle: '',
      preparedDraft: null,
      isPreparingDraft: false,
      draftError: null,
    }),
}));
