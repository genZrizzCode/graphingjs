#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const math = require('mathjs');
const { createCanvas } = require('canvas');
const readlineSync = require('readline-sync');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json')));
const { program } = require('commander');

// Function to create ASCII plot
function createAsciiPlot(expression, xMin, xMax, yMin, yMax, width = 80, height = 24) {
  const plot = [];
  
  // Initialize plot with spaces
  for (let i = 0; i < height; i++) {
    plot[i] = new Array(width).fill(' ');
  }
  
  // Draw axes
  const xAxisY = Math.floor((yMax / (yMax - yMin)) * (height - 1));
  const yAxisX = Math.floor((-xMin / (xMax - xMin)) * (width - 1));
  
  // Draw x-axis
  if (xAxisY >= 0 && xAxisY < height) {
    for (let x = 0; x < width; x++) {
      plot[xAxisY][x] = '-';
    }
  }
  
  // Draw y-axis
  if (yAxisX >= 0 && yAxisX < width) {
    for (let y = 0; y < height; y++) {
      plot[y][yAxisX] = '|';
    }
  }
  
  // Draw origin point
  if (xAxisY >= 0 && xAxisY < height && yAxisX >= 0 && yAxisX < width) {
    plot[xAxisY][yAxisX] = '+';
  }
  
  // Plot the function
  const stepX = (xMax - xMin) / width;
  
  for (let i = 0; i < width; i++) {
    const x = xMin + i * stepX;
    try {
      const y = math.evaluate(expression, { x: x });
      
      if (isFinite(y) && y >= yMin && y <= yMax) {
        const plotY = Math.floor((yMax - y) / (yMax - yMin) * (height - 1));
        
        if (plotY >= 0 && plotY < height) {
          // Use different characters based on position relative to axes
          let char = '*';
          
          if (plotY === xAxisY) {
            char = '='; // On x-axis
          } else if (i === yAxisX) {
            char = '|'; // On y-axis
          } else if (plotY === xAxisY && i === yAxisX) {
            char = '+'; // At origin
          }
          
          plot[plotY][i] = char;
        }
      }
    } catch (error) {
      // Skip invalid points
    }
  }
  
  // Convert to string
  let result = '';
  for (let y = 0; y < height; y++) {
    result += plot[y].join('') + '\n';
  }
  
  return result;
}

// Function to find intercepts for static PNG plots
function findIntercepts(expression, xMin, xMax, yMin, yMax) {
  const intercepts = {
    xIntercepts: [],
    yIntercepts: []
  };
  
  // X-intercepts (y = 0)
  if (yMin <= 0 && yMax >= 0) {
    // Use numerical method for finding x-intercepts
    const step = (xMax - xMin) / 200;
    let prevY = null;
    let prevX = null;
    
    for (let x = xMin; x <= xMax; x += step) {
      try {
        const y = math.evaluate(expression, { x: x });
        
        if (isFinite(y)) {
          if (prevY !== null) {
            // Check if we crossed y = 0
            if ((prevY <= 0 && y >= 0) || (prevY >= 0 && y <= 0)) {
              // Use linear interpolation for more accurate x-intercept
              const ratio = Math.abs(prevY) / (Math.abs(prevY) + Math.abs(y));
              const xIntercept = prevX + step * ratio;
              
              if (xIntercept >= xMin && xIntercept <= xMax) {
                // Check if we already have a similar intercept
                const exists = intercepts.xIntercepts.some(p => 
                  Math.abs(p.x - xIntercept) < step
                );
                
                if (!exists) {
                  intercepts.xIntercepts.push({
                    x: xIntercept,
                    y: 0
                  });
                }
              }
            }
          }
          prevY = y;
          prevX = x;
        }
      } catch (error) {
        // Skip invalid points
      }
    }
    
    // Also try direct solve for simple cases
    try {
      const xIntercept = math.solve(expression + ' = 0', 'x');
      if (Array.isArray(xIntercept)) {
        xIntercept.forEach(x => {
          if (x >= xMin && x <= xMax && isFinite(x)) {
            const exists = intercepts.xIntercepts.some(p => 
              Math.abs(p.x - x) < 0.1
            );
            if (!exists) {
              intercepts.xIntercepts.push({
                x: x,
                y: 0
              });
            }
          }
        });
      } else if (isFinite(xIntercept) && xIntercept >= xMin && xIntercept <= xMax) {
        const exists = intercepts.xIntercepts.some(p => 
          Math.abs(p.x - xIntercept) < 0.1
        );
        if (!exists) {
          intercepts.xIntercepts.push({
            x: xIntercept,
            y: 0
          });
        }
      }
    } catch (error) {
      // No x-intercept found via solve - that's okay
    }
  }
  
  // Y-intercepts (x = 0)
  if (xMin <= 0 && xMax >= 0) {
    try {
      const yIntercept = math.evaluate(expression, { x: 0 });
      if (isFinite(yIntercept) && yIntercept >= yMin && yIntercept <= yMax) {
        intercepts.yIntercepts.push({
          x: 0,
          y: yIntercept
        });
      }
    } catch (error) {
      // No y-intercept found
    }
  }
  
  // Limit intercepts for periodic functions (like sin, cos, tan)
  const isPeriodic = expression.includes('sin') || expression.includes('cos') || 
                     expression.includes('tan') || expression.includes('csc') || 
                     expression.includes('sec') || expression.includes('cot');
  
  if (isPeriodic && intercepts.xIntercepts.length > 3) {
    // Sort by distance from origin and keep the 3 closest to origin
    intercepts.xIntercepts.sort((a, b) => Math.abs(a.x) - Math.abs(b.x));
    intercepts.xIntercepts = intercepts.xIntercepts.slice(0, 3);
  }
  
  return intercepts;
}

