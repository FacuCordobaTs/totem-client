import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Link } from "react-router"
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  animate,
  transform,
  type MotionValue,
  type Transition,
} from "motion/react"
import Decimal from "decimal.js"
import { TransportPicker } from "@/components/transport-picker"
import { getEventSite } from "@/event-sites/registry"
import { formatCountdown, formatEventDate, formatMoneyArsExact } from "@/lib/format"
import { formatAdmissionWindowShort } from "@/lib/ticket-admission"
import {
  groupProductsByCategory,
  productSaleType,
  useEventPurchase,
} from "@/lib/use-event-purchase"
import logoUrl from "./assets/logo.png"
import dogHowlUrl from "./assets/dog-howl.webp"
import type { PublicDrinkProductItem } from "@/types/api"
import "./style.css"

const EVENT_IDENTIFIER = getEventSite("perronegro3110")?.eventIdentifier

const EASE: Transition["ease"] = [0.22, 1, 0.36, 1]
const EASE_INOUT: Transition["ease"] = [0.76, 0, 0.24, 1]
const SHEET: Transition = { duration: 0.7, ease: EASE_INOUT }

const MANIFESTO = ["djs en vivo", "sectores vip", "mesas", "estacionamiento", "nuevo concepto"]

type Shelf = "glass" | "bottle" | "cart"

/**
 * Página propia de Perro Negro (perronegro3110.crow.ar). La lógica de compra es la misma que la
 * tienda de Crow (`useEventPurchase`): ventanas de venta, entradas, colectivos, consumos,
 * progreso guardado y checkout. Esta página sólo cambia cómo se ve y en qué orden aparece.
 */
