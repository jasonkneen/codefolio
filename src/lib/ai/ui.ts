import { create } from "zustand";
import type { Provider } from "./protocol";
export type AssistantDraft = { nodeId: string; cellId: string; prompt: string; provider?: Provider };
export const useProductPanels = create<{
  activity: { nodeId: string; cellId?: string; name: string; action: string } | null;
  assistant: boolean; sharing: boolean; draft: AssistantDraft | null;
  openAssistant: () => void; openSharing: () => void;
  compose: (draft: AssistantDraft) => void;
}>(set => ({
  activity: null, assistant: false, sharing: false, draft: null,
  openAssistant: () => set({ assistant: true, sharing: false }),
  openSharing: () => set({ sharing: true, assistant: false }),
  compose: draft => set({ assistant: true, sharing: false, draft }),
}));
