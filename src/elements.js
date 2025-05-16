/**
 * elements.js
 *
 * Defines the Element and Connection classes, constants for types, colors, sizes.
 */

// Define element types and their properties
export const ELEMENT_TYPES = {
    EVENT: 'event',
    EXTERNAL_EVENT: 'external-event',
    COMMAND: 'command',
    READ_MODEL: 'read-model',
    COMMENT: 'comment',
    PROCESSOR: 'processor',
    GUI: 'gui',
    SLICE: 'slice'
};

// Element colors
const ELEMENT_COLORS = {
    [ELEMENT_TYPES.EVENT]: '#FF9800', // Orange
    [ELEMENT_TYPES.EXTERNAL_EVENT]: '#FFEB3B', // Yellow
    [ELEMENT_TYPES.COMMAND]: '#2196F3', // Blue
    [ELEMENT_TYPES.READ_MODEL]: '#4CAF50', // Green
    [ELEMENT_TYPES.COMMENT]: '#E91E63', // Pink
    [ELEMENT_TYPES.PROCESSOR]: '#f5f5f5', // Light Grey BG for icon elements
    [ELEMENT_TYPES.GUI]: '#f5f5f5', // Light Grey BG for icon elements
    [ELEMENT_TYPES.SLICE]: 'rgba(200, 200, 200, 0.3)' // Transparent grey
};

// Element dimensions
const ELEMENT_SIZES = {
    WIDTH: 120,
    HEIGHT: 80,
    SLICE_WIDTH: 200,
    SLICE_HEIGHT: 400
};

// Counter for generating unique IDs
let idCounter = 1;

/**
 * Element class - Base class for all visual elements on the canvas.
 */
export class Element {
    constructor(type, x, y, name = '') {
        this.id = `element-${idCounter++}`;
        this.type = type;
        this.x = x;
        this.y = y;
        this.name = name;
        this.connections = []; // Stores references to connected Connection objects
        this.width = (type === ELEMENT_TYPES.SLICE) ? ELEMENT_SIZES.SLICE_WIDTH : ELEMENT_SIZES.WIDTH;
        this.height = (type === ELEMENT_TYPES.SLICE) ? ELEMENT_SIZES.SLICE_HEIGHT : ELEMENT_SIZES.HEIGHT;

        // Special case for slices
        if (type === ELEMENT_TYPES.SLICE) {
            this.width = ELEMENT_SIZES.SLICE_WIDTH;
            this.height = ELEMENT_SIZES.SLICE_HEIGHT;
        }
    }

    /**
     * Check if this element overlaps with another element (simple AABB check).
     * @param {Element} otherElement - The element to check against.
     * @returns {boolean} - True if elements overlap.
     */
    overlaps(otherElement) {
        // Slices can overlap with other elements
        if (this.type === ELEMENT_TYPES.SLICE || otherElement.type === ELEMENT_TYPES.SLICE) {
            return false;
        }

        // Standard Axis-Aligned Bounding Box overlap check
        return !(
            this.x + this.width < otherElement.x ||
            this.x > otherElement.x + otherElement.width ||
            this.y + this.height < otherElement.y ||
            this.y > otherElement.y + otherElement.height
        );
    }

    /**
     * Get the center connection points for this element.
     * @returns {Object} - Object with keys 'top', 'right', 'bottom', 'left' and {x, y} values.
     */
    getConnectionPoints() {
        return {
            top: { x: this.x + this.width / 2, y: this.y },
            right: { x: this.x + this.width, y: this.y + this.height / 2 },
            bottom: { x: this.x + this.width / 2, y: this.y + this.height },
            left: { x: this.x, y: this.y + this.height / 2 }
        };
    }

