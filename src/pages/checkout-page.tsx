import { Fragment, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router"
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  CreditCard,
  Loader2,
  Wallet,
} from "lucide-react"
import { AnimatePresence, motion, type Transition } from "motion/react"
import { publicApiFetch } from "@/lib/api"
import type { GuestCheckoutResponse } from "@/types/api"
import {
  computeCartTotalString,
  useCartStore,
  type CartSnapshot,
} from "@/stores/cart-store"
import { formatMoneyArsExact } from "@/lib/format"

type Step = "contact" | "method" | "pay"
type Method = "TRANSFER" | "CARD" | "MERCADOPAGO"

const STEP_EASE: Transition = { duration: 0.44, ease: [0.22, 1, 0.36, 1] as const }

const STEPS: Array<{ key: Step; label: string }> = [
  { key: "contact", label: "Datos" },
  { key: "method", label: "Método" },
  { key: "pay", label: "Pago" },
]

export function CheckoutPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const cart = useCartStore((s) => s.cart)
  const clearCart = useCartStore((s) => s.clearCart)

  const [step, setStep] = useState<Step>("contact")
  const [method, setMethod] = useState<Method>("TRANSFER")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<GuestCheckoutResponse | null>(null)

  const snapshot: CartSnapshot | null =
    cart && cart.eventId === eventId ? cart : null

  const totalStr = useMemo(
    () => (snapshot ? computeCartTotalString(snapshot) : "0.00"),
    [snapshot]
  )

  const contactValid =
    name.trim().length >= 2 && email.includes("@") && phone.trim().length >= 6

  const handleBack = () => {
    if (step === "contact") {
      navigate(`/e/${eventId}`)
      return
    }
    if (step === "method") {
      setStep("contact")
      return
    }
    navigate(`/e/${eventId}`)
  }

  const goToMethod = () => {
    if (!contactValid) return
    setErr(null)
    setStep("method")
  }

  const submitPurchase = async () => {
    if (!snapshot || submitting) return
    setErr(null)
    setSubmitting(true)
    try {
      const data = await publicApiFetch<GuestCheckoutResponse>("/public/checkout", {
        method: "POST",
        body: JSON.stringify({
          eventId: snapshot.eventId,
          paymentMethod: method,
          clientTotal: totalStr,
          contact: { name: name.trim(), email: email.trim(), phone: phone.trim() },
          ticketLines: snapshot.ticketLines.map((l) => ({
            ticketTypeId: l.ticketTypeId,
            quantity: l.quantity,
          })),
          drinkLines: snapshot.drinkLines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
          })),
        }),
      })

      const redirectUrl = (data as any).redirectUrl as string | undefined
      if (method === "MERCADOPAGO" && redirectUrl) {
        clearCart()
        window.location.href = redirectUrl
        return
      }

      setResult(data)
      clearCart()
      setStep("pay")
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No pudimos confirmar el pago.")
    } finally {
      setSubmitting(false)
    }
  }

  if (!snapshot && !result) return null

  return (
    <div className="relative min-h-dvh bg-black">
      <header className="sticky top-0 z-20 border-b border-white/[0.04] bg-black/70 px-5 pb-4 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl sm:px-8">
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
              {formatMoneyArsExact(totalStr)}
            </p>
          </div>
          <ProgressStepper step={step} />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-col px-6 pb-32 pt-16 sm:px-8">
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
                email={email}
                phone={phone}
                setName={setName}
                setEmail={setEmail}
                setPhone={setPhone}
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
                  amount={formatMoneyArsExact(totalStr)}
                  alias={
                    ((result as any)?.transfer?.alias as string | undefined) ??
                    "alias.pendiente"
                  }
                />
              ) : method === "CARD" ? (
                <PayCardView
                  amount={formatMoneyArsExact(totalStr)}
                  preferenceId={
                    ((result as any)?.card?.preferenceId as string | undefined) ?? null
                  }
                  publicKey={
                    ((result as any)?.card?.publicKey as string | undefined) ?? null
                  }
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
  email,
  phone,
  setName,
  setEmail,
  setPhone,
  canContinue,
  onContinue,
}: {
  name: string
  email: string
  phone: string
  setName: (v: string) => void
  setEmail: (v: string) => void
  setPhone: (v: string) => void
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
          Te avisamos por email cuando se acredite el pago.
        </p>
      </div>

      <div className="flex flex-col gap-10">
        <FloatingField
          id="co-name"
          label="Nombre"
          value={name}
          onChange={setName}
          autoComplete="name"
        />
        <FloatingField
          id="co-email"
          label="Email"
          value={email}
          onChange={setEmail}
          type="email"
          inputMode="email"
          autoComplete="email"
        />
        <FloatingField
          id="co-phone"
          label="Teléfono"
          value={phone}
          onChange={setPhone}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
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
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        autoComplete={autoComplete}
        className="mt-3 w-full border-0 border-b border-white/[0.12] bg-transparent px-0 py-3 text-xl font-medium text-white outline-none transition-colors placeholder:text-white/25 focus:border-white"
      />
    </div>
  )
}

function MethodStep({
  method,
  setMethod,
  onConfirm,
  submitting,
  error,
}: {
  method: Method
  setMethod: (m: Method) => void
  onConfirm: () => void
  submitting: boolean
  error: string | null
}) {
  const ctaLabel =
    method === "TRANSFER"
      ? "Generar transferencia"
      : method === "CARD"
        ? "Pagar con tarjeta"
        : "Ir a Mercado Pago"

  const CtaIcon = method === "MERCADOPAGO" ? ArrowUpRight : ArrowRight

  return (
    <div className="flex flex-col gap-14">
      <div className="space-y-3">
        <h1 className="text-3xl font-black leading-[1.05] tracking-tight text-white sm:text-[2.25rem]">
          ¿Cómo querés pagar?
        </h1>
      </div>

      <div className="flex flex-col gap-3" role="radiogroup" aria-label="Medio de pago">
        <MethodCard
          icon={<ArrowLeftRight className="size-5" strokeWidth={2} />}
          label="Transferencia"
          description="Pago verificado por alias."
          selected={method === "TRANSFER"}
          onSelect={() => setMethod("TRANSFER")}
        />
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
        Cuando acreditemos el pago te lo confirmamos por email.
      </p>
    </div>
  )
}

function PayCardView({
  amount,
  preferenceId,
  publicKey,
}: {
  amount: string
  preferenceId: string | null
  publicKey: string | null
}) {
  useEffect(() => {
    if (!preferenceId || !publicKey) return
    // Inyectar MP Bricks (cardPayment) acá.
    // const mp = new (window as any).MercadoPago(publicKey, { locale: "es-AR" })
    // mp.bricks().create("cardPayment", "mp-card-brick", {
    //   initialization: { amount: <number desde totalStr> },
    //   callbacks: { onSubmit: (cardFormData) => fetch(...) }
    // })
  }, [preferenceId, publicKey])

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
          {amount}
        </motion.p>
      </div>
      <div id="mp-card-brick" className="overflow-hidden rounded-2xl bg-white" />
      {!preferenceId || !publicKey ? (
        <p className="text-center text-xs text-white/40">
          Preparando el formulario seguro de Mercado Pago…
        </p>
      ) : null}
    </div>
  )
}