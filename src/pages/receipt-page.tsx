import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router"
import QRCode from "qrcode"
import {
  ArrowLeft,
  ArrowRight,
  BottleWine,
  Coins,
  Copy,
  Loader2,
  Maximize2,
  Minus,
  PackageCheck,
  Plus,
  Ticket,
  Wine,
  UserRound,
} from "lucide-react"
import { initMercadoPago } from "@mercadopago/sdk-react"
import { toast } from "sonner"
import { AnimatePresence, motion, useAnimationControls, type Transition } from "motion/react"
import Decimal from "decimal.js"
import { publicApiFetch, publicWebSocketUrl } from "@/lib/api"
import type {
  BalanceDepositResponse,
  ConsumptionsCheckoutResponse,
  PickupApiResponse,
  PublicDrinkProductItem,
  PublicEventDetailResponse,
  PublicProductCategory,
  PublicProductSaleType,
  ReceiptApiResponse,
} from "@/types/api"
import { Button } from "@/components/ui/button"
import {
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

type ReceiptView = "home" | "tickets" | "consumos" | "shop" | "balance"
type ShelfKind = "glass" | "bottle" | "cart"

function productSaleType(p: PublicDrinkProductItem): PublicProductSaleType {
  return p.saleType ?? "GLASS"
}

const UNCATEGORIZED_KEY = "__uncat__"

type ProductCategoryGroup = {
  id: string
  name: string | null
  products: PublicDrinkProductItem[]
}

function groupProductsByCategory(
  products: PublicDrinkProductItem[],
  categories?: PublicProductCategory[]
): ProductCategoryGroup[] {
  const byCat = new Map<string, PublicDrinkProductItem[]>()
  for (const p of products) {
    const key = p.categoryId ?? UNCATEGORIZED_KEY
    const list = byCat.get(key) ?? []
    list.push(p)
    byCat.set(key, list)
  }
  const groups: ProductCategoryGroup[] = []
  for (const cat of categories ?? []) {
    const list = byCat.get(cat.id)
    if (list && list.length > 0) {
      groups.push({ id: cat.id, name: cat.name, products: list })
      byCat.delete(cat.id)
    }
  }
  for (const [key, list] of byCat) {
    if (key === UNCATEGORIZED_KEY) continue
    if (list.length > 0) {
      groups.push({ id: key, name: list[0].categoryName ?? null, products: list })
    }
  }
  const uncat = byCat.get(UNCATEGORIZED_KEY)
  if (uncat && uncat.length > 0) {
    groups.push({ id: UNCATEGORIZED_KEY, name: null, products: uncat })
  }
  return groups
}

function CategoryHeading({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 mt-1 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
      {children}
    </p>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// QR block — cleaner, with more breathing room
// ──────────────────────────────────────────────────────────────────────────────
function QrBlock({
  hash,
  active,
  receiptToken,
  ticketName,
  ticketPrice,
}: {
  hash: string
  active: boolean
  receiptToken: string
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
      width: 88,
      margin: 1,
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
      <div className="flex size-[4.5rem] items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-100">
          <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-400">
            Usada
          </span>
      </div>
    )
  }

  return (
    <div className="relative mx-auto w-fit">
      <Link
        to={`/qr/${encodeURIComponent(hash)}?layout=ticket&name=${encodeURIComponent(ticketName)}&price=${encodeURIComponent(ticketPrice)}&returnTo=${encodeURIComponent(`/receipt/${encodeURIComponent(receiptToken)}?view=tickets`)}`}
        aria-label="Ver código en pantalla completa"
        className="absolute -right-1.5 -top-1.5 z-10 flex size-7 items-center justify-center rounded-full border-2 border-white bg-zinc-950 text-white shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
      >
        <Maximize2 className="size-3" aria-hidden />
      </Link>
      {src ? (
        <img src={src} alt="Código QR de entrada" className="size-[4.5rem] rounded-lg" width={72} height={72} />
      ) : (
        <div className="flex size-[4.5rem] items-center justify-center text-sm text-zinc-400">…</div>
      )}
    </div>
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
  onRemove,
}: {
  name: string
  imageUrl?: string | null
  priceStr: string
  disabled: boolean
  count: number
  onAdd: () => void
  onRemove: () => void
}) {
  const [tapTick, setTapTick] = useState(0)
  const showPhoto = Boolean(imageUrl)

  const triggerAdd = () => {
    if (disabled) return
    onAdd()
    setTapTick((t) => t + 1)
  }

  return (
    <motion.div
      layout
      className={`group relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-white/[0.07] bg-zinc-950 text-left ${disabled ? "opacity-45" : ""}`}
    >
      {showPhoto ? (
        <img
          src={imageUrl!}
          alt={name}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.03]"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="absolute inset-0 bg-[#141414]" />
      )}
      {showPhoto ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/95" />
      ) : null}
      <motion.button
        type="button"
        disabled={disabled}
        onClick={triggerAdd}
        whileTap={disabled ? undefined : { scale: 0.985 }}
        aria-label={`Agregar ${name}`}
        className="absolute inset-0 z-10 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/35 disabled:pointer-events-none"
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[11] px-3 pt-3 pr-12">
        <p className="text-[15px] font-semibold leading-tight text-white sm:text-base">{name}</p>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[11] px-3 pb-3 pr-12">
        <p className="text-base font-bold tabular-nums text-white/85 sm:text-lg">{priceStr}</p>
      </div>

      {tapTick > 0 ? (
        <motion.div
          key={`flash-${tapTick}`}
          aria-hidden
          initial={{ opacity: 0.9 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none absolute inset-0 z-30 rounded-2xl ring-[1.5px] ring-inset ring-white/55"
        />
      ) : null}

      <AnimatePresence initial={false}>
        {count > 0 ? (
          <motion.div
            key="qty-controls"
            initial={{ opacity: 0, scale: 0.55, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.55, y: -4 }}
            transition={{ type: "spring", stiffness: 500, damping: 28 }}
            className="absolute right-2.5 top-2.5 z-20 flex items-center gap-1.5"
          >
            <button
              type="button"
              disabled={disabled}
              onClick={onRemove}
              aria-label={`Quitar ${name}`}
              className="flex size-7 items-center justify-center rounded-full bg-black/75 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-black disabled:pointer-events-none"
            >
              <Minus className="size-3.5" strokeWidth={2.5} aria-hidden />
            </button>
            <QuantityBadge value={count} size="sm" />
          </motion.div>
        ) : (
          <motion.span
            key="add-indicator"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            className="pointer-events-none absolute bottom-2.5 right-2.5 z-20 flex size-7 items-center justify-center rounded-full bg-white text-black"
          >
            <Plus className="size-3.5" strokeWidth={2.5} aria-hidden />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
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

function SectionHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-medium text-white/55 transition-colors hover:text-white"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Volver
      </button>
      <h1 className="text-3xl font-bold tracking-tight text-white">{title}</h1>
    </header>
  )
}

function NavigationCard({
  icon,
  title,
  detail,
  onClick,
}: {
  icon: ReactNode
  title: string
  detail?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-5 py-5 text-left outline-none transition-colors hover:bg-white/[0.07] focus-visible:ring-2 focus-visible:ring-white/30"
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/[0.07] text-white/80">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-3">
          <span className="text-[17px] font-semibold tracking-tight text-white">{title}</span>
          {detail ? <span className="text-sm font-semibold text-white/65">{detail}</span> : null}
        </span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-white/30 transition-transform group-hover:translate-x-0.5 group-hover:text-white/70" aria-hidden />
    </button>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────────────────────────────────────
export function ReceiptPage() {
  const { receiptToken } = useParams<{ receiptToken: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [data, setData] = useState<ReceiptApiResponse | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const hadPendingPaymentRef = useRef(false)

  const [addonProducts, setAddonProducts] = useState<PublicDrinkProductItem[] | null>(null)
  const [addonCategories, setAddonCategories] = useState<PublicProductCategory[]>([])
  const [addonDrinks, setAddonDrinks] = useState<Record<string, number>>({})
  const [addonSubmitting, setAddonSubmitting] = useState(false)
  const [addonPolling, setAddonPolling] = useState(false)
  const consumptionsCountRef = useRef(0)

  const [activeView, setActiveView] = useState<ReceiptView>(() =>
    searchParams.get("view") === "tickets" ? "tickets" : "home"
  )
  const [shelf, setShelf] = useState<ShelfKind>("glass")
  const [pickupMode, setPickupMode] = useState(false)
  const [pickupSelection, setPickupSelection] = useState<Record<string, number>>({})
  const [pickupSubmitting, setPickupSubmitting] = useState(false)

  // ─── Tarea 6.2 — Saldo (visión §2.7): bloque "Tu saldo" con carga (MP/transferencia)
  // y pago con saldo en el addon. ────────────────────────────────────────────────────
  const [depositOpen, setDepositOpen] = useState(false)
  const [depositAmount, setDepositAmount] = useState("")
  const [depositMethod, setDepositMethod] = useState<"MERCADOPAGO" | "TRANSFER">(
    "MERCADOPAGO"
  )
  const [depositSubmitting, setDepositSubmitting] = useState(false)
  const [depositTransfer, setDepositTransfer] = useState<{
    alias: string
    accountNumber: string
  } | null>(null)
  const [depositSubmitted, setDepositSubmitted] = useState(false)
  const [depositPolling, setDepositPolling] = useState(false)
  const depositInitialBalanceRef = useRef(0)
  const [addonMethod, setAddonMethod] = useState<"MERCADOPAGO" | "SALDO">("MERCADOPAGO")

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

  // El scanner de puerta y la barra notifican este comprobante al confirmar el canje.
  // Así el QR deja de verse disponible sin que el cliente tenga que recargar la página.
  useEffect(() => {
    if (!receiptToken) return
    let disposed = false
    let socket: WebSocket | null = null
    let retry: number | null = null

    const connect = () => {
      socket = new WebSocket(
        publicWebSocketUrl(`/ws/public/receipts/${encodeURIComponent(receiptToken)}`)
      )
      socket.onmessage = () => void load()
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
  }, [load, receiptToken])

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
      .then((r) => {
        setAddonProducts(r.drinkProducts)
        setAddonCategories(r.productCategories ?? [])
      })
      .catch(() => {
        setAddonProducts([])
        setAddonCategories([])
      })
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
      setActiveView("consumos")
      setAddonDrinks({})
      try {
        sessionStorage.removeItem(ADDON_PURCHASE_KEY)
      } catch {
        /* noop */
      }
    }
    consumptionsCountRef.current = count
  }, [data?.consumptions.length, addonPolling])

  // Tarea 6.2 — Depósito por transferencia: la acreditación la hace el webhook en segundo
  // plano; se sondea el comprobante hasta que el saldo sube (o se corta solo a los 3 min).
  useEffect(() => {
    if (!depositPolling) return
    void load()
    const id = window.setInterval(() => void load(), 4000)
    const timeout = window.setTimeout(() => setDepositPolling(false), 3 * 60 * 1000)
    return () => {
      window.clearInterval(id)
      window.clearTimeout(timeout)
    }
  }, [depositPolling, load])

  useEffect(() => {
    if (!depositPolling || !data) return
    if (parseFloat(data.balance.amount) > depositInitialBalanceRef.current) {
      setDepositPolling(false)
      toast.success("¡Saldo cargado!")
      setDepositOpen(false)
      setDepositSubmitted(false)
      setDepositTransfer(null)
      setDepositAmount("")
      setAddonMethod("MERCADOPAGO")
    }
  }, [depositPolling, data])

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

  if (!receiptToken) return null

  const addonUnitCount = addonDrinkLines.reduce((a, l) => a + l.quantity, 0)

  const consumosAvailable =
    showPaidContent && addonProducts !== null && addonProducts.length > 0

  // Hay tragos comprados y no canjeados → se habilita el retiro en barra (tarea 4.1).
  const hasPendingConsumptions = (data?.consumptions ?? []).some(
    (c) => c.status === "PENDING"
  )
  const consumptionGroups = [...(data?.consumptions ?? []).reduce((groups, consumption) => {
    const current = groups.get(consumption.product.id) ?? {
      id: consumption.product.id,
      name: consumption.product.name,
      pendingIds: [] as string[],
      pending: 0,
      redeemed: 0,
    }
    if (consumption.status === "PENDING") {
      current.pending += 1
      current.pendingIds.push(consumption.id)
    }
    if (consumption.status === "REDEEMED") current.redeemed += 1
    groups.set(consumption.product.id, current)
    return groups
  }, new Map<string, { id: string; name: string; pendingIds: string[]; pending: number; redeemed: number }>()).values()]

  const pickupTotal = Object.values(pickupSelection).reduce((total, quantity) => total + quantity, 0)

  const changePickupQuantity = (productId: string, change: number, max: number) => {
    setPickupSelection((current) => {
      const quantity = Math.max(0, Math.min(max, (current[productId] ?? 0) + change))
      const next = { ...current }
      if (quantity === 0) delete next[productId]
      else next[productId] = quantity
      return next
    })
  }

  const handlePickup = async () => {
    if (!pickupMode) {
      setPickupMode(true)
      return
    }
    if (pickupTotal === 0 || pickupSubmitting) return
    const consumptionIds = consumptionGroups.flatMap((group) =>
      group.pendingIds.slice(0, pickupSelection[group.id] ?? 0)
    )
    setPickupSubmitting(true)
    try {
      const pickup = await publicApiFetch<PickupApiResponse>("/public/pickups", {
        method: "POST",
        body: JSON.stringify({ receiptToken, consumptionIds }),
        headers: { "Content-Type": "application/json" },
      })
      navigate(`/retiro/${pickup.token}?receipt=${encodeURIComponent(receiptToken)}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo generar la orden")
    } finally {
      setPickupSubmitting(false)
    }
  }

  const cancelPickup = () => {
    setPickupMode(false)
    setPickupSelection({})
  }

  // ─── Pago handlers (addon) ───────────────────────────────────────────────────
  const handleAddonCheckout = async () => {
    if (!addonDrinkLines.length || !receiptToken || addonSubmitting) return
    setAddonSubmitting(true)
    try {
      const result = await publicApiFetch<ConsumptionsCheckoutResponse>(
        `/public/receipts/${receiptToken}/consumptions-checkout`,
        {
          method: "POST",
          body: JSON.stringify({
            drinkLines: addonDrinkLines,
            clientTotal: addonTotalStr,
            // Tarea 6.2 — SALDO: la sale queda COMPLETED al instante (el backend la
            // debita del saldo del cliente). Sin redirección: se refresca el comprobante.
            paymentMethod: addonMethod,
          }),
          headers: { "Content-Type": "application/json" },
        }
      )
      if (!result.success) {
        toast.error(result.error ?? "No se pudo iniciar el pago")
        return
      }
      if (addonMethod === "SALDO") {
        toast.success("¡Comprado con tu saldo!")
        setAddonDrinks({})
        setActiveView("consumos")
        await load()
        return
      }
      if (!result.url_pago) {
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

  // ─── Tarea 6.2 — Carga de saldo (visión §2.7) ────────────────────────────────
  // El contacto se reusa del snapshot de esta compra (el cliente ya está identificado):
  // el backend solo necesita el `receiptToken` de este comprobante.
  const handleDeposit = async () => {
    const amt = depositAmount.trim()
    if (!/^\d+(\.\d{1,2})?$/.test(amt) || parseFloat(amt) <= 0 || depositSubmitting) return
    if (!data?.event?.id || !receiptToken) return
    setDepositSubmitting(true)
    try {
      const res = await publicApiFetch<BalanceDepositResponse>(
        `/public/events/${data.event.id}/balance/deposit`,
        {
          method: "POST",
          body: JSON.stringify({
            amount: amt,
            paymentMethod: depositMethod,
            receiptToken,
          }),
          headers: { "Content-Type": "application/json" },
        }
      )
      if (depositMethod === "MERCADOPAGO" && res.redirectUrl) {
        window.location.href = res.redirectUrl
        return
      }
      if (depositMethod === "TRANSFER" && res.transfer) {
        depositInitialBalanceRef.current = parseFloat(data.balance.amount)
        setDepositTransfer(res.transfer)
        setDepositSubmitted(true)
        setDepositPolling(true)
        return
      }
      toast.error("No se pudo iniciar la carga de saldo")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo iniciar la carga de saldo")
    } finally {
      setDepositSubmitting(false)
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

  const onShopView = activeView === "shop" && consumosAvailable
  const showFooter = onShopView && addonUnitCount > 0
  const showBuyMoreFooter = activeView === "consumos" && (consumosAvailable || pickupMode)

  // Tarea 6.2 — Con saldo, el addon ofrece pagar con saldo (sin tarjeta ni transferencia).
  const addonBalanceAvailable = parseFloat(data?.balance?.amount ?? "0") > 0

  return (
    <div className={`min-h-dvh ${showFooter ? "pb-44" : showBuyMoreFooter ? "pb-28" : "pb-24"}`}>

      <div
        className={`mx-auto flex max-w-lg flex-col gap-10 px-6 pt-10 sm:px-8 ${
          onShopView ? "pr-14 sm:pr-[4.5rem]" : ""
        }`}
      >
        {data ? (
          <div className="flex justify-end">
            <Link
              to={`/mi-cuenta/${encodeURIComponent(receiptToken)}`}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white/65"
            >
              <UserRound className="size-3.5" aria-hidden />
              Mis eventos
            </Link>
          </div>
        ) : null}
        {!data ? (
          <div className="flex items-center justify-center py-24 text-white/40">
            <Loader2 className="size-6 animate-spin" aria-hidden />
          </div>
        ) : !showPaidContent ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-6 py-8 text-center">
            <p className="text-lg font-semibold tracking-tight text-white">Pago pendiente</p>
            <p className="mx-auto max-w-[280px] text-sm leading-relaxed text-white/50">
              {formatMoneyArsExact(data.sale.totalAmount)} · {formatPaymentMethod(data.sale.paymentMethod)}.
              Cuando se acredite vas a encontrar acá tus entradas, consumos y saldo.
            </p>
          </div>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeView}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={TAB_TRANSITION}
              className="flex flex-col gap-8"
            >
              {activeView === "home" ? (
                <>
                  <header className="space-y-3 pb-2">
                    <p className="text-sm font-medium text-white/45">{data.event.name}</p>
                    <h1 className="text-4xl font-bold tracking-[-0.035em] text-white">
                      Hola, {data.customerName}
                    </h1>
                    <p className="max-w-sm text-[15px] leading-relaxed text-white/50">
                      Todo lo que necesitás para disfrutar el evento está acá.
                    </p>
                  </header>
                  <nav className="flex flex-col gap-3" aria-label="Tu cuenta para el evento">
                    <NavigationCard
                      icon={<Ticket className="size-5" aria-hidden />}
                      title="Tus entradas"
                      detail={`${data.tickets.length}`}
                      onClick={() => setActiveView("tickets")}
                    />
                    <NavigationCard
                      icon={<Wine className="size-5" aria-hidden />}
                      title="Tus consumos"
                      detail={`${data.consumptions.filter((c) => c.status === "PENDING").length}`}
                      onClick={() => setActiveView("consumos")}
                    />
                    <NavigationCard
                      icon={<Coins className="size-5" aria-hidden />}
                      title="Tu saldo"
                      detail={formatMoneyArsExact(data.balance.amount)}
                      onClick={() => setActiveView("balance")}
                    />
                  </nav>
                </>
              ) : activeView === "tickets" ? (
                <>
                  <SectionHeader title="Tus entradas" onBack={() => setActiveView("home")} />
                  {data.tickets.length > 0 ? (
                    <div className="flex flex-col gap-3">
                      {data.tickets.map((ticket) => {
                        const active = ticket.status === "PENDING"
                        return (
                          <article
                            key={ticket.id}
                            className="relative flex min-h-[6.25rem] min-w-0 overflow-hidden rounded-2xl bg-white text-zinc-950 shadow-[0_16px_45px_-24px_rgba(255,255,255,0.38)]"
                          >
                            <div className="flex min-w-0 flex-1 flex-col justify-center px-5 py-4 pr-4">
                              <p className="truncate text-base font-extrabold tracking-tight">{ticket.ticketType.name}</p>
                              <p className="mt-1 text-sm font-semibold tabular-nums text-zinc-600">
                                {formatMoneyArsExact(ticket.ticketType.price)}
                              </p>
                              <span className={`mt-2 w-fit rounded-full px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.14em] ${active ? "bg-emerald-100 text-emerald-700" : "bg-zinc-200 text-zinc-500"}`}>
                                {ticketStatusLabel(ticket.status)}
                              </span>
                            </div>
                            <div className="relative flex w-[6.5rem] shrink-0 items-center justify-center border-l-2 border-dotted border-zinc-300 px-4 py-3">
                              <span aria-hidden className="absolute -left-[9px] -top-[9px] size-4 rounded-full bg-black" />
                              <span aria-hidden className="absolute -bottom-[9px] -left-[9px] size-4 rounded-full bg-black" />
                              <QrBlock
                                hash={ticket.qrHash}
                                active={active}
                                receiptToken={receiptToken}
                                ticketName={ticket.ticketType.name}
                                ticketPrice={formatMoneyArsExact(ticket.ticketType.price)}
                              />
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-6 py-8 text-center text-sm text-white/50">
                      No hay entradas asociadas a esta compra.
                    </p>
                  )}
                </>
              ) : activeView === "consumos" ? (
                <>
                  <SectionHeader title="Tus consumos" onBack={() => setActiveView("home")} />
                  {consumptionGroups.length > 0 ? (
                    <ul className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03]">
                      {consumptionGroups.map((group, index) => (
                        <li key={group.id} className={`flex items-center justify-between gap-4 px-5 py-4 ${index > 0 ? "border-t border-white/[0.07]" : ""}`}>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-white">{group.name}</p>
                            {pickupMode ? (
                              <p className="mt-1 text-sm tabular-nums text-white/45">
                                {group.pending} {group.pending === 1 ? "disponible para retirar" : "disponibles para retirar"}
                              </p>
                            ) : group.redeemed > 0 ? (
                              <p className="mt-1 text-sm tabular-nums text-white/35">{group.redeemed} / {group.pending + group.redeemed}</p>
                            ) : null}
                          </div>
                          {pickupMode && group.pending > 0 ? (
                            <div className="flex shrink-0 items-center gap-3">
                              <button
                                type="button"
                                disabled={(pickupSelection[group.id] ?? 0) === 0}
                                onClick={() => changePickupQuantity(group.id, -1, group.pending)}
                                className="flex size-9 items-center justify-center rounded-full border border-white/10 text-white/70 disabled:opacity-25"
                                aria-label={`Restar ${group.name}`}
                              >
                                <Minus className="size-4" aria-hidden />
                              </button>
                              <span className="w-5 text-center text-base font-semibold tabular-nums text-white">
                                {pickupSelection[group.id] ?? 0}
                              </span>
                              <button
                                type="button"
                                disabled={(pickupSelection[group.id] ?? 0) >= group.pending}
                                onClick={() => changePickupQuantity(group.id, 1, group.pending)}
                                className="flex size-9 items-center justify-center rounded-full bg-white text-black disabled:opacity-25"
                                aria-label={`Sumar ${group.name}`}
                              >
                                <Plus className="size-4" aria-hidden />
                              </button>
                            </div>
                          ) : (
                            <span className="min-w-8 text-right text-lg font-semibold tabular-nums text-white/65">{group.pending}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-6 py-8 text-center text-sm text-white/50">
                      Todavía no compraste consumos para este evento.
                    </p>
                  )}
                  {hasPendingConsumptions ? (
                    <section className="rounded-2xl border border-white/[0.09] bg-white/[0.045] p-4">
                      {pickupMode ? (
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="font-semibold text-white">Elegí lo que retirás ahora</p>
                            <p className="mt-1 text-sm text-white/45">Después mostrás un único QR en la barra.</p>
                          </div>
                          <button
                            type="button"
                            onClick={cancelPickup}
                            className="shrink-0 rounded-xl px-3 py-2 text-sm font-semibold text-white/55 transition-colors hover:bg-white/[0.07] hover:text-white"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          className="h-14 w-full justify-between rounded-xl bg-white px-4 font-bold text-black hover:bg-zinc-200"
                          onClick={() => void handlePickup()}
                        >
                          <span className="flex items-center gap-3"><PackageCheck className="size-5" aria-hidden />Armar orden de retiro</span>
                          <ArrowRight className="size-5" aria-hidden />
                        </Button>
                      )}
                    </section>
                  ) : null}
                  <section className="space-y-3">
                    <div className="flex items-baseline justify-between gap-3 px-1">
                      <h2 className="text-lg font-bold tracking-tight text-white">Mis retiros</h2>
                      {data.pickups.length > 0 ? <span className="text-xs text-white/40">{data.pickups.length}</span> : null}
                    </div>
                    {data.pickups.length > 0 ? (
                      <ul className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03]">
                        {data.pickups.map((pickup, index) => (
                          <li key={pickup.token} className={index > 0 ? "border-t border-white/[0.07]" : ""}>
                            <Link
                              to={`/retiro/${encodeURIComponent(pickup.token)}?receipt=${encodeURIComponent(receiptToken)}`}
                              className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-white/[0.045]"
                            >
                              <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${pickup.status === "DELIVERED" ? "bg-emerald-400/10 text-emerald-300" : pickup.status === "CANCELLED" ? "bg-red-400/10 text-red-300" : "bg-white/[0.07] text-white/75"}`}>
                                <PackageCheck className="size-5" aria-hidden />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold text-white">
                                  {pickup.items.map((item) => `${item.quantity}× ${item.productName}`).join(" · ")}
                                </span>
                                <span className="mt-1 block text-xs text-white/40">
                                  {pickup.status === "DELIVERED" ? "Entregado" : pickup.status === "CANCELLED" ? "Cancelado" : "Listo para retirar"}
                                </span>
                              </span>
                              <ArrowRight className="size-4 shrink-0 text-white/30" aria-hidden />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="rounded-2xl border border-dashed border-white/[0.09] px-5 py-5 text-sm leading-relaxed text-white/40">
                        Cuando armes una orden para la barra, va a aparecer acá.
                      </p>
                    )}
                  </section>
                </>
              ) : activeView === "balance" ? (
                <>
                  <SectionHeader title="Tu saldo" onBack={() => setActiveView("home")} />
                  <section className="py-4 text-center">
                    <p className="text-4xl font-bold tabular-nums tracking-tight text-white">
                      {formatMoneyArsExact(data.balance.amount)}
                    </p>
                    <p className="mx-auto mt-4 max-w-xs text-sm leading-relaxed text-white/50">
                      Está asociado a tu DNI y podés usarlo para comprar consumos durante este evento.
                    </p>
                    <Button type="button" className="mt-7 h-12 w-full rounded-2xl bg-white font-semibold text-black" onClick={() => setDepositOpen(true)}>
                      Cargar saldo
                    </Button>
                  </section>
                </>
              ) : (
                <>
                  <SectionHeader title="Comprar consumos" onBack={() => setActiveView("consumos")} />
                  <section className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-4">
                    <div>
                      <p className="text-lg font-bold text-white">{formatMoneyArsExact(data.balance.amount)}</p>
                    </div>
                    <Button type="button" variant="secondary" className="rounded-xl" onClick={() => setDepositOpen(true)}>Cargar</Button>
                  </section>
                  <ConsumosTabContent
                    addonProducts={addonProducts ?? []}
                    addonCategories={addonCategories}
                    addonDrinks={addonDrinks}
                    shelf={shelf}
                    onAdd={bumpAddon}
                    onRemove={trimAddon}
                  />
                </>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      <AnimatePresence>
        {showBuyMoreFooter ? (
          <motion.div
            key="buy-more-consumptions"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
            transition={EASE_OUT}
            className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/[0.07] bg-black/70 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-xl sm:px-8"
          >
            <div className="mx-auto max-w-lg">
              <Button
                type="button"
                disabled={pickupMode && (pickupTotal === 0 || pickupSubmitting)}
                className={pickupMode
                  ? "h-14 w-full rounded-2xl bg-[#ff6a00] font-extrabold text-white ring-1 ring-inset ring-white/30 shadow-[0_10px_38px_-8px_rgba(255,106,0,0.95)] hover:bg-[#ff7a1a] hover:shadow-[0_12px_44px_-8px_rgba(255,106,0,1)] disabled:bg-orange-500/25 disabled:text-white/35 disabled:ring-transparent disabled:shadow-none"
                  : "h-14 w-full rounded-2xl bg-violet-600 font-bold text-white shadow-[0_12px_36px_-16px_rgba(124,58,237,0.9)] hover:bg-violet-500"}
                onClick={pickupMode ? () => void handlePickup() : () => setActiveView("shop")}
              >
                {pickupSubmitting ? (
                  <Loader2 className="size-5 animate-spin" aria-hidden />
                ) : pickupMode ? (
                  pickupTotal > 0 ? `Confirmar retiro · ${pickupTotal}` : "Confirmar retiro"
                ) : (
                  "Comprar más consumos"
                )}
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ─── Shelf rail (only on consumos tab) ─── */}
      <AnimatePresence>
        {onShopView ? (
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
              {/* Tarea 6.2 — Método del addon: Mercado Pago o saldo disponible. */}
              {addonBalanceAvailable ? (
                <div
                  className="flex rounded-xl bg-white/[0.06] p-1"
                  role="radiogroup"
                  aria-label="Método de pago de consumos"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={addonMethod === "MERCADOPAGO"}
                    onClick={() => setAddonMethod("MERCADOPAGO")}
                    className={`flex-1 rounded-lg py-2.5 text-[13px] font-semibold transition-colors ${
                      addonMethod === "MERCADOPAGO"
                        ? "bg-white text-black"
                        : "text-white/55 hover:text-white"
                    }`}
                  >
                    Mercado Pago
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={addonMethod === "SALDO"}
                    onClick={() => setAddonMethod("SALDO")}
                    className={`flex-1 rounded-lg py-2.5 text-[13px] font-semibold transition-colors ${
                      addonMethod === "SALDO"
                        ? "bg-white text-black"
                        : "text-white/55 hover:text-white"
                    }`}
                  >
                    Saldo · {formatMoneyArsExact(data.balance?.amount ?? "0.00")}
                  </button>
                </div>
              ) : null}
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
                ) : addonMethod === "SALDO" ? (
                  "Pagar con saldo"
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

      {/* ─── Tarea 6.2 — Cargar saldo (visión §2.7) ─── */}
      {data ? (
        <AppleSheet
          open={depositOpen}
          onOpenChange={(open) => {
            setDepositOpen(open)
            if (!open) {
              setDepositSubmitted(false)
              setDepositTransfer(null)
            }
          }}
          title="Cargar saldo"
          description="Tu saldo queda asociado a tu DNI dentro del evento."
        >
          {depositTransfer && depositSubmitted ? (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/45">
                  Copiar alias
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-12 justify-start gap-2 rounded-xl"
                  onClick={() => {
                    void copyText("Alias", depositTransfer.alias)
                  }}
                >
                  <Copy className="size-4 shrink-0" aria-hidden />
                  <span className="truncate font-mono text-sm">{depositTransfer.alias}</span>
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/45">
                  Copiar CVU
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-12 justify-start gap-2 rounded-xl"
                  onClick={() => {
                    void copyText("CVU", depositTransfer.accountNumber)
                  }}
                >
                  <Copy className="size-4 shrink-0" aria-hidden />
                  <span className="truncate font-mono text-sm">
                    {depositTransfer.accountNumber}
                  </span>
                </Button>
              </div>
              <p className="text-sm leading-relaxed text-white/55">
                Cuando acreditemos el pago, se suma a tu saldo automáticamente.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              <div>
                <label
                  htmlFor="deposit-amount"
                  className="block text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45"
                >
                  Monto
                </label>
                <input
                  id="deposit-amount"
                  type="text"
                  inputMode="decimal"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value.replace(/,/g, "."))}
                  placeholder="10000"
                  autoFocus
                  className="mt-3 w-full border-0 border-b border-white/[0.12] bg-transparent px-0 py-3 text-2xl font-bold tabular-nums text-white outline-none transition-colors placeholder:text-white/25 focus:border-white"
                />
              </div>
              <div className="flex flex-col gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/45">
                  Método
                </p>
                <div
                  className="flex rounded-xl bg-white/[0.06] p-1"
                  role="radiogroup"
                  aria-label="Método de carga"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={depositMethod === "MERCADOPAGO"}
                    onClick={() => setDepositMethod("MERCADOPAGO")}
                    className={`flex-1 rounded-lg py-2.5 text-[13px] font-semibold transition-colors ${
                      depositMethod === "MERCADOPAGO"
                        ? "bg-white text-black"
                        : "text-white/55 hover:text-white"
                    }`}
                  >
                    Mercado Pago
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={depositMethod === "TRANSFER"}
                    onClick={() => setDepositMethod("TRANSFER")}
                    className={`flex-1 rounded-lg py-2.5 text-[13px] font-semibold transition-colors ${
                      depositMethod === "TRANSFER"
                        ? "bg-white text-black"
                        : "text-white/55 hover:text-white"
                    }`}
                  >
                    Transferencia
                  </button>
                </div>
              </div>
              <Button
                type="button"
                className="h-14 w-full rounded-2xl bg-white font-semibold text-black transition-all disabled:shadow-none"
                disabled={
                  depositSubmitting ||
                  !/^\d+(\.\d{1,2})?$/.test(depositAmount.trim()) ||
                  parseFloat(depositAmount) <= 0
                }
                onClick={() => void handleDeposit()}
              >
                {depositSubmitting ? (
                  <Loader2 className="size-6 animate-spin" aria-hidden />
                ) : (
                  "Continuar"
                )}
              </Button>
            </div>
          )}
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
  addonCategories,
  addonDrinks,
  shelf,
  onAdd,
  onRemove,
}: {
  addonProducts: PublicDrinkProductItem[]
  addonCategories: PublicProductCategory[]
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
            {glassProducts.length === 0 ? (
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-10 text-center text-sm text-white/45">
                No hay copas para este evento.
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {groupProductsByCategory(glassProducts, addonCategories).map((group) => (
                  <div key={group.id}>
                    {group.name ? <CategoryHeading>{group.name}</CategoryHeading> : null}
                    <ul className="grid grid-cols-2 gap-3">
                      {group.products.map((p) => (
                        <li key={p.id}>
                          <ProductShelfRow
                            name={p.name}
                            imageUrl={p.imageUrl?.trim() || null}
                            priceStr={formatMoneyArsExact(p.price)}
                            disabled={false}
                            count={addonDrinks[p.id] ?? 0}
                            onAdd={() => onAdd(p.id)}
                            onRemove={() => onRemove(p.id)}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
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
            {bottleProducts.length === 0 ? (
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-10 text-center text-sm text-white/45">
                No hay botellas para este evento.
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {groupProductsByCategory(bottleProducts, addonCategories).map((group) => (
                  <div key={group.id}>
                    {group.name ? <CategoryHeading>{group.name}</CategoryHeading> : null}
                    <ul className="grid grid-cols-2 gap-3">
                      {group.products.map((p) => (
                        <li key={p.id}>
                          <ProductShelfRow
                            name={p.name}
                            imageUrl={p.imageUrl?.trim() || null}
                            priceStr={formatMoneyArsExact(p.price)}
                            disabled={false}
                            count={addonDrinks[p.id] ?? 0}
                            onAdd={() => onAdd(p.id)}
                            onRemove={() => onRemove(p.id)}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
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
