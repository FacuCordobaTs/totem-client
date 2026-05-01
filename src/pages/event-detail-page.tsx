import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { ArrowUpRight, ChevronLeft, Minus, Plus } from "lucide-react"
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
  const [ticketTypeId, setTicketTypeId] = useState<string>("")
  const [qty, setQty] = useState(0)
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
        const first = r.ticketTypes.find((t) => t.availableForPurchase)
        setTicketTypeId(first?.id ?? r.ticketTypes[0]?.id ?? "")
        const tOpen =
          r.event.ticketsAvailableFrom == null ||
          Date.now() >= new Date(r.event.ticketsAvailableFrom).getTime()
        setQty(tOpen && first ? 1 : 0)
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

  const selectedType = useMemo(
    () => data?.ticketTypes.find((t) => t.id === ticketTypeId),
    [data, ticketTypeId]
  )

  const ticketLines: CartTicketLine[] = useMemo(() => {
    if (!selectedType || qty <= 0) return []
    return [{ ticketTypeId: selectedType.id, quantity: qty, unitPrice: selectedType.price }]
  }, [selectedType, qty])

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
    !!selectedType?.availableForPurchase && ticketsWindow.open && qty > 0

  const hasDrinks = drinkLines.length > 0
  const drinksBuyable = hasDrinks && consWindow.open

  const canContinue =
    (qty > 0 && ticketsBuyable) || (hasDrinks && drinksBuyable)

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
    setQty(0)
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
              <div className="rounded-[28px] border border-white/[0.1] bg-black/75 px-5 py-5 shadow-[0_-28px_90px_-24px_rgba(0,0,0,0.95)] backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-black/45">
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
                              ticketTypeId={ticketTypeId}
                              setTicketTypeId={setTicketTypeId}
                              qty={qty}
                              setQty={setQty}
                              selectedType={selectedType}
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
              ? "Elegí tipo y cantidad"
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
  ticketTypeId,
  setTicketTypeId,
  qty,
  setQty,
  selectedType,
}: {
  data: PublicEventDetailResponse
  ticketsFrom: Date | string | null
  ticketsWindow: { open: boolean; msLeft: number }
  ticketTypeId: string
  setTicketTypeId: (id: string) => void
  qty: number
  setQty: (next: number | ((q: number) => number)) => void
  selectedType: PublicEventDetailResponse["ticketTypes"][number] | undefined
}) {
  return (
    <StepShell>
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight text-white sm:text-[22px]">
          Entradas
        </h2>
        {ticketsFrom != null && !ticketsWindow.open ? (
          <p className="text-sm leading-relaxed text-white/60">
            Venta desde el {formatEventDate(ticketsFrom)} · en{" "}
            <span className="tabular-nums text-white/90">
              {formatCountdown(ticketsWindow.msLeft)}
            </span>
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
            const disabled = !t.availableForPurchase || !ticketsWindow.open
            const selected = ticketTypeId === t.id
            return (
              <li key={t.id}>
                <motion.button
                  type="button"
                  disabled={disabled}
                  onClick={() => setTicketTypeId(t.id)}
                  whileTap={disabled ? undefined : { scale: 0.99 }}
                  className={`flex w-full items-center justify-between gap-4 rounded-2xl border px-4 py-4 text-left transition-all duration-200 ${
                    selected
                      ? "border-white/40 bg-white/[0.12] shadow-[0_0_0_1px_rgba(255,255,255,0.18)_inset]"
                      : "border-white/10 bg-white/[0.05] hover:border-white/22 hover:bg-white/[0.08]"
                  } ${disabled ? "opacity-40" : ""}`}
                >
                  <span className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className={`relative grid size-5 place-items-center rounded-full border transition-colors ${
                        selected
                          ? "border-white bg-white"
                          : "border-white/30 bg-transparent"
                      }`}
                    >
                      <AnimatePresence>
                        {selected ? (
                          <motion.span
                            key="dot"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                            className="size-2 rounded-full bg-black"
                          />
                        ) : null}
                      </AnimatePresence>
                    </span>
                    <span className="font-medium text-white">{t.name}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-sm text-white/70">
                    {formatMoneyArsExact(t.price)}
                  </span>
                </motion.button>
              </li>
            )
          })}
        </ul>
      )}

      <AnimatePresence initial={false}>
        {selectedType?.availableForPurchase && ticketsWindow.open ? (
          <motion.div
            key="qty"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={EASE_OUT}
            className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3"
          >
            <span className="text-sm text-white/70">Cantidad</span>
            <Stepper
              value={qty}
              onDec={() => setQty((q) => Math.max(0, q - 1))}
              onInc={() => setQty((q) => q + 1)}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </StepShell>
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
            return (
              <li
                key={p.id}
                className={`flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 ${
                  disabled ? "opacity-40" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="font-medium text-white">{p.name}</p>
                  <p className="mt-0.5 text-[13px] text-white/55">
                    {formatMoneyArsExact(p.price)} c/u
                  </p>
                </div>
                <Stepper
                  value={q}
                  disabled={disabled}
                  onDec={() => setDrinkQty(p.id, q - 1)}
                  onInc={() => setDrinkQty(p.id, q + 1)}
                />
              </li>
            )
          })}
        </ul>
      )}
    </StepShell>
  )
}

function Stepper({
  value,
  disabled = false,
  onDec,
  onInc,
}: {
  value: number
  disabled?: boolean
  onDec: () => void
  onInc: () => void
}) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] p-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={disabled || value <= 0}
        className="size-8 rounded-full text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30"
        onClick={onDec}
      >
        <Minus className="size-4" />
      </Button>
      <span className="relative grid min-w-7 place-items-center overflow-hidden text-center">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={value}
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -8, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="tabular-nums text-sm font-semibold text-white"
          >
            {value}
          </motion.span>
        </AnimatePresence>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={disabled}
        className="size-8 rounded-full text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30"
        onClick={onInc}
      >
        <Plus className="size-4" />
      </Button>
    </div>
  )
}
