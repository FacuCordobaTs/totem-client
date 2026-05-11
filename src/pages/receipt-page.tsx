import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Link, useParams, useSearchParams } from "react-router"
import QRCode from "qrcode"
import {
  ArrowRight,
  BottleWine,
  Copy,
  Loader2,
  Minus,
  Ticket,
  Wine,
} from "lucide-react"
import { initMercadoPago } from "@mercadopago/sdk-react"
import { toast } from "sonner"
import { AnimatePresence, motion, useAnimationControls, type Transition } from "motion/react"
import Decimal from "decimal.js"
import {  publicApiFetch } from "@/lib/api"
import type {
  PublicDrinkProductItem,
  PublicEventDetailResponse,
  PublicProductSaleType,
  ReceiptApiResponse,
} from "@/types/api"
import { Button } from "@/components/ui/button"
import {
  consumptionStatusLabel,
  formatEventDate,
  formatMoneyArsExact,
  formatPaymentMethod,
  ticketStatusLabel,
  truncateHash,
} from "@/lib/format"
import { AppleSheet } from "@/components/apple-sheet"

const MP_CHECKOUT_LAUNCHED_KEY = "mpCheckoutLaunched"
const ADDON_PURCHASE_KEY = "addonPurchaseForReceipt"

const EASE_OUT: Transition = { duration: 0.32, ease: [0.22, 1, 0.36, 1] }
const SHELF_TRANSITION: Transition = { duration: 0.42, ease: [0.22, 1, 0.36, 1] }
const TAB_TRANSITION: Transition = { duration: 0.34, ease: [0.22, 1, 0.36, 1] }

type ReceiptTab = "tickets" | "consumos"
type ShelfKind = "glass" | "bottle" | "cart"

function productSaleType(p: PublicDrinkProductItem): PublicProductSaleType {
  return p.saleType ?? "GLASS"
}

// ──────────────────────────────────────────────────────────────────────────────
// QR block — cleaner, with more breathing room
// ──────────────────────────────────────────────────────────────────────────────
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
      width: 220,
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
      <div className="flex flex-col items-center gap-5 rounded-2xl px-4 py-10">
        <div className="flex size-[220px] items-center justify-center rounded-xl border border-dashed border-white/10">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
            Canjeada
          </span>
        </div>
        <p className="max-w-[240px] text-center text-sm text-white/40">{label}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-5 rounded-2xl px-4 py-8">
      {src ? (
        <img src={src} alt="" className="size-[220px] rounded-xl" width={220} height={220} />
      ) : (
        <div className="flex size-[220px] items-center justify-center text-sm text-white/40">…</div>
      )}
      <p className="max-w-[240px] text-center text-sm text-white/55">{label}</p>
      <Link
        to={`/qr/${encodeURIComponent(hash)}`}
        className="text-[13px] text-white/45 underline decoration-white/15 underline-offset-4 hover:text-white"
      >
        Pantalla completa
      </Link>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Tabs — minimal, animated underline (Arc / Claude style)
