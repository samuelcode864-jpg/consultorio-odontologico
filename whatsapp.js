/* ==========================================================================
   DENTALCARE PRO - WHATSAPP API INTEGRATION MODULE
   Generates personalized budget messages, appointment reminders & launches direct WhatsApp link
   ========================================================================== */

class WhatsAppService {
    static getTemplate() {
        const defaultTemplate = `🦷 *{CLINICA} - PRESUPUESTO ODONTOLÓGICO*\n\n` +
                               `Estimado(a) *{PACIENTE}*,\n` +
                               `A continuación detallamos la cotización de su plan de tratamiento:\n\n` +
                               `💵 *Subtotal Bruto:* {SUBTOTAL_USD} USD\n` +
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
        const clinica = "DentalCare Pro";
        const link = `${window.location.origin}/?patientId=${patient.id}&view=budget&budgetId=${budgetId}`;

        let msg = template
            .replace(/{PACIENTE}/g, patient.fullname)
            .replace(/{CLINICA}/g, clinica)
            .replace(/{SUBTOTAL_USD}/g, `$${subtotalUSD.toFixed(2)}`)
            .replace(/{DESCUENTO_PCT}/g, discountPct)
            .replace(/{TOTAL_USD}/g, `$${totalUSD.toFixed(2)} USD`)
            .replace(/{TOTAL_BS}/g, `Bs. ${totalVES}`)
            .replace(/{METODO_PAGO}/g, paymentMethodLabel)
            .replace(/{LINK_PRESUPUESTO}/g, link);

        return msg;
    }

    static generateAppointmentReminderMessage(patientName, apptDate, apptTime, treatment, calendarLink = '') {
        let msg = `🦷 *RECORDATORIO DE CITA ODONTOLÓGICA*\n`;
        msg += `*Consultorio DentalCare Pro*\n`;
        msg += `----------------------------------------\n\n`;
        msg += `Hola *${patientName}*, le recordamos que tiene una cita médica programada en nuestro consultorio:\n\n`;
        msg += `📅 *Fecha:* ${apptDate}\n`;
        msg += `⏰ *Hora:* ${apptTime}\n`;
        msg += `🩺 *Tratamiento:* ${treatment}\n\n`;
        if (calendarLink) {
            msg += `📅 *Añadir a mi calendario:* ${calendarLink}\n\n`;
        }
        msg += `📍 *Ubicación:* Consultorio DentalCare Pro\n`;
        msg += `Por favor responda a este mensaje con un *CONFIRMO* o infórmenos si requiere reprogramar.\n\n`;
        msg += `¡Le esperamos! 😊`;
        return msg;
    }

    static generateSessionReceiptMessage(patient, session, receiptUrl) {
        const exchangeRate = parseFloat(localStorage.getItem('dental_exchange_rate')) || 36.5;
        const totalUSD = session.paymentUSD || 0;
        const totalVES = (totalUSD * exchangeRate).toFixed(2);
        const clinica = "DentalCare Pro";

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

    static sendToPatient(phone, message) {
        if (!phone) return;
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        const url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    }
}

window.WhatsAppService = WhatsAppService;
