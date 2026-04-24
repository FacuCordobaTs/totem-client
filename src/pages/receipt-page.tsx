import { useCallback, useEffect, useState } from "react"
import { Link, useLocation, useParams } from "react-router"
import QRCode from "qrcode"
import { Copy, MoreHorizontal, X } from "lucide-react"
import { toast } from "sonner"
import { publicApiFetch } from "@/lib/api"
import type { ReceiptApiResponse } from "@/types/api"
import { Button } from "@/components/ui/button"
import {
  consumptionStatusLabel,
  formatEventDate,
  formatEventDay,
  formatMoneyArsExact,
  formatPaymentMethod,
  ticketStatusLabel,
  truncateHash,
} from "@/lib/format"
import { AppleSheet } from "@/components/apple-sheet"

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
      color: { dark: "#fafafa", light: "#121212" },
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
      <div className="flex flex-col items-center gap-4 rounded-2xl bg-[#1C1C1E] px-4 py-8 opacity-50 grayscale">
        <p className="max-w-[220px] text-center text-sm text-[#8E8E93]">{label}</p>
        <div className="flex size-[200px] items-center justify-center rounded-xl border border-dashed border-zinc-700/50">
          <span className="text-xs font-semibold uppercase tracking-widest text-[#8E8E93]">
            Canjeada
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl bg-[#1C1C1E] px-4 py-6">
      <p className="max-w-[240px] text-center text-sm text-[#8E8E93]">{label}</p>
      {src ? (
        <img src={src} alt="" className="size-[200px] rounded-xl" width={200} height={200} />
      ) : (
        <div className="flex size-[200px] items-center justify-center text-sm text-[#8E8E93]">
          …
        </div>
      )}
      <Link
        to={`/qr/${encodeURIComponent(hash)}`}
        className="text-sm text-[#8E8E93] underline decoration-zinc-600 underline-offset-4 hover:text-white"
      >
        Pantalla completa
      </Link>
    </div>
  )
}

async function copyText(label: string, value: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(`${label} copiado`)
  } catch {
    toast.error("No se pudo copiar")
  }
}

