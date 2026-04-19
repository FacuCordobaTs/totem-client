import { useCallback, useEffect, useState } from "react"
import { Link, useParams } from "react-router"
import QRCode from "qrcode"
import { publicApiFetch } from "@/lib/api"
import type { ReceiptApiResponse } from "@/types/api"
import { Button } from "@/components/ui/button"
import { formatEventDateTime, formatMoneyArsExact } from "@/lib/format"
import { Download, Wallet } from "lucide-react"

function QrBlock({
  hash,
  active,
  label,
}: {
  hash: string
  active: boolean
  label: string
}) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!active) {
      setSrc(null)
      return
    }
    let cancelled = false
    QRCode.toDataURL(hash, {
      width: 200,
      margin: 1,
      color: { dark: "#fafafa", light: "#18181b" },
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
      <div className="flex flex-col items-center gap-3 border border-white/10 bg-zinc-950/20 p-4 opacity-55 grayscale">
        <p className="max-w-[220px] text-center text-xs text-zinc-500">{label}</p>
        <div className="flex size-[200px] items-center justify-center border border-dashed border-white/10">
          <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
            Consumido
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 border border-white/10 bg-zinc-950/80 p-4">
      <p className="max-w-[220px] text-center text-xs text-zinc-400">{label}</p>
      {src ? (
        <img src={src} alt="" className="size-[200px]" width={200} height={200} />
      ) : (
        <div className="flex size-[200px] items-center justify-center text-xs text-zinc-600">
          …
        </div>
      )}
    </div>
  )
}

export function ReceiptPage() {
  const { receiptToken } = useParams<{ receiptToken: string }>()
  const [data, setData] = useState<ReceiptApiResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!receiptToken) return
    publicApiFetch<ReceiptApiResponse>(`/public/receipts/${receiptToken}`)
      .then(setData)
      .catch(() => setError("Comprobante no encontrado."))
  }, [receiptToken])

  useEffect(() => {
    load()
  }, [load])

  if (!receiptToken) return null

  return (
    <div className="min-h-dvh bg-[#09090b] px-5 pb-24 pt-10 text-zinc-50">
      <div className="mx-auto flex max-w-lg flex-col gap-10">
        <header className="space-y-2 border-b border-white/10 pb-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">
            Comprobante
          </p>
          {error ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : !data ? (
            <p className="text-sm text-zinc-500">Cargando…</p>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                {data.event.name}
              </h1>
              <p className="text-sm text-zinc-400">{data.productora.name}</p>
              <p className="text-xs text-zinc-500">{formatEventDateTime(data.event.date)}</p>
              <p className="mt-4 text-sm text-zinc-300">
                Total{" "}
                <span className="tabular-nums text-white">
                  {formatMoneyArsExact(data.sale.totalAmount)}
                </span>
              </p>
            </>
          )}
        </header>

        {data ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-none border-white/20 bg-transparent text-zinc-200 hover:bg-white/5"
                onClick={() => {
                  /* mock: integración futura */
                }}
              >
                <Download className="mr-2 size-4" aria-hidden />
                Descargar QRs
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-none border-white/20 bg-transparent text-zinc-200 hover:bg-white/5"
                onClick={() => {
                  /* mock */
                }}
              >
                <Wallet className="mr-2 size-4" aria-hidden />
                Apple Wallet
              </Button>
            </div>

            <section className="space-y-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                Entradas
              </h2>
              <div className="flex flex-col gap-6">
                {data.tickets.length === 0 ? (
                  <p className="text-sm text-zinc-600">Sin entradas en esta compra.</p>
                ) : (
                  data.tickets.map((t) => {
                    const active = t.status === "PENDING"
                    return (
                      <div key={t.id} className="space-y-3">
                        <p className="text-sm font-medium text-zinc-200">
                          {t.ticketType.name}{" "}
                          <span className="text-zinc-500">
                            · {formatMoneyArsExact(t.ticketType.price)}
                          </span>
                        </p>
                        <QrBlock
                          hash={t.qrHash}
                          active={active}
                          label={active ? "Mostrá este QR en el ingreso" : "Entrada utilizada"}
                        />
                      </div>
                    )
                  })
                )}
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                Consumos
              </h2>
              <div className="flex flex-col gap-6">
                {data.consumptions.length === 0 ? (
                  <p className="text-sm text-zinc-600">Sin consumos en esta compra.</p>
                ) : (
                  data.consumptions.map((c) => {
                    const active = c.status === "PENDING"
                    return (
                      <div key={c.id} className="space-y-3">
                        <p className="text-sm font-medium text-zinc-200">
                          {c.product.name}{" "}
                          <span className="text-zinc-500">
                            · {formatMoneyArsExact(c.product.price)}
                          </span>
                        </p>
                        <QrBlock
                          hash={c.qrHash}
                          active={active}
                          label={active ? "Canje en barra" : "Canjeado"}
                        />
                      </div>
                    )
                  })
                )}
              </div>
            </section>
          </>
        ) : null}

        {data ? (
          <p className="text-center text-[10px] text-zinc-600">
            <Link to={`/e/${data.event.id}`} className="underline decoration-white/20">
              Volver al evento
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  )
}
