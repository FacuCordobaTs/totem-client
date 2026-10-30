import { getEventSite } from "@/event-sites/registry"
import { eventSlugFromHostname } from "@/lib/event-domain"
import { Fragment, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router"
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  Coins,
  Copy,
  CreditCard,
  Loader2,
  Wallet,
} from "lucide-react"
import { CardPayment, initMercadoPago } from "@mercadopago/sdk-react"
import { AnimatePresence, motion, type Transition } from "motion/react"
import { publicApiFetch } from "@/lib/api"
import { formatAdmissionWindow } from "@/lib/ticket-admission"
import type {
  BalanceLookupResponse,
  GuestCheckoutResponse,
  ProcessBrickResponse,
  PublicEventDetailResponse,
} from "@/types/api"
import {
  computeCartTotalString,
  useCartStore,
  type CartSnapshot,
} from "@/stores/cart-store"
import { isValidBuyerIdentity, useBuyerStore } from "@/stores/buyer-store"
import { formatMoneyArsExact } from "@/lib/format"
import Decimal from "decimal.js"

type Step = "contact" | "method" | "pay"
type Method = "TRANSFER" | "CARD" | "MERCADOPAGO" | "SALDO"
type PaymentMethods = PublicEventDetailResponse["productora"]["paymentMethods"]

const STEP_EASE: Transition = { duration: 0.44, ease: [0.22, 1, 0.36, 1] as const }

const STEPS: Array<{ key: Step; label: string }> = [
  { key: "contact", label: "Datos" },
  { key: "method", label: "Método" },
  { key: "pay", label: "Pago" },
]

// Al volver desde el checkout, la página del evento solo restaura la parte de
// consumos si encuentra este flag (una visita normal al link arranca limpia).
function setEventRestoreFlag(slug: string | null) {
  if (!slug) return
  try {
    sessionStorage.setItem(`crow_restore_progress_${slug}`, "1")
  } catch { /* noop */ }
}

// Borra el progreso de compra guardado por la página del evento (localStorage
// keyed por slug — el eventId de la URL no coincide con el slug, así que se
// limpian ambos) y el flag de restauración: al reingresar al link del evento
// después de comprar, se ve la pantalla normal, no la de consumos.
function clearEventProgress(eventId: string | undefined, slug: string | null) {
  try {
    if (eventId) localStorage.removeItem(`crow_event_progress_${eventId}`)
    if (slug) {
      localStorage.removeItem(`crow_event_progress_${slug}`)
      sessionStorage.removeItem(`crow_restore_progress_${slug}`)
    }
    // El carrito del link de acceso invitado se guarda por slug del evento.
    for (const key of [`crow_guest_cart_${eventId ?? ""}`, `crow_guest_cart_${slug ?? ""}`]) {
      if (key !== "crow_guest_cart_") sessionStorage.removeItem(key)
    }
  } catch { /* noop */ }
}

