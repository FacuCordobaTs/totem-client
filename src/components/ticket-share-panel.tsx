import { useEffect, useRef, useState } from "react"
import QRCode from "qrcode"
import {
  Check,
  Copy,
  Loader2,
  Minus,
  Plus,
  QrCode,
  Send,
  Share2,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { AppleSheet } from "@/components/apple-sheet"
import { Button } from "@/components/ui/button"
import { ApiError, publicApiFetch } from "@/lib/api"
import type {
  TicketShareCreateResponse,
  TicketShareLink,
  TicketSharesInfo,
} from "@/types/api"

/**
 * Compartir entradas (dueño). Quien compró varias entradas arma UN link para el grupo de WhatsApp y
 * cada amigo reclama una con sus datos; las entradas quedan a su nombre. Con cantidad 1 es un link
 * por persona. Acá viven los tres pedazos de esa pantalla:
 *
 * - `TicketSharePanel`: la invitación a compartir y los links que todavía tienen cupos, con quién
 *   reclamó cada uno en vivo (la pantalla se refresca sola cuando un amigo reclama).
 * - la hoja que arma el link y ofrece mandarlo (WhatsApp, menú del teléfono, copiar, QR);
 * - `TicketShareHistory`: las entradas que ya pasaron de mano, para no perderles el rastro.
 */

/** Las dos credenciales del cliente: el comprobante de una compra o la sesión del evento. */
export type ShareCredentials =
  | { receiptToken: string }
  | { customerToken: string; eventId: string }

const JSON_HEADERS = { "Content-Type": "application/json" }

const numberFormat = new Intl.NumberFormat("es-AR")

function plural(count: number, one: string, many: string) {
  return `${numberFormat.format(count)} ${count === 1 ? one : many}`
}

function formatWhen(iso: string | null): string {
  if (!iso) return ""
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso))
}

/** El link que se manda: la misma URL pública que abre `/t/:token` en este mismo dominio. */
function shareUrl(token: string): string {
  return `${window.location.origin}/t/${encodeURIComponent(token)}`
}

function shareIntro(eventName: string): string {
  return `Te pasé una entrada para ${eventName} 🎟️\nReclamala con tus datos desde acá:`
}

const canNativeShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function"

