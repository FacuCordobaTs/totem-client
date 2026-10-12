import { AnimatePresence, motion } from "motion/react"
import { Bus, Check, Minus, Plus, Navigation } from "lucide-react"
import type { PublicTransport } from "@/types/api"
import { formatMoneyArsExact } from "@/lib/format"

export function TransportMap({
  transport
}: {
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
      <a
        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(point)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-semibold"
      >
        <Navigation className="size-4" />
        Cómo llegar al punto de salida
      </a>
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
      <p className="text-sm leading-relaxed text-white/60">
        Elegí desde dónde salir. Podés sumar hasta un pasaje por entrada o
        continuar sin transporte.
      </p>
      {transports.map((transport) => {
        const quantity = quantities[transport.id] ?? 0
        return (
          <motion.div
            layout
            key={transport.id}
            className={`overflow-hidden rounded-2xl border ${quantity ? "border-white/30 bg-white/10" : "border-white/10 bg-white/5"}`}
          >
            <button
              type="button"
              aria-pressed={quantity > 0}
              onClick={() =>
                onQuantity(
                  transport.id,
                  quantity ? 0 : selected < maxSeats ? 1 : 0
                )
              }
              className="flex w-full items-start gap-3 p-4 text-left"
            >
              <Bus className="mt-1 size-5 shrink-0 text-white/65" />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold">
                  {transport.name}
                </span>
                <span className="mt-1 block whitespace-normal text-sm text-white/60">
                  {transport.address}
                </span>
                <span className="mt-2 block text-sm font-semibold">
                  {formatMoneyArsExact(transport.price)} por persona
                </span>
              </span>
              {quantity > 0 && <Check className="size-5 shrink-0" />}
            </button>
            <AnimatePresence initial={false}>
              {quantity > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-4 px-4 pb-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-white/70">Pasajes</span>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          aria-label={`Quitar un pasaje de ${transport.name}`}
                          onClick={() => onQuantity(transport.id, quantity - 1)}
                          className="grid size-10 place-items-center rounded-full bg-white/10"
                        >
                          <Minus className="size-4" />
                        </button>
                        <span className="min-w-4 text-center font-semibold tabular-nums">
                          {quantity}
                        </span>
                        <button
                          type="button"
                          aria-label={`Sumar un pasaje de ${transport.name}`}
                          disabled={selected >= maxSeats}
                          onClick={() => onQuantity(transport.id, quantity + 1)}
                          className="grid size-10 place-items-center rounded-full bg-white/10 disabled:opacity-25"
                        >
                          <Plus className="size-4" />
                        </button>
                      </div>
                    </div>
                    <TransportMap transport={transport} />
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
