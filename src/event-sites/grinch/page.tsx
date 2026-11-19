import { useEffect, useRef, useState } from "react"
import { Link } from "react-router"
import { AnimatePresence, motion, useReducedMotion, type Transition } from "motion/react"
import { TransportPicker } from "@/components/transport-picker"
import { getEventSite } from "@/event-sites/registry"
import { formatCountdown, formatEventDate, formatMenuPrice } from "@/lib/format"
import { useEventPurchase } from "@/lib/use-event-purchase"
import flyerUrl from "./assets/flyer.webp"
import wordmarkUrl from "./assets/wordmark.png"
import "./style.css"

const EVENT_IDENTIFIER = getEventSite("grinch")?.eventIdentifier

const EASE: Transition["ease"] = [0.22, 1, 0.36, 1]

/**
 * Página propia de GRINCH (grinch.crow.ar). Intro: una guirnalda de luces de navidad que se enciende
 * de a una, parpadea dos veces, se apaga y en la oscuridad se enciende el GRINCH en verde. Después, el flyer de fondo y las
 * entradas adelante. La compra es la de la tienda de Crow (`useEventPurchase`).
 */
export default function GrinchPage() {
  const purchase = useEventPurchase(EVENT_IDENTIFIER)
  const {
    data,
    error,
    restoreSession,
    ticketQtys,
    ticketsFrom,
    ticketsWindow,
    hasTicketCatalog,
    selectedTransportQtys,
    transportCount,
    setTransportQty,
    bumpTicket,
    trimTicket,
    totalStr,
    ticketCount,
    canContinue,
    continueClick,
    anyTicketPurchasable,
    productsPurchasable,
  } = purchase
  const reduceMotion = useReducedMotion()
  const [introDone, setIntroDone] = useState(() => restoreSession || !!reduceMotion)
  const [choosingTransport, setChoosingTransport] = useState(false)

  const hasTransports = (data?.transports?.length ?? 0) > 0

  // Negro también en el canvas: el rebote de scroll (Instagram, Safari) no destapa blanco.
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const previous = [html.style.backgroundColor, body.style.backgroundColor]
    html.style.backgroundColor = "#000"
    body.style.backgroundColor = "#000"
    return () => {
      ;[html.style.backgroundColor, body.style.backgroundColor] = previous
    }
  }, [])

  useEffect(() => {
    const locked = !introDone || choosingTransport
    document.body.style.overflow = locked ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [introDone, choosingTransport])

  const goToCheckout = () => {
    if (!canContinue) return
    setChoosingTransport(false)
    window.scrollTo(0, 0)
    continueClick()
  }

  const primary = () => {
    if (!canContinue) return
    if (hasTransports) setChoosingTransport(true)
    else goToCheckout()
  }

  const showBar = !!data && ticketCount > 0 && !choosingTransport

  return (
    <div className="gr-site">
      <AnimatePresence>{!introDone ? <Intro onDone={() => setIntroDone(true)} /> : null}</AnimatePresence>

      <motion.div
        className="gr-backdrop"
        aria-hidden
        initial={false}
        animate={introDone ? { opacity: 1, scale: 1, filter: "brightness(1) blur(0px)" } : { opacity: 0, scale: 1.12, filter: "brightness(0) blur(12px)" }}
        transition={{ duration: 1.8, ease: EASE }}
      >
        <img src={flyerUrl} alt="" className="gr-backdrop__flyer" decoding="async" fetchPriority="high" />
        <div className="gr-backdrop__shade" />
      </motion.div>

      <motion.header
        className="gr-top"
        initial={false}
        animate={{ opacity: introDone ? 1 : 0 }}
        transition={{ duration: 0.8, delay: introDone ? 0.6 : 0 }}
      >
        <span className="gr-top__date">24.12</span>
        <Link to="/acceso/ingresar" className="gr-top__link">mis entradas <span aria-hidden>↗</span></Link>
      </motion.header>

      <main className="gr-main">
        <h1 className="gr-visually-hidden">GRINCH · 24 de diciembre · Qualy Lab</h1>

        <section className="gr-tickets" aria-labelledby="gr-tickets-title">
          <motion.div
            className="gr-tickets__head"
            initial={false}
            animate={introDone ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.6, delay: introDone ? 0.9 : 0 }}
          >
            <h2 id="gr-tickets-title" className="gr-label">Entradas</h2>
            <motion.span
              className="gr-tickets__rule"
              aria-hidden
              initial={false}
              animate={{ scaleX: introDone ? 1 : 0 }}
              transition={{ duration: 1.1, ease: EASE, delay: introDone ? 1 : 0 }}
            />
            {data?.event.venue ? <span className="gr-label gr-label--dim">{data.event.venue}</span> : null}
          </motion.div>

          {error ? (
            <p className="gr-note">{error}</p>
          ) : !data ? (
            <p className="gr-note">cargando…</p>
          ) : (
            <>
              {ticketsWindow.closed ? (
                <p className="gr-note">La venta de entradas ya cerró.</p>
              ) : ticketsFrom != null && !ticketsWindow.open ? (
                <p className="gr-note">
                  Venta desde el {formatEventDate(ticketsFrom)} · en{" "}
                  <strong className="gr-tabular">{formatCountdown(ticketsWindow.msLeft)}</strong>
                </p>
              ) : ticketsWindow.open && hasTicketCatalog && !anyTicketPurchasable ? (
                <p className="gr-note">Por ahora no hay entradas disponibles.</p>
              ) : !hasTicketCatalog ? (
                <p className="gr-note">Sin entradas a la venta.</p>
              ) : null}

              {hasTicketCatalog ? (
                <ul className="gr-list">
                  {data.ticketTypes.map((t, i) => {
                    const count = ticketQtys[t.id] ?? 0
                    const disabled = !t.availableForPurchase || !ticketsWindow.open
                    const soldOut = t.remaining != null && t.remaining <= 0
                    const fewLeft = !soldOut && t.remaining != null && t.remaining <= 20
                    const promo = t.promoBuy && t.promoPay ? `${t.promoBuy}x${t.promoPay}` : null
                    return (
                      <motion.li
                        key={t.id}
                        className={`gr-ticket${count > 0 ? " is-picked" : ""}${disabled ? " is-off" : ""}`}
                        initial={false}
                        animate={introDone ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: 28, filter: "blur(8px)" }}
                        transition={{ duration: 0.9, ease: EASE, delay: introDone ? 1.15 + i * 0.12 : 0 }}
                      >
                        <div className="gr-ticket__info">
                          <span className="gr-ticket__name">{t.name}</span>
                          <span className="gr-ticket__meta">
                            <span className="gr-tabular">{formatMenuPrice(t.price)}</span>
                            {promo ? <span className="gr-ticket__tag">{promo}</span> : null}
                            {soldOut ? <span className="gr-ticket__tag">agotada</span> : fewLeft ? <span className="gr-ticket__tag">últimas</span> : null}
                          </span>
                        </div>
                        <div className="gr-stepper" role="group" aria-label={`Cantidad de ${t.name}`}>
                          <AnimatePresence initial={false}>
                            {count > 0 ? (
                              <motion.div
                                key="minus"
                                className="gr-stepper__pair"
                                initial={{ opacity: 0, width: 0 }}
                                animate={{ opacity: 1, width: "auto" }}
                                exit={{ opacity: 0, width: 0 }}
                                transition={{ duration: 0.35, ease: EASE }}
                              >
                                <button type="button" className="gr-step" onClick={() => trimTicket(t.id)} aria-label={`Quitar ${t.name}`}>−</button>
                                <span className="gr-stepper__count gr-tabular" aria-live="polite">{count}</span>
                              </motion.div>
                            ) : null}
                          </AnimatePresence>
                          <button
                            type="button"
                            className="gr-step gr-step--add"
                            onClick={() => bumpTicket(t.id)}
                            disabled={disabled || (t.remaining != null && count >= t.remaining)}
                            aria-label={`Sumar ${t.name}`}
                          >
                            +
                          </button>
                        </div>
                      </motion.li>
                    )
                  })}
                </ul>
              ) : null}

              {!anyTicketPurchasable && productsPurchasable ? (
                <Link to="/entradas" className="gr-text-link">Comprar consumos <span aria-hidden>↗</span></Link>
              ) : null}

              {data.event.description ? (
                <motion.p
                  className="gr-fine"
                  initial={false}
                  animate={{ opacity: introDone ? 1 : 0 }}
                  transition={{ duration: 0.8, delay: introDone ? 1.6 : 0 }}
                >
                  {data.event.description}
                </motion.p>
              ) : null}
            </>
          )}
        </section>
      </main>

      <AnimatePresence>
        {showBar ? (
          <motion.div
            key="bar"
            className="gr-bar"
            initial={{ y: "120%" }}
            animate={{ y: 0 }}
            exit={{ y: "120%" }}
            transition={{ duration: 0.55, ease: EASE }}
          >
            <button type="button" className="gr-cta" disabled={!canContinue} onClick={primary}>
              <span>{hasTransports ? "Continuar" : "Ir a pagar"}</span>
              <span className="gr-cta__total gr-tabular">
                {formatMenuPrice(totalStr)}
              </span>
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {choosingTransport && data ? (
          <motion.div
            key="transport"
            className="gr-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gr-sheet-title"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            <motion.div
              className="gr-sheet__panel"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.55, ease: EASE }}
            >
              <div className="gr-sheet__head">
                <h2 id="gr-sheet-title" className="gr-label">¿Sumás transporte?</h2>
                <button type="button" className="gr-text-link" onClick={() => setChoosingTransport(false)}>volver</button>
              </div>
              <div className="gr-sheet__body">
                <TransportPicker
                  transports={data.transports ?? []}
                  quantities={selectedTransportQtys}
                  maxSeats={ticketCount}
                  onQuantity={setTransportQty}
                />
              </div>
              <button type="button" className="gr-cta" disabled={!canContinue} onClick={goToCheckout}>
                <span>{transportCount === 0 ? "Seguir sin transporte" : "Ir a pagar"}</span>
                <span className="gr-cta__total gr-tabular">{formatMenuPrice(totalStr)}</span>
              </button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

/* ─── Intro: se apaga la navidad ─────────────────────────────────────────── */

const BULB_COLORS = ["#ff3d2e", "#ffb21e", "#fff1c9", "#ff3d2e", "#ffb21e", "#fff1c9", "#ff3d2e", "#ffb21e", "#fff1c9"]
const WIRE_Y = 30
const SAG = 46

/** Altura de la guirnalda en x (0–400): una curva que cuelga entre los dos extremos. */
function wireY(x: number) {
  const u = (x - 200) / 215
  return WIRE_Y + SAG * (1 - u * u)
}

const BULBS = BULB_COLORS.map((color, i) => {
  const x = 36 + i * 41
  // Cada lamparita cuelga perpendicular a la pendiente del cable.
  const slope = (-2 * SAG * (x - 200)) / (215 * 215)
  return { color, x, y: wireY(x), tilt: (Math.atan(slope) * 180) / Math.PI }
})

const WIRE_PATH = (() => {
  const pts: string[] = []
  for (let x = -20; x <= 420; x += 10) pts.push(`${x},${wireY(x).toFixed(1)}`)
  return `M${pts.join(" L")}`
})()

type IntroPhase = "on" | "off" | "grinch"

// Se encienden en orden → todas parpadean dos veces a la vez y se apagan → oscuridad → GRINCH en verde.
const T_OFF = 1350
const T_BLINK = 0.7
const T_GRINCH = T_OFF + T_BLINK * 1000 + 500
const T_OUT = T_GRINCH + 1250

function Intro({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<IntroPhase>("on")
  // La página se vuelve a renderizar cuando llega el evento: los timers no deben reiniciarse.
  const doneRef = useRef(onDone)
  useEffect(() => { doneRef.current = onDone })

  useEffect(() => {
    const timers = [
      window.setTimeout(() => setPhase("off"), T_OFF),
      window.setTimeout(() => setPhase("grinch"), T_GRINCH),
      window.setTimeout(() => doneRef.current(), T_OUT),
    ]
    return () => timers.forEach(window.clearTimeout)
  }, [])

  const lightsOn = phase === "on"

  return (
    <motion.div
      className="gr-intro"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.9, ease: EASE }}
      onClick={onDone}
      role="presentation"
    >
      <motion.svg
        className="gr-intro__lights"
        viewBox="0 0 400 120"
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: phase === "grinch" ? 0 : 1 }}
        transition={{ duration: phase === "grinch" ? 0.6 : 0.4 }}
      >
        <defs>
          {BULB_COLORS.filter((c, i, all) => all.indexOf(c) === i).map((c) => (
            <radialGradient key={c} id={`gr-glow-${c.slice(1)}`}>
              <stop offset="0%" stopColor={c} stopOpacity="0.85" />
              <stop offset="35%" stopColor={c} stopOpacity="0.28" />
              <stop offset="100%" stopColor={c} stopOpacity="0" />
            </radialGradient>
          ))}
        </defs>
        <path d={WIRE_PATH} className="gr-intro__wire" />
        {BULBS.map((b, i) => {
          return (
            <g key={i} transform={`translate(${b.x} ${b.y}) rotate(${b.tilt})`}>
              <rect x={-2.4} y={0} width={4.8} height={5} rx={1} className="gr-intro__socket" />
              <ellipse cx={0} cy={11} rx={4.2} ry={6.6} className="gr-intro__dead" />
              <motion.g
                initial={{ opacity: 0 }}
                animate={
                  lightsOn
                    ? { opacity: [0, 1, 0.75, 1] }
                    : { opacity: [1, 0.08, 1, 0.08, 1, 0] }
                }
                transition={
                  lightsOn
                    ? { duration: 0.7, delay: 0.15 + i * 0.07, times: [0, 0.4, 0.7, 1] }
                    : { duration: T_BLINK, ease: "linear", times: [0, 0.14, 0.3, 0.44, 0.6, 1] }
                }
              >
                <circle cx={0} cy={11} r={26} fill={`url(#gr-glow-${b.color.slice(1)})`} />
                <ellipse cx={0} cy={11} rx={4.2} ry={6.6} fill={b.color} />
              </motion.g>
            </g>
          )
        })}
      </motion.svg>

      <AnimatePresence>
        {phase === "grinch" ? (
          <motion.div
            key="mark"
            className="gr-intro__mark-glow"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.1, 1, 0.35, 1] }}
            transition={{ duration: 0.75, times: [0, 0.1, 0.22, 0.4, 0.5, 1] }}
          >
            <div className="gr-wordmark" style={{ maskImage: `url(${wordmarkUrl})`, WebkitMaskImage: `url(${wordmarkUrl})` }} role="img" aria-label="GRINCH" />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <button type="button" className="gr-intro__skip" onClick={onDone}>saltar</button>
    </motion.div>
  )
}
