import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { useNavigate, useParams } from "react-router"
import QRCode from "qrcode"
import { ArrowRight, CalendarDays, Check, Loader2, MapPin, Ticket } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ApiError, publicApiFetch } from "@/lib/api"
import { formatEventDate } from "@/lib/format"
import { formatAdmissionWindow } from "@/lib/ticket-admission"
import {
  getClaimResult,
  getStoredClaim,
  saveClaimResult,
  saveStoredClaim,
  type StoredClaim,
} from "@/lib/ticket-claims"
import { useSessionStore } from "@/stores/session-store"
import type {
  TicketShareClaimResponse,
  TicketSharePreviewResponse,
  TicketSharePreviewState,
} from "@/types/api"

/**
 * Link de "compartir entradas" (`crow.ar/t/:token`). Lo abre el amigo a quien le pasaron una entrada:
 * ve de qué evento es y quién se la pasó, completa nombre, apellido, DNI, celular y email, y la
 * entrada queda a su nombre (con QR propio). Con esos datos queda registrado como cliente: puede
 * entrar con su DNI en la puerta y comprar consumos del evento desde su cuenta.
 *
 * El token del link es la única credencial (sin auth). Un link se reparte entre varios amigos, así
 * que abrirlo no revela nada de quienes ya reclamaron.
 */

type Field = "firstName" | "lastName" | "dni" | "phone" | "email"
type FieldErrors = Partial<Record<Field, string>>

const JSON_HEADERS = { "Content-Type": "application/json" }

/** Las mismas reglas que el backend (`ticketShareClaimSchema`): se ven antes de salir al servidor. */
function validate(values: Record<Field, string>): FieldErrors {
  const errors: FieldErrors = {}
  if (!values.firstName.trim()) errors.firstName = "Ingresá tu nombre"
  if (!values.lastName.trim()) errors.lastName = "Ingresá tu apellido"
  const dni = values.dni.replace(/\D/g, "")
  if (dni.length < 6 || dni.length > 9) errors.dni = "Revisá tu DNI: tiene que ser de 6 a 9 números"
  const phone = values.phone.replace(/\D/g, "")
  if (phone.length < 8 || phone.length > 15) errors.phone = "Revisá tu celular"
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(values.email.trim())) {
    errors.email = "Revisá tu email"
  }
  return errors
}

const isField = (value: unknown): value is Field =>
  value === "firstName" || value === "lastName" || value === "dni" || value === "phone" || value === "email"

export function TicketSharePage() {
  const { token } = useParams<{ token: string }>()
  // La `key` reinicia todo el estado si se cambia de link sin salir de la página.
  return token ? <TicketShareView key={token} token={token} /> : null
}