export default function PerroNegroPage() {
  const purchase = useEventPurchase(EVENT_IDENTIFIER)
  const {
    data,
    error,
    restoreSession,
    ticketQtys,
    drinks,
    minimalStep,
    setMinimalStep,
    ticketsFrom,
    consFrom,
    ticketsWindow,
    consWindow,
    hasTicketCatalog,
    hasAnyCatalog,
    ticketLines,
    drinkLines,
    transportLines,
    selectedTransportQtys,
    transportCount,
    setTransportQty,
    bumpTicket,
    trimTicket,
    setDrinkQty,
    totalStr,
    ticketCount,
    canContinue,
    continueClick,
    anyTicketPurchasable,
    productsPurchasable,
    anythingPurchasable,
  } = purchase
  const reduceMotion = useReducedMotion()
  const [introDone, setIntroDone] = useState(() => restoreSession || !!reduceMotion)
  const [choosingTransport, setChoosingTransport] = useState(false)
  const ticketsRef = useRef<HTMLElement | null>(null)
  const heroRef = useRef<HTMLElement | null>(null)
  const [heroGone, setHeroGone] = useState(false)
  const [ticketsInView, setTicketsInView] = useState(false)

  const hasTransports = (data?.transports?.length ?? 0) > 0
  const drinkCount = drinkLines.reduce((a, l) => a + l.quantity, 0)
  // La tienda de consumos sólo existe si su venta ya abrió (igual que en la tienda de Crow): sin eso,
  // de las entradas se pasa directo al checkout y un progreso guardado en "store" no se restaura.
  const storeOpen = minimalStep === "store" && productsPurchasable
  const sheetOpen = choosingTransport || storeOpen

  const ticketsBuyable =
    ticketsWindow.open &&
    ticketCount > 0 &&
    ticketLines.every((l) => data?.ticketTypes.find((x) => x.id === l.ticketTypeId)?.availableForPurchase === true)
  const canGoStoreFromTickets = productsPurchasable && ticketCount > 0 && ticketsBuyable
  const ticketsPrimaryEnabled = productsPurchasable ? canGoStoreFromTickets : canContinue
  const ticketsPrimaryLabel = productsPurchasable ? "Continuar" : "Continuar al pago"

  const coverCtaDisabled = !data || !hasAnyCatalog || !anythingPurchasable
  const coverCtaLabel = !data
    ? "Cargando…"
    : !hasAnyCatalog
      ? "No disponible"
      : !anythingPurchasable
        ? "Próximamente"
        : anyTicketPurchasable
          ? "Comprar entradas"
          : "Comprar consumos"

  // La página es larga: el checkout tiene que abrir arriba, no en el scroll de la sección de entradas.
  const goToCheckout = () => {
    if (!canContinue) return
    window.scrollTo(0, 0)
    continueClick()
  }

  const openStore = () => setMinimalStep("store")
  const closeStore = () => setMinimalStep("cover")

  const ticketsNext = () => {
    setChoosingTransport(false)
    if (productsPurchasable) openStore()
    else goToCheckout()
  }

  const ticketsPrimary = () => {
    if (!ticketsPrimaryEnabled) return
    if (hasTransports) setChoosingTransport(true)
    else ticketsNext()
  }

  const scrollToTickets = () => {
    const el = ticketsRef.current
    if (el) slowScrollTo(el.getBoundingClientRect().top + window.scrollY, !!reduceMotion)
  }

  const startBuy = () => {
    if (coverCtaDisabled) return
    if (anyTicketPurchasable) scrollToTickets()
    else openStore()
  }

  // Fondo de papel también en el canvas: el rebote de scroll (Instagram, Safari) no destapa blanco.
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const previous = [html.style.backgroundColor, body.style.backgroundColor, html.style.overscrollBehaviorY, body.style.overscrollBehaviorY]
    html.style.backgroundColor = "#dcdad5"
    body.style.backgroundColor = "#dcdad5"
    html.style.overscrollBehaviorY = "none"
    body.style.overscrollBehaviorY = "none"
    return () => {
      ;[html.style.backgroundColor, body.style.backgroundColor, html.style.overscrollBehaviorY, body.style.overscrollBehaviorY] = previous
    }
  }, [])

  useEffect(() => {
    const locked = !introDone || sheetOpen
    document.body.style.overflow = locked ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [introDone, sheetOpen])

  useEffect(() => {
    const hero = heroRef.current
    const tickets = ticketsRef.current
    if (!hero || !tickets) return
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === hero) setHeroGone(!e.isIntersecting)
        if (e.target === tickets) setTicketsInView(e.isIntersecting)
      }
    }, { threshold: 0.05 })
    io.observe(hero)
    io.observe(tickets)
    return () => io.disconnect()
  }, [])

  // Al volver del checkout con entradas elegidas, la página arranca en la selección.
  const restoredScroll = useRef(false)
  useEffect(() => {
    if (!restoreSession || restoredScroll.current || !data || ticketCount === 0 || storeOpen) return
    restoredScroll.current = true
    window.requestAnimationFrame(() => ticketsRef.current?.scrollIntoView({ block: "start" }))
  }, [restoreSession, data, ticketCount, storeOpen])

  const showCheckoutBar = !!data && ticketCount > 0 && !sheetOpen
  const showFloatingCta = introDone && heroGone && !ticketsInView && !showCheckoutBar && !sheetOpen

  return (
    <div className="pn-site">
      <InkFilters />
      <div className="pn-grain" aria-hidden />

      <AnimatePresence>{!introDone ? <Intro onDone={() => setIntroDone(true)} /> : null}</AnimatePresence>

      <header className="pn-topbar">
        <a href="/" className="pn-topbar__mark" aria-label="Perro Negro — inicio">2026©</a>
        <Link to="/acceso" className="pn-topbar__link">mis entradas <span aria-hidden>↗</span></Link>
      </header>

      <main>
        <Hero heroRef={heroRef} ready={introDone} ctaLabel={coverCtaLabel} ctaDisabled={coverCtaDisabled} onCta={startBuy} />
        <section ref={ticketsRef} id="entradas" className="pn-tickets" aria-labelledby="pn-tickets-title">
          <div className="pn-wrap">
            <SectionKicker index="01">acceso</SectionKicker>
            <h2 id="pn-tickets-title" className="pn-display pn-display--xl">
              <BrushWord>entradas</BrushWord>
            </h2>

            {error ? (
              <p className="pn-note pn-note--error">{error}</p>
            ) : !data ? (
              <p className="pn-note">cargando entradas…</p>
            ) : (
              <>
                {ticketsWindow.closed ? (
                  <p className="pn-note">la venta de entradas ya cerró.</p>
                ) : ticketsFrom != null && !ticketsWindow.open ? (
                  <p className="pn-note">
                    venta desde el {formatEventDate(ticketsFrom)} · en{" "}
                    <strong className="pn-tabular">{formatCountdown(ticketsWindow.msLeft)}</strong>
                  </p>
                ) : ticketsWindow.open && hasTicketCatalog && !anyTicketPurchasable ? (
                  <p className="pn-note">por ahora no hay entradas disponibles para este evento.</p>
                ) : null}

                {!hasTicketCatalog ? (
                  <p className="pn-note">sin entradas a la venta.</p>
                ) : (
                  <ul className="pn-ticket-list">
                    {data.ticketTypes.map((t, i) => (
                      <li key={t.id}>
                        <TicketRow
                          index={i + 1}
                          name={t.name}
                          admissionWindow={formatAdmissionWindowShort(t)}
                          priceStr={formatMoneyArsExact(t.price)}
                          count={ticketQtys[t.id] ?? 0}
                          disabled={!t.availableForPurchase || !ticketsWindow.open}
                          onAdd={() => bumpTicket(t.id)}
                          onRemove={() => trimTicket(t.id)}
                        />
                      </li>
                    ))}
                  </ul>
                )}

                {!anyTicketPurchasable && productsPurchasable ? (
                  <button type="button" className="pn-btn pn-btn--ink pn-btn--block" onClick={openStore}>
                    Comprar consumos <span aria-hidden>→</span>
                  </button>
                ) : null}

                {!hasAnyCatalog ? (
                  <p className="pn-note">este evento no tiene venta online por el momento.</p>
                ) : null}

                {hasTransports ? (
                  <p className="pn-fineprint">¿venís en colectivo? lo sumás en el próximo paso.</p>
                ) : null}
              </>
            )}
          </div>
          <ScrollHint />
        </section>

        <Manifesto />
        <LogoReveal />
        <RedRoom eventDate={data?.event.date ?? null} />
        <Venue
          venue={data?.event.venue ?? null}
          location={data?.event.location ?? null}
          transports={data?.transports ?? []}
        />

        <Footer productora={data?.productora.name ?? null} />
      </main>

      <AnimatePresence>
        {showFloatingCta ? (
          <motion.div
            key="float"
            className="pn-float"
            initial={{ y: 120 }}
            animate={{ y: 0 }}
            exit={{ y: 120 }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <button type="button" className="pn-btn pn-btn--ink" disabled={coverCtaDisabled} onClick={startBuy}>
              {coverCtaLabel} <span aria-hidden>↓</span>
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showCheckoutBar ? (
          <motion.div
            key="bar"
            className="pn-bar"
            initial={{ y: "110%" }}
            animate={{ y: 0 }}
            exit={{ y: "110%" }}
            transition={{ duration: 0.55, ease: EASE }}
          >
            <CheckoutRow
              count={ticketCount + transportCount}
              totalStr={totalStr}
              label={hasTransports ? "Continuar" : ticketsPrimaryLabel}
              enabled={ticketsPrimaryEnabled}
              onClick={ticketsPrimary}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {choosingTransport && data ? (
          <Sheet key="transport" title="¿sumás colectivo?" backLabel="volver a entradas" onBack={() => setChoosingTransport(false)}
            footer={
              <CheckoutRow
                count={ticketCount + transportCount}
                totalStr={totalStr}
                label={transportCount === 0 ? "Seguir sin transporte" : ticketsPrimaryLabel}
                enabled={ticketsPrimaryEnabled}
                onClick={ticketsNext}
              />
            }
          >
            <p className="pn-sheet__lead">
              hasta un lugar por entrada ({ticketCount}).
            </p>
            <div className="pn-transport">
              <TransportPicker
                transports={data.transports ?? []}
                quantities={selectedTransportQtys}
                maxSeats={ticketCount}
                onQuantity={setTransportQty}
              />
            </div>
          </Sheet>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {storeOpen && data ? (
          <Sheet key="store" title="la barra" backLabel="volver" onBack={closeStore}
            footer={
              <CheckoutRow
                count={ticketCount + drinkCount + transportCount}
                totalStr={totalStr}
                label="Continuar al pago"
                enabled={canContinue}
                onClick={goToCheckout}
              />
            }
          >
            <Store
              purchase={purchase}
              consFrom={consFrom}
              consOpen={consWindow.open}
              consMsLeft={consWindow.msLeft}
              drinks={drinks}
              setDrinkQty={setDrinkQty}
              transportLines={transportLines}
              cartCount={ticketCount + drinkCount + transportCount}
            />
          </Sheet>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

/**
 * Scroll lento hasta `targetY`: recorre la página para que las animaciones atadas al scroll se vean.
 * Cualquier gesto del usuario (rueda, toque, tecla) lo corta y le devuelve el control.
 */
function slowScrollTo(targetY: number, instant: boolean) {
  const from = window.scrollY
  const distance = Math.abs(targetY - from)
  if (instant || distance < 4) {
    window.scrollTo(0, targetY)
    return
  }
  const html = document.documentElement
  const previousBehavior = html.style.scrollBehavior
  html.style.scrollBehavior = "auto"
  const controls = animate(from, targetY, {
    duration: Math.min(6.5, Math.max(1.1, distance / 1300)),
    ease: [0.65, 0, 0.35, 1],
    onUpdate: (y) => window.scrollTo(0, y),
  })
  const stop = () => controls.stop()
  const events = ["wheel", "touchstart", "keydown", "mousedown"] as const
  for (const e of events) window.addEventListener(e, stop, { passive: true, once: true })
  controls.finished.finally(() => {
    html.style.scrollBehavior = previousBehavior
    for (const e of events) window.removeEventListener(e, stop)
  })
}

/**
 * Mapeo de progreso de scroll a un valor. Pasa por una función para que motion no lo delegue a un
 * ScrollTimeline nativo, que con `offset` de un target calcula mal el rango en Chrome.
 */
function useRange<T extends number | string>(value: MotionValue<number>, input: number[], output: T[]) {
  return useTransform(value, (v) => transform(v, input, output))
}

/* ───────────────────────────── intro ───────────────────────────── */

function Intro({ onDone }: { onDone: () => void }) {
  // La página se vuelve a renderizar cada segundo (ventanas de venta): el temporizador no depende de onDone.
  const onDoneRef = useRef(onDone)
  useEffect(() => { onDoneRef.current = onDone })
  useEffect(() => {
    const t = window.setTimeout(() => onDoneRef.current(), 2300)
    return () => window.clearTimeout(t)
  }, [])
  return (
    <motion.div
      className="pn-intro"
      onClick={onDone}
      initial={{ clipPath: "inset(0% 0% 0% 0%)" }}
      exit={{ clipPath: "inset(0% 0% 100% 0%)" }}
      transition={{ duration: 0.9, ease: EASE_INOUT }}
      role="presentation"
    >
      <motion.span
        className="pn-intro__meta pn-intro__meta--tl"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6, ease: EASE }}
      >
        2026©
      </motion.span>
      <motion.div
        className="pn-intro__logo"
        initial={{ clipPath: "inset(0% 100% 0% 0%)", scale: 1.08, rotate: -2 }}
        animate={{ clipPath: "inset(0% 0% 0% 0%)", scale: 1, rotate: 0 }}
        exit={{ scale: 0.9, y: -60 }}
        transition={{ duration: 1.1, ease: EASE_INOUT }}
      >
        <img src={logoUrl} alt="perro negro" />
      </motion.div>
      <motion.span
        className="pn-intro__meta pn-intro__meta--br"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.6, ease: EASE }}
      >
        night club · 31/10/26
      </motion.span>
    </motion.div>
  )
}

/* ───────────────────────────── hero ───────────────────────────── */

function Hero({
  heroRef,
  ready,
  ctaLabel,
  ctaDisabled,
  onCta,
}: {
  heroRef: React.RefObject<HTMLElement | null>
  ready: boolean
  ctaLabel: string
  ctaDisabled: boolean
  onCta: () => void
}) {
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] })
  const titleY = useRange(scrollYProgress, [0, 1], ["0%", "-35%"])
  const logoRotate = useRange(scrollYProgress, [0, 1], [-8, 14])
  const logoY = useRange(scrollYProgress, [0, 1], ["0%", "40%"])

  const show = (delay: number) => ({
    initial: { opacity: 0, y: 28, filter: "blur(10px)" },
    animate: ready ? { opacity: 1, y: 0, filter: "blur(0px)" } : undefined,
    transition: { delay, duration: 0.9, ease: EASE },
  })

  return (
    <section ref={heroRef} className="pn-hero" aria-labelledby="pn-hero-title">
      <motion.div className="pn-hero__ghost" style={{ rotate: logoRotate, y: logoY }} aria-hidden>
        <img src={logoUrl} alt="" />
      </motion.div>

      <motion.div className="pn-hero__title" style={{ y: titleY }}>
        <motion.p className="pn-display pn-display--md pn-ink" {...show(0.05)}>2026©</motion.p>
        <h1 id="pn-hero-title" className="pn-display pn-display--hero">
          <BrushWord play={ready} delay={0.35}>perro negro</BrushWord>
        </h1>
        <motion.p className="pn-script-sub" {...show(0.6)}>night club</motion.p>
      </motion.div>

      <div className="pn-hero__foot">
        <motion.div {...show(0.85)}>
          <p className="pn-italic">31/10/26</p>
          <p className="pn-display pn-display--sm">qualy multiespacio</p>
        </motion.div>
        <motion.div className="pn-hero__actions" {...show(1)}>
          <button type="button" className="pn-btn pn-btn--ink" disabled={ctaDisabled} onClick={onCta}>
            {ctaLabel} <span aria-hidden>↓</span>
          </button>
        </motion.div>
      </div>
    </section>
  )
}

/** Aviso discreto de que la página sigue debajo de las entradas. */
function ScrollHint() {
  return (
    <motion.div
      className="pn-hint"
      aria-hidden
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ delay: 0.4, duration: 1 }}
    >
      <span>deslizá</span>
      <span className="pn-hint__line" />
    </motion.div>
  )
}

