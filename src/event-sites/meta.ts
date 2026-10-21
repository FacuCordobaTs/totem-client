/**
 * Metadatos que el Worker de subdominios escribe en el HTML de cada página propia: título, vista
 * previa al compartir el link (WhatsApp, Instagram, etc.) e ícono. Los crawlers no ejecutan JS, por eso
 * esto no vive en el componente React. Sólo datos: lo importa el Worker de `client/cloudflare/`.
 * Las rutas son de `client/public/`.
 */
export interface EventSiteMeta {
  title: string
  description: string
  /** Imagen 1200×630 para la vista previa del link. */
  image: string
  icon: string
  appleTouchIcon?: string
  themeColor?: string
}

export const eventSiteMeta: Record<string, EventSiteMeta> = {
  perronegro3110: {
    title: "Perro Negro · 31/10 · Night Club",
    description: "31/10/26 · Qualy Multiespacio. DJs en vivo, sectores VIP, mesas. Entradas y colectivos.",
    image: "/sites/perronegro3110/og.jpg",
    icon: "/sites/perronegro3110/icon.png",
    appleTouchIcon: "/sites/perronegro3110/apple-touch-icon.png",
    themeColor: "#d81a0f",
  },
}
