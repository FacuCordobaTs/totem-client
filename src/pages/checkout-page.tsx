import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { ArrowLeft } from "lucide-react"
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

type Step = "review" | "contact" | "done"

const paymentOptions = [
  { value: "CARD" as const, label: "Tarjeta" },
  { value: "MERCADOPAGO" as const, label: "Mercado Pago" },
  { value: "TRANSFER" as const, label: "Transferencia" },
  { value: "CASH" as const, label: "Efectivo (acuerdo previo)" },
]

export function CheckoutPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const cart = useCartStore((s) => s.cart)
  const clearCart = useCartStore((s) => s.clearCart)

  const [step, setStep] = useState<Step>("review")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [receiptToken, setReceiptToken] = useState<string | null>(null)

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [paymentMethod, setPaymentMethod] =
    useState<(typeof paymentOptions)[number]["value"]>("CARD")

  const clientTotal = useMemo(
    () => (cart ? computeCartTotalString(cart) : "0.00"),
    [cart]
  )

  useEffect(() => {
    if (!eventId) return
    if (!cart || cart.eventId !== eventId) {
      navigate(`/e/${eventId}`, { replace: true })
    }
  }, [eventId, cart, navigate])

  if (!eventId || !cart || cart.eventId !== eventId) return null

  const snapshot: CartSnapshot = cart

  const submitPurchase = async () => {
    setBusy(true)
    setErr(null)
    try {
      const data = await publicApiFetch<GuestCheckoutResponse>("/public/checkout", {
        method: "POST",
        body: JSON.stringify({
          eventId: snapshot.eventId,
          paymentMethod,
          clientTotal,
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
      clearCart()
      setReceiptToken(data.receiptToken)
      setStep("done")
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al completar la compra")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[#09090b] px-5 pb-16 pt-10 text-zinc-50">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-10">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-none text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
            asChild
          >
            <Link to={`/e/${eventId}`} aria-label="Volver">
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">
            Checkout
          </span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-white">
          {step === "done" ? "Compra confirmada" : "Finalizar compra"}
        </h1>

        {step === "review" ? (
          <section className="space-y-6 border border-white/10 bg-zinc-950/50 p-6">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
              Resumen
            </h2>
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-xs text-zinc-500">Evento</p>
                <p className="mt-1 font-medium text-zinc-100">{snapshot.eventName}</p>
              </div>
              <div className="border-t border-white/10 pt-4">
                <p className="text-xs text-zinc-500">Productora</p>
                <p className="mt-1 text-zinc-300">{snapshot.productoraName}</p>
              </div>
              <div className="border-t border-white/10 pt-4">
                <p className="text-xs text-zinc-500">Entradas</p>
                <p className="mt-1 text-zinc-200">
                  {snapshot.ticketLines.length === 0
                    ? "—"
                    : snapshot.ticketLines
                        .map((l) => `${l.quantity} × entrada`)
                        .join(", ")}
                </p>
              </div>
              <div className="border-t border-white/10 pt-4">
                <p className="text-xs text-zinc-500">Consumos</p>
                <p className="mt-1 text-zinc-200">
                  {snapshot.drinkLines.length === 0
                    ? "—"
                    : snapshot.drinkLines
                        .filter((d) => d.quantity > 0)
                        .map((d) => `${d.quantity} ítem`)
                        .join(", ")}
                </p>
              </div>
              <div className="border-t border-white/10 pt-4">
                <p className="text-xs text-zinc-500">Total</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-white">
                  {formatMoneyArsExact(clientTotal)}
                </p>
              </div>
            </div>
            <Button
              className="h-11 w-full rounded-none border border-white/20 bg-white text-[#09090b] hover:bg-zinc-200"
              onClick={() => setStep("contact")}
            >
              Continuar
            </Button>
          </section>
        ) : null}

        {step === "contact" ? (
          <section className="space-y-8 border border-white/10 bg-zinc-950/50 p-6">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
              Contacto y pago
            </h2>
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="co-name" className="text-zinc-300">
                  Nombre
                </Label>
                <Input
                  id="co-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-none border-white/15 bg-[#09090b] text-zinc-100 placeholder:text-zinc-600"
                  autoComplete="name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="co-email" className="text-zinc-300">
                  Email
                </Label>
                <Input
                  id="co-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-none border-white/15 bg-[#09090b] text-zinc-100 placeholder:text-zinc-600"
                  autoComplete="email"
                />
                <p className="text-xs text-zinc-500">¿A dónde enviamos tus entradas?</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="co-phone" className="text-zinc-300">
                  Teléfono
                </Label>
                <Input
                  id="co-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="rounded-none border-white/15 bg-[#09090b] text-zinc-100 placeholder:text-zinc-600"
                  autoComplete="tel"
                />
                <p className="text-xs text-zinc-500">
                  ¿A dónde enviamos los códigos de consumos en barra?
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                Medio de pago
              </p>
              <div className="grid gap-2">
                {paymentOptions.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-center gap-3 border px-4 py-3 text-sm ${
                      paymentMethod === opt.value
                        ? "border-white/40 bg-white/[0.06]"
                        : "border-white/10 hover:border-white/20"
                    }`}
                  >
                    <input
                      type="radio"
                      name="pay"
                      className="accent-white"
                      checked={paymentMethod === opt.value}
                      onChange={() => setPaymentMethod(opt.value)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            {err ? <p className="text-sm text-red-400">{err}</p> : null}

            <div className="flex flex-col gap-3">
              <Button
                className="h-11 w-full rounded-none border border-white/20 bg-white text-[#09090b] hover:bg-zinc-200"
                disabled={
                  busy || name.trim().length < 1 || !email.includes("@") || phone.trim().length < 1
                }
                onClick={() => void submitPurchase()}
              >
                {busy ? "Procesando…" : `Pagar ${formatMoneyArsExact(clientTotal)}`}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="rounded-none text-zinc-500 hover:bg-white/5"
                disabled={busy}
                onClick={() => setStep("review")}
              >
                Volver al resumen
              </Button>
            </div>
          </section>
        ) : null}

        {step === "done" && receiptToken ? (
          <section className="space-y-6 border border-white/10 bg-zinc-950/50 p-6">
            <p className="text-sm leading-relaxed text-zinc-300">
              Guardá este enlace: es tu comprobante y acceso a los códigos QR de esta compra.
            </p>
            <Button
              className="h-11 w-full rounded-none border border-white/20 bg-white text-[#09090b] hover:bg-zinc-200"
              asChild
            >
              <Link to={`/receipt/${receiptToken}`}>Ver mi comprobante</Link>
            </Button>
          </section>
        ) : null}
      </div>
    </div>
  )
}
