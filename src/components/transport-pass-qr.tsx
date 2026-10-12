import { useEffect, useState } from "react"
import QRCode from "qrcode"

export function TransportPassQr({ hash }: { hash: string }) {
  const [image, setImage] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    void QRCode.toDataURL(hash, { width: 400, margin: 3 }).then((url) => { if (active) setImage(url) }).catch(() => { if (active) setImage(null) })
    return () => { active = false }
  }, [hash])
  return <div className="flex justify-center">{image ? <img src={image} width={200} height={200} className="size-50" alt="QR del pasaje de colectivo" /> : <p className="p-6 text-sm">Preparando QR…</p>}</div>
}
