import { useEffect, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { ArrowLeft, ChevronDown } from "lucide-react"
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

type Step = "contact" | "payment_method" | "success"

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

export function CheckoutPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const cart = useCartStore((s) => s.cart)
  const clearCart = useCartStore((s) => s.clearCart)

  const [step, setStep] = useState<Step>("contact")
  const [err, setErr] = useState<string | null>(null)

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [paymentMethod, setPaymentMethod] =
    useState<CheckoutPaymentMethod>("TRANSFER")

  /** When true, skip "empty cart → back to event" guard (e.g. after checkout OK we clear cart before leaving). */
  const leavingCheckoutRef = useRef(false)


  useEffect(() => {
    leavingCheckoutRef.current = false
  }, [eventId])
  

  const snapshot: CartSnapshot | null =
    cart && cart.eventId === eventId ? cart : null

  const submitPurchase = async () => {
    if (!snapshot) return
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
      clearCart()
      setStep("success")
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al completar la compra")
    }
  }

  if (!snapshot) return null

  const paymentHint = contactPaymentHint(paymentMethod)

  return (
    <div className="relative min-h-dvh bg-black pb-28">
      <header className="sticky top-10 z-10 px-6 py-4 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-8">
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

        {step === "contact" && (
          <section className="rounded-2xl px-8 ">

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
                </div>
              </div>

              {err ? <p className="text-sm text-red-400">{err}</p> : null}

              <div className="flex flex-col gap-6 pt-4">
                <Button
                  className="h-12 w-full rounded-2xl bg-white text-base font-semibold text-black hover:bg-white/95"
                  disabled={
                    name.trim().length < 1 || !email.includes("@") || phone.trim().length < 1
                  }
                  onClick={() => setStep("payment_method")}
                >
                  Continuar
                </Button>
              </div>
            </div>
          </section>
        ) }


        {step === "payment_method" && (


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
          <Button
            className="h-12 w-full rounded-2xl bg-white text-base font-semibold text-black hover:bg-white/95"
            onClick={() => submitPurchase()}
          >
            Continuar
          </Button>
          </div>
      )}
    </div>
    </div>
  )
}
