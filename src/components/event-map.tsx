import { MapPin, Navigation } from "lucide-react"

/**
 * Mapa del evento (tarea 11.1 — PLAN_VISION_FINAL.md).
 *
 * El evento guarda el nombre visible del salón en `events.venue` y la dirección
 * geográfica en `events.location`; el mapa usa exclusivamente esta última. Es
 * un embed estático de Google Maps consultado por dirección
 * (sin API key) + link "Cómo llegar" que abre la navegación en Google Maps.
 * Si la dirección no existe, no renderiza nada.
 */

function mapsEmbedUrl(location: string): string {
  return `https://maps.google.com/maps?q=${encodeURIComponent(location)}&z=16&output=embed`
}

function mapsDirectionsUrl(location: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(location)}`
}

export function EventMap({
  location,
  compact = false,
}: {
  location: string | null
  /** compact = fila con miniatura del mapa (para superficies de compra); card = mapa completo. */
  compact?: boolean
}) {
  if (!location) return null
  const embed = mapsEmbedUrl(location)
  const directions = mapsDirectionsUrl(location)

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <a
          href={directions}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Abrir ${location} en Google Maps`}
          className="block h-[4.5rem] w-24 shrink-0 overflow-hidden rounded-xl border border-white/[0.1]"
        >
          <iframe
            src={embed}
            title={`Mapa de ${location}`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="h-full w-full"
          />
        </a>
        <div className="min-w-0 flex-1 self-center">
          <p className="truncate text-sm text-white/72">{location}</p>
          <a
            href={directions}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1.5 text-[12px] font-medium text-white/85 active:opacity-70"
          >
            <Navigation size={13} />
            Cómo llegar
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-[22px] border border-white/[0.1]">
      <a
        href={directions}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Abrir ${location} en Google Maps`}
        className="relative block"
      >
        <iframe
          src={embed}
          title={`Mapa de ${location}`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="aspect-[16/9] w-full"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-4 pt-12">
          <p className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] leading-snug text-white/85">
            <MapPin size={13} className="shrink-0 text-white/70" />
            <span className="min-w-0">{location}</span>
          </p>
          <span className="pointer-events-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-[12px] font-semibold text-black">
            <Navigation size={13} />
            Cómo llegar
          </span>
        </div>
      </a>
    </div>
  )
}
