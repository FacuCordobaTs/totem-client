import { getEventSite } from "@/event-sites/registry"
import { eventSlugFromHostname } from "@/lib/event-domain"

/**
 * El link de acceso de un evento en el host actual: `/acceso` en su página propia y
 * `/{slug}/acceso` en la tienda de Crow. `carta` abre la carta aunque haya un retiro para retomar.
 */
export function eventAccessPath(eventKey: string, { carta = false }: { carta?: boolean } = {}): string {
  const onEventSite = Boolean(getEventSite(eventSlugFromHostname(window.location.hostname)))
  const base = onEventSite ? "/acceso" : `/${encodeURIComponent(eventKey)}/acceso`
  return carta ? `${base}?carta=1` : base
}