/* ───────────────────────────── manifesto ───────────────────────────── */

function Dots({ count = 22 }: { count?: number }) {
  return (
    <div className="pn-dots" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <motion.span
          key={i}
          initial={{ scale: 0, opacity: 0 }}
          whileInView={{ scale: i % 5 === 0 ? 1.6 : 1, opacity: 1 }}
          viewport={{ once: true, margin: "-10% 0px" }}
          transition={{ delay: i * 0.03, duration: 0.3, ease: EASE }}
        />
      ))}
    </div>
  )
}

function Manifesto() {
  return (
    <section className="pn-manifesto" aria-label="La noche">
      <div className="pn-wrap">
        <SectionKicker index="02">la noche</SectionKicker>
        <Dots />
        <ul className="pn-manifesto__list">
          {MANIFESTO.map((line, i) => (
            <motion.li
              key={line}
              initial={{ opacity: 0, x: -40, filter: "blur(14px)" }}
              whileInView={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              viewport={{ once: true, margin: "-15% 0px" }}
              transition={{ delay: i * 0.08, duration: 0.9, ease: EASE }}
            >
              <span className="pn-manifesto__idx">{String(i + 1).padStart(2, "0")}</span>
              <span className="pn-manifesto__line">{line}</span>
            </motion.li>
          ))}
        </ul>
        <Dots />
      </div>
    </section>
  )
}

/* ───────────────────────────── logo → foto ───────────────────────────── */

function LogoReveal() {
  const ref = useRef<HTMLElement | null>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] })
  const maskScale = useRange(scrollYProgress, [0, 0.55], [0.85, 1.25])
  const maskRotate = useRange(scrollYProgress, [0, 0.55], [-6, 0])
  const maskOpacity = useRange(scrollYProgress, [0.45, 0.62], [1, 0])
  const photoInset = useRange(scrollYProgress, [0.35, 0.75], [1, 0])
  const photoClip = useTransform(photoInset, (k) => `inset(${42 * k}% ${38 * k}% ${42 * k}% ${38 * k}%)`)
  const photoScale = useRange(scrollYProgress, [0.35, 1], [1.35, 1])
  const captionOpacity = useRange(scrollYProgress, [0.75, 0.9], [0, 1])
  const captionY = useRange(scrollYProgress, [0.75, 0.9], [40, 0])

  return (
    <section ref={ref} className="pn-reveal" aria-label="Perro Negro">
      <div className="pn-reveal__sticky">
        <motion.div
          className="pn-reveal__mask"
          style={{ scale: maskScale, rotate: maskRotate, opacity: maskOpacity, WebkitMaskImage: `url(${logoUrl})`, maskImage: `url(${logoUrl})`, backgroundImage: `url(${dogHowlUrl})` }}
          role="img"
          aria-label="Logo de Perro Negro con la foto de un dóberman"
        />
        <motion.div className="pn-reveal__photo" style={{ clipPath: photoClip }}>
          <motion.img src={dogHowlUrl} alt="Dóberman aullando. 31 de octubre de 2026." style={{ scale: photoScale }} loading="lazy" decoding="async" />
        </motion.div>
        <motion.p className="pn-reveal__caption" style={{ opacity: captionOpacity, y: captionY }}>
          que se escuche hasta afuera.
        </motion.p>
      </div>
    </section>
  )
}

