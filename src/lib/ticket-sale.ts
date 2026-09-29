type TicketSaleEvent = { ticketsAvailableFrom?: Date | string | null }

/**
 * Un evento con fecha y hora de inicio para la venta de entradas (`ticketsAvailableFrom`) vende
 * online sólo entradas: el cliente pasa de elegirlas directo al checkout y no se le ofrece la
 * tienda de consumos —ni en la compra ni en el comprobante—, así no ve los precios de la barra.
 */
export function hasScheduledTicketSale(event: TicketSaleEvent): boolean {
  return event.ticketsAvailableFrom != null
}
