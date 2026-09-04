/* ==========================================================================
   DENTALCARE PRO - SVG ODONTODIAGRAMA INTERACTIVE ENGINE (FDI REGULADO)
   ========================================================================== */

class OdontogramEngine {
    constructor(containerId, options = {}) {
        this.container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
        this.currentMode = 'patology'; // 'patology', 'treated', 'proposed', 'endo', 'clear'
        this.isPediatric = options.isPediatric || false;
        this.toothData = options.initialData || {}; // e.g. { "18-top": "patology" }
        this.onFaceClickCallback = options.onFaceClick || null;
        this.readOnly = options.readOnly || false;
        if (this.container) {
            this.render();
        }
    }

    setMode(mode) {
        this.currentMode = mode;
    }

    setPediatric(isPedi) {
        this.isPediatric = isPedi;
        this.render();
    }

    setData(data) {
        this.toothData = data || {};
        this.render();
    }

    getData() {
        return this.toothData;
    }

    render() {
        if (!this.container) return;
        this.container.innerHTML = '';

        const wrapper = document.createElement('div');
        wrapper.className = 'odontogram-grid-layout';
        if (this.isPediatric) {
            wrapper.classList.add('pediatric-only');
        } else {
            wrapper.classList.add('adult-only');
        }

        // --- CUADRANTE 1 (Superior Izquierdo de pantalla / Derecho de paciente) ---
        const q1 = document.createElement('div');
        q1.className = 'odontogram-quadrant q-upper-left';
        
        const q1Title = document.createElement('h4');
        q1Title.innerText = 'Cuadrante 1 (Sup. Derecho de Paciente)';
        q1.appendChild(q1Title);

        const adultRow1 = document.createElement('div');
        adultRow1.className = 'tooth-row adult-row';
        [18, 17, 16, 15, 14, 13, 12, 11].forEach(num => {
            adultRow1.appendChild(this.createToothElement(num));
        });
        q1.appendChild(adultRow1);

        const childRow1 = document.createElement('div');
        childRow1.className = 'tooth-row infantil-row align-right';
        [55, 54, 53, 52, 51].forEach(num => {
            childRow1.appendChild(this.createToothElement(num));
        });
        q1.appendChild(childRow1);

        wrapper.appendChild(q1);

        // --- CUADRANTE 2 (Superior Derecho de pantalla / Izquierdo de paciente) ---
        const q2 = document.createElement('div');
        q2.className = 'odontogram-quadrant q-upper-right';
        
        const q2Title = document.createElement('h4');
        q2Title.innerText = 'Cuadrante 2 (Sup. Izquierdo de Paciente)';
        q2.appendChild(q2Title);

        const adultRow2 = document.createElement('div');
        adultRow2.className = 'tooth-row adult-row';
        [21, 22, 23, 24, 25, 26, 27, 28].forEach(num => {
            adultRow2.appendChild(this.createToothElement(num));
        });
        q2.appendChild(adultRow2);

        const childRow2 = document.createElement('div');
        childRow2.className = 'tooth-row infantil-row align-left';
        [61, 62, 63, 64, 65].forEach(num => {
            childRow2.appendChild(this.createToothElement(num));
        });
        q2.appendChild(childRow2);

        wrapper.appendChild(q2);

        // --- CUADRANTE 4 (Inferior Izquierdo de pantalla / Derecho de paciente) ---
        const q4 = document.createElement('div');
        q4.className = 'odontogram-quadrant q-lower-left';
        
        const q4Title = document.createElement('h4');
        q4Title.innerText = 'Cuadrante 4 (Inf. Derecho de Paciente)';
        q4.appendChild(q4Title);

        const childRow4 = document.createElement('div');
        childRow4.className = 'tooth-row infantil-row align-right';
        [85, 84, 83, 82, 81].forEach(num => {
            childRow4.appendChild(this.createToothElement(num));
        });
        q4.appendChild(childRow4);

        const adultRow4 = document.createElement('div');
        adultRow4.className = 'tooth-row adult-row';
        [48, 47, 46, 45, 44, 43, 42, 41].forEach(num => {
            adultRow4.appendChild(this.createToothElement(num));
        });
        q4.appendChild(adultRow4);

        wrapper.appendChild(q4);

        // --- CUADRANTE 3 (Inferior Derecho de pantalla / Izquierdo de paciente) ---
        const q3 = document.createElement('div');
        q3.className = 'odontogram-quadrant q-lower-right';
        
        const q3Title = document.createElement('h4');
        q3Title.innerText = 'Cuadrante 3 (Inf. Izquierdo de Paciente)';
        q3.appendChild(q3Title);

        const childRow3 = document.createElement('div');
        childRow3.className = 'tooth-row infantil-row align-left';
        [71, 72, 73, 74, 75].forEach(num => {
            childRow3.appendChild(this.createToothElement(num));
        });
        q3.appendChild(childRow3);

        const adultRow3 = document.createElement('div');
        adultRow3.className = 'tooth-row adult-row';
        [31, 32, 33, 34, 35, 36, 37, 38].forEach(num => {
            adultRow3.appendChild(this.createToothElement(num));
        });
        q3.appendChild(adultRow3);

        wrapper.appendChild(q3);

        this.container.appendChild(wrapper);
    }

