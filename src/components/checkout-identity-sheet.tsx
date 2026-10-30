import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router"
import { ArrowRight } from "lucide-react"
import { AppleSheet } from "@/components/apple-sheet"
import { Button } from "@/components/ui/button"
import { isValidBuyerIdentity, useBuyerStore } from "@/stores/buyer-store"

/**
 * Drawer global de identidad para comprar sin cuenta: nombre y DNI, nada más. La tienda lo abre
 * al tocar "Continuar al pago"; al confirmar guarda la identidad y navega al checkout, que ya no
 * vuelve a pedir contacto (email ni teléfono).
 */
export function CheckoutIdentitySheet() {
  const navigate = useNavigate()
  const open = useBuyerStore((state) => state.sheetOpen)
  const pendingPath = useBuyerStore((state) => state.pendingPath)
  const savedName = useBuyerStore((state) => state.name)
  const savedDni = useBuyerStore((state) => state.dni)
  const setIdentity = useBuyerStore((state) => state.setIdentity)
  const closeSheet = useBuyerStore((state) => state.closeSheet)

  return (
    <AppleSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) closeSheet()
      }}
      title="Tus datos"
      description="Sólo tu nombre y DNI: con eso te identificamos en el evento."
    >
      {open ? (
        <IdentityForm
          // Cada apertura parte de lo último usado: si ya compró antes, sólo confirma.
          initialName={savedName}
          initialDni={savedDni}
          onSubmit={(identity) => {
            setIdentity(identity)
            const destination = pendingPath
            closeSheet()
            if (destination) navigate(destination)
          }}
        />
      ) : null}
    </AppleSheet>
  )
}

function IdentityForm({
  initialName,
  initialDni,
  onSubmit,
}: {
  initialName: string
  initialDni: string
  onSubmit: (identity: { name: string; dni: string }) => void
}) {
  const [name, setName] = useState(initialName)
  const [dni, setDni] = useState(initialDni)
  const valid = isValidBuyerIdentity(name, dni)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!valid) return
    onSubmit({ name, dni })
  }

  return (
    <form onSubmit={submit}>
      <label
        htmlFor="buyer-name"
        className="block text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45"
      >
        Nombre y apellido
      </label>
      <input
        id="buyer-name"
        type="text"
        autoComplete="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Tu nombre"
        autoFocus={!name}
        className="mt-3 w-full border-0 border-b border-white/[0.12] bg-transparent px-0 py-3 text-xl font-semibold text-white outline-none transition-colors placeholder:text-white/25 focus:border-white"
      />
      <label
        htmlFor="buyer-dni"
        className="mt-7 block text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45"
      >
        DNI
      </label>
      <input
        id="buyer-dni"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={9}
        value={dni}
        onChange={(event) => setDni(event.target.value.replace(/\D/g, "").slice(0, 9))}
        placeholder="30123456"
        autoFocus={Boolean(name)}
        className="mt-3 w-full border-0 border-b border-white/[0.12] bg-transparent px-0 py-3 text-2xl font-bold tabular-nums text-white outline-none transition-colors placeholder:text-white/25 focus:border-white"
      />
      <p className="mt-3 text-[11px] leading-relaxed text-white/35">
        DNI sin puntos. Lo usamos para tu compra y para reconocerte si volvés a entrar.
      </p>
      <Button
        type="submit"
        disabled={!valid}
        className="mt-6 h-14 w-full rounded-2xl bg-white font-semibold text-black"
      >
        Ir al pago <ArrowRight className="size-4" aria-hidden />
      </Button>
    </form>
  )
}
