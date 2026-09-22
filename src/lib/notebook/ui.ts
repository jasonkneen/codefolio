import { create } from "zustand";

export type ConfirmSpec = {
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
};

type FolioUi = {
  helpOpen: boolean;
  confirm: ConfirmSpec | null;
  openHelp: () => void;
  closeHelp: () => void;
  toggleHelp: () => void;
  ask: (spec: ConfirmSpec) => void;
  closeConfirm: () => void;
};

export const useFolioUi = create<FolioUi>((set, get) => ({
  helpOpen: false,
  confirm: null,
  openHelp: () => set({ helpOpen: true }),
  closeHelp: () => set({ helpOpen: false }),
  toggleHelp: () => set({ helpOpen: !get().helpOpen }),
  ask: (confirm) => set({ confirm }),
  closeConfirm: () => set({ confirm: null }),
}));