/* ───────────────────────────── rojo + countdown ───────────────────────────── */

function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  return now
}

function Marquee({ children, reverse = false }: { children: ReactNode; reverse?: boolean }) {
  return (
    <div className={`pn-marquee ${reverse ? "pn-marquee--rev" : ""}`} aria-hidden>
      <div className="pn-marquee__track">
        <span>{children}</span>
        <span>{children}</span>
      </div>
    </div>
  )
}

function RedRoom({ eventDate }: { eventDate: string | Date | null }) {
  const now = useNow()
  const target = eventDate ? new Date(eventDate).getTime() : null
  const left = target == null ? null : Math.max(0, target - now)
  const parts = left == null ? null : {
    d: Math.floor(left / 86_400_000),
    h: Math.floor((left % 86_400_000) / 3_600_000),
    m: Math.floor((left % 3_600_000) / 60_000),
    s: Math.floor((left % 60_000) / 1000),
  }
  return (
    <section className="pn-red" aria-label="Cuenta regresiva">
      <div className="pn-red__marquees">
        <Marquee>perro negro ✦ night club ✦ 31.10.26 ✦ qualy multiespacio ✦&nbsp;</Marquee>
        <Marquee reverse>djs en vivo ✦ sectores vip ✦ mesas ✦ nuevo concepto ✦&nbsp;</Marquee>
      </div>

      <div className="pn-wrap pn-red__count">
        <SectionKicker index="03" tone="ink">faltan</SectionKicker>
        {parts == null ? (
          <p className="pn-count pn-count--loading">··:··:··</p>
        ) : left === 0 ? (
          <p className="pn-display pn-display--xl">es hoy.</p>
        ) : (
          <div className="pn-count" role="timer" aria-live="off">
            {([["d", "días"], ["h", "hs"], ["m", "min"], ["s", "seg"]] as const).map(([k, label]) => (
              <div key={k} className="pn-count__cell">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={parts[k]}
                    className="pn-count__num"
                    initial={{ y: "60%", opacity: 0, filter: "blur(6px)" }}
                    animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                    exit={{ y: "-60%", opacity: 0, filter: "blur(6px)" }}
                    transition={{ duration: 0.45, ease: EASE }}
                  >
                    {String(parts[k]).padStart(2, "0")}
                  </motion.span>
                </AnimatePresence>
                <span className="pn-count__label">{label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <motion.img
        src={logoUrl}
        alt=""
        aria-hidden
        className="pn-red__logo"
        initial={{ y: "30%", rotate: -10, opacity: 0 }}
        whileInView={{ y: "0%", rotate: -4, opacity: 1 }}
        viewport={{ once: true, margin: "-20% 0px" }}
        transition={{ duration: 1.1, ease: EASE }}
      />
    </section>
  )
}

/* ───────────────────────────── dónde ───────────────────────────── */

function Venue({
  venue,
  location,
  transports,
}: {
  venue: string | null
  location: string | null
  transports: { id: string; name: string; address: string; price: string }[]
}) {
  const embed = location ? `https://maps.google.com/maps?q=${encodeURIComponent(location)}&z=15&output=embed` : null
  const directions = location ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(location)}` : null
  return (
    <section className="pn-venue" aria-labelledby="pn-venue-title">
      <div className="pn-wrap">
        <SectionKicker index="04">dónde</SectionKicker>
        <Reveal>
          <h2 id="pn-venue-title" className="pn-display pn-display--xl pn-ink">{venue?.trim() || "qualy multiespacio"}</h2>
        </Reveal>
        {location ? (
          <Reveal delay={0.1}>
            <p className="pn-italic pn-venue__addr">{location}</p>
          </Reveal>
        ) : null}

        {embed ? (
          <motion.div
            className="pn-map"
            initial={{ clipPath: "inset(0% 0% 100% 0%)" }}
            whileInView={{ clipPath: "inset(0% 0% 0% 0%)" }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: 1, ease: EASE_INOUT }}
          >
            <iframe src={embed} title={`Mapa de ${location}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
          </motion.div>
        ) : null}
        {directions ? (
          <a className="pn-link" href={directions} target="_blank" rel="noopener noreferrer">
            cómo llegar <span aria-hidden>↗</span>
          </a>
        ) : null}

        {transports.length > 0 ? (
          <div className="pn-buses">
            <SectionKicker index="05">colectivos</SectionKicker>
            <ul>
              {transports.map((t, i) => (
                <motion.li
                  key={t.id}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-10% 0px" }}
                  transition={{ delay: i * 0.08, duration: 0.7, ease: EASE }}
                >
                  <span className="pn-buses__from">desde</span>
                  <span className="pn-display pn-display--md">{t.name}</span>
                  <span className="pn-buses__price pn-tabular">{formatMoneyArsExact(t.price)}</span>
                  <span className="pn-buses__addr">{t.address}</span>
                </motion.li>
              ))}
            </ul>
            <p className="pn-fineprint">lo sumás al comprar tu entrada.</p>
          </div>
        ) : null}
      </div>
    </section>
  )
}

/* ───────────────────────────── entradas ───────────────────────────── */

function TicketRow({
  index,
  name,
  admissionWindow,
  priceStr,
  count,
  disabled,
  onAdd,
  onRemove,
}: {
  index: number
  name: string
  admissionWindow: string | null
  priceStr: string
  count: number
  disabled: boolean
  onAdd: () => void
  onRemove: () => void
}) {
  const active = count > 0
  return (
    <motion.div
      className={`pn-ticket ${active ? "is-active" : ""} ${disabled ? "is-disabled" : ""}`}
      initial={{ opacity: 0, y: 40, rotate: -1.5 }}
      whileInView={{ opacity: 1, y: 0, rotate: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.8, ease: EASE }}
    >
      <div className="pn-ticket__stub" aria-hidden>
        <span>N°</span>
        <span>{String(index).padStart(2, "0")}</span>
      </div>
      <button type="button" className="pn-ticket__main" disabled={disabled} onClick={onAdd} aria-label={`Sumar una entrada ${name}`}>
        <span className="pn-ticket__name">{name}</span>
        {admissionWindow ? <span className="pn-ticket__window">{admissionWindow}</span> : null}
        <span className="pn-ticket__price pn-tabular">{priceStr}</span>
      </button>
      <div className="pn-ticket__qty">
        <AnimatePresence initial={false}>
          {active ? (
            <motion.button
              key="minus"
              type="button"
              className="pn-qty-btn"
              onClick={onRemove}
              aria-label={`Sacar una entrada ${name}`}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ duration: 0.2 }}
            >
              −
            </motion.button>
          ) : null}
        </AnimatePresence>
        <span className="pn-qty-num pn-tabular" aria-live="polite">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={count}
              initial={{ y: 14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -14, opacity: 0 }}
              transition={{ duration: 0.22, ease: EASE }}
            >
              {count}
            </motion.span>
          </AnimatePresence>
        </span>
        <motion.button
          type="button"
          className="pn-qty-btn"
          disabled={disabled}
          onClick={onAdd}
          whileTap={disabled ? undefined : { scale: 0.88 }}
          aria-label={`Sumar una entrada ${name}`}
        >
          +
        </motion.button>
      </div>
    </motion.div>
  )
}

