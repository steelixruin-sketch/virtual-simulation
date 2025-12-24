// --- 1. 配置和数据结构 ---
const INITIAL_POPULATION_TARGET = 80;
const MOVEMENT_INTERVAL = 1000; 
const MAX_MOVEMENT = 15; 

const MIN_SURVIVORS_TARGET = 20;
const RESULT_DISPLAY_DELAY = 4000; 

const DEFAULT_BREED_FACTOR = 4.0; 
const DEFAULT_MUTATION_RATE = 1 / 3; 
const MUTATION_RANGE = 2; 

const BASE_CATCH_WEIGHT = 0.5; 
const WEIGHT_SCALING_FACTOR = 100; 

const COLOR_MAP_35 = {
    '1': '#D93131', '2': '#E64A4A', '3': '#B82828', '4': '#FF5C5C', '5': '#cc5151', 
    '6': '#D98C8C', '7': '#E0A0A0', 
    '8': '#FF9900', '9': '#FFC033', '10': '#ffcc00', 
    '11': '#ffcc33', '12': '#ffff00', '13': '#ffcc00', '14': '#b3b300', 
    '15': '#38761d', '16': '#2D6317', '17': '#265513', '18': '#1F450E', 
    '19': '#5CB85C', '20': '#50A850', '21': '#469A46', 
    '22': '#0033CC', '23': '#002DAA', '24': '#002788', '25': '#0099ff', 
    '26': '#33ccff', '27': '#66ccff', '28': '#99ccff', 
    '29': '#333333', '30': '#3d3d3d', '31': '#666666', '32': '#999999', 
    '33': '#cccccc', '34': '#e6e6e6', '35': '#f2f2f2' 
};

const TRACKED_COLORS = ['15', '1', '10', '22', '29']; 

let currentGeneration = 1;
let currentPopulationData = []; 
let statsHistory = []; 
let eliminationMode = null; 
let chartInstance = null; 
let movementTimer = null; 
let autoEliminationTimer = null; 
let nextGenerationConfig = null; 

// --- 2. 颜色和适应度函数 ---

function hexToRgb(hex) {
    let base = hex.startsWith('#') ? hex.substring(1) : hex;
    if (base.length === 3) {
        base = base[0] + base[0] + base[1] + base[1] + base[2] + base[2];
    }
    const r = parseInt(base.substring(0, 2), 16);
    const g = parseInt(base.substring(2, 4), 16);
    const b = parseInt(base.substring(4, 6), 16);
    return { r, g, b };
}

function getEnvironmentRGB() {
    const envColor = document.getElementById('envColor').value;
    return hexToRgb(envColor);
}

function getColorRGB(code) {
    let hex = COLOR_MAP_35[code] || COLOR_MAP_35['15']; 
    return hexToRgb(hex);
}

function calculateColorDifference(organismColorCode) {
    const envRGB = getEnvironmentRGB();
    const organismRGB = getColorRGB(organismColorCode);

    const diff = Math.sqrt(
        Math.pow(organismRGB.r - envRGB.r, 2) +
        Math.pow(organismRGB.g - envRGB.g, 2) +
        Math.pow(organismRGB.b - envRGB.b, 2)
    );
    return diff;
}

function calculateCaptureWeight(organismColorCode) {
    const deltaE = calculateColorDifference(organismColorCode);
    return BASE_CATCH_WEIGHT + deltaE; 
}

function getColorFamilyID(code) {
    const num = parseInt(code);
    if (num >= 1 && num <= 7) return 1;
    if (num >= 8 && num <= 21) return 2;
    if (num >= 22 && num <= 28) return 3;
    if (num >= 29 && num <= 35) return 4;
    return 0; 
}

