/* ==========================================================================
   DENTALCARE PRO - SVG ODONTOGRAM INTERACTIVE ENGINE
   4-Quadrant Layout Specification (Exact User Directive)
   ========================================================================== */

class OdontogramEngine {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.currentMode = 'patology'; // 'patology', 'treated', 'proposed', 'clear'
        this.isPediatric = false;
        this.toothData = options.initialData || {}; // e.g. { "18-Oclusal": "patology" }
        this.onFaceClickCallback = options.onFaceClick || null;
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

        // --- UPPER ARCADA ROW ---
        const upperRow = document.createElement('div');
        upperRow.className = 'odontogram-arcada-row upper-arcada';

        // Quadrant Upper Left (q-upper-left): Adult 18-12, Infantil 55-51
        const qUpperLeft = document.createElement('div');
        qUpperLeft.className = 'odontogram-quadrant q-upper-left';
        
        const qUlTitle = document.createElement('h4');
        qUlTitle.innerText = 'Izquierdo Superior';
        qUpperLeft.appendChild(qUlTitle);

        const adultRowUL = document.createElement('div');
        adultRowUL.className = 'tooth-row adult-row';
        [18, 17, 16, 15, 14, 13, 12].forEach(num => {
            adultRowUL.appendChild(this.createToothElement(num));
        });
        qUpperLeft.appendChild(adultRowUL);

        const childRowUL = document.createElement('div');
        childRowUL.className = 'tooth-row infantil-row';
        [55, 54, 53, 52, 51].forEach(num => {
            childRowUL.appendChild(this.createToothElement(num));
        });
        qUpperLeft.appendChild(childRowUL);

        upperRow.appendChild(qUpperLeft);

        // Quadrant Upper Right (q-upper-right): Adult 21-28, Infantil 61-65
        const qUpperRight = document.createElement('div');
        qUpperRight.className = 'odontogram-quadrant q-upper-right';
        
        const qUrTitle = document.createElement('h4');
        qUrTitle.innerText = 'Derecho Superior';
        qUpperRight.appendChild(qUrTitle);

        const adultRowUR = document.createElement('div');
        adultRowUR.className = 'tooth-row adult-row';
        [21, 22, 23, 24, 25, 26, 27, 28].forEach(num => {
            adultRowUR.appendChild(this.createToothElement(num));
        });
        qUpperRight.appendChild(adultRowUR);

        const childRowUR = document.createElement('div');
        childRowUR.className = 'tooth-row infantil-row';
        [61, 62, 63, 64, 65].forEach(num => {
            childRowUR.appendChild(this.createToothElement(num));
        });
        qUpperRight.appendChild(childRowUR);

        upperRow.appendChild(qUpperRight);

        wrapper.appendChild(upperRow);

        // --- DIVIDER LINE ---
        const divider = document.createElement('div');
        divider.className = 'odontogram-divider-line';
        wrapper.appendChild(divider);

        // --- LOWER ARCADA ROW ---
        const lowerRow = document.createElement('div');
        lowerRow.className = 'odontogram-arcada-row lower-arcada';

        // Quadrant Lower Left (q-lower-left): Infantil 85-81, Adult 48-41
        const qLowerLeft = document.createElement('div');
        qLowerLeft.className = 'odontogram-quadrant q-lower-left';
        
        const qLlTitle = document.createElement('h4');
        qLlTitle.innerText = 'Izquierdo Inferior';
        qLowerLeft.appendChild(qLlTitle);

        const childRowLL = document.createElement('div');
        childRowLL.className = 'tooth-row infantil-row';
        [85, 84, 83, 82, 81].forEach(num => {
            childRowLL.appendChild(this.createToothElement(num));
        });
        qLowerLeft.appendChild(childRowLL);

        const adultRowLL = document.createElement('div');
        adultRowLL.className = 'tooth-row adult-row';
        [48, 47, 46, 45, 44, 43, 42, 41].forEach(num => {
            adultRowLL.appendChild(this.createToothElement(num));
        });
        qLowerLeft.appendChild(adultRowLL);

        lowerRow.appendChild(qLowerLeft);

        // Quadrant Lower Right (q-lower-right): Infantil 71-75, Adult 31-38
        const qLowerRight = document.createElement('div');
        qLowerRight.className = 'odontogram-quadrant q-lower-right';
        
        const qLrTitle = document.createElement('h4');
        qLrTitle.innerText = 'Derecho Inferior';
        qLowerRight.appendChild(qLrTitle);

        const childRowLR = document.createElement('div');
        childRowLR.className = 'tooth-row infantil-row';
        [71, 72, 73, 74, 75].forEach(num => {
            childRowLR.appendChild(this.createToothElement(num));
        });
        qLowerRight.appendChild(childRowLR);

        const adultRowLR = document.createElement('div');
        adultRowLR.className = 'tooth-row adult-row';
        [31, 32, 33, 34, 35, 36, 37, 38].forEach(num => {
            adultRowLR.appendChild(this.createToothElement(num));
        });
        qLowerRight.appendChild(adultRowLR);

        lowerRow.appendChild(qLowerRight);

        wrapper.appendChild(lowerRow);

        this.container.appendChild(wrapper);
    }

    createToothElement(toothNumber) {
        const box = document.createElement('div');
        box.className = 'tooth-box';
        box.dataset.tooth = toothNumber;

        // Label Top
        const labelTop = document.createElement('span');
        labelTop.className = 'tooth-number';
        labelTop.innerText = toothNumber;
        box.appendChild(labelTop);

        // SVG Diagram (Geometric 5-Face Tooth representation)
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 50 50');
        svg.setAttribute('class', 'tooth-svg');

        // 5 Faces Coordinates:
        // Vestibular (Top polygon), Distal (Right polygon), Palatina/Lingual (Bottom polygon), Mesial (Left polygon), Oclusal (Center square)
        const faces = [
            { id: 'Vestibular', points: '0,0 50,0 35,15 15,15' },
            { id: 'Distal',     points: '50,0 50,50 35,35 35,15' },
            { id: 'Lingual',    points: '50,50 0,50 15,35 35,35' },
            { id: 'Mesial',     points: '0,50 0,0 15,15 15,35' },
            { id: 'Oclusal',    points: '15,15 35,15 35,35 15,35' }
        ];

        faces.forEach(face => {
            const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            polygon.setAttribute('points', face.points);
            
            const key = `${toothNumber}-${face.id}`;
            const state = this.toothData[key];
            
            let classList = 'tooth-face';
            if (state) classList += ` ${state}`;
            polygon.setAttribute('class', classList);
            polygon.dataset.key = key;
            polygon.dataset.tooth = toothNumber;
            polygon.dataset.face = face.id;

            // Click listener
            polygon.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleFaceClick(toothNumber, face.id, key, polygon);
            });

            svg.appendChild(polygon);
        });

        box.appendChild(svg);
        return box;
    }

    handleFaceClick(toothNumber, faceId, key, polygonEl) {
        if (this.currentMode === 'clear') {
            delete this.toothData[key];
            polygonEl.setAttribute('class', 'tooth-face');
        } else {
            this.toothData[key] = this.currentMode;
            polygonEl.setAttribute('class', `tooth-face ${this.currentMode}`);
        }

        if (this.onFaceClickCallback) {
            this.onFaceClickCallback(toothNumber, faceId, this.currentMode, this.toothData);
        }
    }
}

window.OdontogramEngine = OdontogramEngine;
