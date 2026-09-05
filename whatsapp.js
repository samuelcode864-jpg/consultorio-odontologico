/* ==========================================================================
   DENTALCARE PRO - WHATSAPP API INTEGRATION MODULE
   Generates personalized budget messages, appointment reminders & launches direct WhatsApp link
   ========================================================================== */

class WhatsAppService {
    static getClinicName() {
        const saved = localStorage.getItem('dental_clinic_name');
        if (saved && saved.trim()) return saved.trim();

        const sideEl = document.getElementById('sidebar-brand-name');
        if (sideEl && sideEl.textContent && sideEl.textContent.trim() && sideEl.textContent.trim() !== 'DentalCare Pro') {
            return sideEl.textContent.trim();
        }

        const setBusInput = document.getElementById('set-bus-name');
        if (setBusInput && setBusInput.value && setBusInput.value.trim()) {
            return setBusInput.value.trim();
        }

        return "Consultorio Odontológico";
    }

    static getClinicAddress() {
        const saved = localStorage.getItem('dental_clinic_address');
        if (saved && saved.trim()) return saved.trim();

        const setAddrInput = document.getElementById('set-bus-address');
        if (setAddrInput && setAddrInput.value && setAddrInput.value.trim()) {
            return setAddrInput.value.trim();
        }

        return "";
    }

    static getTemplate() {
        const defaultTemplate = `🦷 *{CLINICA} - PRESUPUESTO ODONTOLÓGICO*\n\n` +
                               `Estimado(a) *{PACIENTE}*,\n` +
                               `A continuación detallamos la cotización de su plan de tratamiento:\n\n` +
                               `💵 *Subtotal Bruto:* {SUBTOTAL_USD}\n` +
                               `📉 *Descuento Aplicado:* {DESCUENTO_PCT}%\n` +
                               `💰 *Total Final Ref.:* *{TOTAL_USD}* / *( {TOTAL_BS} )*\n` +
                               `💳 *Método de Pago Sugerido:* {METODO_PAGO}\n\n` +
                               `📄 *Ver Presupuesto PDF Online:* {LINK_PRESUPUESTO}\n\n` +
                               `Quedamos a su disposición para coordinar el inicio de su tratamiento.`;
        
        return localStorage.getItem('whatsapp_budget_template') || defaultTemplate;
    }

    static saveTemplate(templateStr) {
        localStorage.setItem('whatsapp_budget_template', templateStr);
    }

    static generateBudgetMessage(patient, items, totalUSD, paymentMode, notes = '', subtotalUSD = 0, discountPct = 0, paymentMethodLabel = '', budgetId = '') {
        const exchangeRate = parseFloat(localStorage.getItem('dental_exchange_rate')) || 36.5;
        const totalVES = (totalUSD * exchangeRate).toFixed(2);
        
        let template = this.getTemplate();
        const clinica = this.getClinicName();
        const link = `${window.location.origin}/?patientId=${patient.id}&view=budget&budgetId=${budgetId}`;

        // Build list of procedures
        let itemsListText = "";
        if (items && items.length > 0) {
            itemsListText = "\n📋 *Procedimientos Presupuestados:*\n" + items.map((it, idx) => `• Pza ${it.tooth || 'Gnl'}: ${it.name || 'Tratamiento'} ($${(it.price || it.priceUSD || 0).toFixed(2)})`).join('\n') + "\n\n";
        }

        let msg = template
            .replace(/{PACIENTE}/g, patient.fullname)
            .replace(/{CLINICA}/g, clinica)
            .replace(/{SUBTOTAL_USD}/g, `$${(subtotalUSD || totalUSD).toFixed(2)} USD`)
            .replace(/{DESCUENTO_PCT}/g, discountPct || 0)
            .replace(/{TOTAL_USD}/g, `$${totalUSD.toFixed(2)} USD`)
            .replace(/{TOTAL_BS}/g, `Bs. ${totalVES}`)
            .replace(/{METODO_PAGO}/g, paymentMethodLabel || 'Contado')
            .replace(/{LINK_PRESUPUESTO}/g, link);

        if (itemsListText && !msg.includes('• Pza')) {
            msg = msg.replace(`Estimado(a) *${patient.fullname}*,\n`, `Estimado(a) *${patient.fullname}*,\n${itemsListText}`);
        }

        return msg;
    }

    static generateAppointmentReminderMessage(patientName, apptDate, apptTime, treatment, calendarLink = '') {
        const clinica = this.getClinicName();
        const direccion = this.getClinicAddress();

        let msg = `🦷 *RECORDATORIO DE CITA ODONTOLÓGICA*\n`;
        msg += `*${clinica}*\n`;
        msg += `----------------------------------------\n\n`;
        msg += `Hola *${patientName}*, le recordamos que tiene una cita médica programada en nuestro consultorio:\n\n`;
        msg += `📅 *Fecha:* ${apptDate}\n`;
        msg += `⏰ *Hora:* ${apptTime}\n`;
        msg += `🩺 *Tratamiento:* ${treatment}\n\n`;
        if (calendarLink) {
            msg += `📅 *Añadir a mi calendario:* ${calendarLink}\n\n`;
        }
        if (direccion) {
            msg += `📍 *Ubicación:* ${direccion}\n\n`;
        }
        msg += `Por favor responda a este mensaje con un *CONFIRMO* o infórmenos si requiere reprogramar.\n\n`;
        msg += `¡Le esperamos! 😊`;
        return msg;
    }