async function copyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    toast.success("Link copiado")
  } catch {
    toast.error("No se pudo copiar el link")
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Panel: invitación a compartir + links activos + hoja
// ──────────────────────────────────────────────────────────────────────────────
export function TicketSharePanel({
  shares,
  credentials,
  eventName,
  onChanged,
}: {
  shares: TicketSharesInfo
  credentials: ShareCredentials
  eventName: string
  /** Vuelve a pedir el comprobante: se llama después de armar o cancelar un link. */
  onChanged: () => Promise<void> | void
}) {
  const activeLinks = shares.links.filter((link) => link.status === "ACTIVE")
  const [sheetOpen, setSheetOpen] = useState(false)
  const [linkInView, setLinkInView] = useState<string | null>(null)
  // El link recién armado se muestra antes de que el comprobante lo traiga de vuelta.
  const [justCreated, setJustCreated] = useState<TicketShareLink | null>(null)
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)

  // Avisa cuando un amigo reclama. La primera carga sólo toma la foto del estado: no avisa por lo
  // que ya estaba reclamado.
  const knownClaims = useRef<Map<string, number> | null>(null)
  useEffect(() => {
    const previous = knownClaims.current
    if (previous) {
      for (const link of shares.links) {
        const before = previous.get(link.id)
        if (before !== undefined && link.claims.length > before) {
          const who = link.claims[link.claims.length - 1]?.name ?? "Un amigo"
          toast.success(`${who} reclamó su entrada`)
        }
      }
    }
    knownClaims.current = new Map(shares.links.map((link) => [link.id, link.claims.length]))
  }, [shares.links])

  const linkForSheet =
    shares.links.find((link) => link.id === linkInView) ??
    (justCreated && justCreated.id === linkInView ? justCreated : null)

  const openCreate = () => {
    setLinkInView(null)
    setSheetOpen(true)
  }
  const openLink = (id: string) => {
    setLinkInView(id)
    setSheetOpen(true)
  }

  const cancelLink = async (link: TicketShareLink) => {
    if (cancelling) return
    setCancelling(link.id)
    try {
      await publicApiFetch(`/public/ticket-shares/${encodeURIComponent(link.id)}/cancel`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(credentials),
      })
      toast.success("Link cancelado")
      setConfirmCancel(null)
      await onChanged()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cancelar el link")
    } finally {
      setCancelling(null)
    }
  }

  const eligibleTotal = shares.eligible.reduce((sum, type) => sum + type.available, 0)

  if (!shares.canShare && activeLinks.length === 0) return null

  return (
    <>
      {shares.canShare ? (
        <section
          aria-label="Compartir entradas"
          className="flex items-center gap-4 rounded-2xl border border-white/[0.09] bg-white/[0.045] p-4"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] text-white/80">
            <Users className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold tracking-tight text-white">
              {eligibleTotal > 1 ? "Pasales entradas a tus amigos" : "Pasale tu entrada a un amigo"}
            </p>
            <p className="mt-0.5 text-[13px] leading-snug text-white/45">
              Mandás un link y cada uno reclama la suya con sus datos.
            </p>
          </div>
          <Button
            type="button"
            onClick={openCreate}
            className="h-10 shrink-0 rounded-xl bg-white px-4 font-semibold text-black hover:bg-zinc-200"
          >
            Compartir
          </Button>
        </section>
      ) : null}

      {activeLinks.map((link) => (
        <article
          key={link.id}
          className="rounded-2xl border border-white/[0.09] bg-white/[0.03] p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-white">
                Link · {plural(link.total, "entrada", "entradas")} {link.ticketTypeName}
              </p>
              <p className="mt-1 text-[13px] tabular-nums text-white/45">
                {link.claimed} de {link.total} {link.total === 1 ? "reclamada" : "reclamadas"}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300">
              Activo
            </span>
          </div>

          <div
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.08]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={link.total}
            aria-valuenow={link.claimed}
            aria-label="Entradas reclamadas"
          >
            <div
              className="h-full rounded-full bg-emerald-400 transition-[width] duration-500"
              style={{ width: `${link.total > 0 ? (link.claimed / link.total) * 100 : 0}%` }}
            />
          </div>

          {link.claims.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-1.5">
              {link.claims.map((claim, index) => (
                <li
                  key={`${claim.name}-${index}`}
                  className="flex items-center justify-between gap-3 text-[13px]"
                >
                  <span className="flex min-w-0 items-center gap-2 text-white/75">
                    <Check className="size-3.5 shrink-0 text-emerald-300" aria-hidden />
                    <span className="truncate">{claim.name}</span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-white/30">
                    {formatWhen(claim.claimedAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {confirmCancel === link.id ? (
            <div className="mt-4 rounded-xl bg-white/[0.05] p-3">
              <p className="text-[13px] leading-snug text-white/65">
                {plural(link.pending, "entrada sin reclamar vuelve", "entradas sin reclamar vuelven")}{" "}
                a ser tuya{link.pending === 1 ? "" : "s"}. Lo que ya reclamaron queda de ellos.
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  disabled={cancelling === link.id}
                  onClick={() => void cancelLink(link)}
                  className="h-10 flex-1 rounded-xl bg-red-500/90 font-semibold text-white hover:bg-red-500"
                >
                  {cancelling === link.id ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    "Sí, cancelar link"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={cancelling === link.id}
                  onClick={() => setConfirmCancel(null)}
                  className="h-10 rounded-xl px-4 text-white/70 hover:bg-white/10 hover:text-white"
                >
                  No
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex items-center gap-2">
              <Button
                type="button"
                onClick={() => openLink(link.id)}
                className="h-10 flex-1 rounded-xl bg-white font-semibold text-black hover:bg-zinc-200"
              >
                <Share2 className="size-4" aria-hidden />
                Compartir link
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmCancel(link.id)}
                className="h-10 rounded-xl px-4 text-white/55 hover:bg-white/10 hover:text-white"
              >
                Cancelar
              </Button>
            </div>
          )}
        </article>
      ))}

      {/* Al cerrar no se toca `linkInView`: el contenido no debe cambiar mientras la hoja se desliza.
          `openCreate` y `openLink` lo fijan cada vez que se abre. */}
      <ShareSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        shares={shares}
        credentials={credentials}
        eventName={eventName}
        link={linkForSheet}
        onCreated={async (share) => {
          setJustCreated(share)
          setLinkInView(share.id)
          await onChanged()
        }}
      />
    </>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Hoja: armar el link y mandarlo
// ──────────────────────────────────────────────────────────────────────────────
function ShareSheet({
  open,
  onOpenChange,
  shares,
  credentials,
  eventName,
  link,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  shares: TicketSharesInfo
  credentials: ShareCredentials
  eventName: string
  link: TicketShareLink | null
  onCreated: (share: TicketShareLink) => Promise<void>
}) {
  return (
    <AppleSheet
      open={open}
      onOpenChange={onOpenChange}
      title={link ? "Tu link está listo" : "Compartir entradas"}
      description={
        link
          ? "Mandalo al grupo: cada amigo reclama una entrada con sus datos."
          : "Elegí cuántas pasás. Recibís un único link para mandar al grupo."
      }
    >
      {link ? (
        <LinkReady link={link} eventName={eventName} />
      ) : (
        <CreateLink
          shares={shares}
          credentials={credentials}
          onCreated={onCreated}
        />
      )}
    </AppleSheet>
  )
}

function CreateLink({
  shares,
  credentials,
  onCreated,
}: {
  shares: TicketSharesInfo
  credentials: ShareCredentials
  onCreated: (share: TicketShareLink) => Promise<void>
}) {
  const defaultQuantity = (available: number) => (available >= 2 ? available - 1 : available)
  const first = shares.eligible[0]
  const [typeId, setTypeId] = useState(first?.ticketTypeId ?? "")
  const [quantity, setQuantity] = useState(first ? defaultQuantity(first.available) : 1)
  const [busy, setBusy] = useState(false)

  const selected = shares.eligible.find((type) => type.ticketTypeId === typeId) ?? first
  if (!selected) return null
  const max = selected.available
  const left = max - quantity

  const chooseType = (id: string) => {
    const type = shares.eligible.find((item) => item.ticketTypeId === id)
    if (!type) return
    setTypeId(id)
    setQuantity(defaultQuantity(type.available))
  }

  const create = async () => {
    if (busy) return
    setBusy(true)
    try {
      const response = await publicApiFetch<TicketShareCreateResponse>("/public/ticket-shares", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ ...credentials, ticketTypeId: selected.ticketTypeId, quantity }),
      })
      await onCreated(response.share)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo armar el link")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-7">
      {shares.eligible.length > 1 ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/45">Tipo de entrada</p>
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Tipo de entrada">
            {shares.eligible.map((type) => {
              const active = type.ticketTypeId === selected.ticketTypeId
              return (
                <button
                  key={type.ticketTypeId}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => chooseType(type.ticketTypeId)}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                    active
                      ? "border-white bg-white text-black"
                      : "border-white/[0.1] bg-white/[0.04] text-white hover:bg-white/[0.08]"
                  }`}
                >
                  <span className="font-semibold">{type.ticketTypeName}</span>
                  <span className={`text-sm tabular-nums ${active ? "text-black/60" : "text-white/45"}`}>
                    {plural(type.available, "disponible", "disponibles")}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <p className="text-sm text-white/55">
          <span className="font-semibold text-white">{selected.ticketTypeName}</span> ·{" "}
          {plural(max, "entrada disponible", "entradas disponibles")}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/45">
          ¿Cuántas entradas pasás?
        </p>
        <div className="flex items-center justify-center gap-6 py-1">
          <button
            type="button"
            disabled={quantity <= 1 || busy}
            onClick={() => setQuantity((value) => Math.max(1, value - 1))}
            className="flex size-12 items-center justify-center rounded-full border border-white/10 text-white/80 transition-colors hover:bg-white/10 disabled:opacity-25"
            aria-label="Una menos"
          >
            <Minus className="size-5" aria-hidden />
          </button>
          <span
            className="w-14 text-center text-5xl font-bold tabular-nums tracking-tight text-white"
            aria-live="polite"
          >
            {quantity}
          </span>
          <button
            type="button"
            disabled={quantity >= max || busy}
            onClick={() => setQuantity((value) => Math.min(max, value + 1))}
            className="flex size-12 items-center justify-center rounded-full bg-white text-black transition-opacity disabled:opacity-25"
            aria-label="Una más"
          >
            <Plus className="size-5" aria-hidden />
          </button>
        </div>
        <p className="text-center text-[13px] text-white/45">
          {left > 0
            ? `Te ${left === 1 ? "queda" : "quedan"} ${plural(left, "entrada", "entradas")} para vos.`
            : "Vas a pasar todas tus entradas de este tipo."}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Button
          type="button"
          disabled={busy}
          onClick={() => void create()}
          className="h-14 w-full rounded-2xl bg-white font-semibold text-black transition-all hover:bg-zinc-200"
        >
          {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : "Crear link"}
        </Button>
        <p className="text-center text-xs leading-relaxed text-white/35">
          Cada amigo completa su nombre, DNI y celular, y la entrada queda a su nombre: en la puerta
          entra con su DNI. Podés cancelar el link cuando quieras.
        </p>
      </div>
    </div>
  )
}

function LinkReady({ link, eventName }: { link: TicketShareLink; eventName: string }) {
  const url = shareUrl(link.token)
  const [qr, setQr] = useState<string | null>(null)
  const [showQr, setShowQr] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!showQr) return
    let cancelled = false
    QRCode.toDataURL(url, {
      width: 480,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#09090b", light: "#ffffff" },
    })
      .then((dataUrl) => {
        if (!cancelled) setQr(dataUrl)
      })
      .catch(() => {
        if (!cancelled) setQr(null)
      })
    return () => {
      cancelled = true
    }
  }, [showQr, url])

  const openWhatsApp = () => {
    const text = `${shareIntro(eventName)}\n${url}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer")
  }

  const nativeShare = async () => {
    try {
      await navigator.share({ title: eventName, text: shareIntro(eventName), url })
    } catch (e) {
      // Cerrar el menú del teléfono no es un error.
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        toast.error("No se pudo abrir el menú para compartir")
      }
    }
  }

  const copy = async () => {
    await copyLink(url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.06] px-4 py-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-white">
            {plural(link.total, "entrada", "entradas")} {link.ticketTypeName}
          </p>
          <p className="mt-0.5 text-xs tabular-nums text-white/45">
            {link.claimed} de {link.total} {link.total === 1 ? "reclamada" : "reclamadas"}
          </p>
        </div>
        <Users className="size-5 shrink-0 text-white/35" aria-hidden />
      </div>

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          onClick={openWhatsApp}
          className="h-14 w-full rounded-2xl bg-[#25D366] font-bold text-black hover:bg-[#3ae17a]"
        >
          <Send className="size-5" aria-hidden />
          Enviar por WhatsApp
        </Button>
        {canNativeShare() ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => void nativeShare()}
            className="h-12 w-full rounded-2xl bg-white/[0.08] font-semibold text-white hover:bg-white/[0.14]"
          >
            <Share2 className="size-4" aria-hidden />
            Compartir en otra app
          </Button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => void copy()}
        className="flex items-center gap-3 rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-left transition-colors hover:bg-white/[0.08]"
        aria-label="Copiar link"
      >
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-white/70">{url}</span>
        {copied ? (
          <Check className="size-4 shrink-0 text-emerald-300" aria-hidden />
        ) : (
          <Copy className="size-4 shrink-0 text-white/45" aria-hidden />
        )}
      </button>

      <div className="flex flex-col items-center gap-3">
        {showQr ? (
          <div className="rounded-2xl bg-white p-3">
            {qr ? (
              <img src={qr} alt="Código QR del link" className="size-48" width={192} height={192} />
            ) : (
              <div className="flex size-48 items-center justify-center text-zinc-400">
                <Loader2 className="size-5 animate-spin" aria-hidden />
              </div>
            )}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setShowQr((value) => !value)}
          className="flex items-center gap-2 text-[13px] font-medium text-white/45 transition-colors hover:text-white/75"
        >
          <QrCode className="size-4" aria-hidden />
          {showQr ? "Ocultar QR" : "Mostrar QR para escanear"}
        </button>
      </div>

      <p className="text-center text-xs leading-relaxed text-white/35">
        Cada persona puede reclamar una sola entrada. Las que nadie reclame siguen siendo tuyas y
        podés cancelar el link cuando quieras.
      </p>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Historial: entradas que ya pasaron de mano
// ──────────────────────────────────────────────────────────────────────────────
export function TicketShareHistory({ links }: { links: TicketShareLink[] }) {
  // Lo reclamado de los links que siguen activos ya se ve en su tarjeta.
  const given = links
    .filter((link) => link.status !== "ACTIVE")
    .flatMap((link) => link.claims.map((claim) => ({ ...claim, ticketTypeName: link.ticketTypeName })))
  if (given.length === 0) return null

  return (
    <section className="space-y-3" aria-label="Entradas que pasaste">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="text-lg font-bold tracking-tight text-white">Entradas que pasaste</h2>
        <span className="text-xs text-white/40">{given.length}</span>
      </div>
      <ul className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03]">
        {given.map((entry, index) => (
          <li
            key={`${entry.name}-${entry.claimedAt}-${index}`}
            className={`flex items-center justify-between gap-4 px-5 py-4 ${
              index > 0 ? "border-t border-white/[0.07]" : ""
            }`}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white">{entry.name}</span>
              <span className="mt-0.5 block text-xs text-white/40">{entry.ticketTypeName}</span>
            </span>
            <span className="shrink-0 text-xs tabular-nums text-white/35">
              {formatWhen(entry.claimedAt)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
