# Walkthrough Técnico: Sprint 8 - B2B Admin Panel

Este documento resume la arquitectura y funcionalidades críticas implementadas durante el Sprint 8 para la gestión centralizada de BiFlow.

## 1. Arquitectura de Seguridad (RBAC & RLS)
Se ha implementado un sistema de Control de Acceso basado en Roles (RBAC) robusto integrado con Supabase Auth.
- **Tabla `public.profiles`**: Centraliza los roles del sistema (`user`, `admin`, `superadmin`).
- **Capas de Protección**:
  - **Base de Datos (RLS)**: Las tablas críticas (`organizations`, `transacciones`, `audit_logs`) cuentan con políticas que permiten acceso total solo a administradores mediante las funciones SQL `is_admin()` e `is_superadmin()`.
  - **Aplicación (Layout Level)**: La ruta `/admin/*` está protegida por un layout central que valida el rol del usuario en cada navegación.

## 2. Gestión de Suscripciones (Tier Overrides)
Permite a los administradores gestionar el ciclo de vida de los clientes B2B de forma directa, sin depender exclusivamente de webhooks de pasarelas.
- **Server Action `updateOrganizationTier`**: Orquestra la actualización del campo `tier` en la base de datos con validación previa de privilegios administrativos.
- **UI Reactiva**: Selector de planes con feedback visual de carga e integración con `sonner` para confirmaciones.

## 3. Modo Auditoría (Modo Dios)
Una de las herramientas más potentes para soporte y depuración operativa.
- **Lógica de Suplantación**: Basada en la cookie `biflow_impersonation` (httpOnly/Secure).
- **Intercepción de Tenant**: La utilidad `getOrgId` en `lib/supabase/utils.ts` prioriza la identidad suplantada si el usuario es administrador, permitiendo ver el dashboard exactamente como lo vería el cliente auditado.
- **Feedback Visual Permanente**: Banner persistente de alerta en la cabecera encargado de recordar al administrador que no está en su propia sesión y permitir la salida segura.

## 4. Infraestructura de Pagos Híbrida
Preparación de la pasarela para escalabilidad global y regional.
- **Stripe SDK**: Configurado para suscripciones globales (USA/EU).
- **Mercado Pago SDK**: Integrado para el mercado local (Argentina), validado con credenciales de prueba.
- **PayPal Configuration**: Soporte conceptual de autenticación OAuth 2.0.
- **Singletons**: Toda la lógica reside en `lib/payments/` bajo un patrón de instancia única para optimizar recursos.

## 5. Centro de Monitoreo & Auditoría
Un centro de mando para operaciones técnicas.
- **Logging Centralizado**: Todas las acciones CRUD críticas de administración se registran en la tabla `audit_logs`.
- **Vista `/admin/monitor`**:
  - **Bento Stats**: Resumen de errores (24h) y salud del sistema.
  - **Real-time Log Stream**: Feed en vivo mediante Supabase Realtime que muestra eventos de seguridad (logs de auth, cambios de tier, sesiones de auditoría).
  - **Análisis de Amenazas**: Detección visual de patrones inusuales o intentos de escalada de privilegios.

## 6. Higiene del Proyecto
- **Clean Root Policy**: Se han eliminado todos los scripts de diagnóstico (`verify-gateways.ts`) y volcado temporales.
- **Modularidad**: Las acciones y componentes se agruparon por contexto funcional (`app/admin/organizations/actions.ts`, etc.).