// Function to prompt for colors
function promptForColors(plotType = 'interactive') {
  console.log('\n🎨 Color Customization');
  console.log('Choose colors for your plot (or press Enter for defaults):\n');
  
  const colors = {
    background: '#ffffff',
    gridBackground: '#f8f8f8',
    gridLines: '#e0e0e0',
    gridMainLines: '#000000',
    origin: '#ffff00',
    xInterceptColor: '#ff0000',
    yInterceptColor: '#ff0000',
    pointColor: '#ff000080',
    pointSelectColor: '#0000ff'
  };
  
  // Background color (different prompt based on plot type)
  const bgPrompt = plotType === 'interactive' ? 'Website background (default: white): ' : 'Background color (default: white): ';
  const bgColor = readlineSync.question(bgPrompt, {
    defaultInput: '#ffffff'
  });
  if (bgColor.trim()) colors.background = bgColor;
  
  // Grid background color
  const gridBgPrompt = plotType === 'interactive' ? 'Grid background (default: slightly darker white): ' : 'Grid background (default: light grey): ';
  const gridBgColor = readlineSync.question(gridBgPrompt, {
    defaultInput: plotType === 'interactive' ? '#f8f8f8' : '#f0f0f0'
  });
  if (gridBgColor.trim()) colors.gridBackground = gridBgColor;
  
  // Grid lines color
  const gridLinesColor = readlineSync.question('Grid lines (default: light grey): ', {
    defaultInput: '#e0e0e0'
  });
  if (gridLinesColor.trim()) colors.gridLines = gridLinesColor;
  
  // Grid main lines color
  const gridMainColor = readlineSync.question('Grid main lines (default: black): ', {
    defaultInput: '#000000'
  });
  if (gridMainColor.trim()) colors.gridMainLines = gridMainColor;
  
  // Origin color
  const originColor = readlineSync.question('Origin (default: yellow): ', {
    defaultInput: '#ffff00'
  });
  if (originColor.trim()) colors.origin = originColor;
  
  // X intercept color
  const xInterceptColor = readlineSync.question('X intercept points (default: red): ', {
    defaultInput: '#ff0000'
  });
  if (xInterceptColor.trim()) colors.xInterceptColor = xInterceptColor;
  
  // Y intercept color
  const yInterceptColor = readlineSync.question('Y intercept points (default: red): ', {
    defaultInput: '#ff0000'
  });
  if (yInterceptColor.trim()) colors.yInterceptColor = yInterceptColor;
  
  // Point color
  const pointColor = readlineSync.question('Grid points (default: translucent red): ', {
    defaultInput: '#ff000080'
  });
  if (pointColor.trim()) colors.pointColor = pointColor;
  
  // Point select color
  const pointSelectColor = readlineSync.question('Selected points (default: blue): ', {
    defaultInput: '#0000ff'
  });
  if (pointSelectColor.trim()) colors.pointSelectColor = pointSelectColor;
  
  console.log('\n✅ Colors set!');
  return colors;
}

