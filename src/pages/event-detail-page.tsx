import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useNavigate, useParams } from "react-router"
import { ArrowUpRight, ChevronLeft, Minus, Plus } from "lucide-react"
import { AnimatePresence, motion, type Transition, type Variants } from "motion/react"
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
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import {
  computeCartTotalString,
  useCartStore,
  type CartDrinkLine,
  type CartTicketLine,
} from "@/stores/cart-store"

type PurchaseWorkflow = "tickets" | "products"

const HEIGHT_EASE: Transition = {
  duration: 0.38,
  ease: [0.22, 1, 0.36, 1] as const,
}
const EASE_OUT: Transition = { duration: 0.32, ease: [0.22, 1, 0.36, 1] }
const EASE_FAST: Transition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] }

function useMeasuredHeight<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [height, setHeight] = useState<number | "auto">("auto")
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const next = entries[0]?.borderBoxSize?.[0]?.blockSize ?? el.offsetHeight
      setHeight(next)
    })
    ro.observe(el)
    setHeight(el.offsetHeight)
    return () => ro.disconnect()
  }, [])
  return [ref, height] as const
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
  const [drawerOpen, setDrawerOpen] = useState(false)
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
  const showFooter = !!data && (showTicketStep || showProductStep)

  const ctaLabel = !data
    ? "Cargando…"
    : !hasAnyCatalog
      ? "No disponible"
      : !anythingPurchasable
        ? "Próximamente"
        : "Comprar"

  const ctaDisabled = !data || !hasAnyCatalog || !anythingPurchasable

  if (!eventId) return null

  const hero = data?.event.imageUrl ?? null

  return (
    <div className="relative min-h-dvh overflow-hidden bg-black">
      {/* Full-bleed flyer */}
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
        {/* Layered gradients for legibility */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-black/15 to-black/95"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black via-black/70 to-transparent"
        />
      </div>

      {/* Top bar */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex items-center justify-between px-6 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8"
      >
        {data ? (
          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/85 backdrop-blur-md">
            {data.productora.name}
          </span>
        ) : (
          <span />
        )}
      </motion.div>

      {/* Foreground: title + CTA */}
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-end px-6 pb-12 pt-24 sm:px-8 sm:pb-14">
        {error ? (
          <p className="text-sm text-red-300">{error}</p>
        ) : !data ? (
          <p className="text-sm text-white/60">Cargando…</p>
        ) : (
          <motion.div
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
            }}
            className="space-y-6"
          >
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 14 },
                show: { opacity: 1, y: 0, transition: EASE_OUT },
              }}
              className="space-y-2"
            >
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/55">
                {formatEventDay(data.event.date)}
              </p>
              <h1 className="text-4xl font-black leading-[1.05] tracking-tight text-white drop-shadow-[0_2px_24px_rgba(0,0,0,0.5)] sm:text-5xl">
                {data.event.name}
              </h1>
              {data.event.location ? (
                <p className="text-sm text-white/70">{data.event.location}</p>
              ) : null}
            </motion.div>

            <motion.div
              variants={{
                hidden: { opacity: 0, y: 18 },
                show: { opacity: 1, y: 0, transition: EASE_OUT },
              }}
            >
              <Drawer
                open={drawerOpen}
                onOpenChange={(open) => {
                  setDrawerOpen(open)
                  if (!open && needsWorkflowChoice) {
                    // restart chooser when fully closed so reopening feels fresh
                    window.setTimeout(() => setWorkflow(null), 250)
                  }
                }}
              >
                <DrawerTrigger asChild>
                  <button
                    type="button"
                    disabled={ctaDisabled}
                    className="group/cta relative flex h-14 w-full items-center justify-between gap-4 overflow-hidden rounded-2xl bg-white px-6 text-left text-base font-semibold text-black shadow-[0_24px_48px_-16px_rgba(255,255,255,0.35)] transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_28px_56px_-14px_rgba(255,255,255,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-white/30 disabled:text-white/60 disabled:shadow-none"
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
                </DrawerTrigger>

                <DrawerContent>
                  <DrawerTitle className="sr-only">Comprar</DrawerTitle>
                  <DrawerBody
                    data={data}
                    showChooser={showChooser}
                    showTicketStep={showTicketStep}
                    showProductStep={showProductStep}
                    needsWorkflowChoice={needsWorkflowChoice}
                    hasTicketCatalog={hasTicketCatalog}
                    hasProductCatalog={hasProductCatalog}
                    anyTicketPurchasable={anyTicketPurchasable}
                    productsPurchasable={productsPurchasable}
                    ticketsFrom={ticketsFrom}
                    ticketsWindow={ticketsWindow}
                    consFrom={consFrom}
                    consWindow={consWindow}
                    ticketTypeId={ticketTypeId}
                    setTicketTypeId={setTicketTypeId}
                    qty={qty}
                    setQty={setQty}
                    drinks={drinks}
                    setDrinkQty={setDrinkQty}
                    selectedType={selectedType}
                    showFooter={showFooter}
                    canContinue={canContinue}
                    totalStr={totalStr}
                    onChooseTickets={chooseTicketsWorkflow}
                    onChooseProducts={chooseProductsWorkflow}
                    onBack={goBackToChooser}
                    onContinue={continueClick}
                  />
                </DrawerContent>
              </Drawer>
            </motion.div>

            <motion.p
              variants={{
                hidden: { opacity: 0 },
                show: { opacity: 1, transition: { duration: 0.6, delay: 0.2 } },
              }}
              className="text-center text-[11px] text-white/40"
            >
              Pago seguro con Mercado Pago
            </motion.p>
          </motion.div>
        )}
      </div>
    </div>
  )
}

