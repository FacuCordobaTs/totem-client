import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react"
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
  { value: "CARD" as const, label: "Tarjeta" },
  { value: "MERCADOPAGO" as const, label: "Mercado Pago" },
  { value: "TRANSFER" as const, label: "Transferencia" },
  { value: "CASH" as const, label: "Efectivo" },
]

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
    useState<(typeof paymentOptions)[number]["value"]>("MERCADOPAGO")

  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    if (!eventId) return
    if (purchaseSummary) return
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

      if (data.mercadoPago && data.initPoint) {
        clearCart()
        window.location.assign(data.initPoint)
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
      <div className="flex min-h-dvh flex-col px-6 pb-20 pt-14 sm:px-8 sm:pt-16">
        <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-10 text-center">
          <div className="flex size-20 items-center justify-center rounded-full bg-white/10">
            <CheckCircle2 className="size-10 text-white" aria-hidden />
          </div>
          <div className="space-y-3">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Compra exitosa
            </h1>
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-[#8E8E93]">
              Ya podés ver tus códigos en el comprobante.
            </p>
          </div>
          <div className="w-full space-y-4 rounded-2xl bg-[#1C1C1E] p-6 text-left">
            <p className="text-sm font-medium text-white">{purchaseSummary.eventName}</p>
            <p className="text-sm text-[#8E8E93]">{purchaseSummary.productoraName}</p>
            <div className="border-t border-zinc-800/50 pt-4 ml-4">
              <p className="text-sm text-[#8E8E93]">Total</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-white">
                {formatMoneyArsExact(purchaseSummary.total)}
              </p>
            </div>
          </div>
          <div className="flex w-full flex-col items-center gap-6">
            <p className="flex items-center gap-2 text-sm text-[#8E8E93]">
              <Loader2 className="size-4 animate-spin opacity-70" aria-hidden />
              Abriendo comprobante…
            </p>
            <Button
              type="button"
              className="h-12 w-full rounded-xl bg-white text-base font-semibold text-black hover:bg-zinc-200"
              onClick={() => goToReceipt(purchaseSummary)}
            >
              Ver comprobante
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!snapshot) return null

  return (
    <div className="flex min-h-dvh flex-col px-6 pb-24 pt-10 sm:px-8">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-8">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" className="rounded-xl text-[#8E8E93] hover:bg-white/5 hover:text-white" asChild>
            <Link to={`/e/${eventId}`} aria-label="Volver">
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-white">Pago</h1>

        {step === "review" ? (
          <section className="space-y-6 rounded-2xl bg-transparent p-6 sm:p-8">
            <h2 className="text-2xl font-bold tracking-tight text-white">Resumen</h2>
            <div className="space-y-0 text-sm">
              <div className="py-4">
                <p className="text-sm text-[#8E8E93]">Evento</p>
                <p className="mt-1 font-medium text-white">{snapshot.eventName}</p>
              </div>
              <div className="flex flex-col">
                <div className="ml-4 h-px shrink-0 bg-zinc-800/50" aria-hidden />
                <div className="py-4">
                  <p className="text-sm text-[#8E8E93]">Organiza</p>
                  <p className="mt-1 text-white/90">{snapshot.productoraName}</p>
                </div>
              </div>
              <div className="flex flex-col">
                <div className="ml-4 h-px shrink-0 bg-zinc-800/50" aria-hidden />
                <div className="py-4">
                  <p className="text-sm text-[#8E8E93]">Entradas</p>
                  <p className="mt-1 text-white/90">
                    {snapshot.ticketLines.length === 0
                      ? "—"
                      : snapshot.ticketLines.map((l) => `${l.quantity} × entrada`).join(", ")}
                  </p>
                </div>
              </div>
              <div className="flex flex-col">
                <div className="ml-4 h-px shrink-0 bg-zinc-800/50" aria-hidden />
                <div className="py-4">
                  <p className="text-sm text-[#8E8E93]">Consumos</p>
                  <p className="mt-1 text-white/90">
                    {snapshot.drinkLines.length === 0
                      ? "—"
                      : snapshot.drinkLines
                          .filter((d) => d.quantity > 0)
                          .map((d) => `${d.quantity} ítem`)
                          .join(", ")}
                  </p>
                </div>
              </div>
              <div className="flex flex-col">
                <div className="ml-4 h-px shrink-0 bg-zinc-800/50" aria-hidden />
                <div className="py-4">
                  <p className="text-sm text-[#8E8E93]">Total</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-white">
                    {formatMoneyArsExact(clientTotal)}
                  </p>
                </div>
              </div>
            </div>
            <Button
              className="h-12 w-full rounded-xl bg-white text-base font-semibold text-black hover:bg-zinc-200"
              onClick={() => setStep("contact")}
            >
              Continuar
            </Button>
          </section>
        ) : null}

        {step === "contact" ? (
          <section className="space-y-8 rounded-2xl bg-transparent p-6 sm:p-8">
            <h2 className="text-2xl font-bold tracking-tight text-white">Tus datos</h2>
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="co-name" className="text-sm text-[#8E8E93]">
                  Nombre
                </Label>
                <Input
                  id="co-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-11 rounded-xl border-zinc-700/80 bg-black/30 text-white placeholder:text-zinc-600"
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
                  className="h-11 rounded-xl border-zinc-700/80 bg-black/30 text-white placeholder:text-zinc-600"
                  autoComplete="email"
                />
                <p className="text-sm text-[#8E8E93]">Para enviarte las entradas.</p>
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
                  className="h-11 rounded-xl border-zinc-700/80 bg-black/30 text-white placeholder:text-zinc-600"
                  autoComplete="tel"
                />
                <p className="text-sm text-[#8E8E93]">Para avisos de consumos en barra.</p>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-[#8E8E93]">Medio de pago</p>
              {paymentMethod === "MERCADOPAGO" ? (
                <p className="text-sm leading-relaxed text-[#8E8E93]">
                  Serás redirigido a Mercado Pago para pagar con tarjeta, dinero en cuenta u otros
                  medios disponibles.
                </p>
              ) : null}
              <div className="flex flex-col gap-2">
                {paymentOptions.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3 text-sm ${
                      paymentMethod === opt.value
                        ? "bg-white/10 text-white"
                        : "text-[#8E8E93] hover:bg-white/5"
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

            <div className="flex flex-col gap-3 pt-2">
              <Button
                className="h-12 w-full rounded-xl bg-white text-base font-semibold text-black hover:bg-zinc-200"
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
                className="h-11 rounded-xl text-[#8E8E93] hover:bg-white/5 hover:text-white"
                disabled={busy}
                onClick={() => setStep("review")}
              >
                Volver
              </Button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
