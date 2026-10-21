import { lazy, type ComponentType, type LazyExoticComponent } from "react"

interface EventSite {
  /** Slug OR database event ID. Independent of the subdomain and page design. */
  eventIdentifier: string
  Page: LazyExoticComponent<ComponentType>
}

/** Register pages here in code. No admin configuration controls this registry. */
const eventSites: Record<string, EventSite> = {
  dripeo: {
    eventIdentifier: "dripeo",
    Page: lazy(() => import("./dripeo/page")),
  },
}

export function getEventSite(subdomain: string | null): EventSite | null {
  return subdomain && Object.hasOwn(eventSites, subdomain) ? eventSites[subdomain] : null
}