function TicketShareView({ token }: { token: string }) {
  const navigate = useNavigate()
  const sessionToken = useSessionStore((state) => state.token)
  const setSession = useSessionStore((state) => state.setSession)

  const [preview, setPreview] = useState<TicketSharePreviewResponse | null>(null)
  const [loadError, setLoadError] = useState<{ status: number; message: string } | null>(null)
  const [result, setResult] = useState<{ claimed: TicketShareClaimResponse; dni: string } | null>(
    () => getClaimResult(token)
  )
  const [stored] = useState<StoredClaim | null>(() => getStoredClaim(token))
  // "Reclamar para otra persona": deja ver el formulario aunque este teléfono ya haya reclamado.
  const [forOther, setForOther] = useState(false)

  const [values, setValues] = useState<Record<Field, string>>({
    firstName: "",
    lastName: "",
    dni: "",
    phone: "",
    email: "",
  })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<{ message: string; code: string | null } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    publicApiFetch<TicketSharePreviewResponse>(`/public/ticket-shares/${encodeURIComponent(token)}`)
      .then((response) => {
        if (!cancelled) setPreview(response)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setLoadError(
          e instanceof ApiError
            ? { status: e.status, message: e.message }
            : { status: 0, message: "No pudimos conectarnos con el servidor. Probá de nuevo en un rato." }
        )
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const setField = (field: Field, value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))
  }

  const setState = (state: TicketSharePreviewState) =>
    setPreview((current) => (current ? { ...current, state } : current))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const found = validate(values)
    setErrors(found)
    setFormError(null)
    if (Object.keys(found).length > 0) return

    setBusy(true)
    try {
      const claimed = await publicApiFetch<TicketShareClaimResponse>(
        `/public/ticket-shares/${encodeURIComponent(token)}/claim`,
        {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({
            firstName: values.firstName.trim(),
            lastName: values.lastName.trim(),
            dni: values.dni.replace(/\D/g, ""),
            phone: values.phone.trim(),
            email: values.email.trim(),
          }),
        }
      )
      const dni = values.dni.replace(/\D/g, "")
      saveStoredClaim(token, {
        eventId: claimed.event.id,
        eventSlug: claimed.event.slug,
        eventName: claimed.event.name,
        firstName: values.firstName.trim(),
        sessionToken: claimed.session?.token ?? null,
        claimedAt: Date.now(),
      })
      saveClaimResult(token, { claimed, dni })
      // Sólo se toma la sesión del teléfono si no había otra: no se le pisa la cuenta a quien ya
      // estaba adentro (el botón de "Ir a mi cuenta" usa la sesión del reclamo igual).
      if (claimed.session && !sessionToken) {
        setSession({ token: claimed.session.token, customerName: claimed.holderName })
      }
      setResult({ claimed, dni })
    } catch (e) {
      if (!(e instanceof ApiError)) {
        setFormError({ message: "No pudimos reclamar la entrada. Probá de nuevo.", code: null })
        return
      }
      const code = typeof e.body?.code === "string" ? e.body.code : null
      const field = e.body?.field
      if (code === "INVALID_DATA" && isField(field)) {
        setErrors({ [field]: e.message })
      } else if (code === "SOLD_OUT") {
        setState("SOLD_OUT")
      } else if (code === "SHARE_CANCELLED") {
        setState("CANCELLED")
      } else if (code === "EVENT_CLOSED") {
        setState("EVENT_CLOSED")
      } else {
        setFormError({ message: e.message, code })
      }
    } finally {
      setBusy(false)
    }
  }

  // Después de reclamar (o al recargar la pestaña): la entrada y cómo seguir.
  if (result) {
    return (
      <ClaimedView
        claimed={result.claimed}
        onContinue={() => goToAccount(navigate, result.claimed, result.dni)}
      />
    )
  }

  if (!preview) {
    if (!loadError) {
      return (
        <main className="flex min-h-dvh items-center justify-center bg-[#0B0B0C]">
          <Loader2 className="size-6 animate-spin text-white/40" aria-label="Cargando" />
        </main>
      )
    }
    return (
      <Notice
        title={loadError.status === 404 ? "Este link no existe" : "No pudimos abrir el link"}
        body={
          loadError.status === 404
            ? "Revisá que esté completo o pedile a quien te lo mandó que te lo pase de nuevo."
            : loadError.message
        }
      />
    )
  }

  const { event, hostName, ticketType } = preview
  const admission = formatAdmissionWindow(ticketType)

  // Este teléfono ya reclamó en este link: se lo reconoce en vez de mostrarle el formulario otra vez.
  if (stored && !forOther) {
    return (
      <Shell event={event} productora={preview.productora.name}>
        <section className="rounded-2xl border border-white/[0.09] bg-white/[0.045] p-5 text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300">
            <Check className="size-5" aria-hidden />
          </span>
          <h2 className="mt-4 text-xl font-bold tracking-tight text-white">
            Ya reclamaste tu entrada, {stored.firstName}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-white/50">
            Entrá a tu cuenta para ver el QR. En la puerta también entrás con tu DNI.
          </p>
          <Button
            type="button"
            onClick={() =>
              navigate(
                stored.sessionToken
                  ? `/mi-cuenta/${encodeURIComponent(stored.sessionToken)}/evento/${encodeURIComponent(stored.eventId)}`
                  : `/${encodeURIComponent(stored.eventSlug ?? stored.eventId)}/acceso`
              )
            }
            className="mt-6 h-14 w-full rounded-2xl bg-white font-semibold text-black hover:bg-zinc-200"
          >
            <Ticket className="size-4" aria-hidden /> Ver mi entrada
          </Button>
        </section>
        <button
          type="button"
          onClick={() => setForOther(true)}
          className="mt-5 w-full text-center text-xs font-medium text-white/35 underline underline-offset-4 hover:text-white/60"
        >
          Reclamar una entrada para otra persona
        </button>
      </Shell>
    )
  }

  if (preview.state !== "AVAILABLE") {
    const message: Record<Exclude<TicketSharePreviewState, "AVAILABLE">, [string, string]> = {
      SOLD_OUT: [
        "Ya se reclamaron todas las entradas",
        `Pedile a ${hostName} que te pase otro link si todavía te falta la tuya.`,
      ],
      CANCELLED: [
        `${hostName} canceló este link`,
        "Pedile que te mande uno nuevo para reclamar tu entrada.",
      ],
      EVENT_CLOSED: ["Este evento ya finalizó", "Ya no se pueden reclamar entradas."],
    }
    const [title, body] = message[preview.state]
    return (
      <Shell event={event} productora={preview.productora.name}>
        <section className="rounded-2xl border border-white/[0.09] bg-white/[0.045] p-6 text-center">
          <h2 className="text-xl font-bold tracking-tight text-white">{title}</h2>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-white/50">{body}</p>
        </section>
      </Shell>
    )
  }

  return (
    <Shell event={event} productora={preview.productora.name}>
      <section className="flex items-center gap-4 rounded-2xl border border-white/[0.09] bg-white/[0.045] p-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#FFD60A]/10 text-[#FFD60A]">
          <Ticket className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold tracking-tight text-white">
            {hostName} te pasó una entrada
          </p>
          <p className="mt-0.5 truncate text-[13px] text-white/50">{ticketType.name}</p>
          {admission ? <p className="mt-1 text-xs leading-snug text-amber-300/80">{admission}</p> : null}
        </div>
        {preview.total > 1 ? (
          <span className="shrink-0 rounded-full bg-white/[0.08] px-2.5 py-1 text-[11px] font-semibold tabular-nums text-white/60">
            Quedan {preview.remaining}
          </span>
        ) : null}
      </section>

      <form onSubmit={(e) => void submit(e)} noValidate className="mt-8 flex flex-col gap-6">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-white">Reclamá tu entrada</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-white/45">
            Completá tus datos: la entrada queda a tu nombre y en la puerta entrás con tu DNI.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <TextField
            id="claim-first-name"
            label="Nombre"
            value={values.firstName}
            error={errors.firstName}
            autoComplete="given-name"
            placeholder="María"
            onChange={(value) => setField("firstName", value)}
          />
          <TextField
            id="claim-last-name"
            label="Apellido"
            value={values.lastName}
            error={errors.lastName}
            autoComplete="family-name"
            placeholder="García"
            onChange={(value) => setField("lastName", value)}
          />
        </div>
        <TextField
          id="claim-dni"
          label="DNI"
          value={values.dni}
          error={errors.dni}
          inputMode="numeric"
          autoComplete="off"
          placeholder="30123456"
          onChange={(value) => setField("dni", value)}
        />
        <TextField
          id="claim-phone"
          label="Celular"
          value={values.phone}
          error={errors.phone}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="11 5555 5555"
          onChange={(value) => setField("phone", value)}
        />
        <TextField
          id="claim-email"
          label="Email"
          value={values.email}
          error={errors.email}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="maria@email.com"
          onChange={(value) => setField("email", value)}
        />

        {formError ? (
          <div role="alert" className="rounded-xl bg-red-500/10 px-4 py-3 text-[13px] leading-relaxed text-red-300">
            {formError.message}
            {formError.code === "ALREADY_CLAIMED" ? (
              <button
                type="button"
                onClick={() => navigate(`/${encodeURIComponent(event.slug ?? event.id)}/acceso`)}
                className="mt-2 block font-semibold text-white underline underline-offset-4"
              >
                Ingresar a mi cuenta
              </button>
            ) : null}
          </div>
        ) : null}

        <div>
          <Button
            type="submit"
            disabled={busy}
            className="h-14 w-full rounded-2xl bg-white font-semibold text-black transition-all hover:bg-zinc-200 disabled:shadow-none"
          >
            {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : "Reclamar mi entrada"}
          </Button>
          <p className="mt-4 text-center text-xs leading-relaxed text-white/30">
            Tus datos quedan asociados a la entrada y a tu cuenta: con ella podés comprar consumos
            del evento.
          </p>
        </div>
      </form>
    </Shell>
  )
}

