import { create } from "zustand";
export const useOsStore = create((set) => ({
    theme: "dark",
    setTheme: (theme) => set({ theme }),
    toggleTheme: () => set((state) => ({ theme: state.theme === "dark" ? "light" : "dark" })),
}));
