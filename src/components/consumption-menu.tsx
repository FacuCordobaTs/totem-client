import { useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from "react"
import { motion } from "motion/react"
import { Minus, Plus } from "lucide-react"
import { formatMenuPrice } from "@/lib/format"
import { groupProductsByCategory } from "@/lib/use-event-purchase"
import type { PublicDrinkProductItem, PublicProductCategory } from "@/types/api"

/**
 * Una línea de carta: nombre, dato a la derecha y control. Tocar la línea suma; lo elegido se
 * invierte a blanco, así el pedido se lee de un vistazo mientras se recorre la carta en la
 * oscuridad de un evento. Es la misma pieza en la carta y en el retiro en barra.
 */
export function ConsumptionRow({
  name,
  detail,
  count,
  canAdd = true,
  disabled = false,
  onAdd,
  onRemove,
}: {
  name: string
  detail: string
  count: number
  canAdd?: boolean
  disabled?: boolean
  onAdd: () => void
  onRemove: () => void
}) {
  const selected = count > 0
  return (
    <li className="relative border-b border-white/[0.09] last:border-b-0">
      <div
        className={`relative -mx-3 flex min-h-[3.75rem] items-center gap-3 rounded-2xl py-2 pl-3 pr-1 transition-colors duration-150 ${
          selected ? "bg-white text-black" : "text-white"
        } ${disabled ? "opacity-45" : ""}`}
      >
        <button
          type="button"
          disabled={disabled || !canAdd}
          onClick={onAdd}
          aria-label={`Sumar ${name}, ${detail}${selected ? `, llevás ${count}` : ""}`}
          className={`absolute inset-0 rounded-2xl outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset ${
            selected
              ? "focus-visible:ring-black/40 active:bg-black/[0.06]"
              : "focus-visible:ring-white/40 active:bg-white/[0.07]"
          }`}
        />
        {selected ? (
          <motion.span
            key={count}
            initial={{ scale: 1.35 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            aria-hidden
            className="pointer-events-none shrink-0 text-xl font-black tabular-nums leading-none"
          >
            {count}
          </motion.span>
        ) : null}
        <span className="pointer-events-none min-w-0 flex-1 text-[17px] font-semibold leading-[1.2] tracking-[-0.01em]">
          {name}
        </span>
        <span
          className={`pointer-events-none shrink-0 text-[15px] font-medium tabular-nums ${
            selected ? "text-black" : "text-white/70"
          }`}
        >
          {detail}
        </span>
        {selected ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onRemove}
            aria-label={`Quitar ${name}`}
            className="relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full text-black outline-none transition-colors focus-visible:ring-2 focus-visible:ring-black/40 active:bg-black/10"
          >
            <Minus className="size-5" strokeWidth={2.5} aria-hidden />
          </button>
        ) : (
          <span
            aria-hidden
            className="pointer-events-none flex size-11 shrink-0 items-center justify-center text-white/55"
          >
            <Plus className="size-5" strokeWidth={2.25} />
          </span>
        )}
      </div>
    </li>
  )
}

const prefersReducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false

/**
 * La carta entera en un único scroll, con los productos por categoría y una navegación fija que
 * salta a cada una y acompaña el desplazamiento. No depende de cómo se venda cada producto:
 * tragos, botellas y unidades conviven en la categoría que les puso la productora.
 */
export function ConsumptionMenu({
  products,
  categories,
  quantities,
  disabled = false,
  onAdd,
  onRemove,
  scrollRootRef,
  navClassName = "bg-black",
}: {
  products: PublicDrinkProductItem[]
  categories?: PublicProductCategory[]
  quantities: Record<string, number>
  disabled?: boolean
  onAdd: (productId: string) => void
  onRemove: (productId: string) => void
  /** Contenedor que hace scroll, si no es la ventana. */
  scrollRootRef?: RefObject<HTMLElement | null>
  /** Fondo de la navegación fija: tiene que coincidir con el de la página. */
  navClassName?: string
}) {
  const instanceId = useId()
  const groups = useMemo(() => {
    const grouped = groupProductsByCategory(products, categories)
    return grouped.map((group) => ({ ...group, label: group.name ?? "Otros" }))
  }, [products, categories])

  const [activeId, setActiveId] = useState<string | null>(null)
  const currentId = activeId ?? groups[0]?.id ?? null
  const navRef = useRef<HTMLElement | null>(null)
  const sectionRefs = useRef(new Map<string, HTMLElement>())
  const chipRefs = useRef(new Map<string, HTMLButtonElement>())
  // Mientras dura el salto animado, el scroll no decide la categoría activa: ya se eligió una.
  const jumpLockUntil = useRef(0)

  const showNav = groups.length > 1

  useEffect(() => {
    if (!showNav) return
    const root = scrollRootRef?.current ?? null
    const target: HTMLElement | Window = root ?? window
    let frame = 0
    const measure = () => {
      frame = 0
      if (Date.now() < jumpLockUntil.current) return
      const rootTop = root ? root.getBoundingClientRect().top : 0
      const line = rootTop + (navRef.current?.offsetHeight ?? 0) + 24
      const atEnd = root
        ? root.scrollTop + root.clientHeight >= root.scrollHeight - 2
        : window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2
      let next = groups[0]?.id ?? null
      for (const group of groups) {
        const section = sectionRefs.current.get(group.id)
        if (section && section.getBoundingClientRect().top <= line) next = group.id
      }
      if (atEnd && (root ? root.scrollTop : window.scrollY) > 0) next = groups[groups.length - 1].id
      setActiveId(next)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    target.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      target.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [groups, scrollRootRef, showNav])

  // La categoría activa siempre queda a la vista en la navegación horizontal.
  useEffect(() => {
    if (!currentId) return
    const chip = chipRefs.current.get(currentId)
    const rail = chip?.parentElement
    if (!chip || !rail) return
    rail.scrollTo({
      left: chip.offsetLeft - (rail.clientWidth - chip.offsetWidth) / 2,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    })
  }, [currentId])

  const jumpTo = useCallback(
    (id: string) => {
      const section = sectionRefs.current.get(id)
      if (!section) return
      const root = scrollRootRef?.current ?? null
      const reduced = prefersReducedMotion()
      const offset = (navRef.current?.offsetHeight ?? 0) + 4
      const top = root
        ? section.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - offset
        : section.getBoundingClientRect().top + window.scrollY - offset
      jumpLockUntil.current = reduced ? 0 : Date.now() + 700
      setActiveId(id)
      const scroller: HTMLElement | Window = root ?? window
      scroller.scrollTo({ top, behavior: reduced ? "auto" : "smooth" })
    },
    [scrollRootRef]
  )

  const countByCategory = useMemo(() => {
    const counts = new Map<string, number>()
    for (const group of groups) {
      counts.set(group.id, group.products.reduce((sum, p) => sum + (quantities[p.id] ?? 0), 0))
    }
    return counts
  }, [groups, quantities])

  return (
    <div className="flex flex-col">
      {showNav ? (
        <nav
          ref={navRef}
          aria-label="Categorías"
          className={`sticky top-0 z-30 -mx-4 ${navClassName}`}
        >
          <div className="relative flex gap-5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {groups.map((group) => {
              const active = group.id === currentId
              const count = countByCategory.get(group.id) ?? 0
              return (
                <button
                  key={group.id}
                  ref={(node) => {
                    if (node) chipRefs.current.set(group.id, node)
                    else chipRefs.current.delete(group.id)
                  }}
                  type="button"
                  aria-current={active ? "true" : undefined}
                  onClick={() => jumpTo(group.id)}
                  className={`relative flex h-12 shrink-0 items-center gap-1.5 whitespace-nowrap text-[15px] font-semibold outline-none transition-colors focus-visible:text-white ${
                    active ? "text-white" : "text-white/55"
                  }`}
                >
                  {group.label}
                  {count > 0 ? (
                    <span className="flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-white px-1 text-[11px] font-black tabular-nums text-black">
                      {count}
                    </span>
                  ) : null}
                  {active ? (
                    <motion.span
                      layoutId={`menu-nav-${instanceId}`}
                      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                      className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-white"
                    />
                  ) : null}
                </button>
              )
            })}
          </div>
        </nav>
      ) : null}

      {groups.map((group, index) => (
        <section
          key={group.id}
          ref={(node) => {
            if (node) sectionRefs.current.set(group.id, node)
            else sectionRefs.current.delete(group.id)
          }}
          aria-labelledby={`${instanceId}-${group.id}`}
          className={index === 0 ? "pt-6" : "pt-10"}
        >
          <h2
            id={`${instanceId}-${group.id}`}
            className="pb-1 text-[1.75rem] font-black leading-none tracking-[-0.03em] text-white"
          >
            {group.label}
          </h2>
          <ul>
            {group.products.map((product) => (
              <ConsumptionRow
                key={product.id}
                name={product.name}
                detail={formatMenuPrice(product.price)}
                count={quantities[product.id] ?? 0}
                disabled={disabled}
                canAdd={(quantities[product.id] ?? 0) < 99}
                onAdd={() => onAdd(product.id)}
                onRemove={() => onRemove(product.id)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
