import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router"
import Decimal from "decimal.js"
import { ArrowRight, Loader2 } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { ConsumptionMenu } from "@/components/consumption-menu"
import { publicApiFetch } from "@/lib/api"
import { formatMenuPrice } from "@/lib/format"
import {
  readGuestCart,
  readQuickPurchase,
  rememberQuickPurchase,
  shouldResumeReceipt,
  writeGuestCart,
} from "@/lib/quick-purchase"
import { useBuyerStore } from "@/stores/buyer-store"
import { useCartStore } from "@/stores/cart-store"
import type {
  GuestCheckoutResponse,
  PublicEventDetailResponse,
  ReceiptApiResponse,
} from "@/types/api"

/** Si el backend no responde a tiempo, el cliente igual ve la carta. */
async function resumableReceipt(token: string, createdAt: number): Promise<boolean> {
  try {
    const receipt = await publicApiFetch<ReceiptApiResponse>(
      `/public/receipts/${encodeURIComponent(token)}`
    )
    return shouldResumeReceipt(receipt, createdAt)
  } catch {
    return false
  }
}

/**
 * El link de acceso del evento (`/{slug}/acceso`), pensado para alguien parado en la barra: carta,
 * nombre y DNI, Mercado Pago y retiro. Sin login. Si el teléfono ya tiene una compra de este evento
 * por pagar o por retirar, reabrir el link lleva directo ahí.
 */