function getMutatedColorCode(parentCode) {
    const parentNum = parseInt(parentCode);
    const maxCode = 35;
    
    const allowCrossMutation = document.getElementById('allowCrossMutation').checked;
    const parentFamilyID = getColorFamilyID(parentNum);

    let potentialTargets = [];
    
    for (let i = -MUTATION_RANGE; i <= MUTATION_RANGE; i++) {
        if (i === 0) continue; 
        
        let targetNum = parentNum + i;
        
        if (targetNum > maxCode) {
            targetNum -= maxCode;
        } else if (targetNum < 1) {
            targetNum += maxCode;
        }
        
        if (!allowCrossMutation) {
            const targetFamilyID = getColorFamilyID(targetNum);
            if (targetFamilyID !== parentFamilyID) {
                continue; 
            }
        }
        
        potentialTargets.push(targetNum.toString());
    }

    if (potentialTargets.length === 0) {
        return parentCode;
    }

    let weightedTargets = [];
    let totalWeight = 0;

    potentialTargets.forEach(targetCode => {
        const targetNum = parseInt(targetCode);
        
        let diff = Math.abs(parentNum - targetNum);
        
        if (diff > maxCode / 2) {
             diff = maxCode - diff;
        }
        
        const distance = Math.max(1, diff); 
        
        const weight = 1 / Math.log10(distance + 1.1);
        
        weightedTargets.push({ code: targetCode, weight: weight });
        totalWeight += weight;
    });

    if (totalWeight === 0) return parentCode;
    
    let randomTarget = Math.random() * totalWeight;
    let cumulativeWeight = 0;
    
    for (const target of weightedTargets) {
        cumulativeWeight += target.weight;
        if (randomTarget <= cumulativeWeight) {
            return target.code;
        }
    }
    
    return parentCode; 
}

// --- 3. 初始化和渲染 ---

function validatePopulationInput() {
    const inputs = document.querySelectorAll('#color-palette input.color-input');
    const config = {};
    let totalCount = 0;

    inputs.forEach(input => {
        const code = input.dataset.colorCode;
        const count = parseInt(input.value) || 0;

        if (count < 0) {
            return false;
        }
        if (count > 0) {
            config[code] = count;
            totalCount += count;
        }
    });

    if (totalCount !== INITIAL_POPULATION_TARGET) {
        alert(`总数量必须是 ${INITIAL_POPULATION_TARGET}！当前总数是 ${totalCount}。`);
        return false;
    }
    
    document.getElementById('current-initial-pop-count').textContent = `${totalCount} / ${INITIAL_POPULATION_TARGET}`;
    document.getElementById('current-initial-pop-count').style.color = 'green';
    
    return config;
}

function initializePopulation(userConfig = null) {
    
    if (!userConfig && statsHistory.length === 0) {
        currentGeneration = 1;
        currentPopulationData = [];
        nextGenerationConfig = null; 
    }

    let initialConfig = {};
    
    if (userConfig) {
        initialConfig = userConfig;
        currentPopulationData = [];
        for (const code in initialConfig) {
            for (let i = 0; i < initialConfig[code]; i++) {
                currentPopulationData.push({
                    id: Math.random(),
                    colorCode: code,
                    eliminated: false,
                    isBeingCaptured: false,
                    x: null,
                    y: null
                });
            }
        }
    }
    
    const configToRender = currentGeneration > 1 ? nextGenerationConfig : (userConfig || null);

    renderColorPalette(configToRender); 
    resetModeSelection();
    
    if (movementTimer) clearInterval(movementTimer);
    if (autoEliminationTimer) clearInterval(autoEliminationTimer);
    
    if (statsHistory.length > 0 || userConfig) { 
        renderPopulation();
    } else {
        const area = document.getElementById('simulation-area');
        area.innerHTML = ''; 
        document.getElementById('currentPopulation').textContent = INITIAL_POPULATION_TARGET;
    }
    
    updateStatsDisplay(); 
    updateChart();
}

function renderColorPalette(counts = null) {
    const colorPalette = document.getElementById('color-palette');
    colorPalette.innerHTML = '';
    
    const all35ColorCodes = Object.keys(COLOR_MAP_35).sort((a, b) => parseInt(a) - parseInt(b));
    
    all35ColorCodes.forEach(code => {
        const countValue = counts && counts[code] ? counts[code] : 0; 

        const colorDiv = document.createElement('div');
        colorDiv.className = 'color-item';
        
        const boxDiv = document.createElement('div');
        boxDiv.className = 'color-box';
        boxDiv.style.backgroundColor = COLOR_MAP_35[code];
        boxDiv.textContent = code;
        
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'color-input';
        input.dataset.colorCode = code;
        input.value = countValue; 
        input.min = 0;
        input.max = INITIAL_POPULATION_TARGET;
        input.oninput = updateInitialPopCount; 

        colorDiv.appendChild(boxDiv);
        colorDiv.appendChild(input);
        colorPalette.appendChild(colorDiv);
    });
    
    updateInitialPopCount(); 
}

