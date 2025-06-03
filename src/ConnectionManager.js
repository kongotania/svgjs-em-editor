/**
 * ConnectionManager.js
 *
 * Defines the ConnectionManager class for handling connection creation and management.
 */
import { Connection } from './Connection.js';

/**
 * ConnectionManager - Handles the creation and management of connections between elements.
 */
export class ConnectionManager {
    /**
     * Construct a ConnectionManager.
     * @param {SVG.Container} canvas - The main SVG canvas.
     * @param {ElementManager} elementManager - Reference to manage elements.
     */
    constructor(canvas, elementManager) {
        /**
         * The SVG canvas where connections are drawn.
         * @type {SVG.Container}
         */
        this.canvas = canvas;

        /**
         * Reference to the element manager.
         * @type {ElementManager}
         */
        this.elementManager = elementManager;

        /**
         * List of active Connection objects.
         * @type {Array<Connection>}
         */
        this.connections = [];

        /**
         * Whether a connection is currently being drawn.
         * @type {boolean}
         */
        this.connectionMode = false;

        /**
         * The element where the current connection starts.
         * @type {Element|null}
         */
        this.sourceElement = null;

        /**
         * The temporary dashed line SVG path shown during connection creation.
         * @type {SVG.Path|null}
         */
        this.tempConnection = null;
    }

    /**
     * Start creating a connection from a source element.
     * @param {Element} element - The source element.
     */
    startConnection(element) {
        if (!element) {
            throw new Error("startConnection: 'element' must not be null or undefined.");
        }
        if (this.connectionMode) {
            // If already in connection mode, cancel the previous attempt
            console.error("Already in connection mode, cancelling previous.");
            this.cancelConnection();
        }
        this.connectionMode = true;
        this.sourceElement = element;

        // Create a temporary dashed line path for visual feedback
        this.tempConnection = this.canvas.path().attr({
            stroke: '#555', // Slightly different color for temp line
            'stroke-width': 2,
            'stroke-dasharray': '5,5',
            fill: 'none'
        });

        // Apply the global marker to the temporary connection
        this.tempConnection.attr('marker-end', 'url(#arrowhead-marker)');
    }

    /**
     * Update the temporary connection path to follow the mouse cursor.
     * @param {number} mouseX - Current mouse X position in SVG coordinates.
     * @param {number} mouseY - Current mouse Y position in SVG coordinates.
     */
    updateTempConnection(mouseX, mouseY) {
        if (!this.connectionMode || !this.tempConnection || !this.sourceElement) {
            return; // Exit if not in active connection mode
        }

        // Find the best starting point on the source element closest to the mouse
        const sourcePoints = this.sourceElement.getConnectionPoints();
        let minDistance = Infinity;
        let bestPoint = null;
        for (const [side, point] of Object.entries(sourcePoints)) {
            const dx = point.x - mouseX;
            const dy = point.y - mouseY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < minDistance) {
                minDistance = distance;
                bestPoint = { ...point, side };
            }
        }

        // Define start (best source point) and end (mouse position)
        const source = bestPoint;
        const target = { x: mouseX, y: mouseY };

        // Calculate control points for the curve based on source side
        let sourceControlX = source.x;
        let sourceControlY = source.y;
        const controlDistance = 50;
        switch (source.side) {
            case 'top': sourceControlY -= controlDistance; break;
            case 'right': sourceControlX += controlDistance; break;
            case 'bottom': sourceControlY += controlDistance; break;
            case 'left': sourceControlX -= controlDistance; break;
        }

        // For the temp line, the target control point can just be the target itself
        const targetControlX = target.x;
        const targetControlY = target.y;

        // Create the cubic Bezier path data string
        const pathData = `M ${source.x} ${source.y} C ${sourceControlX} ${sourceControlY}, ${targetControlX} ${targetControlY}, ${target.x} ${target.y}`;

