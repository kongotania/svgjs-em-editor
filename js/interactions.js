/**
 * interactions.js
 * 
 * This file contains functions for handling user interactions
 * like dragging, selecting, and connecting elements.
 */

/**
 * InteractionManager - Handles user interactions with the canvas and elements
 */
class InteractionManager {
    constructor(canvas, elementManager, connectionManager) {
        this.canvas = canvas;
        this.elementManager = elementManager;
        this.connectionManager = connectionManager;
        
        // State tracking
        this.selectedElement = null;
        this.draggedElement = null;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
        this.longPressTimer = null;
        this.longPressDelay = 500; // ms
        this.isDragging = false;
        this.isPanning = false;
        this.panStartX = 0;
        this.panStartY = 0;
        this.zoom = 1;
        
        // DOM Elements
        this.contextMenu = document.getElementById('context-menu');
        this.nameEditor = document.getElementById('name-editor');
        this.nameInput = document.getElementById('element-name-input');
        
        // Initialize interaction events
        this.initEvents();
    }

    /**
     * Initialize all event listeners
     */
    initEvents() {
        console.log("Initializing Events");
        // Canvas events
        this.canvas.node.addEventListener('mousedown', this.handleCanvasMouseDown.bind(this));
        this.canvas.node.addEventListener('mousemove', this.handleCanvasMouseMove.bind(this));
        this.canvas.node.addEventListener('mouseup', this.handleCanvasMouseUp.bind(this));
        this.canvas.node.addEventListener('click', this.handleCanvasClick.bind(this));
        
        // Prevent context menu on right-click
        this.canvas.node.addEventListener('contextmenu', e => e.preventDefault());
        
        // Double click to edit name
        this.canvas.node.addEventListener('dblclick', this.handleDoubleClick.bind(this));
        
        // Keyboard events
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        document.addEventListener('keyup', this.handleKeyUp.bind(this)); // <-- ADD THIS LINE
        
        // Context menu buttons
        document.getElementById('delete-element').addEventListener('click', this.handleDeleteElement.bind(this));
        document.getElementById('connect-element').addEventListener('click', this.handleConnectElement.bind(this));
        document.getElementById('edit-properties').addEventListener('click', this.handleEditProperties.bind(this));
        
        // Name editor
        document.getElementById('save-name').addEventListener('click', this.handleSaveName.bind(this));
        this.nameInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') this.handleSaveName();
        });
        
        // Zoom controls
        document.getElementById('zoom-in').addEventListener('click', () => this.setZoom(this.zoom * 1.2));
        document.getElementById('zoom-out').addEventListener('click', () => this.setZoom(this.zoom * 0.8));
        document.getElementById('reset-view').addEventListener('click', () => {
            this.setZoom(1);
            this.canvas.viewbox().animate().transform({ translateX: 0, translateY: 0 });
        });
        
        // Palette items drag
        const paletteItems = document.querySelectorAll('.palette-item');
        paletteItems.forEach(item => {
            item.addEventListener('dragstart', e => {
                e.dataTransfer.setData('type', item.dataset.type);
                e.dataTransfer.effectAllowed = 'copy';
            });
        });
        
        // Canvas drop
        this.canvas.node.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });
        
        this.canvas.node.addEventListener('drop', this.handleDrop.bind(this));
    }

    /**
     * Handle mouse down on canvas
     * @param {MouseEvent} e - Mouse event
     */
    handleCanvasMouseDown(e) {
        // Get mouse position relative to SVG canvas
        const point = this.getCanvasPoint(e.clientX, e.clientY);
        
        // Check if we're clicking on an element
        const target = e.target;
        const elementId = this.findElementId(target);
        
        if (elementId) {
            // We clicked on an element
            const element = this.elementManager.getElementById(elementId);
            
            // If in connection mode, try to complete the connection
            if (this.connectionManager.connectionMode) {
                this.connectionManager.completeConnection(element);
                return;
            }
            
            // Start long press timer for drag
            this.longPressTimer = setTimeout(() => {
                this.isDragging = true;
                this.draggedElement = element;
                
                // Calculate offset from mouse to element top-left corner
                this.dragOffsetX = point.x - element.x;
                this.dragOffsetY = point.y - element.y;
                
                // Add dragging class to element
                const svgElement = this.canvas.findOne(`#${elementId}`);
                if (svgElement) svgElement.addClass('dragging');
                
                // Clear context menu
                this.hideContextMenu();
            }, this.longPressDelay);
            
            // Track drag start position
            this.dragStartX = point.x;
            this.dragStartY = point.y;
            
        } else {
            // We clicked on empty canvas - start panning if middle button or space is pressed
            if (e.button === 1 || e.buttons === 4 || this.isPanningKeyPressed) {
                this.isPanning = true;
                this.panStartX = e.clientX;
                this.panStartY = e.clientY;
                this.canvas.node.style.cursor = 'grabbing';
            }
            
            // Deselect any selected element
            this.selectElement(null);
            this.hideContextMenu();
        }
    }

    /**
     * Handle mouse move on canvas
     * @param {MouseEvent} e - Mouse event
     */
    handleCanvasMouseMove(e) {
        // Get mouse position relative to SVG canvas
        const point = this.getCanvasPoint(e.clientX, e.clientY);
        
        // Handle element dragging
        if (this.isDragging && this.draggedElement) {
            // Clear long press timer
            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
            
            // Calculate new position using offset
            const newX = point.x - this.dragOffsetX;
            const newY = point.y - this.dragOffsetY;
            
            // Move the element (checking for collisions)
            this.elementManager.moveElement(this.draggedElement, newX, newY);
            
            // Update connections
            this.connectionManager.updateConnections();
            
        } 
        // Handle canvas panning
        else if (this.isPanning) {
            const dx = e.clientX - this.panStartX;
            const dy = e.clientY - this.panStartY;
            
            // Get current viewbox
            const viewbox = this.canvas.viewbox();
            
            // Calculate new viewbox position
            const newX = viewbox.x - dx / this.zoom;
            const newY = viewbox.y - dy / this.zoom;
            
            // Update viewbox
            this.canvas.viewbox(newX, newY, viewbox.width, viewbox.height);
            
            // Update pan start position
            this.panStartX = e.clientX;
            this.panStartY = e.clientY;
        }
        // Handle temp connection line
        else if (this.connectionManager.connectionMode) {
            this.connectionManager.updateTempConnection(point.x, point.y);
        }
        // If mouse moved a lot, cancel long press
        else if (this.longPressTimer) {
            const dx = point.x - this.dragStartX;
            const dy = point.y - this.dragStartY;
            const distance = Math.sqrt(dx*dx + dy*dy);
            
            if (distance > 5) {  // 5px threshold
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
        }
    }

    /**
     * Handle mouse up on canvas
     * @param {MouseEvent} e - Mouse event
     */
    handleCanvasMouseUp(e) {
        // Clear long press timer
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
        
        // End element dragging
        if (this.isDragging) {
            this.isDragging = false;
            
            if (this.draggedElement) {
                // Remove dragging class
                const svgElement = this.canvas.findOne(`#${this.draggedElement.id}`);
                if (svgElement) svgElement.removeClass('dragging');
                
                this.draggedElement = null;
            }
        }
        
        // End canvas panning
        if (this.isPanning) {
            this.isPanning = false;
            this.canvas.node.style.cursor = '';
        }
    }

    /**
     * Handle click on canvas
     * @param {MouseEvent} e - Mouse event
     */
    handleCanvasClick(e) {
        // Get mouse position relative to SVG canvas
        const point = this.getCanvasPoint(e.clientX, e.clientY);
        
        // Check if we're clicking on an element
        const target = e.target;
        const elementId = this.findElementId(target);
        
        if (elementId) {
            // We clicked on an element
            const element = this.elementManager.getElementById(elementId);
            
            // If in connection mode, try to complete the connection
            if (this.connectionManager.connectionMode) {
                this.connectionManager.completeConnection(element);
                return;
            }
            
            // Select the element
            this.selectElement(element);
            
            // Show context menu
            this.showContextMenu(e.clientX, e.clientY);
        } else {
            // Check if we clicked on a connection
            const connectionId = this.findConnectionId(target);
            
            if (connectionId) {
                // We clicked on a connection
                const connection = this.connectionManager.connections.find(c => c.id === connectionId);
                
                if (connection) {
                    // Select the connection (not implemented yet - would be similar to selectElement)
                    // For now, just show a context menu with delete option
                    this.selectElement(null); // Deselect any element
                    this.showContextMenu(e.clientX, e.clientY, connection);
                }
            } else {
                // Clicked on empty canvas - hide context menu
                this.hideContextMenu();
            }
        }
    }

    /**
     * Handle double click for name editing
     * @param {MouseEvent} e - Mouse event
     */
    handleDoubleClick(e) {
        const target = e.target;
        const elementId = this.findElementId(target);
        
        if (elementId) {
            const element = this.elementManager.getElementById(elementId);
            this.showNameEditor(element, e.clientX, e.clientY);
        }
    }

    /**
     * Handle keyboard events
     * @param {KeyboardEvent} e - Keyboard event
     */
    handleKeyDown(e) {
        // Delete selected element with Delete key
        if (e.key === 'Delete' && this.selectedElement) {
            this.elementManager.removeElement(this.selectedElement);
            this.selectedElement = null;
            this.hideContextMenu();
        }
        
        // Escape key to cancel operations
        if (e.key === 'Escape') {
            // Cancel connection mode
            if (this.connectionManager.connectionMode) {
                this.connectionManager.cancelConnection();
            }
            
            // Hide context menu
            this.hideContextMenu();
            
            // Hide name editor
            this.hideNameEditor();
            
            // Deselect element
            this.selectElement(null);
        }
        
        // Space for panning
        if (e.key === ' ' && !e.repeat) {
            this.isPanningKeyPressed = true;
            this.canvas.node.style.cursor = 'grab';
        }
    }

    /**
     * Handle key up events
     * @param {KeyboardEvent} e - Keyboard event
     */
    handleKeyUp(e) {
        // Space for panning
        if (e.key === ' ') {
            this.isPanningKeyPressed = false;
            this.canvas.node.style.cursor = '';
        }
    }

    /**
     * Handle drop from palette
     * @param {DragEvent} e - Drag event
     */
    handleDrop(e) {
        e.preventDefault();
        
        // Get the element type from dragged item
        const type = e.dataTransfer.getData('type');
        
        if (!type) return;
        
        // Get drop position
        const point = this.getCanvasPoint(e.clientX, e.clientY);
        
        // Create new element
        const element = this.elementManager.createElement(type, point.x, point.y);
        
        // Select the element and show name editor
        this.selectElement(element);
        this.showNameEditor(element, e.clientX, e.clientY);
    }

    /**
     * Handle delete element button click
     */
    handleDeleteElement() {
        if (this.selectedElement) {
            this.elementManager.removeElement(this.selectedElement);
            this.selectedElement = null;
            this.hideContextMenu();
        }
    }

    /**
     * Handle connect element button click
     */
    handleConnectElement() {
        if (this.selectedElement) {
            this.connectionManager.startConnection(this.selectedElement);
            this.hideContextMenu();
        }
    }

    /**
     * Handle edit properties button click
     */
    handleEditProperties() {
        if (this.selectedElement) {
            // Show name editor for now
            // Could be expanded to a more complete properties panel
            const rect = this.contextMenu.getBoundingClientRect();
            this.showNameEditor(this.selectedElement, rect.right, rect.top);
            this.hideContextMenu();
        }
    }

    /**
     * Handle save name button click
     */
    handleSaveName() {
        if (this.selectedElement) {
            // Update element name
            this.selectedElement.name = this.nameInput.value;
            
            // Update SVG
            this.elementManager.updateElement(this.selectedElement);
            
            // Hide editor
            this.hideNameEditor();
        }
    }

    /**
     * Show context menu at position
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {Connection} connection - Optional connection for connection context menu
     */
    showContextMenu(x, y, connection) {
        // Position menu
        this.contextMenu.style.left = `${x}px`;
        this.contextMenu.style.top = `${y}px`;
        
        // Show/hide appropriate options
        if (connection) {
            // Show only delete for connections
            document.getElementById('delete-element').style.display = 'block';
            document.getElementById('connect-element').style.display = 'none';
            document.getElementById('edit-properties').style.display = 'none';
            
            // Set click handler for delete
            document.getElementById('delete-element').onclick = () => {
                this.connectionManager.removeConnection(connection);
                this.hideContextMenu();
            };
        } else {
            // Show all options for elements
            document.getElementById('delete-element').style.display = 'block';
            document.getElementById('connect-element').style.display = 'block';
            document.getElementById('edit-properties').style.display = 'block';
            
            // Reset default click handlers
            document.getElementById('delete-element').onclick = this.handleDeleteElement.bind(this);
        }
        
        // Show menu
        this.contextMenu.style.display = 'block';
    }

    /**
     * Hide context menu
     */
    hideContextMenu() {
        this.contextMenu.style.display = 'none';
    }

    /**
     * Show name editor for element
     * @param {Element} element - Element to edit name
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    showNameEditor(element, x, y) {
        // Position editor
        this.nameEditor.style.left = `${x}px`;
        this.nameEditor.style.top = `${y}px`;
        
        // Set current value
        this.nameInput.value = element.name || '';
        
        // Show editor
        this.nameEditor.style.display = 'block';
        
        // Focus input
        this.nameInput.focus();
        this.nameInput.select();
    }

    /**
     * Hide name editor
     */
    hideNameEditor() {
        this.nameEditor.style.display = 'none';
    }

    /**
     * Select an element
     * @param {Element} element - Element to select (null to deselect)
     */
    selectElement(element) {
        // Deselect previous element
        if (this.selectedElement) {
            const svgElement = this.canvas.findOne(`#${this.selectedElement.id}`);
            if (svgElement) {
                svgElement.removeClass('element-selected');
            }
        }
        
        // Set new selected element
        this.selectedElement = element;
        
        // Add selected class to new element
        if (element) {
            const svgElement = this.canvas.findOne(`#${element.id}`);
            if (svgElement) {
                svgElement.addClass('element-selected');
            }
        }
    }

    /**
     * Set zoom level
     * @param {number} zoom - Zoom level (1 = 100%)
     */
    setZoom(zoom) {
        // Clamp zoom between 0.2 and 3
        zoom = Math.max(0.2, Math.min(3, zoom));
        
        // Save current zoom
        this.zoom = zoom;
        
        // Get current viewbox
        const viewbox = this.canvas.viewbox();
        
        // Calculate new viewbox dimensions
        const newWidth = this.canvas.node.clientWidth / zoom;
        const newHeight = this.canvas.node.clientHeight / zoom;
        
        // Keep center of viewbox fixed
        const centerX = viewbox.x + viewbox.width / 2;
        const centerY = viewbox.y + viewbox.height / 2;
        
        // Calculate new top-left corner
        const newX = centerX - newWidth / 2;
        const newY = centerY - newHeight / 2;
        
        // Update viewbox
        this.canvas.viewbox(newX, newY, newWidth, newHeight);
    }

    /**
     * Convert screen coordinates to SVG canvas coordinates
     * @param {number} clientX - Screen X coordinate
     * @param {number} clientY - Screen Y coordinate
     * @returns {Object} - {x, y} coordinates in SVG space
     */
    getCanvasPoint(clientX, clientY) {
        // Get point in screen space
        const screenPoint = this.canvas.node.createSVGPoint();
        screenPoint.x = clientX;
        screenPoint.y = clientY;
        
        // Convert to SVG space
        const svgPoint = screenPoint.matrixTransform(
            this.canvas.node.getScreenCTM().inverse()
        );
        
        return { x: svgPoint.x, y: svgPoint.y };
    }

    /**
     * Find element ID from clicked target
     * @param {Element} target - DOM element that was clicked
     * @returns {string|null} - Element ID or null
     */
    findElementId(target) {
        // Check if target is an SVG element
        if (!target || !target.closest) return null;
        
        // Find closest SVG element with class 'element'
        const elementNode = target.closest('.element');
        return elementNode ? elementNode.id : null;
    }

    /**
     * Find connection ID from clicked target
     * @param {Element} target - DOM element that was clicked
     * @returns {string|null} - Connection ID or null
     */
    findConnectionId(target) {
        // Check if target is a connection path
        if (!target || !target.classList) return null;
        
        if (target.classList.contains('connection-path')) {
            return target.id;
        }
        
        return null;
    }
}

// // Export InteractionManager
// if (typeof module !== 'undefined') {
//     module.exports = {
//         InteractionManager
//     };
// }
