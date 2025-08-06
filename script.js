class DrawBoard {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvasContainer = document.getElementById('canvasContainer');
        
        // Stan aplikacji
        this.elements = [];
        this.history = [];
        this.historyStep = -1;
        this.currentTool = 'rectangle';
        this.currentColor = '#2E3440';
        this.currentStrokeWidth = 2;
        this.currentOpacity = 100;
        
        // Stan rysowania
        this.isDrawing = false;
        this.startX = 0;
        this.startY = 0;
        this.selectedElement = null;
        this.isDragging = false;
        this.tempElement = null;
        
        // Free drawing
        this.freeDrawPath = [];
        this.isFreeDraw = false;
        
        // Wielokrotne zaznaczanie
        this.selectedElements = [];
        this.selectionBox = null;
        this.isSelecting = false;
        
        // Stan kamery/widoku
        this.camera = { x: 0, y: 0, zoom: 1 };
        this.isPanning = false;
        this.lastPanPoint = { x: 0, y: 0 };
        this.isMiddleMousePanning = false;

        // Google Drive integration
        this.isGoogleDriveConnected = false;
        this.accessToken = null;
        this.DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
        this.SCOPES = 'https://www.googleapis.com/auth/drive.file';
        this.FOLDER_NAME = 'DrawBoard Pro Drawings';
        this.folderId = null;

        this.gapiInited = false;
        this.gisInited = false;
        
        this.init();
    }
    
    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.setupToolbar();
        this.history = [[]];
        this.historyStep = 0;
        this.updateButtons();
        this.redraw();

        // Inicjalizuj Google Drive API
        this.initGoogleDrive();
    }
    
    setupCanvas() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
    }
    
    resizeCanvas() {
        const container = this.canvasContainer;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        this.redraw();
    }
    
    setupEventListeners() {
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
        this.canvasContainer.addEventListener('wheel', (e) => this.handleWheel(e));
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    
    setupToolbar() {
        const importSVG = document.getElementById('importSVG');
        const importSVGBtn = document.getElementById('importSVGBtn');
        importSVGBtn.addEventListener('click', () => importSVG.click());
        importSVG.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                this.importSVG(event.target.result);
            };
            reader.readAsText(file);
        });
        document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelector('.tool-btn.active')?.classList.remove('active');
                btn.classList.add('active');
                this.currentTool = btn.dataset.tool;
                this.selectedElement = null;
                this.selectedElements = [];
                this.redraw();
            });
        });
        
        document.querySelectorAll('.color-option').forEach(option => {
            option.addEventListener('click', () => {
                document.querySelector('.color-option.active')?.classList.remove('active');
                option.classList.add('active');
                this.currentColor = option.dataset.color;
                
                // Update selected elements color
                if (this.selectedElements.length > 0) {
                    this.selectedElements.forEach(element => {
                        element.color = this.currentColor;
                    });
                    this.saveState();
                    this.redraw();
                }
            });
        });
        
        const strokeWidth = document.getElementById('strokeWidth');
        const strokeValue = document.getElementById('strokeValue');
        strokeWidth.addEventListener('input', () => {
            this.currentStrokeWidth = parseInt(strokeWidth.value);
            strokeValue.textContent = strokeWidth.value;
            
            // Update selected elements stroke width
            if (this.selectedElements.length > 0) {
                this.selectedElements.forEach(element => {
                    element.strokeWidth = this.currentStrokeWidth;
                });
                this.saveState();
                this.redraw();
            }
        });
        
        // Opacity control
        const opacityRange = document.getElementById('opacityRange');
        const opacityValue = document.getElementById('opacityValue');
        opacityRange.addEventListener('input', () => {
            this.currentOpacity = parseInt(opacityRange.value);
            opacityValue.textContent = opacityRange.value + '%';
            
            // Update selected elements opacity
            if (this.selectedElements.length > 0) {
                this.selectedElements.forEach(element => {
                    element.opacity = this.currentOpacity;
                });
                this.saveState();
                this.redraw();
            }
        });
        
        document.getElementById('undoBtn').addEventListener('click', () => this.undo());
        document.getElementById('redoBtn').addEventListener('click', () => this.redo());
        document.getElementById('clearCanvas').addEventListener('click', () => this.clearCanvas());
        document.getElementById('exportPNG').addEventListener('click', () => this.exportPNG());
        document.getElementById('exportSVG').addEventListener('click', () => this.exportSVG());
        // Google Drive integration
        document.getElementById('googleDriveLogin').addEventListener('click', () => {
            if (!this.isGoogleDriveConnected) {
                this.loginToGoogleDrive();
            }
        });

        document.getElementById('saveToCloud').addEventListener('click', () => {
            this.saveToGoogleDrive();
        });

        document.getElementById('loadFromCloud').addEventListener('click', () => {
            this.loadFromGoogleDrive();
        });

    }
    
    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left - this.camera.x) / this.camera.zoom,
            y: (e.clientY - rect.top - this.camera.y) / this.camera.zoom
        };
    }

    handleMouseDown(e) {
        const pos = this.getMousePos(e);
        this.startX = pos.x;
        this.startY = pos.y;
        
        // Middle mouse button for panning
        if (e.button === 1) {
            e.preventDefault();
            this.isMiddleMousePanning = true;
            this.lastPanPoint = {x: e.clientX, y: e.clientY};
            this.canvas.style.cursor = 'grab';
            return;
        }
        
        // Pan with Shift
        if (e.shiftKey && e.button === 0) {
            this.isPanning = true;
            this.lastPanPoint = {x: e.clientX, y: e.clientY};
            this.canvas.style.cursor = 'grab';
            return;
        }
        
        if (this.currentTool === 'text') {
            this.createTextInput(pos.x, pos.y);
            return;
        }
        
        this.isDrawing = true;
        
        if (this.currentTool === 'freedraw') {
            this.isFreeDraw = true;
            this.freeDrawPath = [{x: pos.x, y: pos.y}];
            this.tempElement = this.createElement('freedraw', pos.x, pos.y, pos.x, pos.y);
            this.tempElement.path = [...this.freeDrawPath];
        } else if (this.currentTool === 'select') {
            this.selectedElement = this.getElementAt(pos.x, pos.y);
            
            if (e.ctrlKey && this.selectedElement) {
                const index = this.selectedElements.indexOf(this.selectedElement);
                if (index > -1) {
                    this.selectedElements.splice(index, 1);
                } else {
                    this.selectedElements.push(this.selectedElement);
                }
                this.selectedElement = null;
            } else if (this.selectedElement) {
                if (!this.selectedElements.includes(this.selectedElement)) {
                    this.selectedElements = [this.selectedElement];
                }
                this.isDragging = true;
                this.canvas.style.cursor = 'move';
            } else {
                this.selectedElements = [];
                this.selectedElement = null;
                this.isSelecting = true;
                this.selectionBox = {
                    startX: pos.x,
                    startY: pos.y,
                    endX: pos.x,
                    endY: pos.y
                };
            }
        } else {
            this.selectedElements = [];
            this.selectedElement = null;
            this.tempElement = this.createElement(this.currentTool, pos.x, pos.y, pos.x, pos.y);
        }
        
        this.redraw();
    }

    handleMouseMove(e) {
        const pos = this.getMousePos(e);
        
        if (this.isPanning || this.isMiddleMousePanning) {
            const deltaX = e.clientX - this.lastPanPoint.x;
            const deltaY = e.clientY - this.lastPanPoint.y;
            
            this.camera.x += deltaX;
            this.camera.y += deltaY;
            this.lastPanPoint = {x: e.clientX, y: e.clientY};
            
            this.canvas.style.cursor = 'grabbing';
            this.redraw();
            return;
        }
        
        if (this.isDrawing) {
            if (this.isFreeDraw && this.currentTool === 'freedraw') {
                // Add point to free draw path
                this.freeDrawPath.push({x: pos.x, y: pos.y});
                if (this.tempElement) {
                    this.tempElement.path = [...this.freeDrawPath];
                }
            } else if (this.isSelecting) {
                this.selectionBox.endX = pos.x;
                this.selectionBox.endY = pos.y;
            } else if (this.isDragging && this.selectedElements.length > 0) {
                const dx = pos.x - this.startX;
                const dy = pos.y - this.startY;
                
                this.selectedElements.forEach(element => {
                    this.moveElement(element, dx, dy);
                });
                
                this.startX = pos.x;
                this.startY = pos.y;
            } else if (this.tempElement && this.currentTool !== 'freedraw') {
                this.tempElement.endX = pos.x;
                this.tempElement.endY = pos.y;
            }
            
            this.redraw();
        } else {
            const element = this.getElementAt(pos.x, pos.y);
            if (element && this.currentTool === 'select') {
                this.canvas.style.cursor = 'pointer';
            } else {
                this.canvas.style.cursor = 'crosshair';
            }
        }
    }

    handleMouseUp(e) {
        if (this.isPanning) {
            this.isPanning = false;
            this.canvas.style.cursor = 'crosshair';
            return;
        }
        
        if (this.isMiddleMousePanning) {
            this.isMiddleMousePanning = false;
            this.canvas.style.cursor = 'crosshair';
            return;
        }
        
        if (this.isDrawing) {
            if (this.isFreeDraw && this.tempElement) {
                // Finish free draw
                if (this.freeDrawPath.length > 1) {
                    this.elements.push(this.tempElement);
                    this.saveState();
                }
                this.isFreeDraw = false;
                this.freeDrawPath = [];
                this.tempElement = null;
            } else if (this.isSelecting) {
                this.selectedElements = this.getElementsInSelection();
                this.isSelecting = false;
                this.selectionBox = null;
            } else if (this.tempElement) {
                if (Math.abs(this.tempElement.endX - this.tempElement.startX) > 5 || 
                    Math.abs(this.tempElement.endY - this.tempElement.startY) > 5) {
                    this.elements.push(this.tempElement);
                    this.saveState();
                }
                this.tempElement = null;
            } else if (this.isDragging) {
                this.saveState();
            }
            
            this.isDrawing = false;
            this.isDragging = false;
            this.canvas.style.cursor = 'crosshair';
            this.redraw();
        }
    }

    handleDoubleClick(e) {
        if (this.currentTool === 'select') {
            const pos = this.getMousePos(e);
            const element = this.getElementAt(pos.x, pos.y);
            if (element && element.type === 'text') {
                this.editText(element);
            }
        }
    }
    
    handleWheel(e) {
        e.preventDefault();
        
        if (e.ctrlKey || e.metaKey) {
            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
            const newZoom = Math.max(0.1, Math.min(3, this.camera.zoom * zoomFactor));
            
            if (newZoom !== this.camera.zoom) {
                const rect = this.canvas.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                
                this.camera.x = mouseX - (mouseX - this.camera.x) * (newZoom / this.camera.zoom);
                this.camera.y = mouseY - (mouseY - this.camera.y) * (newZoom / this.camera.zoom);
                this.camera.zoom = newZoom;
                
                document.getElementById('zoomLevel').textContent = Math.round(this.camera.zoom * 100) + '%';
            }
        } else {
            this.camera.x -= e.deltaX;
            this.camera.y -= e.deltaY;
        }
        
        this.redraw();
    }

    handleKeyDown(e) {
        if (document.querySelector('.text-input')) {
            return;
        }
        
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.undo();
            } else if (e.key === 'x' || (e.key === 'z' && e.shiftKey)) {
                e.preventDefault();
                this.redo();
            } else if (e.key === 'a' && this.currentTool === 'select') {
                e.preventDefault();
                this.selectedElements = [...this.elements];
                this.redraw();
            }
        } else if (e.key === 'Delete') {
            if (this.selectedElements.length > 0) {
                this.selectedElements.forEach(element => {
                    this.deleteElement(element);
                });
                this.selectedElements = [];
                this.saveState();
                this.redraw();
            } else if (this.selectedElement) {
                this.deleteElement(this.selectedElement);
                this.selectedElement = null;
                this.saveState();
                this.redraw();
            }
        } else if (e.key === 'Escape') {
            this.selectedElements = [];
            this.selectedElement = null;
            this.redraw();
        }
    }
    
    createElement(type, startX, startY, endX, endY) {
        return {
            type,
            startX,
            startY,
            endX,
            endY,
            color: this.currentColor,
            strokeWidth: this.currentStrokeWidth,
            opacity: this.currentOpacity,
            id: Date.now() + Math.random()
        };
    }
    
    createTextInput(x, y) {
        const rect = this.canvas.getBoundingClientRect();
        const input = document.createElement('textarea');
        input.className = 'text-input';
        
        const screenX = rect.left + (x * this.camera.zoom) + this.camera.x;
        const screenY = rect.top + (y * this.camera.zoom) + this.camera.y;
        
        input.style.position = 'absolute';
        input.style.left = screenX + 'px';
        input.style.top = screenY + 'px';
        input.style.fontSize = (16 * this.camera.zoom) + 'px';
        input.style.minWidth = '150px';
        input.style.maxWidth = '400px';
        input.style.minHeight = '25px';
        input.style.zIndex = '1000';
        input.style.border = '2px solid #3b82f6';
        input.style.background = 'white';
        input.style.fontFamily = 'Arial, sans-serif';
        input.style.padding = '6px 8px';
        input.style.borderRadius = '4px';
        input.style.outline = 'none';
        input.style.resize = 'both';
        input.style.whiteSpace = 'pre-wrap';
        input.style.wordWrap = 'break-word';
        input.style.overflowWrap = 'break-word';
        input.style.lineHeight = '1.4';
        input.placeholder = 'Wpisz tekst...';
        
        document.body.appendChild(input);
        
        
        const autoResize = () => {
            input.style.height = 'auto';
            input.style.height = input.scrollHeight + 'px';
            
            const textWidth = input.value.length * (8 * this.camera.zoom);
            if (textWidth > 150 && textWidth < 400) {
                input.style.width = textWidth + 'px';
            }
        };
        
        input.addEventListener('input', autoResize);
        
        setTimeout(() => {
            input.focus();
            input.select();
            autoResize();
        }, 10);

        let textInputFinished = false;

        const finishText = () => {
            if (textInputFinished) return;
            textInputFinished = true;
            
            const text = input.value.trim();
            if (text) {
                const element = this.createElement('text', x, y, x, y);
                element.text = text;
                element.fontSize = 16;
                element.multiline = text.includes('\n');
                this.elements.push(element);
                this.saveState();
            }
            input.remove();
            this.redraw();
        };

        input.addEventListener('blur', finishText);
        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Escape') {
                textInputFinished = true;
                input.remove();
                this.redraw();
            } else if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                finishText();
            }
        });

        input.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });
        input.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    editText(textElement) {
        const rect = this.canvas.getBoundingClientRect();
        const input = document.createElement('textarea');
        input.className = 'text-input';
        
        input.style.left = (rect.left + (textElement.startX * this.camera.zoom) + this.camera.x) + 'px';
        input.style.top = (rect.top + (textElement.startY * this.camera.zoom) + this.camera.y) + 'px';
        input.style.fontSize = (textElement.fontSize * this.camera.zoom) + 'px';
        input.value = textElement.text;
        
        document.body.appendChild(input);
        input.focus();
        input.select();
        
        const finishEdit = () => {
            const text = input.value.trim();
            if (text) {
                textElement.text = text;
                this.saveState();
            } else {
                this.deleteElement(textElement);
                this.selectedElement = null;
                this.saveState();
            }
            input.remove();
            this.redraw();
        };
        
        input.addEventListener('blur', finishEdit);
        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Escape') {
                input.remove();
                this.redraw();
            } else if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                finishEdit();
            }
        });
    }

    getElementAt(x, y) {
        let candidates = [];
        
        for (let i = 0; i < this.elements.length; i++) {
            const element = this.elements[i];
            
            switch (element.type) {
                case 'rectangle':
                    if (this.isPointInRectangle(x, y, element)) {
                        candidates.push({ element, index: i, priority: this.getElementPriority(element, x, y) });
                    }
                    break;
                case 'circle':
                    if (this.isPointInCircle(x, y, element)) {
                        candidates.push({ element, index: i, priority: this.getElementPriority(element, x, y) });
                    }
                    break;
                case 'line':
                case 'dashed-line':
                case 'dotted-line':
                case 'arrow':
                    if (this.isPointNearLine(x, y, element)) {
                        candidates.push({ element, index: i, priority: this.getElementPriority(element, x, y) });
                    }
                    break;
                case 'freedraw':
                    if (this.isPointNearPath(x, y, element)) {
                        candidates.push({ element, index: i, priority: this.getElementPriority(element, x, y) });
                    }
                    break;
                case 'text':
                    if (this.isPointInText(x, y, element)) {
                        candidates.push({ element, index: i, priority: this.getElementPriority(element, x, y) });
                    }
                    break;
            }
        }
        
        if (candidates.length === 0) return null;
        
        candidates.sort((a, b) => b.priority - a.priority);
        return candidates[0].element;
    }
    
    isPointNearPath(x, y, element, tolerance = 8) {
        if (!element.path || element.path.length < 2) return false;
        
        for (let i = 0; i < element.path.length - 1; i++) {
            const distance = this.distanceToLine(
                x, y,
                element.path[i].x, element.path[i].y,
                element.path[i + 1].x, element.path[i + 1].y
            );
            if (distance <= tolerance) return true;
        }
        return false;
    }
    
    getElementPriority(element, x, y) {
        let priority = 0;
        
        const index = this.elements.indexOf(element);
        priority += index * 1000;
        
        let area = 0;
        
        switch (element.type) {
            case 'rectangle':
                area = Math.abs(element.endX - element.startX) * Math.abs(element.endY - element.startY);
                break;
            case 'circle':
                const radiusX = Math.abs(element.endX - element.startX) / 2;
                const radiusY = Math.abs(element.endY - element.startY) / 2;
                area = Math.PI * radiusX * radiusY;
                break;
            case 'line':
            case 'dashed-line':
            case 'dotted-line':
            case 'arrow':
                area = Math.sqrt(Math.pow(element.endX - element.startX, 2) + Math.pow(element.endY - element.startY, 2));
                break;
            case 'freedraw':
                if (element.path) {
                    area = element.path.length * 10;
                }
                break;
            case 'text':
                area = element.text.length * element.fontSize;
                break;
        }
        
        priority += Math.max(0, 1000000 - area);
        
        if (element.type === 'text') {
            priority += 2000000;
        }
        
        return priority;
    }
    
    getElementsInSelection() {
        if (!this.selectionBox) return [];
        
        const minX = Math.min(this.selectionBox.startX, this.selectionBox.endX);
        const maxX = Math.max(this.selectionBox.startX, this.selectionBox.endX);
        const minY = Math.min(this.selectionBox.startY, this.selectionBox.endY);
        const maxY = Math.max(this.selectionBox.startY, this.selectionBox.endY);
        
        return this.elements.filter(element => {
            const bounds = this.getElementBounds(element);
            return bounds.x >= minX && bounds.x + bounds.width <= maxX &&
                   bounds.y >= minY && bounds.y + bounds.height <= maxY;
        });
    }
    
    getElementBounds(element) {
        switch (element.type) {
            case 'rectangle':
                return {
                    x: Math.min(element.startX, element.endX),
                    y: Math.min(element.startY, element.endY),
                    width: Math.abs(element.endX - element.startX),
                    height: Math.abs(element.endY - element.startY)
                };
            case 'circle':
                return {
                    x: Math.min(element.startX, element.endX),
                    y: Math.min(element.startY, element.endY),
                    width: Math.abs(element.endX - element.startX),
                    height: Math.abs(element.endY - element.startY)
                };
            case 'line':
            case 'dashed-line':
            case 'dotted-line':
            case 'arrow':
                return {
                    x: Math.min(element.startX, element.endX) - 5,
                    y: Math.min(element.startY, element.endY) - 5,
                    width: Math.abs(element.endX - element.startX) + 10,
                    height: Math.abs(element.endY - element.startY) + 10
                };
            case 'freedraw':
                if (element.path && element.path.length > 0) {
                    const xs = element.path.map(p => p.x);
                    const ys = element.path.map(p => p.y);
                    return {
                        x: Math.min(...xs) - 5,
                        y: Math.min(...ys) - 5,
                        width: Math.max(...xs) - Math.min(...xs) + 10,
                        height: Math.max(...ys) - Math.min(...ys) + 10
                    };
                }
                return { x: 0, y: 0, width: 0, height: 0 };
            case 'text':
                this.ctx.font = `${element.fontSize}px Arial`;
                const metrics = this.ctx.measureText(element.text);
                return {
                    x: element.startX,
                    y: element.startY - element.fontSize,
                    width: metrics.width,
                    height: element.fontSize
                };
            default:
                return { x: 0, y: 0, width: 0, height: 0 };
        }
    }
    // Nowe metody inicjalizacji
    gapiLoaded() {
        gapi.load('client', async () => {
            await gapi.client.init({
                apiKey: this.API_KEY,
                discoveryDocs: [this.DISCOVERY_DOC],
            });
            this.gapiInited = true;
            this.checkIfReady();
        });
    }

    gisLoaded() {
        this.gisInited = true;
        this.checkIfReady();
    }

    checkIfReady() {
        if (this.gapiInited && this.gisInited) {
            console.log('Google APIs ready!');
            // Opcjonalnie możesz włączyć przyciski
            this.updateCloudButtons();
        }
    }
    
    isPointInRectangle(x, y, rect) {
        const minX = Math.min(rect.startX, rect.endX);
        const maxX = Math.max(rect.startX, rect.endX);
        const minY = Math.min(rect.startY, rect.endY);
        const maxY = Math.max(rect.startY, rect.endY);
        
        return x >= minX && x <= maxX && y >= minY && y <= maxY;
    }
    
    isPointInCircle(x, y, circle) {
        const centerX = (circle.startX + circle.endX) / 2;
        const centerY = (circle.startY + circle.endY) / 2;
        const radius = Math.max(Math.abs(circle.endX - circle.startX), Math.abs(circle.endY - circle.startY)) / 2;
        
        const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
        return distance <= radius;
    }
    
    isPointNearLine(x, y, line, tolerance = 8) {
        const distance = this.distanceToLine(x, y, line.startX, line.startY, line.endX, line.endY);
        return distance <= tolerance;
    }
    
    isPointInText(x, y, textElement) {
        this.ctx.font = `${textElement.fontSize}px Arial`;
        
        if (textElement.text.includes('\n')) {
            const lines = textElement.text.split('\n');
            const lineHeight = textElement.fontSize * 1.4;
            let maxWidth = 0;
            
            lines.forEach(line => {
                const metrics = this.ctx.measureText(line);
                if (metrics.width > maxWidth) {
                    maxWidth = metrics.width;
                }
            });
            
            const totalHeight = lines.length * lineHeight;
            
            return x >= textElement.startX && 
                x <= textElement.startX + maxWidth &&
                y >= textElement.startY - textElement.fontSize && 
                y <= textElement.startY + totalHeight - textElement.fontSize;
        } else {
            const metrics = this.ctx.measureText(textElement.text);
            const width = metrics.width;
            const height = textElement.fontSize;
            
            return x >= textElement.startX && 
                x <= textElement.startX + width &&
                y >= textElement.startY - height && 
                y <= textElement.startY;
        }
    }

    distanceToLine(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;  
        const D = y2 - y1;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        
        if (lenSq === 0) return Math.sqrt(A * A + B * B);
        
        const param = dot / lenSq;
        
        let xx, yy;
        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }
        
        const dx = px - xx;
        const dy = py - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    moveElement(element, dx, dy) {
        element.startX += dx;
        element.startY += dy;
        element.endX += dx;
        element.endY += dy;
        
        // Move free draw path points
        if (element.type === 'freedraw' && element.path) {
            element.path.forEach(point => {
                point.x += dx;
                point.y += dy;
            });
        }
    }
    
    deleteElement(element) {
        const index = this.elements.indexOf(element);
        if (index > -1) {
            this.elements.splice(index, 1);
        }
    }
    
    drawGrid() {
        const gridSize = 20;
        const dotSize = 1;
        
        const startX = Math.floor(-this.camera.x / this.camera.zoom / gridSize) * gridSize;
        const startY = Math.floor(-this.camera.y / this.camera.zoom / gridSize) * gridSize;
        const endX = startX + (this.canvas.width / this.camera.zoom) + gridSize;
        const endY = startY + (this.canvas.height / this.camera.zoom) + gridSize;
        
        this.ctx.fillStyle = '#D1D5DB';
        
        for (let x = startX; x < endX; x += gridSize) {
            for (let y = startY; y < endY; y += gridSize) {
                this.ctx.beginPath();
                this.ctx.arc(x, y, dotSize / this.camera.zoom, 0, 2 * Math.PI);
                this.ctx.fill();
            }
        }
    }
    
    drawElement(element) {
        // Apply opacity
        const opacity = element.opacity !== undefined ? element.opacity / 100 : 1;
        this.ctx.globalAlpha = opacity;
        
        this.ctx.strokeStyle = element.color;
        this.ctx.fillStyle = element.color;
        this.ctx.lineWidth = element.strokeWidth;
        this.ctx.setLineDash([]);
        
        switch (element.type) {
            case 'rectangle':
                this.drawRectangle(element);
                break;
            case 'circle':
                this.drawCircle(element);
                break;
            case 'line':
                this.drawLine(element);
                break;
            case 'dashed-line':
                this.drawDashedLine(element);
                break;
            case 'dotted-line':
                this.drawDottedLine(element);
                break;
            case 'arrow':
                this.drawArrow(element);
                break;
            case 'freedraw':
                this.drawFreeDrawing(element);
                break;
            case 'text':
                this.drawText(element);
                break;
        }
        
        // Reset opacity
        this.ctx.globalAlpha = 1;
    }
    
    drawFreeDrawing(element) {
        if (!element.path || element.path.length < 2) return;
        
        this.ctx.beginPath();
        this.ctx.moveTo(element.path[0].x, element.path[0].y);
        
        for (let i = 1; i < element.path.length; i++) {
            this.ctx.lineTo(element.path[i].x, element.path[i].y);
        }
        
        this.ctx.stroke();
    }
    
    drawRectangle(rect) {
        const width = rect.endX - rect.startX;
        const height = rect.endY - rect.startY;
        this.ctx.strokeRect(rect.startX, rect.startY, width, height);
    }
    
    drawCircle(circle) {
        const centerX = (circle.startX + circle.endX) / 2;
        const centerY = (circle.startY + circle.endY) / 2;
        const radiusX = Math.abs(circle.endX - circle.startX) / 2;
        const radiusY = Math.abs(circle.endY - circle.startY) / 2;
        
        this.ctx.beginPath();
        this.ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
        this.ctx.stroke();
    }
    
    drawLine(line) {
        this.ctx.beginPath();
        this.ctx.moveTo(line.startX, line.startY);
        this.ctx.lineTo(line.endX, line.endY);
        this.ctx.stroke();
    }
    
    drawDashedLine(line) {
        this.ctx.setLineDash([10, 5]);
        this.ctx.beginPath();
        this.ctx.moveTo(line.startX, line.startY);
        this.ctx.lineTo(line.endX, line.endY);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }
    
    drawDottedLine(line) {
        this.ctx.setLineDash([2, 8]);
        this.ctx.beginPath();
        this.ctx.moveTo(line.startX, line.startY);
        this.ctx.lineTo(line.endX, line.endY);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }
    
    drawArrow(arrow) {
        this.drawLine(arrow);
        
        const angle = Math.atan2(arrow.endY - arrow.startY, arrow.endX - arrow.startX);
        const arrowLength = 15;
        const arrowAngle = Math.PI / 6;
        
        this.ctx.beginPath();
        this.ctx.moveTo(arrow.endX, arrow.endY);
        this.ctx.lineTo(
            arrow.endX - arrowLength * Math.cos(angle - arrowAngle),
            arrow.endY - arrowLength * Math.sin(angle - arrowAngle)
        );
        this.ctx.moveTo(arrow.endX, arrow.endY);
        this.ctx.lineTo(
            arrow.endX - arrowLength * Math.cos(angle + arrowAngle),
            arrow.endY - arrowLength * Math.sin(angle + arrowAngle)
        );
        this.ctx.stroke();
    }
    
    drawText(textElement) {
        this.ctx.font = `${textElement.fontSize}px Arial`;
        this.ctx.fillStyle = textElement.color;
        
        if (textElement.text.includes('\n')) {
            const lines = textElement.text.split('\n');
            const lineHeight = textElement.fontSize * 1.4;
            
            lines.forEach((line, index) => {
                this.ctx.fillText(
                    line, 
                    textElement.startX, 
                    textElement.startY + (index * lineHeight)
                );
            });
        } else {
            this.ctx.fillText(textElement.text, textElement.startX, textElement.startY);
        }
    }

    drawSelection(elements) {
        if (!elements || elements.length === 0) return;
        
        elements.forEach(element => {
            let bounds = this.getElementBounds(element);
            
            this.ctx.strokeStyle = '#3b82f6';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 5]);
            this.ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
            this.ctx.setLineDash([]);
        });
    }
    
    drawSelectionBox() {
        if (!this.selectionBox) return;
        
        this.ctx.strokeStyle = '#3b82f6';
        this.ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([5, 5]);
        
        const width = this.selectionBox.endX - this.selectionBox.startX;
        const height = this.selectionBox.endY - this.selectionBox.startY;
        
        this.ctx.fillRect(this.selectionBox.startX, this.selectionBox.startY, width, height);
        this.ctx.strokeRect(this.selectionBox.startX, this.selectionBox.startY, width, height);
        this.ctx.setLineDash([]);
    }
    
    redraw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.save();
        this.ctx.translate(this.camera.x, this.camera.y);
        this.ctx.scale(this.camera.zoom, this.camera.zoom);
        
        this.drawGrid();
        
        this.elements.forEach(element => this.drawElement(element));
        
        if (this.tempElement) {
            this.drawElement(this.tempElement);
        }
        
        if (this.selectionBox) {
            this.drawSelectionBox();
        }
        
        if (this.selectedElements.length > 0 && this.currentTool === 'select') {
            this.drawSelection(this.selectedElements);
        }
        
        this.ctx.restore();
    }
    
    saveState() {
        this.historyStep++;
        if (this.historyStep < this.history.length) {
            this.history.length = this.historyStep;
        }
        this.history.push(JSON.parse(JSON.stringify(this.elements)));
        this.updateButtons();
    }
    
    undo() {
        if (this.historyStep > 0) {
            this.historyStep--;
            this.elements = JSON.parse(JSON.stringify(this.history[this.historyStep]));
            this.selectedElement = null;
            this.selectedElements = [];
            this.redraw();
            this.updateButtons();
        }
    }
    
    redo() {
        if (this.historyStep < this.history.length - 1) {
            this.historyStep++;
            this.elements = JSON.parse(JSON.stringify(this.history[this.historyStep]));
            this.selectedElement = null;
            this.selectedElements = [];
            this.redraw();
            this.updateButtons();
        }
    }
    
    updateButtons() {
        document.getElementById('undoBtn').disabled = this.historyStep <= 0;
        document.getElementById('redoBtn').disabled = this.historyStep >= this.history.length - 1;
    }
    
    clearCanvas() {
        this.elements = [];
        this.selectedElement = null;
        this.selectedElements = [];
        this.saveState();
        this.redraw();
    }
    
    exportPNG() {
        const link = document.createElement('a');
        link.download = 'rysunek.png';
        link.href = this.canvas.toDataURL();
        link.click();
    }
    
    exportSVG() {
        let svg = `<svg width="${this.canvas.width}" height="${this.canvas.height}" xmlns="http://www.w3.org/2000/svg">`;
        
        this.elements.forEach(element => {
            const opacity = element.opacity !== undefined ? element.opacity / 100 : 1;
            const opacityAttr = opacity < 1 ? ` opacity="${opacity}"` : '';
            
            switch (element.type) {
                case 'rectangle':
                    svg += `<rect x="${Math.min(element.startX, element.endX)}" y="${Math.min(element.startY, element.endY)}" 
                           width="${Math.abs(element.endX - element.startX)}" height="${Math.abs(element.endY - element.startY)}" 
                           fill="none" stroke="${element.color}" stroke-width="${element.strokeWidth}"${opacityAttr}/>`;
                    break;
                case 'circle':
                    const centerX = (element.startX + element.endX) / 2;
                    const centerY = (element.startY + element.endY) / 2;
                    const radiusX = Math.abs(element.endX - element.startX) / 2;
                    const radiusY = Math.abs(element.endY - element.startY) / 2;
                    svg += `<ellipse cx="${centerX}" cy="${centerY}" rx="${radiusX}" ry="${radiusY}" 
                           fill="none" stroke="${element.color}" stroke-width="${element.strokeWidth}"${opacityAttr}/>`;
                    break;
                case 'line':
                    svg += `<line x1="${element.startX}" y1="${element.startY}" x2="${element.endX}" y2="${element.endY}" 
                           stroke="${element.color}" stroke-width="${element.strokeWidth}"${opacityAttr}/>`;
                    break;
                case 'dashed-line':
                    svg += `<line x1="${element.startX}" y1="${element.startY}" x2="${element.endX}" y2="${element.endY}" 
                           stroke="${element.color}" stroke-width="${element.strokeWidth}" stroke-dasharray="10,5"${opacityAttr}/>`;
                    break;
                case 'dotted-line':
                    svg += `<line x1="${element.startX}" y1="${element.startY}" x2="${element.endX}" y2="${element.endY}" 
                           stroke="${element.color}" stroke-width="${element.strokeWidth}" stroke-dasharray="2,8"${opacityAttr}/>`;
                    break;
                case 'freedraw':
                    if (element.path && element.path.length > 1) {
                        let pathData = `M ${element.path[0].x} ${element.path[0].y}`;
                        for (let i = 1; i < element.path.length; i++) {
                            pathData += ` L ${element.path[i].x} ${element.path[i].y}`;
                        }
                        svg += `<path d="${pathData}" fill="none" stroke="${element.color}" stroke-width="${element.strokeWidth}"${opacityAttr}/>`;
                    }
                    break;
                case 'text':
                    svg += `<text x="${element.startX}" y="${element.startY}" font-family="Arial" font-size="${element.fontSize}" 
                           fill="${element.color}"${opacityAttr}>${element.text}</text>`;
                    break;
            }
        });
        
        svg += '</svg>';
        
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const link = document.createElement('a');
        link.download = 'rysunek.svg';
        link.href = URL.createObjectURL(blob);
        link.click();
    }

    importSVG(svgText) {
        // Parsowanie SVG na DOM
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
        const svg = svgDoc.querySelector('svg');
        if (!svg) return;

        const newElements = [];
        // Parsowanie prostokątów
        svg.querySelectorAll('rect').forEach(rect => {
            newElements.push({
                type: 'rectangle',
                startX: parseFloat(rect.getAttribute('x')),
                startY: parseFloat(rect.getAttribute('y')),
                endX: parseFloat(rect.getAttribute('x')) + parseFloat(rect.getAttribute('width')),
                endY: parseFloat(rect.getAttribute('y')) + parseFloat(rect.getAttribute('height')),
                color: rect.getAttribute('stroke'),
                strokeWidth: parseFloat(rect.getAttribute('stroke-width')) || 2,
                id: Date.now() + Math.random()
            });
        });
        // Parsowanie kół, elips
        svg.querySelectorAll('ellipse').forEach(el => {
            newElements.push({
                type: 'circle',
                startX: parseFloat(el.getAttribute('cx')) - parseFloat(el.getAttribute('rx')),
                startY: parseFloat(el.getAttribute('cy')) - parseFloat(el.getAttribute('ry')),
                endX: parseFloat(el.getAttribute('cx')) + parseFloat(el.getAttribute('rx')),
                endY: parseFloat(el.getAttribute('cy')) + parseFloat(el.getAttribute('ry')),
                color: el.getAttribute('stroke'),
                strokeWidth: parseFloat(el.getAttribute('stroke-width')) || 2,
                id: Date.now() + Math.random()
            });
        });
        // Parsowanie linii
        svg.querySelectorAll('line').forEach(line => {
            let type = 'line';
            const dash = line.getAttribute('stroke-dasharray');
            if (dash === '10,5') type = 'dashed-line';
            else if (dash === '2,8') type = 'dotted-line';
            newElements.push({
                type: type,
                startX: parseFloat(line.getAttribute('x1')),
                startY: parseFloat(line.getAttribute('y1')),
                endX: parseFloat(line.getAttribute('x2')),
                endY: parseFloat(line.getAttribute('y2')),
                color: line.getAttribute('stroke'),
                strokeWidth: parseFloat(line.getAttribute('stroke-width')) || 2,
                id: Date.now() + Math.random()
            });
        });
        // Parsowanie tekstu
        svg.querySelectorAll('text').forEach(txt => {
            newElements.push({
                type: 'text',
                startX: parseFloat(txt.getAttribute('x')),
                startY: parseFloat(txt.getAttribute('y')),
                endX: parseFloat(txt.getAttribute('x')),
                endY: parseFloat(txt.getAttribute('y')),
                color: txt.getAttribute('fill') || '#2E3440',
                fontSize: parseFloat(txt.getAttribute('font-size')) || 16,
                text: txt.textContent,
                id: Date.now() + Math.random()
            });
        });
        // Nadpisanie elementów i odświeżenie
        this.elements = newElements;
        this.saveState();
        this.redraw();
    }
    // Inicjalizacja Google Drive API
    async initGoogleDrive() {
        try {
            console.log('Inicjalizacja Google Drive API...');
            console.log('CLIENT_ID:', this.CLIENT_ID);
            console.log('API_KEY:', this.API_KEY);
            
            // Sprawdź czy gapi zostało załadowane
            if (typeof gapi === 'undefined') {
                throw new Error('Google API library nie zostało załadowane');
            }
            
            await new Promise((resolve, reject) => {
                gapi.load('auth2:client', {
                    callback: resolve,
                    onerror: (error) => {
                        console.error('Error loading gapi modules:', error);
                        reject(error);
                    }
                });
            });
            
            console.log('GAPI modules loaded successfully');
            
            await gapi.client.init({
                apiKey: this.API_KEY,
                clientId: this.CLIENT_ID,
                discoveryDocs: [this.DISCOVERY_DOC],
                scope: this.SCOPES
            });
            
            console.log('GAPI client initialized successfully');
            
            // Sprawdź czy auth2 jest dostępne
            const authInstance = gapi.auth2.getAuthInstance();
            if (authInstance) {
                console.log('Auth instance created successfully');
            } else {
                console.error('Failed to create auth instance');
            }
            
        } catch (error) {
            console.error('Szczegółowy błąd inicjalizacji:', error);
            alert('Błąd inicjalizacji Google Drive API: ' + error.message);
        }
    }


    // Uproszczona metoda logowania
    async loginToGoogleDrive() {
        if (!this.gapiInited || !this.gisInited) {
            alert('Google API nie zostało jeszcze załadowane. Spróbuj ponownie za chwilę.');
            return;
        }

        try {
            // Użyj nowego Google Identity Services
            const tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: this.CLIENT_ID,
                scope: this.SCOPES,
                callback: async (response) => {
                    if (response.error) {
                        console.error('Token error:', response.error);
                        alert('Błąd autoryzacji: ' + response.error);
                        return;
                    }
                    
                    this.accessToken = response.access_token;
                    this.isGoogleDriveConnected = true;
                    
                    // Znajdź lub utwórz folder
                    await this.findOrCreateFolder();
                    this.updateCloudButtons();
                    alert('Połączono z Google Drive!');
                },
            });

            tokenClient.requestAccessToken({ prompt: 'consent' });
            
        } catch (error) {
            console.error('Login error:', error);
            alert('Błąd logowania: ' + error.message);
        }
    }


    // Znajdź lub utwórz folder DrawBoard Pro
    async findOrCreateFolder() {
        try {
            // Szukaj istniejącego folderu
            const response = await gapi.client.drive.files.list({
                q: `name='${this.FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                spaces: 'drive'
            });
            
            if (response.result.files.length > 0) {
                this.folderId = response.result.files[0].id;
                console.log('Found existing folder:', this.folderId);
            } else {
                // Utwórz nowy folder
                const folderResponse = await gapi.client.drive.files.create({
                    resource: {
                        name: this.FOLDER_NAME,
                        mimeType: 'application/vnd.google-apps.folder'
                    }
                });
                this.folderId = folderResponse.result.id;
                console.log('Created new folder:', this.folderId);
            }
        } catch (error) {
            console.error('Error managing folder:', error);
        }
    }

    // Zapisz do Google Drive
    async saveToGoogleDrive() {
        if (!this.isGoogleDriveConnected || !this.folderId) {
            alert('Najpierw połącz się z Google Drive');
            return;
        }
        
        const fileName = prompt('Nazwa pliku:', `rysunek-${new Date().toISOString().split('T')[0]}`);
        if (!fileName) return;
        
        try {
            // Generuj SVG
            const svgContent = this.generateSVGContent();
            
            // Utwórz blob
            const blob = new Blob([svgContent], { type: 'image/svg+xml' });
            
            // Upload do Google Drive
            const metadata = {
                name: fileName + '.svg',
                parents: [this.folderId]
            };
            
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], {type: 'application/json'}));
            form.append('file', blob);
            
            const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: new Headers({ 'Authorization': `Bearer ${this.accessToken}` }),
                body: form
            });
            
            if (response.ok) {
                alert('Plik zapisany w Google Drive!');
            } else {
                throw new Error('Upload failed');
            }
        } catch (error) {
            console.error('Error saving to Google Drive:', error);
            alert('Błąd zapisywania w Google Drive');
        }
    }

    // Wczytaj z Google Drive
    async loadFromGoogleDrive() {
        if (!this.isGoogleDriveConnected || !this.folderId) {
            alert('Najpierw połącz się z Google Drive');
            return;
        }
        
        try {
            // Pobierz listę plików SVG z folderu
            const response = await gapi.client.drive.files.list({
                q: `'${this.folderId}' in parents and name contains '.svg' and trashed=false`,
                orderBy: 'modifiedTime desc',
                fields: 'files(id, name, modifiedTime)'
            });
            
            const files = response.result.files;
            if (files.length === 0) {
                alert('Brak plików w folderze DrawBoard Pro');
                return;
            }
            
            // Utwórz listę do wyboru
            const fileOptions = files.map((file, index) => 
                `${index}: ${file.name} (${new Date(file.modifiedTime).toLocaleString()})`
            ).join('\n');
            
            const choice = prompt(`Wybierz plik do wczytania:\n${fileOptions}\n\nWpisz numer:`);
            const fileIndex = parseInt(choice);
            
            if (isNaN(fileIndex) || fileIndex < 0 || fileIndex >= files.length) {
                alert('Nieprawidłowy wybór');
                return;
            }
            
            const selectedFile = files[fileIndex];
            
            // Pobierz zawartość pliku
            const fileResponse = await gapi.client.drive.files.get({
                fileId: selectedFile.id,
                alt: 'media'
            });
            
            // Wczytaj SVG
            this.importSVG(fileResponse.body);
            alert('Plik wczytany!');
            
        } catch (error) {
            console.error('Error loading from Google Drive:', error);
            alert('Błąd wczytywania z Google Drive');
        }
    }

    // Pomocnicza metoda do generowania SVG
    generateSVGContent() {
        let svg = `<svg width="${this.canvas.width}" height="${this.canvas.height}" xmlns="http://www.w3.org/2000/svg">`;
        
        this.elements.forEach(element => {
            switch (element.type) {
                case 'rectangle':
                    svg += `<rect x="${Math.min(element.startX, element.endX)}" y="${Math.min(element.startY, element.endY)}" width="${Math.abs(element.endX - element.startX)}" height="${Math.abs(element.endY - element.startY)}" fill="none" stroke="${element.color}" stroke-width="${element.strokeWidth}"/>`;
                    break;
                case 'circle':
                    const centerX = (element.startX + element.endX) / 2;
                    const centerY = (element.startY + element.endY) / 2;
                    const radiusX = Math.abs(element.endX - element.startX) / 2;
                    const radiusY = Math.abs(element.endY - element.startY) / 2;
                    svg += `<ellipse cx="${centerX}" cy="${centerY}" rx="${radiusX}" ry="${radiusY}" fill="none" stroke="${element.color}" stroke-width="${element.strokeWidth}"/>`;
                    break;
                // ... dodaj pozostałe przypadki jak w oryginalnym exportSVG
            }
        });
        
        svg += '</svg>';
        return svg;
    }

    // Aktualizuj stan przycisków
    updateCloudButtons() {
        const saveBtn = document.getElementById('saveToCloud');
        const loadBtn = document.getElementById('loadFromCloud');
        const loginBtn = document.getElementById('googleDriveLogin');
        
        if (this.isGoogleDriveConnected) {
            saveBtn.disabled = false;
            loadBtn.disabled = false;
            loginBtn.textContent = '✓ Drive';
            loginBtn.style.background = '#10b981';
            loginBtn.style.color = 'white';
        } else {
            saveBtn.disabled = true;
            loadBtn.disabled = true;
            loginBtn.textContent = 'Drive';
            loginBtn.style.background = '';
            loginBtn.style.color = '';
        }
    }


}
// Globalne funkcje callback dla Google API
window.gapiLoaded = function() {
    if (window.drawBoardInstance) {
        window.drawBoardInstance.gapiLoaded();
    }
};

window.gisLoaded = function() {
    if (window.drawBoardInstance) {
        window.drawBoardInstance.gisLoaded();
    }
};

// Zmień inicjalizację na:
document.addEventListener('DOMContentLoaded', () => {
    window.drawBoardInstance = new DrawBoard();
});
document.addEventListener('DOMContentLoaded', () => {
    new DrawBoard();
});