    /**
     * Find the pair of connection points (one on this element, one on the target)
     * that have the minimum distance between them.
     * @param {Element} targetElement - The element to connect to.
     * @returns {Object} - { source: {x, y, side}, target: {x, y, side} }
     */
    findBestConnectionPoint(targetElement) {
        const sourcePoints = this.getConnectionPoints();
        const targetPoints = targetElement.getConnectionPoints();
        let minDistance = Infinity;
        let bestSourcePoint = null;
        let bestTargetPoint = null;

        for (const [sourceSide, sourcePoint] of Object.entries(sourcePoints)) {
            for (const [targetSide, targetPoint] of Object.entries(targetPoints)) {
                // Simple Euclidean distance
                const dx = sourcePoint.x - targetPoint.x;
                const dy = sourcePoint.y - targetPoint.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < minDistance) {
                    minDistance = distance;
                    bestSourcePoint = { ...sourcePoint, side: sourceSide };
                    bestTargetPoint = { ...targetPoint, side: targetSide };
                }
            }
        }
        return { source: bestSourcePoint, target: bestTargetPoint };
    }

    // elements.js
    // class Element

    /**
     * Create an SVG representation of this element.
     * @param {SVG.Container} canvas - The SVG canvas to draw on.
     * @param {InteractionManager} interactionManager - Reference to handle interactions.
     * @returns {SVG.Group} - The SVG group containing the element.
     */
    createSVG(canvas, interactionManager) {
        const group = canvas.group().attr('id', this.id).addClass('element');
        const rect = group.rect(this.width, this.height)
            .attr({
                fill: ELEMENT_COLORS[this.type],
                rx: 5,
                ry: 5
            })
            .addClass('element-rect');
        // has the element an icon 



        // Add icons if applicable
        if (this.type === ELEMENT_TYPES.PROCESSOR) {
            group.text('⚙️').font({
                size: 20,
                anchor: 'middle',
                'dominant-baseline': 'middle'
            }).center(this.width / 2, this.height * 0.20);
        } else if (this.type === ELEMENT_TYPES.GUI) {
            group.text('🖥️').font({
                size: 20,
                anchor: 'middle',
                'dominant-baseline': 'middle'
            }).center(this.width / 2, this.height * 0.20);
        }

        // Create ForeignObject
        const foreignObject = group.foreignObject(this.width, this.height)
            .attr({ x: 0, y: 0 })
            .addClass('element-editor-fobj')
            .attr('visibility', 'visible')
            .attr('pointer-events', 'none');

        // Create HTML contenteditable div inside ForeignObject
        const contentDiv = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
        contentDiv.setAttribute('class', 'element-content-div');
        contentDiv.setAttribute('contenteditable', 'false');    // Not editable by default
        contentDiv.textContent = this.name || this.type;        // Set initial text

        foreignObject.node.appendChild(contentDiv);

        // Position the group
        group.move(this.x, this.y);

        // Slice styling
        if (this.type === ELEMENT_TYPES.SLICE) {
            rect.attr({
                fill: ELEMENT_COLORS[this.type],
                'stroke-dasharray': '5,5',
                stroke: '#888'
            });
        }

        // Add Draggable behavior
        group.draggable().on('dragstart.namespace', (e) => {
            console.log("Element dragstart");
            e.preventDefault();
            if (interactionManager) {
                interactionManager.currentDraggingElement = this; // 'this' is the element being dragged (e.g., E1)

                // ** Start Change: Handle existing edit on a DIFFERENT element **
                if (interactionManager.currentEditingDiv &&
                    interactionManager.selectedElement && // selectedElement should be the one being edited
                    interactionManager.selectedElement.id !== this.id) { // If editing a DIFFERENT element

                    console.log(`Element.dragstart on ${this.id}: Detected active edit on different element ${interactionManager.selectedElement.id}. Saving it (no menu).`);
                    interactionManager.handleSaveName(false); // Save the other element's edit, no menu for it
                } else if (interactionManager.currentEditingDiv &&
                    interactionManager.selectedElement &&
                    interactionManager.selectedElement.id === this.id) {
                    // Trying to drag the element that is currently being edited
                    console.log(`Element.dragstart on ${this.id}: This element is currently being edited. Saving it (no menu) before drag.`);
                    interactionManager.handleSaveName(false); // Save this element's edit, no menu
                }
                // ** End Change **

                // Always hide context menus when a drag starts regardless of previous edit state
                interactionManager.hideAllContextMenus();
            }
            group.addClass('dragging');
        }).on('dragmove.namespace', (e) => {
            e.preventDefault();
            const { handler, box } = e.detail;
            this.x = box.x;
            this.y = box.y;
            handler.move(box.x, box.y);
            if (interactionManager?.connectionManager) {
                interactionManager.connectionManager.updateConnectionsForElement(this);
            }
        }).on('dragend.namespace', (e) => {
            e.preventDefault();
            const { handler, box } = e.detail; // box is fine here
            group.removeClass('dragging');
            this.x = box.x;
            this.y = box.y;
            if (interactionManager) {
                interactionManager.currentDraggingElement = null;
            }
        });

        return group;
    }
    // End class Element
}

