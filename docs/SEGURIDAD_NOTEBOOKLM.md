# Guía Completa de Estándares de Seguridad y Arquitectura de APIs
> **Documento de Referencia Técnica**  
> **Fuente:** *The Definitive Blueprint for Secure API Architecture and Design*  
> **Ámbito:** Estándares OWASP, Autenticación (AuthN), Autorización (AuthZ), Mitigación de Vulnerabilidades y Reglas Técnicas.

---

## 📋 Tabla de Contenidos
1. Estándares de Seguridad Principales
2. Autenticación (AuthN) y Gestión de Credenciales
3. Autorización (AuthZ) y Control de Acceso
4. Mitigación de Vulnerabilidades Técnicas
5. Registro, Monitoreo y Auditoría (Security Logging)
6. Reglas Técnicas e Integración del Ecosistema

---

## 1. Estándares de Seguridad Principales

### 🛡️ OWASP Top 10:2025
Estándar global de concienciación sobre los diez riesgos de seguridad más críticos en aplicaciones web:

| Código | Categoría | Descripción y Enfoque de Riesgo |
| :--- | :--- | :--- |
| **A01:2025** | Broken Access Control | Pérdida de control de acceso; fallas en restricciones de permisos a usuarios. |
| **A02:2025** | Security Misconfiguration | Configuración de seguridad incorrecta, omitida o desactualizada en el stack. |
| **A03:2025** | Software Supply Chain Failures | Fallas e inseguridad en dependencias y la cadena de suministro de software. |
| **A04:2025** | Cryptographic Failures | Fallas criptográficas; exposición de datos sensibles o uso de algoritmos débiles. |
| **A05:2025** | Injection | Inyección de datos no confiables (SQL, NoSQL, OS Command, LDAP, etc.). |
| **A06:2025** | Insecure Design | Diseño e ingeniería inseguros; falta de modelado de amenazas y arquitectura sólida. |
| **A07:2025** | Authentication Failures | Fallas en la confirmación de la identidad del usuario o gestión de sesión. |
| **A08:2025** | Software or Data Integrity Failures | Fallas de integridad en código, datos o actualizaciones sin verificación. |
| **A09:2025** | Security Logging and Alerting Failures | Registro, monitoreo y alertas de seguridad insuficientes o ineficaces. |
| **A10:2025** | Mishandling of Exceptional Conditions | Manejo inadecuado de excepciones y errores que exponen información sensible. |

---

### 🌐 OWASP API Security Top 10 (2023)
Vulnerabilidades críticas específicas de arquitecturas de API y microservicios:
* **API1:2023 – Broken Object Level Authorization (BOLA):** Ausencia o falla en la validación de autorización a nivel de objeto al manipular identificadores en endpoints.
* **API2:2023 – Broken Authentication:** Vulnerabilidades en los mecanismos de autenticación y flujo de gestión de tokens.
* **API3:2023 – Broken Object Property Level Authorization:** Combinación de exposición excesiva de datos (Excessive Data Exposure) y asignación masiva (Mass Assignment).
* **API4:2023 – Unrestricted Resource Consumption:** Ausencia de límites de consumo en peticiones, CPU, memoria o almacenamiento (falla de Rate Limiting).
* **API5:2023 – Broken Function Level Authorization (BFLA):** Deficiencias en la restricción de funciones administrativas o ejecutivas a usuarios no privilegiados.
* **API6:2023 – Unrestricted Access to Sensitive Business Flows:** Exposición de flujos de negocio sin protección ante automatización o bots masivos.
* **API7:2023 – Server Side Request Forgery (SSRF):** Procesamiento de URIs suministradas por usuarios sin validación previa en el servidor.
* **API8:2023 – Security Misconfiguration:** Errores de configuración en transportes, cabeceras HTTP, métodos o permisos de servicio.
* **API9:2023 – Improper Inventory Management:** Falta de inventario de versiones de API, exposición de endpoints obsoletos, beta o de depuración.
* **API10:2023 – Unsafe Consumption of APIs:** Confianza ciega en servicios, endpoints o datos provenientes de APIs de terceros.

---

### 📏 Marcos de Referencia Adicionales
* **OWASP ASVS (Application Security Verification Standard v5.0.0 / v4.0.3):** Requisitos técnicos de seguridad verificables para diseño, desarrollo y pruebas.
* **OWASP Top 10 Proactive Controls:**
  * C1: Control de Acceso
  * C2: Criptografía y Protección de Datos
  * C3: Validación de Entradas y Manejo de Excepciones
  * C4: Arquitectura Segura
  * C5: Configuración Segura por Defecto
  * C6: Componentes y Librerías Seguras
  * C7: Identidades Digitales y Autenticación
  * C8: Seguridad del Navegador
  * C9: Logging y Monitoreo de Seguridad
  * C10: Mitigación de SSRF
