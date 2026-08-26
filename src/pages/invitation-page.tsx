import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { Calendar, Check, Gift, Loader2, MapPin, Ticket, Wine } from "lucide-react"
import { ApiError, publicApiFetch } from "@/lib/api"
import type {
  CourtesyDrinkQr,
  CourtesyInvitationResponse,
  CourtesyRedeemResponse,
} from "@/types/api"
import { Button } from "@/components/ui/button"
import { formatEventDate } from "@/lib/format"

type LoadError = { status: number | null; message: string }

/**
 * Tarea 7.2 — Página de invitación (visión §2.2 — cortesías nominadas).
 * El link que copia el admin es `${client}/i/:token` y hoy moría en el wildcard del client.
 * El token ES la credencial (sin auth): se muestra la invitación (nombre, evento, entrada,
 * tragos de regalo) y al canjear se generan los QRs de la entrada y de los tragos.
 * Idempotente: una invitación ya canjeada vuelve a mostrar sus códigos.
 */

/** Los QRs de los tragos llegan uno por unidad; se agrupan por producto para la vista. */
function groupDrinkQrs(drinks: CourtesyDrinkQr[]) {
  const groups: { productName: string; qrs: CourtesyDrinkQr[] }[] = []
  for (const d of drinks) {
    const last = groups[groups.length - 1]
    if (last && last.productName === d.productName) last.qrs.push(d)
    else groups.push({ productName: d.productName, qrs: [d] })
  }
  return groups
}

