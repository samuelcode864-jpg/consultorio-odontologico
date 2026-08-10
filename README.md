# 🦷 DentalCare Pro - ERP/EHR Odontológico Single-Dentist

Sistema integral de gestión clínica, historia médica electrónica (EHR), odontograma vectorial interactivo por caras, emisión de presupuestos con firmas digitales, control de inventario Kardex, consulta en vivo de la tasa del dólar BCV en Venezuela (DolarApi) y exportador oficial en PDF.

---

## 🌟 Características Principales

* 💡 **Diseño Moderno & Modo Claro/Oscuro (Default Light)**: Interfaz intuitiva y elegante.
* 🦷 **Odontograma Interactivo por Caras**: Marcado de patologías (rojo), tratamientos ejecutados (azul) y planes propuestos (verde).
* 📱 **Recordatorios de Citas por WhatsApp**: Botón automático para enviar confirmación por WhatsApp **únicamente a los pacientes agendados para mañana**.
* 📄 **Exportación de Historia Clínica a PDF**: Generación vectorial de expediente completo del paciente en documento PDF listo para imprimir.
* 💵 **Tasa BCV En Vivo (DolarApi Venezuela)**: Conexión automática con `https://ve.dolarapi.com/v1/dolares/oficial`.
* ✍️ **Firmas Digitales Táctiles**: Captura en pantalla de firma médica y del paciente para consentimiento informado.
* 📦 **Kardex de Insumos**: Descuento automático de insumos por procedimiento realizado y alertas de stock crítico.
* 🔐 **Control de Acceso Basado en Roles (RBAC)**: Permisos diferenciados para *Odontólogo Principal* y *Asistente Dental*.

---

## 🚀 Despliegue Paso a Paso (GitHub + Vercel + Supabase)

### 1️⃣ Subir a GitHub
```bash
git init
git add .
git commit -m "Initial commit - DentalCare Pro"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/consultorio-odontologico.git
git push -u origin main
```

### 2️⃣ Desplegar en Vercel
1. Ingresa a [Vercel](https://vercel.com) e inicia sesión.
2. Haz clic en **"Add New" -> "Project"**.
3. Importa el repositorio desde GitHub (`consultorio-odontologico`).
4. En **Framework Preset**, selecciona **Other** o **HTML/JS**.
5. Haz clic en **"Deploy"**. ¡Tu app estará publicada en `https://tu-proyecto.vercel.app`!

### 3️⃣ Base de Datos en Supabase (Opcional)
Si deseas respaldar en la nube mediante Supabase Postgres:
1. Crea un proyecto en [Supabase](https://supabase.com).
2. Ve a **SQL Editor** y ejecuta el código en `supabase/schema.sql`.

---

## 💻 Desarrollo Local

```bash
npx http-server -p 8080
```
Abre en tu navegador: `http://localhost:8080`
