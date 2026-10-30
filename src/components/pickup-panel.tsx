import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router"
import { ArrowRight, Loader2, QrCode } from "lucide-react"
import { motion } from "motion/react"
import { toast } from "sonner"
import { ConsumptionRow } from "@/components/consumption-menu"
import { publicApiFetch } from "@/lib/api"
import { buildPickupOverview, pickupQuantity } from "@/lib/pickup-groups"
import type { PickupApiResponse, ReceiptApiResponse } from "@/types/api"

/**
 * Retiro en barra: lo comprado ya viene elegido, un toque genera el QR. Si no se lleva todo, baja
 * cantidades; lo que queda sigue guardado. Las órdenes ya generadas van primero: es lo único que
 * importa cuando el cliente vuelve a abrir la pantalla en la fila de la barra.
 */
export function PickupPanel({
  data,
  receiptToken,
  onBuyMore,
  onOrderCreated,
}: {
  data: ReceiptApiResponse
  receiptToken: string | null
  onBuyMore?: () => void
  /** Se llama después de crear una orden y antes de ir a su QR. */
  onOrderCreated?: () => void
}) {
  const navigate = useNavigate()
  const { activeOrders, groups, retired } = useMemo(
    () => buildPickupOverview(data.consumptions, data.pickups),
    [data.consumptions, data.pickups]
  )
  const [overrides, setOverrides] = useState<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)

  // Con una orden ya armada el cliente viene a mostrarla: lo demás no se preselecciona.
  const defaultToAll = activeOrders.length === 0
  const quantities = Object.fromEntries(
    groups.map((group) => [group.productId, pickupQuantity(group, overrides, defaultToAll)])
  )
  const selectedTotal = Object.values(quantities).reduce((total, quantity) => total + quantity, 0)
  const orderQuery = receiptToken ? `?receipt=${encodeURIComponent(receiptToken)}` : ""

  const setQuantity = (productId: string, quantity: number) =>
    setOverrides((current) => ({ ...current, [productId]: quantity }))

  const createOrder = async () => {
    if (!receiptToken || selectedTotal === 0 || submitting) return
    const consumptionIds = groups.flatMap((group) =>
      group.availableIds.slice(0, quantities[group.productId] ?? 0)
    )
    setSubmitting(true)
    try {
      const order = await publicApiFetch<PickupApiResponse>("/public/pickups", {
        method: "POST",
        body: JSON.stringify({ receiptToken, consumptionIds }),
        headers: { "Content-Type": "application/json" },
      })
      onOrderCreated?.()
      navigate(`/retiro/${encodeURIComponent(order.token)}${orderQuery}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo generar el QR. Probá de nuevo.")
    } finally {
      setSubmitting(false)
    }
  }

  const nothingLeft = activeOrders.length === 0 && groups.length === 0

  return (
    <div className={`flex flex-col gap-8 ${selectedTotal > 0 ? "pb-24" : ""}`}>
      {activeOrders.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {activeOrders.map((order) => (
            <li key={order.token}>
              <Link
                to={`/retiro/${encodeURIComponent(order.token)}${orderQuery}`}
                className="flex items-center gap-4 rounded-2xl bg-white px-4 py-4 text-black outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black active:bg-zinc-200"
              >
                <QrCode className="size-8 shrink-0" strokeWidth={1.75} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-bold leading-tight">Mostrar QR</span>
                  <span className="mt-1 block text-sm font-medium leading-snug text-black/70">
                    {order.items.map((item) => `${item.quantity} ${item.productName}`).join(" · ")}
                  </span>
                </span>
                <ArrowRight className="size-5 shrink-0" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {groups.length > 0 ? (
        <section aria-label="Productos para retirar">
          {activeOrders.length > 0 ? (
            <h2 className="pb-1 text-lg font-bold tracking-tight text-white">También tenés</h2>
          ) : null}
          <ul>
            {groups.map((group) => {
              const quantity = quantities[group.productId] ?? 0
              const available = group.availableIds.length
              return (
                <ConsumptionRow
                  key={group.productId}
                  name={group.name}
                  detail={available > 1 ? `de ${available}` : ""}
                  count={quantity}
                  canAdd={quantity < available}
                  onAdd={() => setQuantity(group.productId, quantity + 1)}
                  onRemove={() => setQuantity(group.productId, quantity - 1)}
                />
              )
            })}
          </ul>
          {selectedTotal > 0 && selectedTotal < groups.reduce((sum, g) => sum + g.availableIds.length, 0) ? (
            <p className="pt-3 text-sm text-white/60">Lo que no retires queda guardado.</p>
          ) : null}
        </section>
      ) : null}

      {nothingLeft ? (
        <p className="text-[17px] leading-snug text-white/70">
          {retired.length > 0 ? "Ya retiraste todo lo que compraste." : "Todavía no compraste consumos."}
        </p>
      ) : null}

      {retired.length > 0 ? (
        <p className="text-sm leading-relaxed text-white/60">
          Ya retirado: {retired.map((line) => `${line.quantity} ${line.name}`).join(" · ")}
        </p>
      ) : null}

      {onBuyMore && nothingLeft ? (
        <button
          type="button"
          onClick={onBuyMore}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-[17px] font-bold text-black outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/50 active:bg-zinc-200"
        >
          Comprar consumos
          <ArrowRight className="size-5" aria-hidden />
        </button>
      ) : null}

      {selectedTotal > 0 ? (
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-black via-black to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8"
        >
          <div className="mx-auto max-w-lg">
            <button
              type="button"
              disabled={submitting}
              onClick={() => void createOrder()}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-[17px] font-bold text-black shadow-[0_8px_30px_rgba(0,0,0,0.6)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black active:bg-zinc-200 disabled:bg-white/70"
            >
              {submitting ? (
                <Loader2 className="size-5 animate-spin" aria-label="Generando QR" />
              ) : (
                <>
                  <QrCode className="size-5" aria-hidden />
                  Generar QR · {selectedTotal} {selectedTotal === 1 ? "producto" : "productos"}
                </>
              )}
            </button>
          </div>
        </motion.div>
      ) : null}
    </div>
  )
}
