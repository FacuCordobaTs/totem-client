export type AdmissionWindow = { validFrom?: string | null; validUntil?: string | null }

const TIME_ZONE = "America/Argentina/Buenos_Aires"

export function formatAdmissionWindow(window: AdmissionWindow): string | null {
  const format = (iso: string) => new Date(iso).toLocaleString("es-AR", {
    timeZone: TIME_ZONE, day: "2-digit", month: "2-digit",
    year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  })
  const parts = [window.validFrom ? `desde el ${format(window.validFrom)}` : "",
    window.validUntil ? `hasta el ${format(window.validUntil)}` : ""].filter(Boolean)
  return parts.length ? `Ingreso ${parts.join(" ")} (hora Argentina)` : null
}

/**
 * Versión corta para la tarjeta de entrada del link del evento. Si "desde" y "hasta" caen el mismo
 * día (hora Argentina) el día no aporta nada, así que queda sólo "Desde las 21:00 hasta las 22:00".
 * Con cualquier otra combinación (un solo extremo, o un horario que cruza la medianoche) devuelve el
 * texto completo de `formatAdmissionWindow`.
 */
export function formatAdmissionWindowShort(window: AdmissionWindow): string | null {
  const { validFrom, validUntil } = window
  if (validFrom && validUntil) {
    const day = (iso: string) => new Date(iso).toLocaleDateString("es-AR", { timeZone: TIME_ZONE })
    const time = (iso: string) => new Date(iso).toLocaleTimeString("es-AR", {
      timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    })
    if (day(validFrom) === day(validUntil)) return `Desde las ${time(validFrom)} hasta las ${time(validUntil)}`
  }
  return formatAdmissionWindow(window)
}
