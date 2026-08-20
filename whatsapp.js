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

    static generateBudgetMessage(patient, items, totalUSD, paymentMode, notes = '', subtotalUSD = 0, discountPct = 0, paymentMethodLabel = '') {
        const exchangeRate = parseFloat(localStorage.getItem('dental_exchange_rate')) || 36.5;
        const totalVES = (totalUSD * exchangeRate).toFixed(2);
        
        let template = this.getTemplate();
        const clinica = "DentalCare Pro";
        const link = `${window.location.origin}/?patientId=${patient.id}&view=budget`;

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

    static generateAppointmentReminderMessage(patientName, apptDate, apptTime, treatment) {
        let msg = `🦷 *RECORDATORIO DE CITA ODONTOLÓGICA*\n`;
        msg += `*Consultorio DentalCare Pro*\n`;
        msg += `----------------------------------------\n\n`;
        msg += `Hola *${patientName}*, le recordamos que tiene una cita médica programada en nuestro consultorio:\n\n`;
        msg += `📅 *Fecha:* ${apptDate}\n`;
        msg += `⏰ *Hora:* ${apptTime}\n`;
        msg += `🩺 *Tratamiento:* ${treatment}\n\n`;
        msg += `📍 *Ubicación:* Consultorio DentalCare Pro\n`;
        msg += `Por favor responda a este mensaje con un *CONFIRMO* o infórmenos si requiere reprogramar.\n\n`;
        msg += `¡Le esperamos! 😊`;
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
