import { useCallback, useEffect, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router"
import QRCode from "qrcode"
import { ArrowLeft, Check, Loader2 } from "lucide-react"
import { motion } from "motion/react"
import { toast } from "sonner"
import { publicApiFetch, publicWebSocketUrl } from "@/lib/api"
import type { PickupApiResponse } from "@/types/api"

/**
 * QR de la orden: lo que se muestra en la barra. Codifica el token del pedido; la barra lo escanea,
 * ve la lista y confirma la entrega. La pantalla pasa sola a "Entregado" cuando eso ocurre.
 */
export function PickupPage() {
  const { token } = useParams<{ token: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const [data, setData] = useState<PickupApiResponse | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [qrSrc, setQrSrc] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const load = useCallback(() => {
    if (!token) return
    publicApiFetch<PickupApiResponse>(`/public/pickups/${encodeURIComponent(token)}`)
      .then(setData)
      .catch(() => setNotFound(true))
  }, [token])

  useEffect(() => load(), [load])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    QRCode.toDataURL(token, {
      // Mismo formato que el QR de las entradas: oscuro sobre claro, quiet zone de 4
      // módulos y render a 37 módulos × 28 px para que el navegador no lo interpole.
      width: 1036,
      margin: 4,
      errorCorrectionLevel: "M",
      color: { dark: "#09090b", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setQrSrc(url)
      })
      .catch(() => {
        if (!cancelled) setQrSrc(null)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (!token) return
    let disposed = false
    let socket: WebSocket | null = null
    let retry: number | null = null
    const connect = () => {
      socket = new WebSocket(publicWebSocketUrl(`/ws/public/pickups/${encodeURIComponent(token)}`))
      socket.onmessage = () => load()
      socket.onclose = () => {
        if (!disposed) retry = window.setTimeout(connect, 3_000)
      }
    }
    connect()
    return () => {
      disposed = true
      if (retry != null) window.clearTimeout(retry)
      socket?.close()
    }
  }, [load, token])

  const pending = data?.status === "PENDING"

  // En la fila de la barra la pantalla no se puede apagar con el QR a la vista.
  useEffect(() => {
    if (!pending || !("wakeLock" in navigator)) return
    let lock: WakeLockSentinel | null = null
    let released = false
    const acquire = () => {
      if (document.visibilityState !== "visible") return
      navigator.wakeLock
        .request("screen")
        .then((sentinel) => {
          if (released) void sentinel.release()
          else lock = sentinel
        })
        .catch(() => {
          /* Sin permiso o sin batería: el QR sigue visible hasta que el sistema apague la pantalla. */
        })
    }
    acquire()
    document.addEventListener("visibilitychange", acquire)
    return () => {
      released = true
      document.removeEventListener("visibilitychange", acquire)
      void lock?.release()
    }
  }, [pending])

  const receiptToken = searchParams.get("receipt")
  const retirarPath = receiptToken ? `/receipt/${encodeURIComponent(receiptToken)}/retirar` : null

  const goBack = () => {
    if (retirarPath) navigate(retirarPath, { replace: true })
    else navigate(-1)
  }

  const cancelOrder = async () => {
    if (!token || cancelling) return
    setCancelling(true)
    try {
      await publicApiFetch(`/public/pickups/${encodeURIComponent(token)}/cancel`, { method: "POST" })
      goBack()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cambiar la orden")
      load()
    } finally {
      setCancelling(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="flex min-h-14 items-center pt-[env(safe-area-inset-top)]">
        <button
          type="button"
          onClick={goBack}
          aria-label="Volver"
          className="-ml-2 flex size-11 items-center justify-center rounded-full text-white outline-none focus-visible:ring-2 focus-visible:ring-white/40 active:bg-white/10"
        >
          <ArrowLeft className="size-6" aria-hidden />
        </button>
      </header>

      {notFound ? (
        <div className="flex flex-1 flex-col justify-center gap-3 pb-16">
          <h1 className="text-[2rem] font-black leading-[1.05] tracking-[-0.03em] text-white">
            No encontramos esta orden
          </h1>
          <p className="text-[17px] leading-snug text-white/70">Volvé y generá el QR de nuevo.</p>
        </div>
      ) : !data ? (
        <div role="status" aria-label="Cargando" className="flex flex-1 items-center justify-center text-white/60">
          <Loader2 className="size-6 animate-spin" aria-hidden />
        </div>
      ) : data.status === "DELIVERED" ? (
        <div className="flex flex-1 flex-col justify-center gap-6 pb-16" aria-live="polite">
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="flex size-16 items-center justify-center rounded-full bg-emerald-400 text-black"
          >
            <Check className="size-9" strokeWidth={3} aria-hidden />
          </motion.span>
          <h1 className="text-[2rem] font-black leading-[1.05] tracking-[-0.03em] text-white">Entregado</h1>
          <OrderItems items={data.items} />
        </div>
      ) : data.status === "CANCELLED" ? (
        <div className="flex flex-1 flex-col justify-center gap-3 pb-16">
          <h1 className="text-[2rem] font-black leading-[1.05] tracking-[-0.03em] text-white">
            Esta orden ya no vale
          </h1>
          <p className="text-[17px] leading-snug text-white/70">
            La cambiaste por otra. Tus productos siguen guardados.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-6 pt-2" aria-live="polite">
          <h1 className="text-[2rem] font-black leading-none tracking-[-0.03em] text-white">
            Mostrá este QR en la barra
          </h1>
          <div className="mx-auto w-full max-w-[22rem] overflow-hidden rounded-3xl bg-white">
            {qrSrc ? (
              <img src={qrSrc} alt="QR de tu orden de retiro" width={352} height={352} className="block aspect-square w-full" />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center text-black/60">
                <Loader2 className="size-6 animate-spin" aria-hidden />
              </div>
            )}
          </div>
          <OrderItems items={data.items} />
          <button
            type="button"
            disabled={cancelling}
            onClick={() => void cancelOrder()}
            className="mt-auto flex h-12 w-full items-center justify-center text-[15px] font-semibold text-white/70 outline-none focus-visible:text-white disabled:opacity-50"
          >
            {cancelling ? <Loader2 className="size-5 animate-spin" aria-label="Cambiando la orden" /> : "Cambiar lo que retiro"}
          </button>
        </div>
      )}
    </main>
  )
}

function OrderItems({ items }: { items: PickupApiResponse["items"] }) {
  return (
    <ul>
      {items.map((item) => (
        <li
          key={item.productId}
          className="flex items-baseline gap-3 border-b border-white/[0.09] py-3 text-[17px] font-semibold text-white last:border-b-0"
        >
          <span className="text-xl font-black tabular-nums">{item.quantity}</span>
          {item.productName}
        </li>
      ))}
    </ul>
  )
}
