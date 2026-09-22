import { useEffect, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router"
import QRCode from "qrcode"
import { Button } from "@/components/ui/button"
import { publicApiFetch, publicWebSocketUrl } from "@/lib/api"
import type { ReceiptApiResponse } from "@/types/api"
import { formatAdmissionWindow } from "@/lib/ticket-admission"

function receiptTokenFromReturnTo(returnTo: string | null): string | null {
  if (!returnTo) return null

  try {
    const pathname = new URL(returnTo, window.location.origin).pathname
    const match = pathname.match(/^\/receipt\/([^/]+)$/)
    return match ? decodeURIComponent(match[1]) : null
  } catch {
    return null
  }
}

export function QrPage() {
  const { hash } = useParams<{ hash: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const ticketLayout = searchParams.get("layout") === "ticket"
  const ticketName = searchParams.get("name")
  const ticketPrice = searchParams.get("price")
  // El comprobante detrás del QR: en el link del mail viaja dentro de `returnTo`; en el evento de la
  // cuenta (`/mi-cuenta/:token/evento/:id`) el path es del cliente y no de una venta, así que llega
  // aparte. Sin comprobante no hay estado que consultar: se muestra el QR y nada más.
  const receiptToken =
    searchParams.get("receipt") ?? receiptTokenFromReturnTo(searchParams.get("returnTo"))
  const [ticketUsed, setTicketUsed] = useState(false)
  const [admissionWindow, setAdmissionWindow] = useState<string | null>(null)

  useEffect(() => {
    if (!hash) return
    const value = decodeURIComponent(hash)
    let cancelled = false
    QRCode.toDataURL(value, {
      // Un único formato de QR para los dos layouts, porque los dos se escanean con la misma
      // cámara: oscuro sobre claro, quiet zone de 4 módulos (la del estándar, y la única que
      // existe cuando la tarjeta de fondo es oscura) y render a 1036 px = 37 módulos × 28, para
      // que el navegador nunca tenga que interpolar el PNG hacia arriba al pintarlo.
      width: 1036,
      margin: 4,
      errorCorrectionLevel: "M",
      color: { dark: "#09090b", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [hash])

  // Al abrir una entrada desde "Tus entradas", esta página queda montada mientras el QR se
  // valida en puerta. Se suscribe al mismo aviso del comprobante para ocultarlo al instante.
  useEffect(() => {
    if (!hash || !receiptToken) return

    let disposed = false
    let socket: WebSocket | null = null
    let retry: number | null = null

    const loadTicketStatus = async () => {
      try {
        const receipt = await publicApiFetch<ReceiptApiResponse>(
          `/public/receipts/${encodeURIComponent(receiptToken)}`
        )
        const ticket = receipt.tickets.find((item) => item.qrHash === hash)
        if (!disposed) {
          setTicketUsed(ticket?.status === "USED")
          setAdmissionWindow(ticket ? formatAdmissionWindow(ticket.ticketType) : null)
        }
      } catch {
        // No reemplazamos un QR válido ante un error temporal de red.
      }
    }

    const connect = () => {
      socket = new WebSocket(
        publicWebSocketUrl(`/ws/public/receipts/${encodeURIComponent(receiptToken)}`)
      )
      socket.onmessage = () => void loadTicketStatus()
      socket.onclose = () => {
        if (!disposed) retry = window.setTimeout(connect, 3_000)
      }
    }

    void loadTicketStatus()
    connect()
    return () => {
      disposed = true
      if (retry != null) window.clearTimeout(retry)
      socket?.close()
    }
  }, [hash, receiptToken])

  if (!hash) return null

  const closeQr = () => {
    const returnTo = searchParams.get("returnTo")
    // Las dos formas del comprobante: el link del mail y el evento de la cuenta.
    if (returnTo?.startsWith("/receipt/") || returnTo?.startsWith("/mi-cuenta/")) {
      navigate(returnTo, { replace: true })
      return
    }
    navigate(-1)
  }

  if (!ticketLayout) {
    return (
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-10 border-b border-zinc-800/50 bg-black/70 px-6 py-4 backdrop-blur-xl">
          <Button
            variant="ghost"
            className="-ml-2 rounded-xl px-3 text-sm text-[#8E8E93] hover:bg-white/5 hover:text-white"
            type="button"
            onClick={closeQr}
          >
            Cerrar
          </Button>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-16">
          <p className="max-w-xs text-center text-sm leading-relaxed text-[#8E8E93]">
            Mostrá este código en la entrada o en la barra.
          </p>
          <div className="rounded-2xl bg-[#1C1C1E] p-6">
            {ticketUsed ? (
              <div className="flex aspect-square w-full max-w-[min(88vw,320px)] items-center justify-center rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-100 px-6 text-center text-sm font-bold uppercase tracking-[0.16em] text-zinc-400">
                Entrada utilizada
              </div>
            ) : dataUrl ? (
              <img
                src={dataUrl}
                alt="Código QR"
                className="w-full max-w-[min(88vw,320px)] rounded-xl"
                width={320}
                height={320}
              />
            ) : (
              <div className="flex size-80 max-w-[88vw] items-center justify-center rounded-xl text-sm text-[#8E8E93]">
                Generando…
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-black">
      <header className="z-10 bg-black px-6 py-4">
        <Button
          variant="ghost"
          className="-ml-2 rounded-xl px-3 text-sm text-[#8E8E93] hover:bg-white/5 hover:text-white"
          type="button"
          onClick={closeQr}
        >
          Cerrar
        </Button>
      </header>
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-end px-5">
        <article className="flex flex-col rounded-t-[1.75rem] bg-white text-zinc-950 shadow-[0_-18px_50px_-28px_rgba(255,255,255,0.45)]">
          {admissionWindow && <p className="px-6 pt-6 text-center text-sm font-semibold text-amber-800">{admissionWindow}</p>}
          <div className="flex shrink-0 items-center justify-center px-6 pb-7 pt-8">
            {dataUrl ? (
              <img
                src={dataUrl}
                alt="Código QR"
                className="aspect-square w-full max-w-[min(88vw,320px)]"
                width={320}
                height={320}
              />
            ) : (
              <div className="flex aspect-square w-full max-w-[min(88vw,320px)] items-center justify-center text-sm text-zinc-400">
                Generando…
              </div>
            )}
          </div>

          <div className="relative border-t-[3px] border-dotted border-zinc-300" aria-hidden>
            <span className="absolute left-0 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black" />
            <span className="absolute right-0 top-1/2 size-10 translate-x-1/2 -translate-y-1/2 rounded-full bg-black" />
          </div>

          <div className="shrink-0 px-8 pb-12 pt-8 text-center">
            {ticketUsed ? (
              <p className="mb-3 text-sm font-extrabold uppercase tracking-[0.14em] text-zinc-500">
                Usada
              </p>
            ) : null}
            {ticketName ? (
              <p className="text-3xl font-extrabold tracking-tight text-zinc-950">
                {ticketName}
              </p>
            ) : null}
            {ticketPrice ? (
              <p className="mt-2 text-xl font-bold tabular-nums text-zinc-500">
                {ticketPrice}
              </p>
            ) : null}
          </div>
        </article>
      </main>
    </div>
  )
}
