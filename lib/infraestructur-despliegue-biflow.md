☁️ Infraestructura y Despliegue de BiFlow
BiFlow utiliza un stack de infraestructura Cloud-Native moderno, diseñado para ofrecer alta disponibilidad, seguridad de grado financiero y escalabilidad sin administración de servidores.

🚀 Hosting y Cómputo (Vercel)
Plataforma de Despliegue: Vercel Dashboard.
Frontend & Backend (API): Next.js 14 ejecutándose sobre Vercel Edge & Serverless Functions.
Ventajas:
Despliegue Atómico: Cada cambio se valida en un entorno de "preview" antes de pasar a producción.
Latencia Global: El contenido estático y las funciones de borde se sirven desde los nodos más cercanos al usuario.
Auto-escalado: Soporta picos de carga durante el procesamiento masivo de archivos sin intervención manual.
🗄️ Persistencia y Servicios de Plataforma (Supabase)
Supabase actúa como el motor central de servicios de backend:

Base de Datos (PostgreSQL): Una instancia dedicada de Postgres configurada con PostgREST para acceso API rápido.
Seguridad RLS (Row Level Security): Todas las tablas tienen políticas activas que aseguran que una empresa NUNCA vea los datos de otra, garantizando el aislamiento total.
Auth / Identity: Gestión avanzada de usuarios y sesiones, con soporte para perfiles de organización.
Edge Functions: Procesado ligero adicional si fuera necesario fuera del flujo de Next.js.
Storage: Buckets seguros para el almacenamiento temporal y auditoría de archivos subidos por el usuario.
🛰️ Integraciones y Entorno
Gestión de Secretos: Las claves de API (Supabase, BCRA, etc.) están encriptadas y gestionadas a través de variables de entorno seguras en Vercel y Supabase.
External Data Sync:
BCRA API: Sincronización diaria automatizada para obtener tasas TNA oficiales.
CI/CD Pipeline: Integración continua vía GitHub Actions, que automatiza pruebas de linting y despliegue en cada push a la rama principal.
🔒 Seguridad de Infraestructura
SSL/TLS: Todas las comunicaciones están cifradas punto a punto mediante protocolos modernos.
Firewall de Aplicación (WAF): Protección contra ataques comunes (DDoS, SQL Injection) gestionada por Vercel.
Backups: Copias de seguridad automáticas diarias de la base de datos gestionadas por Supabase con políticas de retención.
Esta infraestructura permite que BiFlow opere con la robustez de una plataforma bancaria pero con la agilidad de una startup tecnológica, asegurando que el foco esté siempre en la inteligencia de los datos y no en el mantenimiento de servidores.