export function InvitationPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()

  const [invitation, setInvitation] = useState<CourtesyInvitationResponse | null>(null)
  const [redeemed, setRedeemed] = useState<CourtesyRedeemResponse | null>(null)
  const [error, setError] = useState<LoadError | null>(null)
  const [redeeming, setRedeeming] = useState(false)

  const doRedeem = useCallback(async () => {
    if (!token) return
    setRedeeming(true)
    setError(null)
    try {
      const res = await publicApiFetch<CourtesyRedeemResponse>(
        `/public/courtesies/${token}/redeem`,
        { method: "POST" }
      )
      setRedeemed(res)
      setInvitation((prev) => (prev ? { ...prev, status: "REDEEMED" } : prev))
    } catch (e) {
      setError({
        status: e instanceof ApiError ? e.status : null,
        message: e instanceof ApiError ? e.message : "No se pudo canjear la invitación",
      })
    } finally {
      setRedeeming(false)
    }
  }, [token])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setError(null)
    publicApiFetch<CourtesyInvitationResponse>(`/public/courtesies/${token}`)
      .then((d) => {
        if (cancelled) return
        setInvitation(d)
        // Ya canjeada: el GET no expone el QR de la entrada; el redeem es idempotente
        // y devuelve entrada + tragos de una vez.
        if (d.status === "REDEEMED") void doRedeem()
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError({
          status: e instanceof ApiError ? e.status : null,
          message: e instanceof ApiError ? e.message : "Invitación no encontrada",
        })
      })
    return () => {
      cancelled = true
    }
  }, [token, doRedeem])

  if (!token) return null

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-800/50 bg-black/70 px-6 py-4 backdrop-blur-xl">
        <Button
          variant="ghost"
          className="-ml-2 rounded-xl px-3 text-sm text-[#8E8E93] hover:bg-white/5 hover:text-white"
          type="button"
          onClick={() => navigate(-1)}
        >
          Cerrar
        </Button>
      </header>

      {error && !invitation ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
          <p className="text-lg font-semibold tracking-tight text-white">
            {error.status === 410
              ? "Esta invitación fue anulada"
              : "Invitación no encontrada"}
          </p>
          <p className="max-w-[260px] text-sm leading-relaxed text-white/50">
            {error.status === 410
              ? "Ponete en contacto con quien te la envió."
              : "Este enlace no corresponde a ninguna invitación válida."}
          </p>
        </div>
      ) : !invitation ? (
        <div className="flex flex-1 items-center justify-center text-white/40">
          <Loader2 className="size-6 animate-spin" aria-hidden />
        </div>
      ) : redeemed ? (
        <RedeemedView invitation={invitation} redeemed={redeemed} />
      ) : (
        <InvitationCard
          invitation={invitation}
          error={error}
          redeeming={redeeming}
          onRedeem={() => {
            if (!redeeming) void doRedeem()
          }}
        />
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Invitación sin canjear — diseño de invitación (nombre, evento, entrada, tragos)
// ──────────────────────────────────────────────────────────────────────────────
function InvitationCard({
  invitation,
  error,
  redeeming,
  onRedeem,
}: {
  invitation: CourtesyInvitationResponse
  error: LoadError | null
  redeeming: boolean
  onRedeem: () => void
}) {
  const { guestName, ticketTypeName, event, drinks } = invitation

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/40">
            Tenés una invitación
          </p>

          <h1 className="mt-6 text-3xl font-bold tracking-tight text-white">
            {guestName}
          </h1>
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#FFD60A]/10 px-3.5 py-1.5 text-[13px] font-semibold text-[#FFD60A]">
            <Ticket className="size-3.5" aria-hidden />
            {ticketTypeName}
          </span>

          <div className="mt-10 w-full rounded-3xl border border-white/[0.08] bg-[#1C1C1E] p-7">
            <p className="font-serif text-[26px] leading-tight text-[#F4F1EA]">
              {event.name}
            </p>
            <div className="mt-6 flex flex-col gap-3 text-left">
              <div className="flex items-center gap-3 text-[14px] text-white/60">
                <Calendar className="size-4 shrink-0 text-white/35" aria-hidden />
                <span>{formatEventDate(event.date)}</span>
              </div>
              {event.location ? (
                <div className="flex items-center gap-3 text-[14px] text-white/60">
                  <MapPin className="size-4 shrink-0 text-white/35" aria-hidden />
                  <span>{event.location}</span>
                </div>
              ) : null}
            </div>
          </div>

          {drinks.length > 0 ? (
            <div className="mt-8 w-full text-left">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
                <Gift className="size-3.5" aria-hidden />
                Tragos de regalo
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {drinks.map((d, i) => (
                  <li
                    key={`${d.productId}-${i}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.04] px-4 py-3"
                  >
                    <span className="flex min-w-0 items-center gap-2.5 text-[15px] font-medium text-white">
                      <Wine className="size-4 shrink-0 text-white/40" aria-hidden />
                      <span className="truncate">{d.productName}</span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-white/45">
                      {d.quantity}×
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {error ? (
            <p className="mt-5 w-full text-center text-[13px] text-red-400">
              {error.message}
            </p>
          ) : null}

          <Button
            type="button"
            className="mt-8 h-14 w-full rounded-2xl bg-white font-semibold text-black transition-all disabled:shadow-none"
            disabled={redeeming}
            onClick={onRedeem}
          >
            {redeeming ? (
              <Loader2 className="size-6 animate-spin" aria-hidden />
            ) : (
              "Canjear invitación"
            )}
          </Button>

          <p className="mt-5 text-[13px] leading-relaxed text-white/40">
            Se genera tu entrada con un QR para mostrar en el ingreso.
          </p>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Invitación canjeada — QR de la entrada + QR por cada trago de regalo
// ──────────────────────────────────────────────────────────────────────────────
function RedeemedView({
  invitation,
  redeemed,
}: {
  invitation: CourtesyInvitationResponse
  redeemed: CourtesyRedeemResponse
}) {
  const groups = groupDrinkQrs(redeemed.drinks)
  const ticketActive = redeemed.ticket.status === "PENDING"

  return (
    <div className="flex flex-1 flex-col px-6 py-12">
      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-12">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
            <Check className="size-3.5" aria-hidden />
            Invitación canjeada
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              {invitation.event.name}
            </h1>
            <p className="mt-1 text-sm text-white/45">
              {formatEventDate(invitation.event.date)}
            </p>
          </div>
        </div>

        <section className="flex w-full flex-col items-center gap-4">
          <div className="text-center">
            <p className="font-medium text-white">{invitation.ticketTypeName}</p>
            <p className="mt-1.5 text-sm text-white/45">
              {ticketActive ? "Mostrá este código en el ingreso" : "Entrada utilizada"}
            </p>
          </div>
          <img
            src={redeemed.qrDataUrl}
            alt={`Entrada ${invitation.ticketTypeName}`}
            className="size-56 rounded-2xl"
            width={224}
            height={224}
          />
          <Link
            to={`/qr/${encodeURIComponent(redeemed.ticket.qrHash)}`}
            className="text-[13px] text-white/45 underline decoration-white/15 underline-offset-4 hover:text-white"
          >
            Pantalla completa
          </Link>
        </section>

        {groups.length > 0 ? (
          <section className="flex w-full flex-col items-center gap-8">
            <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
              <Gift className="size-3.5" aria-hidden />
              Tragos de regalo
            </h2>
            {groups.map((g) => (
              <div key={g.productName} className="flex w-full flex-col items-center gap-5">
                <p className="text-[15px] font-semibold text-white">
                  {g.qrs.length}× {g.productName}
                </p>
                <div className="flex flex-col items-center gap-6">
                  {g.qrs.map((q) => (
                    <img
                      key={q.id}
                      src={q.qrDataUrl}
                      alt={g.productName}
                      className="size-44 rounded-2xl"
                      width={176}
                      height={176}
                    />
                  ))}
                </div>
                <p className="text-[13px] text-white/40">
                  Mostrá un código por trago en la barra.
                </p>
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </div>
  )
}
