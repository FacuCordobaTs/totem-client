# Enlaces compartidos de eventos

Las páginas propias se registran en `src/event-sites/registry.ts`. Para que un
enlace existente `crow.ar/<slug>` abra esa página, agregar sus dos rutas exactas
(con y sin barra final) a `public/_redirects`, apuntando al subdominio registrado.
Vite copia el archivo a `dist/_redirects` y Cloudflare Pages aplica la redirección
HTTP antes de servir React, también para lectores de vistas previas de enlaces.

Perro Negro usa `/perro-negro-31-10` → `https://perronegro3110.crow.ar/` con estado
302. No agregar query string al destino: Pages conserva los parámetros originales,
incluidos `promotor`, `promoter` y `utm_*`. No usar un comodín: `/acceso`, checkout,
comprobantes y otros eventos deben seguir sus rutas actuales. La portada de destino
es `/`, que no coincide con estas reglas, por lo que no genera un bucle al pasar
por el Worker de subdominios y el origen Pages.

Validar con `bun run build` y comprobar `dist/_redirects`. El push a `main` de
`totem-client` publica automáticamente en Pages. Después del deploy, verificar
GET y HEAD con y sin barra final, un enlace con parámetros de promotor/campaña,
que el destino responda 200 y que `/perro-negro-31-10/acceso` no redirija.

Para revertir, quitar ambas líneas y publicar otra vez. El 302 permite cambiar
esta decisión sin dejar una redirección permanente en los navegadores.

Referencia: [Redirecciones de Cloudflare Pages](https://developers.cloudflare.com/pages/configuration/redirects/).
