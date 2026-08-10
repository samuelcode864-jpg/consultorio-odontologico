/* ==========================================================================
   DENTALCARE PRO - SVG ODONTOGRAM INTERACTIVE ENGINE
   Vertical Quadrant Specification Layout (Exact User Directive)
   ========================================================================== */

const VERTICAL_LAYOUT_ROWS = [
    // Arcada Superior - Cuadrante 1
    { type: 'row', teeth: [18, 17, 16, 15] },
    { type: 'row', teeth: [14, 13, 12, 11] },
    { type: 'row', teeth: [55, 54, 53, 52, 51] }, // (excepcion de 5)

    { type: 'divider' },

    // Arcada Superior - Cuadrante 2
    { type: 'row', teeth: [21, 22, 23, 24] },
    { type: 'row', teeth: [25, 26, 27, 28] },
    { type: 'row', teeth: [61, 62, 63, 64, 65] }, // (excepcion de 5)

    { type: 'major_divider', label: 'DIVISIÓN ARCADA SUPERIOR / INFERIOR' },

    // Arcada Inferior - Cuadrante 4 & 8
    { type: 'row', teeth: [85, 84, 83, 82, 81] }, // (excepcion de 5)
    { type: 'row', teeth: [48, 47, 46, 45] },
    { type: 'row', teeth: [44, 43, 42, 41] },

    { type: 'divider' },

    // Arcada Inferior - Cuadrante 3 & 7
    { type: 'row', teeth: [71, 72, 73, 74, 75] }, // (excepcion de 5)
    { type: 'row', teeth: [31, 32, 33, 34] },
    { type: 'row', teeth: [35, 36, 37, 38] }
];

class OdontogramEngine {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.currentMode = 'patology'; // 'patology' (Rojo), 'treated' (Azul), 'proposed' (Verde), 'clear'
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
        wrapper.className = 'odontogram-vertical-layout';

        VERTICAL_LAYOUT_ROWS.forEach(item => {
            if (item.type === 'row') {
                const rowDiv = document.createElement('div');
                rowDiv.className = 'tooth-row';
                item.teeth.forEach(num => {
                    rowDiv.appendChild(this.createToothElement(num));
                });
                wrapper.appendChild(rowDiv);
            } else if (item.type === 'divider') {
                const div = document.createElement('div');
                div.className = 'odontogram-divider-line';
                wrapper.appendChild(div);
            } else if (item.type === 'major_divider') {
                const div = document.createElement('div');
                div.className = 'odontogram-major-divider';
                div.innerHTML = `<span><i class="fa-solid fa-arrows-up-down"></i> ${item.label}</span>`;
                wrapper.appendChild(div);
            }
        });

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
