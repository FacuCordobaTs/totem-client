import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { Loader2, Minus, Plus } from "lucide-react"
import { toast } from "sonner"
import { AnimatePresence, motion } from "motion/react"
import { publicApiFetch } from "@/lib/api"
import type { PickupApiResponse, ReceiptApiResponse } from "@/types/api"
import { Button } from "@/components/ui/button"
import { formatMoneyArsExact } from "@/lib/format"

/**
 * Retiro en barra (tarea 4.1 — visión §2.5): "¿Qué te llevás ahora?".
 * El cliente elige cuántos tragos comprados y no canjeados se lleva en este viaje; al
 * confirmar, el backend arma UN pedido y acá lo manda a la página del QR. Lo no retirado
 * sigue PENDING en el comprobante: este flujo nunca "gasta" consumiciones.
 */
export function RetirarPage() {
  const { receiptToken } = useParams<{ receiptToken: string }>()
  const navigate = useNavigate()

  const [data, setData] = useState<ReceiptApiResponse | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [selected, setSelected] = useState<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!receiptToken) return
    let cancelled = false
    publicApiFetch<ReceiptApiResponse>(`/public/receipts/${receiptToken}`)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch(() => {
        if (!cancelled) setNotFound(true)
      })
    return () => {
      cancelled = true
    }
  }, [receiptToken])

  // Consumiciones PENDING agrupadas por producto, con los ids de cada unidad. Las unidades
  // de un mismo producto son indistinguibles: el pedido toma las N primeras.
  const groups = useMemo(() => {
    const pending = (data?.consumptions ?? []).filter((c) => c.status === "PENDING")
    const byProduct = new Map<
      string,
      { productId: string; name: string; price: string; ids: string[] }
    >()
    for (const c of pending) {
      const g = byProduct.get(c.product.id)
      if (g) {
        g.ids.push(c.id)
      } else {
        byProduct.set(c.product.id, {
          productId: c.product.id,
          name: c.product.name,
          price: c.product.price,
          ids: [c.id],
        })
      }
    }
    return [...byProduct.values()]
  }, [data])

  const totalSelected = Object.values(selected).reduce((a, b) => a + b, 0)

  const bump = (productId: string, max: number) =>
    setSelected((prev) => ({
      ...prev,
      [productId]: Math.min(max, (prev[productId] ?? 0) + 1),
    }))

  const trim = (productId: string) =>
    setSelected((prev) => {
      const next = (prev[productId] ?? 0) - 1
      const copy = { ...prev }
      if (next <= 0) delete copy[productId]
      else copy[productId] = next
      return copy
    })

  const handleConfirm = async () => {
    if (!receiptToken || totalSelected === 0 || submitting) return
    const consumptionIds: string[] = []
    for (const g of groups) {
      const qty = selected[g.productId] ?? 0
      for (let i = 0; i < Math.min(qty, g.ids.length); i++) {
        consumptionIds.push(g.ids[i])
      }
    }
    setSubmitting(true)
    try {
      const res = await publicApiFetch<PickupApiResponse>("/public/pickups", {
        method: "POST",
        body: JSON.stringify({ receiptToken, consumptionIds }),
        headers: { "Content-Type": "application/json" },
      })
      navigate(`/retiro/${res.token}?receipt=${encodeURIComponent(receiptToken)}`, {
        replace: true,
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el pedido")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-dvh pb-40">
      <div className="mx-auto flex max-w-lg flex-col gap-8 px-6 pt-10 sm:px-8">
        <header className="flex flex-col gap-1.5">
          <Button
            variant="ghost"
            className="-ml-2 w-fit rounded-xl px-3 text-sm text-[#8E8E93] hover:bg-white/5 hover:text-white"
            type="button"
            onClick={() => navigate(-1)}
          >
            Cerrar
          </Button>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-white">
            Retirar tragos
          </h1>
          <p className="text-[14px] leading-relaxed text-white/55">
            ¿Qué te llevás ahora? Elegí y te generamos un solo código para la barra.
            Lo que no retires queda guardado para más tarde.
          </p>
        </header>

        {notFound ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-6 py-8 text-center">
            <p className="text-lg font-semibold tracking-tight text-white">
              Comprobante no encontrado
            </p>
            <p className="mx-auto max-w-[260px] text-sm leading-relaxed text-white/50">
              Revisá el link de tu compra e intentá de nuevo.
            </p>
          </div>
        ) : !data ? (
          <div className="flex items-center justify-center py-24 text-white/40">
            <Loader2 className="size-6 animate-spin" aria-hidden />
          </div>
        ) : !data.sale.paid ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-6 py-8 text-center">
            <p className="text-lg font-semibold tracking-tight text-white">
              Pago pendiente
            </p>
            <p className="mx-auto max-w-[260px] text-sm leading-relaxed text-white/50">
              Cuando se acredite tu pago podés retirar tus tragos en la barra.
            </p>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-6 py-10 text-center">
            <p className="text-lg font-semibold tracking-tight text-white">
              No tenés tragos pendientes
            </p>
            <p className="mx-auto max-w-[260px] text-sm leading-relaxed text-white/50">
              Todos tus consumos ya fueron canjeados. Si querés más, compralos desde
              el comprobante.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {groups.map((g) => {
              const qty = selected[g.productId] ?? 0
              return (
                <li
                  key={g.productId}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.04] px-5 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold leading-snug text-white">
                      {g.name}
                    </p>
                    <p className="mt-1 text-sm tabular-nums text-white/50">
                      {formatMoneyArsExact(g.price)} · tenés {g.ids.length}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      type="button"
                      disabled={qty === 0}
                      onClick={() => trim(g.productId)}
                      className="flex size-9 items-center justify-center rounded-full border border-white/[0.12] text-white/70 outline-none transition-colors hover:bg-white/[0.06] hover:text-white disabled:pointer-events-none disabled:opacity-30"
                      aria-label={`Sacar un ${g.name}`}
                    >
                      <Minus className="size-4" />
                    </button>
                    <span className="min-w-[1.5rem] text-center text-lg font-bold tabular-nums text-white">
                      {qty}
                    </span>
                    <button
                      type="button"
                      disabled={qty >= g.ids.length}
                      onClick={() => bump(g.productId, g.ids.length)}
                      className="flex size-9 items-center justify-center rounded-full bg-white text-black outline-none transition-transform hover:scale-[1.04] active:scale-95 disabled:pointer-events-none disabled:opacity-30"
                      aria-label={`Sumar un ${g.name}`}
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <AnimatePresence>
        {data?.sale.paid === true && groups.length > 0 ? (
          <motion.div
            key="retirar-bar"
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-0 left-0 right-0 z-40 bg-black/40 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-lg supports-[backdrop-filter]:bg-black/40 sm:px-8"
          >
            <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-white/65">
                  {totalSelected > 0
                    ? `${totalSelected} ${totalSelected === 1 ? "trago" : "tragos"} para retirar`
                    : "Elegí qué retirás ahora"}
                </span>
                <span className="text-xl font-bold tabular-nums tracking-tight text-white">
                  {totalSelected}
                </span>
              </div>
              <Button
                className="h-14 w-full rounded-2xl bg-white font-semibold text-black transition-all disabled:shadow-none"
                disabled={submitting || totalSelected === 0}
                onClick={() => void handleConfirm()}
              >
                {submitting ? (
                  <Loader2 className="size-6 animate-spin" aria-hidden />
                ) : (
                  "Generar código de retiro"
                )}
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
