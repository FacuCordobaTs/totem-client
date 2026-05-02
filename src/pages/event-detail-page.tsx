import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { ArrowUpRight, ChevronLeft } from "lucide-react"
import { AnimatePresence, motion, type Transition } from "motion/react"
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

const EASE_OUT: Transition = { duration: 0.32, ease: [0.22, 1, 0.36, 1] }
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
      })
      .catch(() => setError("No pudimos cargar el evento."))
  }, [eventId])

  useEffect(() => {
    load()
  }, [load])

  const hasTicketCatalog = (data?.ticketTypes.length ?? 0) > 0
  const hasProductCatalog = (data?.drinkProducts.length ?? 0) > 0
  const needsWorkflowChoice = hasTicketCatalog && hasProductCatalog

  useEffect(() => {
    if (!data) return
    const hasT = data.ticketTypes.length > 0
    const hasP = data.drinkProducts.length > 0
    if (hasT && !hasP) setWorkflow("tickets")
    else if (!hasT && hasP) setWorkflow("products")
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

  const canContinue =
    (ticketCount > 0 && ticketsBuyable) || (hasDrinks && drinksBuyable)

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

  const chooseTicketsWorkflow = () => {
    setDrinks({})
    setWorkflow("tickets")
  }

  const chooseProductsWorkflow = () => {
    setTicketQtys({})
    setWorkflow("products")
  }

  const goBackToChooser = () => {
    if (!needsWorkflowChoice) return
    setWorkflow(null)
  }

  const anyTicketPurchasable =
    !!data?.ticketTypes.some((t) => t.availableForPurchase) && ticketsWindow.open
  const productsPurchasable = consWindow.open && hasProductCatalog

  const anythingPurchasable = anyTicketPurchasable || productsPurchasable
  const hasAnyCatalog = hasTicketCatalog || hasProductCatalog

  const showChooser = !!data && needsWorkflowChoice && workflow == null
  const showTicketStep = !!data && workflow === "tickets"
  const showProductStep = !!data && workflow === "products"
  const showFooter = !!data && purchaseOpen && (showTicketStep || showProductStep)

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
  }

  if (!eventId) return null

  const hero = data?.event.imageUrl ?? null

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
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            loading="eager"
            decoding="async"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-b from-zinc-900 via-zinc-950 to-black" />
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-black/15 to-black/95"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black via-black/70 to-transparent"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex items-center justify-between px-6 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8"
      >
        {data ? (
          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/85 backdrop-blur-xl">
            {data.productora.name}
          </span>
        ) : (
          <span />
        )}
      </motion.div>

      <div
        className={`relative z-10 mx-auto flex min-h-dvh max-h-dvh w-full max-w-lg flex-col justify-end overflow-y-auto overscroll-contain px-5 pt-10 sm:px-8 ${showFooter ? "pb-40" : "pb-6"}`}
      >
        {error ? (
          <p className="text-sm text-red-300">{error}</p>
        ) : !data ? (
          <p className="text-sm text-white/60">Cargando…</p>
        ) : (
          <>
            <motion.div
              animate={{
                y: purchaseOpen ? -28 : 0,
              }}
              transition={EASE_SMOOTH}
              className="w-full"
            >
              <div className="rounded-[28px] border border-white/[0.1] bg-black/75 px-5 py-5 shadow-[0_-28px_90px_-24px_rgba(0,0,0,0.95)] backdrop-blur-lg backdrop-saturate-150 supports-[backdrop-filter]:bg-black/45">
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
                          className="group/cta relative flex h-14 w-full items-center justify-between gap-4 overflow-hidden rounded-2xl bg-white px-5 text-left text-base font-semibold text-black shadow-[0_24px_48px_-16px_rgba(255,255,255,0.35)] transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_28px_56px_-14px_rgba(255,255,255,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-white/30 disabled:text-white/60 disabled:shadow-none"
                        >
                          <span
                            aria-hidden
                            className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/70 to-transparent opacity-0 transition-all duration-700 ease-out group-hover/cta:translate-x-full group-hover/cta:opacity-100"
                          />
                          <span className="relative flex flex-col">
                            <span className="text-[15px] leading-tight">{ctaLabel}</span>
                            {anythingPurchasable && hasAnyCatalog ? (
                              <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-black/55">
                                {needsWorkflowChoice
                                  ? "entradas · consumos"
                                  : hasTicketCatalog
                                    ? "comprar entrada"
                                    : "comprar consumos"}
                              </span>
                            ) : null}
                          </span>
                          <span className="relative grid size-9 place-items-center rounded-full bg-black/5 transition-transform duration-300 ease-out group-hover/cta:rotate-45 group-hover/cta:bg-black/10">
                            <ArrowUpRight className="size-4" aria-hidden />
                          </span>
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
                        {(showTicketStep || showProductStep) && needsWorkflowChoice ? (
                          <Button
                            type="button"
                            variant="ghost"
                            className="-ml-2 h-auto self-start rounded-xl px-2 py-1.5 text-sm text-white/60 hover:bg-white/10 hover:text-white"
                            onClick={goBackToChooser}
                          >
                            <ChevronLeft className="mr-0.5 size-4" aria-hidden />
                            Elegir otra opción
                          </Button>
                        ) : null}

                        <div className="w-full">
                          {showChooser ? (
                            <ChooserStep
                              hasTicketCatalog={hasTicketCatalog}
                              anyTicketPurchasable={anyTicketPurchasable}
                              hasProductCatalog={hasProductCatalog}
                              productsPurchasable={productsPurchasable}
                              ticketsFrom={ticketsFrom}
                              ticketsOpen={ticketsWindow.open}
                              consFrom={consFrom}
                              consOpen={consWindow.open}
                              onChooseTickets={chooseTicketsWorkflow}
                              onChooseProducts={chooseProductsWorkflow}
                            />
                          ) : showTicketStep ? (
                            <TicketStep
                              data={data}
                              ticketsFrom={ticketsFrom}
                              ticketsWindow={ticketsWindow}
                              ticketQtys={ticketQtys}
                              bumpTicket={bumpTicket}
                              trimTicket={trimTicket}
                            />
                          ) : showProductStep ? (
                            <ProductStep
                              data={data}
                              consFrom={consFrom}
                              consWindow={consWindow}
                              drinks={drinks}
                              setDrinkQty={setDrinkQty}
                            />
                          ) : null}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>

            {!purchaseOpen ? (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-5 text-center text-[11px] text-white/40"
              >
                Pago seguro con Mercado Pago
              </motion.p>
            ) : null}

            <AnimatePresence>
              {showFooter ? (
                <motion.div
                  key="checkout-bar"
                  initial={{ opacity: 0, y: 28 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={EASE_OUT}
                  className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/[0.08] bg-black/75 px-5 pt-4 backdrop-blur-xl pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-8"
                >
                  <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-sm text-white/65">Total</span>
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
                    <Button
                      className="h-12 w-full rounded-2xl bg-white text-base font-semibold text-black shadow-[0_18px_44px_-18px_rgba(255,255,255,0.45)] transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_24px_56px_-16px_rgba(255,255,255,0.55)] disabled:translate-y-0 disabled:bg-white/30 disabled:text-white/60 disabled:shadow-none"
                      disabled={!canContinue}
                      onClick={continueClick}
                    >
                      Continuar al pago
                    </Button>
                    <p className="text-center text-[11px] leading-relaxed text-white/45">
                      Pago procesado de forma segura con Mercado Pago.
                    </p>
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

function ChooserStep({
  hasTicketCatalog,
  anyTicketPurchasable,
  hasProductCatalog,
  productsPurchasable,
  ticketsFrom,
  ticketsOpen,
  consFrom,
  consOpen,
  onChooseTickets,
  onChooseProducts,
}: {
  hasTicketCatalog: boolean
  anyTicketPurchasable: boolean
  hasProductCatalog: boolean
  productsPurchasable: boolean
  ticketsFrom: Date | string | null
  ticketsOpen: boolean
  consFrom: Date | string | null
  consOpen: boolean
  onChooseTickets: () => void
  onChooseProducts: () => void
}) {
  const ticketsDisabled = !hasTicketCatalog || !anyTicketPurchasable
  const productsDisabled = !hasProductCatalog || !productsPurchasable

  return (
    <StepShell>
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold tracking-tight text-white sm:text-[22px]">
          ¿Qué querés comprar?
        </h2>
        <p className="text-sm leading-relaxed text-white/60">
          Elegí entradas para el evento o consumos para canjear en el momento.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <ChoiceCard
          title="Entradas"
          description={
            hasTicketCatalog && anyTicketPurchasable
              ? "Armá tu grupo combinando tipos"
              : ticketsFrom != null && !ticketsOpen
                ? `Disponibles desde ${formatEventDate(ticketsFrom)}`
                : "No hay entradas a la venta"
          }
          disabled={ticketsDisabled}
          onClick={onChooseTickets}
        />
        <ChoiceCard
          title="Consumos"
          description={
            hasProductCatalog && productsPurchasable
              ? "Bebidas y productos del evento"
              : consFrom != null && !consOpen
                ? `Disponibles desde ${formatEventDate(consFrom)}`
                : "No hay consumos para este evento"
          }
          disabled={productsDisabled}
          onClick={onChooseProducts}
        />
      </div>
    </StepShell>
  )
}

function ChoiceCard({
  title,
  description,
  disabled,
  onClick,
}: {
  title: string
  description: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      whileTap={disabled ? undefined : { scale: 0.985 }}
      className={`group/choice relative flex w-full items-center justify-between gap-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-5 text-left transition-colors duration-200 ${
        disabled
          ? "cursor-not-allowed opacity-40"
          : "hover:border-white/25 hover:bg-white/[0.1]"
      }`}
    >
      <div className="min-w-0 flex flex-col">
        <span className="text-[15px] font-semibold text-white">{title}</span>
        <span className="mt-0.5 text-[13px] text-white/55">{description}</span>
      </div>
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-white/70 transition-all duration-200 group-hover/choice:translate-x-0.5 group-hover/choice:border-white/25 group-hover/choice:bg-white/10 group-hover/choice:text-white"
      >
        <ArrowUpRight className="size-4 -rotate-45" />
      </span>
    </motion.button>
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
        <h2 className="text-xl font-semibold tracking-tight text-white sm:text-[22px]">
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
              ? "Tocá una fila para sumarla al pedido. Podés combinar distintos tipos."
              : "Por ahora no hay entradas disponibles para este evento."}
          </p>
        ) : null}
      </div>

      {data.ticketTypes.length === 0 ? (
        <p className="px-1 py-6 text-center text-sm text-white/55">
          Sin entradas a la venta.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
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
      className={`relative overflow-hidden rounded-2xl border transition-[border-color,box-shadow] duration-200 ${
        active
          ? "border-white/40 bg-white/[0.12] shadow-[0_0_0_1px_rgba(255,255,255,0.18)_inset]"
          : "border-white/10 bg-white/[0.05]"
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
          className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-4 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <span className="text-[15px] font-medium leading-tight text-white">
            {name}
          </span>
          <span className="text-base font-semibold tabular-nums tracking-tight text-white/85">
            {priceStr}
          </span>
          {!disabled ? (
            <span className="pt-0.5 text-[11px] font-medium text-white/50">
              {count > 0 ? "Tocá para sumar otra" : "Tocá para sumar una"}
            </span>
          ) : null}
        </motion.button>

        <AnimatePresence initial={false} mode="popLayout">
          {active ? (
            <motion.div
              key="rail"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={EASE_OUT}
              className="flex shrink-0 flex-col items-center justify-center gap-1.5 border-l border-white/10 py-2.5 pr-3 pl-2.5"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <span className="relative grid min-w-[2.5rem] place-items-center overflow-hidden">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={count}
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -10, opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    className="tabular-nums text-2xl font-bold leading-none text-white"
                    aria-live="polite"
                  >
                    {count}
                  </motion.span>
                </AnimatePresence>
              </span>
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.12 }}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onRemove()
                }}
                className="max-w-full rounded-xl border border-white/15 bg-white/[0.07] px-2.5 py-2 text-center text-[11px] font-semibold leading-tight text-white/85 outline-none transition-colors hover:border-white/25 hover:bg-white/12 focus-visible:ring-2 focus-visible:ring-white/35"
                aria-label={`Sacar una entrada ${name}`}
              >
                Sacar una
              </motion.button>
            </motion.div>
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

function ProductStep({
  data,
  consFrom,
  consWindow,
  drinks,
  setDrinkQty,
}: {
  data: PublicEventDetailResponse
  consFrom: Date | string | null
  consWindow: { open: boolean; msLeft: number }
  drinks: Record<string, number>
  setDrinkQty: (productId: string, next: number) => void
}) {
  return (
    <StepShell>
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight text-white sm:text-[22px]">
          Consumos
        </h2>
        {consFrom != null && !consWindow.open ? (
          <p className="text-sm leading-relaxed text-white/60">
            Consumos desde el {formatEventDate(consFrom)} · en{" "}
            <span className="tabular-nums text-white/90">
              {formatCountdown(consWindow.msLeft)}
            </span>
          </p>
        ) : consWindow.open && data.drinkProducts.length > 0 ? (
          <p className="text-sm leading-relaxed text-white/60">
            Tocá un producto para sumarlo al pedido. Podés combinar distintos ítems.
          </p>
        ) : null}
      </div>

      {data.drinkProducts.length === 0 ? (
        <p className="text-sm text-white/55">
          No hay consumos digitales para este evento.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.drinkProducts.map((p) => {
            const q = drinks[p.id] ?? 0
            const disabled = !consWindow.open
            const active = q > 0
            return (
              <li key={p.id}>
                <ProductPickRow
                  name={p.name}
                  unitPriceStr={`${formatMoneyArsExact(p.price)} c/u`}
                  count={q}
                  disabled={disabled}
                  active={active}
                  onAdd={() => setDrinkQty(p.id, Math.min(99, q + 1))}
                  onRemove={() => setDrinkQty(p.id, q - 1)}
                />
              </li>
            )
          })}
        </ul>
      )}
    </StepShell>
  )
}

function ProductPickRow({
  name,
  unitPriceStr,
  count,
  disabled,
  active,
  onAdd,
  onRemove,
}: {
  name: string
  unitPriceStr: string
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
      className={`relative overflow-hidden rounded-2xl border transition-[border-color,box-shadow] duration-200 ${
        active
          ? "border-white/40 bg-white/[0.12] shadow-[0_0_0_1px_rgba(255,255,255,0.18)_inset]"
          : "border-white/10 bg-white/[0.05]"
      } ${disabled ? "opacity-40" : ""}`}
    >
      <div className="flex min-h-[4.75rem]">
        <motion.button
          type="button"
          layout
          disabled={disabled}
          onClick={onAdd}
          whileTap={disabled ? undefined : { scale: 0.985 }}
          aria-label={`Sumar un consumo ${name}`}
          className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-4 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <span className="text-[15px] font-medium leading-tight text-white">
            {name}
          </span>
          <span className="text-[13px] font-medium tabular-nums text-white/65">
            {unitPriceStr}
          </span>
          {!disabled ? (
            <span className="pt-0.5 text-[11px] font-medium text-white/50">
              {count > 0 ? "Tocá para sumar otro" : "Tocá para sumar uno"}
            </span>
          ) : null}
        </motion.button>

        <AnimatePresence initial={false} mode="popLayout">
          {active ? (
            <motion.div
              key="rail"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={EASE_OUT}
              className="flex shrink-0 flex-col items-center justify-center gap-1.5 border-l border-white/10 py-2.5 pr-3 pl-2.5"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <span className="relative grid min-w-[2.5rem] place-items-center overflow-hidden">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={count}
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -10, opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    className="tabular-nums text-2xl font-bold leading-none text-white"
                    aria-live="polite"
                  >
                    {count}
                  </motion.span>
                </AnimatePresence>
              </span>
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.12 }}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onRemove()
                }}
                className="max-w-full rounded-xl border border-white/15 bg-white/[0.07] px-2.5 py-2 text-center text-[11px] font-semibold leading-tight text-white/85 outline-none transition-colors hover:border-white/25 hover:bg-white/12 focus-visible:ring-2 focus-visible:ring-white/35"
                aria-label={`Sacar un consumo ${name}`}
              >
                Sacar uno
              </motion.button>
            </motion.div>
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