import { create } from 'zustand';

interface UIState {
  loading: boolean;
  overviewLoading: boolean;
  overviewError: string | null;
  analysisError: string | null;
  chatError: string | null;
  isGeneratingReport: boolean;
  isSendingReport: boolean;
  reportStatus: 'idle' | 'success' | 'error';
  isChatting: boolean;
  isTriggeringReport: boolean;
  isDiscussing: boolean;
  isReviewing: boolean;
  showDiscussion: boolean;
  isSettingsOpen: boolean;
  showAdminPanel: boolean;
  selectedDetail: { type: 'log' | 'history', data: any } | null;

  setLoading: (loading: boolean) => void;
  setOverviewLoading: (loading: boolean) => void;
  setOverviewError: (error: string | null) => void;
  setAnalysisError: (error: string | null) => void;
  setChatError: (error: string | null) => void;
  setIsGeneratingReport: (is: boolean) => void;
  setIsSendingReport: (is: boolean) => void;
  setReportStatus: (status: 'idle' | 'success' | 'error') => void;
  setIsChatting: (is: boolean) => void;
  setIsTriggeringReport: (is: boolean) => void;
  setIsDiscussing: (is: boolean) => void;
  setIsReviewing: (is: boolean) => void;
  setShowDiscussion: (show: boolean) => void;
  setIsSettingsOpen: (open: boolean) => void;
  setShowAdminPanel: (show: boolean) => void;
  setSelectedDetail: (detail: { type: 'log' | 'history', data: any } | null) => void;
  resetErrors: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  loading: false,
  overviewLoading: true,
  overviewError: null,
  analysisError: null,
  chatError: null,
  isGeneratingReport: false,
  isSendingReport: false,
  reportStatus: 'idle',
  isChatting: false,
  isTriggeringReport: false,
  isDiscussing: false,
  isReviewing: false,
  showDiscussion: false,
  isSettingsOpen: false,
  showAdminPanel: false,
  selectedDetail: null,

  setLoading: (loading) => set({ loading }),
  setOverviewLoading: (overviewLoading) => set({ overviewLoading }),
  setOverviewError: (overviewError) => set({ overviewError }),
  setAnalysisError: (analysisError) => set({ analysisError }),
  setChatError: (chatError) => set({ chatError }),
  setIsGeneratingReport: (isGeneratingReport) => set({ isGeneratingReport }),
  setIsSendingReport: (isSendingReport) => set({ isSendingReport }),
  setReportStatus: (reportStatus) => set({ reportStatus }),
  setIsChatting: (isChatting) => set({ isChatting }),
  setIsTriggeringReport: (isTriggeringReport) => set({ isTriggeringReport }),
  setIsDiscussing: (isDiscussing) => set({ isDiscussing }),
  setIsReviewing: (isReviewing) => set({ isReviewing }),
  setShowDiscussion: (showDiscussion) => set({ showDiscussion }),
  setIsSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
  setShowAdminPanel: (showAdminPanel) => set({ showAdminPanel }),
  setSelectedDetail: (selectedDetail) => set({ selectedDetail }),
  resetErrors: () => set({
    overviewError: null,
    analysisError: null,
    chatError: null,
  }),
}));
