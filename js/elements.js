/**
 * elements.js
 * 
 * This file contains the element definitions and creation functions
 * for the event modeling application.
 */

// Define element types and their properties
const ELEMENT_TYPES = {
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
    [ELEMENT_TYPES.PROCESSOR]: '#607D8B', // Grey
    [ELEMENT_TYPES.GUI]: '#9E9E9E', // Light Grey
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
 * Element class - Base class for all elements in the application
 */
class Element {
    constructor(type, x, y, name = '') {
        this.id = `element-${idCounter++}`;
        this.type = type;
        this.x = x;
        this.y = y;
        this.name = name;
        this.connections = [];
        this.width = ELEMENT_SIZES.WIDTH;
        this.height = ELEMENT_SIZES.HEIGHT;
        
        // Special case for slices
        if (type === ELEMENT_TYPES.SLICE) {
            this.width = ELEMENT_SIZES.SLICE_WIDTH;
            this.height = ELEMENT_SIZES.SLICE_HEIGHT;
        }
    }

    /**
     * Check if this element overlaps with another element
     * @param {Element} otherElement - The element to check against
     * @returns {boolean} - True if elements overlap
     */
    overlaps(otherElement) {
        // Slices can overlap with other elements
        if (this.type === ELEMENT_TYPES.SLICE || otherElement.type === ELEMENT_TYPES.SLICE) {
            return false;
        }
        
        // Check for overlap
        return !(
            this.x + this.width < otherElement.x || 
            this.x > otherElement.x + otherElement.width || 
            this.y + this.height < otherElement.y || 
            this.y > otherElement.y + otherElement.height
        );
    }

    /**
     * Get the connection points for this element (for arrows)
     * @returns {Object} - Object with top, right, bottom, left points
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
     * Find the best connection point for connecting to another element
     * @param {Element} targetElement - The element to connect to
     * @returns {Object} - The best connection point and target point
     */
    findBestConnectionPoint(targetElement) {
        const sourcePoints = this.getConnectionPoints();
        const targetPoints = targetElement.getConnectionPoints();
        
        // Calculate distances between all possible connection points
        let minDistance = Infinity;
        let bestSourcePoint = null;
        let bestTargetPoint = null;
        
        for (const [sourceSide, sourcePoint] of Object.entries(sourcePoints)) {
            for (const [targetSide, targetPoint] of Object.entries(targetPoints)) {
                const distance = Math.sqrt(
                    Math.pow(sourcePoint.x - targetPoint.x, 2) + 
                    Math.pow(sourcePoint.y - targetPoint.y, 2)
                );
                
                if (distance < minDistance) {
                    minDistance = distance;
                    bestSourcePoint = { ...sourcePoint, side: sourceSide };
                    bestTargetPoint = { ...targetPoint, side: targetSide };
                }
            }
        }
        
        return { source: bestSourcePoint, target: bestTargetPoint };
    }

    /**
     * Create an SVG representation of this element
     * @param {SVG.Container} canvas - The SVG canvas to draw on
     * @returns {SVG.Group} - The SVG group containing the element
     */
    createSVG(canvas) {
        const group = canvas.group().attr('id', this.id).addClass('element');
        
        // Create the element rectangle
        const rect = group.rect(this.width, this.height)
            .attr({
                fill: ELEMENT_COLORS[this.type],
                rx: 5,
                ry: 5
            })
            .addClass('element-rect');
        
        // For Processor and GUI, add an icon
        if (this.type === ELEMENT_TYPES.PROCESSOR) {
            group.text('⚙️')
                .font({ size: 20 })
                .center(this.width / 2, this.height / 2);
        } else if (this.type === ELEMENT_TYPES.GUI) {
            group.text('🖥️')
                .font({ size: 20 })
                .center(this.width / 2, this.height / 2);
        }
        
        // Add text for the name
        const text = group.text(this.name || this.type)
            .font({ size: 12, family: 'Arial', anchor: 'middle' })
            .center(this.width / 2, this.height / 2)
            .addClass('element-text');
        
        // Position the group at the element's coordinates
        group.move(this.x, this.y);
        
        // For slices, make the rect transparent with a dashed border
        if (this.type === ELEMENT_TYPES.SLICE) {
            rect.attr({
                fill: ELEMENT_COLORS[this.type],
                'stroke-dasharray': '5,5',
                stroke: '#888'
            });
        }
        
        return group;
    }
}

/**
 * Connection class - Represents a connection between two elements
 */
class Connection {
    constructor(sourceElement, targetElement) {
        this.id = `connection-${idCounter++}`;
        this.sourceElement = sourceElement;
        this.targetElement = targetElement;
        
        // Find the best connection points
        const { source, target } = sourceElement.findBestConnectionPoint(targetElement);
        this.sourcePoint = source;
        this.targetPoint = target;
    }

    /**
     * Check if this connection creates a loop in the graph
     * @param {Array} elements - All elements in the graph
     * @returns {boolean} - True if connection creates a loop
     */
    createsLoop() {
        // Simple loop check: does this connection connect back to the source?
        if (this.sourceElement.id === this.targetElement.id) {
            return true;
        }
        
        // Check if there's already a path from target to source
        return this.pathExists(this.targetElement, this.sourceElement, new Set());
    }

    /**
     * Check if there's a path from source to target
     * @param {Element} source - The source element
     * @param {Element} target - The target element
     * @param {Set} visited - Set of visited element IDs
     * @returns {boolean} - True if path exists
     */
    pathExists(source, target, visited) {
        if (source.id === target.id) {
            return true;
        }
        
        visited.add(source.id);
        
        for (const conn of source.connections) {
            const nextElement = conn.targetElement.id === source.id 
                ? conn.sourceElement 
                : conn.targetElement;
            
            if (!visited.has(nextElement.id) && this.pathExists(nextElement, target, visited)) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Create an SVG representation of this connection
     * @param {SVG.Container} canvas - The SVG canvas to draw on
     * @returns {SVG.Path} - The SVG path representing the connection
     */
    createSVG(canvas) {
        // Update connection points based on current element positions
        const { source, target } = this.sourceElement.findBestConnectionPoint(this.targetElement);
        this.sourcePoint = source;
        this.targetPoint = target;
        
        // Create a curved path for the connection
        const path = this.createCurvedPath(this.sourcePoint, this.targetPoint);
        
        // Create the SVG path
        const connection = canvas.path(path)
            .attr({
                id: this.id,
                fill: 'none',
                stroke: '#333',
                'stroke-width': 2
            })
            .addClass('connection-path');
        
        // Add arrow marker
        canvas.defs().marker(10, 10, function(add) {
            add.polygon('0,0 10,5 0,10').fill('#333');
        }).attr({
            id: `${this.id}-marker`,
            orient: 'auto',
            markerWidth: 10,
            markerHeight: 10,
            refX: 9,
            refY: 5
        });
        
        connection.marker('end', `#${this.id}-marker`);
        
        return connection;
    }

    /**
     * Create a curved path between two points
     * @param {Object} source - Source point {x, y, side}
     * @param {Object} target - Target point {x, y, side}
     * @returns {string} - SVG path data
     */
    createCurvedPath(source, target) {
        // Determine control points based on sides
        let sourceControlX = source.x;
        let sourceControlY = source.y;
        let targetControlX = target.x;
        let targetControlY = target.y;
        
        // Adjust control points based on which sides are connected
        const controlDistance = 50; // Distance of control point from the connection point
        
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
        
        // Create a cubic bezier curve
        return `M ${source.x} ${source.y} C ${sourceControlX} ${sourceControlY}, ${targetControlX} ${targetControlY}, ${target.x} ${target.y}`;
    }
}

// // Export classes and constants
// if (typeof module !== 'undefined') {
//     module.exports = {
//         ELEMENT_TYPES,
//         ELEMENT_COLORS,
//         ELEMENT_SIZES,
//         Element,
//         Connection
//     };
// }
