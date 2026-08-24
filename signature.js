/* ==========================================================================
   DENTALCARE PRO - DIGITAL SIGNATURE PAD CANVAS
   ========================================================================== */

class SignaturePad {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');
        this.isDrawing = false;
        this.lastX = 0;
        this.lastY = 0;

        this.setupCanvas();
        this.bindEvents();
    }

    setupCanvas() {
        this.ctx.strokeStyle = '#00f2fe'; // Cyan digital ink
        this.ctx.lineWidth = 2.5;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
    }

    bindEvents() {
        const getPos = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            return {
                x: clientX - rect.left,
                y: clientY - rect.top
            };
        };

        const startDraw = (e) => {
            this.isDrawing = true;
            const pos = getPos(e);
            this.lastX = pos.x;
            this.lastY = pos.y;
        };

        const draw = (e) => {
            if (!this.isDrawing) return;
            e.preventDefault();
            const pos = getPos(e);
            
            this.ctx.beginPath();
            this.ctx.moveTo(this.lastX, this.lastY);
            this.ctx.lineTo(pos.x, pos.y);
            this.ctx.stroke();

            this.lastX = pos.x;
            this.lastY = pos.y;
        };

        const stopDraw = () => {
            this.isDrawing = false;
        };

        // Mouse events
        this.canvas.addEventListener('mousedown', startDraw);
        this.canvas.addEventListener('mousemove', draw);
        this.canvas.addEventListener('mouseup', stopDraw);
        this.canvas.addEventListener('mouseleave', stopDraw);

        // Touch events for iPad/Mobile
        this.canvas.addEventListener('touchstart', startDraw, { passive: false });
        this.canvas.addEventListener('touchmove', draw, { passive: false });
        this.canvas.addEventListener('touchend', stopDraw);
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    loadFromDataURL(dataUrl) {
        if (!dataUrl) return;
        const img = new Image();
        img.onload = () => {
            this.clear();
            const scale = Math.min(this.canvas.width / img.width, this.canvas.height / img.height);
            const w = img.width * scale;
            const h = img.height * scale;
            const x = (this.canvas.width - w) / 2;
            const y = (this.canvas.height - h) / 2;
            this.ctx.drawImage(img, x, y, w, h);
        };
        img.src = dataUrl;
    }

    isEmpty() {
        const blank = document.createElement('canvas');
        blank.width = this.canvas.width;
        blank.height = this.canvas.height;
        return this.canvas.toDataURL() === blank.toDataURL();
    }

    toDataURL() {
        return this.canvas.toDataURL('image/png');
    }
}
