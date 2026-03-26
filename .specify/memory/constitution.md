# Constitución del Proyecto: BiFlow

Este documento establece los principios fundamentales e innegociables que rigen el desarrollo de BiFlow. Todas las especificaciones, planes y tareas deben adherirse a estos estándares para garantizar la integridad, el rendimiento y la seguridad del sistema.

## ⚖️ Reglas Innegociables (Estatutos)

1.  **Backend Unificado (Supabase)**: Se debe utilizar **Supabase** de forma exclusiva como proveedor de backend, incluyendo la Base de Datos (PostgreSQL), Autenticación y Almacenamiento. No se permiten bases de datos externas o servicios de backend alternativos para el core del negocio.
2.  **Delegación de Lógica Pesada (SQL RPC)**: Por motivos de rendimiento, estabilidad y atomicidad, toda lógica financiera compleja, motores de cálculo intensivos o procesos que requieran integridad multi-tabla deben delegarse siempre a funciones de PostgreSQL (**RPC**) con privilegios `SECURITY DEFINER` cuando sea necesario.
3.  **Seguridad por Diseño (RLS)**: El acceso a los datos debe estar estrictamente protegido mediante políticas de **Row Level Security (RLS)** en Supabase. Ninguna operación desde el cliente debe poder saltarse estas políticas, asegurando el aislamiento absoluto por organización y usuario.
4.  **Tipado Estricto (TypeScript)**: Todo el código del lado del cliente, componentes y motores de lógica deben estar **estrictamente tipados** en TypeScript. Queda prohibido el uso de `: any` o supresiones de tipos que comprometan la robustez del código.

---
*Generado y validado mediante el flujo /speckit.constitution*
*Fecha de Creación: 2026-03-24*
