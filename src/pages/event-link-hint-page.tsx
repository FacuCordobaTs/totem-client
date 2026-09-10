import { useEffect, useState, type FormEvent } from "react"
import { ArrowRight, Check, Loader2 } from "lucide-react"
import { publicApiFetch } from "@/lib/api"

type AccessType = "email" | "phone" | "dni"

const OPTIONS: Array<{ id: AccessType; label: string }> = [
  { id: "email", label: "Email" },
  { id: "phone", label: "Teléfono" },
  { id: "dni", label: "Documento" },
]

export function EventLinkHintPage() {
  const [shown, setShown] = useState(false)
  const [type, setType] = useState<AccessType>("email")
  const [value, setValue] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!value.trim() || submitting) return
    setSubmitting(true)
    setError(false)
    try {
      await publicApiFetch<{ ok: true }>("/public/customers/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, value: value.trim() }),
      })
      setSent(true)
    } catch {
      setError(true)
    } finally {
      setSubmitting(false)
    }
  }

  const changeType = (next: AccessType) => {
    setType(next)
    setValue("")
    setSent(false)
    setError(false)
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#0B0B0C] px-6 py-12">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-[440px] w-[640px] -translate-x-1/2 rounded-full" style={{ background: "radial-gradient(circle, rgba(255,255,255,0.055), transparent 68%)" }} />
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(120% 80% at 50% 0%, transparent 58%, rgba(0,0,0,0.65))" }} />

      <div className={`relative z-10 w-full max-w-sm text-center transition-all duration-700 ease-out ${shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}>
        <svg aria-hidden className="mx-auto h-12 w-auto text-[#E8E3D8]" viewBox="0 0 108 56" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 26C9 22 12 20 17 18.5C21 13 29 11 38 12C50 13 60 16 70 20C84 26 96 30 105 31L80 35C68 36 56 37 46 36C38 35.5 31 34.5 26 33C18 31 9 29 4 28Z" fill="currentColor" />
          <path d="M34 21C48 27 64 30 80 31" stroke="#0B0B0C" strokeOpacity="0.5" strokeWidth="1.3" />
          <circle cx="14" cy="23" r="1.5" fill="#0B0B0C" />
        </svg>
        <h1 className="mt-5 font-serif text-5xl font-medium tracking-[0.01em] text-[#F4F1EA]">Crow</h1>
        <p className="mt-4 text-sm text-white/35">Todos tus eventos, en un solo lugar.</p>

        <section className="mt-9 rounded-3xl border border-white/[0.08] bg-white/[0.035] p-5 text-left shadow-2xl backdrop-blur-sm">
          {sent ? (
            <div className="flex min-h-52 flex-col items-center justify-center px-3 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300"><Check className="size-5" aria-hidden /></span>
              <h2 className="mt-4 text-lg font-semibold text-white">Revisá tus mensajes</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/45">Si encontramos tu cuenta, te enviamos un enlace personal por email o WhatsApp.</p>
              <button type="button" onClick={() => { setSent(false); setValue("") }} className="mt-5 text-xs font-medium text-white/40 underline underline-offset-4 hover:text-white/65">Usar otro dato</button>
            </div>
          ) : (
            <form onSubmit={(event) => void submit(event)}>
              <h2 className="text-lg font-semibold text-white">Entrar a mi cuenta</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-white/40">Te enviaremos un enlace para ver tus entradas, sus horarios de ingreso, consumos y saldo.</p>
              <div className="mt-5 grid grid-cols-3 rounded-xl bg-black/35 p-1" role="tablist" aria-label="Dato de acceso">
                {OPTIONS.map((option) => (
                  <button key={option.id} type="button" role="tab" aria-selected={type === option.id} onClick={() => changeType(option.id)} className={`rounded-lg px-2 py-2.5 text-xs font-semibold transition-colors ${type === option.id ? "bg-white text-black" : "text-white/40 hover:text-white/65"}`}>{option.label}</button>
                ))}
              </div>
              <label className="mt-4 block">
                <span className="sr-only">{OPTIONS.find((option) => option.id === type)?.label}</span>
                <input
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  type={type === "email" ? "email" : "text"}
                  inputMode={type === "email" ? "email" : "numeric"}
                  autoComplete={type === "email" ? "email" : "tel"}
                  required
                  placeholder={type === "email" ? "tu@email.com" : type === "phone" ? "11 5555 5555" : "Tu DNI"}
                  className="h-13 w-full rounded-xl border border-white/10 bg-black/25 px-4 text-[15px] text-white outline-none placeholder:text-white/20 focus:border-white/30 focus:ring-2 focus:ring-white/10"
                />
              </label>
              {type === "dni" ? <p className="mt-2 px-1 text-[11px] leading-relaxed text-white/30">Lo enviaremos al último email o teléfono asociado a tu documento.</p> : null}
              {error ? <p className="mt-2 px-1 text-xs text-red-300/80">No pudimos enviar el enlace. Intentá nuevamente.</p> : null}
              <button type="submit" disabled={!value.trim() || submitting} className="mt-4 flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-bold text-black transition-colors hover:bg-zinc-200 disabled:opacity-35">
                {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <>Enviar acceso <ArrowRight className="size-4" aria-hidden /></>}
              </button>
            </form>
          )}
        </section>

        <p className="mt-7 text-[12px] text-white/25">¿Organizás eventos? <a href="https://admin.crow.ar" className="text-white/45 underline underline-offset-3 hover:text-white/70">admin.crow.ar</a></p>
      </div>
    </main>
  )
}
