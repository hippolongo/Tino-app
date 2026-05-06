import { create } from 'zustand'

export const useUiStore = create((set) => ({
  activeRoute: 'overview',
  sidebarOpen: false,
  setActiveRoute: (activeRoute) => set({ activeRoute }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
}))

