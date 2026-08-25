/* ==========================================================================
   DENTALCARE PRO - KARDEX SIMPLE INVENTORY MODULE
   Manages stock, automatic deduction by procedure & low-stock alerts
   ========================================================================== */

class KardexInventory {
    constructor() {
        this.loadInventory();
    }

    loadInventory() {
        const stored = localStorage.getItem('dental_kardex') || localStorage.getItem('dental_inventory');
        if (stored) {
            try {
                this.items = JSON.parse(stored);
            } catch(e) {
                this.items = [];
            }
        } else {
            this.items = (typeof INITIAL_INVENTORY !== 'undefined') ? INITIAL_INVENTORY : [];
            this.save();
        }
    }

    save() {
        localStorage.setItem('dental_kardex', JSON.stringify(this.items));
        localStorage.setItem('dental_inventory', JSON.stringify(this.items));
    }

    getAllItems() {
        return this.items;
    }

    getItem(code) {
        return this.items.find(i => i.code === code);
    }

    addItem(newItem) {
        this.items.push(newItem);
        this.save();
    }

    deleteItem(code) {
        this.items = this.items.filter(i => i.code !== code);
        this.save();
    }

    updateStock(code, deltaQty) {
        const item = this.getItem(code);
        if (item) {
            item.currentStock = Math.max(0, item.currentStock + deltaQty);
            this.save();
        }
    }

    // Auto-deduct inventory based on a service/treatment code
    deductForTreatment(serviceCode) {
        const service = INITIAL_BAREMO.find(s => s.code === serviceCode);
        if (service && service.materials) {
            service.materials.forEach(mat => {
                this.updateStock(mat.code, -mat.qty);
            });
        }
    }

    getLowStockAlerts() {
        const alerts = [];
        const today = new Date();
        const nextMonth = new Date();
        nextMonth.setDate(today.getDate() + 30);

        this.items.forEach(item => {
            // Low stock
            if (item.currentStock <= item.minStock) {
                alerts.push({
                    type: 'low_stock',
                    item: item,
                    message: `Stock crítico (${item.currentStock} ${item.unit} restantes, min: ${item.minStock})`
                });
            }

            // Expiry
            if (item.expiryDate) {
                const expDate = new Date(item.expiryDate);
                if (expDate <= nextMonth) {
                    alerts.push({
                        type: 'expiry',
                        item: item,
                        message: `Próximo a vencer el ${item.expiryDate}`
                    });
                }
            }
        });

        return alerts;
    }
}
