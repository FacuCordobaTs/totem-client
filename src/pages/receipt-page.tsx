import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Link, useLocation, useParams, useSearchParams } from "react-router"
import QRCode from "qrcode"
import { Copy, MoreHorizontal, X, Loader2 } from "lucide-react"
import { initMercadoPago, CardPayment } from "@mercadopago/sdk-react"
import { toast } from "sonner"
import { getApiBase, publicApiFetch } from "@/lib/api"
import type { ProcessBrickResponse, ReceiptApiResponse } from "@/types/api"
import { Button } from "@/components/ui/button"
import {
  amountStringToSdkNumber,
  consumptionStatusLabel,
  formatEventDate,
  formatEventDay,
  formatMoneyArsExact,
  formatPaymentMethod,
  ticketStatusLabel,
  truncateHash,
} from "@/lib/format"
import { AppleSheet } from "@/components/apple-sheet"

const MP_CHECKOUT_LAUNCHED_KEY = "mpCheckoutLaunched"

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
  const [searchParams] = useSearchParams()
  const fromCheckout =
    (location.state as { fromCheckout?: boolean } | null)?.fromCheckout === true

  const [data, setData] = useState<ReceiptApiResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showPurchaseBanner, setShowPurchaseBanner] = useState(fromCheckout)
  const [moreOpen, setMoreOpen] = useState(false)
  const [mpPreferenceLoading, setMpPreferenceLoading] = useState(false)
  const [mpBrickLoading, setMpBrickLoading] = useState(false)
  const [mpSessionLaunched, setMpSessionLaunched] = useState(false)
  const hadPendingPaymentRef = useRef(false)

  const mpCheckoutReturnParams = useMemo(
    () =>
      !!(
        searchParams.get("collection_id") ||
        searchParams.get("payment_id") ||
        searchParams.get("collection_status") ||
        searchParams.get("preference_id") ||
        searchParams.get("status")
      ),
    [searchParams]
  )

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

  useLayoutEffect(() => {
    if (!data) return
    if (data.sale.paid) return
    if (data.sale.status !== "PENDING" || data.sale.paymentMethod !== "CARD")
      return
    const pk = data.productora.mpPublicKey
    if (pk == null || pk === "") return
    try {
      initMercadoPago(pk, { locale: "es-AR" })
    } catch (e) {
      console.error("[Mercado Pago] initMercadoPago", e)
    }
  }, [
    data?.productora?.mpPublicKey,
    data?.sale?.id,
    data?.sale?.paid,
    data?.sale?.status,
    data?.sale?.paymentMethod,
  ])

  useEffect(() => {
    if (typeof window === "undefined" || !data?.sale.id) return
    if (data.sale.paid) {
      setMpSessionLaunched(false)
      return
    }
    setMpSessionLaunched(
      sessionStorage.getItem(MP_CHECKOUT_LAUNCHED_KEY) === data.sale.id
    )
  }, [data?.sale.id, data?.sale.paid, receiptToken])

  const shouldPoll =
    data != null &&
    data.sale.paid === false &&
    data.sale.status === "PENDING"

  useEffect(() => {
    if (!shouldPoll) return
    void load()
    const id = window.setInterval(() => {
      void load()
    }, 4000)
    const onVis = () => {
      if (document.visibilityState === "visible") void load()
    }
    document.addEventListener("visibilitychange", onVis)
    return () => {
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [shouldPoll, load])

  useEffect(() => {
    if (!data) return
    const pending = !data.sale.paid && data.sale.status === "PENDING"
    if (pending) hadPendingPaymentRef.current = true
    if (data.sale.paid && hadPendingPaymentRef.current) {
      toast.success("¡Pago confirmado!")
      hadPendingPaymentRef.current = false
      sessionStorage.removeItem(MP_CHECKOUT_LAUNCHED_KEY)
    }
  }, [data])

  if (!receiptToken) return null

  const showPaidContent = data?.sale.paid === true
  const showTransferBlock =
    data != null &&
    data.sale.paid === false &&
    data.sale.status !== "PAYMENT_FAILED" &&
    data.sale.paymentMethod === "TRANSFER"
  const showCardBrick =
    data != null &&
    data.sale.paid === false &&
    data.sale.status === "PENDING" &&
    data.sale.paymentMethod === "CARD"
  const showMpCheckoutCta =
    data != null &&
    data.sale.paid === false &&
    data.sale.status === "PENDING" &&
    data.sale.paymentMethod === "MERCADOPAGO"
  const showMpVerifying =
    showMpCheckoutCta && (mpSessionLaunched || mpCheckoutReturnParams)

  const handleCardPaymentSubmit = async (formData: {
    token: string
    issuer_id: string
    payment_method_id: string
    transaction_amount: number
    installments: number
    payer: { email?: string; identification?: { type?: string; number?: string } }
  }) => {
    if (!receiptToken) return
    setMpBrickLoading(true)
    try {
      const res = await fetch(`${getApiBase()}/api/mp/process-brick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: formData.token,
          installments: formData.installments,
          payment_method_id: formData.payment_method_id,
          issuer_id: formData.issuer_id,
          payer: {
            email: formData.payer?.email,
            identification: formData.payer?.identification
              ? {
                  type: formData.payer.identification.type,
                  number: formData.payer.identification.number,
                }
              : undefined,
          },
          receiptToken,
        }),
      })
      const json = (await res.json()) as ProcessBrickResponse
      if (!res.ok) {
        toast.error("No se pudo procesar el pago", {
          description:
            (typeof json.error === "string" && json.error) || "Intentá de nuevo",
        })
        throw new Error("mp_http_error")
      }
      if (json.success && json.status === "approved") {
        void load()
        return
      }
      if (json.success && json.status === "pending") {
        void load()
        toast.message("Pago en proceso", {
          description: "Te avisamos cuando se acredite. Podés dejar esta pantalla abierta.",
        })
        return
      }
      if (json.success && json.status === "rejected") {
        toast.error("Pago rechazado", {
          description:
            (typeof json.message === "string" && json.message) ||
            "Revisá los datos o probá con otra tarjeta.",
        })
        throw new Error("mp_rejected")
      }
      toast.error("No se pudo completar el pago", { description: "Intentá de nuevo." })
      throw new Error("mp_error")
    } catch (e) {
      const msg = e instanceof Error ? e.message : ""
      if (!["mp_http_error", "mp_rejected", "mp_error"].includes(msg)) {
        toast.error("Error de conexión al procesar el pago")
      }
    } finally {
      setMpBrickLoading(false)
    }
  }

  const handleMercadoPagoPreference = async () => {
    if (!data?.sale.id) return
    setMpPreferenceLoading(true)
    try {
      const res = await fetch(`${getApiBase()}/api/mp/crear-preferencia-externo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saleId: data.sale.id }),
      })
      const json = (await res.json()) as {
        success?: boolean
        url_pago?: string
        error?: string
      }
      if (json.success && json.url_pago) {
        sessionStorage.setItem(MP_CHECKOUT_LAUNCHED_KEY, data.sale.id)
        window.location.href = json.url_pago
        return
      }
      toast.error("No se pudo iniciar el pago", {
        description: json.error || "Intentá de nuevo.",
      })
    } catch {
      toast.error("Error de conexión", { description: "Intentá de nuevo." })
    } finally {
      setMpPreferenceLoading(false)
    }
  }

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
              ) : data.sale.paymentMethod === "TRANSFER" ? (
                <>
                  <span className="font-semibold text-white">Pendiente de pago.</span> Transferí el
                  monto exacto al alias o CVU indicado abajo. Cuando se acredite, habilitamos tus
                  códigos y te enviamos el email.
                </>
              ) : data.sale.paymentMethod === "CARD" ? (
                <>
                  <span className="font-semibold text-white">Pendiente de pago.</span> Completá el
                  pago con tarjeta abajo. Cuando se acredite, habilitamos tus códigos en esta
                  pantalla.
                </>
              ) : data.sale.paymentMethod === "MERCADOPAGO" ? (
                <>
                  <span className="font-semibold text-white">Pendiente de pago.</span> Aboná con
                  Mercado Pago; al volver, verificamos el pago automáticamente.
                </>
              ) : (
                <>
                  <span className="font-semibold text-white">Pendiente de pago.</span> Cuando se
                  acredite, habilitamos tus códigos.
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

            {showTransferBlock ? (
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

            {showCardBrick && data.productora.mpPublicKey ? (
              <section className="space-y-4 rounded-2xl border border-zinc-800/80 bg-[#1C1C1E] px-4 py-6">
                <h2 className="text-lg font-semibold text-white">Pago con tarjeta</h2>
                <p className="text-sm leading-relaxed text-[#8E8E93]">
                  Usá un medio seguro con Mercado Pago. No compartas esta pantalla mientras
                  completás el pago.
                </p>
                <div className="rounded-xl bg-black/30 p-2">
                  <CardPayment
                    key={`brick-${receiptToken}`}
                    locale="es-AR"
                    initialization={{
                      amount: amountStringToSdkNumber(data.sale.totalAmount),
                    }}
                    customization={{
                      paymentMethods: { maxInstallments: 12 },
                    }}
                    onSubmit={async (formData) => {
                      await handleCardPaymentSubmit(formData)
                    }}
                    onError={() => {
                      toast.error("No se pudo cargar el formulario de pago", {
                        description: "Actualizá la página o probá más tarde.",
                      })
                    }}
                  />
                </div>
                {mpBrickLoading ? (
                  <p className="flex items-center justify-center gap-2 text-sm text-[#8E8E93]">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Procesando pago…
                  </p>
                ) : null}
              </section>
            ) : null}

            {showCardBrick && !data.productora.mpPublicKey ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-950/20 px-4 py-5 text-sm text-[#8E8E93]">
                Este evento no tiene habilitada la clave pública de Mercado Pago. Contactá a la
                productora o elegí transferencia.
              </div>
            ) : null}

            {showMpCheckoutCta ? (
              <section className="space-y-4 rounded-2xl border border-[#009EE3]/25 bg-zinc-900/50 px-4 py-6">
                <h2 className="text-lg font-semibold text-white">Mercado Pago</h2>
                {showMpVerifying ? (
                  <div
                    className="flex flex-col items-center justify-center gap-3 py-8"
                    role="status"
                    aria-live="polite"
                  >
                    <Loader2 className="size-8 animate-spin text-[#009EE3]" aria-hidden />
                    <p className="text-center text-sm text-[#8E8E93]">
                      Verificando pago en Mercado Pago…
                    </p>
                    <p className="text-center text-xs text-zinc-500">
                      No cierres esta pestaña. Actualizamos el estado automáticamente.
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-sm leading-relaxed text-[#8E8E93]">
                      Te llevamos a Mercado Pago para abonar con el medio que prefieras. Al volver,
                      comprobamos el pago automáticamente.
                    </p>
                    <Button
                      type="button"
                      className="h-14 w-full rounded-xl bg-[#009EE3] text-base font-bold text-white hover:bg-[#008ed4]"
                      disabled={mpPreferenceLoading}
                      onClick={() => void handleMercadoPagoPreference()}
                    >
                      {mpPreferenceLoading ? (
                        <Loader2 className="size-6 animate-spin" aria-hidden />
                      ) : (
                        "Ir a Mercado Pago"
                      )}
                    </Button>
                  </>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 w-full rounded-xl text-[#8E8E93] hover:bg-white/5 hover:text-white"
                  onClick={() => void load()}
                >
                  Actualizar estado
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
                {data.sale.paid ? (
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
                ) : (
                  <p className="mt-4 text-[11px] leading-relaxed text-zinc-500">
                    Los códigos de entradas y consumos se mostrarán aquí para soporte una vez
                    acreditado el pago.
                  </p>
                )}
              </div>
            </div>
          </div>
        </AppleSheet>
      ) : null}
    </div>
  )
}