    static generateSessionReceiptMessage(patient, session, receiptUrl) {
        const exchangeRate = parseFloat(localStorage.getItem('dental_exchange_rate')) || 36.5;
        const totalUSD = session.paymentUSD || 0;
        const totalVES = (totalUSD * exchangeRate).toFixed(2);
        const clinica = this.getClinicName();

        let paymentDetail = session.paymentMethodLabel || 'Efectivo';
        if (session.paymentMethod === 'split' && session.splitPayments) {
            const parts = [];
            if (session.splitPayments.cash > 0) parts.push(`Efectivo: $${session.splitPayments.cash.toFixed(2)}`);
            if (session.splitPayments.pagomovil > 0) parts.push(`Pago Móvil: $${session.splitPayments.pagomovil.toFixed(2)}`);
            if (session.splitPayments.zelle > 0) parts.push(`Zelle: $${session.splitPayments.zelle.toFixed(2)}`);
            if (session.splitPayments.binance > 0) parts.push(`Binance: $${session.splitPayments.binance.toFixed(2)}`);
            if (session.splitPayments.punto > 0) parts.push(`Punto: $${session.splitPayments.punto.toFixed(2)}`);
            if (parts.length > 0) paymentDetail = `Pago Mixto (${parts.join(', ')})`;
        }

        let msg = `🦷 *${clinica} - RECIBO DE ATENCIÓN CLÍNICA*\n\n` +
                  `Estimado(a) *${patient.fullname}*,\n` +
                  `Adjuntamos el comprobante y constancia de conformidad de su sesión odontológica:\n\n` +
                  `📋 *N° de Sesión:* Sesión #${session.sessionNum}\n` +
                  `📅 *Fecha y Hora:* ${session.datetime}\n` +
                  `🩺 *Procedimiento:* ${session.procedure}\n`;

        if (totalUSD > 0) {
            msg += `💰 *Monto Cancelado:* *$${totalUSD.toFixed(2)} USD* / *(Bs. ${totalVES})*\n` +
                   `💳 *Forma de Pago:* ${paymentDetail}\n`;
        }

        if (session.indications) {
            msg += `📝 *Indicaciones:* ${session.indications}\n`;
        }

        msg += `\n📄 *Ver y Descargar su Recibo en PDF:* ${receiptUrl}\n\n` +
               `¡Muchas gracias por su confianza! Contáctenos ante cualquier duda.`;

        return msg;
    }

    static generateRecipeMessage(patient, recipe, recipeUrl) {
        const clinica = this.getClinicName();

        let msg = `💊 *${clinica} - PRESCRIPCIÓN MÉDICA Y RÉCIPE ODONTOLÓGICO*\n\n`;
        msg += `Estimado(a) *${patient.fullname}*,\n`;
        msg += `A continuación le adjuntamos los detalles de su Récipe Médico e Indicaciones Clínicas:\n\n`;
        msg += `📅 *Fecha:* ${recipe.date}\n`;
        msg += `🦷 *Tratamiento Vinculado:* ${recipe.treatmentLinked || 'General'}\n\n`;

        if (recipe.doctorName) {
            msg += `👨‍⚕️ *Médico / Odontólogo Tratante:* Dr(a). ${recipe.doctorName}${recipe.doctorLicense ? `\n   • *Colegiado / Licencia:* ${recipe.doctorLicense}` : ''}\n\n`;
        }

        if (recipe.medicines && recipe.medicines.length > 0) {
            msg += `📝 *MEDICAMENTOS PRESCRITOS:*\n`;
            recipe.medicines.forEach((m, i) => {
                msg += `${i + 1}. *${m.med}*\n   • Dosis: ${m.dose}\n   • Frecuencia: ${m.freq}\n`;
            });
            msg += `\n`;
        }

        if (recipe.notes) {
            msg += `📌 *Observaciones de la Receta:*\n${recipe.notes}\n\n`;
        }

        if (recipe.indications) {
            msg += `📋 *INDICACIONES Y RECOMENDACIONES CLÍNICAS:*\n${recipe.indications}\n\n`;
        }

        msg += `📄 *Ver y Descargar su Récipe Completo en PDF:* ${recipeUrl}\n\n`;
        msg += `✨ _Ante cualquier duda o síntoma inusual, por favor comuníquese de inmediato con el consultorio._`;

        return msg;
    }

    static sendToPatient(phone, message) {
        if (!phone) return;
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        const url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    }
}

window.WhatsAppService = WhatsAppService;