export function ReceiptPage() {
  const { receiptToken } = useParams<{ receiptToken: string }>()
  const location = useLocation()
  const fromCheckout =
    (location.state as { fromCheckout?: boolean } | null)?.fromCheckout === true

  const [data, setData] = useState<ReceiptApiResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showPurchaseBanner, setShowPurchaseBanner] = useState(fromCheckout)
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    if (!fromCheckout) return
    setShowPurchaseBanner(true)
    const t = window.setTimeout(() => setShowPurchaseBanner(false), 12000)
    return () => window.clearTimeout(t)
  }, [fromCheckout, receiptToken])

  const load = useCallback(async () => {
    if (!receiptToken) return
    try {
      const d = await publicApiFetch<ReceiptApiResponse>(
        `/public/receipts/${receiptToken}`
      )
      setData(d)
      setError(null)
    } catch {
      setData(null)
      setError("Comprobante no encontrado.")
    }
  }, [receiptToken])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!data) return
    if (data.sale.paid === true) return
    if (data.sale.status === "PAYMENT_FAILED") return
    const id = window.setInterval(() => {
      void load()
    }, 12000)
    return () => window.clearInterval(id)
  }, [data, load])

  if (!receiptToken) return null

  const showPaidContent = data?.sale.paid === true
  const showPendingTransfer =
    data != null &&
    data.sale.paid === false &&
    data.sale.status !== "PAYMENT_FAILED"

  return (
    <div className="min-h-dvh pb-28">
      <header className="sticky top-0 z-30 border-b border-zinc-800/50 bg-black/70 px-6 py-4 backdrop-blur-xl sm:px-8">
        <div className="mx-auto flex max-w-lg items-start justify-between gap-4">
          <div className="min-w-0 flex-1 pt-1">
            <p className="text-sm text-[#8E8E93]">Comprobante</p>
            {data ? (
              <h1 className="mt-1 truncate text-lg font-bold tracking-tight text-white">
                {data.event.name}
              </h1>
            ) : null}
          </div>
          {data ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0 rounded-xl text-[#8E8E93] hover:bg-white/5 hover:text-white"
              aria-label="Más opciones"
              onClick={() => setMoreOpen(true)}
            >
              <MoreHorizontal className="size-5" />
            </Button>
          ) : null}
        </div>
      </header>

      <div className="mx-auto flex max-w-lg flex-col gap-8 px-6 pt-8 sm:px-8">
        {showPurchaseBanner && data ? (
          <div
            role="status"
            className="flex items-start gap-3 rounded-2xl bg-white/5 px-4 py-4"
          >
            <p className="flex-1 text-sm leading-relaxed text-[#8E8E93]">
              {data.sale.paid ? (
                <>
                  <span className="font-semibold text-white">Listo.</span> Mostrá los QR en ingreso o
                  barra cuando te lo pidan.
                </>
              ) : (
                <>
                  <span className="font-semibold text-white">Pendiente de pago.</span> Transferí el
                  monto exacto al alias o CVU indicado abajo. Cuando se acredite, habilitamos tus
                  códigos y te enviamos el email.
                </>
              )}
            </p>
            <button
              type="button"
              className="shrink-0 rounded-lg p-1 text-[#8E8E93] hover:bg-white/10 hover:text-white"
              aria-label="Cerrar"
              onClick={() => setShowPurchaseBanner(false)}
            >
              <X className="size-4" />
            </button>
          </div>
        ) : null}

        {error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : !data ? (
          <p className="text-sm text-[#8E8E93]">Cargando…</p>
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-sm text-[#8E8E93]">{data.productora.name}</p>
              <p className="text-sm text-[#8E8E93]">{formatEventDay(data.event.date)}</p>
              <p className="pt-4 text-2xl font-bold tabular-nums text-white">
                {formatMoneyArsExact(data.sale.totalAmount)}
              </p>
            </div>

            {data.sale.status === "PAYMENT_FAILED" ? (
              <div className="rounded-2xl border border-red-500/25 bg-red-950/20 px-4 py-5">
                <p className="text-sm font-medium text-red-200">Pago no acreditado</p>
                <p className="mt-2 text-sm leading-relaxed text-[#8E8E93]">
                  No pudimos completar el cobro. Si ya transferiste, puede demorar la acreditación;
                  si el problema persiste, contactá a la productora con este comprobante.
                </p>
              </div>
            ) : null}

            {showPendingTransfer ? (
              <section className="space-y-5 rounded-2xl border border-amber-500/20 bg-amber-950/15 px-4 py-6">
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold tracking-tight text-amber-100">
                    Pendiente de pago
                  </h2>
                  <p className="text-sm leading-relaxed text-[#8E8E93]">
                    Transferí{" "}
                    <span className="font-semibold text-white">
                      exactamente {formatMoneyArsExact(data.sale.totalAmount)}
                    </span>{" "}
                    al siguiente alias o CVU. Usá el mismo importe (centavos incluidos) para que el
                    sistema pueda validar el pago. Cuando Cucuru confirme la transferencia,
                    habilitamos tus códigos QR en esta página y enviamos el email a tu casilla.
                  </p>
                  <p className="font-mono text-sm text-zinc-400">
                    Importe exacto (referencia):{" "}
                    <span className="text-white">{data.sale.totalAmount}</span> ARS
                  </p>
                </div>

                {data.sale.cucuruAlias ? (
                  <div className="rounded-xl bg-black/35 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8E8E93]">
                      Alias
                    </p>
                    <p className="mt-2 break-all font-mono text-base text-white">
                      {data.sale.cucuruAlias}
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      className="mt-4 h-11 w-full gap-2 rounded-xl border-zinc-600 bg-zinc-800 text-white hover:bg-zinc-700"
                      onClick={() =>
                        void copyText("Alias", data.sale.cucuruAlias as string)
                      }
                    >
                      <Copy className="size-4" aria-hidden />
                      Copiar alias
                    </Button>
                  </div>
                ) : null}

                {data.sale.cucuruCvu ? (
                  <div className="rounded-xl bg-black/35 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8E8E93]">
                      CVU
                    </p>
                    <p className="mt-2 break-all font-mono text-base text-white">
                      {data.sale.cucuruCvu}
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      className="mt-4 h-11 w-full gap-2 rounded-xl border-zinc-600 bg-zinc-800 text-white hover:bg-zinc-700"
                      onClick={() => void copyText("CVU", data.sale.cucuruCvu as string)}
                    >
                      <Copy className="size-4" aria-hidden />
                      Copiar CVU
                    </Button>
                  </div>
                ) : null}

                {!data.sale.cucuruAlias && !data.sale.cucuruCvu ? (
                  <p className="text-sm text-amber-200/90">
                    No encontramos datos de transferencia para esta compra. Refrescá la página o
                    contactá soporte con el código de comprobante.
                  </p>
                ) : null}

                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full rounded-xl border-zinc-600 bg-transparent text-white hover:bg-white/5"
                  onClick={() => void load()}
                >
                  Ya transferí — actualizar
                </Button>
              </section>
            ) : null}

            {showPaidContent ? (
              <>
                <section className="space-y-4">
                  <h2 className="text-2xl font-bold tracking-tight text-white">Entradas</h2>
                  <div className="flex flex-col gap-8">
                    {data.tickets.length === 0 ? (
                      <p className="text-sm text-[#8E8E93]">Ninguna en esta compra.</p>
                    ) : (
                      data.tickets.map((t) => {
                        const active = t.status === "PENDING"
                        return (
                          <div key={t.id} className="space-y-3">
                            <div>
                              <p className="font-medium text-white">{t.ticketType.name}</p>
                              <p className="mt-1 text-sm text-[#8E8E93]">
                                {formatMoneyArsExact(t.ticketType.price)} ·{" "}
                                {ticketStatusLabel(t.status)}
                              </p>
                            </div>
                            <QrBlock
                              hash={t.qrHash}
                              active={active}
                              label={active ? "Mostrá este código en el ingreso" : "Entrada utilizada"}
                            />
                          </div>
                        )
                      })
                    )}
                  </div>
                </section>

                <section className="space-y-4">
                  <h2 className="text-2xl font-bold tracking-tight text-white">Consumos</h2>
                  <div className="flex flex-col gap-8">
                    {data.consumptions.length === 0 ? (
                      <p className="text-sm text-[#8E8E93]">Ninguno en esta compra.</p>
                    ) : (
                      data.consumptions.map((c) => {
                        const active = c.status === "PENDING"
                        return (
                          <div key={c.id} className="space-y-3">
                            <div>
                              <p className="font-medium text-white">{c.product.name}</p>
                              <p className="mt-1 text-sm text-[#8E8E93]">
                                {formatMoneyArsExact(c.product.price)} ·{" "}
                                {consumptionStatusLabel(c.status)}
                              </p>
                            </div>
                            <QrBlock
                              hash={c.qrHash}
                              active={active}
                              label={active ? "Canje en barra" : "Ya canjeada"}
                            />
                          </div>
                        )
                      })
                    )}
                  </div>
                </section>

                <p className="pb-8 text-center">
                  <Link
                    to={`/e/${data.event.id}`}
                    className="text-sm text-[#8E8E93] underline decoration-zinc-700 underline-offset-4 hover:text-white"
                  >
                    Volver al evento
                  </Link>
                </p>
              </>
            ) : null}
          </>
        )}
      </div>

      {data ? (
        <AppleSheet
          open={moreOpen}
          onOpenChange={setMoreOpen}
          title="Más"
          description="Acciones y datos para soporte."
        >
          <div className="flex flex-col gap-6">
            {data.sale.cucuruAlias ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#8E8E93]">
                  Copiar alias
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-12 justify-start gap-2 rounded-xl"
                  onClick={() => {
                    void copyText("Alias", data.sale.cucuruAlias as string)
                    setMoreOpen(false)
                  }}
                >
                  <Copy className="size-4 shrink-0" aria-hidden />
                  <span className="truncate font-mono text-sm">{data.sale.cucuruAlias}</span>
                </Button>
              </div>
            ) : null}
            {data.sale.cucuruCvu ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#8E8E93]">
                  Copiar CVU
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-12 justify-start gap-2 rounded-xl"
                  onClick={() => {
                    void copyText("CVU", data.sale.cucuruCvu as string)
                    setMoreOpen(false)
                  }}
                >
                  <Copy className="size-4 shrink-0" aria-hidden />
                  <span className="truncate font-mono text-sm">{data.sale.cucuruCvu}</span>
                </Button>
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="ghost"
                className="h-12 justify-start rounded-xl text-white hover:bg-white/10"
                onClick={() => setMoreOpen(false)}
              >
                Descargar QRs (próximamente)
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-12 justify-start rounded-xl text-white hover:bg-white/10"
                onClick={() => setMoreOpen(false)}
              >
                Apple Wallet (próximamente)
              </Button>
            </div>
            <div className="flex flex-col">
              <div className="ml-4 h-px shrink-0 bg-zinc-800/50" aria-hidden />
              <div className="pt-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#8E8E93]">
                  Detalle de compra
                </p>
                <p className="mt-3 text-sm text-[#8E8E93]">
                  Fecha:{" "}
                  <span className="text-white/90">
                    {data.sale.createdAt ? formatEventDate(data.sale.createdAt) : "—"}
                  </span>
                </p>
                <p className="mt-2 text-sm text-[#8E8E93]">
                  Pago:{" "}
                  <span className="text-white/90">
                    {formatPaymentMethod(data.sale.paymentMethod)}
                    {data.sale.paid ? " · Acreditado" : " · Pendiente"}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex flex-col">
              <div className="ml-4 h-px shrink-0 bg-zinc-800/50" aria-hidden />
              <div className="pt-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#8E8E93]">
                  Referencias (soporte)
                </p>
                <p className="mt-3 break-all font-mono text-[11px] leading-relaxed text-[#8E8E93]">
                  Pedido: {truncateHash(receiptToken, 12, 8)}
                </p>
                <ul className="mt-4 space-y-3">
                  {data.tickets.map((t, i) => (
                    <li
                      key={t.id}
                      className="font-mono text-[11px] leading-relaxed text-[#8E8E93]"
                    >
                      Entrada {i + 1}: {truncateHash(t.qrHash, 10, 6)}
                    </li>
                  ))}
                  {data.consumptions.map((c, i) => (
                    <li
                      key={c.id}
                      className="font-mono text-[11px] leading-relaxed text-[#8E8E93]"
                    >
                      Consumo {i + 1}: {truncateHash(c.qrHash, 10, 6)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </AppleSheet>
      ) : null}
    </div>
  )
}
