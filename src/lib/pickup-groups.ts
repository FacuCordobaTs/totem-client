import type { PickupItem, PickupStatus } from "@/types/api"

type ConsumptionInput = {
  id: string
  status: string
  product: { id: string; name: string }
}

type PickupInput = {
  token: string
  status: PickupStatus
  consumptionIds?: string[]
  items: PickupItem[]
}

export type PickupGroup = {
  productId: string
  name: string
  /** Unidades listas para sumar a una orden nueva: pendientes y fuera de una orden activa. */
  availableIds: string[]
}

export type RetiredLine = { productId: string; name: string; quantity: number }

/**
 * Lo que la pantalla de retiro necesita saber: órdenes vigentes, productos todavía sin orden y lo
 * ya retirado. Una orden deja de estar vigente si alguna de sus unidades se canjeó por otro camino
 * (QR individual o comprobante en barra): la barra ya no la aceptaría.
 */
export function buildPickupOverview(consumptions: ConsumptionInput[], pickups: PickupInput[]) {
  const pendingIds = new Set(consumptions.filter((c) => c.status === "PENDING").map((c) => c.id))
  const activeOrders = pickups.filter(
    (order) =>
      order.status === "PENDING" &&
      (order.consumptionIds === undefined || order.consumptionIds.every((id) => pendingIds.has(id)))
  )
  const reserved = new Set(activeOrders.flatMap((order) => order.consumptionIds ?? []))

  const groups = new Map<string, PickupGroup>()
  const retired = new Map<string, RetiredLine>()
  for (const consumption of consumptions) {
    const { id: productId, name } = consumption.product
    if (consumption.status === "PENDING" && !reserved.has(consumption.id)) {
      const group = groups.get(productId) ?? { productId, name, availableIds: [] }
      group.availableIds.push(consumption.id)
      groups.set(productId, group)
    }
    if (consumption.status === "REDEEMED") {
      const line = retired.get(productId) ?? { productId, name, quantity: 0 }
      line.quantity += 1
      retired.set(productId, line)
    }
  }

  return {
    activeOrders,
    groups: [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "es")),
    retired: [...retired.values()],
  }
}

/** Selección de la pantalla: sin tocar nada se retira todo lo disponible. */
export function pickupQuantity(
  group: PickupGroup,
  overrides: Record<string, number>,
  defaultToAll: boolean
): number {
  const override = overrides[group.productId]
  const quantity = override ?? (defaultToAll ? group.availableIds.length : 0)
  return Math.max(0, Math.min(group.availableIds.length, quantity))
}
