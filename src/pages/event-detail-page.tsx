import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { useNavigate, useParams } from "react-router"
import {
  BottleWine,
  Check,
  ChevronLeft,
  Heart,
  MapPin,
  Minus,
  ShoppingCart,
  Wine,
} from "lucide-react"
import { AnimatePresence, motion, type Transition } from "motion/react"
import Decimal from "decimal.js"
import { publicApiFetch } from "@/lib/api"
import type {
  PublicDrinkProductItem,
  PublicEventDetailResponse,
  PublicProductSaleType,
} from "@/types/api"
import {
  formatCountdown,
  formatEventDate,
  formatEventDay,
  formatMoneyArsExact,
} from "@/lib/format"
import { Button } from "@/components/ui/button"
import {
  computeCartTotalString,
  useCartStore,
  type CartDrinkLine,
  type CartTicketLine,
} from "@/stores/cart-store"

type PurchaseWorkflow = "tickets" | "products"
type CommerceSurface = "hero" | "store"

const EASE_OUT: Transition = { duration: 0.32, ease: [0.22, 1, 0.36, 1] }
const STORE_TRANSITION: Transition = { duration: 0.48, ease: [0.22, 1, 0.36, 1] }
const EASE_SMOOTH: Transition = {
  duration: 0.52,
  ease: [0.22, 1, 0.36, 1] as const,
}

function useWindowOpen(iso: Date | string | null | undefined) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (iso == null) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [iso])
  if (iso == null) return { open: true, msLeft: 0 }
  const t0 = new Date(iso).getTime()
  return { open: now >= t0, msLeft: Math.max(0, t0 - now) }
}