* **OWASP Web Security Testing Guide (WSTG):** Metodología estándar para auditorías de código y pentesting.

---

## 2. Autenticación (AuthN) y Gestión de Credenciales

### 🔑 Políticas de Contraseñas (NIST SP 800-63B)
* **Longitud Mínima:**
  * Con MFA habilitado: Mínimo 8 caracteres.
  * Sin MFA habilitado: Mínimo 15 caracteres.
* **Longitud Máxima:** Permitir al menos 64 caracteres.
* **Caracteres Permitidos:** Sostener soporte para todos los caracteres Unicode (incluyendo emojis) y espacios en blanco.
* **Composición y Rotación:**
  * Eliminar reglas complejas arbitrarias (ej. obligar a combinar mayúsculas/símbolos).
  * Eliminar la rotación periódica obligatoria de contraseñas (salvo en caso de compromiso confirmado).
  * Validar contraseñas contra listas de credenciales comprometidas (Breached Passwords) y medir la entropía mediante herramientas como `zxcvbn`.

---

### 🔐 Almacenamiento Criptográfico de Contraseñas
* **Prohibición:** Nunca almacenar contraseñas en texto plano ni mediante algoritmos de cifrado reversible.
* **Algoritmos Recomendados:** Algoritmos de hashing adaptativos a la memoria y lentos (Key Derivation Functions):
  * **Argon2id (Opción preferida)**
  * **bcrypt**
  * **PBKDF2**
  * **scrypt**
* **Salt & Pepper:**
  * **Salt:** Sal única generada criptográficamente por cada usuario/contraseña.
  * **Pepper:** Clave secreta global almacenada en un gestor de secretos o HSM (fuera de la BD principal) aplicada mediante HMAC o pre-hashing.

---

### ⚡ Protección contra Ataques y Gestión de Sesión
* **Control de Intentos:** Aplicar Rate Limiting, Throttling y bloqueo temporal de cuentas (Account Lockout) para contrarrestar ataques de fuerza bruta y Credential Stuffing (MITRE ATT&CK T1110).
* **Reautenticación:** Exigir confirmación de contraseña o MFA antes de autorizar acciones críticas (cambio de email, contraseña, pagos, eliminación de recursos).
* **Estándares de Identidad:** Delegación y tokens mediante OAuth 2.0 / 2.1 y OpenID Connect (OIDC).

---

## 3. Autorización (AuthZ) y Control de Acceso

```
[ Solicitud Entrante ]
       │
       ▼
[ WAF / API Gateway ] ──► (Validación de Firma y Rate Limiting)
       │
       ▼
[ Servidor de Aplicación ]
       │
       ├──► 1. Autenticación (AuthN) ──► Confirmación de Identidad
       │
       └──► 2. Autorización (AuthZ) ──► Regla Deny-by-Default + ABAC / ReBAC
                                              │
                                              ▼
                                 [ Recurso / Base de Datos ]
```

### 📐 Principios de Diseño
* **Denegación por Defecto (Deny by Default):** Todo acceso debe ser rechazado a menos que exista una regla explícita que lo permita.
* **Principio de Menor Privilegio (Least Privilege):** Asignar estrictamente el conjunto mínimo de permisos necesarios.

---

### 🏗️ Modelos de Control de Acceso
* **RBAC (Role-Based Access Control):** Roles estáticos vinculados a permisos básicos.
* **ABAC (Attribute-Based Access Control):** Evaluaciones dinámicas basadas en atributos del sujeto, objeto, acción y contexto (hora, IP, estado del recurso).
* **ReBAC (Relationship-Based Access Control):** Control basado en relaciones directas entre entidades (ideal para entornos multitenant y modelos jerárquicos).

---

### 🔍 Reglas de Verificación Técnica
* **Evaluación Server-Side:** Las comprobaciones de autorización deben ejecutarse exclusivamente en el backend, API Gateway o funciones Serverless (nunca confiar en la interfaz de usuario).
* **Inspección en cada Solicitud:** Cada endpoint debe evaluar la autorización para el objeto específico solicitado, evitando vulnerabilidades tipo IDOR/BOLA.

---

