import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { buildPickupOverview, pickupQuantity } from "../src/lib/pickup-groups"
import {
  markQuickPurchasePaid,
  paymentUrlForReceipt,
  PENDING_PAYMENT_WINDOW_MS,
  readGuestCart,
  readQuickPurchase,
  rememberQuickPurchase,
  shouldResumeReceipt,
  writeGuestCart,
} from "../src/lib/quick-purchase"

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  }
}

const globals = globalThis as unknown as Record<string, unknown>
const original = { localStorage: globals.localStorage, sessionStorage: globals.sessionStorage }
beforeEach(() => {
  globals.localStorage = memoryStorage()
  globals.sessionStorage = memoryStorage()
})
afterEach(() => {
  globals.localStorage = original.localStorage
  globals.sessionStorage = original.sessionStorage
})

describe("compra rápida", () => {
  test("recuerda la venta por cualquier identificador del evento", () => {
    rememberQuickPurchase({ eventKeys: ["fiesta", "evt-1", null], receiptToken: "a", paymentUrl: "https://mp/a" })
    expect(readQuickPurchase("evt-1")?.receiptToken).toBe("a")
    expect(readQuickPurchase("fiesta")?.paymentUrl).toBe("https://mp/a")
    expect(readQuickPurchase("otro")).toBeNull()
  })

  test("una compra nueva sin pagar no pierde el acceso al último retiro cobrado", () => {
    rememberQuickPurchase({ eventKeys: ["fiesta", "evt-1"], receiptToken: "a", paymentUrl: "https://mp/a" })
    markQuickPurchasePaid({ eventKeys: ["evt-1", "fiesta"], receiptToken: "a" })
    rememberQuickPurchase({ eventKeys: ["fiesta", "evt-1"], receiptToken: "b", paymentUrl: "https://mp/b" })
    const stored = readQuickPurchase("fiesta")
    expect(stored?.receiptToken).toBe("b")
    expect(stored?.paidReceiptToken).toBe("a")
    expect(paymentUrlForReceipt("b", ["fiesta"])).toBe("https://mp/b")
    expect(paymentUrlForReceipt("a", ["fiesta"])).toBeNull()
  })

  test("cobrar vacía el carrito del evento", () => {
    writeGuestCart("fiesta", { p1: 2 })
    rememberQuickPurchase({ eventKeys: ["fiesta"], receiptToken: "a", paymentUrl: null })
    markQuickPurchasePaid({ eventKeys: ["fiesta"], receiptToken: "a" })
    expect(readGuestCart("fiesta")).toEqual({})
  })

  test("reabrir el link retoma un pago reciente o productos por retirar, y nada más", () => {
    const now = 1_000_000_000
    const pending = { sale: { paid: false, status: "PENDING" }, consumptions: [] }
    expect(shouldResumeReceipt(pending, now - 1000, now)).toBe(true)
    expect(shouldResumeReceipt(pending, now - PENDING_PAYMENT_WINDOW_MS - 1, now)).toBe(false)
    expect(shouldResumeReceipt({ sale: { paid: false, status: "PAYMENT_FAILED" }, consumptions: [] }, now, now)).toBe(false)
    expect(shouldResumeReceipt({ sale: { paid: true }, consumptions: [{ status: "PENDING" }] }, 0, now)).toBe(true)
    expect(shouldResumeReceipt({ sale: { paid: true }, consumptions: [{ status: "REDEEMED" }] }, 0, now)).toBe(false)
  })

  test("un almacenamiento corrupto no rompe la carta", () => {
    localStorage.setItem("crow_quick_purchase", "{roto")
    expect(readQuickPurchase("fiesta")).toBeNull()
  })
})

describe("retiro en barra", () => {
  const fernet = { id: "fernet", name: "Fernet" }
  const speed = { id: "speed", name: "Speed" }
  const consumptions = [
    { id: "1", status: "PENDING", product: fernet },
    { id: "2", status: "PENDING", product: fernet },
    { id: "3", status: "PENDING", product: speed },
    { id: "4", status: "REDEEMED", product: speed },
  ]
  const order = (consumptionIds: string[], status: "PENDING" | "DELIVERED" | "CANCELLED" = "PENDING") => ({
    token: "o",
    status,
    consumptionIds,
    items: [],
  })

  test("sin órdenes ofrece todo lo pendiente y resume lo ya retirado", () => {
    const { activeOrders, groups, retired } = buildPickupOverview(consumptions, [])
    expect(activeOrders).toEqual([])
    expect(groups.map((g) => [g.productId, g.availableIds])).toEqual([
      ["fernet", ["1", "2"]],
      ["speed", ["3"]],
    ])
    expect(retired).toEqual([{ productId: "speed", name: "Speed", quantity: 1 }])
  })

  test("lo reservado en una orden activa no se vuelve a ofrecer", () => {
    const { activeOrders, groups } = buildPickupOverview(consumptions, [order(["1", "3"])])
    expect(activeOrders).toHaveLength(1)
    expect(groups.map((g) => [g.productId, g.availableIds])).toEqual([["fernet", ["2"]]])
  })

  test("una orden cancelada, o con una unidad ya canjeada, libera sus unidades", () => {
    expect(buildPickupOverview(consumptions, [order(["1"], "CANCELLED")]).groups[0].availableIds).toEqual(["1", "2"])
    const stale = buildPickupOverview(consumptions, [order(["1", "4"])])
    expect(stale.activeOrders).toEqual([])
    expect(stale.groups[0].availableIds).toEqual(["1", "2"])
  })

  test("por defecto se retira todo, salvo que ya haya una orden para mostrar", () => {
    const group = { productId: "fernet", name: "Fernet", availableIds: ["1", "2"] }
    expect(pickupQuantity(group, {}, true)).toBe(2)
    expect(pickupQuantity(group, {}, false)).toBe(0)
    expect(pickupQuantity(group, { fernet: 1 }, true)).toBe(1)
    expect(pickupQuantity(group, { fernet: 9 }, true)).toBe(2)
  })
})
