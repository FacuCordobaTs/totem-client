import { useEffect, useState, type FormEvent } from "react"
import { useNavigate, useParams } from "react-router"
import { ArrowRight, CalendarDays, Check, Loader2, MapPin, Ticket } from "lucide-react"
import { AppleSheet } from "@/components/apple-sheet"
import { Button } from "@/components/ui/button"
import { ApiError, publicApiFetch } from "@/lib/api"
import { formatEventDate } from "@/lib/format"
import { useSessionStore } from "@/stores/session-store"
import type {
  EventAccessReason,
  EventAccessRequestResponse,
  EventAccessResponse,
  EventAccessVerifyResponse,
} from "@/types/api"

/**
 * Acceso del cliente por evento (`crow.ar/{slug}/acceso`): el flyer y un botón para entrar con DNI
 * o celular. El código llega por WhatsApp y, al verificarlo, el cliente cae en el mismo perfil que
 * abre el link del mail — pero con la sesión guardada, así puede volver sin buscar nada.
 *
 * El paso `details` cubre los dos motivos por los que el backend pide un dato más antes de mandar
 * el código: `NEEDS_PHONE` (ficha sin celular) y `NEEDS_REGISTRATION` (alta rápida, que además
 * necesita el nombre).
 */
type Step = "identify" | "details" | "code"

const JSON_HEADERS = { "Content-Type": "application/json" }
const RESEND_COOLDOWN_S = 60

/**
 * A dónde va el cliente recién verificado: a la pantalla del comprobante, que es la misma para las
 * dos credenciales. Si ya compró, el link del mail; si no, el evento de su cuenta, que sirve el
 * mismo diseño con los tres tabs (entradas, consumos y saldo) en cero.
 */
function eventDestination(token: string, eventId: string, receiptToken: string | null): string {
  if (receiptToken) return `/receipt/${encodeURIComponent(receiptToken)}`
  return `/mi-cuenta/${encodeURIComponent(token)}/evento/${encodeURIComponent(eventId)}`
}