## 4. Mitigación de Vulnerabilidades Técnicas

### 🗄️ Inyección SQL (SQLi)
* **Defensa Primaria:** Uso estricto de Consultas Parametrizadas (Prepared Statements), Procedimientos Almacenados o Mapeadores Objeto-Relacional (ORMs) como Prisma o Hibernate.
* **Nombres Dinámicos:** Si se requiere dinamismo en nombres de tablas o columnas, aplicar validación basada en listas blancas (Allow-lists).
* **Práctica Desaconsejada:** El escape manual de cadenas de texto es propenso a errores y no debe ser la defensa principal.

---

### 🛡️ Cross-Site Request Forgery (CSRF)
* **Aplicaciones Stateful (Basadas en Sesión):** Implementación de Synchronizer Token Pattern.
* **Aplicaciones Stateless (APIs desacopladas):**
  * Patrón Signed Double-Submit Cookie con tokens firmados vía HMAC.
  * Encabezados Fetch Metadata (`Sec-Fetch-Site`, `Sec-Fetch-Mode`, `Sec-Fetch-Dest`).
  * Atributos de Cookies: Configurar `SameSite=Strict` o `SameSite=Lax` en cookies sensibles.
  * Verbos HTTP: Asegurar que las peticiones `GET` sean estrictamente idempotentes y carezcan de efectos secundarios sobre el estado del sistema.

---

### 🌐 REST & Configuración de Cabeceras
* **Transporte:** TLS/HTTPS obligatorio en el 100% de la comunicación.
* **Validaciones:**
  * Control estricto de `Content-Type` tanto en recepción como en respuesta.
  * Mapeo explícito de verbos HTTP autorizados (retornar `405 Method Not Allowed` para verbos no soportados).
  * Políticas CORS restringidas a orígenes específicos (evitar `Access-Control-Allow-Origin: *` con credenciales).
  * Parámetros de URL: Prohibido transmitir secretos, tokens JWT o credenciales en la query string.

---

## 5. Registro, Monitoreo y Auditoría (Security Logging)

### 📊 Eventos Obligatorios de Registro
* Fallos y éxitos críticos en procesos de autenticación y cambio de credenciales.
* Fallos en comprobaciones de autorización (intentos de acceso denegados).
* Modificaciones de permisos, roles o configuraciones administrativas.
* Excepciones del sistema y fallas en la validación de entradas.

---

### 🔒 Buenas Prácticas de Logging
* **Prevención de Log Injection:** Sanitizar o codificar cualquier entrada del usuario antes de escribirla en los registros (prevenir inyección CRLF).
* **Sincronización de Tiempo:** Usar servidores NTP para mantener sincronización horaria precisa en todos los nodos del sistema.
* **Datos Prohibidos en Logs:** Excluir expresamente contraseñas en texto plano, números de tarjetas de crédito (PAN), CVVs, tokens de acceso y datos de identificación personal (PII).

---

## 6. Reglas Técnicas e Integración del Ecosistema

### 💻 Stack de Desarrollo y Herramientas Documentadas
* **Frontend y Validación:**
  * `Zod`: Declaración e inferencia de esquemas de validación estricta en tiempo de ejecución.
  * `React Hook Form`: Gestión eficiente y segura de formularios en el cliente.
  * `TanStack Query`: Manejo, almacenamiento en caché y sincronización de estado de peticiones asíncronas.
* **Backend y Frameworks:**
  * `NestJS`: Módulos `AuthGuard`, `JwtModule`, integración de OpenAPI / Swagger y sanitización de datos antes de responder al cliente.
  * `Spring Boot & Spring Security`: `DaoAuthenticationProvider`, `PasswordEncoder` y filtros de cadena de seguridad.
  * `Prisma ORM & PostgreSQL 17`: Mapeo relacional seguro y parametrización automática de consultas.
* **Análisis de Componentes y Pruebas:**
  * `OWASP Dependency-Check`: Análisis de composición de software (SCA) para identificar vulnerabilidades conocidas (CVE) en librerías.
  * `OWASP ZAP (Zed Attack Proxy)`: Escaneo dinámico (DAST) y pruebas de penetración automatizadas.
* **Despliegue e Infraestructura Cloud:**
  * `Google Cloud Run & GCP Well-Architected Framework`: Arquitectura Zero Trust, segregación de identidades (IAM) y seguridad desde el diseño (shift-left).

---
*Documento generado desde el cuaderno Gemini Notebook: "The Definitive Blueprint for Secure API Architecture and Design".*