function updateInitialPopCount() {
    const inputs = document.querySelectorAll('#color-palette input.color-input');
    let totalCount = 0;

    inputs.forEach(input => {
        totalCount += parseInt(input.value) || 0;
    });

    const statusSpan = document.getElementById('current-initial-pop-count');
    statusSpan.textContent = `${totalCount} / ${INITIAL_POPULATION_TARGET}`;
    statusSpan.style.color = totalCount === INITIAL_POPULATION_TARGET ? 'green' : 'red';
}

function startOrganismMovement() {
    if (movementTimer) clearInterval(movementTimer);

    const area = document.getElementById('simulation-area');
    const areaRect = area.getBoundingClientRect();
    const width = areaRect.width;
    const height = areaRect.height;
    const organismSize = 15; 

    movementTimer = setInterval(() => {
        const organisms = area.querySelectorAll('.organism');
        organisms.forEach(div => {
            const id = parseFloat(div.dataset.id);
            const organism = currentPopulationData.find(o => o.id === id);

            let currentX = parseFloat(div.style.left) || 0;
            let currentY = parseFloat(div.style.top) || 0;

            const deltaX = (Math.random() - 0.5) * 2 * MAX_MOVEMENT;
            const deltaY = (Math.random() - 0.5) * 2 * MAX_MOVEMENT;

            let newX = currentX + deltaX;
            let newY = currentY + deltaY;

            newX = Math.max(0, Math.min(newX, width - organismSize));
            newY = Math.max(0, Math.min(newY, height - organismSize));

            div.style.left = `${newX}px`;
            div.style.top = `${newY}px`;

            if (organism) {
                organism.x = newX;
                organism.y = newY;
            }
        });
    }, MOVEMENT_INTERVAL);
}

/**
 * 重新随机化所有幸存者的位置
 */
function scramblePositions() {
    const area = document.getElementById('simulation-area');
    const areaRect = area.getBoundingClientRect();
    const width = areaRect.width;
    const height = areaRect.height;
    
    currentPopulationData.forEach(organism => {
        if (!organism.eliminated) {
            organism.x = Math.random() * (width - 15);
            organism.y = Math.random() * (height - 15);
        }
    });
}

/**
 * 渲染圆点到区域 4。
 */