/**
 * Connection class - Represents a directed connection between two elements.
 */
export class Connection {
    constructor(sourceElement, targetElement) {
        this.id = `connection-${idCounter++}`;
        this.sourceElement = sourceElement;
        this.targetElement = targetElement;

        // Calculate initial best connection points (updated when drawn/moved)
        const { source, target } = sourceElement.findBestConnectionPoint(targetElement);
        this.sourcePoint = source;
        this.targetPoint = target;
    }

    /**
     * Check if adding this connection would create a loop in the graph (DFS).
     * @returns {boolean} - True if connection creates a loop.
     */
    createsLoop() {
        // Check direct self-loop (should be prevented earlier)
        if (this.sourceElement.id === this.targetElement.id) { return true; }
        // Check if a path already exists from target back to source
        return this.pathExists(this.targetElement, this.sourceElement, new Set());
    }

    /**
     * Helper for createsLoop: Performs Depth First Search to find path.
     * @param {Element} current - The current element in the search path.
     * @param {Element} target - The target element we are trying to reach.
     * @param {Set<string>} visited - Set of visited element IDs in the current path.
     * @returns {boolean} - True if path exists from current to target.
     */
    pathExists(current, target, visited) {
        if (current.id === target.id) { return true; }
        visited.add(current.id);

        // Look at outgoing connections from the 'current' element
        for (const conn of current.connections) {
            // Only follow connections originating from 'current'
            if (conn.sourceElement.id === current.id) {
                const nextElement = conn.targetElement;
                if (!visited.has(nextElement.id)) {
                    if (this.pathExists(nextElement, target, visited)) {
                        return true;
                    }
                }
            }
        }
        // Backtrack (implicitly handled by returning false if no path found)
        // visited.delete(current.id); // Not strictly needed for basic check
        return false;
    }


    /**
     * Create an SVG representation of this connection (a curved path with marker).
     * @param {SVG.Container} canvas - The SVG canvas to draw on.
     * @returns {SVG.Path} - The SVG path representing the connection.
     */
    createSVG(canvas) {
        // Update connection points based on current element positions
        const { source, target } = this.sourceElement.findBestConnectionPoint(this.targetElement);
        this.sourcePoint = source;
        this.targetPoint = target;

        // Create the SVG path data string
        const pathData = this.createCurvedPath(this.sourcePoint, this.targetPoint);

        // Create the SVG path element
        const connectionPath = canvas.path(pathData)
            .attr({
                id: this.id,
                fill: 'none',
                stroke: '#333',
                'stroke-width': 2
            })
            .addClass('connection-path');

        // Apply the globally defined marker using its ID via .attr()
        connectionPath.attr('marker-end', 'url(#arrowhead-marker)');

        return connectionPath;
    }

    /**
     * Calculate the SVG path data string for a cubic Bezier curve between two points.
     * Control points are offset based on the connection side for better routing.
     * @param {Object} source - Source point {x, y, side}.
     * @param {Object} target - Target point {x, y, side}.
     * @returns {string} - SVG path data string (e.g., "M x y C cx1 cy1, cx2 cy2, x2 y2").
     */
    createCurvedPath(source, target) {
        let sourceControlX = source.x;
        let sourceControlY = source.y;
        let targetControlX = target.x;
        let targetControlY = target.y;
        const controlDistance = 50; // How far control points extend

        // Offset control points based on connection side
        switch (source.side) {
            case 'top': sourceControlY -= controlDistance; break;
            case 'right': sourceControlX += controlDistance; break;
            case 'bottom': sourceControlY += controlDistance; break;
            case 'left': sourceControlX -= controlDistance; break;
        }
        switch (target.side) {
            case 'top': targetControlY -= controlDistance; break;
            case 'right': targetControlX += controlDistance; break;
            case 'bottom': targetControlY += controlDistance; break;
            case 'left': targetControlX -= controlDistance; break;
        }

        // Format: M = moveto, C = curveto (cubic bezier)
        return `M ${source.x} ${source.y} C ${sourceControlX} ${sourceControlY}, ${targetControlX} ${targetControlY}, ${target.x} ${target.y}`;
    }
}