/** Client-side API types (no backend package — deploys standalone). */

export type TicketStatus = "PENDING" | "USED" | "CANCELLED"
export type ConsumptionStatus = "PENDING" | "REDEEMED" | "CANCELLED"
/** Tarea 6.1 — SALDO: pago con el saldo cargado del cliente (visión §2.7). */
export type PaymentMethod = "CASH" | "CARD" | "MERCADOPAGO" | "TRANSFER" | "SALDO"

export type PublicEventSummary = {
  id: string
  name: string
  date: string
  venue: string | null
  location: string | null
  productora: { id: string; name: string }
}

export type PublicEventsResponse = {
  events: PublicEventSummary[]
}

export type PublicTicketTypeItem = {
  validFrom: string | null
  validUntil: string | null
  id: string
  name: string
  price: string
  stockLimit: number | null
  sold: number
  remaining: number | null
  availableForPurchase: boolean
}

export type PublicProductSaleType = "BOTTLE" | "GLASS"

export type PublicDrinkProductItem = {
  id: string
  name: string
  price: string
  saleType?: PublicProductSaleType
  imageUrl?: string | null
  categoryId?: string | null
  categoryName?: string | null
}

export type PublicProductCategory = {
  id: string
  name: string
  sortOrder: number
}

export type PublicEventDetailResponse = {
  productora: {
    id: string
    name: string
    /** Métodos de cobro públicos habilitados por la productora. */
    paymentMethods: {
      mercadoPago: boolean
      transfer: boolean
    }
  }
  event: {
    id: string
    name: string
    /** Slug público del evento (`/:slug`) — para navegar "Volver" desde el checkout. */
    slug?: string | null
    date: string
    venue: string | null
    location: string | null
    imageUrl?: string | null
    /** MINIMAL = diseño clásico (default), GLASS = diseño glassmorphism. */
    designType?: "GLASS" | "MINIMAL"
    ticketsAvailableFrom: Date | string | null
    consumptionsAvailableFrom: Date | string | null
  }
  ticketTypes: PublicTicketTypeItem[]
  drinkProducts: PublicDrinkProductItem[]
  productCategories?: PublicProductCategory[]
}

export type GuestCheckoutResponse = {
  message: string
  receiptToken: string
  saleId: string
  /** MERCADOPAGO (Checkout Pro): el link al que hay que redirigir para pagar. */
  redirectUrl?: string
  /** Tarjeta: publicKey del tenant para montar el CardPayment Brick en el paso de pago. */
  card?: { publicKey: string | null }
  payOnReceipt?: boolean
  transfer?: { alias: string; accountNumber: string }
  /** Tarea 6.1 — Saldo resultante tras pagar con saldo (solo `paymentMethod === "SALDO"`). */
  balance?: string
}

export type ProcessBrickResponse = {
  success: boolean
  status?: string
  payment_id?: string
  message?: string
  error?: string
}

export type PickupStatus = "PENDING" | "DELIVERED" | "CANCELLED"

export type PickupItem = {
  productId: string
  productName: string
  quantity: number
}

/** Pedido de retiro (tarea 4.1): respuesta de POST /public/pickups y GET /public/pickups/:token */
export type PickupApiResponse = {
  token: string
  status: PickupStatus
  createdAt?: string | null
  deliveredAt?: string | null
  items: PickupItem[]
}

/** Tarea 7.2 — Página de invitación (`/i/:token`). La cortesía es la credencial (sin auth). */
export type CourtesyStatus = "PENDING" | "REDEEMED" | "REVOKED"

/** QR ya renderizado por el backend (data URL PNG) de una consumición de regalo. */
export type CourtesyDrinkQr = {
  id: string
  qrHash: string
  qrDataUrl: string
  productName: string
}

/** Tarea 7.2 — GET /public/courtesies/:token (diseño de la invitación antes de canjear). */
export type CourtesyInvitationResponse = {
  guestName: string
  status: CourtesyStatus
  event: {
    id: string
    name: string
    date: string
    venue: string | null
    location: string | null
  }
  ticketTypeName: string
  /** Resumen de los tragos de regalo (la invitación muestra qué incluye antes de canjear). */
  drinks: Array<{ productId: string; productName: string; quantity: number }>
  ticketId: string | null
  drinkConsumptions: CourtesyDrinkQr[] | null
}

/** Tarea 7.2 — POST /public/courtesies/:token/redeem (idempotente: devuelve los QRs canjeados). */
export type CourtesyRedeemResponse = {
  message: string
  alreadyRedeemed: boolean
  ticket: {
    id: string
    eventId: string
    qrHash: string
    status: TicketStatus
    buyerName: string
  }
  qrDataUrl: string
  /** Tragos de regalo emitidos: una fila por unidad canjeable, con su QR (PENDING). */
  drinks: CourtesyDrinkQr[]
}

/** Tarea 6.2 — Consulta de saldo por DNI (GET /public/events/:id/balance?dni=). */
export type BalanceLookupResponse = {
  amount: string
}

/** Tarea 6.1 — Respuesta de POST /public/events/:id/balance/deposit (carga de saldo). */
export type BalanceDepositResponse = {
  message: string
  receiptToken: string
  saleId: string
  /** MERCADOPAGO: link de Checkout Pro al que redirigir para pagar. */
  redirectUrl?: string
  payOnReceipt?: boolean
  /** TRANSFER: alias/CVU de Cucuru para copiar. */
  transfer?: { alias: string; accountNumber: string }
}

/** Tarea 6.2 — Respuesta de POST /public/receipts/:token/consumptions-checkout (addon). */
export type ConsumptionsCheckoutResponse = {
  success: boolean
  /** MERCADOPAGO: link de Checkout Pro (flujo histórico). */
  url_pago?: string
  /** SALDO: la venta quedó COMPLETED al instante; el client refresca el comprobante. */
  receiptToken?: string
  balance?: string
  error?: string
}

export type ReceiptApiResponse = {
  receiptToken: string
  /** Nombre completo de la persona que hizo la compra. */
  customerName: string
  /** Tarea 6.1 — Saldo del cliente en este evento ("0.00" si nunca cargó). */
  balance: { amount: string }
  sale: {
    id: string
    totalAmount: string
    paymentMethod: PaymentMethod
    status?: "PENDING" | "PAYMENT_FAILED" | "COMPLETED" | "REFUNDED"
    createdAt: string | null
    paid: boolean
    paidAt: string | null
    cucuruAlias: string | null
    cucuruCvu: string | null
  }
  event: {
    id: string
    name: string
    date: string
    venue: string | null
    location: string | null
  }
  productora: { name: string; mpPublicKey?: string | null }
  tickets: Array<{
    id: string
    qrHash: string
    status: TicketStatus
    ticketType: { name: string; price: string; validFrom: string | null; validUntil: string | null }
  }>
  consumptions: Array<{
    id: string
    qrHash: string
    status: ConsumptionStatus
    product: { id: string; name: string; price: string }
    isAddon?: boolean
  }>
  pickups: Array<{
    token: string
    status: PickupStatus
    createdAt: string | null
    deliveredAt: string | null
    items: PickupItem[]
  }>
}

export type CustomerProfileResponse = {
  customer: { name: string }
  events: Array<{
    id: string
    name: string
    date: string
    venue: string | null
    location: string | null
    imageUrl: string | null
    status: "draft" | "on_sale" | "live" | "closed"
    productoraName: string
    receiptToken: string
    tickets: number
    pendingConsumptions: number
  }>
}
