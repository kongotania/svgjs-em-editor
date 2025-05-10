/**
 * app.js
 *
 * Main application file. Initializes SVG canvas, managers, global marker, and event listeners.
 */

/**
 * ElementManager - Manages element creation, deletion, collision, and updates.
 */
class ElementManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.elements = []; // List of active Element objects
        this.interactionManager = null; // Reference set by initApp
    }

    /** Store a reference to the InteractionManager. */
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
        console.log(">>>createElement");
        const element = new Element(type, x, y, name);

        // Basic collision avoidance: Check and offset slightly if needed.
        // Note: This is a simple strategy and may not be robust for many overlaps.
        let attempts = 0;
        const maxAttempts = 5; // Prevent potential infinite loops
        while (this.hasCollision(element) && attempts < maxAttempts) {
            // console.log(`Collision detected for ${element.id}, attempting offset.`);
            element.x += 20;
            element.y += 20;
            attempts++;
        }
        if (this.hasCollision(element)) {
            console.warn(`Could not place element ${element.id} without collision after ${attempts} attempts.`);
            // Decide whether to place anyway or fail: element = null; // Example: fail
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
        console.log("<<<createElement");
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
        console.log(">>>removeElement");
        if (!element) {
            console.warn("   Incorrect value for element");
            return;
        }

        // --- Remove Associated Connections ---
        if (this.interactionManager?.connectionManager) { // Safely access connectionManager
            const connectionManager = this.interactionManager.connectionManager;
            // Use [... ] to iterate over a copy, as removeConnection modifies the original array
            const connectionsToRemove = [...connectionManager.getConnectionsForElement(element)];
            // console.log(`Removing ${connectionsToRemove.length} connections for element ${element.id}`);
            connectionsToRemove.forEach(conn => {
                connectionManager.removeConnection(conn);
            });
        } else {
            console.error("Cannot remove connections: ConnectionManager not accessible from ElementManager.");
        }
        // --- End Connection Removal ---

        // Remove the element's SVG group
        const svgElement = this.canvas.findOne(`#${element.id}`);
        if (svgElement) {
            svgElement.remove();
        }

        // Remove the element object from the manager's list
        const index = this.elements.findIndex(e => e.id === element.id);
        if (index > -1) {
            this.elements.splice(index, 1);
            // console.log(`Removed element ${element.id} from list.`);
        } else {
            console.warn(`Element ${element.id} not found in elements list during removal.`);
        }
        console.log("<<<removeElement");
    }

    /**
     * Update an element's SVG representation (e.g., after name change).
     * Currently removes and recreates the SVG group.
     * @param {Element} element - Element to update.
     */
    updateElement(element) {
        console.log(">>>updateElement");
        if (!element) {
            console.log("   Invalid Element");
            return;
        }
        // Remove old SVG
        const svgElement = this.canvas.findOne(`#${element.id}`);
        if (svgElement) {
            svgElement.remove();
        }
        // Create new SVG (passing interactionManager is crucial for re-attaching draggable)
        if (this.interactionManager) {
            element.createSVG(this.canvas, this.interactionManager);
        } else {
            console.error("InteractionManager not set when updating element SVG!");
            element.createSVG(this.canvas, null);
        }
        console.log("<<<updateElement");
    }

    /** Get element by ID. */
    getElementById(id) {
        return this.elements.find(e => e.id === id) || null;
    }
} // End class ElementManager

/**
 * Initialize the application: setup SVG canvas, define global marker, create managers.
 */
function initApp() {
    console.log('>>>initApp Event modeling application starting...');
    const canvas = SVG().addTo('#drawing-area').size('100%', '100%');

    // Set initial viewbox
    const drawingArea = document.getElementById('drawing-area');
    if (drawingArea) {
        canvas.viewbox(0, 0, drawingArea.clientWidth || 600, drawingArea.clientHeight || 400); // Added fallback size
    } else {
        console.error("#drawing-area element not found!");
        return; // Stop initialization if container missing
    }

    // --- Define Global Arrowhead Marker ---
    canvas.defs().marker(10, 10, function (add) { // ViewBox 10x10
        // Draw polygon for arrowhead (tip at x=6 for a size of 6)
        add.polygon('0,2 6,5 0,8').fill('#333'); // Smaller arrow
    }).attr({
        id: 'arrowhead-marker',       // Fixed ID for referencing
        orient: 'auto-start-reverse', // Auto-rotates with path end
        markerWidth: 6,               // Display size
        markerHeight: 6,              // Display size
        refX: 5.5,                    // Reference point near the tip (x=6)
        refY: 5,                      // Reference point (center y in 10x10 viewBox)
        markerUnits: 'strokeWidth'    // Scales with line thickness
    });
    // --- End Marker Definition ---

    // --- Instantiate Managers ---
    // Order: EM -> CM -> IM, then link IM back to EM if needed.
    const elementManager = new ElementManager(canvas);
    const connectionManager = new ConnectionManager(canvas, elementManager); // Pass elementManager reference
    const interactionManager = new InteractionManager(canvas, elementManager, connectionManager);
    elementManager.setInteractionManager(interactionManager); // Provide EM access to IM

    // --- Expose for Debugging (optional) ---
    window.app = {
        canvas,
        elementManager,
        connectionManager,
        interactionManager
    };

    console.log('<<<initApp Event modeling application initialized.');
} // End initApp function

// --- Start Initialization ---
// Wait for the DOM to be fully loaded before running initApp
if (document.readyState === 'loading') { // Handle cases where script runs before DOMContentLoaded
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp(); // DOM is already ready
}