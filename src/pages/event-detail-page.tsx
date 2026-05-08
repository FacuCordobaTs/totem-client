import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { ChevronLeft, Minus } from "lucide-react"
import { AnimatePresence, motion, type Transition } from "motion/react"
import Decimal from "decimal.js"
import { publicApiFetch } from "@/lib/api"
import type { PublicEventDetailResponse } from "@/types/api"
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
  const [bolsaOpen, setBolsaOpen] = useState(false)

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
      setBolsaOpen(false)
    }
  }, [purchaseOpen])

  useEffect(() => {
    if (!bolsaOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBolsaOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [bolsaOpen])

  useEffect(() => {
    if (!bolsaOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [bolsaOpen])

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
          animate={{ opacity: flyerVisible ? 1 : 0 }}
          transition={STORE_TRANSITION}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black via-black/70 to-transparent"
          animate={{ opacity: flyerVisible ? 1 : 0 }}
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
            : `relative z-10 mx-auto flex min-h-dvh max-h-dvh w-full max-w-lg flex-col justify-end overflow-y-auto overscroll-contain px-5 pt-10 sm:px-8 ${purchaseOpen ? "pb-40" : "pb-6"}`
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
                products={data.drinkProducts}
                consFrom={consFrom}
                consWindow={consWindow}
                drinks={drinks}
                setDrinkQty={setDrinkQty}
                onBack={storeBack}
              />
            ) : (
              <motion.div
                animate={{
                  y: purchaseOpen ? -28 : 0,
                  marginBottom: showFooter && commerceSurface === "hero" ? -130 : 0
                }}
                transition={EASE_SMOOTH}
                className="w-full"
              >
                <div className="rounded-[28px] border border-white/[0.1] px-5 py-5 shadow-[0_-28px_90px_-24px_rgba(0,0,0,0.95)] backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-black/30">
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
                    <AnimatePresence mode="wait" initial={false}>
                      {!purchaseOpen ? (
                        <motion.div
                          key="cta"
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{
                            opacity: 0,
                            y: -12,
                            filter: "blur(8px)",
                            transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
                          }}
                          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                        >
                          <button
                            type="button"
                            disabled={ctaDisabled}
                            onClick={startPurchase}
                            className="group/cta relative flex h-14 w-full items-center justify-center gap-4 overflow-hidden rounded-2xl bg-white px-5 text-left text-base font-semibold text-black shadow-[0_24px_48px_-16px_rgba(255,255,255,0.35)] transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_28px_56px_-14px_rgba(255,255,255,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-white/30 disabled:text-white/60 disabled:shadow-none"
                          >
                            <span className="text-[15px] leading-tight">{ctaLabel}</span>
                          </button>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="flow"
                          initial={{ opacity: 0, y: 22, filter: "blur(10px)" }}
                          animate={{
                            opacity: 1,
                            y: 0,
                            filter: "blur(0px)",
                            transition: { duration: 0.46, ease: [0.22, 1, 0.36, 1] },
                          }}
                          exit={{
                            opacity: 0,
                            y: 16,
                            filter: "blur(8px)",
                            transition: { duration: 0.22 },
                          }}
                          className="flex flex-col gap-5"
                        >
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
                        </motion.div>
                      )}
                    </AnimatePresence>
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
                </div>
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

            {data && showFooter ? (
              <TuBolsaDrawer
                open={bolsaOpen}
                onClose={() => setBolsaOpen(false)}
                data={data}
                ticketLines={ticketLines}
                drinkLines={drinkLines}
                totalStr={totalStr}
                footerCtaLabel={footerCtaLabel}
                primaryFooterEnabled={primaryFooterEnabled}
                onPrimaryAction={() => {
                  primaryFooterAction()
                  setBolsaOpen(false)
                }}
              />
            ) : null}

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

const BOLSA_DRAWER_HEIGHT = "58vh"

function TuBolsaDrawer({
  open,
  onClose,
  data,
  ticketLines,
  drinkLines,
  totalStr,
  footerCtaLabel,
  primaryFooterEnabled,
  onPrimaryAction,
}: {
  open: boolean
  onClose: () => void
  data: PublicEventDetailResponse
  ticketLines: CartTicketLine[]
  drinkLines: CartDrinkLine[]
  totalStr: string
  footerCtaLabel: string
  primaryFooterEnabled: boolean
  onPrimaryAction: () => void
}) {
  const hasTickets = ticketLines.length > 0
  const hasConsumos = drinkLines.length > 0
  const isEmpty = !hasTickets && !hasConsumos

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="bolsa-root"
          className="fixed inset-0 z-[60] flex items-end justify-center sm:items-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.button
            type="button"
            aria-label="Cerrar"
            className="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bolsa-titulo"
            className="relative z-10 flex w-full max-w-lg flex-col rounded-t-[1.35rem] border border-white/[0.12] border-b-0 bg-[#0c0c0c] shadow-[0_-12px_48px_-8px_rgba(0,0,0,0.85)]"
            style={{ height: BOLSA_DRAWER_HEIGHT, maxHeight: BOLSA_DRAWER_HEIGHT }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={EASE_OUT}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 px-5 pb-3 pt-4">
              <div
                aria-hidden
                className="mx-auto mb-4 h-1 w-10 shrink-0 rounded-full bg-white/20"
              />
              <h2
                id="bolsa-titulo"
                className="text-center text-lg font-bold tracking-tight text-white"
              >
                Tu bolsa
              </h2>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-2">
              {isEmpty ? (
                <p className="py-8 text-center text-sm text-white/50">
                  Todavía no agregaste nada. Elegí entradas o consumos para verlos
                  acá.
                </p>
              ) : (
                <div className="space-y-6 pb-2">
                  {hasTickets ? (
                    <section className="space-y-3">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
                        Entradas
                      </h3>
                      <ul className="space-y-2">
                        {ticketLines.map((line) => {
                          const t = data.ticketTypes.find(
                            (x) => x.id === line.ticketTypeId
                          )
                          const name = t?.name ?? "Entrada"
                          const sub = new Decimal(line.unitPrice)
                            .mul(line.quantity)
                            .toFixed(2)
                          return (
                            <li
                              key={line.ticketTypeId}
                              className="flex items-start justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-white">
                                  {name}
                                </p>
                                <p className="mt-0.5 text-xs text-white/45">
                                  {line.quantity} ×{" "}
                                  {formatMoneyArsExact(line.unitPrice)}
                                </p>
                              </div>
                              <span className="shrink-0 text-sm font-semibold tabular-nums text-white/90">
                                {formatMoneyArsExact(sub)}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  ) : null}

                  {hasTickets && hasConsumos ? (
                    <div
                      className="h-px w-full bg-gradient-to-r from-transparent via-white/15 to-transparent"
                      aria-hidden
                    />
                  ) : null}

                  {hasConsumos ? (
                    <section className="space-y-3">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
                        Consumos
                      </h3>
                      <ul className="space-y-2">
                        {drinkLines.map((line) => {
                          const p = data.drinkProducts.find(
                            (x) => x.id === line.productId
                          )
                          const name = p?.name ?? "Producto"
                          const sub = new Decimal(line.unitPrice)
                            .mul(line.quantity)
                            .toFixed(2)
                          return (
                            <li
                              key={line.productId}
                              className="flex items-start justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-white">
                                  {name}
                                </p>
                                <p className="mt-0.5 text-xs text-white/45">
                                  {line.quantity} ×{" "}
                                  {formatMoneyArsExact(line.unitPrice)}
                                </p>
                              </div>
                              <span className="shrink-0 text-sm font-semibold tabular-nums text-white/90">
                                {formatMoneyArsExact(sub)}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  ) : null}
                </div>
              )}
            </div>

            <div className="shrink-0 space-y-3 border-t border-white/[0.1] bg-[#0c0c0c] px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-sm text-white/65">Total</span>
                <span className="text-xl font-bold tabular-nums tracking-tight text-white">
                  {formatMoneyArsExact(totalStr)}
                </span>
              </div>
              <Button
                className="h-12 w-full rounded-2xl bg-white text-base font-semibold text-black shadow-[0_14px_36px_-12px_rgba(255,255,255,0.35)] transition-all hover:bg-white disabled:bg-white/30 disabled:text-white/60 disabled:shadow-none"
                disabled={!primaryFooterEnabled}
                onClick={onPrimaryAction}
              >
                {footerCtaLabel}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
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

function ConsumosMarketplace({
  eventName,
  products,
  consFrom,
  consWindow,
  drinks,
  setDrinkQty,
  onBack,
}: {
  eventName: string
  products: PublicEventDetailResponse["drinkProducts"]
  consFrom: Date | string | null
  consWindow: { open: boolean; msLeft: number }
  drinks: Record<string, number>
  setDrinkQty: (productId: string, next: number) => void
  onBack: () => void
}) {
  const saleOpen = consWindow.open

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STORE_TRANSITION}
      className="flex min-h-0 flex-1 flex-col"
    >
      <header className="sticky top-0 z-10 -mx-4 mb-4 border-b border-white/[0.07] bg-black/80 px-2 py-3 backdrop-blur-md sm:-mx-5">
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
      ) : saleOpen && products.length > 0 ? (
        <p className="mb-4 text-sm text-white/55">
          Tocá un producto para agregarlo al carrito.
        </p>
      ) : null}

      {products.length === 0 ? (
        <p className="text-sm text-white/55">
          No hay consumos digitales para este evento.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 pb-4">
          {products.map((p) => {
            const q = drinks[p.id] ?? 0
            const disabled = !saleOpen
            return (
              <li key={p.id} className="min-w-0">
                <ProductMarketTile
                  name={p.name}
                  priceStr={formatMoneyArsExact(p.price)}
                  quantity={q}
                  disabled={disabled}
                  onAdd={() => setDrinkQty(p.id, Math.min(99, q + 1))}
                  onRemove={() => setDrinkQty(p.id, q - 1)}
                />
              </li>
            )
          })}
        </ul>
      )}
    </motion.div>
  )
}

function ProductMarketTile({
  name,
  priceStr,
  quantity,
  disabled,
  onAdd,
  onRemove,
}: {
  name: string
  priceStr: string
  quantity: number
  disabled: boolean
  onAdd: () => void
  onRemove: () => void
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?"
  const active = quantity > 0

  return (
    <motion.div
      layout
      className={`relative flex flex-col overflow-hidden rounded-2xl border bg-zinc-950 transition-colors duration-200 ${active
        ? "border-white/30 ring-1 ring-white/20"
        : "border-white/[0.12]"
        } ${disabled ? "opacity-45" : ""}`}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onAdd}
        className="flex aspect-square w-full flex-col p-3 text-left outline-none transition-transform active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-white/30 disabled:pointer-events-none"
      >
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl bg-gradient-to-b from-white/[0.08] to-white/[0.02]">
          <span
            aria-hidden
            className="flex size-[52px] items-center justify-center rounded-2xl border border-white/10 bg-black/40 text-xl font-semibold text-white/90"
          >
            {initial}
          </span>
        </div>
        <div className="mt-3 min-h-0">
          <p className="line-clamp-2 text-left text-[13px] font-semibold leading-snug text-white">
            {name}
          </p>
          <p className="mt-1 text-left text-xs font-medium tabular-nums text-white/55">
            {priceStr}
          </p>
        </div>
        {quantity > 0 ? (
          <span className="absolute right-2 top-2 flex min-w-[1.75rem] items-center justify-center rounded-lg bg-white px-2 py-0.5 text-xs font-bold text-black tabular-nums shadow-sm">
            {quantity}
          </span>
        ) : null}
      </button>

      <AnimatePresence initial={false}>
        {active ? (
          <motion.div
            key="sacar"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-white/[0.08]"
          >
            <button
              type="button"
              className="w-full bg-white/[0.06] py-2.5 text-center text-[11px] font-semibold text-white/75 transition-colors hover:bg-white/10 hover:text-white"
              onClick={(e) => {
                e.stopPropagation()
                onRemove()
              }}
            >
              Sacar uno
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  )
}