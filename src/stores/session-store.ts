import { create } from "zustand"
import { persist } from "zustand/middleware"

/**
 * Sesión del cliente en el teléfono. El token lo emite `/public/events/:id/access/verify` después
 * de verificar el código de WhatsApp, y abre la misma página que el token del mail — la diferencia
 * es que se guarda, así el cliente no vuelve a pedir un código cada vez que entra.
 */
type SessionState = {
  token: string | null
  customerName: string | null
  _hydrated: boolean
  setSession: (session: { token: string; customerName?: string | null }) => void
  clearSession: () => void
  _setHydrated: () => void
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      token: null,
      customerName: null,
      _hydrated: false,
      setSession: ({ token, customerName }) =>
        set({ token, customerName: customerName ?? null }),
      clearSession: () => set({ token: null, customerName: null }),
      _setHydrated: () => set({ _hydrated: true }),
    }),
    {
      name: "crow_session",
      partialize: (s) => ({ token: s.token, customerName: s.customerName }),
      onRehydrateStorage: () => (state) => {
        state?._setHydrated()
      },
    }
  )
)
