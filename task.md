# Tareas — proxy_frontend-

| # | Rama | Tareas | Criterio de aceptación |
|---|---|---|---|
| 1 | `chore/scaffold` | `index.html`, `config.js`, `assets/`, `.gitignore`, `README` base, `task.md` | El sitio abre en `http://127.0.0.1:5500` |
| 2 | `feat/editorial-shell` | Rail fijo, topbar, hero, About, watermarks, grid, tipografía, paleta, responsive, footer | La página replica el lenguaje editorial de go.arch en desktop y móvil |
| 3 | `feat/app-integration` | `app.js`: usuarios, documentos, overlay, editor, capas, pipeline, traza, auditoría, métricas, toasts | Un usuario puede leer/escribir/borrar y ver el resultado del proxy |
| 4 | `build/docker` | `Dockerfile` Nginx, template `BACKEND_URL`, compose, healthcheck, `.dockerignore` | `docker compose up --build -d` sirve la UI en `:3000` y proxya `/api` |
| 5 | `docs/final` | README, captura, guion de demo, configuración local/Docker | Un lector puede levantar la demo sin ayuda |

## Checklist

- [x] Selección de usuario y sesión
- [x] Listado de documentos con clasificación, área, dueño y tamaño
- [x] Overlay de detalle con lectura, edición y borrado
- [x] Capas conmutables: log, access, cache, lazy
- [x] Pipeline animado y traza por capa
- [x] Auditoría con filtros y métricas
- [x] Estados de error 403/404 y toasts
- [x] Responsive y accesibilidad básica
- [x] Docker con Nginx y proxy `/api`
- [x] README con guion de demo
