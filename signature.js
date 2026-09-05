/* ==========================================================================
   DENTALCARE PRO - DIGITAL SIGNATURE PAD CANVAS & MODAL CONTROLLER
   ========================================================================== */

class SignaturePad {
    constructor(canvasId) {
        this.canvas = typeof canvasId === 'string' ? document.getElementById(canvasId) : canvasId;
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');
        this.isDrawing = false;
        this.hasDrawn = false;
        this.lastX = 0;
        this.lastY = 0;
        this.points = [];

        this.setupCanvas();
        this.bindEvents();
    }

    setupCanvas() {
        if (!this.ctx) return;
        this.ctx.strokeStyle = '#0f172a'; // Deep slate / black digital ink
        this.ctx.lineWidth = 2.8;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.canvas.style.touchAction = 'none';
    }

    resizeToDisplay() {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        // Only resize if dimensions actually changed
        if (rect.width > 0 && rect.height > 0) {
            const currentData = this.hasDrawn ? this.toDataURL() : null;
            
            this.canvas.width = rect.width * dpr;
            this.canvas.height = rect.height * dpr;
            this.ctx.scale(dpr, dpr);
            this.setupCanvas();

            if (currentData) {
                this.loadFromDataURL(currentData);
            }
        }
    }

    bindEvents() {
        if (!this.canvas) return;

        const getPos = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            let clientX = e.clientX;
            let clientY = e.clientY;

            if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            }

            return {
                x: clientX - rect.left,
                y: clientY - rect.top
            };
        };

        const startDraw = (e) => {
            e.preventDefault();
            this.isDrawing = true;
            const pos = getPos(e);
            this.lastX = pos.x;
            this.lastY = pos.y;
            this.points = [pos];

            this.ctx.beginPath();
            this.ctx.arc(pos.x, pos.y, this.ctx.lineWidth / 2, 0, Math.PI * 2);
            this.ctx.fillStyle = this.ctx.strokeStyle;
            this.ctx.fill();
        };

        const draw = (e) => {
            if (!this.isDrawing) return;
            e.preventDefault();
            const pos = getPos(e);
            
            this.ctx.beginPath();
            this.ctx.moveTo(this.lastX, this.lastY);
            this.ctx.lineTo(pos.x, pos.y);
            this.ctx.stroke();

            this.hasDrawn = true;
            this.lastX = pos.x;
            this.lastY = pos.y;
            this.points.push(pos);
        };

        const stopDraw = (e) => {
            if (this.isDrawing) {
                this.isDrawing = false;
                if (this.onEnd) this.onEnd();
            }
        };

        // Pointer / Mouse events
        this.canvas.addEventListener('mousedown', startDraw);
        this.canvas.addEventListener('mousemove', draw);
        this.canvas.addEventListener('mouseup', stopDraw);
        this.canvas.addEventListener('mouseleave', stopDraw);

        // Touch events for iPad/Tablet/Mobile
        this.canvas.addEventListener('touchstart', startDraw, { passive: false });
        this.canvas.addEventListener('touchmove', draw, { passive: false });
        this.canvas.addEventListener('touchend', stopDraw);
        this.canvas.addEventListener('touchcancel', stopDraw);
    }

    clear() {
        if (!this.canvas || !this.ctx) return;
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();
        this.hasDrawn = false;
        this.points = [];
        this.setupCanvas();
    }

    loadFromDataURL(dataUrl) {
        if (!dataUrl || !this.canvas || !this.ctx) return;
        const img = new Image();
        img.onload = () => {
            this.clear();
            const rect = this.canvas.getBoundingClientRect();
            const targetW = rect.width > 0 ? rect.width : (this.canvas.width || 380);
            const targetH = rect.height > 0 ? rect.height : (this.canvas.height || 120);

            const scale = Math.min((targetW * 0.9) / img.width, (targetH * 0.9) / img.height, 1);
            const w = img.width * scale;
            const h = img.height * scale;
            const x = (targetW - w) / 2;
            const y = (targetH - h) / 2;
            
            this.ctx.drawImage(img, x, y, w, h);
            this.hasDrawn = true;
        };
        img.src = dataUrl;
    }

    isEmpty() {
        return !this.hasDrawn;
    }

    toDataURL() {
        if (!this.canvas) return '';
        return this.canvas.toDataURL('image/png');
    }
}

// Global modal instance for wide, comfortable signature capturing
let modalSigPadInstance = null;
let activeModalSignatureCallback = null;
let activeModalClearCallback = null;

window.openSignatureModal = function(options = {}) {
    const modal = document.getElementById('modal-signature-pad');
    const canvas = document.getElementById('modal-signature-canvas');
    const titleEl = document.getElementById('modal-signature-title');
    const subtitleEl = document.getElementById('modal-signature-subtitle');
    const clearBtn = document.getElementById('btn-modal-signature-clear');
    const saveBtn = document.getElementById('btn-modal-signature-save');

    if (!modal || !canvas) {
        console.error("Signature modal elements not found in DOM");
        return;
    }

    // Set titles
    if (titleEl) titleEl.innerText = options.title || 'Firma Digital';
    if (subtitleEl) subtitleEl.innerText = options.subtitle || 'Dibuje su firma en el recuadro con el dedo, stylus o mouse';

    // Set active callbacks
    activeModalSignatureCallback = options.onSave || null;
    activeModalClearCallback = options.onClear || null;

    // Show modal
    modal.classList.remove('hidden');

    // Initialize or resize signature pad after modal is visible
    setTimeout(() => {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const width = rect.width || 600;
        const height = rect.height || 260;

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        if (!modalSigPadInstance) {
            modalSigPadInstance = new SignaturePad(canvas);
        } else {
            modalSigPadInstance.canvas = canvas;
            modalSigPadInstance.ctx = ctx;
            modalSigPadInstance.setupCanvas();
        }

        modalSigPadInstance.clear();

        // If initial dataUrl was provided, preload it
        if (options.initialDataUrl && typeof options.initialDataUrl === 'string' && options.initialDataUrl.startsWith('data:image')) {
            modalSigPadInstance.loadFromDataURL(options.initialDataUrl);
        }
    }, 50);

    // Setup Clear Button
    if (clearBtn) {
        clearBtn.onclick = (e) => {
            e.preventDefault();
            if (modalSigPadInstance) {
                modalSigPadInstance.clear();
            }
            if (activeModalClearCallback) {
                activeModalClearCallback();
            }
        };
    }

    // Setup Save Button
    if (saveBtn) {
        saveBtn.onclick = async (e) => {
            e.preventDefault();
            if (!modalSigPadInstance) return;

            let dataUrl = '';
            if (!modalSigPadInstance.isEmpty()) {
                dataUrl = modalSigPadInstance.toDataURL();
            }

            if (activeModalSignatureCallback) {
                saveBtn.disabled = true;
                const originalText = saveBtn.innerHTML;
                saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';

                try {
                    await activeModalSignatureCallback(dataUrl);
                    modal.classList.add('hidden');
                } catch (err) {
                    console.error("Error saving signature from modal:", err);
                } finally {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = originalText;
                }
            } else {
                modal.classList.add('hidden');
            }
        };
    }
};

window.closeSignatureModal = function() {
    const modal = document.getElementById('modal-signature-pad');
    if (modal) modal.classList.add('hidden');
};