/** A dónde sigue el amigo después de reclamar: su cuenta (con sesión) o el ingreso con DNI/celular. */
function goToAccount(
  navigate: ReturnType<typeof useNavigate>,
  claimed: TicketShareClaimResponse,
  dni: string
) {
  if (claimed.session) {
    navigate(
      `/mi-cuenta/${encodeURIComponent(claimed.session.token)}/evento/${encodeURIComponent(claimed.event.id)}`
    )
    return
  }
  // El DNI viaja en el estado de la navegación y no en la URL: no queda en el historial ni en logs.
  navigate(`/${encodeURIComponent(claimed.event.slug ?? claimed.event.id)}/acceso`, {
    state: { identifier: dni },
  })
}

// ──────────────────────────────────────────────────────────────────────────────
// Piezas de la pantalla
// ──────────────────────────────────────────────────────────────────────────────

/** Portada del evento (flyer, nombre, fecha, lugar) y el contenido del link debajo. */
function Shell({
  event,
  productora,
  children,
}: {
  event: TicketSharePreviewResponse["event"]
  productora: string
  children: ReactNode
}) {
  const where = event.venue ?? event.location
  return (
    <main className="relative flex min-h-dvh flex-col bg-[#0B0B0C]">
      <div className="relative flex min-h-[34dvh] flex-col justify-end overflow-hidden px-6 pb-6 pt-14">
        {event.imageUrl ? (
          <img src={event.imageUrl} alt="" className="absolute inset-0 size-full object-cover" />
        ) : null}
        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#0B0B0C] via-black/60 to-black/25" />
        <div className="relative mx-auto w-full max-w-md">
          {productora ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/45">{productora}</p>
          ) : null}
          <h1 className="mt-3 text-3xl font-bold leading-[1.08] tracking-[-0.03em] text-white">{event.name}</h1>
          <div className="mt-3 flex flex-col gap-1.5 text-sm text-white/60">
            <span className="flex items-center gap-2">
              <CalendarDays className="size-4" aria-hidden />
              {formatEventDate(event.date)}
            </span>
            {where ? (
              <span className="flex items-center gap-2">
                <MapPin className="size-4" aria-hidden />
                {where}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="relative mx-auto w-full max-w-md flex-1 px-6 pb-14 pt-2">{children}</div>
    </main>
  )
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center bg-[#0B0B0C] px-6 text-center">
      <h1 className="text-2xl font-bold text-white">{title}</h1>
      <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/50">{body}</p>
    </main>
  )
}

function TextField({
  id,
  label,
  value,
  error,
  onChange,
  type = "text",
  inputMode,
  autoComplete,
  placeholder,
}: {
  id: string
  label: string
  value: string
  error?: string
  onChange: (value: string) => void
  type?: string
  inputMode?: "text" | "numeric" | "tel" | "email"
  autoComplete?: string
  placeholder?: string
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">
        {label}
      </label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`mt-2 w-full border-0 border-b bg-transparent px-0 py-2.5 text-lg font-semibold text-white outline-none transition-colors placeholder:font-normal placeholder:text-white/20 focus:border-white ${
          error ? "border-red-400/70" : "border-white/[0.12]"
        }`}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs leading-snug text-red-300/85">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** La entrada ya es del amigo: el QR para mostrar, el DNI como alternativa y cómo seguir. */
function ClaimedView({
  claimed,
  onContinue,
}: {
  claimed: TicketShareClaimResponse
  onContinue: () => void
}) {
  const [qr, setQr] = useState<string | null>(null)
  const firstName = claimed.holderName.split(/\s+/)[0] ?? claimed.holderName
  const admission = formatAdmissionWindow(claimed.ticket.ticketType)
  const where = claimed.event.venue ?? claimed.event.location

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(claimed.ticket.qrHash, {
      width: 592,
      margin: 4,
      errorCorrectionLevel: "M",
      color: { dark: "#09090b", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setQr(url)
      })
      .catch(() => {
        if (!cancelled) setQr(null)
      })
    return () => {
      cancelled = true
    }
  }, [claimed.ticket.qrHash])

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-[#0B0B0C] px-6 pb-14 pt-12">
      <div className="flex flex-col items-center text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
          <Check className="size-3.5" aria-hidden />
          Entrada reclamada
        </span>
        <h1 className="mt-5 text-3xl font-bold tracking-[-0.03em] text-white">¡Listo, {firstName}!</h1>
        <p className="mt-2 max-w-xs text-[15px] leading-relaxed text-white/50">
          La entrada quedó a tu nombre. Mostrá este QR en la puerta o, si no tenés el celular, alcanza
          con tu DNI.
        </p>
      </div>

      <article className="mt-8 overflow-hidden rounded-3xl bg-white text-zinc-950 shadow-[0_16px_45px_-24px_rgba(255,255,255,0.38)]">
        <div className="px-6 pt-6 text-center">
          <p className="text-lg font-extrabold tracking-tight">{claimed.event.name}</p>
          <p className="mt-1 text-sm font-medium text-zinc-500">
            {formatEventDate(claimed.event.date)}
            {where ? ` · ${where}` : ""}
          </p>
          {admission ? <p className="mt-2 text-xs font-medium leading-relaxed text-amber-800">{admission}</p> : null}
        </div>
        <div className="flex items-center justify-center px-6 py-5">
          {qr ? (
            <img src={qr} alt="Código QR de tu entrada" className="aspect-square w-full max-w-[15rem]" width={240} height={240} />
          ) : (
            <div className="flex aspect-square w-full max-w-[15rem] items-center justify-center text-zinc-400">
              <Loader2 className="size-5 animate-spin" aria-hidden />
            </div>
          )}
        </div>
        <div className="relative border-t-[3px] border-dotted border-zinc-300" aria-hidden>
          <span className="absolute left-0 top-1/2 size-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#0B0B0C]" />
          <span className="absolute right-0 top-1/2 size-7 translate-x-1/2 -translate-y-1/2 rounded-full bg-[#0B0B0C]" />
        </div>
        <div className="px-6 pb-6 pt-5 text-center">
          <p className="text-2xl font-extrabold tracking-tight">{claimed.ticket.ticketType.name}</p>
          <p className="mt-1 text-sm font-semibold text-zinc-500">{claimed.holderName}</p>
        </div>
      </article>

      <Button
        type="button"
        onClick={onContinue}
        className="mt-8 h-14 w-full rounded-2xl bg-white font-semibold text-black transition-all hover:bg-zinc-200"
      >
        {claimed.session ? "Ir a mi cuenta" : "Ingresar a mi cuenta"}
        <ArrowRight className="size-4" aria-hidden />
      </Button>
      <p className="mt-3 text-center text-[13px] leading-relaxed text-white/40">
        {claimed.session
          ? "Ahí ves tus entradas, comprás consumos y cargás saldo para el evento."
          : "Como ya tenías una cuenta, confirmamos que sos vos con un código por WhatsApp."}
      </p>
      <p className="mt-6 text-center text-xs leading-relaxed text-white/25">
        Sacale una captura a este QR por las dudas.
      </p>
    </main>
  )
}
