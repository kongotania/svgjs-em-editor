/**
 * elements.js
 *
 * Defines the Element class and constants for types, colors, sizes.
 */
import { v4 as uuidv4 } from 'uuid';

// Define element types and their properties
/**
 * @readonly
 * @enum {string}
 */
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

// Element colors mapped by type
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

// Counter for generating unique IDs (legacy, not used with uuidv4)
let idCounter = 1;

/**
 * Element class - Base class for all visual elements on the canvas.
 */
export class Element {
    /**
     * Create a new Element.
     * @param {string} type - The type of the element (from ELEMENT_TYPES).
     * @param {number} x - The x position of the element.
     * @param {number} y - The y position of the element.
     * @param {string} [name=''] - The display name of the element.
     */
    constructor(type, x, y, name = '') {
        /**
         * Unique identifier for this element.
         * @type {string}
         */
        this.id = `element-${uuidv4()}`;

        /**
         * The type of this element.
         * @type {string}
         */
        this.type = type;

        /**
         * X position of the element.
         * @type {number}
         */
        this.x = x;

        /**
         * Y position of the element.
         * @type {number}
         */
        this.y = y;

        /**
         * Display name of the element.
         * @type {string}
         */
        this.name = name;

        /**
         * Array of Connection objects attached to this element.
         * @type {Array}
         */
        this.connections = [];

        /**
         * Width of the element.
         * @type {number}
         */
        this.width = (type === ELEMENT_TYPES.SLICE) ? ELEMENT_SIZES.SLICE_WIDTH : ELEMENT_SIZES.WIDTH;

        /**
         * Height of the element.
         * @type {number}
         */
        this.height = (type === ELEMENT_TYPES.SLICE) ? ELEMENT_SIZES.SLICE_HEIGHT : ELEMENT_SIZES.HEIGHT;

        // Special case for slices (redundant, but ensures explicitness)
        if (type === ELEMENT_TYPES.SLICE) {
            this.width = ELEMENT_SIZES.SLICE_WIDTH;
            this.height = ELEMENT_SIZES.SLICE_HEIGHT;
        }
    }

    /**
     * Check if this element overlaps with another element (simple AABB check).
     * Slices are allowed to overlap with other elements.
     * @param {Element} otherElement - The element to check against.
     * @returns {boolean} - True if elements overlap, false otherwise.
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
     * Returns an object with keys 'top', 'right', 'bottom', 'left' and {x, y} values.
     * @returns {Object<string, {x: number, y: number}>}
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
     * @returns {{ source: {x: number, y: number, side: string}, target: {x: number, y: number, side: string} }}
     */
    findBestConnectionPoint(targetElement) {
        const sourcePoints = this.getConnectionPoints();
        const targetPoints = targetElement.getConnectionPoints();
        let minDistance = Infinity;
        let bestSourcePoint = null;
        let bestTargetPoint = null;

        // Compare all pairs of sides to find the closest points
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

    /**
     * Create an SVG representation of this element.
     * Adds icons for PROCESSOR and GUI types, and sets up drag and interaction logic.
     * @param {SVG.Container} canvas - The SVG canvas to draw on.
     * @param {InteractionManager} interactionManager - Reference to handle interactions.
     * @returns {SVG.G} - The SVG group containing the element.
     */
    createSVG(canvas, interactionManager) {
        // Create a group for the element
        const group = canvas.group().attr('id', this.id).addClass('element');

        // Draw the main rectangle
        const rect = group.rect(this.width, this.height)
            .attr({
                fill: ELEMENT_COLORS[this.type],
                rx: 5,
                ry: 5
            })
            .addClass('element-rect');

        // Add icons if applicable
        if (this.type === ELEMENT_TYPES.PROCESSOR) {
            // Add gear icon for processor
            group.text('⚙️').font({
                size: 20,
                anchor: 'middle',
                'dominant-baseline': 'middle'
            }).center(this.width / 2, this.height * 0.20);
        } else if (this.type === ELEMENT_TYPES.GUI) {
            // Add monitor icon for GUI
            group.text('🖥️').font({
                size: 20,
                anchor: 'middle',
                'dominant-baseline': 'middle'
            }).center(this.width / 2, this.height * 0.20);
        }

        // Create ForeignObject for HTML content (for editable name, etc.)
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

        // Position the group at the element's coordinates
        group.move(this.x, this.y);

        // Special styling for slices (dashed border, etc.)
        if (this.type === ELEMENT_TYPES.SLICE) {
            rect.attr({
                fill: ELEMENT_COLORS[this.type],
                'stroke-dasharray': '5,5',
                stroke: '#888'
            });
        }

        // Add Draggable behavior and drag event handlers
        group.draggable().on('dragstart.namespace', (e) => {
            e.preventDefault();
            if (interactionManager) {
                interactionManager.currentDraggingElement = this;

                // If editing a different element, save its name before dragging this one
                if (interactionManager.currentEditingDiv &&
                    interactionManager.selectedElement &&
                    interactionManager.selectedElement.id !== this.id) {
                    console.log(`Element.dragstart on ${this.id}: Detected active edit on different element ${interactionManager.selectedElement.id}. Saving it (no menu).`);
                    interactionManager.handleSaveName(false);
                } else if (interactionManager.currentEditingDiv &&
                    interactionManager.selectedElement &&
                    interactionManager.selectedElement.id === this.id) {
                    // If dragging the element currently being edited, save its name
                    console.log(`Element.dragstart on ${this.id}: This element is currently being edited. Saving it (no menu) before drag.`);
                    interactionManager.handleSaveName(false);
                }

                // Always hide context menus when a drag starts
                interactionManager.hideAllContextMenus();
            }
            group.addClass('dragging');
        }).on('dragmove.namespace', (e) => {
            e.preventDefault();
            const { handler, box } = e.detail;
            // Update element's position
            this.x = box.x;
            this.y = box.y;
            handler.move(box.x, box.y);

            // Update connections visually as the element moves
            if (interactionManager?.connectionManager) {
                interactionManager.connectionManager.updateConnectionsForElement(this);
            }
        }).on('dragend.namespace', (e) => {
            e.preventDefault();
            const { handler, box } = e.detail;
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
