import { Link } from "react-router"
import "./style.css"

/** Your React page: replace this markup, styles and assets freely. */
export default function DripeoPage() {
  return (
    <main className="dripeo-site">
      <header className="dripeo-header">
        <a href="/" aria-label="Dripeo — inicio">DRIPEO®</a>
        <Link to="/acceso">Mis entradas ↗</Link>
      </header>
      <section className="dripeo-hero" aria-labelledby="dripeo-title">
        <p className="dripeo-eyebrow">La noche tiene nombre.</p>
        <h1 id="dripeo-title">DRI<span>PEO</span></h1>
        <p className="dripeo-description">
          Nos encontramos en la pista.
        </p>
        <Link className="dripeo-cta" to="/entradas">Conseguí tu entrada <span aria-hidden="true">↗</span></Link>
      </section>
      <footer className="dripeo-footer"><span>DRIPEO</span><span>Tickets por Crow</span></footer>
    </main>
  )
}
