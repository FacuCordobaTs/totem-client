import Decimal from "decimal.js"

/**
 * Oferta comercial de un tipo de entrada. Espeja `backend/src/lib/ticket-pricing.ts`, que
 * revalida el total del checkout con estas mismas reglas: si cambian allá, cambian acá.
 *
 * Un tipo tiene a lo sumo una estrategia:
 *   - bundle: "llevás X, pagás Y" (2x1). La cantidad se elige de a packs de X.
 *   - volume: % de descuento escalonado por cantidad; aplica el escalón más alto alcanzado
 *     sobre todas las entradas de la línea.
 */

export type VolumeDiscountTier = { minQuantity: number; percentOff: number }

export type TicketPricingRules = {
  promoBuy?: number | null
  promoPay?: number | null
  volumeDiscounts?: VolumeDiscountTier[] | null
}

export type TicketOffer =
  | { kind: "none" }
  | { kind: "bundle"; buy: number; pay: number }
  | { kind: "volume"; tiers: VolumeDiscountTier[] }

export function ticketOffer(rules: TicketPricingRules): TicketOffer {
  const { promoBuy: buy, promoPay: pay } = rules
  if (buy && pay && buy >= 2 && pay >= 1 && pay < buy) return { kind: "bundle", buy, pay }
  if (rules.volumeDiscounts?.length) {
    return { kind: "volume", tiers: [...rules.volumeDiscounts].sort((a, b) => a.minQuantity - b.minQuantity) }
  }
  return { kind: "none" }
}

export type TicketLineQuote = {
  gross: Decimal
  discount: Decimal
  total: Decimal
  /** Escalón de descuento por cantidad aplicado, si hay. */
  volumeTier: VolumeDiscountTier | null
}

function volumeTierFor(tiers: VolumeDiscountTier[], quantity: number): VolumeDiscountTier | null {
  let applied: VolumeDiscountTier | null = null
  for (const t of tiers) if (quantity >= t.minQuantity) applied = t
  return applied
}

export function quoteTicketLine(rules: TicketPricingRules, unitPrice: string, quantity: number): TicketLineQuote {
  const unit = new Decimal(unitPrice)
  const gross = unit.mul(quantity)
  const offer = ticketOffer(rules)
  if (offer.kind === "volume") {
    const tier = volumeTierFor(offer.tiers, quantity)
    const discount = tier
      ? gross.mul(tier.percentOff).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      : new Decimal(0)
    return { gross, discount, total: gross.sub(discount), volumeTier: tier }
  }
  const paidUnits =
    offer.kind === "bundle" ? Math.floor(quantity / offer.buy) * offer.pay + (quantity % offer.buy) : quantity
  const total = unit.mul(paidUnits)
  return { gross, discount: gross.sub(total), total, volumeTier: null }
}

/** Cuántas entradas suma o quita cada toque: un pack completo en promos "llevás X". */
export function ticketQuantityStep(rules: TicketPricingRules): number {
  const offer = ticketOffer(rules)
  return offer.kind === "bundle" ? offer.buy : 1
}

export type TicketOfferDescription = { headline: string; status: string | null; applied: boolean }

/**
 * Texto corto para mostrar la oferta junto a la entrada, según lo que ya eligió el comprador:
 *   - `headline`: la oferta en sí ("2x1 · llevás 2, pagás 1", "5+ 10% off · 10+ 15% off").
 *   - `status`: qué está pasando con su selección ("10% off aplicado", "Sumá 2 más y tenés 15% off").
 */
export function describeTicketOffer(rules: TicketPricingRules, quantity: number): TicketOfferDescription | null {
  const offer = ticketOffer(rules)
  if (offer.kind === "none") return null
  if (offer.kind === "bundle") {
    return {
      headline: `${offer.buy}x${offer.pay} · llevás ${offer.buy}, pagás ${offer.pay}`,
      status: null,
      applied: quantity >= offer.buy,
    }
  }
  const current = volumeTierFor(offer.tiers, quantity)
  const next = offer.tiers.find((t) => t.minQuantity > quantity) ?? null
  const headline = offer.tiers.map((t) => `${t.minQuantity}+ ${t.percentOff}% off`).join(" · ")
  let status: string | null = null
  if (quantity > 0 && next) {
    const missing = next.minQuantity - quantity
    const prefix = current ? `${current.percentOff}% off aplicado. ` : ""
    status = `${prefix}Sumá ${missing} más y tenés ${next.percentOff}% off`
  } else if (current) {
    status = `${current.percentOff}% off aplicado`
  }
  return { headline, status, applied: current != null }
}