function CheckoutRow({
  count,
  totalStr,
  label,
  enabled,
  onClick,
}: {
  count: number
  totalStr: string
  label: string
  enabled: boolean
  onClick: () => void
}) {
  return (
    <div className="pn-checkout">
      <div className="pn-checkout__total">
        <span>{count} {count === 1 ? "ítem" : "ítems"}</span>
        <motion.strong
          key={totalStr}
          className="pn-tabular"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: EASE }}
        >
          {formatMoneyArsExact(totalStr)}
        </motion.strong>
      </div>
      <button type="button" className="pn-btn pn-btn--red" disabled={!enabled} onClick={onClick}>
        {label} <span aria-hidden>→</span>
      </button>
    </div>
  )
}

/* ───────────────────────────── sheet + barra ───────────────────────────── */

function Sheet({
  title,
  backLabel,
  onBack,
  footer,
  children,
}: {
  title: string
  backLabel: string
  onBack: () => void
  footer: ReactNode
  children: ReactNode
}) {
  return (
    <motion.div
      className="pn-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      initial={{ clipPath: "inset(100% 0% 0% 0%)" }}
      animate={{ clipPath: "inset(0% 0% 0% 0%)" }}
      exit={{ clipPath: "inset(100% 0% 0% 0%)" }}
      transition={SHEET}
    >
      <header className="pn-sheet__head">
        <button type="button" className="pn-sheet__back" onClick={onBack}>
          <span aria-hidden>←</span> {backLabel}
        </button>
        <motion.h2
          className="pn-display pn-display--lg"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.7, ease: EASE }}
        >
          {title}
        </motion.h2>
      </header>
      <motion.div
        className="pn-sheet__body"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45, duration: 0.6, ease: EASE }}
      >
        {children}
      </motion.div>
      <div className="pn-sheet__foot">{footer}</div>
    </motion.div>
  )
}

