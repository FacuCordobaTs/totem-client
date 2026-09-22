import { useEffect, useState } from "react"
import { Link, Navigate, useNavigate, useParams } from "react-router"
import { ArrowLeft, CalendarDays, Coins, Loader2, MapPin, Ticket } from "lucide-react"
import { publicApiFetch } from "@/lib/api"
import { QrBlock } from "@/components/qr-block"
import {
  consumptionStatusLabel,
  formatEventDate,
  formatMoneyArsExact,
  ticketStatusLabel,
} from "@/lib/format"
import { formatAdmissionWindow } from "@/lib/ticket-admission"
import { useSessionStore } from "@/stores/session-store"
import type { CustomerEventResponse } from "@/types/api"

/**
 * El evento visto por el cliente, con la misma estética del comprobante pero sin venta de por
 * medio: es el destino de `crow.ar/{slug}/acceso` cuando todavía no compró nada. Si compró, el
 * backend devuelve `receiptToken` y esta página ofrece el comprobante, que tiene el flujo
 * completo (retiros y compra de consumos).
 */
export function CustomerEventPage() {
  const { token, eventId } = useParams<{ token: string; eventId: string }>()
  const navigate = useNavigate()
  const sessionToken = useSessionStore((state) => state.token)
  const clearSession = useSessionStore((state) => state.clearSession)
  const [data, setData] = useState<CustomerEventResponse | null>(null)
  const [failed, setFailed] = useState(false)

  const hasSession = Boolean(sessionToken && sessionToken === token)
  const returnTo = `/mi-cuenta/${encodeURIComponent(token ?? "")}/evento/${encodeURIComponent(eventId ?? "")}`

  useEffect(() => {
    if (!token || !eventId) return
    let cancelled = false
    publicApiFetch<CustomerEventResponse>(
      `/public/customers/profile/${encodeURIComponent(token)}/events/${encodeURIComponent(eventId)}`
    )
      .then((response) => {
        if (!cancelled) setData(response)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [token, eventId])

  if (failed) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-bold text-white">No pudimos abrir el evento</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/50">
          Pedí un nuevo enlace de acceso para volver a entrar.
        </p>
        <Link to="/" className="mt-7 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black">
          Pedir acceso
        </Link>
      </main>
    )
  }

  if (!data) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-white/40" aria-label="Cargando" />
      </main>
    )
  }

  // Si compró, el comprobante es el destino: tiene los retiros, la carga de saldo y la compra de
  // consumos, y es el mismo lugar al que entra el link del mail. Sin compra no hay comprobante, y
  // esta página es la que muestra que ya está adentro del evento.
  if (data.receiptToken) {
    return <Navigate to={`/receipt/${encodeURIComponent(data.receiptToken)}`} replace />
  }

  const pendingConsumptions = data.consumptions.filter((item) => item.status === "PENDING").length
  const hasAnything = data.tickets.length > 0 || data.consumptions.length > 0
  const storePath = `/${encodeURIComponent(data.event.slug ?? data.event.id)}`

  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg px-6 pb-24 pt-10 sm:px-8">
      <header className="flex items-center justify-between gap-4">
        <Link
          to={`/mi-cuenta/${encodeURIComponent(token ?? "")}`}
          className="flex items-center gap-2 text-sm font-medium text-white/55 transition-colors hover:text-white"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Mis eventos
        </Link>
        <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/25">Crow</span>
      </header>

      <section className="mt-8">
        {data.event.imageUrl ? (
          <div className="relative h-44 overflow-hidden rounded-3xl border border-white/[0.09] bg-[#171719]">
            <img src={data.event.imageUrl} alt="" className="absolute inset-0 size-full object-cover opacity-70" />
            <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
          </div>
        ) : null}
        <div className="mt-6 space-y-3">
          <p className="text-sm font-medium text-white/45">{data.productora.name}</p>
          <h1 className="text-4xl font-bold tracking-[-0.035em] text-white">{data.event.name}</h1>
          <div className="flex flex-col gap-1.5 text-xs text-white/55">
            <span className="flex items-center gap-2">
              <CalendarDays className="size-3.5" aria-hidden />
              {formatEventDate(data.event.date)}
            </span>
            {data.event.venue ?? data.event.location ? (
              <span className="flex items-center gap-2">
                <MapPin className="size-3.5" aria-hidden />
                {data.event.venue ?? data.event.location}
              </span>
            ) : null}
          </div>
          {data.event.status === "closed" ? (
            <span className="inline-flex rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">
              Finalizado
            </span>
          ) : null}
        </div>
      </section>

      <nav className="mt-10 flex flex-col gap-3" aria-label="Tu cuenta para el evento">
        <div className="flex w-full items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-5 py-5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/[0.07] text-white/80">
            <Coins className="size-5" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
            <span className="text-[17px] font-semibold tracking-tight text-white">Tu saldo</span>
            <span className="text-sm font-semibold tabular-nums text-white/65">
              {formatMoneyArsExact(data.balance.amount)}
            </span>
          </span>
        </div>
      </nav>

      {data.tickets.length > 0 ? (
        <section className="mt-10" aria-label="Tus entradas">
          <h2 className="text-2xl font-bold tracking-tight text-white">Tus entradas</h2>
          <div className="mt-4 flex flex-col gap-3">
            {data.tickets.map((ticket) => {
              const active = ticket.status === "PENDING"
              return (
                <article
                  key={ticket.id}
                  className="relative flex min-h-[6.25rem] min-w-0 overflow-hidden rounded-2xl bg-white text-zinc-950 shadow-[0_16px_45px_-24px_rgba(255,255,255,0.38)]"
                >
                  <div className="flex min-w-0 flex-1 flex-col justify-center px-5 py-4 pr-4">
                    <p className="truncate text-base font-extrabold tracking-tight">{ticket.ticketType.name}</p>
                    {formatAdmissionWindow(ticket.ticketType) && (
                      <p className="mt-1 text-xs font-medium leading-relaxed text-amber-800">
                        {formatAdmissionWindow(ticket.ticketType)}
                      </p>
                    )}
                    <p className="mt-1 text-sm font-semibold tabular-nums text-zinc-600">
                      {formatMoneyArsExact(ticket.ticketType.price)}
                    </p>
                    <span
                      className={`mt-2 w-fit rounded-full px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.14em] ${active ? "bg-emerald-100 text-emerald-700" : "bg-zinc-200 text-zinc-500"}`}
                    >
                      {ticketStatusLabel(ticket.status)}
                    </span>
                  </div>
                  <div className="relative flex w-[6.5rem] shrink-0 items-center justify-center border-l-2 border-dotted border-zinc-300 px-4 py-3">
                    <span aria-hidden className="absolute -left-[9px] -top-[9px] size-4 rounded-full bg-black" />
                    <span aria-hidden className="absolute -bottom-[9px] -left-[9px] size-4 rounded-full bg-black" />
                    <QrBlock
                      hash={ticket.qrHash}
                      active={active}
                      returnTo={returnTo}
                      ticketName={ticket.ticketType.name}
                      ticketPrice={formatMoneyArsExact(ticket.ticketType.price)}
                    />
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}

      {data.consumptions.length > 0 ? (
        <section className="mt-10" aria-label="Tus consumos">
          <h2 className="text-2xl font-bold tracking-tight text-white">Tus consumos</h2>
          <ul className="mt-4 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03]">
            {data.consumptions.map((item, index) => (
              <li
                key={item.id}
                className={`flex items-center justify-between gap-4 px-5 py-4 ${index > 0 ? "border-t border-white/[0.07]" : ""}`}
              >
                <p className="min-w-0 flex-1 font-semibold text-white">{item.product.name}</p>
                <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
                  {consumptionStatusLabel(item.status)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!hasAnything ? (
        <section className="mt-10 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-6 py-8 text-center">
          <p className="text-sm leading-relaxed text-white/60">
            Todavía no tenés entradas ni consumos en este evento. Ya estás adentro: podés comprar
            desde acá.
          </p>
          <Link
            to={storePath}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black"
          >
            <Ticket className="size-4" aria-hidden />
            Ver la tienda del evento
          </Link>
        </section>
      ) : null}

      {pendingConsumptions > 0 ? (
        <p className="mt-8 text-center text-xs leading-relaxed text-white/35">
          Tenés {pendingConsumptions} {pendingConsumptions === 1 ? "consumo pendiente" : "consumos pendientes"} para canjear en la barra.
        </p>
      ) : null}

      <p className="mt-10 text-center text-xs leading-relaxed text-white/25">
        Este enlace es personal. Guardalo para volver cuando quieras.
      </p>
      {hasSession ? (
        <button
          type="button"
          onClick={() => {
            clearSession()
            navigate("/")
          }}
          className="mx-auto mt-4 block text-xs font-medium text-white/35 underline underline-offset-4 transition-colors hover:text-white/60"
        >
          Cerrar sesión
        </button>
      ) : null}
    </main>
  )
}