export function CheckoutPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const promoterId = searchParams.get("promotor") ?? searchParams.get("promoter") ?? undefined
  const cart = useCartStore((s) => s.cart)
  const hydrated = useCartStore((s) => s._hydrated)
  const clearCart = useCartStore((s) => s.clearCart)
  const storedName = useBuyerStore((s) => s.name)
  const storedDni = useBuyerStore((s) => s.dni)
  const setIdentity = useBuyerStore((s) => s.setIdentity)

  // El drawer de la tienda ya pidió nombre y DNI: con identidad completa se arranca directo en el
  // método de pago. Si alguien entra al checkout con un carrito viejo, el paso "Datos" los pide.
  const [step, setStep] = useState<Step>(() =>
    isValidBuyerIdentity(storedName, storedDni) ? "method" : "contact"
  )
  const [method, setMethod] = useState<Method>("TRANSFER")
  const [name, setName] = useState(storedName)
  const [dni, setDni] = useState(storedDni)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<GuestCheckoutResponse | null>(null)
  const [confirmedTotal, setConfirmedTotal] = useState<string>("0.00")
  // Tarea 2.2 — el "Volver" navega a la página del evento por slug (la ruta
  // `/e/:eventId` no existe). Se resuelve al montar con `GET /public/events/:id`.
  const [eventSlug, setEventSlug] = useState<string | null>(null)
  // `volver` lo manda el link de acceso: el checkout regresa a la carta de consumos, no a la
  // tienda de entradas. Sólo se aceptan rutas internas.
  const requestedReturnTo = searchParams.get("volver")
  const safeReturnTo =
    requestedReturnTo && requestedReturnTo.startsWith("/") && !requestedReturnTo.startsWith("//")
      ? requestedReturnTo
      : null
  const eventReturnPath =
    safeReturnTo ??
    (eventSlug && !getEventSite(eventSlugFromHostname(window.location.hostname))
      ? `/${encodeURIComponent(eventSlug)}`
      : "/")
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethods | null>(null)
  const [ticketTypes, setTicketTypes] = useState<PublicEventDetailResponse["ticketTypes"]>([])
  // Tarea 6.2 — Saldo del cliente en este evento ("0.00" si no tiene): "Saldo disponible"
  // se ofrece como método solo cuando hay fondos (visión §2.7).
  const [balanceAmount, setBalanceAmount] = useState<string>("0.00")

  useEffect(() => {
    if (!eventId) return
    let cancelled = false
    publicApiFetch<PublicEventDetailResponse>(`/public/events/${eventId}`)
      .then((d) => {
        if (!cancelled) {
          setEventSlug(d.event.slug ?? null)
          setPaymentMethods(d.productora.paymentMethods)
          setTicketTypes(d.ticketTypes)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEventSlug(null)
          setPaymentMethods(null)
          setTicketTypes([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [eventId])

  const snapshot: CartSnapshot | null =
    cart && cart.eventId === eventId ? cart : null

  const totalStr = useMemo(
    () => (snapshot ? computeCartTotalString(snapshot) : "0.00"),
    [snapshot]
  )

  // La identidad del comprador en la puerta es el DNI; el nombre lo acompaña.
  const dniValid = /^\d{6,9}$/.test(dni.trim())
  const contactValid = name.trim().length >= 2 && dniValid

  const goToEventPage = () => {
    // Volver desde el checkout restaura la parte de consumos del evento (salvo que el link de
    // acceso haya pedido volver a su propio comprobante).
    if (!safeReturnTo) setEventRestoreFlag(eventSlug)
    const promoterQuery = promoterId ? `?promotor=${encodeURIComponent(promoterId)}` : ""
    navigate(`${eventReturnPath}${promoterQuery}`)
  }

  const handleBack = () => {
    if (step === "method") {
      setStep("contact")
      return
    }
    goToEventPage()
  }

  const goToMethod = () => {
    if (!contactValid) return
    setIdentity({ name, dni })
    setErr(null)
    setStep("method")
  }

  // Tarea 6.2 — Al llegar al paso de método, consulta el saldo por DNI: sin DNI válido o
  // sin saldo, "Saldo disponible" no aparece como opción.
  useEffect(() => {
    if (step !== "method" || !dniValid || !eventId) return
    let cancelled = false
    publicApiFetch<BalanceLookupResponse>(
      `/public/events/${eventId}/balance?dni=${encodeURIComponent(dni.trim())}`
    )
      .then((d) => {
        if (!cancelled) setBalanceAmount(d.amount ?? "0.00")
      })
      .catch(() => {
        if (!cancelled) setBalanceAmount("0.00")
      })
    return () => {
      cancelled = true
    }
  }, [step, dniValid, dni, eventId])

  const balanceAvailable = parseFloat(balanceAmount) > 0

  // Si el DNI cambió y el saldo ya no está disponible, no dejar "Saldo disponible"
  // seleccionado (el backend lo rechazaría igual, pero mejor corregir la UI).
  const availableMethods = useMemo<Method[]>(() => {
    if (!paymentMethods) return []
    return [
      ...(balanceAvailable ? (["SALDO"] as const) : []),
      ...(paymentMethods.transfer ? (["TRANSFER"] as const) : []),
      ...(paymentMethods.mercadoPago ? (["CARD", "MERCADOPAGO"] as const) : []),
    ]
  }, [balanceAvailable, paymentMethods])

  useEffect(() => {
    if (availableMethods.length > 0 && !availableMethods.includes(method)) {
      setMethod(availableMethods[0])
    }
  }, [method, availableMethods])

  const submitPurchase = async () => {
    if (!snapshot || submitting || !availableMethods.includes(method)) return
    setErr(null)
    setSubmitting(true)
    try {
      const data = await publicApiFetch<GuestCheckoutResponse>("/public/checkout", {
        method: "POST",
        body: JSON.stringify({
          eventId: snapshot.eventId,
          paymentMethod: method,
          clientTotal: totalStr,
          contact: {
            name: name.trim(),
            dni: dni.trim(),
            // Sin cuenta no se pide email ni teléfono: el comprobante queda en pantalla y el
            // cliente puede volver a entrar con su DNI desde el link de acceso.
            email: "",
            phone: "",
          },
          transportLines: (snapshot.transportLines ?? []).map((l) => ({ transportId: l.transportId, quantity: l.quantity })),
          ticketLines: snapshot.ticketLines.map((l) => ({
            ticketTypeId: l.ticketTypeId,
            quantity: l.quantity,
          })),
          drinkLines: snapshot.drinkLines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
          })),
          ...(promoterId ? { promoterId } : {}),
        }),
      })

      // Tarea 6.2 — Pago con saldo: completo al instante (el backend dejó la sale
      // COMPLETED y debitó el saldo). Sin paso de pago: directo al comprobante.
      if (method === "SALDO") {
        clearCart()
        clearEventProgress(eventId, eventSlug)
        navigate(`/receipt/${data.receiptToken}`)
        return
      }

      // Tarea 2.2 — `redirectUrl` tipado: el backend devuelve el link de Checkout Pro.
      const redirectUrl = data.redirectUrl
      if (method === "MERCADOPAGO" && redirectUrl) {
        clearCart()
        clearEventProgress(eventId, eventSlug)
        window.location.href = redirectUrl
        return
      }

      // Inicializar el SDK antes de montar el Brick (el Brick se crea en su propio
      // effect al renderizar el paso de pago, y `initMercadoPago` debe ir primero).
      if (method === "CARD" && data.card?.publicKey) {
        try {
          initMercadoPago(data.card.publicKey, { locale: "es-AR" })
        } catch (e) {
          console.error("[Mercado Pago] initMercadoPago", e)
        }
      }

      setConfirmedTotal(totalStr)
      setResult(data)
      clearCart()
      clearEventProgress(eventId, eventSlug)
      setStep("pay")
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No pudimos confirmar el pago.")
    } finally {
      setSubmitting(false)
    }
  }

  if (!hydrated) return null
  if (!snapshot && !result) {
    if (!safeReturnTo) setEventRestoreFlag(eventSlug)
    const promoterQuery = promoterId ? `?promotor=${encodeURIComponent(promoterId)}` : ""
    navigate(`${eventReturnPath}${promoterQuery}`, { replace: true })
    return null
  }

  return (
    // Mismo fondo que la página del evento (diseño minimalista).
    <div className="relative min-h-dvh bg-[#0a0a0a]">
      <header className="sticky top-0 z-20 border-b border-white/[0.04] bg-[#0a0a0a]/70 px-5 pb-4 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl sm:px-8">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleBack}
              aria-label="Volver"
              className="-ml-2 flex size-10 items-center justify-center rounded-xl text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <ArrowLeft className="size-5" strokeWidth={2.25} />
            </button>
            <p className="text-sm font-semibold tabular-nums tracking-tight text-white/85">
              {formatMoneyArsExact(step === "pay" ? confirmedTotal : totalStr)}
            </p>
          </div>
          <ProgressStepper step={step} />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-col px-6 pb-32 pt-16 sm:px-8">
        {step !== "pay" && (snapshot?.transportLines ?? []).map((line) => <div key={line.transportId} className="mb-6 rounded-xl border border-white/15 bg-white/5 p-4 text-sm"><p className="font-semibold">{line.quantity} × {line.name} · Transporte</p><p className="mt-1 text-white/60">{line.address}</p><p className="mt-2">{formatMoneyArsExact(new Decimal(line.unitPrice).mul(line.quantity).toFixed(2))}</p></div>)}
        {step !== "pay" && ticketTypes.filter((type) => snapshot?.ticketLines.some((line) => line.ticketTypeId === type.id)).map((type) => {
          const schedule = formatAdmissionWindow(type)
          return schedule ? <p key={type.id} className="mb-4 rounded-xl border border-amber-200/20 bg-amber-200/5 p-3 text-sm text-amber-200"><strong>{type.name}:</strong> {schedule}</p> : null
        })}
        <AnimatePresence mode="wait" initial={false}>
          {step === "contact" ? (
            <motion.div
              key="contact"
              initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
              transition={STEP_EASE}
            >
              <ContactStep
                name={name}
                dni={dni}
                setName={setName}
                setDni={setDni}
                canContinue={contactValid}
                onContinue={goToMethod}
              />
            </motion.div>
          ) : step === "method" ? (
            <motion.div
              key="method"
              initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
              transition={STEP_EASE}
            >
              <MethodStep
                method={method}
                setMethod={setMethod}
                onConfirm={submitPurchase}
                submitting={submitting}
                error={err}
                balanceAmount={balanceAmount}
                balanceAvailable={balanceAvailable}
                paymentMethods={paymentMethods}
                buyerName={name}
                buyerDni={dni}
                onEditIdentity={() => setStep("contact")}
              />
            </motion.div>
          ) : (
            <motion.div
              key="pay"
              initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
              transition={STEP_EASE}
            >
              {method === "TRANSFER" ? (
                <PayTransferView
                  amount={formatMoneyArsExact(confirmedTotal)}
                  alias={result?.transfer?.alias ?? "alias.pendiente"}
                />
              ) : method === "CARD" ? (
                <PayCardView
                  amount={Number(confirmedTotal)}
                  publicKey={result?.card?.publicKey ?? null}
                  receiptToken={result?.receiptToken ?? ""}
                  onPaid={() => {
                    const token = result?.receiptToken
                    if (!token) return
                    // Aprobado o pendiente: el comprobante hace polling y muestra el
                    // resultado real (el webhook cumple la sale en segundo plano).
                    navigate(`/receipt/${token}`)
                  }}
                />
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}

function ProgressStepper({ step }: { step: Step }) {
  const activeIdx = STEPS.findIndex((s) => s.key === step)
  return (
    <div className="space-y-3">
      <div className="flex items-center">
        {STEPS.map((s, i) => {
          const completed = i < activeIdx
          const active = i === activeIdx
          const isLast = i === STEPS.length - 1
          return (
            <Fragment key={s.key}>
              <motion.div
                animate={{ scale: active ? 1.15 : 1 }}
                transition={{ type: "spring", stiffness: 380, damping: 22 }}
                className={`relative flex size-3 shrink-0 items-center justify-center rounded-full ${
                  completed || active ? "bg-white" : "bg-white/[0.15]"
                } ${active ? "ring-[3px] ring-white/15" : ""}`}
              >
                <AnimatePresence>
                  {completed ? (
                    <motion.span
                      key="check"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                    >
                      <Check className="size-2 text-black" strokeWidth={4} />
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </motion.div>
              {!isLast ? (
                <div className="relative mx-3 h-px flex-1 overflow-hidden bg-white/[0.1]">
                  <motion.div
                    initial={false}
                    animate={{ scaleX: completed ? 1 : 0 }}
                    style={{ transformOrigin: "left" }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute inset-0 bg-white"
                  />
                </div>
              ) : null}
            </Fragment>
          )
        })}
      </div>
      <div className="flex">
        {STEPS.map((s, i) => {
          const completed = i < activeIdx
          const active = i === activeIdx
          const align =
            i === 0 ? "text-left" : i === STEPS.length - 1 ? "text-right" : "text-center"
          return (
            <p
              key={s.key}
              className={`flex-1 ${align} text-[10px] font-semibold uppercase tracking-[0.22em] transition-colors ${
                active ? "text-white" : completed ? "text-white/55" : "text-white/30"
              }`}
            >
              {s.label}
            </p>
          )
        })}
      </div>
    </div>
  )
}

function ContactStep({
  name,
  dni,
  setName,
  setDni,
  canContinue,
  onContinue,
}: {
  name: string
  dni: string
  setName: (v: string) => void
  setDni: (v: string) => void
  canContinue: boolean
  onContinue: () => void
}) {
  return (
    <div className="flex flex-col gap-14">
      <div className="space-y-3">
        <h1 className="text-3xl font-black leading-[1.05] tracking-tight text-white sm:text-[2.25rem]">
          Tus datos
        </h1>
        <p className="text-sm leading-relaxed text-white/55">
          Sólo tu nombre y DNI: con eso te identificamos en el evento.
        </p>
      </div>

      <div className="flex flex-col gap-10">
        <FloatingField
          id="co-name"
          label="Nombre y apellido"
          value={name}
          onChange={setName}
          autoComplete="name"
        />
        <FloatingField
          id="co-dni"
          label="DNI"
          value={dni}
          onChange={(v) => setDni(v.replace(/\D/g, "").slice(0, 9))}
          inputMode="numeric"
          autoComplete="off"
        />
      </div>

      <button
        type="button"
        onClick={onContinue}
        disabled={!canContinue}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-base font-semibold text-black transition-all hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/40"
      >
        <span>Ir al pago</span>
        <ArrowRight className="size-4" strokeWidth={2.5} />
      </button>
    </div>
  )
}

function FloatingField({
  id,
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  inputMode,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  autoComplete?: string
  inputMode?: "text" | "email" | "tel" | "numeric"
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45"
      >
        {label}
      </label>
      <div className="mt-3 flex items-center border-b border-white/[0.12] transition-colors focus-within:border-white">
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode={inputMode}
          autoComplete={autoComplete}
          className="min-w-0 flex-1 border-0 bg-transparent px-0 py-3 text-xl font-medium text-white outline-none placeholder:text-white/25"
        />
      </div>
    </div>
  )
}

function MethodStep({
  method,
  setMethod,
  onConfirm,
  submitting,
  error,
  balanceAmount,
  balanceAvailable,
  paymentMethods,
  buyerName,
  buyerDni,
  onEditIdentity,
}: {
  method: Method
  setMethod: (m: Method) => void
  onConfirm: () => void
  submitting: boolean
  error: string | null
  balanceAmount: string
  balanceAvailable: boolean
  paymentMethods: PaymentMethods | null
  buyerName: string
  buyerDni: string
  onEditIdentity: () => void
}) {
  const availableMethods = [
    ...(balanceAvailable ? (["SALDO"] as const) : []),
    ...(paymentMethods?.transfer ? (["TRANSFER"] as const) : []),
    ...(paymentMethods?.mercadoPago ? (["CARD", "MERCADOPAGO"] as const) : []),
  ]

  // No se muestran medios ni CTA hasta tener la configuración; si la productora
  // no habilitó ninguno, el paso queda vacío.
  if (!paymentMethods || availableMethods.length === 0) return null

  const ctaLabel =
    method === "TRANSFER"
      ? "Generar transferencia"
      : method === "CARD"
        ? "Pagar con tarjeta"
        : method === "SALDO"
          ? "Pagar con saldo"
          : "Ir a Mercado Pago"

  const CtaIcon = method === "MERCADOPAGO" ? ArrowUpRight : ArrowRight

  return (
    <div className="flex flex-col gap-14">
      <div className="space-y-3">
        <h1 className="text-3xl font-black leading-[1.05] tracking-tight text-white sm:text-[2.25rem]">
          ¿Cómo querés pagar?
        </h1>
      </div>

      <div className="flex items-center justify-between gap-4 text-sm">
        <p className="min-w-0 text-white/55">
          Comprando como <span className="whitespace-nowrap font-semibold text-white">{buyerName}</span>
          <span className="whitespace-nowrap text-white/35"> · DNI {buyerDni}</span>
        </p>
        <button
          type="button"
          onClick={onEditIdentity}
          className="shrink-0 text-xs font-semibold text-white/45 underline underline-offset-4 transition-colors hover:text-white/70"
        >
          Cambiar
        </button>
      </div>

      <div className="flex flex-col gap-3" role="radiogroup" aria-label="Medio de pago">
        {/* Tarea 6.2 — "Saldo disponible" solo cuando el cliente tiene fondos (visión §2.7):
            el saldo está atado al DNI del paso anterior. */}
        {balanceAvailable ? (
          <MethodCard
            icon={<Coins className="size-5" strokeWidth={2} />}
            label="Saldo disponible"
            description={`Tenés ${formatMoneyArsExact(balanceAmount)} cargados para este evento.`}
            selected={method === "SALDO"}
            onSelect={() => setMethod("SALDO")}
          />
        ) : null}
        {paymentMethods?.transfer ? (
          <MethodCard
            icon={<ArrowLeftRight className="size-5" strokeWidth={2} />}
          label="Transferencia"
          description="Pago verificado por alias."
          selected={method === "TRANSFER"}
            onSelect={() => setMethod("TRANSFER")}
          />
        ) : null}
        {paymentMethods?.mercadoPago ? (
          <>
            <MethodCard
              icon={<CreditCard className="size-5" strokeWidth={2} />}
          label="Tarjeta"
          description="Crédito o débito."
          selected={method === "CARD"}
          onSelect={() => setMethod("CARD")}
        />
        <MethodCard
          icon={<Wallet className="size-5" strokeWidth={2} />}
          label="Mercado Pago"
          description="Pagás desde tu cuenta."
          selected={method === "MERCADOPAGO"}
              onSelect={() => setMethod("MERCADOPAGO")}
            />
          </>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        {error ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3">
            <p className="text-sm leading-relaxed text-red-300">{error}</p>
          </div>
        ) : null}
        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-base font-semibold text-black transition-all hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/40"
        >
          {submitting ? (
            <Loader2 className="size-5 animate-spin" strokeWidth={2.5} />
          ) : (
            <>
              <span>{ctaLabel}</span>
              <CtaIcon className="size-4" strokeWidth={2.5} />
            </>
          )}
        </button>
      </div>
    </div>
  )
}

function MethodCard({
  icon,
  label,
  description,
  selected,
  onSelect,
}: {
  icon: React.ReactNode
  label: string
  description: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`relative flex w-full items-center gap-4 rounded-2xl border px-5 py-5 text-left transition-all ${
        selected
          ? "border-white/30 bg-white/[0.08]"
          : "border-white/[0.07] bg-white/[0.03] hover:border-white/[0.14] hover:bg-white/[0.05]"
      }`}
    >
      <div
        className={`flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
          selected ? "bg-white text-black" : "bg-white/[0.06] text-white/70"
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold leading-tight text-white">{label}</p>
        <p className="mt-1 text-[13px] leading-tight text-white/50">{description}</p>
      </div>
      <div
        className={`flex size-5 shrink-0 items-center justify-center rounded-full border transition-all ${
          selected ? "border-white bg-white" : "border-white/25"
        }`}
      >
        <AnimatePresence>
          {selected ? (
            <motion.span
              key="dot"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ duration: 0.18 }}
            >
              <Check className="size-3 text-black" strokeWidth={3.5} />
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>
    </button>
  )
}

function PayTransferView({ amount, alias }: { amount: string; alias: string }) {
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(alias)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // noop
    }
  }
  return (
    <div className="flex min-h-[65dvh] flex-col items-center justify-center text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/45">
        Transferí
      </p>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
        className="mt-7 text-[64px] font-black leading-none tracking-tight tabular-nums text-white sm:text-[80px]"
      >
        {amount}
      </motion.p>

      <motion.button
        type="button"
        onClick={onCopy}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
        className="mt-20 flex w-full max-w-sm items-center justify-center gap-3 rounded-2xl bg-white px-6 py-4 font-semibold text-black transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
      >
        <AnimatePresence mode="wait" initial={false}>
          {copied ? (
            <motion.span
              key="copied"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-2"
            >
              <Check className="size-4" strokeWidth={2.75} />
              <span>Copiado</span>
            </motion.span>
          ) : (
            <motion.span
              key="alias"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-2"
            >
              <Copy className="size-4" strokeWidth={2.25} />
              <span className="font-mono text-[15px]">{alias}</span>
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      <p className="mt-10 max-w-[280px] text-xs leading-relaxed text-white/40">
        Cuando acreditemos el pago, el comprobante se actualiza solo.
      </p>
    </div>
  )
}

/**
 * Datos que entrega el CardPayment Brick al submit. Todo opcional: es un supertipo
 * del form data del SDK (así el callback es asignable sin casts `any`).
 */
type CardBrickFormData = {
  token?: string
  issuer_id?: string | null
  payment_method_id?: string
  installments?: number
  payer?: { email?: string; identification?: { type?: string; number?: string } | null }
}

function PayCardView({
  amount,
  publicKey,
  receiptToken,
  onPaid,
}: {
  amount: number
  publicKey: string | null
  receiptToken: string
  onPaid: (status: "approved" | "pending") => void
}) {
  const [error, setError] = useState<string | null>(null)

  // Tarea 2.2 — pago con tarjeta de punta a punta: el Brick entrega el token del
  // método de pago y acá se cobra contra `/api/mp/process-brick` (la sale ya quedó
  // PENDING en el checkout y el backend la cumple al aprobarse).
  const handleSubmit = async (form: CardBrickFormData) => {
    if (!receiptToken || !form.token) return
    setError(null)
    try {
      const res = await publicApiFetch<ProcessBrickResponse>("/api/mp/process-brick", {
        method: "POST",
        body: JSON.stringify({
          receiptToken,
          token: form.token,
          installments: form.installments,
          payer: {
            email: form.payer?.email ?? "",
            ...(form.payer?.identification
              ? { identification: form.payer.identification }
              : {}),
          },
          payment_method_id: form.payment_method_id,
          issuer_id: form.issuer_id,
        }),
      })
      if (!res.success) {
        setError(res.error ?? "No pudimos procesar el pago.")
        return
      }
      if (res.status === "rejected" || res.status === "cancelled") {
        setError("El pago fue rechazado. Probá con otra tarjeta.")
        return
      }
      onPaid(res.status === "approved" ? "approved" : "pending")
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos procesar el pago.")
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/45">
          Pagás
        </p>
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32 }}
          className="mt-4 text-4xl font-black tracking-tight tabular-nums text-white sm:text-5xl"
        >
          {formatMoneyArsExact(amount)}
        </motion.p>
      </div>
      {publicKey ? (
        <CardPayment
          id="mp-card-brick"
          initialization={{ amount }}
          locale="es-AR"
          onSubmit={handleSubmit}
          onReady={() => setError(null)}
        />
      ) : (
        <p className="text-center text-xs text-white/40">
          Preparando el formulario seguro de Mercado Pago…
        </p>
      )}
      {error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3">
          <p className="text-sm leading-relaxed text-red-300">{error}</p>
        </div>
      ) : null}
    </div>
  )
}