        // Update the temporary path's shape
        this.tempConnection.plot(pathData);
    }

    /**
     * Complete or cancel the connection creation process.
     * @param {Element | null} targetElement - The target element, or null if cancelled.
     * @returns {Connection | null} - The created Connection object, or null if invalid/cancelled.
     */
    completeConnection(targetElement) {
        if (!this.connectionMode || !this.sourceElement) {
            // Not in connection mode or no source element
            console.warn("completeConnection called but not in connection mode or no source.");
            // Ensure temp line is removed even if called incorrectly
            if (this.tempConnection) {
                this.tempConnection.remove();
                this.tempConnection = null;
            }
            return null;
        }

        const currentSource = this.sourceElement; // Store before resetting state

        // --- Reset State ---
        this.connectionMode = false;
        this.sourceElement = null;
        if (this.tempConnection) {
            this.tempConnection.remove();
            this.tempConnection = null;
        }
        // --- End Reset State ---

        // Validate target
        if (!targetElement || targetElement === currentSource) {
            // Prevent self-connections or missing targets
            console.error("--- completeConnection: Invalid target or self-connection. Cancelled.");
            return null;
        }

        // Create the connection object
        const connection = new Connection(currentSource, targetElement);

        // Update element and manager state
        if (currentSource.connections && targetElement.connections) {
            // Add the connection to both elements and the manager
            currentSource.connections.push(connection);
            targetElement.connections.push(connection);
            this.connections.push(connection);
        } else {
            // If either element is missing a connections array, abort
            console.error("Element missing 'connections' array property!");
            return null;
        }

        // Draw the final connection SVG
        connection.createSVG(this.canvas);

        return connection;
    }

    /**
     * Cancel the current connection operation explicitly.
     */
    cancelConnection() {
        if (!this.connectionMode) return;

        // Remove temporary line if it exists
        if (this.tempConnection) {
            this.tempConnection.remove();
            this.tempConnection = null;
        }

        // Reset state
        this.connectionMode = false;
        this.sourceElement = null;
    }

    /**
     * Remove an existing connection completely.
     * @param {Connection} connection - The connection object to remove.
     */
    removeConnection(connection) {
        if (!connection || !connection.sourceElement || !connection.targetElement) {
            console.error("   removeConnection: Invalid connection object received.", connection);
            return;
        }

        // 1. Remove from source element's list
        const sourceIndex = connection.sourceElement?.connections.findIndex(c => c.id === connection.id);
        if (sourceIndex > -1) {
            connection.sourceElement.connections.splice(sourceIndex, 1);
        }

        // 2. Remove from target element's list
        const targetIndex = connection.targetElement?.connections.findIndex(c => c.id === connection.id);
        if (targetIndex > -1) {
            connection.targetElement.connections.splice(targetIndex, 1);
        }

        // 3. Remove from ConnectionManager's list
        const managerIndex = this.connections.findIndex(c => c.id === connection.id);
        if (managerIndex > -1) {
            this.connections.splice(managerIndex, 1);
        }

        // 4. Remove SVG element from the canvas
        const svgConnection = this.canvas.findOne(`#${connection.id}`);
        if (svgConnection) {
            svgConnection.remove();
        }
        // No need to remove the marker as it's global
    }

    /**
     * Efficiently update only the connections attached to a specific element (e.g., when moved).
     * Uses .plot() to update the path data instead of remove/redraw.
     * @param {Element} element - The element whose connections need updating.
     */
    updateConnectionsForElement(element) {
        if (!element) {
            console.error("Invalid Element");
            return;
        }
        // Filter connections that are attached to the given element
        const connectionsToUpdate = this.connections.filter(conn =>
            conn.sourceElement.id === element.id || conn.targetElement.id === element.id
        );

        connectionsToUpdate.forEach(connection => {
            const svgConnection = this.canvas.findOne(`#${connection.id}`);
            if (svgConnection) {
                // Recalculate best points and path data
                const { source, target } = connection.sourceElement.findBestConnectionPoint(connection.targetElement);
                connection.sourcePoint = source;
                connection.targetPoint = target;
                const newPathData = connection.createCurvedPath(source, target);
                // Update the existing SVG path's shape
                svgConnection.plot(newPathData);
            } else {
                // Fallback if SVG missing (shouldn't normally happen)
                console.warn(`Could not find SVG for connection ${connection.id} during update. Recreating.`);
                connection.createSVG(this.canvas);
            }
        });
    }

    /**
     * Update all connections currently managed. Less efficient than updateConnectionsForElement.
     * Should only be used if a global redraw is needed (e.g., after zoom if routing changes).
     */
    updateConnections() {
        this.connections.forEach(connection => {
            const svgConnection = this.canvas.findOne(`#${connection.id}`);
            if (svgConnection) {
                const { source, target } = connection.sourceElement.findBestConnectionPoint(connection.targetElement);
                connection.sourcePoint = source;
                connection.targetPoint = target;
                const newPathData = connection.createCurvedPath(source, target);
                svgConnection.plot(newPathData); // Use plot() for efficiency
            } else {
                console.warn(`Could not find SVG for connection ${connection.id} during global update. Recreating.`);
                connection.createSVG(this.canvas);
            }
        });
    }

    /**
     * Get all connections associated with a specific element (incoming or outgoing).
     * @param {Element} element - The element to get connections for.
     * @returns {Array<Connection>} - Array of connections linked to the element.
     */
    getConnectionsForElement(element) {
        if (!element) return [];
        return this.connections.filter(c =>
            c.sourceElement?.id === element.id || c.targetElement?.id === element.id
        );
    }
}