function renderPopulation(isFinalDisplay = false) {
    const area = document.getElementById('simulation-area');
    area.innerHTML = ''; 
    
    const bounds = area.getBoundingClientRect();
    
    if (currentPopulationData.length === 0 && statsHistory.length === 0 && !isFinalDisplay) {
         document.getElementById('currentPopulation').textContent = INITIAL_POPULATION_TARGET;
         if (movementTimer) clearInterval(movementTimer); 
         if (autoEliminationTimer) clearInterval(autoEliminationTimer);
         return; 
    }
    
    const dataToRender = isFinalDisplay ? createPopulationDataFromConfig(nextGenerationConfig) : currentPopulationData;

    const livingPopulation = dataToRender.filter(o => !o.eliminated);
    const eliminatedPopulation = dataToRender.filter(o => o.eliminated);

    // 渲染存活的圆点
    livingPopulation.forEach(organism => {
        const div = document.createElement('div');
        div.className = 'organism';
        
        const bgColor = (COLOR_MAP_35[organism.colorCode] || COLOR_MAP_35['15']);
        div.style.backgroundColor = bgColor;
        
        // 自动捕获/手动捕获特效
        if (organism.isBeingCaptured && !isFinalDisplay) {
             div.classList.add('is-being-captured');
        } else {
             div.classList.remove('is-being-captured');
             div.style.border = `1px solid rgba(0, 0, 0, 0.1)`; 
        }

        if (organism.x === null || organism.x === undefined) {
            organism.x = Math.random() * (bounds.width - 15);
            organism.y = Math.random() * (bounds.height - 15);
        }

        div.style.left = `${organism.x}px`;
        div.style.top = `${organism.y}px`;
        div.dataset.id = organism.id;
        
        if (eliminationMode === 'manual' && !isFinalDisplay) {
            div.onclick = manualEliminateOrganism;
        }
        area.appendChild(div);
    });

    const backgroundColor = document.getElementById('simulation-area').style.backgroundColor;
    eliminatedPopulation.forEach(organism => {
        const div = document.createElement('div');
        div.className = 'eliminated';
        div.style.backgroundColor = backgroundColor;

        if (organism.x !== null && organism.x !== undefined) {
            div.style.left = `${organism.x}px`;
            div.style.top = `${organism.y}px`;
        } else {
            div.style.left = `${Math.random() * (bounds.width - 15)}px`;
            div.style.top = `${Math.random() * (bounds.height - 15)}px`;
        }
        
        area.appendChild(div);
    });

    document.getElementById('currentPopulation').textContent = livingPopulation.length;

    if (eliminationMode === 'auto' && !isFinalDisplay) {
        startOrganismMovement();
    } else {
        if (movementTimer) clearInterval(movementTimer);
    }
}

/**
 * 手动捕获
 */
function manualEliminateOrganism(event) {
    if (movementTimer) clearInterval(movementTimer); 
    
    const organismDiv = event.currentTarget;
    const id = parseFloat(organismDiv.dataset.id);
    const organism = currentPopulationData.find(o => o.id === id);
    
    if (organism && !organism.eliminated && !organism.isBeingCaptured) {
        
        organism.isBeingCaptured = true;
        renderPopulation(); 

        setTimeout(() => {
            organism.eliminated = true;
            organism.isBeingCaptured = false;
            
            // 核心逻辑：检查是否需要重新随机分布
            const shouldReshuffle = document.getElementById('reshufflePositions').checked;
            if (shouldReshuffle) {
                scramblePositions();
            }
            
            renderPopulation(); 
        }, 300); 
    }
}

function createPopulationDataFromConfig(config) {
    if (!config) return [];
    let data = [];
    for (const code in config) {
        for (let i = 0; i < config[code]; i++) {
            data.push({
                id: Math.random(),
                colorCode: code,
                eliminated: false,
                isBeingCaptured: false,
                x: null,
                y: null
            });
        }
    }
    return data;
}

/**
 * 自动淘汰
 */
function autoEliminateAndBreed(targetEliminateCount = null, isCullingMode = false) {
    if (movementTimer) clearInterval(movementTimer); 
    if (autoEliminationTimer) clearInterval(autoEliminationTimer); 
    
    const organisms = currentPopulationData.filter(o => !o.eliminated);
    
    if (targetEliminateCount === null) {
        targetEliminateCount = organisms.length - MIN_SURVIVORS_TARGET; 
        if (targetEliminateCount <= 0) {
            if (!isCullingMode) recordStatsAndAdvance(); 
            return;
        }
    }
    
    let eliminatedCount = 0;
    const dynamicSpeed = parseInt(document.getElementById('autoSpeedSelect').value) || 500;
    
    autoEliminationTimer = setInterval(() => {
        const currentLiving = currentPopulationData.filter(o => !o.eliminated);
        
        if (eliminatedCount >= targetEliminateCount || currentLiving.length <= MIN_SURVIVORS_TARGET) {
            clearInterval(autoEliminationTimer);
            autoEliminationTimer = null;
            currentPopulationData.forEach(o => o.isBeingCaptured = false);
            renderPopulation(); 
            recordStatsAndAdvance();
            return;
        }

        currentLiving.forEach(organism => {
            organism.captureWeight = calculateCaptureWeight(organism.colorCode);
        });

        const totalWeight = currentLiving.reduce((sum, o) => sum + o.captureWeight, 0);
        if (totalWeight === 0) { 
             clearInterval(autoEliminationTimer);
             autoEliminationTimer = null;
             recordStatsAndAdvance();
             return; 
        }

        let randomTarget = Math.random() * totalWeight;
        let cumulativeWeight = 0;

        let organismToEliminate = null;
        for (const organism of currentLiving) {
            cumulativeWeight += organism.captureWeight;
            if (randomTarget <= cumulativeWeight) {
                organismToEliminate = organism;
                break; 
            }
        }
        
        if (organismToEliminate) {
            currentPopulationData.forEach(o => o.isBeingCaptured = false);
            organismToEliminate.isBeingCaptured = true;
            renderPopulation(); 
            
            setTimeout(() => {
                organismToEliminate.eliminated = true;
                eliminatedCount++;
                organismToEliminate.isBeingCaptured = false;
                
                // 核心逻辑：检查是否需要重新随机分布
                const shouldReshuffle = document.getElementById('reshufflePositions').checked;
                if (shouldReshuffle) {
                    scramblePositions();
                }
                
                renderPopulation(); 
            }, dynamicSpeed * 0.4); 
        }

    }, dynamicSpeed);
}

