import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router"
import { formatAdmissionWindow } from "@/lib/ticket-admission"
import { TransportMap } from "@/components/transport-picker"
import {
  ArrowLeft,
  ArrowRight,
  Coins,
  Copy,
  Loader2,
  Ticket,
  Users,
  Wine,
  UserRound,
} from "lucide-react"
import { initMercadoPago } from "@mercadopago/sdk-react"
import { toast } from "sonner"
import { AnimatePresence, motion, type Transition } from "motion/react"
import Decimal from "decimal.js"
import { publicApiFetch, publicWebSocketUrl } from "@/lib/api"
import type {
  BalanceDepositResponse,
  ConsumptionsCheckoutResponse,
  PublicDrinkProductItem,
  PublicEventDetailResponse,
  PublicProductCategory,
  ReceiptApiResponse,
} from "@/types/api"
import { Button } from "@/components/ui/button"
import { ConsumptionMenu } from "@/components/consumption-menu"
import { PickupPanel } from "@/components/pickup-panel"
import { QrBlock } from "@/components/qr-block"
import {
  formatEventDate,
  formatMenuPrice,
  formatMoneyArsExact,
  formatPaymentMethod,
  ticketStatusLabel,
  truncateHash,
} from "@/lib/format"
import { rememberQuickPurchase } from "@/lib/quick-purchase"
import { AppleSheet } from "@/components/apple-sheet"
import {
  TicketShareHistory,
  TicketSharePanel,
  type ShareCredentials,
} from "@/components/ticket-share-panel"

const MP_CHECKOUT_LAUNCHED_KEY = "mpCheckoutLaunched"

const EASE_OUT: Transition = { duration: 0.32, ease: [0.22, 1, 0.36, 1] }
const TAB_TRANSITION: Transition = { duration: 0.34, ease: [0.22, 1, 0.36, 1] }

