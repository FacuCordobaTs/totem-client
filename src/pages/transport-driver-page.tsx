import { useCallback, useEffect, useState } from "react"
import { useParams } from "react-router"
import {
  Bus,
  Check,
  Loader2,
  RefreshCw,
  Search,
  MapPin
} from "lucide-react"
import { ApiError, publicApiFetch } from "@/lib/api"
import { formatEventDate } from "@/lib/format"
import {
  boardingCount,
  driverStorageKey,
  matchesPassenger,
  readDriverState
} from "@/lib/transport-boarding"
import type { DriverManifestState } from "@/lib/transport-boarding"
import type { TransportManifestResponse } from "@/types/api"

export function TransportDriverPage() {
  const { token } = useParams<{ token: string }>()
  return token ? <DriverManifest key={token} token={token} /> : null
}

function DriverManifest({ token }: { token: string }) {
  const [state, setState] = useState<DriverManifestState | null>(() =>
    readDriverState(token)
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [storageError, setStorageError] = useState(false)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<"all" | "pending" | "boarded">("all")

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setError(null)
      try {
        if (!/^[a-f0-9]{64}$/.test(token))
          throw new ApiError("Este link no está disponible", 404, null)
        const manifest = await publicApiFetch<TransportManifestResponse>(
          `/public/transport-manifests/${encodeURIComponent(token)}`,
          { signal, cache: "no-store", referrerPolicy: "no-referrer" }
        )
        if (signal?.aborted) return
        setState(() => ({
          manifest,
          updatedAt: new Date().toISOString()
        }))
      } catch (err) {
        if (signal?.aborted) return
        if (err instanceof ApiError && err.status === 404) {
          setState(null)
          try {
            localStorage.removeItem(driverStorageKey(token))
            localStorage.removeItem(`crow_driver_manifest_v1:${token}`)
          } catch {
            /* storage may be unavailable */
          }
          setError(
            "Este link fue desactivado o no está disponible. Pedí un nuevo link a la organización."
          )
        } else
          setError(
            "No pudimos actualizar la lista. Si ya la abriste antes, podés seguir con la lista guardada."
          )
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [token]
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  useEffect(() => {
    if (!state) return
    try {
      localStorage.setItem(driverStorageKey(token), JSON.stringify(state))
      setStorageError(false)
    } catch {
      setStorageError(true)
    }
  }, [state, token])

  useEffect(() => {
    const robots = document.createElement("meta")
    robots.name = "robots"
    robots.content = "noindex,nofollow"
    const referrer = document.createElement("meta")
    referrer.name = "referrer"
    referrer.content = "no-referrer"
    document.head.append(robots, referrer)
    return () => {
      robots.remove()
      referrer.remove()
    }
  }, [])

  if (!state)
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-5 px-6 text-center">
        <Bus className="size-10 text-white/45" />
        {loading ? (
          <>
            <Loader2 className="size-5 animate-spin" />
            <p className="text-white/60">Cargando pasajeros…</p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold">Lista no disponible</h1>
            <p role="alert" className="text-sm leading-relaxed text-white/60">
              {error}
            </p>
            <button
              onClick={() => void load()}
              className="rounded-full bg-white px-6 py-3 font-semibold text-black"
            >
              Reintentar
            </button>
          </>
        )}
      </main>
    )

  const { manifest } = state
  const passengers = manifest.passengers
  const total = passengers.reduce((sum, p) => sum + p.quantity, 0)
  const onBoard = passengers.reduce(
    (sum, p) => sum + boardingCount(p),
    0
  )
  const visible = passengers.filter((p) => {
    const count = boardingCount(p)
    return (
      matchesPassenger(p, query) &&
      (filter === "all" ||
        (filter === "pending" ? count < p.quantity : count === p.quantity))
    )
  })
  const point = encodeURIComponent(
    `${manifest.transport.latitude},${manifest.transport.longitude}`
  )

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 pb-12 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6">
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-white/50">
            <Bus className="size-5" />
            Lista de pasajeros
          </span>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          {manifest.transport.name}
        </h1>
        <p className="text-sm text-white/60">
          {manifest.event.name} · {formatEventDate(manifest.event.date)}
        </p>
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${point}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-start gap-2 text-sm text-white/70"
        >
          <MapPin className="mt-0.5 size-4 shrink-0" />
          {manifest.transport.address}
        </a>
      </header>
      <div className="grid grid-cols-3 gap-2" aria-live="polite">
        {[
          ["Pasajes", total],
          ["Subieron", onBoard],
          ["Faltan", total - onBoard]
        ].map(([label, count]) => (
          <div key={label} className="rounded-2xl bg-white/5 p-4">
            <p className="text-2xl font-bold tabular-nums">{count}</p>
            <p className="mt-1 text-xs text-white/50">{label}</p>
          </div>
        ))}
      </div>
      <p className="text-xs leading-relaxed text-white/45">
        Las subidas se registran al escanear el QR desde la cuenta del transportista. Esta lista muestra el estado del servidor y guarda una copia para consultar sin conexión.
      </p>
      {storageError && (
        <p
          role="alert"
          className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-200"
        >
          Este navegador no permite guardar una copia de la lista.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-200"
        >
          {error}
        </p>
      )}
      <section className="sticky top-0 z-10 space-y-3 bg-black pb-3 pt-2">
        <label className="relative block">
          <span className="sr-only">
            Buscar pasajero por nombre, DNI o celular
          </span>
          <Search className="absolute left-4 top-3.5 size-5 text-white/40" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nombre, DNI o celular"
            className="h-12 w-full rounded-xl border border-white/15 bg-[#141414] pl-12 pr-4 text-base outline-none focus:border-white/40"
          />
        </label>
        <div className="flex gap-2" aria-label="Filtrar pasajeros">
          {(
            [
              ["all", "Todos"],
              ["pending", "Pendientes"],
              ["boarded", "Subieron"]
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${filter === value ? "bg-white text-black" : "bg-white/5 text-white/60"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>
      <section aria-label="Pasajeros" className="space-y-3">
        {visible.length === 0 ? (
          <p className="rounded-2xl border border-white/10 px-5 py-8 text-center text-sm text-white/50">
            {passengers.length === 0
              ? "Todavía no hay pasajes pagados para esta salida."
              : "No hay pasajeros que coincidan con esta búsqueda o filtro."}
          </p>
        ) : (
          visible.map((p) => {
            const count = boardingCount(p)
            const complete = count === p.quantity
            return (
              <article
                key={p.id}
                className={`rounded-2xl border p-4 ${complete ? "border-emerald-500/25 bg-emerald-500/5" : "border-white/10 bg-white/[0.03]"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words text-lg font-semibold">
                      {p.name}
                    </h2>
                    <p className="mt-1 text-sm text-white/55">
                      DNI {p.dni ?? "sin registrar"}
                    </p>
                    {p.phone && (
                      <a
                        href={`tel:${p.phone.replace(/[^+\d]/g, "")}`}
                        className="mt-1 inline-block text-sm text-white/60"
                      >
                        {p.phone}
                      </a>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${complete ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-white/60"}`}
                  >
                    {p.quantity} {p.quantity === 1 ? "pasaje" : "pasajes"}
                  </span>
                </div>
                <p className="mt-4 flex items-center gap-2 text-sm font-semibold"><Check className="size-4" />{complete ? "Ya subió" : "Pendiente de subir"}</p>
              </article>
            )
          })
        )}
      </section>
      <p className="text-center text-xs text-white/35">
        Última actualización:{" "}
        {new Date(state.updatedAt).toLocaleString("es-AR")}
      </p>
    </main>
  )
}
