import { Element, ELEMENT_TYPES } from './Element.js'; // Element class and ELEMENT_TYPES constant

/**
 * ElementManager - Manages element creation, deletion, collision, and updates.
 */
export class ElementManager {
    /**
     * Construct a new ElementManager.
     * @param {SVG.Container} canvas - The SVG canvas where elements are drawn.
     */
    constructor(canvas) {
        /**
         * The SVG canvas for rendering elements.
         * @type {SVG.Container}
         */
        this.canvas = canvas;

        /**
         * List of active Element objects managed by this manager.
         * @type {Array<Element>}
         */
        this.elements = [];

        /**
         * Reference to the InteractionManager (set externally).
         * @type {InteractionManager|null}
         */
        this.interactionManager = null; // Reference set by initApp
    }

    /**
     * Store a reference to the InteractionManager.
     * @param {InteractionManager} interactionManager - The interaction manager to use.
     */
    setInteractionManager(interactionManager) {
        this.interactionManager = interactionManager;
    }

    /**
     * Create a new element, handle collisions, and add its SVG to the canvas.
     * @param {string} type - Element type from ELEMENT_TYPES.
     * @param {number} x - Initial X position.
     * @param {number} y - Initial Y position.
     * @param {string} name - Optional initial element name.
     * @returns {Element | null} - Created element or null if failed.
     */
    createElement(type, x, y, name = '') {
        const element = new Element(type, x, y, name);

        // Basic collision avoidance: Check and offset slightly if needed.
        // Note: This is a simple strategy and may not be robust for many overlaps.
        let attempts = 0;
        const maxAttempts = 5; // Prevent potential infinite loops
        while (this.hasCollision(element) && attempts < maxAttempts) {
            element.x += 20; // Offset position to try to avoid collision
            element.y += 20;
            attempts++;
        }
        if (this.hasCollision(element)) {
            console.warn(`Could not place element ${element.id} without collision after ${attempts} attempts.`);
            // Optionally: element = null; // Example: fail to create if still colliding
        }

        if (element) {
            // Add to elements list
            this.elements.push(element);
            // Create SVG representation (needs interactionManager ref for draggable events)
            if (this.interactionManager) {
                element.createSVG(this.canvas, this.interactionManager);
            } else {
                console.error("InteractionManager not set when creating element SVG!");
                // Handle error? Maybe create SVG later? For now, proceed but draggable might fail.
                element.createSVG(this.canvas, null);
            }
        }
        return element;
    }

    /**
     * Check if the given element overlaps with any existing non-slice element.
     * @param {Element} element - Element to check.
     * @returns {boolean} - True if collision exists.
     */
    hasCollision(element) {
        if (element.type === ELEMENT_TYPES.SLICE)
            return false; // Slices don't collide
        for (const other of this.elements) {
            // Don't check against self, and ignore slices
            if (other.id !== element.id && other.type !== ELEMENT_TYPES.SLICE) {
                if (element.overlaps(other)) { // Use the Element's overlap method
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Remove an element and its associated connections.
     * @param {Element} element - Element to remove.
     */
    removeElement(element) {
        if (!element) {
            console.warn("   Incorrect value for element");
            return;
        }

        // --- Remove Associated Connections ---
        if (this.interactionManager?.connectionManager) { // Safely access connectionManager
            const connectionManager = this.interactionManager.connectionManager;
            // Use [... ] to iterate over a copy, as removeConnection modifies the original array
            const connectionsToRemove = [...connectionManager.getConnectionsForElement(element)];
            // Remove all connections associated with this element
            connectionsToRemove.forEach(conn => {
                connectionManager.removeConnection(conn);
            });
        } else {
            console.error("Cannot remove connections: ConnectionManager not accessible from ElementManager.");
        }
        // --- End Connection Removal ---

        // Remove the element's SVG group from the canvas
        const svgElement = this.canvas.findOne(`#${element.id}`);
        if (svgElement) {
            svgElement.remove();
        }

        // Remove the element object from the manager's list
        const index = this.elements.findIndex(e => e.id === element.id);
        if (index > -1) {
            this.elements.splice(index, 1);
        } else {
            console.warn(`Element ${element.id} not found in elements list during removal.`);
        }
    }

    /**
     * Update an element's SVG representation (e.g., after name change).
     * Currently removes and recreates the SVG group.
     * @param {Element} element - Element to update.
     */
    updateElement(element) {
        const svgGroup = this.canvas.findOne(`#${element.id}`);
        if (svgGroup) {
            const contentDiv = svgGroup.findOne('.element-content-div');
            if (contentDiv && contentDiv.node) {
                contentDiv.node.textContent = element.name || element.type;
            } else {
                console.warn(`Content div not found for element ${element.id}`);
                // Fallback to full recreate if necessary
                svgGroup.remove();
                element.createSVG(this.canvas, this.interactionManager);
            }
        } else {
            element.createSVG(this.canvas, this.interactionManager);
        }
    }

    /**
     * Get an element by its unique ID.
     * @param {string} id - The element's unique identifier.
     * @returns {Element|null} - The found element or null if not found.
     */
    getElementById(id) {
        return this.elements.find(e => e.id === id) || null;
    }
}