function Store({
  purchase,
  consFrom,
  consOpen,
  consMsLeft,
  drinks,
  setDrinkQty,
  transportLines,
  cartCount,
}: {
  purchase: ReturnType<typeof useEventPurchase>
  consFrom: Date | string | null
  consOpen: boolean
  consMsLeft: number
  drinks: Record<string, number>
  setDrinkQty: (productId: string, next: number) => void
  transportLines: { transportId: string; quantity: number; unitPrice: string; name: string; address: string }[]
  cartCount: number
}) {
  const data = purchase.data!
  const products = data.drinkProducts
  const glass = useMemo(() => products.filter((p) => productSaleType(p) === "GLASS"), [products])
  const bottle = useMemo(() => products.filter((p) => productSaleType(p) === "BOTTLE"), [products])
  const [shelf, setShelf] = useState<Shelf>(() => (glass.length > 0 ? "glass" : "bottle"))
  const saleOpen = consOpen && purchase.productsPurchasable

  const tabs: { id: Shelf; label: string }[] = [
    { id: "glass", label: "tragos" },
    { id: "bottle", label: "botellas" },
    { id: "cart", label: `tu bolsa${cartCount > 0 ? ` (${cartCount})` : ""}` },
  ]

  return (
    <div className="pn-store">
      {consFrom != null && !consOpen ? (
        <p className="pn-note pn-note--dark">
          disponible desde el {formatEventDate(consFrom)} · en{" "}
          <strong className="pn-tabular">{formatCountdown(consMsLeft)}</strong>
        </p>
      ) : null}

      <div className="pn-tabs" role="tablist" aria-label="Secciones">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={shelf === t.id}
            className={`pn-tab ${shelf === t.id ? "is-active" : ""}`}
            onClick={() => setShelf(t.id)}
          >
            {shelf === t.id ? <motion.span layoutId="pn-tab-ink" className="pn-tab__ink" transition={{ duration: 0.4, ease: EASE }} /> : null}
            <span className="pn-tab__label">{t.label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={shelf}
          role="tabpanel"
          initial={{ opacity: 0, x: 30, filter: "blur(8px)" }}
          animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, x: -24, filter: "blur(6px)" }}
          transition={{ duration: 0.4, ease: EASE }}
        >
          {shelf === "cart" ? (
            <CartPanel purchase={purchase} drinks={drinks} setDrinkQty={setDrinkQty} transportLines={transportLines} />
          ) : (
            <ProductShelf
              products={shelf === "glass" ? glass : bottle}
              emptyLabel={shelf === "glass" ? "no hay productos tipo copa en este evento." : "no hay productos tipo botella en este evento."}
              purchase={purchase}
              drinks={drinks}
              setDrinkQty={setDrinkQty}
              saleOpen={saleOpen}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function ProductShelf({
  products,
  emptyLabel,
  purchase,
  drinks,
  setDrinkQty,
  saleOpen,
}: {
  products: PublicDrinkProductItem[]
  emptyLabel: string
  purchase: ReturnType<typeof useEventPurchase>
  drinks: Record<string, number>
  setDrinkQty: (productId: string, next: number) => void
  saleOpen: boolean
}) {
  const groups = groupProductsByCategory(products, purchase.data?.productCategories)
  if (groups.length === 0) return <p className="pn-note pn-note--dark">{emptyLabel}</p>
  return (
    <div className="pn-shelf">
      {groups.map((group) => (
        <div key={group.id}>
          {group.name ? <p className="pn-shelf__cat">{group.name}</p> : null}
          <ul className="pn-products">
            {group.products.map((p, i) => {
              const count = drinks[p.id] ?? 0
              const image = p.imageUrl?.trim() || null
              return (
                <motion.li
                  key={p.id}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 8) * 0.04, duration: 0.45, ease: EASE }}
                  className={`pn-product ${count > 0 ? "is-active" : ""} ${!saleOpen ? "is-disabled" : ""}`}
                >
                  {image ? <img src={image} alt="" loading="lazy" decoding="async" className="pn-product__img" /> : null}
                  <button
                    type="button"
                    className="pn-product__hit"
                    disabled={!saleOpen}
                    onClick={() => setDrinkQty(p.id, Math.min(99, count + 1))}
                    aria-label={`Agregar ${p.name}`}
                  />
                  <span className="pn-product__name">{p.name}</span>
                  <span className="pn-product__price pn-tabular">{formatMoneyArsExact(p.price)}</span>
                  <div className="pn-product__qty">
                    {count > 0 ? (
                      <>
                        <button type="button" className="pn-qty-btn pn-qty-btn--sm" disabled={!saleOpen} onClick={() => setDrinkQty(p.id, count - 1)} aria-label={`Quitar ${p.name}`}>−</button>
                        <span className="pn-tabular">{count}</span>
                      </>
                    ) : null}
                    <span className="pn-qty-btn pn-qty-btn--sm pn-qty-btn--ghost" aria-hidden>+</span>
                  </div>
                </motion.li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

function CartPanel({
  purchase,
  drinks,
  setDrinkQty,
  transportLines,
}: {
  purchase: ReturnType<typeof useEventPurchase>
  drinks: Record<string, number>
  setDrinkQty: (productId: string, next: number) => void
  transportLines: { transportId: string; quantity: number; unitPrice: string; name: string; address: string }[]
}) {
  const { data, ticketLines, drinkLines, trimTicket } = purchase
  if (!data || (ticketLines.length === 0 && drinkLines.length === 0)) {
    return <p className="pn-note pn-note--dark">tu bolsa está vacía.</p>
  }
  const sub = (unit: string, q: number) => formatMoneyArsExact(new Decimal(unit).mul(q).toFixed(2))
  return (
    <div className="pn-cart">
      {ticketLines.length > 0 ? (
        <section>
          <p className="pn-shelf__cat">entradas</p>
          <ul>
            {ticketLines.map((line) => {
              const name = data.ticketTypes.find((x) => x.id === line.ticketTypeId)?.name ?? "Entrada"
              return (
                <li key={line.ticketTypeId} className="pn-cart__row">
                  <span>{line.quantity} × {name}</span>
                  <span className="pn-tabular">{sub(line.unitPrice, line.quantity)}</span>
                  <button type="button" className="pn-qty-btn pn-qty-btn--sm" onClick={() => trimTicket(line.ticketTypeId)} aria-label={`Quitar una entrada ${name}`}>−</button>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
      {drinkLines.length > 0 ? (
        <section>
          <p className="pn-shelf__cat">consumos</p>
          <ul>
            {drinkLines.map((line) => {
              const name = data.drinkProducts.find((x) => x.id === line.productId)?.name ?? "Producto"
              const q = drinks[line.productId] ?? 0
              return (
                <li key={line.productId} className="pn-cart__row">
                  <span>{line.quantity} × {name}</span>
                  <span className="pn-tabular">{sub(line.unitPrice, line.quantity)}</span>
                  <button type="button" className="pn-qty-btn pn-qty-btn--sm" onClick={() => setDrinkQty(line.productId, q - 1)} aria-label={`Sacar un consumo ${name}`}>−</button>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
      {transportLines.length > 0 ? (
        <section>
          <p className="pn-shelf__cat">colectivo</p>
          <ul>
            {transportLines.map((line) => (
              <li key={line.transportId} className="pn-cart__row pn-cart__row--stack">
                <span>{line.quantity} × {line.name}</span>
                <span className="pn-tabular">{sub(line.unitPrice, line.quantity)}</span>
                <small>{line.address}</small>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

/* ───────────────────────────── footer + utilidades ───────────────────────────── */

function Footer({ productora }: { productora: string | null }) {
  return (
    <footer className="pn-footer">
      <div className="pn-wrap pn-footer__row">
        <Link to="/acceso" className="pn-link pn-link--paper">mis entradas <span aria-hidden>↗</span></Link>
        <span>{productora ? `${productora.toLowerCase()} · ` : ""}tickets por crow</span>
      </div>
      <motion.img
        src={logoUrl}
        alt=""
        aria-hidden
        className="pn-footer__logo"
        initial={{ y: "40%" }}
        whileInView={{ y: "12%" }}
        viewport={{ once: true }}
        transition={{ duration: 1.2, ease: EASE }}
      />
    </footer>
  )
}

function SectionKicker({ index, tone = "default", children }: { index: string; tone?: "default" | "ink"; children: ReactNode }) {
  return (
    <motion.p
      className={`pn-kicker ${tone === "ink" ? "pn-kicker--ink" : ""}`}
      initial={{ opacity: 0, x: -16 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, ease: EASE }}
    >
      <span>({index})</span> {children}
    </motion.p>
  )
}

function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 36, filter: "blur(12px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ delay, duration: 0.9, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

/**
 * Pincelada roja detrás de cada renglón (como el flyer). Dos capas en la misma celda de grilla:
 * el trazo rugoso y el texto con tinta corrida, para que el filtro del pincel no deforme las letras.
 */
function BrushWord({ children, play, delay = 0 }: { children: ReactNode; play?: boolean; delay?: number }) {
  const paint = { backgroundSize: "100% 100%" }
  return (
    <span className="pn-brush-wrap">
      <span className="pn-brush-layer" aria-hidden>
        <motion.span
          className="pn-brush"
          initial={{ backgroundSize: "0% 100%" }}
          {...(play === undefined
            ? { whileInView: paint, viewport: { once: true, margin: "-15% 0px" } }
            : { animate: play ? paint : undefined })}
          transition={{ delay, duration: 0.9, ease: EASE_INOUT }}
        >
          {children}
        </motion.span>
      </span>
      <span className="pn-brush-layer">
        <span className="pn-brush-text pn-ink">{children}</span>
      </span>
    </span>
  )
}

/** Bordes de tinta corrida y pincelada roja, como en las piezas impresas de Perro Negro. */
function InkFilters() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden focusable="false">
      <filter id="pn-ink">
        <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="3" />
        <feDisplacementMap in="SourceGraphic" scale="3" />
      </filter>
      <filter id="pn-brush-filter">
        <feTurbulence type="fractalNoise" baseFrequency="0.018 0.11" numOctaves="3" seed="8" />
        <feDisplacementMap in="SourceGraphic" scale="16" />
      </filter>
    </svg>
  )
}
