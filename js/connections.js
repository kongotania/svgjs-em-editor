/**
 * connections.js
 *
 * Defines the ConnectionManager class for handling connection creation and management.
 */

/**
 * ConnectionManager - Handles the creation and management of connections between elements.
 */
class ConnectionManager {
    /**
     * @param {SVG.Container} canvas - The main SVG canvas.
     * @param {ElementManager} elementManager - Reference to manage elements.
     */
    constructor(canvas, elementManager) {
        this.canvas = canvas;
        this.elementManager = elementManager; // Store manager reference
        this.connections = []; // List of active Connection objects
        this.connectionMode = false; // Are we currently drawing a connection?
        this.sourceElement = null; // Element where the current connection starts
        this.tempConnection = null; // The temporary dashed line SVG path
    }

    /**
     * Start creating a connection from a source element.
     * @param {Element} element - The source element.
     */
    startConnection(element) {
        if (!element) return;
        // console.log(">>> startConnection", { elementId: element.id, currentMode: this.connectionMode });
        if (this.connectionMode) {
            // console.warn("Already in connection mode, cancelling previous.");
            this.cancelConnection(); // Ensure cleanup if called unexpectedly
        }
        this.connectionMode = true;
        this.sourceElement = element;

        // Create a temporary dashed line path
        this.tempConnection = this.canvas.path().attr({
            stroke: '#555', // Slightly different color for temp line?
            'stroke-width': 2,
            'stroke-dasharray': '5,5',
            fill: 'none'
        });

        // Apply the global marker using .attr()
        this.tempConnection.attr('marker-end', 'url(#arrowhead-marker)');
        // console.log("<<< startConnection finished", { newMode: this.connectionMode, source: this.sourceElement.id });
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
        // console.log(">>> completeConnection", { targetId: targetElement?.id, currentMode: this.connectionMode, source: this.sourceElement?.id });
        if (!this.connectionMode || !this.sourceElement) {
            // console.warn("completeConnection called but not in connection mode or no source.");
            // Ensure temp line is removed even if called incorrectly
            if (this.tempConnection) { this.tempConnection.remove(); this.tempConnection = null; }
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
        // console.log("--- completeConnection: Mode reset");
        // --- End Reset State ---

        // Validate target
        if (!targetElement || targetElement === currentSource) {
            // console.log("--- completeConnection: Invalid target or self-connection. Cancelled.");
            return null; // Cancelled (self or no target)
        }

        // Create the connection object
        const connection = new Connection(currentSource, targetElement);

        // --- Loop Prevention (Currently Disabled) ---
        /*
        if (connection.createsLoop()) {
            console.log('--- completeConnection: Connection creates a loop and is not allowed');
            return null; // Cancelled (loop detected)
        }
        */
        // --- End Loop Prevention ---

        // Update element and manager state
        if (currentSource.connections && targetElement.connections) {
            currentSource.connections.push(connection);
            targetElement.connections.push(connection);
            this.connections.push(connection); // Add to manager's list
        } else {
            console.error("Element missing 'connections' array property!");
            return null; // Cannot add connection reliably
        }

        // Draw the final connection SVG
        connection.createSVG(this.canvas); // createSVG applies the marker

        // console.log("<<< completeConnection finished successfully", { connectionId: connection.id });
        return connection;
    }

    /**
     * Cancel the current connection operation explicitly.
     */
    cancelConnection() {
        // console.log(">>> cancelConnection", { currentMode: this.connectionMode });
        if (!this.connectionMode) return;

        // Remove temporary line if it exists
        if (this.tempConnection) {
            this.tempConnection.remove();
            this.tempConnection = null;
        }

        // Reset state
        this.connectionMode = false;
        this.sourceElement = null;
        // console.log("<<< cancelConnection finished");
    }

    /**
     * Remove an existing connection completely.
     * @param {Connection} connection - The connection object to remove.
     */
    removeConnection(connection) {
        console.log(`>>> ConnectionManager.removeConnection called for ID: ${connection?.id}`);

        if (!connection || !connection.sourceElement || !connection.targetElement) {
            console.error("   removeConnection: Invalid connection object received.", connection);
            return; // Exit if connection object is invalid
        }
        console.log(`   Source: ${connection.sourceElement.id}, Target: ${connection.targetElement.id}`);


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
        console.log(`<<< ConnectionManager.removeConnection finished for ID: ${connection?.id}`); // LOG ADDE
    }

    /**
     * Efficiently update only the connections attached to a specific element (e.g., when moved).
     * Uses .plot() to update the path data instead of remove/redraw.
     * @param {Element} element - The element whose connections need updating.
     */
    updateConnectionsForElement(element) {
        if (!element) return;
        // console.log(`>>> updateConnectionsForElement for: ${element.id}`);
        const connectionsToUpdate = this.connections.filter(conn =>
            conn.sourceElement.id === element.id || conn.targetElement.id === element.id
        );

        connectionsToUpdate.forEach(connection => {
            const svgConnection = this.canvas.findOne(`#${connection.id}`);
            if (svgConnection) {
                // Recalculate best points and path data
                const { source, target } = connection.sourceElement.findBestConnectionPoint(connection.targetElement);
                connection.sourcePoint = source; // Update connection state
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
        // console.log(`<<< updateConnectionsForElement finished for: ${element.id}`);
    }

    /**
     * Update all connections currently managed. Less efficient than updateConnectionsForElement.
     * Should only be used if a global redraw is needed (e.g., after zoom if routing changes).
     */
    updateConnections() {
        // console.log(">>> updateConnections (Global) called");
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
        // console.log("<<< updateConnections (Global) finished");
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