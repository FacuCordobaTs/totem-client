import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router"
import { ArrowUpRight, Check, Loader2 } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { PickupPanel } from "@/components/pickup-panel"
import { eventAccessPath } from "@/lib/access-path"
import { publicApiFetch, publicWebSocketUrl } from "@/lib/api"
import { formatMenuPrice } from "@/lib/format"
import {
  markQuickPurchasePaid,
  paymentUrlForReceipt,
  PENDING_PAYMENT_WINDOW_MS,
} from "@/lib/quick-purchase"
import type { ReceiptApiResponse } from "@/types/api"

const POLL_MS = 3_000
const SYNC_EVERY_MS = 6_000

/**
 * A donde llega el cliente después de elegir productos: al volver de Mercado Pago, al volver a la
 * pestaña o al reabrir el link. Mientras la venta se acredita le pregunta al backend, que a su vez
 * confirma contra Mercado Pago; apenas está cobrada, se transforma en el retiro en barra.
 */
export function RetirarPage() {
  const { receiptToken } = useParams<{ receiptToken: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [data, setData] = useState<ReceiptApiResponse | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [justPaid, setJustPaid] = useState(false)
  // La preferencia de Mercado Pago ya venció: no hay pago en camino que esperar.
  const [paymentExpired, setPaymentExpired] = useState(false)
  const wasPendingRef = useRef(false)

  const load = useCallback(async () => {
    if (!receiptToken) return
    try {
      const receipt = await publicApiFetch<ReceiptApiResponse>(
        `/public/receipts/${encodeURIComponent(receiptToken)}`
      )
      // Verla pasar de pendiente a cobrada en esta pantalla es lo que muestra "Pago acreditado".
      if (receipt.sale?.paid && wasPendingRef.current) setJustPaid(true)
      wasPendingRef.current = receipt.sale?.status === "PENDING" && !receipt.sale.paid
      const startedAt = receipt.sale?.createdAt ? new Date(receipt.sale.createdAt).getTime() : null
      setPaymentExpired(startedAt != null && Date.now() - startedAt > PENDING_PAYMENT_WINDOW_MS)
      setData(receipt)
      setNotFound(false)
    } catch {
      setData((current) => {
        if (!current) setNotFound(true)
        return current
      })
    }
  }, [receiptToken])

  // El dato manda el backend: cualquier regreso a esta pestaña vuelve a consultar. `pageshow`
  // cubre el botón atrás, que puede restaurar la página congelada sin volver a montarla.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- consulta externa; el estado llega al resolver.
    void load()
    const refresh = () => {
      if (document.visibilityState === "visible") void load()
    }
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void load()
    }
    document.addEventListener("visibilitychange", refresh)
    window.addEventListener("focus", refresh)
    window.addEventListener("pageshow", onPageShow)
    return () => {
      document.removeEventListener("visibilitychange", refresh)
      window.removeEventListener("focus", refresh)
      window.removeEventListener("pageshow", onPageShow)
    }
  }, [load])

  useEffect(() => {
    if (!receiptToken) return
    let disposed = false
    let socket: WebSocket | null = null
    let retry: number | null = null
    const connect = () => {
      socket = new WebSocket(
        publicWebSocketUrl(`/ws/public/receipts/${encodeURIComponent(receiptToken)}`)
      )
      socket.onmessage = () => void load()
      socket.onclose = () => {
        if (!disposed) retry = window.setTimeout(connect, 3_000)
      }
    }
    connect()
    return () => {
      disposed = true
      if (retry != null) window.clearTimeout(retry)
      socket?.close()
    }
  }, [load, receiptToken])

  const sale = data?.sale ?? null
  const awaitingPayment = sale != null && !sale.paid && sale.status === "PENDING"

  useEffect(() => {
    if (!awaitingPayment || !receiptToken) return
    const startedAt = Date.now()
    const sync = () => {
      if (document.visibilityState !== "visible") return
      void publicApiFetch(`/public/receipts/${encodeURIComponent(receiptToken)}/sync-payment`, {
        method: "POST",
      })
        .then(() => load())
        .catch(() => {
          /* El webhook y el sondeo siguen: esta consulta sólo adelanta la acreditación. */
        })
    }
    sync()
    const poll = window.setInterval(() => void load(), POLL_MS)
    const syncTimer = window.setInterval(() => {
      if (Date.now() - startedAt < PENDING_PAYMENT_WINDOW_MS) sync()
    }, SYNC_EVERY_MS)
    document.addEventListener("visibilitychange", sync)
    return () => {
      window.clearInterval(poll)
      window.clearInterval(syncTimer)
      document.removeEventListener("visibilitychange", sync)
    }
  }, [awaitingPayment, load, receiptToken])

  const paid = sale?.paid === true
  const eventId = data?.event.id
  const eventSlug = data?.event.slug
  useEffect(() => {
    if (!paid || !receiptToken || !eventId) return
    markQuickPurchasePaid({ eventKeys: [eventId, eventSlug], receiptToken })
  }, [paid, receiptToken, eventId, eventSlug])

  const menuPath = data ? eventAccessPath(eventSlug ?? data.event.id, { carta: true }) : null
  const paymentUrl =
    receiptToken && data ? paymentUrlForReceipt(receiptToken, [data.event.id, data.event.slug]) : null
  const mpReturnStatus = searchParams.get("collection_status") ?? searchParams.get("status")
  const paymentNotCompleted =
    paymentExpired || mpReturnStatus === "rejected" || mpReturnStatus === "cancelled" || mpReturnStatus === "null"

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-10">
      <header className="flex min-h-14 items-center justify-between gap-4 pt-[env(safe-area-inset-top)]">
        <p className="min-w-0 truncate text-[15px] font-semibold text-white/70">{data?.event.name ?? ""}</p>
        {paid && menuPath ? (
          <Link
            to={menuPath}
            className="flex h-11 shrink-0 items-center text-[15px] font-semibold text-white underline decoration-white/30 underline-offset-4"
          >
            Comprar más
          </Link>
        ) : null}
      </header>

      {notFound ? (
        <PaymentMessage
          title="No encontramos esta compra"
          body="Revisá que el link esté completo."
        />
      ) : !data ? (
        <div role="status" aria-label="Cargando" className="flex flex-1 items-center justify-center text-white/60">
          <Loader2 className="size-6 animate-spin" aria-hidden />
        </div>
      ) : !sale || paid ? (
        <>
          <div className="pb-6 pt-6">
            <AnimatePresence initial={false}>
              {justPaid ? (
                <motion.p
                  key="paid"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="flex items-center gap-1.5 pb-2 text-[15px] font-semibold text-emerald-300"
                >
                  <Check className="size-4" strokeWidth={3} aria-hidden />
                  Pago acreditado
                </motion.p>
              ) : null}
            </AnimatePresence>
            <h1 className="text-[2rem] font-black leading-none tracking-[-0.03em] text-white">
              Retirá en la barra
            </h1>
          </div>
          <PickupPanel
            data={data}
            receiptToken={receiptToken ?? null}
            onBuyMore={menuPath ? () => navigate(menuPath) : undefined}
          />
        </>
      ) : awaitingPayment ? (
        <PaymentMessage
          busy={!paymentNotCompleted}
          title={paymentNotCompleted ? "El pago no se completó" : "Confirmando tu pago"}
          body={`${formatMenuPrice(sale.totalAmount)}. ${
            paymentNotCompleted
              ? paymentExpired ? "No se te cobró. Armá el pedido de nuevo." : "No se te cobró. Podés intentar de nuevo."
              : "Cuando se acredite vas a poder retirar acá mismo."
          }`}
          actions={
            <>
              {paymentUrl && !paymentExpired ? (
                <a
                  href={paymentUrl}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-[17px] font-bold text-black outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/50 active:bg-zinc-200"
                >
                  {paymentNotCompleted ? "Intentar de nuevo" : "Volver a Mercado Pago"}
                  <ArrowUpRight className="size-5" aria-hidden />
                </a>
              ) : null}
              {menuPath ? (
                <Link
                  to={menuPath}
                  className="flex h-12 w-full items-center justify-center text-[15px] font-semibold text-white/70"
                >
                  Cambiar el pedido
                </Link>
              ) : null}
            </>
          }
        />
      ) : (
        <PaymentMessage
          title="El pago no se completó"
          body="No se te cobró. Tu pedido sigue en la carta para intentar de nuevo."
          actions={
            menuPath ? (
              <Link
                to={menuPath}
                className="flex h-14 w-full items-center justify-center rounded-2xl bg-white text-[17px] font-bold text-black outline-none focus-visible:ring-2 focus-visible:ring-white/50 active:bg-zinc-200"
              >
                Volver a la carta
              </Link>
            ) : null
          }
        />
      )}
    </main>
  )
}

function PaymentMessage({
  title,
  body,
  busy = false,
  actions,
}: {
  title: string
  body: string
  busy?: boolean
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-8 pb-16" aria-live="polite">
      <div className="flex flex-col gap-3">
        {busy ? <Loader2 className="size-7 animate-spin text-white" aria-hidden /> : null}
        <h1 className="text-[2rem] font-black leading-[1.05] tracking-[-0.03em] text-white">{title}</h1>
        <p className="text-[17px] leading-snug text-white/70">{body}</p>
      </div>
      {actions ? <div className="flex flex-col gap-2">{actions}</div> : null}
    </div>
  )
}