type DrawerBodyProps = {
  data: PublicEventDetailResponse
  showChooser: boolean
  showTicketStep: boolean
  showProductStep: boolean
  needsWorkflowChoice: boolean
  hasTicketCatalog: boolean
  hasProductCatalog: boolean
  anyTicketPurchasable: boolean
  productsPurchasable: boolean
  ticketsFrom: Date | string | null
  ticketsWindow: { open: boolean; msLeft: number }
  consFrom: Date | string | null
  consWindow: { open: boolean; msLeft: number }
  ticketTypeId: string
  setTicketTypeId: (id: string) => void
  qty: number
  setQty: (next: number | ((q: number) => number)) => void
  drinks: Record<string, number>
  setDrinkQty: (productId: string, next: number) => void
  selectedType: PublicEventDetailResponse["ticketTypes"][number] | undefined
  showFooter: boolean
  canContinue: boolean
  totalStr: string
  onChooseTickets: () => void
  onChooseProducts: () => void
  onBack: () => void
  onContinue: () => void
}

function DrawerBody(props: DrawerBodyProps) {
  const {
    data,
    showChooser,
    showTicketStep,
    showProductStep,
    needsWorkflowChoice,
    hasTicketCatalog,
    hasProductCatalog,
    anyTicketPurchasable,
    productsPurchasable,
    ticketsFrom,
    ticketsWindow,
    consFrom,
    consWindow,
    ticketTypeId,
    setTicketTypeId,
    qty,
    setQty,
    drinks,
    setDrinkQty,
    selectedType,
    showFooter,
    canContinue,
    totalStr,
    onChooseTickets,
    onChooseProducts,
    onBack,
    onContinue,
  } = props

  /** Footer + back row must not mount until chooser exit finishes — avoids measuring chooser height + chrome together (drawer spike). */
  const [checkoutChromeReady, setCheckoutChromeReady] = useState(
    () => !needsWorkflowChoice
  )
  const prevShowChooserRef = useRef(showChooser)

  useEffect(() => {
    const wasChooser = prevShowChooserRef.current
    prevShowChooserRef.current = showChooser

    if (showChooser) {
      setCheckoutChromeReady(false)
      return
    }
    if (wasChooser && !showChooser && needsWorkflowChoice) {
      setCheckoutChromeReady(false)
    }
  }, [showChooser, needsWorkflowChoice])

  const stepKey = showChooser
    ? "chooser"
    : showTicketStep
      ? "tickets"
      : showProductStep
        ? "products"
        : "empty"

  const [measureRef, height] = useMeasuredHeight<HTMLDivElement>()

  return (
    <motion.div
      animate={{ height }}
      initial={false}
      transition={HEIGHT_EASE}
      style={{ overflow: "hidden", willChange: "height" }}
    >
      <div ref={measureRef} className="flex flex-col">
        <div className="px-5 pt-5">
          <AnimatePresence initial={false}>
            {(showTicketStep || showProductStep) &&
            needsWorkflowChoice &&
            checkoutChromeReady ? (
              <motion.div
                key="back"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={EASE_FAST}
              >
                <Button
                  type="button"
                  variant="ghost"
                  className="-ml-2 h-auto self-start rounded-xl px-2 py-1.5 text-sm text-white/60 hover:bg-white/10 hover:text-white"
                  onClick={onBack}
                >
                  <ChevronLeft className="mr-0.5 size-4" aria-hidden />
                  Elegir otra opción
                </Button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="relative px-5">
          <AnimatePresence
            mode="wait"
            initial={false}
            onExitComplete={() => {
              if (
                needsWorkflowChoice &&
                !showChooser &&
                (showTicketStep || showProductStep)
              ) {
                setCheckoutChromeReady(true)
              }
            }}
          >
            {stepKey === "chooser" ? (
              <ChooserStep
                key="chooser"
                hasTicketCatalog={hasTicketCatalog}
                anyTicketPurchasable={anyTicketPurchasable}
                hasProductCatalog={hasProductCatalog}
                productsPurchasable={productsPurchasable}
                ticketsFrom={ticketsFrom}
                ticketsOpen={ticketsWindow.open}
                consFrom={consFrom}
                consOpen={consWindow.open}
                onChooseTickets={onChooseTickets}
                onChooseProducts={onChooseProducts}
              />
            ) : null}

            {stepKey === "tickets" ? (
              <TicketStep
                key="tickets"
                data={data}
                ticketsFrom={ticketsFrom}
                ticketsWindow={ticketsWindow}
                ticketTypeId={ticketTypeId}
                setTicketTypeId={setTicketTypeId}
                qty={qty}
                setQty={setQty}
                selectedType={selectedType}
              />
            ) : null}

            {stepKey === "products" ? (
              <ProductStep
                key="products"
                data={data}
                consFrom={consFrom}
                consWindow={consWindow}
                drinks={drinks}
                setDrinkQty={setDrinkQty}
              />
            ) : null}
          </AnimatePresence>
        </div>

        <AnimatePresence initial={false}>
          {showFooter && checkoutChromeReady ? (
            <motion.div
              key="footer"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={EASE_OUT}
              className="mt-2 flex flex-col gap-3 border-t border-white/[0.08] px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            >
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-sm text-white/65">Total</span>
                <motion.span
                  key={totalStr}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="text-2xl font-bold tabular-nums tracking-tight text-white"
                >
                  {formatMoneyArsExact(totalStr)}
                </motion.span>
              </div>
              <Button
                className="h-12 w-full rounded-2xl bg-white text-base font-semibold text-black shadow-[0_18px_44px_-18px_rgba(255,255,255,0.45)] transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_24px_56px_-16px_rgba(255,255,255,0.55)] disabled:translate-y-0 disabled:bg-white/30 disabled:text-white/60 disabled:shadow-none"
                disabled={!canContinue}
                onClick={onContinue}
              >
                Continuar al pago
              </Button>
              <p className="text-center text-[11px] leading-relaxed text-white/45">
                Pago procesado de forma segura con Mercado Pago.
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

const stepVariants: Variants = {
  initial: { opacity: 0, y: 12, filter: "blur(8px)" },
  animate: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.34, ease: [0.22, 1, 0.36, 1] as const },
  },
  exit: {
    opacity: 0,
    y: -6,
    filter: "blur(8px)",
    transition: { duration: 0.18, ease: [0.4, 0, 1, 1] as const },
  },
}

function StepShell({ children }: { children: React.ReactNode }) {
  return (
    <motion.section
      variants={stepVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="space-y-5 pb-2"
    >
      {children}
    </motion.section>
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
        <h2 className="text-[22px] font-semibold tracking-tight text-white">
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
      className={`group/choice relative flex w-full items-center justify-between gap-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-5 text-left transition-colors duration-200 ${
        disabled
          ? "cursor-not-allowed opacity-40"
          : "hover:border-white/25 hover:bg-white/[0.08]"
      }`}
    >
      <div className="min-w-0 flex flex-col">
        <span className="text-[15px] font-semibold text-white">{title}</span>
        <span className="mt-0.5 text-[13px] text-white/55">{description}</span>
      </div>
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 transition-all duration-200 group-hover/choice:translate-x-0.5 group-hover/choice:border-white/25 group-hover/choice:bg-white/10 group-hover/choice:text-white"
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
        <h2 className="text-[22px] font-semibold tracking-tight text-white">
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
                      ? "border-white/40 bg-white/[0.10] shadow-[0_0_0_1px_rgba(255,255,255,0.18)_inset]"
                      : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
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
            className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"
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
        <h2 className="text-[22px] font-semibold tracking-tight text-white">
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
                className={`flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 ${
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
    <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
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
