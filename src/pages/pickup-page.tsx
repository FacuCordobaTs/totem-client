import { useEffect, useState } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router"
import QRCode from "qrcode"
import { Check, Loader2 } from "lucide-react"
import { publicApiFetch } from "@/lib/api"
import type { PickupApiResponse } from "@/types/api"
import { Button } from "@/components/ui/button"

const STATUS_LABEL: Record<PickupApiResponse["status"], string> = {
  PENDING: "Listo para retirar",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
}

/**
 * QR de pedido (tarea 4.1 — visión §2.5): el código que se muestra en barra. Codifica el
 * token del pedido; el barman lo escanea, ve la lista en su pantalla y confirma la entrega.
 * Los tragos no retirados siguen disponibles en el comprobante.
 */
export function PickupPage() {
  const { token } = useParams<{ token: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const [data, setData] = useState<PickupApiResponse | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [qrSrc, setQrSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    publicApiFetch<PickupApiResponse>(`/public/pickups/${token}`)
      .then((d) => {
        if (cancelled) return
        setData(d)
        QRCode.toDataURL(token, {
          width: 280,
          margin: 2,
          color: { dark: "#fafafa", light: "#121212" },
        })
          .then((url) => {
            if (!cancelled) setQrSrc(url)
          })
          .catch(() => {
            if (!cancelled) setQrSrc(null)
          })
      })
      .catch(() => {
        if (!cancelled) setNotFound(true)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const receiptToken = searchParams.get("receipt")
  const delivered = data?.status === "DELIVERED"

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-800/50 bg-black/70 px-6 py-4 backdrop-blur-xl">
        <Button
          variant="ghost"
          className="-ml-2 rounded-xl px-3 text-sm text-[#8E8E93] hover:bg-white/5 hover:text-white"
          type="button"
          onClick={() => navigate(-1)}
        >
          Cerrar
        </Button>
      </header>

      {notFound ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
          <p className="text-lg font-semibold tracking-tight text-white">
            Pedido no encontrado
          </p>
          <p className="max-w-[260px] text-sm leading-relaxed text-white/50">
            Este código no corresponde a ningún pedido de retiro.
          </p>
        </div>
      ) : !data ? (
        <div className="flex flex-1 items-center justify-center text-white/40">
          <Loader2 className="size-6 animate-spin" aria-hidden />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-16">
          <div className="flex flex-col items-center gap-2 text-center">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                delivered
                  ? "bg-emerald-500/15 text-emerald-300"
                  : data.status === "CANCELLED"
                    ? "bg-red-500/15 text-red-300"
                    : "bg-white/[0.08] text-white/80"
              }`}
            >
              {delivered ? <Check className="size-3.5" aria-hidden /> : null}
              {STATUS_LABEL[data.status]}
            </span>
            <p className="mt-3 max-w-xs text-center text-sm leading-relaxed text-[#8E8E93]">
              {delivered
                ? "Tu pedido fue entregado. ¡Que lo disfrutes!"
                : "Mostrá este código en la barra: el barman ve tu pedido y te lo entrega."}
            </p>
          </div>

          <div className="rounded-2xl bg-[#1C1C1E] p-6">
            {qrSrc ? (
              <img
                src={qrSrc}
                alt="Código de retiro"
                className="max-w-[min(85vw,280px)] rounded-xl"
                width={280}
                height={280}
              />
            ) : (
              <div className="flex h-64 w-64 max-w-[85vw] items-center justify-center rounded-xl text-sm text-[#8E8E93]">
                Generando…
              </div>
            )}
          </div>

          <ul className="flex w-full max-w-xs flex-col gap-2">
            {data.items.map((item) => (
              <li
                key={item.productId}
                className="flex items-baseline justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.04] px-4 py-3"
              >
                <span className="font-semibold text-white">
                  {item.quantity}× {item.productName}
                </span>
                <span className="text-xs tabular-nums text-white/45">
                  {item.quantity === 1 ? "1 trago" : `${item.quantity} tragos`}
                </span>
              </li>
            ))}
          </ul>

          {receiptToken ? (
            <Link
              to={`/receipt/${receiptToken}`}
              className="text-[13px] text-white/45 underline decoration-white/15 underline-offset-4 hover:text-white"
            >
              Ver comprobante
            </Link>
          ) : null}
        </div>
      )}
    </div>
  )
}
