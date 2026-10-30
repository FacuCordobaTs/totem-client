import { create } from "zustand"
import { persist } from "zustand/middleware"
import Decimal from "decimal.js"

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP })

export type CartTicketLine = {
  ticketTypeId: string
  quantity: number
  /** Precio unitario autoritativo del último fetch del evento (string decimal). */
  unitPrice: string
  /** Promo "llevás X, pagás Y" del tipo (2x1 = 2/1); el backend revalida el total. */
  promoBuy?: number | null
  promoPay?: number | null
}

/** Unidades que se cobran por `quantity` entradas con la promo del tipo. */
export function ticketPaidUnits(
  promo: { promoBuy?: number | null; promoPay?: number | null },
  quantity: number
): number {
  const { promoBuy, promoPay } = promo
  if (!promoBuy || !promoPay || promoBuy < 2 || promoPay < 1 || promoPay >= promoBuy) return quantity
  return Math.floor(quantity / promoBuy) * promoPay + (quantity % promoBuy)
}

export function ticketPromoLabel(promo: { promoBuy?: number | null; promoPay?: number | null }): string | null {
  return ticketPaidUnits(promo, promo.promoBuy ?? 0) < (promo.promoBuy ?? 0) ? `${promo.promoBuy}x${promo.promoPay} (llevás ${promo.promoBuy}, pagás ${promo.promoPay})` : null
}

export function ticketLineSubtotal(line: CartTicketLine): Decimal {
  return new Decimal(line.unitPrice).mul(ticketPaidUnits(line, line.quantity))
}

export type CartDrinkLine = {
  productId: string
  quantity: number
  unitPrice: string
}

export type CartSnapshot = {
  eventId: string
  eventName: string
  productoraName: string
  /** Canal de compra: condiciona la venta de consumos en el backend. */
  channel?: "PAGE" | "ACCESS_LINK"
  ticketLines: CartTicketLine[]
  drinkLines: CartDrinkLine[]
  transportLines?: { transportId: string; quantity: number; unitPrice: string; name: string; address: string }[]
}

type CartState = {
  cart: CartSnapshot | null
  _hydrated: boolean
  setCart: (cart: CartSnapshot) => void
  clearCart: () => void
  _setHydrated: () => void
}

export function computeCartTotalDecimal(cart: CartSnapshot): Decimal {
  let t = new Decimal(0)
  for (const line of cart.ticketLines) {
    t = t.add(ticketLineSubtotal(line))
  }
  for (const line of cart.drinkLines) {
    t = t.add(new Decimal(line.unitPrice).mul(line.quantity))
  }
  for (const line of cart.transportLines ?? []) {
    t = t.add(new Decimal(line.unitPrice).mul(line.quantity))
  }
  return t
}

export function computeCartTotalString(cart: CartSnapshot): string {
  return computeCartTotalDecimal(cart).toFixed(2)
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      cart: null,
      _hydrated: false,
      setCart: (cart) => set({ cart }),
      clearCart: () => set({ cart: null }),
      _setHydrated: () => set({ _hydrated: true }),
    }),
    {
      name: "crow_cart",
      partialize: (s) => ({ cart: s.cart }),
      onRehydrateStorage: () => (state) => {
        state?._setHydrated()
      },
    }
  )
)
