import { create } from "zustand"
import Decimal from "decimal.js"

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP })

export type CartTicketLine = {
  ticketTypeId: string
  quantity: number
  /** Precio unitario autoritativo del último fetch del evento (string decimal). */
  unitPrice: string
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
  ticketLines: CartTicketLine[]
  drinkLines: CartDrinkLine[]
}

type CartState = {
  cart: CartSnapshot | null
  setCart: (cart: CartSnapshot) => void
  clearCart: () => void
}

export function computeCartTotalDecimal(cart: CartSnapshot): Decimal {
  let t = new Decimal(0)
  for (const line of cart.ticketLines) {
    t = t.add(new Decimal(line.unitPrice).mul(line.quantity))
  }
  for (const line of cart.drinkLines) {
    t = t.add(new Decimal(line.unitPrice).mul(line.quantity))
  }
  return t
}

export function computeCartTotalString(cart: CartSnapshot): string {
  return computeCartTotalDecimal(cart).toFixed(2)
}

export const useCartStore = create<CartState>((set) => ({
  cart: null,
  setCart: (cart) => set({ cart }),
  clearCart: () => set({ cart: null }),
}))