export function AccessStorePage({ eventIdentifier }: { eventIdentifier?: string } = {}) {
  const { slug: routeSlug } = useParams<{ slug?: string }>()
  const eventKey = eventIdentifier ?? routeSlug ?? ""
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const forceMenu = searchParams.get("carta") === "1"

  const requestPayment = useBuyerStore((state) => state.requestPayment)
  const requestIdentity = useBuyerStore((state) => state.requestIdentity)
  const closeSheet = useBuyerStore((state) => state.closeSheet)
  const setCart = useCartStore((state) => state.setCart)

  const [storedPurchase] = useState(() => readQuickPurchase(eventKey))
  const [resuming, setResuming] = useState(() => !forceMenu && storedPurchase != null)
  const [detail, setDetail] = useState<PublicEventDetailResponse | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [quantities, setQuantities] = useState<Record<string, number>>(() => readGuestCart(eventKey))

  useEffect(() => {
    if (!eventKey) return
    writeGuestCart(eventKey, quantities)
  }, [eventKey, quantities])

  useEffect(() => {
    if (!resuming || !storedPurchase) return
    let cancelled = false
    void (async () => {
      const candidates = [
        { token: storedPurchase.receiptToken, createdAt: storedPurchase.createdAt },
        ...(storedPurchase.paidReceiptToken &&
        storedPurchase.paidReceiptToken !== storedPurchase.receiptToken
          ? [{ token: storedPurchase.paidReceiptToken, createdAt: storedPurchase.createdAt }]
          : []),
      ]
      for (const candidate of candidates) {
        if (await resumableReceipt(candidate.token, candidate.createdAt)) {
          if (!cancelled) navigate(`/receipt/${encodeURIComponent(candidate.token)}/retirar`, { replace: true })
          return
        }
      }
      if (!cancelled) setResuming(false)
    })()
    return () => {
      cancelled = true
    }
  }, [navigate, resuming, storedPurchase])

  useEffect(() => {
    if (!eventKey) return
    let cancelled = false
    publicApiFetch<PublicEventDetailResponse>(`/public/events/${encodeURIComponent(eventKey)}`)
      .then((response) => {
        if (!cancelled) setDetail(response)
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [eventKey])

  // La venta de consumos se habilita por canal desde el admin: este link tiene el suyo y el
  // backend rechaza la compra si está apagado.
  const consumptionsEnabled = detail?.event.consumptionsOnAccessLinkEnabled ?? true
  const products = useMemo(() => {
    if (!detail) return null
    return consumptionsEnabled ? detail.drinkProducts : []
  }, [detail, consumptionsEnabled])

  const lines = useMemo(
    () =>
      (products ?? []).flatMap((product) => {
        const quantity = quantities[product.id] ?? 0
        return quantity > 0
          ? [{ productId: product.id, quantity, unitPrice: product.price }]
          : []
      }),
    [products, quantities]
  )
  const unitCount = lines.reduce((sum, line) => sum + line.quantity, 0)
  const total = lines
    .reduce((sum, line) => sum.plus(new Decimal(line.unitPrice).mul(line.quantity)), new Decimal(0))
    .toFixed(2)

  const add = (productId: string) =>
    setQuantities((current) => ({ ...current, [productId]: Math.min(99, (current[productId] ?? 0) + 1) }))
  const remove = (productId: string) =>
    setQuantities((current) => {
      const next = { ...current }
      const quantity = (next[productId] ?? 0) - 1
      if (quantity <= 0) delete next[productId]
      else next[productId] = quantity
      return next
    })

  const payWithMercadoPago = async (identity: { name: string; dni: string }) => {
    if (!detail) return
    const checkout = await publicApiFetch<GuestCheckoutResponse>("/public/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: detail.event.id,
        channel: "ACCESS_LINK",
        paymentMethod: "MERCADOPAGO",
        clientTotal: total,
        contact: { name: identity.name, dni: identity.dni, email: "", phone: "" },
        ticketLines: [],
        transportLines: [],
        drinkLines: lines.map(({ productId, quantity }) => ({ productId, quantity })),
      }),
    })
    if (!checkout.redirectUrl) throw new Error("No se pudo abrir Mercado Pago. Probá de nuevo.")

    rememberQuickPurchase({
      eventKeys: [eventKey, detail.event.id, detail.event.slug],
      receiptToken: checkout.receiptToken,
      paymentUrl: checkout.redirectUrl,
    })
    closeSheet()
    // Esta entrada del historial pasa a ser el retiro: volver de Mercado Pago —con el botón de
    // atrás o cambiando de la app a esta pestaña— ya cae en la pantalla de la compra, no en la carta.
    navigate(`/receipt/${encodeURIComponent(checkout.receiptToken)}/retirar`, { replace: true })
    window.location.assign(checkout.redirectUrl)
  }

  const continueToPayment = () => {
    if (!detail || unitCount === 0) return
    if (detail.productora.paymentMethods.mercadoPago) {
      requestPayment({
        label: `Ir a Mercado Pago · ${formatMenuPrice(total)}`,
        pay: payWithMercadoPago,
      })
      return
    }
    // Sin Mercado Pago conectado, el checkout ofrece los medios que tenga la productora.
    setCart({
      eventId: detail.event.id,
      eventName: detail.event.name,
      productoraName: detail.productora.name,
      channel: "ACCESS_LINK",
      ticketLines: [],
      drinkLines: lines,
    })
    requestIdentity(
      `/checkout/${detail.event.id}?volver=${encodeURIComponent(window.location.pathname)}`
    )
  }

  if (resuming) {
    return (
      <div role="status" aria-label="Cargando" className="flex min-h-dvh items-center justify-center text-white/60">
        <Loader2 className="size-6 animate-spin" aria-hidden />
      </div>
    )
  }

  if (loadFailed) {
    return (
      <main className="flex min-h-dvh flex-col justify-center gap-2 px-6">
        <h1 className="text-2xl font-bold tracking-tight text-white">Este evento no está disponible</h1>
        <p className="text-[15px] leading-relaxed text-white/60">
          Revisá que el link esté completo o pedíselo a quien te lo compartió.
        </p>
      </main>
    )
  }

  const pickupToken = storedPurchase?.paidReceiptToken ?? null

  return (
    <main className={`mx-auto min-h-dvh w-full max-w-lg px-4 ${unitCount > 0 ? "pb-32" : "pb-12"}`}>
      <header className="flex min-h-14 items-center justify-between gap-4 pt-[env(safe-area-inset-top)]">
        <h1 className="min-w-0 truncate text-[15px] font-semibold text-white/70">
          {detail?.event.name ?? ""}
        </h1>
        {pickupToken ? (
          <Link
            to={`/receipt/${encodeURIComponent(pickupToken)}/retirar`}
            className="flex h-11 shrink-0 items-center text-[15px] font-semibold text-white underline decoration-white/30 underline-offset-4"
          >
            Retirar lo comprado
          </Link>
        ) : null}
      </header>

      {products === null ? (
        <div role="status" aria-label="Cargando la carta" className="flex flex-col gap-3 pt-6">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="h-12 animate-pulse rounded-xl bg-white/[0.06]" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <p className="pt-16 text-center text-[17px] leading-snug text-white/70">
          Todavía no hay consumos a la venta para este evento.
        </p>
      ) : (
        <ConsumptionMenu
          products={products}
          categories={detail?.productCategories}
          quantities={quantities}
          onAdd={add}
          onRemove={remove}
        />
      )}

      <AnimatePresence>
        {unitCount > 0 ? (
          <motion.div
            key="continue"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-black via-black to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8"
          >
            <div className="mx-auto max-w-lg">
              <button
                type="button"
                onClick={continueToPayment}
                className="pointer-events-auto flex h-14 w-full items-center gap-3 rounded-2xl bg-white pl-5 pr-4 text-black shadow-[0_8px_30px_rgba(0,0,0,0.6)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black active:bg-zinc-200"
              >
                <span className="text-[17px] font-bold tabular-nums">{formatMenuPrice(total)}</span>
                <span className="text-sm font-medium text-black/70 tabular-nums">
                  {unitCount} {unitCount === 1 ? "producto" : "productos"}
                </span>
                <span className="ml-auto flex items-center gap-1.5 text-[17px] font-bold">
                  Continuar
                  <ArrowRight className="size-5" aria-hidden />
                </span>
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  )
}