// Function to create interactive HTML plot
function createInteractiveHTML(expression, xMin, xMax, yMin, yMax, colors = null, options = null) {
  const defaultColors = {
    background: '#ffffff',
    gridBackground: '#f8f8f8',
    gridLines: '#e0e0e0',
    gridMainLines: '#000000',
    origin: '#ffff00',
    xInterceptColor: '#ff0000',
    yInterceptColor: '#ff0000',
    pointColor: '#ff000080',
    pointSelectColor: '#0000ff'
  };
  
  const plotColors = colors || defaultColors;
  const pointInterval = options?.points || 0;
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Interactive Graph: ${expression}</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/mathjs/11.8.0/math.js"></script>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: Arial, sans-serif;
            background-color: ${plotColors.background};
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .title {
            text-align: center;
            color: ${plotColors.gridMainLines};
            margin-bottom: 20px;
            font-size: 24px;
            font-weight: bold;
        }
        .expression-display {
            text-align: center;
            color: ${plotColors.xInterceptColor};
            margin-bottom: 20px;
            font-size: 18px;
            font-family: 'Courier New', monospace;
            background: ${plotColors.gridBackground};
            padding: 10px;
            border-radius: 5px;
            border-left: 4px solid ${plotColors.xInterceptColor};
        }
        .controls {
            text-align: center;
            margin-bottom: 20px;
            padding: 15px;
            background: ${plotColors.gridBackground};
            border-radius: 8px;
        }
        .control-group {
            display: inline-block;
            margin: 0 15px;
        }
        .control-group label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
            color: ${plotColors.gridMainLines};
        }
        .control-group input {
            padding: 5px;
            border: 1px solid #ccc;
            border-radius: 4px;
            width: 80px;
        }
        .control-group button {
            padding: 8px 15px;
            margin: 0 5px;
            border: none;
            border-radius: 4px;
            background: ${plotColors.xInterceptColor};
            color: white;
            cursor: pointer;
            font-weight: bold;
        }
        .control-group button:hover {
            opacity: 0.8;
        }
        .canvas-container {
            text-align: center;
            margin: 20px 0;
        }
        #plotCanvas {
            border: 2px solid ${plotColors.gridMainLines};
            border-radius: 8px;
            cursor: crosshair;
        }
        .info {
            text-align: center;
            margin-top: 20px;
            padding: 15px;
            background: ${plotColors.gridBackground};
            border-radius: 8px;
            color: ${plotColors.gridMainLines};
        }
        .coordinates {
            font-family: monospace;
            font-size: 14px;
            margin-top: 10px;
        }
        .footer {
            text-align: left;
            margin-top: 20px;
            padding: 10px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="title">Interactive Graph: f(x) = ${expression}</div>
        
        <div class="expression-display">f(x) = ${expression}</div>
        
        <div class="controls">
            <div class="control-group">
                <label>X Range:</label>
                <input type="number" id="xMin" value="${xMin}" step="0.1">
                <input type="number" id="xMax" value="${xMax}" step="0.1">
            </div>
            <div class="control-group">
                <label>Y Range:</label>
                <input type="number" id="yMin" value="${yMin}" step="0.1">
                <input type="number" id="yMax" value="${yMax}" step="0.1">
            </div>
            <div class="control-group">
                <label>Point Interval:</label>
                <input type="number" id="pointInterval" value="${pointInterval}" min="0" step="0.1">
            </div>
            <div class="control-group">
                <label>&nbsp;</label>
                <button onclick="updatePlot()">Update Plot</button>
                <button onclick="resetZoom()">Reset</button>
            </div>
        </div>
        
        <div class="canvas-container">
            <canvas id="plotCanvas" width="800" height="600"></canvas>
        </div>
        
        <div class="info">
            <div><strong>Instructions:</strong></div>
            <div>• Click and drag to pan the graph</div>
            <div>• Scroll to zoom in/out</div>
            <div>• Hover over the graph to see coordinates</div>
            <div>• Hover over points to highlight them</div>
            <div>• Click on points to select them (coordinates shown)</div>
            <div>• Set point interval to show grid points</div>
            <div class="coordinates" id="coordinates">Move your mouse over the graph</div>
        </div>
        
        <div class="footer" style="color: ${plotColors.background === '#ffffff' || plotColors.background === '#f8f8f8' || plotColors.background === '#e0e0e0' ? '#000000' : '#ffffff'};">MIT - MaSoVaX<br><a href="https://github.com/genZrizzCode/graphingjs" style="text-decoration: none; color: inherit;">Github</a></div>
    </div>

    <script>
        const canvas = document.getElementById('plotCanvas');
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const margin = 50;
        
        let xMin = ${xMin};
        let xMax = ${xMax};
        let yMin = ${yMin};
        let yMax = ${yMax};
        let isDragging = false;
        let lastX = 0;
        let lastY = 0;
        let pointInterval = ${pointInterval};
        let selectedPoints = [];
        let hoveredPoint = null;
        
        const colors = {
            background: '${plotColors.background}',
            gridBackground: '${plotColors.gridBackground}',
            gridLines: '${plotColors.gridLines}',
            gridMainLines: '${plotColors.gridMainLines}',
            origin: '${plotColors.origin}',
            xInterceptColor: '${plotColors.xInterceptColor}',
            yInterceptColor: '${plotColors.yInterceptColor}',
            pointColor: '${plotColors.pointColor}',
            pointSelectColor: '${plotColors.pointSelectColor}'
        };
        
        // Function to find intercepts and grid points
        function findSpecialPoints() {
            const points = [];
            
            // X-intercept (y = 0)
            if (yMin <= 0 && yMax >= 0) {
                // Use a more stable numerical method for finding x-intercepts
                const step = (xMax - xMin) / 200; // More precise sampling
                let prevY = null;
                let prevX = null;
                
                for (let x = xMin; x <= xMax; x += step) {
                    try {
                        const y = math.evaluate('${expression}', { x: x });
                        
                        if (isFinite(y)) {
                            if (prevY !== null) {
                                // Check if we crossed y = 0 with more precision
                                if ((prevY <= 0 && y >= 0) || (prevY >= 0 && y <= 0)) {
                                    // Use linear interpolation for more accurate x-intercept
                                    const ratio = Math.abs(prevY) / (Math.abs(prevY) + Math.abs(y));
                                    const xIntercept = prevX + step * ratio;
                                    
                                    if (xIntercept >= xMin && xIntercept <= xMax) {
                                        // Check if we already have a similar intercept
                                        const exists = points.some(p => 
                                            p.type === 'x-intercept' && 
                                            Math.abs(p.x - xIntercept) < step
                                        );
                                        
                                        if (!exists) {
                                            points.push({
                                                x: xIntercept,
                                                y: 0,
                                                type: 'x-intercept',
                                                size: 8
                                            });
                                        }
                                    }
                                }
                            }
                            prevY = y;
                            prevX = x;
                        }
                    } catch (error) {
                        // Skip invalid points
                    }
                }
                
                // Also try direct solve for simple cases (but with better error handling)
                try {
                    const xIntercept = math.solve('${expression} = 0', 'x');
                    if (Array.isArray(xIntercept)) {
                        xIntercept.forEach(x => {
                            if (x >= xMin && x <= xMax && isFinite(x)) {
                                // Check if we already have this point
                                const exists = points.some(p => 
                                    p.type === 'x-intercept' && 
                                    Math.abs(p.x - x) < 0.1
                                );
                                if (!exists) {
                                    points.push({
                                        x: x,
                                        y: 0,
                                        type: 'x-intercept',
                                        size: 8
                                    });
                                }
                            }
                        });
                    } else if (isFinite(xIntercept) && xIntercept >= xMin && xIntercept <= xMax) {
                        const exists = points.some(p => 
                            p.type === 'x-intercept' && 
                            Math.abs(p.x - xIntercept) < 0.1
                        );
                        if (!exists) {
                            points.push({
                                x: xIntercept,
                                y: 0,
                                type: 'x-intercept',
                                size: 8
                            });
                        }
                    }
                } catch (error) {
                    // No x-intercept found via solve - that's okay, we have numerical method
                }
            }
            
            // Y-intercept (x = 0)
            if (xMin <= 0 && xMax >= 0) {
                try {
                    const yIntercept = math.evaluate('${expression}', { x: 0 });
                    if (isFinite(yIntercept) && yIntercept >= yMin && yIntercept <= yMax) {
                        points.push({
                            x: 0,
                            y: yIntercept,
                            type: 'y-intercept',
                            size: 8
                        });
                    }
                } catch (error) {
                    // No y-intercept found
                }
            }
            
            // Grid points if interval is specified
            if (pointInterval > 0) {
                const xRange = xMax - xMin;
                const yRange = yMax - yMin;
                const stepX = pointInterval;
                const stepY = pointInterval;
                
                for (let x = Math.ceil(xMin / stepX) * stepX; x <= xMax; x += stepX) {
                    try {
                        const y = math.evaluate('${expression}', { x: x });
                        if (isFinite(y) && y >= yMin && y <= yMax) {
                            points.push({
                                x: x,
                                y: y,
                                type: 'grid-point',
                                size: 4
                            });
                        }
                    } catch (error) {
                        // Skip invalid points
                    }
                }
            }
            
            return points;
        }
        
        // Function to draw points
        function drawPoints() {
            const points = findSpecialPoints();
            
            // Sort points by size (largest first) to prevent overlap issues
            points.sort((a, b) => b.size - a.size);
            
            // Filter out smaller points that are too close to larger points
            const filteredPoints = [];
            const overlapThreshold = 5; // pixels
            
            for (let point of points) {
                let shouldAdd = true;
                
                // Check if this point is too close to any larger point we've already added
                for (let existingPoint of filteredPoints) {
                    if (existingPoint.size > point.size) {
                        const existingCanvas = mathToCanvas(existingPoint.x, existingPoint.y);
                        const currentCanvas = mathToCanvas(point.x, point.y);
                        const distance = Math.sqrt(
                            Math.pow(existingCanvas.x - currentCanvas.x, 2) + 
                            Math.pow(existingCanvas.y - currentCanvas.y, 2)
                        );
                        
                        if (distance < overlapThreshold) {
                            shouldAdd = false;
                            break;
                        }
                    }
                }
                
                if (shouldAdd) {
                    filteredPoints.push(point);
                }
            }
            
            filteredPoints.forEach(point => {
                const canvasPos = mathToCanvas(point.x, point.y);
                const isSelected = selectedPoints.some(p => p.x === point.x && p.y === point.y);
                const isHovered = hoveredPoint && hoveredPoint.x === point.x && hoveredPoint.y === point.y;
                
                ctx.beginPath();
                ctx.arc(canvasPos.x, canvasPos.y, point.size, 0, 2 * Math.PI);
                
                if (isSelected) {
                    ctx.fillStyle = colors.pointSelectColor;
                    ctx.strokeStyle = colors.pointSelectColor;
                    ctx.lineWidth = 2;
                } else if (isHovered) {
                    ctx.fillStyle = '#ffff00';
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = 2;
                } else {
                    // Use different colors for different point types
                    if (point.type === 'x-intercept') {
                        ctx.fillStyle = colors.xInterceptColor;
                    } else if (point.type === 'y-intercept') {
                        ctx.fillStyle = colors.yInterceptColor;
                    } else {
                        ctx.fillStyle = colors.pointColor;
                    }
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = 1;
                }
                
                ctx.fill();
                ctx.stroke();
                
                // Draw label for selected points
                if (isSelected) {
                    ctx.fillStyle = colors.pointSelectColor;
                    ctx.font = '12px Arial';
                    ctx.textAlign = 'center';
                    
                    let label = '';
                    if (point.type === 'x-intercept') {
                        label = 'X-intercept: (' + point.x.toFixed(2) + ', ' + point.y.toFixed(2) + ')';
                    } else if (point.type === 'y-intercept') {
                        label = 'Y-intercept: (' + point.x.toFixed(2) + ', ' + point.y.toFixed(2) + ')';
                    } else {
                        label = '(' + point.x.toFixed(2) + ', ' + point.y.toFixed(2) + ')';
                    }
                    
                    ctx.fillText(label, canvasPos.x, canvasPos.y - 15);
                }
            });
        }
        
        function drawGrid() {
            ctx.strokeStyle = colors.gridLines;
            ctx.lineWidth = 1;
            
            // Calculate grid spacing based on current view
            const xRange = xMax - xMin;
            const yRange = yMax - yMin;
            const gridSpacingX = xRange / 10;
            const gridSpacingY = yRange / 10;
            
            // Find the first grid line position
            const firstGridX = Math.ceil(xMin / gridSpacingX) * gridSpacingX;
            const firstGridY = Math.ceil(yMin / gridSpacingY) * gridSpacingY;
            
            // Vertical grid lines
            for (let i = 0; i <= 10; i++) {
                const gridX = firstGridX + i * gridSpacingX;
                if (gridX <= xMax) {
                    const canvasX = margin + (gridX - xMin) / (xMax - xMin) * (width - 2 * margin);
                    
                    // Use main line color for x=0, grid color for others
                    if (Math.abs(gridX) < 0.001) {
                        ctx.strokeStyle = colors.gridMainLines;
                        ctx.lineWidth = 2;
                    } else {
                        ctx.strokeStyle = colors.gridLines;
                        ctx.lineWidth = 1;
                    }
                    
                    ctx.beginPath();
                    ctx.moveTo(canvasX, margin);
                    ctx.lineTo(canvasX, height - margin);
                    ctx.stroke();
                }
            }
            
            // Horizontal grid lines
            for (let i = 0; i <= 10; i++) {
                const gridY = firstGridY + i * gridSpacingY;
                if (gridY <= yMax) {
                    const canvasY = margin + (yMax - gridY) / (yMax - yMin) * (height - 2 * margin);
                    
                    // Use main line color for y=0, grid color for others
                    if (Math.abs(gridY) < 0.001) {
                        ctx.strokeStyle = colors.gridMainLines;
                        ctx.lineWidth = 2;
                    } else {
                        ctx.strokeStyle = colors.gridLines;
                        ctx.lineWidth = 1;
                    }
                    
                    ctx.beginPath();
                    ctx.moveTo(margin, canvasY);
                    ctx.lineTo(width - margin, canvasY);
                    ctx.stroke();
                }
            }
        }
        
        function drawAxes() {
            ctx.strokeStyle = colors.gridMainLines;
            ctx.lineWidth = 2;
            
            // X-axis (y = 0)
            if (yMin <= 0 && yMax >= 0) {
                const xAxisY = margin + (yMax - 0) / (yMax - yMin) * (height - 2 * margin);
                ctx.beginPath();
                ctx.moveTo(margin, xAxisY);
                ctx.lineTo(width - margin, xAxisY);
                ctx.stroke();
            }
            
            // Y-axis (x = 0)
            if (xMin <= 0 && xMax >= 0) {
                const yAxisX = margin + (0 - xMin) / (xMax - xMin) * (width - 2 * margin);
                ctx.beginPath();
                ctx.moveTo(yAxisX, margin);
                ctx.lineTo(yAxisX, height - margin);
                ctx.stroke();
            }
            
            // Draw origin point if visible
            if (xMin <= 0 && xMax >= 0 && yMin <= 0 && yMax >= 0) {
                const originX = margin + (0 - xMin) / (xMax - xMin) * (width - 2 * margin);
                const originY = margin + (yMax - 0) / (yMax - yMin) * (height - 2 * margin);
                
                ctx.beginPath();
                ctx.arc(originX, originY, 4, 0, 2 * Math.PI);
                ctx.fillStyle = colors.origin;
                ctx.strokeStyle = colors.gridMainLines;
                ctx.lineWidth = 1;
                ctx.fill();
                ctx.stroke();
            }
        }
        
        function drawLabels() {
            ctx.fillStyle = colors.gridMainLines;
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            
            // Calculate label spacing based on current view
            const xRange = xMax - xMin;
            const yRange = yMax - yMin;
            const labelSpacingX = xRange / 5;
            const labelSpacingY = yRange / 5;
            
            // Find the first label position
            const firstLabelX = Math.ceil(xMin / labelSpacingX) * labelSpacingX;
            const firstLabelY = Math.ceil(yMin / labelSpacingY) * labelSpacingY;
            
            // X-axis labels
            for (let i = 0; i <= 5; i++) {
                const labelX = firstLabelX + i * labelSpacingX;
                if (labelX <= xMax) {
                    const canvasX = margin + (labelX - xMin) / (xMax - xMin) * (width - 2 * margin);
                    ctx.fillText(labelX.toFixed(1), canvasX, height - margin + 20);
                }
            }
            
            // Y-axis labels
            ctx.textAlign = 'right';
            for (let i = 0; i <= 5; i++) {
                const labelY = firstLabelY + i * labelSpacingY;
                if (labelY <= yMax) {
                    const canvasY = margin + (yMax - labelY) / (yMax - yMin) * (height - 2 * margin);
                    ctx.fillText(labelY.toFixed(1), margin - 10, canvasY + 4);
                }
            }
        }
        
        function drawFunction() {
            ctx.strokeStyle = colors.xInterceptColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            let firstPoint = true;
            const step = (xMax - xMin) / (width - 2 * margin);
            
            for (let i = 0; i < width - 2 * margin; i++) {
                const x = xMin + i * step;
                try {
                    const y = math.evaluate('${expression}', { x: x });
                    
                    if (isFinite(y)) {
                        const canvasX = margin + i;
                        const canvasY = margin + ((yMax - y) / (yMax - yMin)) * (height - 2 * margin);
                        
                        // Only draw points that are within the visible plotting area
                        if (canvasY >= margin && canvasY <= height - margin) {
                            if (firstPoint) {
                                ctx.moveTo(canvasX, canvasY);
                                firstPoint = false;
                            } else {
                                ctx.lineTo(canvasX, canvasY);
                            }
                        } else {
                            // If point is outside plotting area, start a new path
                            firstPoint = true;
                        }
                    }
                } catch (error) {
                    // Skip invalid points
                }
            }
            
            ctx.stroke();
        }
        
        function drawPlot() {
            // Clear canvas
            ctx.fillStyle = colors.background;
            ctx.fillRect(0, 0, width, height);
            
            drawGrid();
            drawAxes();
            drawFunction();
            drawPoints(); // Draw points after function
            drawLabels();
        }
        
        function canvasToMath(x, y) {
            const mathX = xMin + (x - margin) / (width - 2 * margin) * (xMax - xMin);
            const mathY = yMax - (y - margin) / (height - 2 * margin) * (yMax - yMin);
            return { x: mathX, y: mathY };
        }
        
        function mathToCanvas(x, y) {
            const canvasX = margin + (x - xMin) / (xMax - xMin) * (width - 2 * margin);
            const canvasY = margin + (yMax - y) / (yMax - yMin) * (height - 2 * margin);
            return { x: canvasX, y: canvasY };
        }
        
        function updatePlot() {
            xMin = parseFloat(document.getElementById('xMin').value);
            xMax = parseFloat(document.getElementById('xMax').value);
            yMin = parseFloat(document.getElementById('yMin').value);
            yMax = parseFloat(document.getElementById('yMax').value);
            pointInterval = parseFloat(document.getElementById('pointInterval').value);
            
            // Preserve selected points by finding them in the new plot
            const oldSelectedPoints = [...selectedPoints];
            selectedPoints = [];
            
            const currentPoints = findSpecialPoints();
            oldSelectedPoints.forEach(oldPoint => {
                // Find matching point in new plot
                const matchingPoint = currentPoints.find(p => 
                    p.type === oldPoint.type && 
                    Math.abs(p.x - oldPoint.x) < 0.01 && 
                    Math.abs(p.y - oldPoint.y) < 0.01
                );
                if (matchingPoint) {
                    selectedPoints.push(matchingPoint);
                }
            });
            
            drawPlot();
        }
        
        function resetZoom() {
            xMin = ${xMin};
            xMax = ${xMax};
            yMin = ${yMin};
            yMax = ${yMax};
            document.getElementById('xMin').value = xMin;
            document.getElementById('xMax').value = xMax;
            document.getElementById('yMin').value = yMin;
            document.getElementById('yMax').value = yMax;
            
            // Clear selected points on reset
            selectedPoints = [];
            
            drawPlot();
        }
        
        // Function to check if point is near mouse
        function findNearbyPoint(mouseX, mouseY) {
            const points = findSpecialPoints();
            const threshold = 10; // pixels
            
            for (let point of points) {
                const canvasPos = mathToCanvas(point.x, point.y);
                const distance = Math.sqrt((mouseX - canvasPos.x) ** 2 + (mouseY - canvasPos.y) ** 2);
                if (distance <= threshold) {
                    return point;
                }
            }
            return null;
        }
        
        // Mouse event handlers
        canvas.addEventListener('mousedown', (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Check for point selection
            const nearbyPoint = findNearbyPoint(x, y);
            if (nearbyPoint) {
                const pointKey = nearbyPoint.x + ',' + nearbyPoint.y;
                const existingIndex = selectedPoints.findIndex(p => p.x + ',' + p.y === pointKey);
                
                if (existingIndex >= 0) {
                    // Deselect only this specific point
                    selectedPoints.splice(existingIndex, 1);
                } else {
                    // Select point (don't deselect others)
                    selectedPoints.push(nearbyPoint);
                }
                drawPlot();
                return;
            }
            
            // Start panning
            isDragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
        });
        
        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            if (x >= margin && x <= width - margin && y >= margin && y <= height - margin) {
                const coords = canvasToMath(x, y);
                document.getElementById('coordinates').textContent = 
                    'x = ' + coords.x.toFixed(3) + ', y = ' + coords.y.toFixed(3);
            }
            
            // Check for point hovering
            const nearbyPoint = findNearbyPoint(x, y);
            if (nearbyPoint !== hoveredPoint) {
                hoveredPoint = nearbyPoint;
                drawPlot();
            }
            
            if (isDragging) {
                const deltaX = e.clientX - lastX;
                const deltaY = e.clientY - lastY;
                
                const rangeX = xMax - xMin;
                const rangeY = yMax - yMin;
                
                const moveX = -deltaX / (width - 2 * margin) * rangeX;
                const moveY = deltaY / (height - 2 * margin) * rangeY;
                
                xMin += moveX;
                xMax += moveX;
                yMin += moveY;
                yMax += moveY;
                
                document.getElementById('xMin').value = xMin.toFixed(2);
                document.getElementById('xMax').value = xMax.toFixed(2);
                document.getElementById('yMin').value = yMin.toFixed(2);
                document.getElementById('yMax').value = yMax.toFixed(2);
                
                // Preserve selected points during pan
                const oldSelectedPoints = [...selectedPoints];
                selectedPoints = [];
                
                const currentPoints = findSpecialPoints();
                oldSelectedPoints.forEach(oldPoint => {
                    const matchingPoint = currentPoints.find(p => 
                        p.type === oldPoint.type && 
                        Math.abs(p.x - oldPoint.x) < 0.01 && 
                        Math.abs(p.y - oldPoint.y) < 0.01
                    );
                    if (matchingPoint) {
                        selectedPoints.push(matchingPoint);
                    }
                });
                
                drawPlot();
                
                lastX = e.clientX;
                lastY = e.clientY;
            }
        });
        
        canvas.addEventListener('mouseup', () => {
            isDragging = false;
        });
        
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            if (mouseX >= margin && mouseX <= width - margin && 
                mouseY >= margin && mouseY <= height - margin) {
                
                const mouseCoords = canvasToMath(mouseX, mouseY);
                const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
                
                const newRangeX = (xMax - xMin) * zoomFactor;
                const newRangeY = (yMax - yMin) * zoomFactor;
                
                xMin = mouseCoords.x - (mouseCoords.x - xMin) * zoomFactor;
                xMax = xMin + newRangeX;
                yMin = mouseCoords.y - (mouseCoords.y - yMin) * zoomFactor;
                yMax = yMin + newRangeY;
                
                document.getElementById('xMin').value = xMin.toFixed(2);
                document.getElementById('xMax').value = xMax.toFixed(2);
                document.getElementById('yMin').value = yMin.toFixed(2);
                document.getElementById('yMax').value = yMax.toFixed(2);
                
                // Preserve selected points during zoom
                const oldSelectedPoints = [...selectedPoints];
                selectedPoints = [];
                
                const currentPoints = findSpecialPoints();
                oldSelectedPoints.forEach(oldPoint => {
                    const matchingPoint = currentPoints.find(p => 
                        p.type === oldPoint.type && 
                        Math.abs(p.x - oldPoint.x) < 0.01 && 
                        Math.abs(p.y - oldPoint.y) < 0.01
                    );
                    if (matchingPoint) {
                        selectedPoints.push(matchingPoint);
                    }
                });
                
                drawPlot();
            }
        });
        
        // Initial draw
        drawPlot();
    </script>