export function EventAccessPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const token = useSessionStore((state) => state.token)
  const customerName = useSessionStore((state) => state.customerName)
  const setSession = useSessionStore((state) => state.setSession)
  const clearSession = useSessionStore((state) => state.clearSession)

  const [data, setData] = useState<EventAccessResponse | null>(null)
  const [loadError, setLoadError] = useState<{ status: number; message: string } | null>(null)

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("identify")
  const [value, setValue] = useState("")
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [needsName, setNeedsName] = useState(false)
  const [challenge, setChallenge] = useState("")
  const [to, setTo] = useState("")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    publicApiFetch<EventAccessResponse>(`/public/events/${encodeURIComponent(slug)}/access`)
      .then((response) => {
        if (!cancelled) setData(response)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setLoadError(
          e instanceof ApiError
            ? { status: e.status, message: e.message }
            : { status: 0, message: "No pudimos conectarnos con el servidor." }
        )
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  const closeDrawer = () => {
    setOpen(false)
    setStep("identify")
    setValue("")
    setName("")
    setPhone("")
    setCode("")
    setChallenge("")
    setTo("")
    setError(null)
    setNeedsName(false)
    setCooldown(0)
  }

  /**
   * Pide el código. Los campos siguen cargados después de enviar, así que el reenvío reusa lo
   * mismo que se mandó la última vez (el celular y el nombre sólo existen en el paso `details`).
   */
  const request = async () => {
    if (!slug || busy) return
    setBusy(true)
    setError(null)
    try {
      const response = await publicApiFetch<EventAccessRequestResponse>(
        `/public/events/${encodeURIComponent(slug)}/access/request`,
        {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({
            value: value.trim(),
            ...(phone.trim() ? { phone: phone.trim() } : {}),
            ...(name.trim() ? { name: name.trim() } : {}),
          }),
        }
      )
      setChallenge(response.challenge)
      setTo(response.to)
      setCode("")
      setStep("code")
      setCooldown(RESEND_COOLDOWN_S)
    } catch (e) {
      const reason = e instanceof ApiError ? (e.body?.reason as EventAccessReason | undefined) : undefined
      if (reason === "NEEDS_PHONE" || reason === "NEEDS_REGISTRATION") {
        // No es un error: falta un dato y lo pedimos en el mismo drawer.
        setNeedsName(reason === "NEEDS_REGISTRATION")
        setStep("details")
      } else {
        setError(
          e instanceof ApiError ? e.message : "No pudimos enviarte el código. Intentá de nuevo."
        )
      }
    } finally {
      setBusy(false)
    }
  }

  const submitCode = async (event: FormEvent) => {
    event.preventDefault()
    if (!slug || busy || code.length < 6) return
    setBusy(true)
    setError(null)
    try {
      const response = await publicApiFetch<EventAccessVerifyResponse>(
        `/public/events/${encodeURIComponent(slug)}/access/verify`,
        {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ challenge, code }),
        }
      )
      setSession({ token: response.token, customerName: response.name })
      closeDrawer()
      // Directo al evento por el que se entró: al comprobante si ya compró (ahí están los retiros
      // y la compra de consumos), o a la vista del evento si todavía no tiene nada.
      navigate(eventDestination(response.token, response.eventId, response.receiptToken))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No pudimos verificar el código.")
    } finally {
      setBusy(false)
    }
  }

  const drawerTitle =
    step === "code" ? "Ingresá el código" : needsName && step === "details" ? "Tus datos" : "Ingresar"
  const drawerDescription =
    step === "code"
      ? `Te enviamos un código por WhatsApp al ${to}.`
      : step === "details"
        ? needsName
          ? "No encontramos tus datos. Completalos y te enviamos el código."
          : "Tu cuenta no tiene un celular asociado. Ingresá el tuyo y te enviamos el código."
        : "Entrá con tu DNI o tu celular para ver tus entradas, consumos y saldo."

  const sheet = (
    <AppleSheet open={open} onOpenChange={(next) => (next ? setOpen(true) : closeDrawer())} title={drawerTitle} description={drawerDescription}>
      {step === "identify" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void request()
          }}
        >
          <label htmlFor="access-identifier" className="block text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">
            DNI o celular
          </label>
          <input
            id="access-identifier"
            type="text"
            inputMode="numeric"
            autoComplete="tel"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="30123456"
            autoFocus
            className="mt-3 w-full border-0 border-b border-white/[0.12] bg-transparent px-0 py-3 text-2xl font-bold tabular-nums text-white outline-none transition-colors placeholder:text-white/25 focus:border-white"
          />
          <p className="mt-3 text-[11px] leading-relaxed text-white/35">
            Si ingresás tu documento, el código va al celular que tenemos asociado a tu cuenta.
          </p>
          {data && !data.whatsappEnabled ? (
            <p className="mt-2 text-[11px] leading-relaxed text-amber-300/80">
              Este evento todavía no tiene WhatsApp configurado. Si no te llega el código, podés cargar saldo en la caja.
            </p>
          ) : null}
          {error ? <p className="mt-3 text-xs leading-relaxed text-red-300/80">{error}</p> : null}
          <Button
            type="submit"
            disabled={busy || value.trim().length < 6}
            className="mt-6 h-14 w-full rounded-2xl bg-white font-semibold text-black"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <>Enviar código <ArrowRight className="size-4" aria-hidden /></>}
          </Button>
        </form>
      ) : null}

      {step === "details" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void request()
          }}
        >
          {needsName ? (
            <>
              <label htmlFor="access-name" className="block text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">
                Nombre y apellido
              </label>
              <input
                id="access-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Tu nombre"
                className="mt-3 w-full border-0 border-b border-white/[0.12] bg-transparent px-0 py-3 text-xl font-semibold text-white outline-none transition-colors placeholder:text-white/25 focus:border-white"
              />
            </>
          ) : null}
          <label
            htmlFor="access-phone"
            className={`block text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45 ${needsName ? "mt-7" : ""}`}
          >
            Celular
          </label>
          <input
            id="access-phone"
            type="text"
            inputMode="numeric"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="11 5555 5555"
            className="mt-3 w-full border-0 border-b border-white/[0.12] bg-transparent px-0 py-3 text-2xl font-bold tabular-nums text-white outline-none transition-colors placeholder:text-white/25 focus:border-white"
          />
          <p className="mt-3 text-[11px] leading-relaxed text-white/35">
            Te enviamos un código por WhatsApp a ese número para confirmarlo.
          </p>
          {error ? <p className="mt-3 text-xs leading-relaxed text-red-300/80">{error}</p> : null}
          <Button
            type="submit"
            disabled={busy || phone.replace(/\D/g, "").length < 8 || (needsName && !name.trim())}
            className="mt-6 h-14 w-full rounded-2xl bg-white font-semibold text-black"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <>Enviar código <ArrowRight className="size-4" aria-hidden /></>}
          </Button>
          <button
            type="button"
            onClick={() => {
              setStep("identify")
              setError(null)
            }}
            className="mt-4 w-full text-center text-xs font-medium text-white/35 underline underline-offset-4 hover:text-white/60"
          >
            Usar otro dato
          </button>
        </form>
      ) : null}

      {step === "code" ? (
        <form onSubmit={(event) => void submitCode(event)}>
          <span className="flex size-11 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300">
            <Check className="size-5" aria-hidden />
          </span>
          <label htmlFor="access-code" className="mt-5 block text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">
            Código de 6 dígitos
          </label>
          <input
            id="access-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            autoFocus
            className="mt-3 w-full border-0 border-b border-white/[0.12] bg-transparent px-0 py-3 text-center text-3xl font-bold tabular-nums tracking-[0.35em] text-white outline-none transition-colors placeholder:text-white/20 focus:border-white"
          />
          {error ? <p className="mt-3 text-xs leading-relaxed text-red-300/80">{error}</p> : null}
          <Button
            type="submit"
            disabled={busy || code.length < 6}
            className="mt-6 h-14 w-full rounded-2xl bg-white font-semibold text-black"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Ingresar"}
          </Button>
          <div className="mt-4 flex items-center justify-between gap-4 text-xs">
            <button
              type="button"
              onClick={() => void request()}
              disabled={busy || cooldown > 0}
              className="font-medium text-white/35 underline underline-offset-4 transition-colors hover:text-white/60 disabled:no-underline disabled:opacity-50"
            >
              {cooldown > 0 ? `Reenviar en ${cooldown}s` : "Reenviar código"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("identify")
                setValue("")
                setCode("")
                setError(null)
                setCooldown(0)
              }}
              className="font-medium text-white/35 underline underline-offset-4 transition-colors hover:text-white/60"
            >
              Usar otro dato
            </button>
          </div>
        </form>
      ) : null}
    </AppleSheet>
  )

  if (!data) {
    if (!loadError) {
      return (
        <main className="flex min-h-dvh items-center justify-center bg-[#0B0B0C]">
          <Loader2 className="size-6 animate-spin text-white/40" aria-label="Cargando" />
        </main>
      )
    }
    // El link no existe: no hay evento al que entrar, así que no ofrecemos el drawer.
    if (loadError.status === 404) {
      return (
        <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center bg-[#0B0B0C] px-6 text-center">
          <h1 className="text-2xl font-bold text-white">Este evento no está disponible</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/50">Revisá que el link esté completo o pedíselo a quien te lo compartió.</p>
        </main>
      )
    }
    // Falla de red o del servidor: el ingreso no depende de esto, el slug alcanza para pedir el código.
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center bg-[#0B0B0C] px-6 text-center">
        <h1 className="text-2xl font-bold text-white">No pudimos cargar el evento</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/50">{loadError.message} Podés ingresar igual con tu DNI o tu celular.</p>
        <Button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-7 h-14 w-full rounded-2xl bg-white font-semibold text-black"
        >
          Ingresar <ArrowRight className="size-4" aria-hidden />
        </Button>
        {sheet}
      </main>
    )
  }

  const { event, productora } = data
  const where = event.venue ?? event.location

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-[#0B0B0C]">
      <div className="relative flex min-h-[62dvh] flex-col justify-end px-6 pb-8 pt-16">
        {event.imageUrl ? (
          <img src={event.imageUrl} alt="" className="absolute inset-0 size-full object-cover" />
        ) : null}
        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#0B0B0C] via-black/60 to-black/25" />
        <div className="relative">
          {event.status === "closed" ? (
            <span className="mb-4 inline-block rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/65 backdrop-blur-md">
              Evento finalizado
            </span>
          ) : null}
          {productora.name ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/45">{productora.name}</p>
          ) : null}
          <h1 className="mt-3 text-4xl font-bold leading-[1.05] tracking-[-0.035em] text-white">{event.name}</h1>
          <div className="mt-4 flex flex-col gap-2 text-sm text-white/60">
            <span className="flex items-center gap-2"><CalendarDays className="size-4" aria-hidden />{formatEventDate(event.date)}</span>
            {where ? <span className="flex items-center gap-2"><MapPin className="size-4" aria-hidden />{where}</span> : null}
          </div>
        </div>
      </div>

      <div className="relative mt-auto px-6 pb-12">
        {token ? (
          <>
            {customerName ? (
              <p className="mb-3 text-center text-xs text-white/40">Ya ingresaste como {customerName}.</p>
            ) : null}
            <Button
              type="button"
              // Ya hay sesión: va directo a este evento (y de ahí al comprobante si compró) en vez
              // de a la lista de eventos, que es lo que el cliente ya sabe que tiene.
              onClick={() =>
                navigate(`/mi-cuenta/${encodeURIComponent(token)}/evento/${encodeURIComponent(event.id)}`)
              }
              className="h-14 w-full rounded-2xl bg-white font-semibold text-black"
            >
              <Ticket className="size-4" aria-hidden /> Ver mis entradas
            </Button>
            <button
              type="button"
              onClick={() => {
                clearSession()
                setOpen(true)
              }}
              className="mt-4 w-full text-center text-xs font-medium text-white/35 underline underline-offset-4 hover:text-white/60"
            >
              Ingresar con otro dato
            </button>
          </>
        ) : (
          <>
            <Button
              type="button"
              onClick={() => setOpen(true)}
              className="h-14 w-full rounded-2xl bg-white font-semibold text-black"
            >
              Ingresar <ArrowRight className="size-4" aria-hidden />
            </Button>
            <p className="mt-4 text-center text-xs leading-relaxed text-white/30">
              Entrá con tu DNI o tu celular. Te enviamos un código por WhatsApp.
            </p>
          </>
        )}
      </div>

      {sheet}
    </main>
  )
}
