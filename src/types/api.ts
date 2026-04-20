/** Client-side API types (no backend package — deploys standalone). */

export type TicketStatus = "PENDING" | "USED" | "CANCELLED"
export type ConsumptionStatus = "PENDING" | "REDEEMED" | "CANCELLED"
export type PaymentMethod = "CASH" | "CARD" | "MERCADOPAGO" | "TRANSFER"

export type PublicEventSummary = {
  id: string
  name: string
  date: string
  location: string | null
  productora: { id: string; name: string }
}

export type PublicEventsResponse = {
  events: PublicEventSummary[]
}

export type PublicTicketTypeItem = {
  id: string
  name: string
  price: string
  stockLimit: number | null
  sold: number
  remaining: number | null
  availableForPurchase: boolean
}

export type PublicDrinkProductItem = {
  id: string
  name: string
  price: string
}

export type PublicEventDetailResponse = {
  productora: { id: string; name: string }
  event: {
    id: string
    name: string
    date: string
    location: string | null
    imageUrl?: string | null
    ticketsAvailableFrom: Date | string | null
    consumptionsAvailableFrom: Date | string | null
  }
  ticketTypes: PublicTicketTypeItem[]
  drinkProducts: PublicDrinkProductItem[]
}

export type GuestCheckoutResponse = {
  message: string
  receiptToken: string
  saleId: string
  /** Checkout Pro: abrir en la misma venta. */
  initPoint?: string
  preferenceId?: string
  mercadoPago?: boolean
}

export type ReceiptApiResponse = {
  receiptToken: string
  sale: {
    id: string
    totalAmount: string
    paymentMethod: PaymentMethod
    status?: "PENDING" | "PAYMENT_FAILED" | "COMPLETED" | "REFUNDED"
    createdAt: string | null
  }
  event: {
    id: string
    name: string
    date: string
    location: string | null
  }
  productora: { name: string }
  tickets: Array<{
    id: string
    qrHash: string
    status: TicketStatus
    ticketType: { name: string; price: string }
  }>
  consumptions: Array<{
    id: string
    qrHash: string
    status: ConsumptionStatus
    product: { id: string; name: string; price: string }
  }>
}