// ──────────────────────────────────────────────────────────────────────────────
function ReceiptTabs({
  value,
  onChange,
  showConsumos,
}: {
  value: ReceiptTab
  onChange: (v: ReceiptTab) => void
  showConsumos: boolean
}) {
  if (!showConsumos) return null
  return (
    <div className="flex items-center gap-8 border-b border-white/[0.07]">
      <TabButton
        active={value === "tickets"}
        onClick={() => onChange("tickets")}
        label="Tus tickets"
      />
      <TabButton
        active={value === "consumos"}
        onClick={() => onChange("consumos")}
        label="Comprar consumos"
      />
    </div>
  )
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative -mb-px py-4 text-[15px] font-semibold tracking-tight outline-none transition-colors focus-visible:text-white ${
        active ? "text-white" : "text-white/40 hover:text-white/65"
      }`}
    >
      {label}
      {active ? (
        <motion.div
          layoutId="receipt-tab-indicator"
          className="absolute -bottom-px left-0 right-0 h-px bg-white"
          transition={TAB_TRANSITION}
        />
      ) : null}
    </button>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Quantity badge + Product shelf row — mirrored from event-detail-page.tsx
// (kept local to keep the receipt page self-contained for now)
// ──────────────────────────────────────────────────────────────────────────────
function QuantityBadge({ value, size = "md" }: { value: number; size?: "sm" | "md" }) {
  const controls = useAnimationControls()
  const prevValue = useRef(value)
  const isSmall = size === "sm"

  useEffect(() => {
    if (prevValue.current !== value) {
      controls.start({
        scale: [1, 1.16, 1],
        transition: { duration: 0.34, times: [0, 0.42, 1], ease: [0.22, 1, 0.36, 1] },
      })
      prevValue.current = value
    }
  }, [value, controls])

  return (
    <motion.div
      animate={controls}
      className={`flex items-center justify-center rounded-full bg-white shadow-[0_8px_22px_-8px_rgba(0,0,0,0.75)] ${
        isSmall ? "h-6 min-w-[1.5rem] px-1.5" : "h-7 min-w-[1.75rem] px-2"
      }`}
    >
      <div className="relative flex h-full items-center overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={value}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className={`block tabular-nums font-bold leading-none text-black ${
              isSmall ? "text-xs" : "text-sm"
            }`}
          >
            {value}
          </motion.span>
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

function ProductShelfRow({
  name,
  imageUrl,
  priceStr,
  disabled,
  count,
  onAdd,
}: {
  name: string
  imageUrl?: string | null
  priceStr: string
  disabled: boolean
  count: number
  onAdd: () => void
  type: "glass" | "bottle"
}) {
  const [tapTick, setTapTick] = useState(0)
  const showPhoto = Boolean(imageUrl)

  const triggerAdd = () => {
    if (disabled) return
    onAdd()
    setTapTick((t) => t + 1)
  }

  if (showPhoto) {
    return (
      <motion.button
        type="button"
        disabled={disabled}
        onClick={triggerAdd}
        whileTap={disabled ? undefined : { scale: 0.988 }}
        className="group relative ml-6 aspect-[4/5] w-64 overflow-hidden rounded-2xl bg-zinc-950 text-left outline-none focus-visible:ring-2 focus-visible:ring-white/35 disabled:pointer-events-none disabled:opacity-45"
      >
        <img
          src={imageUrl!}
          alt={name}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.03]"
          loading="lazy"
          decoding="async"
        />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/95" />
        <div className="pointer-events-none absolute inset-x-0 top-0 pl-4 pr-16 pt-6">
          <p className="text-xl text-white">{name}</p>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 pb-6 pl-4">
          <p className="text-xl font-bold tabular-nums text-white/85">{priceStr}</p>
        </div>

        {tapTick > 0 ? (
          <motion.div
            key={`flash-${tapTick}`}
            aria-hidden
            initial={{ opacity: 0.9 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none absolute inset-0 rounded-2xl ring-[1.5px] ring-inset ring-white/55"
          />
        ) : null}

        <AnimatePresence>
          {count > 0 ? (
            <motion.div
              key="qty-badge"
              initial={{ opacity: 0, scale: 0.55, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.55, y: -4 }}
              transition={{ type: "spring", stiffness: 500, damping: 28 }}
              className="absolute right-4 top-6 z-10"
            >
              <QuantityBadge value={count} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.button>
    )
  }

  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={triggerAdd}
      whileTap={disabled ? undefined : { scale: 0.985 }}
      className="relative flex w-full items-center justify-between gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.04] px-4 py-3.5 text-left outline-none transition-colors hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-white/30 disabled:pointer-events-none disabled:opacity-45"
    >
      <p className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-white">{name}</p>
      <div className="flex shrink-0 items-center gap-3">
        <p className="text-sm font-medium tabular-nums text-white/50">{priceStr}</p>
        <AnimatePresence initial={false}>
          {count > 0 ? (
            <motion.div
              key="qty"
              initial={{ opacity: 0, scale: 0.5, width: 0 }}
              animate={{ opacity: 1, scale: 1, width: "auto" }}
              exit={{ opacity: 0, scale: 0.5, width: 0 }}
              transition={{ type: "spring", stiffness: 520, damping: 28 }}
              className="overflow-hidden"
            >
              <QuantityBadge value={count} size="sm" />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      {tapTick > 0 ? (
        <motion.div
          key={`flash-${tapTick}`}
          aria-hidden
          initial={{ opacity: 0.75 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none absolute inset-0 rounded-2xl ring-[1.5px] ring-inset ring-white/45"
        />
      ) : null}
    </motion.button>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Shelf rail (glass / bottle / cart) — mirrors event-detail-page
// ──────────────────────────────────────────────────────────────────────────────
function ShelfRail({
  shelf,
  onShelf,
  cartCount,
}: {
  shelf: ShelfKind
  onShelf: (s: ShelfKind) => void
  cartCount: number
}) {
  return (
    <nav
      className="pointer-events-auto fixed right-0 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-px rounded-l-[1.15rem] border border-r-0 border-white/[0.12] bg-zinc-950/[0.96] py-1 pl-1 shadow-[-14px_0_44px_-10px_rgba(0,0,0,0.88)] backdrop-blur-xl"
      aria-label="Secciones de consumos"
    >
      <motion.div layout className="flex flex-col gap-px" transition={SHELF_TRANSITION}>
        <ShelfButton
          id="shelf-glass"
          label="Ver copas"
          active={shelf === "glass"}
          onClick={() => onShelf("glass")}
        >
          <Wine className="size-[1.35rem]" strokeWidth={2} aria-hidden />
        </ShelfButton>
        <ShelfButton
          id="shelf-bottle"
          label="Ver botellas"
          active={shelf === "bottle"}
          onClick={() => onShelf("bottle")}
        >
          <BottleWine className="size-[1.35rem]" strokeWidth={2} aria-hidden />
        </ShelfButton>
        <ShelfButton
          id="shelf-cart"
          label="Ver pedido"
          active={shelf === "cart"}
          onClick={() => onShelf("cart")}
        >
          <span className="relative inline-flex">
            <Ticket className="size-[1.35rem]" strokeWidth={2} aria-hidden />
            {cartCount > 0 ? (
              <span className="absolute -right-2 -top-2 flex min-h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold tabular-nums text-black shadow-sm">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            ) : null}
          </span>
        </ShelfButton>
      </motion.div>
    </nav>
  )
}

function ShelfButton({
  id,
  label,
  active,
  onClick,
  children,
}: {
  id: string
  label: string
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      id={id}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`relative flex size-[3.25rem] items-center justify-center rounded-l-xl outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/35 ${
        active
          ? "bg-white text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]"
          : "text-white/70 hover:bg-white/[0.08] hover:text-white"
      }`}
    >
      {children}
    </button>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Async helpers
// ──────────────────────────────────────────────────────────────────────────────
async function copyText(label: string, value: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(`${label} copiado`)
  } catch {
    toast.error("No se pudo copiar")
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────────────────────────────────────
export function ReceiptPage() {
  const { receiptToken } = useParams<{ receiptToken: string }>()
  const [searchParams] = useSearchParams()

  const [data, setData] = useState<ReceiptApiResponse | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const hadPendingPaymentRef = useRef(false)

  const [addonProducts, setAddonProducts] = useState<PublicDrinkProductItem[] | null>(null)
  const [addonDrinks, setAddonDrinks] = useState<Record<string, number>>({})
  const [addonSubmitting, setAddonSubmitting] = useState(false)
  const [addonPolling, setAddonPolling] = useState(false)
  const consumptionsCountRef = useRef(0)

  const [activeTab, setActiveTab] = useState<ReceiptTab>("tickets")
  const [shelf, setShelf] = useState<ShelfKind>("glass")

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

  const load = useCallback(async () => {
    if (!receiptToken) return
    try {
      const d = await publicApiFetch<ReceiptApiResponse>(
        `/public/receipts/${receiptToken}`
      )
      setData(d)
    } catch {
      setData(null)
    }
  }, [receiptToken])

  useEffect(() => {
    void load()
  }, [load])

  useLayoutEffect(() => {
    if (!data) return
    if (data.sale.paid) return
    if (data.sale.status !== "PENDING" || data.sale.paymentMethod !== "CARD") return
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
      return
    }
  }, [data?.sale.id, data?.sale.paid, receiptToken])

  const shouldPoll =
    data != null && data.sale.paid === false && data.sale.status === "PENDING"

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

  useEffect(() => {
    if (!data?.sale.paid || !data.event?.id) return
    publicApiFetch<PublicEventDetailResponse>(`/public/events/${data.event.id}`)
      .then((r) => setAddonProducts(r.drinkProducts))
      .catch(() => setAddonProducts([]))
  }, [data?.sale.paid, data?.event?.id])

  useEffect(() => {
    if (!data?.sale.paid || !receiptToken) return
    try {
      if (sessionStorage.getItem(ADDON_PURCHASE_KEY) === receiptToken || mpCheckoutReturnParams) {
        setAddonPolling(true)
      }
    } catch {
      /* noop */
    }
  }, [data?.sale.paid, receiptToken, mpCheckoutReturnParams])

  useEffect(() => {
    if (!addonPolling) return
    void load()
    const id = window.setInterval(() => void load(), 4000)
    const timeout = window.setTimeout(() => {
      setAddonPolling(false)
      try {
        sessionStorage.removeItem(ADDON_PURCHASE_KEY)
      } catch {
        /* noop */
      }
    }, 2 * 60 * 1000)
    const onVis = () => {
      if (document.visibilityState === "visible") void load()
    }
    document.addEventListener("visibilitychange", onVis)
    return () => {
      window.clearInterval(id)
      window.clearTimeout(timeout)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [addonPolling, load])

  useEffect(() => {
    if (!data) return
    const count = data.consumptions.length
    if (count > consumptionsCountRef.current && consumptionsCountRef.current > 0 && addonPolling) {
      toast.success("¡Consumos agregados!")
      setAddonPolling(false)
      setActiveTab("tickets")
      setAddonDrinks({})
      try {
        sessionStorage.removeItem(ADDON_PURCHASE_KEY)
      } catch {
        /* noop */
      }
    }
    consumptionsCountRef.current = count
  }, [data?.consumptions.length, addonPolling])

  if (!receiptToken) return null

  const showPaidContent = data?.sale.paid === true

  // Addon (new) drink lines + total
  const addonDrinkLines = Object.entries(addonDrinks)
    .filter(([, q]) => q > 0)
    .map(([productId, quantity]) => ({ productId, quantity }))

  const addonTotalStr = useMemo(() => {
    return addonDrinkLines
      .reduce((sum, line) => {
        const p = addonProducts?.find((x) => x.id === line.productId)
        const price = new Decimal(p?.price ?? "0")
        return sum.plus(price.mul(line.quantity))
      }, new Decimal(0))
      .toFixed(2)
  }, [addonDrinkLines, addonProducts])

  const addonUnitCount = addonDrinkLines.reduce((a, l) => a + l.quantity, 0)

  const addonConsumptions = (data?.consumptions ?? []).filter((c) => c.isAddon)
  const regularConsumptions = (data?.consumptions ?? []).filter((c) => !c.isAddon)

  const consumosAvailable =
    showPaidContent && addonProducts !== null && addonProducts.length > 0

  // ─── Mercado Pago handlers ──────────────────────────────────────────────────
  const handleAddonCheckout = async () => {
    if (!addonDrinkLines.length || !receiptToken || addonSubmitting) return
    setAddonSubmitting(true)
    try {
      const result = await publicApiFetch<{
        success: boolean
        url_pago?: string
        error?: string
      }>(`/public/receipts/${receiptToken}/consumptions-checkout`, {
        method: "POST",
        body: JSON.stringify({ drinkLines: addonDrinkLines, clientTotal: addonTotalStr }),
        headers: { "Content-Type": "application/json" },
      })
      if (!result.success || !result.url_pago) {
        toast.error(result.error ?? "No se pudo iniciar el pago")
        return
      }
      try {
        sessionStorage.setItem(ADDON_PURCHASE_KEY, receiptToken)
      } catch {
        /* noop */
      }
      window.location.href = result.url_pago
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al iniciar el pago")
    } finally {
      setAddonSubmitting(false)
    }
  }

  // Add/remove helpers for the consumos tab
  const bumpAddon = (productId: string) => {
    setAddonDrinks((prev) => ({
      ...prev,
      [productId]: Math.min(99, (prev[productId] ?? 0) + 1),
    }))
  }
  const trimAddon = (productId: string) => {
    setAddonDrinks((prev) => {
      const next = (prev[productId] ?? 0) - 1
      const copy = { ...prev }
      if (next <= 0) delete copy[productId]
      else copy[productId] = next
      return copy
    })
  }

  const onConsumosTab = activeTab === "consumos" && consumosAvailable
  const showFooter = onConsumosTab && addonUnitCount > 0

  return (
    <div className={`min-h-dvh ${showFooter ? "pb-44" : "pb-24"}`}>

      <div
        className={`mx-auto flex max-w-lg flex-col gap-10 px-6 pt-10 sm:px-8 ${
          onConsumosTab ? "pr-14 sm:pr-[4.5rem]" : ""
        }`}
      >
            {/* ─── Paid: tabs + content ─── */}
            {showPaidContent ? (
              <>
                <ReceiptTabs
                  value={activeTab}
                  onChange={setActiveTab}
                  showConsumos={consumosAvailable}
                />

                      {/* ─── Cross-tab CTA: prompt to buy consumos ─── */}
                      {consumosAvailable && !addonPolling ? (
                        <button
                          type="button"
                          onClick={() => setActiveTab("consumos")}
                          className="group relative flex w-full flex-col gap-3 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] px-6 py-7 text-left outline-none transition-colors hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-white/30"
                        >
                          <div className="flex items-baseline justify-between gap-4">
                            <h3 className="text-lg font-semibold tracking-tight text-white">
                              Sumar consumos
                            </h3>
                            <ArrowRight
                              className="size-4 shrink-0 text-white/40 transition-transform group-hover:translate-x-0.5 group-hover:text-white"
                              aria-hidden
                            />
                          </div>
                          <p className="text-[14px] leading-relaxed text-white/55">
                            Comprá bebidas desde acá durante el evento. Te entregamos cada
                            una con un QR para mostrar en barra.
                          </p>
                        </button>
                      ) : null}
                <AnimatePresence mode="wait" initial={false}>
                  {activeTab === "tickets" ? (
                    <motion.div
                      key="tab-tickets"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={TAB_TRANSITION}
                      className="flex flex-col gap-12"
                    >

                      {/* ─── Addon consumos (recently added) ─── */}
                      {addonConsumptions.length > 0 ? (
                        <section className="space-y-6">
                          <div className="flex items-baseline gap-3">
                            <h2 className="text-2xl font-bold tracking-tight text-white">
                              Consumos
                            </h2>
                            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                              Nuevos
                            </span>
                          </div>
                          <div className="flex flex-col gap-10">
                            {addonConsumptions.map((c) => {
                              const active = c.status === "PENDING"
                              return (
                                <div key={c.id} className="space-y-4">
                                  <div>
                                    <p className="font-medium text-white">
                                      {c.product.name}
                                    </p>
                                    <p className="mt-1.5 text-sm text-white/45">
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
                            })}
                          </div>
                        </section>
                      ) : null}

                      {/* ─── Tickets ─── */}
                      {data.tickets.length > 0 ? (
                        <section className="space-y-6">
                          <h2 className="text-2xl font-bold tracking-tight text-white">
                            Entradas
                          </h2>
                          <div className="flex flex-col gap-10">
                            {data.tickets.map((t) => {
                              const active = t.status === "PENDING"
                              return (
                                <div key={t.id} className="space-y-4">
                                  <div>
                                    <p className="font-medium text-white">
                                      {t.ticketType.name}
                                    </p>
                                    <p className="mt-1.5 text-sm text-white/45">
                                      {formatMoneyArsExact(t.ticketType.price)} ·{" "}
                                      {ticketStatusLabel(t.status)}
                                    </p>
                                  </div>
                                  <QrBlock
                                    hash={t.qrHash}
                                    active={active}
                                    label={
                                      active
                                        ? "Mostrá este código en el ingreso"
                                        : "Entrada utilizada"
                                    }
                                  />
                                </div>
                              )
                            })}
                          </div>
                        </section>
                      ) : null}

                      {/* ─── Regular consumos (from the original sale) ─── */}
                      {regularConsumptions.length > 0 ? (
                        <section className="space-y-6">
                          <h2 className="text-2xl font-bold tracking-tight text-white">
                            Consumos
                          </h2>
                          <div className="flex flex-col gap-10">
                            {regularConsumptions.map((c) => {
                              const active = c.status === "PENDING"
                              return (
                                <div key={c.id} className="space-y-4">
                                  <div>
                                    <p className="font-medium text-white">
                                      {c.product.name}
                                    </p>
                                    <p className="mt-1.5 text-sm text-white/45">
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
                            })}
                          </div>
                        </section>
                      ) : null}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="tab-consumos"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={TAB_TRANSITION}
                      className="relative"
                    >
                      <ConsumosTabContent
                        addonProducts={addonProducts ?? []}
                        addonDrinks={addonDrinks}
                        shelf={shelf}
                        onAdd={bumpAddon}
                        onRemove={trimAddon}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            ) : null}
      </div>

      {/* ─── Shelf rail (only on consumos tab) ─── */}
      <AnimatePresence>
        {onConsumosTab ? (
          <motion.div
            key="rail"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={EASE_OUT}
          >
            <ShelfRail shelf={shelf} onShelf={setShelf} cartCount={addonUnitCount} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ─── Footer: Pagar (exact same shape as event-detail-page) ─── */}
      <AnimatePresence>
        {showFooter ? (
          <motion.div
            key="pay-bar"
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={EASE_OUT}
            className="fixed bottom-0 left-0 right-0 z-40 bg-black/40 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-lg supports-[backdrop-filter]:bg-black/40 sm:px-8"
          >
            <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-white/65">Total</span>
                <motion.span
                  key={addonTotalStr}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="text-xl font-bold tabular-nums tracking-tight text-white sm:text-2xl"
                >
                  {formatMoneyArsExact(addonTotalStr)}
                </motion.span>
              </div>
              <Button
                className="h-14 w-full rounded-2xl bg-white font-semibold text-black transition-all disabled:shadow-none"
                disabled={addonSubmitting || addonUnitCount === 0}
                onClick={() => void handleAddonCheckout()}
              >
                {addonSubmitting ? (
                  <Loader2 className="size-6 animate-spin" aria-hidden />
                ) : (
                  "Pagar"
                )}
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ─── More options sheet ─── */}
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
                <p className="text-xs font-semibold uppercase tracking-wider text-white/45">
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
                <p className="text-xs font-semibold uppercase tracking-wider text-white/45">
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
              <div className="ml-4 h-px shrink-0 bg-white/[0.08]" aria-hidden />
              <div className="pt-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/45">
                  Detalle de compra
                </p>
                <p className="mt-3 text-sm text-white/55">
                  Fecha:{" "}
                  <span className="text-white/90">
                    {data.sale.createdAt ? formatEventDate(data.sale.createdAt) : "—"}
                  </span>
                </p>
                <p className="mt-2 text-sm text-white/55">
                  Pago:{" "}
                  <span className="text-white/90">
                    {formatPaymentMethod(data.sale.paymentMethod)}
                    {data.sale.paid ? " · Acreditado" : " · Pendiente"}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex flex-col">
              <div className="ml-4 h-px shrink-0 bg-white/[0.08]" aria-hidden />
              <div className="pt-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/45">
                  Referencias (soporte)
                </p>
                <p className="mt-3 break-all font-mono text-[11px] leading-relaxed text-white/45">
                  Pedido: {truncateHash(receiptToken, 12, 8)}
                </p>
                {data.sale.paid ? (
                  <ul className="mt-4 space-y-3">
                    {data.tickets.map((t, i) => (
                      <li
                        key={t.id}
                        className="font-mono text-[11px] leading-relaxed text-white/45"
                      >
                        Entrada {i + 1}: {truncateHash(t.qrHash, 10, 6)}
                      </li>
                    ))}
                    {data.consumptions.map((c, i) => (
                      <li
                        key={c.id}
                        className="font-mono text-[11px] leading-relaxed text-white/45"
                      >
                        Consumo {i + 1}: {truncateHash(c.qrHash, 10, 6)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-[11px] leading-relaxed text-white/35">
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

// ──────────────────────────────────────────────────────────────────────────────
// Consumos tab content — three shelves (glass / bottle / cart),
// product cards visually identical to event-detail-page.
// ──────────────────────────────────────────────────────────────────────────────
function ConsumosTabContent({
  addonProducts,
  addonDrinks,
  shelf,
  onAdd,
  onRemove,
}: {
  addonProducts: PublicDrinkProductItem[]
  addonDrinks: Record<string, number>
  shelf: ShelfKind
  onAdd: (productId: string) => void
  onRemove: (productId: string) => void
}) {
  const glassProducts = useMemo(
    () => addonProducts.filter((p) => productSaleType(p) === "GLASS"),
    [addonProducts]
  )
  const bottleProducts = useMemo(
    () => addonProducts.filter((p) => productSaleType(p) === "BOTTLE"),
    [addonProducts]
  )

  const cartLines = Object.entries(addonDrinks)
    .filter(([, q]) => q > 0)
    .map(([productId, quantity]) => {
      const p = addonProducts.find((x) => x.id === productId)
      return { productId, quantity, product: p }
    })
    .filter((l) => l.product)

  return (
    <div className="min-h-[60vh]">
      <AnimatePresence mode="wait" initial={false}>
        {shelf === "glass" ? (
          <motion.div
            key="panel-glass"
            role="tabpanel"
            aria-labelledby="shelf-glass"
            initial={{ opacity: 0, x: -36, filter: "blur(10px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, x: 28, filter: "blur(8px)" }}
            transition={SHELF_TRANSITION}
          >
            <ul className="flex flex-col gap-4">
              {glassProducts.length === 0 ? (
                <li className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-10 text-center text-sm text-white/45">
                  No hay copas para este evento.
                </li>
              ) : null}
              {glassProducts.map((p) => (
                <li key={p.id}>
                  <ProductShelfRow
                    name={p.name}
                    imageUrl={p.imageUrl?.trim() || null}
                    priceStr={formatMoneyArsExact(p.price)}
                    disabled={false}
                    count={addonDrinks[p.id] ?? 0}
                    type="glass"
                    onAdd={() => onAdd(p.id)}
                  />
                </li>
              ))}
            </ul>
          </motion.div>
        ) : shelf === "bottle" ? (
          <motion.div
            key="panel-bottle"
            role="tabpanel"
            aria-labelledby="shelf-bottle"
            initial={{ opacity: 0, x: 36, filter: "blur(10px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, x: -28, filter: "blur(8px)" }}
            transition={SHELF_TRANSITION}
          >
            <ul className="flex flex-col gap-4">
              {bottleProducts.length === 0 ? (
                <li className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-10 text-center text-sm text-white/45">
                  No hay botellas para este evento.
                </li>
              ) : null}
              {bottleProducts.map((p) => (
                <li key={p.id}>
                  <ProductShelfRow
                    name={p.name}
                    imageUrl={p.imageUrl?.trim() || null}
                    priceStr={formatMoneyArsExact(p.price)}
                    disabled={false}
                    count={addonDrinks[p.id] ?? 0}
                    type="bottle"
                    onAdd={() => onAdd(p.id)}
                  />
                </li>
              ))}
            </ul>
          </motion.div>
        ) : (
          <motion.div
            key="panel-cart"
            role="tabpanel"
            aria-labelledby="shelf-cart"
            initial={{ opacity: 0, x: 36, filter: "blur(10px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, x: -28, filter: "blur(8px)" }}
            transition={SHELF_TRANSITION}
          >
            {cartLines.length === 0 ? (
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-12 text-center text-sm text-white/45">
                Tu pedido está vacío.
              </div>
            ) : (
              <section className="space-y-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
                  Tu pedido
                </h3>
                <ul className="flex flex-col gap-3">
                  {cartLines.map((line) => {
                    const product = line.product!
                    const sub = new Decimal(product.price).mul(line.quantity).toFixed(2)
                    const saleType = productSaleType(product)
                    const DrinkIcon = saleType === "BOTTLE" ? BottleWine : Wine
                    return (
                      <li key={line.productId}>
                        <motion.div
                          layout
                          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                          className="relative mx-1"
                        >
                          <div
                            className="pointer-events-none absolute -left-3 top-1/2 z-10 size-6 -translate-y-1/2 rounded-full bg-black"
                            aria-hidden
                          />
                          <div
                            className="pointer-events-none absolute -right-3 top-1/2 z-10 size-6 -translate-y-1/2 rounded-full bg-black"
                            aria-hidden
                          />
                          <div className="flex items-center justify-between gap-4 bg-white px-6 py-5">
                            <div className="flex min-w-0 items-center gap-3">
                              <DrinkIcon
                                className="size-8 shrink-0 text-black"
                                strokeWidth={1.75}
                                aria-hidden
                              />
                              <p className="min-w-0 truncate text-sm font-bold text-black">
                                {line.quantity} {product.name}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <p className="text-base font-bold tabular-nums text-black">
                                {formatMoneyArsExact(sub)}
                              </p>
                              <button
                                type="button"
                                onClick={() => onRemove(line.productId)}
                                className="flex size-7 items-center justify-center rounded-full text-black/20 transition-colors hover:bg-black/5 hover:text-black/45"
                                aria-label={`Sacar un consumo ${product.name}`}
                              >
                                <Minus className="size-3.5" />
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}