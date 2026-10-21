import { lazy, type ComponentType, type LazyExoticComponent } from "react"

interface EventSite {
  /** Slug OR database event ID. Independent of the subdomain and page design. */
  eventIdentifier: string
  Page: LazyExoticComponent<ComponentType>
  /** Color de fondo mientras descarga la página, para que no se vea un flash blanco. */
  loadingBackground?: string
}

/** Register pages here in code. No admin configuration controls this registry. */
const eventSites: Record<string, EventSite> = {
  dripeo: {
    eventIdentifier: "dripeo",
    Page: lazy(() => import("./dripeo/page")),
  },
  perronegro3110: {
    eventIdentifier: "perro-negro-31-10",
    Page: lazy(() => import("./perronegro3110/page")),
    loadingBackground: "#d81a0f",
  },
}

export function getEventSite(subdomain: string | null): EventSite | null {
  return subdomain && Object.hasOwn(eventSites, subdomain) ? eventSites[subdomain] : null
}