</body>
</html>`;

  return html;
}

// Function to create high-resolution plot
function createHighResPlot(expression, xMin, xMax, yMin, yMax, width = 800, height = 600, colors = null) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  // Use default colors if none provided
  const defaultColors = {
    background: '#ffffff',
    grid: '#f0f0f0',
    axes: '#000000',
    function: '#ff0000',
    labels: '#000000'
  };
  
  // Map colors from prompt to static PNG color names
  const plotColors = colors ? {
    background: colors.background,
    grid: colors.gridLines,
    axes: colors.gridMainLines,
    function: colors.xInterceptColor,
    labels: colors.gridMainLines
  } : defaultColors;
  
  // Set background
  ctx.fillStyle = plotColors.background;
  ctx.fillRect(0, 0, width, height);
  
  // Calculate margins for axes
  const margin = 50;
  const plotWidth = width - 2 * margin;
  const plotHeight = height - 2 * margin;
  
  // Draw grid
  ctx.strokeStyle = plotColors.grid;
  ctx.lineWidth = 1;
  
  // Vertical grid lines
  for (let i = 0; i <= 10; i++) {
    const x = margin + (i / 10) * plotWidth;
    ctx.beginPath();
    ctx.moveTo(x, margin);
    ctx.lineTo(x, height - margin);
    ctx.stroke();
  }
  
  // Horizontal grid lines
  for (let i = 0; i <= 10; i++) {
    const y = margin + (i / 10) * plotHeight;
    ctx.beginPath();
    ctx.moveTo(margin, y);
    ctx.lineTo(width - margin, y);
    ctx.stroke();
  }
  
  // Draw axes
  ctx.strokeStyle = plotColors.axes;
  ctx.lineWidth = 2;
  
  // X-axis
  const xAxisY = margin + (yMax / (yMax - yMin)) * plotHeight;
  ctx.beginPath();
  ctx.moveTo(margin, xAxisY);
  ctx.lineTo(width - margin, xAxisY);
  ctx.stroke();
  
  // Y-axis
  const yAxisX = margin + (-xMin / (xMax - xMin)) * plotWidth;
  ctx.beginPath();
  ctx.moveTo(yAxisX, margin);
  ctx.lineTo(yAxisX, height - margin);
  ctx.stroke();
  
  // Plot the function
  ctx.strokeStyle = plotColors.function;
  ctx.lineWidth = 2;
  ctx.beginPath();
  
  let firstPoint = true;
  const step = (xMax - xMin) / plotWidth;
  
  for (let i = 0; i < plotWidth; i++) {
    const x = xMin + i * step;
    try {
      const y = math.evaluate(expression, { x: x });
      
      if (isFinite(y) && y >= yMin && y <= yMax) {
        const canvasX = margin + i;
        const canvasY = margin + ((yMax - y) / (yMax - yMin)) * plotHeight;
        
        if (firstPoint) {
          ctx.moveTo(canvasX, canvasY);
          firstPoint = false;
        } else {
          ctx.lineTo(canvasX, canvasY);
        }
      }
    } catch (error) {
      // Skip invalid points
    }
  }
  
  ctx.stroke();
  
  // Add labels
  ctx.fillStyle = plotColors.labels;
  ctx.font = '14px Arial';
  ctx.textAlign = 'center';
  
  // X-axis labels
  for (let i = 0; i <= 5; i++) {
    const x = margin + (i / 5) * plotWidth;
    const value = xMin + (i / 5) * (xMax - xMin);
    ctx.fillText(value.toFixed(1), x, height - margin + 20);
  }
  
  // Y-axis labels
  ctx.textAlign = 'right';
  for (let i = 0; i <= 5; i++) {
    const y = margin + (i / 5) * plotHeight;
    const value = yMax - (i / 5) * (yMax - yMin);
    ctx.fillText(value.toFixed(1), margin - 10, y + 5);
  }
  
  // Add title
  ctx.textAlign = 'center';
  ctx.font = 'bold 16px Arial';
  ctx.fillText(`f(x) = ${expression}`, width / 2, 25);
  
  // Draw origin point if visible
  if (xMin <= 0 && xMax >= 0 && yMin <= 0 && yMax >= 0) {
    const originX = margin + (-xMin / (xMax - xMin)) * plotWidth;
    const originY = margin + (yMax / (yMax - yMin)) * plotHeight;
    
    ctx.beginPath();
    ctx.arc(originX, originY, 4, 0, 2 * Math.PI);
    ctx.fillStyle = colors ? colors.origin : '#ffff00';
    ctx.strokeStyle = plotColors.axes;
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
  }
  
  // Find and draw intercepts
  const intercepts = findIntercepts(expression, xMin, xMax, yMin, yMax);
  
  // Draw x-intercepts with coordinates
  const drawnLabels = []; // Track drawn labels to avoid overlap
  
  intercepts.xIntercepts.forEach((point, index) => {
    const canvasX = margin + ((point.x - xMin) / (xMax - xMin)) * plotWidth;
    const canvasY = margin + ((yMax - point.y) / (yMax - yMin)) * plotHeight;
    
    ctx.beginPath();
    ctx.arc(canvasX, canvasY, 6, 0, 2 * Math.PI);
    ctx.fillStyle = colors ? colors.xInterceptColor : '#ff0000';
    ctx.strokeStyle = plotColors.axes;
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
    
    // Skip if this is the origin (will be handled by y-intercepts)
    if (Math.abs(point.x) < 0.01 && Math.abs(point.y) < 0.01) {
      return;
    }
    
    // Draw coordinate label with closer positioning and arrows
    ctx.fillStyle = plotColors.labels;
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    const label = `(${point.x.toFixed(2)}, ${point.y.toFixed(2)})`;
    
    // Find position that doesn't overlap with existing labels
    let labelY = canvasY - 15;
    let labelX = canvasX;
    let attempts = 0;
    const maxAttempts = 8;
    
    while (attempts < maxAttempts) {
      let hasCollision = false;
      
      // Check collision with existing labels
      for (let existingLabel of drawnLabels) {
        const distance = Math.sqrt(
          Math.pow(labelX - existingLabel.x, 2) + 
          Math.pow(labelY - existingLabel.y, 2)
        );
        if (distance < 45) { // Final balanced spacing
          hasCollision = true;
          break;
        }
      }
      
      if (!hasCollision) {
        break;
      }
      
      // Try different positions with smart alternation
      attempts++;
      if (attempts === 1) labelY = canvasY + 20; // Below
      else if (attempts === 2) labelX = canvasX - 20; // Left
      else if (attempts === 3) labelX = canvasX + 20; // Right
      else if (attempts === 4) labelY = canvasY - 20; // Further above
      else if (attempts === 5) labelY = canvasY + 20; // Further below
      else if (attempts === 6) labelX = canvasX - 30; // Medium left
      else if (attempts === 7) labelX = canvasX + 30; // Medium right
      else break; // Give up if too many attempts
    }
    
    // Always draw the label, even if we couldn't find a perfect position
    // Add white background for better readability
    const textMetrics = ctx.measureText(label);
    const padding = 4;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fillRect(
      labelX - textMetrics.width/2 - padding,
      labelY - 12 - padding,
      textMetrics.width + 2*padding,
      16 + 2*padding
    );
    
    // Draw text
    ctx.fillStyle = plotColors.labels;
    ctx.fillText(label, labelX, labelY);
    
    // Draw arrow pointing to the edge of the circle (not through it)
    ctx.strokeStyle = plotColors.labels;
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    // Calculate direction from label to point
    const dx = canvasX - labelX;
    const dy = canvasY - labelY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 0) {
      // Normalize direction vector
      const dirX = dx / distance;
      const dirY = dy / distance;
      
      // Calculate point on circle edge (radius = 6)
      const edgeX = canvasX - dirX * 6;
      const edgeY = canvasY - dirY * 6;
      
      // Draw arrow from label to circle edge
      ctx.moveTo(labelX, labelY + 8);
      ctx.lineTo(edgeX, edgeY);
      ctx.stroke();
    }
    
    // Track this label
    drawnLabels.push({ x: labelX, y: labelY });
  });
  
  // Draw y-intercepts with coordinates
  intercepts.yIntercepts.forEach((point, index) => {
    const canvasX = margin + ((point.x - xMin) / (xMax - xMin)) * plotWidth;
    const canvasY = margin + ((yMax - point.y) / (yMax - yMin)) * plotHeight;
    
    ctx.beginPath();
    ctx.arc(canvasX, canvasY, 6, 0, 2 * Math.PI);
    ctx.fillStyle = colors ? colors.yInterceptColor : '#ff0000';
    ctx.strokeStyle = plotColors.axes;
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
    
    // Draw coordinate label with closer positioning and arrows
    ctx.fillStyle = plotColors.labels;
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    const label = `(${point.x.toFixed(2)}, ${point.y.toFixed(2)})`;
    
    // Find position that doesn't overlap with existing labels
    let labelY = canvasY - 15;
    let labelX = canvasX;
    let attempts = 0;
    const maxAttempts = 8;
    
    while (attempts < maxAttempts) {
      let hasCollision = false;
      
      // Check collision with existing labels
      for (let existingLabel of drawnLabels) {
        const distance = Math.sqrt(
          Math.pow(labelX - existingLabel.x, 2) + 
          Math.pow(labelY - existingLabel.y, 2)
        );
        if (distance < 45) { // Final balanced spacing
          hasCollision = true;
          break;
        }
      }
      
      if (!hasCollision) {
        break;
      }
      
      // Try different positions with smart alternation
      attempts++;
      if (attempts === 1) labelY = canvasY + 20; // Below
      else if (attempts === 2) labelX = canvasX - 20; // Left
      else if (attempts === 3) labelX = canvasX + 20; // Right
      else if (attempts === 4) labelY = canvasY - 20; // Further above
      else if (attempts === 5) labelY = canvasY + 20; // Further below
      else if (attempts === 6) labelX = canvasX - 30; // Medium left
      else if (attempts === 7) labelX = canvasX + 30; // Medium right
      else break; // Give up if too many attempts
    }
    
    // Always draw the label, even if we couldn't find a perfect position
    // Add white background for better readability
    const textMetrics = ctx.measureText(label);
    const padding = 4;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fillRect(
      labelX - textMetrics.width/2 - padding,
      labelY - 12 - padding,
      textMetrics.width + 2*padding,
      16 + 2*padding
    );
    
    // Draw text
    ctx.fillStyle = plotColors.labels;
    ctx.fillText(label, labelX, labelY);
    
    // Draw arrow pointing to the edge of the circle (not through it)
    ctx.strokeStyle = plotColors.labels;
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    // Calculate direction from label to point
    const dx = canvasX - labelX;
    const dy = canvasY - labelY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 0) {
      // Normalize direction vector
      const dirX = dx / distance;
      const dirY = dy / distance;
      
      // Calculate point on circle edge (radius = 6)
      const edgeX = canvasX - dirX * 6;
      const edgeY = canvasY - dirY * 6;
      
      // Draw arrow from label to circle edge
      ctx.moveTo(labelX, labelY + 8);
      ctx.lineTo(edgeX, edgeY);
      ctx.stroke();
    }
    
    // Track this label
    drawnLabels.push({ x: labelX, y: labelY });
  });
  
  return canvas;
}

// Function to save plot to file
function savePlot(canvas, filename) {
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(filename, buffer);
  console.log(`Plot saved as: ${filename}`);
}

program
  .name('graph')
  .version(pkg.version)
  .description('Package that graphs math expressions');

program
  .command('plot')
  .description('Plot a math expression')
  .argument('<expression>', 'Math expression to graph')
  .option('-x, --xmin <number>', 'Minimum x value', '-10')
  .option('-X, --xmax <number>', 'Maximum x value', '10')
  .option('-y, --ymin <number>', 'Minimum y value', '-10')
  .option('-Y, --ymax <number>', 'Maximum y value', '10')
  .option('-w, --width <number>', 'Plot width in pixels/characters', '800')
  .option('-h, --height <number>', 'Plot height in pixels/characters', '600')
  .option('-o, --output <filename>', 'Output filename', 'plot.png')
  .option('-d, --default', 'Use default colors without prompting')
  .option('-i, --interactive', 'Create interactive HTML plot')
  .option('-p, --points <number>', 'Point interval for selectable points (default: none)', '0')
  .option('-a, --ascii', 'Create ASCII plot for terminal output')
  .action((expression, options) => {
    const plotType = options.interactive ? 'interactive HTML' : options.ascii ? 'ASCII terminal' : 'high-resolution';
    console.log(`\nCreating ${plotType} plot: ${expression}`);
    console.log(`X range: ${options.xmin} to ${options.xmax}`);
    console.log(`Y range: ${options.ymin} to ${options.ymax}`);
    if (!options.interactive && !options.ascii) {
      console.log(`Resolution: ${options.width}x${options.height} pixels`);
    } else if (options.ascii) {
      console.log(`ASCII resolution: ${options.width}x${options.height} characters`);
    }
    
    let colors = null;
    
    // Prompt for colors unless --default flag is used or ASCII mode (which doesn't use colors)
    if (!options.default && !options.ascii) {
      const plotType = options.interactive ? 'interactive' : 'static';
      colors = promptForColors(plotType);
    }
    
    console.log('\n');
    
    try {
      if (options.interactive) {
        // Create interactive HTML
        const html = createInteractiveHTML(
          expression,
          parseFloat(options.xmin),
          parseFloat(options.xmax),
          parseFloat(options.ymin),
          parseFloat(options.ymax),
          colors,
          options // Pass options to createInteractiveHTML
        );
        
        const filename = options.output.replace(/\.png$/, '.htm');
        fs.writeFileSync(filename, html);
        console.log(`Interactive HTML plot saved as: ${filename}`);
        console.log(`\nOpen ${filename} in your web browser to view the interactive plot!`);
      } else if (options.ascii) {
        // Create ASCII plot
        const asciiPlot = createAsciiPlot(
          expression,
          parseFloat(options.xmin),
          parseFloat(options.xmax),
          parseFloat(options.ymin),
          parseFloat(options.ymax),
          parseInt(options.width), // Use width for ASCII resolution
          parseInt(options.height) // Use height for ASCII resolution
        );
        console.log(`ASCII plot for terminal output:`);
        console.log(asciiPlot);
      } else {
        // Create static PNG
        const canvas = createHighResPlot(
          expression,
          parseFloat(options.xmin),
          parseFloat(options.xmax),
          parseFloat(options.ymin),
          parseFloat(options.ymax),
          parseInt(options.width),
          parseInt(options.height),
          colors
        );
        
        savePlot(canvas, options.output);
        console.log(`\nExpression: ${expression}`);
        console.log(`\nTo view the plot, open: ${options.output}`);
      }
    } catch (error) {
      console.error('Error plotting expression:', error.message);
    }
  });

program.parse(process.argv);