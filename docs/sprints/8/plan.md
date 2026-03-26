# Sprint 8: Admin Panel & B2B User Management (Plan de Arquitectura)

Este sprint tiene como objetivo centralizar la gestión de la plataforma BiFlow, permitiendo la supervisión de múltiples organizaciones, gestión de roles y soporte avanzado mediante el Modo Dios.

## 📅 Roadmap de Fases (Revisión Final)

1.  **Fase 1: Infraestructura SQL (COMPLETADA)**
    *   Arquitectura RBAC extendida en `public.profiles`.
    *   Políticas RLS robustas con `is_admin()`.

2.  **Fase 2: Infraestructura de Pagos (COMPLETADA)**
    *   Integración de los SDKs de Stripe (Global) y Mercado Pago (Argentina).
    *   Configuración de clientes Singleton y validación de conectividad.

3.  **Fase 3: Gestión de Suscripciones & Impersonación (COMPLETADA)**
    *   **Tier Overrides**: Server Action `updateOrganizationTier` para gestión manual de planes.
    *   **Modo Dios (Auditoría)**: Server Action `toggleImpersonation` para suplantación segura.
    *   **Contexto de Sesión**: Modificación de `lib/supabase/utils.ts` para reconocer la cookie `biflow_impersonation`.
    *   **UX Administrativa**: UI de control y banners de advertencias.

4.  **Fase 4: Monitoreo & Auditoría (COMPLETADA)**
    *   Dashboard global `/admin/monitor` para errores técnicos y actividad sospechosa.

5.  **Fase 5: QA & Cierre (COMPLETADA)**
    *   Limpieza final de scripts de debug y documentación del walkthrough administrativo.

---
**Reglas Estrictas**:
- **Higiene del Root**: No se permiten archivos nuevos en el directorio raíz. Scripts temporales deben ir en `scripts/debug/`.
- **Task Splitting**: Solo se implementará código después de aprobar el plan de cada fase.