export function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const setCart = useCartStore((s) => s.setCart)

  const [data, setData] = useState<PublicEventDetailResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [commerceSurface, setCommerceSurface] = useState<CommerceSurface>("hero")
  const [workflow, setWorkflow] = useState<PurchaseWorkflow | null>(null)
  const [ticketQtys, setTicketQtys] = useState<Record<string, number>>({})
  const [drinks, setDrinks] = useState<Record<string, number>>({})

  const ticketsFrom = data?.event.ticketsAvailableFrom ?? null
  const consFrom = data?.event.consumptionsAvailableFrom ?? null
  const ticketsWindow = useWindowOpen(ticketsFrom)
  const consWindow = useWindowOpen(consFrom)

  const load = useCallback(() => {
    if (!eventId) return
    publicApiFetch<PublicEventDetailResponse>(`/public/events/${eventId}`)
      .then((r) => {
        setData(r)
        setTicketQtys({})
        setDrinks({})
      })
      .catch(() => setError("No pudimos cargar el evento."))
  }, [eventId])

  useEffect(() => {
    load()
  }, [load])

  const hasTicketCatalog = (data?.ticketTypes.length ?? 0) > 0
  const hasProductCatalog = (data?.drinkProducts.length ?? 0) > 0

  useEffect(() => {
    if (!data) return
    const hasT = data.ticketTypes.length > 0
    const hasP = data.drinkProducts.length > 0
    if (hasT) setWorkflow("tickets")
    else if (hasP) setWorkflow("products")
    else setWorkflow(null)
  }, [data])

  const ticketLines: CartTicketLine[] = useMemo(() => {
    if (!data) return []
    const out: CartTicketLine[] = []
    for (const t of data.ticketTypes) {
      const q = ticketQtys[t.id] ?? 0
      if (q <= 0) continue
      out.push({ ticketTypeId: t.id, quantity: q, unitPrice: t.price })
    }
    return out
  }, [data, ticketQtys])

  const bumpTicket = (ticketTypeId: string) => {
    setTicketQtys((prev) => ({
      ...prev,
      [ticketTypeId]: Math.min(99, (prev[ticketTypeId] ?? 0) + 1),
    }))
  }

  const trimTicket = (ticketTypeId: string) => {
    setTicketQtys((prev) => {
      const next = (prev[ticketTypeId] ?? 0) - 1
      const copy = { ...prev }
      if (next <= 0) delete copy[ticketTypeId]
      else copy[ticketTypeId] = next
      return copy
    })
  }

  const drinkLines: CartDrinkLine[] = useMemo(() => {
    if (!data) return []
    const out: CartDrinkLine[] = []
    for (const [pid, q] of Object.entries(drinks)) {
      if (q <= 0) continue
      const p = data.drinkProducts.find((x) => x.id === pid)
      if (p) out.push({ productId: pid, quantity: q, unitPrice: p.price })
    }
    return out
  }, [data, drinks])

  const cartPreview = useMemo(() => {
    if (!data || !eventId) return null
    return {
      eventId,
      eventName: data.event.name,
      productoraName: data.productora.name,
      ticketLines,
      drinkLines,
    }
  }, [data, eventId, ticketLines, drinkLines])

  const totalStr = cartPreview ? computeCartTotalString(cartPreview) : "0.00"

  const ticketsBuyable =
    ticketsWindow.open &&
    ticketLines.length > 0 &&
    ticketLines.every((line) => {
      const t = data?.ticketTypes.find((x) => x.id === line.ticketTypeId)
      return t?.availableForPurchase === true
    })

  const hasDrinks = drinkLines.length > 0
  const drinksBuyable = hasDrinks && consWindow.open

  const ticketCount = ticketLines.reduce((a, l) => a + l.quantity, 0)
  const drinkUnitCount = drinkLines.reduce((a, l) => a + l.quantity, 0)
  const bolsaUnitCount = ticketCount + drinkUnitCount

  const showTicketStep = !!data && workflow === "tickets"
  const showProductStep = !!data && workflow === "products"

  const canContinue =
    (ticketCount > 0 && ticketsBuyable) || (hasDrinks && drinksBuyable)

  const canContinueFromTicketsToStore =
    hasProductCatalog && ticketCount > 0 && ticketsBuyable

  const heroFooterShowsTicketsStep =
    purchaseOpen &&
    commerceSurface === "hero" &&
    showTicketStep

  const footerCtaIsContinueToStore =
    heroFooterShowsTicketsStep && hasProductCatalog

  const primaryFooterEnabled = footerCtaIsContinueToStore
    ? canContinueFromTicketsToStore
    : canContinue

  const footerCtaLabel = footerCtaIsContinueToStore
    ? "Continuar"
    : "Continuar al pago"

  const setDrinkQty = (productId: string, next: number) => {
    setDrinks((prev) => {
      const copy = { ...prev }
      if (next <= 0) delete copy[productId]
      else copy[productId] = next
      return copy
    })
  }

  const continueClick = () => {
    if (!cartPreview || !canContinue) return
    setCart(cartPreview)
    navigate(`/checkout/${eventId}`)
  }

  const storeBack = () => {
    if (workflow === "tickets" && hasProductCatalog) {
      setCommerceSurface("hero")
      return
    }
    setPurchaseOpen(false)
    setCommerceSurface("hero")
  }

  const primaryFooterAction = () => {
    if (footerCtaIsContinueToStore) {
      if (!canContinueFromTicketsToStore) return
      setCommerceSurface("store")
      return
    }
    continueClick()
  }

  const anyTicketPurchasable =
    !!data?.ticketTypes.some((t) => t.availableForPurchase) && ticketsWindow.open
  const productsPurchasable = consWindow.open && hasProductCatalog

  const anythingPurchasable = anyTicketPurchasable || productsPurchasable
  const hasAnyCatalog = hasTicketCatalog || hasProductCatalog

  const showStore =
    !!data &&
    purchaseOpen &&
    commerceSurface === "store" &&
    hasProductCatalog &&
    (workflow === "products" ||
      (workflow === "tickets" && hasProductCatalog))
  const showFooter =
    !!data &&
    purchaseOpen &&
    bolsaUnitCount > 0 &&
    (commerceSurface === "store" ||
      ((showTicketStep || showProductStep) && commerceSurface === "hero"))

  const ctaLabel = !data
    ? "Cargando…"
    : !hasAnyCatalog
      ? "No disponible"
      : !anythingPurchasable
        ? "Próximamente"
        : "Comprar"

  const ctaDisabled = !data || !hasAnyCatalog || !anythingPurchasable

  const startPurchase = () => {
    if (ctaDisabled) return
    setPurchaseOpen(true)
    if (!hasTicketCatalog && hasProductCatalog) setCommerceSurface("store")
    else setCommerceSurface("hero")
  }

  useEffect(() => {
    if (!purchaseOpen) {
      setCommerceSurface("hero")
      setTicketQtys({})
      setDrinks({})
    }
  }, [purchaseOpen])

  if (!eventId) return null

  const hero = data?.event.imageUrl ?? null
  const flyerVisible = !purchaseOpen || commerceSurface === "hero"

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-black">
      <div className="fixed inset-0 -z-0">
        {hero ? (
          <motion.img
            key={hero}
            src={hero}
            alt={data?.event.name ?? ""}
            className="h-full w-full object-cover"
            initial={{ scale: 1.06, opacity: 0 }}
            animate={{
              scale: flyerVisible ? 1 : 1.08,
              opacity: flyerVisible ? 1 : 0,
            }}
            transition={
              flyerVisible
                ? { duration: 1.2, ease: [0.16, 1, 0.3, 1] }
                : STORE_TRANSITION
            }
            loading="eager"
            decoding="async"
          />
        ) : (
          <motion.div
            className="h-full w-full bg-gradient-to-b from-zinc-900 via-zinc-950 to-black"
            animate={{ opacity: flyerVisible ? 1 : 0 }}
            transition={STORE_TRANSITION}
          />
        )}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-black/15 to-black/95"
          animate={{ opacity: flyerVisible ? (purchaseOpen ? 1 : 0.2) : 0 }}
          transition={STORE_TRANSITION}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black via-black/70 to-transparent"
          animate={{ opacity: flyerVisible ? (purchaseOpen ? 1 : 0.5) : 0 }}
          transition={STORE_TRANSITION}
        />
      </div>

      <motion.div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[1] bg-black"
        initial={false}
        animate={{ opacity: showStore ? 1 : 0 }}
        transition={STORE_TRANSITION}
      />



      <div
        className={
          showStore
            ? `relative z-10 mx-auto flex min-h-dvh max-h-dvh w-full max-w-lg flex-col overflow-y-auto overscroll-contain px-4 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5 ${purchaseOpen ? "pb-40" : "pb-6"}`
            : `relative z-10 mx-auto flex min-h-dvh max-h-dvh w-full max-w-lg flex-col justify-end overflow-y-auto overscroll-contain px-5 pt-10 sm:px-8 ${purchaseOpen ? "pb-40" : "pb-32"}`
        }
      >
        {error ? (
          <p className="text-sm text-red-300">{error}</p>
        ) : !data ? (
          <p className="text-sm text-white/60">Cargando…</p>
        ) : (
          <>
            {showStore ? (
              <ConsumosMarketplace
                eventName={data.event.name}
                data={data}
                consFrom={consFrom}
                consWindow={consWindow}
                drinks={drinks}
                setDrinkQty={setDrinkQty}
                ticketLines={ticketLines}
                trimTicket={trimTicket}
                cartUnitCount={bolsaUnitCount}
                onBack={storeBack}
              />
            ) : (
              <motion.div
                layout
                animate={{
                  y: purchaseOpen ? -28 : 0,
                  marginBottom: showFooter && commerceSurface === "hero" ? -130 : 0
                }}
                transition={EASE_SMOOTH}
                className={purchaseOpen ? "w-full" : "mx-auto w-auto"}
              >
                <motion.div
                  layout
                  className={
                    purchaseOpen
                      ? "rounded-[28px] border border-white/[0.1] px-5 py-5 shadow-[0_-28px_90px_-24px_rgba(0,0,0,0.95)] backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-black/30"
                      : `cursor-pointer rounded-full border border-white/[0.1] bg-black/30 px-10 py-3.5 shadow-2xl backdrop-blur-xl backdrop-saturate-150 transition-transform supports-[backdrop-filter]:bg-black/30 ${ctaDisabled ? "cursor-not-allowed opacity-50" : "active:scale-95 hover:bg-black/40"}`
                  }
                  onClick={!purchaseOpen && !ctaDisabled ? startPurchase : undefined}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {!purchaseOpen ? (
                      <motion.div
                        key="cta-btn"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="flex items-center justify-center"
                      >
                        <span className="text-[15px] font-semibold tracking-wide text-white">{ctaLabel}</span>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="island-content"
                        initial={{ opacity: 0, filter: "blur(10px)", y: 12 }}
                        animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
                        exit={{ opacity: 0, filter: "blur(8px)", y: 8 }}
                        transition={{ duration: 0.46, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <div className="space-y-2">
                          <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/55">
                            {formatEventDay(data.event.date)}
                          </p>
                          <h1 className="text-3xl font-black leading-[1.08] tracking-tight text-white drop-shadow-[0_2px_28px_rgba(0,0,0,0.65)] sm:text-[2.125rem]">
                            {data.event.name}
                          </h1>
                          {data.event.location ? (
                            <p className="text-sm text-white/72">{data.event.location}</p>
                          ) : null}
                        </div>

                        <div className="mt-6">
                          <div className="flex flex-col gap-5">
                            <div className="w-full">
                              {showTicketStep ? (
                                <TicketStep
                                  data={data}
                                  ticketsFrom={ticketsFrom}
                                  ticketsWindow={ticketsWindow}
                                  ticketQtys={ticketQtys}
                                  bumpTicket={bumpTicket}
                                  trimTicket={trimTicket}
                                />
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <AnimatePresence>
                          {showFooter && commerceSurface === "hero" ? (
                            <motion.div
                              key="island-checkout-bar"
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={EASE_SMOOTH}
                              className="overflow-hidden"
                            >
                              <div className="mt-5 flex flex-col gap-3 border-t border-white/[0.08] pt-5">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-1">
                                    <span className="text-sm font-medium text-white/65">Total</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <motion.span
                                      key={totalStr}
                                      initial={{ opacity: 0, y: 6 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                                      className="text-xl font-bold tabular-nums tracking-tight text-white sm:text-2xl"
                                    >
                                      {formatMoneyArsExact(totalStr)}
                                    </motion.span>
                                  </div>
                                </div>
                                <Button
                                  className="h-14 w-full rounded-2xl bg-white text-base font-semibold text-black shadow-[0_18px_44px_-18px_rgba(255,255,255,0.45)] transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_24px_56px_-16px_rgba(255,255,255,0.55)] disabled:translate-y-0 disabled:bg-white/30 disabled:text-white/60 disabled:shadow-none"
                                  disabled={!primaryFooterEnabled}
                                  onClick={primaryFooterAction}
                                >
                                  {footerCtaLabel}
                                </Button>
                              </div>
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </motion.div>
            )}

            <AnimatePresence>
              {showFooter && commerceSurface === "store" ? (
                <motion.div
                  key="checkout-bar"
                  initial={{ opacity: 0, y: 28 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={EASE_OUT}
                  className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/[0.08] bg-black/75 px-5 pt-4 backdrop-blur-xl pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-8"
                >
                  <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-white/65">Total</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <motion.span
                          key={totalStr}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                          className="text-xl font-bold tabular-nums tracking-tight text-white sm:text-2xl"
                        >
                          {formatMoneyArsExact(totalStr)}
                        </motion.span>
                      </div>
                    </div>
                    <Button
                      className="h-12 w-full rounded-2xl bg-white text-base font-semibold text-black shadow-[0_18px_44px_-18px_rgba(255,255,255,0.45)] transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_24px_56px_-16px_rgba(255,255,255,0.55)] disabled:translate-y-0 disabled:bg-white/30 disabled:text-white/60 disabled:shadow-none"
                      disabled={!primaryFooterEnabled}
                      onClick={primaryFooterAction}
                    >
                      {footerCtaLabel}
                    </Button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {data && !hasTicketCatalog && !hasProductCatalog ? (
              <p className="mt-4 text-center text-sm text-white/55">
                Este evento no tiene venta online por el momento.
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

const STEP_ENTER: Transition = {
  duration: 0.3,
  ease: [0.22, 1, 0.36, 1] as const,
}

function StepShell({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STEP_ENTER}
      className="space-y-5 pb-2"
    >
      {children}
    </motion.div>
  )
}



function TicketStep({
  data,
  ticketsFrom,
  ticketsWindow,
  ticketQtys,
  bumpTicket,
  trimTicket,
}: {
  data: PublicEventDetailResponse
  ticketsFrom: Date | string | null
  ticketsWindow: { open: boolean; msLeft: number }
  ticketQtys: Record<string, number>
  bumpTicket: (id: string) => void
  trimTicket: (id: string) => void
}) {
  const saleOpen = ticketsWindow.open
  const anyBuyable =
    data.ticketTypes.some((t) => t.availableForPurchase) && saleOpen

  return (
    <StepShell>
      <div className="space-y-1">
        <h2 className="text-xl font-extrabold tracking-tight text-white sm:text-[22px]">
          Entradas
        </h2>
        {ticketsFrom != null && !saleOpen ? (
          <p className="text-sm leading-relaxed text-white/60">
            Venta desde el {formatEventDate(ticketsFrom)} · en{" "}
            <span className="tabular-nums text-white/90">
              {formatCountdown(ticketsWindow.msLeft)}
            </span>
          </p>
        ) : saleOpen ? (
          <p className="text-sm leading-relaxed text-white/60">
            {anyBuyable
              ? ""
              : "Por ahora no hay entradas disponibles para este evento."}
          </p>
        ) : null}
      </div>

      {data.ticketTypes.length === 0 ? (
        <p className="px-1 py-6 text-center text-sm text-white/55">
          Sin entradas a la venta.
        </p>
      ) : (
        <ul className="flex max-h-[352px] flex-col gap-2 overflow-y-auto overscroll-contain -mx-4 -my-4 px-4 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {data.ticketTypes.map((t) => {
            const disabled = !t.availableForPurchase || !saleOpen
            const count = ticketQtys[t.id] ?? 0
            const active = count > 0
            return (
              <li key={t.id}>
                <TicketPickRow
                  name={t.name}
                  priceStr={formatMoneyArsExact(t.price)}
                  count={count}
                  disabled={disabled}
                  active={active}
                  onAdd={() => bumpTicket(t.id)}
                  onRemove={() => trimTicket(t.id)}
                />
              </li>
            )
          })}
        </ul>
      )}
    </StepShell>
  )
}

function TicketPickRow({
  name,
  priceStr,
  count,
  disabled,
  active,
  onAdd,
  onRemove,
}: {
  name: string
  priceStr: string
  count: number
  disabled: boolean
  active: boolean
  onAdd: () => void
  onRemove: () => void
}) {
  return (
    <motion.div
      layout
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={`relative overflow-hidden rounded-2xl shadow-xl shadow-black/60 mb-1 transition-colors duration-200 ${active
        ? "bg-white/[0.2]"
        : "bg-white/[0.2]"
        } ${disabled ? "opacity-40" : ""}`}
    >
      <div className="flex min-h-[4.75rem]">
        <motion.button
          type="button"
          layout
          disabled={disabled}
          onClick={onAdd}
          whileTap={disabled ? undefined : { scale: 0.985 }}
          aria-label={`Sumar una entrada ${name}`}
          className="flex min-w-0 flex-1 flex-row items-center gap-3 px-4 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {active ? (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="flex shrink-0 items-center justify-center gap-1.5"
              >
                <div className="relative grid place-items-center">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={count}
                      initial={{ y: 10, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -10, opacity: 0 }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      className="tabular-nums text-[22px] font-bold leading-none text-white"
                      aria-live="polite"
                    >
                      {count}
                    </motion.span>
                  </AnimatePresence>
                </div>
                <span className="text-[13px] font-semibold text-white/40">x</span>
              </motion.div>
            ) : null}
          </AnimatePresence>
          <motion.div layout className="flex py-2 min-w-0 flex-col justify-center gap-0.5">
            <span className="text-lg font-bold mb-1leading-tight text-white">
              {name}
            </span>
            <span className="text-base font-semibold tabular-nums tracking-tight text-white/85">
              {priceStr}
            </span>
          </motion.div>
        </motion.button>

        <AnimatePresence initial={false} mode="popLayout">
          {active ? (
            <motion.button
              key="rail"
              type="button"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={EASE_OUT}
              whileTap={{ scale: 0.96 }}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onRemove()
              }}
              className="flex w-[4.75rem] shrink-0 flex-col items-center justify-center border-l border-white/10 px-2 text-center text-[12px] font-medium leading-tight text-white/70 outline-none transition-colors hover:bg-white/[0.05] hover:text-white/90 focus-visible:ring-2 focus-visible:ring-white/35"
              aria-label={`Sacar una entrada ${name}`}
            >
              <Minus className="size-5" aria-hidden />
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>

      {!disabled ? (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left rounded-full bg-white/35"
          initial={false}
          animate={{ scaleX: active ? 1 : 0, opacity: active ? 0.55 : 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        />
      ) : null}
    </motion.div>
  )
}

type StoreShelf = "glass" | "bottle" | "cart"

const STORE_SHELF_TRANSITION: Transition = {
  duration: 0.42,
  ease: [0.22, 1, 0.36, 1] as const,
}

function productSaleType(p: PublicDrinkProductItem): PublicProductSaleType {
  return p.saleType ?? "GLASS"
}

function saleTypeLabel(t: PublicProductSaleType): string {
  return t === "BOTTLE" ? "Botella" : "Copa"
}

function ConsumosMarketplace({
  eventName,
  data,
  consFrom,
  consWindow,
  drinks,
  setDrinkQty,
  ticketLines,
  trimTicket,
  cartUnitCount,
  onBack,
}: {
  eventName: string
  data: PublicEventDetailResponse
  consFrom: Date | string | null
  consWindow: { open: boolean; msLeft: number }
  drinks: Record<string, number>
  setDrinkQty: (productId: string, next: number) => void
  ticketLines: CartTicketLine[]
  trimTicket: (ticketTypeId: string) => void
  cartUnitCount: number
  onBack: () => void
}) {
  const products = data.drinkProducts
  const saleOpen = consWindow.open
  const [shelf, setShelf] = useState<StoreShelf>("glass")

  const drinkLines: CartDrinkLine[] = useMemo(() => {
    const out: CartDrinkLine[] = []
    for (const [pid, q] of Object.entries(drinks)) {
      if (q <= 0) continue
      const p = data.drinkProducts.find((x) => x.id === pid)
      if (p) out.push({ productId: pid, quantity: q, unitPrice: p.price })
    }
    return out
  }, [data.drinkProducts, drinks])

  const glassProducts = useMemo(
    () => products.filter((p) => productSaleType(p) === "GLASS"),
    [products]
  )
  const bottleProducts = useMemo(
    () => products.filter((p) => productSaleType(p) === "BOTTLE"),
    [products]
  )

  const hint =
    shelf === "cart"
      ? "Gestioná entradas y consumos. Solo desde acá podés sacar ítems."
      : shelf === "glass"
        ? "Tocá un producto para sumarlo al carrito. Las copas se agregan de a una."
        : "Tocá un producto para sumarlo al carrito. Las botellas se agregan de a una."

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STORE_TRANSITION}
      className="relative flex min-h-0 flex-1 flex-col"
    >
      <ConsumosShelfRail
        shelf={shelf}
        onShelf={setShelf}
        cartUnitCount={cartUnitCount}
      />

      <header className="sticky top-0 z-10 -mx-4 mb-4 border-b border-white/[0.07] bg-black/80 px-2 py-3 pr-16 backdrop-blur-md sm:-mx-5 sm:pr-[4.5rem]">
        <div className="flex items-start gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="mt-0.5 size-9 shrink-0 rounded-xl text-white/70 hover:bg-white/10 hover:text-white"
            onClick={onBack}
            aria-label="Volver"
          >
            <ChevronLeft className="size-5" />
          </Button>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 className="text-lg font-bold leading-snug tracking-tight text-white">
              Consumos
            </h2>
            <p className="line-clamp-1 text-xs text-white/50">{eventName}</p>
          </div>
        </div>
      </header>

      {consFrom != null && !saleOpen ? (
        <p className="mb-4 text-sm leading-relaxed text-white/60">
          Disponibles desde el {formatEventDate(consFrom)} · en{" "}
          <span className="tabular-nums text-white/90">
            {formatCountdown(consWindow.msLeft)}
          </span>
        </p>
      ) : products.length > 0 ? (
        <p className="mb-4 text-sm text-white/55">{hint}</p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-8 pr-14 sm:pr-[4.5rem]">
        {products.length === 0 ? (
          <p className="text-sm text-white/55">
            No hay consumos digitales para este evento.
          </p>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            {shelf === "cart" ? (
              <motion.div
                key="panel-cart"
                role="tabpanel"
                aria-labelledby="shelf-cart"
                initial={{ opacity: 0, x: 36, filter: "blur(10px)" }}
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, x: -28, filter: "blur(8px)" }}
                transition={STORE_SHELF_TRANSITION}
              >
                <StoreCartPanel
                  data={data}
                  ticketLines={ticketLines}
                  drinkLines={drinkLines}
                  trimTicket={trimTicket}
                  setDrinkQty={setDrinkQty}
                  drinks={drinks}
                />
              </motion.div>
            ) : shelf === "glass" ? (
              <motion.div
                key="panel-glass"
                role="tabpanel"
                aria-labelledby="shelf-glass"
                initial={{ opacity: 0, x: -36, filter: "blur(10px)" }}
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, x: 28, filter: "blur(8px)" }}
                transition={STORE_SHELF_TRANSITION}
              >
                <ul className="flex flex-col gap-3">
                  {glassProducts.length === 0 ? (
                    <li className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-8 text-center text-sm text-white/50">
                      No hay productos tipo copa en este evento.
                    </li>
                  ) : null}
                  {glassProducts.map((p) => (
                    <li key={p.id}>
                      <ProductShelfRow
                        name={p.name}
                        imageUrl={p.imageUrl?.trim() || null}
                        categoryLabel={saleTypeLabel(productSaleType(p))}
                        priceStr={formatMoneyArsExact(p.price)}
                        disabled={!saleOpen}
                        onAdd={() => {
                          const q = drinks[p.id] ?? 0
                          setDrinkQty(p.id, Math.min(99, q + 1))
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </motion.div>
            ) : (
              <motion.div
                key="panel-bottle"
                role="tabpanel"
                aria-labelledby="shelf-bottle"
                initial={{ opacity: 0, x: 36, filter: "blur(10px)" }}
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, x: -28, filter: "blur(8px)" }}
                transition={STORE_SHELF_TRANSITION}
              >
                <ul className="flex flex-col gap-3">
                  {bottleProducts.length === 0 ? (
                    <li className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-8 text-center text-sm text-white/50">
                      No hay productos tipo botella en este evento.
                    </li>
                  ) : null}
                  {bottleProducts.map((p) => (
                    <li key={p.id}>
                      <ProductShelfRow
                        name={p.name}
                        imageUrl={p.imageUrl?.trim() || null}
                        categoryLabel={saleTypeLabel(productSaleType(p))}
                        priceStr={formatMoneyArsExact(p.price)}
                        disabled={!saleOpen}
                        onAdd={() => {
                          const q = drinks[p.id] ?? 0
                          setDrinkQty(p.id, Math.min(99, q + 1))
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  )
}

function ConsumosShelfRail({
  shelf,
  onShelf,
  cartUnitCount,
}: {
  shelf: StoreShelf
  onShelf: (s: StoreShelf) => void
  cartUnitCount: number
}) {
  return (
    <nav
      className="pointer-events-auto fixed right-0 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-px rounded-l-[1.15rem] border border-white/[0.12] border-r-0 bg-zinc-950/[0.96] py-1 pl-1 shadow-[-14px_0_44px_-10px_rgba(0,0,0,0.88)] backdrop-blur-xl pr-[max(0.35rem,env(safe-area-inset-right))]"
      aria-label="Secciones"
    >
      <motion.div layout className="flex flex-col gap-px" transition={STORE_SHELF_TRANSITION}>
        <ShelfRailButton
          id="shelf-glass"
          label="Ver copas"
          active={shelf === "glass"}
          onClick={() => onShelf("glass")}
        >
          <Wine className="size-[1.35rem]" strokeWidth={2} aria-hidden />
        </ShelfRailButton>
        <ShelfRailButton
          id="shelf-bottle"
          label="Ver botellas"
          active={shelf === "bottle"}
          onClick={() => onShelf("bottle")}
        >
          <BottleWine className="size-[1.35rem]" strokeWidth={2} aria-hidden />
        </ShelfRailButton>
        <ShelfRailButton
          id="shelf-cart"
          label="Ver carrito"
          active={shelf === "cart"}
          onClick={() => onShelf("cart")}
        >
          <span className="relative inline-flex">
            <ShoppingCart className="size-[1.35rem]" strokeWidth={2} aria-hidden />
            {cartUnitCount > 0 ? (
              <span className="absolute -right-2 -top-2 flex min-h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold tabular-nums text-black shadow-sm">
                {cartUnitCount > 99 ? "99+" : cartUnitCount}
              </span>
            ) : null}
          </span>
        </ShelfRailButton>
      </motion.div>
    </nav>
  )
}

function ShelfRailButton({
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
      className={`relative flex size-[3.25rem] items-center justify-center rounded-l-xl outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/35 ${active
        ? "bg-white text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]"
        : "text-white/72 hover:bg-white/[0.08] hover:text-white"
        }`}
    >
      {children}
    </button>
  )
}

function ProductShelfRow({
  name,
  imageUrl,
  categoryLabel,
  priceStr,
  disabled,
  onAdd,
}: {
  name: string
  imageUrl?: string | null
  categoryLabel: string
  priceStr: string
  disabled: boolean
  onAdd: () => void
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?"
  const [addedPulse, setAddedPulse] = useState(false)
  const showPhoto = Boolean(imageUrl)

  const triggerAdd = () => {
    if (disabled) return
    onAdd()
    setAddedPulse(true)
    window.setTimeout(() => setAddedPulse(false), 520)
  }

  if (showPhoto) {
    return (
      <motion.button
        type="button"
        disabled={disabled}
        onClick={triggerAdd}
        whileTap={disabled ? undefined : { scale: 0.988 }}
        className="group relative aspect-[4/3] w-full max-h-[min(320px,52vw)] overflow-hidden rounded-[1.35rem] border border-white/[0.14] bg-zinc-950 text-left shadow-[0_20px_50px_-24px_rgba(0,0,0,0.95)] outline-none focus-visible:ring-2 focus-visible:ring-white/35 disabled:pointer-events-none disabled:opacity-45 sm:max-h-[300px] sm:rounded-[1.75rem]"
      >
        <img
          src={imageUrl!}
          alt={name}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-[0.55s] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105 group-active:scale-[1.02]"
          loading="lazy"
          decoding="async"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/5"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute right-3 top-3 flex size-10 items-center justify-center rounded-full border border-white/25 bg-white/15 shadow-lg backdrop-blur-md sm:right-4 sm:top-4"
        >
          <Heart className="size-[1.15rem] fill-white/90 text-white/90" strokeWidth={1.75} />
        </span>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4 pt-16 sm:p-5 sm:pt-20">
          <p className="text-[1.35rem] font-extrabold leading-[1.15] tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.65)] sm:text-2xl">
            {name}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] font-medium text-white/88 sm:text-sm">
            <MapPin className="size-3.5 shrink-0 opacity-80" strokeWidth={2.25} aria-hidden />
            <span>{categoryLabel}</span>
            <span className="text-white/40">·</span>
            <span className="tabular-nums text-white/95">{priceStr}</span>
          </p>
        </div>
        <AnimatePresence>
          {addedPulse ? (
            <motion.span
              key="chk"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-[2px]"
            >
              <motion.span
                initial={{ scale: 0.65, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 28 }}
                className="flex size-16 items-center justify-center rounded-full bg-emerald-500/95 shadow-[0_12px_40px_-8px_rgba(16,185,129,0.55)]"
              >
                <Check className="size-9 text-white" strokeWidth={2.75} aria-hidden />
              </motion.span>
            </motion.span>
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
      className={`relative flex w-full gap-3 overflow-hidden rounded-2xl border border-white/[0.12] bg-zinc-950 p-3.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/30 disabled:pointer-events-none disabled:opacity-45`}
    >
      <motion.div
        aria-hidden
        className="relative flex size-[4.5rem] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-b from-white/[0.1] to-white/[0.03]"
        animate={
          addedPulse
            ? { scale: [1, 1.06, 1], boxShadow: ["0 0 0 0 rgba(34,197,94,0)", "0 0 0 10px rgba(34,197,94,0.12)", "0 0 0 0 rgba(34,197,94,0)"] }
            : {}
        }
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className="flex size-11 items-center justify-center rounded-xl border border-white/10 bg-black/45 text-lg font-semibold text-white/92">
          {initial}
        </span>
        <AnimatePresence>
          {addedPulse ? (
            <motion.span
              key="chk"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/55"
            >
              <Check className="size-8 text-emerald-400" strokeWidth={2.5} aria-hidden />
            </motion.span>
          ) : null}
        </AnimatePresence>
      </motion.div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 pr-1">
        <p className="text-[15px] font-bold leading-snug text-white">{name}</p>
        <p className="text-xs text-white/45">{categoryLabel}</p>
        <p className="text-sm font-semibold tabular-nums text-white/55">{priceStr}</p>
      </div>
    </motion.button>
  )
}

function StoreCartPanel({
  data,
  ticketLines,
  drinkLines,
  trimTicket,
  setDrinkQty,
  drinks,
}: {
  data: PublicEventDetailResponse
  ticketLines: CartTicketLine[]
  drinkLines: CartDrinkLine[]
  trimTicket: (ticketTypeId: string) => void
  setDrinkQty: (productId: string, next: number) => void
  drinks: Record<string, number>
}) {
  const hasTickets = ticketLines.length > 0
  const hasConsumos = drinkLines.length > 0
  const isEmpty = !hasTickets && !hasConsumos

  if (isEmpty) {
    return (
      <div className="rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.02] px-5 py-14 text-center">
        <ShoppingCart className="mx-auto mb-4 size-10 text-white/25" aria-hidden />
        <p className="text-base font-semibold text-white/80">Carrito vacío</p>
        <p className="mt-2 text-sm leading-relaxed text-white/45">
          Elegí copas o botellas y sumalos con un toque. Acá vas a ver entradas y
          consumos, y vas a poder sacarlos si cambiás de idea.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {hasTickets ? (
        <section className="space-y-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
            Entradas
          </h3>
          <ul className="flex flex-col gap-4">
            {ticketLines.map((line) => {
              const t = data.ticketTypes.find((x) => x.id === line.ticketTypeId)
              const name = t?.name ?? "Entrada"
              const initial = name.trim().charAt(0).toUpperCase() || "?"
              const sub = new Decimal(line.unitPrice).mul(line.quantity).toFixed(2)
              return (
                <li key={line.ticketTypeId}>
                  <motion.article
                    layout
                    transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                    className="rounded-2xl border border-white/[0.1] bg-gradient-to-b from-white/[0.08] to-white/[0.02] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                  >
                    <div className="flex gap-3 sm:gap-4">
                      <div
                        aria-hidden
                        className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-black/40 text-lg font-bold text-white/90"
                      >
                        {initial}
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div>
                          <p className="text-base font-bold leading-snug text-white">{name}</p>
                          <p className="mt-0.5 text-sm text-white/45">
                            Entrada ·{" "}
                            <span className="tabular-nums text-white/65">{line.quantity}</span>{" "}
                            {line.quantity === 1 ? "unidad" : "unidades"}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                          <span className="text-white/50">
                            {formatMoneyArsExact(line.unitPrice)} c/u
                          </span>
                          <span className="text-white/35">·</span>
                          <span className="text-base font-bold tabular-nums text-white">
                            {formatMoneyArsExact(sub)}
                          </span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="mt-0.5 size-10 shrink-0 rounded-xl border border-white/10 text-white/75 hover:bg-white/10 hover:text-white"
                        onClick={() => trimTicket(line.ticketTypeId)}
                        aria-label={`Quitar una entrada ${name}`}
                      >
                        <Minus className="size-5" />
                      </Button>
                    </div>
                  </motion.article>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {hasTickets && hasConsumos ? (
        <div
          className="h-px w-full bg-gradient-to-r from-transparent via-white/18 to-transparent"
          aria-hidden
        />
      ) : null}

      {hasConsumos ? (
        <section className="space-y-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
            Consumos
          </h3>
          <ul className="flex flex-col gap-4">
            {drinkLines.map((line) => {
              const p = data.drinkProducts.find((x) => x.id === line.productId)
              const name = p?.name ?? "Producto"
              const initial = name.trim().charAt(0).toUpperCase() || "?"
              const sub = new Decimal(line.unitPrice).mul(line.quantity).toFixed(2)
              const st = p ? productSaleType(p) : "GLASS"
              const q = drinks[line.productId] ?? 0
              return (
                <li key={line.productId}>
                  <motion.article
                    layout
                    transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                    className="rounded-2xl border border-white/[0.1] bg-gradient-to-b from-white/[0.08] to-white/[0.02] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                  >
                    <div className="flex gap-3 sm:gap-4">
                      <div
                        aria-hidden
                        className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-black/40 text-lg font-bold text-white/90"
                      >
                        {initial}
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div>
                          <p className="text-base font-bold leading-snug text-white">{name}</p>
                          <p className="mt-0.5 text-sm text-white/45">
                            {saleTypeLabel(st)} ·{" "}
                            <span className="tabular-nums text-white/65">{line.quantity}</span>{" "}
                            {line.quantity === 1 ? "unidad" : "unidades"}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                          <span className="text-white/50">
                            {formatMoneyArsExact(line.unitPrice)} c/u
                          </span>
                          <span className="text-white/35">·</span>
                          <span className="text-base font-bold tabular-nums text-white">
                            {formatMoneyArsExact(sub)}
                          </span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="mt-0.5 size-10 shrink-0 rounded-xl border border-white/10 text-white/75 hover:bg-white/10 hover:text-white"
                        onClick={() => setDrinkQty(line.productId, q - 1)}
                        aria-label={`Sacar un consumo ${name}`}
                      >
                        <Minus className="size-5" />
                      </Button>
                    </div>
                  </motion.article>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
    </div>
  )
}