function recordStatsAndAdvance() {
    recordStatsAndBreed();
}

// --- 5. 繁殖和统计 ---

function recordStatsAndBreed() {
    if (movementTimer) clearInterval(movementTimer);
    if (autoEliminationTimer) clearInterval(autoEliminationTimer);
    
    const currentStats = {
        gen: currentGeneration,
        totalStart: currentPopulationData.length,
        totalSurvived: currentPopulationData.filter(o => !o.eliminated).length,
        color_data: {}, 
        all_colors_order: [] 
    };
    
    const colorCounts = {};

    currentPopulationData.forEach(organism => {
        const code = organism.colorCode;
        if (!colorCounts[code]) {
            colorCounts[code] = { start: 0, survived: 0 };
        }
        colorCounts[code].start++;

        if (!organism.eliminated) {
            colorCounts[code].survived++;
        }
    });
    currentStats.totalStart = currentPopulationData.length;
    
    currentStats.all_colors_order = Object.keys(colorCounts)
        .filter(code => colorCounts[code].start > 0)
        .sort((a, b) => parseInt(a) - parseInt(b));
    
    currentStats.color_data = colorCounts;
    statsHistory.push(currentStats);

    // 繁殖和突变
    currentGeneration++;
    
    const survivors = currentPopulationData.filter(o => !o.eliminated);
    let nextConfig = {};
    let actualNextPopCount = 0;
    
    survivors.forEach(parent => {
        const parentCode = parent.colorCode;
        const offspringCount = Math.round(DEFAULT_BREED_FACTOR);
        
        for (let i = 0; i < offspringCount; i++) {
            let offspringCode = parentCode;
            
            if (Math.random() < DEFAULT_MUTATION_RATE) {
                offspringCode = getMutatedColorCode(parentCode);
            }
            
            if (!nextConfig[offspringCode]) {
                nextConfig[offspringCode] = 0;
            }
            nextConfig[offspringCode]++;
            actualNextPopCount++;
        }
    });

    if (actualNextPopCount > INITIAL_POPULATION_TARGET) {
        const scaleFactor = INITIAL_POPULATION_TARGET / actualNextPopCount;
        let scaledConfig = {};
        let finalTotal = 0;
        
        for (const code in nextConfig) {
            const scaledCount = Math.round(nextConfig[code] * scaleFactor);
            scaledConfig[code] = scaledCount;
            finalTotal += scaledCount;
        }

        if (finalTotal !== INITIAL_POPULATION_TARGET) {
            const difference = INITIAL_POPULATION_TARGET - finalTotal;
            const codes = Object.keys(scaledConfig);
            if (codes.length > 0) {
                let maxCode = codes[0];
                let maxCount = scaledConfig[maxCode];
                for (let i = 1; i < codes.length; i++) {
                    if (scaledConfig[codes[i]] > maxCount) {
                        maxCount = scaledConfig[codes[i]];
                        maxCode = codes[i];
                    }
                }
                scaledConfig[maxCode] += difference;
            }
        }
        nextGenerationConfig = scaledConfig;

    } else {
        nextGenerationConfig = nextConfig;
    }
    
    renderPopulation(true);
    
    setTimeout(() => {
        currentPopulationData = []; 
        updateStatsDisplay(); 
        updateChart();        
        resetModeSelection(); 
    }, RESULT_DISPLAY_DELAY); 
}

