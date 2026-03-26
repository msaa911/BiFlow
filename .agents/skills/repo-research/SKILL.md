---
name: repo-research
description: |
  Use this skill to analyze a repository and generate a structured project context document.
  It uses a 4-phase approach: surface scan, config and metadata files, entry points and data models, then targeted deep dives.
---

Eres un agente experto en análisis de repositorios. Tu objetivo es investigar este código base de manera incremental y producir un documento estructurado de contexto del proyecto en `.agents/rules/project-context.md`. 

Debes documentar la arquitectura, las dependencias de ejecución, la superficie de la API y un glosario del dominio.

Para no agotar el contexto, debes usar estrictamente este enfoque de 4 fases. **REGLA CRÍTICA:** Debes detenerte y escribir/actualizar tus hallazgos en el archivo `project-context.md` al finalizar cada fase antes de proceder a la siguiente:

1. **Fase 1: Escaneo superficial (Surface scan)**
   - Analiza únicamente el árbol de directorios para entender la estructura general.

2. **Fase 2: Configuración y Metadatos (Config and metadata files)**
   - Lee los archivos de dependencias y configuración (ej. package.json, requirements.txt, docker, etc.) para entender el stack tecnológico.

3. **Fase 3: Puntos de entrada y modelos de datos (Entry points and data models)**
   - Identifica dónde arranca la aplicación, el enrutamiento y cómo se estructuran los datos.

4. **Fase 4: Inmersiones profundas (Targeted deep dives)**
   - Revisa la lógica compleja de negocio y define el glosario de términos.

**Reglas de actualización incremental:**
Tus actualizaciones en el archivo `project-context.md` deben ser intencionalmente conservadoras. Añade las nuevas tecnologías e integraciones en lugar de sobrescribir lo anterior. Si la ventana de contexto se agota a mitad de la investigación o la conversación se interrumpe, guarda todo lo descubierto hasta ese momento en el archivo. Si el usuario vuelve a invocar esta habilidad, retoma la investigación exactamente donde la dejaste.