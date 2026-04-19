import {
  digitalConsumptions,
  events,
  products,
  sales,
  ticketTypes,
  tickets,
} from "@backend/db/schema"

export type TicketRow = typeof tickets.$inferSelect
export type DigitalConsumptionRow = typeof digitalConsumptions.$inferSelect
export type EventRow = typeof events.$inferSelect
export type TicketTypeRow = typeof ticketTypes.$inferSelect
export type ProductRow = typeof products.$inferSelect
export type SaleRow = typeof sales.$inferSelect

export type PublicEventSummary = Pick<EventRow, "id" | "name" | "date" | "location"> & {
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

export type PublicDrinkProductItem = Pick<ProductRow, "id" | "name" | "price">

export type PublicEventDetailResponse = {
  productora: { id: string; name: string }
  event: Pick<EventRow, "id" | "name" | "date" | "location"> & {
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
}

export type ReceiptApiResponse = {
  receiptToken: string
  sale: Pick<SaleRow, "id" | "totalAmount" | "paymentMethod" | "createdAt">
  event: Pick<EventRow, "id" | "name" | "date" | "location">
  productora: { name: string }
  tickets: Array<{
    id: string
    qrHash: string
    status: TicketRow["status"]
    ticketType: Pick<TicketTypeRow, "name" | "price">
  }>
  consumptions: Array<{
    id: string
    qrHash: string
    status: DigitalConsumptionRow["status"]
    product: Pick<ProductRow, "id" | "name" | "price">
  }>
}