function updateStatsDisplay() {
    const container = document.getElementById('stats-table-container');
    container.innerHTML = '';
    
    const overallContainer = document.createElement('div');
    overallContainer.className = 'generation-stats-container';

    statsHistory.forEach(stats => {
        const table = document.createElement('table');
        table.className = 'generation-table';
        
        const codes = stats.all_colors_order;
        const data = stats.color_data;
        const colCount = codes.length;

        let theadHtml = `<thead class="generation-header"><tr>
            <th rowspan="2" style="background-color: #d4edda; width: 60px;">第${stats.gen}代</th>
            <th colspan="${colCount}" style="background-color: #d4edda;">变异色</th>
            <th rowspan="2" style="background-color: #d4edda; width: 40px;">合计</th>
        </tr><tr>`;
        
        codes.forEach(code => {
            const color = COLOR_MAP_35[code];
            const fontColor = (parseInt(code) >= 29 && parseInt(code) <= 32) ? 'white' : 'black';
            theadHtml += `<th class="color-cell" style="background-color: ${color}; color: ${fontColor};">${code}</th>`;
        });
        theadHtml += `</tr></thead>`;
        table.innerHTML = theadHtml;

        const tbody = document.createElement('tbody');
        
        let startRowHtml = `<tr><td style="font-weight: bold;">开始数</td>`;
        codes.forEach(code => {
            startRowHtml += `<td>${data[code].start}</td>`;
        });
        startRowHtml += `<td>${stats.totalStart}</td></tr>`;
        
        let survivedRowHtml = `<tr><td style="font-weight: bold;">幸存数</td>`;
        codes.forEach(code => {
            survivedRowHtml += `<td>${data[code].survived}</td>`;
        });
        survivedRowHtml += `<td>${stats.totalSurvived}</td></tr>`;
        
        tbody.innerHTML = startRowHtml + survivedRowHtml;
        table.appendChild(tbody);
        overallContainer.appendChild(table);
    });

    container.appendChild(overallContainer);
}

function updateChart() {
    const generations = statsHistory.map(s => `第 ${s.gen} 代`);
    const datasets = [];
    
    const allColorsEver = new Set();
    statsHistory.forEach(stats => {
        stats.all_colors_order.forEach(code => allColorsEver.add(code));
    });
    
    const sortedAllColors = Array.from(allColorsEver).sort((a, b) => parseInt(a) - parseInt(b));

    sortedAllColors.forEach(code => {
        const hexColor = COLOR_MAP_35[code];

        const startData = statsHistory.map(stats => {
            const data = stats.color_data[code];
            return data ? data.start : 0; 
        });

        datasets.push({
            label: `颜色 ${code} 初始数`,
            data: startData,
            borderColor: hexColor,
            backgroundColor: hexColor,
            fill: false,
            tension: 0.1,
            hidden: !TRACKED_COLORS.includes(code)
        });
    });

    const data = {
        labels: generations,
        datasets: datasets
    };

    const config = {
        type: 'line',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: '每代初始种群数量变化趋势'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: '种群数量'
                    },
                    max: INITIAL_POPULATION_TARGET 
                },
                x: {
                    title: {
                        display: true,
                        text: '代数'
                    }
                }
            }
        }
    };

    const ctx = document.getElementById('survivalChart').getContext('2d');
    if (chartInstance) {
        chartInstance.destroy();
    }
    chartInstance = new Chart(ctx, config); 
}

