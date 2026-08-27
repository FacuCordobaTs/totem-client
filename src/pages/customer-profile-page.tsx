import { useEffect, useState } from "react"
import { Link, useParams } from "react-router"
import { ArrowRight, CalendarDays, Loader2, MapPin, Ticket, Wine } from "lucide-react"
import { publicApiFetch } from "@/lib/api"
import { formatEventDate } from "@/lib/format"
import type { CustomerProfileResponse } from "@/types/api"

export function CustomerProfilePage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<CustomerProfileResponse | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    publicApiFetch<CustomerProfileResponse>(`/public/customers/profile/${encodeURIComponent(token)}`)
      .then((response) => {
        if (!cancelled) setData(response)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  if (failed) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-bold text-white">No pudimos abrir tu cuenta</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/50">Pedí un nuevo enlace de acceso para volver a entrar.</p>
        <Link to="/" className="mt-7 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black">Pedir acceso</Link>
      </main>
    )
  }

  if (!data) {
    return <main className="flex min-h-dvh items-center justify-center"><Loader2 className="size-6 animate-spin text-white/40" aria-label="Cargando" /></main>
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg px-6 pb-16 pt-12 sm:px-8">
      <header>
        <Link to="/" className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/30 transition-colors hover:text-white/60">Crow</Link>
        <p className="mt-10 text-sm font-medium text-white/40">Mi cuenta</p>
        <h1 className="mt-2 text-4xl font-bold tracking-[-0.04em] text-white">Hola, {data.customer.name}</h1>
        <p className="mt-3 text-[15px] text-white/50">Estos son todos tus eventos.</p>
      </header>

      <section className="mt-10 flex flex-col gap-4" aria-label="Tus eventos">
        {data.events.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-6 py-10 text-center text-sm text-white/45">Todavía no tenés eventos asociados.</div>
        ) : data.events.map((event) => (
          <Link
            key={event.id}
            to={`/receipt/${encodeURIComponent(event.receiptToken)}`}
            className="group relative min-h-56 overflow-hidden rounded-3xl border border-white/[0.09] bg-[#171719] p-6 shadow-[0_18px_50px_-30px_rgba(255,255,255,0.25)]"
          >
            {event.imageUrl ? <img src={event.imageUrl} alt="" className="absolute inset-0 size-full object-cover opacity-45 transition-transform duration-500 group-hover:scale-[1.03]" /> : null}
            <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black via-black/65 to-black/10" />
            <div className="relative flex h-full min-h-44 flex-col">
              <div className="flex items-start justify-between gap-4">
                <span className="rounded-full border border-white/15 bg-black/25 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/65 backdrop-blur-md">
                  {event.status === "live" ? "En vivo" : event.status === "closed" ? "Finalizado" : "Próximo"}
                </span>
                <ArrowRight className="size-5 text-white/50 transition-transform group-hover:translate-x-1 group-hover:text-white" aria-hidden />
              </div>
              <div className="mt-auto">
                <p className="text-xs font-medium text-white/45">{event.productoraName}</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">{event.name}</h2>
                <div className="mt-3 flex flex-col gap-1.5 text-xs text-white/55">
                  <span className="flex items-center gap-2"><CalendarDays className="size-3.5" aria-hidden />{formatEventDate(event.date)}</span>
                  {event.location ? <span className="flex items-center gap-2"><MapPin className="size-3.5" aria-hidden />{event.location}</span> : null}
                </div>
                <div className="mt-4 flex gap-2">
                  <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/70"><Ticket className="size-3.5" aria-hidden />{event.tickets}</span>
                  {event.pendingConsumptions > 0 ? <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/70"><Wine className="size-3.5" aria-hidden />{event.pendingConsumptions}</span> : null}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </section>
      <p className="mt-10 text-center text-xs leading-relaxed text-white/25">Este enlace es personal. Guardalo para volver cuando quieras.</p>
    </main>
  )
}
