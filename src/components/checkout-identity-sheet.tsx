import { useEffect, useState, type FormEvent } from "react"
import { useNavigate } from "react-router"
import { Dialog } from "radix-ui"
import { ArrowRight, ArrowUpRight, Loader2 } from "lucide-react"
import { isValidBuyerIdentity, useBuyerStore, type IdentityPayment } from "@/stores/buyer-store"

const FIELD_CLASS =
  "h-14 w-full rounded-2xl bg-white/[0.09] px-4 text-[17px] font-medium text-white caret-white outline-none transition-colors placeholder:text-white/50 focus:bg-white/[0.14] focus-visible:ring-2 focus-visible:ring-white/40"

/**
 * Distancia entre el borde de abajo de la pantalla y el teclado. En iOS el teclado no achica el
 * viewport de layout: sin esto, un drawer fijo abajo queda tapado justo donde está el botón.
 */
function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const viewport = window.visualViewport
    if (!active || !viewport) return
    const update = () =>
      setInset(Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop))
    update()
    viewport.addEventListener("resize", update)
    viewport.addEventListener("scroll", update)
    return () => {
      viewport.removeEventListener("resize", update)
      viewport.removeEventListener("scroll", update)
      setInset(0)
    }
  }, [active])
  return inset
}

/**
 * Drawer global de identidad para comprar sin cuenta: nombre y DNI, nada más. El botón hace lo que
 * pidió quien lo abrió: pagar directo (link de acceso) o seguir al checkout (tienda con entradas).
 */
export function CheckoutIdentitySheet() {
  const navigate = useNavigate()
  const open = useBuyerStore((state) => state.sheetOpen)
  const pendingPath = useBuyerStore((state) => state.pendingPath)
  const pendingPayment = useBuyerStore((state) => state.pendingPayment)
  const savedName = useBuyerStore((state) => state.name)
  const savedDni = useBuyerStore((state) => state.dni)
  const setIdentity = useBuyerStore((state) => state.setIdentity)
  const closeSheet = useBuyerStore((state) => state.closeSheet)
  const [busy, setBusy] = useState(false)
  const keyboardInset = useKeyboardInset(open)

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        // Con el pago en marcha no se cierra: la venta ya se está creando.
        if (!next && !busy) closeSheet()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-black/70 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          style={{ bottom: keyboardInset }}
          className="fixed inset-x-0 z-[120] rounded-t-3xl bg-black px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-1px_0_rgba(255,255,255,0.14)] outline-none transition-[bottom] duration-150 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <Dialog.Title className="sr-only">Tu nombre y DNI</Dialog.Title>
          <div className="mx-auto w-full max-w-lg">
            {open ? (
              <IdentityForm
                // Cada apertura parte de lo último usado: si ya compró antes, sólo confirma.
                initialName={savedName}
                initialDni={savedDni}
                payment={pendingPayment}
                onBusyChange={setBusy}
                onContinue={(identity) => {
                  setIdentity(identity)
                  const destination = pendingPath
                  closeSheet()
                  if (destination) navigate(destination)
                }}
                onPay={async (payment, identity) => {
                  setIdentity(identity)
                  await payment.pay(identity)
                }}
              />
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function IdentityForm({
  initialName,
  initialDni,
  payment,
  onBusyChange,
  onContinue,
  onPay,
}: {
  initialName: string
  initialDni: string
  payment: IdentityPayment | null
  onBusyChange: (busy: boolean) => void
  onContinue: (identity: { name: string; dni: string }) => void
  onPay: (payment: IdentityPayment, identity: { name: string; dni: string }) => Promise<void>
}) {
  const [name, setName] = useState(initialName)
  const [dni, setDni] = useState(initialDni)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = isValidBuyerIdentity(name, dni)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!valid || submitting) return
    if (!payment) {
      onContinue({ name, dni })
      return
    }
    setError(null)
    setSubmitting(true)
    onBusyChange(true)
    try {
      await onPay(payment, { name, dni })
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir Mercado Pago. Probá de nuevo.")
    } finally {
      setSubmitting(false)
      onBusyChange(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-2">
      <input
        type="text"
        aria-label="Nombre y apellido"
        autoComplete="name"
        autoCapitalize="words"
        enterKeyHint="next"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Nombre y apellido"
        autoFocus={!name}
        className={FIELD_CLASS}
      />
      <input
        type="text"
        aria-label="DNI"
        inputMode="numeric"
        autoComplete="off"
        enterKeyHint="go"
        maxLength={9}
        value={dni}
        onChange={(event) => setDni(event.target.value.replace(/\D/g, "").slice(0, 9))}
        placeholder="DNI"
        autoFocus={Boolean(name) && !dni}
        className={`${FIELD_CLASS} tabular-nums`}
      />
      {error ? (
        <p role="alert" className="px-1 pt-1 text-sm leading-snug text-red-300">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={!valid || submitting}
        className="mt-2 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-[17px] font-bold text-black outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black active:bg-zinc-200 disabled:bg-white/[0.14] disabled:text-white/45"
      >
        {submitting ? (
          <Loader2 className="size-5 animate-spin" aria-label="Abriendo Mercado Pago" />
        ) : payment ? (
          <>
            {payment.label}
            <ArrowUpRight className="size-5" aria-hidden />
          </>
        ) : (
          <>
            Continuar
            <ArrowRight className="size-5" aria-hidden />
          </>
        )}
      </button>
    </form>
  )
}
