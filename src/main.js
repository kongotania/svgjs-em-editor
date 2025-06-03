/**
 * app.js
 *
 * Main application file. Initializes SVG canvas, managers, global marker, and event listeners.
 */
import { SVG, extend as SVGextend } from '@svgdotjs/svg.js';
import '@svgdotjs/svg.draggable.js';
import './style.css';
import { ConnectionManager } from './ConnectionManager.js';
import { InteractionManager } from './InteractionManager.js';
import { ElementManager } from './ElementManager.js';

/**
 * Initialize the application: setup SVG canvas, define global marker, create managers.
 */
function initApp() {
    const canvas = SVG().addTo('#drawing-area').size('100%', '100%');

    // Set initial viewbox
    const drawingArea = document.getElementById('drawing-area');
    if (drawingArea) {
        canvas.viewbox(0, 0, drawingArea.clientWidth || 600, drawingArea.clientHeight || 400); // Added fallback size
    } else {
        // Stop initialization if container missing
        console.error("#drawing-area element not found!");
        return; 
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
    // window.app = {
    //     canvas,
    //     elementManager,
    //     connectionManager,
    //     interactionManager
    // };

    console.log('main.initApp Event modeling application initialized.');
} 

// --- Start Initialization ---
// Wait for the DOM to be fully loaded before running initApp
if (document.readyState === 'loading') { // Handle cases where script runs before DOMContentLoaded
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp(); // DOM is already ready
}