import { describe, expect, test } from "bun:test"
import { describeTicketOffer, quoteTicketLine, ticketQuantityStep } from "../src/lib/ticket-pricing"

// Mismos casos que backend/src/lib/ticket-pricing.test.ts: el total mostrado debe coincidir
// centavo a centavo con el que revalida el checkout.
const volume = {
  volumeDiscounts: [
    { minQuantity: 10, percentOff: 15 },
    { minQuantity: 5, percentOff: 10 },
    { minQuantity: 20, percentOff: 20 },
  ],
}

describe("quoteTicketLine", () => {
  test("descuento por cantidad redondeado a centavos como el backend", () => {
    const q = quoteTicketLine(volume, "1333.33", 5)
    expect(q.discount.toFixed(2)).toBe("666.67")
    expect(q.total.toFixed(2)).toBe("5999.98")
  })

  test("aplica el escalón más alto alcanzado", () => {
    expect([4, 5, 10, 19, 20].map((n) => quoteTicketLine(volume, "100", n).volumeTier?.percentOff ?? 0)).toEqual([
      0, 10, 15, 15, 20,
    ])
  })

  test("la promo llevás/pagás no cambia", () => {
    expect(quoteTicketLine({ promoBuy: 2, promoPay: 1 }, "1000", 3).total.toFixed(2)).toBe("2000.00")
    expect(ticketQuantityStep({ promoBuy: 2, promoPay: 1 })).toBe(2)
    expect(ticketQuantityStep(volume)).toBe(1)
  })
})

describe("describeTicketOffer", () => {
  test("indica cuánto falta para el próximo escalón", () => {
    expect(describeTicketOffer(volume, 0)?.status).toBeNull()
    expect(describeTicketOffer(volume, 3)?.status).toBe("Sumá 2 más y tenés 10% off")
    expect(describeTicketOffer(volume, 7)?.status).toBe("10% off aplicado. Sumá 3 más y tenés 15% off")
    expect(describeTicketOffer(volume, 25)).toMatchObject({ status: "20% off aplicado", applied: true })
    expect(describeTicketOffer({}, 3)).toBeNull()
  })
})
