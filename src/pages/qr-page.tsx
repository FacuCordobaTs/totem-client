import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
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
      color: { dark: "#fafafa", light: "#09090b" },
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
    <div className="flex min-h-dvh flex-col bg-[#09090b] text-zinc-100">
      <div className="flex items-center justify-between gap-2 p-4">
        <Button
          variant="ghost"
          className="rounded-none text-zinc-400 hover:bg-white/5"
          type="button"
          onClick={() => navigate(-1)}
        >
          Cerrar
        </Button>
        <Button variant="ghost" className="rounded-none text-zinc-400 hover:bg-white/5" asChild>
          <Link to="/">Inicio</Link>
        </Button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 pb-16">
        <p className="max-w-xs text-center text-sm text-zinc-400">
          Mostrá este código en la entrada o en la barra
        </p>
        {dataUrl ? (
          <img
            src={dataUrl}
            alt="Código QR"
            className="max-w-[85vw] border border-white/10 bg-zinc-950 p-2"
            width={256}
            height={256}
          />
        ) : (
          <div className="flex h-64 w-64 max-w-[85vw] items-center justify-center border border-white/10 text-zinc-600">
            Generando…
          </div>
        )}
        <p className="max-w-xs break-all text-center text-[10px] text-zinc-600">
          {decodeURIComponent(hash)}
        </p>
      </div>
    </div>
  )
}
