/**
 * app.js
 * 
 * Main application file for the event modeling application.
 * Initializes the canvas and managers, and sets up the application.
 */

/**
 * ElementManager - Manages elements on the canvas
 */
class ElementManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.elements = [];
    }

    /**
     * Create a new element
     * @param {string} type - Element type
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {string} name - Optional element name
     * @returns {Element} - Created element
     */
    createElement(type, x, y, name = '') {
        // Create new element
        const element = new Element(type, x, y, name);
        
        // Check for collisions with other elements
        if (this.hasCollision(element)) {
            // Adjust position to avoid collision
            element.x += 20;
            element.y += 20;
            
            // Recursively check for collisions at new position
            if (this.hasCollision(element)) {
                // Try a different position if still colliding
                return this.createElement(type, x + 40, y + 40, name);
            }
        }
        
        // Add to elements list
        this.elements.push(element);
        
        // Create SVG representation
        element.createSVG(this.canvas);
        
        return element;
    }

    /**
     * Check if element collides with any other element
     * @param {Element} element - Element to check
     * @returns {boolean} - True if collision exists
     */
    hasCollision(element) {
        // Slices can overlap with other elements
        if (element.type === ELEMENT_TYPES.SLICE) return false;
        
        // Check collision with each element
        for (const other of this.elements) {
            if (other.id !== element.id && element.overlaps(other)) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Move an element to a new position
     * @param {Element} element - Element to move
     * @param {number} x - New X position
     * @param {number} y - New Y position
     * @returns {boolean} - True if move was successful
     */
    moveElement(element, x, y) {
        // Store original position
        const originalX = element.x;
        const originalY = element.y;
        
        // Update position
        element.x = x;
        element.y = y;
        
        // Check for collisions
        if (this.hasCollision(element)) {
            // Revert to original position
            element.x = originalX;
            element.y = originalY;
            return false;
        }
        
        // Update SVG position
        const svgElement = this.canvas.findOne(`#${element.id}`);
        if (svgElement) {
            svgElement.move(x, y);
        }
        
        return true;
    }

    /**
     * Remove an element
     * @param {Element} element - Element to remove
     */
    removeElement(element) {
        // Remove SVG representation
        const svgElement = this.canvas.findOne(`#${element.id}`);
        if (svgElement) {
            svgElement.remove();
        }
        
        // Remove element from list
        const index = this.elements.findIndex(e => e.id === element.id);
        if (index !== -1) {
            this.elements.splice(index, 1);
        }
    }

    /**
     * Update an element (e.g., after name change)
     * @param {Element} element - Element to update
     */
    updateElement(element) {
        // Remove old SVG representation
        const svgElement = this.canvas.findOne(`#${element.id}`);
        if (svgElement) {
            svgElement.remove();
        }
        
        // Create new SVG representation
        element.createSVG(this.canvas);
    }

    /**
     * Get element by ID
     * @param {string} id - Element ID
     * @returns {Element|null} - Found element or null
     */
    getElementById(id) {
        return this.elements.find(e => e.id === id) || null;
    }
}

/**
 * Initialize the application
 */
function initApp() {
    // Create SVG canvas
    console.log('Event modeling application starting');
    const canvas = SVG().addTo('#drawing-area').size('100%', '100%');
    
    // Set initial viewbox to match container
    const drawingArea = document.getElementById('drawing-area');
    canvas.viewbox(0, 0, drawingArea.clientWidth, drawingArea.clientHeight);
    
    // Create managers
    const elementManager = new ElementManager(canvas);
    const connectionManager = new ConnectionManager(canvas, elementManager.elements);
    const interactionManager = new InteractionManager(canvas, elementManager, connectionManager);
    
    // Add grid pattern to canvas
    // (already handled in CSS for simplicity)
    
    // Expose managers for debugging
    window.app = {
        canvas,
        elementManager,
        connectionManager,
        interactionManager
    };
    
    console.log('Event modeling application initialized');
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);
