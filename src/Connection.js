// let idCounter = 1; 

/**
 * Connection class - Represents a directed connection between two elements.
 * Handles connection creation, loop detection, and SVG rendering.
 */
export class Connection {
    /**
     * Create a new Connection.
     * @param {Element} sourceElement - The element where the connection starts.
     * @param {Element} targetElement - The element where the connection ends.
     */
    constructor(sourceElement, targetElement) {
        /**
         * Unique identifier for this connection.
         * @type {string}
         */
        this.id = `connection-${idCounter++}`;

        /**
         * The source element of the connection.
         * @type {Element}
         */
        this.sourceElement = sourceElement;

        /**
         * The target element of the connection.
         * @type {Element}
         */
        this.targetElement = targetElement;

        // Calculate initial best connection points (updated when drawn/moved)
        const { source, target } = sourceElement.findBestConnectionPoint(targetElement);
        /**
         * The source point for the SVG path.
         * @type {{x: number, y: number, side: string}}
         */
        this.sourcePoint = source;

        /**
         * The target point for the SVG path.
         * @type {{x: number, y: number, side: string}}
         */
        this.targetPoint = target;
    }

    /**
     * Check if adding this connection would create a loop in the graph (DFS).
     * @returns {boolean} - True if connection creates a loop.
     */
    createsLoop() {
        // Check direct self-loop (should be prevented earlier)
        if (this.sourceElement.id === this.targetElement.id) { 
            return true; 
        }
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
        // Base case: found a path to the target
        if (current.id === target.id) { 
            return true; 
        }
        visited.add(current.id);

        // Look at outgoing connections from the 'current' element
        for (const conn of current.connections) {
            // Only follow connections originating from 'current'
            if (conn.sourceElement.id === current.id) {
                const nextElement = conn.targetElement;
                // Avoid revisiting nodes to prevent infinite loops
                if (!visited.has(nextElement.id)) {
                    if (this.pathExists(nextElement, target, visited)) {
                        return true;
                    }
                }
            }
        }
        // No path found from current to target
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
        // Initialize control points at the endpoints
        let sourceControlX = source.x;
        let sourceControlY = source.y;
        let targetControlX = target.x;
        let targetControlY = target.y;
        const controlDistance = 50; // How far control points extend

        // Offset control points based on connection side for smoother curves
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