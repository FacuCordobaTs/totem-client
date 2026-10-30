import { create } from "zustand"
import { persist } from "zustand/middleware"

/**
 * Identidad mínima del comprador sin cuenta: nombre y DNI. El backend resuelve (o crea) el
 * `customer` por DNI, así que alcanza para comprar consumos sin login. El drawer global la pide
 * una vez antes de ir al checkout y queda guardada en el teléfono para la próxima compra.
 */
export const BUYER_DNI_REGEX = /^\d{6,9}$/

export function isValidBuyerIdentity(name: string, dni: string): boolean {
  return name.trim().length >= 2 && BUYER_DNI_REGEX.test(dni.trim())
}

type BuyerState = {
  name: string
  dni: string
  /** Drawer global (vive en `AppShell`): lo abre la tienda al continuar al pago. */
  sheetOpen: boolean
  /** Ruta a la que ir cuando el drawer se confirma (el checkout del evento). */
  pendingPath: string | null
  setIdentity: (identity: { name: string; dni: string }) => void
  requestIdentity: (pendingPath: string) => void
  closeSheet: () => void
  clearIdentity: () => void
}

export const useBuyerStore = create<BuyerState>()(
  persist(
    (set) => ({
      name: "",
      dni: "",
      sheetOpen: false,
      pendingPath: null,
      setIdentity: ({ name, dni }) => set({ name: name.trim(), dni: dni.trim() }),
      requestIdentity: (pendingPath) => set({ sheetOpen: true, pendingPath }),
      closeSheet: () => set({ sheetOpen: false, pendingPath: null }),
      clearIdentity: () => set({ name: "", dni: "" }),
    }),
    {
      name: "crow_buyer",
      // El drawer abierto y la ruta pendiente no se restauran: sólo la identidad ya usada.
      partialize: (state) => ({ name: state.name, dni: state.dni }),
    }
  )
)
