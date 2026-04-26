import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router"
import QRCode from "qrcode"
import { Button } from "@/components/ui/button"

export function QrPage() {
  const { hash } = useParams<{ hash: string }>()
  const navigate = useNavigate()
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!hash) return
    const value = decodeURIComponent(hash)
    let cancelled = false
    QRCode.toDataURL(value, {
      width: 280,
      margin: 2,
      color: { dark: "#fafafa", light: "#121212" },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [hash])

  if (!hash) return null

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-800/50 bg-black/70 px-6 py-4 backdrop-blur-xl">
        <Button
          variant="ghost"
          className="-ml-2 rounded-xl px-3 text-sm text-[#8E8E93] hover:bg-white/5 hover:text-white"
          type="button"
          onClick={() => navigate(-1)}
        >
          Cerrar
        </Button>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-16">
        <p className="max-w-xs text-center text-sm leading-relaxed text-[#8E8E93]">
          Mostrá este código en la entrada o en la barra.
        </p>
        <div className="rounded-2xl bg-[#1C1C1E] p-6">
          {dataUrl ? (
            <img
              src={dataUrl}
              alt="Código QR"
              className="max-w-[min(85vw,280px)] rounded-xl"
              width={280}
              height={280}
            />
          ) : (
            <div className="flex h-64 w-64 max-w-[85vw] items-center justify-center rounded-xl text-sm text-[#8E8E93]">
              Generando…
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