function setMode(mode) {
    
    if (currentGeneration > statsHistory.length || currentGeneration === 1) {
        const config = validatePopulationInput();
        if (!config) {
            resetModeSelection();
            return; 
        }
        initializePopulation(config); 
    }

    const currentSurvivors = currentPopulationData.filter(o => !o.eliminated).length;
    
    if (mode === 'auto' && currentSurvivors <= MIN_SURVIVORS_TARGET) {
        alert(`当前剩余个体数 (${currentSurvivors}) 已达到或低于目标 (${MIN_SURVIVORS_TARGET})，不能进行自动淘汰。`);
        return; 
    }

    eliminationMode = mode;
    
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('selected'));
    document.getElementById(`select${mode.charAt(0).toUpperCase() + mode.slice(1)}`).classList.add('selected');
    
    document.getElementById('mode-selection').style.display = 'none';
    document.getElementById('action-buttons').style.display = 'inline-block';
    
    if (mode === 'manual') {
        document.getElementById('endElimination').style.display = 'inline-block';
    } else if (mode === 'auto') {
        document.getElementById('endElimination').style.display = 'none';
        const targetsToEliminate = currentSurvivors - MIN_SURVIVORS_TARGET;
        autoEliminateAndBreed(targetsToEliminate, false); 
    }
    
    renderPopulation();
}

function resetModeSelection() {
    eliminationMode = null; 
    document.getElementById('mode-selection').style.display = 'inline-block';
    document.getElementById('action-buttons').style.display = 'inline-block';
    document.getElementById('endElimination').style.display = 'none';

    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('selected'));
    
    const area = document.getElementById('simulation-area');
    
    if (!nextGenerationConfig && statsHistory.length === 0) {
        area.innerHTML = '';
        document.getElementById('currentPopulation').textContent = INITIAL_POPULATION_TARGET;
    } else if (nextGenerationConfig) {
        let totalNextPop = 0;
        for (const code in nextGenerationConfig) {
            totalNextPop += nextGenerationConfig[code];
        }
        document.getElementById('currentPopulation').textContent = totalNextPop;
    }
    
    renderColorPalette(nextGenerationConfig); 

    if (movementTimer) clearInterval(movementTimer);
    if (autoEliminationTimer) clearInterval(autoEliminationTimer);
}

function updateEnvironmentColor() {
    const color = document.getElementById('envColor').value;
    document.getElementById('simulation-area').style.backgroundColor = color;
    renderPopulation(); 
}

function setupEventListeners() {
    document.getElementById('selectManual').addEventListener('click', () => setMode('manual'));
    document.getElementById('selectAuto').addEventListener('click', () => setMode('auto'));
    
    document.getElementById('toggleAdvanced').addEventListener('change', (e) => {
        const container = document.getElementById('advancedOptionsContainer');
        container.style.display = e.target.checked ? 'block' : 'none';
    });

    // 监听动画开关，切换容器类名
    document.getElementById('showCaptureAnimation').addEventListener('change', (e) => {
        const area = document.getElementById('simulation-area');
        if (e.target.checked) {
            area.classList.remove('simple-effects');
        } else {
            area.classList.add('simple-effects');
        }
    });

    document.getElementById('endElimination').addEventListener('click', () => {
        const currentSurvivors = currentPopulationData.filter(o => !o.eliminated).length;
        
        if (currentSurvivors > MIN_SURVIVORS_TARGET) {
            const targetsToEliminate = currentSurvivors - MIN_SURVIVORS_TARGET;
            
            document.getElementById('endElimination').style.display = 'none';
            alert(`当前剩余 ${currentSurvivors} 个，将自动淘汰到 ${MIN_SURVIVORS_TARGET} 个。`);
            
            autoEliminateAndBreed(targetsToEliminate, true);
        } else {
            recordStatsAndAdvance();
        }
    });
    
    document.getElementById('clearStats').addEventListener('click', () => {
        statsHistory = [];
        currentGeneration = 1; 
        currentPopulationData = [];
        nextGenerationConfig = null; 
        updateStatsDisplay();
        updateChart();
        resetModeSelection();
        renderColorPalette(); 
    });
    
    document.getElementById('resetAll').addEventListener('click', () => initializePopulation(null));
    document.getElementById('envColor').addEventListener('change', updateEnvironmentColor);
}

window.onload = () => {
    setupEventListeners();
    initializePopulation();
};