type ReceiptView = "home" | "tickets" | "consumos" | "shop" | "balance"

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
//
// Es **una sola pantalla** para las dos credenciales del cliente:
//   - `/receipt/:receiptToken`  → el link del mail, anclado a una compra;
//   - `/mi-cuenta/:token/evento/:eventId` → la sesión de `/{slug}/acceso/ingresar`, anclada al
//     cliente y al evento, que puede no tener ninguna compra.
// El diseño, los tres tabs y los textos son los mismos siempre. Comprar consumos y cargar saldo
// funcionan con las dos anclas: con compra se cuelgan de su `receiptToken` y, sin compra, de la
// sesión de acceso (el backend resuelve al cliente por el token). Lo que sigue necesitando una
// venta es el retiro en barra, porque una orden se arma sobre consumiciones ya compradas.
//
// ──────────────────────────────────────────────────────────────────────────────
export function ReceiptPage() {
  const {
    receiptToken: routeReceiptToken,
    token: profileToken,
    eventId,
  } = useParams<{ receiptToken?: string; token?: string; eventId?: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Modo evento: la credencial es la sesión del cliente, no un comprobante.
  const eventMode = !routeReceiptToken && Boolean(profileToken && eventId)
  const [data, setData] = useState<ReceiptApiResponse | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const hadPendingPaymentRef = useRef(false)

  const [addonProducts, setAddonProducts] = useState<PublicDrinkProductItem[] | null>(null)
  const [addonCategories, setAddonCategories] = useState<PublicProductCategory[]>([])
  const [addonDrinks, setAddonDrinks] = useState<Record<string, number>>({})
  const [addonSubmitting, setAddonSubmitting] = useState(false)

  const [activeView, setActiveView] = useState<ReceiptView>(() =>
    searchParams.get("view") === "tickets" ? "tickets" : "home"
  )

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

  /**
   * El comprobante con el que operan las acciones de esta pantalla (comprar consumos, cargar saldo,
   * armar un retiro). En el link del mail es el de la URL; en el acceso por evento es el de la
   * última compra completada del cliente en ese evento, que puede no existir.
   */
  const receiptToken = routeReceiptToken ?? data?.receiptToken ?? null
  /** La credencial de la cuenta: el perfil se abre con la sesión o, si no, con el comprobante. */
  const accountToken = profileToken ?? receiptToken
  /**
   * A dónde vuelve el QR a pantalla completa: esta misma pantalla. El `receipt` viaja como pista
   * para que esa pantalla pueda consultar el estado del código contra el comprobante (es el único
   * endpoint que además escucha el WebSocket de canjes); en el link del mail ya está en el path.
   */
  const ticketsReturnTo = `${
    eventMode
      ? `/mi-cuenta/${encodeURIComponent(profileToken ?? "")}/evento/${encodeURIComponent(eventId ?? "")}`
      : `/receipt/${encodeURIComponent(routeReceiptToken ?? "")}`
  }?view=tickets${receiptToken ? `&receipt=${encodeURIComponent(receiptToken)}` : ""}`
  /**
   * Con qué credencial se comparten las entradas: la misma con la que se abrió esta pantalla. El
   * backend resuelve al dueño igual con las dos (comprobante, o sesión del evento).
   */
  const shareCredentials: ShareCredentials | null = eventMode
    ? profileToken && eventId
      ? { customerToken: profileToken, eventId }
      : null
    : routeReceiptToken
      ? { receiptToken: routeReceiptToken }
      : null

  const load = useCallback(async () => {
    try {
      const d = routeReceiptToken
        ? await publicApiFetch<ReceiptApiResponse>(
            `/public/receipts/${encodeURIComponent(routeReceiptToken)}`
          )
        : profileToken && eventId
          ? await publicApiFetch<ReceiptApiResponse>(
              `/public/customers/profile/${encodeURIComponent(profileToken)}/events/${encodeURIComponent(eventId)}`
            )
          : null
      setData(d)
      setLoadFailed(false)
    } catch {
      setData(null)
      setLoadFailed(true)
    }
  }, [routeReceiptToken, profileToken, eventId])

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
    if (!data?.sale) return
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
    if (typeof window === "undefined" || !data?.sale?.id) return
    if (data.sale.paid) {
      return
    }
  }, [data?.sale?.id, data?.sale?.paid, receiptToken])

  const shouldPoll =
    data != null && data.sale != null && data.sale.paid === false && data.sale.status === "PENDING"

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
    if (!data?.sale) return
    const pending = !data.sale.paid && data.sale.status === "PENDING"
    if (pending) hadPendingPaymentRef.current = true
    if (data.sale.paid && hadPendingPaymentRef.current) {
      toast.success("¡Pago confirmado!")
      hadPendingPaymentRef.current = false
      sessionStorage.removeItem(MP_CHECKOUT_LAUNCHED_KEY)
    }
  }, [data])

  // Sin venta (acceso por evento sin compras) no hay nada pendiente de pago: se muestra el
  // contenido igual. El bloque "Pago pendiente" es sólo del comprobante de una compra sin acreditar.
  // Va acá arriba porque los efectos de la tienda y del addon lo consultan.
  const showPaidContent = data != null && (data.sale == null || data.sale.paid)

  // La tienda de consumos del evento se carga también sin compra: adentro del evento se puede
  // comprar aunque el cliente no haya comprado nada antes. Mientras la venta de consumos no abrió
  // (`consumptionsAvailableFrom` en el futuro; el backend los rechaza igual) no hay catálogo: sin
  // "Comprar más consumos" ni tienda, el cliente no ve los precios (misma regla que la tienda del
  // evento en `event-detail-page`).
  useEffect(() => {
    if (!showPaidContent || !data?.event?.id) return
    publicApiFetch<PublicEventDetailResponse>(`/public/events/${data.event.id}`)
      .then((r) => {
        const opensAt = r.event.consumptionsAvailableFrom
        const consumptionsOpen = opensAt == null || Date.now() >= new Date(opensAt).getTime()
        setAddonProducts(consumptionsOpen ? r.drinkProducts : [])
        setAddonCategories(consumptionsOpen ? (r.productCategories ?? []) : [])
      })
      .catch(() => {
        setAddonProducts([])
        setAddonCategories([])
      })
  }, [showPaidContent, data?.event?.id])

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

  // Sin comprobante ni sesión de evento no hay pantalla que mostrar.
  if (!routeReceiptToken && !eventMode) return null

  const addonUnitCount = addonDrinkLines.reduce((a, l) => a + l.quantity, 0)

  const consumosAvailable =
    showPaidContent && addonProducts !== null && addonProducts.length > 0

  /** Entradas que el cliente puede repartir hoy (sin las ya reservadas en un link). */
  const shareableTickets = (data?.shares?.eligible ?? []).reduce(
    (total, type) => total + type.available,
    0
  )

  // ─── Pago handlers (addon) ───────────────────────────────────────────────────
  const handleAddonCheckout = async () => {
    if (!addonDrinkLines.length || addonSubmitting) return
    // Dos anclas para la misma compra: el comprobante de una compra anterior y, sin ninguna
    // compra todavía (adentro del evento, entrando por `/{slug}/acceso/ingresar`), el evento de la sesión.
    const endpoint = receiptToken
      ? `/public/receipts/${receiptToken}/consumptions-checkout`
      : profileToken && eventId
        ? `/public/customers/profile/${encodeURIComponent(profileToken)}/events/${encodeURIComponent(eventId)}/consumptions-checkout`
        : null
    if (!endpoint) return
    setAddonSubmitting(true)
    try {
      const result = await publicApiFetch<ConsumptionsCheckoutResponse>(endpoint, {
        method: "POST",
        body: JSON.stringify({
          drinkLines: addonDrinkLines,
          clientTotal: addonTotalStr,
          // Tarea 6.2 — SALDO: la sale queda COMPLETED al instante (el backend la
          // debita del saldo del cliente). Sin redirección: se refresca el comprobante.
          paymentMethod: addonMethod,
        }),
        headers: { "Content-Type": "application/json" },
      })
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
      // Volver de Mercado Pago —por su botón, por atrás o cambiando de app— cae en el retiro de
      // esta venta, que espera la acreditación y después reúne todos los consumos del cliente.
      if (result.receiptToken) {
        rememberQuickPurchase({
          eventKeys: [data?.event.id, data?.event.slug],
          receiptToken: result.receiptToken,
          paymentUrl: result.url_pago,
        })
        navigate(`/receipt/${encodeURIComponent(result.receiptToken)}/retirar`, { replace: true })
      }
      window.location.assign(result.url_pago)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al iniciar el pago")
    } finally {
      setAddonSubmitting(false)
    }
  }

  // ─── Tarea 6.2 — Carga de saldo (visión §2.7) ────────────────────────────────
  // El contacto sale del backend: del snapshot de esta compra cuando hay comprobante y de la
  // ficha del cliente cuando el ancla es la sesión de acceso (adentro del evento sin compra).
  const handleDeposit = async () => {
    const amt = depositAmount.trim()
    if (!/^\d+(\.\d{1,2})?$/.test(amt) || parseFloat(amt) <= 0 || depositSubmitting) return
    if (!data?.event?.id || (!receiptToken && !profileToken)) return
    setDepositSubmitting(true)
    try {
      const res = await publicApiFetch<BalanceDepositResponse>(
        `/public/events/${data.event.id}/balance/deposit`,
        {
          method: "POST",
          body: JSON.stringify({
            amount: amt,
            paymentMethod: depositMethod,
            ...(receiptToken ? { receiptToken } : { customerToken: profileToken }),
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

  // Tarea 6.2 — Con saldo, el addon ofrece pagar con saldo (sin tarjeta ni transferencia).
  const addonBalanceAvailable = parseFloat(data?.balance?.amount ?? "0") > 0

  return (
    <div className={`min-h-dvh ${showFooter ? "pb-44" : "pb-24"}`}>

      <div
        className={`mx-auto flex max-w-lg flex-col ${
          onShopView ? "gap-2 px-4 pt-4" : "gap-10 px-6 pt-10 sm:px-8"
        }`}
      >
        {data ? (
          <div className="flex justify-end">
            <Link
              to={`/mi-cuenta/${encodeURIComponent(accountToken ?? "")}`}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white/65"
            >
              <UserRound className="size-3.5" aria-hidden />
              Mis eventos
            </Link>
          </div>
        ) : null}
        {!data ? (
          loadFailed ? (
            <p className="py-24 text-center text-[17px] text-white/70">No encontramos este comprobante.</p>
          ) : (
            <div className="flex items-center justify-center py-24 text-white/40">
              <Loader2 className="size-6 animate-spin" aria-hidden />
            </div>
          )
        ) : !showPaidContent ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-6 py-8 text-center">
            <p className="text-lg font-semibold tracking-tight text-white">Pago pendiente</p>
            <p className="mx-auto max-w-[280px] text-sm leading-relaxed text-white/50">
              {data.sale ? `${formatMoneyArsExact(data.sale.totalAmount)} · ${formatPaymentMethod(data.sale.paymentMethod)}. ` : ""}
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
                  {/* Quien compró varias entradas suele ir con amigos: se le ofrece repartirlas
                      desde el inicio, sin tener que descubrirlo dentro de "Tus entradas". */}
                  {data.shares?.canShare && shareableTickets >= 2 ? (
                    <button
                      type="button"
                      onClick={() => setActiveView("tickets")}
                      className="group flex w-full items-center gap-4 rounded-2xl border border-violet-400/25 bg-violet-500/10 px-5 py-4 text-left outline-none transition-colors hover:bg-violet-500/15 focus-visible:ring-2 focus-visible:ring-violet-300/40"
                    >
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-violet-400/15 text-violet-200">
                        <Users className="size-5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold tracking-tight text-white">
                          Compartí entradas y pasajes
                        </span>
                        <span className="mt-0.5 block text-[13px] leading-snug text-white/50">
                          Podés compartir hasta {shareableTickets} boletos con un link.
                        </span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-white/30 transition-transform group-hover:translate-x-0.5 group-hover:text-white/70" aria-hidden />
                    </button>
                  ) : null}
                  <nav className="flex flex-col gap-3" aria-label="Tu cuenta para el evento">
                    <NavigationCard
                      icon={<Ticket className="size-5" aria-hidden />}
                      title="Tus entradas y transporte"
                      detail={`${data.tickets.length + (data.transports?.length ?? 0)}`}
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
                  <SectionHeader title="Tus entradas y transporte" onBack={() => setActiveView("home")} />
                  {/* Compartir con amigos: un link para el grupo y cada uno reclama la suya. */}
                  {data.shares && shareCredentials ? (
                    <TicketSharePanel
                      shares={data.shares}
                      credentials={shareCredentials}
                      eventName={data.event.name}
                      onChanged={load}
                    />
                  ) : null}
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
                              {formatAdmissionWindow(ticket.ticketType) && <p className="mt-1 text-xs font-medium leading-relaxed text-amber-800">{formatAdmissionWindow(ticket.ticketType)}</p>}
                              <p className="mt-1 text-sm font-semibold tabular-nums text-zinc-600">
                                {formatMoneyArsExact(ticket.ticketType.price)}
                              </p>
                              <span className={`mt-2 w-fit rounded-full px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.14em] ${active ? "bg-emerald-100 text-emerald-700" : "bg-zinc-200 text-zinc-500"}`}>
                                {ticketStatusLabel(ticket.status)}
                              </span>
                              {/* Reservada en un link: sigue siendo tuya hasta que un amigo la reclama. */}
                              {active && ticket.shareId ? (
                                <span className="mt-1.5 w-fit rounded-full bg-violet-100 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.14em] text-violet-700">
                                  Para un amigo
                                </span>
                              ) : null}
                            </div>
                            <div className="relative flex w-[6.5rem] shrink-0 items-center justify-center border-l-2 border-dotted border-zinc-300 px-4 py-3">
                              <span aria-hidden className="absolute -left-[9px] -top-[9px] size-4 rounded-full bg-black" />
                              <span aria-hidden className="absolute -bottom-[9px] -left-[9px] size-4 rounded-full bg-black" />
                              <QrBlock
                                hash={ticket.qrHash}
                                active={active}
                                returnTo={ticketsReturnTo}
                                ticketName={ticket.ticketType.name}
                                ticketPrice={formatMoneyArsExact(ticket.ticketType.price)}
                              />
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  ) : (data.transports?.length ?? 0) === 0 ? (
                    <p className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-6 py-8 text-center text-sm text-white/50">
                      {data.sale
                        ? "No hay entradas asociadas a esta compra."
                        : "No hay entradas para este evento."}
                    </p>
                  ) : null}
                  {(data.transports?.length ?? 0) > 0 && <section className="space-y-3">
                    <h2 className="text-xl font-bold">Tu transporte</h2>
                    {data.transports?.map((transport) => <div key={transport.id} className="space-y-3 rounded-2xl border border-black/10 bg-white p-4 text-zinc-950">
                      <div><p className="font-bold">{transport.quantity} × {transport.name}</p><p className="mt-1 text-sm text-black/60">{transport.address}</p><p className="mt-2 text-sm font-semibold">{formatMoneyArsExact(new Decimal(transport.price).mul(transport.quantity).toFixed(2))} · Pagado</p></div>
                      <p className="text-sm font-semibold">{transport.buyerName} · {transport.status === "USED" ? "Ya subió" : "Pendiente de subir"}</p>
                      <div className="flex justify-center"><QrBlock hash={transport.qrHash} active={transport.status === "PENDING"} returnTo={ticketsReturnTo} ticketName={`Colectivo · ${transport.name}`} ticketPrice={formatMoneyArsExact(transport.price)} /></div>
                      <TransportMap transport={transport} showDirections={false} />
                    </div>)}
                  </section>}
                  {data.shares ? <TicketShareHistory links={data.shares.links} /> : null}
                </>
              ) : activeView === "consumos" ? (
                <>
                  <SectionHeader title="Retirá en la barra" onBack={() => setActiveView("home")} />
                  <PickupPanel
                    data={data}
                    receiptToken={receiptToken}
                    onBuyMore={consumosAvailable ? () => setActiveView("shop") : undefined}
                  />
                  {consumosAvailable ? (
                    <button
                      type="button"
                      onClick={() => setActiveView("shop")}
                      className="text-left text-[15px] font-semibold text-white underline decoration-white/30 underline-offset-4"
                    >
                      Comprar más consumos
                    </button>
                  ) : null}
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
                    {/* El saldo se carga con cualquiera de las dos credenciales: con el
                        comprobante de una compra o con la sesión del evento, que es la que
                        tiene alguien que entró a la barra y todavía no compró nada. */}
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
                  <ConsumptionMenu
                    products={addonProducts ?? []}
                    categories={addonCategories}
                    quantities={addonDrinks}
                    onAdd={bumpAddon}
                    onRemove={trimAddon}
                  />
                </>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

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
                  {formatMenuPrice(addonTotalStr)}
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
            {/* Sin compra no hay nada que detallar: la pantalla es la misma, pero estos bloques
                hablan de una venta concreta. */}
            {data.sale ? (
              <>
                {/* Datos de cobro de esta venta: sólo existen si se pagó por transferencia. */}
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
                        void copyText("Alias", data.sale!.cucuruAlias as string)
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
                        void copyText("CVU", data.sale!.cucuruCvu as string)
                        setMoreOpen(false)
                      }}
                    >
                      <Copy className="size-4 shrink-0" aria-hidden />
                      <span className="truncate font-mono text-sm">{data.sale.cucuruCvu}</span>
                    </Button>
                  </div>
                ) : null}
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
                      Pedido: {receiptToken ? truncateHash(receiptToken, 12, 8) : "—"}
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
              </>
            ) : null}
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
