import { useEffect, useState } from "react"

export function EventLinkHintPage() {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#0B0B0C] px-6">
      {/* spotlight cenital */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[440px] w-[640px] -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.055), transparent 68%)" }}
      />
      {/* viñeta inferior */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(120% 80% at 50% 0%, transparent 58%, rgba(0,0,0,0.65))" }}
      />

      <div
        className={`relative z-10 w-full max-w-sm text-center transition-all duration-700 ease-out ${
          shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        }`}
      >
        {/* emblema */}
        <svg
          aria-hidden
          className="mx-auto h-14 w-auto text-[#E8E3D8]"
          viewBox="0 0 108 56"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4 26C9 22 12 20 17 18.5C21 13 29 11 38 12C50 13 60 16 70 20C84 26 96 30 105 31L80 35C68 36 56 37 46 36C38 35.5 31 34.5 26 33C18 31 9 29 4 28Z"
            fill="currentColor"
          />
          <path d="M34 21C48 27 64 30 80 31" stroke="#0B0B0C" strokeOpacity="0.5" strokeWidth="1.3" />
          <circle cx="14" cy="23" r="1.5" fill="#0B0B0C" />
        </svg>

        <h1 className="mt-7 font-serif text-5xl font-medium tracking-[0.01em] text-[#F4F1EA]">Crow</h1>

        <div className="mx-auto mt-5 h-px w-10 bg-white/15" />

        <p className="mt-5 text-sm text-white/35">
          Entradas, acceso y barras para eventos.
        </p>

        <div className="mt-9 px-1">
          <p className="text-[13.5px] leading-relaxed text-white/55">
            Necesitás el enlace de tu evento para ingresar. Si compraste, usá el que llegó a tu correo.
          </p>
          <div className="my-5 h-px bg-white/[0.07]" />
          <p className="text-[13px] text-white/35">
            ¿Organizás eventos?{" "}
            <a
              href="https://admin.crow.ar"
              className="text-white/55 underline underline-offset-2 transition-colors hover:text-white/75"
            >
              admin.crow.ar
            </a>
          </p>
        </div>

        <p className="mt-10 text-[11px] uppercase tracking-[0.34em] text-white/20">crow.ar</p>
      </div>
    </main>
  )
}