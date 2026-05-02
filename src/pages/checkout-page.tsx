import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { ArrowLeft, CheckCircle2, ChevronDown, Loader2 } from "lucide-react"
import Decimal from "decimal.js"
import { publicApiFetch } from "@/lib/api"
import type { GuestCheckoutResponse } from "@/types/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  computeCartTotalString,
  useCartStore,
  type CartSnapshot,
} from "@/stores/cart-store"
import { formatMoneyArsExact } from "@/lib/format"

type Step = "review" | "contact" | "success"

const paymentOptions = [
  { value: "TRANSFER" as const, label: "Transferencia" },
  { value: "CARD" as const, label: "Tarjeta de crédito/débito" },
  { value: "MERCADOPAGO" as const, label: "Mercado Pago" },
] as const

type CheckoutPaymentMethod = (typeof paymentOptions)[number]["value"]

function contactPaymentHint(method: CheckoutPaymentMethod): string {
  switch (method) {
    case "TRANSFER":
      return "Vas a recibir un alias o CVU en el comprobante. Transferí el importe exacto; cuando se acredite el pago, habilitamos tus códigos QR y te avisamos por email."
    case "CARD":
      return "Pagarás con tarjeta de forma segura en el comprobante: completá el formulario de Mercado Pago (Bricks) y, al acreditarse, se habilitan los QR en esa misma pantalla."
    case "MERCADOPAGO":
      return "Serás redirigido a Mercado Pago (Checkout Pro) para completar el pago. Al volver a Totem, verificamos el pago y habilitamos tus códigos automáticamente."
    default:
      return ""
  }
}

function orderSummaryLine(snapshot: CartSnapshot): string {
  const tickets = snapshot.ticketLines.reduce((a, l) => a + l.quantity, 0)
  const drinks = snapshot.drinkLines.reduce((a, l) => a + l.quantity, 0)
  const parts: string[] = []
  if (tickets > 0) parts.push(`${tickets} ${tickets === 1 ? "entrada" : "entradas"}`)
  if (drinks > 0) parts.push(`${drinks} ${drinks === 1 ? "consumo" : "consumos"}`)
  return parts.length ? parts.join(" · ") : "Sin ítems"
}

