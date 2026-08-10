/* ==========================================================================
   DENTALCARE PRO - SVG ODONTOGRAM INTERACTIVE ENGINE
   Supports Adult Dentition (32 teeth) & Pediatric Dentition (20 teeth)
   ========================================================================== */

const ADULT_UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const ADULT_UPPER_LEFT  = [21, 22, 23, 24, 25, 26, 27, 28];
const ADULT_LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];
const ADULT_LOWER_LEFT  = [31, 32, 33, 34, 35, 36, 37, 38];

const PEDIATRIC_UPPER_RIGHT = [55, 54, 53, 52, 51];
const PEDIATRIC_UPPER_LEFT  = [61, 62, 63, 64, 65];
const PEDIATRIC_LOWER_RIGHT = [85, 84, 83, 82, 81];
const PEDIATRIC_LOWER_LEFT  = [71, 72, 73, 74, 75];

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
        wrapper.className = 'odontogram-grid-wrapper';
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.gap = '20px';
        wrapper.style.width = '100%';
        wrapper.style.alignItems = 'center';

        if (!this.isPediatric) {
            // Upper Maxilla (Adult)
            const upperArch = document.createElement('div');
            upperArch.className = 'dental-arch';
            const upperTeeth = [...ADULT_UPPER_RIGHT, ...ADULT_UPPER_LEFT];
            upperTeeth.forEach(num => upperArch.appendChild(this.createToothElement(num)));
            
            // Lower Mandible (Adult)
            const lowerArch = document.createElement('div');
            lowerArch.className = 'dental-arch';
            const lowerTeeth = [...ADULT_LOWER_RIGHT, ...ADULT_LOWER_LEFT];
            lowerTeeth.forEach(num => lowerArch.appendChild(this.createToothElement(num)));

            wrapper.appendChild(upperArch);
            
            // Divider label
            const divider = document.createElement('div');
            divider.style.height = '1px';
            divider.style.width = '90%';
            divider.style.background = 'var(--border-color)';
            wrapper.appendChild(divider);

            wrapper.appendChild(lowerArch);
        } else {
            // Pediatric Arch
            const upperPedi = document.createElement('div');
            upperPedi.className = 'dental-arch';
            [...PEDIATRIC_UPPER_RIGHT, ...PEDIATRIC_UPPER_LEFT].forEach(num => upperPedi.appendChild(this.createToothElement(num)));

            const lowerPedi = document.createElement('div');
            lowerPedi.className = 'dental-arch';
            [...PEDIATRIC_LOWER_RIGHT, ...PEDIATRIC_LOWER_LEFT].forEach(num => lowerPedi.appendChild(this.createToothElement(num)));

            wrapper.appendChild(upperPedi);
            wrapper.appendChild(lowerPedi);
        }

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
            this.onFaceClickCallback(toothNumber, faceId, this.currentMode, key, this.toothData);
        }
    }
}
