import { useEffect, useState } from "react"
import { Link } from "react-router"
import QRCode from "qrcode"
import { Maximize2 } from "lucide-react"

/**
 * El QR de una entrada o consumición, con el atajo a pantalla completa.
 *
 * `returnTo` es a dónde vuelve el botón "listo" de esa pantalla: lo usan tanto el comprobante
 * (`/receipt/:token?view=tickets`) como la vista de evento (`/mi-cuenta/:token/evento/:id`).
 */
export function QrBlock({
  hash,
  active,
  returnTo,
  ticketName,
  ticketPrice,
}: {
  hash: string
  active: boolean
  returnTo: string
  ticketName: string
  ticketPrice: string
}) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!active) {
      return
    }
    let cancelled = false
    QRCode.toDataURL(hash, {
      // 296 px = 37 módulos (29 de datos + 4 de quiet zone por lado) × 8 px exactos, para que
      // el navegador no tenga que interpolar el PNG al pintarlo a 96 px CSS.
      width: 296,
      margin: 4,
      errorCorrectionLevel: "M",
      color: { dark: "#09090b", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setSrc(url)
      })
      .catch(() => {
        if (!cancelled) setSrc(null)
      })
    return () => {
      cancelled = true
    }
  }, [hash, active])

  if (!active) {
    return (
      <div className="flex size-24 items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-100">
        <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-400">
          Usada
        </span>
      </div>
    )
  }

  return (
    <div className="relative mx-auto w-fit">
      <Link
        to={`/qr/${encodeURIComponent(hash)}?layout=ticket&name=${encodeURIComponent(ticketName)}&price=${encodeURIComponent(ticketPrice)}&returnTo=${encodeURIComponent(returnTo)}`}
        aria-label="Ver código en pantalla completa"
        className="absolute -right-1.5 -top-1.5 z-10 flex size-7 items-center justify-center rounded-full border-2 border-white bg-zinc-950 text-white shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
      >
        <Maximize2 className="size-3" aria-hidden />
      </Link>
      {src ? (
        <img src={src} alt="Código QR de entrada" className="size-24 rounded-lg" width={96} height={96} />
      ) : (
        <div className="flex size-24 items-center justify-center text-sm text-zinc-400">…</div>
      )}
    </div>
  )
}