function CartBreakdownDetails({ snapshot }: { snapshot: CartSnapshot }) {
  const rows: { key: string; label: string; amount: string }[] = []
  for (const l of snapshot.ticketLines) {
    if (l.quantity <= 0) continue
    const total = new Decimal(l.unitPrice).mul(l.quantity).toFixed(2)
    rows.push({
      key: `t-${l.ticketTypeId}`,
      label: `${l.quantity} × entrada`,
      amount: formatMoneyArsExact(total),
    })
  }
  for (const l of snapshot.drinkLines) {
    if (l.quantity <= 0) continue
    const total = new Decimal(l.unitPrice).mul(l.quantity).toFixed(2)
    rows.push({
      key: `d-${l.productId}`,
      label: `${l.quantity} × consumo`,
      amount: formatMoneyArsExact(total),
    })
  }
  if (rows.length <= 1) return null
  return (
    <details className="group rounded-xl border border-white/10 bg-white/[0.03] [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-[#8E8E93] outline-none marker:content-none [&::-webkit-details-marker]:hidden">
        Ver importes por ítem
        <ChevronDown
          className="size-4 shrink-0 text-white/45 transition-transform duration-200 group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <ul className="space-y-3 border-t border-white/10 px-4 py-4">
        {rows.map((r) => (
          <li
            key={r.key}
            className="ml-4 flex items-center justify-between gap-4 border-l border-white/15 pl-4 text-sm"
          >
            <span className="text-[#8E8E93]">{r.label}</span>
            <span className="tabular-nums font-medium text-white">{r.amount}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}

type PurchaseSummary = {
  receiptToken: string
  eventName: string
  productoraName: string
  total: string
}

const RECEIPT_REDIRECT_MS = 2400

export function CheckoutPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const cart = useCartStore((s) => s.cart)
  const clearCart = useCartStore((s) => s.clearCart)

  const [step, setStep] = useState<Step>("review")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [purchaseSummary, setPurchaseSummary] = useState<PurchaseSummary | null>(null)

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [paymentMethod, setPaymentMethod] =
    useState<CheckoutPaymentMethod>("TRANSFER")

  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** When true, skip "empty cart → back to event" guard (e.g. after checkout OK we clear cart before leaving). */
  const leavingCheckoutRef = useRef(false)

  const clientTotal = useMemo(
    () => (cart ? computeCartTotalString(cart) : "0.00"),
    [cart]
  )

  const goToReceipt = useCallback(
    (summary: PurchaseSummary) => {
      if (redirectTimerRef.current != null) {
        clearTimeout(redirectTimerRef.current)
        redirectTimerRef.current = null
      }
      navigate(`/receipt/${summary.receiptToken}`, {
        replace: true,
        state: { fromCheckout: true },
      })
    },
    [navigate]
  )

  useEffect(() => {
    leavingCheckoutRef.current = false
  }, [eventId])

  useEffect(() => {
    if (!eventId) return
    if (purchaseSummary) return
    if (leavingCheckoutRef.current) return
    if (!cart || cart.eventId !== eventId) {
      navigate(`/e/${eventId}`, { replace: true })
    }
  }, [eventId, cart, navigate, purchaseSummary])

  useEffect(() => {
    if (step !== "success" || !purchaseSummary) return
    redirectTimerRef.current = setTimeout(() => {
      goToReceipt(purchaseSummary)
      redirectTimerRef.current = null
    }, RECEIPT_REDIRECT_MS)
    return () => {
      if (redirectTimerRef.current != null) {
        clearTimeout(redirectTimerRef.current)
        redirectTimerRef.current = null
      }
    }
  }, [step, purchaseSummary, goToReceipt])

  if (!eventId) return null
  if (!purchaseSummary && (!cart || cart.eventId !== eventId)) return null

  const snapshot: CartSnapshot | null =
    cart && cart.eventId === eventId ? cart : null

  const submitPurchase = async () => {
    if (!snapshot) return
    setBusy(true)
    setErr(null)
    try {
      const totalStr = computeCartTotalString(snapshot)
      const data = await publicApiFetch<GuestCheckoutResponse>("/public/checkout", {
        method: "POST",
        body: JSON.stringify({
          eventId: snapshot.eventId,
          paymentMethod,
          clientTotal: totalStr,
          contact: {
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim(),
          },
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

      if (data.payOnReceipt && data.receiptToken) {
        leavingCheckoutRef.current = true
        navigate(`/receipt/${data.receiptToken}`, {
          replace: true,
          state: { fromCheckout: true },
        })
        clearCart()
        return
      }

      setPurchaseSummary({
        receiptToken: data.receiptToken,
        eventName: snapshot.eventName,
        productoraName: snapshot.productoraName,
        total: totalStr,
      })
      clearCart()
      setStep("success")
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al completar la compra")
    } finally {
      setBusy(false)
    }
  }

  if (step === "success" && purchaseSummary) {
    return (
      <div className="relative min-h-dvh bg-black pb-16 pt-[max(2rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-12 px-6 sm:px-8">
          <div className="flex flex-col items-center gap-10 pt-10 text-center">
            <div className="flex size-[4.5rem] items-center justify-center rounded-full border border-white/15 bg-white/[0.05] backdrop-blur-xl">
              <CheckCircle2 className="size-9 text-white" aria-hidden />
            </div>
            <div className="space-y-4">
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Pedido registrado
              </h1>
              <p className="mx-auto max-w-sm text-sm leading-relaxed text-[#8E8E93]">
                Abrí el comprobante para ver cómo pagar. Cuando se acredite, tus códigos quedan
                habilitados.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#1C1C1E]/95 px-8 py-10 backdrop-blur-xl">
            <p className="text-xl font-bold tracking-tight text-white">{purchaseSummary.eventName}</p>
            <p className="mt-2 text-sm text-[#8E8E93]">{purchaseSummary.productoraName}</p>
            <div className="mt-10 border-b border-zinc-800/50 pb-8">
              <p className="ml-4 border-l border-white/15 pl-4 text-sm text-[#8E8E93]">Total</p>
              <p className="mt-2 ml-4 border-l border-white/15 pl-4 text-2xl font-bold tabular-nums tracking-tight text-white">
                {formatMoneyArsExact(purchaseSummary.total)}
              </p>
            </div>
            <div className="mt-10 flex flex-col items-center gap-8">
              <p className="flex items-center gap-2 text-xs text-[#8E8E93]">
                <Loader2 className="size-3.5 animate-spin opacity-70" aria-hidden />
                Abriendo comprobante…
              </p>
              <Button
                type="button"
                className="h-12 w-full rounded-2xl bg-white text-base font-semibold text-black hover:bg-white/95"
                onClick={() => goToReceipt(purchaseSummary)}
              >
                Ver comprobante
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!snapshot) return null

  const paymentHint = contactPaymentHint(paymentMethod)

  return (
    <div className="relative min-h-dvh bg-black pb-28">
      <header className="sticky top-0 z-10 border-b border-white/5 bg-black/70 px-6 py-4 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl sm:px-8">
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-xl text-[#8E8E93] hover:bg-white/[0.06] hover:text-white"
          asChild
        >
          <Link to={`/e/${eventId}`} aria-label="Volver">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
      </header>

      <div className="mx-auto flex w-full max-w-lg flex-col gap-12 px-6 pb-16 pt-10 sm:px-8">
        <div className="space-y-3">
          <h1 className="text-2xl font-bold tracking-tight text-white">Pago</h1>
          <p className="text-sm text-[#8E8E93]">
            {step === "review" ? "Revisá tu pedido antes de continuar." : "Datos de contacto y medio de pago."}
          </p>
        </div>

        {step === "review" ? (
          <section className="rounded-2xl border border-white/10 bg-[#1C1C1E]/95 px-8 py-10 backdrop-blur-xl">
            <h2 className="text-2xl font-bold tracking-tight text-white">Resumen</h2>
            <div className="mt-10 space-y-10">
              <div className="space-y-2">
                <p className="text-xl font-bold tracking-tight text-white">{snapshot.eventName}</p>
                <p className="text-sm text-[#8E8E93]">{snapshot.productoraName}</p>
              </div>

              <div className="border-b border-zinc-800/50 pb-8">
                <p className="ml-4 border-l border-white/15 pl-4 text-sm font-medium text-white">
                  {orderSummaryLine(snapshot)}
                </p>
                <p className="mt-6 ml-4 border-l border-white/15 pl-4 text-sm text-[#8E8E93]">
                  Total estimado
                </p>
                <p className="mt-2 ml-4 border-l border-white/15 pl-4 text-2xl font-bold tabular-nums tracking-tight text-white">
                  {formatMoneyArsExact(clientTotal)}
                </p>
              </div>

              <CartBreakdownDetails snapshot={snapshot} />

              <Button
                className="mt-2 h-12 w-full rounded-2xl bg-white text-base font-semibold text-black hover:bg-white/95"
                onClick={() => setStep("contact")}
              >
                Continuar
              </Button>
            </div>
          </section>
        ) : null}

        {step === "contact" ? (
          <section className="rounded-2xl border border-white/10 bg-[#1C1C1E]/95 px-8 py-10 backdrop-blur-xl">
            <h2 className="text-2xl font-bold tracking-tight text-white">Tus datos</h2>

            <div className="mt-10 space-y-10">
              <div className="space-y-8">
                <div className="space-y-2">
                  <Label htmlFor="co-name" className="text-sm text-[#8E8E93]">
                    Nombre
                  </Label>
                  <Input
                    id="co-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-12 rounded-xl border-zinc-700/60 bg-black/40 text-white placeholder:text-zinc-600"
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="co-email" className="text-sm text-[#8E8E93]">
                    Email
                  </Label>
                  <Input
                    id="co-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 rounded-xl border-zinc-700/60 bg-black/40 text-white placeholder:text-zinc-600"
                    autoComplete="email"
                  />
                  <p className="text-sm text-[#8E8E93]">
                    Te enviamos la confirmación cuando el pago quede acreditado.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="co-phone" className="text-sm text-[#8E8E93]">
                    Teléfono
                  </Label>
                  <Input
                    id="co-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="h-12 rounded-xl border-zinc-700/60 bg-black/40 text-white placeholder:text-zinc-600"
                    autoComplete="tel"
                  />
                  <details className="group rounded-xl border border-white/10 bg-white/[0.03] [&_summary::-webkit-details-marker]:hidden">
                    <summary className="cursor-pointer list-none px-4 py-2.5 text-sm text-[#8E8E93] outline-none marker:content-none [&::-webkit-details-marker]:hidden">
                      ¿Para qué lo pedimos?
                    </summary>
                    <p className="border-t border-white/10 px-4 py-3 text-sm leading-relaxed text-[#8E8E93]">
                      Solo para avisos breves sobre tu pedido o consumos en barra.
                    </p>
                  </details>
                </div>
              </div>

              <div className="space-y-6 border-t border-zinc-800/50 pt-10">
                <p className="text-sm font-medium text-white">Medio de pago</p>
                <div className="flex flex-col gap-4" role="radiogroup" aria-label="Medio de pago">
                  {paymentOptions.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex cursor-pointer items-center gap-4 rounded-xl border px-5 py-4 text-sm transition-colors ${
                        paymentMethod === opt.value
                          ? "border-white/25 bg-white/[0.08] text-white"
                          : "border-white/10 bg-white/[0.03] text-[#8E8E93] hover:border-white/15 hover:bg-white/[0.05]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="pay"
                        className="accent-white"
                        checked={paymentMethod === opt.value}
                        onChange={() => setPaymentMethod(opt.value)}
                        aria-label={opt.label}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
                <details className="group rounded-xl border border-white/10 bg-white/[0.03] [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-[#8E8E93] outline-none marker:content-none [&::-webkit-details-marker]:hidden">
                    Cómo funciona este medio
                    <ChevronDown
                      className="size-4 shrink-0 text-white/45 transition-transform duration-200 group-open:rotate-180"
                      aria-hidden
                    />
                  </summary>
                  <p className="border-t border-white/10 px-4 py-4 text-sm leading-relaxed text-[#8E8E93]">
                    {paymentHint}
                  </p>
                </details>
              </div>

              {err ? <p className="text-sm text-red-400">{err}</p> : null}

              <div className="flex flex-col gap-6 pt-4">
                <Button
                  className="h-12 w-full rounded-2xl bg-white text-base font-semibold text-black hover:bg-white/95"
                  disabled={
                    busy || name.trim().length < 1 || !email.includes("@") || phone.trim().length < 1
                  }
                  onClick={() => void submitPurchase()}
                >
                  {busy ? "Procesando…" : `Continuar · ${formatMoneyArsExact(clientTotal)}`}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 rounded-xl text-[#8E8E93] hover:bg-white/[0.06] hover:text-white"
                  disabled={busy}
                  onClick={() => setStep("review")}
                >
                  Volver al resumen
                </Button>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
