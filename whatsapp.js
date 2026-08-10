/* ==========================================================================
   DENTALCARE PRO - WHATSAPP API INTEGRATION MODULE
   Generates personalized budget messages, appointment reminders & launches direct WhatsApp link
   ========================================================================== */

class WhatsAppService {
    static generateBudgetMessage(patient, items, totalUSD, paymentMode, notes = '') {
        const exchangeRate = parseFloat(localStorage.getItem('dental_exchange_rate')) || 36.5;
        const totalVES = (totalUSD * exchangeRate).toFixed(2);
        
        let msg = `🦷 *PRESUPUESTO ODONTOLÓGICO Y CLINICO*\n`;
        msg += `*Consultorio DentalCare Pro*\n`;
        msg += `Dr. Alejandro Silva - Odontólogo Unipersonal\n`;
        msg += `----------------------------------------\n\n`;
        
        msg += `👤 *Paciente:* ${patient.fullname}\n`;
        msg += `🪪 *Cédula:* ${patient.id}\n`;
        msg += `📅 *Fecha:* ${new Date().toLocaleDateString('es-ES')}\n\n`;

        msg += `📋 *DESGLOSE DE TRATAMIENTOS (ODONTOGRAMA):*\n`;
        
        if (items && items.length > 0) {
            items.forEach((item, index) => {
                const toothInfo = item.tooth ? `Pieza ${item.tooth} (${item.face})` : `General`;
                msg += `${index + 1}. *${toothInfo}:* ${item.name} -> *$${item.price.toFixed(2)}*\n`;
            });
        } else {
            msg += `• Evaluación y Diagnóstico General\n`;
        }

        msg += `\n💵 *TOTAL PRESUPUESTO:* *$${totalUSD.toFixed(2)} USD* / *(Bs. ${totalVES})*\n`;
        msg += `💳 *Modalidad de Pago:* ${paymentMode}\n`;

        if (notes && notes.trim() !== '') {
            msg += `\n📝 *Observaciones Médicas:* ${notes}\n`;
        }

        msg += `\n⚖️ *Consentimiento:* Plan de tratamiento aceptado digitalmente.\n`;
        msg += `Quedamos a su entera disposición para coordinar sus citas.\n\n`;
        msg += `_Mensaje generado automáticamente por DentalCare Pro ERP/EHR._`;

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
        if (!phone) {
            alert('El paciente no tiene un número telefónico registrado.');
            return;
        }
        
        // Clean phone number (remove spaces, plus sign, dashes)
        let cleanPhone = phone.replace(/[^0-9]/g, '');
        if (!cleanPhone.startsWith('58') && cleanPhone.startsWith('0')) {
            cleanPhone = '58' + cleanPhone.substring(1);
        }
        
        const encodedText = encodeURIComponent(message);
        const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
        
        window.open(waUrl, '_blank');
    }
}
