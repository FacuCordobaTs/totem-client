import { AnimatePresence, motion } from "motion/react"
import { Bus, Minus, Plus, Navigation } from "lucide-react"
import type { PublicTransport } from "@/types/api"
import { formatMoneyArsExact } from "@/lib/format"

export function TransportMap({
  transport,
  showDirections = true
}: {
  showDirections?: boolean
  transport: Pick<
    PublicTransport,
    "name" | "address" | "latitude" | "longitude"
  >
}) {
  const point = `${transport.latitude},${transport.longitude}`
  return (
    <div className="space-y-2">
      <iframe
        title={`Punto de salida de ${transport.name}: ${transport.address}`}
        src={`https://maps.google.com/maps?q=${encodeURIComponent(point)}&z=16&output=embed`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="h-44 w-full rounded-xl border-0"
      />
      {showDirections && <a
        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(point)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-semibold"
      >
        <Navigation className="size-4" />
        Cómo llegar al punto de salida
      </a>}
    </div>
  )
}

export function TransportPicker({
  transports,
  quantities,
  maxSeats,
  onQuantity
}: {
  transports: PublicTransport[]
  quantities: Record<string, number>
  maxSeats: number
  onQuantity: (id: string, quantity: number) => void
}) {
  const selected = Object.values(quantities).reduce(
    (sum, quantity) => sum + quantity,
    0
  )
  return (
    <div className="space-y-4">
      {transports.map((transport) => {
        const quantity = quantities[transport.id] ?? 0
        return (
          <motion.div
            layout
            key={transport.id}
            className={`overflow-hidden rounded-2xl transition-colors ${quantity ? "bg-white/[0.08]" : "bg-white/[0.04]"}`}
          >
            <div className="flex w-full items-stretch">
              <div className="flex w-14 shrink-0 items-center justify-center bg-white/[0.03]">
                <Bus className="size-6 text-white/60" strokeWidth={1.75} aria-hidden />
              </div>
              <motion.button
                type="button"
                disabled={selected >= maxSeats}
                onClick={() => onQuantity(transport.id, quantity + 1)}
                whileTap={selected >= maxSeats ? undefined : { scale: 0.985 }}
                aria-label={`Sumar un pasaje de ${transport.name}`}
                className="flex min-w-0 flex-1 items-center gap-3 px-4 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-white/30"
              >
                {quantity > 0 && <span className="flex shrink-0 items-center gap-1"><span className="text-[20px] font-bold leading-none tabular-nums text-white" aria-live="polite">{quantity}</span><span className="text-[13px] font-semibold text-white/35">x</span></span>}
                <span className="flex min-w-0 flex-1 flex-col justify-center">
                  <span className="whitespace-normal text-[16px] font-bold leading-tight tracking-tight text-white [overflow-wrap:anywhere]">{transport.name}</span>
                  <span className="mt-1 whitespace-normal text-sm text-white/60">{transport.address}</span>
                  <span className="mt-1 text-[14px] font-semibold tabular-nums text-white/60">{formatMoneyArsExact(transport.price)} por persona</span>
                </span>
              </motion.button>
              <div className="flex w-12 shrink-0 flex-col justify-center border-l border-white/10">
                <motion.button
                  type="button"
                  disabled={selected >= maxSeats}
                  onClick={() => onQuantity(transport.id, quantity + 1)}
                  whileTap={selected >= maxSeats ? undefined : { scale: 0.96 }}
                  aria-label={`Sumar un pasaje de ${transport.name}`}
                  className="flex min-h-11 flex-1 items-center justify-center text-white outline-none transition-colors hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-25"
                >
                  <Plus className="size-6" strokeWidth={2.5} aria-hidden />
                </motion.button>
                {quantity > 0 && <motion.button
                  type="button"
                  onClick={() => onQuantity(transport.id, quantity - 1)}
                  whileTap={{ scale: 0.96 }}
                  aria-label={`Quitar un pasaje de ${transport.name}`}
                  className="flex min-h-11 flex-1 items-center justify-center border-t border-white/10 text-white/60 outline-none transition-colors hover:bg-white/[0.05] hover:text-white/90 focus-visible:ring-2 focus-visible:ring-white/25"
                >
                  <Minus className="size-5" aria-hidden />
                </motion.button>}
              </div>
            </div>
            <AnimatePresence initial={false}>
              {quantity > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-4 px-4 pb-4">
                    <TransportMap transport={transport} showDirections={false} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )
      })}
    </div>
  )
}