    createToothElement(toothNumber) {
        const box = document.createElement('div');
        box.className = 'tooth-box';
        box.dataset.tooth = toothNumber;

        // Label Top/Bottom depending on upper/lower row
        const label = document.createElement('span');
        label.className = 'tooth-number';
        label.innerText = toothNumber;
        
        const isUpper = (toothNumber >= 11 && toothNumber <= 28) || (toothNumber >= 51 && toothNumber <= 65);
        
        if (isUpper) {
            box.appendChild(label);
        }

        // SVG Diagram (Geometric 5-Face Tooth representation)
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 40 40');
        svg.setAttribute('class', 'tooth-svg');

        // 5 Faces coordinates (Vestibular/top, Distal/right, Lingual/bottom, Mesial/left, Oclusal/center)
        const faces = [
            { id: 'top',    type: 'polygon', points: '0,0 40,0 28,12 12,12' },
            { id: 'right',  type: 'polygon', points: '40,0 40,40 28,28 28,12' },
            { id: 'bottom', type: 'polygon', points: '40,40 0,40 12,28 28,28' },
            { id: 'left',   type: 'polygon', points: '0,40 0,0 12,12 12,28' },
            { id: 'center', type: 'rect',    x: 12, y: 12, width: 16, height: 16 }
        ];

        faces.forEach(face => {
            let el;
            if (face.type === 'polygon') {
                el = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                el.setAttribute('points', face.points);
            } else {
                el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                el.setAttribute('x', face.x);
                el.setAttribute('y', face.y);
                el.setAttribute('width', face.width);
                el.setAttribute('height', face.height);
            }
            
            const key = `${toothNumber}-${face.id}`;
            const state = this.toothData[key];
            
            let classList = 'tooth-face';
            if (state) classList += ` ${state}`;
            el.setAttribute('class', classList);
            el.dataset.key = key;
            el.dataset.tooth = toothNumber;
            el.dataset.face = face.id;

            // Click listener
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleFaceClick(toothNumber, face.id, key, el);
            });

            // Right-click listener to erase
            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.handleFaceRightClick(toothNumber, face.id, key, el);
            });

            svg.appendChild(el);
        });

        // Check for tooth absence (X azul) or extraction (X roja)
        const isAbsent = !!this.toothData[`${toothNumber}-absence`] || this.toothData[`${toothNumber}-all`] === 'absence' || this.toothData[`${toothNumber}`] === 'absence';
        const isExtraction = !!this.toothData[`${toothNumber}-extraction`] || this.toothData[`${toothNumber}-all`] === 'extraction' || this.toothData[`${toothNumber}`] === 'extraction';

        if (isAbsent || isExtraction) {
            const crossColor = isAbsent ? '#2563eb' : '#dc2626';
            const crossClass = isAbsent ? 'tooth-absence-x' : 'tooth-extraction-x';

            const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line1.setAttribute('x1', '2');
            line1.setAttribute('y1', '2');
            line1.setAttribute('x2', '38');
            line1.setAttribute('y2', '38');
            line1.setAttribute('stroke', crossColor);
            line1.setAttribute('stroke-width', '3.5');
            line1.setAttribute('stroke-linecap', 'round');
            line1.setAttribute('class', crossClass);
            svg.appendChild(line1);

            const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line2.setAttribute('x1', '38');
            line2.setAttribute('y1', '2');
            line2.setAttribute('x2', '2');
            line2.setAttribute('y2', '38');
            line2.setAttribute('stroke', crossColor);
            line2.setAttribute('stroke-width', '3.5');
            line2.setAttribute('stroke-linecap', 'round');
            line2.setAttribute('class', crossClass);
            svg.appendChild(line2);
            
            box.classList.add(isAbsent ? 'is-absent' : 'is-extraction');
        }

        // Check for Endodontic status (Sano = linea azul, Por Hacer = linea roja, Rehacer = doble linea azul + roja)
        const endoStatus = this.toothData[`${toothNumber}-endo`] || this.toothData[`${toothNumber}-endo-status`];
        if (endoStatus) {
            if (endoStatus === 'sano') {
                const lineBlue = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                lineBlue.setAttribute('x1', '20');
                lineBlue.setAttribute('y1', '0');
                lineBlue.setAttribute('x2', '20');
                lineBlue.setAttribute('y2', '40');
                lineBlue.setAttribute('stroke', '#2563eb');
                lineBlue.setAttribute('stroke-width', '4.5');
                lineBlue.setAttribute('stroke-linecap', 'butt');
                lineBlue.setAttribute('class', 'tooth-endo-line-sano');
                svg.appendChild(lineBlue);
            } else if (endoStatus === 'por_hacer') {
                const lineRed = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                lineRed.setAttribute('x1', '20');
                lineRed.setAttribute('y1', '0');
                lineRed.setAttribute('x2', '20');
                lineRed.setAttribute('y2', '40');
                lineRed.setAttribute('stroke', '#dc2626');
                lineRed.setAttribute('stroke-width', '4.5');
                lineRed.setAttribute('stroke-linecap', 'butt');
                lineRed.setAttribute('class', 'tooth-endo-line-porhacer');
                svg.appendChild(lineRed);
            } else if (endoStatus === 'rehacer') {
                const lineBlue = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                lineBlue.setAttribute('x1', '17');
                lineBlue.setAttribute('y1', '0');
                lineBlue.setAttribute('x2', '17');
                lineBlue.setAttribute('y2', '40');
                lineBlue.setAttribute('stroke', '#2563eb');
                lineBlue.setAttribute('stroke-width', '3.5');
                lineBlue.setAttribute('stroke-linecap', 'butt');
                lineBlue.setAttribute('class', 'tooth-endo-line-rehacer-blue');
                svg.appendChild(lineBlue);

                const lineRed = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                lineRed.setAttribute('x1', '23');
                lineRed.setAttribute('y1', '0');
                lineRed.setAttribute('x2', '23');
                lineRed.setAttribute('y2', '40');
                lineRed.setAttribute('stroke', '#dc2626');
                lineRed.setAttribute('stroke-width', '3.5');
                lineRed.setAttribute('stroke-linecap', 'butt');
                lineRed.setAttribute('class', 'tooth-endo-line-rehacer-red');
                svg.appendChild(lineRed);
            }
        }

        box.appendChild(svg);
        
        if (!isUpper) {
            box.appendChild(label);
        }

        return box;
    }

    handleFaceClick(toothNumber, faceId, key, el) {
        if (this.readOnly) return;

        if (this.currentMode === 'endo') {
            if (this.onFaceClickCallback) {
                this.onFaceClickCallback(toothNumber, 'all', 'endo', `${toothNumber}-endo`);
            }
            return;
        }
        
        if (this.currentMode === 'absence') {
            const absenceKey = `${toothNumber}-absence`;
            const extractionKey = `${toothNumber}-extraction`;
            delete this.toothData[extractionKey];

            if (this.toothData[absenceKey]) {
                delete this.toothData[absenceKey];
            } else {
                this.toothData[absenceKey] = 'absence';
            }
            this.render();
            if (this.onFaceClickCallback) {
                this.onFaceClickCallback(toothNumber, 'all', 'absence', absenceKey);
            }
            return;
        }

        if (this.currentMode === 'extraction') {
            const extractionKey = `${toothNumber}-extraction`;
            const absenceKey = `${toothNumber}-absence`;
            delete this.toothData[absenceKey];

            if (this.toothData[extractionKey]) {
                delete this.toothData[extractionKey];
            } else {
                this.toothData[extractionKey] = 'extraction';
            }
            this.render();
            if (this.onFaceClickCallback) {
                this.onFaceClickCallback(toothNumber, 'all', 'extraction', extractionKey);
            }
            return;
        }

        if (this.currentMode === 'treated') {
            const faces = ['top', 'right', 'bottom', 'left', 'center'];
            delete this.toothData[`${toothNumber}-absence`];
            delete this.toothData[`${toothNumber}-extraction`];

            faces.forEach(f => {
                const fKey = `${toothNumber}-${f}`;
                this.toothData[fKey] = 'treated';
            });
            this.render();
            if (this.onFaceClickCallback) {
                this.onFaceClickCallback(toothNumber, 'all', 'treated', `${toothNumber}-treated`);
            }
            return;
        }

        if (this.currentMode === 'clear') {
            delete this.toothData[`${toothNumber}-absence`];
            delete this.toothData[`${toothNumber}-extraction`];
            delete this.toothData[`${toothNumber}-endo`];
            delete this.toothData[`${toothNumber}-endo-status`];
            ['top', 'right', 'bottom', 'left', 'center'].forEach(f => {
                delete this.toothData[`${toothNumber}-${f}`];
            });
            this.render();
            if (this.onFaceClickCallback) {
                this.onFaceClickCallback(toothNumber, 'all', 'clear', `${toothNumber}-clear`);
            }
            return;
        } else {
            this.toothData[key] = this.currentMode;
            this.render();
        }

        if (this.onFaceClickCallback) {
            this.onFaceClickCallback(toothNumber, faceId, this.currentMode, key);
        }
    }

    handleFaceRightClick(toothNumber, faceId, key, el) {
        if (this.readOnly) return;
        delete this.toothData[`${toothNumber}-absence`];
        delete this.toothData[`${toothNumber}-extraction`];
        delete this.toothData[`${toothNumber}-endo`];
        delete this.toothData[`${toothNumber}-endo-status`];
        ['top', 'right', 'bottom', 'left', 'center'].forEach(f => {
            delete this.toothData[`${toothNumber}-${f}`];
        });
        this.render();

        if (this.onFaceClickCallback) {
            this.onFaceClickCallback(toothNumber, 'all', 'clear', `${toothNumber}-clear`);
        }
    }
}

window.OdontogramEngine = OdontogramEngine;
