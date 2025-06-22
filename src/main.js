/**
 * app.js
 *
 * Main application file. Initializes SVG canvas, managers, global marker, and event listeners.
 */
import { SVG, extend as SVGextend } from '@svgdotjs/svg.js';
import '@svgdotjs/svg.draggable.js';
import '@svgdotjs/svg.panzoom.js';
import './style.css';
import { ConnectionManager } from './ConnectionManager.js';
import { InteractionManager } from './InteractionManager.js';
import { ElementManager } from './ElementManager.js';
import { createLogger, setGlobalLogLevel } from './logger.js';

const logger = createLogger("main")
setGlobalLogLevel(logger.levels.WARN);

/**
 * Fallback dimensions for the SVG viewbox when #drawing-area has no size.
 */
const FALLBACK_VIEWBOX_WIDTH = 600;  // Chosen as a reasonable default canvas width
const FALLBACK_VIEWBOX_HEIGHT = 400; // Chosen as a reasonable default canvas height

/**
 * Initialize the application: setup SVG canvas, define global marker, create managers.
 */
function initApp() {
    const canvas = SVG().addTo('#drawing-area')
        .size('100%', '100%')
        .panZoom({
            zoomMin: 0.2,
            zoomMax: 3,
            zoomFactor: 0.2
        });

    // Set initial viewbox
    const drawingArea = document.getElementById('drawing-area');
    if (drawingArea) {
        canvas.viewbox(
            0,
            0,
            drawingArea.clientWidth || FALLBACK_VIEWBOX_WIDTH,
            drawingArea.clientHeight || FALLBACK_VIEWBOX_HEIGHT
        ); // Use fallback size if clientWidth/clientHeight are not set
    } else {
        // Stop initialization if container missing
        logger.error("#drawing-area element not found!");
        return;
    }

    // --- Define Global Arrowhead Marker ---
    canvas.defs().marker(10, 10, function (add) { // ViewBox 10x10
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


    // --- Instantiate Managers ---
    // Order: EM -> CM -> IM, then link IM back to EM if needed.
    // ElementManager (EM) must be created first as it manages the core SVG elements.
    // ConnectionManager (CM) depends on EM to manage connections between elements.
    // InteractionManager (IM) depends on both EM and CM to handle user interactions.
    // Finally, EM is given a reference to IM if it needs to trigger or respond to interactions.
    logger.info("Initializing Managers");
    const elementManager = new ElementManager(canvas);
    const connectionManager = new ConnectionManager(canvas, elementManager); // Pass elementManager reference
    const interactionManager = new InteractionManager(canvas, elementManager, connectionManager);
    elementManager.setInteractionManager(interactionManager); // Provide EM access to IM

    // --- Expose for Debugging (optional) ---
    // window.app = {
    //     canvas,
    //     elementManager,
    logger.info("Application Started.")
}

// --- Start Initialization ---
// Wait for the DOM to be fully loaded before running initApp
if (document.readyState === 'loading') { // Handle cases where script runs before DOMContentLoaded
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp(); // DOM is already ready
}