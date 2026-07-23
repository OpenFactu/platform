# Setup Wizard — botón "Probar conexión" en el Paso 1

Fecha: 2026-07-23
Rama: `dev`

## Contexto

`Step1Database` (dentro de `apps/web/src/pages/SetupWizard.tsx`) ya
comprueba la conexión a PostgreSQL vía `POST /api/setup/check-db`, pero
solo como parte de `handleNext` (validar → comprobar → avanzar de
paso). No hay forma de probar la conexión sin comprometerse a avanzar.

## Requisitos

- Botón nuevo "Probar conexión", secundario, junto al ya existente
  "Siguiente" en el Paso 1.
- Usa el mismo endpoint (`/api/setup/check-db`) y la misma validación de
  campos que ya usa `handleNext`.
- Muestra el resultado por toast (éxito/error) y **no avanza de paso**,
  ni abre el popup de "configuración existente detectada" (eso solo
  tiene sentido en el flujo de avance real).
- `handleNext` no cambia de comportamiento — sigue validando,
  comprobando y avanzando exactamente igual que hoy.
- Mientras cualquiera de los dos botones está en curso, ambos quedan
  deshabilitados (evita dos llamadas simultáneas).

## Diseño

En `Step1Database`:
- Extraer la validación de campos (host/puerto/usuario/contraseña +
  rango de puerto) a una función `validate(): number | null` compartida
  por `handleTest` y `handleNext`.
- Nuevo estado `testing` (paralelo al `checking` ya existente).
- Nuevo `handleTest`: valida, llama a `check-db`, y solo hace
  `toast.success`/`toast.error` con el mensaje — sin popup, sin
  `onNext()`.
- Nuevo botón secundario (estilo `BTN_SECONDARY_CLS`, icono `Database`
  ya importado) encima del botón "Siguiente" existente, con
  `disabled={testing || checking}`; el botón "Siguiente" pasa a
  `disabled={checking || testing}`.

## Riesgos

Ninguno relevante — es aditivo, reutiliza el endpoint y la validación
ya probados por `handleNext`.
